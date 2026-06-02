# Pakiet Marketingowy — 4 moduły

Zbuduję kompletny pakiet marketingowy w panelu admina, zintegrowany z istniejącymi leadami i AI Gemini.

## Moduł 1: Email Marketing (`/admin/marketing/email`)
- **Tabele**: `email_campaigns`, `email_segments`, `email_subscribers`, `email_campaign_sends`
- **Funkcje**:
  - Tworzenie kampanii (temat, treść HTML, segment odbiorców)
  - Segmenty leadów (np. „nowi z ostatnich 7 dni", „status: kontakt", „kwota >500k")
  - AI generator treści email (Gemini) — wpisz cel → wygeneruj subject + body
  - Wysyłka przez istniejącą infrastrukturę Lovable Email (kolejka, retry)
  - Statystyki: wysłane / dostarczone / failed (z `email_send_log`)
  - Podgląd przed wysłaniem

## Moduł 2: Landing Pages & Lead Magnets (`/admin/marketing/landings`)
- **Tabele**: `landing_pages`, `lead_magnets`, `landing_submissions`
- **Funkcje**:
  - Tworzenie prostych landing pages (slug, headline, podtytuł, CTA, formularz)
  - Publikacja pod `/lp/:slug` (publiczna trasa SSR + SEO meta)
  - Lead magnety (np. „Ebook: jak dostać kredyt") — email gate
  - AI generator copy landingu (Gemini)
  - Lista zgłoszeń z każdej strony, eksport do leadów
  - Wbudowane UTM tracking

## Moduł 3: Campaign Tracking / UTM (`/admin/marketing/tracking`)
- **Tabele**: `marketing_campaigns`, `campaign_clicks`, `lead_attributions`
- **Funkcje**:
  - Generator linków UTM (utm_source, medium, campaign, term, content)
  - Skracarka linków: `/r/:code` → redirect + tracking
  - Dashboard: kliknięcia, leady, konwersja per kampania
  - Atrybucja leadów (źródło, kampania) — auto-zapis z UTM przy submission
  - ROI per kampania (jeśli ustawimy koszt)
  - Wykresy trendu (Recharts)

## Moduł 4: Social Media & AI Content (`/admin/marketing/social`)
- **Tabele**: `social_posts`, `content_ideas`
- **Funkcje**:
  - Planer postów (data, platforma: FB/IG/LinkedIn, treść, status)
  - AI generator postów (Gemini) — temat → 3 warianty pod różne platformy
  - Generator obrazków (Gemini 2.5 Flash Image / Nano Banana)
  - Bank pomysłów na content (AI brainstorm)
  - Kalendarz publikacji (widok miesięczny)
  - **Uwaga**: bez auto-publikacji do FB/IG (wymaga osobnej integracji Meta API) — planer + treści do skopiowania ręcznie. Auto-publikację możemy dodać później.

## Wspólne
- Wszystko za RLS — dostęp tylko admin/operator (przez `has_role`)
- Wpis w menu `admin.tsx` pod sekcją „Marketing"
- Każdy moduł: server functions (`createServerFn`) + osobna trasa TanStack
- AI przez Lovable AI Gateway (bez kluczy)

## Kolejność implementacji
Zbuduję moduły w kolejności:
1. **Tracking/UTM** (najszybszy ROI, fundament dla pozostałych)
2. **Email Marketing** (wykorzystuje istniejących leadów)
3. **Landing Pages** (zasila leadów + email)
4. **Social/AI Content** (najmniej krytyczny operacyjnie)

To 4 oddzielne tury (każdy moduł = 1 migracja + 1 zatwierdzenie). Zaczynam od modułu 1 (Tracking) po Twoim OK.

## Szczegóły techniczne
- RLS: `has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'operator')` na wszystkich tabelach admin
- Publiczne tabele (`landing_submissions` insert, `campaign_clicks` insert) — anon insert dozwolony
- Indexy na: `slug`, `code`, `campaign_id`, `created_at`
- AI: `google/gemini-2.5-flash` dla treści, `google/gemini-2.5-flash-image` dla obrazków
- Wykresy: Recharts (już w projekcie)
