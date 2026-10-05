// Podpis dokumentowy — warstwa serwerowa wspólna dla funkcji właściciela
// (nadawcy) i funkcji publicznych podpisującego: dostęp do bazy (service
// role), dziennik zdarzeń z łańcuchem hashy, pliki w Storage, tożsamość
// z decyzji Didit, finalizacja (stemplowanie + doręczenie) i e-maile.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveAppBaseUrl, requestClientMeta } from "@/lib/access/urls.server";
import { extractDiditPersonalData } from "@/lib/didit.server";
import { COMPANY } from "@/lib/seo/company";
import {
  capacityLabel,
  eventHash,
  eventLabel,
  formatSignedAt,
  maskDocumentNumber,
  maskEmail,
  maskPhone,
  namesMatch,
  sha256Hex,
  STATEMENTS,
  type EnvelopeStatus,
  type IdentitySnapshot,
  type JsonObject,
  type SignedCapacity,
  type SignerStatus,
  type StatementKey,
} from "./esign-core";
import { stampSignedPdf, type StampEvent, type StampSigner } from "./esign-pdf";

export const ESIGN_BUCKET = "podpisy";

/** Kontekst uwierzytelnionej server function (requireSupabaseAuth). */
export interface AuthCtx {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- klient Supabase z RLS (typy Database bez tabel esign_*)
  supabase: any;
  userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- claims JWT
  claims: any;
}
/** Powyżej tego rozmiaru podpisany plik idzie linkiem, nie załącznikiem. */
const ATTACHMENT_LIMIT = 8 * 1024 * 1024;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabele esign_* poza wygenerowanymi typami Database
export const db = () => supabaseAdmin as any;

export interface EnvelopeRow {
  id: string;
  seq: number;
  public_id: string;
  verify_code: string;
  title: string;
  message: string | null;
  status: EnvelopeStatus;
  signing_mode: "rownolegle" | "kolejno";
  created_by: string;
  owner_role: "admin" | "operator" | "inwestor";
  sender_name: string | null;
  sender_email: string | null;
  source_bucket: string;
  source_path: string;
  source_filename: string;
  source_sha256: string;
  source_bytes: number;
  page_count: number;
  final_path: string | null;
  final_sha256: string | null;
  final_bytes: number | null;
  sent_at: string | null;
  completed_at: string | null;
  expires_at: string;
  context: JsonObject;
  created_at: string;
  updated_at: string;
}

