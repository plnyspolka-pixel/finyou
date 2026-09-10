# Kampania FB dla klienta zewnętrznego (formularz na jego stronie)

Kreator `Admin → FB Ads → Kreator` obsługuje dwa warianty kampanii:

- **Formularz na Facebooku (Lead Ads)** — dotychczasowy tryb kampanii Finance You:
  leady wpadają do formularza FB i są zaciągane przez synchronizację Meta.
- **Formularz na stronie WWW (piksel)** — reklama prowadzi na stronę klienta,
  konwersje liczy piksel. Ten tryb powstał pod kampanie prowadzone z naszego
  konta reklamowego dla klientów (np. wynajem szalunków w Lublinie).

Co robi tryb „strona WWW":

- kampania z celem **kontakty** (`OUTCOME_LEADS`) i optymalizacją pod zdarzenie
  `Lead` z piksela, albo — na start, zanim piksel się nauczy — z celem **ruch**
  i optymalizacją pod wejścia na stronę;
- adres strony dostaje automatycznie UTM-y (`utm_source=facebook`,
  `utm_medium=paid_social`, `utm_campaign=<nazwa kampanii>`), więc leady w panelu
  klienta są podpisane źródłem;
- **nie** podpina audiencji remarketingowych Finance You — kampania klienta
  chodzi na jego pikselu, nie na naszym ruchu;
- nie tworzy formularza leadowego na Facebooku.

## Umiejscowienia — dlaczego domyślnie „tylko główne kanały"

W kreatorze (krok 3) są trzy tryby:

| Tryb | Co obejmuje |
| --- | --- |
| Tylko główne kanały (domyślny) | aktualności Facebooka + feed Instagrama |
| Główne kanały + Reels | jw. + Reels na FB i IG |
| Automat Meta | automatyczny dobór, ale wyłącznie w obrębie FB i IG |

W żadnym trybie nie włączamy **Audience Network** ani **Messengera** — to tam
najczęściej przepalają się wyświetlenia poza właściwymi kanałami. Osobnym
przełącznikiem jest **poszerzanie grupy przez Meta** (Advantage+ audience);
domyślnie wyłączone, żeby kampania trzymała się wskazanych zainteresowań.
Kreacja jest też wypisana z „ulepszeń" Meta (`standard_enhancements` →
`OPT_OUT`), więc reklama idzie dokładnie w takiej formie, w jakiej ją wgramy.

## Zasięg „miasto + X km"

Meta nie przyjmuje promienia większego niż **80 km** wokół jednego miasta.
Dlatego „Lublin + 100 km" składamy z kilku okręgów: Lublin 80 km plus po 25 km
wokół Zamościa, Białej Podlaskiej, Stalowej Woli i Łukowa. Przycisk
**Preset: Lublin + 100 km + buduje się** (krok 3) pobiera z Meta klucze tych
miast i zestaw zainteresowań wskazujących na trwającą budowę (budowa domu,
budownictwo, dom jednorodzinny, beton, materiały budowlane, projekt domu,
kredyt hipoteczny, remont, wykonawca budowlany). Promienie i pojedyncze miasta
można potem dowolnie zmieniać lub usuwać.

Klucze lokalizacji i identyfikatory zainteresowań zawsze pochodzą z wyszukiwarki
Meta — nie są wpisane na sztywno w kodzie.

## Krok po kroku: kampania na formularz na stronie klienta

1. **Krok 1 — Konto.** Nazwa kampanii, konto reklamowe (budżet jest liczony w
   walucie konta — dla konta w PLN 50 = 50 zł), strona Facebook, z której idzie
   reklama.
2. **Gdzie klient zostawia kontakt** → „Formularz na stronie WWW (piksel)".
3. **Adres strony z formularzem** — pełny adres `https://…`.
4. **Piksel** — wybierz istniejący albo wpisz nazwę i kliknij „Utwórz piksel".
   Nowy piksel powstaje na koncie reklamowym wybranym w kroku 1; jego numer
   trzeba wpiąć na stronie klienta.
5. **Pod co optymalizować** — na starcie „Wejścia na stronę" (piksel nie ma
   jeszcze danych), po kilkudziesięciu zapytaniach przełącz kampanię na
   „Zdarzenie Lead z piksela".
6. **Krok 2 — Budżet.** Budżet dzienny i ewentualne daty startu/końca.
7. **Krok 3 — Targetowanie.** Preset lokalizacji i zainteresowań, wiek, płeć,
   umiejscowienia.
8. **Krok 4 — Kreacja.** Nagłówek, tekst, opis, CTA (dla strony WWW sensowne są
   „Otrzymaj wycenę" / „Skontaktuj się") i zdjęcie.
9. **Krok 6 — Podgląd.** Kreator wypisze, czego brakuje do publikacji.
10. **Publikuj.** Kampania, zestaw reklam i reklama powstają w Meta jako
    **PAUSED** — trzeba je świadomie włączyć w Menedżerze reklam po sprawdzeniu
    kreacji i rozliczeń.

## Co musi się znaleźć na stronie klienta

Bez tego kampania będzie działać, ale nie policzy konwersji:

1. **Kod bazowy piksela** w `<head>` każdej podstrony — numer piksela z kroku 4
   (Menedżer zdarzeń → wybrany piksel → „Zainstaluj kod ręcznie" ma gotowy
   fragment).
2. **Zdarzenie `Lead`** po udanym wysłaniu formularza kontaktowego:

   ```js
   window.fbq?.("track", "Lead");
   ```

   Wywołane dopiero po zapisaniu zapytania (nie przy kliknięciu przycisku),
   żeby nie liczyć nieudanych wysyłek.
3. **Zapis źródła** — formularz powinien czytać `utm_source` z adresu i
   zapisywać je przy zapytaniu, żeby w panelu było widać, które zapytania
   przyszły z Facebooka.
4. **Polityka prywatności i zgody** — po stronie strony docelowej; przy
   formularzu na stronie Meta nie podstawia własnej zgody.

## Ograniczenia, o których warto pamiętać

- Kampania powstaje wyłącznie jako wstrzymana; włączenie i pilnowanie budżetu
  jest po stronie człowieka.
- `META_ACCESS_TOKEN` musi mieć uprawnienia `ads_management` do konta
  reklamowego, na którym tworzymy piksel i kampanię.
- Konto reklamowe rozlicza się w swojej walucie — budżet 50 na koncie w EUR to
  50 EUR, nie 50 zł.
- Optymalizacja pod `Lead` bez danych w pikselu potrafi nie wydawać budżetu —
  stąd wariant „wejścia na stronę" na start.
