import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listDebtCases, upsertDebtCase, type DebtCase } from "@/lib/debt-collection.functions";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPLN, formatDate } from "@/lib/labels";
import { Gavel, Plus, FileWarning, CheckCircle2, FileText } from "lucide-react";

export const Route = createFileRoute("/inwestor/windykacja/")({
  component: WindykacjaList,
});

const STATUS: Record<DebtCase["status"], { label: string; cls: string }> = {
  draft: { label: "Szkic", cls: "bg-muted text-muted-foreground" },
  active: {
    label: "W toku",
    cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  },
  closed: {
    label: "Zamknięta",
    cls: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  },
};

function WindykacjaList() {
  const navigate = useNavigate();
  const fetchCases = useServerFn(listDebtCases);
  const createCase = useServerFn(upsertDebtCase);
  const [cases, setCases] = useState<DebtCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const reload = useMemo(
    () => async () => {
      try {
        setCases(await fetchCases());
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się pobrać spraw");
      } finally {
        setLoading(false);
      }
    },
    [fetchCases],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const newCase = async () => {
    setCreating(true);
    try {
      const c = await createCase({ data: { status: "draft" } });
      toast.success("Utworzono nową sprawę (szkic)");
      void navigate({ to: "/inwestor/windykacja/$caseId", params: { caseId: c.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się utworzyć sprawy");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Windykacja"
        title="Sprawy windykacyjne"
        subtitle="Wgraj umowę pożyczki i wpłaty klienta — system wyliczy zadłużenie z maksymalnymi odsetkami za opóźnienie i pozwoli zlecać działania."
        actions={
          <Button onClick={newCase} disabled={creating}>
            <Plus className="h-4 w-4 mr-1" /> Nowa sprawa
          </Button>
        }
      />

      {loading ? (
        <p className="text-muted-foreground">Ładowanie…</p>
      ) : cases.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Gavel className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Brak spraw windykacyjnych.</p>
            <Button onClick={newCase} disabled={creating}>
              <Plus className="h-4 w-4 mr-1" /> Załóż pierwszą sprawę
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {cases.map((c) => {
            const st = STATUS[c.status] ?? STATUS.draft;
            return (
              <Link
                key={c.id}
                to="/inwestor/windykacja/$caseId"
                params={{ caseId: c.id }}
                className="block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                preload="intent"
              >
                <Card className="hover:border-primary transition-all hover:shadow-md h-full cursor-pointer">
                  <CardContent className="pt-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold truncate">
                        {c.debtor_name || "Dłużnik (uzupełnij)"}
                      </div>
                      <Badge className={st.cls}>{st.label}</Badge>
                    </div>
                    <div className="text-2xl font-bold tabular-nums">
                      {formatPLN(c.principal_amount)}
                    </div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5" /> Umowa: {c.contract_number || "—"}
                        {c.contract_file_path ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <FileWarning className="h-3.5 w-3.5 text-amber-600" />
                        )}
                      </div>
                      <div>Termin spłaty: {formatDate(c.due_date)}</div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}