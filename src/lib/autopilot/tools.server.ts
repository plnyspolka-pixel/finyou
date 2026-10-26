// Narzędzia-lead-magnety – warstwa serwerowa: rekordy lead_magnets dla
// kalkulatorów (bramka compliance na treściach), zapis z formularza
// (zgoda RODO i subskrybent z mechanizmu lead magnetów) i odblokowanie
// pełnego wyniku tokenem z maila.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SITE_URL } from "@/lib/seo/company";
import { runCalculator, verifyCalculator, type CalculatorRun } from "./calculator-engine";
import { STARTER_CALCULATORS } from "./calculators";
import { evaluateCompliance } from "./compliance-rules";
import { logAutopilot } from "./state.server";
import { toolMagnetRow, toolPath, toolResultEmail } from "./tools";

export function toolConfig(slug: string) {
  return STARTER_CALCULATORS.find((c) => c.slug === slug) ?? null;
}

/**
 * Zakłada (albo aktualizuje) rekordy lead_magnets dla narzędzi startowych.
 * `publish` – czy narzędzie przyjmuje zapisy i reaguje na hasło w komentarzach.
 * Narzędzie z błędem kontroli jakości albo blokadą compliance nie jest
 * publikowane.
 */
export async function ensureToolMagnets(opts: { publish: boolean; actor?: string | null }) {
  const out: Array<{ slug: string; action: string; published: boolean; problems: string[] }> = [];
  const { data: admin } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "administrator")
    .limit(1)
    .maybeSingle();
  const createdBy = opts.actor ?? (admin as { user_id?: string } | null)?.user_id ?? null;

  for (const cfg of STARTER_CALCULATORS) {
    const problems = verifyCalculator(cfg);
    const text = [cfg.title, cfg.promise, ...cfg.assumptions].join("\n");
    const { blocks } = evaluateCompliance(text, { kind: "lead_magnet", track: cfg.track });
    problems.push(...blocks.map((b) => `compliance: ${b.code}`));
    const publish = opts.publish && problems.length === 0;
    const row = toolMagnetRow(cfg, SITE_URL, publish);
    const { data: existing } = await supabaseAdmin
      .from("lead_magnets")
      .select("id, published")
      .eq("slug", cfg.slug)
      .maybeSingle();
    if (existing) {
      const { error } = await supabaseAdmin
        .from("lead_magnets")
        .update(row as never)
        .eq("id", existing.id);
      out.push({
        slug: cfg.slug,
        action: error ? `błąd: ${error.message}` : "zaktualizowano",
        published: publish,
        problems,
      });
    } else {
      const { error } = await supabaseAdmin
        .from("lead_magnets")
        .insert({ ...row, created_by: createdBy } as never);
      out.push({
        slug: cfg.slug,
        action: error ? `błąd: ${error.message}` : "utworzono",
        published: publish,
        problems,
      });
    }
  }
  await logAutopilot({
    action: "tool_magnets",
    summary: `Narzędzia-lead-magnety: ${out.map((o) => `${o.slug} (${o.action}${o.published ? ", opublikowane" : ""})`).join("; ")}`,
    payload: { tools: out },
    actor: opts.actor ?? null,
  });
  return out;
}

export async function getPublicTool(slug: string) {
  const cfg = toolConfig(slug);
  if (!cfg) return null;
  const { data } = await supabaseAdmin
    .from("lead_magnets")
    .select("published")
    .eq("slug", slug)
    .maybeSingle();
  if (!data?.published) return null;
  return { config: cfg, signupOpen: true };
}

export async function submitToolSignup(input: {
  slug: string;
  email: string;
  firstName?: string | null;
  values: Record<string, number | string>;
  utm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  } | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ ok: true; run: CalculatorRun; emailSent: boolean }> {
  const cfg = toolConfig(input.slug);
  if (!cfg) throw new Error("Nie ma takiego narzędzia.");
  const run = runCalculator(cfg, input.values, { unlocked: true });
  if (!run.ok) throw new Error("Popraw dane w formularzu.");
  const firstName = (input.firstName ?? "").trim().slice(0, 80) || null;
  const mail = toolResultEmail(cfg, run, firstName);
  const { registerLeadMagnetSignup } = await import("@/lib/lead-magnets/lead-magnets.server");
  const res = await registerLeadMagnetSignup({
    slug: cfg.slug,
    email: input.email,
    first_name: firstName,
    utm: input.utm ?? null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    emailOverride: {
      ...mail,
      link: (token) => `${SITE_URL}${toolPath(cfg.slug)}?t=${token}&${encodeValues(input.values)}`,
    },
  });
  return { ok: true, run, emailSent: res.email_sent };
}

/** Token z maila odblokowuje pełny wynik (zapis istnieje dla tego narzędzia). */
export async function verifyToolToken(slug: string, token: string): Promise<boolean> {
  const { isValidDownloadToken } = await import("@/lib/lead-magnets/core");
  if (!isValidDownloadToken(token.toLowerCase())) return false;
  const { data } = await supabaseAdmin
    .from("lead_magnet_signups")
    .select("id, lead_magnets!inner(slug)")
    .eq("download_token", token.toLowerCase())
    .eq("lead_magnets.slug", slug)
    .maybeSingle();
  return Boolean(data);
}

function encodeValues(values: Record<string, number | string>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(values)) p.set(k, String(v));
  return p.toString();
}
