import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getWindCase,
  type WindCase,
  type WindLoan,
  type WindBorrower,
  type WindEvent,
  type WindDocument,
} from "@/lib/windykacja.functions";
import {
  PATH_LABELS,
  stageLabel,
  EVENT_TYPE_LABELS,
  DELIVERY_STATUS_LABELS,
  effectiveDeliveryDate,
  deliveryDeadline,
} from "@/lib/windykacja-procedure";
import { windDebtSnapshot } from "@/lib/windykacja-debt";
import { currentMaxDelayRate } from "@/lib/debt-collection-math";
import { opisHarmonogramu, warsawToday } from "@/lib/windykacja-recalc";
import {
  RATA_STATUS_LABEL,
  formatDataPL,
  formatStopa,
  formatZl,
  rataStatus,
} from "@/components/inwestor/wind-harmonogram-form";
import { formatDate, formatDateTime } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer } from "lucide-react";

export const Route = createFileRoute("/inwestor/windykacja/$caseId/raport")({
  component: EvidenceReport,
});

/** Dzisiejsza data w Polsce — ta sama, na którą serwer przelicza sprawę. */
const todayISO = () => warsawToday();

// CSS druku: chowamy nawigację panelu i przyciski, ustawiamy czysty układ A4.
const PRINT_CSS = `
@media print {
  aside { display: none !important; }
  .no-print { display: none !important; }
  main { padding: 0 !important; overflow: visible !important; }
  .wind-report { font-size: 11px; }
  .wind-report table { page-break-inside: auto; }
  .wind-report tr { page-break-inside: avoid; }
}
.wind-report { color: #111; }
.wind-report table { width: 100%; border-collapse: collapse; }
.wind-report th, .wind-report td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
.wind-report th { background: #f3f4f6; font-weight: 600; }
`;

