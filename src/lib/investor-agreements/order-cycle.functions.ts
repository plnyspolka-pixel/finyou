// Cykl Zlecenie–Projekt (Etap U2, § 5 Umowy ramowej v5) — server functions.
//
// Zasady twarde (uwagi wdrożeniowe paczki):
//  - teaser i Karta Leada istnieją WYŁĄCZNIE dla pary Projekt–Zlecenie
//    (żadnej ścieżki teasera bez numeru Zlecenia);
//  - jeden aktywny obieg Projektu naraz (wyłączność sekwencyjna — partial
//    unique index w bazie jest ostatecznym strażnikiem);
//  - Ujawnienie Identyfikujące dopiero po: komplecie pakietu 1–5,
//    akceptacji Karty Leada (Konsument: + indywidualne uzgodnienie Kary
//    Obejściowej) i zatwierdzonej Karcie Transferu Danych;
//  - każdy krok trafia do dziennika z wersjami dokumentów pakietu.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  buildKartaLeada,
  canTransition,
  clientProvisionPln,
  consumerKaraStatement,
  extendedReservationDeadline,
  isWithinWithdrawalWindow,
  reservationDeadline,
  withdrawalDeadline,
  type MatchStatus,
} from "./order-cycle-core";

const loose = (c: unknown) => c as any;

function requestMeta(): { ip: string | null; userAgent: string | null } {
  const request = getRequest();
  return {
    ip:
      request?.headers.get("cf-connecting-ip") ||
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null,
    userAgent: request?.headers.get("user-agent") ?? null,
  };
}

async function assertAdmin(supabase: any, userId: string) {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const ok = (roles ?? []).some((r: { role: string }) => r.role === "administrator");
  if (!ok) throw new Error("Brak uprawnień (wymagana rola administrator).");
}

/** Wersje dokumentów pakietu do dziennika i Karty Leada. */
async function packDocumentVersions(db: any): Promise<Array<{ code: string; version: string; sha256: string }>> {
  const { data } = await loose(db)
    .from("legal_documents")
    .select("code, version, sha256, active, sort_order")
    .order("sort_order");
  const rows = (data ?? []) as any[];
  const active = rows.filter((r) => r.active);
  return (active.length > 0 ? active : rows).map((r) => ({
    code: r.code,
    version: r.version,
    sha256: r.sha256,
  }));
}

async function logCycleEvent(
  db: any,
  input: {
    matchId?: string | null;
    orderId?: string | null;
    type: string;
    payload?: Record<string, unknown>;
    actor?: string | null;
    actorKind?: "inwestor" | "admin" | "system";
  },
) {
  const docs = await packDocumentVersions(db);
  await loose(db).from("investor_order_events").insert({
    match_id: input.matchId ?? null,
    order_id: input.orderId ?? null,
    event_type: input.type,
    payload: input.payload ?? {},
    document_versions: docs,
    actor: input.actor ?? null,
    actor_kind: input.actorKind ?? "system",
  });
}

