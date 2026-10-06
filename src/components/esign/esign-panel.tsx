// Panel nadawcy podpisu dokumentowego — wspólny dla /admin, /operator
// i /inwestor: lista kopert, kreator (PDF + podpisujący), szczegóły
// (podpisujący, tożsamość, historia), akcje (wyślij, przypomnij, anuluj,
// rozstrzygnij niezgodność) oraz „Do podpisu” dla zalogowanego podpisującego.
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Ban,
  Building2,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  cancelEnvelope,
  createEnvelope,
  getEnvelopeDetails,
  getEnvelopeFileUrl,
  getEsignOwnerContext,
  listMyEnvelopes,
  openMySigningLink,
  resendSignerLink,
  resolveIdentityMismatch,
  searchSignerCandidates,
  searchSignerClients,
  listClientDocuments,
  sendEnvelope,
  type CreateEnvelopeInput,
} from "@/lib/esign/esign-owner.functions";
import {
  capacityShort,
  describeIdentity,
  ENVELOPE_STATUS_LABELS,
  eventLabel,
  formatSignedAt,
  SIGNER_STATUS_LABELS,
  type EnvelopeStatus,
  type SignerCompany,
  type SignerStatus,
} from "@/lib/esign/esign-core";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Wystąpił błąd";
}

const ROLE_LABELS = [
  "Pożyczkodawca",
  "Pożyczkobiorca",
  "Poręczyciel",
  "Pełnomocnik",
  "Zleceniodawca",
  "Zleceniobiorca",
  "Strona",
];

function EnvelopeBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    szkic: "bg-muted text-muted-foreground",
    wyslana: "bg-blue-100 text-blue-800",
    zakonczona: "bg-emerald-100 text-emerald-800",
    odrzucona: "bg-red-100 text-red-800",
    anulowana: "bg-muted text-muted-foreground",
    wygasla: "bg-amber-100 text-amber-800",
  };
  return (
    <Badge className={cls[status] ?? ""}>
      {ENVELOPE_STATUS_LABELS[status as EnvelopeStatus] ?? status}
    </Badge>
  );
}

function SignerBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    podpisany: "bg-emerald-100 text-emerald-800",
    zweryfikowany: "bg-teal-100 text-teal-800",
    niezgodnosc: "bg-amber-100 text-amber-900",
    odrzucony: "bg-red-100 text-red-800",
    weryfikacja: "bg-blue-100 text-blue-800",
  };
  return (
    <Badge variant="outline" className={cls[status] ?? ""}>
      {SIGNER_STATUS_LABELS[status as SignerStatus] ?? status}
    </Badge>
  );
}

