import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Nowe tabele nie są jeszcze w wygenerowanych typach Database — używamy
// luźnego dostępu do klienta tam, gdzie odwołujemy się do tabel windykacji.
// (Typy zwracane na zewnątrz są jawnie zadeklarowane poniżej.)

export type DebtCase = {
  id: string;
  investor_user_id: string;
  status: "draft" | "active" | "closed";
  debtor_name: string | null;
  debtor_pesel: string | null;
  debtor_address: string | null;
  debtor_email: string | null;
  debtor_phone: string | null;
  contract_number: string | null;
  contract_file_path: string | null;
  contract_file_name: string | null;
  principal_amount: number;
  payout_date: string | null;
  due_date: string | null;
  contractual_annual_rate: number;
  penalty_annual_rate: number;
  max_statutory_rate: number;
  fee_sms: number;
  fee_email: number;
  fee_phone: number;
  fee_letter_debtor: number;
  fee_letter_court: number;
  fee_letter_bailiff: number;
  notes: string | null;
  no_payments_declared: boolean;
  created_at: string;
  updated_at: string;
};

export type DebtPayment = {
  id: string;
  case_id: string;
  paid_on: string;
  amount: number;
  note: string | null;
  created_at: string;
};

export type DebtActionType =
  | "sms"
  | "email"
  | "phone"
  | "letter_debtor"
  | "letter_court"
  | "letter_bailiff";

export type DebtAction = {
  id: string;
  case_id: string;
  action_type: DebtActionType;
  action_date: string;
  channel_target: string | null;
  subject: string | null;
  content: string | null;
  fee: number;
  status: "recorded" | "sent" | "failed";
  external_id: string | null;
  error_message: string | null;
  created_at: string;
};

const CASE_COLS =
  "id, investor_user_id, status, debtor_name, debtor_pesel, debtor_address, debtor_email, debtor_phone, contract_number, contract_file_path, contract_file_name, principal_amount, payout_date, due_date, contractual_annual_rate, penalty_annual_rate, max_statutory_rate, fee_sms, fee_email, fee_phone, fee_letter_debtor, fee_letter_court, fee_letter_bailiff, notes, no_payments_declared, created_at, updated_at";

const emptyToNull = (v: unknown) => (v === "" ? null : v);
const num = z.coerce.number().nonnegative();

const caseInputSchema = z.object({
  id: z.string().uuid().optional(),
  status: z.enum(["draft", "active", "closed"]).optional(),
  debtor_name: z.string().optional().nullable(),
  debtor_pesel: z.string().optional().nullable(),
  debtor_address: z.string().optional().nullable(),
  debtor_email: z.string().optional().nullable(),
  debtor_phone: z.string().optional().nullable(),
  contract_number: z.string().optional().nullable(),
  contract_file_path: z.string().optional().nullable(),
  contract_file_name: z.string().optional().nullable(),
  principal_amount: num.optional(),
  payout_date: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  contractual_annual_rate: num.optional(),
  penalty_annual_rate: num.optional(),
  max_statutory_rate: num.optional(),
  fee_sms: num.optional(),
  fee_email: num.optional(),
  fee_phone: num.optional(),
  fee_letter_debtor: num.optional(),
  fee_letter_court: num.optional(),
  fee_letter_bailiff: num.optional(),
  notes: z.string().optional().nullable(),
});

// ── Lista spraw ──────────────────────────────────────────────────────
export const listDebtCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as unknown as {
      from: (t: string) => any;
    };
    const { data, error } = await db
      .from("debt_collection_cases")
      .select(CASE_COLS)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as DebtCase[];
  });

// ── Pojedyncza sprawa wraz z wpłatami i działaniami ─────────────────
export const getDebtCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { caseId: string }) => z.object({ caseId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as { from: (t: string) => any };
    const { data: c, error } = await db
      .from("debt_collection_cases")
      .select(CASE_COLS)
      .eq("id", data.caseId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!c) throw new Error("Sprawa nie znaleziona");

    const [{ data: payments }, { data: actions }] = await Promise.all([
      db
        .from("debt_collection_payments")
        .select("id, case_id, paid_on, amount, note, created_at")
        .eq("case_id", data.caseId)
        .order("paid_on", { ascending: true }),
      db
        .from("debt_collection_actions")
        .select(
          "id, case_id, action_type, action_date, channel_target, subject, content, fee, status, external_id, error_message, created_at",
        )
        .eq("case_id", data.caseId)
        .order("action_date", { ascending: false }),
    ]);

    return {
      case: c as DebtCase,
      payments: (payments ?? []) as DebtPayment[],
      actions: (actions ?? []) as DebtAction[],
    };
  });

// ── Utworzenie / aktualizacja sprawy (zapis szkicu) ─────────────────
export const upsertDebtCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => caseInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as { from: (t: string) => any };
    const { id, ...rest } = data;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) patch[k] = emptyToNull(v);

    if (id) {
      const { data: row, error } = await db
        .from("debt_collection_cases")
        .update(patch)
        .eq("id", id)
        .select(CASE_COLS)
        .single();
      if (error) throw new Error(error.message);
      return row as DebtCase;
    }

    // investor_user_id ustawia DEFAULT auth.uid() w bazie.
    const { data: row, error } = await db
      .from("debt_collection_cases")
      .insert(patch)
      .select(CASE_COLS)
      .single();
    if (error) throw new Error(error.message);
    return row as DebtCase;
  });

