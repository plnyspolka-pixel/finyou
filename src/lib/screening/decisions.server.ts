// Decyzje weryfikującego w sprawach screeningu i ich skutki.
//
//  * „fałszywe trafienie” — zapamiętane dla pary podmiot–rekord (odcisk
//    podmiotu + hash rekordu); para nie wraca, dopóki dane się nie zmienią;
//  * „potwierdzony PEP” / „członek rodziny lub współpracownik” — status PEP,
//    wzmożone monitorowanie, wymagana akceptacja członka zarządu oraz źródło
//    majątku i źródło środków z załącznikami; do akceptacji relacja wstrzymana;
//  * „trafienie sankcyjne” — natychmiastowe wstrzymanie wszystkich operacji,
//    e-mail do osoby odpowiedzialnej za AML i do zarządu. Zgłoszenie do GIIF
//    i dalsze kroki wykonuje człowiek — system niczego nie zgłasza sam.
import { getScreeningSettings, screeningAudit, sdb } from "./db.server";
import { notifySanctionsConfirmed } from "./notify.server";

export const DECISIONS = {
  false_positive: "Fałszywe trafienie",
  confirmed_pep: "Potwierdzony PEP",
  confirmed_family_or_associate: "Potwierdzony członek rodziny lub współpracownik PEP",
  sanctions_hit: "Trafienie sankcyjne",
  no_pep_declaration_error: "Oświadczenie „tak” złożone omyłkowo (brak statusu PEP)",
} as const;
export type Decision = keyof typeof DECISIONS;

export const ALLOWED_DECISIONS: Record<string, Decision[]> = {
  pep: ["false_positive", "confirmed_pep", "confirmed_family_or_associate"],
  sanctions: ["false_positive", "sanctions_hit"],
  declaration: ["confirmed_pep", "confirmed_family_or_associate", "no_pep_declaration_error"],
};

export interface DecideInput {
  caseId: string;
  decision: Decision;
  justification: string;
  /** Dla „członek rodziny lub współpracownik”. */
  relation?: "family_member" | "close_associate";
  actorId: string;
}

async function anyOtherHold(
  subjectId: string,
  exceptCaseId: string,
  clientId: string | null,
): Promise<boolean> {
  const { data: cases } = await sdb
    .from("screening_cases")
    .select("id, subject_id, application_hold")
    .eq("application_hold", true)
    .is("decision", null);
  const ids = new Set<string>([subjectId]);
  if (clientId) {
    const { data: subs } = await sdb
      .from("screening_subjects")
      .select("id")
      .eq("client_id", clientId);
    for (const s of subs ?? []) ids.add(s.id);
  }
  return ((cases ?? []) as Array<{ id: string; subject_id: string }>).some(
    (c) => c.id !== exceptCaseId && ids.has(c.subject_id),
  );
}

