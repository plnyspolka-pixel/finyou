// Silnik przebiegu screeningu jednego podmiotu: wstępna selekcja (pg_trgm),
// scoring, pamięć fałszywych trafień, zapis przebiegu i trafień, utworzenie
// lub aktualizacja sprawy, status podmiotu, powiadomienia, log audytowy.
//
// Automat zamyka sam wyłącznie „brak trafień” (i tylko gdy oświadczenie = „nie”).
// Każde trafienie ≥ progu oraz oświadczenie „tak” → sprawa do decyzji człowieka.
import { nameVariants } from "./normalize";
import { scoreMatch, type ScoreBreakdown, type ScoreReference } from "./scoring";
import {
  chunk,
  getScreeningSettings,
  screeningAudit,
  scoringFrom,
  sdb,
  sourcesVersions,
  type ScreeningSettings,
} from "./db.server";
import { pepTimeStatus } from "./import.server";
import { notifyNewCase } from "./notify.server";
import { declarantSubject, type SubjectRow } from "./subjects.server";

export type RunTrigger =
  | "onboarding"
  | "rescreening"
  | "data_change"
  | "list_change"
  | "declaration"
  | "manual";
export type RunScope = "all" | "pep" | "sanctions";

interface PepRef {
  id: string;
  source: string;
  source_id: string;
  full_name: string;
  aliases: string[];
  birth_date: string | null;
  birth_year: number | null;
  nationality: string[];
  positions: Array<{
    title: string;
    catalogCode: string | null;
    from: string | null;
    to: string | null;
  }>;
  is_current: boolean;
  latest_position_end: string | null;
  source_url: string | null;
  record_hash: string;
}

interface SanctionRef {
  id: string;
  list_name: string;
  source_id: string;
  entity_type: string;
  names: Array<{ name: string }>;
  primary_name: string;
  birth_dates: string[];
  nationalities: string[];
  programme: string | null;
  listed_at: string | null;
  remarks: string | null;
  source_url: string | null;
  record_hash: string;
}

interface HitDraft {
  reference_type: "pep" | "sanction";
  reference_id: string;
  reference_hash: string;
  reference_snapshot: Record<string, unknown>;
  score: number;
  score_breakdown: ScoreBreakdown & { pepTimeStatus?: string; source: string };
  band: "none" | "possible" | "strong";
  status: "logged" | "suppressed_false_positive" | "pending_review";
}

export interface ScreenResult {
  runId: string | null;
  result: "no_hits" | "possible_match" | "strong_match" | "declaration_yes" | "error" | "skipped";
  caseIds: string[];
  maxScore: number;
}

const PRIORITY_RANK = { normal: 0, high: 1, critical: 2 } as const;

function subjectKeys(s: SubjectRow): { keys: string[]; surnames: string[] } {
  const entity = s.kind === "entity";
  const keys = new Set<string>();
  const surnames = new Set<string>();
  for (const v of nameVariants(s.full_name, { entity })) {
    keys.add(v.key);
    if (!entity && v.tokens.length >= 2) keys.add([...v.tokens.slice(1), v.tokens[0]].join(" "));
    if (!entity && !s.last_name)
      v.tokens.filter((t) => t.length > 2).forEach((t) => surnames.add(t));
  }
  if (!entity && s.last_name) {
    for (const v of nameVariants(s.last_name)) {
      surnames.add(v.key);
      v.tokens.filter((t) => t.length > 2).forEach((t) => surnames.add(t));
    }
  }
  return { keys: [...keys], surnames: [...surnames] };
}