/** Teaser anonimowy — te same bezpieczne pola co investor_offer_teasers(). */
async function buildTeaser(db: any, applicationId: string) {
  const { data: la } = await loose(db)
    .from("loan_applications")
    .select("id, loan_amount, preferred_period_months, annual_investor_rate, estimated_ltv, deleted_at")
    .eq("id", applicationId)
    .maybeSingle();
  if (!la || la.deleted_at) throw new Error("Nie znaleziono wniosku (Projektu).");
  const { data: prop } = await loose(db)
    .from("properties")
    .select("property_type, city, voivodeship, estimated_value, area_sqm")
    .eq("loan_application_id", applicationId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return {
    loan_amount: la.loan_amount != null ? Number(la.loan_amount) : null,
    period_months: la.preferred_period_months != null ? Number(la.preferred_period_months) : null,
    annual_rate: la.annual_investor_rate != null ? Number(la.annual_investor_rate) : null,
    ltv: la.estimated_ltv != null ? Number(la.estimated_ltv) : null,
    property_type: (prop?.property_type as string | null) ?? null,
    city: (prop?.city as string | null) ?? null,
    voivodeship: (prop?.voivodeship as string | null) ?? null,
    estimated_value: prop?.estimated_value != null ? Number(prop.estimated_value) : null,
    area_sqm: prop?.area_sqm != null ? Number(prop.area_sqm) : null,
  };
}

async function myMatch(db: any, userId: string, matchId: string) {
  const { data: m } = await loose(db)
    .from("investor_order_matches")
    .select("*, investor_orders!inner(id, user_id, order_seq, status)")
    .eq("id", matchId)
    .maybeSingle();
  if (!m || m.investor_orders?.user_id !== userId) throw new Error("Nie znaleziono Dopasowania.");
  return m;
}

async function transition(db: any, match: any, to: MatchStatus, patch: Record<string, unknown> = {}) {
  if (!canTransition(match.status as MatchStatus, to)) {
    throw new Error(`Przejście ${match.status} → ${to} jest niedozwolone.`);
  }
  const { data: updated, error } = await loose(db)
    .from("investor_order_matches")
    .update({ status: to, updated_at: new Date().toISOString(), ...patch })
    .eq("id", match.id)
    .eq("status", match.status)
    .select("id");
  if (error) throw new Error(error.message);
  if (!updated?.length) throw new Error("Stan Dopasowania zmienił się w międzyczasie — odśwież.");
}

/** Leniwe wygaszanie rezerwacji po terminie (dziennik: wygaśnięcie). */
async function expireStaleReservations(db: any, matches: any[]) {
  const now = Date.now();
  for (const m of matches) {
    if (
      m.status === "rezerwacja" &&
      m.reservation_expires_at &&
      new Date(m.reservation_expires_at).getTime() < now
    ) {
      await loose(db)
        .from("investor_order_matches")
        .update({ status: "wygasle", decided_at: new Date().toISOString() })
        .eq("id", m.id)
        .eq("status", "rezerwacja");
      m.status = "wygasle";
      await logCycleEvent(db, {
        matchId: m.id,
        orderId: m.order_id,
        type: "rezerwacja_wygasla",
        payload: { reservation_expires_at: m.reservation_expires_at },
      });
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Strona inwestora
// ════════════════════════════════════════════════════════════════════════════

/** Moje Dopasowania (per Zlecenie) + odstąpienia i przystąpienia NDA. */
export const getMyOrderCycle = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: orders } = await loose(supabaseAdmin)
      .from("investor_orders")
      .select("id, order_seq, amount_pln, status, expires_at")
      .eq("user_id", userId)
      .order("submitted_at", { ascending: false });
    const orderIds = (orders ?? []).map((o: any) => o.id);

    let matches: any[] = [];
    if (orderIds.length > 0) {
      const { data } = await loose(supabaseAdmin)
        .from("investor_order_matches")
        .select(
          "id, order_id, application_id, project_ref, status, teaser, teaser_released_at, karta_leada, karta_leada_accepted_at, kara_consumer_accepted_at, transfer_card_approved_at, disclosed_at, reservation_expires_at, reservation_extended, decided_at, created_at",
        )
        .in("order_id", orderIds)
        .order("created_at", { ascending: false });
      matches = data ?? [];
      await expireStaleReservations(supabaseAdmin, matches);
    }

    const { data: investor } = await loose(supabaseAdmin)
      .from("investors")
      .select("is_consumer, entity_variant")
      .eq("user_id", userId)
      .maybeSingle();

    // Okno odstąpienia Konsumenta: 14 dni od akceptacji Umowy ramowej.
    const { data: acceptance } = await loose(supabaseAdmin)
      .from("investor_agreement_acceptances")
      .select("accepted_at")
      .eq("user_id", userId)
      .eq("document_code", "umowa_ramowa")
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: withdrawal } = await loose(supabaseAdmin)
      .from("consumer_withdrawals")
      .select("id, submitted_at")
      .eq("user_id", userId)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: accessions } = await loose(supabaseAdmin)
      .from("nda_accessions")
      .select("id, company_name, project_refs, accepted_at, confirmed_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    const acceptedAt = acceptance?.accepted_at ? new Date(acceptance.accepted_at) : null;
    return {
      orders: orders ?? [],
      // Teaser widoczny dopiero po udostępnieniu (status >= teaser).
      matches: matches.filter((m: any) => m.status !== "dopasowane"),
      isConsumer: Boolean(investor?.is_consumer),
      withdrawal: withdrawal ?? null,
      withdrawalWindow: acceptedAt
        ? {
            acceptedAt: acceptedAt.toISOString(),
            deadline: withdrawalDeadline(acceptedAt).toISOString(),
            open: !withdrawal && isWithinWithdrawalWindow(acceptedAt, new Date()),
          }
        : null,
      accessions: accessions ?? [],
    };
  });

