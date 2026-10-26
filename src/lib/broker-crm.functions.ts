// CRM pośrednika — jak inwestorzy reagują na jego oferty.
// Zbiera trzy źródła reakcji dla wniosków wprowadzonych przez pośrednika:
//  - offer_distributions (wysyłka oferty do inwestora i jego odpowiedź),
//  - investor_order_matches (dopasowanie do Zlecenia inwestora i dalszy obieg),
//  - investor_offers (propozycje finansowania złożone przez inwestora).
// Inwestorzy są anonimizowani („Inwestor A”, „Inwestor B”…) — tożsamość
// inwestora ujawnia wyłącznie Finance You w obiegu Zlecenie–Projekt.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ReactionKind = "wysylka" | "dopasowanie" | "propozycja";
export type ReactionTone = "neutral" | "positive" | "negative";

export type InvestorReaction = {
  id: string;
  kind: ReactionKind;
  investor: string;
  status: string;
  label: string;
  tone: ReactionTone;
  at: string;
  amount: number | null;
  periodMonths: number | null;
  yearlyYield: number | null;
  note: string | null;
};

export type ApplicationReactions = {
  applicationId: string;
  createdAt: string;
  status: string;
  loanAmount: number | null;
  clientName: string;
  city: string | null;
  propertyType: string | null;
  summary: {
    investors: number;
    interested: number;
    proposals: number;
    rejected: number;
    lastActivityAt: string | null;
  };
  reactions: InvestorReaction[];
};

const DISTRIBUTION: Record<string, { label: string; tone: ReactionTone }> = {
  szkic: { label: "Oferta przygotowana do wysyłki", tone: "neutral" },
  gotowe_do_wysylki: { label: "Oferta przygotowana do wysyłki", tone: "neutral" },
  wyslane: { label: "Oferta wysłana — czeka na reakcję", tone: "neutral" },
  otworzone: { label: "Inwestor otworzył ofertę", tone: "neutral" },
  odpowiedz_otrzymana: { label: "Inwestor odpowiedział", tone: "positive" },
  prosba_o_dodatkowe_informacje: {
    label: "Inwestor prosi o dodatkowe informacje",
    tone: "positive",
  },
  oferta_otrzymana: { label: "Inwestor złożył ofertę", tone: "positive" },
  odrzucone: { label: "Inwestor odmówił", tone: "negative" },
  brak_odpowiedzi: { label: "Brak odpowiedzi inwestora", tone: "negative" },
  zamkniete: { label: "Wysyłka zamknięta", tone: "neutral" },
};

const MATCH: Record<string, { label: string; tone: ReactionTone }> = {
  dopasowane: { label: "Oferta dopasowana do zlecenia inwestora", tone: "neutral" },
  teaser: { label: "Inwestor ogląda skrót oferty", tone: "neutral" },
  karta_leada: { label: "Inwestor chce poznać szczegóły", tone: "positive" },
  rezerwacja: { label: "Inwestor zarezerwował ofertę", tone: "positive" },
  transakcja: { label: "Inwestor przechodzi do transakcji", tone: "positive" },
  odrzucone: { label: "Inwestor zrezygnował", tone: "negative" },
  przekazane: { label: "Inwestor zrezygnował — oferta przekazana dalej", tone: "negative" },
  wygasle: { label: "Inwestor nie zdecydował w terminie", tone: "negative" },
};

const PROPOSAL: Record<string, { label: string; tone: ReactionTone }> = {
  szkic: { label: "Inwestor przygotowuje propozycję", tone: "positive" },
  zlozona: { label: "Inwestor złożył propozycję finansowania", tone: "positive" },
  w_trakcie_weryfikacji: { label: "Propozycja inwestora w weryfikacji", tone: "positive" },
  zatwierdzona_przez_administratora: {
    label: "Propozycja inwestora zatwierdzona",
    tone: "positive",
  },
  odrzucona_przez_administratora: { label: "Propozycja inwestora odrzucona", tone: "negative" },
  wyslana_do_klienta: { label: "Propozycja wysłana do klienta", tone: "positive" },
  zaakceptowana_przez_klienta: { label: "Klient przyjął propozycję inwestora", tone: "positive" },
  odrzucona_przez_klienta: { label: "Klient odrzucił propozycję", tone: "negative" },
  wygasla: { label: "Propozycja inwestora wygasła", tone: "negative" },
  wycofana_przez_inwestora: { label: "Inwestor wycofał propozycję", tone: "negative" },
};

