-- Dogonienie: obiekty z migracji w repo, które nigdy nie trafiły do produkcji Lovable
-- (kontrola 2026-10-10: schemat nowej bazy = produkcja; patrz docs/migracja-z-lovable.md,
-- „Historia migracji: repo vs produkcja”). Wszystko idempotentnie — można uruchomić wielokrotnie.
-- Treść instrukcji skopiowana 1:1 z plików źródłowych (podanych w nagłówkach sekcji).
-- Pominięte świadomie: investors.investors_partner_select (usunięta celowo przez zastosowaną migrację
-- 20260719123238_a785cdf2…), affiliate_commission_rules.rules_select_all i
-- affiliate_unregistered_activity_limits.limits_select_all (produkcja zastąpiła je politykami tylko dla
-- kadry: rules_staff_select/limits_staff_select), investor_module_access_active (0 użyć w kodzie;
-- produkcyjne investor_has_full_access/get_access_state jej nie wołają).

-- ── tabela rcn_transactions (z 20260718130001_rcn_transactions) ──
CREATE TABLE IF NOT EXISTS public.rcn_transactions (
  id             UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source         TEXT NOT NULL DEFAULT 'deweloperuch/rejestr-cen-nieruchomosci',
  city           TEXT,
  external_id    TEXT,
  property_kind  TEXT NOT NULL DEFAULT 'inne',
  lat            DOUBLE PRECISION NOT NULL,
  lng            DOUBLE PRECISION NOT NULL,
  tx_date        DATE,
  price_pln      NUMERIC,
  area_m2        NUMERIC,
  area_ha        NUMERIC,
  price_per_m2   NUMERIC,
  price_per_ha   NUMERIC,
  land_use       TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source, external_id)
);
ALTER TABLE public.rcn_transactions ENABLE ROW LEVEL SECURITY;

-- ── tabela comms_suppressions (z 20260730090000_bot_loop_guard) ──
CREATE TABLE IF NOT EXISTS public.comms_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL,
  identifier TEXT NOT NULL,
  reason TEXT NOT NULL,
  metadata JSONB,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (channel, identifier)
);
ALTER TABLE public.comms_suppressions ENABLE ROW LEVEL SECURITY;

-- ── tabela seo_location_pages (z 20260803150000_seo_location_pages) ──
CREATE TABLE IF NOT EXISTS public.seo_location_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  teryt text NOT NULL UNIQUE,
  geo_unit_id uuid REFERENCES public.geo_units(id) ON DELETE SET NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  meta_title text NOT NULL,
  meta_description text NOT NULL,
  content jsonb NOT NULL,
  content_hash text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.seo_location_pages ENABLE ROW LEVEL SECURITY;

-- ── tabela seo_location_report_entries (z 20260803153000_seo_location_report) ──
CREATE TABLE IF NOT EXISTS public.seo_location_report_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teryt text NOT NULL UNIQUE,
  name text NOT NULL,
  voivodeship text NOT NULL,
  rank integer NOT NULL,
  population integer,
  density_per_km2 numeric(10,2),
  population_within_25km integer NOT NULL DEFAULT 0,
  population_within_45km integer NOT NULL DEFAULT 0,
  attractiveness integer,
  fua_role text NOT NULL DEFAULT 'none' CHECK (fua_role IN ('core','commuting_zone','none')),
  data_version text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.seo_location_report_entries ENABLE ROW LEVEL SECURITY;

-- ── tabela pr_opportunities (z 20260803160000_pr_module) ──
CREATE TABLE IF NOT EXISTS public.pr_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,                     -- nazwa feedu/wydawcy
  url text NOT NULL,
  dedupe_hash text NOT NULL UNIQUE,         -- znormalizowany URL (pr/core.ts)
  topic text NOT NULL,                      -- tytuł artykułu / temat okazji
  snippet text,
  matched_phrases text[] NOT NULL DEFAULT '{}',
  article_published_at timestamptz,
  deadline timestamptz,                     -- opcjonalny termin (zapytania dziennikarzy)
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'drafted', 'approved', 'sent', 'rejected')),
  draft_subject text,
  draft_body text,
  draft_generated_at timestamptz,
  recipient_email text,                     -- uzupełnia człowiek w panelu
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pr_opportunities ENABLE ROW LEVEL SECURITY;

-- ── tabela pr_outreach_log (z 20260803160000_pr_module) ──
CREATE TABLE IF NOT EXISTS public.pr_outreach_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid REFERENCES public.pr_opportunities(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  body_text text NOT NULL,
  resend_id text,                           -- id z Resend (join dla webhooka)
  status text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'replied', 'failed')),
  error text,
  sent_by uuid,                             -- auth.uid() klikającego
  sent_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pr_outreach_log ENABLE ROW LEVEL SECURITY;

