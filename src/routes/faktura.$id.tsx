import { createFileRoute, useParams, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft } from "lucide-react";
import { getInvoiceForPrint } from "@/lib/invoicing/operator-invoices.functions";

export const Route = createFileRoute("/faktura/$id")({
  component: InvoicePrintPage,
});

function money(n: number | string | null | undefined, currency = "PLN"): string {
  const v = Number(n ?? 0);
  return `${v.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("pl-PL");
  } catch {
    return d;
  }
}

function InvoicePrintPage() {
  const { id } = useParams({ from: "/faktura/$id" });
  const router = useRouter();
  const getFn = useServerFn(getInvoiceForPrint);

  const { data, isLoading, error } = useQuery({
    queryKey: ["invoice-print", id],
    queryFn: () => getFn({ data: { id } }),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center text-muted-foreground">
        Ładowanie faktury…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div className="space-y-3">
          <p className="text-sm text-destructive">
            {(error as Error)?.message ?? "Nie udało się wczytać faktury."}
          </p>
          <Button variant="outline" onClick={() => router.history.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Wróć
          </Button>
        </div>
      </div>
    );
  }

  const inv = data.invoice as any;
  const ent = data.entity as any;
  const currency = inv.currency || "PLN";
  const items: any[] =
    Array.isArray(inv.items) && inv.items.length
      ? inv.items
      : [
          {
            name: "Usługa",
            quantity: 1,
            unit: "szt.",
            unitNet: inv.net_amount,
            vatRate: inv.vat_rate,
          },
        ];

  const vatPct = inv.vat_rate === "zw" || inv.vat_rate === "0" ? 0 : Number(inv.vat_rate) || 0;

  return (
    <div className="min-h-screen bg-muted/40 py-6 print:bg-white print:py-0">
      {/* Pasek akcji — ukryty na wydruku */}
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between px-4 print:hidden">
        <Button variant="outline" size="sm" onClick={() => router.history.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Wróć
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" /> Drukuj / Zapisz PDF
        </Button>
      </div>

      {/* Kartka A4 */}
      <div className="mx-auto max-w-[210mm] bg-white p-[14mm] text-[13px] leading-relaxed text-slate-900 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <div className="flex items-start justify-between border-b border-slate-300 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Faktura VAT</h1>
            <div className="mt-1 font-mono text-sm text-slate-600">{inv.invoice_number ?? "—"}</div>
          </div>
          <table className="text-right text-xs text-slate-600">
            <tbody>
              <tr>
                <td className="pr-3 text-slate-400">Data wystawienia:</td>
                <td className="font-medium text-slate-800">{fmtDate(inv.issue_date)}</td>
              </tr>
              <tr>
                <td className="pr-3 text-slate-400">Data sprzedaży:</td>
                <td className="font-medium text-slate-800">{fmtDate(inv.sale_date)}</td>
              </tr>
              <tr>
                <td className="pr-3 text-slate-400">Termin płatności:</td>
                <td className="font-medium text-slate-800">{fmtDate(inv.due_date)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-6">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Sprzedawca
            </div>
            <div className="mt-1 font-semibold">{ent?.legal_name ?? ent?.name ?? "—"}</div>
            {ent?.address_street && <div>{ent.address_street}</div>}
            {(ent?.address_postal_code || ent?.address_city) && (
              <div>{[ent.address_postal_code, ent.address_city].filter(Boolean).join(" ")}</div>
            )}
            {ent?.nip && <div>NIP: {ent.nip}</div>}
            {ent?.email && <div className="text-slate-500">{ent.email}</div>}
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Nabywca
            </div>
            <div className="mt-1 font-semibold">{inv.buyer_name ?? "—"}</div>
            {inv.buyer_street && <div>{inv.buyer_street}</div>}
            {(inv.buyer_postal_code || inv.buyer_city) && (
              <div>{[inv.buyer_postal_code, inv.buyer_city].filter(Boolean).join(" ")}</div>
            )}
            {inv.buyer_nip && <div>NIP: {inv.buyer_nip}</div>}
            {inv.buyer_email && <div className="text-slate-500">{inv.buyer_email}</div>}
          </div>
        </div>

        <table className="mt-5 w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-y border-slate-300 bg-slate-50 text-left text-[11px] uppercase text-slate-500">
              <th className="py-2 pl-2 pr-1 font-semibold">Lp</th>
              <th className="py-2 px-1 font-semibold">Nazwa</th>
              <th className="py-2 px-1 text-right font-semibold">Ilość</th>
              <th className="py-2 px-1 text-right font-semibold">Cena netto</th>
              <th className="py-2 px-1 text-right font-semibold">Wartość netto</th>
              <th className="py-2 px-1 text-right font-semibold">VAT</th>
              <th className="py-2 pl-1 pr-2 text-right font-semibold">Wartość brutto</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const qty = Number(it.quantity ?? 1);
              const unitNet = Number(it.unitNet ?? inv.net_amount ?? 0);
              const lineNet = Math.round(unitNet * qty * 100) / 100;
              const pct = it.vatRate === "zw" || it.vatRate === "0" ? 0 : Number(it.vatRate) || 0;
              const lineVat = Math.round(lineNet * (pct / 100) * 100) / 100;
              const lineGross = Math.round((lineNet + lineVat) * 100) / 100;
              return (
                <tr key={idx} className="border-b border-slate-200 align-top">
                  <td className="py-2 pl-2 pr-1 text-slate-500">{idx + 1}</td>
                  <td className="py-2 px-1">{it.name ?? "—"}</td>
                  <td className="py-2 px-1 text-right tabular-nums">
                    {qty} {it.unit ?? "szt."}
                  </td>
                  <td className="py-2 px-1 text-right tabular-nums">{money(unitNet, currency)}</td>
                  <td className="py-2 px-1 text-right tabular-nums">{money(lineNet, currency)}</td>
                  <td className="py-2 px-1 text-right tabular-nums">
                    {it.vatRate === "zw" ? "zw." : `${pct}%`}
                  </td>
                  <td className="py-2 pl-1 pr-2 text-right tabular-nums">
                    {money(lineGross, currency)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <table className="text-[13px]">
            <tbody>
              <tr>
                <td className="py-0.5 pr-6 text-slate-500">Razem netto:</td>
                <td className="py-0.5 text-right tabular-nums">
                  {money(inv.net_amount, currency)}
                </td>
              </tr>
              <tr>
                <td className="py-0.5 pr-6 text-slate-500">
                  VAT {inv.vat_rate === "zw" ? "(zw.)" : `${vatPct}%`}:
                </td>
                <td className="py-0.5 text-right tabular-nums">
                  {money(inv.vat_amount, currency)}
                </td>
              </tr>
              <tr className="border-t border-slate-300">
                <td className="py-1 pr-6 font-bold">Do zapłaty:</td>
                <td className="py-1 text-right text-base font-bold tabular-nums">
                  {money(inv.gross_amount, currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-6 rounded-md border border-slate-300 bg-slate-50 p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Płatność — przelew na rachunek
          </div>
          <div className="mt-1 font-mono text-base font-semibold tracking-wide">
            {data.bankAccount || "— brak numeru rachunku —"}
          </div>
          {!data.bankAccount && (
            <div className="mt-1 text-[11px] text-slate-500">
              Uzupełnij numer rachunku przy wystawianiu faktury lub w danych podmiotu.
            </div>
          )}
        </div>

        <div className="mt-10 grid grid-cols-2 gap-6 text-center text-[11px] text-slate-400">
          <div>
            <div className="mx-auto mb-1 h-px w-40 bg-slate-300" />
            Osoba upoważniona do wystawienia
          </div>
          <div>
            <div className="mx-auto mb-1 h-px w-40 bg-slate-300" />
            Osoba upoważniona do odbioru
          </div>
        </div>
      </div>
    </div>
  );
}
