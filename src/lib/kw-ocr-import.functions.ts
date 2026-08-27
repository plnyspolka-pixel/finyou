// Import treści KW z dosłownego tekstu wklejonego przez operatora z EKW.
// Bez OCR — operator kopiuje tekst ze strony ekw.ms.gov.pl i wkleja tutaj.
// AI (Lovable AI Gateway, Gemini 2.5 Flash z JSON mode) dzieli tekst na
// sekcje: okladka + działy I-O, I-Sp, II, III, IV. Zapis do kw_documents.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeKwNumber } from "@/lib/kw-fetch.server";
import { formatKwNumber } from "@/lib/kw";

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";
const MAX_TEXT = 200_000;

const SYSTEM_PROMPT =
  "Jesteś parserem treści polskich ksiąg wieczystych (EKW). Otrzymujesz surowy tekst " +
  "skopiowany z ekw.ms.gov.pl (dowolne fragmenty, w dowolnej kolejności). Twoim zadaniem " +
  "jest podzielić go DOSŁOWNIE na sekcje księgi — bez interpretacji, bez skracania, bez " +
  "zgadywania. Zachowaj oryginalne brzmienie, wielkość liter i układ linii. Nie tłumacz.";

const USER_PROMPT = (text: string) => `Rozdziel poniższy tekst KW na sekcje i zwróć JSON z kluczami:
- "kw_number": numer KW w formacie XX0X/00000000/0 jeśli występuje (lub null)
- "okladka": tekst okładki (numer, sąd, typ) lub null
- "dzial_1o": tekst działu I-O (Oznaczenie nieruchomości) lub null
- "dzial_1s": tekst działu I-Sp (Spis praw związanych) lub null
- "dzial_2": tekst działu II (Własność) lub null
- "dzial_3": tekst działu III (Prawa, roszczenia i ograniczenia) lub null
- "dzial_4": tekst działu IV (Hipoteka) lub null

Zasady:
- Kopiuj tekst DOSŁOWNIE — bez parafrazowania.
- Jeśli w tekście brakuje danego działu, ustaw wartość na null.
- Nie dodawaj żadnych komentarzy poza JSON-em.

--- SUROWY TEKST KW ---
${text}
--- KONIEC ---`;

async function assertAdmin(userId: string) {
  const { data: roles } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const allowed = (roles ?? []).some((r) => r.role === "administrator");
  if (!allowed) throw new Error("Brak uprawnień (wymagana rola administrator).");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrapSection(title: string, body: string | null | undefined): string | null {
  const trimmed = (body ?? "").trim();
  if (!trimmed) return null;
  // Bez styli inline — sanitizer je wycina; wygląd definiuje CSS `.kw-html pre`.
  return `<div class="kw-ocr-section"><h3>${escapeHtml(title)}</h3><pre>${escapeHtml(trimmed)}</pre></div>`;
}

function extractKwNumberFromText(t: string): string | null {
  const m = t.match(/\b([A-Z]{2}\d[A-Z])\s*\/?\s*(\d{8})\s*\/?\s*(\d)\b/i);
  if (!m) return null;
  return normalizeKwNumber(`${m[1]}/${m[2]}/${m[3]}`);
}

function tryParseJson(raw: string): any | null {
  if (!raw) return null;
  let s = raw.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  try {
    return JSON.parse(s);
  } catch {}
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(s.slice(first, last + 1));
    } catch {}
  }
  return null;
}

