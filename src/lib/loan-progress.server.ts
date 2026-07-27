// Helpery serwerowe do wyliczania postępu wniosku z bazy + planowania przypomnień.
import { createClient } from "@supabase/supabase-js";
import {
  computeLoanProgress,
  buildElevenLabsVariables,
  type ProgressResult,
} from "./loan-progress";

function admin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

export interface LoanLeadFullData {
  loan: any;
  client: any | null;
  property: any | null;
  documents: any[];
  progress: ProgressResult;
  variables: Record<string, string>;
}

export async function loadLoanLeadData(
  loanApplicationId: string,
): Promise<LoanLeadFullData | null> {
  const s = admin();
  const { data: loan } = await s
    .from("loan_applications")
    .select("*")
    .eq("id", loanApplicationId)
    .maybeSingle();
  if (!loan) return null;

  const [{ data: client }, { data: prop }, { data: docs }] = await Promise.all([
    s
      .from("clients")
      .select("id,first_name,last_name,phone_normalized,email,phone,do_not_call")
      .eq("id", loan.client_id)
      .maybeSingle(),
    s.from("properties").select("*").eq("loan_application_id", loan.id).maybeSingle(),
    s.from("documents").select("id,document_type,file_name").eq("loan_application_id", loan.id),
  ]);

  const progress = computeLoanProgress({
    loan: {
      id: loan.id,
      current_form_step: loan.current_form_step,
      status: loan.status,
      loan_amount: loan.loan_amount,
      preferred_period_months: loan.preferred_period_months,
    },
    client: client
      ? {
          first_name: client.first_name,
          last_name: client.last_name,
          phone_normalized: client.phone_normalized ?? client.phone,
          email: client.email,
        }
      : null,
    property: prop,
    documents: docs ?? [],
  });

  const variables = {
    ...buildElevenLabsVariables(progress, {
      first_name: client?.first_name ?? null,
      last_name: client?.last_name ?? null,
      phone_normalized: client?.phone_normalized ?? client?.phone ?? null,
      email: client?.email ?? null,
    }),
    client_id: client?.id ?? "",
    loan_application_id: loan.id,
    do_not_call: client?.do_not_call ? "true" : "false",
  };

  return { loan, client, property: prop, documents: docs ?? [], progress, variables };
}

/** Zwraca godzinę (0-23) podanego momentu w czasie Europe/Warsaw. */
function warsawHour(d: Date): number {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(d);
  return parseInt(p.find((x) => x.type === "hour")?.value ?? "0", 10);
}

function warsawOffsetMinutes(at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Warsaw",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return (asUtc - at.getTime()) / 60000;
}

/** Najbliższa data > `from` przypadająca na podaną godzinę/minutę czasu Warszawy,
 *  z pominięciem niedziel. */
export function nextWarsawSlotAt(from: Date, hour: number, minute: number): Date {
  for (let addDays = 0; addDays < 9; addDays++) {
    const off = warsawOffsetMinutes(from);
    const local = new Date(from.getTime() + off * 60000);
    const ly = local.getUTCFullYear(),
      lm = local.getUTCMonth(),
      ld = local.getUTCDate() + addDays;
    const candidate = new Date(Date.UTC(ly, lm, ld, hour, minute, 0) - off * 60000);
    const dow = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Warsaw",
      weekday: "short",
    }).format(candidate);
    if (dow === "Sun") continue;
    if (candidate.getTime() > from.getTime() + 60_000) return candidate;
  }
  return new Date(from.getTime() + 24 * 3600_000);
}

/** Pobiera historyczne wskaźniki odbieralności per godzina Warszawy (ostatnie 60 dni).
 *  Wynik: mapa hour→answerRate (0..1). Godziny z <3 próbami pomijane. */
