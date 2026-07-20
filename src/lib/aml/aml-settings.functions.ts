/* eslint-disable @typescript-eslint/no-explicit-any -- tabele aml_* nie są jeszcze w wygenerowanych typach Database; luźny dostęp jak w module wind_* */
// Ustawienia AML + przegląd modułu.
// Kluczowe założenie: moduł jest dostępny od pierwszego wejścia — pierwszy
// odczyt ustawień automatycznie tworzy rekord aml_settings z osobą
// odpowiedzialną pobraną z profilu inwestora (bez ekranu aktywacji i bez
// ponownego wpisywania danych). Braki w profilu to ostrzeżenie, nie blokada.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AmlInstitution, AmlPerson, AmlProfileGaps } from "@/lib/aml/aml-types";

type Loose = { from: (t: string) => any };
const loose = (c: unknown) => c as Loose;

const PersonSchema = z.object({
  firstName: z.string().default(""),
  lastName: z.string().default(""),
  jobTitle: z.string().optional(),
  email: z.string().default(""),
  phone: z.string().default(""),
});

const InstitutionSchema = z.object({
  name: z.string().default(""),
  nip: z.string().default(""),
  address: z.string().default(""),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  krs: z.string().optional(),
  regon: z.string().optional(),
});

export interface AmlSettingsView {
  id: string;
  responsiblePerson: AmlPerson;
  additionalPerson: AmlPerson | null;
  signerPerson: AmlPerson | null; // null = ta sama co odpowiedzialna
  institution: AmlInstitution;
  giifConnectionStatus: string;
  giifInstitutionId: string | null;
  giifEnvironment: "test" | "production";
  profileGaps: AmlProfileGaps;
  /** Aktywny provider szyfrowania kluczy certyfikatów (KMS vs lokalna koperta). */
  keyProvider: { name: string; productionApproved: boolean; description: string };
}

/** Braki danych wymaganych do finalnego zgłoszenia (ostrzegamy, nie blokujemy). */
export function computeProfileGaps(person: AmlPerson, institution: AmlInstitution): AmlProfileGaps {
  const missing: string[] = [];
  if (!person.firstName) missing.push("Imię osoby odpowiedzialnej");
  if (!person.lastName) missing.push("Nazwisko osoby odpowiedzialnej");
  if (!person.email) missing.push("E-mail osoby odpowiedzialnej");
  if (!person.phone) missing.push("Numer telefonu osoby odpowiedzialnej");
  if (!institution.name) missing.push("Nazwa organizacji");
  if (!institution.nip) missing.push("NIP organizacji");
  if (!institution.address) missing.push("Adres organizacji");
  return { missing, ready: missing.length === 0 };
}

/** Buduje domyślne dane z profilu inwestora (profiles + investors). */
async function buildDefaultsFromProfile(
  supabase: unknown,
  userId: string,
): Promise<{
  person: AmlPerson;
  institution: AmlInstitution;
}> {
  const db = loose(supabase);
  const { data: profile } = await db
    .from("profiles")
    .select("first_name, last_name, job_title, email, phone")
    .eq("user_id", userId)
    .maybeSingle();
  const { data: investor } = await db
    .from("investors")
    .select(
      "first_name, last_name, email, phone, company_name, nip, krs, regon, street, address, city, postal_code, country, entity_type",
    )
    .eq("user_id", userId)
    .maybeSingle();

  const person: AmlPerson = {
    firstName: profile?.first_name ?? investor?.first_name ?? "",
    lastName: profile?.last_name ?? investor?.last_name ?? "",
    jobTitle: profile?.job_title ?? undefined,
    email: profile?.email ?? investor?.email ?? "",
    phone: profile?.phone ?? investor?.phone ?? "",
  };
  const addressParts = [
    investor?.street ?? investor?.address,
    investor?.postal_code,
    investor?.city,
  ].filter(Boolean);
  const institution: AmlInstitution = {
    name: investor?.company_name ?? [person.firstName, person.lastName].filter(Boolean).join(" "),
    nip: investor?.nip ?? "",
    address: addressParts.join(", "),
    city: investor?.city ?? undefined,
    postalCode: investor?.postal_code ?? undefined,
    country: investor?.country ?? "PL",
    krs: investor?.krs ?? undefined,
    regon: investor?.regon ?? undefined,
  };
  return { person, institution };
}

async function keyProviderInfo() {
  const { getAmlKeyProvider } = await import("@/lib/aml/key-provider.server");
  return getAmlKeyProvider().info();
}

async function toView(row: any): Promise<AmlSettingsView> {
  const person = (row.responsible_person ?? {}) as AmlPerson;
  const institution = (row.institution ?? {}) as AmlInstitution;
  return {
    keyProvider: await keyProviderInfo(),
    id: row.id,
    responsiblePerson: person,
    additionalPerson: (row.additional_person as AmlPerson | null) ?? null,
    signerPerson: (row.signer_person as AmlPerson | null) ?? null,
    institution,
    giifConnectionStatus: row.giif_connection_status,
    giifInstitutionId: row.giif_institution_id ?? null,
    giifEnvironment: row.giif_environment,
    profileGaps: computeProfileGaps(person, institution),
  };
}

/**
 * Zwraca ustawienia AML. Przy pierwszym wejściu tworzy je automatycznie
 * z danych profilu inwestora — inwestor niczego nie wpisuje ponownie.
 */
