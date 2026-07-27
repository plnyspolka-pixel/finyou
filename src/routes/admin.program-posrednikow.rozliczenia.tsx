import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Download, CheckCircle2, XCircle, BanknoteIcon } from "lucide-react";
import { toast } from "sonner";
import { formatPLN, formatDate } from "@/lib/labels";
import {
  adminListAffiliateInvoices,
  adminVerifyAffiliateInvoice,
  exportAffiliateCsv,
} from "@/lib/affiliate/admin.functions";

export const Route = createFileRoute("/admin/program-posrednikow/rozliczenia")({
  component: RozliczeniaPage,
});

function downloadCsv(res: { filename: string; csv: string }) {
  const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = res.filename;
  a.click();
  URL.revokeObjectURL(url);
}

const invoiceStatusColors: Record<string, string> = {
  submitted: "bg-amber-100 text-amber-800",
  pending: "bg-amber-100 text-amber-800",
  verified: "bg-blue-100 text-blue-800",
  paid: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
};

const invoiceStatusLabels: Record<string, string> = {
  submitted: "Przesłana",
  pending: "Oczekuje",
  verified: "Zweryfikowana",
  paid: "Opłacona",
  rejected: "Odrzucona",
};

const EXPORTS: {
  kind:
    | "b2b_commissions"
    | "b2b_invoices"
    | "unregistered_ledger"
    | "unregistered_near_limit"
    | "full_report";
  label: string;
  desc: string;
}[] = [
  {
    kind: "b2b_commissions",
    label: "Prowizje B2B",
    desc: "Prowizje rozliczane fakturą — do księgowania.",
  },
  { kind: "b2b_invoices", label: "Faktury B2B", desc: "Wszystkie faktury partnerów B2B." },
  {
    kind: "unregistered_ledger",
    label: "Ewidencja — działalność nierejestrowana",
    desc: "Suma prowizji wg partnera, roku i kwartału.",
  },
  {
    kind: "unregistered_near_limit",
    label: "Limit nierejestrowanej — stan",
    desc: "Wykorzystanie kwartalnego limitu przychodów.",
  },
  {
    kind: "full_report",
    label: "Pełny raport prowizji",
    desc: "Kompletny eksport wszystkich prowizji.",
  },
];

function RozliczeniaPage() {
  const exportFn = useServerFn(exportAffiliateCsv);

  async function doExport(kind: (typeof EXPORTS)[number]["kind"]) {
    try {
      const res = (await exportFn({ data: { kind } })) as any;
      downloadCsv(res);
      toast.success("Wyeksportowano CSV");
    } catch (e) {
      toast.error("Nie udało się wyeksportować", { description: (e as Error).message });
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6" /> Rozliczenia i księgowość
        </h1>
        <p className="text-sm text-muted-foreground">
          Faktury partnerów B2B oraz eksporty dla księgowości (B2B i działalność nierejestrowana).
        </p>
      </div>

      <Tabs defaultValue="faktury" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
          <TabsTrigger value="faktury">Faktury B2B</TabsTrigger>
          <TabsTrigger value="eksporty">Eksporty</TabsTrigger>
        </TabsList>

        <TabsContent value="faktury" className="mt-0">
          <InvoicesTab />
        </TabsContent>

        <TabsContent value="eksporty" className="mt-0">
          <div className="grid gap-3 sm:grid-cols-2">
            {EXPORTS.map((e) => (
              <Card key={e.kind}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{e.label}</CardTitle>
                  <CardDescription>{e.desc}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" size="sm" onClick={() => doExport(e.kind)}>
                    <Download className="mr-2 h-4 w-4" /> Pobierz CSV
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InvoicesTab() {
  const listFn = useServerFn(adminListAffiliateInvoices);
  const verifyFn = useServerFn(adminVerifyAffiliateInvoice);
  const qc = useQueryClient();

  const q = useQuery({ queryKey: ["admin-affiliate-invoices"], queryFn: () => listFn() });
  const rows = (q.data as any[]) ?? [];

  async function verify(id: string, status: "verified" | "rejected" | "paid") {
    try {
      await verifyFn({ data: { id, status } });
      toast.success(
        status === "verified"
          ? "Faktura zweryfikowana"
          : status === "rejected"
            ? "Faktura odrzucona"
            : "Faktura oznaczona jako opłacona",
      );
      void qc.invalidateQueries({ queryKey: ["admin-affiliate-invoices"] });
    } catch (e) {
      toast.error("Nie udało się zaktualizować faktury", { description: (e as Error).message });
    }
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nr faktury</TableHead>
              <TableHead>Partner</TableHead>
              <TableHead>Data wyst.</TableHead>
              <TableHead className="text-right">Netto</TableHead>
              <TableHead className="text-right">VAT</TableHead>
              <TableHead className="text-right">Brutto</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Akcje</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="p-6 text-center text-muted-foreground">
                  Ładowanie…
                </TableCell>
              </TableRow>
            )}
            {!q.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="p-6 text-center text-muted-foreground">
                  Brak faktur.
                </TableCell>
              </TableRow>
            )}
            {rows.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="font-medium">{i.invoice_number ?? "—"}</TableCell>
                <TableCell className="text-xs">{i.partner_name ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {i.issue_date ? formatDate(i.issue_date) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatPLN(i.net_amount)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPLN(i.vat_amount)}</TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {formatPLN(i.gross_amount)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={invoiceStatusColors[i.status] ?? "bg-slate-100"}
                  >
                    {invoiceStatusLabels[i.status] ?? i.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {i.status !== "verified" && i.status !== "paid" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-blue-700"
                        title="Zweryfikuj"
                        onClick={() => verify(i.id, "verified")}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    )}
                    {i.status !== "paid" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-emerald-700"
                        title="Oznacz jako opłaconą"
                        onClick={() => verify(i.id, "paid")}
                      >
                        <BanknoteIcon className="h-4 w-4" />
                      </Button>
                    )}
                    {i.status !== "rejected" && i.status !== "paid" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-rose-700"
                        title="Odrzuć"
                        onClick={() => verify(i.id, "rejected")}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}
