import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Wallet, Save, FileUp, Building2, UserCircle } from "lucide-react";
import { toast } from "sonner";
import { formatPLN, formatDate } from "@/lib/labels";
import { settlementTypeLabels } from "@/lib/affiliate/labels";
import { BrokerAccountComplianceNotice } from "@/components/affiliate/compliance-notice";
import {
  getMyAffiliatePartner,
  getAffiliateDashboard,
  getAffiliatePayouts,
  updateAffiliateBilling,
  submitAffiliateInvoice,
} from "@/lib/affiliate/partner.functions";

export const Route = createFileRoute("/posrednik/rozliczenia")({
  component: RozliczeniaPage,
});

function RozliczeniaPage() {
  const meFn = useServerFn(getMyAffiliatePartner);
  const dashFn = useServerFn(getAffiliateDashboard);
  const payoutsFn = useServerFn(getAffiliatePayouts);
  const saveFn = useServerFn(updateAffiliateBilling);
  const invoiceFn = useServerFn(submitAffiliateInvoice);
  const qc = useQueryClient();

  const meQ = useQuery({ queryKey: ["affiliate-me"], queryFn: () => meFn() });
  const dashQ = useQuery({ queryKey: ["affiliate-dashboard"], queryFn: () => dashFn() });
  const payoutsQ = useQuery({ queryKey: ["affiliate-payouts"], queryFn: () => payoutsFn() });

  const me = meQ.data as any;

  const [bank, setBank] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [nip, setNip] = useState("");
  const [saving, setSaving] = useState(false);

  const [invNumber, setInvNumber] = useState("");
  const [invNet, setInvNet] = useState("");
  const [invVat, setInvVat] = useState("");
  const [invGross, setInvGross] = useState("");
  const [invSubmitting, setInvSubmitting] = useState(false);

  useEffect(() => {
    if (me) {
      setBillingEmail(me.billing_email ?? "");
      setPhone(me.phone ?? "");
      setCompanyName(me.company_name ?? "");
      setNip(me.nip ?? "");
    }
  }, [me]);

  if (meQ.isLoading) return <p className="text-muted-foreground">Ładowanie…</p>;
  if (!me) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Wallet className="h-6 w-6" /> Rozliczenia i wypłaty
        </h1>
        <p className="text-muted-foreground">
          Nie jesteś jeszcze zarejestrowany jako partner programu pośredników.
        </p>
      </div>
    );
  }

  const isB2B = me.settlement_type === "b2b";
  const dash = dashQ.data as any;
  const payouts = (payoutsQ.data as any[]) ?? [];

  async function saveBilling() {
    setSaving(true);
    try {
      await saveFn({
        data: {
          bankAccount: bank || undefined,
          billingEmail,
          phone,
          companyName: isB2B ? companyName : undefined,
          nip: isB2B ? nip : undefined,
        },
      });
      toast.success("Dane rozliczeniowe zapisane");
      setBank("");
      void qc.invalidateQueries({ queryKey: ["affiliate-me"] });
    } catch (e) {
      toast.error("Nie udało się zapisać", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function submitInvoice() {
    if (!invNumber.trim() || !invGross) return toast.error("Podaj numer faktury i kwotę brutto");
    setInvSubmitting(true);
    try {
      await invoiceFn({
        data: {
          invoiceNumber: invNumber,
          netAmount: Number(invNet) || Number(invGross),
          vatAmount: invVat ? Number(invVat) : undefined,
          grossAmount: Number(invGross),
        },
      });
      toast.success("Faktura przesłana do weryfikacji");
      setInvNumber("");
      setInvNet("");
      setInvVat("");
      setInvGross("");
    } catch (e) {
      toast.error("Nie udało się przesłać faktury", { description: (e as Error).message });
    } finally {
      setInvSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6" /> Rozliczenia i wypłaty
          </h1>
          <p className="text-sm text-muted-foreground">
            Dane rozliczeniowe, faktury i historia wypłat prowizji.
          </p>
        </div>
        <Badge variant="secondary" className="gap-1">
          {isB2B ? <Building2 className="h-3.5 w-3.5" /> : <UserCircle className="h-3.5 w-3.5" />}{" "}
          {settlementTypeLabels[me.settlement_type]}
        </Badge>
      </div>

      {dash && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Naliczone</div>
              <div className="text-lg font-bold text-amber-600">
                {formatPLN(dash.balances.naliczone)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Zatwierdzone</div>
              <div className="text-lg font-bold text-blue-600">
                {formatPLN(dash.balances.zatwierdzone)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Dostępne (próg 500 zł)</div>
              <div className="text-lg font-bold text-indigo-600">
                {formatPLN(dash.balances.dostepne)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Wypłacone</div>
              <div className="text-lg font-bold text-emerald-600">
                {formatPLN(dash.balances.wyplacone)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Dane rozliczeniowe</CardTitle>
          <CardDescription>
            Rachunek bankowy używany jest wyłącznie do wypłat i przechowywany w postaci
            zaszyfrowanej.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1 sm:col-span-2">
            <Label>
              Numer rachunku bankowego{" "}
              {me.has_bank_account && (
                <span className="text-xs text-muted-foreground">
                  (obecnie: {me.bank_account_masked})
                </span>
              )}
            </Label>
            <Input
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              placeholder={
                me.has_bank_account ? "Wpisz, aby zmienić" : "PL00 0000 0000 0000 0000 0000 0000"
              }
            />
          </div>
          <div className="space-y-1">
            <Label>E-mail do rozliczeń</Label>
            <Input
              type="email"
              value={billingEmail}
              onChange={(e) => setBillingEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Telefon</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          {isB2B && (
            <>
              <div className="space-y-1">
                <Label>Nazwa firmy</Label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>NIP</Label>
                <Input value={nip} onChange={(e) => setNip(e.target.value)} />
              </div>
            </>
          )}
          <div className="sm:col-span-2">
            <Button onClick={saveBilling} disabled={saving}>
              <Save className="mr-2 h-4 w-4" /> {saving ? "Zapisywanie…" : "Zapisz dane"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {isB2B ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileUp className="h-4 w-4" /> Prześlij fakturę
            </CardTitle>
            <CardDescription>
              Aby wypłacić prowizję w modelu B2B, dodaj fakturę lub dokument rozliczeniowy.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label>Numer faktury</Label>
              <Input value={invNumber} onChange={(e) => setInvNumber(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Netto</Label>
              <Input type="number" value={invNet} onChange={(e) => setInvNet(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>VAT</Label>
              <Input type="number" value={invVat} onChange={(e) => setInvVat(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Brutto</Label>
              <Input type="number" value={invGross} onChange={(e) => setInvGross(e.target.value)} />
            </div>
            <div className="sm:col-span-4">
              <Button onClick={submitInvoice} disabled={invSubmitting} variant="outline">
                {invSubmitting ? "Wysyłanie…" : "Prześlij fakturę"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground">
            Rozliczasz się w ramach <b>działalności nierejestrowanej</b>. Pilnujemy Twojego
            kwartalnego limitu przychodów.
            {dash?.limitInfo && (
              <>
                {" "}
                Wykorzystano <b>{formatPLN(dash.limitInfo.quarterSum)}</b> z{" "}
                {formatPLN(dash.limitInfo.limitAmount)} (Q{dash.limitInfo.quarter}{" "}
                {dash.limitInfo.year}).
              </>
            )}{" "}
            Po przekroczeniu limitu kolejne prowizje będą wymagać przejścia na rozliczenie B2B.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Historia wypłat</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {payouts.length === 0 ? (
            <p className="p-4 text-muted-foreground">
              Brak wypłat. Pojawią się po utworzeniu paczki wypłat przez administratora (po
              osiągnięciu progu 500 zł).
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tytuł</TableHead>
                  <TableHead className="text-right">Kwota</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Wypłacono</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs">{formatDate(p.created_at)}</TableCell>
                    <TableCell className="text-sm">{p.transfer_title}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {formatPLN(p.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          p.status === "paid"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }
                      >
                        {p.status === "paid" ? "Wypłacone" : "Oczekuje"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {p.paid_at ? formatDate(p.paid_at) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <BrokerAccountComplianceNotice />
    </div>
  );
}
