// Pulpit klienta: zamiast linków-CTA pokazujemy okienka, w których klient
// od razu uzupełnia/wrzuca to, czego brakuje, bez wychodzenia z pulpitu.

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { uploadFile } from "@/lib/uploads/unified-upload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { SecurityTypePicker } from "@/components/security-type-picker";
import { formatPLN, type SecurityType } from "@/lib/loan-math";
import { Circle, Upload, Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import type { EnrichedProgress } from "@/lib/my-loan-progress";

interface ClientRow {
  id: string;
  user_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
}
interface LoanRow {
  id: string;
  loan_amount: number | null;
  preferred_period_months: number | null;
  max_monthly_payment: number | null;
  annual_investor_rate: number | null;
  investor_description: string | null;
}
interface PropertyRow {
  id?: string;
  property_type?: string | null;
  land_register_number?: string | null;
  area_sqm?: number | null;
  loan_application_id?: string;
}

interface Props {
  progress: EnrichedProgress;
  userId: string;
  client: ClientRow | null;
  loan: LoanRow | null;
  property: PropertyRow | null;
  onChanged: () => void;
}

function Box({
  title,
  children,
  done,
}: {
  title: string;
  children: React.ReactNode;
  done?: boolean;
}) {
  return (
    <Card className="border-amber-200 dark:border-amber-900/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          {done ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <Circle className="h-4 w-4 text-amber-500" />
          )}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

export function InlineMissingActions({
  progress,
  userId,
  client,
  loan,
  property,
  onChanged,
}: Props) {
  const f = progress.flags;
  const boxes: React.ReactNode[] = [];

  // 1) Brak wniosku w ogóle
  if (!f.hasLoan) {
    return (
      <Card className="border-amber-300 dark:border-amber-900/50">
        <CardHeader>
          <CardTitle className="text-base">Rozpocznij wniosek</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Najpierw wypełnij krótki wniosek — kwota, okres, zabezpieczenie. Potem reszta uzupełnisz
            tu na pulpicie.
          </p>
          <Button asChild variant="cta">
            <Link to="/klient">
              Rozpocznij wniosek <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  // 2) Kontakt
  if (!f.hasContact) {
    boxes.push(<ContactBox key="contact" userId={userId} client={client} onChanged={onChanged} />);
  }

  // 3) Typ zabezpieczenia
  if (!f.hasPropertyType && loan) {
    boxes.push(
      <PropertyTypeBox key="ptype" loanId={loan.id} property={property} onChanged={onChanged} />,
    );
  }

  // 4) Warunki pożyczki
  if (!f.hasLoanTerms && loan) {
    boxes.push(<LoanTermsBox key="terms" loan={loan} onChanged={onChanged} />);
  }

  // 5) Opis dla inwestora
  if (!f.hasInvestorDescription && loan) {
    boxes.push(<InvestorDescBox key="desc" loan={loan} onChanged={onChanged} />);
  }

  // 6) Brakujące dokumenty / pola nieruchomości
  for (const m of progress.missing) {
    if (m.kind === "kw_number" && property) {
      boxes.push(
        <KwNumberBox
          key="kw"
          propertyId={property.id!}
          initial={property.land_register_number ?? ""}
          onChanged={onChanged}
        />,
      );
    } else if (m.kind === "usable_area" && property) {
      boxes.push(
        <UsableAreaBox
          key="area"
          propertyId={property.id!}
          initial={property.area_sqm ?? null}
          onChanged={onChanged}
        />,
      );
    } else if (loan) {
      boxes.push(
        <DocumentUploadBox
          key={`doc-${m.kind}`}
          userId={userId}
          loanId={loan.id}
          kind={m.kind}
          label={m.label}
          onChanged={onChanged}
        />,
      );
    }
  }

  if (boxes.length === 0) {
    return (
      <Card className="border-emerald-200 dark:border-emerald-900/50">
        <CardContent className="py-6 text-center text-sm text-emerald-700 dark:text-emerald-400">
          Wszystko gotowe — wniosek kompletny. Trzymamy kciuki!
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold">Wrzuć to, czego nam jeszcze brakuje</h3>
        <Badge variant="secondary">{boxes.length}</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2">{boxes}</div>
    </div>
  );
}

// ---------------- Sub-boxes ----------------

function ContactBox({
  userId,
  client,
  onChanged,
}: {
  userId: string;
  client: ClientRow | null;
  onChanged: () => void;
}) {
  const [firstName, setFirstName] = useState(client?.first_name ?? "");
  const [lastName, setLastName] = useState(client?.last_name ?? "");
  const [phone, setPhone] = useState(client?.phone ?? "");
  const [email, setEmail] = useState(client?.email ?? "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!firstName.trim() || !phone.trim()) {
      toast.error("Imię i telefon są wymagane");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        first_name: firstName.trim(),
        last_name: lastName.trim() || undefined,
        phone: phone.trim(),
        email: email.trim() || undefined,
      };
      const res = client?.id
        ? await supabase.from("clients").update(payload).eq("id", client.id)
        : await supabase.from("clients").insert({
            first_name: payload.first_name,
            last_name: payload.last_name ?? "",
            phone: payload.phone,
            email: payload.email,
            user_id: userId,
          });
      if (res.error) throw res.error;
      toast.success("Dane zapisane");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd zapisu");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box title="Twoje dane kontaktowe">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Imię</Label>
          <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Nazwisko</Label>
          <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Telefon</Label>
          <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">E-mail</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
      <Button size="sm" onClick={save} disabled={busy}>
        {busy ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Zapisuję…
          </>
        ) : (
          "Zapisz dane"
        )}
      </Button>
    </Box>
  );
}

function PropertyTypeBox({
  loanId,
  property,
  onChanged,
}: {
  loanId: string;
  property: PropertyRow | null;
  onChanged: () => void;
}) {
  const [value, setValue] = useState<SecurityType | null>(
    (property?.property_type as SecurityType | null) ?? null,
  );
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!value) {
      toast.error("Wybierz typ");
      return;
    }
    setBusy(true);
    try {
      const res = property?.id
        ? await supabase.from("properties").update({ property_type: value }).eq("id", property.id)
        : await supabase
            .from("properties")
            .insert({ loan_application_id: loanId, property_type: value });
      if (res.error) throw res.error;
      toast.success("Zabezpieczenie zapisane");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd zapisu");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box title="Typ zabezpieczenia">
      <SecurityTypePicker value={value} onChange={setValue} />
      <Button size="sm" onClick={save} disabled={busy || !value}>
        {busy ? "Zapisuję…" : "Zapisz wybór"}
      </Button>
    </Box>
  );
}

function LoanTermsBox({ loan, onChanged }: { loan: LoanRow; onChanged: () => void }) {
  const [amount, setAmount] = useState<number>(Number(loan.loan_amount ?? 200_000));
  const [months, setMonths] = useState<number>(Number(loan.preferred_period_months ?? 24));
  const [maxPayment, setMaxPayment] = useState<number>(Number(loan.max_monthly_payment ?? 3500));
  const [rate, setRate] = useState<number>(Number(loan.annual_investor_rate ?? 24));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const res = await supabase
        .from("loan_applications")
        .update({
          loan_amount: amount,
          preferred_period_months: months,
          max_monthly_payment: maxPayment,
          annual_investor_rate: rate,
        })
        .eq("id", loan.id);
      if (res.error) throw res.error;
      toast.success("Warunki zapisane");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd zapisu");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box title="Warunki pożyczki">
      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-xs">
            <span>Kwota</span>
            <span className="font-bold">{formatPLN(amount)}</span>
          </div>
          <Slider
            value={[amount]}
            min={10_000}
            max={2_000_000}
            step={100}
            onValueChange={(v) => setAmount(v[0] ?? amount)}
          />
        </div>
        <div>
          <div className="flex justify-between text-xs">
            <span>Okres</span>
            <span className="font-bold">{months} mies.</span>
          </div>
          <Slider
            value={[months]}
            min={3}
            max={72}
            step={1}
            onValueChange={(v) => setMonths(v[0] ?? months)}
          />
        </div>
        <div>
          <Label className="text-xs">Jaką ratę miesięczną możesz spłacać?</Label>
          <Input
            type="number"
            value={maxPayment}
            onChange={(e) => setMaxPayment(Number(e.target.value) || 0)}
          />
        </div>
        <div>
          <Label className="text-xs">
            Jakie wynagrodzenie inwestora proponujesz w skali roku? (%)
          </Label>
          <Input
            type="number"
            step="0.5"
            value={rate}
            onChange={(e) => setRate(Number(e.target.value) || 0)}
          />
        </div>
      </div>
      <Button size="sm" onClick={save} disabled={busy}>
        {busy ? "Zapisuję…" : "Zapisz warunki"}
      </Button>
    </Box>
  );
}

