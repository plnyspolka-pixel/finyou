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
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  clientProvisionPln,
  consumerKaraStatement,
  extendedReservationDeadline,
  isWithinWithdrawalWindow,
  reservationDeadline,
  orderLimitsFromSettings,
  withdrawalDeadline,
  amountMatchesOrder,
} from "./order-cycle-core";

import { getModuleSettings } from "@/lib/projects/guards.server";

const loose = (c: unknown) => c as any;
const srv = () => import("./order-cycle.server");
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
    // Zlecenia nie wymagają decyzji admina — wcześniej złożone przyjmujemy teraz.
    const pending = (orders ?? []).filter((o: any) => o.status === "zlozone");
    if (pending.length > 0) {
      const { autoAcceptOrder } = await import("./legal-pack.functions");
      for (const o of pending) {
        try {
          await autoAcceptOrder(supabaseAdmin, o.id, userId);
          o.status = "przyjete";
          const { data: fresh } = await loose(supabaseAdmin)
            .from("investor_orders")
            .select("expires_at")
            .eq("id", o.id)
            .maybeSingle();
          o.expires_at = fresh?.expires_at ?? null;
        } catch (e) {
          console.error("[order-accept] nieudane:", e);
        }
      }
    }
    // Automat dopasowań: nowy pasujący Projekt pojawia się przy otwarciu widoku.
    try {
      await (await srv()).autoMatchInvestorOrders(supabaseAdmin, orders ?? []);
    } catch (e) {
      console.error("[auto-match] nieudane:", e);
    }
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
      await (await srv()).expireStaleReservations(supabaseAdmin, matches);
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

    // Wcześniejsze zgłoszenia czekające na ręczne potwierdzenie — potwierdzamy automatycznie.
    const nowIso = new Date().toISOString();
    if ((accessions ?? []).some((a: any) => !a.confirmed_at)) {
      await loose(supabaseAdmin)
        .from("nda_accessions")
        .update({ confirmed_at: nowIso })
        .eq("user_id", userId)
        .is("confirmed_at", null);
      for (const a of accessions ?? []) a.confirmed_at ??= nowIso;
    }
    await loose(supabaseAdmin)
      .from("consumer_withdrawals")
      .update({ acknowledged_at: nowIso })
      .eq("user_id", userId)
      .is("acknowledged_at", null);

    const acceptedAt = acceptance?.accepted_at ? new Date(acceptance.accepted_at) : null;
    const limits = orderLimitsFromSettings(await getModuleSettings());
    return {
      // Jeden poziom (abonament, Umowa ramowa v7 § 7) — bez pakietów i wykupów.
      tier: "podstawowy" as const,
      // Limity cyklu z project_module_settings (UI pokazuje je z ustawień, nie z hardcode).
      limits,
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
    const m = await (await srv()).myMatch(supabaseAdmin, userId, data.matchId);
    if (m.status !== "teaser") throw new Error("Karta Leada nie jest w tym kroku dostępna.");

    // Bramka: komplet dokumentów pakietu (kroki 1–5).
    const { data: complete } = await loose(supabaseAdmin).rpc("investor_legal_pack_complete", {
      _user_id: userId,
    });
    if (!complete)
      throw new Error("Najpierw zaakceptuj komplet dokumentów pakietu (/inwestor/umowy).");

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

    const { ip, userAgent } = (await srv()).requestMeta();
    const now = new Date().toISOString();
    const karaStatement = isConsumer
      ? consumerKaraStatement(Number(m.teaser?.loan_amount ?? 100_000))
      : null;
    await (
      await srv()
    ).transition(supabaseAdmin, m, "karta_leada", {
      karta_leada_accepted_at: now,
      karta_leada_ip: ip,
      karta_leada_user_agent: userAgent,
      kara_consumer_statement: karaStatement,
      kara_consumer_accepted_at: isConsumer ? now : null,
    });
    await (
      await srv()
    ).logCycleEvent(supabaseAdmin, {
      matchId: m.id,
      orderId: m.order_id,
      type: "karta_leada_zaakceptowana",
      payload: { ip, user_agent: userAgent, kara_konsument: isConsumer ? karaStatement : null },
      actor: userId,
      actorKind: "inwestor",
    });
    await (await srv()).issueTransferCard(supabaseAdmin, m, { actorId: null, actorKind: "system" });
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
    const m = await (await srv()).myMatch(supabaseAdmin, userId, data.matchId);
    if (m.status !== "karta_leada") throw new Error("Najpierw zaakceptuj Kartę Leada.");
    // Karta Transferu Danych wystawiana automatycznie (starsze Dopasowania bez karty).
    await (await srv()).issueTransferCard(supabaseAdmin, m, { actorId: null, actorKind: "system" });
    // Ujawnienie po akceptacji Karty Leada nie wymaga dodatkowej płatności
    // (Umowa ramowa v7 § 7: poza abonamentem brak opłat za Projekt).
    const limits = orderLimitsFromSettings(await getModuleSettings());
    const now = new Date();
    const expires = reservationDeadline(now, limits.assignmentHours);
    await (
      await srv()
    ).transition(supabaseAdmin, m, "rezerwacja", {
      disclosed_at: now.toISOString(),
      reservation_expires_at: expires.toISOString(),
    });
    await (
      await srv()
    ).logCycleEvent(supabaseAdmin, {
      matchId: m.id,
      orderId: m.order_id,
      type: "ujawnienie_identyfikujace",
      payload: { reservation_expires_at: expires.toISOString() },
      actor: userId,
      actorKind: "inwestor",
    });
    return {
      ok: true,
      applicationId: m.application_id,
      reservationExpiresAt: expires.toISOString(),
    };
  });

