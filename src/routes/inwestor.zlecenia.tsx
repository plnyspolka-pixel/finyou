// „Moje zlecenia" — Zlecenia inwestora i Projekty do nich: wnioski w kwocie
// Zlecenia utworzone do 3 dni przed jego złożeniem, ze zdjęciami/dokumentami,
// kwotą, potencjałem lokalizacyjnym i zamaskowaną KW. Raport analityczny
// na żądanie (gotowy przebieg reużywany), a pod nim jeden przycisk:
// „Pobierz dane kontaktowe i rezerwuj". Bez żadnego klikania po stronie admina.
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Building2,
  Clock,
  Eye,
  FileText,
  Loader2,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { OrderCycleSection } from "@/components/inwestor/order-cycle";
import { withdrawInvestorOrder } from "@/lib/investor-agreements/legal-pack.functions";
import {
  getMyOrderProjects,
  orderProjectReport,
  reserveOrderProject,
  type OrderProject,
  type OrderProjectReport,
} from "@/lib/investor-agreements/order-projects.functions";
import { propertyTypeLabels } from "@/lib/labels";

export const Route = createFileRoute("/inwestor/zlecenia")({
  component: MyOrdersPage,
});

const ORDER_STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  zlozone: { label: "Złożone — przyjmujemy", tone: "bg-amber-100 text-amber-800" },
  przyjete: { label: "Przyjęte — szukamy dla Ciebie klienta", tone: "bg-emerald-100 text-emerald-800" },
  wykonane: { label: "Wykonane", tone: "bg-blue-100 text-blue-800" },
  wygasle: { label: "Wygasłe", tone: "bg-slate-100 text-slate-600" },
  cofniete: { label: "Cofnięte", tone: "bg-slate-100 text-slate-600" },
  odmowa: { label: "Odmowa", tone: "bg-red-100 text-red-700" },
};

const PLN = (n: number | null | undefined) =>
  n != null ? `${Number(n).toLocaleString("pl-PL")} zł` : "—";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Wystąpił błąd";
}

const PROJECTS_KEY = ["order-projects"];

