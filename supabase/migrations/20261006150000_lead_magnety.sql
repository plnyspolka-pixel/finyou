-- Lead magnety: materiał do pobrania (przewodnik PDF, checklista, kalkulator)
-- w zamian za zapis na listę mailingową — osobno dla klienta pożyczkowego
-- i dla inwestora. Do tego automat social: komentarz pod powiązanym postem
-- (Facebook / Instagram / YouTube) z hasłem → odpowiedź z linkiem do strony
-- /pobierz/<slug>, na której komentujący zostawia e-mail i dostaje plik.
--
-- Logika w TS: src/lib/lead-magnets/* (core = czysta logika, server = mail,
-- pobranie, odpowiedzi na komentarze, tick YouTube), panel
-- /admin/marketing/lead-magnety, strona publiczna /pobierz/<slug>,
-- pobranie pliku /pobierz-plik/<token>, tick /api/public/hooks/lead-magnet-tick.

-- ── Lead magnety ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_magnets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  -- Dla kogo: klient pożyczkowy albo inwestor (tag subskrybenta, treść strony).
  audience text NOT NULL CHECK (audience IN ('klient', 'inwestor')),
  headline text NOT NULL,
  subheadline text,
  -- Lista „co jest w środku" na stronie pobrania.
  benefits text[] NOT NULL DEFAULT '{}',
  cta_text text NOT NULL DEFAULT 'Wyślij mi materiał',
  cover_image_url text,
  og_image_url text,
  meta_description text,
  -- Plik w prywatnym buckecie `lead-magnets` (podpisany link przy pobraniu)
  -- ALBO zewnętrzny adres (np. Google Drive / YouTube).
  file_path text,
  file_url text,
  file_name text,
  file_size bigint,
  mime_type text,
  thank_you_message text NOT NULL
    DEFAULT 'Dziękujemy! Link do materiału wysłaliśmy też na Twój e-mail.',
  -- Czy po zapisie pokazać przycisk pobrania od razu (poza mailem).
  instant_download boolean NOT NULL DEFAULT true,
  -- Mail z linkiem: {imie}, {tytul}, {link}, {strona}.
  email_subject text NOT NULL DEFAULT 'Twój materiał od Finance You: {tytul}',
  email_body text NOT NULL DEFAULT E'Cześć {imie}!\n\nDziękujemy za zainteresowanie. Twój materiał „{tytul}” czeka tutaj:\n{link}\n\nJeśli ktoś z Twoich znajomych też chce go dostać, podeślij mu stronę {strona}.\n\nPozdrawiamy,\nzespół Finance You',
  -- Dodatkowe tagi subskrybenta (poza automatycznymi: lead-magnet, <audience>, lead-magnet:<slug>).
  subscriber_tags text[] NOT NULL DEFAULT '{}',
  -- Czy zapis ma też tworzyć leada w CRM (domyślnie nie — to zimny kontakt).
  create_crm_lead boolean NOT NULL DEFAULT false,
  -- Automat social: hasła w komentarzu (np. PRZEWODNIK, PDF). Puste = każdy
  -- komentarz pod powiązanym postem.
  trigger_keywords text[] NOT NULL DEFAULT '{}',
  -- Reaguj na hasło także pod postami, które nie są powiązane (wymaga haseł).
  match_any_post boolean NOT NULL DEFAULT false,
  -- Szablony odpowiedzi: {imie}, {tytul}, {link}.
  reply_public_template text NOT NULL
    DEFAULT 'Cześć {imie}! Napisaliśmy do Ciebie w wiadomości prywatnej 👋',
  reply_private_template text NOT NULL
    DEFAULT E'Cześć {imie}! Oto link do materiału „{tytul}”: {link}\nWpisz tam swój e-mail, a plik od razu wyląduje w Twojej skrzynce.',
  -- Publiczna odpowiedź z linkiem: YouTube (brak DM) i gdy wiadomość prywatna się nie uda.
  reply_fallback_template text NOT NULL
    DEFAULT 'Cześć {imie}! Link do materiału „{tytul}”: {link}',
  published boolean NOT NULL DEFAULT false,
  view_count integer NOT NULL DEFAULT 0,
  signup_count integer NOT NULL DEFAULT 0,
  download_count integer NOT NULL DEFAULT 0,
  -- Dopasowane komentarze (odpowiedź z linkiem wysłana albo próbowana).
  trigger_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_magnets_published
  ON public.lead_magnets (slug) WHERE published = true;

-- ── Powiązane posty (jeden post promuje jeden lead magnet) ──────────────────
CREATE TABLE IF NOT EXISTS public.lead_magnet_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_magnet_id uuid NOT NULL REFERENCES public.lead_magnets(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('facebook', 'instagram', 'youtube')),
  -- FB: id posta strony (np. 1234_5678), IG: id mediów, YouTube: id filmu.
  external_post_id text NOT NULL,
  label text,
  post_url text,
  linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_post_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_magnet_posts_magnet
  ON public.lead_magnet_posts (lead_magnet_id);

-- ── Zapisy (e-mail w zamian za materiał) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_magnet_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_magnet_id uuid NOT NULL REFERENCES public.lead_magnets(id) ON DELETE CASCADE,
  email text NOT NULL,
  first_name text,
  consent boolean NOT NULL DEFAULT true,
  consent_text text,
  -- Skąd przyszedł: page | facebook | instagram | youtube | direct.
  source text,
  -- Np. id komentarza, z którego poszedł link.
  source_ref text,
  utm jsonb,
  -- Osobisty token pobrania: /pobierz-plik/<token>.
  download_token text NOT NULL UNIQUE,
  download_count integer NOT NULL DEFAULT 0,
  first_downloaded_at timestamptz,
  last_downloaded_at timestamptz,
  email_sent_at timestamptz,
  email_error text,
  subscriber_id uuid REFERENCES public.email_subscribers(id) ON DELETE SET NULL,
  lead_id uuid,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_magnet_id, email)
);

CREATE INDEX IF NOT EXISTS idx_lead_magnet_signups_magnet
  ON public.lead_magnet_signups (lead_magnet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_magnet_signups_email
  ON public.lead_magnet_signups (email);

-- ── Zdarzenia social (komentarze, reakcje) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_magnet_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_magnet_id uuid NOT NULL REFERENCES public.lead_magnets(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('facebook', 'instagram', 'youtube')),
  kind text NOT NULL DEFAULT 'comment' CHECK (kind IN ('comment', 'reaction')),
  external_post_id text,
  external_comment_id text,
  author_id text,
  author_name text,
  comment_text text,
  -- Czy komentarz pasował (hasło / powiązany post) i poszła odpowiedź z linkiem.
  matched boolean NOT NULL DEFAULT false,
  reply_status text NOT NULL DEFAULT 'skipped'
    CHECK (reply_status IN ('sent_private', 'sent_public', 'sent_both', 'failed', 'skipped', 'not_possible')),
  reply_error text,
  lead_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Jeden komentarz obsługujemy raz (webhook Meta potrafi dostarczyć zdarzenie
-- dwa razy, tick YouTube czyta te same wątki co 10 minut).
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_magnet_triggers_comment
  ON public.lead_magnet_triggers (platform, external_comment_id)
  WHERE external_comment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_magnet_triggers_magnet
  ON public.lead_magnet_triggers (lead_magnet_id, created_at DESC);

-- ── Liczniki na lead magnecie ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lead_magnet_count_signup()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.lead_magnets SET signup_count = signup_count + 1 WHERE id = NEW.lead_magnet_id;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.lead_magnet_count_download()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.download_count > OLD.download_count THEN
    UPDATE public.lead_magnets
      SET download_count = download_count + (NEW.download_count - OLD.download_count)
      WHERE id = NEW.lead_magnet_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.lead_magnet_count_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.matched THEN
    UPDATE public.lead_magnets SET trigger_count = trigger_count + 1 WHERE id = NEW.lead_magnet_id;
  END IF;
  RETURN NEW;
END; $$;

-- Wejścia na stronę: wywoływane rolą serwisową z getPublicLeadMagnet.
CREATE OR REPLACE FUNCTION public.lead_magnet_increment_views(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.lead_magnets SET view_count = view_count + 1 WHERE id = p_id;
$$;
REVOKE ALL ON FUNCTION public.lead_magnet_increment_views(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lead_magnet_increment_views(uuid) TO service_role;

DROP TRIGGER IF EXISTS trg_lead_magnets_updated_at ON public.lead_magnets;
CREATE TRIGGER trg_lead_magnets_updated_at
  BEFORE UPDATE ON public.lead_magnets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_lead_magnet_signups_updated_at ON public.lead_magnet_signups;
CREATE TRIGGER trg_lead_magnet_signups_updated_at
  BEFORE UPDATE ON public.lead_magnet_signups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_lead_magnet_signups_count ON public.lead_magnet_signups;
CREATE TRIGGER trg_lead_magnet_signups_count
  AFTER INSERT ON public.lead_magnet_signups
  FOR EACH ROW EXECUTE FUNCTION public.lead_magnet_count_signup();

DROP TRIGGER IF EXISTS trg_lead_magnet_signups_download ON public.lead_magnet_signups;
CREATE TRIGGER trg_lead_magnet_signups_download
  AFTER UPDATE OF download_count ON public.lead_magnet_signups
  FOR EACH ROW EXECUTE FUNCTION public.lead_magnet_count_download();

DROP TRIGGER IF EXISTS trg_lead_magnet_triggers_count ON public.lead_magnet_triggers;
CREATE TRIGGER trg_lead_magnet_triggers_count
  AFTER INSERT ON public.lead_magnet_triggers
  FOR EACH ROW EXECUTE FUNCTION public.lead_magnet_count_trigger();

-- ── Uprawnienia i RLS: zespół (administrator / operator) zarządza, strona
--    publiczna i automaty działają rolą serwisową ────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_magnets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_magnet_posts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_magnet_signups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_magnet_triggers TO authenticated;
GRANT ALL ON public.lead_magnets TO service_role;
GRANT ALL ON public.lead_magnet_posts TO service_role;
GRANT ALL ON public.lead_magnet_signups TO service_role;
GRANT ALL ON public.lead_magnet_triggers TO service_role;

ALTER TABLE public.lead_magnets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_magnet_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_magnet_signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_magnet_triggers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff manage lead magnets" ON public.lead_magnets;
CREATE POLICY "Staff manage lead magnets" ON public.lead_magnets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));

DROP POLICY IF EXISTS "Staff manage lead magnet posts" ON public.lead_magnet_posts;
CREATE POLICY "Staff manage lead magnet posts" ON public.lead_magnet_posts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));

DROP POLICY IF EXISTS "Staff manage lead magnet signups" ON public.lead_magnet_signups;
CREATE POLICY "Staff manage lead magnet signups" ON public.lead_magnet_signups
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));

DROP POLICY IF EXISTS "Staff view lead magnet triggers" ON public.lead_magnet_triggers;
CREATE POLICY "Staff view lead magnet triggers" ON public.lead_magnet_triggers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));

-- ── Prywatny bucket na pliki (pobranie wyłącznie podpisanym linkiem) ────────
INSERT INTO storage.buckets (id, name, public)
  VALUES ('lead-magnets', 'lead-magnets', false)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Staff read lead-magnets" ON storage.objects;
CREATE POLICY "Staff read lead-magnets" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'lead-magnets'
    AND (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator')));
DROP POLICY IF EXISTS "Staff upload lead-magnets" ON storage.objects;
CREATE POLICY "Staff upload lead-magnets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lead-magnets'
    AND (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator')));
DROP POLICY IF EXISTS "Staff update lead-magnets" ON storage.objects;
CREATE POLICY "Staff update lead-magnets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'lead-magnets'
    AND (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator')));
DROP POLICY IF EXISTS "Staff delete lead-magnets" ON storage.objects;
CREATE POLICY "Staff delete lead-magnets" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'lead-magnets'
    AND (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator')));

COMMENT ON TABLE public.lead_magnets IS
  'Lead magnety: materiał za e-mail (/pobierz/<slug>) + automat odpowiedzi na komentarze FB/IG/YouTube.';
COMMENT ON TABLE public.lead_magnet_posts IS
  'Posty social powiązane z lead magnetem — komentarz pod nimi dostaje link.';
COMMENT ON TABLE public.lead_magnet_signups IS
  'Zapisy na lead magnet (e-mail → subskrybent + osobisty token pobrania).';
COMMENT ON TABLE public.lead_magnet_triggers IS
  'Komentarze i reakcje pod postami lead magnetów oraz status wysłanej odpowiedzi.';

-- ── Tick YouTube (brak webhooków komentarzy → odpytujemy co 10 minut) ────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  base_url text := 'https://project--5394e6ca-0160-41ed-aa82-1afa633ecc0c.lovable.app';
  hdrs jsonb := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxdmVweGh1bHhkbmJ3Ym9na2hlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDE4NzUsImV4cCI6MjA5NDY3Nzg3NX0._BbwSbahiPAij2rB5mOvU_fShtXFljtWCrAJUzPZ1-c"}'::jsonb;
  job record;
BEGIN
  FOR job IN SELECT jobname FROM cron.job WHERE jobname = 'lead-magnet-tick' LOOP
    PERFORM cron.unschedule(job.jobname);
  END LOOP;

  -- Co 10 minut; endpoint no-opuje, gdy nie ma opublikowanych lead magnetów
  -- z filmami YouTube albo kanał nie jest połączony.
  PERFORM cron.schedule('lead-magnet-tick', '*/10 * * * *', format(
    $j$SELECT net.http_post(url := %L, headers := %L::jsonb, body := '{}'::jsonb);$j$,
    base_url || '/api/public/hooks/lead-magnet-tick', hdrs));
END $$;
