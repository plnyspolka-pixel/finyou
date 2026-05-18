
-- =========================================
-- ENUMS
-- =========================================
CREATE TYPE public.app_role AS ENUM ('administrator', 'operator', 'klient', 'inwestor');

CREATE TYPE public.loan_status AS ENUM (
  'nowy_lead','w_trakcie_uzupelniania','braki_w_dokumentach','do_kontaktu',
  'w_follow_upie','wniosek_kompletny','do_analizy','rokuje','nie_rokuje',
  'wyslany_do_inwestorow','oferta_od_inwestora','oferta_przekazana_klientowi',
  'zaakceptowany_przez_klienta','do_umowy','zamkniety','archiwalny'
);

CREATE TYPE public.property_type AS ENUM (
  'mieszkanie','dom','lokal_uslugowy','dzialka_budowlana','grunt_rolny',
  'udzial_w_nieruchomosci','inna'
);

CREATE TYPE public.contact_channel AS ENUM ('telefon','sms','email','voicebot','notatka','system');
CREATE TYPE public.contact_direction AS ENUM ('wychodzacy','przychodzacy','wewnetrzny');

CREATE TYPE public.investor_type AS ENUM ('indywidualny','instytucjonalny');
CREATE TYPE public.subscription_plan AS ENUM ('podstawowy','rozszerzony','profesjonalny');
CREATE TYPE public.subscription_status AS ENUM ('aktywny','nieaktywny','wstrzymany','probny');

CREATE TYPE public.distribution_status AS ENUM (
  'szkic','gotowe_do_wysylki','wyslane','otworzone','odpowiedz_otrzymana',
  'prosba_o_dodatkowe_informacje','oferta_otrzymana','odrzucone','brak_odpowiedzi','zamkniete'
);

CREATE TYPE public.offer_status AS ENUM (
  'szkic','zlozona','w_trakcie_weryfikacji','zatwierdzona_przez_administratora',
  'odrzucona_przez_administratora','wyslana_do_klienta','zaakceptowana_przez_klienta',
  'odrzucona_przez_klienta','wygasla'
);

CREATE TYPE public.repayment_type AS ENUM ('miesieczna','balonowa','mieszana');

CREATE TYPE public.visibility_level AS ENUM ('zanonimizowane','czesciowe','pelne');

CREATE TYPE public.integration_status AS ENUM ('niepolaczona','polaczona','blad','wymaga_konfiguracji','wylaczona');

CREATE TYPE public.automation_status AS ENUM ('aktywna','wstrzymana','zakonczona','blad');

