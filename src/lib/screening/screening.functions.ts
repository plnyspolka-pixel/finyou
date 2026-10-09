// Funkcje serwerowe panelu „Screening PEP i sankcji”. Każda sprawdza
// uprawnienia po stronie serwera: personel wewnętrzny (is_internal_staff),
// a ustawienia, importy na żądanie i akceptacja zarządu — rola administrator.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type {
  AuditRow,
  CaseListItem,
  CoverageRow,
  ImportRow,
  PepDeclarationRow,
  ScreeningCase,
  ScreeningHit,
  ScreeningRun,
  ScreeningSubject,
  ScreeningSubjectStatus,
} from "./types";

async function assertStaff(userId: string) {
  const { sdb } = await import("./db.server");
  const { data } = await sdb.rpc("is_internal_staff", { _user_id: userId });
  if (!data) throw new Error("Brak uprawnień (personel compliance).");
}

async function assertAdministrator(userId: string) {
  const { sdb } = await import("./db.server");
  const { data } = await sdb.from("user_roles").select("role").eq("user_id", userId);
  if (!((data ?? []) as Array<{ role: string }>).some((r) => r.role === "administrator")) {
    throw new Error("Brak uprawnień (wymagana rola administrator).");
  }
}

// --- Kolejka spraw ----------------------------------------------------------------

const ListCasesInput = z.object({
  status: z.enum(["open", "decided", "all"]).default("open"),
  priority: z.enum(["normal", "high", "critical"]).optional().nullable(),
  caseType: z.enum(["pep", "sanctions", "declaration"]).optional().nullable(),
  minAgeDays: z.number().int().min(0).max(3650).optional().nullable(),
  limit: z.number().int().min(1).max(500).default(200),
});

export const listScreeningCases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListCasesInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { sdb } = await import("./db.server");
    let q = sdb
      .from("screening_cases")
      .select(
        "id, case_no, subject_id, subject_type, case_type, priority, status, max_score, hits, decision, decided_at, assigned_to, application_hold, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status === "open") q = q.is("decision", null);
    if (data.status === "decided") q = q.not("decision", "is", null);
    if (data.priority) q = q.eq("priority", data.priority);
    if (data.caseType) q = q.eq("case_type", data.caseType);
    if (data.minAgeDays)
      q = q.lte("created_at", new Date(Date.now() - data.minAgeDays * 86400_000).toISOString());
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const cases = (rows ?? []) as ScreeningCase[];
    const subjectIds = [...new Set(cases.map((c) => c.subject_id))];
    const { data: subjects } = subjectIds.length
      ? await sdb
          .from("screening_subjects")
          .select("id, full_name, client_id, investor_id, kind")
          .in("id", subjectIds)
      : { data: [] };
    const byId = new Map(
      ((subjects ?? []) as NonNullable<CaseListItem["subject"]>[]).map((s) => [s.id, s]),
    );
    const rank = { critical: 0, high: 1, normal: 2 } as Record<string, number>;
    const out: CaseListItem[] = cases
      .map((c) => ({ ...c, subject: byId.get(c.subject_id) ?? null }))
      .sort(
        (a, b) => rank[a.priority] - rank[b.priority] || a.created_at.localeCompare(b.created_at),
      );
    return out;
  });

