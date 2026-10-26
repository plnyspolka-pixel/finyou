import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPLN, formatDateTime } from "@/lib/labels";
import {
  getMyInvestorReactions,
  type InvestorReaction,
  type ReactionKind,
  type ReactionTone,
} from "@/lib/broker-crm.functions";

const KIND_LABEL: Record<ReactionKind, string> = {
  wysylka: "Wysyłka",
  dopasowanie: "Zlecenie inwestora",
  propozycja: "Propozycja",
};

const TONE_DOT: Record<ReactionTone, string> = {
  positive: "bg-emerald-500",
  negative: "bg-rose-500",
  neutral: "bg-slate-400",
};

/** Oś czasu reakcji inwestorów na jedną ofertę (najnowsze na górze). */
export function InvestorReactionsList({ reactions }: { reactions: InvestorReaction[] }) {
  if (!reactions.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Inwestorzy jeszcze nie zareagowali na tę ofertę. Gdy ktoś ją otworzy, odpowie albo złoży
        propozycję — zobaczysz to tutaj.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {reactions.map((r) => (
        <li key={r.id} className="flex gap-3">
          <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[r.tone]}`} />
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <b>{r.investor}</b>
              <span>{r.label}</span>
              <Badge variant="outline" className="h-5 text-[10px]">
                {KIND_LABEL[r.kind]}
              </Badge>
            </div>
            {(r.amount != null || r.periodMonths != null || r.yearlyYield != null) && (
              <div className="text-xs text-muted-foreground">
                {[
                  r.amount != null ? formatPLN(r.amount) : null,
                  r.periodMonths != null ? `${r.periodMonths} mies.` : null,
                  r.yearlyYield != null ? `${r.yearlyYield}% rocznie` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}
            {r.note && (
              <p className="text-xs text-muted-foreground whitespace-pre-line">{r.note}</p>
            )}
            <div className="text-[11px] text-muted-foreground">{formatDateTime(r.at)}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Karta „Reakcje inwestorów” na stronie oferty pośrednika. */
export function ApplicationReactionsCard({ applicationId }: { applicationId: string }) {
  const fn = useServerFn(getMyInvestorReactions);
  const q = useQuery({
    queryKey: ["broker-investor-reactions", applicationId],
    queryFn: () => fn({ data: { applicationId } }),
  });
  const app = q.data?.[0];
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Users className="h-4 w-4" /> Reakcje inwestorów
          {app && (
            <span className="flex flex-wrap gap-1.5">
              <Badge variant="secondary">Inwestorzy: {app.summary.investors}</Badge>
              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                Zainteresowani: {app.summary.interested}
              </Badge>
              <Badge variant="secondary">Propozycje: {app.summary.proposals}</Badge>
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Ładowanie…</p>
        ) : q.isError ? (
          <p className="text-sm text-destructive">{(q.error as Error)?.message}</p>
        ) : (
          <InvestorReactionsList reactions={app?.reactions ?? []} />
        )}
      </CardContent>
    </Card>
  );
}