export interface SignerRow {
  id: string;
  envelope_id: string;
  order_no: number;
  role_label: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  user_id: string | null;
  investor_id: string | null;
  signer_kind: "zewnetrzny" | "inwestor" | "personel";
  capacity_mode: "osoba" | "firma" | "wybor";
  company: SignedCapacity["company"];
  signed_capacity: SignedCapacity | null;
  token_hash: string;
  token_expires_at: string | null;
  status: SignerStatus;
  didit_session_id: string | null;
  didit_status: string | null;
  identity: IdentitySnapshot | null;
  identity_verified_at: string | null;
  identity_source: string | null;
  identity_mismatch_note: string | null;
  otp_hash: string | null;
  otp_channel: string | null;
  otp_target: string | null;
  otp_sent_at: string | null;
  otp_expires_at: string | null;
  otp_attempts: number;
  statements: Record<string, boolean> | null;
  signed_at: string | null;
  signature_ip: string | null;
  signature_user_agent: string | null;
  signature_hash: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  invited_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventRow {
  id: number;
  envelope_id: string;
  signer_id: string | null;
  event_type: string;
  actor_kind: "system" | "podpisujacy" | "nadawca" | "admin";
  actor_user_id: string | null;
  ip: string | null;
  user_agent: string | null;
  payload: JsonObject;
  prev_hash: string | null;
  hash: string;
  created_at: string;
}

// ── adresy ─────────────────────────────────────────────────────────────────

export function appBase(): string {
  return resolveAppBaseUrl();
}
export function signerUrl(token: string): string {
  return `${appBase()}/podpis/${token}`;
}
export function verifyUrl(code: string): string {
  return `${appBase()}/weryfikacja/${code}`;
}
export function verifyUrlShort(code: string): string {
  return verifyUrl(code).replace(/^https?:\/\//, "");
}
export function operatorName(): string {
  return COMPANY.legalName || COMPANY.name || "Finance You";
}
export { requestClientMeta };

// ── tokeny ─────────────────────────────────────────────────────────────────

export function hashToken(token: string): Promise<string> {
  return sha256Hex(`esign-token:${token}`);
}
export function hashOtp(signerId: string, code: string): Promise<string> {
  return sha256Hex(`esign-otp:${signerId}:${code}`);
}

// ── dziennik ───────────────────────────────────────────────────────────────

export async function logEsignEvent(input: {
  envelopeId: string;
  signerId?: string | null;
  eventType: string;
  actorKind: EventRow["actor_kind"];
  actorUserId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const { data: last } = await db()
    .from("esign_events")
    .select("hash")
    .eq("envelope_id", input.envelopeId)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const prevHash: string | null = last?.hash ?? null;
  const createdAt = new Date().toISOString();
  const payload = input.payload ?? {};
  const hash = await eventHash({
    prevHash,
    envelopeId: input.envelopeId,
    signerId: input.signerId ?? null,
    eventType: input.eventType,
    createdAt,
    payload,
  });
  const { error } = await db()
    .from("esign_events")
    .insert({
      envelope_id: input.envelopeId,
      signer_id: input.signerId ?? null,
      event_type: input.eventType,
      actor_kind: input.actorKind,
      actor_user_id: input.actorUserId ?? null,
      ip: input.ip ?? null,
      user_agent: input.userAgent ? String(input.userAgent).slice(0, 400) : null,
      payload,
      prev_hash: prevHash,
      hash,
      created_at: createdAt,
    });
  if (error) console.error("[esign] event log failed", error.message);
}

// ── odczyt ─────────────────────────────────────────────────────────────────

export async function loadEnvelope(envelopeId: string): Promise<EnvelopeRow | null> {
  const { data } = await db()
    .from("esign_envelopes")
    .select("*")
    .eq("id", envelopeId)
    .maybeSingle();
  return (data as EnvelopeRow) ?? null;
}

export async function loadSigners(envelopeId: string): Promise<SignerRow[]> {
  const { data } = await db()
    .from("esign_signers")
    .select("*")
    .eq("envelope_id", envelopeId)
    .order("order_no")
    .order("created_at");
  return (data ?? []) as SignerRow[];
}

export async function loadEvents(envelopeId: string): Promise<EventRow[]> {
  const { data } = await db()
    .from("esign_events")
    .select("*")
    .eq("envelope_id", envelopeId)
    .order("id");
  return (data ?? []) as EventRow[];
}

export async function loadSignerByToken(
  token: string,
): Promise<{ signer: SignerRow; envelope: EnvelopeRow } | null> {
  if (!token || token.length < 20 || token.length > 128) return null;
  const tokenHash = await hashToken(token);
  const { data: signer } = await db()
    .from("esign_signers")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!signer) return null;
  const envelope = await loadEnvelope(signer.envelope_id);
  if (!envelope) return null;
  return { signer: signer as SignerRow, envelope };
}

/** Leniwe wygaszanie koperty po terminie. */
export async function expireIfNeeded(envelope: EnvelopeRow): Promise<EnvelopeRow> {
  if (envelope.status !== "wyslana" && envelope.status !== "szkic") return envelope;
  if (new Date(envelope.expires_at).getTime() > Date.now()) return envelope;
  await db()
    .from("esign_envelopes")
    .update({ status: "wygasla" })
    .eq("id", envelope.id)
    .eq("status", envelope.status);
  await logEsignEvent({ envelopeId: envelope.id, eventType: "wygasla", actorKind: "system" });
  return { ...envelope, status: "wygasla" };
}

// ── pliki ──────────────────────────────────────────────────────────────────

export async function uploadBytes(
  path: string,
  bytes: Uint8Array,
  contentType = "application/pdf",
): Promise<void> {
  const { uploadEnsuringBucket } = await import("@/lib/media-storage.server");
  await uploadEnsuringBucket(ESIGN_BUCKET, path, bytes, contentType, { upsert: true });
}

export async function downloadBytes(path: string, bucket = ESIGN_BUCKET): Promise<Uint8Array> {
  const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
  if (error || !data)
    throw new Error(`Nie udało się pobrać pliku (${error?.message ?? "brak danych"})`);
  return new Uint8Array(await data.arrayBuffer());
}

export async function signedFileUrl(
  path: string,
  ttlSec = 600,
  bucket = ESIGN_BUCKET,
): Promise<string> {
  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, ttlSec);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "Brak podpisanego adresu");
  return data.signedUrl;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^;]+;base64,/, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── tożsamość z Didit ──────────────────────────────────────────────────────

