/**
 * Regulamin Abonamentu Inwestora — podstawa płatności za dostęp do panelu
 * inwestora (decyzja właściciela 2026-09-30: płacąc, inwestor akceptuje
 * regulamin; umowy o dostęp do Klientów — Umowę ramową, NDA i RODO —
 * akceptuje później, gdy chce korzystać z modułu ofert).
 *
 * Sprzedawcą Abonamentu jest Fundacja Krzewienia Edukacji Finansowej
 * im. Pieczaka (domyślny podmiot faktur, zwolniony z VAT). Treść jest
 * generowana z tych samych stałych co cennik (lib/investor-plan/plans.ts),
 * a skrót każdej wersji pilnuje test — zmiana ceny wymaga nowej wersji.
 */
import {
  SUBSCRIPTION_YEARLY_DISCOUNT_PCT,
  SUBSCRIPTION_YEARLY_PER_MONTH_PLN,
} from "@/lib/investor-plan/plans";

/** Cena w brzmieniu umów — test pilnuje zgodności z ABONAMENT_UMOWA (pakiet-v7.ts). */
export const CENA_ABONAMENTU = "1 500,00 zł brutto za 30 dni albo 7 000,00 zł brutto za 365 dni";

export const REGULAMIN_ABONAMENTU_VERSION = "regulamin-abonamentu-inwestora-v1";
export const REGULAMIN_ABONAMENTU_DATA_PL = "30 września 2026 r.";
export const REGULAMIN_ABONAMENTU_PATH = "/regulamin-inwestora";

export const FUNDACJA = {
  nazwa: "Fundacja Krzewienia Edukacji Finansowej im. Pieczaka",
  adres: "ul. Wilhelma Orlika Ruckemana 4/18, 20-244 Lublin",
  krs: "0001140846",
  nip: "9462747637",
  regon: "540280180",
} as const;

