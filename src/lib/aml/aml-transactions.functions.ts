// Rejestr transakcji + rejestr transakcji ponadprogowych.
//  - każda WYKONANA transakcja dostaje równowartość EUR wg średniego kursu
//    NBP (tabela A) z dnia transakcji; > 15 000 EUR → wpis do rejestru
//    ponadprogowego z terminem 7 dni i wymaganą decyzją inwestora,
//  - gotówka powyżej progu → domyślna decyzja 'reportable'; przelew → bez
//    domyślnej decyzji, z opcją „raportuje bank / dostawca usług płatniczych",
//  - jeżeli Finance You nie widzi faktycznego przelewu, wykonanie potwierdza
//    inwestor (confirmAmlTransactionExecution).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  AML_THRESHOLD_EUR,
  CASH_TRANSACTION_TYPES,
  type AmlTransactionType,
} from "@/lib/aml/aml-types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
type Loose = { from: (t: string) => any };
const loose = (c: unknown) => c as Loose;

const TransactionInput = z.object({
  id: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  contractRef: z.string().optional(),
  loanApplicationId: z.string().uuid().optional(),
  transactionType: z.enum([
    "wyplata_finansowania",
    "splata_kapitalu",
    "odsetki",
    "oplaty",
    "wplata_gotowkowa",
    "wyplata_gotowkowa",
    "przelew_przychodzacy",
    "przelew_wychodzacy",
    "inna_operacja",
  ]),
  source: z.enum(["auto", "manual", "bank_integration"]).default("manual"),
  transactionDate: z.string(),
  amount: z.number().positive(),
  currency: z.enum(["PLN", "EUR"]).default("PLN"),
  counterpartyName: z.string().optional(),
  senderAccount: z.string().optional(),
  receiverAccount: z.string().optional(),
  description: z.string().optional(),
  executed: z.boolean().default(false),
});

