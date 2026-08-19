-- Czyszczenie historycznych leadów utworzonych z maili inwestorów
-- instytucjonalnych (zanim routing zaczął kierować je do zakładki Oferty).
--
-- Lead pasuje do inwestora, gdy jego e-mail to dokładnie adres inwestora
-- albo (dla adresów firmowych, z pominięciem darmowych skrzynek) ta sama
-- domena co u inwestora instytucjonalnego — identycznie jak routing
-- w src/lib/offer-replies.server.ts.
--
-- Dla dopasowanych leadów:
--   1) korespondencja e-mail przenosi się do offer_distribution_messages
--      (widoczna w zakładce Oferty),
--   2) ich stuby klientów i wniosków są usuwane (FK do clients
--      i loan_applications mają wszędzie CASCADE albo SET NULL),
--   3) same leady są usuwane (lead_communications kasuje się kaskadowo).

CREATE TEMP TABLE _investor_leads AS
SELECT
  l.id AS lead_id,
  l.client_id,
  l.loan_application_id,
  lower(l.email) AS lead_email,
  inv.id AS investor_id
FROM public.leads l
JOIN LATERAL (
  SELECT i.id
  FROM public.investors i
  WHERE i.email IS NOT NULL
    AND (
      lower(i.email) = lower(l.email)
      OR (
        i.investor_type = 'instytucjonalny'
        AND split_part(lower(l.email), '@', 2) NOT IN (
          'gmail.com','googlemail.com','outlook.com','hotmail.com','live.com',
          'icloud.com','me.com','yahoo.com','yahoo.pl','proton.me','protonmail.com',
          'wp.pl','o2.pl','op.pl','onet.pl','onet.eu','interia.pl','interia.eu',
          'poczta.fm','gazeta.pl','tlen.pl','vp.pl','spoko.pl'
        )
        AND split_part(lower(i.email), '@', 2) = split_part(lower(l.email), '@', 2)
      )
    )
  ORDER BY (lower(i.email) = lower(l.email)) DESC
  LIMIT 1
) inv ON true
WHERE l.email IS NOT NULL AND l.email LIKE '%@%';

-- 1) Historia mailowa → zakładka Oferty (bez wniosku, przypięta do inwestora).
INSERT INTO public.offer_distribution_messages
  (loan_application_id, investor_id, direction, subject, content, html,
   from_email, to_email, message_id, attachments, created_at)
SELECT
  NULL,
  il.investor_id,
  c.direction,
  c.subject,
  c.content,
  c.metadata ->> 'html',
  CASE WHEN c.direction = 'inbound' THEN coalesce(lower(c.email), il.lead_email) END,
  CASE WHEN c.direction = 'outbound' THEN coalesce(lower(c.email), il.lead_email) END,
  c.external_id,
  coalesce(c.attachments, '[]'::jsonb),
  c.created_at
FROM public.lead_communications c
JOIN _investor_leads il ON il.lead_id = c.lead_id
WHERE c.channel = 'email'
  AND c.direction IN ('inbound', 'outbound')
  AND NOT EXISTS (
    SELECT 1 FROM public.offer_distribution_messages m
    WHERE m.message_id IS NOT NULL AND m.message_id = c.external_id
  );

-- 2) Stuby klientów i wniosków utworzone z tych leadów.
DELETE FROM public.clients
WHERE id IN (SELECT client_id FROM _investor_leads WHERE client_id IS NOT NULL);

DELETE FROM public.loan_applications
WHERE id IN (SELECT loan_application_id FROM _investor_leads WHERE loan_application_id IS NOT NULL);

-- 3) Same leady (lead_communications i pochodne kasują się kaskadowo).
DELETE FROM public.leads
WHERE id IN (SELECT lead_id FROM _investor_leads);

DROP TABLE _investor_leads;
