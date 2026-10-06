// ════════════════════════════════════════════════════════════════════
// HARMONOGRAM RAT W UI WINDYKACJI — edytor (formularz nowej sprawy,
// edycja pożyczki na karcie sprawy) i tabela stanu rat (karta sprawy).
//
// Edytor trzyma raty jako tekst (kwoty można wkleić z umowy: „7 868,48"),
// a waliduje je ta sama funkcja co serwer (harmonogramFromInput) — błędny
// wiersz widać przed zapisem, z numerem raty. Generator tworzy raty
// miesięczne z parametrów umowy (generateHarmonogram). Czyste funkcje
// formularza: wind-harmonogram-form.ts.
// ════════════════════════════════════════════════════════════════════
import { useId, useState } from "react";
import { Plus, Trash2, Wand2, AlertTriangle } from "lucide-react";
import type { RataStan } from "@/lib/windykacja-harmonogram";
import { opisHarmonogramu } from "@/lib/windykacja-recalc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  RATA_STATUS_LABEL,
  formToHarmonogram,
  formatDataPL,
  formatZl,
  generateFromForm,
  harmonogramToForm,
  hasRaty,
  nextRataForm,
  rataStatus,
  type GeneratorForm,
  type RataForm,
  type RataStatus,
} from "@/components/inwestor/wind-harmonogram-form";

// ── Edytor harmonogramu ──────────────────────────────────────────────

