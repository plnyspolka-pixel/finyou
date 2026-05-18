
# Panel Finance You — plan budowy MVP

Aplikacja jest bardzo obszerna (3 panele, ~13 tabel, formularz wieloetapowy, dystrybucja ofert, kalkulator, integracje). Aby zachować jakość i stabilność, proponuję zbudować ją w **4 fazach**. Każda faza kończy się działającym, klikalnym etapem, na którym możesz wszystko przejrzeć i zlecić poprawki, zanim ruszymy dalej.

Cały interfejs będzie po polsku. Wszystkie dane testowe (Jan Kowalski, Warszawa itp.) — po polsku. Nazwy techniczne w bazie po angielsku dla stabilności.

---

## Faza 1 — Fundamenty (backend + auth + layout)

1. Włączenie **Lovable Cloud** (Supabase pod spodem) jako backendu.
2. Migracje SQL — wszystkie 13 tabel z dokumentu:
   `profiles`, `clients`, `loan_applications`, `properties`, `documents`, `contact_events`, `automation_events`, `investors`, `institutional_investor_settings`, `offer_distributions`, `investor_offers`, `audit_logs`, `integration_settings`.
   Plus tabela `user_roles` + enum `app_role` (Administrator / Operator / Klient / Inwestor) zgodnie z dobrymi praktykami bezpieczeństwa (role NIGDY na `profiles`).
3. **RLS** na każdej tabeli + funkcja `has_role()` (SECURITY DEFINER).
4. Storage bucket `documents` (prywatny) + polityki dostępu.
5. System logowania (e-mail/hasło) + rejestracja, trigger auto-tworzący `profiles` po signup.
6. Routing i layouty 3 paneli z menu bocznym:
   - `/admin/*` — Panel administratora
   - `/klient/*` — Panel klienta
   - `/inwestor/*` — Panel inwestora
   Guard po roli (przekierowanie do właściwego panelu po logowaniu).
7. Design system w `src/styles.css` — profesjonalny SaaS/CRM look (neutralne tła, jasny akcent, czytelne tabele, mobile-friendly).

## Faza 2 — Panel administratora (rdzeń systemu)

1. **Pulpit** — karty KPI (Nowe leady, Wnioski niekompletne, W follow-upie, Kompletne, Do analizy, Rokujące, Wysłane, Oferty, Sprawy zamknięte) + wykresy (konwersja, leady wg źródła, kontakty wg kanału, statusy).
2. **Leady / Wnioski** — tabela z filtrami (status, źródło, typ nieruchomości, kompletność), wyszukiwarką (imię/nazwisko/telefon/e-mail/KW), sortowaniem, akcjami „Dodaj lead”, „Eksportuj”, „Zmień status”.
3. **Szczegóły wniosku** — 12 sekcji z dokumentu (Dane klienta, Kontakt, Wniosek, Nieruchomość, Dokumenty, Kompletność, Historia kontaktu, Notatki, Automatyzacje, Dystrybucja, Oferty, Historia zmian).
4. **Klienci**, **Nieruchomości**, **Dokumenty** — listy + szczegóły.
5. **Historia kontaktu / Follow-up** — lista zdarzeń + dodawanie ręczne notatek/telefonów/SMS.
6. **Selekcja** — przyciski „Rokuje / Nie rokuje / Do analizy” z notatką + placeholder „Moduł AI selekcji włączony/wyłączony”.
7. Statusy w kodzie po angielsku, w UI mapowane na polskie etykiety (Nowy lead, W trakcie uzupełniania, Braki w dokumentach, … , Archiwalny — wszystkie 16).

## Faza 3 — Panel klienta + Inwestorzy + Dystrybucja