function EvidenceReport() {
  const { caseId } = Route.useParams();
  const fetchCase = useServerFn(getWindCase);

  const [kase, setKase] = useState<WindCase | null>(null);
  const [loan, setLoan] = useState<WindLoan | null>(null);
  const [borrower, setBorrower] = useState<WindBorrower | null>(null);
  const [events, setEvents] = useState<WindEvent[]>([]);
  const [documents, setDocuments] = useState<WindDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const res = await fetchCase({ data: { caseId } });
      setKase(res.case);
      setLoan(res.loan);
      setBorrower(res.borrower);
      setEvents(res.events);
      setDocuments(res.documents);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się pobrać sprawy");
    } finally {
      setLoading(false);
    }
  }, [caseId, fetchCase]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Chronologicznie rosnąco (do akt — czyta się od początku sprawy).
  const ordered = useMemo(
    () => [...events].sort((a, b) => a.data_zdarzenia.localeCompare(b.data_zdarzenia)),
    [events],
  );

  const effDelivery = useMemo(
    () =>
      effectiveDeliveryDate(
        events.map((e) => ({
          typ: e.typ,
          data_zdarzenia: e.data_zdarzenia,
          data_doreczenia: e.data_doreczenia,
          status_doreczenia: e.status_doreczenia,
        })),
      ),
    [events],
  );

  // Stan zadłużenia na dziś — ten sam silnik co karta sprawy i panel.
  const snap = useMemo(
    () =>
      loan && kase
        ? windDebtSnapshot({ loan, kwotaZalegla: kase.kwota_zalegla, events, asOf: todayISO() })
        : null,
    [loan, kase, events],
  );

  const attachments = useMemo(() => events.filter((e) => e.zalacznik_url), [events]);

  // Czynności z naliczoną opłatą windykacyjną (do rejestru opłat).
  const feeEvents = useMemo(
    () =>
      events
        .filter((e) => Number(e.oplata) > 0)
        .sort((a, b) => a.data_zdarzenia.localeCompare(b.data_zdarzenia)),
    [events],
  );
  const feeSum = feeEvents.reduce((s, e) => s + Number(e.oplata), 0);

  if (loading) return <div className="text-muted-foreground">Ładowanie…</div>;
  if (!kase || !loan || !borrower)
    return <div className="text-muted-foreground">Nie znaleziono sprawy.</div>;

  return (
    <div className="space-y-5">
      <style>{PRINT_CSS}</style>

      <div className="flex items-center justify-between gap-3 no-print">
        <Link
          to="/inwestor/windykacja/$caseId"
          params={{ caseId }}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Wróć do sprawy
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-1" /> Drukuj / Zapisz jako PDF
        </Button>
      </div>

      <div className="wind-report mx-auto max-w-[820px] rounded-lg border bg-white p-8 text-sm shadow-sm dark:bg-white">
        {/* Nagłówek */}
        <div className="border-b pb-4 mb-4">
          <div className="text-xs text-gray-500">Finance You sp. z o.o.</div>
          <h1 className="text-xl font-bold mt-1">Raport dowodowy sprawy windykacyjnej</h1>
          <div className="text-xs text-gray-500 mt-1">
            Wygenerowano: {formatDateTime(new Date().toISOString())} · Sprawa nr{" "}
            {kase.id.slice(0, 8).toUpperCase()}
          </div>
        </div>

        {/* Metryka sprawy */}
        <table className="mb-5">
          <tbody>
            <tr>
              <th style={{ width: "30%" }}>Dłużnik</th>
              <td>
                {borrower.imie_nazwisko}
                {borrower.pesel ? `, PESEL ${borrower.pesel}` : ""}
                {borrower.nip ? `, NIP ${borrower.nip}` : ""}
              </td>
            </tr>
            <tr>
              <th>Adres do doręczeń</th>
              <td>{borrower.adres_do_doreczen || borrower.adres_zamieszkania || "—"}</td>
            </tr>
            {loan.pozyczkodawca ? (
              <tr>
                <th>Pożyczkodawca</th>
                <td>{loan.pozyczkodawca}</td>
              </tr>
            ) : null}
            <tr>
              <th>Umowa pożyczki</th>
              <td>
                nr {loan.numer_umowy ?? "—"} z dnia {formatDataPL(loan.data_umowy)} · kwota
                wypłacona {formatZl(loan.kwota_pozyczki)}
                {Number(loan.kwota_calkowita) > 0
                  ? ` · do zwrotu bez odsetek ${formatZl(loan.kwota_calkowita)}`
                  : ""}
                {loan.harmonogram?.length
                  ? ` · harmonogram: ${opisHarmonogramu(loan.harmonogram)}`
                  : ` · termin spłaty ${formatDataPL(loan.termin_splaty)}`}
                {loan.data_wypowiedzenia
                  ? ` · wypowiedziana ${formatDataPL(loan.data_wypowiedzenia)}`
                  : ""}
              </td>
            </tr>
            <tr>
              <th>Zabezpieczenie</th>
              <td>
                KW {loan.numer_kw ?? "—"}
                {loan.kwota_hipoteki != null
                  ? ` (hipoteka do ${formatZl(loan.kwota_hipoteki)})`
                  : ""}
                {loan.akt_notarialny_777 ? ` · akt 777: ${loan.akt_notarialny_777}` : ""}
                {loan.kwota_777 != null ? ` (do ${formatZl(loan.kwota_777)})` : ""}
              </td>
            </tr>
            {loan.rachunek_splaty ? (
              <tr>
                <th>Rachunek do spłaty</th>
                <td>{loan.rachunek_splaty}</td>
              </tr>
            ) : null}
            <tr>
              <th>Ścieżka / etap</th>
              <td>
                {PATH_LABELS[kase.sciezka]} · {stageLabel(kase.sciezka, kase.etap)} · opóźnienie{" "}
                {snap?.dniOpoznienia ?? kase.opoznienie_dni} dni
                {snap?.najstarszaZalegla && snap.zrodlo === "harmonogram"
                  ? ` (od najstarszej zaległej raty z ${formatDataPL(snap.najstarszaZalegla)})`
                  : ""}
              </td>
            </tr>
            <tr>
              <th>Skuteczne doręczenie</th>
              <td>
                {effDelivery
                  ? `${formatDate(effDelivery)} → termin 7 dni upływa ${formatDate(deliveryDeadline(effDelivery))}`
                  : "brak ustalonej daty skutecznego doręczenia"}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Podsumowanie należności */}
        {snap && (
          <div className="mb-5">
            <h2 className="text-sm font-bold mb-2">
              Należność na dzień {formatDataPL(todayISO())}
            </h2>
            <table>
              <tbody>
                {snap.raty ? (
                  <>
                    <tr>
                      <th style={{ width: "45%" }}>
                        Zaległe raty (
                        {snap.raty.raty.filter((r) => r.wymagalna && r.pozostalo > 0).length} z{" "}
                        {snap.raty.liczbaRatWymagalnych} wymagalnych)
                      </th>
                      <td>{formatZl(snap.zaleglosc)}</td>
                    </tr>
                    <tr>
                      <th>Odsetki za opóźnienie</th>
                      <td>{formatZl(snap.odsetkiZaOpoznienie)}</td>
                    </tr>
                    {snap.koszty > 0 && (
                      <tr>
                        <th>Opłaty za czynności windykacyjne</th>
                        <td>{formatZl(snap.koszty)}</td>
                      </tr>
                    )}
                  </>
                ) : snap.debt ? (
                  <>
                    <tr>
                      <th style={{ width: "45%" }}>
                        Kapitał oprocentowany (na rękę + prow. Finance You)
                      </th>
                      <td>{formatZl(snap.debt.principalOutstanding)}</td>
                    </tr>
                    {snap.debt.investorCommissionOutstanding > 0 && (
                      <tr>
                        <th>Prowizja inwestora (spłacana z kapitałem, bez odsetek)</th>
                        <td>{formatZl(snap.debt.investorCommissionOutstanding)}</td>
                      </tr>
                    )}
                    {snap.debt.contractualInterest > 0 && (
                      <tr>
                        <th>Odsetki kapitałowe (umowne)</th>
                        <td>{formatZl(snap.debt.contractualInterest)}</td>
                      </tr>
                    )}
                    {snap.debt.surchargesOutstanding > 0 && (
                      <tr>
                        <th>Dopłaty / koszty umowne</th>
                        <td>{formatZl(snap.debt.surchargesOutstanding)}</td>
                      </tr>
                    )}
                    <tr>
                      <th>
                        Odsetki za opóźnienie ({formatStopa(snap.debt.effectiveDelayRate)}% rocznie)
                      </th>
                      <td>{formatZl(snap.debt.delayInterest)}</td>
                    </tr>
                    {snap.debt.costsOutstanding > 0 && (
                      <tr>
                        <th>Opłaty za czynności windykacyjne</th>
                        <td>{formatZl(snap.debt.costsOutstanding)}</td>
                      </tr>
                    )}
                  </>
                ) : null}
                <tr>
                  <th>
                    Do zapłaty teraz
                    {snap.wypowiedziana ? " (umowa wypowiedziana — całość wymagalna)" : ""}
                  </th>
                  <td className="font-bold">{formatZl(snap.doZaplatyTeraz)}</td>
                </tr>
                {snap.raty && !snap.wypowiedziana && snap.raty.pozostaleRatyPrzyszle > 0 && (
                  <tr>
                    <th>Raty przyszłe (jeszcze niewymagalne)</th>
                    <td>{formatZl(snap.raty.pozostaleRatyPrzyszle)}</td>
                  </tr>
                )}
                <tr>
                  <th>Całe zadłużenie</th>
                  <td>{formatZl(snap.calosc)}</td>
                </tr>
              </tbody>
            </table>
            <p className="text-gray-600 mt-1" style={{ fontSize: "11px" }}>
              {snap.raty
                ? snap.wypowiedziana
                  ? `Umowa wypowiedziana — wszystkie raty wymagalne od dnia wypowiedzenia, bez odsetek umownych za okres po wypowiedzeniu (gdy harmonogram je wyszczególnia). Odsetki za opóźnienie od każdej niezapłaconej raty od dnia po jej terminie (art. 481 k.c.).`
                  : `Umowa niewypowiedziana — wymagalne są wyłącznie raty po terminie. Odsetki za opóźnienie naliczone od każdej zaległej raty od dnia po jej terminie (termin w dniu wolnym — najbliższy dzień roboczy, art. 115 k.c.).`
                : snap.debt?.delayRegime === "calosc_po_wypowiedzeniu"
                  ? `Umowa wypowiedziana — odsetki za opóźnienie naliczone od całości oprocentowanej należności (${formatZl(snap.debt.delayInterestBase)}; kapitał na rękę + prowizja Finance You + odsetki + dopłaty) na podstawie art. 481 § 2¹ k.c. Prowizja inwestora jest należna, lecz nieoprocentowana.`
                  : snap.debt?.delayRegime === "zalegle_raty"
                    ? `Umowa niewypowiedziana — odsetki za opóźnienie naliczone wyłącznie od kwoty zaległej (${formatZl(snap.debt.delayInterestBase)}).`
                    : "Brak wymagalnej zaległości — odsetki za opóźnienie nie naliczane."}{" "}
              Stopa odsetek za opóźnienie:{" "}
              {Number(loan.stopa_odsetek_max) > 0
                ? `${formatStopa(Number(loan.stopa_odsetek_max))}% rocznie wg umowy`
                : "odsetki maksymalne"}
              {snap.raty
                ? `, w każdym dniu nie wyższa niż odsetki maksymalne za opóźnienie (art. 481 § 2¹ k.c.; na dzień raportu ${formatStopa(currentMaxDelayRate(todayISO()))}%). Wpłaty zaliczane wg umowy (art. 451 k.c.): prowizja z rat wymagalnych → koszty windykacyjne → odsetki za opóźnienie → odsetki umowne → kapitał (od najstarszej raty).`
                : "."}
            </p>
          </div>
        )}

        {/* Harmonogram rat — stan każdej raty */}
        {snap?.raty && (
          <div className="mb-5">
            <h2 className="text-sm font-bold mb-2">
              Harmonogram rat — stan na dzień {formatDataPL(snap.raty.asOf)}
            </h2>
            <table>
              <thead>
                <tr>
                  <th style={{ width: "6%" }}>Nr</th>
                  <th>Termin</th>
                  <th>Kwota raty</th>
                  <th>Zapłacono</th>
                  <th>Pozostało</th>
                  <th>Opóźnienie</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {snap.raty.raty.map((r) => (
                  <tr key={r.nr}>
                    <td>{r.nr}</td>
                    <td className="whitespace-nowrap">
                      {formatDataPL(r.termin)}
                      {r.terminSkuteczny > r.termin
                        ? ` (płatna do ${formatDataPL(r.terminSkuteczny)})`
                        : ""}
                    </td>
                    <td className="whitespace-nowrap">{formatZl(r.kwotaWymagana)}</td>
                    <td className="whitespace-nowrap">
                      {r.zaplacono > 0 ? formatZl(r.zaplacono) : "—"}
                    </td>
                    <td className="whitespace-nowrap">
                      {r.pozostalo > 0 ? formatZl(r.pozostalo) : "—"}
                    </td>
                    <td className="whitespace-nowrap">
                      {r.dniOpoznienia > 0 ? `${r.dniOpoznienia} dni` : "—"}
                    </td>
                    <td>{RATA_STATUS_LABEL[rataStatus(r)]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Chronologia zdarzeń */}
        <h2 className="text-sm font-bold mb-2">
          Chronologiczny rejestr zdarzeń ({ordered.length})
        </h2>
        <table>
          <thead>
            <tr>
              <th style={{ width: "13%" }}>Data zdarzenia</th>
              <th style={{ width: "13%" }}>Typ</th>
              <th>Opis i status doręczenia</th>
              <th style={{ width: "10%" }}>Dowód</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((e) => {
              const dl = deliveryDeadline(e.data_doreczenia);
              const hasDeadline =
                dl &&
                (e.status_doreczenia === "doreczone" ||
                  e.status_doreczenia === "termin_uplynal" ||
                  e.status_doreczenia === "zwrot");
              const meta = e.metadata as { kwota?: number; numer_nadania?: string };
              return (
                <tr key={e.id}>
                  <td className="whitespace-nowrap">{formatDateTime(e.data_zdarzenia)}</td>
                  <td>{EVENT_TYPE_LABELS[e.typ]}</td>
                  <td>
                    <div className="font-medium">{e.tytul}</div>
                    {e.typ === "wplata" && meta?.kwota != null && (
                      <div>Kwota: {formatZl(meta.kwota)}</div>
                    )}
                    {meta?.numer_nadania && <div>Nr nadania: {meta.numer_nadania}</div>}
                    {e.tresc && <div className="text-gray-600 whitespace-pre-wrap">{e.tresc}</div>}
                    {e.status_doreczenia && (
                      <div className="mt-0.5">
                        Doręczenie: {DELIVERY_STATUS_LABELS[e.status_doreczenia]}
                        {e.data_doreczenia && e.status_doreczenia !== "oczekuje"
                          ? ` (${formatDate(e.data_doreczenia)})`
                          : ""}
                        {hasDeadline ? ` — termin 7 dni do ${formatDate(dl)}` : ""}
                      </div>
                    )}
                    {e.autor && <div className="text-gray-500 text-[11px]">autor: {e.autor}</div>}
                  </td>
                  <td>
                    {e.zalacznik_url ? "skan w aktach" : e.typ.startsWith("pismo") ? "BRAK" : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Rejestr opłat za czynności windykacyjne */}
        {feeEvents.length > 0 && (
          <div className="mt-5">
            <h2 className="text-sm font-bold mb-2">
              Rejestr opłat za czynności windykacyjne ({feeEvents.length})
            </h2>
            <table>
              <thead>
                <tr>
                  <th style={{ width: "18%" }}>Data</th>
                  <th>Czynność</th>
                  <th style={{ width: "18%" }}>Opłata</th>
                </tr>
              </thead>
              <tbody>
                {feeEvents.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap">{formatDate(e.data_zdarzenia)}</td>
                    <td>{e.tytul}</td>
                    <td>{formatZl(Number(e.oplata))}</td>
                  </tr>
                ))}
                <tr>
                  <th colSpan={2}>Suma opłat</th>
                  <td className="font-bold">{formatZl(feeSum)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Załączniki */}
        <div className="mt-5">
          <h2 className="text-sm font-bold mb-2">Wykaz załączników ({attachments.length})</h2>
          {attachments.length === 0 ? (
            <div className="text-gray-600">Brak załączonych skanów.</div>
          ) : (
            <ol className="list-decimal pl-5">
              {attachments.map((e) => (
                <li key={e.id}>
                  {EVENT_TYPE_LABELS[e.typ]} — {e.tytul} ({formatDate(e.data_zdarzenia)})
                </li>
              ))}
            </ol>
          )}
        </div>

        {documents.length > 0 && (
          <div className="mt-5">
            <h2 className="text-sm font-bold mb-2">Wygenerowane dokumenty ({documents.length})</h2>
            <ol className="list-decimal pl-5">
              {documents.map((d) => (
                <li key={d.id}>
                  {d.tytul} ({formatDate(d.created_at)})
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="mt-8 pt-4 border-t text-xs text-gray-500">
          Raport wygenerowany automatycznie z rejestru zdarzeń (append-only). Dokument przeznaczony
          do akt sprawy. Finance You sp. z o.o.
        </div>
      </div>
    </div>
  );
}