-- =========================================
-- PROFILES
-- =========================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================
-- USER ROLES (separate table - SECURITY)
-- =========================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- has_role function (SECURITY DEFINER to avoid RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- =========================================
-- CLIENTS
-- =========================================
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  source TEXT,
  external_id TEXT,
  consent_rodo BOOLEAN NOT NULL DEFAULT false,
  consent_marketing BOOLEAN NOT NULL DEFAULT false,
  consent_phone BOOLEAN NOT NULL DEFAULT false,
  consent_email BOOLEAN NOT NULL DEFAULT false,
  consent_sms BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================
-- LOAN APPLICATIONS
-- =========================================
CREATE TABLE public.loan_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  status public.loan_status NOT NULL DEFAULT 'nowy_lead',
  loan_amount NUMERIC(14,2),
  preferred_period_months INTEGER,
  situation_description TEXT,
  fast_decision BOOLEAN DEFAULT false,
  preferred_contact_channel public.contact_channel,
  current_form_step INTEGER NOT NULL DEFAULT 1,
  completeness_percent INTEGER NOT NULL DEFAULT 0,
  missing_fields JSONB DEFAULT '[]'::jsonb,
  return_link_token TEXT UNIQUE,
  return_link TEXT,
  admin_decision TEXT,
  decision_reason TEXT,
  decision_at TIMESTAMPTZ,
  decision_by UUID REFERENCES auth.users(id),
  initial_score INTEGER,
  risk_level TEXT,
  property_quality TEXT,
  location_quality TEXT,
  estimated_ltv NUMERIC(6,2),
  assigned_operator UUID REFERENCES auth.users(id),
  source TEXT,
  external_id TEXT,
  make_scenario_id TEXT,
  webhook_status TEXT,
  last_webhook_at TIMESTAMPTZ,
  automation_status public.automation_status DEFAULT 'aktywna',
  automation_paused BOOLEAN NOT NULL DEFAULT false,
  last_automation_error TEXT,
  available_to_investors BOOLEAN NOT NULL DEFAULT false,
  visibility_level public.visibility_level NOT NULL DEFAULT 'zanonimizowane',
  last_contact_at TIMESTAMPTZ,
  next_contact_at TIMESTAMPTZ,
  contact_attempts_phone INTEGER NOT NULL DEFAULT 0,
  contact_attempts_sms INTEGER NOT NULL DEFAULT 0,
  contact_attempts_email INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_loan_applications_client ON public.loan_applications(client_id);
CREATE INDEX idx_loan_applications_status ON public.loan_applications(status);

-- =========================================
-- PROPERTIES
-- =========================================
CREATE TABLE public.properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id UUID NOT NULL REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  property_type public.property_type NOT NULL,
  address TEXT,
  city TEXT,
  voivodeship TEXT,
  land_register_number TEXT,
  area_sqm NUMERIC(10,2),
  estimated_value NUMERIC(14,2),
  has_mortgage BOOLEAN DEFAULT false,
  has_co_owners BOOLEAN DEFAULT false,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_properties_loan ON public.properties(loan_application_id);

-- =========================================
-- DOCUMENTS
-- =========================================
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id UUID REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  document_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT,
  file_path TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  visibility_level public.visibility_level NOT NULL DEFAULT 'pelne',
  status TEXT DEFAULT 'aktywny',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_loan ON public.documents(loan_application_id);

-- =========================================
-- CONTACT EVENTS
-- =========================================
CREATE TABLE public.contact_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id UUID REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  channel public.contact_channel NOT NULL,
  direction public.contact_direction NOT NULL DEFAULT 'wychodzacy',
  status TEXT,
  subject TEXT,
  content TEXT,
  external_id TEXT,
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_contact_events_loan ON public.contact_events(loan_application_id);

-- =========================================
-- AUTOMATION EVENTS
-- =========================================
CREATE TABLE public.automation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id UUID REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  automation_type TEXT NOT NULL,
  status TEXT,
  make_scenario_id TEXT,
  webhook_url TEXT,
  sent_payload JSONB,
  response_payload JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================
-- INVESTORS
-- =========================================
CREATE TABLE public.investors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  investor_type public.investor_type NOT NULL,
  company_name TEXT,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  subscription_plan public.subscription_plan,
  subscription_status public.subscription_status DEFAULT 'nieaktywny',
  subscription_active_until TIMESTAMPTZ,
  subscription_source TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  web2learn_user_id TEXT,
  web2learn_status TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================
-- INSTITUTIONAL INVESTOR SETTINGS
-- =========================================
CREATE TABLE public.institutional_investor_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id UUID NOT NULL UNIQUE REFERENCES public.investors(id) ON DELETE CASCADE,
  preferred_min_amount NUMERIC(14,2),
  preferred_max_amount NUMERIC(14,2),
  preferred_locations TEXT[],
  preferred_property_types public.property_type[],
  max_ltv NUMERIC(6,2),
  email_template TEXT,
  custom_variables JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================
-- OFFER DISTRIBUTIONS
-- =========================================
CREATE TABLE public.offer_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id UUID NOT NULL REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  investor_id UUID NOT NULL REFERENCES public.investors(id) ON DELETE CASCADE,
  distribution_status public.distribution_status NOT NULL DEFAULT 'szkic',
  sent_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  response_summary TEXT,
  additional_info_request TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_distributions_loan ON public.offer_distributions(loan_application_id);
CREATE INDEX idx_distributions_investor ON public.offer_distributions(investor_id);

-- =========================================
-- INVESTOR OFFERS
-- =========================================
CREATE TABLE public.investor_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_application_id UUID NOT NULL REFERENCES public.loan_applications(id) ON DELETE CASCADE,
  investor_id UUID NOT NULL REFERENCES public.investors(id) ON DELETE CASCADE,
  offer_status public.offer_status NOT NULL DEFAULT 'szkic',
  proposed_amount NUMERIC(14,2),
  period_months INTEGER,
  expected_yearly_yield NUMERIC(6,2),
  commission NUMERIC(6,2),
  collection_protection BOOLEAN DEFAULT false,
  collection_protection_settlement TEXT,
  has_balloon BOOLEAN DEFAULT false,
  balloon_amount NUMERIC(14,2),
  repayment_type public.repayment_type DEFAULT 'miesieczna',
  estimated_monthly_payment NUMERIC(14,2),
  estimated_total_cost NUMERIC(14,2),
  schedule JSONB,
  investor_note TEXT,
  admin_note TEXT,
  submitted_at TIMESTAMPTZ,
  admin_verified_at TIMESTAMPTZ,
  client_decision_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_offers_loan ON public.investor_offers(loan_application_id);
CREATE INDEX idx_offers_investor ON public.investor_offers(investor_id);

-- =========================================
-- AUDIT LOGS
-- =========================================
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  object_type TEXT NOT NULL,
  object_id UUID,
  action TEXT NOT NULL,
  previous_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================
-- INTEGRATION SETTINGS
-- =========================================
CREATE TABLE public.integration_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_name TEXT NOT NULL UNIQUE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  status public.integration_status NOT NULL DEFAULT 'niepolaczona',
  configuration JSONB DEFAULT '{}'::jsonb,
  webhook_url TEXT,
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================
-- TRIGGERS - updated_at
-- =========================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['profiles','clients','loan_applications','properties',
    'documents','investors','institutional_investor_settings','offer_distributions',
    'investor_offers','integration_settings'])
  LOOP
    EXECUTE format('CREATE TRIGGER trg_%I_updated BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t, t);
  END LOOP;
END $$;

-- =========================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  );
  -- Default role for new signups: klient
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'klient');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================
-- ENABLE RLS
-- =========================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institutional_investor_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;

