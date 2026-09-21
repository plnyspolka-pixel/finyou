// Inwestorzy: karta 360, kryteria dystrybucji, zlecenia i dopasowania,
// screeningi, propozycje zmian kryteriów, success fee, dokumenty prawne.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  countBy,
  fail,
  handle,
  ok,
  oneOf,
  personLabel,
  requireUser,
  rowsOf,
  section,
} from "../_helpers";
import { defineListTool, flag, since, text, uuid } from "../_list-tool";

const ADMIN_ONLY = ["administrator"] as const;

const INVESTOR_SAFE =
  "id, first_name, last_name, company_name, email, phone, investor_type, entity_type, legal_form, nip, krs, regon, city, postal_code, country, representative_first_name, representative_last_name, representative_role, is_active, subscription_plan, subscription_status, subscription_active_until, subscription_source, web2learn_status, user_id, created_at, updated_at";

export const getInvestor = defineTool({
  name: "get_investor",
  title: "Get investor (360)",
  description:
    "Karta inwestora: dane, subskrypcja, kryteria dystrybucji (kwoty, auto-wysyłka, pauza), ustawienia instytucjonalne (LTV, lokalizacje, typy nieruchomości), oferty (liczby po statusie + ostatnie), dystrybucje, zlecenia inwestora, zaakceptowane dokumenty. Bez PESEL i konta. Inwestor widzi siebie (RLS), zespół — każdego.",
  inputSchema: { id: z.string().uuid() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ id }, ctx: ToolContext) =>
    handle(async () => {
      const s = requireUser(ctx);
      const inv = await oneOf(s.from("investors").select(INVESTOR_SAFE).eq("id", id), "investors");
      if (!inv) return fail("Nie znaleziono inwestora (albo brak uprawnień).");
      const errors: string[] = [];
      const [criteria, institutional, offers, distributions, orders, agreements] =
        await Promise.all([
          section(errors, "investor_distribution_criteria", () =>
            oneOf(
              s
                .from("investor_distribution_criteria")
                .select(
                  "min_amount, max_amount, auto_send_enabled, accepting_applications, paused_until, notes, updated_at",
                )
                .eq("investor_id", id),
              "investor_distribution_criteria",
            ),
          ),
          section(errors, "institutional_investor_settings", () =>
            oneOf(
              s
                .from("institutional_investor_settings")
                .select(
                  "is_active, max_ltv, preferred_min_amount, preferred_max_amount, preferred_locations, preferred_property_types, updated_at",
                )
                .eq("investor_id", id),
              "institutional_investor_settings",
            ),
          ),
          section(errors, "investor_offers", () =>
            rowsOf(
              s
                .from("investor_offers")
                .select(
                  "id, loan_application_id, offer_status, proposed_amount, period_months, expected_yearly_yield, submitted_at, created_at",
                )
                .eq("investor_id", id)
                .order("created_at", { ascending: false })
                .limit(200),
              "investor_offers",
            ),
          ),
          section(errors, "offer_distributions", () =>
            rowsOf(
              s
                .from("offer_distributions")
                .select(
                  "id, loan_application_id, distribution_status, sent_at, responded_at, response_summary",
                )
                .eq("investor_id", id)
                .order("created_at", { ascending: false })
                .limit(100),
              "offer_distributions",
            ),
          ),
          section(errors, "investor_orders", async () =>
            inv.user_id
              ? rowsOf(
                  s
                    .from("investor_orders")
                    .select(
                      "id, order_seq, amount_pln, max_period_months, min_annual_yield, status, submitted_at, expires_at, rejected_projects_count",
                    )
                    .eq("user_id", inv.user_id)
                    .order("created_at", { ascending: false })
                    .limit(20),
                  "investor_orders",
                )
              : [],
          ),
          section(errors, "investor_agreement_acceptances", async () =>
            inv.user_id
              ? rowsOf(
                  s
                    .from("investor_agreement_acceptances")
                    .select(
                      "document_code, version, entity_variant, is_consumer, auth_method, accepted_at",
                    )
                    .eq("user_id", inv.user_id)
                    .order("accepted_at", { ascending: false })
                    .limit(20),
                  "investor_agreement_acceptances",
                )
              : [],
          ),
        ]);
      const offerRows = offers ?? [];
      const distRows = distributions ?? [];
      return ok({
        investor: { ...inv, who: personLabel(inv), url: `/admin/inwestorzy/${inv.id}` },
        criteria,
        institutional_settings: institutional,
        offers: {
          total: offerRows.length,
          by_status: countBy(offerRows, "offer_status"),
          recent: offerRows.slice(0, 10),
        },
        distributions: {
          total: distRows.length,
          by_status: countBy(distRows, "distribution_status"),
          recent: distRows.slice(0, 10),
        },
        orders: orders ?? [],
        agreements: agreements ?? [],
        errors,
      });
    }),
});