1. **Formularz klienta 7-krokowy**, mobile-first, autosave do Supabase po każdym kroku.
2. **Token linku powrotu** — generowany po Kroku 1, klient wraca dokładnie do `current_form_step`. Pole `return_link_token` + publiczna trasa `/wniosek/:token`.
3. Upload dokumentów do Storage z dynamiczną listą wymaganych dokumentów zależną od typu nieruchomości.
4. Podsumowanie + procent kompletności + „Wyślij wniosek”.
5. **Inwestorzy** (admin): CRUD inwestorów indywidualnych i instytucjonalnych + ustawienia instytucjonalne (preferencje kwoty/lokalizacji/LTV/typów, szablon e-maila).
6. **Dystrybucja ofert** (admin): wybór wniosków „Rokuje” → wybór inwestorów → tworzenie wpisów w `offer_distributions` ze statusami (Szkic, Gotowe do wysyłki, Wysłane, …). Wysyłka oznaczana jako „gotowe do webhooka Make”.

## Faza 4 — Panel inwestora + Oferty + Integracje + Dane testowe

1. **Panel inwestora**: lista dostępnych wniosków (tylko dopuszczone, z poziomem widoczności Zanonimizowane/Częściowe/Pełne), paywall jeśli brak aktywnego abonamentu.
2. **Kalkulator oferty** — wszystkie pola (kwota, okres, zysk %, prowizja, ochrona windykacyjna, balon, typ spłaty) + wygenerowany harmonogram spłat (numer raty, termin, rata, kapitał, odsetki, saldo).
3. Składanie oferty → status „Złożona” → admin może zatwierdzić/odrzucić/wysłać do klienta.
4. **Oferta dla klienta** w panelu klienta z przyciskami „Akceptuję / Mam pytania / Odrzucam”.
5. **Ekran Integracje** (admin) — kafelki: Make, GetResponse, Stripe, Web2Learn, JotForm, Meta Lead Ads, SMS, Voicebot, Gmail. Każdy ze statusem (Niepołączona / Połączona / Błąd / Wymaga konfiguracji / Wyłączona) i placeholderem „Testuj połączenie”. Dane w `integration_settings`.
6. **Dane testowe** (seed): 10 klientów, 10 wniosków o różnych statusach, kilka nieruchomości, dokumenty placeholder, 5 inwestorów indywidualnych, 5 instytucjonalnych, oferty, kontakty, automatyzacje — wszystko z polskimi imionami i miastami.

---

## Czego ŚWIADOMIE nie robię w MVP (zgodnie z Twoimi ograniczeniami)

- Realnych integracji z Make / Stripe / GetResponse / SMS / voicebot / Web2Learn — przygotowuję strukturę danych, statusy i webhooki-placeholdery. Endpointy w `src/routes/api/public/*` jako szkielet.
- Realnego scoringu AI — tylko placeholder „Moduł AI selekcji włączony/wyłączony”.
- E-maila transakcyjnego — pola gotowe, wysyłka oznaczana jako mock.
- Service role key NIE trafia do frontu. Operacje wrażliwe przez TanStack server functions z `requireSupabaseAuth`.

## Szczegóły techniczne

- **Stack**: TanStack Start v1 + React 19 + Tailwind v4 + shadcn/ui + Lovable Cloud (Supabase).
- **Routing**: file-based w `src/routes/`, layouty `_admin.tsx`, `_klient.tsx`, `_inwestor.tsx` chronione przez `beforeLoad` + role.
- **Bezpieczeństwo ról**: enum `app_role` + tabela `user_roles` + funkcja `has_role()` (SECURITY DEFINER) używana w RLS — nigdy nie sprawdzamy roli po stronie klienta jako jedynego mechanizmu.
- **Server functions** zamiast Edge Functions dla całej logiki aplikacyjnej.
- **Polskie etykiety** w jednym pliku `src/lib/labels.ts` (mapowanie status → polska nazwa) dla spójności.

---

## Pytanie przed startem

Plan jest duży. Jeśli go zaakceptujesz, **zaczynam od Fazy 1** (backend + auth + layout 3 paneli) i po jej zakończeniu przedstawię Ci klikalny szkielet, w którym będziesz mógł się zalogować jako każda z 4 ról. Potem ruszamy z Fazą 2.

Czy zatwierdzasz ten podział na fazy i kolejność, czy chcesz coś zmienić (np. zacząć od panelu klienta zamiast administratora, albo inaczej rozłożyć priorytety)?
