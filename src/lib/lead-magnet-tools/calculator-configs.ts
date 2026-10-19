/**
 * Startowe kalkulatory-lead-magnety (brief 5.4 „Start”). Dane, nie kod —
 * każda konfiguracja przechodzi `validateCalculatorConfig` (schemat, biała
 * lista formuł, przypadki testowe) i bramkę compliance w testach.
 *
 * Bez cen, bez stóp zwrotu i bez domyślnego oprocentowania: stopę w RACIE
 * podaje użytkownik, a wynik jest opisany jako orientacyjny.
 */
import type { CalculatorConfig } from "./calculator-engine";

const FY = "Finance You sp. z o.o., KRS 0000635207";

export const CALCULATOR_CONFIGS: CalculatorConfig[] = [
  {
    slug: "ile-pod-nieruchomosc",
    version: 1,
    track: "pozyczkobiorca",
    keyword: "ILE",
    title: "Ile firma może uzyskać pod zastaw nieruchomości?",
    promise:
      "Wpisz wartość nieruchomości i obecne obciążenia — zobaczysz orientacyjną maksymalną kwotę finansowania przy limicie LTV.",
    fields: [
      {
        id: "propertyValue",
        label: "Wartość nieruchomości (zł)",
        type: "money",
        min: 50000,
        max: 100000000,
        required: true,
      },
      {
        id: "encumbrances",
        label: "Obecne obciążenia hipoteczne (zł)",
        type: "money",
        min: 0,
        required: false,
        default: 0,
      },
    ],
    outputs: [
      {
        id: "maxLoan",
        label: "Orientacyjna maksymalna kwota",
        fn: "maxLoanAtLtv",
        args: ["propertyValue", "encumbrances", 60],
        format: "money",
        teaser: true,
      },
      {
        id: "freeEquity",
        label: "Wolna wartość nieruchomości",
        fn: "subtract",
        args: ["propertyValue", "encumbrances"],
        format: "money",
        teaser: false,
        explain: "Wartość nieruchomości pomniejszona o obecne obciążenia.",
      },
      {
        id: "ltvAtMax",
        label: "LTV przy maksymalnej kwocie",
        fn: "ltvPercent",
        args: ["maxLoan", "propertyValue", "encumbrances"],
        format: "percent",
        teaser: false,
        explain: "Relacja całego zadłużenia do wartości nieruchomości.",
      },
    ],
    assumptions: [
      "Limit LTV 60% wartości nieruchomości (łącznie z obecnymi obciążeniami).",
      "Wartość nieruchomości podajesz sam — ostateczną ustala operat lub wycena finansującego.",
      "Finansowanie wyłącznie dla przedsiębiorców, na cel gospodarczy.",
    ],
    disclaimer: `Wynik jest orientacyjny i nie jest ofertą. Decyzja o finansowaniu należy do finansujących i zależy od stanu prawnego nieruchomości. Ryzyko: brak spłaty pożyczki zabezpieczonej hipoteką grozi egzekucją z nieruchomości. ${FY}.`,
    testCases: [
      {
        input: { propertyValue: 1000000, encumbrances: 200000 },
        expect: { maxLoan: 400000, freeEquity: 800000, ltvAtMax: 60 },
      },
      { input: { propertyValue: 500000, encumbrances: 400000 }, expect: { maxLoan: 0 } },
    ],
  },
  {
    slug: "rata-pozyczki-pod-zastaw",
    version: 1,
    track: "pozyczkobiorca",
    keyword: "RATA",
    title: "Ile wyniesie rata pożyczki pod zastaw dla firmy?",
    promise:
      "Podaj kwotę, okres i oprocentowanie z oferty, którą porównujesz — policzymy ratę i łączną spłatę.",
    fields: [
      {
        id: "amount",
        label: "Kwota pożyczki (zł)",
        type: "money",
        min: 20000,
        max: 50000000,
        required: true,
      },
      { id: "months", label: "Okres (miesiące)", type: "months", min: 3, max: 360, required: true },
      {
        id: "rate",
        label: "Oprocentowanie z porównywanej oferty (% rocznie)",
        type: "percent",
        min: 0,
        max: 30,
        required: true,
      },
    ],
    outputs: [
      {
        id: "installment",
        label: "Rata miesięczna",
        fn: "monthlyPayment",
        args: ["amount", "rate", "months"],
        format: "money",
        teaser: true,
      },
      {
        id: "total",
        label: "Łączna spłata (suma rat)",
        fn: "totalRepayment",
        args: ["installment", "months"],
        format: "money",
        teaser: false,
        explain: "Suma rat bez prowizji i kosztów notarialnych.",
      },
    ],
    assumptions: [
      "Raty równe (annuitetowe), bez rat balonowych.",
      "Oprocentowanie wpisujesz sam — to nie jest nasza oferta.",
      "Bez prowizji, kosztów notarialnych i wpisu hipoteki.",
    ],
    disclaimer: `Kalkulacja orientacyjna, nie jest ofertą. Koszt finansowania zależy od konkretnej transakcji. Ryzyko: brak spłaty pożyczki zabezpieczonej hipoteką grozi egzekucją z nieruchomości. ${FY}.`,
    testCases: [
      {
        input: { amount: 300000, months: 24, rate: 12 },
        expect: { installment: 14122.04, total: 338928.96 },
      },
    ],
  },
  {
    slug: "ltv-bufor-bezpieczenstwa",
    version: 1,
    track: "inwestor",
    keyword: "LTV",
    title:
      "Ile musiałaby stracić na wartości nieruchomość, zanim zabezpieczenie przestanie wystarczać?",
    promise:
      "Policz LTV i bufor bezpieczeństwa pożyczki pod hipotekę — zanim wpłacisz choćby złotówkę.",
    fields: [
      {
        id: "loan",
        label: "Kwota pożyczki (zł)",
        type: "money",
        min: 10000,
        max: 50000000,
        required: true,
      },
      {
        id: "propertyValue",
        label: "Wartość nieruchomości (zł)",
        type: "money",
        min: 50000,
        max: 100000000,
        required: true,
      },
      {
        id: "encumbrances",
        label: "Wcześniejsze hipoteki (zł)",
        type: "money",
        min: 0,
        required: false,
        default: 0,
      },
    ],
    outputs: [
      {
        id: "ltv",
        label: "LTV",
        fn: "ltvPercent",
        args: ["loan", "propertyValue", "encumbrances"],
        format: "percent",
        teaser: true,
      },
      {
        id: "debt",
        label: "Całe zadłużenie na nieruchomości",
        fn: "sum",
        args: ["loan", "encumbrances"],
        format: "money",
        teaser: false,
      },
      {
        id: "buffer",
        label: "Bufor bezpieczeństwa (o ile może spaść wartość)",
        fn: "safetyBufferPct",
        args: ["propertyValue", "debt"],
        format: "percent",
        teaser: false,
        explain:
          "Przy sprzedaży w egzekucji realna cena bywa niższa niż wycena — bufor to zapas, nie gwarancja.",
      },
    ],
    assumptions: [
      "Wartość nieruchomości z wyceny — w egzekucji cena może być niższa.",
      "Kolejność hipotek ma znaczenie: wcześniejsze hipoteki są spłacane pierwsze.",
      "Koszty egzekucji i czas jej trwania obniżają odzysk.",
    ],
    disclaimer: `Materiał edukacyjny, nie jest ofertą ani rekomendacją. Pożyczki prywatne nie są lokatą i nie są objęte gwarancją BFG; zabezpieczenie hipoteczne nie wyklucza straty kapitału. ${FY}.`,
    testCases: [
      {
        input: { loan: 400000, propertyValue: 1000000, encumbrances: 0 },
        expect: { ltv: 40, debt: 400000, buffer: 60 },
      },
      {
        input: { loan: 300000, propertyValue: 1000000, encumbrances: 200000 },
        expect: { ltv: 50, buffer: 50 },
      },
    ],
  },
];