export const getScreeningCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ caseId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { sdb } = await import("./db.server");
    const { data: c, error } = await sdb
      .from("screening_cases")
      .select("*")
      .eq("id", data.caseId)
      .maybeSingle();
    if (error || !c) throw new Error("Nie znaleziono sprawy.");
    const [{ data: subject }, { data: status }, { data: hits }, { data: run }, { data: audit }] =
      await Promise.all([
        sdb.from("screening_subjects").select("*").eq("id", c.subject_id).single(),
        sdb
          .from("screening_subject_status")
          .select("*")
          .eq("subject_id", c.subject_id)
          .maybeSingle(),
        c.hits?.length
          ? sdb
              .from("screening_hits")
              .select("*")
              .in("id", c.hits)
              .order("score", { ascending: false })
          : Promise.resolve({ data: [] }),
        c.run_id
          ? sdb.from("screening_runs").select("*").eq("id", c.run_id).maybeSingle()
          : Promise.resolve({ data: null }),
        sdb
          .from("screening_audit_log")
          .select("*")
          .eq("entity_type", "case")
          .eq("entity_id", c.id)
          .order("id", { ascending: true }),
      ]);
    let declaration = null;
    if (c.declaration_id) {
      ({ data: declaration } = await sdb
        .from("pep_declarations")
        .select("*")
        .eq("id", c.declaration_id)
        .maybeSingle());
    } else if (subject?.client_id || subject?.investor_id) {
      ({ data: declaration } = await sdb
        .from("pep_declarations")
        .select("*")
        .eq("subject_type", subject.client_id ? "client" : "investor")
        .eq("subject_id", subject.client_id ?? subject.investor_id)
        .order("signed_at", { ascending: false })
        .limit(1)
        .maybeSingle());
    }
    let applications: unknown[] = [];
    if (subject?.client_id) {
      const { data: apps } = await sdb
        .from("loan_applications")
        .select("id, status, loan_amount, aml_status, created_at")
        .eq("client_id", subject.client_id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      applications = apps ?? [];
    }
    const { ALLOWED_DECISIONS, DECISIONS } = await import("./decisions.server");
    return {
      case: c as ScreeningCase,
      subject: subject as ScreeningSubject,
      status: (status ?? null) as ScreeningSubjectStatus | null,
      hits: (hits ?? []) as ScreeningHit[],
      run: (run ?? null) as ScreeningRun | null,
      audit: (audit ?? []) as AuditRow[],
      declaration: (declaration ?? null) as PepDeclarationRow | null,
      applications: applications as Array<{
        id: string;
        status: string;
        loan_amount: number | null;
        aml_status: string | null;
        created_at: string;
      }>,
      allowedDecisions: (ALLOWED_DECISIONS[c.case_type] ?? []).map((d) => ({
        value: d,
        label: DECISIONS[d],
      })),
    };
  });

export const assignScreeningCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ caseId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { sdb, screeningAudit } = await import("./db.server");
    const { error } = await sdb
      .from("screening_cases")
      .update({ assigned_to: context.userId, status: "in_review" })
      .eq("id", data.caseId)
      .is("decision", null);
    if (error) throw new Error(error.message);
    await screeningAudit({
      eventType: "case.assigned",
      entityType: "case",
      entityId: data.caseId,
      actorId: context.userId,
    });
    return { ok: true };
  });

export const decideScreeningCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        caseId: z.string().uuid(),
        decision: z.enum([
          "false_positive",
          "confirmed_pep",
          "confirmed_family_or_associate",
          "sanctions_hit",
          "no_pep_declaration_error",
        ]),
        justification: z.string().trim().min(10, "Uzasadnienie: min. 10 znaków").max(5000),
        relation: z.enum(["family_member", "close_associate"]).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { decideCase } = await import("./decisions.server");
    return decideCase({ ...data, relation: data.relation ?? undefined, actorId: context.userId });
  });

// --- Karta podmiotu (klient / inwestor) -----------------------------------------------

const OwnerInput = z.object({ kind: z.enum(["client", "investor"]), id: z.string().uuid() });

