// Codzienny mailing przypominający z A/B-testem wariantów + uczeniem najlepszej godziny.
// Wywoływane wyłącznie z public hook (pg_cron, godzinowo).
import { createClient } from "@supabase/supabase-js";
import { computeLoanProgress } from "./loan-progress";
import { ELIGIBLE_STATUSES_FOR_REMINDERS } from "./loan-progress.server";
import { sendResendEmail } from "./resend-send.server";

function admin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

function warsawHour(now: Date = new Date()): number {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  return parseInt(p.find((x) => x.type === "hour")?.value ?? "0", 10);
}
function warsawWeekday(now: Date = new Date()): string {
  return (
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", weekday: "short" })
      .formatToParts(now)
      .find((x) => x.type === "weekday")?.value ?? ""
  );
}
function warsawDateKey(now: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return `${p.find((x) => x.type === "year")?.value}-${p.find((x) => x.type === "month")?.value}-${p.find((x) => x.type === "day")?.value}`;
}

function publicBaseUrl(): string {
  // Pierwszeństwo dla pełnej domeny produkcyjnej
  return process.env.PUBLIC_BASE_URL || process.env.SITE_URL || "https://financeyou.pl";
}

function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

function fmtPLN(n: number | null | undefined): string {
  if (!n || n <= 0) return "Twojej kwoty";
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 0,
  }).format(n);
}

function pickVariantEpsilonGreedy(
  variants: Array<{
    id: string;
    subject: string;
    preview_text: string | null;
    body_html: string;
    weight: number;
    sent_count: number;
    opened_count: number;
  }>,
): (typeof variants)[number] | null {
  if (variants.length === 0) return null;
  // 15% exploration: czysto losowy wariant ważony `weight`
  if (Math.random() < 0.15) {
    const totalW = variants.reduce((s, v) => s + Math.max(0.0001, Number(v.weight) || 1), 0);
    let r = Math.random() * totalW;
    for (const v of variants) {
      r -= Math.max(0.0001, Number(v.weight) || 1);
      if (r <= 0) return v;
    }
    return variants[variants.length - 1];
  }
  // 85% exploitation: smoothed open-rate (Laplace prior)
  const scored = variants.map((v) => ({
    v,
    score: (v.opened_count + 1) / (v.sent_count + 5),
  }));
  scored.sort((a, b) => b.score - a.score);
  // softmax wśród top-5, żeby nie utknąć na jednym
  const top = scored.slice(0, Math.min(5, scored.length));
  const max = top[0].score;
  const exps = top.map((t) => Math.exp((t.score - max) * 12));
  const sumE = exps.reduce((s, x) => s + x, 0);
  let r = Math.random() * sumE;
  for (let i = 0; i < top.length; i++) {
    r -= exps[i];
    if (r <= 0) return top[i].v;
  }
  return top[0].v;
}

export interface SendReminderResult {
  ok: boolean;
  sendId?: string;
  variantId?: string;
  error?: string;
  skipped?: string;
}

async function ensureReturnToken(loanId: string): Promise<string> {
  const s = admin();
  const { data } = await s
    .from("loan_applications")
    .select("return_link_token")
    .eq("id", loanId)
    .maybeSingle();
  if (data?.return_link_token) return data.return_link_token as string;
  const token =
    (globalThis.crypto as any)?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await s.from("loan_applications").update({ return_link_token: token }).eq("id", loanId);
  return token;
}

