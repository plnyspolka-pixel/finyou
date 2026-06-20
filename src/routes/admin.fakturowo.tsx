import { createFileRoute } from "@tanstack/react-router";
import { formatDateTime } from "@/lib/labels";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { createFakturowoDocument, getFakturowoStatus } from "@/lib/fakturowo.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { ExternalLink, FileText, Copy } from "lucide-react";

export const Route = createFileRoute("/admin/fakturowo")({
  component: FakturowoPage,
});

type SellerSettings = {
  sellerName: string;
  sellerNip: string;
  sellerCity: string;
  sellerPostalCode: string;
  sellerStreet: string;
  sellerBuilding: string;
  sellerEmail: string;
  sellerPhone: string;
  place: string;
  vatRate: string;
  currency: string;
  paymentMethod: string;
  bankAccount: string;
};

const DEFAULT_SELLER: SellerSettings = {
  sellerName: "Filip Bielak Consulting",
  sellerNip: "",
  sellerCity: "",
  sellerPostalCode: "",
  sellerStreet: "",
  sellerBuilding: "",
  sellerEmail: "",
  sellerPhone: "",
  place: "",
  vatRate: "23",
  currency: "PLN",
  paymentMethod: "przelew",
  bankAccount: "",
};

const SELLER_KEY = "fakturowo_seller_settings_v1";

function loadSeller(): SellerSettings {
  if (typeof window === "undefined") return DEFAULT_SELLER;
  try {
    const raw = localStorage.getItem(SELLER_KEY);
    if (!raw) return DEFAULT_SELLER;
    return { ...DEFAULT_SELLER, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SELLER;
  }
}

const SUGGESTED_PRODUCTS = [
  "Dostęp do programu inwestorskiego Pożyczki 2.0",
  "Szkolenie z inwestowania w pożyczki zabezpieczone hipotecznie",
  "Konsultacja biznesowa",
  "Usługa pośrednictwa",
  "Opłata abonamentowa",
];

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

function SellerForm({ seller, onSave }: { seller: SellerSettings; onSave: (s: SellerSettings) => void }) {
  const [form, setForm] = useState(seller);
  useEffect(() => setForm(seller), [seller]);

  const set = (k: keyof SellerSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <Card>
      <CardHeader><CardTitle>Dane sprzedawcy (domyślne)</CardTitle></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <Field label="Nazwa" value={form.sellerName} onChange={set("sellerName")} />
        <Field label="NIP" value={form.sellerNip} onChange={set("sellerNip")} />
        <Field label="Miasto" value={form.sellerCity} onChange={set("sellerCity")} />
        <Field label="Kod pocztowy" value={form.sellerPostalCode} onChange={set("sellerPostalCode")} />
        <Field label="Ulica" value={form.sellerStreet} onChange={set("sellerStreet")} />
        <Field label="Numer budynku" value={form.sellerBuilding} onChange={set("sellerBuilding")} />
        <Field label="E-mail" value={form.sellerEmail} onChange={set("sellerEmail")} />
        <Field label="Telefon" value={form.sellerPhone} onChange={set("sellerPhone")} />
        <Field label="Miejsce wystawienia" value={form.place} onChange={set("place")} />
        <Field label="Domyślna stawka VAT" value={form.vatRate} onChange={set("vatRate")} />
        <Field label="Waluta" value={form.currency} onChange={set("currency")} />
        <Field label="Sposób płatności" value={form.paymentMethod} onChange={set("paymentMethod")} />
        <div className="md:col-span-2">
          <Field label="Numer konta bankowego" value={form.bankAccount} onChange={set("bankAccount")} />
        </div>
        <div className="md:col-span-2 flex justify-end">
          <Button onClick={() => onSave(form)}>Zapisz</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, ...rest }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input {...rest} />
    </div>
  );
}