async function ownerHistory(kind: "client" | "investor", id: string) {
  const { sdb } = await import("./db.server");
  const column = kind === "client" ? "client_id" : "investor_id";
  const { data: subjects } = await sdb
    .from("screening_subjects")
    .select("*")
    .eq(column, id)
    .order("created_at");
  const subs = (subjects ?? []) as Array<{ id: string }>;
  const ids = subs.map((s) => s.id);
  const empty = {
    subjects: [] as ScreeningSubject[],
    statuses: [] as ScreeningSubjectStatus[],
    runs: [] as ScreeningRun[],
    cases: [] as ScreeningCase[],
    declarations: [] as PepDeclarationRow[],
    audit: [] as AuditRow[],
  };
  if (!ids.length) return empty;
  const [
    { data: statuses },
    { data: runs },
    { data: cases },
    { data: declarations },
    { data: audit },
  ] = await Promise.all([
    sdb.from("screening_subject_status").select("*").in("subject_id", ids),
    sdb
      .from("screening_runs")
      .select("*")
      .in("subject_id", ids)
      .order("started_at", { ascending: false })
      .limit(500),
    sdb
      .from("screening_cases")
      .select("*")
      .in("subject_id", ids)
      .order("created_at", { ascending: false }),
    sdb
      .from("pep_declarations")
      .select("*")
      .eq("subject_type", kind)
      .eq("subject_id", id)
      .order("signed_at", { ascending: false }),
    sdb
      .from("screening_audit_log")
      .select("*")
      .in("subject_id", ids)
      .order("id", { ascending: true })
      .limit(2000),
  ]);
  return {
    subjects: (subjects ?? []) as ScreeningSubject[],
    statuses: (statuses ?? []) as ScreeningSubjectStatus[],
    runs: (runs ?? []) as ScreeningRun[],
    cases: (cases ?? []) as ScreeningCase[],
    declarations: (declarations ?? []) as PepDeclarationRow[],
    audit: (audit ?? []) as AuditRow[],
  };
}

export const getScreeningOwnerCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => OwnerInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    return ownerHistory(data.kind, data.id);
  });

export const runScreeningNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => OwnerInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { processQueueItem } = await import("./queue.server");
    const results = await processQueueItem(
      {
        id: 0,
        source_table: data.kind === "client" ? "clients" : "investors",
        source_id: data.id,
        trigger: "manual",
        scope: "all",
        attempts: 0,
      },
      context.userId,
    );
    return { results };
  });

export const saveSubjectSourceOfWealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        subjectId: z.string().uuid(),
        sourceOfWealth: z.string().trim().min(3).max(5000),
        sourceOfFunds: z.string().trim().min(3).max(5000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { saveSourceOfWealth } = await import("./decisions.server");
    await saveSourceOfWealth({ ...data, actorId: context.userId });
    return { ok: true };
  });

export const uploadSubjectAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        subjectId: z.string().uuid(),
        fileName: z.string().min(1).max(200),
        mimeType: z.string().max(120),
        base64: z.string().min(4).max(14_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const bin = atob(data.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const { addSowAttachment } = await import("./decisions.server");
    return addSowAttachment({
      subjectId: data.subjectId,
      fileName: data.fileName,
      mimeType: data.mimeType,
      bytes,
      actorId: context.userId,
    });
  });

export const getAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(3).max(400) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { sdb, screeningAudit } = await import("./db.server");
    const { data: signed, error } = await sdb.storage
      .from("screening-attachments")
      .createSignedUrl(data.path, 300);
    if (error) throw new Error(error.message);
    await screeningAudit({
      eventType: "attachment.viewed",
      entityType: "subject",
      entityId: data.path.split("/")[0],
      actorId: context.userId,
      details: { path: data.path },
    });
    return { url: signed.signedUrl as string };
  });

export const approveSubjectByBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ subjectId: z.string().uuid(), note: z.string().trim().min(10).max(5000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Akceptacja członka zarządu — w systemie rola administrator.
    await assertAdministrator(context.userId);
    const { approveBoard } = await import("./decisions.server");
    await approveBoard({ ...data, actorId: context.userId });
    return { ok: true };
  });

