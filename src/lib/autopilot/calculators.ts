// Startowy zestaw narzędzi-lead-magnetów (brief 5.4: ILE, RATA, LTV).
// Każde narzędzie to konfiguracja dla calculator-engine.ts – kolejne agent
// dopisuje jako dane (po verifyCalculator + bramce compliance).
import type { CalculatorConfig } from "./calculator-engine";

export const STARTER_CALCULATORS: CalculatorConfig[] = [
  {
    slug: "ile-pod-nieruchomosc",
    track: "pozyczkobiorca",
    keyword: "ILE",
    title: "Ile Twoja firma może uzyskać pod nieruchomość?",
    promise:
      "Sprawdź w 30 sekund orientacyjną kwotę finansowania pod zastaw nieruchomości – pełne wyliczenie z kosztami wyślemy Ci mailem.",
    fn: "max_amount",
    fields: [
      {
        key: "property_value",
        label: "Wartość nieruchomości",
        type: "number",
        unit: "pln",
        min: 100000,
        max: 100000000,
        step: 10000,
        required: true,
      },
      {
        key: "encumbrances",
        label: "Obecne obciążenia (hipoteki)",
        type: "number",
        unit: "pln",
        min: 0,
        max: 100000000,
        step: 10000,
        default: 0,
        required: false,
      },
    ],
    outputs: [
      { key: "max_loan_pln", label: "Orientacyjna maksymalna kwota", format: "pln", gated: false },
      { key: "limit_pct", label: "Limit LTV systemu", format: "pct", gated: false },
      {
        key: "fy_fee_pln",
        label: "Prowizja Finance You (potrącana z wypłaty)",
        format: "pln",
        gated: true,
      },
      { key: "net_pln", label: "Orientacyjnie na rękę", format: "pln", gated: true },
    ],
    assumptions: [
      "Wynik jest orientacyjny – ostateczną kwotę ustalają finansujący po analizie nieruchomości i firmy.",
      "Finansowanie wyłącznie na cel gospodarczy (przedsiębiorcy).",
      "Limit LTV obejmuje istniejące obciążenia hipoteczne.",
    ],
    testCases: [
      {
        input: { property_value: 1000000, encumbrances: 100000 },
        expect: { max_loan_pln: 500000, fy_fee_pln: 25000, net_pln: 475000 },
      },
      {
        input: { property_value: 200000, encumbrances: 200000 },
        expect: { max_loan_pln: 0, net_pln: 0 },
      },
    ],
  },
  {
    slug: "kalkulator-raty",
    track: "pozyczkobiorca",
    keyword: "RATA",
    title: "Kalkulator raty finansowania pod zastaw",
    promise: "Policz ratę przy własnych założeniach – harmonogram spłat wyślemy Ci mailem.",
    fn: "installment",
    fields: [
      {
        key: "loan_amount",
        label: "Kwota finansowania",
        type: "number",
        unit: "pln",
        min: 50000,
        max: 20000000,
        step: 10000,
        required: true,
      },
      {
        key: "months",
        label: "Okres (miesiące)",
        type: "number",
        unit: "months",
        min: 3,
        max: 120,
        step: 1,
        default: 24,
        required: true,
      },
      {
        key: "annual_rate_pct",
        label: "Założone oprocentowanie roczne (Twoje założenie)",
        type: "number",
        unit: "pct",
        min: 0,
        max: 30,
        step: 0.5,
        required: true,
        help: "To Twoje założenie do symulacji – nie oferta.",
      },
    ],
    outputs: [
      { key: "monthly_pln", label: "Rata miesięczna (symulacja)", format: "pln", gated: false },
      { key: "total_pln", label: "Łączna spłata", format: "pln", gated: true },
      { key: "interest_pln", label: "Suma odsetek", format: "pln", gated: true },
      { key: "fy_fee_pln", label: "Prowizja Finance You", format: "pln", gated: true },
    ],
    assumptions: [
      "Symulacja przy oprocentowaniu podanym przez Ciebie – to nie jest oferta ani deklaracja kosztu.",
      "Rata annuitetowa, bez rat balonowych i opłat dodatkowych.",
      "Finansowanie wyłącznie na cel gospodarczy (przedsiębiorcy).",
    ],
    testCases: [
      {
        input: { loan_amount: 120000, months: 12, annual_rate_pct: 0 },
        expect: { monthly_pln: 10000, total_pln: 120000, interest_pln: 0, fy_fee_pln: 6000 },
      },
    ],
  },
  {
    slug: "kalkulator-ltv",
    track: "inwestor",
    keyword: "LTV",
    title: "Kalkulator LTV i bufora bezpieczeństwa",
    promise:
      "Sprawdź, jaki zapas bezpieczeństwa daje zabezpieczenie pożyczki – pełną analizę wyślemy Ci mailem.",
    fn: "ltv_buffer",
    fields: [
      {
        key: "property_value",
        label: "Wartość nieruchomości (wycena)",
        type: "number",
        unit: "pln",
        min: 100000,
        max: 100000000,
        step: 10000,
        required: true,
      },
      {
        key: "loan_amount",
        label: "Kwota pożyczki",
        type: "number",
        unit: "pln",
        min: 10000,
        max: 100000000,
        step: 10000,
        required: true,
      },
      {
        key: "encumbrances",
        label: "Wcześniejsze obciążenia",
        type: "number",
        unit: "pln",
        min: 0,
        max: 100000000,
        step: 10000,
        default: 0,
        required: false,
      },
    ],
    outputs: [
      { key: "ltv_pct", label: "LTV", format: "pct", gated: false },
      { key: "buffer_pct", label: "Bufor do limitu systemu", format: "pct", gated: false },
      {
        key: "value_drop_to_100_pct",
        label: "Spadek wartości, po którym dług = wartość",
        format: "pct",
        gated: true,
      },
      {
        key: "max_loan_pln",
        label: "Maksymalna kwota przy limicie LTV",
        format: "pln",
        gated: true,
      },
    ],
    assumptions: [
      "LTV liczone od wyceny – realna cena sprzedaży może być niższa.",
      "Bufor bezpieczeństwa nie eliminuje ryzyka utraty części lub całości kapitału.",
      "Narzędzie edukacyjne – nie stanowi oferty ani rekomendacji inwestycyjnej.",
    ],
    testCases: [
      {
        input: { property_value: 1000000, loan_amount: 400000 },
        expect: { ltv_pct: 40, buffer_pct: 20, max_loan_pln: 600000, value_drop_to_100_pct: 60 },
      },
    ],
  },
];
