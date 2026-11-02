// Finance You -> własny, odseparowany browser worker EKW.
// Worker używa publicznej przeglądarki; żadnego komercyjnego API CMD/EasyMKW.
// Wpisy trafiają do istniejących kolumn HTML w kw_documents.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { validateKwNumber } from "@/lib/kw";
import type { KwFetchOutcome } from "@/lib/kw-fetch.server";

const SECTION_KEYS = ["okladka", "dzial_1o", "dzial_1s", "dzial_2", "dzial_3", "dzial_4"] as const;

export function hasEkwDirectConfig(): boolean {
  return Boolean(process.env.EKW_DIRECT_URL && process.env.EKW_DIRECT_TOKEN);
}

function validatedCompactKw(raw: string): string | null {
  // Stara warstwa Finance You przekazuje numer kompaktowy (13 znaków).
  const value = /^[A-Z0-9]{4}[0-9]{9}$/.test(raw)
    ? raw.slice(0, 4) + "/" + raw.slice(4, 12) + "/" + raw.slice(12)
    : raw;
  const checked = validateKwNumber(value);
  return checked.ok ? checked.compact : null;
}

export type EkwDirectResponse = {
  ok: boolean;
  sections?: {
    kw_number: string;
    fetched_at: string;
    okladka: string;
    dzial_1o: string;
    dzial_1s: string;
    dzial_2: string;
    dzial_3: string;
    dzial_4: string;
  };
  error?: { code?: string; message?: string };
};

export function validateDirectResponse(data: EkwDirectResponse, kw: string): boolean {
  const s = data.sections;
  if (!data.ok || !s || s.kw_number !== kw || !Number.isFinite(Date.parse(s.fetched_at))) return false;
  const age = Date.now() - Date.parse(s.fetched_at);
  if (age < -60_000 || age > 180_000) return false;
  return SECTION_KEYS.every((key) => {
    const html = s[key];
    return (
      typeof html === "string" &&
      html.length >= 20 &&
      html.length <= 2_000_000 &&
      !/access denied|error 15|support id|blocked by our security service|captcha/i.test(html) &&
      !/<\s*(?:script|iframe|object|embed|form|svg)\b/i.test(html) &&
      !/\bon\w+\s*=/i.test(html) &&
      !/\b(?:href|src)\s*=/i.test(html)
    );
  });
}

export async function fetchAndStoreKwDirect(
  rawKw: string,
  opts?: { orderedBy?: string | null; force?: boolean; pollMaxMs?: number },
): Promise<KwFetchOutcome> {
  const kw = validatedCompactKw(rawKw);
  if (!kw) {
    return { ok: false, status: "error", cached: false, error: "Nieprawidłowy numer KW lub cyfra kontrolna." };
  }
  if (!hasEkwDirectConfig()) {
    return { ok: false, status: "error", cached: false, error: "Brak konfiguracji EKW_DIRECT_URL / EKW_DIRECT_TOKEN." };
  }

  const { data: cached, error: readError } = await supabaseAdmin
    .from("kw_documents")
    .select("status, ordered_at, fetched_at, last_error")
    .eq("kw_number", kw)
    .maybeSingle();
  if (readError) {
    return { ok: false, status: "error", cached: false, error: readError.message };
  }
  // No cache short-circuit. This path is invoked for on-demand fresh reads.
  // A previously fetched snapshot stays available for comparison/history,
  // but can NEVER satisfy a new official-source read request.
  // Avoid duplicate overlapping browser sessions.
  if (
    cached?.status === "processing" &&
    cached.ordered_at &&
    Date.now() - Date.parse(cached.ordered_at) < 120_000 &&
    !opts?.force
  ) {
    return { ok: false, status: "processing", cached: false };
  }
  const hadContent = Boolean(cached?.fetched_at);
  const { error: upsertError } = await supabaseAdmin.from("kw_documents").upsert({
    kw_number: kw,
    status: "processing",
    provider: "ekw_direct",
    ordered_at: new Date().toISOString(),
    ordered_by: opts?.orderedBy ?? null,
    last_error: null,
  }, { onConflict: "kw_number" });
  if (upsertError) {
    return { ok: false, status: "error", cached: hadContent, error: upsertError.message };
  }

  const markFailed = async (message: string, processing = false): Promise<KwFetchOutcome> => {
    await supabaseAdmin.from("kw_documents").update({
      status: hadContent ? "ready" : processing ? "processing" : "error",
      last_error: message,
    }).eq("kw_number", kw);
    return { ok: false, status: processing && !hadContent ? "processing" : "error", cached: hadContent, error: message };
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 70_000);
    let res: Response;
    try {
      res = await fetch(process.env.EKW_DIRECT_URL!.replace(/\/+$/, "") + "/v1/kw/content", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + process.env.EKW_DIRECT_TOKEN!,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ kw }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    const data = (await res.json().catch(() => null)) as EkwDirectResponse | null;
    if (!res.ok || !data?.ok) {
      const code = data?.error?.code ?? "HTTP_" + res.status;
      const detail = data?.error?.message ?? "Worker EKW nie zwrócił treści.";
      // Nie próbuj omijać blokady/captcha, nie wyzwalaj płatnego fallbacku.
      return markFailed("EKW Direct (" + code + "): " + detail, res.status === 429);
    }
    if (!validateDirectResponse(data, kw)) {
      return markFailed("EKW Direct: niekompletny lub niepoprawny zestaw działów — bez zapisu jako ready.");
    }
    const s = data.sections!;
    const { error: updateError } = await supabaseAdmin.from("kw_documents").update({
      status: "ready",
      provider: "ekw_direct",
      okladka: s.okladka,
      dzial_1o: s.dzial_1o,
      dzial_1s: s.dzial_1s,
      dzial_2: s.dzial_2,
      dzial_3: s.dzial_3,
      dzial_4: s.dzial_4,
      fetched_at: s.fetched_at,
      credits_spent: 0,
      bill_in: null,
      bill_out: null,
      last_error: null,
    }).eq("kw_number", kw);
    if (updateError) return markFailed("EKW Direct: zapis w Supabase nie powiódł się: " + updateError.message);
    return { ok: true, status: "ready", cached: false };
  } catch (error) {
    return markFailed("EKW Direct: " + (error instanceof Error ? error.message : "błąd komunikacji"));
  }
}