export const listInvestorCriteria = defineListTool({
  name: "list_investor_criteria",
  title: "List investor distribution criteria",
  description:
    "Kryteria auto-dystrybucji instytucji/inwestorów: widełki kwot, czy przyjmują wnioski, czy auto-wysyłka włączona, pauza, notatki — z danymi inwestora. Tylko administrator/operator.",
  table: "investor_distribution_criteria",
  columns:
    "investor_id, min_amount, max_amount, auto_send_enabled, accepting_applications, paused_until, notes, updated_at",
  resultKey: "criteria",
  access: "team",
  order: { column: "updated_at", ascending: false },
  filters: {
    accepting_applications: flag(
      "accepting_applications",
      "Tylko przyjmujący / nieprzyjmujący wnioski.",
    ),
    auto_send_enabled: flag("auto_send_enabled", "Tylko z włączoną auto-wysyłką."),
  },
  attach: [
    {
      key: "investor_id",
      table: "investors",
      columns: "id, first_name, last_name, company_name, email, investor_type",
      as: "investor",
    },
  ],
});

export const listInvestorOrders = defineListTool({
  name: "list_investor_orders",
  title: "List investor orders",
  description:
    "Zlecenia inwestorów (moduł „Zlecenie–Projekt”): kwota, maks. okres, min. rentowność, ważność, status, wybór konsumencki, terminy. Inwestor widzi swoje (RLS), zespół — wszystkie.",
  table: "investor_orders",
  columns:
    "id, order_seq, user_id, amount_pln, max_period_months, min_annual_yield, validity_days, status, consumer_choice, submitted_at, decided_at, rejection_reason, expires_at, rejected_projects_count, created_at",
  resultKey: "orders",
  filters: {
    status: text("status", "Status zlecenia."),
    user_id: uuid("user_id", "Tylko dla tego użytkownika-inwestora."),
    since: since("created_at"),
  },
  attach: [
    {
      key: "user_id",
      table: "profiles",
      columns: "user_id, first_name, last_name, email",
      as: "user",
      targetKey: "user_id",
    },
  ],
});

export const listInvestorOrderMatches = defineListTool({
  name: "list_investor_order_matches",
  title: "List investor order matches",
  description:
    "Dopasowania zlecenie ↔ wniosek: status, teaser, akceptacja karty leada, ujawnienie, rezerwacja, decyzja, kwoty wypłaty i prowizji. Widoczność wg RLS.",
  table: "investor_order_matches",
  columns:
    "id, match_seq, project_ref, order_id, application_id, status, teaser_released_at, karta_leada_accepted_at, disclosed_at, reservation_expires_at, reservation_extended, decided_at, decision_reason, payout_amount_pln, provision_amount_pln, created_at, updated_at",
  resultKey: "matches",
  filters: {
    status: text("status", "Status dopasowania."),
    order_id: uuid("order_id", "Tylko dla tego zlecenia."),
    application_id: uuid("application_id", "Tylko dla tego wniosku."),
    since: since("created_at"),
  },
});

export const listInvestorScreenings = defineListTool({
  name: "list_investor_screenings",
  title: "List investor screenings",
  description:
    "Screeningi sankcyjne/PEP inwestorów: podmiot, liczba trafień, wynik, przegląd (kto, kiedy, notatka). Tylko administrator.",
  table: "investor_screenings",
  columns:
    "id, user_id, subject_kind, subject_name, total_hits, result, reviewed_by, reviewed_at, review_note, created_at",
  resultKey: "screenings",
  access: ADMIN_ONLY,
  filters: {
    result: text("result", "Wynik screeningu."),
    user_id: uuid("user_id", "Tylko dla tego użytkownika."),
    since: since("created_at"),
  },
});

