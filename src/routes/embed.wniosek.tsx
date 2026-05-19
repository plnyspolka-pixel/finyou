import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { propertyTypeLabels } from "@/lib/labels";

export const Route = createFileRoute("/embed/wniosek")({
  component: EmbedWniosek,
  head: () => ({
    meta: [
      { title: "Wniosek o pożyczkę" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function EmbedWniosek() {
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const source = params?.get("source") ?? "embed";

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    loan_amount: "",
    preferred_period_months: "",
    property_type: "mieszkanie",
    city: "",
    situation_description: "",
    consent_rodo: false,
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!form.consent_rodo) { setErr("Wymagana zgoda RODO."); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/loan-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          loan_amount: Number(form.loan_amount),
          preferred_period_months: Number(form.preferred_period_months),
          source,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error ?? "Błąd wysyłki");
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Błąd wysyłki");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="mx-auto max-w-xl rounded-xl border bg-card p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-foreground">Dziękujemy!</h1>
          <p className="mt-2 text-muted-foreground">
            Wniosek został przyjęty. Skontaktujemy się wkrótce.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <form onSubmit={submit} className="mx-auto max-w-xl space-y-5 rounded-xl border bg-card p-6 shadow-sm">
        <header>
          <h1 className="text-2xl font-bold text-foreground">Wniosek o pożyczkę pod zastaw nieruchomości</h1>
          <p className="text-sm text-muted-foreground">Wypełnij formularz — oddzwonimy.</p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Imię *</Label>
            <Input required value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Nazwisko *</Label>
            <Input required value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>E-mail *</Label>
            <Input type="email" required value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Telefon *</Label>
            <Input required value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+48 ..." />
          </div>
          <div className="space-y-2">
            <Label>Kwota pożyczki (PLN) *</Label>
            <Input type="number" min={1000} required value={form.loan_amount} onChange={(e) => set("loan_amount", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Okres (miesiące) *</Label>
            <Input type="number" min={1} required value={form.preferred_period_months} onChange={(e) => set("preferred_period_months", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Typ nieruchomości *</Label>
            <Select value={form.property_type} onValueChange={(v) => set("property_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(propertyTypeLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Miasto</Label>
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Opis sytuacji</Label>
          <Textarea rows={4} value={form.situation_description} onChange={(e) => set("situation_description", e.target.value)} />
        </div>

        <label className="flex items-start gap-3 text-sm text-muted-foreground">
          <Checkbox checked={form.consent_rodo} onCheckedChange={(v) => set("consent_rodo", v === true)} />
          <span>Wyrażam zgodę na przetwarzanie moich danych osobowych w celu rozpatrzenia wniosku (RODO). *</span>
        </label>

        {err && <p className="text-sm text-destructive">{err}</p>}

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Wysyłanie…" : "Wyślij wniosek"}
        </Button>
      </form>
    </div>
  );
}
