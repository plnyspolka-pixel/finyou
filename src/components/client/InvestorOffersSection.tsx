import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { FancyShell } from "@/components/landing/fancy-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Handshake, Inbox, Calendar, Percent, Wallet } from "lucide-react";

const fmtPLN = (v: number | null | undefined) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("pl-PL", {
        style: "currency",
        currency: "PLN",
        maximumFractionDigits: 0,
      }).format(Number(v));

export function InvestorOffersSection({ loanApplicationId }: { loanApplicationId: string | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ["client-investor-offers", loanApplicationId],
    queryFn: async () => {
      if (!loanApplicationId) return [];
      const { data } = await supabase
        .from("loan_proposals")
        .select(
          "id, amount, months, annual_rate, nominal_rata, capped_rata, total_to_repay, status, note, created_at, created_by",
        )
        .eq("source_application_id", loanApplicationId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: Boolean(loanApplicationId),
  });

  const offers = data ?? [];

  return (
    <FancyShell variant="navy" motion={false}>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 text-white ring-1 ring-white/25">
            <Handshake className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">
              Oferty od inwestorów
            </div>
            <h2 className="text-lg font-black uppercase tracking-wider text-white sm:text-xl">
              Propozycje umowy pożyczki
            </h2>
            <p className="mt-1 text-sm text-white/70">
              Tutaj zobaczysz oferty zawarcia umowy pożyczki złożone dla Ciebie przez naszych
              inwestorów.
            </p>
          </div>
        </div>

        {!loanApplicationId ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
            Najpierw uzupełnij wniosek — inwestorzy zaczną składać oferty, gdy zobaczą Twoje
            warunki.
          </div>
        ) : isLoading ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
            Ładowanie ofert…
          </div>
        ) : offers.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/15 bg-white/[0.04] p-8 text-center">
            <Inbox className="h-8 w-8 text-white/50" />
            <div className="text-sm font-semibold text-white">Jeszcze brak ofert</div>
            <div className="max-w-md text-xs text-white/60">
              Powiadomimy Cię, gdy inwestor złoży propozycję. Możesz zwiększyć szanse uzupełniając
              weryfikacje poniżej — obniżają one koszt pożyczki.
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {offers.map((o: any) => (
              <div
                key={o.id}
                className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/60">
                      Oferta inwestora
                    </div>
                    <div className="text-xl font-black text-white">{fmtPLN(o.amount)}</div>
                  </div>
                  <Badge
                    className={
                      o.status === "accepted"
                        ? "border-emerald-400/40 bg-emerald-500/20 text-emerald-200"
                        : o.status === "rejected"
                          ? "border-rose-400/40 bg-rose-500/20 text-rose-200"
                          : "border-amber-400/40 bg-amber-500/20 text-amber-200"
                    }
                  >
                    {o.status === "accepted"
                      ? "Zaakceptowana"
                      : o.status === "rejected"
                        ? "Odrzucona"
                        : "Nowa"}
                  </Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-white/80">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-white/50" />
                    {o.months} mc
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Percent className="h-3.5 w-3.5 text-white/50" />
                    {Number(o.annual_rate).toFixed(2)}%/rok
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5 text-white/50" />
                    {fmtPLN(o.capped_rata || o.nominal_rata)}/mc
                  </div>
                </div>
                {o.note ? (
                  <div className="mt-3 rounded-lg bg-white/[0.04] p-2 text-xs italic text-white/70">
                    „{o.note}"
                  </div>
                ) : null}
                <div className="mt-3 flex justify-end">
                  <Button
                    asChild
                    size="sm"
                    className="rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 font-bold text-white hover:from-emerald-400 hover:to-emerald-500"
                  >
                    <Link to="/propozycje/$id" params={{ id: o.id }}>
                      Zobacz ofertę →
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </FancyShell>
  );
}