/** Akceptacja Karty Leada (Zał. 1) — przed Ujawnieniem Identyfikującym.
 *  Konsument: dodatkowo odrębne, indywidualne uzgodnienie Kary Obejściowej. */
export const acceptKartaLeada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        matchId: z.string().uuid(),
        confirmed: z.literal(true),
        karaConfirmed: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const m = await myMatch(supabaseAdmin, userId, data.matchId);
    if (m.status !== "teaser") throw new Error("Karta Leada nie jest w tym kroku dostępna.");

    // Bramka: komplet dokumentów pakietu (kroki 1–5).
    const { data: complete } = await loose(supabaseAdmin).rpc("investor_legal_pack_complete", {
      _user_id: userId,
    });
    if (!complete) throw new Error("Najpierw zaakceptuj komplet dokumentów pakietu (/inwestor/umowy).");

    const { data: investor } = await loose(supabaseAdmin)
      .from("investors")
      .select("is_consumer")
      .eq("user_id", userId)
      .maybeSingle();
    const isConsumer = Boolean(investor?.is_consumer);
    if (isConsumer && !data.karaConfirmed) {
      throw new Error(
        "Jako Konsument musisz odrębnie potwierdzić indywidualne uzgodnienie Kary Obejściowej (checkbox przy Karcie Leada).",
      );
    }

    const { ip, userAgent } = requestMeta();
    const now = new Date().toISOString();
    const karaStatement = isConsumer
      ? consumerKaraStatement(Number(m.teaser?.loan_amount ?? 100_000))
      : null;
    await transition(supabaseAdmin, m, "karta_leada", {
      karta_leada_accepted_at: now,
      karta_leada_ip: ip,
      karta_leada_user_agent: userAgent,
      kara_consumer_statement: karaStatement,
      kara_consumer_accepted_at: isConsumer ? now : null,
    });
    await logCycleEvent(supabaseAdmin, {
      matchId: m.id,
      orderId: m.order_id,
      type: "karta_leada_zaakceptowana",
      payload: { ip, user_agent: userAgent, kara_konsument: isConsumer ? karaStatement : null },
      actor: userId,
      actorKind: "inwestor",
    });
    return { ok: true };
  });

/** Ujawnienie Identyfikujące: start rezerwacji 24 h. Wymaga zatwierdzonej
 *  Karty Transferu Danych (RODO — per Projekt, przed Ujawnieniem). */
export const requestDisclosure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ matchId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const m = await myMatch(supabaseAdmin, userId, data.matchId);
    if (m.status !== "karta_leada") throw new Error("Najpierw zaakceptuj Kartę Leada.");
    if (!m.transfer_card_approved_at) {
      throw new Error(
        "Karta Transferu Danych dla tego Projektu czeka na zatwierdzenie przez Finance You — damy znać, gdy Ujawnienie będzie możliwe.",
      );
    }
    const now = new Date();
    const expires = reservationDeadline(now);
    await transition(supabaseAdmin, m, "rezerwacja", {
      disclosed_at: now.toISOString(),
      reservation_expires_at: expires.toISOString(),
    });
    await logCycleEvent(supabaseAdmin, {
      matchId: m.id,
      orderId: m.order_id,
      type: "ujawnienie_identyfikujace",
      payload: { reservation_expires_at: expires.toISOString() },
      actor: userId,
      actorKind: "inwestor",
    });
    return { ok: true, applicationId: m.application_id, reservationExpiresAt: expires.toISOString() };
  });

/** Jednorazowe przedłużenie rezerwacji o 12 h. */
export const extendReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ matchId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const m = await myMatch(supabaseAdmin, userId, data.matchId);
    if (m.status !== "rezerwacja") throw new Error("Brak aktywnej rezerwacji.");
    if (m.reservation_extended) throw new Error("Rezerwację można przedłużyć tylko raz (+12 h).");
    const newDeadline = extendedReservationDeadline(new Date(m.reservation_expires_at));
    const { error } = await loose(supabaseAdmin)
      .from("investor_order_matches")
      .update({
        reservation_expires_at: newDeadline.toISOString(),
        reservation_extended: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", m.id)
      .eq("status", "rezerwacja")
      .eq("reservation_extended", false);
    if (error) throw new Error(error.message);
    await logCycleEvent(supabaseAdmin, {
      matchId: m.id,
      orderId: m.order_id,
      type: "rezerwacja_przedluzona",
      payload: { reservation_expires_at: newDeadline.toISOString() },
      actor: userId,
      actorKind: "inwestor",
    });
    return { ok: true, reservationExpiresAt: newDeadline.toISOString() };
  });

