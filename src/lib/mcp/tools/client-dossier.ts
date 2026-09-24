// Teczka klienta: wyszukiwanie po dowolnym identyfikatorze i komplet danych
// klienta ze wszystkich modułów (CRM, wnioski, nieruchomości, dokumenty, KW,
// analizy, komunikacja, czat, umowy, KYC/AML, windykacja) w jednym wywołaniu,
// plus odczyt treści dokumentu. Tylko zespół; dane wrażliwe (PESEL, dowód,
// rachunek bankowy, raport BIK) wyłącznie dla administratora. Każde otwarcie
// teczki trafia do audit_logs.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  actorId,
  clampLimit,
  fail,
  handle,
  hasRole,
  likeSafe,
  ok,
  oneOf,
  personLabel,
  requireTeamAdmin,
  rowsOf,
  section,
  snippet,
  type ContentBlock,
} from "../_helpers";
import { compactKwNumber, formatKwNumber, normalizeKwNumber } from "@/lib/kw";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";

// Kolumny techniczne, których nie zwracamy nikomu (hashe i liczniki OTP).
const CLIENT_HIDDEN = [
  "phone_otp_hash",
  "phone_otp_attempts",
  "phone_otp_expires_at",
  "phone_otp_sent_at",
  "phone_otp_target",
];
// Dane wrażliwe — tylko administrator.
const CLIENT_SENSITIVE = [
  "pesel",
  "bank_account",
  "bank_account_document_path",
  "bank_account_holder_ocr",
  "bik_report_path",
  "bik_report_name",
];

type Row = Record<string, any>;

export function maskPesel(p: unknown): string | null {
  const s = String(p ?? "");
  return /^\d{11}$/.test(s) ? `${s.slice(0, 6)}*****` : s ? "***" : null;
}

export function cleanClient(c: Row, sensitive: boolean): Row {
  const out: Row = { ...c };
  for (const k of CLIENT_HIDDEN) delete out[k];
  if (!sensitive) {
    out.pesel = maskPesel(c.pesel);
    for (const k of CLIENT_SENSITIVE) if (k !== "pesel" && out[k]) out[k] = "(ukryte)";
  }
  return out;
}

/** Maskuje PESEL i numery dokumentów w dowolnym wierszu (dla operatora). */
function maskRow(r: Row | null, sensitive: boolean): Row | null {
  if (!r || sensitive) return r;
  const out: Row = { ...r };
  if ("pesel" in out) out.pesel = maskPesel(out.pesel);
  for (const k of ["document_number", "dowod_osobisty", "bank_account", "rachunek_splaty"]) {
    if (out[k]) out[k] = "(ukryte)";
  }
  return out;
}

async function audit(admin: SupabaseClient, ctx: ToolContext, objectType: string, id: string) {
  try {
    await admin.from("audit_logs").insert({
      user_id: actorId(ctx),
      action: "mcp_client_data_access",
      object_type: objectType,
      object_id: id,
      new_value: { via: "mcp", email: ctx.getUserEmail() ?? null },
    });
  } catch {
    /* audyt best-effort — nie blokuje odczytu */
  }
}

async function signedUrl(admin: SupabaseClient, path: string | null | undefined, ttl = 3600) {
  if (!path) return null;
  const clean = path.replace(/^\/+/, "").replace(new RegExp(`^${CLIENT_FILES_BUCKET}/`), "");
  const { data } = await admin.storage.from(CLIENT_FILES_BUCKET).createSignedUrl(clean, ttl);
  return data?.signedUrl ?? null;
}

const digits = (s: string) => s.replace(/\D/g, "");

// ─────────────────────────────────────────────────────────────────────────────