export function regulaminAbonamentuInwestora(): string {
  const f = FUNDACJA;
  return `# REGULAMIN ABONAMENTU INWESTORA FINANCE YOU

**wersja 1 — obowiązuje od dnia ${REGULAMIN_ABONAMENTU_DATA_PL}**

## § 1. Postanowienia ogólne

1. Regulamin określa zasady sprzedaży i korzystania z Abonamentu — odpłatnego dostępu do panelu inwestora w systemie Finance You dostępnym pod adresem financeyou.pl.
2. Sprzedawcą Abonamentu i usługodawcą w zakresie Abonamentu jest ${f.nazwa} z siedzibą w Lublinie, ${f.adres}, wpisana do Krajowego Rejestru Sądowego pod numerem KRS ${f.krs}, NIP ${f.nip}, REGON ${f.regon} („Fundacja”).
3. System Finance You prowadzi Finance You spółka z ograniczoną odpowiedzialnością z siedzibą w Warszawie, ul. Nowogrodzka 31, 00-511 Warszawa, KRS 0000635207, NIP 7010611803 („Finance You”).
4. Kontakt w sprawach Abonamentu: kontakt@financeyou.pl.
5. Regulamin jest udostępniany nieodpłatnie przed zakupem Abonamentu, pod adresem financeyou.pl${REGULAMIN_ABONAMENTU_PATH}, w sposób umożliwiający jego pobranie, utrwalenie i odtworzenie. Akceptacja Regulaminu przy płatności jest warunkiem zakupu Abonamentu.

## § 2. Definicje

1. **Abonament** — odpłatny dostęp Inwestora do panelu inwestora w systemie Finance You przez Okres Abonamentowy.
2. **Inwestor** — osoba fizyczna, osoba prawna albo jednostka organizacyjna mająca konto inwestora w systemie Finance You.
3. **Konsument** — Inwestor będący osobą fizyczną, który kupuje Abonament w celu niezwiązanym bezpośrednio z jego działalnością gospodarczą lub zawodową; przepisy o Konsumencie stosuje się także do przedsiębiorcy na prawach konsumenta w zakresie przewidzianym prawem.
4. **Okres Abonamentowy** — opłacony okres Abonamentu: 30 albo 365 dni.
5. **Opłata Abonamentowa** — cena Abonamentu.
6. **Umowy o dostęp do Klientów** — Ramowa umowa pośrednictwa finansowego świadczonego na odległość, umowa o zachowaniu poufności i zakazie obchodzenia (NDA) oraz umowa udostępniania i powierzenia danych osobowych (RODO), zawierane przez Inwestora z Finance You.

## § 3. Zakres Abonamentu

1. W Okresie Abonamentowym Inwestor ma dostęp do modułów panelu inwestora, w szczególności: analityki (księga wieczysta, właściciele, analiza księgi, ocena ryzyka), dokumentów i kreatora umów, windykacji, modułu AML, Akademii i kalkulatora compliance, a także do pipeline'u inwestora, w którym uzupełnia dane, przechodzi weryfikację tożsamości i zawiera Umowy o dostęp do Klientów.
2. Dostęp do Klientów, Projektów i ofert (moduł ofert: Zlecenia, dopasowane Projekty, dane Klientów i oferty) wymaga ponadto zawarcia Umów o dostęp do Klientów. Inwestor akceptuje je w panelu po zakupie Abonamentu, gdy chce korzystać z modułu ofert. Umowy o dostęp do Klientów nie przewidują wynagrodzenia Finance You od Inwestora.
3. Abonament nie obejmuje finansowania żadnego Projektu, nie gwarantuje przedstawienia Projektu ani zawarcia transakcji i nie stanowi doradztwa inwestycyjnego.

## § 4. Cena i płatność

1. Opłata Abonamentowa wynosi ${CENA_ABONAMENTU}, według wyboru Inwestora. W wariancie rocznym odpowiada to ok. ${SUBSCRIPTION_YEARLY_PER_MONTH_PLN} zł miesięcznie — ${SUBSCRIPTION_YEARLY_DISCOUNT_PCT}% mniej niż za dwanaście okresów 30-dniowych.
2. Fundacja korzysta ze zwolnienia z VAT (art. 113 ust. 1 ustawy o podatku od towarów i usług) — cena netto jest równa cenie brutto.
3. Opłata Abonamentowa jest płatna z góry, jednorazowo za wybrany Okres Abonamentowy, za pośrednictwem operatora płatności Tpay — przelewem albo BLIK-iem, bez konieczności podawania danych karty płatniczej. Abonament nie odnawia się automatycznie.
4. Okres Abonamentowy biegnie od zaksięgowania płatności, a jeżeli poprzedni opłacony okres jeszcze trwa — od jego końca.
5. Fundacja wystawia fakturę za Abonament i przesyła ją na adres e-mail podany przy płatności; faktura jest dostępna także w panelu (zakładka Dostęp i płatności).

## § 5. Zawarcie umowy i dostęp

1. Umowa o Abonament zostaje zawarta z chwilą akceptacji Regulaminu i zlecenia płatności. Dostęp do panelu jest włączany po zaksięgowaniu płatności.
2. Konsument może przy płatności zażądać rozpoczęcia świadczenia przed upływem terminu odstąpienia od umowy.
3. Do korzystania z panelu potrzebne są urządzenie z dostępem do internetu, aktualna przeglądarka internetowa z włączoną obsługą JavaScript i plików cookies niezbędnych do logowania oraz aktywny adres e-mail.
4. Inwestor nie może dostarczać treści o charakterze bezprawnym ani udostępniać swojego konta osobom trzecim.

## § 6. Odstąpienie od umowy przez Konsumenta

1. Konsument może odstąpić od umowy o Abonament w terminie 14 dni od jej zawarcia, bez podania przyczyny, składając oświadczenie w szczególności na adres kontakt@financeyou.pl.
2. Jeżeli Konsument zażądał rozpoczęcia świadczenia przed upływem terminu odstąpienia, zwrotowi podlega Opłata Abonamentowa pomniejszona o kwotę proporcjonalną do wykorzystanej części Okresu Abonamentowego; w pozostałych przypadkach zwrotowi podlega cała Opłata Abonamentowa.
3. Zwrot następuje niezwłocznie, nie później niż w terminie 14 dni od otrzymania oświadczenia o odstąpieniu, przy użyciu takiego samego sposobu płatności, jakiego użył Konsument, chyba że Konsument zgodzi się na inny sposób.
4. Odstąpienie od umowy o Abonament nie jest odstąpieniem od Umów o dostęp do Klientów — ich zasady określają te umowy. Po zakończeniu Abonamentu dostęp do modułów panelu, w tym do modułu ofert, zostaje wstrzymany.

## § 7. Wygaśnięcie Abonamentu

1. Po upływie Okresu Abonamentowego dostęp do modułów panelu jest wstrzymany do czasu opłacenia kolejnego okresu. Dane i dokumenty Inwestora nie są usuwane.
2. Inwestor może w każdej chwili opłacić kolejny Okres Abonamentowy; zostanie on doliczony od końca bieżącego.

## § 8. Zmiany ceny i Regulaminu

1. Zmiana Opłaty Abonamentowej obowiązuje wyłącznie na przyszłość, dla Okresów Abonamentowych opłaconych po jej wejściu w życie. Opłacony Okres Abonamentowy nie podlega zmianie.
2. O zmianie Regulaminu Fundacja informuje Inwestorów e-mailem albo w panelu co najmniej 14 dni przed jej wejściem w życie. Zmiana nie dotyczy opłaconych Okresów Abonamentowych.

## § 9. Reklamacje

1. Reklamacje dotyczące Abonamentu można składać na adres kontakt@financeyou.pl, opisując problem i podając adres e-mail konta.
2. Fundacja rozpatruje reklamację w terminie 14 dni od jej otrzymania i odpowiada na adres e-mail Inwestora.
3. Konsument może skorzystać z pozasądowych sposobów rozpatrywania reklamacji i dochodzenia roszczeń, w szczególności z pomocy miejskiego lub powiatowego rzecznika konsumentów.

## § 10. Dane osobowe

1. Administratorem danych osobowych przetwarzanych w związku ze sprzedażą Abonamentu, płatnościami i fakturami jest Fundacja; w zakresie korzystania z systemu Finance You — Finance You.
2. Szczegółowe zasady przetwarzania danych opisuje Polityka prywatności dostępna pod adresem financeyou.pl/polityka-prywatnosci.

## § 11. Postanowienia końcowe

1. Do umowy o Abonament stosuje się prawo polskie. Wobec Konsumenta wybór prawa nie pozbawia go ochrony przysługującej mu na podstawie bezwzględnie obowiązujących przepisów.
2. Regulamin obowiązuje od dnia ${REGULAMIN_ABONAMENTU_DATA_PL}
`;
}
