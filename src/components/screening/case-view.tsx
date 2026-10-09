// Widok sprawy: dane podmiotu i rekord źródłowy obok siebie, rozbicie
// scoringu, link do źródła, oświadczenie PEP, wnioski klienta i przyciski
// decyzji z obowiązkowym uzasadnieniem.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Loader2, PauseCircle, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  assignScreeningCase,
  decideScreeningCase,
  getScreeningCase,
} from "@/lib/screening/screening.functions";
import {
  DECISION_LABELS,
  SUBJECT_TYPE_LABELS,
  type Json,
  type ScreeningHit,
} from "@/lib/screening/types";
import { PEP_POSITION_CATEGORIES } from "@/lib/screening/declaration";
import {
  CaseTypeBadge,
  PepStatusBadge,
  PriorityBadge,
  SOURCE_NAMES,
  SanctionsStatusBadge,
  ScoreBar,
  fmtDate,
} from "./shared";
import { SubjectEddPanel } from "./subject-edd-panel";

const DOB_LABELS: Record<string, string> = {
  exact: "zgodna data urodzenia",
  year_match: "zgodny rok urodzenia",
  mismatch: "NIEZGODNA data urodzenia",
  missing_reference: "brak daty w źródle",
  missing_subject: "brak daty u podmiotu",
  not_applicable: "nie dotyczy (podmiot)",
};

const TIME_LABELS: Record<string, string> = {
  current: "pełni funkcję",
  within_grace: "zakończył funkcję < 12 mies. temu (nadal PEP)",
  former: "były PEP (> 12 mies.) — do oceny ryzyka",
};

function str(v: Json | undefined): string {
  if (v == null) return "—";
  if (Array.isArray(v))
    return v.length
      ? v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ")
      : "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v) || "—";
}

