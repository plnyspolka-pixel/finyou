// Sekwencja poganiania leada przez Anię — 30 dni.
// Mail = codziennie (30x), telefon = 13x (intensywnie w tyg.1, potem spadek), SMS = 4x (raz/tydzień).
// Telefon i SMS tylko 8:00–21:00 Europe/Warsaw, pon–pt (sobota/niedziela → przesuwane).
// Mail o każdej porze (mail nie irytuje).
//
// Sekwencję przerywa: odpowiedź klienta (mail/SMS/messenger/IG), odebrany telefon,
// dokończenie wniosku, status terminalny, ręczna pauza.

import { createClient } from "@supabase/supabase-js";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

type Channel = "email" | "sms" | "call";

interface Slot {
  day: number;          // 1..30 — N-ty dzień od wpadnięcia leada (1 = dzień wpadnięcia)
  hourWarsaw: number;   // godzina lokalna PL (0..23)
  channel: Channel;
  stepIndex: number;    // numer kroku w sekwencji danego kanału
}

// === SEKWENCJA ===
export const CADENCE: Slot[] = [
  // Dzień 1 — start
  { day: 1, hourWarsaw: 10, channel: "email", stepIndex: 1 },
  { day: 1, hourWarsaw: 10, channel: "sms",   stepIndex: 1 },
  { day: 1, hourWarsaw: 11, channel: "call",  stepIndex: 1 },
  { day: 1, hourWarsaw: 15, channel: "call",  stepIndex: 2 },
  // Dzień 2
  { day: 2, hourWarsaw: 10, channel: "email", stepIndex: 2 },
  { day: 2, hourWarsaw: 12, channel: "call",  stepIndex: 3 },
  // Dzień 3
  { day: 3, hourWarsaw: 10, channel: "email", stepIndex: 3 },
  { day: 3, hourWarsaw: 11, channel: "call",  stepIndex: 4 },
  // Dzień 4
  { day: 4, hourWarsaw: 10, channel: "email", stepIndex: 4 },
  { day: 4, hourWarsaw: 13, channel: "call",  stepIndex: 5 },
  // Dzień 5
  { day: 5, hourWarsaw: 10, channel: "email", stepIndex: 5 },
  { day: 5, hourWarsaw: 11, channel: "call",  stepIndex: 6 },
  // Dzień 6
  { day: 6, hourWarsaw: 10, channel: "email", stepIndex: 6 },
  { day: 6, hourWarsaw: 12, channel: "call",  stepIndex: 7 },
  // Dzień 7
  { day: 7, hourWarsaw: 10, channel: "email", stepIndex: 7 },
  { day: 7, hourWarsaw: 11, channel: "sms",   stepIndex: 2 },
  { day: 7, hourWarsaw: 14, channel: "call",  stepIndex: 8 },
  // Tydz. 2–4 — mail codziennie, telefon rzadziej
  { day: 8,  hourWarsaw: 10, channel: "email", stepIndex: 8 },
  { day: 9,  hourWarsaw: 10, channel: "email", stepIndex: 9 },
  { day: 10, hourWarsaw: 10, channel: "email", stepIndex: 10 },
  { day: 10, hourWarsaw: 12, channel: "call",  stepIndex: 9 },
  { day: 11, hourWarsaw: 10, channel: "email", stepIndex: 11 },
  { day: 12, hourWarsaw: 10, channel: "email", stepIndex: 12 },
  { day: 13, hourWarsaw: 10, channel: "email", stepIndex: 13 },
  { day: 14, hourWarsaw: 10, channel: "email", stepIndex: 14 },
  { day: 14, hourWarsaw: 11, channel: "sms",   stepIndex: 3 },
  { day: 14, hourWarsaw: 12, channel: "call",  stepIndex: 10 },
  { day: 15, hourWarsaw: 10, channel: "email", stepIndex: 15 },
  { day: 16, hourWarsaw: 10, channel: "email", stepIndex: 16 },
  { day: 17, hourWarsaw: 10, channel: "email", stepIndex: 17 },
  { day: 18, hourWarsaw: 10, channel: "email", stepIndex: 18 },
  { day: 18, hourWarsaw: 12, channel: "call",  stepIndex: 11 },
  { day: 19, hourWarsaw: 10, channel: "email", stepIndex: 19 },
  { day: 20, hourWarsaw: 10, channel: "email", stepIndex: 20 },
  { day: 21, hourWarsaw: 10, channel: "email", stepIndex: 21 },
  { day: 21, hourWarsaw: 11, channel: "sms",   stepIndex: 4 },
  { day: 22, hourWarsaw: 10, channel: "email", stepIndex: 22 },
  { day: 23, hourWarsaw: 10, channel: "email", stepIndex: 23 },
  { day: 23, hourWarsaw: 12, channel: "call",  stepIndex: 12 },
  { day: 24, hourWarsaw: 10, channel: "email", stepIndex: 24 },
  { day: 25, hourWarsaw: 10, channel: "email", stepIndex: 25 },
  { day: 26, hourWarsaw: 10, channel: "email", stepIndex: 26 },
  { day: 27, hourWarsaw: 10, channel: "email", stepIndex: 27 },
  { day: 28, hourWarsaw: 10, channel: "email", stepIndex: 28 },
  { day: 29, hourWarsaw: 10, channel: "email", stepIndex: 29 },
  { day: 30, hourWarsaw: 10, channel: "email", stepIndex: 30 },
  { day: 30, hourWarsaw: 13, channel: "call",  stepIndex: 13 },
];

