// ZAPIS — inwestorzy, oferty, dystrybucja, moduł projektów. Odwzorowuje
// akcje panelu (te same statusy, wpisy audytu i skutki uboczne).
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  WRITE,
  WRITE_IDEMPOTENT,
  actorId,
  fail,
  handle,
  ok,
  oneOf,
  patchOf,
  requireTeamAdmin,
  requireUser,
  rowsOf,
  updateOne,
} from "../_helpers";

export const updateInvestorCriteria = defineTool({
  name: "update_investor_criteria",
  title: "Update investor distribution criteria",
  description:
    "Ustawia kryteria auto-dystrybucji instytucji/inwestora: widełki kwot, czy przyjmuje wnioski, czy auto-wysyłka włączona, pauza do daty, notatki. Zmienia tylko podane pola (upsert). Tylko administrator/operator.",
  inputSchema: {
    investor_id: z.string().uuid(),
    min_amount: z.number().min(0).nullable().optional(),
    max_amount: z.number().min(0).nullable().optional(),
    accepting_applications: z.boolean().optional(),
    auto_send_enabled: z.boolean().optional(),
    paused_until: z.string().nullable().optional().describe("ISO 8601 albo null (odpauzuj)."),
    notes: z.string().max(1900).nullable().optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const inv = await oneOf(
        s.from("investors").select("id").eq("id", a.investor_id),
        "investors",
      );
      if (!inv) return fail("Nie znaleziono inwestora.");
      const existing = await oneOf(
        s.from("investor_distribution_criteria").select("*").eq("investor_id", a.investor_id),
        "investor_distribution_criteria",
      );
      const patch = patchOf(a, [
        "min_amount",
        "max_amount",
        "accepting_applications",
        "auto_send_enabled",
        "paused_until",
        "notes",
      ]);
      if (Object.keys(patch).length === 0) return fail("Brak pól do zmiany.");
      const { data, error } = await s
        .from("investor_distribution_criteria")
        .upsert(
          {
            ...(existing ?? {}),
            ...patch,
            investor_id: a.investor_id,
            updated_by: actorId(ctx),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "investor_id" },
        )
        .select(
          "investor_id, min_amount, max_amount, accepting_applications, auto_send_enabled, paused_until, notes, updated_at",
        )
        .single();
      if (error) throw new Error(`investor_distribution_criteria: ${error.message}`);
      return ok({ ok: true, criteria: data });
    }),
});

const OFFER_DECISIONS = {
  approve: "zatwierdzona_przez_administratora",
  reject: "odrzucona_przez_administratora",
  send_to_client: "wyslana_do_klienta",
  mark_expired: "wygasla",
  back_to_review: "w_trakcie_weryfikacji",
} as const;

export const decideInvestorOffer = defineTool({
  name: "decide_investor_offer",
  title: "Decide investor offer",
  description:
    "Decyzja administratora o ofercie inwestora: `approve` (zatwierdzona), `reject` (odrzucona), `send_to_client` (przekazana klientowi — klient zobaczy ją w swoim panelu), `mark_expired`, `back_to_review`. Opcjonalna notatka administratora. Tylko administrator/operator.",
  inputSchema: {
    offer_id: z.string().uuid(),
    decision: z.enum(["approve", "reject", "send_to_client", "mark_expired", "back_to_review"]),
    admin_note: z.string().max(2000).optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: ({ offer_id, decision, admin_note }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const patch: Record<string, unknown> = { offer_status: OFFER_DECISIONS[decision] };
      if (decision === "approve") patch.admin_verified_at = new Date().toISOString();
      if (admin_note !== undefined) patch.admin_note = admin_note;
      const row = await updateOne(
        s,
        "investor_offers",
        offer_id,
        patch,
        "id, loan_application_id, investor_id, offer_status, proposed_amount, period_months, admin_note, admin_verified_at, updated_at",
      );
      return ok({ ok: true, offer: row });
    }),
});

