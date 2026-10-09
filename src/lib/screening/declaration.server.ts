// Zapis oświadczenia PEP — niezmienialny wiersz pep_declarations (trigger
// blokuje UPDATE/DELETE) z pełną treścią, wersją, znacznikiem czasu, IP
// i user-agentem. Zapis wywołuje (triggerem) kolejkę screeningu.
import {
  DECLARATION_TEXT,
  DECLARATION_TEXT_VERSION,
  PepDeclarationInput,
  type PepDeclarationValue,
} from "./declaration";
import { screeningAudit, sdb } from "./db.server";

export function requestMeta(request: Request | undefined | null): {
  ip: string | null;
  userAgent: string | null;
} {
  const ip =
    request?.headers.get("cf-connecting-ip") ||
    request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null;
  return { ip, userAgent: request?.headers.get("user-agent")?.slice(0, 500) ?? null };
}

export async function recordPepDeclaration(opts: {
  subjectType: "client" | "investor";
  subjectId: string;
  loanApplicationId?: string | null;
  value: PepDeclarationValue;
  ip: string | null;
  userAgent: string | null;
  userId?: string | null;
  channel: "landing" | "broker" | "operator" | "client_panel" | "investor_pipeline";
}): Promise<{ id: string }> {
  const v = PepDeclarationInput.parse(opts.value);
  if (v.declaration_text_version !== DECLARATION_TEXT_VERSION) {
    throw new Error(
      "Treść oświadczenia PEP została zaktualizowana — odśwież stronę i złóż oświadczenie ponownie.",
    );
  }
  const { data, error } = await sdb
    .from("pep_declarations")
    .insert({
      subject_type: opts.subjectType,
      subject_id: opts.subjectId,
      loan_application_id: opts.loanApplicationId ?? null,
      answers: {
        is_pep: v.is_pep,
        pep_position_category: v.is_pep ? v.pep_position_category : null,
        pep_position_detail: v.is_pep ? (v.pep_position_detail ?? null) : null,
        is_family_member: v.is_family_member,
        is_close_associate: v.is_close_associate,
        criminal_liability_acknowledged: true,
      },
      related_persons: v.related_persons.filter(
        (p) =>
          (p.relation === "family" && v.is_family_member) ||
          (p.relation === "associate" && v.is_close_associate),
      ),
      declaration_text_version: DECLARATION_TEXT_VERSION,
      declaration_text: DECLARATION_TEXT,
      signed_at: new Date().toISOString(),
      ip: opts.ip,
      user_agent: opts.userAgent,
      declared_by_user_id: opts.userId ?? null,
      channel: opts.channel,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Nie zapisano oświadczenia PEP: ${error.message}`);
  await screeningAudit({
    eventType: "declaration.signed",
    entityType: "declaration",
    entityId: data.id,
    actorId: opts.userId ?? null,
    details: {
      subjectType: opts.subjectType,
      subjectId: opts.subjectId,
      anyYes: v.is_pep || v.is_family_member || v.is_close_associate,
      version: DECLARATION_TEXT_VERSION,
      channel: opts.channel,
    },
  });
  return { id: data.id };
}