export async function loadHourAnswerScores(): Promise<Record<number, number>> {
  const s = admin();
  const since = new Date(Date.now() - 60 * 24 * 3600_000).toISOString();
  const { data } = await s
    .from("call_queue")
    .select("started_at, status")
    .gte("started_at", since)
    .not("started_at", "is", null)
    .neq("source", "test")
    .limit(5000);
  const totals = Array(24).fill(0);
  const answered = Array(24).fill(0);
  for (const r of (data ?? []) as Array<{ started_at: string; status: string }>) {
    const h = warsawHour(new Date(r.started_at));
    totals[h]++;
    if (r.status === "zakonczona") answered[h]++;
  }
  const out: Record<number, number> = {};
  for (let h = 0; h < 24; h++) {
    if (totals[h] >= 3) out[h] = answered[h] / totals[h];
  }
  return out;
}

/** Losuje slot kolejnego telefonu w przeciwnej połowie dnia niż ostatni telefon.
 *  - rano: 9–12, wieczór: 17–20 (Europe/Warsaw);
 *  - opcjonalny `hourScores` (z `loadHourAnswerScores`) waży godziny wg historycznej odbieralności;
 *  - skok minutowy losowy 0–59 (jitter);
 *  - omija niedziele. */
export function pickAlternatingCallSlot(opts: {
  lastCallAt: Date | null;
  earliest: Date;
  hourScores?: Record<number, number>;
}): Date {
  const lastWasMorning = opts.lastCallAt ? warsawHour(opts.lastCallAt) < 14 : Math.random() < 0.5;
  const range = lastWasMorning ? [17, 18, 19, 20] : [9, 10, 11, 12];
  const weights = range.map((h) => 0.1 + (opts.hourScores?.[h] ?? 0.3));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  let hour = range[0];
  for (let i = 0; i < range.length; i++) {
    r -= weights[i];
    if (r <= 0) {
      hour = range[i];
      break;
    }
  }
  const minute = Math.floor(Math.random() * 60);
  return nextWarsawSlotAt(opts.earliest, hour, minute);
}

/** Wylicza kolejny termin przypomnienia.
 *  Kadencja WYGASAJĄCA, ale BEZ TWARDEGO STOPU — automat nigdy nie milknie sam
 *  z siebie (żeby nie było „martwych" leadów jak wcześniej, gdy po 10 próbach /
 *  30 dniach `next_reminder_at` szło na null i telefon przestawał dzwonić).
 *  Cadence (godziny od teraz):
 *    0→+5h, 1→+8h, 2→+24h, 3→+48h, 4–7→+72h (3 dni),
 *    8–14→+168h (tydzień), 15–25→+336h (2 tyg.), 26+→+504h (3 tyg. — steady state).
 *  Wynik jest „snapowany" do losowego slotu w przeciwnej połowie dnia niż teraz
 *  (rano/wieczór), z opcjonalnym wagowaniem godzin wg historycznej odbieralności.
 *  Sekwencję przerywają WYŁĄCZNIE zdarzenia zewnętrzne (status terminalny,
 *  do_not_call, ukończony wniosek, ręczna pauza) — obsługiwane wyżej. */
export function computeNextReminder(opts: {
  attempts: number;
  firstReminderAt: Date | null;
  now?: Date;
  hourScores?: Record<number, number>;
}): { nextAt: Date | null; stop: boolean } {
  const now = opts.now ?? new Date();
  const a = opts.attempts;
  let deltaH: number;
  if (a === 0) deltaH = 5;
  else if (a === 1) deltaH = 8;
  else if (a === 2) deltaH = 24;
  else if (a === 3) deltaH = 48;
  else if (a <= 7)
    deltaH = 72; // 3 dni
  else if (a <= 14)
    deltaH = 168; // tydzień
  else if (a <= 25)
    deltaH = 336; // 2 tygodnie
  else deltaH = 504; // 3 tygodnie — kadencja podtrzymująca w nieskończoność
  const earliest = new Date(now.getTime() + deltaH * 3600_000);
  const slot = pickAlternatingCallSlot({
    lastCallAt: now,
    earliest,
    hourScores: opts.hourScores,
  });
  return { nextAt: slot, stop: false };
}

export const ELIGIBLE_STATUSES_FOR_REMINDERS = [
  "nowy_lead",
  "w_trakcie_uzupelniania",
  "braki_w_dokumentach",
  "do_kontaktu",
  "w_follow_upie",
];