export async function decideCase(input: DecideInput): Promise<{ ok: true }> {
  const justification = input.justification.trim();
  if (justification.length < 10)
    throw new Error("Uzasadnienie decyzji jest obowiązkowe (min. 10 znaków).");
  const { data: c, error } = await sdb
    .from("screening_cases")
    .select("*")
    .eq("id", input.caseId)
    .maybeSingle();
  if (error || !c) throw new Error("Nie znaleziono sprawy.");
  if (c.decision) throw new Error("Sprawa ma już decyzję — decyzja jest ostateczna.");
  if (!ALLOWED_DECISIONS[c.case_type]?.includes(input.decision)) {
    throw new Error(
      `Decyzja „${DECISIONS[input.decision]}” nie jest dostępna dla sprawy typu ${c.case_type}.`,
    );
  }
  if (input.decision === "confirmed_family_or_associate" && !input.relation) {
    throw new Error("Wskaż, czy to członek rodziny, czy bliski współpracownik PEP.");
  }
  const { data: subject } = await sdb
    .from("screening_subjects")
    .select("*")
    .eq("id", c.subject_id)
    .single();
  const now = new Date().toISOString();

  const { error: upErr } = await sdb
    .from("screening_cases")
    .update({
      decision: input.decision,
      justification,
      decided_by: input.actorId,
      decided_at: now,
      status: "decided",
      assigned_to: c.assigned_to ?? input.actorId,
    })
    .eq("id", c.id)
    .is("decision", null);
  if (upErr) throw new Error(upErr.message);

  const hitIds: string[] = c.hits ?? [];
  const { data: hits } = hitIds.length
    ? await sdb
        .from("screening_hits")
        .select("id, reference_type, reference_id, reference_hash, score_breakdown")
        .in("id", hitIds)
    : { data: [] };
  const hitRows = (hits ?? []) as Array<{
    id: string;
    reference_type: string;
    reference_id: string;
    reference_hash: string;
    score_breakdown: { pepTimeStatus?: string };
  }>;

  if (input.decision === "false_positive" || input.decision === "no_pep_declaration_error") {
    if (hitRows.length) {
      await sdb.from("screening_hits").update({ status: "false_positive" }).in("id", hitIds);
      const memory = hitRows.map((h) => ({
        subject_id: c.subject_id,
        reference_type: h.reference_type,
        reference_id: h.reference_id,
        subject_fingerprint: subject.subject_fingerprint,
        reference_hash: h.reference_hash,
        case_id: c.id,
        decided_by: input.actorId,
      }));
      await sdb.from("screening_false_positives").upsert(memory, {
        onConflict: "subject_id,reference_type,reference_id,subject_fingerprint,reference_hash",
        ignoreDuplicates: true,
      });
    }
  } else if (hitRows.length) {
    await sdb.from("screening_hits").update({ status: "confirmed" }).in("id", hitIds);
  }

  // Skutki dla statusu podmiotu.
  const { data: st } = await sdb
    .from("screening_subject_status")
    .select("*")
    .eq("subject_id", c.subject_id)
    .maybeSingle();
  const status: Record<string, unknown> = { subject_id: c.subject_id, updated_at: now };
  if (input.decision === "confirmed_pep" || input.decision === "confirmed_family_or_associate") {
    const former =
      hitRows.length > 0 && hitRows.every((h) => h.score_breakdown?.pepTimeStatus === "former");
    status.pep_status =
      input.decision === "confirmed_pep" ? (former ? "former_pep" : "pep") : input.relation;
    status.enhanced_monitoring = true;
    if (!former) {
      status.board_approval_required = true;
      status.board_approved_by = null;
      status.board_approved_at = null;
      status.operations_hold = true;
      status.hold_reason = "PEP: wymagana akceptacja członka zarządu oraz źródło majątku i środków";
      status.hold_case_id = c.id;
    }
  } else if (input.decision === "sanctions_hit") {
    status.sanctions_status = "hit";
    status.operations_hold = true;
    status.hold_reason = "Trafienie sankcyjne — wszystkie operacje wstrzymane";
    status.hold_case_id = c.id;
  } else {
    if (c.case_type === "sanctions" && [undefined, null, "unknown"].includes(st?.sanctions_status))
      status.sanctions_status = "none";
    if (c.case_type !== "sanctions" && [undefined, null, "unknown"].includes(st?.pep_status))
      status.pep_status = "none";
  }
  await sdb.from("screening_subject_status").upsert(status, { onConflict: "subject_id" });

  // Wnioski klienta: blokadę egzekwuje trigger; tu aktualizujemy znacznik informacyjny.
  if (subject.client_id) {
    const stillHeld =
      status.operations_hold === true ||
      (await anyOtherHold(c.subject_id, c.id, subject.client_id));
    await sdb
      .from("loan_applications")
      .update({
        aml_status: stillHeld ? "wstrzymany_screening" : "zweryfikowany_screening",
        aml_checked_at: now,
      })
      .eq("client_id", subject.client_id)
      .is("deleted_at", null);
  }

  await screeningAudit({
    eventType: "case.decided",
    entityType: "case",
    entityId: c.id,
    subjectId: c.subject_id,
    actorId: input.actorId,
    details: {
      decision: input.decision,
      relation: input.relation ?? null,
      justification,
      hits: hitIds.length,
    },
  });

  if (input.decision === "sanctions_hit") {
    const settings = await getScreeningSettings();
    const r = await notifySanctionsConfirmed(settings, { id: c.id, case_no: c.case_no });
    await screeningAudit({
      eventType: "notification.sent",
      entityType: "case",
      entityId: c.id,
      subjectId: c.subject_id,
      details: { kind: "sanctions_confirmed", ...r },
    });
  }
  return { ok: true };
}

