/* eslint-disable @typescript-eslint/no-explicit-any -- tabele aml_* nie są jeszcze w wygenerowanych typach Database; luźny dostęp jak w module wind_* */
// Klienci i weryfikacje — profil AML klienta, CRBR, screening Dilisense
// przed zawarciem umowy oraz ręczna ocena trafień.
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listAmlCustomers,
  upsertAmlCustomer,
  fetchCrbrForAmlCustomer,
  runAmlScreening,
  listAmlScreenings,
  resolveAmlScreening,
} from "@/lib/aml/aml-customers.functions";
import { HIT_RESOLUTION_LABELS } from "@/lib/aml/aml-types";
import {
  ScreeningBadge,
  RiskBadge,
  AmlEmptyState,
  amlCustomerLabel,
} from "@/components/aml/aml-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Plus, Search, Building2, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/inwestor/aml/klienci")({
  component: AmlCustomersScreen,
});

type Customer = Record<string, any>;
type Screening = Record<string, any>;

const EMPTY_FORM = {
  entityType: "osoba_fizyczna" as "osoba_fizyczna" | "firma",
  firstName: "",
  lastName: "",
  companyName: "",
  pesel: "",
  dob: "",
  nip: "",
  krs: "",
  address: "",
  countryResidence: "PL",
  countryActivity: "PL",
  financingPurpose: "",
  repaymentSource: "",
};

