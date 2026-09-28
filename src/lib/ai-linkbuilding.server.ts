// Link building AI (backlinki, propozycje) — logika wyniesiona z ai-linkbuilding.functions.ts: wspólna dla
// server functions panelu (cienkie delegaty) i narzędzi MCP. Zachowanie 1:1.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";
import {
  addBacklinkSchema,
  updateBacklinkSchema,
  deleteBacklinkSchema,
  generateLinkBuildingSuggestionsSchema,
  updateLbSuggestionSchema,
  promoteSuggestionToOutreachSchema,
  AddBacklinkInput,
  UpdateBacklinkInput,
  DeleteBacklinkInput,
  GenerateLinkBuildingSuggestionsInput,
  UpdateLbSuggestionInput,
  PromoteSuggestionToOutreachInput,
} from "./ai-linkbuilding-schema";

function normalizeDomain(input: string) {
  try {
    const u = new URL(input.includes("://") ? input : `https://${input}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return input
      .trim()
      .replace(/^www\./, "")
      .toLowerCase();
  }
}

type Suggestion = {
  target_domain: string;
  contact_hint?: string;
  strategy: string;
  rationale: string;
  priority: number;
  expected_da?: number;
};

export async function addBacklink(
  supabase: SupabaseClient<Database>,
  userId: string,
  data: AddBacklinkInput,
) {
  const { data: row, error } = await supabase
    .from("ai_backlinks")
    .insert({
      source_url: data.source_url,
      source_domain: normalizeDomain(data.source_url),
      target_url: data.target_url,
      anchor_text: data.anchor_text ?? null,
      link_type: data.link_type,
      dofollow: data.dofollow,
      domain_authority: data.domain_authority ?? null,
      notes: data.notes ?? null,
      outreach_target_id: data.outreach_target_id ?? null,
      status: "live",
      first_seen_at: new Date().toISOString(),
      created_by: userId,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  await supabase.from("ai_growth_action_log").insert({
    module: "link_building",
    action: "add_backlink",
    status: "ok",
    summary: `Dodano backlink z ${row.source_domain}`,
    payload: { backlink_id: row.id },
    actor: userId,
  });
  return { backlink: row };
}

export async function updateBacklink(
  supabase: SupabaseClient<Database>,
  _userId: string,
  data: UpdateBacklinkInput,
) {
  const { id, ...patch } = data;
  const { error } = await supabase.from("ai_backlinks").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function deleteBacklink(
  supabase: SupabaseClient<Database>,
  _userId: string,
  data: DeleteBacklinkInput,
) {
  const { error } = await supabase.from("ai_backlinks").delete().eq("id", data.id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function generateLinkBuildingSuggestions(
  supabase: SupabaseClient<Database>,
  userId: string,
  data: GenerateLinkBuildingSuggestionsInput,
) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY nie skonfigurowany");

  const [{ data: settings }, { data: existing }] = await Promise.all([
    supabase
      .from("ai_growth_settings")
      .select("default_model, brand_name, brand_description")
      .limit(1)
      .maybeSingle(),
    supabase.from("ai_backlinks").select("source_domain").eq("status", "live"),
  ]);

  const model = settings?.default_model ?? "google/gemini-2.5-flash";
  const brand = settings?.brand_name ?? "Finance You";
  const existingDomains = (existing ?? []).map((r: any) => r.source_domain);

  const system =
    `Jesteś senior SEO/link-building strategiem dla marki ${brand}. ` +
    "Proponujesz konkretne polskie domeny i strategie zdobycia wartościowych linków zwrotnych. " +
    "Po polsku, zero ogólników. Zwracasz WYŁĄCZNIE wywołanie funkcji propose_link_targets.";

  const userMsg = JSON.stringify(
    {
      niche: data.niche,
      brand_description: settings?.brand_description ?? "",
      notes: data.notes,
      already_linking_domains: existingDomains,
    },
    null,
    2,
  );

  const tools = [
    {
      type: "function",
      function: {
        name: "propose_link_targets",
        description: "Lista 5-10 propozycji domen i strategii link-buildingu.",
        parameters: {
          type: "object",
          properties: {
            suggestions: {
              type: "array",
              minItems: 1,
              maxItems: 10,
              items: {
                type: "object",
                properties: {
                  target_domain: {
                    type: "string",
                    description: "Domena bez https i www, np. example.pl",
                  },
                  contact_hint: {
                    type: "string",
                    description:
                      "Sugerowana ścieżka kontaktu (np. redakcja@..., formularz /kontakt).",
                  },
                  strategy: {
                    type: "string",
                    description:
                      "Krótka strategia (np. 'guest post o XYZ', 'link wymiany z artykułu o ABC').",
                  },
                  rationale: {
                    type: "string",
                    description: "Dlaczego ta domena pasuje — w kontekście niszy.",
                  },
                  priority: { type: "integer", minimum: 1, maximum: 5 },
                  expected_da: {
                    type: "integer",
                    minimum: 0,
                    maximum: 100,
                    description: "Estymacja Domain Authority.",
                  },
                },
                required: ["target_domain", "strategy", "rationale", "priority"],
              },
            },
          },
          required: ["suggestions"],
        },
      },
    },
  ];

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      tools,
      tool_choice: { type: "function", function: { name: "propose_link_targets" } },
    }),
  });
  if (!res.ok) throw new Error(`AI Gateway: ${res.status} ${await res.text()}`);
  const json = await res.json();
  const call = json?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("AI nie zwróciło propozycji");
  const parsed = JSON.parse(call.function.arguments) as { suggestions: Suggestion[] };

  const rows = parsed.suggestions.map((s) => ({
    target_domain: normalizeDomain(s.target_domain),
    contact_hint: s.contact_hint ?? null,
    strategy: s.strategy,
    rationale: s.rationale ?? "",
    priority: Math.max(1, Math.min(5, s.priority ?? 3)),
    expected_da: s.expected_da ?? null,
    status: "new",
    created_by: userId,
  }));

  const { data: inserted, error: insErr } = await supabase
    .from("ai_linkbuilding_suggestions")
    .insert(rows)
    .select();
  if (insErr) throw new Error(insErr.message);

  await supabase.from("ai_growth_action_log").insert({
    module: "link_building",
    action: "generate_suggestions",
    status: "ok",
    summary: `AI zaproponowało ${rows.length} celów link-buildingu (nisza: ${data.niche})`,
    payload: { niche: data.niche },
    actor: userId,
  });

  return { suggestions: inserted };
}

export async function updateLbSuggestion(
  supabase: SupabaseClient<Database>,
  _userId: string,
  data: UpdateLbSuggestionInput,
) {
  const { id, ...patch } = data;
  const { error } = await supabase.from("ai_linkbuilding_suggestions").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function promoteSuggestionToOutreach(
  supabase: SupabaseClient<Database>,
  userId: string,
  data: PromoteSuggestionToOutreachInput,
) {
  const { data: s, error } = await supabase
    .from("ai_linkbuilding_suggestions")
    .select("*")
    .eq("id", data.id)
    .maybeSingle();
  if (error || !s) throw new Error("Brak propozycji");

  const { data: t, error: tErr } = await supabase
    .from("ai_outreach_targets")
    .insert({
      domain: s.target_domain,
      niche: "link-building",
      url: s.contact_hint ?? null,
      priority: s.priority,
      status: "new",
      notes: `${s.strategy}\n\n${s.rationale}`,
      source: "ai_linkbuilding",
      created_by: userId,
    })
    .select()
    .single();
  if (tErr) throw new Error(tErr.message);

  await supabase
    .from("ai_linkbuilding_suggestions")
    .update({ status: "in_progress" })
    .eq("id", data.id);

  return { outreach_target: t };
}