const CHECK_LABELS: Array<[RegExp, string]> = [
  [/^(id_verification|kyc|document)/, "dokument tożsamości"],
  [/liveness/, "test żywotności"],
  [/face_match|face_search/, "porównanie twarzy"],
  [/nfc/, "odczyt NFC"],
  [/ip_analysis/, "analiza IP"],
  [/aml/, "screening AML"],
  [/phone/, "weryfikacja telefonu"],
  [/email/, "weryfikacja e-mail"],
  [/database/, "weryfikacja w bazach"],
];

function checksFromDecision(decision: unknown): string[] {
  const d = (decision ?? {}) as Record<string, unknown>;
  const found = new Set<string>();
  for (const key of Object.keys(d)) {
    const v = d[key];
    if (v == null || typeof v !== "object") continue;
    for (const [re, label] of CHECK_LABELS) {
      if (re.test(key)) found.add(label);
    }
  }
  if (found.size === 0) found.add("dokument tożsamości");
  return [...found];
}

function documentTypeLabel(t: string | null): string | null {
  if (!t) return null;
  const k = t.toLowerCase();
  if (k.includes("identity") || k.includes("id_card") || k === "id") return "Dowód osobisty";
  if (k.includes("passport")) return "Paszport";
  if (k.includes("residence")) return "Karta pobytu";
  if (k.includes("driv")) return "Prawo jazdy";
  return t;
}

export function identityFromDecision(input: {
  sessionId: string;
  decision: unknown;
  source: IdentitySnapshot["source"];
  expectedName: string;
  decidedAt: string | null;
}): IdentitySnapshot {
  const p = extractDiditPersonalData(input.decision);
  const fullName = p.fullName ?? [p.firstName, p.lastName].filter(Boolean).join(" ") ?? null;
  return {
    provider: "didit",
    sessionId: input.sessionId,
    source: input.source,
    fullName: fullName || null,
    firstName: p.firstName,
    lastName: p.lastName,
    documentType: documentTypeLabel(p.documentType),
    documentNumberMasked: maskDocumentNumber(p.documentNumber),
    dateOfBirth: p.dateOfBirth,
    issuingCountry: p.issuingCountry,
    checks: checksFromDecision(input.decision),
    decidedAt: input.decidedAt,
    nameMatch: namesMatch(input.expectedName, fullName),
  };
}