export const deleteDebtCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { caseId: string }) => z.object({ caseId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as { from: (t: string) => any };
    const { error } = await db.from("debt_collection_cases").delete().eq("id", data.caseId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Wpłaty ───────────────────────────────────────────────────────────
export const addDebtPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        caseId: z.string().uuid(),
        paid_on: z.string().min(1),
        amount: z.coerce.number(),
        note: z.string().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as { from: (t: string) => any };
    const { data: row, error } = await db
      .from("debt_collection_payments")
      .insert({
        case_id: data.caseId,
        paid_on: data.paid_on,
        amount: data.amount,
        note: emptyToNull(data.note),
      })
      .select("id, case_id, paid_on, amount, note, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row as DebtPayment;
  });

export const deleteDebtPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { paymentId: string }) => z.object({ paymentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as { from: (t: string) => any };
    const { error } = await db.from("debt_collection_payments").delete().eq("id", data.paymentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Działania windykacyjne (SMS / e-mail / telefon / pisma) ─────────
const ACTION_TYPES = [
  "sms",
  "email",
  "phone",
  "letter_debtor",
  "letter_court",
  "letter_bailiff",
] as const;

export const performDebtAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        caseId: z.string().uuid(),
        action_type: z.enum(ACTION_TYPES),
        channel_target: z.string().optional().nullable(),
        subject: z.string().optional().nullable(),
        content: z.string().optional().nullable(),
        fee: z.coerce.number().nonnegative().default(0),
        action_date: z.string().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as { from: (t: string) => any };

    // Weryfikacja własności sprawy (RLS i tak ogranicza, ale potrzebujemy danych).
    const { data: c, error: caseErr } = await db
      .from("debt_collection_cases")
      .select("id, debtor_email, debtor_phone")
      .eq("id", data.caseId)
      .maybeSingle();
    if (caseErr) throw new Error(caseErr.message);
    if (!c) throw new Error("Sprawa nie znaleziona");

    let status: "recorded" | "sent" | "failed" = "recorded";
    let externalId: string | null = null;
    let errorMessage: string | null = null;

    const target = (data.channel_target || "")?.trim() || null;

    // Faktyczna wysyłka dla SMS / e-mail. Telefon i pisma rejestrujemy.
    if (data.action_type === "sms") {
      const phone = target || c.debtor_phone;
      if (!phone) {
        status = "failed";
        errorMessage = "Brak numeru telefonu dłużnika.";
      } else if (!data.content) {
        status = "failed";
        errorMessage = "Brak treści wiadomości SMS.";
      } else {
        try {
          const { sendSmsInternal } = await import("@/lib/voicebot.functions");
          const res = await sendSmsInternal({ phone, body: data.content, source: "windykacja" });
          status = res.ok ? "sent" : "failed";
          externalId = res.sid ?? null;
          errorMessage = res.ok ? null : (res.error ?? "Nie udało się wysłać SMS");
        } catch (e) {
          status = "failed";
          errorMessage = e instanceof Error ? e.message : "Błąd wysyłki SMS";
        }
      }
    } else if (data.action_type === "email") {
      const email = target || c.debtor_email;
      if (!email) {
        status = "failed";
        errorMessage = "Brak adresu e-mail dłużnika.";
      } else if (!data.content) {
        status = "failed";
        errorMessage = "Brak treści wiadomości e-mail.";
      } else {
        try {
          const { sendResendEmail } = await import("@/lib/resend-send.server");
          const res = await sendResendEmail({
            to: email,
            subject: data.subject || "Wezwanie do zapłaty",
            text: data.content,
          });
          status = res.ok ? "sent" : "failed";
          externalId = res.id ?? null;
          errorMessage = res.ok ? null : (res.error ?? "Nie udało się wysłać e-mail");
        } catch (e) {
          status = "failed";
          errorMessage = e instanceof Error ? e.message : "Błąd wysyłki e-mail";
        }
      }
    }

    // Opłatę naliczamy tylko, gdy działanie się powiodło (lub jest tylko
    // rejestrowane: telefon/pismo). Przy nieudanej wysyłce opłaty nie pobieramy.
    const charged = status === "failed" ? 0 : Number(data.fee) || 0;

    const { data: row, error } = await db
      .from("debt_collection_actions")
      .insert({
        case_id: data.caseId,
        action_type: data.action_type,
        action_date: emptyToNull(data.action_date) ?? new Date().toISOString().slice(0, 10),
        channel_target: target,
        subject: emptyToNull(data.subject),
        content: emptyToNull(data.content),
        fee: charged,
        status,
        external_id: externalId,
        error_message: errorMessage,
      })
      .select(
        "id, case_id, action_type, action_date, channel_target, subject, content, fee, status, external_id, error_message, created_at",
      )
      .single();
    if (error) throw new Error(error.message);
    return row as DebtAction;
  });

export const deleteDebtAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { actionId: string }) => z.object({ actionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as { from: (t: string) => any };
    const { error } = await db.from("debt_collection_actions").delete().eq("id", data.actionId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
