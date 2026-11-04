// Wspólne karty kroków modułu „Analityka" panelu inwestora — używane przez
// widok wniosków wybranych dla inwestora i szybką analizę KW wniosku spoza
// Finance You (ten sam wygląd kroków: KW, właściciele, analiza KW).
import type { ReactNode } from "react";
import { AlertTriangle, BookOpenCheck, Check, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { formatDateTime } from "@/lib/labels";
import { proceedingRows } from "@/lib/coowners/court-proceeding-format";
import {
  ceidgRows,
  companyRows,
  profileHeadline,
  vatRows,
  websiteRows,
} from "@/lib/coowners/business-profile-format";
import type { BusinessProfile } from "@/lib/coowners/business-profile.types";
import type { CourtProceedingReport } from "@/lib/coowners/owner-intelligence.types";
import {
  ANALYTICS_STEP_STATUS_LABELS,
  type AnalyticsCoOwners,
  type AnalyticsKwDocument,
  type AnalyticsStepMeta,
  type AnalyticsStepStatus,
} from "@/lib/investor-analytics/types";

export function accent(hue: number, lightness: number, chroma: number, alpha = 1): string {
  return `oklch(${lightness} ${chroma} ${hue}${alpha < 1 ? ` / ${alpha}` : ""})`;
}

type KwSectionKey = keyof AnalyticsKwDocument["sections"];

const KW_SECTIONS: { key: KwSectionKey; label: string }[] = [
  { key: "okladka", label: "Okładka" },
  { key: "dzial_1o", label: "Dział I-O — Oznaczenie nieruchomości" },
  { key: "dzial_1s", label: "Dział I-Sp — Spis praw związanych" },
  { key: "dzial_2", label: "Dział II — Własność" },
  { key: "dzial_3", label: "Dział III — Prawa, roszczenia i ograniczenia" },
  { key: "dzial_4", label: "Dział IV — Hipoteki" },
];

export function StepEmpty({ status, text }: { status: AnalyticsStepStatus; text: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      {status === "running" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {text}
    </p>
  );
}

/**
 * Telefon: karty shadcn (Zlecenie, raport, wycena, analiza KW…) zagnieżdżone
 * jedna w drugiej zjadały po ~25 px z każdej strony na każdym poziomie —
 * poniżej `sm` zdejmujemy im ramkę, tło i poziomy padding (klasa na korzeniu
 * strony). Karty Projektu i kroków (inne zaokrąglenie) zostają ramkami.
 */
export const COMPACT_CARDS_MOBILE =
  "max-sm:[&_.rounded-xl.border.bg-card]:border-0 max-sm:[&_.rounded-xl.border.bg-card]:bg-transparent max-sm:[&_.rounded-xl.border.bg-card]:shadow-none max-sm:[&_.rounded-xl.border.bg-card>.p-6]:px-0";

/** Karta kroku pipeline'u — kolorowa krawędź, numer w kółku, stan (jak stepper inwestora). */

export function StepCard({
  meta,
  status,
  error,
  badge,
  children,
}: {
  meta: AnalyticsStepMeta;
  status: AnalyticsStepStatus;
  error?: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  const done = status === "done";
  const running = status === "running";
  const failed = status === "error";
  const hue = failed ? 25 : meta.hue;
  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-3xl border bg-card shadow-sm transition",
        running && "shadow-lg",
        status === "pending" && "opacity-80",
      )}
      style={{
        borderColor: accent(hue, 0.62, 0.16, running || failed ? 0.75 : 0.28),
        boxShadow: running ? `0 18px 40px -26px ${accent(hue, 0.55, 0.18, 0.9)}` : undefined,
      }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1.5"
        style={{
          background: `linear-gradient(180deg, ${accent(hue, 0.7, 0.17)}, ${accent(hue + 18, 0.55, 0.19)})`,
          opacity: status === "pending" ? 0.35 : 1,
        }}
      />
      <header className="flex flex-wrap items-start justify-between gap-3 px-3 py-3 pl-5 sm:px-5 sm:py-4 sm:pl-7">
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black text-white"
            style={{
              background: done
                ? `linear-gradient(135deg, ${accent(hue, 0.62, 0.16)}, ${accent(hue + 20, 0.48, 0.18)})`
                : failed
                  ? "linear-gradient(135deg, oklch(0.65 0.20 25), oklch(0.52 0.22 20))"
                  : running
                    ? `linear-gradient(135deg, ${accent(hue, 0.68, 0.17)}, ${accent(hue + 20, 0.52, 0.19)})`
                    : "oklch(0.88 0.01 260)",
              color: status === "pending" ? "oklch(0.45 0.02 260)" : "#fff",
            }}
          >
            {done ? (
              <Check className="h-4 w-4" />
            ) : failed ? (
              <AlertTriangle className="h-4 w-4" />
            ) : running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              meta.index
            )}
          </span>
          <div>
            <h3 className="text-base font-bold leading-tight">{meta.title}</h3>
            <p className="mt-0.5 max-w-2xl text-xs text-muted-foreground">{meta.subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {badge}
          <span
            className="rounded-full px-2.5 py-1 text-[0.68rem] font-bold"
            style={{
              background: done
                ? accent(hue, 0.94, 0.05)
                : failed
                  ? "oklch(0.95 0.06 25)"
                  : running
                    ? accent(hue, 0.92, 0.06)
                    : "oklch(0.95 0.01 260)",
              color: done
                ? accent(hue, 0.38, 0.14)
                : failed
                  ? "oklch(0.45 0.18 25)"
                  : running
                    ? accent(hue, 0.35, 0.14)
                    : "oklch(0.45 0.02 260)",
            }}
          >
            {ANALYTICS_STEP_STATUS_LABELS[status]}
          </span>
        </div>
      </header>
      <div className="px-3 pb-4 pl-5 sm:px-5 sm:pb-5 sm:pl-7">
        {failed && error && (
          <Alert variant="destructive" className="mb-3">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="break-words">{error}</AlertDescription>
          </Alert>
        )}
        {children}
      </div>
    </section>
  );
}

export function KwStep({
  kwNumber,
  doc,
  status,
}: {
  kwNumber: string | null;
  doc: AnalyticsKwDocument | null;
  status: AnalyticsStepStatus;
}) {
  if (!kwNumber) {
    return (
      <p className="text-sm text-muted-foreground">
        Wniosek nie ma poprawnego numeru księgi wieczystej — pipeline nie może ruszyć.
      </p>
    );
  }
  if (!doc || (doc.status !== "ready" && !Object.values(doc.sections).some(Boolean))) {
    return (
      <div className="space-y-2">
        {doc?.status === "processing" && (
          <Alert>
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertTitle>Pobieranie KW w toku</AlertTitle>
            <AlertDescription>
              EKW udostępnia dokument z opóźnieniem — to może potrwać do kilkudziesięciu sekund.
            </AlertDescription>
          </Alert>
        )}
        {(doc?.status === "error" || doc?.status === "not_found") && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {doc.status === "not_found" ? "Nie znaleziono księgi w EKW" : "Błąd pobierania KW"}
            </AlertTitle>
            {doc.lastError && <AlertDescription>{doc.lastError}</AlertDescription>}
          </Alert>
        )}
        {!doc && (
          <StepEmpty
            status={status}
            text="Treść księgi wieczystej jeszcze nie została pobrana — zrobi to pierwszy krok pipeline'u."
          />
        )}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <BookOpenCheck className="h-4 w-4 text-emerald-600" />
        <span>
          Treść KW <span className="font-mono text-foreground">{kwNumber}</span>
          {doc.fetchedAt ? ` pobrana ${formatDateTime(doc.fetchedAt)}` : ""}.
        </span>
      </div>
      {doc.lastError && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Ostatnia próba odświeżenia nie powiodła się</AlertTitle>
          <AlertDescription>{doc.lastError} Poniżej wcześniej pobrana treść.</AlertDescription>
        </Alert>
      )}
      <Accordion type="multiple" defaultValue={["dzial_2", "dzial_4"]}>
        {KW_SECTIONS.map(({ key, label }) => {
          const html = doc.sections[key];
          if (!html) return null;
          return (
            <AccordionItem key={key} value={key}>
              <AccordionTrigger className="text-left">{label}</AccordionTrigger>
              <AccordionContent>
                <div
                  className="kw-html prose prose-sm max-w-none dark:prose-invert overflow-x-auto"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
                />
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

export function CoOwnersStep({
  co,
  status,
}: {
  co: AnalyticsCoOwners | null;
  status: AnalyticsStepStatus;
}) {
  if (!co) {
    return (
      <StepEmpty
        status={status}
        text="Zestawienie właścicieli z działu II KW z CEIDG i KRS pojawi się po pobraniu księgi."
      />
    );
  }
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Users className="h-4 w-4" />
        <span>
          {co.totalOwnersInKw} {co.totalOwnersInKw === 1 ? "właściciel" : "właścicieli"} w dziale II
          {co.generatedAt ? ` · sprawdzono ${formatDateTime(co.generatedAt)}` : ""}
        </span>
      </div>
      {co.summary && <p>{co.summary}</p>}
      {co.warnings.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Na co zwrócić uwagę</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {co.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {co.owners.length > 0 && (
        <div className="grid gap-2 md:grid-cols-2">
          {co.owners.map((o, i) => (
            <div key={i} className="rounded-xl border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{o.fullName ?? "Właściciel"}</span>
                {o.isPrimaryClient && <Badge variant="secondary">pożyczkobiorca</Badge>}
                {o.share && <Badge variant="outline">udział {o.share}</Badge>}
              </div>
              <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {o.coOwnershipType && <div>{o.coOwnershipType}</div>}
                {o.businessStatus && <div>CEIDG: {o.businessStatus}</div>}
                {o.krs.map((k, j) => (
                  <div key={j}>
                    KRS: {k.companyName}
                    {k.role ? ` (${k.role})` : ""}
                    {k.flags.length ? ` — ${k.flags.join(", ")}` : ""}
                  </div>
                ))}
                {o.notes.map((n, j) => (
                  <div key={`n-${j}`}>{n}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {co.businessProfiles && co.businessProfiles.length > 0 && (
        <BusinessProfilesView profiles={co.businessProfiles} />
      )}
      {co.intelligence && (
        <section className="space-y-3 rounded-xl border p-3">
          <h4 className="font-semibold">Wywiad gospodarczy właścicieli</h4>
          <p className="text-xs text-muted-foreground">
            KRZ / MSiG i publiczne giełdy wierzytelności · sprawdzono{" "}
            {formatDateTime(co.intelligence.checkedAt)}. Wynik oparty tylko na
            nazwie wymaga potwierdzenia tożsamości.
          </p>
          {co.intelligence.subjects.map((subject, i) => (
            <div key={i} className="space-y-1 rounded-lg border bg-muted/20 p-3">
              <div className="font-medium">{subject.name}</div>
              <div className="text-xs text-muted-foreground">
                KRZ/MSiG: {subject.courtStatus === "checked" ? "sprawdzono" : subject.courtStatus === "partial" ? "częściowo" : "niedostępne"}
                {" · "}
                Giełdy: {subject.exchangesStatus === "checked" ? "sprawdzono indeks" : subject.exchangesStatus === "partial" ? "wynik niepełny" : "niedostępne"}
              </div>
              <p className="text-xs text-muted-foreground">{subject.courtNote}</p>
              {subject.hits.length > 0 ? (
                <ul className="list-disc space-y-1 pl-4 text-xs">
                  {subject.hits.map((hit, j) => (
                    <li key={j}>
                      <a href={hit.url} target="_blank" rel="noopener noreferrer" className="underline">
                        {hit.source}: {hit.title}
                      </a>
                      {hit.publicationDate ? ` · ${hit.publicationDate}` : ""}
                      {hit.caseSignature ? ` · sygn. ${hit.caseSignature}` : ""}
                      {" · "}
                      {hit.match === "identifier" ? "identyfikator zgodny" : "tylko nazwa — niezweryfikowane"}
                      {hit.detail && !hit.proceeding ? ` · ${hit.detail}` : ""}
                      {hit.proceeding && <ProceedingReportView report={hit.proceeding} />}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Brak dopasowanych publikacji w sprawdzonym zakresie — nie oznacza braku zadłużenia.
                </p>
              )}
            </div>
          ))}
          <p className="text-xs text-muted-foreground">{co.intelligence.note}</p>
        </section>
      )}
    </div>
  );
}

/** Pogłębiony raport postępowania MSiG (tożsamość potwierdzona identyfikatorem). */
function ProceedingReportView({ report }: { report: CourtProceedingReport }) {
  return (
    <div className="mt-2 space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-2">
      <div className="font-semibold">Pogłębiony raport postępowania</div>
      <dl className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-[max-content_1fr]">
        {proceedingRows(report).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="font-medium">Oś czasu ogłoszeń</div>
      <ol className="space-y-1 border-l pl-3">
        {report.timeline.map((n, i) => (
          <li key={i}>
            <span className="font-medium">{n.publicationDate}</span> · MSiG {n.monitorNumber}
            {n.position ? `, poz. ${n.position}` : ""}
            {n.chapter ? ` — ${n.chapter}` : ""}{" "}
            <a href={n.pdfUrl} target="_blank" rel="noopener noreferrer" className="underline">
              PDF
            </a>
            {n.summary && <div className="text-muted-foreground">{n.summary}…</div>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function KeyValueList({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-1 gap-x-3 gap-y-1 text-xs sm:grid-cols-[max-content_1fr]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Profil gospodarczy klienta i właścicieli (rejestry publiczne + strona firmy). */
function BusinessProfilesView({ profiles }: { profiles: BusinessProfile[] }) {
  return (
    <section className="space-y-3 rounded-xl border p-3">
      <h4 className="font-semibold">Profil gospodarczy</h4>
      <p className="text-xs text-muted-foreground">
        KRS (odpis aktualny i pełny), wykaz podatników VAT, CEIDG, CRBR oraz oficjalna strona firmy
        wskazana w rejestrze (z poszanowaniem robots.txt). Bez danych ze sprawozdań finansowych.
      </p>
      {profiles.map((p, i) => (
        <div key={i} className="space-y-2 rounded-lg border bg-muted/20 p-3">
          <div className="font-medium">{profileHeadline(p)}</div>
          {p.flags.length > 0 && (
            <ul className="space-y-1 text-xs">
              {p.flags.map((f, j) => (
                <li
                  key={j}
                  className={cn(
                    "rounded px-2 py-1",
                    f.level === "alert" && "bg-destructive/10 text-destructive",
                    f.level === "warning" && "bg-amber-500/10",
                    f.level === "info" && "text-muted-foreground",
                  )}
                >
                  <span className="font-medium">{f.source}:</span> {f.text}
                </li>
              ))}
            </ul>
          )}
          {p.ceidg && (
            <div className="space-y-1">
              <div className="text-xs font-medium">CEIDG</div>
              <KeyValueList rows={ceidgRows(p.ceidg)} />
            </div>
          )}
          {p.vat && (
            <div className="space-y-1">
              <div className="text-xs font-medium">Wykaz podatników VAT — {p.vat.name}</div>
              <KeyValueList rows={vatRows(p.vat)} />
            </div>
          )}
          {p.companies.map((c) => (
            <div key={c.krs} className="space-y-1">
              <div className="text-xs font-medium">
                KRS {c.krs} — {c.name}
              </div>
              <KeyValueList rows={companyRows(c)} />
            </div>
          ))}
          {p.websites.map((w) => (
            <div key={w.url} className="space-y-1">
              <div className="text-xs font-medium">Strona WWW</div>
              <KeyValueList rows={websiteRows(w)} />
            </div>
          ))}
          {p.notes.map((n, j) => (
            <p key={j} className="text-xs text-muted-foreground">
              {n}
            </p>
          ))}
        </div>
      ))}
    </section>
  );
}