async function bumpPreferredHourFromOpens(loanId: string) {
  const s = admin();
  const { data: opens } = await s
    .from("loan_reminder_email_sends")
    .select("sent_hour_warsaw")
    .eq("loan_application_id", loanId)
    .not("opened_at", "is", null);
  if (!opens || opens.length < 3) return;
  const counts = new Map<number, number>();
  for (const o of opens) {
    const h = Number(o.sent_hour_warsaw);
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  let bestH = 10,
    bestC = -1;
  for (const [h, c] of counts.entries()) {
    if (c > bestC) {
      bestC = c;
      bestH = h;
    }
  }
  if (bestH < 6) bestH = 6;
  if (bestH > 23) bestH = 23;
  await s.from("loan_applications").update({ preferred_email_hour: bestH }).eq("id", loanId);
}

/** Główna procedura cron: znajduje odbiorców na bieżącą godzinę i wysyła. */
export async function runDailyReminderEmailsBatch(opts?: {
  force?: boolean;
  onlyLoanId?: string;
}): Promise<
  | {
      ok: true;
      hour: number;
      weekday: string;
      candidates: number;
      sent: number;
      errors: number;
      results: SendReminderResult[];
    }
  | { ok: false; skipped: string; hour: number; weekday: string }
> {
  const now = new Date();
  const hour = warsawHour(now);
  const weekday = warsawWeekday(now);
  const force = !!opts?.force;

  // Stałe okna wysyłki: ~8:00 i ~20:00 Warszawa, bez niedziel. `force` omija reguły.
  const ALLOWED_HOURS = new Set([8, 20]);
  if (!force) {
    if (weekday === "Sun") {
      return { ok: false, skipped: "sunday", hour, weekday };
    }
    if (!ALLOWED_HOURS.has(hour)) {
      return { ok: false, skipped: "outside_send_window", hour, weekday };
    }
  }

  const s = admin();
  const dayKey = warsawDateKey(now);
  const dayStartIso = new Date(`${dayKey}T00:00:00+02:00`).toISOString();

  // Advisory lock w aplikacji (sesja Supabase): zapobiega równoległym batchom w obrębie jednego node'a.
  // Twardą gwarancją braku duplikatów jest unique constraint (loan_application_id, variant_id).

  // Pełna sekwencja 150 maili (P1 = 1..60, dni 1..30 × 2/dzień; P2 = 61..150, co 2 dni o 8:00)
  const { data: variants } = await s
    .from("loan_reminder_email_variants")
    .select(
      "id,subject,preview_text,body_html,weight,sent_count,opened_count,sequence_index,phase,slot",
    )
    .eq("active", true)
    .not("sequence_index", "is", null)
    .order("sequence_index", { ascending: true });
  if (!variants || variants.length === 0) {
    return { ok: true, hour, weekday, candidates: 0, sent: 0, errors: 0, results: [] };
  }
  const variantBySeq = new Map<number, any>();
  for (const v of variants as any[]) variantBySeq.set(Number(v.sequence_index), v);
  // Liczba dostępnych szablonów w sekwencji (np. 120). Po jej przekroczeniu
  // sekwencja zawija się modulo, więc kontakt nigdy się nie kończy.
  const seqIndices = (variants as any[]).map((v) => Number(v.sequence_index)).sort((a, b) => a - b);
  const seqCount = seqIndices.length;
  /** Zwraca wariant dla n-tej wysyłki (1-indexed) z zawijaniem po całej puli. */
  const variantForSeq = (n: number): any => {
    if (seqCount === 0) return null;
    const pos = (((n - 1) % seqCount) + seqCount) % seqCount; // 0-based, bezpieczne dla n<=0
    return variantBySeq.get(seqIndices[pos]) ?? null;
  };

  let q = s
    .from("loan_applications")
    .select(
      `
      id, status, current_form_step, loan_amount, preferred_period_months,
      preferred_email_hour, reminder_email_count, reminder_email_unsubscribed,
      reminder_email_last_sent_at, return_link_token, created_at,
      client:clients!inner(id, first_name, last_name, email, phone_normalized, phone, do_not_email)
    `,
    )
    .in("status", ELIGIBLE_STATUSES_FOR_REMINDERS)
    .eq("reminder_email_unsubscribed", false)
    // BEZ górnego limitu wysłanych maili — sekwencja cyklu­je w nieskończoność
    // (patrz `variantForSeq` niżej), żeby nurture nigdy nie ucichł sam z siebie.
    .order("reminder_email_last_sent_at", { ascending: true, nullsFirst: true })
    .limit(12);

  if (opts?.onlyLoanId) q = q.eq("id", opts.onlyLoanId);
  const { data: loans } = await q;

  const candidates = (loans ?? []).filter(
    (l: any) => !!l.client?.email && l.client?.do_not_email !== true,
  );

  if (candidates.length === 0) {
    return { ok: true, hour, weekday, candidates: 0, sent: 0, errors: 0, results: [] };
  }

  // Limit 2 wysyłki dziennie na wniosek (chyba że `force`).
  const loanIds = candidates.map((l: any) => l.id);
  const { data: sentToday } = await s
    .from("loan_reminder_email_sends")
    .select("loan_application_id")
    .in("loan_application_id", loanIds)
    .gte("sent_at", dayStartIso);
  const todayCounts = new Map<string, number>();
  for (const r of sentToday ?? []) {
    const id = (r as any).loan_application_id as string;
    todayCounts.set(id, (todayCounts.get(id) ?? 0) + 1);
  }

  const baseUrl = publicBaseUrl();
  const results: SendReminderResult[] = [];
  let sent = 0,
    errors = 0;

  for (const loan of candidates as any[]) {
    const sentCount = Number(loan.reminder_email_count ?? 0);
    const nextSeq = sentCount + 1;

    // Faza 1: pierwsze 60 wysyłek — 2 razy dziennie (8 i 20) — intensywny start.
    // Faza 2: od 61. wysyłki w górę — raz dziennie o 8:00, co ~2 dni — spokojny,
    // nieskończony rytm podtrzymujący (treść cyklu­je przez `variantForSeq`).
    const inPhase2 = nextSeq > 60;
    if (!force) {
      if (inPhase2) {
        if (hour !== 8) {
          results.push({ ok: false, skipped: "p2_morning_only" });
          continue;
        }
        const lastIso: string | null = loan.reminder_email_last_sent_at ?? null;
        if (lastIso) {
          const ageHours = (Date.now() - new Date(lastIso).getTime()) / 3_600_000;
          if (ageHours < 40) {
            // ~co 2 dni z buforem
            results.push({ ok: false, skipped: "p2_too_soon" });
            continue;
          }
        }
      } else {
        if ((todayCounts.get(loan.id) ?? 0) >= 2) {
          results.push({ ok: false, skipped: "daily_limit_reached" });
          continue;
        }
      }
    }

    // Pobierz dane uzupełniające (property, documents) — postęp wniosku
    const [{ data: prop }, { data: docs }] = await Promise.all([
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
      client: {
        first_name: loan.client?.first_name ?? null,
        last_name: loan.client?.last_name ?? null,
        phone_normalized: loan.client?.phone_normalized ?? loan.client?.phone ?? null,
        email: loan.client?.email ?? null,
      },
      property: prop,
      documents: docs ?? [],
    });
    if (progress.is_complete) {
      // Wniosek kompletny — wyłącz autopilota dla tego klienta.
      results.push({ ok: false, skipped: "complete" });
      continue;
    }

    const variant = variantForSeq(nextSeq);
    if (!variant) {
      results.push({ ok: false, skipped: `no_variant_for_seq_${nextSeq}` });
      continue;
    }

    const token = await ensureReturnToken(loan.id);

    // Wstępny wpis żeby mieć ID do linków
    const { data: pending, error: insErr } = await s
      .from("loan_reminder_email_sends")
      .insert({
        loan_application_id: loan.id,
        variant_id: variant.id,
        recipient_email: loan.client.email,
        subject: "",
        sent_hour_warsaw: hour,
        sequence_number: nextSeq,
      })
      .select("id")
      .single();
    if (insErr || !pending) {
      // 23505 = unique_violation → ta n-ta wysyłka (loan, sequence_number) została
      // już wykonana przez równoległy tick. Wariant może się powtarzać (cykl), ale
      // konkretny numer w kolejce — nie.
      if ((insErr as any)?.code === "23505") {
        results.push({ ok: false, skipped: "duplicate_send_seq_for_loan" });
        continue;
      }
      errors++;
      results.push({ ok: false, error: insErr?.message ?? "insert failed" });
      continue;
    }

    const sendId = pending.id;
    const wniosekLink = `${baseUrl}/api/public/email/click?s=${sendId}`;
    const pixelUrl = `${baseUrl}/api/public/email/open?s=${sendId}`;
    const missing =
      progress.missing_documents.length > 0
        ? progress.missing_documents.join(", ")
        : progress.current_step <= 2
          ? "uzupełnienie danych kontaktowych"
          : "kilka informacji";

    const fname = (loan.client.first_name ?? "").trim();
    const vars = {
      first_name: fname || "Witaj",
      greeting: fname ? `Cześć ${fname}` : "Cześć",
      missing,
      link: wniosekLink,
      loan_amount: fmtPLN(loan.loan_amount),
    };
    const subject = renderTemplate(variant.subject, vars);
    const bodyInner = renderTemplate(variant.body_html, vars);
    const html = `<!doctype html><html><body data-fy-branded style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#111">
<a href="https://financeyou.pl" style="display:block;text-align:center;text-decoration:none"><img src="https://financeyou.pl/__l5e/assets-v1/73e2df85-6890-4ae6-a18a-debbc0970e07/favicon-mark.png" width="72" height="72" alt="FinanceYou" style="display:block;margin:0 auto 12px;border:0" /></a>
${bodyInner}
<p style="font-size:14px;color:#111;margin:24px 0 8px"><strong>Masz pytanie? Po prostu odpisz na tego maila.</strong></p>
<p style="font-size:13px;color:#444;margin:0 0 16px">Czytamy <strong>każdą wiadomość</strong> i odpowiadamy. Nie wiesz jakie dokumenty przygotować? Wahasz się przy kwocie? Coś w warunkach jest niejasne? Napisz wprost — pomożemy rozplątać każdą wątpliwość, nawet jeśli ostatecznie nie zdecydujesz się na pożyczkę.</p>
<p style="font-size:13px;color:#444;margin:0 0 20px">PS. Jeśli chcesz najpierw przypomnieć sobie, jak działa pożyczka pod zastaw nieruchomości — zajrzyj na <a href="https://financeyou.pl" style="color:#111">financeyou.pl</a> albo do <a href="https://financeyou.pl/blog" style="color:#111">naszego bloga</a>. Pokazujemy tam konkretne historie ludzi, którzy uwolnili kapitał ze swoich mieszkań i domów — i co z nim potem zrobili.</p>
<hr style="margin:24px 0;border:none;border-top:1px solid #eee"/>
<a href="https://financeyou.pl" style="display:block;text-align:center;text-decoration:none;margin:0 0 12px"><img src="https://financeyou.pl/__l5e/assets-v1/78c589be-8669-4bdf-a471-ff97875e8d7a/financeyou-wordmark.png" width="180" alt="financeyou.pl" style="display:block;margin:0 auto;border:0;max-width:60%;height:auto" /></a>
<p style="font-size:11px;color:#888;text-align:center;margin:0">Finance You — pożyczki pod zastaw nieruchomości. Otrzymujesz tę wiadomość bo złożyłeś wniosek na <a href="https://financeyou.pl" style="color:#888">financeyou.pl</a>. <a href="${baseUrl}/email/unsubscribe?s=${sendId}" style="color:#888">Wypisz mnie z przypomnień</a>.</p>
<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;border:0" />
</body></html>`;
    const text =
      bodyInner
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim() + `\n\nLink: ${wniosekLink}`;

    const res = await sendResendEmail({
      to: loan.client.email,
      subject,
      text,
      html,
      replyTo: "kontakt@app.financeyou.pl",
    });

    if (!res.ok) {
      errors++;
      await s
        .from("loan_reminder_email_sends")
        .update({
          subject,
          error_message: res.error?.slice(0, 500) ?? "unknown",
        })
        .eq("id", sendId);
      results.push({ ok: false, sendId, variantId: variant.id, error: res.error });
      continue;
    }

    sent++;
    await s
      .from("loan_reminder_email_sends")
      .update({
        subject,
        mg_message_id: res.id ?? null,
      })
      .eq("id", sendId);

    // Loguj wysyłkę do lead_communications (żeby licznik "maile" na liście klientów się zgadzał)
    try {
      const { logLeadCommunication } = await import("@/lib/lead-comms.server");
      await logLeadCommunication({
        loanApplicationId: loan.id,
        clientId: loan.client?.id ?? null,
        email: loan.client?.email ?? null,
        phoneNormalized: loan.client?.phone_normalized ?? null,
        channel: "email",
        direction: "outbound",
        status: "sent",
        subject,
        content: text,
        externalId: res.id ?? null,
        metadata: {
          source: "loan_reminder_sequence",
          variant_id: variant.id,
          send_id: sendId,
          sequence_index: nextSeq,
        },
      });
    } catch (e) {
      console.error("[loan-reminder-emails] log comm error", e);
    }

    // Inkrementuj statystyki wariantu (atomowo przez SQL — tu prosty UPDATE)
    await s.rpc("increment_email_variant_sent", { p_variant_id: variant.id }).then(
      () => {},
      async () => {
        await s
          .from("loan_reminder_email_variants")
          .update({
            sent_count: (variant.sent_count ?? 0) + 1,
          })
          .eq("id", variant.id);
      },
    );

    // Aktualizuj wniosek
    const newPrefHour = loan.preferred_email_hour ?? hour;
    const nowIso = new Date().toISOString();
    await s
      .from("loan_applications")
      .update({
        reminder_email_count: (loan.reminder_email_count ?? 0) + 1,
        reminder_email_first_sent_at: loan.reminder_email_count ? undefined : nowIso,
        reminder_email_last_sent_at: nowIso,
        preferred_email_hour: newPrefHour,
      })
      .eq("id", loan.id);

    results.push({ ok: true, sendId, variantId: variant.id });
  }

  return { ok: true, hour, weekday, candidates: candidates.length, sent, errors, results };
}

/** Wywoływane z route'a /api/public/email/open?s=ID */
export async function recordEmailOpen(sendId: string): Promise<void> {
  const s = admin();
  const { data: row } = await s
    .from("loan_reminder_email_sends")
    .select("id,opened_at,open_count,variant_id,loan_application_id")
    .eq("id", sendId)
    .maybeSingle();
  if (!row) return;
  await s
    .from("loan_reminder_email_sends")
    .update({
      opened_at: row.opened_at ?? new Date().toISOString(),
      open_count: (row.open_count ?? 0) + 1,
    })
    .eq("id", sendId);
  if (!row.opened_at && row.variant_id) {
    await s.rpc("increment_email_variant_opened", { p_variant_id: row.variant_id }).then(
      () => {},
      async () => {
        const { data: v } = await s
          .from("loan_reminder_email_variants")
          .select("opened_count")
          .eq("id", row.variant_id)
          .maybeSingle();
        if (v)
          await s
            .from("loan_reminder_email_variants")
            .update({ opened_count: (v.opened_count ?? 0) + 1 })
            .eq("id", row.variant_id);
      },
    );
  }
  if (row.loan_application_id) await bumpPreferredHourFromOpens(row.loan_application_id);
}

/** Wywoływane z route'a /api/public/email/click?s=ID — zwraca docelowy URL. */
export async function recordEmailClick(sendId: string): Promise<string | null> {
  const s = admin();
  const { data: row } = await s
    .from("loan_reminder_email_sends")
    .select("id,clicked_at,click_count,variant_id,loan_application_id,opened_at")
    .eq("id", sendId)
    .maybeSingle();
  if (!row) return null;
  const nowIso = new Date().toISOString();
  await s
    .from("loan_reminder_email_sends")
    .update({
      clicked_at: row.clicked_at ?? nowIso,
      click_count: (row.click_count ?? 0) + 1,
      opened_at: row.opened_at ?? nowIso,
    })
    .eq("id", sendId);
  if (!row.clicked_at && row.variant_id) {
    await s.rpc("increment_email_variant_clicked", { p_variant_id: row.variant_id }).then(
      () => {},
      async () => {
        const { data: v } = await s
          .from("loan_reminder_email_variants")
          .select("clicked_count")
          .eq("id", row.variant_id)
          .maybeSingle();
        if (v)
          await s
            .from("loan_reminder_email_variants")
            .update({ clicked_count: (v.clicked_count ?? 0) + 1 })
            .eq("id", row.variant_id);
      },
    );
  }

  // MAGIC LINK: klik w mailu auto-loguje klienta i wrzuca go prosto do panelu/wniosku
  // (/klient), zamiast lądować na stronie głównej. Link generujemy świeżo przy kliknięciu
  // (ważny ~1h). Fallback: financeyou.pl, jeśli nie uda się wygenerować.
  const fallback = "https://financeyou.pl";
  if (!row.loan_application_id) return fallback;
  try {
    const { data: loan } = await s
      .from("loan_applications")
      .select("client:clients!inner(email, first_name, last_name)")
      .eq("id", row.loan_application_id)
      .maybeSingle();
    const client: any = (loan as any)?.client;
    const email: string | null = client?.email ?? null;
    if (!email) return fallback;
    const { ensureKlientAccountAndMagicLink } = await import("@/lib/client-magic-link.server");
    const r = await ensureKlientAccountAndMagicLink(email, {
      firstName: client?.first_name ?? null,
      lastName: client?.last_name ?? null,
      source: "reminder_email",
      role: "klient",
    });
    return r.magicLink || fallback;
  } catch (e) {
    console.error("[loan-reminder-emails] magic link on click failed", e);
    return fallback;
  }
}
