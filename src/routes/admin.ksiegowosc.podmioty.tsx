import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Building2, Star, Plus, Pencil, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  listAccountingEntities,
  upsertAccountingEntity,
  setDefaultAccountingEntity,
} from "@/lib/accounting/functions";
import { CompanyLookupInline } from "@/components/company-lookup-inline";

export const Route = createFileRoute("/admin/ksiegowosc/podmioty")({
  component: PodmiotyPage,
});

const PROVIDER_LABELS: Record<string, string> = {
  manual: "Ręcznie (bez integracji)",
  ksef: "KSeF",
};
const KSEF_LABELS: Record<string, string> = {
  disabled: "Wyłączony",
  test: "Testowy",
  demo: "Demo",
  prod: "Produkcyjny",
};

type EntityForm = {
  id?: string;
  name: string;
  legal_name: string;
  nip: string;
  regon: string;
  address_street: string;
  address_postal_code: string;
  address_city: string;
  bank_account: string;
  email: string;
  phone: string;
  active: boolean;
  invoice_prefix: string;
  vat_payer: boolean;
  default_vat_rate: string;
  provider: "manual" | "ksef";
  ksef_environment: "disabled" | "test" | "demo" | "prod";
  ksef_nip: string;
  ksef_token: string;
};

const EMPTY: EntityForm = {
  name: "",
  legal_name: "",
  nip: "",
  regon: "",
  address_street: "",
  address_postal_code: "",
  address_city: "",
  bank_account: "",
  email: "",
  phone: "",
  active: true,
  invoice_prefix: "FV",
  vat_payer: true,
  default_vat_rate: "23",
  provider: "manual",
  ksef_environment: "disabled",
  ksef_nip: "",
  ksef_token: "",
};

