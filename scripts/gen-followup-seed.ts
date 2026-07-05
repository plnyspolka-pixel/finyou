// Generator migracji seedującej stałą pulę szablonów follow-up (maile) do
// `loan_reminder_email_variants`. ŹRÓDŁO PRAWDY to `src/lib/follow-up-templates.ts`.
//
// Uruchom:  bun run scripts/gen-followup-seed.ts > supabase/migrations/<ts>_followup_templates_120.sql
//
// Migracja jest idempotentna i deklaratywna: kasuje poprzedni seed (po znaczniku
// `seed_tag`), wstawia aktualną pulę, ustawia harmonogram i indeksy potrzebne do
// cyklowania. Dzięki temu treści maili są „zapisane na stałe" w repo i w bazie.

import { EMAIL_FOLLOW_UPS } from "../src/lib/follow-up-templates";

const SEED_TAG = "followup_v2_2026";

function sql(s: string): string {
  return s.replace(/'/g, "''");
}

// Faza/slot/dzień dla numeru w sekwencji (spójne z logiką runDailyReminderEmailsBatch):
// 1..60 = faza P1 (dni 1..30, 2 sloty: rano/wieczór), 61+ = faza P2 (rano, co ~2 dni).
function meta(seq: number): { phase: string; slot: string; day: number } {
  if (seq <= 60) {
    const day = Math.ceil(seq / 2);
    const slot = seq % 2 === 1 ? "morning" : "evening";
    return { phase: "P1", slot, day };
  }
  const idx = seq - 60;
  return { phase: "P2", slot: "morning", day: 30 + idx * 2 };
}

const rows = EMAIL_FOLLOW_UPS.map((t, i) => {
  const seq = i + 1;
  const m = meta(seq);
  return `  ('${sql(t.subject)}', '${sql(t.preview)}', '${sql(t.body)}', 'followup', true, 1, ${seq}, ${m.day}, '${m.slot}', '${m.phase}', '${SEED_TAG}')`;
}).join(",\n");

const out = `-- === Stała pula ${EMAIL_FOLLOW_UPS.length} szablonów follow-up (maile) + porządek automatyzacji ===
-- WYGENEROWANE z src/lib/follow-up-templates.ts (scripts/gen-followup-seed.ts).
-- Nie edytuj ręcznie treści tutaj — zmień moduł i przegeneruj.

-- 1) Kolumna znacznika seeda (żeby móc czysto podmieniać pulę przy kolejnych wersjach).
ALTER TABLE public.loan_reminder_email_variants ADD COLUMN IF NOT EXISTS seed_tag text;

-- 2) Kolumna numeru kolejnego wysłania w sends — guard anty-duplikatowy przy CYKLOWANIU
--    (ten sam wariant może iść wielokrotnie, ale konkretny numer w kolejce tylko raz).
ALTER TABLE public.loan_reminder_email_sends ADD COLUMN IF NOT EXISTS sequence_number integer;

-- 3) Zdejmij starą, niekompatybilną z cyklowaniem blokadę unique(loan, variant).
ALTER TABLE public.loan_reminder_email_sends
  DROP CONSTRAINT IF EXISTS loan_reminder_email_sends_unique_loan_variant;

-- 4) Nowy guard: jedna wysyłka na (wniosek, numer w sekwencji).
CREATE UNIQUE INDEX IF NOT EXISTS lres_loan_seq_unique
  ON public.loan_reminder_email_sends(loan_application_id, sequence_number)
  WHERE sequence_number IS NOT NULL;

-- 5) Wyłącz WSZYSTKIE dotychczasowe warianty (m.in. stare „Przypomnienie N"),
--    a poprzedni seed tej wersji skasuj, żeby wstawić świeżą pulę bez duplikatów.
UPDATE public.loan_reminder_email_variants SET active = false;
DELETE FROM public.loan_reminder_email_variants WHERE seed_tag = '${SEED_TAG}';

-- 6) Wstaw aktualną, stałą pulę ${EMAIL_FOLLOW_UPS.length} szablonów (sequence_index 1..${EMAIL_FOLLOW_UPS.length}).
INSERT INTO public.loan_reminder_email_variants
  (subject, preview_text, body_html, category, active, weight, sequence_index, day_index, slot, phase, seed_tag)
VALUES
${rows};

-- 7) Włącz harmonogram maili (gdyby był wyłączony — częsta przyczyna „przestoju").
INSERT INTO public.reminder_email_schedule (id, enabled, cron_expression, timezone)
VALUES (1, true, '0 8,20 * * 1-6', 'Europe/Warsaw')
ON CONFLICT (id) DO UPDATE SET enabled = true;
`;

process.stdout.write(out);
