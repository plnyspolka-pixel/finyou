import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  getDebtCase,
  upsertDebtCase,
  deleteDebtCase,
  addDebtPayment,
  deleteDebtPayment,
  performDebtAction,
  deleteDebtAction,
  type DebtCase,
  type DebtPayment,
  type DebtAction,
  type DebtActionType,
} from "@/lib/debt-collection.functions";
import {
  extractDebtContract,
  extractDebtPaymentsFromStatement,
  setNoPaymentsDeclared,
} from "@/lib/debt-collection-ocr.functions";
import { getNbpRates } from "@/lib/nbp-rates.functions";
import {
  calculateDebt,
  maxDelayInterestRate,
  DEFAULT_MAX_DELAY_RATE,
  type DebtCalcResult,
} from "@/lib/debt-collection-math";
import {
  buildSmsBody,
  buildEmailBody,
  buildLetter,
  type LetterKind,
} from "@/lib/debt-collection-letters";
import { formatPLN, formatDate } from "@/lib/labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Upload,
  Save,
  Trash2,
  FileText,
  Plus,
  Send,
  Phone,
  Mail,
  MessageSquare,
  Gavel,
  Building2,
  CheckCircle2,
  XCircle,
  Loader2,
  Download,
  Calculator,
  Sparkles,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/inwestor/windykacja/$caseId")({
  component: WindykacjaDetail,
});

const todayISO = () => new Date().toISOString().slice(0, 10);

const ACTION_META: Record<
  DebtActionType,
  {
    label: string;
    icon: typeof Phone;
    feeField: keyof DebtCase;
    channel: "phone" | "email" | "none";
  }
