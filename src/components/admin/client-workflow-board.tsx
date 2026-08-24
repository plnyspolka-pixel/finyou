// Tablica Kanban workflow klienta — od wejścia leada po fakturę.
// Wspólna dla panelu administratora (/admin/tablica) i operatora (/operator/tablica).
//
// Kafelki przesuwają się:
//  - automatycznie: kolumna wynika ze statusu wniosku (`loan_applications.status`,
//    aktualizowanego m.in. przez triggery auto-statusu w bazie) oraz z danych
//    dystrybucji/ofert; tablica odświeża się cyklicznie,
//  - ręcznie: drag & drop kafelka na kolumnę zapisuje odpowiadający jej status.
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  UserPlus,
  Users,
  Phone,
  FileText,
  FileWarning,
  Send,
  HandCoins,
  Landmark,
  Receipt,
  Mail,
  Paperclip,
  ExternalLink,
  RefreshCw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileThumb } from "@/components/media/FileThumb";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";
import { normalizeLoanStatus, loanStatusLabel, type LoanStatus } from "@/lib/loan-status";
import { formatPLNCompact, formatRelative, leadStatusLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Kolumny tablicy
// ---------------------------------------------------------------------------

type ColumnKey =
  | "lead"
  | "kontakt"
  | "wniosek"
  | "korekta"
  | "dystrybucja"
  | "oferty"
  | "akt"
  | "faktura";

const COLUMNS: {
  key: ColumnKey;
  label: string;
  icon: typeof UserPlus;
  accent: string;
  description: string;
}[] = [
  {
    key: "lead",
    label: "Lead",
    icon: UserPlus,
    accent: "border-t-sky-500",
    description:
      "Nowe leady i wnioski bez pełnych danych kontaktowych. Leady bez żadnych danych (ani nazwiska, ani telefonu, ani e-maila) są zwinięte w jeden zbiorczy kafelek.",
  },
  {
    key: "kontakt",
    label: "Kontakt",
    icon: Phone,
    accent: "border-t-cyan-500",
    description: "Trwa rozmowa z klientem.",
  },
  {
    key: "wniosek",
    label: "Wniosek",
    icon: FileText,
    accent: "border-t-amber-500",
    description: "Kompletowanie danych i dokumentów wniosku.",
  },
  {
    key: "korekta",
    label: "Korekta wniosku",
    icon: FileWarning,
    accent: "border-t-orange-500",
    description: "Wniosek wymaga uzupełnienia braków (kwota, KW, zdjęcia/dokumenty).",
  },
  {
    key: "dystrybucja",
    label: "Dystrybucja",
    icon: Send,
    accent: "border-t-violet-500",
    description: "Wniosek wysłany / gotowy do wysyłki do inwestorów.",
  },
  {
    key: "oferty",
    label: "Oferty inwestorów",
    icon: HandCoins,
    accent: "border-t-emerald-500",
    description: "Wpłynęły oferty od inwestorów — wypełnia się automatycznie.",
  },
  {
    key: "akt",
    label: "Akt notarialny",
    icon: Landmark,
    accent: "border-t-rose-500",
    description: "Warunki zaakceptowane, dokumenty, umowa i notariusz.",
  },
  {
    key: "faktura",
    label: "Faktura",
    icon: Receipt,
    accent: "border-t-slate-500",
    description: "Sprawa zamknięta — rozliczenie i faktura.",
  },
];

const COLUMN_LABELS = Object.fromEntries(COLUMNS.map((c) => [c.key, c.label])) as Record<
  ColumnKey,
  string
>;

// ---------------------------------------------------------------------------
// Typy danych
// ---------------------------------------------------------------------------

type AppRow = {
  id: string;
  status: string | null;
  loan_amount: number | null;
  completeness_percent: number | null;
  source: string | null;
  created_at: string;
  updated_at: string;
  client: {
    id: string;
    user_id: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  properties: { id: string; land_register_number: string | null; photos: string[] | null }[];
};

type LeadRow = {
  id: string;
  status: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone_raw: string | null;
  phone_normalized: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
};

type DocRow = {
  id: string;
  loan_application_id: string | null;
  document_type: string;
  file_name: string;
  file_path: string | null;
  thumbnail_path: string | null;
  status: string | null;
};

type DistRow = { loan_application_id: string; distribution_status: string };
type OfferRow = { loan_application_id: string; offer_status: string; proposed_amount: number };
type InvoiceRow = {
  buyer_user_id: string | null;
  invoice_number: string | null;
  gross_amount: number;
  status: string;
};

type BoardData = {
  apps: AppRow[];
  leads: LeadRow[];
  docsByApp: Map<string, DocRow[]>;
  distByApp: Map<string, DistRow[]>;
  offersByApp: Map<string, OfferRow[]>;
  invoicesByUser: Map<string, InvoiceRow[]>;
};

// ---------------------------------------------------------------------------
// Przypisanie kafelka do kolumny (ruch automatyczny)
// ---------------------------------------------------------------------------

/** Statusy dystrybucji świadczące o tym, że wysyłka do inwestorów faktycznie ruszyła. */
const DIST_SENT = new Set([
  "wyslane",
  "otworzone",
  "odpowiedz_otrzymana",
  "prosba_o_dodatkowe_informacje",
  "oferta_otrzymana",
  "brak_odpowiedzi",
]);

function columnForApp(app: AppRow, offers: OfferRow[]): ColumnKey {
  const s = normalizeLoanStatus(app.status);
  switch (s) {
    case "zamkniete":
      return "faktura";
    case "notariusz":
    case "dokumenty_przygotowanie_umowy":
    case "warunki_zaakceptowane":
      return "akt";
    case "szukamy_inwestora":
      // Oferta od inwestora (poza szkicem) przenosi kafelek automatycznie do „Ofert".
      return offers.some((o) => o.offer_status !== "szkic") ? "oferty" : "dystrybucja";
    case "kompletowanie_danych":
      return "wniosek";
    case "brak_kwoty":
    case "brak_kw":
    case "brak_zdjec_dokumentow":
      return "korekta";
    case "kontakt":
      return "kontakt";
    case "nowy_lead":
    case "brak_kontaktu":
    default:
      return "lead";
  }
}

function columnForLead(lead: LeadRow): ColumnKey {
  return lead.status === "w_kontakcie" || lead.status === "rozmowa" ? "kontakt" : "lead";
}

// ---------------------------------------------------------------------------
// Leady/wnioski „anonimowe" — bez nazwiska, telefonu i e-maila.
// Pojedynczo są nieodróżnialne i zalewają kolumnę „Lead", więc na tablicy
// zwijamy je w jeden zbiorczy kafelek (z możliwością rozwinięcia).
// ---------------------------------------------------------------------------

function leadHasContactData(lead: LeadRow): boolean {
  return !!(
    `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() ||
    (lead.email ?? "").trim() ||
    (lead.phone_raw ?? "").trim() ||
    (lead.phone_normalized ?? "").trim()
  );
}

function appHasContactData(app: AppRow): boolean {
  const c = app.client;
  return !!(
    `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim() ||
    (c?.email ?? "").trim() ||
    (c?.phone ?? "").trim()
  );
}

/** Status wniosku zapisywany po ręcznym upuszczeniu kafelka na kolumnę. */
function dropStatusForColumn(col: ColumnKey, app: AppRow): LoanStatus {
  switch (col) {
    case "lead":
      return "nowy_lead";
    case "kontakt":
      return "kontakt";
    case "wniosek":
      return "kompletowanie_danych";
    case "korekta": {
      if (!app.loan_amount) return "brak_kwoty";
      const hasKw = app.properties?.some((p) => (p.land_register_number ?? "").trim().length > 0);
      if (!hasKw) return "brak_kw";
      return "brak_zdjec_dokumentow";
    }
    case "dystrybucja":
    case "oferty":
      return "szukamy_inwestora";
    case "akt":
      return "dokumenty_przygotowanie_umowy";
    case "faktura":
      return "zamkniete";
  }
}

// ---------------------------------------------------------------------------
// Pobieranie danych
// ---------------------------------------------------------------------------

async function fetchBoard(): Promise<BoardData> {
  const { data: appsRaw, error: appsError } = await supabase
    .from("loan_applications")
    .select(
      "id,status,loan_amount,completeness_percent,source,created_at,updated_at,client:clients(id,user_id,first_name,last_name,email,phone),properties(id,land_register_number,photos)",
    )
    .is("merged_into_id", null)
    .is("archived_at", null)
    .neq("status", "archiwalny")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (appsError) throw appsError;
  const apps = (appsRaw ?? []) as unknown as AppRow[];

  // Leady bez wniosku — początek lejka (kolumny Lead / Kontakt).
  const { data: leadsRaw } = await supabase
    .from("leads")
    .select(
      "id,status,first_name,last_name,email,phone_raw,phone_normalized,source,created_at,updated_at",
    )
    .is("loan_application_id", null)
    .in("status", ["nowy", "w_kontakcie", "rozmowa"])
    .order("updated_at", { ascending: false })
    .limit(300);
  const leads = (leadsRaw ?? []) as LeadRow[];

  const appIds = apps.map((a) => a.id);
  const userIds = Array.from(
    new Set(apps.map((a) => a.client?.user_id).filter((x): x is string => !!x)),
  );

  const [docsRes, distRes, offersRes, invoicesRes] = await Promise.all([
    appIds.length
      ? supabase
          .from("documents")
          .select("id,loan_application_id,document_type,file_name,file_path,thumbnail_path,status")
          .in("loan_application_id", appIds)
      : Promise.resolve({ data: [] as DocRow[] }),
    appIds.length
      ? supabase
          .from("offer_distributions")
          .select("loan_application_id,distribution_status")
          .in("loan_application_id", appIds)
      : Promise.resolve({ data: [] as DistRow[] }),
    appIds.length
      ? supabase
          .from("investor_offers")
          .select("loan_application_id,offer_status,proposed_amount")
          .in("loan_application_id", appIds)
      : Promise.resolve({ data: [] as OfferRow[] }),
    userIds.length
      ? supabase
          .from("sales_invoices")
          .select("buyer_user_id,invoice_number,gross_amount,status")
          .in("buyer_user_id", userIds)
      : Promise.resolve({ data: [] as InvoiceRow[] }),
  ]);

  const docsByApp = new Map<string, DocRow[]>();
  for (const d of (docsRes.data ?? []) as DocRow[]) {
    // Filtr po stronie klienta — `.neq("status", …)` w PostgREST pomijałby wiersze z NULL-em.
    if (!d.loan_application_id || d.status === "usuniety") continue;
    const list = docsByApp.get(d.loan_application_id) ?? [];
    list.push(d);
    docsByApp.set(d.loan_application_id, list);
  }
  const distByApp = new Map<string, DistRow[]>();
  for (const d of (distRes.data ?? []) as DistRow[]) {
    const list = distByApp.get(d.loan_application_id) ?? [];
    list.push(d);
    distByApp.set(d.loan_application_id, list);
  }
  const offersByApp = new Map<string, OfferRow[]>();
  for (const o of (offersRes.data ?? []) as OfferRow[]) {
    const list = offersByApp.get(o.loan_application_id) ?? [];
    list.push(o);
    offersByApp.set(o.loan_application_id, list);
  }
  const invoicesByUser = new Map<string, InvoiceRow[]>();
  for (const f of (invoicesRes.data ?? []) as InvoiceRow[]) {
    if (!f.buyer_user_id) continue;
    const list = invoicesByUser.get(f.buyer_user_id) ?? [];
    list.push(f);
    invoicesByUser.set(f.buyer_user_id, list);
  }

  return { apps, leads, docsByApp, distByApp, offersByApp, invoicesByUser };
}

// ---------------------------------------------------------------------------
// Pliki klienta — podpisywanie ścieżek (bucket `pliki-klienta` + legacy)
// ---------------------------------------------------------------------------

async function openSignedFile(path: string) {
  for (const bucket of [CLIENT_FILES_BUCKET, "documents", "property-photos"]) {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank", "noopener");
      return;
    }
  }
  toast.error("Nie udało się otworzyć pliku.");
}

type CardFile = { path: string; name: string; thumbnailPath?: string | null };

function filesForApp(app: AppRow, docs: DocRow[]): CardFile[] {
  const fromDocs: CardFile[] = docs
    .filter((d) => !!d.file_path)
    .map((d) => ({ path: d.file_path!, name: d.file_name, thumbnailPath: d.thumbnail_path }));
  const fromPhotos: CardFile[] = (app.properties ?? [])
    .flatMap((p) => p.photos ?? [])
    .map((path) => ({ path, name: path.split("/").pop() ?? "zdjęcie" }));
  // Zdjęcia nieruchomości bywają zdublowane w `documents` — deduplikacja po ścieżce.
  const seen = new Set<string>();
  return [...fromDocs, ...fromPhotos].filter((f) => {
    if (seen.has(f.path)) return false;
    seen.add(f.path);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Drag & drop (natywne HTML5 — bez dodatkowych zależności)
// ---------------------------------------------------------------------------

type DragPayload = { kind: "app" | "lead"; id: string };

const DRAG_MIME = "application/x-finyou-board-card";

// ---------------------------------------------------------------------------
// Komponent tablicy
// ---------------------------------------------------------------------------

export function ClientWorkflowBoard({
  wniosekDetailTo = "/admin/wnioski/$id",
  leadDetailTo = "/admin/klienci/$id",
}: {
  wniosekDetailTo?: "/admin/wnioski/$id" | "/operator/wnioski/$id";
  leadDetailTo?: "/admin/klienci/$id" | "/operator/leady/$id";
} = {}) {
  const [search, setSearch] = useState("");
  const [showAnonymous, setShowAnonymous] = useState(false);
  const [dragOver, setDragOver] = useState<ColumnKey | null>(null);
  const [moving, setMoving] = useState<Record<string, ColumnKey>>({});
  const [filesDialog, setFilesDialog] = useState<{ title: string; files: CardFile[] } | null>(null);

  const query = useQuery({
    queryKey: ["client-workflow-board"],
    queryFn: fetchBoard,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
  const data = query.data;

  const filtered = useMemo(() => {
    if (!data) return null;
    const q = search.trim().toLowerCase();
    if (!q) return data;
    const matches = (...vals: (string | null | undefined)[]) =>
      vals.some((v) => (v ?? "").toLowerCase().includes(q));
    return {
      ...data,
      apps: data.apps.filter((a) =>
        matches(
          a.client?.first_name,
          a.client?.last_name,
          `${a.client?.first_name ?? ""} ${a.client?.last_name ?? ""}`,
          a.client?.email,
          a.client?.phone,
          a.source,
        ),
      ),
      leads: data.leads.filter((l) =>
        matches(
          l.first_name,
          l.last_name,
          `${l.first_name ?? ""} ${l.last_name ?? ""}`,
          l.email,
          l.phone_raw,
          l.phone_normalized,
          l.source,
        ),
      ),
    };
  }, [data, search]);

  const board = useMemo(() => {
    const cols = new Map<ColumnKey, { apps: AppRow[]; leads: LeadRow[] }>(
      COLUMNS.map((c) => [c.key, { apps: [], leads: [] }]),
    );
    if (!filtered) return cols;
    for (const app of filtered.apps) {
      const col = moving[app.id] ?? columnForApp(app, filtered.offersByApp.get(app.id) ?? []);
      cols.get(col)!.apps.push(app);
    }
    for (const lead of filtered.leads) {
      const col = moving[lead.id] ?? columnForLead(lead);
      cols.get(col)!.leads.push(lead);
    }
    return cols;
  }, [filtered, moving]);

  const moveApp = async (app: AppRow, col: ColumnKey) => {
    const offers = data?.offersByApp.get(app.id) ?? [];
    // Upuszczenie na tę samą kolumnę nie zmienia statusu (np. warunki_zaakceptowane
    // w „Akcie notarialnym” zostaje bez zmian).
    if (columnForApp(app, offers) === col) return;
    const target = dropStatusForColumn(col, app);
    const current = normalizeLoanStatus(app.status);
    if (col === "oferty" && !offers.some((o) => o.offer_status !== "szkic")) {
      toast.info(
        "Kolumna „Oferty inwestorów” wypełnia się automatycznie po wpłynięciu oferty — do tego czasu kafelek pozostanie w „Dystrybucji”.",
      );
    }
    if (target === current) return;
    setMoving((m) => ({ ...m, [app.id]: col }));
    const { error } = await supabase
      .from("loan_applications")
      .update({ status: target })
      .eq("id", app.id);
    if (error) {
      toast.error(`Nie udało się przenieść kafelka: ${error.message}`);
    } else {
      const name = clientName(app);
      toast.success(`${name} → ${COLUMN_LABELS[col]} (status: ${loanStatusLabel(target)})`);
    }
    await query.refetch();
    setMoving((m) => {
      const { [app.id]: _, ...rest } = m;
      return rest;
    });
  };

  const moveLead = async (lead: LeadRow, col: ColumnKey) => {
    if (col !== "lead" && col !== "kontakt") {
      toast.error(
        "Ten kafelek to lead bez wniosku — najpierw utwórz wniosek, aby przesunąć go dalej.",
      );
      return;
    }
    const target = col === "lead" ? "nowy" : "w_kontakcie";
    if (lead.status === target) return;
    setMoving((m) => ({ ...m, [lead.id]: col }));
    const { error } = await supabase.from("leads").update({ status: target }).eq("id", lead.id);
    if (error) {
      toast.error(`Nie udało się przenieść leada: ${error.message}`);
    } else {
      toast.success(
        `${leadName(lead)} → ${COLUMN_LABELS[col]} (status: ${leadStatusLabels[target]})`,
      );
    }
    await query.refetch();
    setMoving((m) => {
      const { [lead.id]: _, ...rest } = m;
      return rest;
    });
  };

  const onDrop = (col: ColumnKey) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (!raw || !data) return;
    const payload = JSON.parse(raw) as DragPayload;
    if (payload.kind === "app") {
      const app = data.apps.find((a) => a.id === payload.id);
      if (app) void moveApp(app, col);
    } else {
      const lead = data.leads.find((l) => l.id === payload.id);
      if (lead) void moveLead(lead, col);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tablica workflow klienta</h1>
          <p className="text-sm text-muted-foreground">
            Lead → kontakt → wniosek → korekta → dystrybucja → oferty → akt notarialny → faktura.
            Kafelki przesuwają się automatycznie wraz ze zmianą statusu (odświeżanie co 30 s) —
            możesz też przeciągać je ręcznie.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj: klient, telefon, e-mail…"
            className="w-64"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => void query.refetch()}
            title="Odśwież tablicę"
          >
            <RefreshCw className={cn("h-4 w-4", query.isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Ładowanie tablicy…</p>
      ) : query.isError ? (
        <p className="text-sm text-destructive">
          Nie udało się pobrać danych tablicy. Odśwież stronę lub spróbuj ponownie.
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-3">
          {COLUMNS.map((col) => {
            const bucket = board.get(col.key)!;
            const count = bucket.apps.length + bucket.leads.length;
            const Icon = col.icon;
            // Kolumna „Lead": kafelki bez jakichkolwiek danych kontaktowych zwijamy
            // w jeden zbiorczy — pojedynczo są nieodróżnialne i zagłuszają te,
            // z którymi faktycznie można pracować.
            const isLeadCol = col.key === "lead";
            const anonLeads = isLeadCol ? bucket.leads.filter((l) => !leadHasContactData(l)) : [];
            const anonApps = isLeadCol ? bucket.apps.filter((a) => !appHasContactData(a)) : [];
            const anonCount = anonLeads.length + anonApps.length;
            const visibleLeads = isLeadCol ? bucket.leads.filter(leadHasContactData) : bucket.leads;
            const visibleApps = isLeadCol ? bucket.apps.filter(appHasContactData) : bucket.apps;
            return (
              <div
                key={col.key}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(col.key);
                }}
                onDragLeave={() => setDragOver((d) => (d === col.key ? null : d))}
                onDrop={onDrop(col.key)}
                className={cn(
                  "flex w-72 shrink-0 flex-col rounded-xl border border-t-4 bg-muted/30",
                  col.accent,
                  dragOver === col.key && "ring-2 ring-primary/60 bg-accent/60",
                )}
              >
                <div className="flex items-center gap-2 px-3 py-2" title={col.description}>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">{col.label}</span>
                  <Badge
                    variant="secondary"
                    className="ml-auto"
                    title={
                      isLeadCol && anonCount > 0
                        ? `${count - anonCount} z danymi kontaktowymi + ${anonCount} bez danych`
                        : undefined
                    }
                  >
                    {isLeadCol && anonCount > 0 ? `${count - anonCount} + ${anonCount}` : count}
                  </Badge>
                </div>
                <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                  {visibleLeads.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      detailTo={leadDetailTo}
                      pending={!!moving[lead.id]}
                    />
                  ))}
                  {visibleApps.map((app) => (
                    <AppCard
                      key={app.id}
                      app={app}
                      column={col.key}
                      docs={filtered?.docsByApp.get(app.id) ?? []}
                      distributions={filtered?.distByApp.get(app.id) ?? []}
                      offers={filtered?.offersByApp.get(app.id) ?? []}
                      invoices={
                        app.client?.user_id
                          ? (filtered?.invoicesByUser.get(app.client.user_id) ?? [])
                          : []
                      }
                      detailTo={wniosekDetailTo}
                      pending={!!moving[app.id]}
                      onShowFiles={(files) =>
                        setFilesDialog({ title: `Pliki — ${clientName(app)}`, files })
                      }
                    />
                  ))}
                  {anonCount > 0 && (
                    <AnonymousLeadsSummary
                      count={anonCount}
                      newestAt={
                        [
                          ...anonLeads.map((l) => l.updated_at),
                          ...anonApps.map((a) => a.updated_at),
                        ]
                          .sort()
                          .at(-1) ?? null
                      }
                      expanded={showAnonymous}
                      onToggle={() => setShowAnonymous((v) => !v)}
                    />
                  )}
                  {showAnonymous &&
                    anonLeads.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        detailTo={leadDetailTo}
                        pending={!!moving[lead.id]}
                      />
                    ))}
                  {showAnonymous &&
                    anonApps.map((app) => (
                      <AppCard
                        key={app.id}
                        app={app}
                        column={col.key}
                        docs={filtered?.docsByApp.get(app.id) ?? []}
                        distributions={filtered?.distByApp.get(app.id) ?? []}
                        offers={filtered?.offersByApp.get(app.id) ?? []}
                        invoices={
                          app.client?.user_id
                            ? (filtered?.invoicesByUser.get(app.client.user_id) ?? [])
                            : []
                        }
                        detailTo={wniosekDetailTo}
                        pending={!!moving[app.id]}
                        onShowFiles={(files) =>
                          setFilesDialog({ title: `Pliki — ${clientName(app)}`, files })
                        }
                      />
                    ))}
                  {count === 0 && (
                    <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                      Przeciągnij tu kafelek
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!filesDialog} onOpenChange={(open) => !open && setFilesDialog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{filesDialog?.title}</DialogTitle>
          </DialogHeader>
          {filesDialog && filesDialog.files.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak plików klienta.</p>
          ) : (
            <div className="grid max-h-[60vh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
              {filesDialog?.files.map((f) => (
                <FileThumb
                  key={f.path}
                  path={f.path}
                  name={f.name}
                  thumbnailPath={f.thumbnailPath}
                  aspect="square"
                  showName
                  onClick={() => void openSignedFile(f.path)}
                />
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kafelki
// ---------------------------------------------------------------------------

function clientName(app: AppRow): string {
  const n = `${app.client?.first_name ?? ""} ${app.client?.last_name ?? ""}`.trim();
  return n || "Klient bez danych";
}

function leadName(lead: LeadRow): string {
  const n = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim();
  return n || "Lead bez danych";
}

function startDrag(payload: DragPayload) {
  return (e: React.DragEvent) => {
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "move";
  };
}

function CardShell({
  pending,
  onDragStart,
  className,
  children,
}: {
  pending: boolean;
  onDragStart: (e: React.DragEvent) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={cn(
        "cursor-grab rounded-lg border bg-background p-3 shadow-sm transition hover:shadow-md active:cursor-grabbing",
        pending && "pointer-events-none opacity-50",
        className,
      )}
    >
      {children}
    </div>
  );
}

function pluralLeady(count: number): string {
  if (count === 1) return "lead";
  const d = count % 10;
  const h = count % 100;
  return d >= 2 && d <= 4 && !(h >= 12 && h <= 14) ? "leady" : "leadów";
}

/**
 * Zbiorczy kafelek dla leadów bez jakichkolwiek danych kontaktowych.
 * Zamiast dziesiątek identycznych kart „Lead bez danych" pokazujemy licznik
 * z możliwością rozwinięcia pojedynczych kafelków (np. do ręcznego przeciągnięcia).
 */
function AnonymousLeadsSummary({
  count,
  newestAt,
  expanded,
  onToggle,
}: {
  count: number;
  newestAt: string | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="rounded-lg border border-dashed bg-muted/40 p-3 text-left transition hover:bg-muted/70"
      title="Leady bez nazwiska, telefonu i e-maila — kliknij, aby rozwinąć lub zwinąć pojedyncze kafelki"
    >
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium leading-tight">
          {count} {pluralLeady(count)} bez danych
        </span>
        <Chevron className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Bez nazwiska, telefonu i e-maila — nie da się z nimi pracować, dopóki dane nie spłyną.
      </p>
      {newestAt && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          ostatni: {formatRelative(newestAt)}
        </p>
      )}
    </button>
  );
}

function ContactLine({ phone, email }: { phone?: string | null; email?: string | null }) {
  return (
    <div className="space-y-0.5 text-xs text-muted-foreground">
      {phone && (
        <div className="flex items-center gap-1.5">
          <Phone className="h-3 w-3 shrink-0" />
          <a href={`tel:${phone}`} className="hover:underline">
            {phone}
          </a>
        </div>
      )}
      {email && (
        <div className="flex items-center gap-1.5">
          <Mail className="h-3 w-3 shrink-0" />
          <a href={`mailto:${email}`} className="truncate hover:underline">
            {email}
          </a>
        </div>
      )}
      {!phone && !email && <div>Brak danych kontaktowych</div>}
    </div>
  );
}

function LeadCard({
  lead,
  detailTo,
  pending,
}: {
  lead: LeadRow;
  detailTo: "/admin/klienci/$id" | "/operator/leady/$id";
  pending: boolean;
}) {
  return (
    <CardShell
      pending={pending}
      onDragStart={startDrag({ kind: "lead", id: lead.id })}
      className="border-l-4 border-l-sky-400 dark:border-l-sky-600"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-tight">{leadName(lead)}</span>
        <Link
          to={detailTo}
          params={{ id: lead.id }}
          className="text-muted-foreground hover:text-foreground"
          title="Otwórz kartę leada"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <Badge className="border-transparent bg-sky-100 text-[10px] text-sky-800 hover:bg-sky-100 dark:bg-sky-900/50 dark:text-sky-200">
          LEAD
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {leadStatusLabels[lead.status ?? ""] ?? lead.status ?? "?"}
        </Badge>
        {lead.source && (
          <Badge variant="secondary" className="text-[10px]">
            {lead.source}
          </Badge>
        )}
      </div>
      <div className="mt-2">
        <ContactLine phone={lead.phone_raw ?? lead.phone_normalized} email={lead.email} />
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground">
        {formatRelative(lead.updated_at)}
      </div>
    </CardShell>
  );
}

function AppCard({
  app,
  column,
  docs,
  distributions,
  offers,
  invoices,
  detailTo,
  pending,
  onShowFiles,
}: {
  app: AppRow;
  column: ColumnKey;
  docs: DocRow[];
  distributions: DistRow[];
  offers: OfferRow[];
  invoices: InvoiceRow[];
  detailTo: "/admin/wnioski/$id" | "/operator/wnioski/$id";
  pending: boolean;
  onShowFiles: (files: CardFile[]) => void;
}) {
  const files = useMemo(() => filesForApp(app, docs), [app, docs]);
  const sentCount = distributions.filter((d) => DIST_SENT.has(d.distribution_status)).length;
  const realOffers = offers.filter((o) => o.offer_status !== "szkic");
  const bestOffer = realOffers.reduce<number | null>(
    (max, o) =>
      o.proposed_amount != null && (max == null || o.proposed_amount > max)
        ? o.proposed_amount
        : max,
    null,
  );
  const invoice = invoices[0];
  // W kolumnach „Lead" i „Kontakt" obok leadów pojawiają się wnioski — oznaczamy
  // je wyraźnie, żeby typy kafelków dało się odróżnić na pierwszy rzut oka.
  const mixedColumn = column === "lead" || column === "kontakt";

  return (
    <CardShell
      pending={pending}
      onDragStart={startDrag({ kind: "app", id: app.id })}
      className={mixedColumn ? "border-l-4 border-l-amber-400 dark:border-l-amber-600" : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-tight">{clientName(app)}</span>
        <Link
          to={detailTo}
          params={{ id: app.id }}
          className="text-muted-foreground hover:text-foreground"
          title="Otwórz kartę wniosku"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1">
        {mixedColumn && (
          <Badge className="border-transparent bg-amber-100 text-[10px] text-amber-800 hover:bg-amber-100 dark:bg-amber-900/40 dark:text-amber-200">
            WNIOSEK
          </Badge>
        )}
        <Badge variant="outline" className="text-[10px]">
          {loanStatusLabel(app.status)}
        </Badge>
        {app.source && (
          <Badge variant="secondary" className="text-[10px]">
            {app.source}
          </Badge>
        )}
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{formatPLNCompact(app.loan_amount)}</span>
        {(column === "wniosek" || column === "korekta") && app.completeness_percent != null && (
          <span className="text-[11px] text-muted-foreground">
            kompletność {Math.round(app.completeness_percent)}%
          </span>
        )}
      </div>

      <div className="mt-2">
        <ContactLine phone={app.client?.phone} email={app.client?.email} />
      </div>

      {(column === "dystrybucja" || column === "oferty") && (
        <div className="mt-2 text-[11px] text-muted-foreground">
          {sentCount > 0 ? `Wysłano do ${sentCount} inwestorów` : "Jeszcze nie wysłano"}
          {realOffers.length > 0 && (
            <>
              {" · "}
              <span className="font-medium text-foreground">
                {realOffers.length} ofert
                {bestOffer != null ? ` (do ${formatPLNCompact(bestOffer)})` : ""}
              </span>
            </>
          )}
        </div>
      )}

      {column === "faktura" && (
        <div className="mt-2">
          {invoice ? (
            <Badge variant="secondary" className="text-[10px]">
              FV {invoice.invoice_number ?? "—"} · {formatPLNCompact(invoice.gross_amount)}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">
              Brak faktury
            </Badge>
          )}
        </div>
      )}

      {files.length > 0 && (
        <button
          type="button"
          onClick={() => onShowFiles(files)}
          className="mt-2 flex w-full items-center gap-1.5 text-left"
          title="Pokaż wszystkie pliki klienta"
        >
          <div className="flex gap-1">
            {files.slice(0, 3).map((f) => (
              <FileThumb
                key={f.path}
                path={f.path}
                name={f.name}
                thumbnailPath={f.thumbnailPath}
                aspect="square"
                className="h-10 w-10 pointer-events-none"
              />
            ))}
          </div>
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Paperclip className="h-3 w-3" />
            {files.length}
          </span>
        </button>
      )}

      <div className="mt-2 text-[11px] text-muted-foreground">{formatRelative(app.updated_at)}</div>
    </CardShell>
  );
}

export default ClientWorkflowBoard;
