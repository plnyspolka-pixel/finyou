import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Eye,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  RefreshCw,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { MediaPreviewDialog } from "@/components/admin/MediaPreviewDialog";
import { SourceIcon } from "@/components/admin/SourceIcon";
import { normalizeLoanStatus, LOAN_STATUS_SHORT_LABELS } from "@/lib/loan-status";
import { leadSourceLabel } from "@/lib/lead-source";
import { resolveShowablePhotoUrls } from "@/lib/property-photos";
import {
  evaluateApplicationCore,
  missingLabels,
  type CompletenessResult,
} from "@/lib/application-completeness";
import {
  inferAmountSource,
  inferKwSource,
  inferMediaSource,
  type EnrichmentContext,
  type FieldSource,
} from "@/lib/enrichment-source";

export const Route = createFileRoute("/admin/wnioski-niekompletne")({
  component: ApplicationsPage,
});

type Property = { id: string; land_register_number: string | null; photos: string[] | null };
type Row = {
  id: string;
  status: string;
  loan_amount: number | null;
  completeness_percent: number | null;
  current_form_step: number | null;
  created_at: string;
  updated_at: string;
  source: string | null;
  return_link: string | null;
  missing_fields: any;
  location_potential_score: number | null;
  location_confidence_score: number | null;
  location_analysis_priority: string | null;
  client: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    source?: string | null;
  } | null;
  properties: Property[] | null;
  docCount?: number;
};

const INCOMPLETE_STATUSES = [
  "nowy_lead",
  "brak_kontaktu",
  "brak_kw",
  "brak_zdjec_dokumentow",
  "kontakt",
  "kompletowanie_danych",
];
const COMPLETE_STATUSES = [
  "szukamy_inwestora",
  "warunki_zaakceptowane",
  "dokumenty_przygotowanie_umowy",
  "notariusz",
  "zamkniete",
];

// Ocena kompletności podstawowych danych wniosku — jedyne źródło prawdy w
// src/lib/application-completeness.ts (używane też przez panel klienta,
// marketplace inwestora i migrację czyszczącą dane).
function coreOf(r: Row): CompletenessResult {
  return evaluateApplicationCore({
    loan_amount: r.loan_amount,
    client: r.client,
    properties: r.properties ?? [],
    docCount: r.docCount ?? 0,
  });
}

function fmtPLN(n: number | null) {
  if (n == null) return "—";
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    maximumFractionDigits: 0,
  }).format(n);
}
function fmtDate(s: string) {
  return new Date(s).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

type SortKey =
  | "updated_at"
  | "created_at"
  | "loan_amount"
  | "name"
  | "status"
  | "media"
  | "kw"
  | "location";
type SortDir = "asc" | "desc";
type TabKey = "all" | "incomplete" | "complete" | "attention";

function MediaThumbs({
  photoPaths,
  docCount,
  onOpen,
}: {
  photoPaths: string[];
  docCount: number;
  onOpen: () => void;
}) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (photoPaths.length === 0) {
        setUrls([]);
        return;
      }
      // Podpisuj z fallbackiem bucketów (pliki-klienta → documents → property-photos)
      // i tylko faktyczne zdjęcia — inaczej pliki ze starych bucketów oraz skany
      // dokumentów renderują się jako puste kwadraty.
      const resolved = await resolveShowablePhotoUrls(photoPaths, 60 * 60);
      if (!cancelled) setUrls(resolved.slice(0, 3));
    })();
    return () => {
      cancelled = true;
    };
  }, [photoPaths.join("|")]);
  const total = photoPaths.length + docCount;
  if (total === 0)
    return (
      <button
        type="button"
        onClick={onOpen}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        <Badge variant="outline">brak</Badge>
      </button>
    );
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-1.5 group"
      title="Otwórz podgląd załączników"
    >
      <div className="flex items-center gap-1">
        {urls.map((u, i) => (
          <img
            key={i}
            src={u}
            alt=""
            className="h-12 w-12 rounded object-cover border group-hover:ring-2 group-hover:ring-primary transition"
            loading="lazy"
          />
        ))}
        {docCount > 0 && (
          <div className="h-12 w-12 rounded border bg-muted flex flex-col items-center justify-center group-hover:ring-2 group-hover:ring-primary transition">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-[10px] font-medium">{docCount}</span>
          </div>
        )}
      </div>
      <div className="flex flex-col text-[10px] text-muted-foreground leading-tight">
        <span>
          <ImageIcon className="h-3 w-3 inline" /> {photoPaths.length}
        </span>
        <span>
          <FileText className="h-3 w-3 inline" /> {docCount}
        </span>
      </div>
    </button>
  );
}

