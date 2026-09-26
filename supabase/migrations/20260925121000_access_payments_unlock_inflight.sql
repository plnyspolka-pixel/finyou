-- Zakup jednej okazji: porzucona płatność nie może blokować okazji na zawsze.
--
-- Aplikacja (createAccessCheckout) przed nową próbą anuluje porzucone
-- płatności 'created'/'pending' (odrzucone w Tpay albo starsze niż okno
-- ważności) i blokuje tylko świeżą lub już opłaconą. Tu dokładamy gwarancję
-- bazy: w danej chwili co najwyżej JEDNA rozpoczęta płatność na okazję —
-- równoległe kliknięcia nie utworzą dwóch transakcji Tpay.
--
-- Uwaga: anulowanie rekordu nie blokuje późnej wpłaty — process_access_payment_paid
-- sprawdza wyłącznie processed_at, a podwójna wpłata za okazję trafia do
-- wyjaśnienia (needs_review, 'unlock_already_owned').

-- 1) Porządek w danych przed indeksem: jeśli dla okazji wisi kilka
--    rozpoczętych płatności, zostawiamy najnowszą, starsze anulujemy.
with ranked as (
  select id,
         row_number() over (partition by unlock_match_id order by created_at desc, id desc) as rn
  from public.access_payments
  where unlock_match_id is not null
    and status in ('created', 'pending')
)
update public.access_payments p
   set status = 'cancelled',
       failure_reason = coalesce(p.failure_reason, 'superseded:duplicate_in_flight')
  from ranked r
 where p.id = r.id
   and r.rn > 1;

-- 2) Jedna rozpoczęta płatność na okazję.
create unique index if not exists access_payments_unlock_one_in_flight
  on public.access_payments (unlock_match_id)
  where unlock_match_id is not null and status in ('created', 'pending');