export const findClient = defineTool({
  name: "find_client",
  title: "Find client by any identifier",
  description:
    "Szuka klienta po czymkolwiek: imię i nazwisko, firma, e-mail, telefon, PESEL, NIP, numer KW, id klienta / wniosku / leada. Zwraca pasujących klientów (z liczbą wniosków) i leady bez przypisanego klienta. Następnie `get_client_dossier` z `client_id`. Tylko administrator/operator; wyszukiwanie po PESEL tylko administrator.",
  inputSchema: {
    query: z.string().min(2).describe("Fraza: nazwisko, e-mail, telefon, PESEL, NIP, KW albo id."),
    limit: z.number().int().min(1).max(50).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ query, limit }, ctx: ToolContext) =>
    handle(async () => {
      const admin = await requireTeamAdmin(ctx);
      const sensitive = await hasRole(ctx, ["administrator"]);
      const lim = clampLimit(limit, 20, 50);
      const q = query.trim();
      const d = digits(q);
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
      const kw = normalizeKwNumber(q);
      const clientCols =
        "id, first_name, last_name, company_name, email, phone, phone_normalized, pesel, nip, city, land_register_number, created_at";

      const clientIds = new Set<string>();
      const clients: Row[] = [];
      const addClients = (rows: Row[]) => {
        for (const r of rows) {
          if (clientIds.has(r.id)) continue;
          clientIds.add(r.id);
          clients.push(r);
        }
      };

      if (isUuid) {
        const [byId, app, lead] = await Promise.all([
          rowsOf(admin.from("clients").select(clientCols).eq("id", q), "clients"),
          oneOf(
            admin.from("loan_applications").select("client_id").eq("id", q),
            "loan_applications",
          ),
          oneOf(admin.from("leads").select("client_id").eq("id", q), "leads"),
        ]);
        addClients(byId);
        const other = [app?.client_id, lead?.client_id].filter(Boolean) as string[];
        if (other.length)
          addClients(await rowsOf(admin.from("clients").select(clientCols).in("id", other)));
      } else if (kw) {
        const [court, num, check] = kw.split("/");
        const pattern = `%${court}%${num.replace(/^0+/, "")}%${check}%`;
        const props = await rowsOf<Row>(
          admin
            .from("properties")
            .select("loan_application_id")
            .ilike("land_register_number", pattern)
            .limit(lim),
          "properties",
        );
        const appIds = props.map((p) => p.loan_application_id).filter(Boolean);
        const apps = appIds.length
          ? await rowsOf<Row>(admin.from("loan_applications").select("client_id").in("id", appIds))
          : [];
        const ids = [...new Set(apps.map((a) => a.client_id).filter(Boolean))];
        addClients(
          await rowsOf(
            admin
              .from("clients")
              .select(clientCols)
              .or(
                [
                  ids.length ? `id.in.(${ids.join(",")})` : null,
                  `land_register_number.ilike.${pattern}`,
                ]
                  .filter(Boolean)
                  .join(","),
              )
              .limit(lim),
            "clients",
          ),
        );
      } else {
        const s = likeSafe(q);
        const ors = [
          `first_name.ilike.%${s}%`,
          `last_name.ilike.%${s}%`,
          `company_name.ilike.%${s}%`,
          `email.ilike.%${s}%`,
        ];
        if (d.length >= 6)
          ors.push(`phone_normalized.ilike.%${d.slice(-9)}%`, `phone.ilike.%${d}%`);
        if (d.length === 10) ors.push(`nip.eq.${d}`);
        if (d.length === 11) {
          if (!sensitive) return fail("Wyszukiwanie po PESEL wymaga roli administrator.");
          ors.push(`pesel.eq.${d}`);
        }
        // "Jan Kowalski" — imię i nazwisko razem.
        const parts = s.split(" ").filter(Boolean);
        if (parts.length >= 2) {
          ors.push(
            `and(first_name.ilike.%${parts[0]}%,last_name.ilike.%${parts[parts.length - 1]}%)`,
          );
        }
        addClients(
          await rowsOf(
            admin
              .from("clients")
              .select(clientCols)
              .or(ors.join(","))
              .order("created_at", { ascending: false })
              .limit(lim),
            "clients",
          ),
        );
      }

      // Leady bez klienta (jeszcze nie skonwertowane).
      let leads: Row[] = [];
      if (!isUuid) {
        const s = likeSafe(q);
        const ors = [`first_name.ilike.%${s}%`, `last_name.ilike.%${s}%`, `email.ilike.%${s}%`];
        if (d.length >= 6) ors.push(`phone_normalized.ilike.%${d.slice(-9)}%`);
        if (kw)
          ors.push(`kw_number.ilike.%${compactKwNumber(kw)?.slice(4, 12).replace(/^0+/, "")}%`);
        leads = await rowsOf<Row>(
          admin
            .from("leads")
            .select(
              "id, first_name, last_name, email, phone_normalized, status, source, kw_number, created_at",
            )
            .is("client_id", null)
            .or(ors.join(","))
            .order("created_at", { ascending: false })
            .limit(lim),
          "leads",
        );
      }

      const counts = clients.length
        ? await rowsOf<Row>(
            admin
              .from("loan_applications")
              .select("client_id")
              .in(
                "client_id",
                clients.map((c) => c.id),
              )
              .is("deleted_at", null),
          )
        : [];
      return ok({
        clients: clients.map((c) => ({
          ...c,
          pesel: sensitive ? c.pesel : maskPesel(c.pesel),
          who: personLabel(c),
          applications_count: counts.filter((x) => x.client_id === c.id).length,
        })),
        unconverted_leads: leads.map((l) => ({ ...l, who: personLabel(l) })),
      });
    }),
});