export const decideAutoDistributionProposal = defineTool({
  name: "decide_auto_distribution_proposal",
  title: "Approve / reject auto-distribution proposal",
  description:
    "Zatwierdza (`approve`) albo odrzuca (`reject`) propozycję auto-dystrybucji wniosku do instytucji. UWAGA: zatwierdzenie od razu WYSYŁA ofertę mailem do dopasowanych instytucji (tak jak przycisk w panelu) i podlega dziennemu limitowi wysyłek. Tylko administrator/operator.",
  inputSchema: {
    proposal_id: z.string().uuid(),
    decision: z.enum(["approve", "reject"]),
  },
  annotations: { ...WRITE, openWorldHint: true },
  handler: ({ proposal_id, decision }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      if (decision === "approve") {
        const { approveProposal } = await import("@/lib/auto-distribution/engine.server");
        const result = await approveProposal(proposal_id, actorId(ctx));
        return result.ok ? ok(result) : fail(result.error ?? "Zatwierdzenie nie powiodło się.");
      }
      const { data, error } = await s
        .from("auto_distribution_proposals")
        .update({
          status: "rejected",
          decided_by: actorId(ctx),
          decided_at: new Date().toISOString(),
        })
        .eq("id", proposal_id)
        .eq("status", "proposed")
        .select("id, status, decided_at")
        .maybeSingle();
      if (error) throw new Error(`auto_distribution_proposals: ${error.message}`);
      if (!data) return fail("Propozycja nie istnieje albo nie ma już statusu „proposed”.");
      return ok({ ok: true, proposal: data });
    }),
});

const CRITERIA_KEYS = [
  "min_amount",
  "max_amount",
  "accepting_applications",
  "auto_send_enabled",
  "paused_until",
];

export const decideCriteriaChangeProposal = defineTool({
  name: "decide_criteria_change_proposal",
  title: "Apply / reject criteria change proposal",
  description:
    "Stosuje (`apply`) albo odrzuca (`reject`) propozycję zmiany kryteriów instytucji wyciągniętą z jej maila przez agenta korespondencji. `apply` nadpisuje kryteria dystrybucji tej instytucji i dopisuje źródło do notatek. Tylko administrator/operator.",
  inputSchema: {
    proposal_id: z.string().uuid(),
    decision: z.enum(["apply", "reject"]),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: ({ proposal_id, decision }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const proposal = await oneOf(
        s
          .from("criteria_change_proposals")
          .select("id, investor_id, proposed_patch, summary, status")
          .eq("id", proposal_id),
        "criteria_change_proposals",
      );
      if (!proposal) return fail("Nie znaleziono propozycji.");
      if (proposal.status !== "proposed") return fail(`Propozycja ma status ${proposal.status}.`);
      if (decision === "apply") {
        const raw = (proposal.proposed_patch ?? {}) as Record<string, unknown>;
        const patch: Record<string, unknown> = {};
        for (const k of CRITERIA_KEYS) if (raw[k] !== undefined) patch[k] = raw[k];
        const existing = await oneOf(
          s
            .from("investor_distribution_criteria")
            .select("investor_id, notes")
            .eq("investor_id", proposal.investor_id),
          "investor_distribution_criteria",
        );
        const notes = [existing?.notes, proposal.summary ? `Z maila: ${proposal.summary}` : null]
          .filter(Boolean)
          .join(" | ")
          .slice(0, 1900);
        const { error: upErr } = await s.from("investor_distribution_criteria").upsert(
          {
            investor_id: proposal.investor_id,
            ...patch,
            notes: notes || null,
            updated_by: actorId(ctx),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "investor_id" },
        );
        if (upErr) throw new Error(`investor_distribution_criteria: ${upErr.message}`);
      }
      const row = await updateOne(
        s,
        "criteria_change_proposals",
        proposal_id,
        {
          status: decision === "apply" ? "applied" : "rejected",
          decided_by: actorId(ctx),
          decided_at: new Date().toISOString(),
        },
        "id, investor_id, status, decided_at",
      );
      return ok({ ok: true, proposal: row });
    }),
});

export const setInvestorActive = defineTool({
  name: "set_investor_active",
  title: "Activate / deactivate investor",
  description:
    "Włącza lub wyłącza konto inwestora (`is_active`). Nieaktywny inwestor nie dostaje dystrybucji. Tylko administrator/operator.",
  inputSchema: { investor_id: z.string().uuid(), is_active: z.boolean() },
  annotations: WRITE_IDEMPOTENT,
  handler: ({ investor_id, is_active }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const row = await updateOne(
        s,
        "investors",
        investor_id,
        { is_active },
        "id, first_name, last_name, company_name, is_active",
      );
      return ok({ ok: true, investor: row });
    }),
});

