import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { computeZaleglosc, generateHarmonogram } from "@/lib/windykacja-harmonogram";
import { HarmonogramEditor, RatyStanTable } from "./wind-harmonogram";
import { EMPTY_GENERATOR, type GeneratorForm, type RataForm } from "./wind-harmonogram-form";

/** Jak w formularzu nowej sprawy: wiersze i parametry generatora w stanie rodzica. */
function Harness() {
  const [rows, setRows] = useState<RataForm[]>([]);
  const [gen, setGen] = useState<GeneratorForm>(EMPTY_GENERATOR);
  return (
    <HarmonogramEditor rows={rows} onChange={setRows} generator={gen} onGeneratorChange={setGen} />
  );
}

const nbsp = (s: string | null | undefined) => (s ?? "").replace(/\s/g, " ");

describe("HarmonogramEditor", () => {
  it("generuje raty z parametrów umowy i pokazuje liczbę rat oraz sumę", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: /Wygeneruj raty/ }));
    expect(screen.getByText("Podaj termin pierwszej raty.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Termin pierwszej raty"), "2026-07-10");
    await user.type(screen.getByLabelText("Liczba rat"), "12");
    await user.type(screen.getByLabelText("Kwota raty (zł)"), "7 868,48");
    await user.type(screen.getByLabelText("Ostatnia rata (opc.)"), "7 868,37");
    await user.click(screen.getByRole("button", { name: /Wygeneruj raty/ }));

    expect(screen.getAllByLabelText(/^Kwota raty \d+$/)).toHaveLength(12);
    expect(screen.getByLabelText("Termin raty 12")).toHaveValue("2027-06-10");
    expect(screen.getByLabelText("Kwota raty 12")).toHaveValue("7868,37");
    expect(nbsp(screen.getByText(/12 rat,/).textContent)).toContain(
      "12 rat, 94 421,65 zł, 10.07.2026–10.06.2027",
    );
  });

  it("pokazuje błąd wiersza z numerem raty i dopisuje kolejną ratę miesiąc później", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /Dodaj ratę/ }));
    await user.type(screen.getByLabelText("Termin raty 1"), "2026-01-31");
    await user.type(screen.getByLabelText("Kwota raty 1"), "500");
    await user.click(screen.getByRole("button", { name: /Dodaj ratę/ }));
    expect(screen.getByLabelText("Termin raty 2")).toHaveValue("2026-02-28");
    expect(screen.getByLabelText("Kwota raty 2")).toHaveValue("500");

    await user.clear(screen.getByLabelText("Kwota raty 2"));
    await user.type(screen.getByLabelText("Kwota raty 2"), "0");
    expect(screen.getByText("Rata 2: kwota raty musi być większa od 0.")).toBeInTheDocument();
  });
});

describe("RatyStanTable", () => {
  it("status rat na dzień: zapłacona, zaległa w części, zaległa, przyszła", () => {
    const harmonogram = generateHarmonogram({
      pierwszaRata: "2026-07-10",
      liczbaRat: 12,
      kwotaRaty: 7868.48,
      kwotaOstatniejRaty: 7868.37,
    });
    const w = computeZaleglosc({
      harmonogram,
      payments: [
        { paid_on: "2026-07-09", amount: 7868.48 },
        { paid_on: "2026-08-12", amount: 4000 },
      ],
      asOf: "2026-10-06",
      stopaUmowna: 18.5,
    });
    render(<RatyStanTable raty={w.raty} />);
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(12);
    expect(within(rows[0]).getByText("zapłacona")).toBeInTheDocument();
    expect(within(rows[1]).getByText("zaległa (część)")).toBeInTheDocument();
    expect(nbsp(rows[1].textContent)).toContain("3876,46 zł"); // pl-PL nie grupuje liczb 4-cyfrowych
    expect(within(rows[2]).getByText("zaległa")).toBeInTheDocument();
    expect(within(rows[2]).getByText("26 dni")).toBeInTheDocument();
    expect(within(rows[3]).getByText("przyszła")).toBeInTheDocument();
  });
});
