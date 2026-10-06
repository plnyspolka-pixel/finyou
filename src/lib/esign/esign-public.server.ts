// Podpis dokumentowy — implementacja funkcji PODPISUJĄCEGO (tylko serwer) (bez logowania).
// Uwierzytelnienie: osobisty token z linku (w bazie tylko jego SHA-256).
// Kolejność: otwarcie linku → dokument → tożsamość (Didit; dla inwestora
// z ważnym KYC z pipeline'u — automatycznie) → w czyim imieniu (inwestor ze
// spółką w systemie wybiera) → oświadczenia + kod jednorazowy → podpis.
// Po ostatnim podpisie koperta jest finalizowana (znaczniki + Karta
// podpisów) i doręczana e-mailem wszystkim stronom.
import type { z } from "zod";
import {
  getSigningSessionInput,
  getSigningDocumentInput,
  startSignerIdentityInput,
  refreshSignerIdentityInput,
  chooseSigningCapacityInput,
  requestSigningOtpInput,
  confirmSignatureInput,
  rejectSigningInput,
  getVerificationInput,
} from "./esign-schemas";
import {
  capacityLabel,
  describeIdentity,
  maskEmail,
  maskPhone,
  missingStatements,
  nextSignersToInvite,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
  randomOtp,
  randomToken,
  signatureHash,
  signerTurnActive,
  STATEMENTS,
  verifyEventChain,
  type SignedCapacity,
  type SignerCompany,
} from "./esign-core";
import {
  appBase,
  approvedPipelineVerification,
  bytesToBase64,
  db,
  downloadBytes,
  expireIfNeeded,
  finalizeEnvelope,
  hashOtp,
  hashToken,
  identityFromDecision,
  loadEnvelope,
  loadEvents,
  loadSignerByToken,
  loadSigners,
  logEsignEvent,
  notifyOwner,
  operatorName,
  requestClientMeta,
  sendOtpEmail,
  sendOtpSms,
  sendSignerInvitation,
  verifyUrl,
  type EnvelopeRow,
  type SignerRow,
} from "./esign.server";
import { investorCompany } from "./esign-owner.server";

async function ctxByToken(
  token: string,
): Promise<{ signer: SignerRow; envelope: EnvelopeRow; signers: SignerRow[] }> {
  const found = await loadSignerByToken(token);
  if (!found)
    throw new Error(
      "Link do podpisu jest nieprawidłowy albo został zastąpiony nowym. Poproś nadawcę o ponowne zaproszenie.",
    );
  const envelope = await expireIfNeeded(found.envelope);
  const signers = await loadSigners(envelope.id);
  return { signer: found.signer, envelope, signers };
}

function assertSignable(envelope: EnvelopeRow, signer: SignerRow, signers: SignerRow[]): void {
  if (envelope.status === "wygasla") throw new Error("Termin podpisania dokumentu minął.");
  if (envelope.status === "anulowana") throw new Error("Nadawca anulował ten dokument.");
  if (envelope.status === "odrzucona")
    throw new Error("Jedna ze stron odmówiła podpisu — dokument jest zamknięty.");
  if (envelope.status !== "wyslana") throw new Error("Dokument nie jest już dostępny do podpisu.");
  if (signer.status === "podpisany")
    throw new Error("Ten dokument został już przez Ciebie podpisany.");
  if (signer.status === "odrzucony") throw new Error("Odmówiłeś(-aś) podpisania tego dokumentu.");
  if (!signerTurnActive(envelope.signing_mode, signer, signers)) {
    throw new Error(
      "Dokument jest podpisywany kolejno — Twoja kolej przyjdzie po podpisie poprzednich osób.",
    );
  }
}

async function investorCapacityOptions(
  signer: SignerRow,
): Promise<{ person: string; company: SignerCompany | null }> {
  if (signer.capacity_mode !== "wybor" || !signer.user_id)
    return { person: signer.full_name, company: signer.company ?? null };
  const { data: inv } = await db()
    .from("investors")
    .select(
      "id, user_id, first_name, last_name, company_name, nip, krs, regon, legal_form, entity_variant, street, address, city, postal_code, representative_role",
    )
    .eq("user_id", signer.user_id)
    .maybeSingle();
  return { person: signer.full_name, company: investorCompany(inv) ?? signer.company ?? null };
}