const PROPOSAL_STATUSES = [
  "under_review",
  "additional_information_required",
  "presented_to_borrower",
  "accepted_for_negotiation",
  "counteroffer",
  "rejected",
  "expired",
  "accepted",
  "converted_to_transaction",
] as const;

export const setProjectProposalStatus = defineTool({
  name: "set_project_proposal_status",
  title: "Set project proposal status",
  description:
    "Decyzja o propozycji inwestora w module projektów (te same statusy co w panelu: under_review, additional_information_required, presented_to_borrower, accepted_for_negotiation, counteroffer, rejected, expired, accepted, converted_to_transaction) z uzasadnieniem; kontroferta wymaga parametrów. Aktualizuje status projektu i wpis audytu jak panel. Tylko administrator/operator.",
  inputSchema: {
    proposal_id: z.string().uuid(),
    status: z.enum(PROPOSAL_STATUSES),
    reason: z.string().min(2).max(4000),
    counteroffer: z.record(z.string(), z.unknown()).optional(),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: ({ proposal_id, status, reason, counteroffer }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const admin = actorId(ctx);
      const proposal = await oneOf(
        s.from("project_proposals").select("*").eq("id", proposal_id),
        "project_proposals",
      );
      if (!proposal) return fail("Nie znaleziono propozycji.");
      if (["withdrawn", "converted_to_transaction"].includes(proposal.status))
        return fail("Propozycja jest już zamknięta.");
      if (status === "counteroffer" && !counteroffer)
        return fail("Kontrpropozycja wymaga parametrów.");
      await updateOne(
        s,
        "project_proposals",
        proposal_id,
        {
          status,
          decided_at: new Date().toISOString(),
          decided_by: admin,
          decision_reason: reason,
          counteroffer: counteroffer ?? proposal.counteroffer,
          admin_note: reason,
        },
        "id",
      );
      if (["rejected", "expired"].includes(status)) {
        await s
          .from("investment_projects")
          .update({ status: "initial_interest" })
          .eq("id", proposal.project_id)
          .eq("status", "offer_submitted");
      }
      if (status === "accepted_for_negotiation" || status === "presented_to_borrower") {
        await s
          .from("investment_projects")
          .update({ status: "full_offer_review" })
          .eq("id", proposal.project_id)
          .in("status", ["offer_submitted", "initial_interest"]);
      }
      const { projectAudit } = await import("@/lib/projects/audit.server");
      await projectAudit({
        actorId: admin,
        subjectUserId: proposal.investor_id,
        entityType: "proposal",
        entityId: proposal.id,
        action: "proposal_status_changed",
        previousStatus: proposal.status,
        newStatus: status,
        reason,
      });
      return ok({ ok: true, proposal_id, previous_status: proposal.status, status });
    }),
});

export const answerProjectInfoRequest = defineTool({
  name: "answer_project_info_request",
  title: "Answer project info request",
  description:
    "Odpowiada na pytanie inwestora do projektu (moduł projektów); inwestor zobaczy odpowiedź w panelu. Tylko administrator/operator.",
  inputSchema: { request_id: z.string().uuid(), answer: z.string().min(2).max(8000) },
  annotations: WRITE_IDEMPOTENT,
  handler: ({ request_id, answer }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const admin = actorId(ctx);
      const row = await updateOne(
        s,
        "project_info_requests",
        request_id,
        { answer, status: "answered", answered_by: admin, answered_at: new Date().toISOString() },
        "id, project_id, investor_id, status, answered_at",
      );
      const { projectAudit } = await import("@/lib/projects/audit.server");
      await projectAudit({
        actorId: admin,
        subjectUserId: row.investor_id,
        entityType: "info_request",
        entityId: row.id,
        action: "info_request_answered",
      });
      return ok({ ok: true, request: row });
    }),
});

const PROJECT_STATUSES = [
  "draft",
  "under_review",
  "available_internal_pool",
  "paused",
  "withdrawn",
  "financed",
  "closed",
] as const;

