/**
 * Standalone product terms and Art. 28 GDPR data-processing agreement.
 * Separate from the existing investor NDA / inter-administrator arrangement.
 * Content is immutable within a release, with SHA-256 snapshots in the DB.
 * Legal review and the actual list of subprocessors must remain maintained.
 */
export const STORE_TERMS_VERSION = "1.0-2026-11-02";
export const STORE_DPA_VERSION = "1.0-2026-11-02";
export const STORE_TERMS = `REGULAMIN SKLEPU CYFROWEGO FINANCE YOU
Wersja ${STORE_TERMS_VERSION}

1. Usługodawca. Usługi jednostkowe objęte niniejszym regulaminem świadczy Finance You sp. z o.o., dane kontaktowe: kontakt@financeyou.pl. Umowy abonamentu inwestora są odrębnie regulowane i nie są objęte tym zakupem.
2. Przedmiot. Sklep umożliwia zakup dostępu do wskazanej lekcji, pakietu szkoleń, jednorazowego wygenerowania dokumentu według wzoru albo analizy podanego numeru księgi wieczystej. Zakres i cena brutto są przedstawiane w koszyku przed rozpoczęciem płatności.
3. Zawarcie umowy. Kupujący zakłada lub posiada konto, wskazuje dane nabywcy, akceptuje niniejsze warunki, a następnie zleca płatność Tpay. Realizacja następuje po potwierdzeniu płatności przez operatora. Sam powrót z Tpay nie stanowi potwierdzenia zapłaty.
4. Dostęp. Kupujący uzyskuje dostęp do nabytej treści wyłącznie na własnym koncie. Prawo dostępu do materiałów ma charakter osobisty i niewyłączny; kopiowanie i redystrybucja są niedozwolone poza dozwolonym użytkiem ustawowym.
5. Dokumenty. Dokumenty są automatycznie generowane na podstawie danych podanych przez użytkownika. Weryfikacja prawidłowości tych danych, treści, wymogów formy oraz zastosowania dokumentu do konkretnej sprawy należy do użytkownika. Dokument nie zastępuje indywidualnej obsługi prawnej.
6. Analiza KW. Formalnie prawidłowy numer księgi nie oznacza, że istnieje możliwy do pozyskania odpis. Raport zależy od dostępności źródeł. W razie braku możliwości wykonania usługi kupujący może złożyć reklamację i żądać rozwiązania umowy oraz zwrotu zapłaconej kwoty stosownie do przepisów.
7. Treści i usługi cyfrowe. Sprzedawca odpowiada za zgodność świadczenia z umową na zasadach bezwzględnie obowiązujących przepisów. Reklamacje: kontakt@financeyou.pl. Odpowiedź na reklamację konsumenta w ustawowym terminie.
8. Odstąpienie. Konsumentowi przysługuje ustawowe prawo odstąpienia, chyba że zachodzi przewidziany prawem wyjątek. W przypadku treści cyfrowych niedostarczanych na nośniku materialnym prawo to może wygasnąć po rozpoczęciu świadczenia, wyłącznie gdy konsument udzielił uprzedniej wyraźnej zgody na rozpoczęcie przed upływem terminu, przyjął do wiadomości utratę prawa odstąpienia i otrzymał wymagane potwierdzenie. Dla usług cyfrowych stosuje się właściwe odrębne reguły. Sam checkbox nie uchyla praw ustawowych.
9. Dane osobowe. Zasady przetwarzania danych konta i płatności opisuje polityka prywatności. Jeżeli klient zleca przetwarzanie danych osób trzecich na jego rzecz, przed użyciem generatora zawierana jest odrębna umowa powierzenia. Klient odpowiada za legalność przekazania takich danych.
10. Dostęp techniczny. Do usługi potrzebne jest połączenie z internetem, aktualna przeglądarka i konto. Nie narusza to ustawowych obowiązków aktualizacji i zgodności świadczeń cyfrowych.
11. Prawo właściwe. Prawo polskie, z zachowaniem bezwzględnie obowiązującej ochrony konsumenckiej. Regulamin i potwierdzenie zamówienia są udostępniane w sposób pozwalający na utrwalenie.`;

