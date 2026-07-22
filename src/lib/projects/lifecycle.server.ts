// Cykl życia przypisań uruchamiany przez cron (project-assignments-tick):
//  1) wygaszanie przeterminowanych przypisań i zainteresowań bez propozycji
//     (atomowa, idempotentna funkcja SQL project_expire_assignments),
//  2) przypomnienia 12 h / 3 h / 30 min przed wygaśnięciem karty oraz przed
//     terminem złożenia propozycji (dedupe w project_assignment_notifications),
//  3) informacja o wygaśnięciu + sygnał do administratora po przekroczeniu
//     progu odrzuceń projektu.
//
// Treść powiadomień celowo NIE ujawnia szczegółów projektu.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { projectAudit } from "./audit.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

const APP_URL = (process.env.APP_URL || "https://app.financeyou.pl").replace(/\/+$/, "");

async function investorEmail(userId: string): Promise<string | null> {
  const { data } = await db.from("profiles").select("email").eq("user_id", userId).maybeSingle();
  if (data?.email) return data.email as string;
  try {
    const { data: userData } = await db.auth.admin.getUserById(userId);
    return userData?.user?.email ?? null;
  } catch {
    return null;
  }
}

async function sendModuleEmail(userId: string, subject: string, text: string): Promise<void> {
  const email = await investorEmail(userId);
  if (!email) return;
  const { sendResendEmail } = await import("@/lib/resend-send.server");
  const res = await sendResendEmail({
    to: email,
    subject,
    text: `${text}\n\nZaloguj się do panelu: ${APP_URL}/inwestor/projekty`,
  });
  if (!res.ok) console.warn("[projects lifecycle] email failed:", res.error);
}

/** Wysyła powiadomienie raz na (assignment, kind) — dedupe na unikalnym indeksie. */
async function notifyOnce(
  assignmentId: string,
  investorId: string,
  kind: string,
  subject: string,
  text: string,
): Promise<boolean> {
  const { error } = await db
    .from("project_assignment_notifications")
    .insert({ assignment_id: assignmentId, kind });
  if (error) {
    // duplikat = już wysłane (idempotencja przy równoległych tickach)
    if (String(error.code) === "23505") return false;
    console.error("[projects lifecycle] notification insert failed:", error.message);
    return false;
  }
  await sendModuleEmail(investorId, subject, text);
  return true;
}

const REMINDER_STEPS: { kind: string; hoursLeft: number; label: string }[] = [
  { kind: "expiry_12h", hoursLeft: 12, label: "około 12 godzin" },
  { kind: "expiry_3h", hoursLeft: 3, label: "około 3 godziny" },
  { kind: "expiry_30m", hoursLeft: 0.5, label: "mniej niż 30 minut" },
];

export async function notifyAdminProjectReview(context: string): Promise<void> {
  const adminEmail = process.env.PROJECTS_ADMIN_EMAIL || process.env.RESEND_FROM_ADDRESS;
  if (!adminEmail) return;
  const { sendResendEmail } = await import("@/lib/resend-send.server");
  await sendResendEmail({
    to: adminEmail,
    subject: "Finance You — projekt wymaga przeglądu (próg odrzuceń)",
    text:
      "Projekt w module inwestycyjnym przekroczył próg odrzuceń/wygaśnięć i został przestawiony " +
      `na status under_review. Sprawdź zdjęcie, kwotę, parametry i jakość projektu w panelu: ${APP_URL}/admin/projekty (kontekst: ${context}).`,
  });
}

export interface TickResult {
  expired: number;
  proposalExpired: number;
  reviewProjects: number;
  remindersSent: number;
}