-- =========================================
-- RLS POLICIES
-- =========================================

-- PROFILES: każdy widzi siebie, admin/operator widzi wszystkich
CREATE POLICY "profiles_self_select" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'administrator'));
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'));

-- USER_ROLES: tylko admin zarządza, każdy widzi swoje
CREATE POLICY "roles_self_select" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'administrator'));
CREATE POLICY "roles_admin_manage" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'));

-- CLIENTS: admin/operator widzą wszystko, klient widzi siebie
CREATE POLICY "clients_staff_all" ON public.clients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));
CREATE POLICY "clients_self_select" ON public.clients FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "clients_self_update" ON public.clients FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- LOAN_APPLICATIONS
CREATE POLICY "loans_staff_all" ON public.loan_applications FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));
CREATE POLICY "loans_client_select" ON public.loan_applications FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid()));
CREATE POLICY "loans_client_update" ON public.loan_applications FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid()));
CREATE POLICY "loans_investor_select" ON public.loan_applications FOR SELECT TO authenticated
  USING (available_to_investors = true AND public.has_role(auth.uid(), 'inwestor'));

-- PROPERTIES
CREATE POLICY "properties_staff_all" ON public.properties FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));
CREATE POLICY "properties_client_access" ON public.properties FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.loan_applications la JOIN public.clients c ON c.id = la.client_id
                 WHERE la.id = loan_application_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.loan_applications la JOIN public.clients c ON c.id = la.client_id
                      WHERE la.id = loan_application_id AND c.user_id = auth.uid()));
CREATE POLICY "properties_investor_select" ON public.properties FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.loan_applications la WHERE la.id = loan_application_id
                 AND la.available_to_investors = true) AND public.has_role(auth.uid(), 'inwestor'));

-- DOCUMENTS
CREATE POLICY "documents_staff_all" ON public.documents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));
CREATE POLICY "documents_client_access" ON public.documents FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.loan_applications la JOIN public.clients c ON c.id = la.client_id
                 WHERE la.id = loan_application_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.loan_applications la JOIN public.clients c ON c.id = la.client_id
                      WHERE la.id = loan_application_id AND c.user_id = auth.uid()));

-- CONTACT_EVENTS
CREATE POLICY "contacts_staff_all" ON public.contact_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));

-- AUTOMATION_EVENTS
CREATE POLICY "automations_staff_all" ON public.automation_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));

-- INVESTORS
CREATE POLICY "investors_admin_all" ON public.investors FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'));
CREATE POLICY "investors_operator_select" ON public.investors FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'operator'));
CREATE POLICY "investors_self_select" ON public.investors FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "investors_self_update" ON public.investors FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- INSTITUTIONAL SETTINGS
CREATE POLICY "inst_settings_admin_all" ON public.institutional_investor_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'));

-- OFFER_DISTRIBUTIONS
CREATE POLICY "distributions_staff_all" ON public.offer_distributions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));
CREATE POLICY "distributions_investor_select" ON public.offer_distributions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.investors i WHERE i.id = investor_id AND i.user_id = auth.uid()));

-- INVESTOR_OFFERS
CREATE POLICY "offers_staff_all" ON public.investor_offers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));
CREATE POLICY "offers_investor_own" ON public.investor_offers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.investors i WHERE i.id = investor_id AND i.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.investors i WHERE i.id = investor_id AND i.user_id = auth.uid()));
CREATE POLICY "offers_client_select" ON public.investor_offers FOR SELECT TO authenticated
  USING (offer_status IN ('wyslana_do_klienta','zaakceptowana_przez_klienta','odrzucona_przez_klienta')
         AND EXISTS (SELECT 1 FROM public.loan_applications la JOIN public.clients c ON c.id = la.client_id
                     WHERE la.id = loan_application_id AND c.user_id = auth.uid()));

-- AUDIT_LOGS
CREATE POLICY "audit_admin_select" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'));
CREATE POLICY "audit_staff_insert" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator'));

-- INTEGRATION_SETTINGS
CREATE POLICY "integrations_admin_all" ON public.integration_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'));

-- =========================================
-- STORAGE BUCKET: documents (prywatny)
-- =========================================
INSERT INTO storage.buckets (id, name, public) VALUES ('documents','documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "docs_staff_all" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'documents' AND (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator')))
  WITH CHECK (bucket_id = 'documents' AND (public.has_role(auth.uid(), 'administrator') OR public.has_role(auth.uid(), 'operator')));

CREATE POLICY "docs_user_own" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- =========================================
-- SEED: integration tiles
-- =========================================
INSERT INTO public.integration_settings (integration_name, status) VALUES
  ('Make','niepolaczona'),
  ('GetResponse','niepolaczona'),
  ('Stripe','niepolaczona'),
  ('Web2Learn','niepolaczona'),
  ('JotForm','niepolaczona'),
  ('Meta Lead Ads','niepolaczona'),
  ('Dostawca SMS','niepolaczona'),
  ('Voicebot','niepolaczona'),
  ('Gmail / E-mail','niepolaczona')
ON CONFLICT (integration_name) DO NOTHING;