/** Odrzucenie Projektu przez inwestora (zwalnia go dla kolejnego Zlecenia). */
export const declineMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ matchId: z.string().uuid(), reason: z.string().max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const m = await myMatch(supabaseAdmin, userId, data.matchId);
    await transition(supabaseAdmin, m, "odrzucone", {
      decided_at: new Date().toISOString(),
      decided_by: userId,
      decision_reason: data.reason ?? null,
    });
    // Licznik odrzuconych Projektów na Zleceniu.
    const { data: order } = await loose(supabaseAdmin)
      .from("investor_orders")
      .select("rejected_projects_count")
      .eq("id", m.order_id)
      .maybeSingle();
    await loose(supabaseAdmin)
      .from("investor_orders")
      .update({ rejected_projects_count: (order?.rejected_projects_count ?? 0) + 1 })
      .eq("id", m.order_id);
    await logCycleEvent(supabaseAdmin, {
      matchId: m.id,
      orderId: m.order_id,
      type: "projekt_odrzucony",
      payload: { reason: data.reason ?? null },
      actor: userId,
      actorKind: "inwestor",
    });
    return { ok: true };
  });

/** Internetowa funkcja odstąpienia Konsumenta (wzór: Załącznik nr 4). */
export const submitConsumerWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ confirmed: z.literal(true), reason: z.string().max(2000).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: investor } = await loose(supabaseAdmin)
      .from("investors")
      .select("is_consumer, email, first_name, last_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (!investor?.is_consumer) throw new Error("Odstąpienie dotyczy wyłącznie Konsumenta.");

    const { data: acceptance } = await loose(supabaseAdmin)
      .from("investor_agreement_acceptances")
      .select("accepted_at, version")
      .eq("user_id", userId)
      .eq("document_code", "umowa_ramowa")
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!acceptance) throw new Error("Brak zaakceptowanej Umowy ramowej, od której można odstąpić.");
    if (!isWithinWithdrawalWindow(new Date(acceptance.accepted_at), new Date())) {
      throw new Error(
        "14-dniowy termin odstąpienia upłynął. Skontaktuj się z nami — sprawę rozpatrzymy indywidualnie.",
      );
    }

    const { ip, userAgent } = requestMeta();
    const content =
      `Oświadczenie o odstąpieniu od Ramowej umowy pośrednictwa finansowego (Załącznik nr 4).\n` +
      `Konsument: ${[investor.first_name, investor.last_name].filter(Boolean).join(" ")}\n` +
      `Data akceptacji umowy: ${acceptance.accepted_at}\n` +
      (data.reason ? `Uwagi: ${data.reason}\n` : "");
    const { error } = await loose(supabaseAdmin).from("consumer_withdrawals").insert({
      user_id: userId,
      document_code: "umowa_ramowa",
      document_version: acceptance.version,
      content,
      ip,
      user_agent: userAgent,
    });
    if (error) throw new Error(error.message);

    // Skutek: aktywne Zlecenia stają się cofnięte.
    await loose(supabaseAdmin)
      .from("investor_orders")
      .update({ status: "cofniete" })
      .eq("user_id", userId)
      .in("status", ["zlozone", "przyjete"]);
    await logCycleEvent(supabaseAdmin, {
      orderId: null,
      type: "odstapienie_konsumenta",
      payload: { document_version: acceptance.version },
      actor: userId,
      actorKind: "inwestor",
    });

    if (investor.email) {
      try {
        const { sendResendEmail } = await import("@/lib/resend-send.server");
        await sendResendEmail({
          to: investor.email,
          subject: "Potwierdzenie odstąpienia od Umowy ramowej",
          text:
            `Potwierdzamy otrzymanie oświadczenia o odstąpieniu od Ramowej umowy pośrednictwa finansowego ` +
            `(forma dokumentowa, ${new Date().toISOString()} UTC).\n\n` +
            `Twoje aktywne Zlecenia zostały cofnięte. Ponowne korzystanie z pośrednictwa będzie wymagało ` +
            `ponownej akceptacji pakietu dokumentów.\n\nZespół Finance You`,
        });
      } catch (e) {
        console.error("[order-cycle] withdrawal email failed", e);
      }
    }
    return { ok: true };
  });

