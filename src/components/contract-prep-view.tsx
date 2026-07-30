import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, AlertCircle, Loader2 } from "lucide-react";
import { getContractStatus, saveContractPartyData } from "@/lib/contract-prep.functions";

type Side = "client" | "investor";

interface FieldDef {
  path: string;
  label: string;
  type?: "text" | "number" | "select";
  options?: Array<{ value: string; label: string }>;
}

const CLIENT_FORM_FIELDS: FieldDef[] = [
  { path: "borrowerData.firstName", label: "Imię" },
  { path: "borrowerData.lastName", label: "Nazwisko" },
  { path: "borrowerData.pesel", label: "PESEL" },
  { path: "borrowerData.phone", label: "Telefon" },
  { path: "borrowerData.email", label: "Email" },
  { path: "borrowerData.businessAddress", label: "Adres zamieszkania / firmy" },
  {
    path: "borrowerData.idDocument.type",
    label: "Dokument tożsamości",
    type: "select",
    options: [
      { value: "dowod", label: "Dowód osobisty" },
      { value: "paszport", label: "Paszport" },
      { value: "prawo_jazdy", label: "Prawo jazdy" },
      { value: "inny", label: "Inny" },
    ],
  },
  { path: "borrowerData.idDocument.number", label: "Numer dokumentu tożsamości" },
  { path: "propertyData.landRegisterNumber", label: "Numer KW nieruchomości" },
  { path: "propertyData.address", label: "Adres nieruchomości" },
  { path: "propertyData.city", label: "Miasto nieruchomości" },
  {
    path: "propertyData.estimatedValue",
    label: "Szacunkowa wartość nieruchomości (PLN)",
    type: "number",
  },
];

const INVESTOR_FORM_FIELDS: FieldDef[] = [
  { path: "investorData.fullName", label: "Imię i nazwisko / nazwa" },
  { path: "investorData.companyName", label: "Nazwa firmy (jeśli dotyczy)" },
  { path: "investorData.nip", label: "NIP (jeśli firma)" },
  { path: "investorData.address", label: "Adres" },
  { path: "investorData.phone", label: "Telefon" },
  { path: "investorData.email", label: "Email" },
  { path: "investorData.bankAccount", label: "Numer rachunku bankowego" },
  { path: "investorData.representativeName", label: "Reprezentant (dla spółek)" },
];

function getByPath(obj: any, path: string): any {
  return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

export function ContractPrepView({
  offerId,
  side,
  backTo,
}: {
  offerId: string;
  side: Side;
  backTo: string;
}) {
  const navigate = useNavigate();
  const fetchStatus = useServerFn(getContractStatus);
  const saveData = useServerFn(saveContractPartyData);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [form, setForm] = useState<Record<string, any>>({});

  const fields = side === "client" ? CLIENT_FORM_FIELDS : INVESTOR_FORM_FIELDS;

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchStatus({ data: { offerId } });
      setStatus(res);
      const initial: Record<string, any> = {};
      for (const f of fields) {
        const v = getByPath(res.profile, f.path);
        if (v !== undefined && v !== null) initial[f.path] = v;
      }
      setForm(initial);
    } catch (e: any) {
      toast.error(e?.message ?? "Nie udało się załadować danych");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(); /* eslint-disable-next-line */
  }, [offerId, side]);

  const save = async () => {
    setSaving(true);
    try {
      const patch: Record<string, any> = {};
      for (const [k, v] of Object.entries(form)) {
        if (v === "" || v === undefined || v === null) continue;
        patch[k] = v;
      }
      const res = await saveData({ data: { offerId, side, patch } });
      toast.success("Zapisano");
      await load();
      if (res.ready) toast.success("Umowa gotowa do podpisu!");
    } catch (e: any) {
      toast.error(e?.message ?? "Nie udało się zapisać");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Ładowanie…
      </div>
    );
  }
  if (!status) return <div>Brak danych.</div>;

  const myPct = side === "client" ? status.clientPct : status.investorPct;
  const otherPct = side === "client" ? status.investorPct : status.clientPct;
  const otherLabel = side === "client" ? "inwestora" : "klienta";
  const otherMissing = side === "client" ? status.missingInvestor : status.missingClient;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dane do umowy pożyczki</h1>
        <Button variant="ghost" onClick={() => void navigate({ to: backTo })}>
          ← Wróć
        </Button>
      </div>

      {status.ready && (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="pt-6 text-sm flex items-center gap-2">
            <Check className="h-5 w-5 text-emerald-600" />
            <div>
              <p className="font-medium text-emerald-700 dark:text-emerald-300">
                Wszystkie dane uzupełnione — umowa gotowa do podpisu.
              </p>
              <p className="text-muted-foreground mt-1">
                Operator skontaktuje się aby uzgodnić termin podpisania.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              Twoje dane
              <Badge variant={myPct === 100 ? "default" : "secondary"}>{myPct}%</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={myPct} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              Dane {otherLabel}
              <Badge variant={otherPct === 100 ? "default" : "secondary"}>{otherPct}%</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <Progress value={otherPct} />
            {otherMissing.length > 0 && (
              <p className="text-xs text-muted-foreground pt-1 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Czekamy na: {otherMissing.map((m: any) => m.label).join(", ")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Uzupełnij swoje dane</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {fields.map((f) => (
              <div key={f.path} className="space-y-1.5">
                <Label className="text-sm">{f.label}</Label>
                {f.type === "select" ? (
                  <select
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={form[f.path] ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, [f.path]: e.target.value }))}
                  >
                    <option value="">— wybierz —</option>
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    type={f.type === "number" ? "number" : "text"}
                    value={form[f.path] ?? ""}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        [f.path]:
                          f.type === "number"
                            ? e.target.value === ""
                              ? ""
                              : Number(e.target.value)
                            : e.target.value,
                      }))
                    }
                  />
                )}
              </div>
            ))}
          </div>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Zapisywanie…
              </>
            ) : (
              "Zapisz dane"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
