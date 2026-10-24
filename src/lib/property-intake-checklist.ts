/**
 * Jedno źródło prawdy: co klient-pożyczkobiorca przygotowuje dla danego
 * rodzaju zabezpieczenia. Z tej samej listy korzysta wniosek na stronie
 * głównej (krok „Zdjęcia i numer KW” → „Co przygotować”) oraz Ania (A1),
 * która przyjmuje zgłoszenia — dzięki temu bot zbiera dokładnie to samo,
 * co formularz, i nie musi tego wymyślać.
 */

export type IntakePropertyKey = "mieszkanie" | "dom" | "lokal" | "rolna" | "budowlana" | "inna";

export type IntakePropertyType = {
  key: IntakePropertyKey;
  /** Wartości SecurityType używane we wniosku (loan-math / formularz). */
  securityTypes: string[];
  title: string;
  /** Jak klient może to nazwać w rozmowie — podpowiedź dla bota. */
  aliases: string[];
  /** Lista z wniosku na stronie (pokazywana klientowi w kroku 2). */
  docs: string[];
};

export const INTAKE_PROPERTY_TYPES: IntakePropertyType[] = [
  {
    key: "mieszkanie",
    securityTypes: ["mieszkanie"],
    title: "Mieszkanie",
    aliases: ["mieszkanie", "lokal mieszkalny", "kawalerka", "M"],
    docs: ["Numer księgi wieczystej", "Zdjęcia każdego pomieszczenia", "Zdjęcia z zewnątrz"],
  },
  {
    key: "dom",
    securityTypes: ["dom"],
    title: "Dom / dom w budowie",
    aliases: ["dom", "budynek", "dom w budowie", "bliźniak", "szeregowiec", "kamienica"],
    docs: [
      "Numer księgi wieczystej",
      "Zdjęcia z zewnątrz całego budynku",
      "Zdjęcia każdego pomieszczenia (z wyjątkiem piwnicy i strychu)",
      "Powierzchnia użytkowa",
    ],
  },
  {
    key: "lokal",
    securityTypes: ["lokal_uslugowy"],
    title: "Lokal użytkowy / usługowy",
    aliases: ["lokal usługowy", "lokal użytkowy", "sklep", "biuro", "hala", "magazyn"],
    docs: [
      "Numer księgi wieczystej",
      "Zdjęcia każdego pomieszczenia",
      "Zdjęcia z zewnątrz",
      "Powierzchnia użytkowa (jeżeli lokal nie jest w bloku)",
    ],
  },
  {
    key: "rolna",
    securityTypes: ["grunt_rolny"],
    title: "Grunt rolny",
    aliases: ["grunt rolny", "działka rolna", "pole", "ziemia rolna", "las"],
    docs: ["Wypis z rejestru gruntów", "Numer księgi wieczystej (jeżeli nie ma go na wypisie)"],
  },
  {
    key: "budowlana",
    securityTypes: ["dzialka_budowlana"],
    title: "Działka budowlana",
    aliases: ["działka budowlana", "działka pod zabudowę", "plac"],
    docs: ["Numer księgi wieczystej", "MPZP albo warunki zabudowy"],
  },
  {
    key: "inna",
    securityTypes: ["inna"],
    title: "Inna nieruchomość",
    aliases: ["inna"],
    docs: [
      "Numer księgi wieczystej",
      "Zdjęcia nieruchomości (z zewnątrz i wnętrza, jeśli jest budynek)",
      "Krótki opis, co to za nieruchomość",
    ],
  },
];

/**
 * Twarda instrukcja zbierania zgłoszenia — doklejana NA SAMĄ GÓRĘ promptu
 * agenta przyjmującego zgłoszenia pożyczkobiorców (A1). Generowana z
 * INTAKE_PROPERTY_TYPES, więc zmiana listy we wniosku zmienia też bota.
 */
export function buildIntakeChecklistRules(): string {
  const lists = INTAKE_PROPERTY_TYPES.map(
    (t) =>
      `• ${t.title.toUpperCase()} (klient może powiedzieć: ${t.aliases.join(", ")}):\n` +
      t.docs.map((d) => `   - ${d}`).join("\n"),
  ).join("\n");

  return `=== PRZYJMOWANIE ZGŁOSZENIA — PROCEDURA STAŁA (ma pierwszeństwo przed resztą promptu) ===
Ta procedura jest zapisana w kodzie systemu i jest taka sama jak wniosek na stronie financeyou.pl. Nie zmieniasz jej i nie dokładasz własnych pytań.

KROK 1 — ZABEZPIECZENIE. Pierwsze pytanie merytoryczne: jaka nieruchomość będzie zabezpieczeniem. Ustal rodzaj (jeden z poniższych) i miejscowość.
- NIE pytasz o cel pożyczki, przeznaczenie środków ani „na co potrzebne pieniądze”. Nigdy.
- Jeśli rodzaj jest niejasny, dopytaj jednym pytaniem z wyborem (np. „To mieszkanie czy dom?”).

KROK 2 — LISTA DLA TEGO RODZAJU. Prosisz DOKŁADNIE o to, co jest na liście dla wybranego rodzaju — nic więcej, nic mniej:
${lists}

KROK 3 — JAK ZEBRAĆ (wybierz według kanału i woli klienta):
a) Wniosek na stronie: wyślij / podaj link do wniosku — tam klient wgra zdjęcia i dokumenty z tej samej listy.
b) Wiadomości (Messenger, czat, Instagram): możesz zebrać listę od razu w rozmowie — numer KW wpisany w wiadomości, zdjęcia i dokumenty jako załączniki. Proś po kolei, po jednej rzeczy, i potwierdzaj, co już doszło.
c) Telefon / rozmowa głosowa: numer KW i powierzchnię możesz przyjąć ustnie. Zdjęć i dokumentów przez telefon nie przyjmiesz — wyślij SMS z linkiem do wniosku albo poproś o przesłanie ich wiadomością.
- Klient nie ma numeru KW pod ręką: podpowiedz, że sprawdzi go w mObywatelu albo może dołączyć akt własności.
- Gdy lista dla danego rodzaju jest kompletna (albo klient woli dokończyć na stronie) — przejdź do kontaktu/wysłania linku zgodnie z resztą promptu.

KROK 4 — KWOTA I TERMIN możesz dopytać krótko, jeśli prompt tego wymaga. Bez pytania o cel.
=== KONIEC PROCEDURY STAŁEJ ===

`;
}