function SortHeader({
  label,
  k,
  sort,
  setSort,
  className,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; dir: SortDir };
  setSort: (s: { key: SortKey; dir: SortDir }) => void;
  className?: string;
}) {
  const active = sort.key === k;
  const Icon = !active ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground"
        onClick={() => setSort({ key: k, dir: active && sort.dir === "desc" ? "asc" : "desc" })}
      >
        {label} <Icon className="h-3 w-3" />
      </button>
    </TableHead>
  );
}

const LOC_PRIORITY_META: Record<string, { label: string; cls: string }> = {
  AUTO_ANALYZE_HIGH: {
    label: "wysoki",
    cls: "border-emerald-400 text-emerald-700 dark:border-emerald-500/60 dark:text-emerald-400",
  },
  AUTO_ANALYZE_STANDARD: {
    label: "standard",
    cls: "border-lime-400 text-lime-700 dark:border-lime-500/60 dark:text-lime-400",
  },
  LIGHT_LOCATION_CHECK: {
    label: "lekki",
    cls: "border-amber-300 text-amber-700 dark:border-amber-500/50 dark:text-amber-400",
  },
  LOW_PRIORITY: { label: "niski", cls: "text-muted-foreground" },
  INVALID_KW: { label: "błąd KW", cls: "text-muted-foreground" },
  INSUFFICIENT_DATA: { label: "brak danych", cls: "text-muted-foreground" },
};

function LocationCell({
  score,
  confidence,
  priority,
}: {
  score: number | null;
  confidence: number | null;
  priority: string | null;
}) {
  if (score == null && !priority) {
    return <span className="text-muted-foreground">—</span>;
  }
  const meta = priority ? LOC_PRIORITY_META[priority] : null;
  const lowConf = confidence != null && confidence < 50;
  const scoreCls =
    score == null
      ? ""
      : score >= 75
        ? "text-emerald-600 dark:text-emerald-400"
        : score >= 60
          ? "text-lime-600 dark:text-lime-400"
          : score >= 40
            ? "text-amber-600 dark:text-amber-400"
            : "text-muted-foreground";
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <span className={`font-semibold tabular-nums ${scoreCls}`}>{score ?? "—"}</span>
        {lowConf && (
          <span title={`Niska pewność (${confidence}%)`} className="text-amber-500">
            <AlertTriangle className="h-3 w-3" />
          </span>
        )}
      </div>
      {meta && (
        <Badge variant="outline" className={`text-[10px] px-1 py-0 font-normal w-fit ${meta.cls}`}>
          {meta.label}
        </Badge>
      )}
    </div>
  );
}

// Wspólne dane pochodne wiersza — używane przez widok tabeli (desktop)
// i widok kart (mobile), żeby nie duplikować logiki źródeł/kompletności.
// Źródło danych POGŁĘBIONYCH (kwota, KW, zdjęcia) obliczane per pole na
// podstawie faktów z bazy: dokumenty z Messengera, maile z załącznikami,
// EKW, uploader z panelu itd. Meta Lead Ads nie może dostarczyć tych pól,
// więc ikonka pokazuje PRAWDZIWE źródło (np. Messenger, mail, ręcznie).
function deriveRow(r: Row, ctx: EnrichmentContext) {
  const name = [r.client?.first_name, r.client?.last_name].filter(Boolean).join(" ") || "—";
  const kwNums = (r.properties ?? [])
    .map((p) => p.land_register_number)
    .filter((x): x is string => !!x && x.trim().length > 0);
  const allPhotos = (r.properties ?? []).flatMap((p) => (Array.isArray(p.photos) ? p.photos : []));
  const canonStatus = normalizeLoanStatus(r.status);
  const isComplete = COMPLETE_STATUSES.includes(canonStatus);
  const core = coreOf(r);
  const needsFix = isComplete && !core.complete;
  const appSource = r.source;
  const clientSource = r.client?.source ?? appSource;
  const clientId = r.client?.id ?? null;
  const amountSrc: FieldSource | null = inferAmountSource(
    r.id,
    r.loan_amount,
    appSource,
    clientId,
    ctx,
  );
  const mediaSrc: FieldSource | null = inferMediaSource(
    r.id,
    allPhotos.length + (r.docCount ?? 0) > 0,
    appSource,
    ctx,
  );
  return {
    name,
    kwNums,
    allPhotos,
    canonStatus,
    isComplete,
    core,
    needsFix,
    appSource,
    clientSource,
    clientId,
    amountSrc,
    mediaSrc,
  };
}

