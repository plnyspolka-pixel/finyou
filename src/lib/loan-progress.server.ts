// Helpery serwerowe do wyliczania postępu wniosku z bazy + planowania przypomnień.
import { createClient } from "@supabase/supabase-js";
import { computeLoanProgress, buildElevenLabsVariables, type ProgressResult } from "./loan-progress";

function admin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

export interface LoanLeadFullData {
  loan: any;
  client: any | null;
  property: any | null;
  documents: any[];
  progress: ProgressResult;
  variables: Record<string, string>;
}

export async function loadLoanLeadData(loanApplicationId: string): Promise<LoanLeadFullData | null> {
  const s = admin();
  const { data: loan } = await s.from("loan_applications").select("*").eq("id", loanApplicationId).maybeSingle();
  if (!loan) return null;

  const [{ data: client }, { data: prop }, { data: docs }] = await Promise.all([
    s.from("clients").select("first_name,last_name,phone_normalized,email,phone").eq("id", loan.client_id).maybeSingle(),
    s.from("properties").select("*").eq("loan_application_id", loan.id).maybeSingle(),
    s.from("documents").select("id,document_type,file_name").eq("loan_application_id", loan.id),
  ]);

  const progress = computeLoanProgress({
    loan: {
      id: loan.id,
      current_form_step: loan.current_form_step,
      status: loan.status,
      loan_amount: loan.loan_amount,
      preferred_period_months: loan.preferred_period_months,
    },
    client: client
      ? {
          first_name: client.first_name,
          last_name: client.last_name,
          phone_normalized: client.phone_normalized ?? client.phone,
          email: client.email,
        }
      : null,
    property: prop,
    documents: docs ?? [],
  });

  const variables = buildElevenLabsVariables(progress, {
    first_name: client?.first_name ?? null,
    last_name: client?.last_name ?? null,
    phone_normalized: client?.phone_normalized ?? client?.phone ?? null,
    email: client?.email ?? null,
  });

  return { loan, client, property: prop, documents: docs ?? [], progress, variables };
}

/** Wylicza kolejny termin przypomnienia.
 *  Schedule: 0→+2h od created_at, 1→+24h, 2→+72h, 3+→+5 dni.
 *  Stop: po 30 dniach od first_reminder_at, max ~10 prób.
 */
export function computeNextReminder(opts: {
  attempts: number;
  firstReminderAt: Date | null;
  now?: Date;
}): { nextAt: Date | null; stop: boolean } {
  const now = opts.now ?? new Date();
  const a = opts.attempts;
  if (a >= 10) return { nextAt: null, stop: true };
  if (opts.firstReminderAt && now.getTime() - opts.firstReminderAt.getTime() > 30 * 24 * 3600_000) {
    return { nextAt: null, stop: true };
  }
  let deltaH: number;
  if (a === 0) deltaH = 2;
  else if (a === 1) deltaH = 24;
  else if (a === 2) deltaH = 72;
  else deltaH = 5 * 24;
  return { nextAt: new Date(now.getTime() + deltaH * 3600_000), stop: false };
}

export const ELIGIBLE_STATUSES_FOR_REMINDERS = [
  "nowy_lead",
  "w_trakcie_uzupelniania",
  "braki_w_dokumentach",
  "do_kontaktu",
  "w_follow_upie",
];
