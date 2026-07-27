import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { formatPLN } from "@/lib/labels";
import { fetchPublicInvoices } from "@/lib/public-invoices.functions";

// Publiczny embed z anonimizowaną listą faktur sprzedaży Finance You.
// Pokazuje wyłącznie: data, numer, opis pozycji, kwota brutto — kupujący anonimowo.

const invoicesQO = queryOptions({
  queryKey: ["embed", "public-invoices"],
  queryFn: () => fetchPublicInvoices(),
  staleTime: 5 * 60 * 1000,
});

export const Route = createFileRoute("/embed/faktury")({
  loader: ({ context }) => context.queryClient.ensureQueryData(invoicesQO),
  head: () => ({
    meta: [
      { title: "Faktury sprzedaży — Finance You" },
      { name: "description", content: "Zanonimizowana lista faktur sprzedaży Finance You." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EmbedInvoices,
});

function EmbedInvoices() {
  const { data } = useSuspenseQuery(invoicesQO);
  const total = data.reduce((acc, r) => acc + r.gross_amount, 0);
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 sm:p-6 text-slate-100">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="flex items-end justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-sky-300/80">Finance You</p>
            <h1 className="text-xl sm:text-2xl font-semibold">Faktury sprzedaży</h1>
            <p className="text-xs text-slate-400 mt-1">
              Dane zanonimizowane — najnowsze {data.length} pozycji.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-widest text-slate-400">Suma brutto</p>
            <p className="text-lg sm:text-xl font-semibold tabular-nums text-emerald-300">
              {formatPLN(total)}
            </p>
          </div>
        </header>

        {data.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-sm text-slate-300">
            Brak wystawionych faktur do wyświetlenia.
          </div>
        ) : (
          <ul className="space-y-2">
            {data.map((inv) => (
              <li
                key={inv.id}
                className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur px-3 py-3 sm:px-4 sm:py-3 flex items-center gap-3 hover:bg-white/[0.07] transition"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="truncate font-mono">{inv.invoice_number ?? "—"}</span>
                  </div>

                  <div className="mt-0.5 truncate text-sm">
                    <span className="text-slate-200">{inv.item_label}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-400">
                    Nabywca: <span className="text-slate-300">{inv.buyer_label}</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm sm:text-base font-semibold tabular-nums text-emerald-300">
                    {formatPLN(inv.gross_amount)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">
                    netto / brutto
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        <footer className="pt-3 text-center text-[11px] text-slate-500">
          financeyou.pl • zestawienie odświeżane automatycznie
        </footer>
      </div>
    </div>
  );
}
