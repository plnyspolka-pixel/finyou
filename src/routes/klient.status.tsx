import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Sparkles, Save, Wand2, PencilLine, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { assistBusinessDescription } from "@/lib/ai-assist.functions";

export const Route = createFileRoute("/klient/status")({
  component: KlientOpis,
});

function KlientOpis() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const assist = useServerFn(assistBusinessDescription);
  const [clientId, setClientId] = useState<string | null>(null);
  const [loanId, setLoanId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [hint, setHint] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [aiBusy, setAiBusy] = useState<"draft" | "improve" | "expand" | null>(null);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      setLoading(true);
      const { data: c } = await supabase.from("clients").select("id").eq("user_id", user.id).maybeSingle();
      if (c) {
        setClientId(c.id);
        const { data: l } = await supabase
          .from("loan_applications")
          .select("id, situation_description")
          .eq("client_id", c.id)
          .order("created_at", { ascending: false })
          .maybeSingle();
        if (l) {
          setLoanId(l.id);
          setText(l.situation_description ?? "");
        }
      }
      setLoading(false);
    })();
  }, [user]);

  const ensureLoan = async (): Promise<string | null> => {
    if (loanId) return loanId;
    if (!clientId) { toast.error("Brak profilu klienta"); return null; }
    const { data, error } = await supabase
      .from("loan_applications")
      .insert({ client_id: clientId, situation_description: text })
      .select("id")
      .single();
    if (error) { toast.error(error.message); return null; }
    setLoanId(data.id);
    return data.id;
  };

  const save = async () => {
    setSaving(true);
    const id = await ensureLoan();
    if (!id) { setSaving(false); return; }
    const { error } = await supabase
      .from("loan_applications")
      .update({ situation_description: text })
      .eq("id", id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Opis zapisany");
  };

  const removeLoan = async () => {
    if (!loanId) return;
    setDeleting(true);
    const { error } = await supabase.from("loan_applications").delete().eq("id", loanId);
    setDeleting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Wniosek usunięty");
    setLoanId(null);
    setText("");
    void navigate({ to: "/klient" });
  };

  const runAi = async (mode: "draft" | "improve" | "expand") => {
    if (mode !== "draft" && !text.trim()) {
      toast.error("Najpierw napisz coś od siebie albo użyj „Napisz wstępny opis”.");
      return;
    }
    setAiBusy(mode);
    try {
      const res = await assist({ data: { currentText: text, hint, mode } });
      if (res?.text) {
        setText(res.text);
        toast.success("Gotowe — sprawdź i zapisz");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd AI");
    } finally {
      setAiBusy(null);
    }
  };

  if (loading) {
    return <div className="max-w-3xl"><div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/> Ładowanie…</div></div>;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Opis celu biznesowego</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Powiedz inwestorom, na co konkretnie przeznaczysz środki i jaki efekt biznesowy chcesz osiągnąć.
        </p>
      </div>

      <Alert>
        <Sparkles className="h-4 w-4" />
        <AlertTitle>Dobry opis = wyższa szansa finansowania</AlertTitle>
        <AlertDescription className="text-sm space-y-1">
          <p>Napisz w kilku zdaniach:</p>
          <ul className="list-disc pl-5 space-y-0.5">
            <li>na co konkretnie pójdą środki (zakup, remont, kapitał obrotowy, spłata zobowiązań…),</li>
            <li>jaki efekt biznesowy chcesz osiągnąć i w jakim czasie,</li>
            <li>z czego planujesz spłacać pożyczkę.</li>
          </ul>
          <p className="pt-1">Nie wiesz, jak to ująć? Skorzystaj z asystenta AI poniżej — możesz go używać tak często, jak chcesz.</p>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader><CardTitle className="text-base">Twój opis</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Np. Środki przeznaczę na zakup maszyny CNC za 180 000 zł, która pozwoli realizować dodatkowe zamówienia w branży meblarskiej. Spodziewam się wzrostu przychodów o 25% w pierwszych 6 miesiącach. Spłata z bieżącej sprzedaży i nowych kontraktów."
            rows={10}
            className="resize-y"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{text.trim().length} znaków{!loanId ? " · wersja robocza" : ""}</span>
            <Button onClick={() => void save()} disabled={saving} size="sm">
              {saving ? <Loader2 className="h-4 w-4 animate-spin"/> : <Save className="h-4 w-4"/>}
              Zapisz
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary"/> Asystent AI</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Wskazówki dla AI (opcjonalnie)</label>
            <Input
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="Np. branża: gastronomia, cel: otwarcie drugiego lokalu, kwota 250 000 zł"
            />
            <p className="text-xs text-muted-foreground">Im więcej szczegółów podasz, tym lepszy opis.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void runAi("draft")} disabled={aiBusy !== null}>
              {aiBusy === "draft" ? <Loader2 className="h-4 w-4 animate-spin"/> : <PencilLine className="h-4 w-4"/>}
              Napisz wstępny opis
            </Button>
            <Button variant="outline" onClick={() => void runAi("improve")} disabled={aiBusy !== null}>
              {aiBusy === "improve" ? <Loader2 className="h-4 w-4 animate-spin"/> : <Wand2 className="h-4 w-4"/>}
              Popraw mój tekst
            </Button>
            <Button variant="outline" onClick={() => void runAi("expand")} disabled={aiBusy !== null}>
              {aiBusy === "expand" ? <Loader2 className="h-4 w-4 animate-spin"/> : <Sparkles className="h-4 w-4"/>}
              Rozwiń opis
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            AI nadpisze treść w polu wyżej — przejrzyj wynik, popraw co trzeba i kliknij „Zapisz”.
          </p>
        </CardContent>
      </Card>

      {loanId && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-base text-destructive">Strefa niebezpieczna</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Usunięcie wniosku jest nieodwracalne. Załączone dokumenty pozostaną w sekcji „Dokumenty”.
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={deleting}>
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin"/> : <Trash2 className="h-4 w-4"/>}
                  Usuń wniosek
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Usunąć wniosek?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Tej operacji nie da się cofnąć. Wniosek wraz z opisem zostanie trwale usunięty.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Anuluj</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void removeLoan()}>Usuń</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