/** Przystąpienie spółki / innego podmiotu do NDA (Załącznik nr 1 NDA). */
export const submitNdaAccession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        companyName: z.string().min(2).max(300),
        registryNo: z.string().max(60).optional(),
        nip: z.string().max(20).optional(),
        address: z.string().max(400).optional(),
        representative: z.string().max(200).optional(),
        projectRefs: z.array(z.string().max(30)).max(20).default([]),
        confirmed: z.literal(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: nda } = await loose(supabaseAdmin)
      .from("legal_documents")
      .select("version, sha256")
      .eq("code", "nda")
      .maybeSingle();
    if (!nda) throw new Error("Brak dokumentu NDA w rejestrze.");
    const { ip, userAgent } = requestMeta();
    const { error } = await loose(supabaseAdmin).from("nda_accessions").insert({
      user_id: userId,
      company_name: data.companyName,
      registry_no: data.registryNo ?? null,
      nip: data.nip ?? null,
      address: data.address ?? null,
      representative: data.representative ?? null,
      project_refs: data.projectRefs,
      nda_version: nda.version,
      nda_sha256: nda.sha256,
      statements: {
        przystapienie_do_obowiazkow_odbiorcy: true,
        odpowiedzialnosc_solidarna: true,
        brak_automatycznego_dostepu_do_konta: true,
      },
      ip,
      user_agent: userAgent,
    });
    if (error) throw new Error(error.message);
    await logCycleEvent(supabaseAdmin, {
      type: "przystapienie_nda_zgloszone",
      payload: { company_name: data.companyName, project_refs: data.projectRefs },
      actor: userId,
      actorKind: "inwestor",
    });
    return { ok: true };
  });

// ════════════════════════════════════════════════════════════════════════════
// Panel administratora
// ════════════════════════════════════════════════════════════════════════════

export const getOrderCycleAdminState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { CANDIDATE_DB_STATUSES } = await import("@/lib/auto-distribution/engine.server");

    const [{ data: orders }, { data: matches }, { data: events }, { data: accessions }, { data: withdrawals }] =
      await Promise.all([
        loose(supabaseAdmin)
          .from("investor_orders")
          .select("id, order_seq, user_id, amount_pln, max_period_months, min_annual_yield, status, expires_at")
          .eq("status", "przyjete")
          .order("order_seq"),
        loose(supabaseAdmin)
          .from("investor_order_matches")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200),
        loose(supabaseAdmin)
          .from("investor_order_events")
          .select("id, match_id, order_id, event_type, payload, actor_kind, created_at")
          .order("created_at", { ascending: false })
          .limit(100),
        loose(supabaseAdmin)
          .from("nda_accessions")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
        loose(supabaseAdmin)
          .from("consumer_withdrawals")
          .select("*")
          .order("submitted_at", { ascending: false })
          .limit(50),
      ]);
    await expireStaleReservations(supabaseAdmin, matches ?? []);

    // Sugestie Dopasowań: kompletne wnioski w kwocie ± 15% Zlecenia,
    // bez aktywnego obiegu (wyłączność sekwencyjna).
    const activeAppIds = new Set(
      (matches ?? [])
        .filter((m: any) => ["dopasowane", "teaser", "karta_leada", "rezerwacja"].includes(m.status))
        .map((m: any) => m.application_id),
    );
    const { data: apps } = await loose(supabaseAdmin)
      .from("loan_applications")
      .select("id, loan_amount, preferred_period_months, status, created_at")
      .in("status", CANDIDATE_DB_STATUSES)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    const { amountMatchesOrder } = await import("./order-cycle-core");
    const suggestions = (orders ?? []).map((o: any) => ({
      orderId: o.id,
      orderSeq: o.order_seq,
      applications: (apps ?? [])
        .filter(
          (a: any) =>
            !activeAppIds.has(a.id) &&
            amountMatchesOrder(Number(o.amount_pln), Number(a.loan_amount ?? 0)),
        )
        .slice(0, 10),
    }));

    return {
      orders: orders ?? [],
      matches: matches ?? [],
      events: events ?? [],
      accessions: accessions ?? [],
      withdrawals: withdrawals ?? [],
      suggestions,
    };
  });

