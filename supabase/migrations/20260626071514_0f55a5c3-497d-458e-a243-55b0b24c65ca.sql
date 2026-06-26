
CREATE TYPE public.marketing_audience AS ENUM ('klient','inwestor','posrednik');
CREATE TYPE public.marketing_media_type AS ENUM ('image','video');

CREATE OR REPLACE FUNCTION public.set_updated_at_marketing_materials()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.marketing_materials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  audience public.marketing_audience NOT NULL,
  media_type public.marketing_media_type NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  file_size BIGINT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_materials TO authenticated;
GRANT ALL ON public.marketing_materials TO service_role;

ALTER TABLE public.marketing_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated view marketing materials"
  ON public.marketing_materials FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins/operators insert marketing materials"
  ON public.marketing_materials FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'operator'));
CREATE POLICY "Admins/operators update marketing materials"
  ON public.marketing_materials FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'operator'))
  WITH CHECK (public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'operator'));
CREATE POLICY "Admins/operators delete marketing materials"
  ON public.marketing_materials FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'operator'));

CREATE TRIGGER trg_marketing_materials_updated_at
  BEFORE UPDATE ON public.marketing_materials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_marketing_materials();

CREATE POLICY "Authenticated read marketing-materials"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'marketing-materials');
CREATE POLICY "Admins/operators upload marketing-materials"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'marketing-materials' AND (public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'operator')));
CREATE POLICY "Admins/operators update marketing-materials"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'marketing-materials' AND (public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'operator')));
CREATE POLICY "Admins/operators delete marketing-materials"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'marketing-materials' AND (public.has_role(auth.uid(),'administrator') OR public.has_role(auth.uid(),'operator')));