export const listCriteriaChangeProposals = defineListTool({
  name: "list_criteria_change_proposals",
  title: "List criteria change proposals",
  description:
    "Propozycje zmian kryteriów instytucji wyciągnięte przez agenta korespondencji z ich maili (do zatwierdzenia jednym kliknięciem w panelu): podsumowanie, proponowana zmiana, status. Tylko administrator/operator.",
  table: "criteria_change_proposals",
  columns:
    "id, investor_id, source_message_id, summary, proposed_patch, status, created_at, decided_by, decided_at",
  resultKey: "proposals",
  access: "team",
  filters: {
    status: text("status", "Status propozycji (np. pending, accepted, rejected)."),
    investor_id: uuid("investor_id", "Tylko dla tej instytucji."),
  },
  attach: [
    {
      key: "investor_id",
      table: "investors",
      columns: "id, first_name, last_name, company_name, email",
      as: "investor",
    },
  ],
});

export const listInvestorSuccessFees = defineListTool({
  name: "list_investor_success_fees",
  title: "List investor success fees",
  description:
    "Opłaty success fee inwestorów (moduł zleceń): kwota pożyczki, stawka w punktach bazowych, kwota opłaty, status, faktura. Tylko administrator.",
  table: "investor_success_fees",
  columns:
    "id, user_id, match_id, loan_amount_pln, fee_bps, fee_grosz, status, legal_basis, invoice_id, note, created_at, updated_at",
  resultKey: "fees",
  access: ADMIN_ONLY,
  filters: {
    status: text("status", "Status opłaty."),
    user_id: uuid("user_id", "Tylko dla tego użytkownika."),
  },
});

export const listAgreementAcceptances = defineListTool({
  name: "list_agreement_acceptances",
  title: "List agreement acceptances",
  description:
    "Akceptacje dokumentów prawnych przez inwestorów (umowa ramowa, regulaminy, oświadczenia): kod dokumentu, wersja, wariant podmiotu, metoda uwierzytelnienia, data. Inwestor widzi swoje (RLS), zespół — wszystkie.",
  table: "investor_agreement_acceptances",
  columns:
    "id, user_id, document_code, version, entity_variant, is_consumer, auth_method, accepted_at",
  resultKey: "acceptances",
  order: { column: "accepted_at", ascending: false },
  filters: {
    user_id: uuid("user_id", "Tylko dla tego użytkownika."),
    document_code: text("document_code", "Kod dokumentu."),
    since: since("accepted_at", "akceptacji"),
  },
});

export const listConsumerWithdrawals = defineListTool({
  name: "list_consumer_withdrawals",
  title: "List consumer withdrawals",
  description:
    "Odstąpienia konsumenckie od umów inwestora: dokument, wersja, data złożenia, potwierdzenie przyjęcia. Tylko administrator/operator.",
  table: "consumer_withdrawals",
  columns:
    "id, user_id, document_code, document_version, submitted_at, acknowledged_at, acknowledged_by",
  resultKey: "withdrawals",
  access: "team",
  order: { column: "submitted_at", ascending: false },
  filters: {
    user_id: uuid("user_id", "Tylko dla tego użytkownika."),
    since: since("submitted_at", "złożenia"),
  },
});

export const listLegalDocuments = defineListTool({
  name: "list_legal_documents",
  title: "List legal documents",
  description:
    "Paczka dokumentów prawnych inwestora (umowa ramowa, regulaminy, oświadczenia): kod, pakiet, wersja, tytuł, czy aktywny. Treść dokumentu nie jest zwracana.",
  table: "legal_documents",
  columns: "code, package_id, version, title, sort_order, active, docx_filename, updated_at",
  resultKey: "documents",
  order: { column: "sort_order", ascending: true },
  filters: {
    active: flag("active", "Tylko aktywne wersje."),
    package_id: text("package_id", "Identyfikator pakietu."),
  },
});

export const investorsExtraTools = [
  getInvestor,
  listInvestorCriteria,
  listInvestorOrders,
  listInvestorOrderMatches,
  listInvestorScreenings,
  listCriteriaChangeProposals,
  listInvestorSuccessFees,
  listAgreementAcceptances,
  listConsumerWithdrawals,
  listLegalDocuments,
];