export const setInvestmentProjectStatus = defineTool({
  name: "set_investment_project_status",
  title: "Set investment project status",
  description:
    "Zmienia status projektu inwestycyjnego (draft, under_review, available_internal_pool, paused, withdrawn, financed, closed) z uzasadnieniem — dokładnie jak panel: wejście do puli wymaga zaakceptowanego zdjęcia głównego; wycofanie/pauza/zamknięcie/sfinansowanie zamyka aktywne przypisania i informuje przypisanych inwestorów mailem. Tylko administrator/operator.",
  inputSchema: {
    project_id: z.string().uuid(),
    status: z.enum(PROJECT_STATUSES),
    reason: z.string().min(2).max(2000),
  },
  annotations: { ...WRITE_IDEMPOTENT, openWorldHint: true },
  handler: ({ project_id, status, reason }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      const admin = actorId(ctx);
      const project = await oneOf(
        s.from("investment_projects").select("*").eq("id", project_id),
        "investment_projects",
      );
      if (!project) return fail("Nie znaleziono projektu.");
      if (
        status === "available_internal_pool" &&
        (!project.main_photo_path || !project.photo_approved)
      ) {
        return fail("Projekt wymaga zaakceptowanego zdjęcia głównego, zanim wejdzie do puli.");
      }
      const patch: Record<string, unknown> = { status, updated_by: admin };
      if (status === "paused") patch.paused_reason = reason;
      if (status === "withdrawn") patch.withdrawn_reason = reason;
      if (status === "available_internal_pool") patch.rejection_count = 0;
      let notified: string[] = [];
      if (["withdrawn", "paused", "closed", "financed"].includes(status)) {
        const { data: released, error } = await s.rpc("project_release_assignments", {
          _project_id: project.id,
          _closed_reason: status === "withdrawn" ? "project_withdrawn" : `project_${status}`,
          _actor: admin,
        });
        if (error) throw new Error(`project_release_assignments: ${error.message}`);
        notified =
          (((released as { investors?: string[] } | null)?.investors ?? []) as string[]) || [];
      }
      await updateOne(s, "investment_projects", project.id, patch, "id");
      const { projectAudit } = await import("@/lib/projects/audit.server");
      await projectAudit({
        actorId: admin,
        entityType: "project",
        entityId: project.id,
        action: "project_status_changed",
        previousStatus: project.status,
        newStatus: status,
        reason,
      });
      let emailed = 0;
      if (notified.length) {
        const profiles = await rowsOf<{ user_id: string; email: string | null }>(
          s.from("profiles").select("user_id, email").in("user_id", notified),
          "profiles",
        );
        const { sendResendEmail } = await import("@/lib/resend-send.server");
        for (const p of profiles) {
          if (!p.email) continue;
          const r = await sendResendEmail({
            to: p.email,
            subject: "Finance You — przypisany projekt nie jest już dostępny",
            text: "Jeden z przypisanych Ci projektów został wycofany lub zaktualizowany i nie jest już dostępny. Zaloguj się do panelu, aby dobrać kolejne projekty.",
            category: "transactional",
          });
          if (r.ok) emailed += 1;
        }
      }
      return ok({
        ok: true,
        project_id,
        previous_status: project.status,
        status,
        released_investors: notified.length,
        emailed,
      });
    }),
});

/**
 * Propozycja inwestora z konta wywołującego — to samo, co „Złóż propozycję”
 * na /inwestor/wniosek/$id: harmonogram z silnika (buildEngineSchedule, jak
 * kalkulator), zapis klientem użytkownika (RLS + strażnik statusów: konto
 * inwestor + administrator dostaje auto-akceptację), potem powiadomienie
 * autora wniosku (mail, Messenger, telefon) jak po złożeniu w panelu.
 */
