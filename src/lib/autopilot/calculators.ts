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
      "Sprawdź orientacyjną kwotę finansowania pod zastaw nieruchomości, prowizję i kwotę na rękę — bezpłatnie, bez zapisu na newsletter.",
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
        gated: false,
      },
      { key: "net_pln", label: "Orientacyjnie na rękę", format: "pln", gated: false },
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
