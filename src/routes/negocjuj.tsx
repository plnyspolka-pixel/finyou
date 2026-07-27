import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { LoanCalculator, type LoanCalculatorState } from "@/components/loan-calculator";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { Handshake, ArrowLeft, ListChecks } from "lucide-react";
import { FancyShell } from "@/components/landing/fancy-shell";

type NegocjujSearch = {
  app?: string;
  client?: string;
  amount?: number;
  months?: number;
  rate?: number;
};

export const Route = createFileRoute("/negocjuj")({
  validateSearch: (s: Record<string, unknown>): NegocjujSearch => ({
    app: typeof s.app === "string" ? s.app : undefined,
    client: typeof s.client === "string" ? s.client : undefined,
    amount: s.amount != null ? Number(s.amount) || undefined : undefined,
    months: s.months != null ? Number(s.months) || undefined : undefined,
    rate: s.rate != null ? Number(s.rate) || undefined : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Negocjuj propozycję pożyczki — Finance You" },
      {
        name: "description",
        content:
          "Kalkulator inwestora z limitami ustawowymi. Wygeneruj harmonogram spłat i zapisz kontrofertę dla klienta.",
      },
      { property: "og:title", content: "Negocjuj propozycję pożyczki — Finance You" },
      {
        property: "og:description",
        content: "Wygeneruj harmonogram i zapisz kontrofertę dla klienta.",
      },
    ],
  }),
  component: NegocjujPage,
});

function NegocjujPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [calc, setCalc] = useState<LoanCalculatorState | null>(null);
  const [clientName, setClientName] = useState(search.client ?? "");
  const [clientEmail, setClientEmail] = useState("");

  const [clientPhone, setClientPhone] = useState("");
  const [note, setNote] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!calc) {
      toast.error("Kalkulator jeszcze się nie załadował.");
      return;
    }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const payload = {
        created_by: userData?.user?.id ?? null,
        client_name: clientName.trim() || null,
        client_email: clientEmail.trim() || null,
        client_phone: clientPhone.trim() || null,
        note: note.trim() || null,
        amount: calc.amount,
        months: calc.months,
        annual_rate: calc.annualRate,
        commission_pct: calc.commissionPct,
        commission_pln: calc.commissionPln,
        max_payment: calc.maxPayment,
        nominal_rata: calc.nominalRata,
        capped_rata: calc.cappedRata,
        balloon: calc.balloon,
        total_interest: calc.totalOds,
        total_cost: calc.totalCost,
        total_to_repay: calc.totalToRepay,
        schedule: calc.schedule,
        is_public: isPublic,
        status: "open",
        source_application_id: search.app ?? null,
      };

      const { data, error } = await supabase
        .from("loan_proposals")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Propozycja zapisana. Możesz ją wysłać klientowi.");
      void navigate({ to: "/propozycje/$id", params: { id: data!.id } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Nieznany błąd";
      toast.error(`Nie udało się zapisać: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div className="flex items-center justify-between gap-2">
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Wróć na stronę główną
          </Link>
          <Link
            to="/propozycje"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ListChecks className="h-4 w-4" /> Wszystkie propozycje
          </Link>
        </div>

        <FancyShell>
          <div className="flex items-center gap-2">
            <Handshake className="h-6 w-6 text-white" />
            <p className="text-xs font-bold uppercase tracking-widest text-white/80">
              Inwestor — kontroferta
            </p>
          </div>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-white md:text-3xl">
            Negocjuj propozycję pożyczki
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-white/85">
            Ustaw parametry w kalkulatorze (z limitami ustawowymi), uzupełnij dane klienta i zapisz
            propozycję — wygenerowany harmonogram zostanie zachowany razem z ofertą.
          </p>
        </FancyShell>

        <LoanCalculator
          onChange={setCalc}
          initialAmount={search.amount}
          initialMonths={search.months}
          initialAnnualRate={search.rate}
        />

        <Card>
          <CardHeader>
            <CardTitle>Dane klienta i zapis propozycji</CardTitle>
            <CardDescription>
              Dane potrzebne, żeby wysłać klientowi konkretną ofertę z harmonogramem.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="cname">Imię i nazwisko klienta</Label>
                <Input
                  id="cname"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Jan Kowalski"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cmail">E-mail klienta</Label>
                <Input
                  id="cmail"
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="jan@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cphone">Telefon klienta</Label>
                <Input
                  id="cphone"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="+48 ..."
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="note">Notatka / komentarz do oferty</Label>
              <Textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Np. propozycja po rozmowie z 24.06 — gotowi negocjować oprocentowanie do 12%."
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isPublic} onCheckedChange={(v) => setIsPublic(v === true)} />
              <span>
                Widoczna publicznie na liście propozycji (każdy może zobaczyć parametry i
                harmonogram).
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button onClick={() => void handleSave()} disabled={saving || !calc}>
                {saving ? "Zapisuję..." : "Zapisz propozycję dla klienta"}
              </Button>
              <Link
                to="/propozycje"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Zobacz wszystkie propozycje →
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