export const submitInvestorOffer = defineTool({
  name: "submit_investor_offer",
  title: "Submit investor offer",
  description:
    "Składa propozycję finansowania do wniosku z konta inwestora zalogowanego użytkownika — jak przycisk „Złóż propozycję” w panelu inwestora: harmonogram z silnika (odsetki od salda, prowizja inwestora w ratach, pułap raty → balon w ostatniej racie), zapis z RLS i strażnikiem statusów (konto z rolą administratora dostaje auto-akceptację), powiadomienie autora wniosku (operator/pośrednik/klient: e-mail, Messenger, krótki telefon). `status=szkic` zapisuje bez powiadomienia. Wykonuj tylko na wyraźne polecenie użytkownika.",
  inputSchema: {
    loan_application_id: z.string().uuid(),
    amount: z.number().positive().describe("Kwota Udzielona (PLN)."),
    months: z.number().int().min(1).max(360),
    annual_rate: z.number().min(0).max(100).describe("Oprocentowanie roczne w %."),
    commission_pln: z
      .number()
      .min(0)
      .default(0)
      .describe("Prowizja inwestora w PLN (rozłożona równo na raty)."),
    max_monthly_payment: z
      .number()
      .positive()
      .optional()
      .describe(
        "Pułap raty; reszta kapitału w ostatniej racie (balon). Domyślnie rata annuitetowa.",
      ),
    finance_you_fee: z
      .boolean()
      .default(false)
      .describe("Czy doliczyć Prowizję Finance You (5 %, min 5 000 zł) potrącaną z wypłaty."),
    note: z.string().max(4000).optional(),
    status: z.enum(["szkic", "zlozona"]).default("zlozona"),
  },
  annotations: WRITE,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = requireUser(ctx) as any;
      const uid = actorId(ctx);
      const { buildEngineSchedule } = await import("@/lib/contract-engine/loan-schedule");
      const { fyCommission } = await import("@/lib/contract-engine/fees");
      const { data: investor } = await s
        .from("investors")
        .select("id")
        .eq("user_id", uid)
        .maybeSingle();
      if (!investor) return fail("Brak profilu inwestora dla tego konta.");

      const r = a.annual_rate / 100 / 12;
      const annuity =
        r > 0 ? (a.amount * r) / (1 - Math.pow(1 + r, -a.months)) : a.amount / a.months;
      const cap = a.max_monthly_payment ?? annuity + a.commission_pln / a.months;
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
      const pad = (n: number) => String(n).padStart(2, "0");
      const eng = buildEngineSchedule({
        kwotaPozyczki: a.amount,
        prowizja: a.commission_pln,
        prowizjaFY: a.finance_you_fee ? fyCommission(a.amount) : 0,
        annualRatePercent: a.annual_rate,
        months: a.months,
        maxMonthlyPayment: cap,
        firstPaymentDate: `${first.getFullYear()}-${pad(first.getMonth() + 1)}-${pad(first.getDate())}`,
      });
      if (eng.errors.length) return fail(eng.errors.join(" "));
      const regular = eng.rows[0]?.rata_razem ?? 0;

      const { data: offer, error } = await s
        .from("investor_offers")
        .insert({
          loan_application_id: a.loan_application_id,
          investor_id: investor.id,
          offer_status: a.status,
          proposed_amount: a.amount,
          period_months: a.months,
          expected_yearly_yield: a.annual_rate,
          commission: a.commission_pln,
          collection_protection: false,
          has_balloon: eng.balloon > 0,
          balloon_amount: eng.balloon > 0 ? eng.balloon : null,
          repayment_type: eng.balloon > 0 ? "mieszana" : "miesieczna",
          estimated_monthly_payment: regular,
          estimated_total_cost: eng.totalToRepay,
          schedule: eng.rows.map((x) => ({
            idx: x.nr,
            date: x.termin,
            rata: x.rata_razem,
            kapital: x.kapital,
            odsetki: x.odsetki,
            prowizja: x.prowizja,
            saldo: x.saldo,
          })),
          investor_note: a.note ?? null,
          submitted_at: a.status === "zlozona" ? new Date().toISOString() : null,
        })
        .select(
          "id, loan_application_id, offer_status, proposed_amount, period_months, expected_yearly_yield, commission, estimated_monthly_payment, balloon_amount, estimated_total_cost, decided_by_role, submitted_at",
        )
        .single();
      if (error) return fail(`investor_offers: ${error.message}`);

      let notify: unknown = null;
      if (a.status === "zlozona") {
        try {
          const { notifyInvestorOfferSubmitted } =
            await import("@/lib/investor-offer-notify.server");
          notify = await notifyInvestorOfferSubmitted(offer.id as string);
        } catch (e) {
          notify = { error: e instanceof Error ? e.message : String(e) };
        }
      }
      return ok({
        ok: true,
        offer,
        regular_payment: regular,
        balloon: eng.balloon,
        total_interest: eng.totalInterest,
        total_to_repay: eng.totalToRepay,
        warnings: eng.warnings,
        notify,
      });
    }),
});

export const writesInvestorsTools = [
  updateInvestorCriteria,
  decideInvestorOffer,
  submitInvestorOffer,
  decideAutoDistributionProposal,
  decideCriteriaChangeProposal,
  setInvestorActive,
  setProjectProposalStatus,
  answerProjectInfoRequest,
  setInvestmentProjectStatus,
];
