import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Sparkles, Send, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { assistBusinessDescription } from "@/lib/ai-assist.functions";

export const Route = createFileRoute("/wniosek-opis")({
  component: WniosekOpisPage,
  head: () => ({
    meta: [
      { title: "Opis dla inwestora" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function WniosekOpisPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const assist = useServerFn(assistBusinessDescription);

  const [loanId, setLoanId] = useState<string | null>(null);
  const [purpose, setPurpose] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) void navigate({ to: "/logowanie" });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data: c } = await supabase.from("clients").select("id").eq("user_id", user.id).maybeSingle();
      if (!c) { setLoading(false); return; }
      const { data: la } = await supabase
        .from("loan_applications")
        .select("id, investor_description, investor_purpose")
        .eq("client_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (la) {
        setLoanId(la.id);
        setDescription((la as any).investor_description ?? "");
        setPurpose((la as any).investor_purpose ?? "");
      }
      setLoading(false);
    })();
  }, [user]);

  const generate = async (mode: "draft" | "improve" | "expand") => {
    if (!loanId) { toast.error("Brak wniosku"); return; }
    setAiBusy(true);
    try {
      const res: any = await assist({
        data: { currentText: description, hint: purpose, mode, loanId },
      });
      if (res?.text) setDescription(res.text);
      toast.success("Gotowe — sprawdź i popraw wedle uznania.");
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd AI");
    } finally {
      setAiBusy(false);
    }
  };

  const save = async (markComplete: boolean) => {
    if (!loanId) return;
    setSubmitting(true);
    try {
      const payload: any = {
        investor_description: description.trim() || null,
        investor_purpose: purpose.trim() || null,
      };
      if (markComplete) {
        payload.status = "wniosek_kompletny";
        payload.completeness_percent = 100;
        payload.available_to_investors = true;
      }
      const { error } = await supabase.from("loan_applications").update(payload).eq("id", loanId);
      if (error) throw error;
      toast.success(markComplete ? "Wniosek wysłany do analizy" : "Zapisano");
      if (markComplete) {
        try {
          const { trackEvent } = await import("@/lib/fb-pixel");
          await trackEvent("SubmitApplication", { content_name: "Wniosek wysłany do analizy", loan_id: loanId });
        } catch {}
      }
      void navigate({ to: "/klient/wniosek" });
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd zapisu");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="grid min-h-screen place-items-center text-muted-foreground">Ładowanie…</div>;

  if (!loanId) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <Card className="max-w-lg">
          <CardHeader><CardTitle>Brak wniosku</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">Najpierw uzupełnij wniosek.</p>
            <Button onClick={() => navigate({ to: "/wniosek-formularz" })}>Przejdź do wniosku</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle className="text-2xl">Opis dla inwestora</CardTitle>
          <CardDescription>
            Ostatni krok — opisz inwestorowi, na jaki cel biznesowy potrzebujesz środków
            i jak planujesz spłatę. Możesz wygenerować propozycję AI i ją doszlifować.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label htmlFor="purpose">Cel pożyczki (krótko, 1–2 zdania)</Label>
            <Input
              id="purpose"
              maxLength={500}
              placeholder="np. zakup lokalu pod wynajem krótkoterminowy w Krakowie"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Te wskazówki AI wykorzysta przy generowaniu opisu.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label htmlFor="desc">Opis dla inwestora</Label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" disabled={aiBusy} onClick={() => void generate("draft")}>
                  {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="mr-1 h-4 w-4" /> Wygeneruj</>}
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={aiBusy || !description.trim()} onClick={() => void generate("improve")}>
                  Popraw AI
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={aiBusy || !description.trim()} onClick={() => void generate("expand")}>
                  Rozwiń AI
                </Button>
              </div>
            </div>
            <Textarea
              id="desc"
              rows={10}
              maxLength={4000}
              placeholder="Akapit dla inwestora: na co środki, jaki efekt biznesowy, źródła spłaty, harmonogram…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">{description.length}/4000</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 justify-between pt-2">
            <Button variant="ghost" onClick={() => navigate({ to: "/wniosek-formularz" })}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Wróć do wniosku
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" disabled={submitting} onClick={() => void save(false)}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Zapisz roboczo"}
              </Button>
              <Button variant="cta" size="cta" disabled={submitting || !description.trim()} onClick={() => void save(true)}>
                {submitting ? <Loader2 className="animate-spin" /> : <><Send className="mr-2" /> Wyślij do analizy</>}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
