-- Moduł „Follow-up braków" — piąty silnik follow-up.
--
-- Cel: celowane dopytywanie klientów z NIEKOMPLETNYM wnioskiem lub wnioskiem
-- DO KOREKTY o konkretne braki: podstawowe dane (kwota, KW, zdjęcia/dokumenty),
-- brakujące dokumenty wg typu nieruchomości oraz otwarte pytania z analizy KW
-- (m.in. wysokość długu na hipotece z działu IV i zgody wszystkich
-- współwłaścicieli z działu II). Kanały: e-mail, SMS, Messenger/Instagram.
--
-- Źródło prawdy dla logiki (brief, kadencja, dobór kanału) jest w TS:
--   src/lib/missing-info-follow-up/ (brief.ts, templates.ts, engine.server.ts).
-- Tu tylko persystencja stanu + log wysyłek + cron tick.
--
-- Relacja do innych silników:
--   * `nowy_lead` i `brak_kontaktu` celowo POZA modułem — obsługuje je nurture
--     „Ania" (lead_follow_up_schedule) i drip 120 szablonów (loan_reminder_*).
--   * Kanał Messenger idzie przez istniejącą kolejkę messenger_outbox.

-- ── Stan follow-upu per wniosek ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.missing_info_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id uuid NOT NULL UNIQUE
    REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  -- active   → w kolejce, wysyłamy wg kadencji
  -- complete → brief pusty (nic już nie brakuje)
  -- stopped  → wyczerpane próby lub ręczne zatrzymanie
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'complete', 'stopped')),
  paused boolean NOT NULL DEFAULT false,
  -- Ostatnio policzony brief (lista braków/pytań) + hash zestawu kluczy.
  brief_json jsonb NOT NULL DEFAULT '{"items":[]}'::jsonb,
  brief_hash text,
  attempt_count integer NOT NULL DEFAULT 0,
  last_channel text,
  last_sent_at timestamptz,
  next_send_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mifu_due
  ON public.missing_info_follow_ups (next_send_at)
  WHERE status = 'active' AND paused = false;

-- ── Log wysyłek (audyt + anty-duplikacja + link wypisu z maili) ──────────────
CREATE TABLE IF NOT EXISTS public.missing_info_follow_up_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follow_up_id uuid NOT NULL
    REFERENCES public.missing_info_follow_ups(id) ON DELETE CASCADE,
  loan_application_id uuid NOT NULL
    REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'messenger')),
  attempt_number integer NOT NULL,
  subject text,
  content text,
  -- Snapshot briefu w chwili wysyłki — co dokładnie dopytaliśmy.
  brief_json jsonb NOT NULL DEFAULT '{"items":[]}'::jsonb,
  status text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('queued', 'sent', 'error', 'skipped')),
  error_message text,
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mifu_sends_loan
  ON public.missing_info_follow_up_sends (loan_application_id, created_at DESC);

-- ── updated_at ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  CREATE TRIGGER trg_mifu_touch_updated_at
    BEFORE UPDATE ON public.missing_info_follow_ups
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── RLS: odczyt + pauza dla administratora/operatora; wysyłki robi wyłącznie
--    service_role (silnik cron), więc INSERT nie ma polityk. ─────────────────
ALTER TABLE public.missing_info_follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missing_info_follow_up_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY mifu_read ON public.missing_info_follow_ups
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
  );

CREATE POLICY mifu_update ON public.missing_info_follow_ups
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
  );

CREATE POLICY mifu_sends_read ON public.missing_info_follow_up_sends
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrator'::public.app_role)
    OR public.has_role(auth.uid(), 'operator'::public.app_role)
  );

GRANT SELECT, UPDATE ON public.missing_info_follow_ups TO authenticated;
GRANT SELECT ON public.missing_info_follow_up_sends TO authenticated;
GRANT ALL ON public.missing_info_follow_ups TO service_role;
GRANT ALL ON public.missing_info_follow_up_sends TO service_role;

COMMENT ON TABLE public.missing_info_follow_ups IS
  'Follow-up braków: stan celowanego dopytywania klienta o braki wniosku (kadencja, kanały, brief).';
COMMENT ON TABLE public.missing_info_follow_up_sends IS
  'Follow-up braków: log wysyłek per kanał ze snapshotem briefu (audyt, wypis z maili).';

-- ── Cron tick (pg_cron → endpoint; endpoint sam pilnuje okien godzinowych) ───
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
BEGIN
  FOR job IN SELECT jobname FROM cron.job WHERE jobname = 'missing-info-follow-up-tick' LOOP
    PERFORM cron.unschedule(job.jobname);
  END LOOP;

  -- Co 30 minut; endpoint no-opuje poza oknem 7:00–21:00 pon–sob (Warszawa).
  PERFORM cron.schedule('missing-info-follow-up-tick', '*/30 * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/missing-info-follow-up-tick', hdrs));
END $$;
