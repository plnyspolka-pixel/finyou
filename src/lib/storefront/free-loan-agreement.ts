/**
 * Public sample of a standalone business-purpose loan agreement (no annexes).
 * No personal data collected, no AI, no storage; editable DOCX with placeholders.
 * The full investor agreement generator is a separate, authenticated process.
 */
import { blokiDoXml, spakujDocx, type Blok } from "@/lib/contract-engine/umowa-docx";

const para=(tekst:string):Blok=>({t:"akapit",runs:[{tekst}]});
const heading=(tekst:string):Blok=>({t:"naglowek",tekst});
export function freeLoanAgreementBlocks():Blok[] {
  return [
    {t:"tytul",tekst:"UMOWA POŻYCZKI PIENIĘŻNEJ"},
    {t:"podtytul",tekst:"Wzór do indywidualnego uzupełnienia — bez załączników"},
    para("Zawarta dnia [DATA] w [MIEJSCOWOŚĆ], pomiędzy:"),
    para("1. [IMIĘ I NAZWISKO / FIRMA POŻYCZKODAWCY], [ADRES], [PESEL / NIP / KRS], reprezentowanym przez [REPREZENTACJA], zwanym dalej „Pożyczkodawcą”,"),
    para("a"),
    para("2. [IMIĘ I NAZWISKO / FIRMA POŻYCZKOBIORCY], [ADRES], [NIP / KRS / PESEL], reprezentowanym przez [REPREZENTACJA], zwanym dalej „Pożyczkobiorcą”, łącznie zwanymi „Stronami”."),
    heading("§ 1. Przedmiot i cel pożyczki"),
    para("1. Pożyczkodawca udziela Pożyczkobiorcy pożyczki pieniężnej w wysokości [KWOTA CYFRAMI I SŁOWNIE] zł, zwanej dalej „Pożyczką”."),
    para("2. Pożyczkobiorca oświadcza, że Pożyczka jest przeznaczona wyłącznie na cel bezpośrednio związany z jego działalnością gospodarczą: [KONKRETNY CEL]. Strony potwierdzają status i przeznaczenie finansowania na dzień zawarcia Umowy."),
    heading("§ 2. Wypłata pożyczki"),
    para("1. Pożyczkodawca wypłaci Pożyczkę przelewem na rachunek Pożyczkobiorcy [NR RACHUNKU] najpóźniej do dnia [DATA], po spełnieniu uzgodnionych i wpisanych do Umowy warunków wypłaty: [WARUNKI]."),
    para("2. Za dzień wypłaty uznaje się dzień obciążenia rachunku Pożyczkodawcy. Wypłata jest dokumentowana potwierdzeniem przelewu."),
    heading("§ 3. Oprocentowanie i wynagrodzenie"),
    para("1. Oprocentowanie nominalne Pożyczki jest stałe i wynosi [OPROCENTOWANIE]% w stosunku rocznym, naliczane od pozostającego do spłaty kapitału w skali [BAZA DNI]."),
    para("2. Prowizja wynosi [KWOTA] zł i jest płatna [SPOSÓB I TERMIN ZAPŁATY]. Jeżeli prowizja nie jest należna, Strony wpisują „0 zł”."),
    para("3. Wszelkie koszty i świadczenia dodatkowe Strony wskazują wprost w Umowie i stosują wyłącznie w granicach bezwzględnie obowiązujących przepisów prawa."),
    heading("§ 4. Spłata pożyczki"),
    para("1. Pożyczkobiorca spłaci kapitał oraz należne odsetki najpóźniej do dnia [TERMIN SPŁATY] na rachunek Pożyczkodawcy [NR RACHUNKU], według następujących warunków spłaty wpisanych bezpośrednio do Umowy: [KWOTY, TERMINY RAT I ZASADY ZALICZANIA WPŁAT]."),
    para("2. Pożyczkobiorca może dokonać wcześniejszej spłaty; rozliczenie odsetek i kosztów następuje zgodnie z Umową oraz obowiązującymi przepisami."),
    heading("§ 5. Zabezpieczenie"),
    para("1. Strony uzgadniają jako zabezpieczenie: [OPIS NIERUCHOMOŚCI, NR KW, WŁAŚCICIEL, WIERZYTELNOŚĆ, SUMA HIPOTEKI, PIERWSZEŃSTWO I WARUNKI USTANOWIENIA]."),
    para("2. Ustanowienie hipoteki wymaga zachowania formy i czynności przewidzianych prawem, w tym odpowiednich oświadczeń i wpisu do księgi wieczystej. Niniejsza zwykła Umowa sama w sobie nie zastępuje wymaganej czynności notarialnej ani wpisu."),
    para("3. Ewentualne dobrowolne poddanie się egzekucji na podstawie art. 777 k.p.c. wymaga odrębnego aktu notarialnego o treści zgodnej z przepisami prawa."),
    heading("§ 6. Naruszenia i zaległości"),
    para("1. W przypadku opóźnienia Pożyczkobiorca płaci odsetki za opóźnienie w wysokości [STAWKA], jednak nie wyższej niż maksymalna dopuszczona przez prawo."),
    para("2. Pożyczkodawca może dochodzić należności lub wypowiedzieć Umowę wyłącznie na warunkach w niej wskazanych oraz zgodnie z przepisami; wymagane wezwania, terminy i doręczenia: [OPIS]."),
    heading("§ 7. Oświadczenia i korespondencja"),
    para("1. Każda ze Stron potwierdza prawdziwość podanych danych i umocowanie osób podpisujących."),
    para("2. Zawiadomienia związane z wykonywaniem Umowy doręcza się na adresy [ADRESY KORESPONDENCYJNE / E-MAIL] zgodnie z zasadami [SPOSÓB DORĘCZENIA]."),
    para("3. Zmiany Umowy wymagają formy przewidzianej prawem; gdy Strony zastrzegły formę szczególną, jej niezachowanie wywołuje skutki przewidziane w Umowie i przepisach."),
    heading("§ 8. Postanowienia końcowe"),
    para("1. W sprawach nieuregulowanych mają zastosowanie przepisy prawa polskiego, w szczególności Kodeksu cywilnego."),
    para("2. Strony otrzymały egzemplarze Umowy. Przed podpisaniem sprawdzono wszystkie pola, kwoty, daty, uprawnienia reprezentantów, zabezpieczenia i wymaganą formę czynności."),
    para("Pożyczkodawca: ___________________________"),
    para("Pożyczkobiorca: ___________________________"),
  ];
}
export async function freeLoanAgreementDocx():Promise<Uint8Array>{
  return spakujDocx(blokiDoXml(freeLoanAgreementBlocks()));
}