-- ── tabela video_pipeline (z 20260803170000_video_pipeline) ──
CREATE TABLE IF NOT EXISTS public.video_pipeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL DEFAULT 'blog'
    CHECK (source_type IN ('blog', 'location')),
  source_slug text NOT NULL,
  source_title text NOT NULL,
  source_url text NOT NULL,
  script_md text,
  yt_title_options text[] NOT NULL DEFAULT '{}',
  yt_title text,                                -- wybrany tytuł (człowiek/1. opcja)
  yt_description text,
  yt_tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'script_ready', 'rendering', 'rendered',
                      'publish_queued', 'published', 'failed')),
  render_provider text,                         -- np. 'heygen'
  render_video_id text,                         -- id zadania u dostawcy
  video_url text,                               -- URL gotowego MP4
  youtube_queue_id uuid REFERENCES public.youtube_publish_queue(id) ON DELETE SET NULL,
  youtube_video_id text,
  last_error text,
  created_by uuid,
  script_generated_at timestamptz,
  rendered_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_slug)
);
ALTER TABLE public.video_pipeline ENABLE ROW LEVEL SECURITY;

-- ── kolumna ai_seo_articles.youtube_video_id (z 20260803170000_video_pipeline) ──
ALTER TABLE public.ai_seo_articles
  ADD COLUMN IF NOT EXISTS youtube_video_id text;

-- ── kolumna seo_location_pages.youtube_video_id (z 20260803170000_video_pipeline) ──
ALTER TABLE public.seo_location_pages
  ADD COLUMN IF NOT EXISTS youtube_video_id text;

-- ── kolumna text_agent_knowledge.audience (z 20260804120000_institutional_investor_bot) ──
ALTER TABLE public.text_agent_knowledge
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'klient'
  CHECK (audience IN ('klient', 'inwestor', 'wspolna'));

-- ── indeks access_payments_unlock_one_in_flight (z 20260925121000_access_payments_unlock_inflight) ──
create unique index if not exists access_payments_unlock_one_in_flight
  on public.access_payments (unlock_match_id)
  where unlock_match_id is not null and status in ('created', 'pending');

-- ── indeks idx_call_queue_conversation (z 20260925130000_dogonienie_cennika_i_indeksy_timeoutow) ──
create index if not exists idx_call_queue_conversation
  on public.call_queue (conversation_id)
  where conversation_id is not null;

-- ── indeks idx_call_queue_created (z 20260925130000_dogonienie_cennika_i_indeksy_timeoutow) ──
create index if not exists idx_call_queue_created
  on public.call_queue (created_at desc);

-- ── indeks idx_call_queue_phone_created (z 20260925130000_dogonienie_cennika_i_indeksy_timeoutow) ──
create index if not exists idx_call_queue_phone_created
  on public.call_queue (phone_normalized, created_at desc);

-- ── indeks idx_comms_suppressions_lookup (z 20260730090000_bot_loop_guard) ──
CREATE INDEX IF NOT EXISTS idx_comms_suppressions_lookup
  ON public.comms_suppressions (channel, identifier);

-- ── indeks idx_leadcomm_channel_direction_created (z 20260925130000_dogonienie_cennika_i_indeksy_timeoutow) ──
create index if not exists idx_leadcomm_channel_direction_created
  on public.lead_communications (channel, direction, created_at desc);

-- ── indeks idx_leadcomm_created_by (z 20260925130000_dogonienie_cennika_i_indeksy_timeoutow) ──
create index if not exists idx_leadcomm_created_by
  on public.lead_communications (created_by, created_at desc)
  where created_by is not null;

-- ── indeks idx_leadcomm_email_trgm (z 20260925130000_dogonienie_cennika_i_indeksy_timeoutow) ──
create index if not exists idx_leadcomm_email_trgm
  on public.lead_communications using gin (email extensions.gin_trgm_ops);

-- ── indeks idx_leadcomm_with_attachments (z 20260925130000_dogonienie_cennika_i_indeksy_timeoutow) ──
create index if not exists idx_leadcomm_with_attachments
  on public.lead_communications (lead_id, id)
  where attachments is not null and attachments <> '[]'::jsonb;

-- ── indeks idx_pr_opportunities_status (z 20260803160000_pr_module) ──
CREATE INDEX IF NOT EXISTS idx_pr_opportunities_status
  ON public.pr_opportunities (status, created_at DESC);

-- ── indeks idx_pr_outreach_log_opportunity (z 20260803160000_pr_module) ──
CREATE INDEX IF NOT EXISTS idx_pr_outreach_log_opportunity
  ON public.pr_outreach_log (opportunity_id, sent_at DESC);

