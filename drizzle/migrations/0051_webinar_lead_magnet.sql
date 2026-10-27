-- Zapis na webinar dla inwestorów (pokaz nagrania co 15 min) — ten sam
-- mechanizm co lead magnety: subskrybent z tagiem „webinar”, zgoda, lead w CRM
-- i mail z osobistym linkiem do /webinar/pokoj (instant_download — po zapisie
-- od razu przechodzimy do pokoju). NIEOPUBLIKOWANY do czasu
-- nagrania i decyzji właściciela (w kodzie dodatkowo WEBINAR_ENABLED=false).
insert into public.lead_magnets
  (slug, title, audience, headline, subheadline, benefits, cta_text, thank_you_message,
   instant_download, email_subject, email_body, subscriber_tags, create_crm_lead,
   trigger_keywords, match_any_post, reply_public_template, reply_private_template,
   reply_fallback_template, published, email_in_dm_platforms, reply_ask_email_template,
   reply_email_received_template, material_type)
select
  'webinar',
  'Webinar dla inwestorów',
  'inwestor',
  'Webinar dla inwestorów — pokaz co 15 minut',
  'Zapisz się, a wyślemy Ci link do pokoju. Najbliższy pokaz startuje o pełnym kwadransie.',
  array[
    'Jak działa finansowanie pod hipotekę krok po kroku.',
    'Jak oceniamy zabezpieczenie i ryzyko sprawy.',
    'Od czego zacząć z własnym kapitałem.'
  ],
  'Zapisz się na webinar',
  'Dziękujemy! Link do pokoju wysłaliśmy też na Twój e-mail.',
  true,
  'Twój link do webinaru Finance You',
  'Dzień dobry,

oto Twój link do pokoju webinaru dla inwestorów: {link}

Pokaz startuje co 15 minut (o :00, :15, :30 i :45). Link działa przez 30 dni.

Zespół Finance You',
  array['webinar'],
  true,
  array[]::text[],
  false,
  'Wysłaliśmy link w wiadomości prywatnej.',
  'Oto link do webinaru: {link}',
  'Link do webinaru: {link}',
  false,
  array[]::text[],
  'Podaj e-mail, a wyślemy link do webinaru.',
  'Dziękujemy! Link do webinaru jest w drodze: {link}',
  'video'
where not exists (select 1 from public.lead_magnets where slug = 'webinar');