function PodmiotyPage() {
  const listFn = useServerFn(listAccountingEntities);
  const upsertFn = useServerFn(upsertAccountingEntity);
  const defaultFn = useServerFn(setDefaultAccountingEntity);

  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["accounting-entities"], queryFn: () => listFn() });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<EntityForm>(EMPTY);
  const [saving, setSaving] = useState(false);

  const entities = (q.data as any[]) ?? [];

  function edit(e: any) {
    setForm({
      id: e.id,
      name: e.name ?? "",
      legal_name: e.legal_name ?? "",
      nip: e.nip ?? "",
      regon: e.regon ?? "",
      address_street: e.address_street ?? "",
      address_postal_code: e.address_postal_code ?? "",
      address_city: e.address_city ?? "",
      bank_account: e.bank_account ?? "",
      email: e.email ?? "",
      phone: e.phone ?? "",
      active: e.active ?? true,
      invoice_prefix: e.invoice_prefix ?? "FV",
      vat_payer: e.vat_payer ?? true,
      default_vat_rate: e.default_vat_rate ?? "23",
      provider: e.provider ?? "manual",
      ksef_environment: e.ksef_environment ?? "disabled",
      ksef_nip: e.ksef_nip ?? "",
      ksef_token: "",
    });
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim() || !form.legal_name.trim())
      return toast.error("Podaj nazwę i pełną nazwę podmiotu");
    setSaving(true);
    try {
      await upsertFn({
        data: {
          id: form.id,
          name: form.name,
          legal_name: form.legal_name,
          nip: form.nip || null,
          regon: form.regon || null,
          address_street: form.address_street || null,
          address_postal_code: form.address_postal_code || null,
          address_city: form.address_city || null,
          bank_account: form.bank_account || null,
          email: form.email || null,
          phone: form.phone || null,
          active: form.active,
          invoice_prefix: form.invoice_prefix,
          vat_payer: form.vat_payer,
          default_vat_rate: form.default_vat_rate,
          provider: form.provider,
          ksef_environment: form.ksef_environment,
          ksef_nip: form.ksef_nip || null,
          ksef_token: form.ksef_token || undefined,
        },
      });
      toast.success("Podmiot zapisany");
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["accounting-entities"] });
    } catch (e) {
      toast.error("Nie udało się zapisać", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function makeDefault(id: string) {
    try {
      await defaultFn({ data: { id } });
      toast.success("Ustawiono podmiot domyślny");
      void qc.invalidateQueries({ queryKey: ["accounting-entities"] });
    } catch (e) {
      toast.error("Błąd", { description: (e as Error).message });
    }
  }

  const set = (k: keyof EntityForm) => (v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6" /> Podmioty gospodarcze
          </h1>
          <p className="text-sm text-muted-foreground">
            Dwa podmioty wystawiające faktury. Wybierz, który jest domyślny dla faktur
            automatycznych.
          </p>
        </div>
        <Button
          onClick={() => {
            setForm(EMPTY);
            setOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> Dodaj podmiot
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {entities.map((e) => (
          <Card key={e.id} className={e.is_default ? "border-primary/40" : undefined}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  {e.name}{" "}
                  {e.is_default && (
                    <Badge variant="secondary" className="gap-1 bg-primary/10 text-primary">
                      <Star className="h-3 w-3" /> domyślny
                    </Badge>
                  )}
                </span>
                {!e.active && (
                  <Badge variant="secondary" className="bg-slate-200 text-slate-600">
                    nieaktywny
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {e.legal_name}
                {e.nip ? ` · NIP ${e.nip}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Wystawianie</span>
                <b>{PROVIDER_LABELS[e.provider] ?? e.provider}</b>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">KSeF</span>
                <span className="flex items-center gap-1">
                  <ShieldCheck
                    className={`h-3.5 w-3.5 ${e.ksef_environment !== "disabled" ? "text-emerald-600" : "text-muted-foreground"}`}
                  />{" "}
                  {KSEF_LABELS[e.ksef_environment] ?? e.ksef_environment}
                  {e.has_ksef_token ? " · token ✓" : ""}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Numeracja</span>
                <b>
                  {e.invoice_prefix}/{new Date().getFullYear()}/
                  {String(e.invoice_next_number).padStart(4, "0")}
                </b>
              </div>
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => edit(e)}>
                  <Pencil className="mr-2 h-3.5 w-3.5" /> Edytuj
                </Button>
                {!e.is_default && (
                  <Button size="sm" variant="ghost" onClick={() => makeDefault(e.id)}>
                    <Star className="mr-2 h-3.5 w-3.5" /> Ustaw domyślny
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edytuj podmiot" : "Nowy podmiot"}</DialogTitle>
          </DialogHeader>
          <div className="mb-3 rounded-md border border-dashed p-3">
            <p className="mb-2 text-xs text-muted-foreground">
              Zaciągnij dane z GUS/KRS — wypełnimy nazwę, NIP, REGON i adres.
            </p>
            <CompanyLookupInline
              compact
              value={{ nip: form.nip, regon: form.regon }}
              onChange={(v) =>
                setForm((f) => ({ ...f, nip: v.nip ?? f.nip, regon: v.regon ?? f.regon }))
              }
              onResolved={(c) =>
                setForm((f) => ({
                  ...f,
                  legal_name: c.name || f.legal_name,
                  name: f.name || c.name,
                  nip: c.nip || f.nip,
                  regon: c.regon || f.regon,
                  address_street: c.street || f.address_street,
                  address_postal_code: c.postalCode || f.address_postal_code,
                  address_city: c.city || f.address_city,
                  email: f.email || c.email,
                  phone: f.phone || c.phone,
                }))
              }
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Nazwa (panel)</Label>
              <Input value={form.name} onChange={(e) => set("name")(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Pełna nazwa (na fakturze)</Label>
              <Input value={form.legal_name} onChange={(e) => set("legal_name")(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>NIP</Label>
              <Input value={form.nip} onChange={(e) => set("nip")(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>REGON</Label>
              <Input value={form.regon} onChange={(e) => set("regon")(e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Ulica i numer</Label>
              <Input
                value={form.address_street}
                onChange={(e) => set("address_street")(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Kod pocztowy</Label>
              <Input
                value={form.address_postal_code}
                onChange={(e) => set("address_postal_code")(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Miejscowość</Label>
              <Input
                value={form.address_city}
                onChange={(e) => set("address_city")(e.target.value)}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Rachunek bankowy (na fakturze)</Label>
              <Input
                value={form.bank_account}
                onChange={(e) => set("bank_account")(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Prefiks numeracji</Label>
              <Input
                value={form.invoice_prefix}
                onChange={(e) => set("invoice_prefix")(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Domyślna stawka VAT</Label>
              <Select value={form.default_vat_rate} onValueChange={set("default_vat_rate")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["23", "8", "5", "0", "zw"].map((r) => (
                    <SelectItem key={r} value={r}>
                      {r === "zw" ? "zw." : `${r}%`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Sposób wystawiania faktur</Label>
              <Select value={form.provider} onValueChange={set("provider")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PROVIDER_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.provider === "ksef" && (
              <>
                <div className="space-y-1">
                  <Label>Środowisko KSeF</Label>
                  <Select value={form.ksef_environment} onValueChange={set("ksef_environment")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(KSEF_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>NIP do KSeF</Label>
                  <Input
                    value={form.ksef_nip}
                    onChange={(e) => set("ksef_nip")(e.target.value)}
                    placeholder={form.nip}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Token KSeF (zostanie zaszyfrowany)</Label>
                  <Input
                    type="password"
                    value={form.ksef_token}
                    onChange={(e) => set("ksef_token")(e.target.value)}
                    placeholder='wpisz, aby ustawić; „mock:..." = tryb testowy'
                  />
                </div>
              </>
            )}
            <div className="flex items-center gap-2">
              <Switch checked={form.vat_payer} onCheckedChange={set("vat_payer")} />
              <Label>Płatnik VAT</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={set("active")} />
              <Label>Aktywny</Label>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={save} disabled={saving}>
              {saving ? "Zapisywanie…" : "Zapisz"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