export function EsignPanel({ eyebrow, basePath }: { eyebrow: string; basePath: string }) {
  const qc = useQueryClient();
  const fetchCtx = useServerFn(getEsignOwnerContext);
  const fetchList = useServerFn(listMyEnvelopes);
  const ctx = useQuery({ queryKey: ["esign-ctx"], queryFn: () => fetchCtx() });
  const list = useQuery({ queryKey: ["esign-list"], queryFn: () => fetchList({ data: {} }) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["esign-list"] });
    void qc.invalidateQueries({ queryKey: ["esign-details"] });
  };
  const [initial] = useState(() => readEsignPrefill());
  const [createOpen, setCreateOpen] = useState(initial.open);
  const [selected, setSelected] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("koperta");
  });

  const role = ctx.data?.role;
  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow={eyebrow}
        title="Podpis elektroniczny"
        subtitle="Podpisywanie dokumentów w formie dokumentowej (art. 77² KC): podpisujący potwierdza tożsamość przez Didit, wpisuje kod jednorazowy i podpisuje bez zakładania konta. Podpisany PDF ma znacznik na każdej stronie i Kartę podpisów ze śladem audytowym."
        actions={
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-white text-[oklch(0.28_0.12_265)] hover:bg-white/90"
          >
            <Plus className="mr-2 h-4 w-4" /> Nowy dokument do podpisu
          </Button>
        }
      />

      {!ctx.data?.diditConfigured && ctx.data ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          Weryfikacja tożsamości Didit nie jest skonfigurowana (DIDIT_API_KEY /
          DIDIT_WORKFLOW_ID_KYC). Podpisujący nie przejdą kroku tożsamości, dopóki sekrety nie
          zostaną ustawione.
        </div>
      ) : null}

      <ToSignSection list={list.data} onRefresh={refresh} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" /> Koperty
            </CardTitle>
            <CardDescription>
              {role === "inwestor"
                ? "Dokumenty wysłane przez Ciebie do podpisu."
                : "Dokumenty wysłane do podpisu przez zespół."}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => list.refetch()}>
            <RefreshCw className="mr-1 h-4 w-4" /> Odśwież
          </Button>
        </CardHeader>
        <CardContent>
          {list.isLoading ? (
            <div className="flex items-center gap-2 py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
            </div>
          ) : !list.data?.envelopes.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Brak kopert. Kliknij „Nowy dokument do podpisu”, wgraj PDF i dodaj podpisujących.
            </p>
          ) : (
            <div className="divide-y">
              {list.data.envelopes.map((e: any) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setSelected(e.id)}
                  className="flex w-full flex-wrap items-center gap-3 py-3 text-left hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{e.public_id}</span>
                      <span className="truncate font-medium">{e.title}</span>
                      <EnvelopeBadge status={e.status} />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {e.signers.map((s: any) => (
                        <span key={s.id} className="flex items-center gap-1">
                          <span
                            className={
                              "inline-block h-2 w-2 rounded-full " +
                              (s.status === "podpisany"
                                ? "bg-emerald-500"
                                : s.status === "odrzucony"
                                  ? "bg-red-500"
                                  : s.status === "niezgodnosc"
                                    ? "bg-amber-500"
                                    : "bg-muted-foreground/40")
                            }
                          />
                          {s.full_name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>utworzono {formatSignedAt(e.created_at).split(" (")[0]}</div>
                    <div>
                      {e.status === "zakonczona"
                        ? `zamknięto ${formatSignedAt(e.completed_at).split(" (")[0]}`
                        : `ważne do ${formatSignedAt(e.expires_at).split(" (")[0]}`}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateEnvelopeDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        ctx={ctx.data}
        prefill={initial.prefill}
        onCreated={(id) => {
          refresh();
          setSelected(id);
        }}
      />
      <EnvelopeDetailsSheet
        envelopeId={selected}
        basePath={basePath}
        onClose={() => setSelected(null)}
        onChanged={refresh}
      />
    </div>
  );
}

// ── „Do podpisu” (zalogowany podpisujący) ──────────────────────────────────

function ToSignSection({ list, onRefresh }: { list: any; onRefresh: () => void }) {
  const openLink = useServerFn(openMySigningLink);
  const mut = useMutation({
    mutationFn: (signerId: string) => openLink({ data: { signerId } }),
    onSuccess: (r) => {
      window.location.href = r.url;
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const items = (list?.toSign ?? []).filter(
    (x: any) =>
      x.envelope?.status === "wyslana" &&
      x.signer.status !== "podpisany" &&
      x.signer.status !== "odrzucony",
  );
  const done = (list?.toSign ?? []).filter((x: any) => x.signer.status === "podpisany");
  if (items.length === 0 && done.length === 0) return null;
  return (
    <Card className="border-[oklch(0.28_0.12_265)]/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <PenLine className="h-4 w-4" /> Dokumenty do Twojego podpisu
        </CardTitle>
        <CardDescription>
          Dokumenty, w których jesteś podpisującym. Podpiszesz je po weryfikacji tożsamości.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((x: any) => (
          <div
            key={x.signer.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
          >
            <div>
              <div className="font-medium">{x.envelope.title}</div>
              <div className="text-xs text-muted-foreground">
                {x.envelope.public_id} · od: {x.envelope.sender_name ?? "Finance You"} · ważne do{" "}
                {formatSignedAt(x.envelope.expires_at).split(" (")[0]}
              </div>
            </div>
            <Button size="sm" onClick={() => mut.mutate(x.signer.id)} disabled={mut.isPending}>
              {mut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PenLine className="mr-2 h-4 w-4" />
              )}
              Otwórz i podpisz
            </Button>
          </div>
        ))}
        {done.length ? (
          <p className="text-xs text-muted-foreground">
            Podpisane przez Ciebie: {done.map((x: any) => x.envelope.public_id).join(", ")} — pliki
            znajdziesz w e-mailu i w szczegółach koperty.
          </p>
        ) : null}
        <Button variant="ghost" size="sm" onClick={onRefresh}>
          <RefreshCw className="mr-1 h-4 w-4" /> Odśwież
        </Button>
      </CardContent>
    </Card>
  );
}

// ── kreator koperty ────────────────────────────────────────────────────────

type SignerForm = {
  kind: "zewnetrzny" | "inwestor" | "ja" | "klient";
  userId: string | null;
  /** Klient pożyczkowy z systemu (clients.id). */
  clientId: string | null;
  applications: Array<{ id: string; loanAmount: number | null; status: string }>;
  fullName: string;
  email: string;
  phone: string;
  roleLabel: string;
  capacityMode: "osoba" | "firma";
  company: { name: string; nip: string; krs: string; role: string };
  pickedCompany: SignerCompany | null;
};

const emptySigner = (): SignerForm => ({
  kind: "zewnetrzny",
  userId: null,
  clientId: null,
  applications: [],
  fullName: "",
  email: "",
  phone: "",
  roleLabel: "",
  capacityMode: "osoba",
  company: { name: "", nip: "", krs: "", role: "" },
  pickedCompany: null,
});

function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^;]+;base64,/, ""));
    r.onerror = () => reject(new Error("Nie udało się odczytać pliku."));
    r.readAsDataURL(file);
  });
}

