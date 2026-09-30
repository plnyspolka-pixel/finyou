-- =====================================================================
-- Polityka prywatności v2, § 15 ust. 6 — mechanizm zgód na cookies
-- jest wdrożony (baner, „Ustawienia cookies”, /polityka-cookies,
-- rejestr zgód cookie_consent_log).
--
-- Zmiana informacyjna w obowiązującej wersji 2 (bez nowej wersji i bez
-- ponownej akceptacji). Treść jak w src/lib/legal/zgody-v2.ts
-- (POLITYKA_V2_COOKIES_NEW). Idempotentna.
-- =====================================================================

update public.consent_documents
   set content = replace(
         content,
         '6. Użytkownik może zarządzać cookies poprzez ustawienia przeglądarki lub mechanizm zgód dostępny na Platformie, jeżeli został wdrożony.',
         '6. Cookies analityczne (Google Analytics, Microsoft Clarity) i marketingowe (piksel Meta i Conversions API, Google Ads) są uruchamiane wyłącznie po wyrażeniu zgody w banerze wyświetlanym przy pierwszej wizycie. Zgodę można w każdej chwili zmienić lub wycofać w „Ustawieniach cookies” dostępnych w stopce strony, bez wpływu na zgodność z prawem przetwarzania dokonanego przed jej wycofaniem. Finance You zapisuje historię udzielonych i wycofanych zgód na cookies (identyfikator zgody, wybrane kategorie, data, skrócony adres IP, informacje o przeglądarce) w celu wykazania ich udzielenia – przez okres 3 lat od ostatniej zmiany. Cookies można również blokować lub usuwać w ustawieniach przeglądarki. Wykaz stosowanych cookies zawiera [Polityka cookies](https://financeyou.pl/polityka-cookies).'
       ),
       updated_at = now()
 where kind = 'privacy'::public.consent_kind
   and version = 2
   and position('6. Użytkownik może zarządzać cookies poprzez ustawienia przeglądarki lub mechanizm zgód dostępny na Platformie, jeżeli został wdrożony.' in content) > 0;
