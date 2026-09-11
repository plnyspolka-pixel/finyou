// Przekazywanie leadów z formularzy błyskawicznych Meta do panelu klienta zewnętrznego.
//
// Kampanie prowadzone z naszego konta reklamowego dla klientów (np. wynajem
// szalunków) zbierają leady formularzem na Facebooku, ale te leady NIE są leadami
// Finance You: nie zakładamy im wniosku pożyczkowego, konta w panelu, nie dzwonimy
// voicebotem i nie wysyłamy SMS-a z ofertą pożyczki. Lecą prosto do klienta.
import { extractField, extractPhone, cleanName } from "@/lib/meta-lead-fields";
import type { PoleFormularza } from "@/lib/meta-lead-fields";

export type LeadKlienta = {
  meta_lead_id: string;
  imie: string | null;
  telefon: string | null;
  email: string | null;
  utworzono: string;
  kampania_id: string | null;
  reklama_id: string | null;
  formularz_id: string | null;
  /** Komplet odpowiedzi, gdyby klient chciał więcej niż imię i kontakt. */
  pola: Array<{ nazwa: string; wartosc: string }>;
};

export type SurowyLead = {
  id: string | number;
  created_time?: string | null;
  form_id?: string | null;
  campaign_id?: string | null;
  ad_id?: string | null;
  field_data?: PoleFormularza[];
};

/** Zamienia leada z Graph API na payload dla panelu klienta. */
export function buildClientLeadPayload(lead: SurowyLead): LeadKlienta {
  const fd = Array.isArray(lead.field_data) ? lead.field_data : [];
  const rawName = extractField(fd, ["name", "imię", "imie", "nazwisko"]);
  return {
    meta_lead_id: String(lead.id),
    imie: cleanName(rawName),
    telefon: extractPhone(fd, rawName),
    email: extractField(fd, ["email", "mail"]),
    utworzono: lead.created_time ?? new Date().toISOString(),
    kampania_id: lead.campaign_id ?? null,
    reklama_id: lead.ad_id ?? null,
    formularz_id: lead.form_id ?? null,
    pola: fd.map((f) => ({
      nazwa: String(f.name ?? ""),
      wartosc: Array.isArray(f.values) ? (f.values[0] ?? "") : String(f.values ?? ""),
    })),
  };
}

export type KonfiguracjaKlienta = { url: string; secret: string | null };

/**
 * Zwraca konfigurację przekazywania, jeśli formularz należy do klienta zewnętrznego.
 * `null` = zwykły formularz Finance You, lead idzie naszą ścieżką.
 *
 * To jedyna bramka rozstrzygająca, czy lead jest nasz, czy klienta — korzystają
 * z niej obie drogi wejścia (webhook Meta i synchronizacja), żeby nie dało się
 * zapomnieć o niej w jednej z nich.
 */
export async function konfiguracjaKlienta(
  metaFormId: string | null | undefined,
): Promise<KonfiguracjaKlienta | null> {
  if (!metaFormId) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("meta_lead_forms")
    .select("client_forward_url, client_forward_secret")
    .eq("meta_form_id", String(metaFormId))
    .maybeSingle();
  const wiersz = data as {
    client_forward_url?: string | null;
    client_forward_secret?: string | null;
  } | null;
  if (!wiersz?.client_forward_url) return null;
  return { url: wiersz.client_forward_url, secret: wiersz.client_forward_secret ?? null };
}

/**
 * Przekazuje leada do panelu klienta i odnotowuje sam fakt przekazania.
 *
 * W Finance You NIE zostaje żaden ślad z danymi osobowymi: ani w `meta_leads`,
 * ani w `leads`, ani wśród klientów. Zapisujemy wyłącznie identyfikator leada
 * w Meta, żeby webhook i synchronizacja nie wysłały tego samego dwa razy.
 */
export async function przekazLeadaKlientowi(
  konfiguracja: KonfiguracjaKlienta,
  lead: SurowyLead,
): Promise<{ ok: boolean; pominiety?: boolean; error?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const metaLeadId = String(lead.id);

  const { data: juzWyslany } = await supabaseAdmin
    .from("client_lead_forwards")
    .select("meta_lead_id, status")
    .eq("meta_lead_id", metaLeadId)
    .maybeSingle();
  if ((juzWyslany as { status?: string } | null)?.status === "wyslany") {
    return { ok: true, pominiety: true };
  }

  const wynik = await forwardLeadToClient(
    konfiguracja.url,
    konfiguracja.secret,
    buildClientLeadPayload(lead),
  );

  await supabaseAdmin.from("client_lead_forwards").upsert(
    {
      meta_lead_id: metaLeadId,
      meta_form_id: String(lead.form_id ?? ""),
      forwarded_at: new Date().toISOString(),
      status: wynik.ok ? "wyslany" : "blad",
      error: wynik.ok ? null : (wynik.error ?? "").slice(0, 500),
    },
    { onConflict: "meta_lead_id" },
  );

  return wynik;
}

/**
 * Wysyła leada na endpoint klienta. Nie rzuca — błąd wraca w wyniku, żeby jeden
 * niedostępny panel klienta nie wywracał całej synchronizacji.
 */
export async function forwardLeadToClient(
  url: string,
  secret: string | null,
  payload: LeadKlienta,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "x-lead-secret": secret } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, error: `${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