type DerivedRow = ReturnType<typeof deriveRow>;

function StatusBadge({ d }: { d: DerivedRow }) {
  return (
    <Badge
      variant={
        d.needsFix
          ? "outline"
          : d.isComplete
            ? "default"
            : d.canonStatus === "nowy_lead"
              ? "secondary"
              : "outline"
      }
      className={`whitespace-normal text-[11px] leading-tight ${d.needsFix ? "border-amber-400 text-amber-700 dark:border-amber-500/60 dark:text-amber-400" : ""}`}
    >
      {d.needsFix && <AlertTriangle className="h-3 w-3 mr-1 inline shrink-0" />}
      {LOAN_STATUS_SHORT_LABELS[d.canonStatus]}
    </Badge>
  );
}

// Współdzielony z panelem operatora (/operator/wnioski) — detailTo wskazuje
// trasę szczegółów wniosku właściwą dla danego panelu.
export function ApplicationsPage({
  detailTo = "/admin/wnioski/$id",
}: {
  detailTo?: "/admin/wnioski/$id" | "/operator/wnioski/$id";
} = {}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [ctx, setCtx] = useState<EnrichmentContext>(() => ({
    docsByLoan: new Map(),
    autoKwSet: new Set(),
    commsByClient: new Map(),
    leadsByClient: new Map(),
    nameByUser: new Map(),
    operatorByLoan: new Map(),
  }));
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<TabKey>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "updated_at",
    dir: "desc",
  });
  const [locFilter, setLocFilter] = useState<"all" | "high" | "standard" | "low_conf">("all");
  const [preview, setPreview] = useState<{ id: string; paths: string[]; name: string } | null>(
    null,
  );

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("loan_applications")
      .select(
        "id,status,loan_amount,completeness_percent,current_form_step,created_at,updated_at,source,return_link,missing_fields,location_potential_score,location_confidence_score,location_analysis_priority,merged_into_id,archived_at,assigned_operator,client:clients(id,first_name,last_name,email,phone,source),properties(id,land_register_number,photos)",
      )
      .is("merged_into_id", null)
      .is("archived_at", null)
      .neq("status", "archiwalny")
      .neq("status", "zamkniete")
      .order("updated_at", { ascending: false })
      .limit(1000);
    if (!error && data) {
      const list = data as any as Row[];
      const ids = list.map((r) => r.id);
      const clientIds = Array.from(
        new Set(list.map((r) => r.client?.id).filter((x): x is string => !!x)),
      );
      const kwNums = Array.from(
        new Set(
          list.flatMap((r) =>
            (r.properties ?? [])
              .map((p) => p.land_register_number)
              .filter((x): x is string => !!x && x.trim().length > 0),
          ),
        ),
      );

      const docsByLoan = new Map<
        string,
        { loan_application_id: string; document_type: string | null; uploaded_by: string | null }[]
      >();
      const commsByClient = new Map<
        string,
        {
          lead_id: string;
          channel: string | null;
          direction: string | null;
          content: string | null;
        }[]
      >();
      const leadsByClient = new Map<string, string[]>();
      const autoKwSet = new Set<string>();
      const nameByUser = new Map<string, string>();
      const operatorByLoan = new Map<string, string | null>();
      const docCounts: Record<string, number> = {};

      if (ids.length > 0) {
        const { data: docs } = await supabase
          .from("documents")
          .select("loan_application_id,document_type,uploaded_by")
          .in("loan_application_id", ids);
        for (const d of (docs ?? []) as any[]) {
          if (!d.loan_application_id) continue;
          docCounts[d.loan_application_id] = (docCounts[d.loan_application_id] ?? 0) + 1;
          const arr = docsByLoan.get(d.loan_application_id) ?? [];
          arr.push(d);
          docsByLoan.set(d.loan_application_id, arr);
        }
      }
      for (const r of list) {
        r.docCount = docCounts[r.id] ?? 0;
        operatorByLoan.set(r.id, (r as any).assigned_operator ?? null);
      }

      // Leady dla klientów (żeby zebrać wiadomości)
      const leadIds: string[] = [];
      if (clientIds.length > 0) {
        const { data: leads } = await supabase
          .from("leads")
          .select("id,client_id")
          .in("client_id", clientIds);
        for (const l of (leads ?? []) as { id: string; client_id: string | null }[]) {
          if (!l.client_id) continue;
          const arr = leadsByClient.get(l.client_id) ?? [];
          arr.push(l.id);
          leadsByClient.set(l.client_id, arr);
          leadIds.push(l.id);
        }
      }

      if (leadIds.length > 0) {
        const { data: comms } = await supabase
          .from("lead_communications")
          .select("lead_id,channel,direction,content")
          .in("lead_id", leadIds)
          .limit(5000);
        const leadToClient = new Map<string, string>();
        for (const [cid, ls] of leadsByClient.entries())
          for (const l of ls) leadToClient.set(l, cid);
        for (const c of (comms ?? []) as any[]) {
          const cid = leadToClient.get(c.lead_id);
          if (!cid) continue;
          const arr = commsByClient.get(cid) ?? [];
          arr.push(c);
          commsByClient.set(cid, arr);
        }
      }

      if (kwNums.length > 0) {
        const { data: kws } = await supabase
          .from("kw_documents")
          .select("kw_number,status")
          .in("kw_number", kwNums);
        for (const k of (kws ?? []) as { kw_number: string; status: string | null }[]) {
          if (k.status && ["fetched", "completed", "success", "ok"].includes(k.status)) {
            autoKwSet.add(k.kw_number);
          } else if (!k.status) {
            autoKwSet.add(k.kw_number);
          }
        }
      }

      const userIds = new Set<string>();
      for (const arr of docsByLoan.values())
        for (const d of arr) if (d.uploaded_by) userIds.add(d.uploaded_by);
      for (const op of operatorByLoan.values()) if (op) userIds.add(op);
      const panelByUser = new Map<string, string>();
      if (userIds.size > 0) {
        const ids = Array.from(userIds);
        const [{ data: profs }, { data: roles }] = await Promise.all([
          supabase.from("profiles").select("id,first_name,last_name,email").in("id", ids),
          supabase.from("user_roles").select("user_id,role").in("user_id", ids),
        ]);
        for (const p of (profs ?? []) as any[]) {
          const name =
            [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email || "Pracownik";
          nameByUser.set(p.id, name);
        }
        // Priorytet paneli: admin > operator > posrednik > inwestor > klient
        const priority: Record<string, number> = {
          admin: 5,
          operator: 4,
          posrednik: 3,
          inwestor: 2,
          klient: 1,
        };
        const label: Record<string, string> = {
          admin: "Administrator",
          operator: "Operator",
          posrednik: "Pośrednik",
          inwestor: "Inwestor",
          klient: "Klient",
        };
        const best = new Map<string, string>();
        for (const r of (roles ?? []) as any[]) {
          const cur = best.get(r.user_id);
          if (!cur || (priority[r.role] ?? 0) > (priority[cur] ?? 0)) best.set(r.user_id, r.role);
        }
        for (const [uid, role] of best) panelByUser.set(uid, label[role] ?? role);
      }

      // Auto-promocja (bez zmian)
      const toPromote = list.filter((r) => {
        if (!INCOMPLETE_STATUSES.includes(normalizeLoanStatus(r.status))) return false;
        return coreOf(r).complete;
      });
      if (toPromote.length > 0) {
        await supabase
          .from("loan_applications")
          .update({
            status: "szukamy_inwestora",
            available_to_investors: true,
            completeness_percent: 100,
            updated_at: new Date().toISOString(),
          })
          .in(
            "id",
            toPromote.map((r) => r.id),
          );
        for (const p of toPromote) {
          const r = list.find((x) => x.id === p.id);
          if (r) {
            r.status = "szukamy_inwestora";
            r.completeness_percent = 100;
          }
        }
      }
      setRows(list);
      setCtx({
        docsByLoan,
        autoKwSet,
        commsByClient,
        leadsByClient,
        nameByUser,
        panelByUser,
        operatorByLoan,
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  // Wniosek = coś więcej niż same dane leada (imię/nazwisko/email/telefon).
  // Wystarczy kwota pożyczki, jakakolwiek nieruchomość (KW lub zdjęcia) albo dokument.
  const isApplication = (r: Row) => {
    if (r.loan_amount != null) return true;
    if ((r.docCount ?? 0) > 0) return true;
    for (const p of r.properties ?? []) {
      if (p.land_register_number && p.land_register_number.trim().length > 0) return true;
      if (Array.isArray(p.photos) && p.photos.length > 0) return true;
    }
    return false;
  };

  const applications = useMemo(() => rows.filter(isApplication), [rows]);

  // Klasyfikacja wg DANYCH, nie tylko statusu:
  //  - "complete"   — status kompletny I komplet podstawowych danych,
  //  - "attention"  — status kompletny, ale BRAKUJE danych (do korekty),
  //  - "incomplete" — wniosek jeszcze w kompletowaniu.
  const classify = (r: Row): "complete" | "attention" | "incomplete" => {
    if (COMPLETE_STATUSES.includes(normalizeLoanStatus(r.status))) {
      return coreOf(r).complete ? "complete" : "attention";
    }
    return "incomplete";
  };

  const counts = useMemo(() => {
    const c = { all: applications.length, incomplete: 0, complete: 0, attention: 0 };
    for (const r of applications) c[classify(r)]++;
    return c;
  }, [applications]);

  // Cofnij wniosek do kompletowania danych (zdejmij flagę dopuszczenia do inwestorów).
  const demote = async (ids: string[]) => {
    if (ids.length === 0) return;
    const { error } = await supabase
      .from("loan_applications")
      .update({
        status: "kompletowanie_danych",
        available_to_investors: false,
        completeness_percent: 0,
        updated_at: new Date().toISOString(),
      })
      .in("id", ids);
    if (error) {
      toast.error("Nie udało się cofnąć wniosku", { description: error.message });
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        ids.includes(r.id) ? { ...r, status: "kompletowanie_danych", completeness_percent: 0 } : r,
      ),
    );
    toast.success(
      ids.length === 1
        ? "Wniosek cofnięty do kompletowania"
        : `Cofnięto ${ids.length} wniosków do kompletowania`,
    );
  };

  const filtered = useMemo(() => {
    const byTab = applications.filter((r) => {
      if (tab === "all") return true;
      return classify(r) === tab;
    });

    const byLoc = byTab.filter((r) => {
      if (locFilter === "all") return true;
      if (locFilter === "high") return r.location_analysis_priority === "AUTO_ANALYZE_HIGH";
      if (locFilter === "standard")
        return (
          r.location_analysis_priority === "AUTO_ANALYZE_HIGH" ||
          r.location_analysis_priority === "AUTO_ANALYZE_STANDARD"
        );
      // low_conf: wynik jest, ale pewność < 50.
      return r.location_confidence_score != null && r.location_confidence_score < 50;
    });

    const out = byLoc.filter((r) => {
      if (!q.trim()) return true;
      const s = q.toLowerCase();
      const c = r.client;
      return (
        (c?.first_name ?? "").toLowerCase().includes(s) ||
        (c?.last_name ?? "").toLowerCase().includes(s) ||
        (c?.email ?? "").toLowerCase().includes(s) ||
        (c?.phone ?? "").toLowerCase().includes(s) ||
        r.id.toLowerCase().includes(s)
      );
    });
    const getVal = (r: Row): string | number => {
      switch (sort.key) {
        case "name":
          return [r.client?.first_name, r.client?.last_name]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
        case "status":
          return normalizeLoanStatus(r.status);
        case "loan_amount":
          return r.loan_amount ?? -1;
        case "media":
          return (
            (r.properties ?? []).reduce(
              (s, p) => s + (Array.isArray(p.photos) ? p.photos.length : 0),
              0,
            ) + (r.docCount ?? 0)
          );
        case "kw":
          return (r.properties ?? []).filter((p) => !!p.land_register_number).length;
        case "location":
          return r.location_potential_score ?? -1;
        case "created_at":
          return new Date(r.created_at).getTime();
        case "updated_at":
        default:
          return new Date(r.updated_at).getTime();
      }
    };
    out.sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (va < vb) return sort.dir === "asc" ? -1 : 1;
      if (va > vb) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
    return out;
  }, [applications, q, sort, tab, locFilter]);

  // Przyciski akcji wiersza — identyczne w tabeli (desktop) i na karcie (mobile).
  const rowActions = (r: Row, d: DerivedRow) => (
    <div className="flex items-center justify-end gap-0.5">
      <Button
        size="sm"
        variant="ghost"
        className="h-8 w-8 p-0"
        onClick={() => setPreview({ id: r.id, paths: d.allPhotos, name: d.name })}
        title="Podgląd"
      >
        <Eye className="h-3.5 w-3.5" />
      </Button>
      <Button asChild size="sm" variant="ghost" className="h-8 px-2">
        <Link to={detailTo} params={{ id: r.id }}>
          Otwórz
        </Link>
      </Button>
      {d.needsFix && (
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-amber-700 hover:text-amber-800 hover:bg-amber-100 dark:text-amber-400 dark:hover:text-amber-300 dark:hover:bg-amber-500/10"
          onClick={() => void demote([r.id])}
          title="Cofnij do kompletowania danych"
        >
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
      )}
      {r.return_link && (
        <Button asChild size="sm" variant="ghost" className="h-8 w-8 p-0">
          <a href={r.return_link} target="_blank" rel="noreferrer" title="Link zwrotny">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Wnioski</h1>
          <p className="text-sm text-muted-foreground">
            Wniosek jest „kompletny" dopiero z kompletem podstawowych danych: imię i nazwisko,
            kontakt, kwota, poprawny numer KW oraz zdjęcia lub dokumenty. Braki widać w kolumnie
            „Braki”; sprawy oznaczone jako kompletne mimo braków trafiają do zakładki „Do korekty”.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Odśwież
        </Button>
      </div>

      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 space-y-0">
          <div className="flex items-center gap-3 flex-wrap">
            <CardTitle className="text-base">{filtered.length} wniosków</CardTitle>
            <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
              <TabsList>
                <TabsTrigger value="all">Wszystkie ({counts.all})</TabsTrigger>
                <TabsTrigger value="incomplete">Niekompletne ({counts.incomplete})</TabsTrigger>
                <TabsTrigger value="complete">Kompletne ({counts.complete})</TabsTrigger>
                <TabsTrigger
                  value="attention"
                  className={
                    counts.attention > 0
                      ? "text-amber-600 data-[state=active]:text-amber-700 dark:text-amber-400 dark:data-[state=active]:text-amber-300"
                      : undefined
                  }
                >
                  Do korekty ({counts.attention})
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {tab === "attention" && filtered.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="text-amber-700 border-amber-300 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-500/50 dark:hover:bg-amber-500/10"
                onClick={() => void demote(filtered.map((r) => r.id))}
              >
                <Undo2 className="h-4 w-4 mr-2" /> Cofnij wszystkie ({filtered.length}) do
                kompletowania
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              aria-label="Filtr potencjału lokalizacyjnego"
              value={locFilter}
              onChange={(e) => setLocFilter(e.target.value as typeof locFilter)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="all">Lokalizacja: wszystkie</option>
              <option value="high">Wysoki priorytet</option>
              <option value="standard">Wysoki + standard</option>
              <option value="low_conf">Niska pewność</option>
            </select>
            <Input
              placeholder="Szukaj: imię, nazwisko, e-mail, telefon, ID…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="max-w-xs"
            />
          </div>
        </CardHeader>
        <CardContent>
          {/* Mobile: karty zamiast tabeli — 10 kolumn nie mieści się na ekranie telefonu. */}
          <div className="md:hidden space-y-3">
            {loading && (
              <div className="py-8 text-center text-sm text-muted-foreground">Ładowanie…</div>
            )}
            {!loading && filtered.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">Brak wniosków.</div>
            )}
            {!loading &&
              filtered.map((r) => {
                const d = deriveRow(r, ctx);
                return (
                  <div
                    key={r.id}
                    className={`rounded-lg border p-3 space-y-2 ${d.needsFix ? "bg-amber-50/60 dark:bg-amber-500/10" : "bg-card"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 font-medium" title={d.name}>
                          <SourceIcon
                            source={d.clientSource}
                            title={`Imię i nazwisko — źródło: ${leadSourceLabel(d.clientSource)}`}
                          />
                          <span className="truncate">{d.name}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {leadSourceLabel(d.appSource)}
                          {r.current_form_step != null ? ` · krok ${r.current_form_step}` : ""}
                        </div>
                      </div>
                      <div className="shrink-0">
                        <StatusBadge d={d} />
                      </div>
                    </div>

                    <div className="text-xs space-y-0.5">
                      <div className="truncate" title={r.client?.email ?? ""}>
                        {r.client?.email ?? "—"}
                      </div>
                      <div className="text-muted-foreground truncate" title={r.client?.phone ?? ""}>
                        {r.client?.phone ?? "—"}
                      </div>
                    </div>

                    {d.core.complete ? (
                      <div className="text-[11px] text-emerald-600 dark:text-emerald-400">
                        komplet
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-0.5">
                        {missingLabels(d.core.missing).map((label) => (
                          <Badge
                            key={label}
                            variant="outline"
                            className="text-[10px] text-muted-foreground border-muted-foreground/30 px-1 py-0 font-normal"
                          >
                            {label}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums">
                        {d.amountSrc && (
                          <SourceIcon source={d.amountSrc.key} title={d.amountSrc.title} />
                        )}
                        {fmtPLN(r.loan_amount)}
                      </span>
                      <LocationCell
                        score={r.location_potential_score}
                        confidence={r.location_confidence_score}
                        priority={r.location_analysis_priority}
                      />
                    </div>

                    {d.kwNums.length > 0 && (
                      <div className="flex flex-col gap-0.5 text-xs">
                        {d.kwNums.map((k, i) => {
                          const s = inferKwSource(r.id, k, d.appSource, d.clientId, ctx);
                          return (
                            <span key={i} className="flex items-center gap-1 font-mono" title={k}>
                              {s && <SourceIcon source={s.key} title={s.title} />}
                              <span className="truncate">{k}</span>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    <div className="flex items-center gap-1">
                      {d.mediaSrc && (
                        <SourceIcon source={d.mediaSrc.key} title={d.mediaSrc.title} />
                      )}
                      <MediaThumbs
                        photoPaths={d.allPhotos}
                        docCount={r.docCount ?? 0}
                        onOpen={() => setPreview({ id: r.id, paths: d.allPhotos, name: d.name })}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t pt-2">
                      <span
                        className="text-[11px] text-muted-foreground"
                        title={`Utworzono: ${fmtDate(r.created_at)}`}
                      >
                        {fmtDate(r.updated_at)}
                      </span>
                      {rowActions(r, d)}
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Desktop: pełna tabela; min-w wymusza poziomy scroll zamiast miażdżenia
              kolumn, gdy kontener jest węższy (wrapper Table ma overflow-auto). */}
          <Table className="hidden md:table w-full table-fixed min-w-[1000px] text-sm [&_th]:text-xs">
            <TableHeader>
              <TableRow>
                <SortHeader
                  label="Klient"
                  k="name"
                  sort={sort}
                  setSort={setSort}
                  className="w-[17%]"
                />
                <TableHead className="w-[15%]">Kontakt</TableHead>
                <SortHeader
                  label="Status"
                  k="status"
                  sort={sort}
                  setSort={setSort}
                  className="w-[10%]"
                />
                <TableHead className="w-[13%]">Braki</TableHead>
                <SortHeader
                  label="Kwota"
                  k="loan_amount"
                  sort={sort}
                  setSort={setSort}
                  className="text-right w-[9%]"
                />
                <SortHeader label="KW" k="kw" sort={sort} setSort={setSort} className="w-[11%]" />
                <SortHeader
                  label="Lokalizacja"
                  k="location"
                  sort={sort}
                  setSort={setSort}
                  className="w-[11%]"
                />
                <SortHeader
                  label="Pliki"
                  k="media"
                  sort={sort}
                  setSort={setSort}
                  className="w-[8%]"
                />
                <SortHeader
                  label="Aktualizacja"
                  k="updated_at"
                  sort={sort}
                  setSort={setSort}
                  className="w-[8%]"
                />
                <TableHead className="text-right w-[6%]">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    Ładowanie…
                  </TableCell>
                </TableRow>
              )}
              {!loading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    Brak wniosków.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((r) => {
                const d = deriveRow(r, ctx);
                return (
                  <TableRow
                    key={r.id}
                    className={d.needsFix ? "bg-amber-50/60 dark:bg-amber-500/10" : undefined}
                  >
                    <TableCell className="font-medium align-top">
                      <div className="flex items-center gap-1 truncate" title={d.name}>
                        <SourceIcon
                          source={d.clientSource}
                          title={`Imię i nazwisko — źródło: ${leadSourceLabel(d.clientSource)}`}
                        />
                        <span className="truncate">{d.name}</span>
                      </div>
                      <div
                        className="text-[10px] text-muted-foreground truncate"
                        title={leadSourceLabel(d.appSource)}
                      >
                        {leadSourceLabel(d.appSource)}
                        {r.current_form_step != null ? ` · krok ${r.current_form_step}` : ""}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs align-top">
                      <div
                        className="flex items-center gap-1 truncate"
                        title={r.client?.email ?? ""}
                      >
                        {r.client?.email && (
                          <SourceIcon
                            source={d.clientSource}
                            title={`E-mail — źródło: ${leadSourceLabel(d.clientSource)}`}
                          />
                        )}
                        <span className="truncate">{r.client?.email ?? "—"}</span>
                      </div>
                      <div
                        className="flex items-center gap-1 text-muted-foreground truncate"
                        title={r.client?.phone ?? ""}
                      >
                        {r.client?.phone && (
                          <SourceIcon
                            source={d.clientSource}
                            title={`Telefon — źródło: ${leadSourceLabel(d.clientSource)}`}
                          />
                        )}
                        <span className="truncate">{r.client?.phone ?? "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <StatusBadge d={d} />
                    </TableCell>
                    <TableCell className="align-top">
                      {d.core.complete ? (
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
                          komplet
                        </span>
                      ) : (
                        <div className="flex flex-wrap gap-0.5">
                          {missingLabels(d.core.missing).map((label) => (
                            <Badge
                              key={label}
                              variant="outline"
                              className="text-[10px] text-muted-foreground border-muted-foreground/30 px-1 py-0 font-normal"
                            >
                              {label}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums align-top">
                      <div className="inline-flex items-center gap-1">
                        {d.amountSrc && (
                          <SourceIcon source={d.amountSrc.key} title={d.amountSrc.title} />
                        )}
                        <span>{fmtPLN(r.loan_amount)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs align-top">
                      {d.kwNums.length === 0 ? (
                        <Badge variant="outline" className="text-muted-foreground">
                          brak
                        </Badge>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          {d.kwNums.map((k, i) => {
                            const s = inferKwSource(r.id, k, d.appSource, d.clientId, ctx);
                            return (
                              <span
                                key={i}
                                className="flex items-center gap-1 font-mono truncate"
                                title={k}
                              >
                                {s && <SourceIcon source={s.key} title={s.title} />}
                                <span className="truncate">{k}</span>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs align-top">
                      <LocationCell
                        score={r.location_potential_score}
                        confidence={r.location_confidence_score}
                        priority={r.location_analysis_priority}
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex items-center gap-1">
                        {d.mediaSrc && (
                          <SourceIcon source={d.mediaSrc.key} title={d.mediaSrc.title} />
                        )}
                        <MediaThumbs
                          photoPaths={d.allPhotos}
                          docCount={r.docCount ?? 0}
                          onOpen={() => setPreview({ id: r.id, paths: d.allPhotos, name: d.name })}
                        />
                      </div>
                    </TableCell>
                    <TableCell
                      className="text-xs align-top"
                      title={`Utworzono: ${fmtDate(r.created_at)}`}
                    >
                      {fmtDate(r.updated_at)}
                    </TableCell>
                    <TableCell className="text-right align-top">{rowActions(r, d)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {preview && (
        <MediaPreviewDialog
          open={!!preview}
          onOpenChange={(v) => !v && setPreview(null)}
          loanApplicationId={preview.id}
          photoPaths={preview.paths}
          title={`Podgląd — ${preview.name}`}
        />
      )}
    </div>
  );
}