function InvestorDescBox({ loan, onChanged }: { loan: LoanRow; onChanged: () => void }) {
  const [text, setText] = useState(loan.investor_description ?? "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (text.trim().length < 20) {
      toast.error("Dodaj kilka zdań — min. 20 znaków");
      return;
    }
    setBusy(true);
    try {
      const res = await supabase
        .from("loan_applications")
        .update({ investor_description: text.trim() })
        .eq("id", loan.id);
      if (res.error) throw res.error;
      toast.success("Opis zapisany");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd zapisu");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box title="Krótki opis dla inwestora">
      <Textarea
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Dlaczego potrzebujesz finansowania, na co pójdą pieniądze, jak planujesz spłacić…"
      />
      <Button size="sm" onClick={save} disabled={busy}>
        {busy ? "Zapisuję…" : "Zapisz opis"}
      </Button>
    </Box>
  );
}

function KwNumberBox({
  propertyId,
  initial,
  onChanged,
}: {
  propertyId: string;
  initial: string;
  onChanged: () => void;
}) {
  const [kw, setKw] = useState(initial);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!kw.trim()) return;
    setBusy(true);
    try {
      const res = await supabase
        .from("properties")
        .update({ land_register_number: kw.trim().toUpperCase() })
        .eq("id", propertyId);
      if (res.error) throw res.error;
      toast.success("Numer KW zapisany");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd zapisu");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box title="Numer księgi wieczystej">
      <Input
        value={kw}
        onChange={(e) => setKw(e.target.value.toUpperCase())}
        placeholder="np. WA1M/00123456/7"
        className="font-mono"
      />
      <p className="text-xs text-muted-foreground">
        Adres i dane nieruchomości pobierzemy automatycznie z KW.
      </p>
      <Button size="sm" onClick={save} disabled={busy || !kw.trim()}>
        {busy ? "Zapisuję…" : "Zapisz numer"}
      </Button>
    </Box>
  );
}

