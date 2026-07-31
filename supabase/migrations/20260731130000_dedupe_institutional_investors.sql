-- Deduplikacja inwestorów instytucjonalnych.
--
-- Trzykrotny import partnerów (2026-07-06, 07-09, 07-10) utworzył 2–3 wiersze
-- na ten sam adres e-mail, przez co lista odbiorców dystrybucji ofert
-- pokazywała każdego partnera podwójnie.
--
-- 1. Dla każdego e-maila zostaje najnowszy rekord (import z 07-10 ma pełne
--    nazwy prawne oraz NIP/KRS); aktywna subskrypcja z duplikatu przechodzi
--    na zachowany rekord.
-- 2. Referencje z tabel powiązanych są przepinane na zachowany rekord.
-- 3. Częściowy unikalny indeks na lower(trim(email)) blokuje ponowne
--    zduplikowanie przy kolejnych importach.
--
-- Migracja jest idempotentna — na bazie już zdeduplikowanej nic nie zmienia.

BEGIN;

-- Guard-trigger blokuje zmiany pól subskrypcji poza kontem administratora;
-- przeniesienie statusu z duplikatu wymaga jego chwilowego wyłączenia.
ALTER TABLE public.investors DISABLE TRIGGER investors_block_privileged_updates_trg;

CREATE TEMP TABLE dedupe_map ON COMMIT DROP AS
WITH ranked AS (
  SELECT id,
         lower(trim(email)) AS email_norm,
         row_number() OVER (
           PARTITION BY lower(trim(email))
           ORDER BY created_at DESC, length(company_name) DESC, id
         ) AS rn
  FROM public.investors
  WHERE investor_type = 'instytucjonalny' AND email IS NOT NULL
)
SELECT d.id AS dup_id, k.id AS keeper_id
FROM ranked d
JOIN ranked k ON k.email_norm = d.email_norm AND k.rn = 1
WHERE d.rn > 1;

-- Aktywna subskrypcja duplikatu przechodzi na zachowany rekord
UPDATE public.investors k
SET subscription_status = s.subscription_status,
    subscription_plan = s.subscription_plan,
    subscription_active_until = s.subscription_active_until,
    subscription_source = s.subscription_source
FROM (
  SELECT DISTINCT ON (m.keeper_id)
         m.keeper_id, i.subscription_status, i.subscription_plan,
         i.subscription_active_until, i.subscription_source
  FROM dedupe_map m
  JOIN public.investors i ON i.id = m.dup_id
  WHERE i.subscription_status = 'aktywny'
  ORDER BY m.keeper_id, i.created_at DESC
) s
WHERE k.id = s.keeper_id AND k.subscription_status <> 'aktywny';

-- Przepięcie referencji na zachowany rekord
UPDATE public.offer_distributions t SET investor_id = m.keeper_id
  FROM dedupe_map m WHERE t.investor_id = m.dup_id;
UPDATE public.offer_distribution_messages t SET investor_id = m.keeper_id
  FROM dedupe_map m WHERE t.investor_id = m.dup_id;
UPDATE public.investor_offers t SET investor_id = m.keeper_id
  FROM dedupe_map m WHERE t.investor_id = m.dup_id;
UPDATE public.chat_threads t SET investor_id = m.keeper_id
  FROM dedupe_map m WHERE t.investor_id = m.dup_id;
UPDATE public.leads t SET investor_id = m.keeper_id
  FROM dedupe_map m WHERE t.investor_id = m.dup_id;
-- Ustawienia: przepnij tylko gdy zachowany rekord ich nie ma, resztę usuń
UPDATE public.institutional_investor_settings t SET investor_id = m.keeper_id
  FROM dedupe_map m
  WHERE t.investor_id = m.dup_id
    AND NOT EXISTS (
      SELECT 1 FROM public.institutional_investor_settings k
      WHERE k.investor_id = m.keeper_id
    );
DELETE FROM public.institutional_investor_settings t
  USING dedupe_map m WHERE t.investor_id = m.dup_id;

DELETE FROM public.investors i USING dedupe_map m WHERE i.id = m.dup_id;

-- "Fundusz Ostoja" bez e-maila — pozostałość po pierwszym imporcie,
-- firma istnieje jako FUNDUSZ OSTOJA sp. z o.o. z adresem e-mail.
DELETE FROM public.investors i
WHERE i.investor_type = 'instytucjonalny'
  AND i.email IS NULL
  AND lower(i.company_name) = 'fundusz ostoja'
  AND EXISTS (
    SELECT 1 FROM public.investors j
    WHERE j.investor_type = 'instytucjonalny'
      AND j.email IS NOT NULL
      AND lower(j.company_name) LIKE 'fundusz ostoja%'
  );

CREATE UNIQUE INDEX IF NOT EXISTS investors_institutional_email_unique
  ON public.investors (lower(trim(email)))
  WHERE investor_type = 'instytucjonalny' AND email IS NOT NULL;

ALTER TABLE public.investors ENABLE TRIGGER investors_block_privileged_updates_trg;

COMMIT;
