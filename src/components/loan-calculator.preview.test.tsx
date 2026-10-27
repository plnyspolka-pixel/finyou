import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// --- Mocks --------------------------------------------------------------
// Funkcje serwerowe podmieniamy na zwykłe mocki — bez importu kodu *.server.

const { ratesMock, indicatorsMock } = vi.hoisted(() => ({
  ratesMock: vi.fn(async () => ({
    referenceRate: 3.75,
    lombardRate: 4.25,
    depositRate: 3.25,
    effectiveFrom: "2026-03-05",
    source: "nbp",
  })),
  indicatorsMock: vi.fn(async () => ({
    inflation: { cpiYoYPct: 3.1, period: "08.2026", source: "gus" },
    eur: { rate: 4.25 },
  })),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));
vi.mock("@/lib/nbp-rates.functions", () => ({ getNbpRates: ratesMock }));
vi.mock("@/lib/market-indicators.functions", () => ({
  getInvestorMarketIndicators: indicatorsMock,
}));
vi.mock("@/lib/loan-schedule.functions", () => ({
  sendLoanScheduleToClient: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, className }: { children: ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));

import { LoanCalculator } from "./loan-calculator";

function renderCalc(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

/** Tekst całego dokumentu z NBSP zamienionymi na spacje. */
const pageText = () => (document.body.textContent ?? "").replace(/\u00a0/g, " ");

describe("LoanCalculator — podgląd na landingu (marketingPreview)", () => {
  beforeEach(() => {
    // Odsetki maksymalne z tabeli zależą od daty — przypinamy ją (14,5%).
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-11T10:00:00Z"));
    ratesMock.mockClear();
    indicatorsMock.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("pokazuje suwaki i 3 karty, ukrywa resztę narzędzia", () => {
    renderCalc(<LoanCalculator marketingPreview initialMaxPayment={0} />);

    for (const t of [
      "Przykładowe wyliczenie",
      "Wykładasz",
      "Klient spłaca Ci łącznie",
      "Twój zysk",
    ])
      expect(screen.getByText(t)).toBeInTheDocument();
    for (const t of ["Kwota pożyczki", "Okres", "Oprocentowanie roczne", "Twoja prowizja"])
      expect(screen.getByText(t)).toBeInTheDocument();

    const text = pageText();
    for (const hidden of [
      "Stopy NBP",
      "Najważniejsze liczby",
      "Co realnie wchodzi i wychodzi",
      "Krotność spłaty",
      "Do wypłaty klientowi",
      "Kapitał pożyczki (od którego",
      "Maksymalna rata dla klienta",
      "Odsetki w limicie ustawowym",
      "Podsumowanie",
      "Harmonogram spłat",
      "Suwaki działają tak samo",
      "/ rok",
    ])
      expect(text).not.toContain(hidden);

    // Stopy NBP nie są pobierane w podglądzie.
    expect(ratesMock).not.toHaveBeenCalled();
    expect(indicatorsMock).not.toHaveBeenCalled();
  });

  it("domyślna prowizja inwestora wynosi 20%, etykieta bez dubla i limity są zachowane", () => {
    renderCalc(<LoanCalculator marketingPreview initialMaxPayment={0} />);
    expect(
      screen.getAllByRole("textbox").some((input) => (input as HTMLInputElement).value === "20"),
    ).toBe(true);
    expect(pageText()).toContain("maks. 14,5% — odsetki maksymalne");
    expect(pageText()).toContain("20,0% (");
    expect(pageText().match(/firma spłaca ją w ratach/g)?.length).toBe(1);
  });

  it("stopa w polu i w tekstach z przecinkiem; pole przyjmuje przecinek i kropkę", () => {
    renderCalc(<LoanCalculator marketingPreview initialMaxPayment={0} />);
    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    expect(inputs.some((i) => /^\d+,\d+$/.test(i.value) || /^\d+$/.test(i.value))).toBe(true);
    expect(inputs.every((i) => !/^\d+\.\d+$/.test(i.value))).toBe(true);
    expect(pageText().replace(/@keyframes[^\n]*/g, "")).not.toMatch(/\d\.\d+%/);
  });

  it("dla okresu innego niż 12 mies. dopisuje stopę roczną", () => {
    renderCalc(<LoanCalculator marketingPreview initialMaxPayment={0} initialMonths={24} />);
    expect(pageText()).toMatch(/% wyłożonej kwoty w 24 mies\. \(ok\. \d+,\d% w skali roku\)/);
  });

  it("wynik (wychodzi / wchodzi) jest nad suwakami", () => {
    renderCalc(<LoanCalculator marketingPreview initialMaxPayment={0} />);
    const params = screen.getByText("Parametry pożyczki");
    const cashOut = screen.getByText("Wykładasz");
    expect(cashOut.compareDocumentPosition(params) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("publiczny tryb zachowuje limit bez przepisów i terminologii prawnej", () => {
    renderCalc(<LoanCalculator marketingPreview initialMaxPayment={0} investorGuidance />);
    expect(pageText()).not.toMatch(/wyzysk|art\.|krotność|wartość referencyjna|MPKK/i);
  });
});

describe("LoanCalculator — panel (bez marketingPreview) bez zmian w układzie", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-11T10:00:00Z"));
    indicatorsMock.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("zachowuje pas NBP, nagłówek, maksymalną ratę, podsumowanie i harmonogram", () => {
    renderCalc(<LoanCalculator />);
    const text = pageText();
    for (const t of [
      "Stopy NBP",
      "Najważniejsze liczby",
      "Inwestor wkłada",
      "Inwestor odbiera łącznie",
      "Klient dostaje na rękę",
      "Suwaki działają tak samo, jak po stronie klienta.",
      "Kwota pożyczki (z umowy)",
      "Maksymalna rata dla klienta",
      "Odsetki w limicie ustawowym",
      "Podsumowanie",
      "Harmonogram spłat",
    ])
      expect(text).toContain(t);
    expect(text).not.toContain("Twój zysk");
    expect(text).not.toContain("Przykładowe wyliczenie");
    // Parametry stoją pod wynikiem, jak dotąd.
    const hero = screen.getByText("Najważniejsze liczby");
    const params = screen.getByText("Parametry pożyczki");
    expect(hero.compareDocumentPosition(params) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("krotność: orientacyjny próg 2,0×, nie granica z ustawy", async () => {
    renderCalc(<LoanCalculator investorGuidance />);
    const text = pageText();
    expect(text).toMatch(/Krotność 1,34× — poniżej orientacyjnego progu 2,0×/);
    expect(text).toContain(
      "Pożyczkobiorca spłaca 1,34× kwotę otrzymaną na rękę. Próg 2,0× to wskazówka z praktyki, a nie granica z ustawy — o wyzysku (art. 304 KK, art. 388 KC) decydują okoliczności konkretnej umowy.",
    );
    expect(text).not.toContain("brak ryzyka lichwy");
    await waitFor(() => expect(pageText()).toContain("AML — wypłata powyżej 15 000 EUR"));
  });

  it("AML: ostrożne brzmienie, bez punktu art. 2 ust. 1 pkt 24 i bez „≥”", async () => {
    renderCalc(<LoanCalculator investorGuidance />);
    // Przed odpowiedzią NBP: komunikat o sprawdzaniu kursu.
    expect(pageText()).toContain("Sprawdzam aktualny kurs EUR NBP…");
    await waitFor(() => expect(pageText()).toContain("AML — wypłata powyżej 15 000 EUR"));
    const text = pageText();
    expect(text).toContain(
      "Jeżeli udzielasz pożyczek w ramach działalności gospodarczej, możesz być instytucją obowiązaną w rozumieniu ustawy AML. Wtedy wypłatę powyżej równowartości 15 000 EUR wpisujesz do rejestru i zgłaszasz do GIIF w ciągu 7 dni.",
    );
    expect(text).not.toContain("art. 2 ust. 1 pkt 24");
    expect(text).not.toContain("≥");
  });

  it("AML i inflacja: błąd pobrania ≠ „pobieram” bez końca", async () => {
    indicatorsMock.mockRejectedValueOnce(new Error("NBP down"));
    renderCalc(<LoanCalculator investorGuidance />);
    await waitFor(() =>
      expect(pageText()).toContain(
        "Kurs EUR NBP jest teraz niedostępny — próg 15 000 EUR przeliczysz później.",
      ),
    );
    expect(pageText()).toContain("Wskaźnik inflacji jest teraz niedostępny.");
    expect(pageText()).not.toContain("Pobieram aktualny wskaźnik inflacji…");
  });
});
