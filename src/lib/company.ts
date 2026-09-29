/**
 * Dane firmy Finance You — JEDNO źródło prawdy dla stron publicznych,
 * dokumentów, e-maili, botów i JSON-LD. Zmiana adresu, telefonu albo
 * rachunku — tylko tutaj (teksty umów w legal_documents mają własną wersję).
 */
export const COMPANY_DATA = {
  name: "Finance You",
  legalName: "Finance You sp. z o.o.",
  legalNameFull: "Finance You spółka z ograniczoną odpowiedzialnością",
  legalForm: "spółka z ograniczoną odpowiedzialnością",
  street: "ul. Nowogrodzka 31",
  postalCode: "00-511",
  city: "Warszawa",
  addressFull: "ul. Nowogrodzka 31, 00-511 Warszawa",
  krs: "0000635207",
  nip: "7010611803",
  regon: "365350668",
  shareCapital: "389 600,00 zł",
  representative: "Filip Bielak – Prezes Zarządu",
  website: "https://financeyou.pl",
  /** Jedyny publiczny adres e-mail (także w dokumentach od pakietu v7). */
  email: "kontakt@financeyou.pl",
  /** Infolinia i numer botów (Twilio) — strona, stopki, JSON-LD. */
  phone: { display: "+48 732 059 898", e164: "+48732059898" },
  /** Telefon kontaktowy wpisany w umowach inwestora (pakiet v7). */
  phoneContracts: { display: "889 888 700", e164: "+48889888700" },
  bank: {
    /** Rachunek do spłaty pożyczek udzielanych przez Finance You. */
    repayment: "56 1090 2590 0000 0001 5708 1371",
    /**
     * Rachunek na Prowizję Klientowską potrącaną z wypłaty (Zał. 6 do Umowy
     * ramowej / Zał. 4 do umowy pożyczki). Domyślnie ten sam rachunek —
     * do potwierdzenia przez właściciela (raport końcowy).
     */
    commission: "56 1090 2590 0000 0001 5708 1371",
  },
} as const;

/** „KRS 0000635207 · NIP 7010611803 · REGON 365350668”. */
export const COMPANY_REGISTRY_LINE = `KRS ${COMPANY_DATA.krs} · NIP ${COMPANY_DATA.nip} · REGON ${COMPANY_DATA.regon}`;