export const exportScreeningHistoryPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => OwnerInput.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { sdb, screeningAudit } = await import("./db.server");
    const { buildHistoryPdf, bytesToBase64 } = await import("./history-pdf.server");
    const h = await ownerHistory(data.kind, data.id);
    const { data: prof } = await sdb
      .from("profiles")
      .select("first_name, last_name, email")
      .eq("user_id", context.userId)
      .maybeSingle();
    const who = prof
      ? `${prof.first_name ?? ""} ${prof.last_name ?? ""} <${prof.email ?? ""}>`.trim()
      : context.userId;
    const subjects = h.subjects;
    const name = (id: string) => subjects.find((s) => s.id === id)?.full_name ?? id;
    const fmt = (t: string | null | undefined) =>
      t ? new Date(t).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" }) : "—";
    const sections = [
      {
        heading: "Podmioty objęte screeningiem",
        lines: subjects.map(
          (s) =>
            `${s.full_name} · ${s.subject_type} · data ur.: ${s.birth_date ?? "—"} · kraj: ${(s.nationality ?? []).join(", ") || "—"}${s.is_active ? "" : " · nieaktywny"}`,
        ),
      },
      {
        heading: "Aktualny status",
        lines: h.statuses.map(
          (s) =>
            `${name(s.subject_id as string)}: PEP=${s.pep_status}, sankcje=${s.sanctions_status}, wstrzymanie=${s.operations_hold ? `TAK (${s.hold_reason ?? ""})` : "nie"}, EDD=${s.enhanced_monitoring ? "tak" : "nie"}, akceptacja zarządu=${s.board_approved_at ? fmt(s.board_approved_at as string) : s.board_approval_required ? "WYMAGANA" : "n/d"}, ostatnie sprawdzenie=${fmt(s.last_screened_at as string)}`,
        ),
      },
      {
        heading: "Oświadczenia PEP",
        lines: h.declarations.map((d) => {
          const a = d.answers as Record<string, unknown>;
          return `${fmt(d.signed_at as string)} · wersja ${d.declaration_text_version} · PEP=${a.is_pep ? "TAK" : "nie"}, rodzina=${a.is_family_member ? "TAK" : "nie"}, współpracownik=${a.is_close_associate ? "TAK" : "nie"} · IP ${d.ip ?? "—"} · kanał ${d.channel ?? "—"}`;
        }),
      },
      {
        heading: "Przebiegi screeningu",
        lines: h.runs.map(
          (r) =>
            `${fmt(r.started_at as string)} · ${name(r.subject_id as string)} · wyzwalacz: ${r.trigger} · zakres: ${r.scope} · wynik: ${r.result ?? "w toku"} · maks. wynik: ${r.max_score ?? "—"} · kandydaci: ${r.candidates_checked ?? "—"} · wersje źródeł: ${
              Object.entries((r.sources_versions ?? {}) as Record<string, string>)
                .map(([k, v]) => `${k}=${v.slice(0, 10)}`)
                .join(", ") || "—"
            }`,
        ),
      },
      {
        heading: "Sprawy i decyzje",
        lines: h.cases.map(
          (c) =>
            `Sprawa ${c.case_no} · ${name(c.subject_id as string)} · typ: ${c.case_type} · priorytet: ${c.priority} · utworzona ${fmt(c.created_at as string)} · decyzja: ${c.decision ?? "OTWARTA"}${c.decided_at ? ` (${fmt(c.decided_at as string)})` : ""}${c.justification ? ` · uzasadnienie: ${c.justification}` : ""}`,
        ),
      },
      {
        heading: "Dziennik audytu (łańcuch skrótów)",
        lines: h.audit.map(
          (a) =>
            `#${a.id} ${fmt(a.created_at as string)} · ${a.event_type} · ${a.actor_kind === "user" ? `użytkownik ${a.actor_id}` : "automat"} · ${String(a.row_hash ?? "").slice(0, 16)}`,
        ),
      },
    ];
    const title = `Historia screeningu PEP i sankcji — ${subjects[0]?.full_name ?? data.id}`;
    const bytes = await buildHistoryPdf({
      title,
      generatedAt: new Date(),
      generatedBy: who,
      sections,
    });
    await screeningAudit({
      eventType: "history.exported",
      entityType: "subject",
      entityId: data.id,
      actorId: context.userId,
      details: { kind: data.kind },
    });
    return {
      filename: `screening-${data.kind}-${data.id.slice(0, 8)}.pdf`,
      base64: bytesToBase64(bytes),
    };
  });