> = {
  sms: { label: "SMS", icon: MessageSquare, feeField: "fee_sms", channel: "phone" },
  email: { label: "E-mail", icon: Mail, feeField: "fee_email", channel: "email" },
  phone: { label: "Telefon", icon: Phone, feeField: "fee_phone", channel: "phone" },
  letter_debtor: {
    label: "Pismo do dłużnika",
    icon: FileText,
    feeField: "fee_letter_debtor",
    channel: "none",
  },
  letter_court: {
    label: "Pismo do sądu",
    icon: Gavel,
    feeField: "fee_letter_court",
    channel: "none",
  },
  letter_bailiff: {
    label: "Pismo do komornika",
    icon: Building2,
    feeField: "fee_letter_bailiff",
    channel: "none",
  },
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function WindykacjaDetail() {
  const { caseId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const fetchCase = useServerFn(getDebtCase);
  const saveCase = useServerFn(upsertDebtCase);
  const removeCase = useServerFn(deleteDebtCase);
  const addPayment = useServerFn(addDebtPayment);
  const removePayment = useServerFn(deleteDebtPayment);
  const doAction = useServerFn(performDebtAction);
  const removeAction = useServerFn(deleteDebtAction);
  const fetchNbp = useServerFn(getNbpRates);
  const extractContract = useServerFn(extractDebtContract);
  const extractStatement = useServerFn(extractDebtPaymentsFromStatement);
  const setNoPayments = useServerFn(setNoPaymentsDeclared);

  const [form, setForm] = useState<DebtCase | null>(null);
  const [payments, setPayments] = useState<DebtPayment[]>([]);
  const [actions, setActions] = useState<DebtAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importingStatement, setImportingStatement] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [nbpRef, setNbpRef] = useState<number | null>(null);

  // Nowa wpłata
  const [payDate, setPayDate] = useState(todayISO());
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");

  // Dialog działania
  const [actionType, setActionType] = useState<DebtActionType | null>(null);
  const [actionTarget, setActionTarget] = useState("");
  const [actionSubject, setActionSubject] = useState("");
  const [actionContent, setActionContent] = useState("");
  const [actionFee, setActionFee] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await fetchCase({ data: { caseId } });
      setForm(res.case);
      setPayments(res.payments);
      setActions(res.actions);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się pobrać sprawy");
    } finally {
      setLoading(false);
    }
  }, [caseId, fetchCase]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    void (async () => {
      try {
        const r = await fetchNbp();
        setNbpRef(r.referenceRate);
      } catch {
        /* podpowiedź opcjonalna */
      }
    })();
  }, [fetchNbp]);

  const set = <K extends keyof DebtCase>(key: K, value: DebtCase[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  // ── Kalkulacja zadłużenia na dziś ──────────────────────────────────
  const calc: DebtCalcResult | null = useMemo(() => {
    if (!form) return null;
    return calculateDebt({
      principalAmount: num(form.principal_amount),
      payoutDate: form.payout_date,
      dueDate: form.due_date,
      contractualAnnualRate: num(form.contractual_annual_rate),
      penaltyAnnualRate: num(form.penalty_annual_rate),
      maxStatutoryRate: num(form.max_statutory_rate),
      payments: payments.map((p) => ({ paid_on: p.paid_on, amount: num(p.amount) })),
      actionFees: actions
        .filter((a) => a.status !== "failed")
        .map((a) => ({ action_date: a.action_date, fee: num(a.fee) })),
      asOf: todayISO(),
    });
  }, [form, payments, actions]);

  const suggestedMaxRate = nbpRef != null ? maxDelayInterestRate(nbpRef) : DEFAULT_MAX_DELAY_RATE;

  const persist = async (patch?: Partial<DebtCase>, silent = false) => {
    if (!form) return;
    setSaving(true);
    try {
      const merged = { ...form, ...patch };
      const saved = await saveCase({
        data: {
          id: merged.id,
          status: merged.status,
          debtor_name: merged.debtor_name,
          debtor_pesel: merged.debtor_pesel,
          debtor_address: merged.debtor_address,
          debtor_email: merged.debtor_email,
          debtor_phone: merged.debtor_phone,
          contract_number: merged.contract_number,
          contract_file_path: merged.contract_file_path,
          contract_file_name: merged.contract_file_name,
          principal_amount: num(merged.principal_amount),
          payout_date: merged.payout_date,
          due_date: merged.due_date,
          contractual_annual_rate: num(merged.contractual_annual_rate),
          penalty_annual_rate: num(merged.penalty_annual_rate),
          max_statutory_rate: num(merged.max_statutory_rate),
          fee_sms: num(merged.fee_sms),
          fee_email: num(merged.fee_email),
          fee_phone: num(merged.fee_phone),
          fee_letter_debtor: num(merged.fee_letter_debtor),
          fee_letter_court: num(merged.fee_letter_court),
          fee_letter_bailiff: num(merged.fee_letter_bailiff),
          notes: merged.notes,
        },
      });
      setForm(saved);
      if (!silent) toast.success("Zapisano");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się zapisać");
    } finally {
      setSaving(false);
    }
  };

  // ── Pomocnik: plik → data URL (base64) ──────────────────────────────
  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("Nie udało się wczytać pliku."));
      fr.onload = () => resolve(String(fr.result ?? ""));
      fr.readAsDataURL(file);
    });

  // ── Upload umowy + auto‑uzupełnianie danych z AI ───────────────────
  const onUploadContract = async (file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const safe = file.name.replace(/[^\w.-]+/g, "_");
      const path = `${user.id}/windykacja/${caseId}/${Date.now()}_${safe}`;
      const { error } = await supabase.storage
        .from("documents")
        .upload(path, file, {
          upsert: false,
          contentType: file.type || "application/octet-stream",
        });
      if (error) throw new Error(error.message);
      await persist({ contract_file_path: path, contract_file_name: file.name }, true);
      toast.success("Umowa wgrana — uzupełniam dane…");

      setExtracting(true);
      try {
        const dataUrl = await fileToDataUrl(file);
        const res = await extractContract({
          data: { caseId, dataUrl, mimeType: file.type || "application/pdf", fileName: file.name },
        });
        if (res.ok) {
          toast.success(`Uzupełniono ${res.updated} pól z umowy.`);
          await reload();
        } else {
          toast.message("Nie udało się odczytać danych z umowy — uzupełnij ręcznie.");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Nie udało się odczytać umowy");
      } finally {
        setExtracting(false);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się wgrać pliku");
    } finally {
      setUploading(false);
    }
  };

  const openContract = async () => {
    if (!form?.contract_file_path) return;
    const { data } = await supabase.storage
      .from("documents")
      .createSignedUrl(form.contract_file_path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    else toast.error("Nie udało się otworzyć pliku");
  };

  // ── Import wpłat z wyciągu bankowego ───────────────────────────────
  const onUploadStatement = async (file: File) => {
    setImportingStatement(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await extractStatement({
        data: {
          caseId,
          dataUrl,
          mimeType: file.type || "application/pdf",
          fileName: file.name,
          debtorName: form?.debtor_name ?? null,
        },
      });
      if (res.inserted > 0) {
        toast.success(`Zaimportowano ${res.inserted} wpłat z wyciągu.`);
        await reload();
        // Jeżeli były wpłaty, automatycznie odznaczamy "brak wpłat"
        if (form?.no_payments_declared) {
          await setNoPayments({ data: { caseId, value: false } });
        }
      } else {
        toast.message("Nie znaleziono żadnych wpłat od klienta w tym wyciągu.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się przetworzyć wyciągu");
    } finally {
      setImportingStatement(false);
    }
  };

  // ── Toggle: brak wpłat od klienta ──────────────────────────────────
  const toggleNoPayments = async (value: boolean) => {
    if (!form) return;
    setForm({ ...form, no_payments_declared: value });
    try {
      await setNoPayments({ data: { caseId, value } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się zapisać");
      setForm((f) => (f ? { ...f, no_payments_declared: !value } : f));
    }
  };


  // ── Wpłaty ─────────────────────────────────────────────────────────
  const onAddPayment = async () => {
    const amount = Number(payAmount.replace(",", "."));
    if (!payDate || !Number.isFinite(amount) || amount === 0) {
      toast.error("Podaj datę i kwotę wpłaty");
      return;
    }
    try {
      const row = await addPayment({ data: { caseId, paid_on: payDate, amount, note: payNote } });
      setPayments((p) => [...p, row].sort((a, b) => a.paid_on.localeCompare(b.paid_on)));
      setPayAmount("");
      setPayNote("");
      toast.success("Dodano wpłatę");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się dodać wpłaty");
    }
  };

  const onDeletePayment = async (id: string) => {
    try {
      await removePayment({ data: { paymentId: id } });
      setPayments((p) => p.filter((x) => x.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd usuwania");
    }
  };

  // ── Działania ──────────────────────────────────────────────────────
  const openAction = (type: DebtActionType) => {
    if (!form || !calc) return;
    setActionType(type);
    const meta = ACTION_META[type];
    setActionFee(String(num(form[meta.feeField])));
    if (meta.channel === "phone") setActionTarget(form.debtor_phone ?? "");
    else if (meta.channel === "email") setActionTarget(form.debtor_email ?? "");
    else setActionTarget(form.debtor_name ?? "");

    if (type === "sms") {
      setActionSubject("");
      setActionContent(buildSmsBody(form, calc));
    } else if (type === "email") {
      setActionSubject("Wezwanie do zapłaty");
      setActionContent(buildEmailBody(form, calc));
    } else if (type === "phone") {
      setActionSubject("Rozmowa telefoniczna");
      setActionContent("");
    } else {
      const kind: LetterKind =
        type === "letter_court" ? "court" : type === "letter_bailiff" ? "bailiff" : "debtor";
      const letter = buildLetter(kind, form, calc);
      setActionSubject(letter.subject);
      setActionContent(letter.body);
    }
  };

  const submitAction = async () => {
    if (!actionType) return;
    setActionBusy(true);
    try {
      const row = await doAction({
        data: {
          caseId,
          action_type: actionType,
          channel_target: actionTarget,
          subject: actionSubject,
          content: actionContent,
          fee: Number(actionFee.replace(",", ".")) || 0,
          action_date: todayISO(),
        },
      });
      setActions((a) => [row, ...a]);
      if (row.status === "failed") {
        toast.error(`Nie wykonano: ${row.error_message ?? "błąd"} (opłaty nie naliczono)`);
      } else if (row.status === "sent") {
        toast.success(`Wysłano. Naliczono opłatę ${formatPLN(row.fee)}`);
      } else {
        toast.success(`Zarejestrowano działanie. Naliczono opłatę ${formatPLN(row.fee)}`);
      }
      setActionType(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się wykonać działania");
    } finally {
      setActionBusy(false);
    }
  };

  const onDeleteAction = async (id: string) => {
    try {
      await removeAction({ data: { actionId: id } });
      setActions((a) => a.filter((x) => x.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Błąd usuwania");
    }
  };

  const onDeleteCase = async () => {
    if (!confirm("Usunąć całą sprawę windykacyjną wraz z wpłatami i działaniami?")) return;
    try {
      await removeCase({ data: { caseId } });
      toast.success("Sprawa usunięta");
      void navigate({ to: "/inwestor/windykacja" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się usunąć sprawy");
    }
  };

  if (loading) return <div className="text-muted-foreground">Ładowanie…</div>;
  if (!form) return <div className="text-muted-foreground">Nie znaleziono sprawy.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/inwestor/windykacja"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Wszystkie sprawy
        </Link>
        <div className="flex items-center gap-2">
          <Select
            value={form.status}
            onValueChange={(v) => void persist({ status: v as DebtCase["status"] }, true)}
          >
            <SelectTrigger className="w-[150px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Szkic</SelectItem>
              <SelectItem value="active">W toku</SelectItem>
              <SelectItem value="closed">Zamknięta</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={onDeleteCase} aria-label="Usuń sprawę">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* LEWA: dane sprawy */}
        <div className="lg:col-span-2 space-y-6">
          {/* Dłużnik */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dłużnik</CardTitle>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-3">
              <Field label="Imię i nazwisko / firma">
                <Input
                  value={form.debtor_name ?? ""}
                  onChange={(e) => set("debtor_name", e.target.value)}
                />
              </Field>
              <Field label="PESEL / NIP">
                <Input
                  value={form.debtor_pesel ?? ""}
                  onChange={(e) => set("debtor_pesel", e.target.value)}
                />
              </Field>
              <Field label="E-mail">
                <Input
                  type="email"
                  value={form.debtor_email ?? ""}
                  onChange={(e) => set("debtor_email", e.target.value)}
                />
              </Field>
              <Field label="Telefon">
                <Input
                  value={form.debtor_phone ?? ""}
                  onChange={(e) => set("debtor_phone", e.target.value)}
                />
              </Field>
              <Field label="Adres" className="sm:col-span-2">
                <Input
                  value={form.debtor_address ?? ""}
                  onChange={(e) => set("debtor_address", e.target.value)}
                />
              </Field>
            </CardContent>
          </Card>

          {/* Umowa pożyczki */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Umowa pożyczki</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Numer umowy">
                  <Input
                    value={form.contract_number ?? ""}
                    onChange={(e) => set("contract_number", e.target.value)}
                  />
                </Field>
                <Field label="Kapitał / kwota pożyczki (zł)">
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={form.principal_amount ?? 0}
                    onChange={(e) => set("principal_amount", num(e.target.value))}
                  />
                </Field>
                <Field label="Data wypłaty">
                  <Input
                    type="date"
                    value={form.payout_date ?? ""}
                    onChange={(e) => set("payout_date", e.target.value)}
                  />
                </Field>
                <Field label="Termin spłaty (wymagalność)">
                  <Input
                    type="date"
                    value={form.due_date ?? ""}
                    onChange={(e) => set("due_date", e.target.value)}
                  />
                </Field>
                <Field label="Odsetki kapitałowe (roczne %)">
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={form.contractual_annual_rate ?? 0}
                    onChange={(e) => set("contractual_annual_rate", num(e.target.value))}
                  />
                </Field>
                <Field label="Odsetki za opóźnienie wg umowy (roczne %)">
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={form.penalty_annual_rate ?? 0}
                    onChange={(e) => set("penalty_annual_rate", num(e.target.value))}
                  />
                </Field>
                <Field label="Max. odsetki za opóźnienie (limit %)" className="sm:col-span-2">
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={form.max_statutory_rate ?? 0}
                      onChange={(e) => set("max_statutory_rate", num(e.target.value))}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => set("max_statutory_rate", suggestedMaxRate)}
                    >
                      Ustaw {suggestedMaxRate}%
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Odsetki maksymalne = 2 × (stopa ref. NBP {nbpRef ?? "?"}% + 5,5 p.p.). Efektywna
                    stopa opóźnienia nie przekroczy tego limitu.
                  </p>
                </Field>
              </div>

              <Separator />

              <div className="flex flex-wrap items-center gap-3">
                {form.contract_file_path ? (
                  <Button variant="outline" size="sm" onClick={openContract}>
                    <Download className="h-4 w-4 mr-1" />{" "}
                    {form.contract_file_name || "Pobierz umowę"}
                  </Button>
                ) : (
                  <span className="text-sm text-muted-foreground">Nie wgrano pliku umowy.</span>
                )}
                <label className="inline-flex">
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void onUploadContract(f);
                      e.target.value = "";
                    }}
                  />
                  <Button asChild variant="secondary" size="sm" disabled={uploading || extracting}>
                    <span>
                      {uploading || extracting ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-1" />
                      )}
                      {form.contract_file_path ? "Zmień plik" : "Wgraj umowę"}
                    </span>
                  </Button>
                </label>
                {extracting && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5" /> AI uzupełnia dane z umowy…
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Po wgraniu umowy AI automatycznie uzupełni dane dłużnika, kwotę, terminy i odsetki — sprawdź i popraw, jeśli trzeba.
              </p>
            </CardContent>
          </Card>

          {/* Cennik działań */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Opłaty za działania windykacyjne (wg umowy)
              </CardTitle>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-3 gap-3">
              <Field label="SMS (zł)">
                <Input
                  type="number"
                  value={form.fee_sms ?? 0}
                  onChange={(e) => set("fee_sms", num(e.target.value))}
                />
              </Field>
              <Field label="E-mail (zł)">
                <Input
                  type="number"
                  value={form.fee_email ?? 0}
                  onChange={(e) => set("fee_email", num(e.target.value))}
                />
              </Field>
              <Field label="Telefon (zł)">
                <Input
                  type="number"
                  value={form.fee_phone ?? 0}
                  onChange={(e) => set("fee_phone", num(e.target.value))}
                />
              </Field>
              <Field label="Pismo do dłużnika (zł)">
                <Input
                  type="number"
                  value={form.fee_letter_debtor ?? 0}
                  onChange={(e) => set("fee_letter_debtor", num(e.target.value))}
                />
              </Field>
              <Field label="Pismo do sądu (zł)">
                <Input
                  type="number"
                  value={form.fee_letter_court ?? 0}
                  onChange={(e) => set("fee_letter_court", num(e.target.value))}
                />
              </Field>
              <Field label="Pismo do komornika (zł)">
                <Input
                  type="number"
                  value={form.fee_letter_bailiff ?? 0}
                  onChange={(e) => set("fee_letter_bailiff", num(e.target.value))}
                />
              </Field>
            </CardContent>
          </Card>

          <div className="flex items-center gap-2">
            <Button onClick={() => void persist()} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}{" "}
              Zapisz sprawę
            </Button>
            <span className="text-xs text-muted-foreground">
              Możesz zapisać szkic i wrócić później.
            </span>
          </div>

          {/* Wpłaty klienta */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Wpłaty klienta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-[150px_1fr_1fr_auto] gap-2 items-end">
                <Field label="Data">
                  <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                </Field>
                <Field label="Kwota (zł)">
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    placeholder="np. 1500"
                  />
                </Field>
                <Field label="Opis">
                  <Input
                    value={payNote}
                    onChange={(e) => setPayNote(e.target.value)}
                    placeholder="np. przelew"
                  />
                </Field>
                <Button onClick={onAddPayment}>
                  <Plus className="h-4 w-4 mr-1" /> Dodaj
                </Button>
              </div>
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Brak wpłat. Wgraj wszystkie wpłaty klienta, aby wyliczyć saldo.
                </p>
              ) : (
                <div className="divide-y rounded-md border">
                  {payments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <div className="flex items-center gap-3">
                        <span className="tabular-nums text-muted-foreground w-24">
                          {formatDate(p.paid_on)}
                        </span>
                        <span className="font-medium tabular-nums">{formatPLN(p.amount)}</span>
                        {p.note && <span className="text-muted-foreground">{p.note}</span>}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => onDeletePayment(p.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Historia działań */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Historia działań</CardTitle>
            </CardHeader>
            <CardContent>
              {actions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Brak działań.</p>
              ) : (
                <div className="divide-y rounded-md border">
                  {actions.map((a) => {
                    const meta = ACTION_META[a.action_type];
                    const Icon = meta?.icon ?? FileText;
                    return (
                      <div
                        key={a.id}
                        className="flex items-start justify-between gap-3 px-3 py-2 text-sm"
                      >
                        <div className="flex items-start gap-2 min-w-0">
                          <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{meta?.label ?? a.action_type}</span>
                              <span className="text-xs text-muted-foreground">
                                {formatDate(a.action_date)}
                              </span>
                              {a.status === "sent" && (
                                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200">
                                  <CheckCircle2 className="h-3 w-3 mr-0.5" />
                                  wysłano
                                </Badge>
                              )}
                              {a.status === "failed" && (
                                <Badge variant="destructive">
                                  <XCircle className="h-3 w-3 mr-0.5" />
                                  błąd
                                </Badge>
                              )}
                              {a.status === "recorded" && (
                                <Badge variant="secondary">zarejestrowano</Badge>
                              )}
                              {a.fee > 0 && (
                                <span className="text-xs font-medium">
                                  opłata {formatPLN(a.fee)}
                                </span>
                              )}
                            </div>
                            {a.subject && (
                              <div className="text-xs text-muted-foreground truncate">
                                {a.subject}
                              </div>
                            )}
                            {a.error_message && (
                              <div className="text-xs text-destructive">{a.error_message}</div>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => onDeleteAction(a.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* PRAWA: kalkulacja + działania */}
        <div className="space-y-6">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="h-4 w-4" /> Zadłużenie na dziś
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {calc && (
                <>
                  <div className="text-3xl font-bold tabular-nums">{formatPLN(calc.totalDue)}</div>
                  <p className="text-xs text-muted-foreground">stan na {formatDate(calc.asOf)}</p>
                  <Separator />
                  <Row label="Kapitał" value={calc.principalOutstanding} />
                  {calc.contractualInterest > 0 && (
                    <Row label="Odsetki kapitałowe" value={calc.contractualInterest} />
                  )}
                  <Row label="Odsetki za opóźnienie" value={calc.delayInterest} />
                  <Row label="Koszty windykacji" value={calc.costsOutstanding} />
                  <Separator />
                  <Row label="Suma wpłat" value={calc.totalPaid} muted />
                  <Row label="Naliczone opłaty" value={calc.totalFeesCharged} muted />
                  <div className="text-xs text-muted-foreground space-y-1 pt-1">
                    <div>Opóźnienie: {calc.daysOverdue} dni</div>
                    <div>
                      Stopa odsetek za opóźnienie: {calc.effectiveDelayRate}%
                      {calc.penaltyCapped && (
                        <span className="text-amber-600"> (obcięta do max)</span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="h-4 w-4" /> Zleć działanie
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {(Object.keys(ACTION_META) as DebtActionType[]).map((t) => {
                const meta = ACTION_META[t];
                const Icon = meta.icon;
                return (
                  <Button
                    key={t}
                    variant="outline"
                    size="sm"
                    className="justify-start h-auto py-2"
                    onClick={() => openAction(t)}
                  >
                    <Icon className="h-4 w-4 mr-1.5 shrink-0" />
                    <span className="text-left text-xs leading-tight">
                      {meta.label}
                      <br />
                      <span className="text-muted-foreground">
                        {formatPLN(num(form[meta.feeField]))}
                      </span>
                    </span>
                  </Button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5 text-xs text-muted-foreground space-y-2">
              <p>Potrzebujesz w pełni sformatowanego dokumentu DOCX?</p>
              <Button asChild variant="link" size="sm" className="px-0 h-auto">
                <Link to="/inwestor/kreator-dokumentow">Otwórz Kreator dokumentów →</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialog działania */}
      <Dialog open={actionType != null} onOpenChange={(o) => !o && setActionType(null)}>
        <DialogContent className="max-w-lg">
          {actionType && (
            <>
              <DialogHeader>
                <DialogTitle>{ACTION_META[actionType].label}</DialogTitle>
                <DialogDescription>
                  {actionType === "sms" || actionType === "email"
                    ? "Wiadomość zostanie wysłana do dłużnika, a opłata naliczona po udanej wysyłce."
                    : "Działanie zostanie zarejestrowane, a opłata naliczona zgodnie z umową."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <Field
                  label={
                    ACTION_META[actionType].channel === "email"
                      ? "Adres e-mail"
                      : ACTION_META[actionType].channel === "phone"
                        ? "Numer telefonu"
                        : "Adresat"
                  }
                >
                  <Input value={actionTarget} onChange={(e) => setActionTarget(e.target.value)} />
                </Field>
                {actionType !== "sms" && (
                  <Field label="Temat / tytuł">
                    <Input
                      value={actionSubject}
                      onChange={(e) => setActionSubject(e.target.value)}
                    />
                  </Field>
                )}
                <Field label={actionType === "phone" ? "Notatka z rozmowy" : "Treść"}>
                  <Textarea
                    rows={actionType === "sms" ? 4 : 10}
                    value={actionContent}
                    onChange={(e) => setActionContent(e.target.value)}
                  />
                </Field>
                <Field label="Opłata do naliczenia (zł)">
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={actionFee}
                    onChange={(e) => setActionFee(e.target.value)}
                  />
                </Field>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setActionType(null)}>
                  Anuluj
                </Button>
                <Button onClick={submitAction} disabled={actionBusy}>
                  {actionBusy ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4 mr-1" />
                  )}
                  {actionType === "sms" || actionType === "email"
                    ? "Wyślij i nalicz"
                    : "Zarejestruj i nalicz"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span className={`tabular-nums ${muted ? "text-muted-foreground" : "font-medium"}`}>
        {formatPLN(value)}
      </span>
    </div>
  );
}
