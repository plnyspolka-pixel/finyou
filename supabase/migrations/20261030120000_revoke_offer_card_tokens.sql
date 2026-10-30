-- Wyłączenie publicznej Karty oferty (/karta/<token>): unieważniamy wszystkie
-- wysłane linki. Kolumnę offer_card_token zostawiamy.
UPDATE public.loan_applications SET offer_card_token = NULL;