function Row({ label, left, right }: { label: string; left: string; right: string }) {
  return (
    <div className="grid grid-cols-[9rem_1fr_1fr] gap-3 border-b py-1.5 text-sm last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

function HitCard({
  hit,
  subject,
  thresholds,
}: {
  hit: ScreeningHit;
  subject: {
    full_name: string;
    birth_date: string | null;
    birth_year: number | null;
    nationality: string[];
  };
  thresholds: { possible: number; strong: number };
}) {
  const ref = hit.reference_snapshot;
  const b = hit.score_breakdown;
  const isPep = hit.reference_type === "pep";
  const positions =
    (isPep
      ? (ref.positions as
          | Array<{ title: string; from: string | null; to: string | null }>
          | undefined)
      : null) ?? [];
  const names = isPep
    ? [str(ref.full_name), ...((ref.aliases as string[] | undefined) ?? []).slice(0, 5)]
    : ((ref.names as Array<{ name: string }> | undefined) ?? []).map((n) => n.name).slice(0, 8);
  const url = (ref.source_url as string | null) ?? null;
  return (
    <Card
      className={
        hit.band === "strong" ? "border-red-300" : hit.band === "possible" ? "border-amber-300" : ""
      }
    >
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm">
          {SOURCE_NAMES[str(isPep ? ref.source : ref.list_name)] ??
            str(isPep ? ref.source : ref.list_name)}{" "}
          · {isPep ? str(ref.full_name) : str(ref.primary_name)}
        </CardTitle>
        <div className="flex items-center gap-3">
          <ScoreBar score={hit.score} {...thresholds} />
          <span className="text-xs text-muted-foreground">{hit.status}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-[9rem_1fr_1fr] gap-3 text-xs font-semibold uppercase text-muted-foreground">
          <span />
          <span>Podmiot (nasze dane)</span>
          <span>Rekord źródłowy</span>
        </div>
        <Row label="Imię i nazwisko" left={subject.full_name} right={names.join(" · ")} />
        <Row
          label="Data urodzenia"
          left={subject.birth_date ?? (subject.birth_year ? String(subject.birth_year) : "—")}
          right={isPep ? str(ref.birth_date ?? ref.birth_year) : str(ref.birth_dates)}
        />
        <Row
          label="Obywatelstwo / kraj"
          left={subject.nationality?.join(", ") || "—"}
          right={str(isPep ? ref.nationality : ref.nationalities)}
        />
        {isPep ? (
          <Row
            label="Stanowiska"
            left=""
            right={
              positions
                .map((p) => `${p.title} (${p.from ?? "?"} – ${p.to ?? "obecnie"})`)
                .join("; ") || "—"
            }
          />
        ) : (
          <>
            <Row
              label="Program / lista"
              left=""
              right={`${str(ref.programme)} · wpis ${str(ref.listed_at)}`}
            />
            <Row label="Uwagi" left="" right={str(ref.remarks)} />
          </>
        )}
        <div className="rounded-md bg-muted/40 p-3 text-xs leading-relaxed">
          <p className="mb-1 font-semibold">Rozbicie scoringu</p>
          <p>
            Podobieństwo nazw: <b>{str(b.nameScore)}</b> („{str(b.matchedSubjectName)}” ↔ „
            {str(b.matchedReferenceName)}”), pary tokenów:{" "}
            {(
              (b.tokenPairs as
                | Array<{ subject: string; reference: string; similarity: number }>
                | undefined) ?? []
            )
              .map((p) => `${p.subject}↔${p.reference} ${p.similarity}`)
              .join(", ")}
            {Number(b.unmatchedTokens) > 0
              ? `, niedopasowane tokeny: ${str(b.unmatchedTokens)}`
              : ""}
          </p>
          <p>
            Data urodzenia: {DOB_LABELS[str(b.dob)] ?? str(b.dob)} (
            {Number(b.dobAdjustment) >= 0 ? "+" : ""}
            {str(b.dobAdjustment)}) · Obywatelstwo: {str(b.nationality)} (+
            {str(b.nationalityAdjustment)})
            {b.capApplied ? ` · ograniczenie wyniku: ${str(b.capApplied)}` : ""}
          </p>
          {isPep && b.pepTimeStatus ? (
            <p>Status czasowy: {TIME_LABELS[str(b.pepTimeStatus)] ?? str(b.pepTimeStatus)}</p>
          ) : null}
          <p>
            Wynik końcowy: <b>{hit.score}</b> / 100
          </p>
        </div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm underline"
          >
            Otwórz rekord w źródle <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </CardContent>
    </Card>
  );
}

export function ScreeningCaseView({ caseId }: { caseId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getScreeningCase);
  const decideFn = useServerFn(decideScreeningCase);
  const assignFn = useServerFn(assignScreeningCase);
  const q = useQuery({
    queryKey: ["screening-case", caseId],
    queryFn: () => getFn({ data: { caseId } }),
  });
  const [decision, setDecision] = useState<string>("");
  const [relation, setRelation] = useState<"family_member" | "close_associate">("family_member");
  const [justification, setJustification] = useState("");

  const decide = useMutation({
    mutationFn: () =>
      decideFn({
        data: {
          caseId,
          decision: decision as never,
          justification,
          relation: decision === "confirmed_family_or_associate" ? relation : null,
        },
      }),
    onSuccess: () => {
      toast.success("Decyzja zapisana.");
      void qc.invalidateQueries({ queryKey: ["screening-case", caseId] });
      void qc.invalidateQueries({ queryKey: ["screening-cases"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const assign = useMutation({
    mutationFn: () => assignFn({ data: { caseId } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["screening-case", caseId] }),
    onError: (e) => toast.error((e as Error).message),
  });

  if (q.isLoading) return <Loader2 className="h-5 w-5 animate-spin" />;
  if (q.error) return <p className="text-sm text-destructive">{(q.error as Error).message}</p>;
  const d = q.data!;
  const c = d.case;
  const thresholds = {
    possible: Number(d.run?.settings_snapshot?.possible ?? 70),
    strong: Number(d.run?.settings_snapshot?.strong ?? 90),
  };
  const ownerKind = d.subject.client_id ? "client" : d.subject.investor_id ? "investor" : null;
  const ownerId = d.subject.client_id ?? d.subject.investor_id;
  const answers = d.declaration?.answers ?? {};

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Sprawa {c.case_no}</h1>
        <PriorityBadge priority={c.priority} />
        <CaseTypeBadge type={c.case_type} />
        {c.application_hold && !c.decision && (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-red-700">
            <PauseCircle className="h-4 w-4" /> proces wniosku wstrzymany do decyzji
          </span>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Podmiot</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <b>{d.subject.full_name}</b> ·{" "}
            {SUBJECT_TYPE_LABELS[d.subject.subject_type] ?? d.subject.subject_type}
            {d.subject.relation ? ` · ${d.subject.relation}` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <PepStatusBadge status={d.status?.pep_status ?? "unknown"} />
            <SanctionsStatusBadge status={d.status?.sanctions_status ?? "unknown"} />
          </div>
          {ownerKind && ownerId && (
            <Link
              to="/admin/screening-podmiot/$kind/$id"
              params={{ kind: ownerKind, id: ownerId }}
              className="underline"
            >
              Karta screeningu {ownerKind === "client" ? "klienta" : "inwestora"} i historia
              sprawdzeń →
            </Link>
          )}
          {d.applications.length > 0 && (
            <ul className="list-disc pl-5 text-muted-foreground">
              {d.applications.map((a) => (
                <li key={a.id}>
                  <Link to="/admin/wnioski/$id" params={{ id: a.id }} className="underline">
                    Wniosek {a.id.slice(0, 8)}
                  </Link>{" "}
                  · status {a.status} · AML: {a.aml_status ?? "—"}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {d.declaration && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Oświadczenie PEP ({fmtDate(d.declaration.signed_at)})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              PEP: <b>{answers.is_pep ? "TAK" : "nie"}</b>
              {answers.is_pep
                ? ` — ${PEP_POSITION_CATEGORIES.find((x) => x.code === answers.pep_position_category)?.label ?? str(answers.pep_position_category)}${answers.pep_position_detail ? ` (${str(answers.pep_position_detail)})` : ""}`
                : ""}
            </p>
            <p>
              Członek rodziny PEP: <b>{answers.is_family_member ? "TAK" : "nie"}</b> · Bliski
              współpracownik: <b>{answers.is_close_associate ? "TAK" : "nie"}</b>
            </p>
            {d.declaration.related_persons.map((p, i) => (
              <p key={i} className="text-muted-foreground">
                {p.relation === "family" ? "Rodzina" : "Współpracownik"}: {p.first_name}{" "}
                {p.last_name} — {p.position}
              </p>
            ))}
            <p className="text-xs text-muted-foreground">
              Wersja treści {d.declaration.declaration_text_version} · IP {d.declaration.ip ?? "—"}{" "}
              · kanał {d.declaration.channel ?? "—"}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Trafienia ({d.hits.length})</h2>
        {d.hits.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Sprawa z oświadczenia — bez trafień automatu.
          </p>
        )}
        {d.hits.map((h) => (
          <HitCard key={h.id} hit={h} subject={d.subject} thresholds={thresholds} />
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Decyzja</CardTitle>
          {!c.decision && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => assign.mutate()}
              disabled={assign.isPending}
            >
              <UserCheck className="mr-1 h-4 w-4" />{" "}
              {c.assigned_to ? "Przejmij sprawę" : "Przypisz do mnie"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {c.decision ? (
            <div className="space-y-1 text-sm">
              <p>
                <b>{DECISION_LABELS[c.decision] ?? c.decision}</b> · {fmtDate(c.decided_at)}
              </p>
              <p className="whitespace-pre-wrap text-muted-foreground">{c.justification}</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {d.allowedDecisions.map((o) => (
                  <Button
                    key={o.value}
                    type="button"
                    variant={decision === o.value ? "default" : "outline"}
                    className={o.value === "sanctions_hit" ? "border-red-400" : ""}
                    onClick={() => setDecision(o.value)}
                  >
                    {o.label}
                  </Button>
                ))}
              </div>
              {decision === "confirmed_family_or_associate" && (
                <select
                  aria-label="Rodzaj powiązania"
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  value={relation}
                  onChange={(e) => setRelation(e.target.value as never)}
                >
                  <option value="family_member">członek rodziny PEP</option>
                  <option value="close_associate">bliski współpracownik PEP</option>
                </select>
              )}
              {decision === "sanctions_hit" && (
                <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">
                  Potwierdzenie natychmiast wstrzyma wszystkie operacje klienta i wyśle e-mail do
                  osoby odpowiedzialnej za AML oraz do zarządu. Zawiadomienie GIIF i dalsze kroki
                  wykonuje człowiek.
                </p>
              )}
              <div className="space-y-1">
                <Label htmlFor="justification">Uzasadnienie (obowiązkowe)</Label>
                <Textarea
                  id="justification"
                  rows={4}
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Np. inna data urodzenia (PESEL) i inne miejsce urodzenia niż w rekordzie źródłowym; sprawdzono dowód osobisty."
                />
              </div>
              <Button
                onClick={() => decide.mutate()}
                disabled={!decision || justification.trim().length < 10 || decide.isPending}
              >
                {decide.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Zapisz decyzję (ostateczna)
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {d.status &&
        (d.status.board_approval_required ||
          d.status.enhanced_monitoring ||
          d.status.operations_hold) && (
          <SubjectEddPanel
            subjectId={d.subject.id}
            status={d.status}
            onChanged={() => void qc.invalidateQueries({ queryKey: ["screening-case", caseId] })}
          />
        )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historia sprawy (dziennik audytu)</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-1 text-xs">
            {d.audit.map((a) => (
              <li key={a.id} className="font-mono">
                #{a.id} {fmtDate(a.created_at)} · {a.event_type} ·{" "}
                {a.actor_kind === "user" ? a.actor_id : "automat"}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