/** Jednorazowe przedłużenie rezerwacji o 12 h. */
export const extendReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ matchId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const m = await (await srv()).myMatch(supabaseAdmin, userId, data.matchId);
    const limits = orderLimitsFromSettings(await getModuleSettings());
    if (m.status !== "rezerwacja") throw new Error("Brak aktywnej rezerwacji.");
    if (m.reservation_extended)
      throw new Error(`Rezerwację można przedłużyć tylko raz (+${limits.extensionHours} h).`);
    // Maks. N przedłużonych rezerwacji naraz (project_module_settings).
    const { count: extendedNow } = await loose(supabaseAdmin)
      .from("investor_order_matches")
      .select("id, investor_orders!inner(user_id)", { count: "exact", head: true })
      .eq("investor_orders.user_id", userId)
      .eq("status", "rezerwacja")
      .eq("reservation_extended", true);
    if ((extendedNow ?? 0) >= limits.maxExtended) {
      throw new Error(
        `Masz już ${limits.maxExtended} przedłużone rezerwacje naraz — limit z ustawień modułu (§ 5 Umowy ramowej).`,
      );
    }
    const newDeadline = extendedReservationDeadline(
      new Date(m.reservation_expires_at),
      limits.extensionHours,
    );
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
    await (
      await srv()
    ).logCycleEvent(supabaseAdmin, {
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
    const m = await (await srv()).myMatch(supabaseAdmin, userId, data.matchId);
    await (
      await srv()
    ).transition(supabaseAdmin, m, "odrzucone", {
      decided_at: new Date().toISOString(),
      decided_by: userId,
      decision_reason: data.reason ?? null,
    });
    // Atomowy licznik odrzuconych Projektów na Zleceniu; po progu
    // (rejection_review_threshold) Zlecenie wygasa (§ 5 ust. 1).
    const { data: counter, error: counterError } = await loose(supabaseAdmin).rpc(
      "increment_order_rejections",
      { _order_id: m.order_id },
    );
    if (counterError) throw new Error(counterError.message);
    const counterRow = Array.isArray(counter) ? counter[0] : counter;
    if (counterRow?.expired) {
      await (
        await srv()
      ).logCycleEvent(supabaseAdmin, {
        orderId: m.order_id,
        type: "zlecenie_wygaslo_po_odrzuceniach",
        payload: { rejected_projects_count: counterRow.rejected_projects_count },
        actor: userId,
        actorKind: "system",
      });
    }
    await (
      await srv()
    ).logCycleEvent(supabaseAdmin, {
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
    if (!acceptance)
      throw new Error("Brak zaakceptowanej Umowy ramowej, od której można odstąpić.");
    if (!isWithinWithdrawalWindow(new Date(acceptance.accepted_at), new Date())) {
      throw new Error(
        "14-dniowy termin odstąpienia upłynął. Skontaktuj się z nami — sprawę rozpatrzymy indywidualnie.",
      );
    }

    const { ip, userAgent } = (await srv()).requestMeta();
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
      acknowledged_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);

    // Skutek: aktywne Zlecenia stają się cofnięte.
    await loose(supabaseAdmin)
      .from("investor_orders")
      .update({ status: "cofniete" })
      .eq("user_id", userId)
      .in("status", ["zlozone", "przyjete"]);
    await (
      await srv()
    ).logCycleEvent(supabaseAdmin, {
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
          category: "transactional",
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
    const { ip, userAgent } = (await srv()).requestMeta();
    const { error } = await loose(supabaseAdmin)
      .from("nda_accessions")
      .insert({
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
        // Bez ręcznego potwierdzenia przez admina — przystąpienie skuteczne od razu.
        confirmed_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
    await (
      await srv()
    ).logCycleEvent(supabaseAdmin, {
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
    await (await srv()).assertAdmin(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { CANDIDATE_DB_STATUSES } = await import("@/lib/auto-distribution/engine.server");

    const [
      { data: orders },
      { data: matches },
      { data: events },
      { data: accessions },
      { data: withdrawals },
    ] = await Promise.all([
      loose(supabaseAdmin)
        .from("investor_orders")
        .select("id, order_seq, user_id, amount_pln, status")
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
    await (await srv()).expireStaleReservations(supabaseAdmin, matches ?? []);

    // Sugestie Dopasowań: kompletne wnioski do kwoty maksymalnej Zlecenia,
    // bez aktywnego obiegu (wyłączność sekwencyjna).
    const activeAppIds = new Set(
      (matches ?? [])
        .filter((m: any) =>
          ["dopasowane", "teaser", "karta_leada", "rezerwacja"].includes(m.status),
        )
        .map((m: any) => m.application_id),
    );
    const { data: apps } = await loose(supabaseAdmin)
      .from("loan_applications")
      .select("id, loan_amount, preferred_period_months, status, created_at")
      .in("status", CANDIDATE_DB_STATUSES)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
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
    await (await srv()).assertAdmin(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return (await srv()).insertMatch(supabaseAdmin, {
      orderId: data.orderId,
      applicationId: data.applicationId,
      releaseTeaser: data.releaseTeaser,
      passedFromMatchId: data.passedFromMatchId,
      actorId: context.userId,
      actorKind: "admin",
    });
  });

export const releaseTeaser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ matchId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await (await srv()).assertAdmin(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m } = await loose(supabaseAdmin)
      .from("investor_order_matches")
      .select("*")
      .eq("id", data.matchId)
      .maybeSingle();
    if (!m) throw new Error("Nie znaleziono Dopasowania.");
    await (
      await srv()
    ).transition(supabaseAdmin, m, "teaser", { teaser_released_at: new Date().toISOString() });
    await (
      await srv()
    ).logCycleEvent(supabaseAdmin, {
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
    await (await srv()).assertAdmin(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m } = await loose(supabaseAdmin)
      .from("investor_order_matches")
      .select("id, order_id, project_ref, status, transfer_card_approved_at")
      .eq("id", data.matchId)
      .maybeSingle();
    if (!m) throw new Error("Nie znaleziono Dopasowania.");
    return (await srv()).issueTransferCard(supabaseAdmin, m, {
      notes: data.notes,
      actorId: context.userId,
      actorKind: "admin",
    });
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
    await (await srv()).assertAdmin(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m } = await loose(supabaseAdmin)
      .from("investor_order_matches")
      .select("*")
      .eq("id", data.matchId)
      .maybeSingle();
    if (!m) throw new Error("Nie znaleziono Dopasowania.");
    await (
      await srv()
    ).transition(supabaseAdmin, m, data.decision, {
      decided_at: new Date().toISOString(),
      decided_by: context.userId,
      decision_reason: data.reason ?? null,
    });
    await (
      await srv()
    ).logCycleEvent(supabaseAdmin, {
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

/** Zał. 6 przy wypłacie: Prowizja od Pożyczkobiorcy 5% / min 5000 zł. */
export const confirmZal6 = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ matchId: z.string().uuid(), payoutAmountPln: z.number().positive() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await (await srv()).assertAdmin(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m } = await loose(supabaseAdmin)
      .from("investor_order_matches")
      .select("id, order_id, status")
      .eq("id", data.matchId)
      .maybeSingle();
    if (!m) throw new Error("Nie znaleziono Dopasowania.");
    if (m.status !== "transakcja")
      throw new Error("Zał. 6 potwierdza się dla Dopasowania w Transakcji.");
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
    // Brak Opłaty Sukcesu (Umowa ramowa v7) — Inwestor płaci wyłącznie abonament.
    await (
      await srv()
    ).logCycleEvent(supabaseAdmin, {
      matchId: m.id,
      orderId: m.order_id,
      type: "zal6_potwierdzony",
      payload: {
        payout_amount_pln: data.payoutAmountPln,
        provision_amount_pln: provision,
      },
      actor: context.userId,
      actorKind: "admin",
    });
    return { ok: true, provisionAmountPln: provision };
  });

export const confirmNdaAccession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ accessionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await (await srv()).assertAdmin(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await loose(supabaseAdmin)
      .from("nda_accessions")
      .update({ confirmed_at: new Date().toISOString(), confirmed_by: context.userId })
      .eq("id", data.accessionId)
      .is("confirmed_at", null);
    if (error) throw new Error(error.message);
    await (
      await srv()
    ).logCycleEvent(supabaseAdmin, {
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
    await (await srv()).assertAdmin(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await loose(supabaseAdmin)
      .from("consumer_withdrawals")
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: context.userId })
      .eq("id", data.withdrawalId)
      .is("acknowledged_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