/** Dopasowanie: utworzenie pary Projekt–Zlecenie (+ opcjonalnie od razu teaser). */
export const createMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        orderId: z.string().uuid(),
        applicationId: z.string().uuid(),
        releaseTeaser: z.boolean().default(true),
        passedFromMatchId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order } = await loose(supabaseAdmin)
      .from("investor_orders")
      .select("id, order_seq, status, expires_at, amount_pln")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) throw new Error("Nie znaleziono Zlecenia.");
    if (order.status !== "przyjete") throw new Error(`Zlecenie ma status ${order.status} (wymagane: przyjęte).`);
    if (order.expires_at && new Date(order.expires_at).getTime() < Date.now()) {
      throw new Error("Zlecenie wygasło.");
    }

    const teaser = await buildTeaser(supabaseAdmin, data.applicationId);
    const now = new Date();
    const { data: inserted, error } = await loose(supabaseAdmin)
      .from("investor_order_matches")
      .insert({
        order_id: data.orderId,
        application_id: data.applicationId,
        status: data.releaseTeaser ? "teaser" : "dopasowane",
        teaser,
        teaser_released_at: data.releaseTeaser ? now.toISOString() : null,
        passed_from_match_id: data.passedFromMatchId ?? null,
        created_by: context.userId,
      })
      .select("id, project_ref")
      .single();
    if (error) {
      if (String(error.message).includes("iom_active_project_uq")) {
        throw new Error(
          "Ten Projekt ma już aktywny obieg u innego zleceniodawcy (wyłączność sekwencyjna) — poczekaj na decyzję albo przekaż go po jej zapadnięciu.",
        );
      }
      throw new Error(error.message);
    }

    // Karta Leada budowana od razu dla pary (nigdy bez numeru Zlecenia).
    const docs = await packDocumentVersions(supabaseAdmin);
    const karta = buildKartaLeada({
      projectRef: inserted.project_ref,
      orderSeq: Number(order.order_seq),
      matchedAt: now,
      teaser,
      documents: docs,
    });
    await loose(supabaseAdmin)
      .from("investor_order_matches")
      .update({ karta_leada: karta })
      .eq("id", inserted.id);

    await logCycleEvent(supabaseAdmin, {
      matchId: inserted.id,
      orderId: data.orderId,
      type: "dopasowanie",
      payload: { project_ref: inserted.project_ref, application_id: data.applicationId },
      actor: context.userId,
      actorKind: "admin",
    });
    if (data.releaseTeaser) {
      await logCycleEvent(supabaseAdmin, {
        matchId: inserted.id,
        orderId: data.orderId,
        type: "teaser_udostepniony",
        payload: { project_ref: inserted.project_ref },
        actor: context.userId,
        actorKind: "admin",
      });
    }
    return { ok: true, matchId: inserted.id, projectRef: inserted.project_ref };
  });

export const releaseTeaser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ matchId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m } = await loose(supabaseAdmin)
      .from("investor_order_matches")
      .select("*")
      .eq("id", data.matchId)
      .maybeSingle();
    if (!m) throw new Error("Nie znaleziono Dopasowania.");
    await transition(supabaseAdmin, m, "teaser", { teaser_released_at: new Date().toISOString() });
    await logCycleEvent(supabaseAdmin, {
      matchId: m.id,
      orderId: m.order_id,
      type: "teaser_udostepniony",
      payload: { project_ref: m.project_ref },
      actor: context.userId,
      actorKind: "admin",
    });
    return { ok: true };
  });

/** Karta Transferu Danych (Moduł RODO) — zatwierdzana per Projekt przed Ujawnieniem. */
export const approveTransferCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ matchId: z.string().uuid(), notes: z.string().max(1000).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m } = await loose(supabaseAdmin)
      .from("investor_order_matches")
      .select("id, order_id, project_ref, status, transfer_card_approved_at")
      .eq("id", data.matchId)
      .maybeSingle();
    if (!m) throw new Error("Nie znaleziono Dopasowania.");
    if (m.transfer_card_approved_at) return { ok: true, already: true };
    const card = {
      projekt_ref: m.project_ref,
      podstawa: "Umowa udostępniania i ochrony danych osobowych (Moduł A — odrębni administratorzy)",
      kategorie_danych:
        "dane identyfikacyjne klienta i właściciela nieruchomości, dane nieruchomości (adres, nr KW), dokumentacja finansowa i prawna Projektu",
      cel: "ocena, negocjowanie i ewentualne wykonanie Projektu w wykonaniu przyjętego Zlecenia",
      uwagi: data.notes ?? null,
      zatwierdzono: new Date().toISOString(),
    };
    const { error } = await loose(supabaseAdmin)
      .from("investor_order_matches")
      .update({
        transfer_card: card,
        transfer_card_approved_at: new Date().toISOString(),
        transfer_card_approved_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", m.id);
    if (error) throw new Error(error.message);
    await logCycleEvent(supabaseAdmin, {
      matchId: m.id,
      orderId: m.order_id,
      type: "karta_transferu_zatwierdzona",
      payload: card,
      actor: context.userId,
      actorKind: "admin",
    });
    return { ok: true };
  });

