// Klienci, KYC (Didit) i AML. Dane wrażliwe (PESEL, konta bankowe, hashe OTP)
// celowo nie są zwracane.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  fail,
  handle,
  ok,
  oneOf,
  personLabel,
  requireRoles,
  requireTeam,
  rowsOf,
  section,
} from "../_helpers";
import { defineListTool, flag, search, since, text, uuid } from "../_list-tool";

const ADMIN_ONLY = ["administrator"] as const;

const CLIENT_SAFE =
  "id, first_name, last_name, email, phone, phone_normalized, phone_verified_at, company_name, nip, regon, krs, city, street, postal_code, country, source, external_id, notes, land_register_number, consent_rodo, consent_terms, consent_marketing, consent_email, consent_sms, consent_phone, consents_accepted_at, do_not_call, do_not_call_reason, do_not_email, do_not_sms, bank_account_verified_at, bik_report_uploaded_at, assigned_user_id, user_id, created_at, updated_at";

export const getClient = defineTool({
  name: "get_client",
  title: "Get client (360)",
  description:
    "Karta klienta: dane kontaktowe i firmowe, zgody i blokady kontaktu, wnioski klienta, stan KYC (Didit) i AML (ryzyko, screening, PEP, sankcje). Bez PESEL i numerów kont. Tylko administrator/operator.",
  inputSchema: { id: z.string().uuid() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ id }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeam(ctx);
      const client = await oneOf(s.from("clients").select(CLIENT_SAFE).eq("id", id), "clients");
      if (!client) return fail("Nie znaleziono klienta.");
      const errors: string[] = [];
      const [applications, kyc, aml, leads] = await Promise.all([
        section(errors, "loan_applications", () =>
          rowsOf(
            s
              .from("loan_applications")
              .select(
                "id, status, loan_amount, completeness_percent, risk_level, available_to_investors, created_at, updated_at",
              )
              .eq("client_id", id)
              .is("deleted_at", null)
              .order("created_at", { ascending: false })
              .limit(50),
            "loan_applications",
          ),
        ),
        section(errors, "didit_verifications", async () =>
          client.user_id
            ? rowsOf(
                s
                  .from("didit_verifications")
                  .select(
                    "id, status, workflow_type, session_number, decided_at, warnings, created_at",
                  )
                  .eq("user_id", client.user_id)
                  .order("created_at", { ascending: false })
                  .limit(5),
                "didit_verifications",
              )
            : [],
        ),
        section(errors, "aml_customers", () =>
          rowsOf(
            s
              .from("aml_customers")
              .select(
                "id, entity_type, risk_level, screening_status, pep_status, sanction_hit, risk_assessed_at, loan_application_id, created_at",
              )
              .eq("client_id", id)
              .order("created_at", { ascending: false })
              .limit(5),
            "aml_customers",
          ),
        ),
        section(errors, "leads", () =>
          rowsOf(
            s
              .from("leads")
              .select("id, type, status, source, created_at")
              .eq("client_id", id)
              .order("created_at", { ascending: false })
              .limit(20),
            "leads",
          ),
        ),
      ]);
      return ok({
        client: { ...client, who: personLabel(client), url: `/admin/klienci/${client.id}` },
        applications: applications ?? [],
        kyc: kyc ?? [],
        aml: aml ?? [],
        leads: leads ?? [],
        errors,
      });
    }),
});

