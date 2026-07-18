import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Loader2, Wrench } from "lucide-react";

export const Route = createFileRoute("/admin/ustawienia")({
  component: UstawieniaPage,
});

type ReconcileReport = {
  mode: string;
  scanned: number;
  alreadyOk: number;
  recoverable: number;
  fixed: number;
  stillMissing: number;
  stillMissingSample?: string[];
  errors?: { name: string; error: string }[];
};

function UstawieniaPage() {
  const { user, roles } = useAuth();
  const isAdmin = roles.includes("administrator");
  const [busy, setBusy] = useState<null | "scan" | "apply">(null);
  const [report, setReport] = useState<ReconcileReport | null>(null);

  const run = async (apply: boolean) => {
    setBusy(apply ? "apply" : "scan");
    try {
      const { data, error } = await supabase.functions.invoke("reconcile-storage", {
        body: { apply },
      });
      if (error) throw error;
      const rep = data as ReconcileReport;
      setReport(rep);
      if (apply) {
        toast.success(`Naprawiono ${rep.fixed} plików`, {
          description: rep.stillMissing > 0 ? `${rep.stillMissing} nie do odzyskania (brak bajtów w S3).` : undefined,
        });
      } else {
        toast.success(`Podgląd gotowy`, {
          description: `${rep.recoverable} do odzyskania, ${rep.stillMissing} bez szans.`,
        });
      }
    } catch (e: any) {
      toast.error("Błąd naprawy plików", { description: e?.message ?? String(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Ustawienia</h1>
      <Card><CardHeader><CardTitle>Konto</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">
          <div><span className="text-muted-foreground">E-mail:</span> {user?.email}</div>
          <div><span className="text-muted-foreground">ID:</span> <code className="text-xs">{user?.id}</code></div>
          <div><span className="text-muted-foreground">Role:</span> {roles.join(", ") || "—"}</div>
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Moduły systemowe</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <div>Moduł AI selekcji: <b className="text-foreground">Wyłączony</b> (placeholder)</div>
          <div>Auto-wysyłka do inwestorów: <b className="text-foreground">Manualna</b></div>
          <div>Integracje: zarządzaj w sekcji „Integracje”.</div>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Wrench className="h-4 w-4" />Konserwacja plików</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Naprawia pliki klienta osierocone przez wcześniejsze scalenie bucketów
              (szare miniatury, „Nie udało się otworzyć pliku”, błąd 404). Odnajduje
              fizyczny plik w starym buckecie i kopiuje go z powrotem do
              <code className="mx-1">pliki-klienta</code>. Najpierw zrób podgląd.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy !== null} onClick={() => run(false)}>
                {busy === "scan" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Sprawdź (podgląd)
              </Button>
              <Button
                disabled={busy !== null || !report || report.recoverable === 0}
                onClick={() => run(true)}
              >
                {busy === "apply" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Napraw teraz{report && report.recoverable > 0 ? ` (${report.recoverable})` : ""}
              </Button>
            </div>

            {report && (
              <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-1">
                <div className="font-semibold">
                  Tryb: {report.mode === "apply" ? "naprawa" : "podgląd"}
                </div>
                <div>Przeskanowano: <b>{report.scanned}</b></div>
                <div>Już działa: <b>{report.alreadyOk}</b></div>
                <div>Do odzyskania: <b className="text-foreground">{report.recoverable}</b></div>
                {report.mode === "apply" && <div>Naprawiono: <b>{report.fixed}</b></div>}
                <div>
                  Nie do odzyskania (brak bajtów w S3): <b>{report.stillMissing}</b>
                </div>
                {report.stillMissing > 0 && report.stillMissingSample?.length ? (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-muted-foreground">Przykłady zaginionych</summary>
                    <ul className="mt-1 list-disc pl-5 break-all">
                      {report.stillMissingSample.map((n) => <li key={n}>{n}</li>)}
                    </ul>
                  </details>
                ) : null}
                {report.errors?.length ? (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-destructive">Błędy ({report.errors.length})</summary>
                    <ul className="mt-1 list-disc pl-5 break-all">
                      {report.errors.slice(0, 20).map((e, i) => <li key={i}>{e.name}: {e.error}</li>)}
                    </ul>
                  </details>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
