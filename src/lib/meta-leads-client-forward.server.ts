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