export const getAmlSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AmlSettingsView> => {
    const db = loose(context.supabase);
    const { data: existing } = await db
      .from("aml_settings")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing) {
      // Uzupełnij puste pola świeżymi danymi profilu (bez nadpisywania zmian).
      const person = existing.responsible_person as AmlPerson;
      const institution = existing.institution as AmlInstitution;
      if (!person?.firstName || !person?.lastName || !institution?.name) {
        const defaults = await buildDefaultsFromProfile(context.supabase, context.userId);
        const merged = {
          responsible_person: {
            ...defaults.person,
            ...Object.fromEntries(Object.entries(person ?? {}).filter(([, v]) => v)),
          },
          institution: {
            ...defaults.institution,
            ...Object.fromEntries(Object.entries(institution ?? {}).filter(([, v]) => v)),
          },
        };
        const { data: updated } = await db
          .from("aml_settings")
          .update(merged)
          .eq("id", existing.id)
          .select("*")
          .single();
        return await toView(updated ?? { ...existing, ...merged });
      }
      return await toView(existing);
    }

    const defaults = await buildDefaultsFromProfile(context.supabase, context.userId);
    const { data: created, error } = await db
      .from("aml_settings")
      .insert({
        user_id: context.userId,
        responsible_person: defaults.person,
        institution: defaults.institution,
      })
      .select("*")
      .single();
    if (error) throw new Error(`Nie udało się zainicjować ustawień AML: ${error.message}`);

    const { amlAudit } = await import("@/lib/aml/audit.server");
    await amlAudit({
      userId: context.userId,
      entityType: "settings",
      entityId: created.id,
      action: "auto_initialized_from_profile",
      details: { person: defaults.person as unknown as Record<string, unknown> },
    });
    return await toView(created);
  });

const UpdateSettingsInput = z.object({
  responsiblePerson: PersonSchema.optional(),
  additionalPerson: PersonSchema.nullable().optional(),
  signerPerson: PersonSchema.nullable().optional(),
  institution: InstitutionSchema.optional(),
  giifEnvironment: z.enum(["test", "production"]).optional(),
});

export const updateAmlSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => UpdateSettingsInput.parse(data))
  .handler(async ({ data, context }): Promise<AmlSettingsView> => {
    const db = loose(context.supabase);
    const patch: Record<string, unknown> = {};
    if (data.responsiblePerson !== undefined) patch.responsible_person = data.responsiblePerson;
    if (data.additionalPerson !== undefined) patch.additional_person = data.additionalPerson;
    if (data.signerPerson !== undefined) patch.signer_person = data.signerPerson;
    if (data.institution !== undefined) patch.institution = data.institution;
    if (data.giifEnvironment !== undefined) patch.giif_environment = data.giifEnvironment;

    const { data: updated, error } = await db
      .from("aml_settings")
      .update(patch)
      .eq("user_id", context.userId)
      .select("*")
      .single();
    if (error) throw new Error(`Nie udało się zapisać ustawień: ${error.message}`);

    const { amlAudit } = await import("@/lib/aml/audit.server");
    await amlAudit({
      userId: context.userId,
      entityType: "settings",
      entityId: updated.id,
      action: "settings_updated",
      details: { fields: Object.keys(patch) },
    });
    return await toView(updated);
  });

export interface AmlOverview {
  customers: number;
  screeningsToReview: number;
  transactions: number;
  thresholdPending: number;
  thresholdOverdue: number;
  openCases: number;
  reportsInPreparation: number;
  reportsSubmitted: number;
  upoReceived: number;
  profileGaps: AmlProfileGaps;
  giifConnectionStatus: string;
}

/** Liczniki na ekran Przegląd. */
export const getAmlOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AmlOverview> => {
    const db = loose(context.supabase);
    const uid = context.userId;
    const count = async (table: string, filter?: (q: any) => any) => {
      let q = db.from(table).select("id", { count: "exact", head: true }).eq("user_id", uid);
      if (filter) q = filter(q);
      const { count: c } = await q;
      return c ?? 0;
    };

    const { data: settingsRow } = await db
      .from("aml_settings")
      .select("*")
      .eq("user_id", uid)
      .maybeSingle();
    const gaps = settingsRow
      ? computeProfileGaps(settingsRow.responsible_person ?? {}, settingsRow.institution ?? {})
      : { missing: ["Ustawienia AML zostaną utworzone przy pierwszym wejściu"], ready: false };

    return {
      customers: await count("aml_customers"),
      screeningsToReview: await count("aml_screenings", (q) => q.eq("status", "review_required")),
      transactions: await count("aml_transactions"),
      thresholdPending: await count("aml_threshold_entries", (q) => q.is("decision", null)),
      thresholdOverdue: await count("aml_threshold_entries", (q) =>
        q.is("decision", null).lt("deadline_at", new Date().toISOString()),
      ),
      openCases: await count("aml_cases", (q) =>
        q.not("status", "in", '("closed","no_basis_for_report")'),
      ),
      reportsInPreparation: await count("aml_reports", (q) =>
        q.in("status", ["draft", "complete", "content_approved"]),
      ),
      reportsSubmitted: await count("aml_reports", (q) =>
        q.in("status", ["submitted", "status_pending", "accepted"]),
      ),
      upoReceived: await count("aml_reports", (q) => q.eq("status", "upo_received")),
      profileGaps: gaps,
      giifConnectionStatus: settingsRow?.giif_connection_status ?? "not_connected",
    };
  });