const SECTIONS = [
  "applications",
  "properties",
  "documents",
  "kw",
  "analyses",
  "profile",
  "leads",
  "communications",
  "chat",
  "contracts",
  "kyc_aml",
  "collections",
] as const;

export const getClientDossier = defineTool({
  name: "get_client_dossier",
  title: "Get complete client dossier",
  description:
    "Pełna teczka klienta w jednym wywołaniu: wszystkie dane klienta (kontakt, adres, firma, zgody, blokady, notatki; PESEL, rachunek i raport BIK dla administratora), profil klienta z kreatora (oferta, dane pożyczkodawcy), wnioski ze statusami i historią, nieruchomości, dokumenty (z linkami do pobrania), księgi wieczyste (stan pobrania, wyniki silnika reguł, właściciele), analizy (wycena, ryzyko, lokalizacja, ekstrakcje z dokumentów), oferty inwestorów i dystrybucja, leady, pełna komunikacja (maile, SMS, rozmowy z transkrypcjami, Messenger, zdarzenia kontaktu, kolejka połączeń), czat z inwestorami, wygenerowane umowy, KYC/AML oraz pożyczki w windykacji. Klienta wskaż przez `client_id`, `application_id` albo `lead_id` (albo znajdź `find_client`). `sections` zawęża zakres. Każde otwarcie jest audytowane. Tylko administrator/operator.",
  inputSchema: {
    client_id: z.string().uuid().optional(),
    application_id: z.string().uuid().optional(),
    lead_id: z.string().uuid().optional(),
    sections: z.array(z.enum(SECTIONS)).optional().describe("Zakres teczki (domyślnie wszystko)."),
    communications_limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .default(100)
      .describe("Maks. liczba wiadomości/rozmów (najnowsze)."),
    full_text: z
      .boolean()
      .default(false)
      .describe("Pełne treści wiadomości i transkrypcji zamiast skrótów."),
    file_links: z
      .boolean()
      .default(true)
      .describe("Linki do pobrania dokumentów i umów (ważne 1 h)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx: ToolContext) =>
    handle(async () => {
      const admin = await requireTeamAdmin(ctx);
      const sensitive = await hasRole(ctx, ["administrator"]);
      const want = new Set(args.sections?.length ? args.sections : SECTIONS);
      const errors: string[] = [];
      const txt = (s: string | null | undefined, len = 600) =>
        args.full_text ? (s ?? null) : s ? snippet(s, len) : null;
      const commLimit = args.communications_limit;

      // ── Ustalenie klienta ──
      let clientId = args.client_id ?? null;
      let leadOnly: Row | null = null;
      if (!clientId && args.application_id) {
        const a = await oneOf<Row>(
          admin.from("loan_applications").select("client_id").eq("id", args.application_id),
        );
        clientId = a?.client_id ?? null;
      }
      if (!clientId && args.lead_id) {
        const l = await oneOf<Row>(admin.from("leads").select("*").eq("id", args.lead_id));
        clientId = l?.client_id ?? null;
        if (!clientId && l) leadOnly = l;
      }
      if (!clientId && !leadOnly)
        return fail("Nie znaleziono klienta — podaj client_id, application_id albo lead_id.");

      const client = clientId
        ? await oneOf<Row>(admin.from("clients").select("*").eq("id", clientId), "clients")
        : null;
      if (clientId && !client) return fail("Nie znaleziono klienta.");
      await audit(admin, ctx, clientId ? "client" : "lead", clientId ?? leadOnly!.id);

      // ── Wnioski i leady (klucze do reszty sekcji) ──
      const applications = clientId
        ? ((await section(errors, "loan_applications", () =>
            rowsOf<Row>(
              admin
                .from("loan_applications")
                .select("*")
                .eq("client_id", clientId)
                .order("created_at", { ascending: false })
                .limit(50),
              "loan_applications",
            ),
          )) ?? [])
        : [];
      const appIds = applications.map((a) => a.id);
      if (leadOnly?.loan_application_id) appIds.push(leadOnly.loan_application_id);

      const leads = clientId
        ? ((await section(errors, "leads", () =>
            rowsOf<Row>(
              admin
                .from("leads")
                .select("*")
                .or(
                  [
                    `client_id.eq.${clientId}`,
                    appIds.length ? `loan_application_id.in.(${appIds.join(",")})` : null,
                  ]
                    .filter(Boolean)
                    .join(","),
                )
                .order("created_at", { ascending: false })
                .limit(50),
              "leads",
            ),
          )) ?? [])
        : [leadOnly!];
      const leadIds = leads.map((l) => l.id);

      const byApps = <T = Row>(
        table: string,
        cols: string,
        col = "loan_application_id",
        order = "created_at",
        lim = 200,
      ) =>
        appIds.length
          ? section(errors, table, () =>
              rowsOf<T>(
                admin
                  .from(table)
                  .select(cols)
                  .in(col, appIds)
                  .order(order, { ascending: false })
                  .limit(lim),
                table,
              ),
            )
          : Promise.resolve([] as T[]);

      const empty = Promise.resolve(null);

      // ── Sekcje równolegle ──
      const [
        properties,
        documents,
        statusHistory,
        offers,
        distributions,
        profiles,
        propertyAnalyses,
        riskAssessments,
        kwRules,
        kwLegacy,
        coowners,
        locations,
        extractions,
        leadComms,
        contactEvents,
        callQueue,
        chatThreads,
        generatedDocs,
        amlCustomers,
        didit,
      ] = await Promise.all([
        want.has("properties") || want.has("kw") || want.has("documents")
          ? byApps("properties", "*")
          : empty,
        want.has("documents") ? byApps("documents", "*") : empty,
        want.has("applications")
          ? byApps(
              "loan_status_history",
              "loan_application_id, old_status, new_status, changed_by, changed_at",
              "loan_application_id",
              "changed_at",
            )
          : empty,
        want.has("applications")
          ? byApps(
              "investor_offers",
              "id, loan_application_id, investor_id, offer_status, proposed_amount, period_months, expected_yearly_yield, estimated_monthly_payment, estimated_total_cost, commission, counter_offer, submitted_at, client_decision_at, created_at",
            )
          : empty,
        want.has("applications")
          ? byApps(
              "offer_distributions",
              "id, loan_application_id, investor_id, distribution_status, email_status, sent_at, responded_at, response_summary, additional_info_request, created_at",
            )
          : empty,
        want.has("profile") && (appIds.length || client?.nip)
          ? section(errors, "client_profiles", () =>
              rowsOf<Row>(
                admin
                  .from("client_profiles")
                  .select(
                    "id, borrower_type, completion_percent, nip, source_application_id, data, updated_at",
                  )
                  .or(
                    [
                      appIds.length ? `source_application_id.in.(${appIds.join(",")})` : null,
                      client?.nip ? `nip.eq.${digits(String(client.nip))}` : null,
                    ]
                      .filter(Boolean)
                      .join(","),
                  )
                  .order("updated_at", { ascending: false })
                  .limit(10),
                "client_profiles",
              ),
            )
          : empty,
        want.has("analyses")
          ? byApps(
              "property_analyses",
              "id, application_id, status, estimated_value_pln, ltv_percent, collateral_score, collateral_category, main_source, warnings, created_at",
              "application_id",
            )
          : empty,
        want.has("analyses")
          ? byApps(
              "investment_risk_assessments",
              "application_id, result_json, created_at",
              "application_id",
            )
          : empty,
        want.has("kw")
          ? byApps(
              "kw_land_register_analyses",
              "id, loan_application_id, kw_number, overall_status, unresolved_finding_count, active_mention_count, result_json, created_at",
            )
          : empty,
        want.has("kw")
          ? byApps(
              "kw_analysis",
              "id, application_id, kw_number, legal_risk_score, risk_flags, investor_summary, analysis_warning, owners_json, property_json, created_at",
              "application_id",
            )
          : empty,
        want.has("kw")
          ? byApps(
              "coowner_registry_checks",
              "application_id, kw_number, result_json, warnings, created_at",
              "application_id",
            )
          : empty,
        want.has("analyses")
          ? byApps(
              "location_scoring_results",
              "loan_application_id, decision, expected_location_attractiveness, confidence_score, probability_good_location, probability_urban_core, probability_remote_area, explanation, calculated_at",
              "loan_application_id",
              "calculated_at",
            )
          : empty,
        want.has("analyses") || want.has("documents")
          ? byApps(
              "property_document_extractions",
              "id, application_id, document_id, doc_kind, extracted_json, model, created_at",
              "application_id",
            )
          : empty,
        want.has("communications") && leadIds.length
          ? section(errors, "lead_communications", () =>
              rowsOf<Row>(
                admin
                  .from("lead_communications")
                  .select(
                    "id, lead_id, channel, direction, status, subject, content, transcript, email, phone_normalized, duration_seconds, recording_url, attachments, error_message, created_at",
                  )
                  .in("lead_id", leadIds)
                  .order("created_at", { ascending: false })
                  .limit(commLimit),
                "lead_communications",
              ),
            )
          : empty,
        want.has("communications") && clientId
          ? section(errors, "contact_events", () =>
              rowsOf<Row>(
                admin
                  .from("contact_events")
                  .select("*")
                  .eq("client_id", clientId)
                  .order("created_at", { ascending: false })
                  .limit(commLimit),
                "contact_events",
              ),
            )
          : empty,
        want.has("communications") && clientId
          ? section(errors, "call_queue", () =>
              rowsOf<Row>(
                admin
                  .from("call_queue")
                  .select(
                    "id, loan_application_id, status, source, attempts, scheduled_at, started_at, finished_at, result_summary, transcript, created_at",
                  )
                  .eq("client_id", clientId)
                  .order("created_at", { ascending: false })
                  .limit(50),
                "call_queue",
              ),
            )
          : empty,
        want.has("chat") && clientId
          ? section(errors, "chat_threads", () =>
              rowsOf<Row>(
                admin
                  .from("chat_threads")
                  .select("id, loan_application_id, investor_id, status, created_at, updated_at")
                  .eq("client_id", clientId)
                  .order("updated_at", { ascending: false })
                  .limit(20),
                "chat_threads",
              ),
            )
          : empty,
        want.has("contracts") && (appIds.length || leadIds.length)
          ? section(errors, "generated_documents", () =>
              rowsOf<Row>(
                admin
                  .from("generated_documents")
                  .select(
                    "id, template_name, loan_application_id, lead_id, investor_offer_id, docx_path, pdf_path, form_data, commission_amount, created_at",
                  )
                  .or(
                    [
                      appIds.length ? `loan_application_id.in.(${appIds.join(",")})` : null,
                      leadIds.length ? `lead_id.in.(${leadIds.join(",")})` : null,
                    ]
                      .filter(Boolean)
                      .join(","),
                  )
                  .order("created_at", { ascending: false })
                  .limit(50),
                "generated_documents",
              ),
            )
          : empty,
        want.has("kyc_aml") && clientId
          ? section(errors, "aml_customers", () =>
              rowsOf<Row>(
                admin
                  .from("aml_customers")
                  .select("*")
                  .eq("client_id", clientId)
                  .order("created_at", { ascending: false })
                  .limit(10),
                "aml_customers",
              ),
            )
          : empty,
        want.has("kyc_aml") && client?.user_id
          ? section(errors, "didit_verifications", () =>
              rowsOf<Row>(
                admin
                  .from("didit_verifications")
                  .select(
                    "id, status, decision, workflow_type, session_number, decided_at, warnings, created_at",
                  )
                  .eq("user_id", client.user_id)
                  .order("created_at", { ascending: false })
                  .limit(10),
                "didit_verifications",
              ),
            )
          : empty,
      ]);

      // Czat — wiadomości do wątków.
      let chatMessages: Row[] = [];
      if (chatThreads?.length) {
        chatMessages =
          (await section(errors, "chat_messages", () =>
            rowsOf<Row>(
              admin
                .from("chat_messages")
                .select("id, thread_id, sender_role, body, blocked, created_at")
                .in(
                  "thread_id",
                  chatThreads.map((t) => t.id),
                )
                .order("created_at", { ascending: false })
                .limit(commLimit),
              "chat_messages",
            ),
          )) ?? [];
      }

      // Księgi wieczyste — stan pobrania dla wszystkich numerów klienta.
      const kwNumbers = [
        ...new Set(
          [
            client?.land_register_number,
            ...(properties ?? []).flatMap((p) => [
              p.land_register_number,
              ...(Array.isArray(p.additional_land_register_numbers)
                ? p.additional_land_register_numbers
                : []),
            ]),
            ...leads.map((l) => l.kw_number),
          ]
            .map((k) => compactKwNumber(k))
            .filter((k): k is string => !!k),
        ),
      ];
      const kwDocs =
        want.has("kw") && kwNumbers.length
          ? await section(errors, "kw_documents", () =>
              rowsOf<Row>(
                admin
                  .from("kw_documents")
                  .select("kw_number, status, fetched_at, ordered_at, last_error")
                  .in("kw_number", kwNumbers),
                "kw_documents",
              ),
            )
          : null;

      // Windykacja — po PESEL/NIP klienta.
      let collections: Row | null = null;
      if (want.has("collections") && client && (client.pesel || client.nip)) {
        collections = await section(errors, "windykacja", async () => {
          const ors = [
            client.pesel ? `pesel.eq.${client.pesel}` : null,
            client.nip ? `nip.eq.${digits(String(client.nip))}` : null,
          ].filter(Boolean);
          const borrowers = await rowsOf<Row>(
            admin.from("wind_borrowers").select("*").or(ors.join(",")),
            "wind_borrowers",
          );
          const loans = borrowers.length
            ? await rowsOf<Row>(
                admin
                  .from("wind_loans")
                  .select("*")
                  .in(
                    "borrower_id",
                    borrowers.map((b) => b.id),
                  ),
                "wind_loans",
              )
            : [];
          return {
            borrowers: borrowers.map((b) => maskRow(b, sensitive)),
            loans: loans.map((l) => maskRow(l, sensitive)),
          };
        });
      }

      // Linki do plików.
      const withLinks = async (rows: Row[] | null, pathKeys: string[]) =>
        rows && args.file_links
          ? Promise.all(
              rows.map(async (r) => {
                const out: Row = { ...r };
                for (const k of pathKeys) {
                  if (r[k]) out[`${k}_url`] = await signedUrl(admin, r[k]).catch(() => null);
                }
                return out;
              }),
            )
          : rows;

      const clientOut = client ? cleanClient(client, sensitive) : null;
      if (clientOut && sensitive && args.file_links) {
        clientOut.bik_report_url = await signedUrl(admin, client!.bik_report_path).catch(
          () => null,
        );
        clientOut.bank_account_document_url = await signedUrl(
          admin,
          client!.bank_account_document_path,
        ).catch(() => null);
      }

      const risk = (riskAssessments ?? []).map((r) => {
        const j = r.result_json ?? {};
        return {
          application_id: r.application_id,
          created_at: r.created_at,
          investment_score: j.investmentScore,
          risk_grade: j.riskGrade,
          recommendation: j.recommendation,
          executive_summary: j.executiveSummary,
          key_risks: j.keyRisks,
          key_strengths: j.keyStrengths,
          warnings: j.warnings,
          master_valuation: j.masterValuation,
          forced_sale: j.forcedSale,
        };
      });
      const kwRulesOut = (kwRules ?? []).map((r) => ({
        id: r.id,
        loan_application_id: r.loan_application_id,
        kw_number: formatKwNumber(r.kw_number) ?? r.kw_number,
        overall_status: r.overall_status,
        unresolved_finding_count: r.unresolved_finding_count,
        created_at: r.created_at,
        findings: ((r.result_json?.findings ?? []) as Row[])
          .filter((f) => f.status !== "BRAK_PROBLEMU")
          .map((f) => ({
            status: f.status,
            title: f.title,
            summary: f.plainLanguageSummary,
            expected_from_client: f.expectedFromClient,
          })),
        mortgage_priority: r.result_json?.priority?.explanation ?? null,
        ltv: r.result_json?.ltv ?? null,
      }));

      const commsOut = (leadComms ?? []).map((c) => ({
        ...c,
        content: txt(c.content),
        transcript: txt(c.transcript, 1500),
      }));

      return ok({
        client: clientOut
          ? { ...clientOut, who: personLabel(client!), url: `/admin/klienci/${client!.id}` }
          : null,
        sensitive_data: sensitive
          ? "pełne"
          : "zamaskowane (PESEL, rachunek, dowód, BIK — tylko administrator)",
        ...(want.has("profile") ? { client_profiles: profiles ?? [] } : {}),
        ...(want.has("applications")
          ? {
              applications: applications.map((a) => ({
                ...a,
                url: `/operator/wnioski/${a.id}`,
              })),
              status_history: statusHistory ?? [],
              investor_offers: offers ?? [],
              institution_distributions: distributions ?? [],
            }
          : {}),
        ...(want.has("properties") ? { properties: properties ?? [] } : {}),
        ...(want.has("documents")
          ? {
              documents: await withLinks(documents, ["file_path"]),
              document_extractions: (extractions ?? []).map((e) => ({
                ...e,
                extracted_json: e.extracted_json,
              })),
            }
          : {}),
        ...(want.has("kw")
          ? {
              kw: {
                numbers: kwNumbers.map((k) => formatKwNumber(k) ?? k),
                documents: (kwDocs ?? []).map((d) => ({
                  ...d,
                  kw_number: formatKwNumber(d.kw_number) ?? d.kw_number,
                })),
                rule_engine: kwRulesOut,
                legal_analysis: kwLegacy ?? [],
                co_owners: (coowners ?? []).map((c) => ({
                  application_id: c.application_id,
                  created_at: c.created_at,
                  summary: c.result_json?.summary,
                  warnings: c.warnings,
                  owners: c.result_json?.checked,
                })),
                note: "Treść działów KW: get_kw_content / fetch_kw_content.",
              },
            }
          : {}),
        ...(want.has("analyses")
          ? {
              analyses: {
                property_valuations: propertyAnalyses ?? [],
                risk_assessments: risk,
                location: locations ?? [],
              },
            }
          : {}),
        ...(want.has("leads") ? { leads } : {}),
        ...(want.has("communications")
          ? {
              communications: commsOut,
              contact_events: (contactEvents ?? []).map((e) => ({ ...e, content: txt(e.content) })),
              call_queue: (callQueue ?? []).map((c) => ({
                ...c,
                transcript: txt(c.transcript, 1500),
              })),
            }
          : {}),
        ...(want.has("chat")
          ? {
              chat: (chatThreads ?? []).map((t) => ({
                ...t,
                messages: chatMessages
                  .filter((m) => m.thread_id === t.id)
                  .map((m) => ({ ...m, body: txt(m.body) })),
              })),
            }
          : {}),
        ...(want.has("contracts")
          ? { contracts: await withLinks(generatedDocs, ["docx_path", "pdf_path"]) }
          : {}),
        ...(want.has("kyc_aml")
          ? {
              kyc: didit ?? [],
              aml: (amlCustomers ?? []).map((a) => maskRow(a, sensitive)),
            }
          : {}),
        ...(want.has("collections") ? { collections } : {}),
        errors,
      });
    }),
});

const IMAGE_MAX_BYTES = 3_000_000;

export const getClientDocument = defineTool({
  name: "get_client_document",
  title: "Read client document",
  description:
    "Otwiera dokument klienta (z teczki / listy dokumentów wniosku): metadane, link do pobrania (1 h), tekst i dane wyciągnięte przez OCR/AI, a dla zdjęć i skanów (JPG/PNG/WebP do 3 MB) — sam obraz do obejrzenia w czacie. Tylko administrator/operator.",
  inputSchema: {
    document_id: z.string().uuid(),
    include_image: z.boolean().default(true).describe("Dołącz obraz (zdjęcia, skany)."),
    include_text: z.boolean().default(true).describe("Dołącz tekst z OCR."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ document_id, include_image, include_text }, ctx: ToolContext) =>
    handle(async () => {
      const admin = await requireTeamAdmin(ctx);
      const doc = await oneOf<Row>(
        admin.from("documents").select("*").eq("id", document_id),
        "documents",
      );
      if (!doc) return fail("Nie znaleziono dokumentu.");
      await audit(admin, ctx, "document", document_id);

      const extraction = await oneOf<Row>(
        admin
          .from("property_document_extractions")
          .select("doc_kind, extracted_json, raw_text, model, created_at")
          .eq("document_id", document_id)
          .order("created_at", { ascending: false })
          .limit(1),
        "property_document_extractions",
      ).catch(() => null);

      const url = await signedUrl(admin, doc.file_path).catch(() => null);
      const extra: ContentBlock[] = [];
      const name = String(doc.file_name ?? doc.file_path ?? "dokument");
      const ext = name.split(".").pop()?.toLowerCase() ?? "";
      const imageMime: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        gif: "image/gif",
      };
      let imageNote: string | null = null;
      if (include_image && url && imageMime[ext]) {
        try {
          const res = await fetch(url);
          const buf = new Uint8Array(await res.arrayBuffer());
          if (buf.length <= IMAGE_MAX_BYTES) {
            extra.push({
              type: "image",
              data: Buffer.from(buf).toString("base64"),
              mimeType: imageMime[ext],
            });
          } else {
            imageNote = `Obraz ma ${Math.round(buf.length / 1024)} KB — za duży do podglądu, użyj linku.`;
          }
        } catch (e) {
          imageNote = `Nie udało się pobrać obrazu: ${(e as Error).message}`;
        }
      }
      if (url) {
        extra.push({
          type: "resource_link",
          uri: url,
          name,
          description: `Dokument klienta (${doc.document_type ?? "plik"})`,
        });
      }

      return ok(
        {
          document: doc,
          download_url: url,
          image_note: imageNote,
          extraction: extraction
            ? {
                doc_kind: extraction.doc_kind,
                model: extraction.model,
                created_at: extraction.created_at,
                extracted: extraction.extracted_json,
                text: include_text ? extraction.raw_text : undefined,
              }
            : null,
        },
        undefined,
        extra,
      );
    }),
});

export const clientDossierTools = [findClient, getClientDossier, getClientDocument];