-- ── indeks idx_pr_outreach_log_resend (z 20260803160000_pr_module) ──
CREATE INDEX IF NOT EXISTS idx_pr_outreach_log_resend
  ON public.pr_outreach_log (resend_id);

-- ── indeks idx_seo_loc_pages_status (z 20260803150000_seo_location_pages) ──
CREATE INDEX IF NOT EXISTS idx_seo_loc_pages_status
  ON public.seo_location_pages (status, generated_at);

-- ── indeks idx_seo_loc_report_rank (z 20260803153000_seo_location_report) ──
CREATE INDEX IF NOT EXISTS idx_seo_loc_report_rank
  ON public.seo_location_report_entries (rank);

-- ── indeks idx_video_pipeline_status (z 20260803170000_video_pipeline) ──
CREATE INDEX IF NOT EXISTS idx_video_pipeline_status
  ON public.video_pipeline (status, created_at DESC);

-- ── indeks investor_assistant_messages_user_idx (z 20260804130000_investor_assistant_split) ──
CREATE INDEX IF NOT EXISTS investor_assistant_messages_user_idx
  ON public.investor_assistant_messages (user_id, created_at);

-- ── indeks rcn_tx_date_idx (z 20260718130001_rcn_transactions) ──
CREATE INDEX IF NOT EXISTS rcn_tx_date_idx ON public.rcn_transactions (tx_date);

-- ── indeks rcn_tx_kind_idx (z 20260718130001_rcn_transactions) ──
CREATE INDEX IF NOT EXISTS rcn_tx_kind_idx ON public.rcn_transactions (property_kind);

-- ── indeks rcn_tx_lat_idx (z 20260718130001_rcn_transactions) ──
CREATE INDEX IF NOT EXISTS rcn_tx_lat_idx  ON public.rcn_transactions (lat);

-- ── indeks rcn_tx_lng_idx (z 20260718130001_rcn_transactions) ──
CREATE INDEX IF NOT EXISTS rcn_tx_lng_idx  ON public.rcn_transactions (lng);

-- ── polityka pr_opportunities.pr_opportunities_staff_read (z 20260803160000_pr_module) ──
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE c.relnamespace = 'public'::regnamespace AND c.relname = 'pr_opportunities' AND p.polname = 'pr_opportunities_staff_read') THEN
    EXECUTE 'CREATE POLICY pr_opportunities_staff_read ON public.pr_opportunities
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), ''administrator''::public.app_role)
    OR public.has_role(auth.uid(), ''operator''::public.app_role)
  )';
  END IF;
END $do$;

-- ── polityka pr_outreach_log.pr_outreach_log_staff_read (z 20260803160000_pr_module) ──
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE c.relnamespace = 'public'::regnamespace AND c.relname = 'pr_outreach_log' AND p.polname = 'pr_outreach_log_staff_read') THEN
    EXECUTE 'CREATE POLICY pr_outreach_log_staff_read ON public.pr_outreach_log
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), ''administrator''::public.app_role)
    OR public.has_role(auth.uid(), ''operator''::public.app_role)
  )';
  END IF;
END $do$;

-- ── polityka rcn_transactions.rcn_tx_staff_all (z 20260718130001_rcn_transactions) ──
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE c.relnamespace = 'public'::regnamespace AND c.relname = 'rcn_transactions' AND p.polname = 'rcn_tx_staff_all') THEN
    EXECUTE 'CREATE POLICY rcn_tx_staff_all ON public.rcn_transactions FOR ALL TO authenticated
  USING (has_role(auth.uid(),''administrator''::app_role) OR has_role(auth.uid(),''operator''::app_role))
  WITH CHECK (has_role(auth.uid(),''administrator''::app_role) OR has_role(auth.uid(),''operator''::app_role))';
  END IF;
END $do$;

-- ── polityka seo_location_pages.seo_loc_pages_public_read (z 20260803150000_seo_location_pages) ──
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE c.relnamespace = 'public'::regnamespace AND c.relname = 'seo_location_pages' AND p.polname = 'seo_loc_pages_public_read') THEN
    EXECUTE 'CREATE POLICY seo_loc_pages_public_read ON public.seo_location_pages
  FOR SELECT TO anon, authenticated
  USING (status = ''published'')';
  END IF;
END $do$;

-- ── polityka seo_location_pages.seo_loc_pages_staff_read (z 20260803150000_seo_location_pages) ──
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE c.relnamespace = 'public'::regnamespace AND c.relname = 'seo_location_pages' AND p.polname = 'seo_loc_pages_staff_read') THEN
    EXECUTE 'CREATE POLICY seo_loc_pages_staff_read ON public.seo_location_pages
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), ''administrator''::public.app_role)
    OR public.has_role(auth.uid(), ''operator''::public.app_role)
  )';
  END IF;