// === TREŚCI MAILI (30) ===
type Tpl = { subject: string; body: (v: TplVars) => string };
interface TplVars { firstName: string; returnLink: string; }

const greet = (v: TplVars) => v.firstName ? `Cześć ${v.firstName}!` : "Cześć!";
const cta = (v: TplVars) => `Dokończ wniosek tutaj: ${v.returnLink}`;
const sig = "\n\nZespół Finance You";

export const EMAIL_TEMPLATES: Record<number, Tpl> = {
  1: { subject: "Dziękujemy za zainteresowanie pożyczką — dokończ wniosek",
       body: (v) => `${greet(v)}\n\nDziękujemy za zostawienie kontaktu. Aby otrzymać decyzję, dokończ wniosek — zajmie to ok. 3 minut.\n\n${cta(v)}${sig}` },
  2: { subject: "Czy mogę w czymś pomóc?",
       body: (v) => `${greet(v)}\n\nJestem Ania z Finance You. Jeśli masz pytania o pożyczkę pod zastaw nieruchomości — odpisz na tego maila, oddzwonię.\n\n${cta(v)}${sig}` },
  3: { subject: "Twój wniosek czeka — 3 minuty i gotowe",
       body: (v) => `${greet(v)}\n\nZostały Ci ostatnie kroki: zdjęcia nieruchomości i dane kontaktowe. Wszystkie dane bezpieczne, bez zobowiązań.\n\n${cta(v)}${sig}` },
  4: { subject: "Jak działa pożyczka pod zastaw nieruchomości",
       body: (v) => `${greet(v)}\n\nKrótko: zabezpieczasz mieszkanie/dom/działkę, dostajesz pieniądze w 7–14 dni, spłacasz w ratach lub balonem. Bez BIK, bez ZUS.\n\n${cta(v)}${sig}` },
  5: { subject: "Najczęstsze pytania klientów",
       body: (v) => `${greet(v)}\n\nTOP3 pytań:\n1. Czy stracę mieszkanie? — nie, dopóki spłacasz\n2. Jaki koszt? — od 1,5% miesięcznie\n3. Ile czekam? — średnio 10 dni\n\n${cta(v)}${sig}` },
  6: { subject: "Ile faktycznie kosztuje pożyczka?",
       body: (v) => `${greet(v)}\n\nU nas: oprocentowanie 18–24% rocznie + prowizja. Bez ukrytych opłat. Pełna kalkulacja w panelu klienta po wypełnieniu wniosku.\n\n${cta(v)}${sig}` },
  7: { subject: "Decyzja w 24h — tak naprawdę",
       body: (v) => `${greet(v)}\n\nSerio. Po wypełnieniu wniosku w 24h dostajesz wstępną decyzję od inwestora. Bez kolejek, bez bankowych procedur.\n\n${cta(v)}${sig}` },
  8: { subject: "Wracam — dokończmy razem",
       body: (v) => `${greet(v)}\n\nWidzę, że Twój wniosek jest niedokończony. Mogę zadzwonić i przeprowadzić Cię przez resztę krok po kroku. Powiedz tylko, kiedy mam się odezwać.\n\n${cta(v)}${sig}` },
  9: { subject: "Nasi klienci o nas",
       body: (v) => `${greet(v)}\n\n„Bank odmówił, Finance You dał 150 tys. w 9 dni." — pani Anna z Krakowa.\n„Pomogli mi spłacić długi i odzyskać spokój." — pan Marek z Wrocławia.\n\n${cta(v)}${sig}` },
  10:{ subject: "Co potrzebujemy do wniosku?",
       body: (v) => `${greet(v)}\n\nTylko: numer księgi wieczystej (lub zdjęcia dokumentu), 2–3 zdjęcia nieruchomości, Twoje dane kontaktowe. Reszta — po naszej stronie.\n\n${cta(v)}${sig}` },
  11:{ subject: "Bez BIK, bez ZUS — jak to możliwe",
       body: (v) => `${greet(v)}\n\nBo zabezpieczeniem jest nieruchomość, nie Twoja historia kredytowa. Dlatego pożyczamy też osobom, które bank odrzucił.\n\n${cta(v)}${sig}` },
  12:{ subject: "Pożyczka pod mieszkanie, dom lub działkę",
       body: (v) => `${greet(v)}\n\nAkceptujemy mieszkania, domy, działki budowlane, lokale komercyjne — nawet z obciążeniami. Każdy przypadek analizujemy indywidualnie.\n\n${cta(v)}${sig}` },
  13:{ subject: "Pieniądze na koncie w tym tygodniu",
       body: (v) => `${greet(v)}\n\nJeśli dokończysz wniosek dzisiaj — realnie w tym tygodniu możesz mieć pieniądze. Zapraszam.\n\n${cta(v)}${sig}` },
  14:{ subject: "Jeszcze tu jesteś?",
       body: (v) => `${greet(v)}\n\nMija tydzień. Wiem, że życie się dzieje. Jeśli nadal potrzebujesz pożyczki — wystarczą 3 minuty, żeby dokończyć.\n\n${cta(v)}${sig}` },
  15:{ subject: "Najczęstszy błąd przy wnioskach",
       body: (v) => `${greet(v)}\n\nLudzie czekają „aż będą mieli wszystkie papiery". Nie musisz — wniosek możesz dokończyć z tym, co masz, resztę dosyłamy w trakcie.\n\n${cta(v)}${sig}` },
  16:{ subject: "Krótko: dlaczego my, a nie bank",
       body: (v) => `${greet(v)}\n\nBank: 30 dni, BIK, ZUS, papiery. My: 10 dni, bez BIK, bez ZUS, jeden formularz online.\n\n${cta(v)}${sig}` },
  17:{ subject: "Twój status pożyczki czeka",
       body: (v) => `${greet(v)}\n\nTwój profil już mamy. Brakuje tylko paru kliknięć, żeby inwestor mógł podjąć decyzję.\n\n${cta(v)}${sig}` },
  18:{ subject: "Jak wyceniamy nieruchomość pod pożyczkę",
       body: (v) => `${greet(v)}\n\nUżywamy danych z RCN, ofert rynkowych i ksiąg wieczystych. Nie potrzebujesz operatu szacunkowego, wszystko po naszej stronie.\n\n${cta(v)}${sig}` },
  19:{ subject: "Refinansowanie zadłużenia — czy warto?",
       body: (v) => `${greet(v)}\n\nJeśli masz kilka drogich kredytów, jedna pożyczka pod zastaw nieruchomości może być tańsza miesięcznie. Policzymy razem.\n\n${cta(v)}${sig}` },
  20:{ subject: "Pożyczka na firmę bez ZUS",
       body: (v) => `${greet(v)}\n\nProwadzisz firmę i bank wymaga PIT-ów / ZUS? U nas zabezpieczeniem jest nieruchomość — pomijamy te wymogi.\n\n${cta(v)}${sig}` },
  21:{ subject: "Ostatnie 10 dni na decyzję w tym miesiącu",
       body: (v) => `${greet(v)}\n\nJeśli chcesz mieć pieniądze jeszcze w tym miesiącu — to ostatni moment, żeby ruszyć wniosek.\n\n${cta(v)}${sig}` },
  22:{ subject: "Może masz pytania — odpowiem",
       body: (v) => `${greet(v)}\n\nJeśli coś Cię powstrzymuje — napisz, co. Najczęstsze obawy to bezpieczeństwo, koszt i czas. Każdą wyjaśnię w jednej wiadomości.\n\n${cta(v)}${sig}` },
  23:{ subject: "Bezpieczeństwo umowy — co warto wiedzieć",
       body: (v) => `${greet(v)}\n\nUmowa zawsze u notariusza, regulowana przez polskie prawo. Wpis w księdze wieczystej to nie utrata mieszkania — to gwarancja dla inwestora.\n\n${cta(v)}${sig}` },
  24:{ subject: "Pożyczka krok po kroku",
       body: (v) => `${greet(v)}\n\n1) Wniosek online (3 min)\n2) Wycena (24h)\n3) Decyzja inwestora (24–48h)\n4) Umowa u notariusza (3–5 dni)\n5) Pieniądze na koncie\n\n${cta(v)}${sig}` },
  25:{ subject: "Inwestorzy szukają wniosków takich jak Twój",
       body: (v) => `${greet(v)}\n\nMamy dziś inwestorów z wolnymi środkami szukających nieruchomości o profilu takim jak Twoja. Nie czekaj — dokończ wniosek.\n\n${cta(v)}${sig}` },
  26:{ subject: "Twoje dane są bezpieczne",
       body: (v) => `${greet(v)}\n\nDane przechowujemy zgodnie z RODO, szyfrowane, dostęp tylko dla zweryfikowanych pracowników. Zawsze możesz je usunąć.\n\n${cta(v)}${sig}` },
  27:{ subject: "Zaczynamy?",
       body: (v) => `${greet(v)}\n\nTrzy minuty Twojego czasu = realna szansa na pożyczkę, której bank Ci nie da. Spróbujmy.\n\n${cta(v)}${sig}` },
  28:{ subject: "Już prawie kończymy",
       body: (v) => `${greet(v)}\n\nZostały 2 dni z mojej serii przypomnień. Potem zostawię Cię w spokoju. Jeśli to ma być teraz — jest to teraz.\n\n${cta(v)}${sig}` },
  29:{ subject: "Ostatni mail w sprawie wniosku",
       body: (v) => `${greet(v)}\n\nJutro to ostatnia wiadomość. Jeśli pożyczka jest Ci nadal potrzebna — kliknij poniżej.\n\n${cta(v)}${sig}` },
  30:{ subject: "Do widzenia — gdyby coś",
       body: (v) => `${greet(v)}\n\nTo mój ostatni mail. Dziękuję, że dałeś nam szansę. Gdyby kiedyś sytuacja się zmieniła — link jest aktualny.\n\n${cta(v)}${sig}\n\n— Ania` },
};

