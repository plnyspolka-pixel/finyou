// Server functions dla weryfikacji tożsamości Didit (KYC/KYB) w module AML.
// Sesję tworzy backend, link zwracamy do frontendu; decyzję dostarcza webhook
// (supabase/functions/didit-webhook) albo ręczne odświeżenie decyzji.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  createDiditSession,
  getDiditDecision,
  hasDiditConfig,
  selectWorkflowId,
  diditAppUrl,
  type DiditWorkflowKind,
} from "@/lib/didit.server";

// didit_verifications nie jest jeszcze w wygenerowanych typach Database —
// używamy luźnego dostępu, jak reszta modułu AML.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela poza typami Database do czasu regeneracji
type Loose = { from: (t: string) => any };
const loose = (c: unknown) => c as Loose;

function kindForEntity(entityType: string | null | undefined): DiditWorkflowKind {
  return entityType === "firma" ? "kyb" : "kyc";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- rekord klienta AML (poza typami)
function customerLabel(c: any): string {
  if (!c) return "";
  return c.entity_type === "firma"
    ? (c.company_name ?? "")
    : [c.first_name, c.last_name].filter(Boolean).join(" ");
}

/**
 * Rozpoczyna weryfikację Didit dla klienta AML. Zwraca link, pod którym klient
 * przechodzi weryfikację (dokument + liveness + face match + AML dla osoby,
 * KYB dla firmy). Gdy integracja nie jest skonfigurowana, zwraca
 * status:"not_configured" (UI pokazuje instrukcję zamiast błędu).
 */
export const startDiditVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        customerId: z.string().uuid(),
        callbackBase: z.string().url().optional(),
        language: z.string().min(2).max(8).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!hasDiditConfig()) {
      return { status: "not_configured" as const };
    }

    const { data: customer, error } = await loose(supabase)
      .from("aml_customers")
      .select("*")
      .eq("id", data.customerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!customer) throw new Error("Nie znaleziono klienta AML.");

    const kind = kindForEntity(customer.entity_type);
    const workflowId = selectWorkflowId(kind);
    if (!workflowId) {
      return { status: "not_configured" as const, missingWorkflow: kind };
    }

    const base = (data.callbackBase ?? diditAppUrl()).replace(/\/+$/, "");
    const callback = `${base}/inwestor/aml/klienci?didit=return`;

    const contactDetails: Record<string, unknown> = {};
    if (customer.email) contactDetails.email = customer.email;

    const session = await createDiditSession({
      workflowId,
      vendorData: String(customer.id),
      callback,
      language: data.language ?? "pl",
      contactDetails: Object.keys(contactDetails).length ? contactDetails : undefined,
      metadata: {
        aml_customer_id: customer.id,
        entity_type: customer.entity_type,
        display_name: customerLabel(customer),
        app: "finance-you",
      },
    });

    const row = {
      user_id: userId,
      aml_customer_id: customer.id,
      vendor_data: String(customer.id),
      session_id: session.sessionId,
      session_number: session.sessionNumber,
      workflow_id: session.workflowId,
      workflow_type: kind,
      status: session.status,
      verification_url: session.url,
      metadata: { display_name: customerLabel(customer) },
    };
    const { error: insErr } = await loose(supabase).from("didit_verifications").insert(row);
    if (insErr) throw new Error(insErr.message);

    return {
      status: "ok" as const,
      sessionId: session.sessionId,
      url: session.url,
      workflowType: kind,
    };
  });

/** Zwraca weryfikacje Didit dla danego klienta AML (najnowsze na górze). */
export const listDiditVerifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ customerId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await loose(context.supabase)
      .from("didit_verifications")
      .select("*")
      .eq("aml_customer_id", data.customerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { verifications: rows ?? [], configured: hasDiditConfig() };
  });

/**
 * Odświeża decyzję sesji z API Didit (fallback, gdy webhook jeszcze nie
 * dotarł). Aktualizuje wiersz didit_verifications.
 */
export const refreshDiditDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ sessionId: z.string().min(6) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    if (!hasDiditConfig()) return { status: "not_configured" as const };

    // Upewniamy się, że sesja należy do wywołującego (RLS + jawny warunek).
    const { data: existing, error: selErr } = await loose(supabase)
      .from("didit_verifications")
      .select("id")
      .eq("session_id", data.sessionId)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);
    if (!existing) throw new Error("Nie znaleziono sesji weryfikacji.");

    const decision = await getDiditDecision(data.sessionId);
    const decided =
      decision.status === "Approved" ||
      decision.status === "Declined" ||
      decision.status === "In Review";
    const { error: updErr } = await loose(supabase)
      .from("didit_verifications")
      .update({
        status: decision.status,
        decision: decision.decision as never,
        warnings: decision.warnings as never,
        decided_at: decided ? new Date().toISOString() : null,
      })
      .eq("session_id", data.sessionId);
    if (updErr) throw new Error(updErr.message);

    return { status: "ok" as const, sessionStatus: decision.status };
  });
