import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getFakturowoStatus } from "@/lib/fakturowo.functions";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  DEFAULT_SELLER,
  SELLER_KEY,
  loadSeller,
  type SellerSettings,
  SellerForm,
  IssueForm,
  DocumentList,
} from "@/components/invoicing/fakturowo-form";

export const Route = createFileRoute("/admin/fakturowo")({
  component: FakturowoPage,
});

function FakturowoPage() {
  const [tab, setTab] = useState("wystaw");
  const [seller, setSeller] = useState<SellerSettings>(DEFAULT_SELLER);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const checkStatus = useServerFn(getFakturowoStatus);

  useEffect(() => {
    setSeller(loadSeller());
    checkStatus({}).then((r) => setConfigured(r.configured)).catch(() => setConfigured(false));
  }, [checkStatus]);

  const saveSeller = (next: SellerSettings) => {
    setSeller(next);
    try {
      localStorage.setItem(SELLER_KEY, JSON.stringify(next));
      toast.success("Zapisano dane sprzedawcy");
    } catch {
      toast.error("Nie udało się zapisać ustawień");
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Fakturowo.pl</h1>
          <p className="text-sm text-muted-foreground">Wystawianie faktur i proform przez API Fakturowo.</p>
        </div>
        <Badge variant={configured ? "default" : "destructive"}>
          {configured === null ? "…" : configured ? "Klucz API skonfigurowany" : "Brak klucza API"}
        </Badge>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="wystaw">Wystaw dokument</TabsTrigger>
          <TabsTrigger value="lista">Historia</TabsTrigger>
          <TabsTrigger value="ustawienia">Ustawienia sprzedawcy</TabsTrigger>
        </TabsList>

        <TabsContent value="wystaw" className="mt-4">
          <IssueForm seller={seller} configured={configured ?? false} />
        </TabsContent>

        <TabsContent value="lista" className="mt-4">
          <DocumentList />
        </TabsContent>

        <TabsContent value="ustawienia" className="mt-4">
          <SellerForm seller={seller} onSave={saveSeller} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