/**
 * Po potwierdzeniu wykonania: liczy równowartość EUR i — jeżeli przekracza
 * 15 000 EUR — tworzy wpis rejestru ponadprogowego (kurs, data i numer
 * tabeli NBP, termin 7 dni, domyślna decyzja dla gotówki).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
async function processExecutedTransaction(db: Loose, tx: any, userId: string): Promise<any> {
  const { getEurRateForDate, toEurEquivalent } = await import("@/lib/aml/nbp-eur.server");
  const { amlAudit } = await import("@/lib/aml/audit.server");

  const rate = await getEurRateForDate(tx.transaction_date);
  const eur = toEurEquivalent(Number(tx.amount), tx.currency, rate.rate);
  const above = eur > AML_THRESHOLD_EUR;

  const { data: updated } = await db
    .from("aml_transactions")
    .update({
      eur_equivalent: eur,
      nbp_rate: rate.rate,
      nbp_table_no: rate.tableNo,
      nbp_table_date: rate.tableDate,
      above_threshold: above,
    })
    .eq("id", tx.id)
    .select("*")
    .single();

  if (above) {
    const isCash = CASH_TRANSACTION_TYPES.includes(tx.transaction_type as AmlTransactionType);
    const executedAt = tx.execution_confirmed_at ?? new Date().toISOString();
    const deadline = new Date(
      new Date(executedAt).getTime() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    // Idempotentnie (transaction_id UNIQUE) — ponowne przeliczenie nie dubluje wpisu.
    await db.from("aml_threshold_entries").upsert(
      {
        user_id: userId,
        transaction_id: tx.id,
        eur_equivalent: eur,
        nbp_rate: rate.rate,
        nbp_table_no: rate.tableNo,
        nbp_table_date: rate.tableDate,
        deadline_at: deadline,
        // Gotówka powyżej progu: domyślnie 'reportable'. Przelew: decyzja
        // pozostaje pusta — inwestor może wskazać, że raportuje bank.
        ...(isCash ? { decision: "reportable" } : {}),
      },
      { onConflict: "transaction_id" },
    );
    await amlAudit({
      userId,
      entityType: "threshold_entry",
      entityId: tx.id,
      action: "threshold_registered",
      details: {
        eur,
        rate: rate.rate,
        tableNo: rate.tableNo,
        deadline,
        defaultDecision: isCash ? "reportable" : null,
      },
    });
  }
  return updated;
}

export const listAmlTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await loose(context.supabase)
      .from("aml_transactions")
      .select("*, aml_customers(id, entity_type, first_name, last_name, company_name)")
      .eq("user_id", context.userId)
      .order("transaction_date", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { transactions: data ?? [] };
  });

export const upsertAmlTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => TransactionInput.parse(data))
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { amlAudit } = await import("@/lib/aml/audit.server");
    const row = {
      user_id: context.userId,
      customer_id: data.customerId ?? null,
      contract_ref: data.contractRef ?? null,
      loan_application_id: data.loanApplicationId ?? null,
      transaction_type: data.transactionType,
      source: data.source,
      transaction_date: data.transactionDate,
      amount: data.amount,
      currency: data.currency,
      counterparty_name: data.counterpartyName ?? null,
      sender_account: data.senderAccount ?? null,
      receiver_account: data.receiverAccount ?? null,
      description: data.description ?? null,
      executed: data.executed,
      ...(data.executed
        ? {
            execution_confirmed_by: context.userId,
            execution_confirmed_at: new Date().toISOString(),
          }
        : {}),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
    let tx: any;
    if (data.id) {
      const { data: updated, error } = await db
        .from("aml_transactions")
        .update(row)
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      tx = updated;
    } else {
      const { data: created, error } = await db
        .from("aml_transactions")
        .insert(row)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      tx = created;
      await amlAudit({
        userId: context.userId,
        entityType: "transaction",
        entityId: tx.id,
        action: "transaction_registered",
        details: {
          type: data.transactionType,
          amount: data.amount,
          currency: data.currency,
          source: data.source,
        },
      });
    }

    if (tx.executed) tx = await processExecutedTransaction(db, tx, context.userId);
    return { transaction: tx };
  });

/** Potwierdzenie faktycznego wykonania transakcji przez inwestora. */
export const confirmAmlTransactionExecution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ transactionId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { data: tx, error } = await db
      .from("aml_transactions")
      .update({
        executed: true,
        execution_confirmed_by: context.userId,
        execution_confirmed_at: new Date().toISOString(),
      })
      .eq("id", data.transactionId)
      .eq("user_id", context.userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const { amlAudit } = await import("@/lib/aml/audit.server");
    await amlAudit({
      userId: context.userId,
      entityType: "transaction",
      entityId: tx.id,
      action: "execution_confirmed",
      details: {},
    });
    const updated = await processExecutedTransaction(db, tx, context.userId);
    return { transaction: updated };
  });

// ── Rejestr ponadprogowy ─────────────────────────────────────────────
export const listAmlThresholdEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await loose(context.supabase)
      .from("aml_threshold_entries")
      .select(
        "*, aml_transactions(id, transaction_type, transaction_date, amount, currency, counterparty_name, customer_id, aml_customers(id, entity_type, first_name, last_name, company_name))",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return { entries: data ?? [] };
  });

export const decideAmlThresholdEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        entryId: z.string().uuid(),
        decision: z.enum([
          "reportable",
          "not_reportable",
          "verification_required",
          "report_prepared",
          "submitted",
          "accepted",
          "correction_required",
        ]),
        note: z.string().optional(),
        // Przelew: transfer raportuje bank / inny dostawca usług płatniczych.
        reportedByBank: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const db = loose(context.supabase);
    const { data: entry, error } = await db
      .from("aml_threshold_entries")
      .update({
        decision: data.decision,
        decision_note: data.note ?? null,
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
        ...(data.reportedByBank !== undefined ? { reported_by_bank: data.reportedByBank } : {}),
      })
      .eq("id", data.entryId)
      .eq("user_id", context.userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const { amlAudit } = await import("@/lib/aml/audit.server");
    await amlAudit({
      userId: context.userId,
      entityType: "threshold_entry",
      entityId: data.entryId,
      action: "threshold_decision",
      details: { decision: data.decision, reportedByBank: data.reportedByBank, note: data.note },
    });
    return { entry };
  });