/** Decyzja administratora: transakcja / przekazanie dalej / odrzucenie. */
export const adminDecideMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        matchId: z.string().uuid(),
        decision: z.enum(["transakcja", "przekazane", "odrzucone", "wygasle"]),
        reason: z.string().max(500).optional(),
        nextOrderId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m } = await loose(supabaseAdmin)
      .from("investor_order_matches")
      .select("*")
      .eq("id", data.matchId)
      .maybeSingle();
    if (!m) throw new Error("Nie znaleziono Dopasowania.");
    await transition(supabaseAdmin, m, data.decision, {
      decided_at: new Date().toISOString(),
      decided_by: context.userId,
      decision_reason: data.reason ?? null,
    });
    await logCycleEvent(supabaseAdmin, {
      matchId: m.id,
      orderId: m.order_id,
      type:
        data.decision === "transakcja"
          ? "transakcja"
          : data.decision === "przekazane"
            ? "przekazanie_do_kolejnego_zlecenia"
            : `projekt_${data.decision}`,
      payload: { reason: data.reason ?? null },
      actor: context.userId,
      actorKind: "admin",
    });
    // Zlecenie wykonane przy Transakcji.
    if (data.decision === "transakcja") {
      await loose(supabaseAdmin)
        .from("investor_orders")
        .update({ status: "wykonane" })
        .eq("id", m.order_id)
        .eq("status", "przyjete");
    }
    return { ok: true };
  });

/** Zał. 6 przy wypłacie: Prowizja Klientowska 7% / min 5000 zł. */
export const confirmZal6 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ matchId: z.string().uuid(), payoutAmountPln: z.number().positive() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m } = await loose(supabaseAdmin)
      .from("investor_order_matches")
      .select("id, order_id, status")
      .eq("id", data.matchId)
      .maybeSingle();
    if (!m) throw new Error("Nie znaleziono Dopasowania.");
    if (m.status !== "transakcja") throw new Error("Zał. 6 potwierdza się dla Dopasowania w Transakcji.");
    const provision = clientProvisionPln(data.payoutAmountPln);
    const { error } = await loose(supabaseAdmin)
      .from("investor_order_matches")
      .update({
        zal6_confirmed_at: new Date().toISOString(),
        payout_amount_pln: data.payoutAmountPln,
        provision_amount_pln: provision,
        updated_at: new Date().toISOString(),
      })
      .eq("id", m.id);
    if (error) throw new Error(error.message);
    await logCycleEvent(supabaseAdmin, {
      matchId: m.id,
      orderId: m.order_id,
      type: "zal6_potwierdzony",
      payload: { payout_amount_pln: data.payoutAmountPln, provision_amount_pln: provision },
      actor: context.userId,
      actorKind: "admin",
    });
    return { ok: true, provisionAmountPln: provision };
  });

export const confirmNdaAccession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ accessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await loose(supabaseAdmin)
      .from("nda_accessions")
      .update({ confirmed_at: new Date().toISOString(), confirmed_by: context.userId })
      .eq("id", data.accessionId)
      .is("confirmed_at", null);
    if (error) throw new Error(error.message);
    await logCycleEvent(supabaseAdmin, {
      type: "przystapienie_nda_potwierdzone",
      payload: { accession_id: data.accessionId },
      actor: context.userId,
      actorKind: "admin",
    });
    return { ok: true };
  });

export const acknowledgeWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ withdrawalId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await loose(supabaseAdmin)
      .from("consumer_withdrawals")
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: context.userId })
      .eq("id", data.withdrawalId)
      .is("acknowledged_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