function publicEnvelope(e: EnvelopeRow) {
  return {
    id: e.id,
    publicId: e.public_id,
    title: e.title,
    message: e.message,
    status: e.status,
    signingMode: e.signing_mode,
    senderName: e.sender_name,
    senderEmail: e.sender_email,
    sourceFilename: e.source_filename,
    pageCount: e.page_count,
    sourceSha256: e.source_sha256,
    finalSha256: e.final_sha256,
    finalAvailable: Boolean(e.final_path),
    sentAt: e.sent_at,
    expiresAt: e.expires_at,
    completedAt: e.completed_at,
    verifyUrl: verifyUrl(e.verify_code),
    operatorName: operatorName(),
  };
}

function publicSigner(s: SignerRow, envelope: EnvelopeRow, all: SignerRow[]) {
  return {
    id: s.id,
    fullName: s.full_name,
    email: s.email,
    phoneMasked: s.phone ? maskPhone(s.phone) : null,
    hasPhone: Boolean(s.phone),
    roleLabel: s.role_label,
    kind: s.signer_kind,
    status: s.status,
    turnActive: signerTurnActive(envelope.signing_mode, s, all),
    capacityMode: s.capacity_mode,
    company: s.company,
    signedCapacity: s.signed_capacity,
    identity: s.identity,
    identityDescription: s.identity ? describeIdentity(s.identity) : null,
    identityVerifiedAt: s.identity_verified_at,
    identityMismatchNote: s.identity_mismatch_note,
    diditStatus: s.didit_status,
    diditSessionId: s.didit_session_id,
    otp: s.otp_sent_at
      ? {
          channel: s.otp_channel,
          target: s.otp_target,
          sentAt: s.otp_sent_at,
          expiresAt: s.otp_expires_at,
        }
      : null,
    signedAt: s.signed_at,
    rejectedAt: s.rejected_at,
    rejectionReason: s.rejection_reason,
    statements: STATEMENTS,
  };
}

function othersView(signers: SignerRow[], me: SignerRow) {
  return signers
    .filter((s) => s.id !== me.id)
    .map((s) => ({
      fullName: s.full_name,
      roleLabel: s.role_label,
      status: s.status,
      signedAt: s.signed_at,
      capacity: s.signed_capacity
        ? capacityLabel(s.identity?.fullName || s.full_name, s.signed_capacity)
        : null,
    }));
}

/** Inwestor z ważnym KYC z pipeline'u — przejmujemy tożsamość bez nowej sesji. */
async function adoptPipelineIdentity(signer: SignerRow, envelope: EnvelopeRow): Promise<SignerRow> {
  if (
    !signer.user_id ||
    signer.identity ||
    !["oczekuje", "otwarty", "weryfikacja"].includes(signer.status)
  )
    return signer;
  const ver = await approvedPipelineVerification(signer.user_id);
  if (!ver) return signer;
  const identity = identityFromDecision({
    sessionId: ver.session_id,
    decision: ver.decision,
    source: "pipeline",
    expectedName: signer.full_name,
    decidedAt: ver.decided_at,
  });
  const status: SignerRow["status"] = identity.nameMatch ? "zweryfikowany" : "niezgodnosc";
  const now = new Date().toISOString();
  const { data: upd } = await db()
    .from("esign_signers")
    .update({
      identity,
      identity_verified_at: now,
      identity_source: "didit_pipeline",
      didit_session_id: ver.session_id,
      didit_status: "Approved",
      status,
    })
    .eq("id", signer.id)
    .select("*")
    .maybeSingle();
  await logEsignEvent({
    envelopeId: envelope.id,
    signerId: signer.id,
    eventType: identity.nameMatch ? "weryfikacja_pipeline" : "niezgodnosc",
    actorKind: "system",
    payload: {
      session_id: ver.session_id,
      name_on_document: identity.fullName,
      expected: signer.full_name,
    },
  });
  if (!identity.nameMatch) {
    await notifyOwner(envelope, `Niezgodność danych podpisującego — ${envelope.public_id}`, [
      `Dane podpisującego „${signer.full_name}” nie zgadzają się z dokumentem tożsamości (${identity.fullName ?? "—"}).`,
      "Rozstrzygnij w panelu: zaakceptuj różnicę albo popraw dane podpisującego.",
    ]);
  }
  return (upd as SignerRow) ?? signer;
}