function IssueForm({ seller, configured }: { seller: SellerSettings; configured: boolean }) {
  const createFn = useServerFn(createFakturowoDocument);
  const [submitting, setSubmitting] = useState(false);
  const [isTest, setIsTest] = useState(false);
  const [documentKind, setDocumentKind] = useState<"faktura_vat" | "proforma">("faktura_vat");

  const [buyer, setBuyer] = useState({
    name: "", nip: "", email: "", city: "", postal: "", street: "", building: "",
  });
  const [product, setProduct] = useState({
    name: SUGGESTED_PRODUCTS[0],
    quantity: 1,
    unit: "szt.",
    vatRate: seller.vatRate || "23",
    gross: 0,
  });
  const [extra, setExtra] = useState({
    place: seller.place || "",
    issueDate: new Date().toISOString().slice(0, 10),
    paymentDueDate: "",
    paymentMethod: seller.paymentMethod || "przelew",
    bankAccount: seller.bankAccount || "",
    notes: "",
  });

  useEffect(() => {
    setProduct((p) => ({ ...p, vatRate: seller.vatRate || p.vatRate }));
    setExtra((e) => ({
      ...e,
      place: e.place || seller.place,
      paymentMethod: e.paymentMethod || seller.paymentMethod,
      bankAccount: e.bankAccount || seller.bankAccount,
    }));
  }, [seller]);

  const [result, setResult] = useState<any>(null);

  const submit = async () => {
    if (!configured) { toast.error("Brakuje konfiguracji integracji Fakturowo."); return; }
    setSubmitting(true);
    setResult(null);
    try {
      const r = await createFn({
        data: {
          documentKind,
          isTest,
          sellerName: seller.sellerName,
          sellerNip: seller.sellerNip,
          sellerCity: seller.sellerCity,
          sellerPostalCode: seller.sellerPostalCode,
          sellerStreet: seller.sellerStreet,
          sellerBuilding: seller.sellerBuilding,
          sellerEmail: seller.sellerEmail,
          sellerPhone: seller.sellerPhone,
          buyerName: buyer.name,
          buyerNip: buyer.nip,
          buyerEmail: buyer.email,
          buyerCity: buyer.city,
          buyerPostalCode: buyer.postal,
          buyerStreet: buyer.street,
          buyerBuilding: buyer.building,
          productName: product.name,
          productQuantity: Number(product.quantity),
          productUnit: product.unit,
          productVatRate: product.vatRate,
          productGross: Number(product.gross),
          place: extra.place,
          issueDate: extra.issueDate,
          paymentDueDate: extra.paymentDueDate,
          paymentMethod: extra.paymentMethod,
          bankAccount: extra.bankAccount,
          notes: extra.notes,
          currency: seller.currency || "PLN",
          relatedType: "manual",
        },
      });
      setResult(r);
      if (r.success) toast.success(isTest ? "Wystawiono dokument testowy" : "Dokument wystawiony");
      else toast.error(r.error || "Nie udało się wystawić dokumentu.");
    } catch (e: any) {
      toast.error(e?.message || "Błąd wystawiania dokumentu");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader><CardTitle>Typ dokumentu</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4">
            <div className="w-56">
              <Select value={documentKind} onValueChange={(v) => setDocumentKind(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="faktura_vat">Faktura VAT</SelectItem>
                  <SelectItem value="proforma">Proforma</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={isTest} onCheckedChange={setIsTest} />
              Tryb testowy
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Nabywca</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="Nazwa nabywcy" value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} />
            <Field label="NIP" value={buyer.nip} onChange={(e) => setBuyer({ ...buyer, nip: e.target.value })} />
            <Field label="Miasto" value={buyer.city} onChange={(e) => setBuyer({ ...buyer, city: e.target.value })} />
            <Field label="Kod pocztowy" value={buyer.postal} onChange={(e) => setBuyer({ ...buyer, postal: e.target.value })} />
            <Field label="Ulica" value={buyer.street} onChange={(e) => setBuyer({ ...buyer, street: e.target.value })} />
            <Field label="Numer budynku" value={buyer.building} onChange={(e) => setBuyer({ ...buyer, building: e.target.value })} />
            <Field label="E-mail" value={buyer.email} onChange={(e) => setBuyer({ ...buyer, email: e.target.value })} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Pozycja</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2 space-y-1.5">
              <Label className="text-xs">Nazwa produktu/usługi</Label>
              <Input value={product.name} onChange={(e) => setProduct({ ...product, name: e.target.value })} list="suggested-products" />
              <datalist id="suggested-products">
                {SUGGESTED_PRODUCTS.map((p) => <option key={p} value={p} />)}
              </datalist>
            </div>
            <Field label="Ilość" type="number" step="0.01" value={product.quantity} onChange={(e) => setProduct({ ...product, quantity: Number(e.target.value) })} />
            <Field label="Jednostka" value={product.unit} onChange={(e) => setProduct({ ...product, unit: e.target.value })} />
            <Field label="Stawka VAT (np. 23 lub zw)" value={product.vatRate} onChange={(e) => setProduct({ ...product, vatRate: e.target.value })} />
            <Field label="Wartość brutto" type="number" step="0.01" value={product.gross} onChange={(e) => setProduct({ ...product, gross: Number(e.target.value) })} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Dodatkowe dane</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Field label="Miejsce wystawienia" value={extra.place} onChange={(e) => setExtra({ ...extra, place: e.target.value })} />
            <Field label="Data wystawienia" type="date" value={extra.issueDate} onChange={(e) => setExtra({ ...extra, issueDate: e.target.value })} />
            <Field label="Termin płatności" type="date" value={extra.paymentDueDate} onChange={(e) => setExtra({ ...extra, paymentDueDate: e.target.value })} />
            <Field label="Sposób płatności" value={extra.paymentMethod} onChange={(e) => setExtra({ ...extra, paymentMethod: e.target.value })} />
            <div className="md:col-span-2">
              <Field label="Numer konta bankowego" value={extra.bankAccount} onChange={(e) => setExtra({ ...extra, bankAccount: e.target.value })} />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label className="text-xs">Uwagi</Label>
              <Textarea value={extra.notes} onChange={(e) => setExtra({ ...extra, notes: e.target.value })} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader><CardTitle>Podsumowanie</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Sprzedawca</span><span className="text-right">{seller.sellerName || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Nabywca</span><span className="text-right">{buyer.name || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Typ</span><span>{documentKind === "proforma" ? "Proforma" : "Faktura VAT"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Brutto</span><span>{product.gross.toFixed(2)} {seller.currency}</span></div>
            <Button className="w-full" disabled={submitting || !configured} onClick={submit}>
              {submitting ? "Wystawianie…" : "Wystaw dokument"}
            </Button>
            {!configured && <p className="text-xs text-destructive">Brak klucza API — uzupełnij sekret FAKTUROWO_API_ID.</p>}
          </CardContent>
        </Card>

        {result && (
          <Card>
            <CardHeader><CardTitle>Wynik</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {result.success ? (
                <>
                  <Badge>{result.document?.status === "test" ? "Testowy" : "Wystawiony"}</Badge>
                  <div className="text-xs text-muted-foreground">Numer Fakturowo: {result.document?.fakturowo_api_number}</div>
                  {result.document?.pdf_url && (
                    <a href={result.document.pdf_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" /> Otwórz PDF
                    </a>
                  )}
                  {result.document?.html_url && (
                    <a href={result.document.html_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" /> Podgląd
                    </a>
                  )}
                </>
              ) : (
                <div className="text-destructive">{result.error}</div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function DocumentList() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("fakturowo_documents")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setRows(data ?? []);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  return (
    <Card>
      <CardHeader><CardTitle>Historia dokumentów</CardTitle></CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground">Ładowanie…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2"><FileText className="h-4 w-4" /> Brak dokumentów.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Nabywca</TableHead>
                <TableHead className="text-right">Brutto</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{formatDateTime(r.created_at)}</TableCell>
                  <TableCell>{r.document_type === "proforma" ? "Proforma" : "Faktura"}</TableCell>
                  <TableCell>{r.buyer_name}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(r.gross_amount ?? 0).toFixed(2)} {r.currency}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "created" ? "default" : r.status === "failed" ? "destructive" : "secondary"}>
                      {r.status === "created" ? "Wystawiony" : r.status === "failed" ? "Błąd" : r.status === "test" ? "Testowy" : r.status === "cancelled" ? "Anulowany" : r.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {r.pdf_url && (
                        <Button size="sm" variant="ghost" asChild>
                          <a href={r.pdf_url} target="_blank" rel="noreferrer">PDF</a>
                        </Button>
                      )}
                      {r.html_url && (
                        <Button size="sm" variant="ghost" asChild>
                          <a href={r.html_url} target="_blank" rel="noreferrer">Podgląd</a>
                        </Button>
                      )}
                      {r.pdf_url && (
                        <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(r.pdf_url); toast.success("Skopiowano"); }}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