/** Zatwierdzona weryfikacja Didit inwestora z pipeline'u (vendor_data investor:<uid>). */
export async function approvedPipelineVerification(userId: string): Promise<{
  session_id: string;
  decision: unknown;
  decided_at: string | null;
} | null> {
  const { data } = await db()
    .from("didit_verifications")
    .select("session_id, decision, decided_at")
    .eq("vendor_data", `investor:${userId}`)
    .eq("status", "Approved")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

// ── e-maile ────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

function htmlMail(
  title: string,
  paragraphs: string[],
  cta?: { label: string; url: string },
  footer?: string,
): string {
  return [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1f2330">`,
    `<h2 style="margin:0 0 12px;font-size:20px;color:#1b2a5c">${esc(title)}</h2>`,
    ...paragraphs.map((p) => `<p style="margin:0 0 12px">${p}</p>`),
    cta
      ? `<p style="margin:20px 0"><a href="${esc(cta.url)}" style="display:inline-block;background:#1b2a5c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">${esc(cta.label)}</a></p><p style="font-size:12px;color:#6b7280;margin:0 0 12px">Jeśli przycisk nie działa, skopiuj adres: ${esc(cta.url)}</p>`
      : "",
    footer ? `<p style="font-size:12px;color:#6b7280;margin-top:18px">${footer}</p>` : "",
    `</div>`,
  ].join("");
}

async function send(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments?: Array<{ filename: string; content: string; contentType?: string }>;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { sendResendEmail } = await import("@/lib/resend-send.server");
  return sendResendEmail({ ...opts, category: "transactional", noBranding: false });
}

export async function sendSignerInvitation(
  envelope: EnvelopeRow,
  signer: SignerRow,
  token: string,
  opts: { resend?: boolean } = {},
): Promise<{ ok: boolean; error?: string }> {
  const url = signerUrl(token);
  const sender = envelope.sender_name || envelope.sender_email || operatorName();
  const expires = formatSignedAt(envelope.expires_at);
  const subject = `${opts.resend ? "Przypomnienie: " : ""}Dokument do podpisu — ${envelope.title}`;
  const intro = `${sender} prosi o podpisanie dokumentu „${envelope.title}” (identyfikator ${envelope.public_id}) w formie dokumentowej, elektronicznie.`;
  const steps =
    "Jak to działa: (1) otwórz link i zapoznaj się z dokumentem, (2) potwierdź tożsamość zdjęciem dokumentu i twarzy (Didit, ok. 2 minuty), (3) wpisz kod jednorazowy i kliknij „Podpisuję”. Nie musisz zakładać konta.";
  const text = [
    "Dzień dobry,",
    "",
    intro,
    envelope.message ? `\nWiadomość od nadawcy: ${envelope.message}\n` : "",
    steps,
    "",
    `Link do podpisu (ważny do ${expires}): ${url}`,
    "",
    "Link jest osobisty — nie przekazuj go dalej. Po złożeniu wszystkich podpisów otrzymasz podpisany dokument w załączniku.",
    "",
    operatorName(),
  ].join("\n");
  const html = htmlMail(
    "Dokument do podpisu",
    [
      esc(intro),
      envelope.message ? `<em>Wiadomość od nadawcy:</em> ${esc(envelope.message)}` : "",
      esc(steps),
    ].filter(Boolean),
    { label: "Otwórz i podpisz dokument", url },
    `Link jest osobisty i ważny do ${esc(expires)}. Nie przekazuj go dalej. Po złożeniu wszystkich podpisów otrzymasz podpisany dokument (PDF) w załączniku.`,
  );
  const res = await send({ to: signer.email, subject, text, html });
  return { ok: res.ok, error: res.error };
}

export async function sendOtpEmail(
  signer: SignerRow,
  envelope: EnvelopeRow,
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  const text = `Twój kod do podpisania dokumentu „${envelope.title}” (${envelope.public_id}): ${code}\n\nKod jest ważny 10 minut. Jeśli to nie Ty podpisujesz dokument, zignoruj tę wiadomość.`;
  const html = htmlMail("Kod do podpisu", [
    `Kod jednorazowy do podpisania dokumentu „${esc(envelope.title)}” (${esc(envelope.public_id)}):`,
    `<span style="font-size:28px;letter-spacing:6px;font-weight:bold;color:#1b2a5c">${esc(code)}</span>`,
    "Kod jest ważny 10 minut. Jeśli to nie Ty podpisujesz dokument, zignoruj tę wiadomość.",
  ]);
  const res = await send({
    to: signer.email,
    subject: `Kod do podpisu: ${code} — ${envelope.public_id}`,
    text,
    html,
  });
  return { ok: res.ok, error: res.error };
}

export async function sendOtpSms(
  signer: SignerRow,
  envelope: EnvelopeRow,
  code: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!signer.phone) return { ok: false, error: "brak numeru telefonu" };
  const { sendSmsInternal } = await import("@/lib/voicebot.functions");
  const res = await sendSmsInternal({
    phone: signer.phone,
    body: `Finance You: kod do podpisu dokumentu ${envelope.public_id}: ${code}. Wazny 10 min. Nie udostepniaj nikomu.`,
    source: "esign_otp",
    category: "critical",
    metadata: { envelope_id: envelope.id, signer_id: signer.id },
  });
  return { ok: res.ok, error: res.error };
}