/** Prefill kreatora z adresu: ?nowa=1&klient=<clients.id>&wniosek=<loan_applications.id>. */
export type EsignPrefill = { clientId: string | null; loanApplicationId: string | null } | null;

export function readEsignPrefill(): { open: boolean; prefill: EsignPrefill } {
  if (typeof window === "undefined") return { open: false, prefill: null };
  const sp = new URLSearchParams(window.location.search);
  const clientId = sp.get("klient");
  const loanApplicationId = sp.get("wniosek");
  const open = sp.get("nowa") === "1" || Boolean(clientId) || Boolean(loanApplicationId);
  return { open, prefill: clientId || loanApplicationId ? { clientId, loanApplicationId } : null };
}

function CreateEnvelopeDialog({
  open,
  onOpenChange,
  ctx,
  onCreated,
  prefill,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ctx: any;
  onCreated: (id: string) => void;
  prefill?: EsignPrefill;
}) {
  const create = useServerFn(createEnvelope);
  const searchClients = useServerFn(searchSignerClients);
  const listDocs = useServerFn(listClientDocuments);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"rownolegle" | "kolejno">("rownolegle");
  const [days, setDays] = useState("30");
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<"plik" | "umowa">("plik");
  const [generatedDocumentId, setGeneratedDocumentId] = useState<string | null>(null);
  const [signers, setSigners] = useState<SignerForm[]>([emptySigner()]);
  const fileRef = useRef<HTMLInputElement>(null);
  const isInvestor = ctx?.role === "inwestor";

  // Prefill z karty wniosku / klienta: pierwszy podpisujący = klient z systemu.
  const prefilledRef = useRef<string | null>(null);
  useEffect(() => {
    const key = prefill ? `${prefill.clientId}:${prefill.loanApplicationId}` : null;
    if (!open || !prefill?.clientId || prefilledRef.current === key) return;
    prefilledRef.current = key;
    void searchClients({ data: { clientId: prefill.clientId } })
      .then((r) => {
        const c = r.candidates[0];
        if (!c) return;
        setSigners((arr) => {
          const first: SignerForm = {
            ...emptySigner(),
            kind: "klient",
            clientId: c.clientId,
            userId: c.userId,
            fullName: c.fullName,
            email: c.email ?? "",
            phone: c.phone ?? "",
            roleLabel: "Pożyczkobiorca",
            capacityMode: c.company ? "firma" : "osoba",
            company: {
              name: c.company?.name ?? "",
              nip: c.company?.nip ?? "",
              krs: c.company?.krs ?? "",
              role: c.company?.role ?? "",
            },
            pickedCompany: c.company,
            applications: c.applications,
          };
          return [first, ...arr.slice(1)];
        });
      })
      .catch((e) => toast.error(errMsg(e)));
  }, [open, prefill, searchClients]);

  const docsClientId =
    signers.find((x) => x.kind === "klient" && x.clientId)?.clientId ?? prefill?.clientId ?? null;
  const docsAppId = prefill?.loanApplicationId ?? null;
  const docsQuery = useQuery({
    queryKey: ["esign-client-docs-list", docsClientId, docsAppId],
    enabled: open && Boolean(docsClientId || docsAppId),
    queryFn: () =>
      listDocs({
        data: { clientId: docsClientId ?? undefined, loanApplicationId: docsAppId ?? undefined },
      }),
  });
  const docs = docsQuery.data?.documents ?? [];
  useEffect(() => {
    // Z karty wniosku: domyślnie ostatnia wygenerowana umowa.
    if (prefill?.loanApplicationId && docs.length && !generatedDocumentId) {
      setSource("umowa");
      setGeneratedDocumentId(docs[0].id);
      setTitle((t) => t || docs[0].templateName);
    }
  }, [docs, prefill?.loanApplicationId, generatedDocumentId]);

  const mut = useMutation({
    mutationFn: async () => {
      if (source === "umowa") {
        if (!generatedDocumentId) throw new Error("Wybierz wygenerowaną umowę.");
      } else {
        if (!file) throw new Error("Wgraj plik PDF.");
        if (
          file.type &&
          file.type !== "application/pdf" &&
          !file.name.toLowerCase().endsWith(".pdf")
        ) {
          throw new Error("Do podpisu przyjmujemy wyłącznie pliki PDF.");
        }
        if (file.size > 15 * 1024 * 1024) throw new Error("Plik jest za duży (limit 15 MB).");
      }
      const clientSigner = signers.find((x) => x.kind === "klient" && x.clientId);
      const payload: CreateEnvelopeInput = {
        title,
        message: message || null,
        signingMode: mode,
        expiresInDays: Number(days),
        fileName: source === "plik" && file ? file.name : undefined,
        fileBase64: source === "plik" && file ? await readFileBase64(file) : undefined,
        generatedDocumentId: source === "umowa" ? generatedDocumentId : undefined,
        clientId: clientSigner?.clientId ?? prefill?.clientId ?? undefined,
        loanApplicationId: prefill?.loanApplicationId ?? undefined,
        sendNow: true,
        signers: signers.map((s, i) => ({
          kind: s.kind,
          userId: s.kind === "inwestor" ? s.userId : null,
          clientId: s.kind === "klient" ? s.clientId : null,
          fullName: s.fullName || null,
          email: s.email || null,
          phone: s.phone || null,
          roleLabel: s.roleLabel || null,
          capacityMode: s.kind === "zewnetrzny" || s.kind === "klient" ? s.capacityMode : "osoba",
          company:
            (s.kind === "zewnetrzny" || s.kind === "klient") && s.capacityMode === "firma"
              ? {
                  name: s.company.name,
                  nip: s.company.nip || null,
                  krs: s.company.krs || null,
                  role: s.company.role || null,
                }
              : null,
          orderNo: i + 1,
        })),
      };
      return create({ data: payload });
    },
    onSuccess: (r) => {
      if (r.sentTo.length) {
        toast.success(`Koperta ${r.publicId} wysłana do: ${r.sentTo.join(", ")}.`);
      } else {
        toast.warning(
          `Koperta ${r.publicId} utworzona, ale żadne zaproszenie nie wyszło (sprawdź konfigurację e-mail) — użyj „Wyślij link ponownie”.`,
        );
      }
      onOpenChange(false);
      setTitle("");
      setMessage("");
      setFile(null);
      setSource("plik");
      setGeneratedDocumentId(null);
      setSigners([emptySigner()]);
      onCreated(r.id);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const update = (i: number, patch: Partial<SignerForm>) =>
    setSigners((arr) => arr.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const setKind = (i: number, kind: SignerForm["kind"]) => {
    const base = { ...emptySigner(), kind, roleLabel: signers[i].roleLabel };
    if (kind === "ja") {
      base.fullName = ctx?.me?.fullName ?? ctx?.sender?.name ?? "";
      base.email = ctx?.me?.email ?? ctx?.sender?.email ?? "";
      base.phone = ctx?.me?.phone ?? "";
      base.pickedCompany = ctx?.me?.company ?? null;
    }
    setSigners((arr) => arr.map((s, j) => (j === i ? base : s)));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nowy dokument do podpisu</DialogTitle>
          <DialogDescription>
            Wgraj gotowy PDF albo wybierz umowę wygenerowaną w kreatorze i wskaż, kto ma podpisać.
            Każdy podpisujący dostanie osobisty link e-mailem.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Tytuł dokumentu</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="np. Umowa pożyczki nr 12/2026"
            />
          </div>
          <div className="grid gap-2">
            <Label>Dokument</Label>
            {docs.length > 0 ? (
              <RadioGroup
                value={source}
                onValueChange={(v) => setSource(v as "plik" | "umowa")}
                className="flex flex-wrap gap-4"
              >
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="umowa" /> wygenerowana umowa klienta
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="plik" /> wgraj plik PDF
                </label>
              </RadioGroup>
            ) : null}
            {source === "umowa" && docs.length > 0 ? (
              <div className="divide-y rounded-md border">
                {docs.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setGeneratedDocumentId(d.id);
                      setTitle((t) => t || d.templateName);
                    }}
                    className={
                      "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40 " +
                      (generatedDocumentId === d.id ? "bg-[oklch(0.97_0.02_265)]" : "")
                    }
                  >
                    <span className="flex items-center gap-2">
                      {generatedDocumentId === d.id ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      )}
                      {d.templateName}
                      <span className="text-xs uppercase text-muted-foreground">{d.format}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatSignedAt(d.createdAt).split(" (")[0]}
                    </span>
                  </button>
                ))}
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  Umowę DOCX zamieniamy na PDF tą samą drukarką, co pakiet dokumentów inwestora
                  (treść bez zmian, układ uproszczony). Podgląd zobaczysz w szczegółach koperty
                  przed podpisem stron.
                </p>
              </div>
            ) : (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                    <FileText className="mr-2 h-4 w-4" /> {file ? "Zmień plik" : "Wybierz PDF"}
                  </Button>
                  {file ? (
                    <span className="text-sm text-muted-foreground">
                      {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Maks. 15 MB, bez hasła. Treść nie jest modyfikowana — dodajemy znaczniki w
                      marginesach.
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Kolejność podpisów</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as "rownolegle" | "kolejno")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rownolegle">Równolegle — wszyscy od razu</SelectItem>
                  <SelectItem value="kolejno">Kolejno — następny po poprzednim</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Termin na podpis</Label>
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["3", "7", "14", "30", "60", "90"].map((d) => (
                    <SelectItem key={d} value={d}>
                      {d} dni
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Wiadomość do podpisujących (opcjonalnie)</Label>
            <Textarea
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="np. Prosimy o podpis do piątku."
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Users className="h-4 w-4" /> Podpisujący ({signers.length})
              </Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={signers.length >= 10}
                onClick={() => setSigners((a) => [...a, emptySigner()])}
              >
                <Plus className="mr-1 h-4 w-4" /> Dodaj
              </Button>
            </div>
            {signers.map((s, i) => (
              <div key={i} className="space-y-3 rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-muted text-xs font-bold">
                    {i + 1}
                  </span>
                  <Select value={s.kind} onValueChange={(v) => setKind(i, v as SignerForm["kind"])}>
                    <SelectTrigger className="w-[260px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zewnetrzny">
                        {isInvestor
                          ? "Klient / druga strona (bez konta)"
                          : "Osoba spoza systemu (klient)"}
                      </SelectItem>
                      <SelectItem value="klient">Klient pożyczkowy (z systemu)</SelectItem>
                      {!isInvestor ? (
                        <SelectItem value="inwestor">Inwestor z systemu (konto)</SelectItem>
                      ) : null}
                      <SelectItem value="ja">
                        {isInvestor ? "Ja (inwestor)" : "Ja (Finance You)"}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={s.roleLabel || "_"}
                    onValueChange={(v) => update(i, { roleLabel: v === "_" ? "" : v })}
                  >
                    <SelectTrigger className="w-[190px]">
                      <SelectValue placeholder="Rola w dokumencie" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_">Rola (opcjonalnie)</SelectItem>
                      {ROLE_LABELS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="ml-auto">
                    {signers.length > 1 ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => setSigners((a) => a.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>

                {s.kind === "inwestor" ? (
                  <InvestorPicker value={s} onPick={(p) => update(i, p)} />
                ) : null}

                {s.kind === "klient" ? (
                  <ClientPicker value={s} onPick={(p) => update(i, p)} />
                ) : null}

                {s.kind === "ja" ? (
                  <div className="text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" /> {s.fullName || "—"} · {s.email || "—"}
                      {s.phone ? ` · ${s.phone}` : ""}
                    </div>
                    {s.pickedCompany ? (
                      <div className="mt-1 flex items-center gap-2 text-xs">
                        <Building2 className="h-3.5 w-3.5" /> Przy podpisie wybierzesz: we własnym
                        imieniu albo w imieniu {s.pickedCompany.name}
                        {s.pickedCompany.nip ? ` (NIP ${s.pickedCompany.nip})` : ""}.
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {s.kind === "zewnetrzny" ||
                (s.kind === "inwestor" && s.userId) ||
                (s.kind === "klient" && s.clientId) ? (
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Input
                      placeholder="Imię i nazwisko (jak w dokumencie tożsamości)"
                      value={s.fullName}
                      onChange={(e) => update(i, { fullName: e.target.value })}
                    />
                    <Input
                      placeholder="E-mail"
                      type="email"
                      value={s.email}
                      onChange={(e) => update(i, { email: e.target.value })}
                    />
                    <Input
                      placeholder="Telefon (kod SMS, opcjonalnie)"
                      value={s.phone}
                      onChange={(e) => update(i, { phone: e.target.value })}
                    />
                  </div>
                ) : null}

                {s.kind === "zewnetrzny" || (s.kind === "klient" && s.clientId) ? (
                  <div className="space-y-2">
                    <RadioGroup
                      value={s.capacityMode}
                      onValueChange={(v) => update(i, { capacityMode: v as "osoba" | "firma" })}
                      className="flex flex-wrap gap-4"
                    >
                      <label className="flex items-center gap-2 text-sm">
                        <RadioGroupItem value="osoba" /> podpisuje we własnym imieniu
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <RadioGroupItem value="firma" /> podpisuje w imieniu firmy / spółki
                      </label>
                    </RadioGroup>
                    {s.capacityMode === "firma" ? (
                      <div className="grid gap-2 sm:grid-cols-4">
                        <Input
                          className="sm:col-span-2"
                          placeholder="Nazwa podmiotu"
                          value={s.company.name}
                          onChange={(e) =>
                            update(i, { company: { ...s.company, name: e.target.value } })
                          }
                        />
                        <Input
                          placeholder="NIP"
                          value={s.company.nip}
                          onChange={(e) =>
                            update(i, { company: { ...s.company, nip: e.target.value } })
                          }
                        />
                        <Input
                          placeholder="KRS (opcjonalnie)"
                          value={s.company.krs}
                          onChange={(e) =>
                            update(i, { company: { ...s.company, krs: e.target.value } })
                          }
                        />
                        <Input
                          className="sm:col-span-2"
                          placeholder="Funkcja (np. Prezes Zarządu, pełnomocnik)"
                          value={s.company.role}
                          onChange={(e) =>
                            update(i, { company: { ...s.company, role: e.target.value } })
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Anuluj
          </Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !title.trim() || !file}>
            {mut.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Wyślij do podpisu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClientPicker({
  value,
  onPick,
}: {
  value: SignerForm;
  onPick: (p: Partial<SignerForm>) => void;
}) {
  const search = useServerFn(searchSignerClients);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const mut = useMutation({
    mutationFn: () => search({ data: { q } }),
    onSuccess: (r) => {
      setResults(r.candidates);
      if (!r.candidates.length) toast.info("Brak klientów pasujących do frazy.");
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          placeholder="Szukaj klienta: nazwisko, firma, e-mail, telefon, NIP"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && q.trim().length >= 2 && mut.mutate()}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => mut.mutate()}
          disabled={q.trim().length < 2 || mut.isPending}
        >
          {mut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </Button>
      </div>
      {value.clientId ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Klient: {value.fullName}
          {value.userId ? (
            <span className="text-xs text-muted-foreground">
              · ma konto — zobaczy dokument w panelu klienta
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              · bez konta — podpisze z linku w e-mailu
            </span>
          )}
          {value.applications.length ? (
            <span className="text-xs text-muted-foreground">
              · wnioski: {value.applications.length}
            </span>
          ) : null}
        </div>
      ) : null}
      {results.length ? (
        <div className="divide-y rounded-md border">
          {results.map((c) => (
            <button
              key={c.clientId}
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
              onClick={() => {
                onPick({
                  clientId: c.clientId,
                  userId: c.userId,
                  fullName: c.fullName ?? "",
                  email: c.email ?? "",
                  phone: c.phone ?? "",
                  roleLabel: value.roleLabel || "Pożyczkobiorca",
                  capacityMode: c.company ? "firma" : "osoba",
                  company: {
                    name: c.company?.name ?? "",
                    nip: c.company?.nip ?? "",
                    krs: c.company?.krs ?? "",
                    role: c.company?.role ?? "",
                  },
                  pickedCompany: c.company,
                  applications: c.applications,
                });
                setResults([]);
              }}
            >
              <span>
                {c.fullName || "—"}{" "}
                <span className="text-muted-foreground">· {c.email ?? "brak e-maila"}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {c.company ? c.company.name : "osoba fizyczna"}
                {c.applications.length ? ` · wnioski: ${c.applications.length}` : ""}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function InvestorPicker({
  value,
  onPick,
}: {
  value: SignerForm;
  onPick: (p: Partial<SignerForm>) => void;
}) {
  const search = useServerFn(searchSignerCandidates);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const mut = useMutation({
    mutationFn: () => search({ data: { q } }),
    onSuccess: (r) => setResults(r.candidates),
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          placeholder="Szukaj inwestora: nazwisko, firma, e-mail, NIP"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && q.length >= 2 && mut.mutate()}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => mut.mutate()}
          disabled={q.trim().length < 2 || mut.isPending}
        >
          {mut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </Button>
      </div>
      {value.userId ? (
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Konto: {value.email}
          {value.pickedCompany ? (
            <span className="text-xs text-muted-foreground">
              · przy podpisie wybierze: on sam albo {value.pickedCompany.name}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">· podpisze we własnym imieniu</span>
          )}
        </div>
      ) : null}
      {results.length ? (
        <div className="divide-y rounded-md border">
          {results.map((c) => (
            <button
              key={c.userId}
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
              onClick={() => {
                onPick({
                  userId: c.userId,
                  fullName: c.fullName ?? "",
                  email: c.email ?? "",
                  phone: c.phone ?? "",
                  pickedCompany: c.company,
                });
                setResults([]);
              }}
            >
              <span>
                {c.fullName || "—"} <span className="text-muted-foreground">· {c.email}</span>
              </span>
              {c.company ? (
                <span className="text-xs text-muted-foreground">{c.company.name}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── szczegóły koperty ──────────────────────────────────────────────────────

function EnvelopeDetailsSheet({
  envelopeId,
  basePath,
  onClose,
  onChanged,
}: {
  envelopeId: string | null;
  basePath: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const fetchDetails = useServerFn(getEnvelopeDetails);
  const q = useQuery({
    queryKey: ["esign-details", envelopeId],
    queryFn: () => fetchDetails({ data: { envelopeId: envelopeId as string } }),
    enabled: Boolean(envelopeId),
  });
  useEffect(() => {
    if (!envelopeId || typeof window === "undefined") return;
    const u = new URL(window.location.href);
    u.searchParams.set("koperta", envelopeId);
    window.history.replaceState({}, "", u.toString());
    return () => {
      const u2 = new URL(window.location.href);
      u2.searchParams.delete("koperta");
      window.history.replaceState({}, "", u2.toString());
    };
  }, [envelopeId]);

  const fileUrl = useServerFn(getEnvelopeFileUrl);
  const send = useServerFn(sendEnvelope);
  const cancel = useServerFn(cancelEnvelope);
  const resend = useServerFn(resendSignerLink);
  const resolve = useServerFn(resolveIdentityMismatch);
  const openLink = useServerFn(openMySigningLink);
  const [correctName, setCorrectName] = useState<Record<string, string>>({});

  const act = (fn: () => Promise<unknown>, ok: string) =>
    fn()
      .then(() => {
        toast.success(ok);
        void q.refetch();
        onChanged();
      })
      .catch((e) => toast.error(errMsg(e)));

  const download = async (which: "zrodlo" | "podpisany") => {
    try {
      const r = await fileUrl({ data: { envelopeId: envelopeId as string, which } });
      window.open(r.url, "_blank", "noopener");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const d = q.data;
  const env = d?.envelope;
  return (
    <Sheet open={Boolean(envelopeId)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        {q.isLoading || !d || !env ? (
          <div className="flex items-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
          </div>
        ) : (
          <div className="space-y-5">
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-muted-foreground">{env.public_id}</span>
                {env.title}
                <EnvelopeBadge status={env.status} />
              </SheetTitle>
              <SheetDescription>
                nadawca: {env.sender_name ?? env.sender_email} · utworzono{" "}
                {formatSignedAt(env.created_at).split(" (")[0]} · tryb:{" "}
                {env.signing_mode === "kolejno" ? "kolejno" : "równolegle"} · ważne do{" "}
                {formatSignedAt(env.expires_at).split(" (")[0]}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => download("zrodlo")}>
                <FileText className="mr-1 h-4 w-4" /> Plik źródłowy
              </Button>
              {env.final_path ? (
                <Button size="sm" onClick={() => download("podpisany")}>
                  <Download className="mr-1 h-4 w-4" /> Podpisany PDF
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(env.verifyUrl);
                  toast.success("Skopiowano link weryfikacji.");
                }}
              >
                <Copy className="mr-1 h-4 w-4" /> Link weryfikacji
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <a href={env.verifyUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1 h-4 w-4" /> Otwórz
                </a>
              </Button>
              {d.canManage && env.status === "szkic" ? (
                <Button
                  size="sm"
                  onClick={() =>
                    act(() => send({ data: { envelopeId: env.id } }), "Zaproszenia wysłane.")
                  }
                >
                  <Send className="mr-1 h-4 w-4" /> Wyślij do podpisu
                </Button>
              ) : null}
              {d.canManage && (env.status === "szkic" || env.status === "wyslana") ? (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (
                      window.confirm("Anulować kopertę? Linki podpisujących przestaną działać.")
                    ) {
                      void act(
                        () => cancel({ data: { envelopeId: env.id } }),
                        "Koperta anulowana.",
                      );
                    }
                  }}
                >
                  <Ban className="mr-1 h-4 w-4" /> Anuluj
                </Button>
              ) : null}
            </div>

            <div className="grid gap-1 rounded-lg border bg-muted/30 p-3 text-xs">
              <div>
                <span className="text-muted-foreground">Plik: </span>
                {env.source_filename} · {env.page_count} stron ·{" "}
                {(env.source_bytes / 1024).toFixed(0)} KB
              </div>
              <div className="break-all">
                <span className="text-muted-foreground">SHA-256 źródła: </span>
                <code>{env.source_sha256}</code>
              </div>
              {env.final_sha256 ? (
                <div className="break-all">
                  <span className="text-muted-foreground">SHA-256 podpisanego: </span>
                  <code>{env.final_sha256}</code>
                </div>
              ) : null}
            </div>

            <section className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4" /> Podpisujący
              </h3>
              {d.signers.map((s: any) => (
                <div key={s.id} className="space-y-2 rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-medium">
                        {s.order_no}. {s.full_name}
                      </span>
                      {s.role_label ? (
                        <span className="text-muted-foreground"> · {s.role_label}</span>
                      ) : null}
                      <span className="text-muted-foreground">
                        {" "}
                        · {s.signer_kind === "zewnetrzny" ? "bez konta" : s.signer_kind}
                      </span>
                    </div>
                    <SignerBadge status={s.status} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" /> {s.email}
                    </span>
                    {s.phone ? <span>{s.phone}</span> : null}
                    <span>
                      {s.capacity_mode === "wybor"
                        ? s.signed_capacity
                          ? capacityShort(s.signed_capacity)
                          : "wybierze: osoba / spółka"
                        : s.capacity_mode === "firma"
                          ? `w imieniu: ${s.company?.name ?? "—"}`
                          : "we własnym imieniu"}
                    </span>
                    {s.invited_at ? (
                      <span>zaproszono {formatSignedAt(s.invited_at).split(" (")[0]}</span>
                    ) : null}
                    {s.first_viewed_at ? (
                      <span>otwarto {formatSignedAt(s.first_viewed_at).split(" (")[0]}</span>
                    ) : null}
                  </div>
                  {s.identity ? (
                    <div className="flex items-start gap-2 rounded-md bg-emerald-50 p-2 text-xs text-emerald-900">
                      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>
                        {s.identity.fullName ? <strong>{s.identity.fullName} · </strong> : null}
                        {describeIdentity(s.identity)}
                        {s.identity_mismatch_note ? (
                          <em className="block">{s.identity_mismatch_note}</em>
                        ) : null}
                      </span>
                    </div>
                  ) : null}
                  {s.status === "podpisany" ? (
                    <div className="text-xs">
                      <span className="text-muted-foreground">Podpisano: </span>
                      {formatSignedAt(s.signed_at)} · IP {s.signature_ip ?? "—"} · kod:{" "}
                      {s.otp_channel ?? "—"} → {s.otp_target ?? "—"}
                      <div className="break-all text-muted-foreground">
                        ID podpisu: {s.signature_hash}
                      </div>
                    </div>
                  ) : null}
                  {s.status === "odrzucony" ? (
                    <div className="text-xs text-destructive">
                      Odmowa ({formatSignedAt(s.rejected_at).split(" (")[0]}): {s.rejection_reason}
                    </div>
                  ) : null}
                  {d.canManage && s.status === "niezgodnosc" ? (
                    <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                      <div className="flex items-center gap-1 font-medium">
                        <AlertTriangle className="h-3.5 w-3.5" /> Dane „{s.full_name}” nie zgadzają
                        się z dokumentem: „{s.identity?.fullName ?? "—"}”
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            act(
                              () => resolve({ data: { signerId: s.id, action: "akceptuj" } }),
                              "Różnica zaakceptowana — podpisujący może podpisać.",
                            )
                          }
                        >
                          Zaakceptuj różnicę
                        </Button>
                        <Input
                          className="h-8 w-56"
                          placeholder="Poprawione imię i nazwisko"
                          value={correctName[s.id] ?? ""}
                          onChange={(e) =>
                            setCorrectName((m) => ({ ...m, [s.id]: e.target.value }))
                          }
                        />
                        <Button
                          size="sm"
                          disabled={(correctName[s.id] ?? "").trim().length < 3}
                          onClick={() =>
                            act(
                              () =>
                                resolve({
                                  data: {
                                    signerId: s.id,
                                    action: "popraw",
                                    correctedName: correctName[s.id],
                                  },
                                }),
                              "Dane poprawione.",
                            )
                          }
                        >
                          Popraw dane
                        </Button>
                      </div>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {d.canManage &&
                    env.status === "wyslana" &&
                    !["podpisany", "odrzucony"].includes(s.status) ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          act(() => resend({ data: { signerId: s.id } }), "Wysłano nowy link.")
                        }
                      >
                        <Send className="mr-1 h-3.5 w-3.5" /> Wyślij link ponownie
                      </Button>
                    ) : null}
                    {d.mySignerId === s.id &&
                    env.status === "wyslana" &&
                    !["podpisany", "odrzucony"].includes(s.status) ? (
                      <Button
                        size="sm"
                        onClick={() =>
                          openLink({ data: { signerId: s.id } })
                            .then((r) => {
                              window.location.href = r.url;
                            })
                            .catch((e) => toast.error(errMsg(e)))
                        }
                      >
                        <PenLine className="mr-1 h-3.5 w-3.5" /> Otwórz i podpisz
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Historia dokumentu</h3>
              <ol className="space-y-1 text-xs">
                {d.events.map((ev: any) => (
                  <li key={ev.id} className="flex gap-2">
                    <span className="w-36 shrink-0 text-muted-foreground">
                      {formatSignedAt(ev.created_at).split(" (")[0]}
                    </span>
                    <span>
                      {eventLabel(ev.event_type)}
                      {ev.signer_id ? (
                        <span className="text-muted-foreground">
                          {" "}
                          · {d.signers.find((s: any) => s.id === ev.signer_id)?.full_name ?? ""}
                        </span>
                      ) : null}
                      {ev.ip ? <span className="text-muted-foreground"> · {ev.ip}</span> : null}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
            <p className="text-[11px] text-muted-foreground">
              Panel: {basePath}. Historia jest rejestrem tylko-do-dopisywania z łańcuchem SHA-256;
              pełna wersja trafia do Karty podpisów.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
