/**
 * PDF propozycji finansowej inwestora — załącznik maila do autora wniosku
 * (pośrednik / operator / klient) po złożeniu oferty.
 *
 * Na ReportWriterze (pdf-lib, Liberation Sans): kafelki z kwotą, ratą
 * i okresem, parametry oferty, podsumowanie kosztów i pełny harmonogram spłat
 * (nagłówek tabeli powtarzany na kolejnych stronach). Czysty JS — działa
 * w Workerze i w testach.
 */
import { ReportWriter, warsawDateStamp } from "@/lib/pdf/report-writer";

export interface OfferPdfScheduleRow {
  idx: number;
  date: string;
  rata: number;
  kapital: number;
  odsetki: number;
  prowizja: number;
  saldo: number;
}

export interface OfferPdfModel {
  /** Klient lub opis wniosku, np. „Teresa Skolasa”. */
  clientLabel: string | null;
  /** Dla kogo przygotowano — stopka każdej strony. */
  preparedFor: string;
  amount: number;
  months: number;
  annualRate: number;
  /** Prowizja inwestora (PLN), rozłożona w ratach. */
  commission: number | null;
  monthlyPayment: number | null;
  balloon: number | null;
  totalToRepay: number | null;
  schedule: OfferPdfScheduleRow[] | null;
  note?: string | null;
  /** Numer referencyjny (np. początek id oferty). */
  reference?: string | null;
  generatedAt?: Date;
}

const nf2 = new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** „40 000,00 zł”. */
export function pln(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${nf2.format(Number(v))} zł`;
}

function pct(v: number): string {
  return `${new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(v)} %`;
}

/** Harmonogram z kolumny `investor_offers.schedule` (JSON) — tylko poprawne wiersze. */
export function parseOfferSchedule(raw: unknown): OfferPdfScheduleRow[] | null {
  if (!Array.isArray(raw)) return null;
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const rows = raw
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r, i) => ({
      idx: num(r.idx ?? r.nr ?? i + 1),
      date: String(r.date ?? r.termin ?? ""),
      rata: num(r.rata ?? r.rata_razem),
      kapital: num(r.kapital),
      odsetki: num(r.odsetki),
      prowizja: num(r.prowizja),
      saldo: num(r.saldo),
    }));
  return rows.length ? rows : null;
}

/** „2026-11-15” → „15.11.2026”; inne formaty bez zmian. */
function fmtDate(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : d;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

export function offerPdfFilename(model: Pick<OfferPdfModel, "amount" | "generatedAt">): string {
  const stamp = warsawDateStamp(model.generatedAt ?? new Date());
  return `propozycja-finansowania-${Math.round(model.amount)}-zl-${stamp}.pdf`;
}

export async function buildOfferPdf(model: OfferPdfModel): Promise<Uint8Array> {
  const schedule = model.schedule ?? [];
  const sum = (k: keyof OfferPdfScheduleRow) =>
    round2(schedule.reduce((s, r) => s + Number(r[k] || 0), 0));
  const totalInterest = schedule.length ? sum("odsetki") : null;
  const totalCommission = schedule.length ? sum("prowizja") : (model.commission ?? null);
  const total = model.totalToRepay ?? (schedule.length ? sum("rata") : null);
  const balloon = Number(model.balloon) > 0 ? Number(model.balloon) : null;
  const regular = model.monthlyPayment ?? schedule[0]?.rata ?? null;

  const w = await ReportWriter.create({
    title: "Propozycja finansowania",
    subject: model.clientLabel ?? undefined,
    preparedFor: model.preparedFor,
    generatedAt: model.generatedAt,
    brand: "Finance You",
  });

  w.title(
    "Propozycja finansowania",
    [
      model.clientLabel ? `Klient: ${model.clientLabel}` : null,
      model.reference ? `Nr ${model.reference}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || null,
  );

  w.highlights([
    { label: "Kwota pożyczki", value: pln(model.amount), accent: true },
    { label: "Rata miesięczna", value: pln(regular) },
    { label: "Okres", value: `${model.months} mies.` },
    { label: "Oprocentowanie", value: pct(model.annualRate) },
  ]);

  w.heading("Parametry propozycji");
  const params: Array<[string, string]> = [
    ["Kwota pożyczki", pln(model.amount)],
    ["Okres spłaty", `${model.months} miesięcy`],
    [
      "Oprocentowanie roczne (stałe)",
      `${pct(model.annualRate)} — od kapitału pozostającego do spłaty`,
    ],
    [
      "Prowizja",
      totalCommission
        ? `${pln(totalCommission)} — płatna w ratach, nie jest potrącana z wypłaty`
        : "brak",
    ],
    ["Rata miesięczna", pln(regular)],
  ];
  if (balloon) params.push(["Rata końcowa (balonowa)", pln(balloon)]);
  if (schedule[0]?.date) params.push(["Pierwsza rata", fmtDate(schedule[0].date)]);
  w.keyValues(params, { labelWidth: 170 });

  w.heading("Podsumowanie kosztów");
  const costs: Array<[string, string]> = [["Kapitał", pln(model.amount)]];
  if (totalInterest != null) costs.push(["Odsetki łącznie", pln(totalInterest)]);
  if (totalCommission) costs.push(["Prowizja łącznie", pln(totalCommission)]);
  costs.push(["Łącznie do spłaty", pln(total)]);
  w.keyValues(costs, { labelWidth: 170 });
  if (balloon && schedule.length > 1) {
    w.note(
      `Spłata: ${schedule.length - 1} rat po ${pln(regular)} oraz rata końcowa (balonowa) ${pln(balloon)}, ` +
        "w której spłacany jest pozostały kapitał.",
    );
  }

  if (model.note?.trim()) {
    w.heading("Uwagi inwestora");
    w.paragraph(model.note.trim());
  }

  if (schedule.length) {
    w.heading(`Harmonogram spłat (${schedule.length} rat)`);
    w.table(
      [
        { label: "Nr", width: 0.6 },
        { label: "Termin", width: 1.5 },
        { label: "Rata", width: 1.6, align: "right" },
        { label: "Kapitał", width: 1.6, align: "right" },
        { label: "Odsetki", width: 1.4, align: "right" },
        { label: "Prowizja", width: 1.4, align: "right" },
        { label: "Saldo", width: 1.7, align: "right" },
      ],
      [
        ...schedule.map((r) => [
          String(r.idx),
          fmtDate(r.date),
          nf2.format(r.rata),
          nf2.format(r.kapital),
          nf2.format(r.odsetki),
          nf2.format(r.prowizja),
          nf2.format(r.saldo),
        ]),
        [
          "",
          "Razem",
          nf2.format(sum("rata")),
          nf2.format(sum("kapital")),
          nf2.format(sum("odsetki")),
          nf2.format(sum("prowizja")),
          "",
        ],
      ],
      { size: 7.6, zebra: true },
    );
  }

  w.note(
    "Propozycja ma charakter informacyjny i nie stanowi oferty w rozumieniu art. 66 Kodeksu cywilnego. " +
      "Ostateczne warunki określi umowa pożyczki po weryfikacji wniosku i zabezpieczenia. " +
      "Kwoty w zł; ostatnia rata może różnić się o grosze z powodu zaokrągleń.",
  );

  return w.save();
}