export const SMS_TEMPLATES: Record<number, (v: TplVars) => string> = {
  1: (v) => `Finance You: ${v.firstName ?? "Cześć"}, dokończ wniosek o pożyczkę: https://financeyou.pl`,
  2: (v) => `Finance You: hej ${v.firstName ?? ""}, masz jeszcze otwarty wniosek — wejdź na https://financeyou.pl`,
  3: (v) => `Finance You: ${v.firstName ?? "Cześć"}, jeszcze tu jesteśmy. Dokończ wniosek: https://financeyou.pl`,
  4: (v) => `Finance You: ostatnia szansa — dokończ wniosek na https://financeyou.pl . Stop=STOP`,
};


// === KONWERSJA STREF CZASOWYCH ===
/** Buduje Date odpowiadający podanej dacie i godzinie w Europe/Warsaw. */
function warsawDateAt(year: number, month: number, day: number, hour: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(guess);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const wallUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  const diff = wallUtc - guess.getTime();
  return new Date(guess.getTime() - diff);
}

function warsawDateParts(d: Date): { y: number; m: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get("year"), m: get("month"), day: get("day") };
}

/** Czy aktualnie 8:00–21:00 i pon–pt (Warszawa)? Telefon i SMS tylko w tym oknie. */
function isInQuietWindow(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit", weekday: "short", hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  const isWeekday = !["Sat", "Sun"].includes(wd);
  return isWeekday && hour >= 8 && hour < 21;
}

