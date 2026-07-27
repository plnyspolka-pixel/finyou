import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Sparkles } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { assistBusinessDescription } from "@/lib/ai-assist.functions";
import { toast } from "sonner";

export function InvestorDescriptionCard({
  loanId,
  initialText,
  onSaved,
}: {
  loanId: string | null;
  initialText: string;
  onSaved?: () => void;
}) {
  const [text, setText] = useState(initialText ?? "");
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const qc = useQueryClient();
  const assistDesc = useServerFn(assistBusinessDescription);

  useEffect(() => {
    setText(initialText ?? "");
  }, [initialText, loanId]);

  const hasDesc = text.trim().length >= 20;

  const generate = async (mode: "draft" | "improve" | "expand") => {
    if (!loanId) {
      toast.error("Brak wniosku");
      return;
    }
    setAiBusy(true);
    const t = toast.loading("Generuję opis…");
    try {
      const res: any = await assistDesc({ data: { currentText: text, mode, loanId } });
      if (res?.text) setText(String(res.text));
      toast.success("Gotowe — sprawdź i popraw wedle uznania.", { id: t });
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd AI", { id: t });
    } finally {
      setAiBusy(false);
    }
  };

  const save = async () => {
    if (!loanId) return;
    if (!hasDesc) {
      toast.error("Opis powinien mieć min. 20 znaków");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("loan_applications")
        .update({ investor_description: text.trim() })
        .eq("id", loanId);
      if (error) throw error;
      toast.success("Opis zapisany");
      void qc.invalidateQueries({ queryKey: ["client-loan-desc", loanId] });
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd zapisu");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-600">
        2–5 zdań — po co potrzebujesz finansowania i jak je spłacisz. Dobry opis przyciąga lepsze
        oferty.
      </div>
      <Textarea
        rows={5}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Np. Potrzebuję 200 000 zł na uruchomienie kolejnego sklepu, mam już 2 lokalizacje. Spłatę pokryję z bieżących przychodów…"
        disabled={aiBusy}
        className="rounded-2xl border-2 border-slate-300 bg-white text-slate-900 focus-visible:border-slate-500"
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => void generate(text.trim() ? "improve" : "draft")}
          disabled={aiBusy}
          className="rounded-xl bg-slate-900 font-semibold text-white hover:bg-slate-800"
        >
          {aiBusy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {text.trim() ? "Popraw opis (AI)" : "Wygeneruj opis (AI)"}
        </Button>
        {text.trim() && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void generate("expand")}
            disabled={aiBusy}
            className="rounded-xl font-semibold"
          >
            Rozwiń (AI)
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => void save()}
          disabled={saving || aiBusy || !hasDesc}
          className="rounded-xl bg-emerald-600 font-semibold text-white hover:bg-emerald-700"
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Zapisz opis
        </Button>
      </div>
    </div>
  );
}
