
-- 1. Normalizacja telefonów na kliencie
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS phone_raw text,
  ADD COLUMN IF NOT EXISTS phone_normalized text,
  ADD COLUMN IF NOT EXISTS phone_valid boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_clients_phone_normalized ON public.clients(phone_normalized);

-- 2. Kolejka rozmów voicebota (ElevenLabs)
CREATE TABLE IF NOT EXISTS public.call_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  loan_application_id uuid REFERENCES public.loan_applications(id) ON DELETE SET NULL,
  phone_normalized text NOT NULL,
  agent_id text,
  status text NOT NULL DEFAULT 'oczekuje', -- oczekuje, w_trakcie, zakonczona, blad, anulowana
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  result_summary text,
  transcript text,
  raw_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.call_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "call_queue_staff_all" ON public.call_queue FOR ALL TO authenticated
  USING (has_role(auth.uid(),'administrator') OR has_role(auth.uid(),'operator'))
  WITH CHECK (has_role(auth.uid(),'administrator') OR has_role(auth.uid(),'operator'));
CREATE TRIGGER call_queue_updated BEFORE UPDATE ON public.call_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Szkolenia (Akademia inwestora)
CREATE TABLE IF NOT EXISTS public.training_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text,
  file_path text,           -- ścieżka w bucket training-videos
  external_url text,        -- alternatywnie link YouTube/Vimeo
  thumbnail_url text,
  duration_seconds int,
  is_published boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.training_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "training_admin_all" ON public.training_videos FOR ALL TO authenticated
  USING (has_role(auth.uid(),'administrator')) WITH CHECK (has_role(auth.uid(),'administrator'));
CREATE POLICY "training_viewers_select" ON public.training_videos FOR SELECT TO authenticated
  USING (is_published = true AND (has_role(auth.uid(),'inwestor') OR has_role(auth.uid(),'operator') OR has_role(auth.uid(),'administrator')));
CREATE TRIGGER training_videos_updated BEFORE UPDATE ON public.training_videos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Czat klient-inwestor z moderacją AI
CREATE TABLE IF NOT EXISTS public.chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id uuid NOT NULL REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  investor_id uuid NOT NULL REFERENCES public.investors(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'aktywny',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loan_application_id, investor_id)
);
ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_threads_staff_all" ON public.chat_threads FOR ALL TO authenticated
  USING (has_role(auth.uid(),'administrator') OR has_role(auth.uid(),'operator'))
  WITH CHECK (has_role(auth.uid(),'administrator') OR has_role(auth.uid(),'operator'));
CREATE POLICY "chat_threads_investor" ON public.chat_threads FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.investors i WHERE i.id = investor_id AND i.user_id = auth.uid()));
CREATE POLICY "chat_threads_client" ON public.chat_threads FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  sender_role text NOT NULL, -- 'klient', 'inwestor', 'system'
  sender_user_id uuid,
  body text NOT NULL,
  body_filtered text,        -- wersja po moderacji (PII zamaskowane)
  moderation_flags jsonb DEFAULT '[]'::jsonb, -- np. ['phone','email']
  blocked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON public.chat_messages(thread_id, created_at);
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_msg_staff_all" ON public.chat_messages FOR ALL TO authenticated
  USING (has_role(auth.uid(),'administrator') OR has_role(auth.uid(),'operator'))
  WITH CHECK (has_role(auth.uid(),'administrator') OR has_role(auth.uid(),'operator'));
CREATE POLICY "chat_msg_thread_participant_select" ON public.chat_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.chat_threads t
    LEFT JOIN public.investors i ON i.id = t.investor_id
    LEFT JOIN public.clients c ON c.id = t.client_id
    WHERE t.id = thread_id AND (i.user_id = auth.uid() OR c.user_id = auth.uid())
  ));
CREATE POLICY "chat_msg_thread_participant_insert" ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.chat_threads t
    LEFT JOIN public.investors i ON i.id = t.investor_id
    LEFT JOIN public.clients c ON c.id = t.client_id
    WHERE t.id = thread_id AND (i.user_id = auth.uid() OR c.user_id = auth.uid())
  ));

-- 5. Storage buckets: training-videos (publiczny dla wygody), property-photos (publiczny)
INSERT INTO storage.buckets (id, name, public) VALUES ('training-videos','training-videos', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('property-photos','property-photos', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "training_videos_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'training-videos');
CREATE POLICY "training_videos_admin_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'training-videos' AND has_role(auth.uid(),'administrator'));
CREATE POLICY "training_videos_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'training-videos' AND has_role(auth.uid(),'administrator'));
CREATE POLICY "training_videos_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'training-videos' AND has_role(auth.uid(),'administrator'));

CREATE POLICY "property_photos_public_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'property-photos');
CREATE POLICY "property_photos_authenticated_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'property-photos');

-- 6. Counter-offer / oferta zwrotna inwestora
ALTER TABLE public.investor_offers
  ADD COLUMN IF NOT EXISTS counter_offer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS counter_to_offer_id uuid REFERENCES public.investor_offers(id) ON DELETE SET NULL;

-- 7. Voicebot agent na poziomie loan_application (po wstępnej kwalifikacji)
ALTER TABLE public.loan_applications
  ADD COLUMN IF NOT EXISTS investor_interest_count int NOT NULL DEFAULT 0;
