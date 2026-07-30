// Moduł „Karta oferty" — lista tematów z publicznymi linkami dla inwestorów.
// Każdy wniosek dostępny dla inwestorów ma tokenowaną, zewnętrzną stronę
// /karta/<token> z pełnym dossier (treść KW, mapa, okolica, analiza ryzyka).
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, ExternalLink, IdCard } from "lucide-react";
import { formatPLN, loanStatusLabels } from "@/lib/labels";
import { ensureOfferCardLink } from "@/lib/offer-card.functions";

export const Route = createFileRoute("/admin/karty-ofert")({
  component: KartyOfertPage,
});

function KartyOfertPage() {
  const ensureLink = useServerFn(ensureOfferCardLink);
  const [apps, setApps] = useState<any[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("loan_applications")
        .select(
          "id, status, loan_amount, offer_card_token, available_to_investors, client:clients(first_name,last_name), properties(land_register_number, city)",
        )
        .eq("available_to_investors", true)
        .order("created_at", { ascending: false });
      setApps(data ?? []);
    })();
  }, []);

  const getUrl = async (applicationId: string): Promise<string | null> => {
    if (urls[applicationId]) return urls[applicationId];
    setBusyId(applicationId);
    try {
      const res = await ensureLink({ data: { applicationId } });
      setUrls((u) => ({ ...u, [applicationId]: res.url }));
      return res.url;
    } catch (e: any) {
      toast.error("Nie udało się wygenerować linku", { description: e?.message });
      return null;
    } finally {
      setBusyId(null);
    }
  };

  const copy = async (applicationId: string) => {
    const u = await getUrl(applicationId);
    if (!u) return;
    try {
      await navigator.clipboard.writeText(u);
      toast.success("Skopiowano link Karty oferty");
    } catch {
      toast.info(u);
    }
  };

  const open = async (applicationId: string) => {
    const u = await getUrl(applicationId);
    if (u) window.open(u, "_blank", "noopener");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <IdCard className="h-6 w-6" /> Karty ofert
        </h1>
        <p className="text-sm text-muted-foreground">
          Publiczne linki z pełnym dossier tematu (treść KW, mapa, mieszkańcy, okolica, analiza
          ryzyka) do przekazania inwestorom. Ten sam link trafia do maili dystrybucji.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Wnioski dostępne dla inwestorów ({apps.length})</CardTitle>
          <CardDescription>
            Wniosek trafia tutaj po kwalifikacji „Rokuje → do inwestorów" na karcie wniosku.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {apps.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Brak wniosków dostępnych dla inwestorów.
            </p>
          )}
          {apps.map((a) => {
            const p = Array.isArray(a.properties) ? a.properties[0] : a.properties;
            return (
              <div
                key={a.id}
                className="border rounded-md p-3 flex items-center gap-3 flex-wrap text-sm"
              >
                <div className="flex-1 min-w-[200px]">
                  <Link
                    to="/admin/wnioski/$id"
                    params={{ id: a.id }}
                    className="font-medium hover:underline"
                  >
                    {a.client ? `${a.client.first_name} ${a.client.last_name}` : "—"}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {formatPLN(a.loan_amount)}
                    {p?.city ? ` · ${p.city}` : ""}
                    {p?.land_register_number ? ` · KW ${p.land_register_number}` : ""}
                  </div>
                </div>
                <Badge variant="secondary">{loanStatusLabels[a.status] ?? a.status}</Badge>
                {a.offer_card_token && <Badge variant="outline">link aktywny</Badge>}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === a.id}
                    onClick={() => void copy(a.id)}
                  >
                    <Copy className="mr-1 h-3.5 w-3.5" /> Kopiuj link
                  </Button>
                  <Button size="sm" disabled={busyId === a.id} onClick={() => void open(a.id)}>
                    <ExternalLink className="mr-1 h-3.5 w-3.5" /> Otwórz
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