// === PLANOWANIE ===
export async function scheduleFollowUpsForLead(leadId: string, anchorAt: Date = new Date()): Promise<{ inserted: number }> {
  const s = admin();
  const { y, m, day } = warsawDateParts(anchorAt);
  // Bazowa data Warszawy dla dnia 1 to dzień wpadnięcia leada (kalendarzowo PL).
  const rows = CADENCE.map((slot) => {
    // dayOffset: day 1 = anchorDay, day 2 = +1 doba, itd.
    const target = warsawDateAt(y, m, day + (slot.day - 1), slot.hourWarsaw);
    const scheduledAt = target.getTime() < Date.now() ? new Date(Date.now() + 60_000) : target;
    return {
      lead_id: leadId,
      channel: slot.channel,
      step_index: slot.stepIndex,
      scheduled_at: scheduledAt.toISOString(),
      status: "pending" as const,
      metadata: { day: slot.day, hourWarsaw: slot.hourWarsaw },
    };
  });
  // Idempotentnie — unikalne (lead_id,channel,step_index)
  const { error } = await s.from("lead_follow_up_schedule").upsert(rows, {
    onConflict: "lead_id,channel,step_index",
    ignoreDuplicates: true,
  });
  if (error) {
    console.error("[follow-up-plan] schedule insert error", error);
    return { inserted: 0 };
  }
  return { inserted: rows.length };
}