async function loadRefs<T>(table: string, ids: string[]): Promise<T[]> {
  const out: T[] = [];
  for (const part of chunk(ids, 150)) {
    const { data, error } = await sdb.from(table).select("*").in("id", part);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

async function latestDeclaration(owner: { type: "client" | "investor"; id: string }) {
  const { data } = await sdb
    .from("pep_declarations")
    .select("id, any_yes, signed_at, answers, related_persons, declaration_text_version")
    .eq("subject_type", owner.type)
    .eq("subject_id", owner.id)
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { id: string; any_yes: boolean; signed_at: string } | null;
}

/** Otwarta (bez decyzji) sprawa podmiotu danego typu — nowe trafienia dopisujemy do niej. */
async function openCase(subjectId: string, caseType: string) {
  const { data } = await sdb
    .from("screening_cases")
    .select("id, case_no, hits, priority, max_score, application_hold")
    .eq("subject_id", subjectId)
    .eq("case_type", caseType)
    .is("decision", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data as {
    id: string;
    case_no: number;
    hits: string[];
    priority: keyof typeof PRIORITY_RANK;
    max_score: number | null;
    application_hold: boolean;
  } | null;
}

async function upsertCase(opts: {
  subject: SubjectRow;
  runId: string;
  caseType: "pep" | "sanctions" | "declaration";
  hitIds: string[];
  priority: keyof typeof PRIORITY_RANK;
  maxScore: number | null;
  hold: boolean;
  declarationId?: string | null;
  settings: ScreeningSettings;
}): Promise<{ id: string; created: boolean }> {
  const existing = await openCase(opts.subject.id, opts.caseType);
  if (existing) {
    const priority =
      PRIORITY_RANK[opts.priority] > PRIORITY_RANK[existing.priority]
        ? opts.priority
        : existing.priority;
    await sdb
      .from("screening_cases")
      .update({
        hits: [...new Set([...(existing.hits ?? []), ...opts.hitIds])],
        priority,
        max_score: Math.max(existing.max_score ?? 0, opts.maxScore ?? 0) || null,
        application_hold: existing.application_hold || opts.hold,
        run_id: opts.runId,
      })
      .eq("id", existing.id);
    await screeningAudit({
      eventType: "case.updated",
      entityType: "case",
      entityId: existing.id,
      subjectId: opts.subject.id,
      details: {
        runId: opts.runId,
        addedHits: opts.hitIds.length,
        priority,
        hold: existing.application_hold || opts.hold,
      },
    });
    return { id: existing.id, created: false };
  }
  const { data, error } = await sdb
    .from("screening_cases")
    .insert({
      subject_type: opts.subject.subject_type,
      subject_id: opts.subject.id,
      run_id: opts.runId,
      case_type: opts.caseType,
      priority: opts.priority,
      hits: opts.hitIds,
      max_score: opts.maxScore,
      application_hold: opts.hold,
      declaration_id: opts.declarationId ?? null,
    })
    .select("id, case_no")
    .single();
  if (error) throw new Error(`screening_cases: ${error.message}`);
  await screeningAudit({
    eventType: "case.created",
    entityType: "case",
    entityId: data.id,
    subjectId: opts.subject.id,
    details: {
      runId: opts.runId,
      caseType: opts.caseType,
      priority: opts.priority,
      hold: opts.hold,
      hits: opts.hitIds.length,
      maxScore: opts.maxScore,
    },
  });
  try {
    await notifyNewCase(opts.settings, {
      id: data.id,
      case_no: data.case_no,
      case_type: opts.caseType,
      priority: opts.priority,
      max_score: opts.maxScore,
    });
  } catch (e) {
    console.error("[screening] powiadomienie nie wysłane", e);
  }
  return { id: data.id, created: true };
}

/** Informacyjny znacznik na wnioskach klienta (twardą blokadę egzekwuje trigger w bazie). */
async function markApplications(subject: SubjectRow, status: "wstrzymany_screening") {
  if (!subject.client_id) return;
  await sdb
    .from("loan_applications")
    .update({ aml_status: status, aml_checked_at: new Date().toISOString() })
    .eq("client_id", subject.client_id)
    .is("deleted_at", null);
}

export async function screenSubject(
  subject: SubjectRow,
  opts: {
    trigger: RunTrigger;
    scope?: RunScope;
    settings?: ScreeningSettings;
    versions?: Record<string, string>;
    actorId?: string | null;
  },
): Promise<ScreenResult> {
  if (!subject.is_active) return { runId: null, result: "skipped", caseIds: [], maxScore: 0 };
  const settings = opts.settings ?? (await getScreeningSettings());
  const scoring = scoringFrom(settings);
  const scope = opts.scope ?? "all";
  const versions = opts.versions ?? (await sourcesVersions());
  const entity = subject.kind === "entity";
  const refTypes = entity
    ? ["sanction"]
    : scope === "pep"
      ? ["pep"]
      : scope === "sanctions"
        ? ["sanction"]
        : ["pep", "sanction"];

  // Oświadczenie właściciela (klient / inwestor) — tylko dla podmiotu-deklaranta.
  const owner = subject.client_id
    ? { type: "client" as const, id: subject.client_id }
    : subject.investor_id
      ? { type: "investor" as const, id: subject.investor_id }
      : null;
  let declaration: Awaited<ReturnType<typeof latestDeclaration>> = null;
  if (owner && scope !== "sanctions") {
    const declarant = await declarantSubject(owner.type, owner.id);
    if (declarant?.id === subject.id) declaration = await latestDeclaration(owner);
  }

  const { keys, surnames } = subjectKeys(subject);
  const { data: run, error: runErr } = await sdb
    .from("screening_runs")
    .insert({
      subject_type: subject.subject_type,
      subject_id: subject.id,
      trigger: opts.trigger,
      scope,
      subject_snapshot: {
        full_name: subject.full_name,
        birth_date: subject.birth_date,
        birth_year: subject.birth_year,
        nationality: subject.nationality,
        kind: subject.kind,
        subject_type: subject.subject_type,
        relation: subject.relation,
        fingerprint: subject.subject_fingerprint,
        keys,
      },
      sources_versions: versions,
      settings_snapshot: {
        possible: settings.possible_match_threshold,
        strong: settings.strong_match_threshold,
        dobExactBonus: settings.dob_exact_bonus,
        dobYearBonus: settings.dob_year_bonus,
        dobMismatchPenalty: settings.dob_mismatch_penalty,
        nationalityBonus: settings.nationality_bonus,
        pepGraceMonths: settings.pep_grace_months,
        candidateMinSimilarity: settings.candidate_min_similarity,
      },
      declaration_id: declaration?.id ?? null,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (runErr) throw new Error(`screening_runs: ${runErr.message}`);
  const runId: string = run.id;

  try {
    const { data: cands, error: cErr } = await sdb.rpc("screening_find_candidates", {
      p_keys: keys,
      p_surnames: surnames,
      p_reference_types: refTypes,
      p_min_similarity: settings.candidate_min_similarity,
      p_limit: settings.candidate_limit,
    });
    if (cErr) throw new Error(`screening_find_candidates: ${cErr.message}`);
    const candidates = (cands ?? []) as Array<{
      reference_type: "pep" | "sanction";
      reference_id: string;
    }>;
    const pepRefs = await loadRefs<PepRef>(
      "pep_reference_persons",
      candidates.filter((c) => c.reference_type === "pep").map((c) => c.reference_id),
    );
    const sanRefs = await loadRefs<SanctionRef>(
      "sanctions_reference_entries",
      candidates.filter((c) => c.reference_type === "sanction").map((c) => c.reference_id),
    );

    const { data: fps } = await sdb
      .from("screening_false_positives")
      .select("reference_type, reference_id, reference_hash")
      .eq("subject_id", subject.id)
      .eq("subject_fingerprint", subject.subject_fingerprint);
    const suppressed = new Set(
      (
        (fps ?? []) as Array<{
          reference_type: string;
          reference_id: string;
          reference_hash: string;
        }>
      ).map((f) => `${f.reference_type}:${f.reference_id}:${f.reference_hash}`),
    );

    const subj = {
      kind: subject.kind,
      names: [subject.full_name],
      birth: { date: subject.birth_date, year: subject.birth_year },
      nationality: subject.nationality ?? [],
    };
    const drafts: HitDraft[] = [];
    for (const p of pepRefs) {
      const ref: ScoreReference = {
        kind: "person",
        names: [p.full_name, ...(p.aliases ?? []).slice(0, 15)],
        births: p.birth_date || p.birth_year ? [{ date: p.birth_date, year: p.birth_year }] : [],
        nationality: p.nationality ?? [],
      };
      const b = scoreMatch(subj, ref, scoring);
      drafts.push({
        reference_type: "pep",
        reference_id: p.id,
        reference_hash: p.record_hash,
        reference_snapshot: {
          source: p.source,
          source_id: p.source_id,
          full_name: p.full_name,
          aliases: p.aliases,
          birth_date: p.birth_date,
          birth_year: p.birth_year,
          nationality: p.nationality,
          positions: p.positions,
          is_current: p.is_current,
          latest_position_end: p.latest_position_end,
          source_url: p.source_url,
        },
        score: b.total,
        score_breakdown: {
          ...b,
          source: p.source,
          pepTimeStatus: pepTimeStatus(p, settings.pep_grace_months),
        },
        band: b.band,
        status: "logged",
      });
    }
    for (const s of sanRefs) {
      const refKind =
        s.entity_type === "person" ? "person" : s.entity_type === "unknown" ? "unknown" : "entity";
      if ((refKind === "person" && entity) || (refKind === "entity" && !entity)) continue;
      const ref: ScoreReference = {
        kind: refKind,
        names: (s.names ?? []).map((n) => n.name).slice(0, 30),
        births: (s.birth_dates ?? []).map((d) =>
          /^\d{4}$/.test(d)
            ? { date: null, year: Number(d) }
            : { date: d, year: Number(d.slice(0, 4)) },
        ),
        nationality: s.nationalities ?? [],
      };
      const b = scoreMatch(subj, ref, scoring);
      drafts.push({
        reference_type: "sanction",
        reference_id: s.id,
        reference_hash: s.record_hash,
        reference_snapshot: {
          list_name: s.list_name,
          source_id: s.source_id,
          entity_type: s.entity_type,
          primary_name: s.primary_name,
          names: s.names,
          birth_dates: s.birth_dates,
          nationalities: s.nationalities,
          programme: s.programme,
          listed_at: s.listed_at,
          remarks: s.remarks,
          source_url: s.source_url,
        },
        score: b.total,
        score_breakdown: { ...b, source: s.list_name },
        band: b.band,
        status: "logged",
      });
    }

    // Trafienia ≥ progu → do weryfikacji (chyba że para jest w pamięci „fałszywych trafień”);
    // poniżej progu zapisujemy do 3 najbliższych kandydatów jako ślad w logu.
    drafts.sort((a, b) => b.score - a.score);
    const kept: HitDraft[] = [];
    let nearMisses = 0;
    for (const d of drafts) {
      if (d.band !== "none") {
        d.status = suppressed.has(`${d.reference_type}:${d.reference_id}:${d.reference_hash}`)
          ? "suppressed_false_positive"
          : "pending_review";
        kept.push(d);
      } else if (nearMisses < 3 && d.score >= settings.possible_match_threshold - 20) {
        nearMisses++;
        kept.push(d);
      }
    }
    const inserted: Array<HitDraft & { id: string }> = [];
    for (const part of chunk(kept, 200)) {
      const { data, error } = await sdb
        .from("screening_hits")
        .insert(part.map((h) => ({ run_id: runId, ...h })))
        .select("id, reference_type, reference_id, band, status, score, score_breakdown");
      if (error) throw new Error(`screening_hits: ${error.message}`);
      for (const [i, row] of (data ?? []).entries()) inserted.push({ ...part[i], id: row.id });
    }

    const active = inserted.filter((h) => h.status === "pending_review");
    const caseIds: string[] = [];
    const maxScore = drafts[0]?.score ?? 0;

    const sanctionHits = active.filter((h) => h.reference_type === "sanction");
    if (sanctionHits.length) {
      // Sankcje: wstrzymujemy też, gdy sama nazwa jest „silna”, a wynik obniżył wyłącznie brak daty
      // urodzenia (u klienta lub w liście) — przy sankcjach ryzyko przepuszczenia jest nieakceptowalne.
      const strong = sanctionHits.some(
        (h) =>
          h.band === "strong" ||
          (h.score_breakdown.capApplied &&
            h.score_breakdown.nameScore >= settings.strong_match_threshold),
      );
      const c = await upsertCase({
        subject,
        runId,
        caseType: "sanctions",
        hitIds: sanctionHits.map((h) => h.id),
        priority: strong ? "critical" : "high",
        maxScore: Math.max(...sanctionHits.map((h) => h.score)),
        hold: strong,
        settings,
      });
      caseIds.push(c.id);
      await sdb
        .from("screening_hits")
        .update({ case_id: c.id })
        .in(
          "id",
          sanctionHits.map((h) => h.id),
        );
    }
    const pepHits = active.filter((h) => h.reference_type === "pep");
    if (pepHits.length) {
      const strongCurrent = pepHits.some(
        (h) => h.band === "strong" && h.score_breakdown.pepTimeStatus !== "former",
      );
      const c = await upsertCase({
        subject,
        runId,
        caseType: "pep",
        hitIds: pepHits.map((h) => h.id),
        priority: strongCurrent ? "high" : "normal",
        maxScore: Math.max(...pepHits.map((h) => h.score)),
        hold: strongCurrent,
        settings,
      });
      caseIds.push(c.id);
      await sdb
        .from("screening_hits")
        .update({ case_id: c.id })
        .in(
          "id",
          pepHits.map((h) => h.id),
        );
    }
    let declarationCase = false;
    if (declaration?.any_yes) {
      // Oświadczenie „tak” tworzy sprawę niezależnie od wyniku automatu — raz na oświadczenie.
      const { data: existingDecl } = await sdb
        .from("screening_cases")
        .select("id")
        .eq("subject_id", subject.id)
        .eq("case_type", "declaration")
        .eq("declaration_id", declaration.id)
        .limit(1);
      if (!existingDecl?.length) {
        const c = await upsertCase({
          subject,
          runId,
          caseType: "declaration",
          hitIds: [],
          priority: "normal",
          maxScore: null,
          hold: false,
          declarationId: declaration.id,
          settings,
        });
        caseIds.push(c.id);
      }
      declarationCase = true;
    }

    const result: ScreenResult["result"] = active.some((h) => h.band === "strong")
      ? "strong_match"
      : active.length
        ? "possible_match"
        : declarationCase
          ? "declaration_yes"
          : "no_hits";

    await sdb
      .from("screening_runs")
      .update({
        finished_at: new Date().toISOString(),
        result,
        max_score: maxScore,
        candidates_checked: candidates.length,
      })
      .eq("id", runId);

    // Status podmiotu: automat ustawia wyłącznie „brak” przy braku trafień i braku otwartych spraw.
    const { data: open } = await sdb
      .from("screening_cases")
      .select("id, case_type, application_hold")
      .eq("subject_id", subject.id)
      .is("decision", null);
    const openCases = (open ?? []) as Array<{ case_type: string; application_hold: boolean }>;
    const { data: st } = await sdb
      .from("screening_subject_status")
      .select("*")
      .eq("subject_id", subject.id)
      .maybeSingle();
    const patch: Record<string, unknown> = {
      subject_id: subject.id,
      last_screened_at: new Date().toISOString(),
      last_run_id: runId,
      updated_at: new Date().toISOString(),
    };
    if (
      scope !== "sanctions" &&
      !openCases.some((c) => c.case_type !== "sanctions") &&
      [undefined, null, "unknown"].includes(st?.pep_status)
    ) {
      patch.pep_status = "none";
    }
    if (
      scope !== "pep" &&
      !openCases.some((c) => c.case_type === "sanctions") &&
      [undefined, null, "unknown"].includes(st?.sanctions_status)
    ) {
      patch.sanctions_status = "none";
    }
    await sdb.from("screening_subject_status").upsert(patch, { onConflict: "subject_id" });
    if (openCases.some((c) => c.application_hold))
      await markApplications(subject, "wstrzymany_screening");

    await screeningAudit({
      eventType: "run.finished",
      entityType: "run",
      entityId: runId,
      subjectId: subject.id,
      actorId: opts.actorId ?? null,
      details: {
        trigger: opts.trigger,
        scope,
        result,
        candidates: candidates.length,
        hits: active.length,
        suppressedFalsePositives: inserted.filter((h) => h.status === "suppressed_false_positive")
          .length,
        maxScore,
        declarationId: declaration?.id ?? null,
        caseIds,
      },
    });
    return { runId, result, caseIds, maxScore };
  } catch (e) {
    const msg = (e as Error).message;
    await sdb
      .from("screening_runs")
      .update({ finished_at: new Date().toISOString(), result: "error", error: msg.slice(0, 2000) })
      .eq("id", runId);
    await screeningAudit({
      eventType: "run.error",
      entityType: "run",
      entityId: runId,
      subjectId: subject.id,
      details: { error: msg },
    });
    throw e;
  }
}