export async function notifyOwner(
  envelope: EnvelopeRow,
  subject: string,
  lines: string[],
): Promise<void> {
  const to = envelope.sender_email;
  if (!to) return;
  const url = `${appBase()}/${envelope.owner_role === "inwestor" ? "inwestor" : envelope.owner_role === "operator" ? "operator" : "admin"}/podpisy?koperta=${envelope.id}`;
  try {
    await send({
      to,
      subject,
      text: [...lines, "", `Szczegóły: ${url}`, "", operatorName()].join("\n"),
      html: htmlMail(subject, lines.map(esc), { label: "Otwórz w panelu", url }),
    });
  } catch (e) {
    console.error("[esign] owner notification failed", e);
  }
}

// ── finalizacja: stemplowanie + doręczenie ─────────────────────────────────

function signerToStamp(s: SignerRow): StampSigner {
  const statements = Object.entries(s.statements ?? {})
    .filter(([, v]) => v === true)
    .map(([k]) => STATEMENTS[k as StatementKey] ?? k);
  return {
    fullName: s.identity?.fullName || s.full_name,
    roleLabel: s.role_label,
    email: s.email,
    phone: s.phone,
    capacity: s.signed_capacity ?? { mode: "osoba", company: null },
    identity: s.identity,
    otpChannel: s.otp_channel,
    otpTarget: s.otp_target,
    signedAt: s.signed_at ?? new Date().toISOString(),
    ip: s.signature_ip,
    userAgent: s.signature_user_agent,
    statements,
    signatureHash: s.signature_hash ?? "",
  };
}

function eventToStamp(e: EventRow, signers: SignerRow[]): StampEvent {
  const s = e.signer_id ? signers.find((x) => x.id === e.signer_id) : null;
  const actor =
    e.actor_kind === "system"
      ? "system"
      : e.actor_kind === "podpisujacy"
        ? s
          ? `${s.identity?.fullName || s.full_name} <${s.email}>`
          : "podpisujący"
        : e.actor_kind === "nadawca"
          ? "nadawca"
          : "administrator";
  return { at: e.created_at, label: eventLabel(e.event_type), actor, ip: e.ip };
}

/**
 * Po ostatnim podpisie: buduje plik końcowy (znaczniki + Karta podpisów),
 * zapisuje go, zamyka kopertę i doręcza wszystkim stronom e-mailem.
 * Idempotentna — drugie wywołanie nic nie robi, gdy koperta jest zakończona.
 */
