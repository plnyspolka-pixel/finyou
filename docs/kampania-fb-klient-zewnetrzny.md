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

## Formularz błyskawiczny dla klienta — dokąd trafiają leady

Kampania na **formularz błyskawiczny** (Lead Ads) zbiera kontakty po stronie
Facebooka. Te leady **nie są leadami Finance You** — nie zakładamy im wniosku
pożyczkowego ani konta, nie dzwoni do nich voicebot i nie dostają SMS-a z ofertą
pożyczki. Odcina je pole `client_forward_url` w tabeli `meta_lead_forms`:

- puste → stara ścieżka Finance You (wniosek, konto, follow-upy, telefon);
- ustawione → synchronizacja zapisuje leada w `meta_leads` (podgląd i ochrona
  przed duplikatami) i wysyła go POST-em na adres panelu klienta, po czym kończy
  przetwarzanie tego leada.

Payload dla klienta: `meta_lead_id`, `imie`, `telefon`, `email`, `utworzono`,
`kampania_id`, `reklama_id`, `formularz_id` oraz `pola` (komplet odpowiedzi).
Sekret z `client_forward_secret` leci w nagłówku `x-lead-secret`, żeby panel
klienta wiedział, że lead jest od nas.

Gdy panel klienta nie odpowie, lead zostaje zapisany u nas, a błąd ląduje w
`meta_lead_forms.last_error` i w podsumowaniu synchronizacji — widać go w panelu
i można leada dosłać ręcznie.

## Gotowy szablon

W kroku 1 są dwa szablony kampanii dla szalunków:

- **„Szalunki Lublin — formularz błyskawiczny"** — kampania na formularz Meta
  pytający o imię i nazwisko, telefon i e-mail, z polityką prywatności klienta
  (`szalunki-lublin.pl/polityka-prywatnosci`).
- **„Szalunki Lublin — zapytania ze strony"** — reklama prowadzi na formularz na
  stronie klienta, konwersje liczy piksel.

Oba wypełniają nazwę kampanii, budżet 50 zł/dzień, wiek 25–60, tylko główne
kanały, wyłączone poszerzanie grupy, CTA „Otrzymaj wycenę" oraz nagłówek, opis i
tekst reklamy, i oba **wyłączają remarketing Finance You** — kampania klienta nie
ma chodzić na naszym ruchu. Nie ruszają wybranego konta reklamowego, strony
Facebook, piksela ani zainteresowań. Po wstawieniu szablonu zostaje: wybrać konto
i stronę, kliknąć preset lokalizacji i wgrać grafikę (a dla wariantu ze stroną —
utworzyć piksel).

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
6. **Krok 2 — Budżet.** Budżet dzienny, ewentualne daty startu/końca oraz
   **co ma się stać po publikacji**: domyślnie kampania zostaje wstrzymana,
   ale można wybrać „Włącz od razu" — wtedy kampania, zestaw i reklama powstają
   jako ACTIVE i po akceptacji przez Meta zaczynają wydawać budżet.
7. **Krok 3 — Targetowanie.** Preset lokalizacji i zainteresowań, wiek, płeć,
   umiejscowienia.
8. **Krok 4 — Kreacja.** Nagłówek, tekst, opis, CTA (dla strony WWW sensowne są
   „Otrzymaj wycenę" / „Skontaktuj się") i zdjęcie.
9. **Krok 6 — Podgląd.** Kreator wypisze, czego brakuje do publikacji.
10. **Publikuj.** Domyślnie kampania, zestaw reklam i reklama powstają w Meta
    jako **PAUSED** — włączasz je w Menedżerze reklam po sprawdzeniu kreacji i
    rozliczeń. Z ustawieniem „Włącz od razu" startują aktywne.

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

- Kampania domyślnie powstaje wstrzymana; „Włącz od razu" to świadomy wybór w
  kroku 2 — od tego momentu pilnowanie budżetu jest po stronie człowieka.
- Reklama i tak przechodzi weryfikację Meta, a konto reklamowe musi mieć
  wpiętą metodę płatności — bez tego publikacja z ACTIVE się nie powiedzie.
- `META_ACCESS_TOKEN` musi mieć uprawnienia `ads_management` do konta
  reklamowego, na którym tworzymy piksel i kampanię.
- Konto reklamowe rozlicza się w swojej walucie — budżet 50 na koncie w EUR to
  50 EUR, nie 50 zł.
- Optymalizacja pod `Lead` bez danych w pikselu potrafi nie wydawać budżetu —
  stąd wariant „wejścia na stronę" na start.