// --- Źródła, pokrycie, ustawienia, audyt --------------------------------------------------

export const getScreeningSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { sourcesHealth } = await import("./health.server");
    const { sdb } = await import("./db.server");
    const [health, { data: imports }, { count: queue }] = await Promise.all([
      sourcesHealth(),
      sdb
        .from("screening_source_imports")
        .select(
          "id, source, started_at, finished_at, status, record_count, upserted_count, deactivated_count, changed, error, file_checksum",
        )
        .order("started_at", { ascending: false })
        .limit(60),
      sdb
        .from("screening_queue")
        .select("id", { count: "exact", head: true })
        .is("processed_at", null),
    ]);
    return {
      health,
      imports: (imports ?? []) as ImportRow[],
      queuePending: (queue ?? 0) as number,
    };
  });

export const runScreeningImportNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        source: z.enum([
          "eu_fsf",
          "un_sc",
          "mswia",
          "ofac_sdn",
          "sejm_api",
          "kprm",
          "wikidata",
          "senat",
          "krs",
        ]),
        force: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdministrator(context.userId);
    const { runImport } = await import("./import.server");
    const { screeningAudit } = await import("./db.server");
    await screeningAudit({
      eventType: "import.manual",
      entityType: "import",
      actorId: context.userId,
      details: data,
    });
    return runImport(data.source, { force: data.force });
  });

export const enqueuePortfolioNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ scope: z.enum(["all", "pep", "sanctions"]) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdministrator(context.userId);
    const { enqueuePortfolio } = await import("./queue.server");
    return { enqueued: await enqueuePortfolio(data.scope, "manual") };
  });

export const getScreeningCoverage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { sdb } = await import("./db.server");
    const [{ data: catalog }, { data: cov, error }, { data: imports }] = await Promise.all([
      sdb.from("pep_position_catalog").select("*").order("sort_order"),
      sdb.rpc("screening_coverage"),
      sdb
        .from("screening_source_imports")
        .select("source, finished_at, status")
        .in("status", ["success", "unchanged"])
        .order("finished_at", { ascending: false })
        .limit(200),
    ]);
    if (error) throw new Error(error.message);
    const byCode = new Map(((cov ?? []) as Array<{ code: string }>).map((c) => [c.code, c]));
    const lastImport: Record<string, string> = {};
    for (const i of (imports ?? []) as Array<{ source: string; finished_at: string }>)
      lastImport[i.source] ??= i.finished_at;
    return (
      (catalog ?? []) as Array<
        Omit<
          CoverageRow,
          "persons" | "currentPersons" | "lastFetchedAt" | "sourcesLastImport" | "coverage"
        >
      >
    ).map((c): CoverageRow => {
      const cv = byCode.get(c.code) as
        | { persons?: number; current_persons?: number; last_fetched_at?: string }
        | undefined;
      const persons = Number(cv?.persons ?? 0);
      return {
        ...c,
        persons,
        currentPersons: Number(cv?.current_persons ?? 0),
        lastFetchedAt: cv?.last_fetched_at ?? null,
        sourcesLastImport: Object.fromEntries(
          (c.data_sources ?? []).map((s) => [s, lastImport[s] ?? null]),
        ),
        coverage:
          (c.data_sources ?? []).length === 0 ? "gap" : persons === 0 ? "source_empty" : "covered",
      };
    });
  });

