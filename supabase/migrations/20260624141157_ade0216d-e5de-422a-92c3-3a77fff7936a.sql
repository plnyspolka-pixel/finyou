-- Scal wszystkie wnioski/nieruchomości/dokumenty na najnowszy rekord klienta per user_id
WITH ranked AS (
  SELECT id, user_id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
  FROM public.clients
  WHERE user_id IS NOT NULL
),
keep AS (SELECT user_id, id AS keep_id FROM ranked WHERE rn = 1),
dup  AS (SELECT r.id AS dup_id, k.keep_id
         FROM ranked r JOIN keep k ON k.user_id = r.user_id
         WHERE r.rn > 1)
UPDATE public.loan_applications la
SET client_id = d.keep_id
FROM dup d
WHERE la.client_id = d.dup_id;

-- Usuń stare duplikaty klientów, które nie mają już żadnych powiązanych wniosków
WITH ranked AS (
  SELECT id, user_id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
  FROM public.clients
  WHERE user_id IS NOT NULL
)
DELETE FROM public.clients c
USING ranked r
WHERE c.id = r.id
  AND r.rn > 1
  AND NOT EXISTS (SELECT 1 FROM public.loan_applications la WHERE la.client_id = c.id);