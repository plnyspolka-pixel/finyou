// Sekcja „Karta oferty" na karcie wniosku: generowanie i kopiowanie
// publicznego linku (strona /karta/<token>) pokazywanego inwestorom.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Copy, ExternalLink, IdCard, Loader2 } from "lucide-react";
import { ensureOfferCardLink } from "@/lib/offer-card.functions";

export function OfferCardSection({ applicationId }: { applicationId: string }) {
  const ensureLink = useServerFn(ensureOfferCardLink);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const generate = async (): Promise<string | null> => {
    setBusy(true);
    try {
      const res = await ensureLink({ data: { applicationId } });
      setUrl(res.url);
      return res.url;
    } catch (e: any) {
      toast.error("Nie udało się wygenerować linku", { description: e?.message });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    const u = url ?? (await generate());
    if (!u) return;
    try {
      await navigator.clipboard.writeText(u);
      toast.success("Skopiowano link Karty oferty");
    } catch {
      toast.info(u);
    }
  };

  const open = async () => {
    const u = url ?? (await generate());
    if (u) window.open(u, "_blank", "noopener");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IdCard className="h-5 w-5" /> Karta oferty (link zewnętrzny)
        </CardTitle>
        <CardDescription>
          Publiczna strona z pełnym dossier tematu: dane klienta i wniosku, pełna treść księgi
          wieczystej, lokalizacja z mapą, liczba mieszkańców, nieruchomości w okolicy oraz źródła
          danych z analizy ryzyka. Link jest tokenowany — działa tylko dla osób, którym go
          przekażesz. Ten sam link trafia do maili dystrybucji.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2 flex-wrap items-center">
          <Button onClick={() => void generate()} disabled={busy} variant="outline">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {url ? "Odśwież link" : "Generuj / pokaż link"}
          </Button>
          <Button onClick={() => void copy()} disabled={busy} variant="outline">
            <Copy className="mr-2 h-4 w-4" /> Kopiuj link
          </Button>
          <Button onClick={() => void open()} disabled={busy}>
            <ExternalLink className="mr-2 h-4 w-4" /> Otwórz kartę
          </Button>
        </div>
        {url && <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />}
      </CardContent>
    </Card>
  );
}
