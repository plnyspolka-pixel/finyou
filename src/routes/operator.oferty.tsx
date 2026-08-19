// Zakładka Oferty w panelu operatora: maile od inwestorów instytucjonalnych.
// Wiadomości przychodzące z offer_distribution_messages — zarówno dopasowane
// do dystrybucji/wniosku, jak i te bez wniosku (inwestor napisał poza wątkiem).
// Trafiają tu zamiast do leadów (routing w lib/offer-replies.server.ts).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/labels";
import { Mail, Paperclip } from "lucide-react";

export const Route = createFileRoute("/operator/oferty")({
  component: OperatorOferty,
});

type Row = {
  id: string;
  created_at: string;
  subject: string | null;
  content: string | null;
  from_email: string | null;
  loan_application_id: string | null;
  distribution_id: string | null;
  attachments: unknown;
  investor: {
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
  } | null;
  loan: {
    id: string;
    client: { first_name: string | null; last_name: string | null } | null;
  } | null;
};

function investorLabel(r: Row): string {
  if (r.investor?.company_name) return r.investor.company_name;
  const person = [r.investor?.first_name, r.investor?.last_name].filter(Boolean).join(" ");
  return person || r.from_email || "Nieznany nadawca";
}

function OperatorOferty() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "matched" | "unmatched">("all");

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("offer_distribution_messages")
        .select(
          "id, created_at, subject, content, from_email, loan_application_id, distribution_id, attachments, investor:investors(first_name,last_name,company_name), loan:loan_applications(id, client:clients(first_name,last_name))",
        )
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(200);
      setRows((data as unknown as Row[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const visible = rows.filter((r) =>
    filter === "all"
      ? true
      : filter === "matched"
        ? !!r.loan_application_id
        : !r.loan_application_id,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Oferty — maile od inwestorów</h1>
        <p className="text-sm text-muted-foreground">
          Wiadomości od inwestorów instytucjonalnych (odpowiedzi na dystrybucję ofert). Nie trafiają
          do leadów — dopasowane wiadomości są też widoczne na karcie wniosku w zakładce
          Dystrybucja.
        </p>
      </div>

      <div className="flex gap-2">
        {(
          [
            ["all", "Wszystkie"],
            ["matched", "Dopasowane do wniosku"],
            ["unmatched", "Bez wniosku"],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={filter === key ? "default" : "outline"}
            onClick={() => setFilter(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Wczytywanie…</p>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Brak wiadomości od inwestorów.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => {
            const attachmentsCount = Array.isArray(r.attachments) ? r.attachments.length : 0;
            return (
              <Card key={r.id}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {investorLabel(r)}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {attachmentsCount > 0 && (
                        <Badge variant="outline" className="gap-1">
                          <Paperclip className="h-3 w-3" />
                          {attachmentsCount}
                        </Badge>
                      )}
                      {r.loan ? (
                        <Link to="/operator/wnioski/$id" params={{ id: r.loan.id }}>
                          <Badge>
                            Wniosek:{" "}
                            {r.loan.client
                              ? `${r.loan.client.first_name ?? ""} ${r.loan.client.last_name ?? ""}`.trim()
                              : r.loan.id.slice(0, 8)}
                          </Badge>
                        </Link>
                      ) : (
                        <Badge variant="secondary">Bez wniosku</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDate(r.created_at)}
                      </span>
                    </div>
                  </div>
                  {r.from_email && <p className="text-xs text-muted-foreground">{r.from_email}</p>}
                </CardHeader>
                <CardContent className="space-y-1">
                  {r.subject && <p className="text-sm font-medium">{r.subject}</p>}
                  {r.content && (
                    <p className="text-sm text-muted-foreground whitespace-pre-line line-clamp-4">
                      {r.content}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