function AmlCustomersScreen() {
  const fetchCustomers = useServerFn(listAmlCustomers);
  const saveCustomer = useServerFn(upsertAmlCustomer);
  const fetchCrbr = useServerFn(fetchCrbrForAmlCustomer);
  const screen = useServerFn(runAmlScreening);
  const fetchScreenings = useServerFn(listAmlScreenings);
  const resolve = useServerFn(resolveAmlScreening);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<typeof EMPTY_FORM & { id?: string }>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [screenings, setScreenings] = useState<Screening[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [resolution, setResolution] = useState<Record<string, { value: string; note: string }>>({});

  const reload = useCallback(async () => {
    try {
      const res = await fetchCustomers();
      setCustomers(res.customers as Customer[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd wczytywania klientów");
    } finally {
      setLoading(false);
    }
  }, [fetchCustomers]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openDetails = async (c: Customer) => {
    setSelected(c);
    const res = await fetchScreenings({ data: { customerId: c.id } });
    setScreenings(res.screenings as Screening[]);
  };

  const submitForm = async () => {
    setSaving(true);
    try {
      await saveCustomer({
        data: {
          ...form,
          dob: form.dob || undefined,
          firstName: form.firstName || undefined,
          lastName: form.lastName || undefined,
          companyName: form.companyName || undefined,
          pesel: form.pesel || undefined,
          nip: form.nip || undefined,
          krs: form.krs || undefined,
          address: form.address || undefined,
          financingPurpose: form.financingPurpose || undefined,
          repaymentSource: form.repaymentSource || undefined,
        },
      });
      toast.success("Zapisano klienta AML");
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd zapisu");
    } finally {
      setSaving(false);
    }
  };

  const runScreening = async (c: Customer) => {
    setBusy(`screen-${c.id}`);
    try {
      const res = await screen({ data: { customerId: c.id } });
      toast.success(
        res.totalHits > 0
          ? `Screening zakończony: ${res.totalHits} trafień — wymaga ręcznej oceny`
          : "Screening zakończony: brak trafień, można zawrzeć umowę",
      );
      await reload();
      if (selected?.id === c.id) await openDetails(c);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd screeningu");
    } finally {
      setBusy(null);
    }
  };

  const pullCrbr = async (c: Customer) => {
    setBusy(`crbr-${c.id}`);
    try {
      const res: any = await fetchCrbr({ data: { customerId: c.id } });
      if (res.status === "ok") {
        toast.success(
          `CRBR pobrane: beneficjenci (${res.customer.beneficial_owners?.length ?? 0}), rozbieżności (${res.discrepancies.length})`,
        );
      } else {
        toast.warning(res.message ?? "CRBR: brak danych");
      }
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd CRBR");
    } finally {
      setBusy(null);
    }
  };

  const resolveHit = async (s: Screening) => {
    const r = resolution[s.id];
    if (!r?.value) {
      toast.error("Wybierz ocenę trafienia");
      return;
    }
    setBusy(`resolve-${s.id}`);
    try {
      const res = await resolve({
        data: { screeningId: s.id, resolution: r.value as any, note: r.note || undefined },
      });
      toast.success(
        res.contractAllowed
          ? "Ocena zapisana — zawarcie umowy możliwe"
          : "Ocena zapisana — zawarcie umowy ZABLOKOWANE",
      );
      await reload();
      if (selected) await openDetails(selected);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd zapisu oceny");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Klienci i weryfikacje</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Dodaj klienta
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Klient AML</DialogTitle>
              <DialogDescription>
                Przed zawarciem każdej umowy pożyczki wykonaj jednorazowy screening klienta.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Typ podmiotu</Label>
                <Select
                  value={form.entityType}
                  onValueChange={(v) => setForm({ ...form, entityType: v as any })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="osoba_fizyczna">Osoba fizyczna</SelectItem>
                    <SelectItem value="firma">Firma</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.entityType === "osoba_fizyczna" ? (
                <>
                  <div>
                    <Label>Imię</Label>
                    <Input
                      value={form.firstName}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Nazwisko</Label>
                    <Input
                      value={form.lastName}
                      onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>PESEL</Label>
                    <Input
                      value={form.pesel}
                      onChange={(e) => setForm({ ...form, pesel: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Data urodzenia</Label>
                    <Input
                      type="date"
                      value={form.dob}
                      onChange={(e) => setForm({ ...form, dob: e.target.value })}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="col-span-2">
                    <Label>Nazwa firmy</Label>
                    <Input
                      value={form.companyName}
                      onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>NIP</Label>
                    <Input
                      value={form.nip}
                      onChange={(e) => setForm({ ...form, nip: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>KRS</Label>
                    <Input
                      value={form.krs}
                      onChange={(e) => setForm({ ...form, krs: e.target.value })}
                    />
                  </div>
                </>
              )}
              <div className="col-span-2">
                <Label>Adres</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div>
                <Label>Kraj rezydencji</Label>
                <Input
                  maxLength={2}
                  value={form.countryResidence}
                  onChange={(e) =>
                    setForm({ ...form, countryResidence: e.target.value.toUpperCase() })
                  }
                />
              </div>
              <div>
                <Label>Kraj działalności</Label>
                <Input
                  maxLength={2}
                  value={form.countryActivity}
                  onChange={(e) =>
                    setForm({ ...form, countryActivity: e.target.value.toUpperCase() })
                  }
                />
              </div>
              <div className="col-span-2">
                <Label>Cel finansowania</Label>
                <Input
                  value={form.financingPurpose}
                  onChange={(e) => setForm({ ...form, financingPurpose: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label>Źródło spłaty</Label>
                <Input
                  value={form.repaymentSource}
                  onChange={(e) => setForm({ ...form, repaymentSource: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={submitForm} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Zapisz
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : customers.length === 0 ? (
        <AmlEmptyState>
          Brak klientów AML. Dodaj klienta, aby wykonać screening przed umową.
        </AmlEmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {customers.map((c) => (
            <Card key={c.id} className="cursor-pointer" onClick={() => void openDetails(c)}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between gap-2">
                  <span className="truncate">{amlCustomerLabel(c as any)}</span>
                  <ScreeningBadge status={c.screening_status} />
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <div className="flex gap-2 flex-wrap items-center">
                  <RiskBadge level={c.risk_level} />
                  {c.entity_type === "firma" && <span>NIP: {c.nip ?? "—"}</span>}
                  {((c.crbr_discrepancies ?? []) as unknown[]).length > 0 && (
                    <span className="text-amber-600">
                      Rozbieżności CRBR: {(c.crbr_discrepancies as unknown[]).length}
                    </span>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy === `screen-${c.id}`}
                    onClick={() => void runScreening(c)}
                  >
                    {busy === `screen-${c.id}` ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Search className="h-3 w-3 mr-1" />
                    )}
                    {c.screening_status === "invalidated"
                      ? "Powtórz screening"
                      : "Screening Dilisense"}
                  </Button>
                  {c.entity_type === "firma" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === `crbr-${c.id}`}
                      onClick={() => void pullCrbr(c)}
                    >
                      {busy === `crbr-${c.id}` ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Building2 className="h-3 w-3 mr-1" />
                      )}
                      Pobierz CRBR
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setForm({
                        id: c.id,
                        entityType: c.entity_type,
                        firstName: c.first_name ?? "",
                        lastName: c.last_name ?? "",
                        companyName: c.company_name ?? "",
                        pesel: c.pesel ?? "",
                        dob: c.dob ?? "",
                        nip: c.nip ?? "",
                        krs: c.krs ?? "",
                        address: c.address ?? "",
                        countryResidence: c.country_residence ?? "PL",
                        countryActivity: c.country_activity ?? "PL",
                        financingPurpose: c.financing_purpose ?? "",
                        repaymentSource: c.repayment_source ?? "",
                      });
                      setDialogOpen(true);
                    }}
                  >
                    Edytuj
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selected && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              Screeningi: {amlCustomerLabel(selected as any)}
              <Button size="sm" variant="ghost" onClick={() => void openDetails(selected)}>
                <RefreshCw className="h-3 w-3" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {screenings.length === 0 && (
              <AmlEmptyState>Brak screeningów dla tego klienta.</AmlEmptyState>
            )}
            {screenings.map((s) => (
              <div key={s.id} className="border rounded-md p-3 text-sm space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <ScreeningBadge status={s.status} />
                  <span className="font-medium">{s.subject_name}</span>
                  <span className="text-muted-foreground">
                    (
                    {s.subject_kind === "customer"
                      ? "klient"
                      : s.subject_kind === "representative"
                        ? "reprezentant"
                        : "beneficjent rzeczywisty"}
                    , {s.search_type === "individual" ? "checkIndividual" : "checkEntity"})
                  </span>
                  <span className="text-muted-foreground">Trafienia: {s.total_hits ?? 0}</span>
                  {s.hit_resolution && (
                    <span className="text-muted-foreground">
                      Ocena:{" "}
                      {
                        HIT_RESOLUTION_LABELS[
                          s.hit_resolution as keyof typeof HIT_RESOLUTION_LABELS
                        ]
                      }
                    </span>
                  )}
                </div>
                {s.status === "review_required" && (
                  <div className="flex flex-wrap gap-2 items-end">
                    <div className="w-56">
                      <Label className="text-xs">Ocena trafienia</Label>
                      <Select
                        value={resolution[s.id]?.value ?? ""}
                        onValueChange={(v) =>
                          setResolution((r) => ({
                            ...r,
                            [s.id]: { value: v, note: r[s.id]?.note ?? "" },
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Wybierz…" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(HIT_RESOLUTION_LABELS).map(([k, v]) => (
                            <SelectItem key={k} value={k}>
                              {v}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1 min-w-48">
                      <Label className="text-xs">Notatka</Label>
                      <Textarea
                        rows={1}
                        value={resolution[s.id]?.note ?? ""}
                        onChange={(e) =>
                          setResolution((r) => ({
                            ...r,
                            [s.id]: { value: r[s.id]?.value ?? "", note: e.target.value },
                          }))
                        }
                      />
                    </div>
                    <Button
                      size="sm"
                      disabled={busy === `resolve-${s.id}`}
                      onClick={() => void resolveHit(s)}
                    >
                      {busy === `resolve-${s.id}` && (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      )}{" "}
                      Zapisz ocenę
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