function investorLetter(n: number): string {
  let s = "";
  let i = n;
  do {
    s = String.fromCharCode(65 + (i % 26)) + s;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return `Inwestor ${s}`;
}

function clip(s: string | null | undefined, n = 400): string | null {
  const t = (s ?? "").trim();
  if (!t) return null;
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export const getMyInvestorReactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ applicationId: z.string().uuid().optional() }).parse(i ?? {}))
  .handler(async ({ data, context }): Promise<ApplicationReactions[]> => {
    const { assertBrokerOrStaff } = await import("@/lib/access/guards.server");
    await assertBrokerOrStaff(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;

    // Wyłącznie wnioski wprowadzone przez zalogowanego pośrednika.
    let appsQ = db
      .from("loan_applications")
      .select(
        "id, status, loan_amount, created_at, client:clients(first_name,last_name,city), properties(city,property_type)",
      )
      .eq("created_by_partner_user_id", context.userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.applicationId) appsQ = appsQ.eq("id", data.applicationId);
    const { data: apps, error } = await appsQ;
    if (error) throw new Error(error.message);
    const ids = ((apps ?? []) as any[]).map((a) => a.id as string);
    if (!ids.length) return [];

    const [distQ, matchQ, offerQ] = await Promise.all([
      db
        .from("offer_distributions")
        .select(
          "id, loan_application_id, investor_id, distribution_status, sent_at, responded_at, response_summary, additional_info_request, created_at, updated_at",
        )
        .in("loan_application_id", ids),
      db
        .from("investor_order_matches")
        .select(
          "id, application_id, status, created_at, updated_at, decided_at, order:investor_orders(user_id)",
        )
        .in("application_id", ids),
      db
        .from("investor_offers")
        .select(
          "id, loan_application_id, investor_id, offer_status, proposed_amount, period_months, expected_yearly_yield, submitted_at, created_at, updated_at",
        )
        .in("loan_application_id", ids)
        .neq("offer_status", "szkic"),
    ]);
    const dists = (distQ.data ?? []) as any[];
    const matches = (matchQ.data ?? []) as any[];
    const offers = (offerQ.data ?? []) as any[];

    // Ten sam inwestor w różnych źródłach → wspólny klucz po user_id.
    const investorIds = Array.from(
      new Set([...dists, ...offers].map((r) => r.investor_id).filter(Boolean)),
    );
    const userByInvestor = new Map<string, string>();
    if (investorIds.length) {
      const { data: invs } = await db.from("investors").select("id, user_id").in("id", investorIds);
      for (const i of (invs ?? []) as any[]) if (i.user_id) userByInvestor.set(i.id, i.user_id);
    }
    const keyForInvestor = (id: string) => {
      const u = userByInvestor.get(id);
      return u ? `u:${u}` : `i:${id}`;
    };

    return ((apps ?? []) as any[]).map((app) => {
      const appId = app.id as string;
      const raw: Array<Omit<InvestorReaction, "investor"> & { key: string }> = [];

      for (const d of dists.filter((x) => x.loan_application_id === appId)) {
        const m = DISTRIBUTION[d.distribution_status] ?? {
          label: d.distribution_status,
          tone: "neutral" as const,
        };
        raw.push({
          id: `d:${d.id}`,
          key: keyForInvestor(d.investor_id),
          kind: "wysylka",
          status: d.distribution_status,
          label: m.label,
          tone: m.tone,
          at: d.responded_at ?? d.updated_at ?? d.sent_at ?? d.created_at,
          amount: null,
          periodMonths: null,
          yearlyYield: null,
          note: clip(d.response_summary ?? d.additional_info_request),
        });
      }
      for (const mt of matches.filter((x) => x.application_id === appId)) {
        const m = MATCH[mt.status] ?? { label: mt.status, tone: "neutral" as const };
        const userId = (Array.isArray(mt.order) ? mt.order[0] : mt.order)?.user_id;
        raw.push({
          id: `m:${mt.id}`,
          key: userId ? `u:${userId}` : `m:${mt.id}`,
          kind: "dopasowanie",
          status: mt.status,
          label: m.label,
          tone: m.tone,
          at: mt.decided_at ?? mt.updated_at ?? mt.created_at,
          amount: null,
          periodMonths: null,
          yearlyYield: null,
          note: null,
        });
      }
      for (const o of offers.filter((x) => x.loan_application_id === appId)) {
        const m = PROPOSAL[o.offer_status] ?? { label: o.offer_status, tone: "neutral" as const };
        raw.push({
          id: `o:${o.id}`,
          key: keyForInvestor(o.investor_id),
          kind: "propozycja",
          status: o.offer_status,
          label: m.label,
          tone: m.tone,
          at: o.updated_at ?? o.submitted_at ?? o.created_at,
          amount: o.proposed_amount != null ? Number(o.proposed_amount) : null,
          periodMonths: o.period_months ?? null,
          yearlyYield: o.expected_yearly_yield != null ? Number(o.expected_yearly_yield) : null,
          note: null,
        });
      }

      // Litery nadawane w kolejności pierwszej reakcji inwestora.
      raw.sort((a, b) => String(a.at).localeCompare(String(b.at)));
      const letters = new Map<string, string>();
      for (const r of raw)
        if (!letters.has(r.key)) letters.set(r.key, investorLetter(letters.size));
      const reactions: InvestorReaction[] = raw
        .map(({ key, ...r }) => ({ ...r, investor: letters.get(key)! }))
        .sort((a, b) => String(b.at).localeCompare(String(a.at)));

      const byInvestor = new Map<string, InvestorReaction[]>();
      for (const r of reactions)
        byInvestor.set(r.investor, [...(byInvestor.get(r.investor) ?? []), r]);
      let interested = 0;
      let rejected = 0;
      for (const list of byInvestor.values()) {
        // Ostatnia reakcja inwestora decyduje, czy jest zainteresowany.
        if (list[0].tone === "positive") interested++;
        else if (list[0].tone === "negative") rejected++;
      }

      const client = Array.isArray(app.client) ? app.client[0] : app.client;
      const prop = Array.isArray(app.properties) ? app.properties[0] : app.properties;
      return {
        applicationId: appId,
        createdAt: app.created_at,
        status: app.status,
        loanAmount: app.loan_amount != null ? Number(app.loan_amount) : null,
        clientName:
          [client?.first_name, client?.last_name].filter(Boolean).join(" ") || "Klient bez nazwy",
        city: prop?.city ?? client?.city ?? null,
        propertyType: prop?.property_type ?? null,
        summary: {
          investors: byInvestor.size,
          interested,
          proposals: reactions.filter((r) => r.kind === "propozycja").length,
          rejected,
          lastActivityAt: reactions[0]?.at ?? null,
        },
        reactions,
      };
    });
  });