function UsableAreaBox({
  propertyId,
  initial,
  onChanged,
}: {
  propertyId: string;
  initial: number | null;
  onChanged: () => void;
}) {
  const [area, setArea] = useState<number>(initial ?? 50);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const res = await supabase.from("properties").update({ area_sqm: area }).eq("id", propertyId);
      if (res.error) throw res.error;
      toast.success("Powierzchnia zapisana");
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd zapisu");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Box title="Powierzchnia użytkowa">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={area}
          onChange={(e) => setArea(Number(e.target.value) || 0)}
          className="max-w-32"
        />
        <span className="text-sm text-muted-foreground">m²</span>
      </div>
      <Button size="sm" onClick={save} disabled={busy || area <= 0}>
        {busy ? "Zapisuję…" : "Zapisz"}
      </Button>
    </Box>
  );
}

function DocumentUploadBox({
  userId,
  loanId,
  kind,
  label,
  onChanged,
}: {
  userId: string;
  loanId: string;
  kind: string;
  label: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const handle = async (file: File | undefined | null) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("Plik za duży (max 20 MB)");
      return;
    }
    setBusy(true);
    const t = toast.loading("Wysyłam plik…");
    try {
      const res = await uploadFile(file, {
        context: "document",
        applicationId: loanId,
        docType: kind,
      });
      const ins = await supabase.from("documents").insert({
        loan_application_id: loanId,
        document_type: kind,
        file_name: file.name,
        file_path: res.path,
        uploaded_by: userId,
      });
      if (ins.error) throw ins.error;
      toast.success("Plik wgrany", { id: t });
      onChanged();
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd uploadu", { id: t });
    } finally {
      setBusy(false);
    }
  };
  const accept = kind.startsWith("photos_") ? "image/*" : "image/*,application/pdf";
  return (
    <Box title={label}>
      <p className="text-xs text-muted-foreground">Wrzuć plik — PDF lub zdjęcie. Maks. 20 MB.</p>
      <label className="inline-flex">
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            void handle(f);
          }}
        />
        <Button asChild size="sm" variant="cta" disabled={busy}>
          <span>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Wysyłam…
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Wybierz plik
              </>
            )}
          </span>
        </Button>
      </label>
    </Box>
  );
}
