# Audyt techniczny SEO financeyou.pl — checklista z rolki (23.10.2026)

Źródło: rolka z Facebooka `facebook.com/share/r/1DdifHvUh7/` — Josh Hoeg (Vibe Coding & AI), 12.09.2026, 33 s, ok. 143 tys. wyświetleń, 3,1 tys. reakcji. Podpis: „Google isn't showing your vibe coded website because you didn't prompt Claude to add all this to your site”. Treść mówiona (transkrypcja ElevenLabs Scribe): jeden prompt do Claude'a z 20 punktami technicznego SEO, zakończony „Make no mistakes”. Lista na ekranie (po kolei): sitemap.xml, robots.txt, usunąć noindex, canonical, meta title, meta description, jeden H1, hierarchia nagłówków, alt obrazków, schema markup, linki wewnętrzne, zepsute linki, kompresja obrazków, Core Web Vitals, responsywność, HTTPS, czyste slugi, og:image, weryfikacja Search Console, strategia backlinków.

Metoda: przejście wszystkich 130 adresów z `sitemap.xml` na produkcji (HTML po SSR), sprawdzenie linków wewnętrznych, Search Console przez konektor (`list_sitemaps`, `get_search_performance`, `inspect_url`). PageSpeed nie zadziałał — wyczerpany dzienny limit zapytań API (429), do powtórzenia innego dnia.

## Stan przed audytem (co już było)

Strona miała już większość listy: sitemap generowana z bazy, robots.txt z wykluczeniem paneli, canonical i meta title/description na każdej ze 130 stron, og:image na każdej stronie, JSON-LD (FinancialService, LoanOrCredit, FAQPage, BreadcrumbList) na stronach produktowych, blogu, kalkulatorze i podstronach miast, HTTPS wymuszony (301 z http, HSTS rok), viewport, weryfikacja Search Console (właściciel), `llms.txt`.

Search Console, 28 dni do 22.10: 169 wyświetleń, 7 kliknięć, średnia pozycja 10,7. Strona główna zaindeksowana (ostatni crawl 15.10, kanoniczny zgodny). Mapa: 130 zgłoszonych; pole „zaindeksowane” w API pokazuje 0, ale to znane ograniczenie API map witryny, nie stan indeksu. Wniosek: problemem nie jest technika, tylko mała widoczność — treści i linki przychodzące.

## Co było nie tak i co naprawiono w kodzie

| Punkt z rolki | Co znalazł audyt | Zmiana |
|---|---|---|
| Jeden H1 | 14 artykułów bloga miało dwa H1 (tytuł strony + „#” z markdownu); regulamin i polityka prywatności — dwa H1 („ZAŁĄCZNIK NR 1”); `/pozyczki` bez H1 | `blog.$slug.tsx`: „#” z treści renderowane jako H2; `lib/seo/headings.ts` `singleH1()` dla dokumentów prawnych; `SectionHead` dostał prop `as`, `/pozyczki` używa `as="h1"` |
| Hierarchia nagłówków | `/dla-inwestora`: skok h2 → h5 (tytuły alertów w kalkulatorze) | `AlertTitle` renderuje `div` zamiast `h5` — tytuł alertu nie jest nagłówkiem dokumentu |
| Zepsute linki | `/wniosek-start` (404) linkowany z 4 artykułów; link z polskimi znakami w slugu (`…firmy-pożyczkowe-…`) → 404 | nowa trasa `/wniosek-start` → 301 na `/dla-klienta`; normalizacja linków w treści (`asciiSlug`, mapowanie dawnego kreatora `/wniosek-*`); nieznany slug z polskimi znakami → 301 na slug ASCII zamiast 404 |
| Canonical | `/dla-posrednika` jest w mapie, a przekierowuje na stronę główną (moduł ukryty) — Google widzi redirect zamiast strony | wpis usunięty z sitemapy do czasu odkrycia modułu (komentarz w `sitemap[.]xml.ts`) |
| Sitemap | strony statyczne miały `lastmod` = data pobrania (zawsze „dziś”) — Google ignoruje takie lastmod i przestaje ufać mapie | `lastmod` tylko dla wpisów z bazy (artykuły, miasta) |
| Schema markup | `/dla-klienta` bez JSON-LD mimo sekcji FAQ | FinancialService + FAQPage + BreadcrumbList |
| llms.txt | opisywał nieistniejące strony (`/wniosek-start`, `/wniosek-warunki`, …) | przepisany na realne strony: produkty, miasta, kalkulator, raport, moduły inwestora, blog |

Testy: `src/lib/seo/slug.test.ts` (normalizacja slugów, jeden H1). Alt obrazków: wszystkie `<img>` mają atrybut `alt`; na stronach marketingowych 12–24 obrazków na stronę to ikony 3D z `alt=""` (dekoracyjne — poprawnie).

## Poza kodem / do zrobienia

1. **Cloudflare**: `www.financeyou.pl` → `financeyou.pl` idzie przez 302; powinno być 301 (reguła przekierowania w Cloudflare).
2. **PageSpeed / Core Web Vitals**: uruchomić `get_pagespeed` innego dnia (limit API wyczerpany 23.10) — ocena wydajności, LCP/INP/CLS, kompresja obrazków.
3. **Meta title i description**: ponad 70 stron ma title dłuższy niż 60 znaków (strona główna 77, artykuły bloga do 122) i opis dłuższy niż 160 (do 301). Google je przycina lub przepisuje; to nie blokuje indeksacji. Dla stron statycznych decyzja właściciela (brzmienie marki); dla bloga — pole `meta_title`/`excerpt` w generatorze artykułów.
4. **Linki wewnętrzne**: `/oferty`, `/regulamin`, polityki — 1–2 linki wewnętrzne (brak stopki marketingowej). Stopka na stronach formularzy ma nagłówki h3 bez h2 (`/rejestracja`) — kosmetyka.
5. **Backlinki**: w panelu są narzędzia (`list_backlinks`, `generate_linkbuilding_suggestions`, outreach, PR) — to jest dźwignia widoczności, nie technika.
6. Po wdrożeniu: ponowne zgłoszenie sitemapy (ping jest w `lib/seo/ping.server.ts`) i sprawdzenie w Search Console, czy `/wniosek-start` i link z polskimi znakami zniknęły z raportu „Nie znaleziono (404)”.