/** Pełny przebieg ticka. Odporny na wielokrotne równoległe uruchomienie. */
export async function runAssignmentsTick(): Promise<TickResult> {
  // 1) Wygaszanie (atomowe, w SQL).
  const { data: expireRes, error: expireErr } = await db.rpc("project_expire_assignments");
  if (expireErr) throw new Error(expireErr.message);
  const expired: string[] = (expireRes?.expired ?? []) as string[];
  const proposalExpired: string[] = (expireRes?.proposal_expired ?? []) as string[];
  const reviewProjects: string[] = (expireRes?.review_projects ?? []) as string[];

  // 2) Informacja o wygaśnięciu (raz na przypisanie).
  const allExpired = [...expired, ...proposalExpired];
  if (allExpired.length) {
    const { data: rows } = await db
      .from("project_assignments")
      .select("id, investor_id, closed_reason")
      .in("id", allExpired);
    for (const a of (rows ?? []) as { id: string; investor_id: string; closed_reason: string }[]) {
      const proposal = a.closed_reason === "proposal_deadline_missed";
      await notifyOnce(
        a.id,
        a.investor_id,
        "expired_info",
        "Finance You — przypisanie projektu wygasło",
        proposal
          ? "Termin na złożenie propozycji finansowania upłynął. Projekt wrócił do puli wewnętrznej i nie jest już dla Ciebie dostępny."
          : "Czas na decyzję dotyczącą przypisanego projektu upłynął. Projekt wrócił do puli wewnętrznej i nie jest już dla Ciebie dostępny.",
      );
    }
  }

  // 3) Sygnał do administratora o projektach wymagających przeglądu.
  for (const projectId of reviewProjects) {
    await notifyAdminProjectReview(`projekt ${projectId}`);
    await projectAudit({
      entityType: "project",
      entityId: projectId,
      action: "review_threshold_reached",
      newStatus: "under_review",
    });
  }

  // 4) Przypomnienia przed wygaśnięciem karty (12h/3h/30m).
  let remindersSent = 0;
  const now = Date.now();
  const { data: activeRows } = await db
    .from("project_assignments")
    .select("id, investor_id, expires_at")
    .in("status", ["created", "opened", "extended"])
    .gt("expires_at", new Date(now).toISOString());
  for (const a of (activeRows ?? []) as { id: string; investor_id: string; expires_at: string }[]) {
    const hoursLeft = (new Date(a.expires_at).getTime() - now) / 3600000;
    for (const step of REMINDER_STEPS) {
      if (hoursLeft <= step.hoursLeft) {
        const sent = await notifyOnce(
          a.id,
          a.investor_id,
          step.kind,
          "Finance You — przypisany projekt czeka na decyzję",
          `Masz przypisany projekt inwestycyjny, który czeka na Twoją decyzję jeszcze ${step.label}. Po upływie terminu przypisanie wygaśnie, a projekt wróci do puli.`,
        );
        if (sent) remindersSent += 1;
        break; // wysyłamy najbliższy próg; wcześniejsze uznajemy za skonsumowane
      }
    }
  }

  // 5) Przypomnienia przed terminem złożenia propozycji.
  const { data: interestedRows } = await db
    .from("project_assignments")
    .select("id, investor_id, proposal_deadline_at")
    .eq("status", "interested")
    .not("proposal_deadline_at", "is", null)
    .gt("proposal_deadline_at", new Date(now).toISOString());
  for (const a of (interestedRows ?? []) as {
    id: string;
    investor_id: string;
    proposal_deadline_at: string;
  }[]) {
    const hoursLeft = (new Date(a.proposal_deadline_at).getTime() - now) / 3600000;
    for (const step of REMINDER_STEPS) {
      if (hoursLeft <= step.hoursLeft) {
        const sent = await notifyOnce(
          a.id,
          a.investor_id,
          `proposal_${step.kind}`,
          "Finance You — zbliża się termin złożenia propozycji",
          `Do końca terminu na złożenie propozycji finansowania zostało ${step.label}. Po jego upływie zainteresowanie wygaśnie, a projekt wróci do puli.`,
        );
        if (sent) remindersSent += 1;
        break;
      }
    }
  }

  return {
    expired: expired.length,
    proposalExpired: proposalExpired.length,
    reviewProjects: reviewProjects.length,
    remindersSent,
  };
}