function MyOrdersPage() {
  const qc = useQueryClient();
  const fetchProjects = useServerFn(getMyOrderProjects);
  const withdraw = useServerFn(withdrawInvestorOrder);
  const { data, isLoading } = useQuery({
    queryKey: PROJECTS_KEY,
    queryFn: () => fetchProjects(),
    // Raporty w toku dokańcza cron — odświeżamy, gdy któryś trwa.
    refetchInterval: (q) =>
      q.state.data?.orders.some((o) => o.projects.some((p) => p.report.status === "running"))
        ? 20_000
        : 60_000,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: PROJECTS_KEY });
    void qc.invalidateQueries({ queryKey: ["order-cycle"] });
    void qc.invalidateQueries({ queryKey: ["legal-pack-state"] });
  };
  const withdrawMut = useMutation({
    mutationFn: (orderId: string) => withdraw({ data: { orderId } }),
    onSuccess: () => {
      toast.success("Zlecenie cofnięte");
      refresh();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Wczytywanie zleceń…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Moje zlecenia</h1>
        <p className="text-sm text-muted-foreground">
          Do każdego przyjętego Zlecenia pokazujemy Projekty w jego kwocie, utworzone w systemie
          od 3 dni przed złożeniem Zlecenia. Zamów raport analityczny, a potem jednym przyciskiem
          pobierz dane kontaktowe i zarezerwuj Projekt.
        </p>
      </div>

      {data.orders.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Nie masz jeszcze Zleceń.{" "}
            <Link to="/inwestor/umowy" className="underline">
              Złóż Zlecenie
            </Link>
            , a Projekty pojawią się tutaj.
          </CardContent>
        </Card>
      ) : (
        data.orders.map((o) => {
          const st = ORDER_STATUS_LABELS[o.status] ?? { label: o.status, tone: "bg-slate-100" };
          return (
            <Card key={o.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">
                      FY-Z-{o.orderSeq} · do {PLN(o.amountPln)}
                    </CardTitle>
                    <div className="text-xs text-muted-foreground">
                      {o.expiresAt
                        ? `ważne do ${new Date(o.expiresAt).toLocaleDateString("pl-PL")}`
                        : ""}
                      {o.projects.length > 0 ? ` · Projekty: ${o.projects.length}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={st.tone}>{st.label}</Badge>
                    {["zlozone", "przyjete"].includes(o.status) ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={withdrawMut.isPending}
                        onClick={() => withdrawMut.mutate(o.id)}
                      >
                        Cofnij
                      </Button>
                    ) : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {o.status !== "przyjete" ? null : o.projects.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Na razie brak Projektów w tej kwocie. Sprawdzamy na bieżąco — nowy Projekt
                    pojawi się tu automatycznie.
                  </p>
                ) : (
                  o.projects.map((p) => (
                    <ProjectCard
                      key={p.applicationId}
                      project={p}
                      isConsumer={data.isConsumer}
                      assignmentHours={data.limits?.assignmentHours ?? 24}
                      onChanged={refresh}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Odstąpienie Konsumenta i przystąpienie spółki do NDA. */}
      <OrderCycleSection hideMatches />
    </div>
  );
}

// ── Projekt ──────────────────────────────────────────────────────────────────

function ProjectCard({
  project: p,
  isConsumer,
  assignmentHours,
  onChanged,
}: {
  project: OrderProject;
  isConsumer: boolean;
  assignmentHours: number;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const reportFn = useServerFn(orderProjectReport);
  const reserveFn = useServerFn(reserveOrderProject);
  const [report, setReport] = useState<OrderProjectReport>(p.report);
  const [showReport, setShowReport] = useState(p.report.status === "done");
  const [kartaOk, setKartaOk] = useState(false);
  const [karaOk, setKaraOk] = useState(false);
  const [reserved, setReserved] = useState<{
    contact: OrderProject["contact"];
    reservationExpiresAt: string | null;
  } | null>(
    p.match && ["rezerwacja", "transakcja"].includes(p.match.status)
      ? { contact: p.contact, reservationExpiresAt: p.match.reservationExpiresAt }
      : null,
  );
  // Nowe dane z serwera (np. cron dokończył ryzyko) nadpisują lokalny stan.
  if (p.report.finishedAt && p.report.finishedAt !== report.finishedAt) setReport(p.report);

  const reportMut = useMutation({
    mutationFn: () =>
      reportFn({ data: { orderId: p.orderId, applicationId: p.applicationId } }),
    onSuccess: (res) => {
      setReport(res.report);
      setShowReport(true);
      toast.success(
        res.reused
          ? "Raport był już wygenerowany — pokazujemy gotowy."
          : res.report.status === "running"
            ? "Raport w przygotowaniu — ocenę ryzyka dokończymy za chwilę."
            : "Raport gotowy.",
      );
      void qc.invalidateQueries({ queryKey: PROJECTS_KEY });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const reserveMut = useMutation({
    mutationFn: () =>
      reserveFn({
        data: {
          orderId: p.orderId,
          applicationId: p.applicationId,
          kartaLeadaConfirmed: true,
          karaConfirmed: karaOk,
        },
      }),
    onSuccess: (res) => {
      setReserved({ contact: res.contact, reservationExpiresAt: res.reservationExpiresAt });
      toast.success(`Projekt zarezerwowany na ${assignmentHours} h — dane kontaktowe odsłonięte.`);
      onChanged();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const hero = p.photos[0]?.url ?? null;
  const location = [p.city, p.voivodeship].filter(Boolean).join(", ");
  const typeLabel = p.propertyType ? (propertyTypeLabels[p.propertyType] ?? p.propertyType) : null;
  const finished = p.match && ["odrzucone", "przekazane", "wygasle"].includes(p.match.status);

  return (
    <div className="rounded-lg border">
      <div className="grid gap-4 p-4 sm:grid-cols-[160px_1fr]">
        <div className="overflow-hidden rounded-md bg-muted">
          {hero ? (
            <img src={hero} alt="" className="h-36 w-full object-cover sm:h-full" loading="lazy" />
          ) : (
            <div className="flex h-36 items-center justify-center text-muted-foreground sm:h-full">
              <Building2 className="h-8 w-8" />
            </div>
          )}
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-medium">
              {p.match ? `Projekt ${p.match.projectRef}` : "Projekt"}
              {typeLabel ? <span className="text-muted-foreground"> · {typeLabel}</span> : null}
            </div>
            {p.match ? <MatchBadge status={p.match.status} /> : null}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
            <Info k="Wnioskowana kwota" v={PLN(p.loanAmount)} strong />
            <Info k="Okres" v={p.periodMonths ? `${p.periodMonths} mies.` : "—"} />
            <Info k="Oprocentowanie" v={p.annualRate ? `${p.annualRate}% rocznie` : "—"} />
            <Info k="Wartość szacunkowa" v={PLN(p.estimatedValue)} />
            <Info k="Powierzchnia" v={p.areaSqm ? `${p.areaSqm} m²` : "—"} />
            <Info k="LTV" v={p.ltv != null ? `${Math.round(p.ltv * 100) / 100}` : "—"} />
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {location}
              </span>
            ) : null}
            <LocationScore score={p.locationScore} />
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> KW: {p.kwMasked ?? "brak"}
            </span>
            <span className="text-muted-foreground">
              w systemie od {new Date(p.createdAt).toLocaleDateString("pl-PL")}
            </span>
          </div>
          {p.description ? (
            <p className="line-clamp-3 text-xs text-muted-foreground">{p.description}</p>
          ) : null}
          <FilesRow photos={p.photos} files={p.files} />
        </div>
      </div>

      {finished ? null : (
        <div className="space-y-3 border-t p-4">
          {/* Raport analityczny */}
          <div className="flex flex-wrap items-center gap-2">
            {report.status === "done" || report.status === "running" ? (
              <Button size="sm" variant="outline" onClick={() => setShowReport((s) => !s)}>
                <Sparkles className="mr-2 h-4 w-4" />
                {showReport ? "Ukryj raport" : "Pokaż raport analityczny"}
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={reportMut.isPending || !p.hasKw}
                title={!p.hasKw ? "Projekt nie ma numeru KW" : undefined}
                onClick={() => reportMut.mutate()}
              >
                {reportMut.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Zamów raport analityczny
              </Button>
            )}
            {report.status === "running" ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> raport w przygotowaniu
              </span>
            ) : null}
            {report.status === "error" ? (
              <span className="text-xs text-red-700">
                Raport nie powiódł się{report.error ? `: ${report.error}` : ""}.{" "}
                <button className="underline" onClick={() => reportMut.mutate()}>
                  Spróbuj ponownie
                </button>
              </span>
            ) : null}
          </div>
          {showReport && (report.status === "done" || report.status === "running") ? (
            <ReportView report={report} />
          ) : null}

          {/* Pobierz dane kontaktowe i rezerwuj */}
          {reserved ? (
            <ContactBox
              contact={reserved.contact}
              applicationId={p.applicationId}
              reservationExpiresAt={reserved.reservationExpiresAt}
            />
          ) : (
            <div className="space-y-2 rounded-md bg-muted/40 p-3">
              <div className="flex items-start gap-2">
                <Checkbox
                  id={`karta-${p.applicationId}`}
                  checked={kartaOk}
                  onCheckedChange={(v) => setKartaOk(Boolean(v))}
                />
                <Label htmlFor={`karta-${p.applicationId}`} className="text-xs leading-snug">
                  Przyjmuję Kartę Leada (Zał. 1) dla tego Projektu i rezerwuję go na{" "}
                  {assignmentHours} h — po Ujawnieniu otrzymuję dane kontaktowe klienta.
                </Label>
              </div>
              {isConsumer ? (
                <div className="flex items-start gap-2">
                  <Checkbox
                    id={`kara-${p.applicationId}`}
                    checked={karaOk}
                    onCheckedChange={(v) => setKaraOk(Boolean(v))}
                  />
                  <Label htmlFor={`kara-${p.applicationId}`} className="text-xs leading-snug">
                    Jako Konsument indywidualnie uzgadniam Karę Obejściową (§ 11 Umowy ramowej).
                  </Label>
                </div>
              ) : null}
              <Button
                size="sm"
                disabled={!kartaOk || (isConsumer && !karaOk) || reserveMut.isPending}
                onClick={() => reserveMut.mutate()}
              >
                {reserveMut.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Phone className="mr-2 h-4 w-4" />
                )}
                Pobierz dane kontaktowe i rezerwuj
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Info({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div>
      <span className="text-muted-foreground">{k}: </span>
      <span className={strong ? "font-semibold" : "font-medium"}>{v}</span>
    </div>
  );
}

function MatchBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: string }> = {
    dopasowane: { label: "Dopasowany", tone: "bg-slate-100 text-slate-700" },
    teaser: { label: "Dopasowany", tone: "bg-slate-100 text-slate-700" },
    karta_leada: { label: "Karta Leada przyjęta", tone: "bg-blue-100 text-blue-800" },
    rezerwacja: { label: "Zarezerwowany", tone: "bg-emerald-100 text-emerald-800" },
    transakcja: { label: "Transakcja", tone: "bg-emerald-100 text-emerald-800" },
    odrzucone: { label: "Odrzucony", tone: "bg-slate-100 text-slate-600" },
    przekazane: { label: "Przekazany dalej", tone: "bg-slate-100 text-slate-600" },
    wygasle: { label: "Rezerwacja wygasła", tone: "bg-slate-100 text-slate-600" },
  };
  const s = map[status] ?? { label: status, tone: "bg-slate-100" };
  return <Badge className={s.tone}>{s.label}</Badge>;
}

function LocationScore({ score }: { score: number | null }) {
  if (score == null) {
    return <span className="text-xs text-muted-foreground">potencjał lokalizacji: w analizie</span>;
  }
  const tone =
    score >= 70
      ? "bg-emerald-100 text-emerald-800"
      : score >= 50
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-700";
  return <Badge className={tone}>Potencjał lokalizacji: {Math.round(score)}/100</Badge>;
}

function FilesRow({
  photos,
  files,
}: {
  photos: OrderProject["photos"];
  files: OrderProject["files"];
}) {
  if (photos.length === 0 && files.length === 0) {
    return <p className="text-xs text-muted-foreground">Brak zdjęć i dokumentów.</p>;
  }
  return (
    <div className="space-y-1">
      {photos.length > 1 ? (
        <div className="flex gap-1 overflow-x-auto">
          {photos.slice(1, 7).map((ph) => (
            <a key={ph.url} href={ph.url} target="_blank" rel="noreferrer" className="shrink-0">
              <img src={ph.url} alt="" className="h-14 w-20 rounded object-cover" loading="lazy" />
            </a>
          ))}
          {photos.length > 7 ? (
            <span className="self-center text-xs text-muted-foreground">
              +{photos.length - 7}
            </span>
          ) : null}
        </div>
      ) : null}
      {files.length > 0 ? (
        <div className="flex flex-wrap gap-2 text-xs">
          {files.map((f) => (
            <a
              key={f.url}
              href={f.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline"
            >
              <FileText className="h-3.5 w-3.5" /> {f.name}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReportView({ report: r }: { report: OrderProjectReport }) {
  const v = r.valuation;
  return (
    <div className="space-y-3 rounded-md border bg-background p-3 text-xs">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <div className="font-medium">Potencjał lokalizacji</div>
          <div>{r.locationScore != null ? `${Math.round(r.locationScore)}/100` : "w analizie"}</div>
        </div>
        <div>
          <div className="font-medium">Analiza księgi wieczystej</div>
          {r.kwAnalysis ? (
            <div>
              {r.kwAnalysis.overallStatus}
              {r.kwAnalysis.unresolvedCount > 0
                ? ` · ${r.kwAnalysis.unresolvedCount} kwestii do wyjaśnienia`
                : " · bez zastrzeżeń"}
            </div>
          ) : (
            <div className="text-muted-foreground">w przygotowaniu</div>
          )}
        </div>
        <div>
          <div className="font-medium">Właściciele w KW</div>
          {r.owners ? (
            <div>
              {r.owners.totalInKw != null ? `${r.owners.totalInKw} os. · ` : ""}
              {r.owners.summary ?? ""}
            </div>
          ) : (
            <div className="text-muted-foreground">w przygotowaniu</div>
          )}
        </div>
      </div>
      {r.kwAnalysis && r.kwAnalysis.findings.length > 0 ? (
        <ul className="list-disc space-y-0.5 pl-4">
          {r.kwAnalysis.findings.slice(0, 6).map((f, i) => (
            <li key={i}>
              <span className="font-medium">{f.title}</span>
              {f.investorMessage ? ` — ${f.investorMessage}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {r.owners && r.owners.warnings.length > 0 ? (
        <ul className="list-disc pl-4 text-amber-800">
          {r.owners.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      ) : null}
      <div>
        <div className="font-medium">Wycena i ryzyko</div>
        {v ? (
          <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
            <span>
              Wartość prognozowana: {PLN(v.predictedValue.lowPln)} – {PLN(v.predictedValue.highPln)}{" "}
              (śr. {PLN(v.predictedValue.midPln)})
            </span>
            <span>Trend rynku: {v.predictedValue.marketTrend}</span>
            <span>
              Sugerowana maks. pożyczka: {PLN(v.predictedValue.suggestedMaxLoanAmountPln)}
              {v.predictedValue.suggestedLtvCapPercent != null
                ? ` (LTV do ${v.predictedValue.suggestedLtvCapPercent}%)`
                : ""}
            </span>
            <span>
              Szybka sprzedaż: {PLN(v.quickSale.expectedLowPln)} – {PLN(v.quickSale.expectedHighPln)}
            </span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-1 text-muted-foreground">
            {r.status === "running" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            ocena ryzyka w przygotowaniu (kilka minut)
          </div>
        )}
      </div>
    </div>
  );
}

function ContactBox({
  contact,
  applicationId,
  reservationExpiresAt,
}: {
  contact: OrderProject["contact"];
  applicationId: string;
  reservationExpiresAt: string | null;
}) {
  return (
    <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium text-emerald-900">Projekt zarezerwowany — dane kontaktowe</div>
        {reservationExpiresAt ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-900">
            <Clock className="h-3.5 w-3.5" /> rezerwacja do{" "}
            {new Date(reservationExpiresAt).toLocaleString("pl-PL")}
          </span>
        ) : null}
      </div>
      {contact ? (
        <div className="grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-3">
          <span>Klient: {contact.name ?? "—"}</span>
          <span>
            Telefon:{" "}
            {contact.phone ? (
              <a href={`tel:${contact.phone}`} className="underline">
                {contact.phone}
              </a>
            ) : (
              "—"
            )}
          </span>
          <span>
            E-mail:{" "}
            {contact.email ? (
              <a href={`mailto:${contact.email}`} className="underline">
                {contact.email}
              </a>
            ) : (
              "—"
            )}
          </span>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Dane kontaktowe klienta znajdziesz w pełnym widoku Projektu.
        </p>
      )}
      <Button asChild size="sm" variant="outline">
        <Link to="/inwestor/wniosek/$id" params={{ id: applicationId }}>
          <Eye className="mr-2 h-4 w-4" /> Pełne dane Projektu (KW, dokumenty, czat)
        </Link>
      </Button>
    </div>
  );
}