export const listKycVerifications = defineListTool({
  name: "list_kyc_verifications",
  title: "List KYC verifications (Didit)",
  description:
    "Weryfikacje tożsamości Didit: status, typ workflow, decyzja, ostrzeżenia, użytkownik (e-mail z profilu). Tylko administrator/operator.",
  table: "didit_verifications",
  columns:
    "id, user_id, status, workflow_type, session_number, decided_at, warnings, created_at, updated_at",
  resultKey: "verifications",
  access: "team",
  filters: {
    status: text("status", "Status weryfikacji (np. approved, declined, in_review, pending)."),
    user_id: uuid("user_id", "Tylko dla tego użytkownika."),
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

export const listAmlCustomers = defineListTool({
  name: "list_aml_customers",
  title: "List AML customers",
  description:
    "Rejestr AML: podmioty z oceną ryzyka, statusem screeningu, flagami PEP i sankcji. Bez PESEL i numerów dokumentów. Tylko administrator.",
  table: "aml_customers",
  columns:
    "id, entity_type, first_name, last_name, company_name, nip, krs, country_residence, country_activity, citizenship, risk_level, screening_status, pep_status, sanction_hit, risk_assessed_at, financing_purpose, client_id, loan_application_id, created_at, updated_at",
  resultKey: "customers",
  access: ADMIN_ONLY,
  filters: {
    risk_level: text("risk_level", "Poziom ryzyka AML."),
    screening_status: text("screening_status", "Status screeningu."),
    pep_status: flag("pep_status", "Tylko osoby eksponowane politycznie (PEP)."),
    sanction_hit: flag("sanction_hit", "Tylko trafienia sankcyjne."),
    query: search(
      ["first_name", "last_name", "company_name", "nip"],
      "Fraza: nazwisko, firma, NIP.",
    ),
    since: since("created_at"),
  },
});

export const listAmlCases = defineListTool({
  name: "list_aml_cases",
  title: "List AML cases",
  description:
    "Sprawy AML (analizy transakcji, zgłoszenia GIIF): numer, tytuł, status, pochodzenie, podmiot. Tylko administrator.",
  table: "aml_cases",
  columns: "id, case_no, title, status, origin, customer_id, contract_ref, created_at, updated_at",
  resultKey: "cases",
  access: ADMIN_ONLY,
  filters: {
    status: text("status", "Status sprawy."),
    customer_id: uuid("customer_id", "Tylko dla tego podmiotu AML."),
    query: search(["case_no", "title", "description"], "Fraza: numer, tytuł, opis."),
  },
});

export const getAmlCase = defineTool({
  name: "get_aml_case",
  title: "Get AML case",
  description:
    "Sprawa AML w całości: opis, strony, kwoty, chronologia, decyzje, uzasadnienie, screeningi podmiotu i raporty GIIF (status, wysyłka, UPO). Tylko administrator.",
  inputSchema: { id: z.string().uuid() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ id }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRoles(ctx, ADMIN_ONLY);
      const c = await oneOf(s.from("aml_cases").select("*").eq("id", id), "aml_cases");
      if (!c) return fail("Nie znaleziono sprawy AML.");
      const errors: string[] = [];
      const [screenings, reports] = await Promise.all([
        section(errors, "aml_screenings", async () =>
          c.customer_id
            ? rowsOf(
                s
                  .from("aml_screenings")
                  .select(
                    "id, search_type, subject_kind, subject_name, status, total_hits, hit_resolution, resolution_note, resolved_at, created_at",
                  )
                  .eq("customer_id", c.customer_id)
                  .order("created_at", { ascending: false })
                  .limit(20),
                "aml_screenings",
              )
            : [],
        ),
        section(errors, "aml_reports", () =>
          rowsOf(
            s
              .from("aml_reports")
              .select(
                "id, report_type, status, current_version, giif_status, giif_submission_id, submitted_at, upo_received_at, created_at",
              )
              .eq("case_id", id)
              .order("created_at", { ascending: false })
              .limit(20),
            "aml_reports",
          ),
        ),
      ]);
      return ok({ case: c, screenings: screenings ?? [], reports: reports ?? [], errors });
    }),
});

export const listAmlScreenings = defineListTool({
  name: "list_aml_screenings",
  title: "List AML screenings",
  description:
    "Screeningi sankcyjne/PEP (Dilisense): podmiot, typ, liczba trafień, rozstrzygnięcie, kto i kiedy rozstrzygnął. Tylko administrator.",
  table: "aml_screenings",
  columns:
    "id, customer_id, subject_kind, subject_name, subject_dob, search_type, status, total_hits, hit_resolution, resolution_note, resolved_at, resolved_by, invalidated_at, created_at",
  resultKey: "screenings",
  access: ADMIN_ONLY,
  filters: {
    customer_id: uuid("customer_id", "Tylko dla tego podmiotu AML."),
    status: text("status", "Status screeningu."),
    query: search(["subject_name"], "Fraza: nazwa podmiotu."),
    since: since("created_at"),
  },
});

export const clientsAmlTools = [
  getClient,
  listKycVerifications,
  listAmlCustomers,
  listAmlCases,
  getAmlCase,
  listAmlScreenings,
];
