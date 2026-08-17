-- Asystent panelu: aktualizacja modelu Anthropica.
--
-- Powód: w ustawieniach dało się wybrać modele, które Anthropic już wycofał
-- (`claude-3-5-sonnet-latest`, `claude-3-5-haiku-latest`, `claude-3-7-sonnet-latest`).
-- API zwraca dla nich 404, czyli czat przestawał odpowiadać bez oczywistej
-- przyczyny. Lista dopuszczonych modeli żyje teraz w src/lib/ai-admin.models.ts
-- i zawiera wyłącznie modele aktywne; tu doprowadzamy bazę do tego samego stanu.
--
-- Uwaga na parametry: rodzina Claude 5 oraz Opus 4.7/4.8 odrzucają `temperature`
-- błędem 400, dlatego `callAnthropic` nie wysyła tego parametru dla tych modeli
-- (kolumna `temperature` zostaje — używają jej modele starsze). W modelach
-- myślących domyślnie (Opus 5, Sonnet 5) `max_tokens` obejmuje myślenie razem
-- z odpowiedzią, więc podnosimy zbyt niskie limity, żeby odpowiedź nie ucinała
-- się w połowie.
--
-- Weryfikacja z panelu: zakładka „Silnik" w ustawieniach asystenta woła
-- GET /v1/models + minimalny POST /v1/messages i pokazuje endpoint, wersję API,
-- ostatnie znaki klucza oraz odpowiedź modelu.

-- Nowy model domyślny dla świeżych instalacji.
ALTER TABLE public.ai_admin_settings
  ALTER COLUMN model SET DEFAULT 'claude-opus-5';

-- Modele wycofane → model domyślny (inaczej czat zwraca 404).
UPDATE public.ai_admin_settings
SET model = 'claude-opus-5'
WHERE model NOT IN (
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-opus-4-8',
  'claude-opus-4-5',
  'claude-sonnet-4-5',
  'claude-haiku-4-5'
);

-- Modele myślące domyślnie dzielą `max_tokens` między myślenie i odpowiedź.
UPDATE public.ai_admin_settings
SET max_tokens = 8000
WHERE max_tokens < 8000
  AND model IN ('claude-opus-5', 'claude-sonnet-5');

COMMENT ON COLUMN public.ai_admin_settings.model IS
  'Model Anthropica dla asystenta panelu. Dozwolone wartości: src/lib/ai-admin.models.ts (AI_ADMIN_MODEL_IDS).';
COMMENT ON COLUMN public.ai_admin_settings.temperature IS
  'Używane tylko przez modele, które przyjmują parametry próbkowania (Opus/Sonnet 4.5, Haiku 4.5). Claude 5 i Opus 4.7/4.8 odrzucają temperature błędem 400, więc dla nich nie jest wysyłane.';