export function HarmonogramEditor({
  rows,
  onChange,
  generator,
  onGeneratorChange,
  hint,
}: {
  rows: RataForm[];
  onChange: (rows: RataForm[]) => void;
  generator: GeneratorForm;
  onGeneratorChange: (g: GeneratorForm) => void;
  /** Dodatkowa podpowiedź pod nagłówkiem (np. źródło: odczyt umowy). */
  hint?: React.ReactNode;
}) {
  const uid = useId();
  const [rozbicie, setRozbicie] = useState(false);
  const [genBlad, setGenBlad] = useState<string | null>(null);
  const maRozbicie = rows.some((r) => r.odsetki.trim() || r.prowizja.trim());
  const pokazRozbicie = rozbicie || maRozbicie;
  const { harmonogram, bledy } = formToHarmonogram(rows);
  const niepuste = hasRaty(rows);

  const setGen = (k: keyof GeneratorForm, v: string) => {
    setGenBlad(null);
    onGeneratorChange({ ...generator, [k]: v });
  };
  const generuj = () => {
    const { raty, blad } = generateFromForm(generator);
    setGenBlad(blad);
    if (!blad) onChange(harmonogramToForm(raty));
  };
  const updRow = (key: string, patch: Partial<RataForm>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const delRow = (key: string) => onChange(rows.filter((r) => r.key !== key));

  return (
    <div className="space-y-3">
      {hint ? <div className="text-[11px] text-muted-foreground">{hint}</div> : null}

      {/* Generator z parametrów umowy */}
      <div className="rounded-md border bg-muted/30 p-2.5 space-y-2">
        <div className="text-xs font-medium">Wygeneruj raty z parametrów umowy</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor={`${uid}-pierwsza`} className="text-[11px]">
              Termin pierwszej raty
            </Label>
            <Input
              id={`${uid}-pierwsza`}
              type="date"
              className="h-8"
              value={generator.pierwszaRata}
              onChange={(e) => setGen("pierwszaRata", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${uid}-liczba`} className="text-[11px]">
              Liczba rat
            </Label>
            <Input
              id={`${uid}-liczba`}
              type="number"
              min={1}
              max={600}
              step={1}
              className="h-8"
              value={generator.liczbaRat}
              onChange={(e) => setGen("liczbaRat", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${uid}-kwota`} className="text-[11px]">
              Kwota raty (zł)
            </Label>
            <Input
              id={`${uid}-kwota`}
              inputMode="decimal"
              placeholder="np. 7 868,48"
              className="h-8"
              value={generator.kwotaRaty}
              onChange={(e) => setGen("kwotaRaty", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${uid}-ostatnia`} className="text-[11px]">
              Ostatnia rata (opc.)
            </Label>
            <Input
              id={`${uid}-ostatnia`}
              inputMode="decimal"
              placeholder="jak pozostałe"
              className="h-8"
              value={generator.kwotaOstatniejRaty}
              onChange={(e) => setGen("kwotaOstatniejRaty", e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={generuj}>
            <Wand2 className="h-4 w-4 mr-1" />
            {niepuste ? "Wygeneruj ponownie (zastąpi raty poniżej)" : "Wygeneruj raty"}
          </Button>
          <span className="text-[11px] text-muted-foreground">
            Raty co miesiąc w dniu pierwszej raty (w krótszym miesiącu — ostatni dzień miesiąca).
          </span>
        </div>
        {genBlad ? <p className="text-[11px] text-red-600">{genBlad}</p> : null}
      </div>

      {/* Raty — edytowalna tabela */}
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Brak rat — wygeneruj je z parametrów umowy albo dodaj ręcznie (np. przepisz Załącznik nr 1
          — Harmonogram spłat).
        </p>
      ) : (
        <div className="max-h-72 overflow-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b text-left text-[11px] text-muted-foreground">
                <th className="py-1.5 pl-2 pr-1 font-medium">Nr</th>
                <th className="py-1.5 px-1 font-medium">Termin płatności</th>
                <th className="py-1.5 px-1 font-medium">Kwota raty (zł)</th>
                {pokazRozbicie && (
                  <>
                    <th className="py-1.5 px-1 font-medium">w tym odsetki</th>
                    <th className="py-1.5 px-1 font-medium">w tym prowizja</th>
                  </>
                )}
                <th className="py-1.5 pr-2" aria-label="Usuń" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.key} className="border-b last:border-0">
                  <td className="py-1 pl-2 pr-1 text-xs tabular-nums text-muted-foreground">
                    {i + 1}
                  </td>
                  <td className="py-1 px-1">
                    <Input
                      type="date"
                      aria-label={`Termin raty ${i + 1}`}
                      className="h-8 min-w-[130px]"
                      value={r.termin}
                      onChange={(e) => updRow(r.key, { termin: e.target.value })}
                    />
                  </td>
                  <td className="py-1 px-1">
                    <Input
                      inputMode="decimal"
                      aria-label={`Kwota raty ${i + 1}`}
                      className="h-8 min-w-[100px] tabular-nums"
                      value={r.kwota}
                      onChange={(e) => updRow(r.key, { kwota: e.target.value })}
                    />
                  </td>
                  {pokazRozbicie && (
                    <>
                      <td className="py-1 px-1">
                        <Input
                          inputMode="decimal"
                          aria-label={`Odsetki w racie ${i + 1}`}
                          className="h-8 min-w-[90px] tabular-nums"
                          value={r.odsetki}
                          onChange={(e) => updRow(r.key, { odsetki: e.target.value })}
                        />
                      </td>
                      <td className="py-1 px-1">
                        <Input
                          inputMode="decimal"
                          aria-label={`Prowizja w racie ${i + 1}`}
                          className="h-8 min-w-[90px] tabular-nums"
                          value={r.prowizja}
                          onChange={(e) => updRow(r.key, { prowizja: e.target.value })}
                        />
                      </td>
                    </>
                  )}
                  <td className="py-1 pr-2 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-muted-foreground"
                      aria-label={`Usuń ratę ${i + 1}`}
                      onClick={() => delRow(r.key)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...rows, nextRataForm(rows)])}
        >
          <Plus className="h-4 w-4 mr-1" /> Dodaj ratę
        </Button>
        {rows.length > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => onChange([])}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Usuń wszystkie raty
          </Button>
        )}
        <div className="flex items-center gap-1.5">
          <Checkbox
            id={`${uid}-rozbicie`}
            checked={pokazRozbicie}
            disabled={maRozbicie}
            onCheckedChange={(v) => setRozbicie(v === true)}
          />
          <Label htmlFor={`${uid}-rozbicie`} className="text-[11px] font-normal">
            Rozbicie raty (odsetki umowne / prowizja)
          </Label>
        </div>
      </div>

      {bledy.length > 0 ? (
        <div className="rounded-md border border-red-300 bg-red-50 p-2 text-[11px] text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
          <div className="flex items-center gap-1 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" /> Popraw harmonogram:
          </div>
          <ul className="mt-0.5 list-disc pl-4">
            {bledy.slice(0, 5).map((b) => (
              <li key={b}>{b}</li>
            ))}
            {bledy.length > 5 ? <li>…oraz {bledy.length - 5} innych błędów.</li> : null}
          </ul>
        </div>
      ) : harmonogram ? (
        <p className="text-xs">
          <span className="font-medium">Harmonogram:</span> {opisHarmonogramu(harmonogram)}.{" "}
          <span className="text-muted-foreground">
            Rozbicie raty (gdy umowa je podaje) pozwala liczyć odsetki za opóźnienie bez odsetek
            umownych (art. 482 k.c.).
          </span>
        </p>
      ) : null}
    </div>
  );
}

// ── Stan rat na dziś (karta sprawy) ──────────────────────────────────

const STATUS_BADGE: Record<RataStatus, string> = {
  zaplacona:
    "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200",
  zalegla:
    "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200",
  przyszla: "border-border bg-muted text-muted-foreground",
};

/** Tabela stanu rat z kalkulatora (computeZaleglosc / windDebtSnapshot). */
export function RatyStanTable({ raty }: { raty: RataStan[] }) {
  return (
    <div className="max-h-96 overflow-auto rounded-md border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-background">
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-1.5 pl-2 pr-1 font-medium">Nr</th>
            <th className="py-1.5 px-1 font-medium">Termin</th>
            <th className="py-1.5 px-1 text-right font-medium">Kwota</th>
            <th className="py-1.5 px-1 text-right font-medium">Zapłacono</th>
            <th className="py-1.5 px-1 text-right font-medium">Pozostało</th>
            <th className="py-1.5 px-1 text-right font-medium">Opóźn.</th>
            <th className="py-1.5 pl-1 pr-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {raty.map((r) => {
            const s = rataStatus(r);
            const czesc = s === "zalegla" && r.zaplacono > 0;
            return (
              <tr
                key={r.nr}
                className={`border-b last:border-0 ${s === "zalegla" ? "bg-red-50/60 dark:bg-red-900/10" : ""}`}
              >
                <td className="py-1.5 pl-2 pr-1 tabular-nums text-muted-foreground">{r.nr}</td>
                <td className="py-1.5 px-1 whitespace-nowrap tabular-nums">
                  {formatDataPL(r.termin)}
                  {r.terminSkuteczny !== r.termin ? (
                    <div className="text-[10px] text-muted-foreground">
                      {r.terminSkuteczny > r.termin
                        ? `płatna do ${formatDataPL(r.terminSkuteczny)} (dzień roboczy)`
                        : `wymagalna od ${formatDataPL(r.terminSkuteczny)} (wypowiedzenie)`}
                    </div>
                  ) : null}
                </td>
                <td
                  className="py-1.5 px-1 text-right whitespace-nowrap tabular-nums"
                  title={
                    Math.abs(r.kwotaWymagana - r.kwota) > 0.005
                      ? `Rata z harmonogramu ${formatZl(r.kwota)} — po wypowiedzeniu bez odsetek umownych za okres przyszły`
                      : undefined
                  }
                >
                  {formatZl(r.kwotaWymagana)}
                </td>
                <td className="py-1.5 px-1 text-right whitespace-nowrap tabular-nums">
                  {r.zaplacono > 0 ? formatZl(r.zaplacono) : "—"}
                </td>
                <td
                  className={`py-1.5 px-1 text-right whitespace-nowrap tabular-nums ${s === "zalegla" ? "font-semibold" : ""}`}
                >
                  {r.pozostalo > 0 ? formatZl(r.pozostalo) : "—"}
                </td>
                <td className="py-1.5 px-1 text-right whitespace-nowrap tabular-nums">
                  {r.dniOpoznienia > 0 ? `${r.dniOpoznienia} dni` : "—"}
                </td>
                <td className="py-1.5 pl-1 pr-2">
                  <span
                    className={`inline-flex whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE[s]}`}
                  >
                    {RATA_STATUS_LABEL[s]}
                    {czesc ? " (część)" : ""}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
