-- =========================================================
-- POWIADOMIENIA PUSH DLA OPERATORA
--
-- Tabela subskrypcji Web Push (endpoint + klucze szyfrowania
-- przeglądarki). Zapis/odczyt wyłącznie przez funkcje serwerowe
-- (service role) — RLS włączone bez żadnych polityk, więc klucz
-- publiczny (anon/authenticated) nie ma dostępu do endpointów
-- push innych użytkowników.
--
-- Wysyłka: src/lib/operator-push.server.ts (VAPID + aes128gcm),
-- subskrypcja z przeglądarki: src/lib/push.functions.ts.
-- =========================================================

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  last_error text
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Brak polityk RLS celowo: dostęp tylko przez service role z serwera.
REVOKE ALL ON public.push_subscriptions FROM PUBLIC;
REVOKE ALL ON public.push_subscriptions FROM anon;
REVOKE ALL ON public.push_subscriptions FROM authenticated;