export const STORE_DPA = `UMOWA POWIERZENIA PRZETWARZANIA DANYCH OSOBOWYCH (ART. 28 RODO)
Wersja ${STORE_DPA_VERSION}

1. Strony i role. Administratorem danych osób trzecich wprowadzanych do kreatora jest użytkownik prowadzący własną działalność lub inny uprawniony administrator; podmiotem przetwarzającym jest Finance You sp. z o.o. Umowa obejmuje tylko czynności, w których Finance You faktycznie działa na udokumentowane polecenie użytkownika. W zakresie kont, płatności, bezpieczeństwa własnej platformy i obowiązków prawnych Finance You jest odrębnym administratorem.
2. Przedmiot i czas. Powierzenie trwa od potwierdzenia niniejszej umowy przez czas świadczenia usług generatora i zgodnej z polityką retencji obsługi powstałych dokumentów, z zastrzeżeniem obowiązku wcześniejszego usunięcia na polecenie administratora i ustawowych obowiązków przechowywania.
3. Charakter i cele. Przechowanie pól formularza, odczyt danych, uzupełnienie dokumentów, przygotowanie podglądu i plików, dostęp użytkownika do wyników, na jego odrębne polecenie także przesłanie do podpisu. Zabronione jest używanie powierzonych danych do trenowania modeli lub własnych celów marketingowych.
4. Osoby i dane. Potencjalne kategorie: pożyczkobiorcy, pożyczkodawcy, poręczyciele, właściciele i współwłaściciele nieruchomości, reprezentanci, sygnatariusze. Dane mogą obejmować imię, nazwisko, adres, PESEL, NIP, KRS, numer KW, informacje o umowie, zabezpieczeniu i zobowiązaniu, rachunek bankowy oraz dane kontaktowe. Dane szczególnych kategorii należy przekazywać tylko gdy jest to konieczne i istnieje właściwa podstawa prawna.
5. Instrukcje. Udokumentowanymi poleceniami są dane wprowadzone w formularzu, wybór szablonu oraz akcje użytkownika w systemie. Procesor nie wykorzystuje danych do własnych celów i informuje administratora o instrukcji, która jego zdaniem narusza prawo.
6. Poufność i środki bezpieczeństwa. Finance You zapewnia poufność osób upoważnionych, kontrolę ról, prywatne zasoby danych i plików, szyfrowanie transmisji, dziennik zdarzeń, mechanizmy odtwarzania oraz okresowe przeglądy uprawnień. Udostępnia administratorowi opis stosowanych środków bezpieczeństwa.
7. Podprocesorzy. Administrator udziela ogólnej zgody na korzystanie z koniecznych dostawców infrastruktury, obsługi plików, podpisu elektronicznego, e-mail oraz usług AI w zakresie faktycznie wykorzystywanym przez funkcję. Finance You prowadzi aktualną listę podprocesorów dostępną na żądanie, uprzedza o planowanych zmianach i umożliwia sprzeciw w rozsądnym terminie. Z podprocesorami zawiera umowy nakładające obowiązki co najmniej równoważne. Transfer poza EOG wymaga zgodnej z RODO podstawy i odpowiednich zabezpieczeń.
8. Pomoc administratorowi. Procesor pomaga, uwzględniając charakter przetwarzania, realizować prawa osób, zgłaszać naruszenia, wykonywać DPIA i konsultacje z organem nadzorczym, w zakresie odpowiednich informacji dostępnych procesorowi.
9. Naruszenia. Finance You zgłasza administratorowi naruszenie ochrony powierzonych danych bez zbędnej zwłoki od jego stwierdzenia, podając dostępne okoliczności, skutki i podjęte środki.
10. Usunięcie lub zwrot. Po zakończeniu usług procesor na wybór administratora usuwa lub zwraca powierzone dane i ich kopie, chyba że prawo wymaga przechowywania. Usunięcie z kopii zapasowych następuje zgodnie z udokumentowanym harmonogramem retencji i odtwarzania.
11. Kontrola. Procesor udostępnia niezbędne informacje do wykazania wykonania obowiązków art. 28 RODO oraz umożliwia audyty, w tym inspekcje, na uzgodnionych zasadach chroniących bezpieczeństwo innych klientów.
12. Odpowiedzialność administratora. Administrator potwierdza istnienie właściwej podstawy przetwarzania i realizację obowiązków informacyjnych wobec osób, których dane przekazuje; nie przesyła danych wykraczających poza niezbędny zakres.
13. Zawarcie. Strony zawierają umowę elektronicznie poprzez osobne zaznaczenie oświadczenia i potwierdzenie w uwierzytelnionej sesji. Zapisywana jest pełna treść, SHA-256, wersja, konto i czas akceptacji. Umowa nie uruchamia warunkowego Modułu B odrębnej umowy inwestorskiej bez wymaganego polecenia dotyczącego tamtej relacji.`;

export type StoreLegalCode = "store_terms" | "store_dpa";
export function getStoreLegal(code: StoreLegalCode) {
  return code === "store_terms"
    ? { code, version: STORE_TERMS_VERSION, title: "Regulamin sklepu produktów cyfrowych", text: STORE_TERMS }
    : { code, version: STORE_DPA_VERSION, title: "Umowa powierzenia danych dla generatora", text: STORE_DPA };
}
export async function storeLegalSha(code: StoreLegalCode) {
  const bytes = new TextEncoder().encode(getStoreLegal(code).text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
