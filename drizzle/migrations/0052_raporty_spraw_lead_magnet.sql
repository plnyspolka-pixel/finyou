-- Lead magnet „Przykładowe raporty spraw” (pkt 7 pakietu poprawek) — PDF
-- z zanonimizowanymi raportami (scripts/raporty-spraw.ts). NIEOPUBLIKOWANY:
-- publikacja dopiero po akceptacji właściciela — wtedy wgrywamy plik w panelu
-- (lead magnety → plik) i włączamy „published”. Przycisk w #sprawy na stronie
-- głównej i pozycja w „Darmowych materiałach” pojawiają się automatycznie
-- dopiero po publikacji.
insert into public.lead_magnets
  (slug, title, audience, headline, subheadline, benefits, cta_text, thank_you_message,
   instant_download, email_subject, email_body, subscriber_tags, create_crm_lead,
   trigger_keywords, match_any_post, reply_public_template, reply_private_template,
   reply_fallback_template, published, email_in_dm_platforms, reply_ask_email_template,
   reply_email_received_template, material_type)
select
  'raporty-spraw',
  'Przykładowe raporty spraw: jak oceniamy zabezpieczenie',
  'inwestor',
  'Przykładowe raporty spraw: jak oceniamy zabezpieczenie',
  'Prawdziwe sprawy, dane zanonimizowane. Zobacz, co sprawdzamy, zanim sprawa trafi do inwestora — i dlaczego część spraw odpada.',
  array[
    'Wycena, widełki wartości i LTV na przykładach.',
    'Obciążenia w księdze wieczystej, zbywalność i ryzyka.',
    'Sprawy rekomendowane i odrzucone — z uzasadnieniem.'
  ],
  'Pobierz raporty',
  'Dziękujemy! Link do raportów wysłaliśmy też na Twój e-mail.',
  true,
  'Przykładowe raporty spraw Finance You',
  'Dzień dobry,

oto link do przykładowych raportów spraw: {link}

Zespół Finance You',
  array['raporty-spraw'],
  true,
  array[]::text[],
  false,
  'Wysłaliśmy link w wiadomości prywatnej.',
  'Oto przykładowe raporty spraw: {link}',
  'Przykładowe raporty spraw: {link}',
  false,
  array[]::text[],
  'Podaj e-mail, a wyślemy link do raportów.',
  'Dziękujemy! Link do raportów jest w drodze: {link}',
  'pdf'
where not exists (select 1 from public.lead_magnets where slug = 'raporty-spraw');
