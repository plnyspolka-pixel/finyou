// Krótkie linki do SMS-ów: https://financeyou.pl/s/<kod>.
//
// Surowy magic link Supabase ma kilkaset znaków (kilka segmentów SMS, wygląd
// phishingu) i wygasa po ~godzinie. Tu w wiadomości idzie 6-znakowy kod, a adres
// docelowy rozwiązujemy dopiero przy kliknięciu — gdy znamy maila, generujemy
// wtedy ŚWIEŻY magic link, więc link z SMS-a działa również po kilku dniach.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function admin(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** Wszystkie linki klienckie idą na główną domenę (nie app.financeyou.pl). */
export const PUBLIC_SITE_ORIGIN = "https://financeyou.pl";

// Bez znaków mylących w odczycie z ekranu telefonu (0/O, 1/l/I).
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function randomShortCode(length = 6): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function shortLinkUrl(code: string): string {
  return `${PUBLIC_SITE_ORIGIN}/s/${code}`;
}

export interface CreateShortLinkOpts {
  /** Adres docelowy używany, gdy nie generujemy magic linku (albo gdy się nie uda). */
  targetUrl: string;
  /** Gdy podany — przy kliknięciu tworzymy świeży magic link dla tego maila. */
  magicLinkEmail?: string | null;
  magicLinkRole?: "klient" | "operator" | "inwestor";
  leadId?: string | null;
  clientId?: string | null;
  loanApplicationId?: string | null;
  phoneNormalized?: string | null;
  source?: string | null;
  expiresAt?: Date | null;
}

/** Tworzy krótki link. Zwraca `null`, jeśli zapis się nie powiódł (wywołujący ma fallback). */
export async function createShortLink(
  opts: CreateShortLinkOpts,
): Promise<{ code: string; url: string } | null> {
  const s = admin();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomShortCode();
    const { error } = await s.from("short_links").insert({
      code,
      target_url: opts.targetUrl,
      magic_link_email: opts.magicLinkEmail ?? null,
      magic_link_role: opts.magicLinkRole ?? "klient",
      lead_id: opts.leadId ?? null,
      client_id: opts.clientId ?? null,
      loan_application_id: opts.loanApplicationId ?? null,
      phone_normalized: opts.phoneNormalized ?? null,
      source: opts.source ?? null,
      expires_at: opts.expiresAt ? opts.expiresAt.toISOString() : null,
    });
    if (!error) return { code, url: shortLinkUrl(code) };
    // 23505 = kolizja kodu; każdy inny błąd nie ma sensu ponawiać.
    if (error.code !== "23505") {
      console.error("[short-link] insert failed", error);
      return null;
    }
  }
  console.error("[short-link] nie udało się wylosować wolnego kodu");
  return null;
}

/**
 * Rozwiązuje kod na adres docelowy i odnotowuje kliknięcie.
 * Zwraca `null`, gdy kodu nie ma albo wygasł — wtedy route przekierowuje na stronę główną.
 */
export async function resolveShortLink(code: string): Promise<string | null> {
  const clean = String(code ?? "")
    .trim()
    .toLowerCase();
  if (!clean || !/^[a-z0-9]{4,16}$/.test(clean)) return null;

  const s = admin();
  const { data: row } = await s
    .from("short_links")
    .select(
      "id, target_url, magic_link_email, magic_link_role, expires_at, click_count, lead_id, loan_application_id",
    )
    .eq("code", clean)
    .maybeSingle();
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at as string).getTime() < Date.now()) return null;

  await s
    .from("short_links")
    .update({
      click_count: (row.click_count ?? 0) + 1,
      last_clicked_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  if (row.magic_link_email) {
    try {
      const { ensureKlientAccountAndMagicLink } = await import("@/lib/client-magic-link.server");
      const r = await ensureKlientAccountAndMagicLink(row.magic_link_email as string, {
        source: "short_link",
        role: (row.magic_link_role as "klient" | "operator" | "inwestor") ?? "klient",
      });
      if (r.magicLink) return r.magicLink;
    } catch (e) {
      console.error("[short-link] magic link generation failed", e);
    }
  }
  return (row.target_url as string) || null;
}
