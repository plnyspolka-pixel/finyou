// Cykl Zlecenie–Projekt — helpery wyłącznie serwerowe (getRequest, klient
// service-role). Oddzielny moduł, bo funkcje eksportowane z pliku .functions.ts
// trafiałyby do bundla klienta; handlery ładują go dynamicznie.
import { getRequest } from "@tanstack/react-start/server";
import {
  buildKartaLeada,
  canTransition,
  ACTIVE_MATCH_STATUSES,
  amountMatchesOrder,
  isMatchStale,
  TEASER_HOURS,
  type MatchStatus,
} from "./order-cycle-core";

const loose = (c: unknown) => c as any;

export function requestMeta(): { ip: string | null; userAgent: string | null } {
  const request = getRequest();
  return {
    ip:
      request?.headers.get("cf-connecting-ip") ||
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null,
    userAgent: request?.headers.get("user-agent") ?? null,
  };
}

export async function assertAdmin(supabase: any, userId: string) {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const ok = (roles ?? []).some((r: { role: string }) => r.role === "administrator");
  if (!ok) throw new Error("Brak uprawnień (wymagana rola administrator).");
}

/** Wersje dokumentów pakietu do dziennika i Karty Leada. */
export async function packDocumentVersions(
  db: any,
): Promise<Array<{ code: string; version: string; sha256: string }>> {
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

export async function logCycleEvent(
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
  await loose(db)
    .from("investor_order_events")
    .insert({
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
export async function buildTeaser(db: any, applicationId: string) {
  const { data: la } = await loose(db)
    .from("loan_applications")
    .select(
      "id, loan_amount, preferred_period_months, annual_investor_rate, estimated_ltv, deleted_at",
    )
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

/** Utworzenie pary Projekt–Zlecenie (+ teaser, Karta Leada, dziennik) —
 *  wspólne dla ręcznego dopasowania admina i automatu. */
export async function insertMatch(
  db: any,
  input: {
    orderId: string;
    applicationId: string;
    releaseTeaser: boolean;
    passedFromMatchId?: string;
    actorId: string | null;
    actorKind: "admin" | "system";
  },
) {
  const { data: order } = await loose(db)
    .from("investor_orders")
    .select("id, order_seq, status, expires_at, amount_pln")
    .eq("id", input.orderId)
    .maybeSingle();
  if (!order) throw new Error("Nie znaleziono Zlecenia.");
  if (order.status !== "przyjete")
    throw new Error(`Zlecenie ma status ${order.status} (wymagane: przyjęte).`);
  if (order.expires_at && new Date(order.expires_at).getTime() < Date.now()) {
    throw new Error("Zlecenie wygasło.");
  }

  const teaser = await buildTeaser(db, input.applicationId);
  const now = new Date();
  const { data: inserted, error } = await loose(db)
    .from("investor_order_matches")
    .insert({
      order_id: input.orderId,
      application_id: input.applicationId,
      status: input.releaseTeaser ? "teaser" : "dopasowane",
      teaser,
      teaser_released_at: input.releaseTeaser ? now.toISOString() : null,
      teaser_expires_at: input.releaseTeaser
        ? new Date(now.getTime() + TEASER_HOURS * 3600_000).toISOString()
        : null,
      passed_from_match_id: input.passedFromMatchId ?? null,
      created_by: input.actorId,
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
  const docs = await packDocumentVersions(db);
  const karta = buildKartaLeada({
    projectRef: inserted.project_ref,
    orderSeq: Number(order.order_seq),
    matchedAt: now,
    teaser,
    documents: docs,
  });
  await loose(db)
    .from("investor_order_matches")
    .update({ karta_leada: karta })
    .eq("id", inserted.id);

  await logCycleEvent(db, {
    matchId: inserted.id,
    orderId: input.orderId,
    type: "dopasowanie",
    payload: {
      project_ref: inserted.project_ref,
      application_id: input.applicationId,
      auto: input.actorKind === "system",
    },
    actor: input.actorId,
    actorKind: input.actorKind,
  });
  if (input.releaseTeaser) {
    await logCycleEvent(db, {
      matchId: inserted.id,
      orderId: input.orderId,
      type: "teaser_udostepniony",
      payload: { project_ref: inserted.project_ref },
      actor: input.actorId,
      actorKind: input.actorKind,
    });
  }
  return { ok: true, matchId: inserted.id as string, projectRef: inserted.project_ref as string };
}

/**
 * Data „pojawienia się" wniosków, do których od `sinceIso` scalono nowszy
 * duplikat (np. operator dodał ponownie klienta, który był już w bazie —
 * deduplikacja archiwizuje nowy wniosek i przenosi dane do starszego).
 * Mapa: id wniosku docelowego → utworzenie najnowszego scalonego.
 */
export async function latestMergedAt(db: any, sinceIso: string): Promise<Map<string, string>> {
  const { data } = await loose(db)
    .from("loan_applications")
    .select("merged_into_id, created_at")
    .not("merged_into_id", "is", null)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: true })
    .limit(500);
  const out = new Map<string, string>();
  for (const r of data ?? []) out.set(r.merged_into_id, r.created_at);
  return out;
}

/** Karta Transferu Danych (Moduł RODO) per Projekt — wystawiana automatycznie
 *  przy akceptacji Karty Leada (bądź przy Ujawnieniu), ręcznie przez admina. */
export async function issueTransferCard(
  db: any,
  m: {
    id: string;
    order_id: string;
    project_ref: string;
    transfer_card_approved_at?: string | null;
  },
  opts: { notes?: string; actorId: string | null; actorKind: "admin" | "system" },
) {
  if (m.transfer_card_approved_at) return { ok: true, already: true };
  const now = new Date().toISOString();
  const card = {
    projekt_ref: m.project_ref,
    podstawa: "Umowa udostępniania i ochrony danych osobowych (Moduł A — odrębni administratorzy)",
    kategorie_danych:
      "dane identyfikacyjne klienta i właściciela nieruchomości, dane nieruchomości (adres, nr KW), dokumentacja finansowa i prawna Projektu",
    cel: "ocena, negocjowanie i ewentualne wykonanie Projektu w wykonaniu przyjętego Zlecenia",
    uwagi: opts.notes ?? null,
    zatwierdzono: now,
  };
  const { data: updated, error } = await loose(db)
    .from("investor_order_matches")
    .update({
      transfer_card: card,
      transfer_card_approved_at: now,
      transfer_card_approved_by: opts.actorId,
      updated_at: now,
    })
    .eq("id", m.id)
    .is("transfer_card_approved_at", null)
    .select("id");
  if (error) throw new Error(error.message);
  if (!updated?.length) return { ok: true, already: true };
  await logCycleEvent(db, {
    matchId: m.id,
    orderId: m.order_id,
    type: "karta_transferu_zatwierdzona",
    payload: { ...card, auto: opts.actorKind === "system" },
    actor: opts.actorId,
    actorKind: opts.actorKind,
  });
  return { ok: true };
}

export async function myMatch(db: any, userId: string, matchId: string) {
  const { data: m } = await loose(db)
    .from("investor_order_matches")
    .select("*, investor_orders!inner(id, user_id, order_seq, status)")
    .eq("id", matchId)
    .maybeSingle();
  if (!m || m.investor_orders?.user_id !== userId) throw new Error("Nie znaleziono Dopasowania.");
  return m;
}

export async function transition(
  db: any,
  match: any,
  to: MatchStatus,
  patch: Record<string, unknown> = {},
) {
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

/**
 * Leniwe wygaszanie Dopasowań po terminie — teaser (24 h, +12 h) i rezerwacja
 * — we WSZYSTKICH Zleceniach (zwalnia Projekty zajęte u innych zleceniodawców).
 * Wiersze z `matches` (jeśli podane) dostają nowy status także w pamięci.
 */
export async function expireStaleMatches(db: any, matches: any[] = []) {
  const now = new Date();
  const nowIso = now.toISOString();
  const [{ data: teasers }, { data: reservations }] = await Promise.all([
    // Termin teasera liczony w kodzie (starsze wiersze bez teaser_expires_at).
    loose(db)
      .from("investor_order_matches")
      .select(
        "id, order_id, status, teaser_expires_at, teaser_released_at, teaser_extended, created_at",
      )
      .eq("status", "teaser")
      .or(`teaser_expires_at.lt.${nowIso},teaser_expires_at.is.null`),
    loose(db)
      .from("investor_order_matches")
      .select("id, order_id, status, reservation_expires_at")
      .eq("status", "rezerwacja")
      .lt("reservation_expires_at", nowIso),
  ]);
  for (const m of [...(teasers ?? []), ...(reservations ?? [])]) {
    if (!isMatchStale(m, now)) continue;
    const { data: updated } = await loose(db)
      .from("investor_order_matches")
      .update({ status: "wygasle", decided_at: nowIso, updated_at: nowIso })
      .eq("id", m.id)
      .eq("status", m.status)
      .select("id");
    if (!updated?.length) continue;
    for (const row of matches) if (row.id === m.id) row.status = "wygasle";
    await logCycleEvent(db, {
      matchId: m.id,
      orderId: m.order_id,
      type: m.status === "teaser" ? "teaser_wygasl" : "rezerwacja_wygasla",
      payload:
        m.status === "teaser"
          ? {
              teaser_released_at: m.teaser_released_at ?? null,
              teaser_expires_at: m.teaser_expires_at ?? null,
            }
          : { reservation_expires_at: m.reservation_expires_at },
    });
  }
}