export async function cancelFollowUpsForLead(leadId: string, reason: string): Promise<void> {
  const s = admin();
  await s.from("lead_follow_up_schedule")
    .update({ status: "cancelled", error_message: reason })
    .eq("lead_id", leadId).eq("status", "pending");
}

// === PRZETWARZANIE (cron tick) ===
const TERMINAL = new Set([
  "zamkniety", "closed", "won", "lost", "odrzucony", "rezygnacja",
  "wyplacony", "spłacony", "do_not_contact", "blacklist",
]);

interface DueRow {
  id: string;
  lead_id: string;
  channel: Channel;
  step_index: number;
}

export async function processDueFollowUps(): Promise<{ processed: number; sent: number; skipped: number }> {
  const s = admin();
  const now = new Date();

  const { data: due } = await s.from("lead_follow_up_schedule")
    .select("id, lead_id, channel, step_index")
    .eq("status", "pending")
    .lte("scheduled_at", now.toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(200);

  if (!due || due.length === 0) return { processed: 0, sent: 0, skipped: 0 };

  // Czy są jakieś inboundy/odebrania (anulowanie sekwencji)?
  const leadIds = Array.from(new Set(due.map((r) => r.lead_id)));
  const { data: leads } = await s.from("leads")
    .select("id, status, email, phone_normalized, first_name, application_data, loan_application_id, client_id")
    .in("id", leadIds);
  const leadMap = new Map<string, any>();
  for (const l of leads ?? []) leadMap.set(l.id, l);

  // Czy klient już odpisał? (dowolny inbound w lead_communications)
  const { data: inbounds } = await s.from("lead_communications")
    .select("lead_id").in("lead_id", leadIds).eq("direction", "inbound");
  const respondedLeads = new Set<string>((inbounds ?? []).map((r) => r.lead_id).filter(Boolean));

  let sent = 0, skipped = 0;
  const inWindow = isInQuietWindow(now);

  for (const row of due as DueRow[]) {
    const lead = leadMap.get(row.lead_id);
    if (!lead) {
      await s.from("lead_follow_up_schedule").update({ status: "cancelled", error_message: "lead not found" }).eq("id", row.id);
      skipped++; continue;
    }
    if (lead.status && TERMINAL.has(String(lead.status))) {
      await cancelFollowUpsForLead(row.lead_id, `terminal status: ${lead.status}`);
      skipped++; continue;
    }
    if (lead.application_data?.followup_paused) {
      skipped++; continue;
    }
    if (respondedLeads.has(row.lead_id)) {
      await cancelFollowUpsForLead(row.lead_id, "client responded");
      skipped++; continue;
    }

    // Okno godzinowe — tylko dla call/sms
    if ((row.channel === "call" || row.channel === "sms") && !inWindow) {
      // Przesuń na najbliższy poniedziałek 10:00 PL lub dzisiaj 10:00 PL jeśli przed 8
      const next = nextWindowOpenAt(now);
      await s.from("lead_follow_up_schedule")
        .update({ scheduled_at: next.toISOString(), attempts: 0 })
        .eq("id", row.id);
      skipped++; continue;
    }

    const firstName = lead.first_name ?? "";
    const returnLink = lead.application_data?.return_link
      ?? (lead.loan_application_id ? await fetchReturnLink(lead.loan_application_id) : null)
      ?? "https://app.financeyou.pl/wniosek-start";
    const vars: TplVars = { firstName, returnLink };

    try {
      if (row.channel === "email") {
        const tpl = EMAIL_TEMPLATES[row.step_index];
        if (!tpl || !lead.email) {
          await s.from("lead_follow_up_schedule").update({ status: "skipped", error_message: "no email/template" }).eq("id", row.id);
          skipped++; continue;
        }
        const { sendResendEmail } = await import("@/lib/resend-send.server");
        const r = await sendResendEmail({
          to: lead.email,
          subject: tpl.subject,
          text: tpl.body(vars),
          fromName: "Ania z Finance You",
        });
        await s.from("lead_follow_up_schedule").update({
          status: r.ok ? "sent" : "error",
          sent_at: r.ok ? new Date().toISOString() : null,
          external_id: r.id ?? null,
          error_message: r.ok ? null : r.error ?? "send error",
          attempts: 1,
        }).eq("id", row.id);
        if (r.ok) {
          await logComm(row.lead_id, "email", lead.email, tpl.body(vars), tpl.subject, r.id ?? null, row.step_index);
          sent++;
        }
      } else if (row.channel === "sms") {
        const phone = lead.phone_normalized;
        const tplFn = SMS_TEMPLATES[row.step_index];
        if (!phone || !tplFn) {
          await s.from("lead_follow_up_schedule").update({ status: "skipped", error_message: "no phone/template" }).eq("id", row.id);
          skipped++; continue;
        }
        const { sendSmsInternal } = await import("@/lib/voicebot.functions");
        const r = await sendSmsInternal({ phone, body: tplFn(vars), source: `follow_up_sms_${row.step_index}` });
        await s.from("lead_follow_up_schedule").update({
          status: r.ok ? "sent" : "error",
          sent_at: r.ok ? new Date().toISOString() : null,
          external_id: r.sid ?? null,
          error_message: r.ok ? null : r.error ?? "send error",
          attempts: 1,
        }).eq("id", row.id);
        if (r.ok) sent++;
      } else if (row.channel === "call") {
        const phone = lead.phone_normalized;
        if (!phone) {
          await s.from("lead_follow_up_schedule").update({ status: "skipped", error_message: "no phone" }).eq("id", row.id);
          skipped++; continue;
        }
        const { placeOutboundCallInternal } = await import("@/lib/voicebot.functions");
        const r = await placeOutboundCallInternal({
          phone,
          source: `follow_up_call_${row.step_index}`,
          clientId: lead.client_id ?? null,
          loanApplicationId: lead.loan_application_id ?? null,
          firstName,
        });
        await s.from("lead_follow_up_schedule").update({
          status: r.ok ? "sent" : "error",
          sent_at: r.ok ? new Date().toISOString() : null,
          external_id: r.conversationId ?? r.callSid ?? null,
          error_message: r.ok ? null : r.error ?? "call error",
          attempts: 1,
        }).eq("id", row.id);
        if (r.ok) sent++;
      }
    } catch (e: any) {
      console.error("[follow-up-plan] process error", row, e?.message);
      await s.from("lead_follow_up_schedule").update({
        status: "error", error_message: e?.message ?? "exception", attempts: 1,
      }).eq("id", row.id);
    }
  }
  return { processed: due.length, sent, skipped };
}

function nextWindowOpenAt(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", weekday: "short", hour12: false,
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = get("hour");
  let y = get("year"), m = get("month"), d = get("day");
  let addDays = 0;
  if (wd === "Sat") addDays = 2;
  else if (wd === "Sun") addDays = 1;
  else if (hour >= 21) addDays = wd === "Fri" ? 3 : 1;
  let targetHour = 10;
  if (addDays === 0 && hour < 8) targetHour = 9;
  return warsawDateAt(y, m, d + addDays, targetHour);
}

async function fetchReturnLink(loanApplicationId: string): Promise<string | null> {
  const s = admin();
  const { data } = await s.from("loan_applications").select("return_link").eq("id", loanApplicationId).maybeSingle();
  return data?.return_link ?? null;
}

async function logComm(leadId: string, channel: "email" | "sms", to: string, body: string, subject: string | null, externalId: string | null, step: number) {
  try {
    const { logLeadCommunication } = await import("@/lib/lead-comms.server");
    await logLeadCommunication({
      leadId, channel: channel === "sms" ? "sms" : "email",
      direction: "outbound",
      email: channel === "email" ? to : null,
      content: body,
      subject,
      externalId,
      status: "sent",
      metadata: { follow_up_step: step, auto: true, source: "follow_up_plan" },
    });
  } catch (e) {
    console.error("[follow-up-plan] log error", e);
  }
}
