// Wynik telefonu windykacyjnego (agent A4) → wpis w aktach sprawy.
//
// Webhook ElevenLabs po rozmowie dostaje podsumowanie i dane wyciągnięte
// z zapisu (WIND_AGENT_DATA_COLLECTION). Tu składamy z nich treść zdarzenia
// „telefon" w wind_events: inwestor widzi w aktach, co ustalono, a kolejny
// telefon dostaje poprzednią deklarację w zmiennej {{poprzednia_deklaracja}}.
//
// Opłata za monit telefoniczny (Zał. 3 / tabela opłat z umowy) jest zwrotem
// kosztu czynności, która DOTARŁA do pożyczkobiorcy — nieodebrany telefon,
// poczta głosowa albo rozmowa z osobą trzecią nie jest monitem, więc wtedy
// opłata spada do zera.

import type { CallOutcome } from "@/lib/call-outcome";

export const WIND_CALL_RESULT_LABELS: Record<string, string> = {
  wplata_w_trakcie_rozmowy: "wpłata w trakcie rozmowy",
  deklaracja_calosci: "deklaracja wpłaty całości",
  deklaracja_czesci: "deklaracja wpłaty części",
  juz_zaplacone: "twierdzi, że już zapłacił(a)",
  prosba_o_raty: "prośba o rozłożenie na raty",
  kwestionuje_kwote: "kwestionuje kwotę",
  odmowa: "odmowa zapłaty",
  trudna_sytuacja: "trudna sytuacja — bez deklaracji",
  upadlosc_lub_restrukturyzacja: "upadłość lub restrukturyzacja",
  osoba_trzecia: "odebrała osoba trzecia",
  brak_rozmowy: "brak rozmowy z pożyczkobiorcą",
  inny: "inny wynik",
};

export interface WindCallOutcomeInput {
  outcome: CallOutcome;
  outcomeLabel: string;
  summary?: string | null;
  /** Wartości z analysis.data_collection_results (już spłaszczone do value). */
  collected: Record<string, unknown>;
  durationSec?: number | null;
}

export interface WindCallOutcomeRecord {
  tytul: string;
  tresc: string;
  /** Pola dopisywane do wind_events.metadata. */
  metadata: Record<string, unknown>;
  /** Czy monit dotarł do pożyczkobiorcy — podstawa naliczenia opłaty. */
  dotarl: boolean;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s && s.toLowerCase() !== "null" ? s : null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  const n = parseFloat(
    String(v)
      .replace(/[^\d,.-]/g, "")
      .replace(",", "."),
  );
  return Number.isFinite(n) && n > 0 ? n : null;
}

function bool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  const s = str(v)?.toLowerCase();
  if (!s) return null;
  if (["true", "tak", "yes", "1"].includes(s)) return true;
  if (["false", "nie", "no", "0"].includes(s)) return false;
  return null;
}

/** RRRR-MM-DD albo null (model bywa kreatywny z formatem). */
function isoDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function fmtZl(n: number): string {
  return `${new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 })
    .format(n)
    .replace(/\u00a0/g, " ")} zł`;
}

export function summarizeWindCallOutcome(input: WindCallOutcomeInput): WindCallOutcomeRecord {
  const c = input.collected ?? {};
  const wynik = str(c.wynik_rozmowy);
  const tozsamosc = bool(c.tozsamosc_potwierdzona);
  const kwota = num(c.deklarowana_kwota);
  const data = isoDate(c.deklarowana_data);
  const powod = str(c.powod_opoznienia);
  const propozycja = str(c.propozycja_splaty);
  const zastrzezenia = str(c.zastrzezenia);
  const prosbaOKontakt = bool(c.prosba_o_kontakt);
  const notatka = str(c.notatka);

  const dotarl =
    input.outcome === "answered" &&
    tozsamosc !== false &&
    wynik !== "osoba_trzecia" &&
    wynik !== "brak_rozmowy";

  const wynikLabel = wynik ? (WIND_CALL_RESULT_LABELS[wynik] ?? wynik) : null;
  const deklaracja =
    data || kwota
      ? [kwota ? fmtZl(kwota) : "wpłata", data ? `do ${data}` : "bez terminu"].join(" ")
      : null;

  const tytul = !dotarl
    ? `Telefon windykacyjny (agent AI) — ${wynikLabel ?? input.outcomeLabel.toLowerCase()}`
    : `Telefon windykacyjny (agent AI) — ${deklaracja ? `deklaracja: ${deklaracja}` : (wynikLabel ?? "rozmowa")}`;

  const linie = [
    `Wynik połączenia: ${input.outcomeLabel}${input.durationSec ? ` (${input.durationSec} s)` : ""}.`,
    wynikLabel ? `Wynik rozmowy: ${wynikLabel}.` : null,
    deklaracja ? `Deklaracja: ${deklaracja}.` : null,
    powod ? `Przyczyna opóźnienia: ${powod}` : null,
    propozycja ? `Propozycja spłaty (do decyzji): ${propozycja}` : null,
    zastrzezenia ? `Zastrzeżenia: ${zastrzezenia}` : null,
    prosbaOKontakt ? "Prosi o kontakt pożyczkodawcy." : null,
    notatka ? `Notatka: ${notatka}` : null,
    input.summary ? `Podsumowanie rozmowy: ${input.summary}` : null,
    dotarl ? null : "Monit nie dotarł do pożyczkobiorcy — bez opłaty za telefon.",
  ].filter(Boolean);

  return {
    tytul,
    tresc: linie.join("\n"),
    dotarl,
    metadata: {
      call_outcome: input.outcome,
      wynik_rozmowy: wynik,
      tozsamosc_potwierdzona: tozsamosc,
      deklarowana_kwota: kwota,
      deklarowana_data: data,
      powod_opoznienia: powod,
      propozycja_splaty: propozycja,
      zastrzezenia,
      prosba_o_kontakt: prosbaOKontakt,
      notatka,
      podsumowanie: input.summary ?? null,
      czas_rozmowy_s: input.durationSec ?? null,
    },
  };
}