export async function finalizeEnvelope(envelopeId: string): Promise<{ finalized: boolean }> {
  const envelope = await loadEnvelope(envelopeId);
  if (!envelope) return { finalized: false };
  if (envelope.status === "zakonczona" && envelope.final_path) return { finalized: false };
  const signers = await loadSigners(envelopeId);
  if (signers.length === 0 || !signers.every((s) => s.status === "podpisany"))
    return { finalized: false };

  // Blokada optymistyczna: tylko jedno wywołanie przestawi status.
  const completedAt = new Date().toISOString();
  const { data: locked } = await db()
    .from("esign_envelopes")
    .update({ status: "zakonczona", completed_at: completedAt })
    .eq("id", envelopeId)
    .eq("status", "wyslana")
    .select("id");
  if (!locked?.length) return { finalized: false };

  await logEsignEvent({ envelopeId, eventType: "zakonczona", actorKind: "system" });
  const events = await loadEvents(envelopeId);

  const sourceBytes = await downloadBytes(envelope.source_path, envelope.source_bucket);
  const stamped = await stampSignedPdf({
    sourceBytes,
    publicId: envelope.public_id,
    title: envelope.title,
    sourceFilename: envelope.source_filename,
    sourceSha256: envelope.source_sha256,
    verifyUrl: verifyUrl(envelope.verify_code),
    verifyUrlShort: verifyUrlShort(envelope.verify_code),
    sender: { name: envelope.sender_name, email: envelope.sender_email },
    operatorName: operatorName(),
    createdAt: envelope.created_at,
    sentAt: envelope.sent_at,
    completedAt,
    signingMode: envelope.signing_mode,
    signers: signers.map(signerToStamp),
    events: events.map((e) => eventToStamp(e, signers)),
  });

  const finalPath = `koperty/${envelope.id}/${envelope.public_id}-podpisany.pdf`;
  const finalSha = await sha256Hex(stamped.bytes);
  await uploadBytes(finalPath, stamped.bytes);
  const { error } = await db()
    .from("esign_envelopes")
    .update({
      final_path: finalPath,
      final_sha256: finalSha,
      final_bytes: stamped.bytes.byteLength,
    })
    .eq("id", envelopeId);
  if (error) throw new Error(error.message);

  // Doręczenie na trwałym nośniku: każdy podpisujący + nadawca.
  const filename = `${envelope.public_id}-podpisany.pdf`;
  const attach = stamped.bytes.byteLength <= ATTACHMENT_LIMIT;
  const attachments = attach
    ? [{ filename, content: bytesToBase64(stamped.bytes), contentType: "application/pdf" }]
    : undefined;
  const vUrl = verifyUrl(envelope.verify_code);
  const recipients = new Map<string, string>();
  for (const s of signers)
    recipients.set(s.email.toLowerCase(), s.identity?.fullName || s.full_name);
  if (envelope.sender_email && !recipients.has(envelope.sender_email.toLowerCase())) {
    recipients.set(envelope.sender_email.toLowerCase(), envelope.sender_name ?? "");
  }
  const who = signers.map(
    (s) =>
      `• ${capacityLabel(s.identity?.fullName || s.full_name, s.signed_capacity)} — ${formatSignedAt(s.signed_at)}`,
  );
  for (const [email] of recipients) {
    const lines = [
      `Dokument „${envelope.title}” (${envelope.public_id}) został podpisany przez wszystkie strony w formie dokumentowej.`,
      "Podpisali:",
      ...who,
      `SHA-256 podpisanego pliku: ${finalSha}`,
      `Weryfikacja autentyczności: ${vUrl}`,
      attach
        ? "Podpisany dokument (ze znacznikami na każdej stronie i Kartą podpisów) jest w załączniku — zachowaj go."
        : "Podpisany dokument pobierzesz ze strony weryfikacji (link powyżej) — plik był zbyt duży na załącznik.",
    ];
    try {
      const res = await send({
        to: email,
        subject: `Podpisany dokument: ${envelope.title} (${envelope.public_id})`,
        text: ["Dzień dobry,", "", ...lines, "", operatorName()].join("\n"),
        html: htmlMail("Dokument podpisany", lines.map(esc), {
          label: "Strona weryfikacji",
          url: vUrl,
        }),
        attachments,
      });
      await logEsignEvent({
        envelopeId,
        eventType: "doreczenie",
        actorKind: "system",
        payload: {
          email: maskEmail(email),
          ok: res.ok,
          message_id: res.id ?? null,
          attachment: attach,
        },
      });
    } catch (e) {
      console.error("[esign] delivery failed", email, e);
    }
  }
  return { finalized: true };
}

/** Maskowany opis celu OTP do Karty podpisów. */
export function otpTargetMasked(channel: string, signer: SignerRow): string {
  return channel === "sms" ? maskPhone(signer.phone) : maskEmail(signer.email);
}