// ── sesja podpisującego ────────────────────────────────────────────────────

export async function getSigningSessionImpl(data: z.infer<typeof getSigningSessionInput>) {
  const { signer: s0, envelope, signers } = await ctxByToken(data.token);
  const meta = requestClientMeta();
  let signer = s0;
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { last_viewed_at: now };
  if (!signer.first_viewed_at) patch.first_viewed_at = now;
  if (signer.status === "oczekuje") patch.status = "otwarty";
  await db().from("esign_signers").update(patch).eq("id", signer.id);
  signer = { ...signer, ...(patch as Partial<SignerRow>) };
  if (!s0.first_viewed_at) {
    await logEsignEvent({
      envelopeId: envelope.id,
      signerId: signer.id,
      eventType: "link_otwarty",
      actorKind: "podpisujacy",
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
  if (envelope.status === "wyslana") signer = await adoptPipelineIdentity(signer, envelope);
  const { hasDiditConfig } = await import("@/lib/didit.server");
  const capacityOptions = await investorCapacityOptions(signer);
  return {
    envelope: publicEnvelope(envelope),
    signer: publicSigner(
      signer,
      envelope,
      signers.map((x) => (x.id === signer.id ? signer : x)),
    ),
    others: othersView(signers, signer),
    capacityOptions,
    diditConfigured: hasDiditConfig(),
  };
}

/** Treść dokumentu (base64) — do podglądu i pobrania przez podpisującego. */
export async function getSigningDocumentImpl(data: z.infer<typeof getSigningDocumentInput>) {
  const { signer, envelope } = await ctxByToken(data.token);
  const wantFinal = data.which === "podpisany";
  if (wantFinal && !envelope.final_path) throw new Error("Podpisany plik nie jest jeszcze gotowy.");
  const path = wantFinal ? (envelope.final_path as string) : envelope.source_path;
  const bytes = await downloadBytes(path, envelope.source_bucket);
  const meta = requestClientMeta();
  await logEsignEvent({
    envelopeId: envelope.id,
    signerId: signer.id,
    eventType: wantFinal ? "pobranie_podpisanego" : "dokument_pobrany",
    actorKind: "podpisujacy",
    ip: meta.ip,
    userAgent: meta.userAgent,
    payload: { bytes: bytes.byteLength },
  });
  return {
    filename: wantFinal ? `${envelope.public_id}-podpisany.pdf` : envelope.source_filename,
    contentType: "application/pdf",
    base64: bytesToBase64(bytes),
    sha256: wantFinal ? envelope.final_sha256 : envelope.source_sha256,
  };
}

// ── tożsamość (Didit) ──────────────────────────────────────────────────────

export async function startSignerIdentityImpl(data: z.infer<typeof startSignerIdentityInput>) {
  const { signer, envelope, signers } = await ctxByToken(data.token);
  assertSignable(envelope, signer, signers);
  if (signer.status === "zweryfikowany" || signer.status === "niezgodnosc") {
    return { status: "already" as const };
  }
  const { hasDiditConfig, createDiditSession, selectWorkflowId } =
    await import("@/lib/didit.server");
  if (!hasDiditConfig()) return { status: "not_configured" as const };
  const workflowId = selectWorkflowId("kyc");
  if (!workflowId) return { status: "not_configured" as const };

  // Trwająca, świeża sesja — podsuwamy ten sam link.
  if (signer.didit_session_id) {
    const { data: existing } = await db()
      .from("didit_verifications")
      .select("status, verification_url, created_at")
      .eq("session_id", signer.didit_session_id)
      .maybeSingle();
    const fresh =
      existing?.created_at &&
      Date.now() - new Date(existing.created_at).getTime() < 6 * 24 * 3600 * 1000;
    if (
      existing &&
      fresh &&
      ["Not Started", "In Progress", "Awaiting User", "Resubmitted"].includes(existing.status)
    ) {
      return { status: "ok" as const, url: existing.verification_url as string, reused: true };
    }
  }

  const vendorData = `esign:${signer.id}`;
  const session = await createDiditSession({
    workflowId,
    vendorData,
    callback: `${appBase()}/podpis/${data.token}?didit=return`,
    language: "pl",
    contactDetails: {
      email: signer.email,
      email_lang: "pl",
      ...(signer.phone ? { phone: signer.phone } : {}),
    },
    metadata: {
      purpose: "esign",
      envelope_id: envelope.id,
      signer_id: signer.id,
      public_id: envelope.public_id,
      app: "finance-you",
    },
  });
  const { error } = await db()
    .from("didit_verifications")
    .insert({
      user_id: envelope.created_by,
      aml_customer_id: null,
      vendor_data: vendorData,
      session_id: session.sessionId,
      session_number: session.sessionNumber,
      workflow_id: session.workflowId,
      workflow_type: "kyc",
      status: session.status,
      verification_url: session.url,
      metadata: {
        purpose: "esign",
        envelope_id: envelope.id,
        signer_id: signer.id,
        display_name: signer.full_name,
      },
    });
  if (error) throw new Error(error.message);
  await db()
    .from("esign_signers")
    .update({
      didit_session_id: session.sessionId,
      didit_status: session.status,
      status: "weryfikacja",
    })
    .eq("id", signer.id);
  const meta = requestClientMeta();
  await logEsignEvent({
    envelopeId: envelope.id,
    signerId: signer.id,
    eventType: "weryfikacja_start",
    actorKind: "podpisujacy",
    ip: meta.ip,
    userAgent: meta.userAgent,
    payload: { session_id: session.sessionId, workflow_id: session.workflowId },
  });
  return { status: "ok" as const, url: session.url, reused: false };
}

/** Odświeża wynik weryfikacji (po powrocie z Didit / na żądanie). */
export async function refreshSignerIdentityImpl(data: z.infer<typeof refreshSignerIdentityInput>) {
  const { signer, envelope, signers } = await ctxByToken(data.token);
  if (!signer.didit_session_id || signer.identity) {
    return { signer: publicSigner(signer, envelope, signers) };
  }
  let { data: row } = await db()
    .from("didit_verifications")
    .select("status, decision, decided_at")
    .eq("session_id", signer.didit_session_id)
    .maybeSingle();
  const decided = (st: string | undefined) =>
    st === "Approved" || st === "Declined" || st === "In Review";
  if (!decided(row?.status)) {
    const { hasDiditConfig, getDiditDecision } = await import("@/lib/didit.server");
    if (hasDiditConfig()) {
      try {
        const dec = await getDiditDecision(signer.didit_session_id);
        const upd = {
          status: dec.status,
          decision: dec.decision as never,
          warnings: dec.warnings as never,
          decided_at: decided(dec.status) ? new Date().toISOString() : null,
        };
        await db()
          .from("didit_verifications")
          .update(upd)
          .eq("session_id", signer.didit_session_id);
        row = { status: dec.status, decision: dec.decision, decided_at: upd.decided_at };
      } catch (e) {
        console.error("[esign] didit decision refresh failed", e);
      }
    }
  }
  const status = row?.status ?? signer.didit_status ?? "Not Started";
  const patch: Record<string, unknown> = { didit_status: status };
  let eventType: string | null = null;
  let identity: SignerRow["identity"] = null;
  if (status === "Approved") {
    identity = identityFromDecision({
      sessionId: signer.didit_session_id,
      decision: row?.decision,
      source: "esign",
      expectedName: signer.full_name,
      decidedAt: row?.decided_at ?? new Date().toISOString(),
    });
    patch.identity = identity;
    patch.identity_verified_at = new Date().toISOString();
    patch.identity_source = "didit_esign";
    patch.status = identity.nameMatch ? "zweryfikowany" : "niezgodnosc";
    eventType = identity.nameMatch ? "weryfikacja_ok" : "niezgodnosc";
  } else if (status === "Declined" && signer.didit_status !== "Declined") {
    eventType = "weryfikacja_odrzucona";
  }
  const { data: updated } = await db()
    .from("esign_signers")
    .update(patch)
    .eq("id", signer.id)
    .select("*")
    .maybeSingle();
  if (eventType) {
    const meta = requestClientMeta();
    await logEsignEvent({
      envelopeId: envelope.id,
      signerId: signer.id,
      eventType,
      actorKind: "system",
      ip: meta.ip,
      userAgent: meta.userAgent,
      payload: {
        session_id: signer.didit_session_id,
        status,
        name_on_document: identity?.fullName ?? null,
        expected: signer.full_name,
      },
    });
    if (eventType === "niezgodnosc") {
      await notifyOwner(envelope, `Niezgodność danych podpisującego — ${envelope.public_id}`, [
        `Dane podpisującego „${signer.full_name}” nie zgadzają się z dokumentem tożsamości (${identity?.fullName ?? "—"}).`,
        "Rozstrzygnij w panelu: zaakceptuj różnicę albo popraw dane podpisującego.",
      ]);
    }
  }
  const fresh = (updated as SignerRow) ?? { ...signer, ...patch };
  return {
    signer: publicSigner(
      fresh,
      envelope,
      signers.map((x) => (x.id === fresh.id ? fresh : x)),
    ),
  };
}

// ── reprezentacja ──────────────────────────────────────────────────────────

export async function chooseSigningCapacityImpl(data: z.infer<typeof chooseSigningCapacityInput>) {
  const { signer, envelope, signers } = await ctxByToken(data.token);
  assertSignable(envelope, signer, signers);
  if (signer.capacity_mode !== "wybor")
    throw new Error("Sposób reprezentacji został ustalony przez nadawcę.");
  const options = await investorCapacityOptions(signer);
  if (data.mode === "firma" && !options.company)
    throw new Error("Brak danych spółki w Twoim profilu inwestora.");
  const capacity: SignedCapacity =
    data.mode === "firma"
      ? { mode: "firma", company: options.company }
      : { mode: "osoba", company: null };
  await db().from("esign_signers").update({ signed_capacity: capacity }).eq("id", signer.id);
  const meta = requestClientMeta();
  await logEsignEvent({
    envelopeId: envelope.id,
    signerId: signer.id,
    eventType: "reprezentacja",
    actorKind: "podpisujacy",
    ip: meta.ip,
    userAgent: meta.userAgent,
    payload: {
      mode: capacity.mode,
      company: capacity.company?.name ?? null,
      nip: capacity.company?.nip ?? null,
    },
  });
  return { capacity };
}

// ── kod jednorazowy ────────────────────────────────────────────────────────

export async function requestSigningOtpImpl(data: z.infer<typeof requestSigningOtpInput>) {
  const { signer, envelope, signers } = await ctxByToken(data.token);
  assertSignable(envelope, signer, signers);
  if (signer.status !== "zweryfikowany") throw new Error("Najpierw potwierdź tożsamość.");
  if (signer.otp_sent_at && Date.now() - new Date(signer.otp_sent_at).getTime() < 45_000) {
    throw new Error("Kod został wysłany przed chwilą — odczekaj minutę przed ponowną wysyłką.");
  }
  const { hasTwilioKeys } = await import("@/lib/twilio-api.server");
  const smsPossible =
    Boolean(signer.phone) && hasTwilioKeys() && Boolean(process.env.LOVABLE_API_KEY);
  let channel: "sms" | "email" = data.channel ?? (smsPossible ? "sms" : "email");
  if (channel === "sms" && !smsPossible) channel = "email";

  const code = randomOtp();
  let sent =
    channel === "sms"
      ? await sendOtpSms(signer, envelope, code)
      : await sendOtpEmail(signer, envelope, code);
  if (!sent.ok && channel === "sms") {
    channel = "email";
    sent = await sendOtpEmail(signer, envelope, code);
  }
  if (!sent.ok) throw new Error(`Nie udało się wysłać kodu (${sent.error ?? "błąd wysyłki"}).`);
  const target = channel === "sms" ? maskPhone(signer.phone) : maskEmail(signer.email);
  const now = new Date();
  await db()
    .from("esign_signers")
    .update({
      otp_hash: await hashOtp(signer.id, code),
      otp_channel: channel,
      otp_target: target,
      otp_sent_at: now.toISOString(),
      otp_expires_at: new Date(now.getTime() + OTP_TTL_MS).toISOString(),
      otp_attempts: 0,
    })
    .eq("id", signer.id);
  const meta = requestClientMeta();
  await logEsignEvent({
    envelopeId: envelope.id,
    signerId: signer.id,
    eventType: "kod_wyslany",
    actorKind: "system",
    ip: meta.ip,
    userAgent: meta.userAgent,
    payload: { channel, target },
  });
  return { channel, target, expiresAt: new Date(now.getTime() + OTP_TTL_MS).toISOString() };
}

// ── podpis ─────────────────────────────────────────────────────────────────

export async function confirmSignatureImpl(data: z.infer<typeof confirmSignatureInput>) {
  const { signer, envelope, signers } = await ctxByToken(data.token);
  assertSignable(envelope, signer, signers);
  if (signer.status !== "zweryfikowany") throw new Error("Najpierw potwierdź tożsamość.");

  // Reprezentacja.
  let capacity: SignedCapacity;
  if (signer.capacity_mode === "wybor") {
    if (!signer.signed_capacity)
      throw new Error("Wybierz, czy podpisujesz we własnym imieniu, czy w imieniu spółki.");
    capacity = signer.signed_capacity;
  } else if (signer.capacity_mode === "firma") {
    capacity = { mode: "firma", company: signer.company ?? null };
  } else {
    capacity = { mode: "osoba", company: null };
  }

  // Oświadczenia — wszystkie wymagane, nic nie jest domyślnie zaznaczone.
  const missing = missingStatements(data.statements, capacity);
  if (missing.length)
    throw new Error("Zaznacz wszystkie oświadczenia — bez nich nie można złożyć podpisu.");

  // Kod jednorazowy.
  if (!signer.otp_hash || !signer.otp_expires_at)
    throw new Error("Najpierw poproś o kod jednorazowy.");
  if (new Date(signer.otp_expires_at).getTime() < Date.now())
    throw new Error("Kod wygasł — poproś o nowy.");
  if (signer.otp_attempts >= OTP_MAX_ATTEMPTS)
    throw new Error("Przekroczono liczbę prób — poproś o nowy kod.");
  const meta = requestClientMeta();
  if ((await hashOtp(signer.id, data.code)) !== signer.otp_hash) {
    await db()
      .from("esign_signers")
      .update({ otp_attempts: signer.otp_attempts + 1 })
      .eq("id", signer.id);
    await logEsignEvent({
      envelopeId: envelope.id,
      signerId: signer.id,
      eventType: "kod_bledny",
      actorKind: "podpisujacy",
      ip: meta.ip,
      userAgent: meta.userAgent,
      payload: { attempt: signer.otp_attempts + 1 },
    });
    const left = OTP_MAX_ATTEMPTS - signer.otp_attempts - 1;
    throw new Error(
      left > 0
        ? `Nieprawidłowy kod. Pozostało prób: ${left}.`
        : "Nieprawidłowy kod — poproś o nowy.",
    );
  }

  const signedAt = new Date().toISOString();
  const statements = Object.fromEntries(
    Object.keys(STATEMENTS).map((k) => [k, data.statements[k] === true]),
  );
  const sigHash = await signatureHash({
    envelopeId: envelope.id,
    sourceSha256: envelope.source_sha256,
    signerId: signer.id,
    signedAt,
    identity: signer.identity,
    capacity,
    email: signer.email,
  });
  const { data: upd } = await db()
    .from("esign_signers")
    .update({
      status: "podpisany",
      signed_at: signedAt,
      signature_ip: meta.ip,
      signature_user_agent: meta.userAgent ? String(meta.userAgent).slice(0, 400) : null,
      statements,
      signed_capacity: capacity,
      signature_hash: sigHash,
      otp_hash: null,
    })
    .eq("id", signer.id)
    .eq("status", "zweryfikowany")
    .select("id");
  if (!upd?.length)
    throw new Error("Podpis został już złożony albo stan dokumentu się zmienił — odśwież stronę.");

  await logEsignEvent({
    envelopeId: envelope.id,
    signerId: signer.id,
    eventType: "podpis",
    actorKind: "podpisujacy",
    ip: meta.ip,
    userAgent: meta.userAgent,
    payload: {
      signature_hash: sigHash,
      signed_at: signedAt,
      capacity: capacity.mode,
      company: capacity.company?.name ?? null,
      identity_session: signer.identity?.sessionId ?? null,
      otp_channel: signer.otp_channel,
      statements: Object.keys(statements).filter((k) => statements[k]),
    },
  });

  // Tryb „kolejno”: zaproś następnych.
  const after = await loadSigners(envelope.id);
  if (envelope.signing_mode === "kolejno") {
    for (const next of nextSignersToInvite("kolejno", after)) {
      const token = randomToken();
      await db()
        .from("esign_signers")
        .update({
          token_hash: await hashToken(token),
          invited_at: new Date().toISOString(),
          token_expires_at: envelope.expires_at,
        })
        .eq("id", next.id);
      const res = await sendSignerInvitation(envelope, next, token);
      await logEsignEvent({
        envelopeId: envelope.id,
        signerId: next.id,
        eventType: "zaproszenie",
        actorKind: "system",
        payload: { email: next.email, ok: res.ok, error: res.error ?? null },
      });
    }
  }

  let finalized = false;
  if (after.every((s) => s.status === "podpisany")) {
    try {
      finalized = (await finalizeEnvelope(envelope.id)).finalized;
    } catch (e) {
      console.error("[esign] finalize failed", e);
    }
  }
  const fresh = await loadEnvelope(envelope.id);
  return {
    signed: true,
    signedAt,
    signatureHash: sigHash,
    envelopeStatus: fresh?.status ?? envelope.status,
    finalAvailable: Boolean(fresh?.final_path),
    finalized,
    verifyUrl: verifyUrl(envelope.verify_code),
  };
}

export async function rejectSigningImpl(data: z.infer<typeof rejectSigningInput>) {
  const { signer, envelope, signers } = await ctxByToken(data.token);
  assertSignable(envelope, signer, signers);
  const now = new Date().toISOString();
  const { data: upd } = await db()
    .from("esign_signers")
    .update({ status: "odrzucony", rejected_at: now, rejection_reason: data.reason })
    .eq("id", signer.id)
    .neq("status", "podpisany")
    .select("id");
  if (!upd?.length) throw new Error("Nie można odmówić — podpis został już złożony.");
  await db()
    .from("esign_envelopes")
    .update({ status: "odrzucona" })
    .eq("id", envelope.id)
    .eq("status", "wyslana");
  const meta = requestClientMeta();
  await logEsignEvent({
    envelopeId: envelope.id,
    signerId: signer.id,
    eventType: "odmowa",
    actorKind: "podpisujacy",
    ip: meta.ip,
    userAgent: meta.userAgent,
    payload: { reason: data.reason },
  });
  await notifyOwner(envelope, `Odmowa podpisu — ${envelope.public_id}`, [
    `${signer.full_name} odmówił(a) podpisania dokumentu „${envelope.title}”.`,
    `Powód: ${data.reason}`,
    "Koperta została zamknięta. Po poprawkach utwórz nową kopertę.",
  ]);
  return { ok: true };
}

// ── publiczna weryfikacja ──────────────────────────────────────────────────

export async function getVerificationImpl(data: z.infer<typeof getVerificationInput>) {
  const code = data.code.toUpperCase();
  const { data: env } = await db()
    .from("esign_envelopes")
    .select("*")
    .eq("verify_code", code)
    .maybeSingle();
  if (!env) return { found: false as const };
  const envelope = await expireIfNeeded(env as EnvelopeRow);
  const signers = await loadSigners(envelope.id);
  const events = await loadEvents(envelope.id);
  const chainBreak = await verifyEventChain(events);
  return {
    found: true as const,
    publicId: envelope.public_id,
    title: envelope.title,
    status: envelope.status,
    pageCount: envelope.page_count,
    createdAt: envelope.created_at,
    sentAt: envelope.sent_at,
    completedAt: envelope.completed_at,
    sourceSha256: envelope.source_sha256,
    finalSha256: envelope.final_sha256,
    finalBytes: envelope.final_bytes,
    operatorName: operatorName(),
    chainOk: chainBreak === -1,
    eventsCount: events.length,
    signers: signers.map((s) => ({
      fullName: s.status === "podpisany" ? s.identity?.fullName || s.full_name : s.full_name,
      roleLabel: s.role_label,
      status: s.status,
      signedAt: s.signed_at,
      capacity: s.signed_capacity
        ? capacityLabel(s.identity?.fullName || s.full_name, s.signed_capacity)
        : null,
      identityMethod: s.identity ? `Didit — ${s.identity.checks.join(", ")}` : null,
      signatureHash: s.signature_hash,
    })),
  };
}