/** Akceptacja członka zarządu dla relacji z PEP — wymaga źródła majątku i środków z załącznikami. */
export async function approveBoard(opts: { subjectId: string; note: string; actorId: string }) {
  const { data: st } = await sdb
    .from("screening_subject_status")
    .select("*")
    .eq("subject_id", opts.subjectId)
    .maybeSingle();
  if (!st?.board_approval_required) throw new Error("Ten podmiot nie wymaga akceptacji zarządu.");
  if (st.sanctions_status === "hit")
    throw new Error("Podmiot ma potwierdzone trafienie sankcyjne — akceptacja niemożliwa.");
  if (!st.source_of_wealth?.trim() || !st.source_of_funds?.trim()) {
    throw new Error("Uzupełnij źródło majątku i źródło środków przed akceptacją.");
  }
  if (!Array.isArray(st.sow_attachments) || st.sow_attachments.length === 0) {
    throw new Error("Dołącz co najmniej jeden dokument potwierdzający źródło majątku / środków.");
  }
  if (opts.note.trim().length < 10)
    throw new Error("Uzasadnienie akceptacji jest obowiązkowe (min. 10 znaków).");
  const now = new Date().toISOString();
  await sdb
    .from("screening_subject_status")
    .update({
      board_approved_by: opts.actorId,
      board_approved_at: now,
      board_approval_note: opts.note.trim(),
      operations_hold: false,
      hold_reason: null,
      updated_at: now,
    })
    .eq("subject_id", opts.subjectId);
  await screeningAudit({
    eventType: "board.approved",
    entityType: "subject",
    entityId: opts.subjectId,
    subjectId: opts.subjectId,
    actorId: opts.actorId,
    details: { note: opts.note.trim() },
  });
}

export async function saveSourceOfWealth(opts: {
  subjectId: string;
  sourceOfWealth: string;
  sourceOfFunds: string;
  actorId: string;
}) {
  await sdb.from("screening_subject_status").upsert(
    {
      subject_id: opts.subjectId,
      source_of_wealth: opts.sourceOfWealth.trim(),
      source_of_funds: opts.sourceOfFunds.trim(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "subject_id" },
  );
  await screeningAudit({
    eventType: "subject.sow_updated",
    entityType: "subject",
    entityId: opts.subjectId,
    subjectId: opts.subjectId,
    actorId: opts.actorId,
    details: {
      sourceOfWealthLength: opts.sourceOfWealth.length,
      sourceOfFundsLength: opts.sourceOfFunds.length,
    },
  });
}

export async function addSowAttachment(opts: {
  subjectId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  actorId: string;
}) {
  const safe = opts.fileName.replace(/[^\w.-]+/g, "_").slice(-120);
  const path = `${opts.subjectId}/${Date.now()}-${safe}`;
  const { error } = await sdb.storage
    .from("screening-attachments")
    .upload(path, opts.bytes, { contentType: opts.mimeType, upsert: false });
  if (error) throw new Error(`Nie zapisano załącznika: ${error.message}`);
  const { data: st } = await sdb
    .from("screening_subject_status")
    .select("sow_attachments")
    .eq("subject_id", opts.subjectId)
    .maybeSingle();
  const list = [
    ...((st?.sow_attachments ?? []) as unknown[]),
    {
      path,
      name: opts.fileName,
      mime: opts.mimeType,
      uploaded_by: opts.actorId,
      uploaded_at: new Date().toISOString(),
    },
  ];
  await sdb
    .from("screening_subject_status")
    .upsert(
      { subject_id: opts.subjectId, sow_attachments: list, updated_at: new Date().toISOString() },
      { onConflict: "subject_id" },
    );
  await screeningAudit({
    eventType: "subject.attachment_added",
    entityType: "subject",
    entityId: opts.subjectId,
    subjectId: opts.subjectId,
    actorId: opts.actorId,
    details: { path, name: opts.fileName },
  });
  return { path };
}