END $do$;

-- ── polityka seo_location_report_entries.seo_loc_report_public_read (z 20260803153000_seo_location_report) ──
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE c.relnamespace = 'public'::regnamespace AND c.relname = 'seo_location_report_entries' AND p.polname = 'seo_loc_report_public_read') THEN
    EXECUTE 'CREATE POLICY seo_loc_report_public_read ON public.seo_location_report_entries
  FOR SELECT TO anon, authenticated
  USING (true)';
  END IF;
END $do$;

-- ── polityka video_pipeline.video_pipeline_staff_read (z 20260803170000_video_pipeline) ──
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid WHERE c.relnamespace = 'public'::regnamespace AND c.relname = 'video_pipeline' AND p.polname = 'video_pipeline_staff_read') THEN
    EXECUTE 'CREATE POLICY video_pipeline_staff_read ON public.video_pipeline
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), ''administrator''::public.app_role)
    OR public.has_role(auth.uid(), ''operator''::public.app_role)
  )';
  END IF;
END $do$;

-- ── funkcja delete_email (z 20260519203350_email_infra) (wrapper kolejki pgmq; kod woła przez rpc — w produkcji brak, więc ścieżka nie działała) ──
CREATE OR REPLACE FUNCTION public.delete_email(queue_name TEXT, message_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$$;

-- ── funkcja enqueue_email (z 20260519203350_email_infra) (wrapper kolejki pgmq; kod woła przez rpc — w produkcji brak, więc ścieżka nie działała) ──
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name TEXT, payload JSONB)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$$;

-- ── funkcja move_to_dlq (z 20260519203350_email_infra) (wrapper kolejki pgmq; kod woła przez rpc — w produkcji brak, więc ścieżka nie działała) ──
CREATE OR REPLACE FUNCTION public.move_to_dlq(
  source_queue TEXT, dlq_name TEXT, message_id BIGINT, payload JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$$;

-- ── funkcja read_email_batch (z 20260519203350_email_infra) (wrapper kolejki pgmq; kod woła przez rpc — w produkcji brak, więc ścieżka nie działała) ──
CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name TEXT, batch_size INT, vt INT)
RETURNS TABLE(msg_id BIGINT, read_ct INT, message JSONB)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$$;

-- ── triggery updated_at (1:1 z plików źródłowych; set_updated_at() istnieje) ──
DO $do$ BEGIN
  CREATE TRIGGER trg_seo_loc_pages_touch_updated_at BEFORE UPDATE ON public.seo_location_pages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE TRIGGER trg_seo_loc_report_touch_updated_at BEFORE UPDATE ON public.seo_location_report_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE TRIGGER trg_pr_opportunities_touch_updated_at BEFORE UPDATE ON public.pr_opportunities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE TRIGGER trg_pr_outreach_log_touch_updated_at BEFORE UPDATE ON public.pr_outreach_log FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE TRIGGER trg_video_pipeline_touch_updated_at BEFORE UPDATE ON public.video_pipeline FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- ── granty (1:1 z plików źródłowych). UWAGA: w nowym projekcie automatyczne wystawianie nowych tabel
-- jest WYŁĄCZONE (default privileges dają rolom API tylko TRUNCATE/REFERENCES/TRIGGER/MAINTAIN),
-- więc każda migracja tworząca tabelę MUSI nadać granty jawnie — inaczej PostgREST zwraca 42501. ──
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rcn_transactions TO authenticated;
GRANT ALL ON public.rcn_transactions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comms_suppressions TO authenticated;
GRANT ALL ON public.comms_suppressions TO service_role;
GRANT SELECT ON public.seo_location_pages TO anon, authenticated;
GRANT ALL ON public.seo_location_pages TO service_role;
GRANT SELECT ON public.seo_location_report_entries TO anon, authenticated;
GRANT ALL ON public.seo_location_report_entries TO service_role;
GRANT SELECT ON public.pr_opportunities TO authenticated;
GRANT SELECT ON public.pr_outreach_log TO authenticated;
GRANT ALL ON public.pr_opportunities TO service_role;
GRANT ALL ON public.pr_outreach_log TO service_role;
GRANT SELECT ON public.video_pipeline TO authenticated;
GRANT ALL ON public.video_pipeline TO service_role;

-- ── wrappery pgmq: tylko service_role (jak w email_infra), search_path przypięty ──
ALTER FUNCTION public.enqueue_email(TEXT, JSONB) SET search_path = '';
ALTER FUNCTION public.read_email_batch(TEXT, INT, INT) SET search_path = '';
ALTER FUNCTION public.delete_email(TEXT, BIGINT) SET search_path = '';
ALTER FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) SET search_path = '';
REVOKE EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(TEXT, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) TO service_role;
