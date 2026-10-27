-- Opis darmowej lekcji 1 zgodny z treścią nagrania (34:03) — decyzja właściciela
-- 27.10.2026. Te same teksty co FREE_LESSON_COPY w src/lib/free-lesson.ts;
-- z bazy korzysta m.in. e-mail z linkiem do lekcji.
update public.lead_magnets
set title = 'Dlaczego po 15 latach inwestowania w nieruchomości wybrałem pożyczki pod hipotekę',
    headline = 'Dlaczego po 15 latach inwestowania w nieruchomości wybrałem pożyczki pod hipotekę',
    subheadline = 'Pierwsza lekcja szkolenia Filipa Bielaka, ok. 35 minut. Obejrzyj od razu po zapisie; link w e‑mailu działa przez 30 dni.',
    benefits = array[
      'Dlaczego wybrałem pożyczki pod zastaw, a nie inne sposoby inwestowania w nieruchomości — co sprawdziłem i jakie wnioski wyciągnąłem.',
      'Plusy i minusy tego modelu, których doświadczyłem przez 15 lat — bez upiększania.',
      'Ile realnie można na tym zarobić — konkretne liczby.'
    ]
where slug = 'darmowa-lekcja';

update public.training_videos
set title = 'Dlaczego po 15 latach inwestowania w nieruchomości wybrałem pożyczki pod hipotekę',
    description = 'Pierwsza lekcja szkolenia Filipa Bielaka, ok. 35 minut: dlaczego pożyczki pod zastaw, a nie inne sposoby inwestowania w nieruchomości; plusy i minusy z 15 lat; ile realnie można zarobić. Przykłady z lekcji nie są gwarancją zysku.'
where id = '9e3b75e6-d396-4462-9847-5b5ce8bd2d1d';
