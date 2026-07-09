import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, FileText, Image as ImageIcon, Home, Wallet, CalendarClock, MapPin, Landmark, Ruler, User, Building2, UserRound } from "lucide-react";
import { formatPLN } from "@/lib/loan-math";
import { loanStatusLabels } from "@/lib/labels";
import { SendToInvestorsDialog } from "@/components/broker/send-to-investors-dialog";

export const Route = createFileRoute("/posrednik/wnioski/$id")({
  component: BrokerApplicationDetail,
});

type Row = {
  id: string;
  status: string;
  loan_amount: number | null;
  preferred_period_months: number | null;
  created_at: string;
  client: { first_name?: string; last_name?: string; city?: string; phone?: string; email?: string } | null;
  properties: Array<{
    property_type?: string;
    address?: string;
    street?: string;
    city?: string;
    voivodeship?: string;
    land_register_number?: string;
    additional_land_register_numbers?: string[] | null;
    area_sqm?: number | null;
    estimated_value?: number | null;
    photos?: string[] | null;
    description?: string | null;
  }>;
};

type Doc = { id: string; document_type: string | null; file_name: string | null; file_url: string | null; created_at: string };

function BrokerApplicationDetail() {
  const { id } = useParams({ from: "/posrednik/wnioski/$id" });
  const [row, setRow] = useState<Row | null>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendOpen, setSendOpen] = useState<null | "instytucjonalny" | "indywidualny">(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const [{ data: app }, { data: d }] = await Promise.all([
        supabase
          .from("loan_applications")
          .select(
            "id, status, loan_amount, preferred_period_months, created_at, client:clients(first_name,last_name,city,phone,email), properties(property_type,address,street,city,voivodeship,land_register_number,additional_land_register_numbers,area_sqm,estimated_value,photos,description)"
          )
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("documents")
          .select("id, document_type, file_name, file_url, created_at")
          .eq("loan_application_id", id)
          .order("created_at", { ascending: false }),
      ]);
      setRow((app as any) ?? null);
      setDocs((d as any) ?? []);
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/posrednik/wnioski"><ArrowLeft className="mr-2 h-4 w-4" />Wróć</Link>
        </Button>
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nie znaleziono wniosku.</CardContent></Card>
      </div>
    );
  }

  const p = Array.isArray(row.properties) ? row.properties[0] : (row.properties as any);
  const photos: string[] = Array.isArray(p?.photos) ? p!.photos!.filter(Boolean) : [];
  const clientName = [row.client?.first_name, row.client?.last_name].filter(Boolean).join(" ") || "Klient";
  const fullAddress = [p?.street ?? p?.address, p?.city, p?.voivodeship].filter(Boolean).join(", ");
  const additionalKw = Array.isArray(p?.additional_land_register_numbers) ? p!.additional_land_register_numbers!.filter(Boolean) : [];

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
          <Link to="/posrednik/wnioski"><ArrowLeft className="mr-2 h-4 w-4" />Moje wnioski</Link>
        </Button>
        <FancyPageHeader
          eyebrow="Wniosek pożyczkowy"
          title={clientName}
          subtitle={new Date(row.created_at).toLocaleDateString("pl-PL", { day: "2-digit", month: "long", year: "numeric" })}
          actions={<Badge variant="secondary" className="text-sm">{loanStatusLabels[row.status as keyof typeof loanStatusLabels] ?? row.status}</Badge>}
        />
      </div>

      {/* Kluczowe parametry */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={<Wallet className="h-5 w-5" />} label="Wnioskowana kwota" value={row.loan_amount ? formatPLN(Number(row.loan_amount)) : "—"} accent />
        <StatCard icon={<CalendarClock className="h-5 w-5" />} label="Okres" value={row.preferred_period_months ? `${row.preferred_period_months} mies.` : "—"} />
        <StatCard icon={<Home className="h-5 w-5" />} label="Typ nieruchomości" value={p?.property_type ?? "—"} />
      </div>

      {/* Dystrybucja tematu */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold">Wyślij ofertę do inwestorów</div>
            <p className="text-xs text-muted-foreground">
              Zdjęcia, dokumenty, KW i kwota trafią do wybranych odbiorców z Twoją stopką.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setSendOpen("instytucjonalny")}>
              <Building2 className="mr-2 h-4 w-4" />Inwestorzy instytucjonalni
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setSendOpen("indywidualny")}>
              <UserRound className="mr-2 h-4 w-4" />Inwestorzy prywatni
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Nieruchomość */}
        <Card className="overflow-hidden">
          <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent">
            <CardTitle className="flex items-center gap-2 text-base"><Landmark className="h-4 w-4 text-primary" />Nieruchomość i KW</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4 text-sm">
            <InfoRow icon={<MapPin className="h-4 w-4" />} label="Adres" value={fullAddress || "—"} />
            <InfoRow icon={<FileText className="h-4 w-4" />} label="Numer KW" value={p?.land_register_number || "—"} mono />
            {additionalKw.length > 0 && (
              <InfoRow icon={<FileText className="h-4 w-4" />} label="Dodatkowe KW" value={additionalKw.join(", ")} mono />
            )}
            <InfoRow icon={<Ruler className="h-4 w-4" />} label="Powierzchnia" value={p?.area_sqm ? `${p.area_sqm} m²` : "—"} />
            <InfoRow icon={<Wallet className="h-4 w-4" />} label="Szacowana wartość" value={p?.estimated_value ? formatPLN(Number(p.estimated_value)) : "—"} />
          </CardContent>
        </Card>

        {/* Klient */}
        <Card className="overflow-hidden">
          <CardHeader className="bg-gradient-to-br from-primary/5 to-transparent">
            <CardTitle className="flex items-center gap-2 text-base"><User className="h-4 w-4 text-primary" />Klient</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-4 text-sm">
            <InfoRow label="Imię i nazwisko" value={clientName} />
            <InfoRow label="Miasto" value={row.client?.city || "—"} />
            <InfoRow label="Telefon" value={row.client?.phone || "—"} />
            <InfoRow label="E-mail" value={row.client?.email || "—"} />
          </CardContent>
        </Card>
      </div>

      {/* Zdjęcia */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="h-4 w-4 text-primary" />Zdjęcia nieruchomości
            <Badge variant="outline" className="ml-2">{photos.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {photos.length === 0 ? (
            <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
              Brak zdjęć.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {photos.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="group relative aspect-square overflow-hidden rounded-lg border bg-muted">
                  <img src={url} alt={`Zdjęcie ${i + 1}`} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dokumenty */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" />Dokumenty
            <Badge variant="outline" className="ml-2">{docs.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {docs.length === 0 ? (
            <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
              Brak dokumentów.
            </div>
          ) : (
            <div className="divide-y rounded-lg border">
              {docs.map((doc) => (
                <a
                  key={doc.id}
                  href={doc.file_url ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 transition hover:bg-muted/50"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{doc.file_name || doc.document_type || "Dokument"}</div>
                    <div className="text-xs text-muted-foreground">
                      {doc.document_type ?? "—"} · {new Date(doc.created_at).toLocaleDateString("pl-PL")}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {p?.description && (
        <Card>
          <CardHeader><CardTitle className="text-base">Opis</CardTitle></CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">{p.description}</CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <Card className={accent ? "border-primary/40 bg-gradient-to-br from-primary/10 to-transparent" : undefined}>
      <CardContent className="flex items-center gap-3 py-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="truncate text-base font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ icon, label, value, mono }: { icon?: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-right font-medium ${mono ? "font-mono text-xs" : ""}`}>{value}</div>
    </div>
  );
}