export const updateCatalogEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        code: z.string().min(2).max(20),
        data_sources: z.array(z.enum(["sejm_api", "wikidata", "senat", "kprm", "krs"])).max(5),
        wikidata_ids: z.array(z.string().regex(/^Q\d+$/)).max(50),
        wikidata_mode: z.enum(["direct", "subclass_pl", "subclass_any"]),
        gap_notes: z.string().max(2000).nullable(),
        is_active: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdministrator(context.userId);
    const { sdb, screeningAudit } = await import("./db.server");
    const { data: before } = await sdb
      .from("pep_position_catalog")
      .select("*")
      .eq("code", data.code)
      .single();
    const { code, ...patch } = data;
    const { error } = await sdb
      .from("pep_position_catalog")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("code", code);
    if (error) throw new Error(error.message);
    await screeningAudit({
      eventType: "catalog.updated",
      entityType: "catalog",
      entityId: code,
      actorId: context.userId,
      details: { before, after: data },
    });
    return { ok: true };
  });

const SettingsInput = z.object({
  possible_match_threshold: z.number().int().min(30).max(99),
  strong_match_threshold: z.number().int().min(40).max(100),
  dob_exact_bonus: z.number().int().min(0).max(40),
  dob_year_bonus: z.number().int().min(0).max(40),
  dob_mismatch_penalty: z.number().int().min(0).max(60),
  nationality_bonus: z.number().int().min(0).max(20),
  pep_grace_months: z.number().int().min(12).max(120),
  wikidata_min_end_year: z.number().int().min(1950).max(2100),
  candidate_min_similarity: z.number().min(0.1).max(0.9),
  candidate_limit: z.number().int().min(10).max(500),
  aml_officer_emails: z.array(z.string().email()).max(10),
  board_emails: z.array(z.string().email()).max(10),
  import_alert_failed_cycles: z.number().int().min(1).max(10),
  sources: z.record(z.string(), z.object({ enabled: z.boolean() }).passthrough()),
  frequencies: z.record(z.string(), z.string()),
});

export const getScreeningSettingsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { getScreeningSettings } = await import("./db.server");
    return getScreeningSettings();
  });

export const updateScreeningSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    SettingsInput.refine((v) => v.strong_match_threshold > v.possible_match_threshold, {
      message: "Próg silnego trafienia musi być wyższy niż próg możliwego trafienia.",
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdministrator(context.userId);
    const { sdb, screeningAudit, getScreeningSettings } = await import("./db.server");
    const before = await getScreeningSettings();
    const { error } = await sdb
      .from("screening_settings")
      .update({ ...data, updated_at: new Date().toISOString(), updated_by: context.userId })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    const changed = Object.fromEntries(
      Object.entries(data).filter(
        ([k, v]) =>
          JSON.stringify(v) !== JSON.stringify((before as unknown as Record<string, unknown>)[k]),
      ),
    );
    await screeningAudit({
      eventType: "settings.updated",
      entityType: "settings",
      entityId: "1",
      actorId: context.userId,
      details: { changed },
    });
    return { ok: true };
  });

export const listScreeningAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(1000).default(200),
        beforeId: z.number().int().optional().nullable(),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.userId);
    const { sdb } = await import("./db.server");
    let q = sdb
      .from("screening_audit_log")
      .select("*")
      .order("id", { ascending: false })
      .limit(data.limit);
    if (data.beforeId) q = q.lt("id", data.beforeId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as AuditRow[];
  });

/** Weryfikacja łańcucha skrótów dziennika audytu (wykrywa zmianę lub usunięcie wpisów poza RLS). */
export const verifyScreeningAuditChain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { sdb, screeningAudit } = await import("./db.server");
    const { data, error } = await sdb.rpc("screening_audit_verify");
    if (error) throw new Error(error.message);
    const r = (Array.isArray(data) ? data[0] : data) as { checked: number; broken_ids: number[] };
    await screeningAudit({
      eventType: "audit.verified",
      entityType: "settings",
      actorId: context.userId,
      details: { checked: r.checked, broken: r.broken_ids?.length ?? 0 },
    });
    return {
      checked: Number(r.checked),
      brokenIds: r.broken_ids ?? [],
      ok: !(r.broken_ids ?? []).length,
    };
  });