export const importKwFromScreenshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        loanApplicationId: z.string().uuid().optional(),
        kwNumber: z.string().max(20).optional(),
        text: z.string().min(20).max(MAX_TEXT),
        force: z.boolean().optional(),
        dryRun: z.boolean().optional(),
        includeDebug: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Brak konfiguracji AI (LOVABLE_API_KEY).");

    const r = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: USER_PROMPT(data.text) },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (r.status === 429)
      throw new Error("Limit zapytań AI chwilowo wyczerpany — spróbuj za chwilę.");
    if (r.status === 402) throw new Error("Wyczerpany budżet AI (Lovable) — doładuj konto.");
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      console.error("KW parse HTTP error", { status: r.status, body: body.slice(0, 500) });
      throw new Error(`Błąd AI (HTTP ${r.status}): ${body.slice(0, 200)}`);
    }
    const j: any = await r.json();
    const content: string = (j?.choices?.[0]?.message?.content ?? "").trim();
    const parsed = tryParseJson(content);
    if (!parsed || typeof parsed !== "object") {
      console.error("KW parse: bad JSON", content.slice(0, 500));
      throw new Error("AI nie zwróciło poprawnego JSON-a — spróbuj ponownie.");
    }

    if (data.dryRun) {
      return {
        ok: true as const,
        dryRun: true as const,
        debug: { parsed, model: MODEL, textLength: data.text.length },
      };
    }

    const warnings: string[] = [];
    let kw = data.kwNumber ? normalizeKwNumber(data.kwNumber) : null;
    const parsedKw = parsed.kw_number
      ? normalizeKwNumber(String(parsed.kw_number))
      : extractKwNumberFromText(data.text);
    if (!kw) kw = parsedKw;
    else if (parsedKw && parsedKw !== kw) {
      warnings.push(
        `Numer KW z tekstu (${parsedKw}) różni się od podanego (${kw}) — zapisano pod podanym numerem.`,
      );
    }

    let propertyId: string | null = null;
    if (data.loanApplicationId) {
      const { data: prop } = await supabaseAdmin
        .from("properties")
        .select("id, land_register_number")
        .eq("loan_application_id", data.loanApplicationId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      propertyId = prop?.id ?? null;
      const propKw = prop?.land_register_number
        ? normalizeKwNumber(prop.land_register_number)
        : null;
      if (!kw) kw = propKw;
      else if (propKw && propKw !== kw) {
        warnings.push(
          `Numer KW z importu (${kw}) różni się od numeru na nieruchomości wniosku (${propKw}).`,
        );
      }
    }
    if (!kw)
      throw new Error(
        "Nie udało się ustalić numeru KW — podaj numer ręcznie w polu KW na nieruchomości.",
      );

    const sections = {
      okladka: wrapSection("OKŁADKA", parsed.okladka),
      dzial_1o: wrapSection("Dział I-O — Oznaczenie nieruchomości", parsed.dzial_1o),
      dzial_1s: wrapSection("Dział I-Sp — Spis praw związanych", parsed.dzial_1s),
      dzial_2: wrapSection("Dział II — Własność", parsed.dzial_2),
      dzial_3: wrapSection("Dział III — Prawa, roszczenia, ograniczenia", parsed.dzial_3),
      dzial_4: wrapSection("Dział IV — Hipoteka", parsed.dzial_4),
    };

    const { data: existing } = await supabaseAdmin
      .from("kw_documents")
      .select("status")
      .eq("kw_number", kw)
      .maybeSingle();
    if (existing?.status === "ready" && !data.force) {
      return {
        ok: false as const,
        needsForce: true as const,
        kwNumber: kw,
        message: "Treść tej KW jest już zapisana. Nadpisać danymi z wklejonego tekstu?",
      };
    }
    const { error: upsertError } = await supabaseAdmin.from("kw_documents").upsert(
      {
        kw_number: kw,
        status: "ready",
        okladka: sections.okladka ?? wrapSection("OKŁADKA", `KW: ${kw}`),
        dzial_1o: sections.dzial_1o,
        dzial_1s: sections.dzial_1s,
        dzial_2: sections.dzial_2,
        dzial_3: sections.dzial_3,
        dzial_4: sections.dzial_4,
        fetched_at: new Date().toISOString(),
        ordered_at: new Date().toISOString(),
        ordered_by: context.userId,
        last_error: null,
      },
      { onConflict: "kw_number" },
    );
    if (upsertError) throw new Error(`Nie udało się zapisać treści KW: ${upsertError.message}`);

    if (propertyId) {
      const { data: prop } = await supabaseAdmin
        .from("properties")
        .select("land_register_number")
        .eq("id", propertyId)
        .maybeSingle();
      if (prop && !prop.land_register_number) {
        // Na nieruchomości trzymamy formę z ukośnikami (jak formularze) —
        // forma kompaktowa zostaje w kw_documents.
        await supabaseAdmin
          .from("properties")
          .update({ land_register_number: formatKwNumber(kw) ?? kw })
          .eq("id", propertyId);
        warnings.push("Numer KW z importu zapisano na nieruchomości wniosku.");
      }
    }

    return {
      ok: true as const,
      needsForce: false as const,
      kwNumber: kw,
      imported: {
        okladka: !!sections.okladka,
        dzial_1o: !!sections.dzial_1o,
        dzial_1s: !!sections.dzial_1s,
        dzial_2: !!sections.dzial_2,
        dzial_3: !!sections.dzial_3,
        dzial_4: !!sections.dzial_4,
      },
      warnings,
      debug: data.includeDebug ? { parsed } : undefined,
    };
  });
