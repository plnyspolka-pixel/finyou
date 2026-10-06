// Podpis dokumentowy — implementacja funkcji NADAWCY (tylko serwer) (administrator / operator /
// inwestor): tworzenie koperty z plikiem PDF i podpisującymi, wysyłka
// zaproszeń, lista i szczegóły, ponowna wysyłka linku, anulowanie,
// rozstrzyganie niezgodności danych z dokumentem tożsamości, pliki.
//
// Wszystkie operacje idą przez service role z jawną kontrolą własności:
// inwestor widzi tylko swoje koperty (i te, w których sam podpisuje),
// personel wewnętrzny — koperty personelu; administrator — wszystkie.
import type { z } from "zod";
import {
  searchSignerCandidatesInput,
  createEnvelopeInput,
  searchSignerClientsInput,
  listClientDocumentsInput,
  sendEnvelopeInput,
  resendSignerLinkInput,
  copySignerLinkInput,
  openMySigningLinkInput,
  listMyEnvelopesInput,
  getEnvelopeDetailsInput,
  getEnvelopeFileUrlInput,
  cancelEnvelopeInput,
  resolveIdentityMismatchInput,
  CompanySchema,
  SignerInput,
  CreateInput,
} from "./esign-schemas";
import {
  deriveEnvelopeStatus,
  namesMatch,
  nextSignersToInvite,
  randomToken,
  randomVerifyCode,
  sha256Hex,
  TOKEN_TTL_DAYS,
  type SignedCapacity,
  type SignerCompany,
} from "./esign-core";
import {
  appBase,
  db,
  expireIfNeeded,
  hashToken,
  loadEnvelope,
  loadEvents,
  loadSigners,
  logEsignEvent,
  requestClientMeta,
  sendSignerInvitation,
  signedFileUrl,
  signerUrl,
  uploadBytes,
  base64ToBytes,
  downloadBytes,
  verifyUrl,
  type AuthCtx,
  type EnvelopeRow,
  type SignerRow,
} from "./esign.server";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";

type OwnerRole = "admin" | "operator" | "inwestor";

const MAX_PDF_BYTES = 15 * 1024 * 1024;

async function rolesOf(supabase: any, userId: string): Promise<string[]> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).map((r: { role: string }) => r.role);
}

async function resolveOwnerRole(supabase: any, userId: string): Promise<OwnerRole> {
  const roles = await rolesOf(supabase, userId);
  if (roles.includes("administrator")) return "admin";
  if (roles.includes("operator")) return "operator";
  if (roles.includes("inwestor")) return "inwestor";
  throw new Error(
    "Brak uprawnień do modułu podpisu (wymagana rola administrator, operator albo inwestor).",
  );
}

async function investorByUser(userId: string) {
  const { data } = await db()
    .from("investors")
    .select(
      "id, user_id, first_name, last_name, company_name, email, phone, nip, krs, regon, legal_form, entity_variant, street, address, city, postal_code, representative_first_name, representative_last_name, representative_role",
    )
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

/** Spółka z profilu inwestora (JDG albo osoba prawna) — do podpisu „w imieniu”. */
export function investorCompany(inv: any): SignerCompany | null {
  if (!inv) return null;
  const isCompany = inv.entity_variant === "jdg" || inv.entity_variant === "osoba_prawna";
  if (!isCompany || !inv.company_name) return null;
  const address = [inv.street ?? inv.address, [inv.postal_code, inv.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return {
    name: inv.company_name,
    nip: inv.nip ?? null,
    krs: inv.krs ?? null,
    regon: inv.regon ?? null,
    legalForm:
      inv.legal_form ??
      (inv.entity_variant === "jdg" ? "jednoosobowa działalność gospodarcza" : null),
    address: address || null,
    role: inv.representative_role ?? (inv.entity_variant === "jdg" ? "właściciel" : null),
  };
}

function investorPersonName(inv: any): string {
  const rep = [inv?.representative_first_name, inv?.representative_last_name]
    .filter(Boolean)
    .join(" ");
  const own = [inv?.first_name, inv?.last_name].filter(Boolean).join(" ");
  return own || rep || "";
}

async function senderIdentity(role: OwnerRole, userId: string, claims: any) {
  const claimEmail = typeof claims?.email === "string" ? claims.email : null;
  if (role === "inwestor") {
    const inv = await investorByUser(userId);
    const person = investorPersonName(inv);
    const name = inv?.company_name
      ? `${inv.company_name}${person ? ` (${person})` : ""}`
      : person || null;
    return { name, email: inv?.email ?? claimEmail };
  }
  const { data: prof } = await db()
    .from("profiles")
    .select("first_name, last_name, email")
    .eq("user_id", userId)
    .maybeSingle();
  const person = [prof?.first_name, prof?.last_name].filter(Boolean).join(" ");
  return {
    name: person ? `${person} (Finance You)` : "Zespół Finance You",
    email: prof?.email ?? claimEmail,
  };
}

/** Czy użytkownik może zarządzać kopertą (nadawca; personel — koperty personelu; admin — wszystkie). */
function canManage(env: EnvelopeRow, role: OwnerRole, userId: string): boolean {
  if (env.created_by === userId) return true;
  if (role === "admin") return true;
  if (role === "operator") return env.owner_role !== "inwestor";
  return false;
}

async function requireManaged(supabase: any, userId: string, envelopeId: string) {
  const role = await resolveOwnerRole(supabase, userId);
  const env = await loadEnvelope(envelopeId);
  if (!env || !canManage(env, role, userId))
    throw new Error("Nie znaleziono koperty albo brak uprawnień.");
  return { role, env };
}

/** Spółka / JDG klienta pożyczkowego — do podpisu „w imieniu”. */
export function clientCompany(c: any): SignerCompany | null {
  if (!c) return null;
  if (!c.company_name && !c.nip) return null;
  const address = [c.street, [c.postal_code, c.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  return {
    name: c.company_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
    nip: c.nip ?? null,
    krs: c.krs ?? null,
    regon: c.regon ?? null,
    legalForm: c.krs ? null : "jednoosobowa działalność gospodarcza",
    address: address || null,
    role: c.krs ? null : "właściciel",
  };
}

async function investorIdOf(userId: string): Promise<string | null> {
  const { data } = await db().from("investors").select("id").eq("user_id", userId).maybeSingle();
  return data?.id ?? null;
}

/**
 * Klienci, których dana rola może wskazać jako podpisujących: personel — wszyscy
 * (null = bez ograniczeń); inwestor — klienci z wniosków, na które złożył ofertę,
 * oraz klienci z jego wcześniejszych kopert.
 */
async function allowedClientIds(role: OwnerRole, userId: string): Promise<string[] | null> {
  if (role !== "inwestor") return null;
  const ids = new Set<string>();
  const invId = await investorIdOf(userId);
  if (invId) {
    const { data: offers } = await db()
      .from("investor_offers")
      .select("loan_application_id")
      .eq("investor_id", invId)
      .limit(500);
    const appIds = [
      ...new Set((offers ?? []).map((o: any) => o.loan_application_id).filter(Boolean)),
    ];
    if (appIds.length) {
      const { data: apps } = await db()
        .from("loan_applications")
        .select("client_id")
        .in("id", appIds);
      for (const a of apps ?? []) if (a.client_id) ids.add(a.client_id);
    }
  }
  const { data: envs } = await db()
    .from("esign_envelopes")
    .select("client_id")
    .eq("created_by", userId)
    .not("client_id", "is", null)
    .limit(500);
  for (const e of envs ?? []) if (e.client_id) ids.add(e.client_id);
  return [...ids];
}

const CLIENT_COLUMNS =
  "id, user_id, first_name, last_name, email, phone, company_name, nip, krs, regon, street, city, postal_code";

/** Identyfikatory klientów (clients) powiązanych z kontem użytkownika. */
async function myClientIds(userId: string): Promise<string[]> {
  const { data } = await db().from("clients").select("id").eq("user_id", userId);
  return (data ?? []).map((c: any) => c.id as string);
}

/** Czy wiersz podpisującego należy do użytkownika (konto, klient albo e-mail konta). */
function isMySigner(
  s: SignerRow,
  userId: string,
  myClients: string[],
  email: string | null,
): boolean {
  if (s.user_id === userId) return true;
  if (s.client_id && myClients.includes(s.client_id)) return true;
  if (!s.user_id && email && s.email.toLowerCase() === email.toLowerCase()) return true;
  return false;
}

function claimsEmail(context: AuthCtx): string | null {
  const e = context.claims?.email;
  return typeof e === "string" && e.includes("@") ? e.toLowerCase() : null;
}

function publicSignerRow(s: SignerRow) {
  // Bez hashy tokenu/kodu — tylko to, co nadawca ma prawo widzieć.
  const { token_hash: _t, otp_hash: _o, ...rest } = s;
  return rest;
}

// ── kontekst nadawcy (prefill kreatora) ────────────────────────────────────

export async function getEsignOwnerContextImpl(context: AuthCtx) {
  const role = await resolveOwnerRole(context.supabase as any, context.userId);
  const sender = await senderIdentity(role, context.userId, context.claims);
  const inv = role === "inwestor" ? await investorByUser(context.userId) : null;
  const { hasDiditConfig } = await import("@/lib/didit.server");
  return {
    role,
    sender,
    me: inv
      ? {
          fullName: investorPersonName(inv),
          email: inv.email as string | null,
          phone: inv.phone as string | null,
          company: investorCompany(inv),
        }
      : null,
    diditConfigured: hasDiditConfig(),
    appBase: appBase(),
  };
}

/** Wyszukiwarka inwestorów z systemu (personel) — podpisujący „z konta”. */
export async function searchSignerCandidatesImpl(
  data: z.infer<typeof searchSignerCandidatesInput>,
  context: AuthCtx,
) {
  const role = await resolveOwnerRole(context.supabase as any, context.userId);
  if (role === "inwestor") throw new Error("Wyszukiwanie kont jest dostępne dla personelu.");
  const q = data.q.replace(/[%,()]/g, " ").trim();
  const { data: rows } = await db()
    .from("investors")
    .select(
      "id, user_id, first_name, last_name, company_name, email, phone, nip, krs, regon, legal_form, entity_variant, street, address, city, postal_code, representative_first_name, representative_last_name, representative_role",
    )
    .not("user_id", "is", null)
    .or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,company_name.ilike.%${q}%,email.ilike.%${q}%,nip.ilike.%${q}%`,
    )
    .limit(10);
  return {
    candidates: (rows ?? []).map((inv: any) => ({
      userId: inv.user_id as string,
      investorId: inv.id as string,
      fullName: investorPersonName(inv),
      email: inv.email as string | null,
      phone: inv.phone as string | null,
      company: investorCompany(inv),
    })),
  };
}

// ── tworzenie koperty ──────────────────────────────────────────────────────

/** Wyszukiwarka klientów pożyczkowych (personel: wszyscy; inwestor: swoi). */
export async function searchSignerClientsImpl(
  data: z.infer<typeof searchSignerClientsInput>,
  context: AuthCtx,
) {
  const role = await resolveOwnerRole(context.supabase as any, context.userId);
  const allowed = await allowedClientIds(role, context.userId);
  let q = db().from("clients").select(CLIENT_COLUMNS).limit(10);
  if (data.clientId) {
    q = q.eq("id", data.clientId);
  } else {
    const term = (data.q ?? "").replace(/[%,()]/g, " ").trim();
    if (term.length < 2) return { candidates: [] };
    q = q.or(
      `first_name.ilike.%${term}%,last_name.ilike.%${term}%,company_name.ilike.%${term}%,email.ilike.%${term}%,nip.ilike.%${term}%,phone.ilike.%${term}%`,
    );
  }
  if (allowed) {
    if (allowed.length === 0) return { candidates: [] };
    q = q.in("id", allowed);
  }
  const { data: rows } = await q;
  const ids = (rows ?? []).map((c: any) => c.id);
  const { data: apps } = ids.length
    ? await db()
        .from("loan_applications")
        .select("id, client_id, loan_amount, status, created_at")
        .in("client_id", ids)
        .order("created_at", { ascending: false })
        .limit(60)
    : { data: [] };
  return {
    candidates: (rows ?? []).map((c: any) => ({
      clientId: c.id as string,
      userId: (c.user_id as string | null) ?? null,
      fullName: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
      email: (c.email as string | null) ?? null,
      phone: (c.phone as string | null) ?? null,
      company: clientCompany(c),
      applications: (apps ?? [])
        .filter((a: any) => a.client_id === c.id)
        .map((a: any) => ({
          id: a.id as string,
          loanAmount: (a.loan_amount as number | null) ?? null,
          status: a.status as string,
          createdAt: a.created_at as string,
        })),
    })),
  };
}

/**
 * Wygenerowane umowy w PDF (kreator / agent) dla klienta albo wniosku. Widoczność
 * rozstrzyga RLS tabeli generated_documents (personel: wszystkie; inwestor:
 * własne) — zapytanie idzie klientem użytkownika, nie service role.
 */
export async function listClientDocumentsImpl(
  data: z.infer<typeof listClientDocumentsInput>,
  context: AuthCtx,
) {
  await resolveOwnerRole(context.supabase as any, context.userId);
  let appIds: string[] = [];
  if (data.loanApplicationId) appIds = [data.loanApplicationId];
  else if (data.clientId) {
    const { data: apps } = await db()
      .from("loan_applications")
      .select("id")
      .eq("client_id", data.clientId);
    appIds = (apps ?? []).map((a: any) => a.id);
  }
  if (appIds.length === 0) return { documents: [] };
  const { data: rows } = await context.supabase
    .from("generated_documents")
    .select("id, template_name, template_slug, loan_application_id, pdf_path, created_at")
    .in("loan_application_id", appIds)
    .not("pdf_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(30);
  return {
    documents: ((rows ?? []) as any[])
      .filter((r) => r.pdf_path)
      .map((r) => ({
        id: r.id as string,
        templateName: (r.template_name as string | null) ?? "Dokument",
        templateSlug: (r.template_slug as string | null) ?? null,
        loanApplicationId: (r.loan_application_id as string | null) ?? null,
        createdAt: r.created_at as string,
      })),
  };
}

/**
 * Źródło koperty z wygenerowanej umowy — WYŁĄCZNIE gotowy plik PDF
 * (generated_documents.pdf_path). Dokumentów DOCX nie podpisujemy: podpis
 * dokumentowy obejmuje dokładnie ten plik PDF, który zobaczy podpisujący.
 * Dostęp do wiersza sprawdza RLS (klient użytkownika).
 */
async function sourceFromGeneratedDocument(
  generatedDocumentId: string,
  context: AuthCtx,
): Promise<{
  bytes: Uint8Array;
  fileName: string;
  title: string | null;
  loanApplicationId: string | null;
}> {
  const { data: doc } = await context.supabase
    .from("generated_documents")
    .select("id, template_name, pdf_path, loan_application_id")
    .eq("id", generatedDocumentId)
    .maybeSingle();
  if (!doc) throw new Error("Nie znaleziono wygenerowanego dokumentu albo brak do niego dostępu.");
  if (!doc.pdf_path) {
    throw new Error(
      "Ten dokument nie ma wersji PDF. Podpisujemy wyłącznie pliki PDF — zapisz umowę jako PDF i wgraj plik.",
    );
  }
  return {
    bytes: await downloadBytes(doc.pdf_path, CLIENT_FILES_BUCKET),
    fileName: doc.pdf_path.split("/").pop() ?? "dokument.pdf",
    title: doc.template_name ?? null,
    loanApplicationId: doc.loan_application_id ?? null,
  };
}

/**
 * Dokumenty zalogowanego KLIENTA pożyczkowego: do podpisu i podpisane.
 * Dopasowanie po koncie, po clients.user_id (client_id) albo po adresie
 * e-mail konta — taki wiersz jest przejmowany (user_id = konto), dzięki czemu
 * działa „Otwórz i podpisz” z panelu bez linku z e-maila.
 */
export async function listMyClientDocumentsImpl(context: AuthCtx) {
  const { userId } = context;
  const myClients = await myClientIds(userId);
  const email = claimsEmail(context);
  const cols =
    "id, envelope_id, status, signed_at, role_label, user_id, client_id, email, signer_kind, created_at";
  const found = new Map<string, any>();
  const { data: byUser } = await db()
    .from("esign_signers")
    .select(cols)
    .eq("user_id", userId)
    .limit(100);
  for (const r of byUser ?? []) found.set(r.id, r);
  if (myClients.length) {
    const { data: byClient } = await db()
      .from("esign_signers")
      .select(cols)
      .in("client_id", myClients)
      .limit(100);
    for (const r of byClient ?? []) found.set(r.id, r);
  }
  if (email) {
    const { data: byEmail } = await db()
      .from("esign_signers")
      .select(cols)
      .is("user_id", null)
      .eq("email", email)
      .limit(100);
    for (const r of byEmail ?? []) found.set(r.id, r);
  }
  // Przejęcie wierszy bez konta.
  const toClaim = [...found.values()].filter((r) => !r.user_id).map((r) => r.id);
  if (toClaim.length) {
    await db().from("esign_signers").update({ user_id: userId }).in("id", toClaim);
  }
  const envIds = [...new Set([...found.values()].map((r) => r.envelope_id))];
  const { data: envs } = envIds.length
    ? await db()
        .from("esign_envelopes")
        .select(
          "id, public_id, title, status, sender_name, sender_email, expires_at, completed_at, created_at, final_path, final_sha256, verify_code, page_count",
        )
        .in("id", envIds)
    : { data: [] };
  const items = [...found.values()]
    .map((signer) => {
      const e = (envs ?? []).find((x: any) => x.id === signer.envelope_id);
      if (!e) return null;
      return {
        signerId: signer.id as string,
        signerStatus: signer.status as string,
        signedAt: (signer.signed_at as string | null) ?? null,
        roleLabel: (signer.role_label as string | null) ?? null,
        envelope: {
          id: e.id as string,
          publicId: e.public_id as string,
          title: e.title as string,
          status: e.status as string,
          senderName: (e.sender_name as string | null) ?? null,
          expiresAt: e.expires_at as string,
          completedAt: (e.completed_at as string | null) ?? null,
          createdAt: e.created_at as string,
          pageCount: e.page_count as number,
          finalAvailable: Boolean(e.final_path),
          finalSha256: (e.final_sha256 as string | null) ?? null,
          verifyUrl: verifyUrl(e.verify_code as string),
        },
      };
    })
    .filter(Boolean) as Array<{
    signerId: string;
    signerStatus: string;
    signedAt: string | null;
    roleLabel: string | null;
    envelope: {
      id: string;
      publicId: string;
      title: string;
      status: string;
      senderName: string | null;
      expiresAt: string;
      completedAt: string | null;
      createdAt: string;
      pageCount: number;
      finalAvailable: boolean;
      finalSha256: string | null;
      verifyUrl: string;
    };
  }>;
  items.sort((a, b) => (a.envelope.createdAt < b.envelope.createdAt ? 1 : -1));
  return {
    toSign: items.filter(
      (i) =>
        i.envelope.status === "wyslana" && !["podpisany", "odrzucony"].includes(i.signerStatus),
    ),
    signed: items.filter((i) => i.signerStatus === "podpisany"),
    other: items.filter(
      (i) =>
        !(
          i.envelope.status === "wyslana" && !["podpisany", "odrzucony"].includes(i.signerStatus)
        ) && i.signerStatus !== "podpisany",
    ),
  };
}

async function uniqueVerifyCode(): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = randomVerifyCode();
    const { data } = await db()
      .from("esign_envelopes")
      .select("id")
      .eq("verify_code", code)
      .maybeSingle();
    if (!data) return code;
  }
  throw new Error("Nie udało się wygenerować kodu weryfikacji.");
}

/** Wysyłka zaproszeń (tryb równoległy — wszyscy; kolejno — pierwszy w kolejce). */
async function inviteDue(env: EnvelopeRow, tokens: Map<string, string>): Promise<string[]> {
  const signers = await loadSigners(env.id);
  const due = nextSignersToInvite(env.signing_mode, signers);
  const sentTo: string[] = [];
  for (const s of due) {
    let token = tokens.get(s.id);
    if (!token) {
      token = randomToken();
      await db()
        .from("esign_signers")
        .update({ token_hash: await hashToken(token) })
        .eq("id", s.id);
    }
    const res = await sendSignerInvitation(env, s, token);
    await db()
      .from("esign_signers")
      .update({ invited_at: new Date().toISOString(), token_expires_at: env.expires_at })
      .eq("id", s.id);
    await logEsignEvent({
      envelopeId: env.id,
      signerId: s.id,
      eventType: "zaproszenie",
      actorKind: "system",
      payload: { email: s.email, ok: res.ok, error: res.error ?? null },
    });
    if (res.ok) sentTo.push(s.email);
  }
  return sentTo;
}

export async function createEnvelopeImpl(
  data: z.infer<typeof createEnvelopeInput>,
  context: AuthCtx,
) {
  const { userId } = context;
  const role = await resolveOwnerRole(context.supabase as any, userId);
  const sender = await senderIdentity(role, userId, context.claims);

  // Źródło: wgrany PDF albo wygenerowana umowa w PDF (DOCX nie podpisujemy).
  let bytes: Uint8Array;
  let fileName = data.fileName ?? "dokument.pdf";
  let generatedDocumentId: string | null = null;
  let loanApplicationId: string | null = data.loanApplicationId ?? null;
  if (data.generatedDocumentId) {
    const src = await sourceFromGeneratedDocument(data.generatedDocumentId, context);
    bytes = src.bytes;
    fileName = src.fileName;
    generatedDocumentId = data.generatedDocumentId;
    loanApplicationId = loanApplicationId ?? src.loanApplicationId;
  } else if (data.fileBase64) {
    bytes = base64ToBytes(data.fileBase64);
  } else {
    throw new Error("Wgraj plik PDF albo wskaż wygenerowaną umowę w PDF.");
  }
  // Plik: PDF, limit rozmiaru, bez szyfrowania.
  if (bytes.byteLength > MAX_PDF_BYTES) throw new Error("Plik PDF jest za duży (limit 15 MB).");
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 5));
  if (!head.startsWith("%PDF")) throw new Error("Do podpisu przyjmujemy wyłącznie pliki PDF.");
  const { inspectPdf } = await import("./esign-pdf");
  const info = await inspectPdf(bytes).catch(() => null);
  if (!info)
    throw new Error("Nie udało się odczytać pliku PDF — sprawdź, czy nie jest uszkodzony.");
  if (info.encrypted)
    throw new Error("Plik PDF jest zaszyfrowany — zdejmij hasło/zabezpieczenia przed wysyłką.");
  const sourceSha = await sha256Hex(bytes);

  // Podpisujący — rozwiązujemy konta i reprezentację.
  const resolved: Array<{
    row: Record<string, unknown>;
    token: string;
  }> = [];
  const seenEmails = new Set<string>();
  for (const [i, s] of data.signers.entries()) {
    let fullName = s.fullName?.trim() ?? "";
    let email = s.email?.trim().toLowerCase() ?? "";
    let phone = s.phone?.trim() || null;
    let user_id: string | null = null;
    let investor_id: string | null = null;
    let client_id: string | null = null;
    let signer_kind: SignerRow["signer_kind"] = "zewnetrzny";
    let capacity_mode: SignerRow["capacity_mode"] = s.capacityMode;
    let company: SignerCompany | null = s.capacityMode === "firma" ? (s.company ?? null) : null;

    if (s.kind === "ja" || s.kind === "inwestor") {
      const uid = s.kind === "ja" ? userId : s.userId;
      if (!uid) throw new Error("Wskaż konto inwestora dla podpisującego z systemu.");
      if (s.kind === "inwestor" && role === "inwestor" && uid !== userId) {
        throw new Error("Inwestor może dodać z systemu tylko siebie.");
      }
      const inv = await investorByUser(uid);
      if (inv) {
        investor_id = inv.id;
        fullName = fullName || investorPersonName(inv);
        email = email || (inv.email ?? "").toLowerCase();
        phone = phone ?? inv.phone ?? null;
        const comp = investorCompany(inv);
        // Inwestor ze spółką w systemie wybiera przy podpisie: on sam czy spółka.
        capacity_mode = comp ? "wybor" : "osoba";
        company = comp;
        signer_kind = "inwestor";
      } else if (s.kind === "ja") {
        signer_kind = "personel";
        fullName = fullName || sender.name || "";
        email = email || sender.email || "";
      } else {
        throw new Error("Nie znaleziono profilu inwestora dla wskazanego konta.");
      }
      user_id = uid;
    } else if (s.kind === "klient") {
      if (!s.clientId) throw new Error(`Wskaż klienta z systemu dla podpisującego nr ${i + 1}.`);
      const allowed = await allowedClientIds(role, userId);
      if (allowed && !allowed.includes(s.clientId)) {
        throw new Error("Brak dostępu do tego klienta (nie ma wniosku z Twoją ofertą).");
      }
      const { data: c } = await db()
        .from("clients")
        .select(CLIENT_COLUMNS)
        .eq("id", s.clientId)
        .maybeSingle();
      if (!c) throw new Error("Nie znaleziono klienta pożyczkowego.");
      client_id = c.id;
      user_id = c.user_id ?? null;
      signer_kind = "klient";
      fullName = fullName || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
      email = email || (c.email ?? "").toLowerCase();
      phone = phone ?? c.phone ?? null;
      if (capacity_mode === "firma" && !company) company = clientCompany(c);
    }
    if (!fullName || fullName.length < 3)
      throw new Error(`Podaj imię i nazwisko podpisującego nr ${i + 1}.`);
    if (!email) throw new Error(`Podaj adres e-mail podpisującego nr ${i + 1}.`);
    if (capacity_mode === "firma" && !company?.name)
      throw new Error(`Podaj dane podmiotu, w imieniu którego podpisuje osoba nr ${i + 1}.`);
    if (seenEmails.has(email))
      throw new Error(
        `Adres ${email} powtarza się — każdy podpisujący musi mieć własny adres e-mail.`,
      );
    seenEmails.add(email);

    const token = randomToken();
    resolved.push({
      token,
      row: {
        order_no: s.orderNo ?? i + 1,
        role_label: s.roleLabel?.trim() || null,
        full_name: fullName,
        email,
        phone,
        user_id,
        investor_id,
        client_id,
        signer_kind,
        capacity_mode,
        company,
        token_hash: await hashToken(token),
      },
    });
  }

  const envelopeId = crypto.randomUUID();
  const sourcePath = `koperty/${envelopeId}/zrodlo.pdf`;
  const expiresAt = new Date(Date.now() + data.expiresInDays * 86_400_000).toISOString();
  await uploadBytes(sourcePath, bytes);

  const { data: inserted, error } = await db()
    .from("esign_envelopes")
    .insert({
      id: envelopeId,
      verify_code: await uniqueVerifyCode(),
      title: data.title,
      message: data.message?.trim() || null,
      status: "szkic",
      signing_mode: data.signingMode,
      created_by: userId,
      owner_role: role,
      sender_name: sender.name,
      sender_email: sender.email,
      source_path: sourcePath,
      source_filename: fileName.replace(/[^\w.\- ()ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, "_").slice(0, 200),
      source_sha256: sourceSha,
      source_bytes: bytes.byteLength,
      page_count: info.pages,
      expires_at: expiresAt,
      context: data.context ?? {},
      client_id:
        data.clientId ??
        (resolved.find((r) => r.row.client_id)?.row.client_id as string | null) ??
        null,
      loan_application_id: loanApplicationId,
      generated_document_id: generatedDocumentId,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const env = inserted as EnvelopeRow;

  const { error: sErr } = await db()
    .from("esign_signers")
    .insert(resolved.map((r) => ({ ...r.row, envelope_id: env.id })));
  if (sErr) throw new Error(sErr.message);

  const meta = requestClientMeta();
  await logEsignEvent({
    envelopeId: env.id,
    eventType: "utworzona",
    actorKind: "nadawca",
    actorUserId: userId,
    ip: meta.ip,
    userAgent: meta.userAgent,
    payload: {
      title: env.title,
      source_sha256: sourceSha,
      pages: info.pages,
      signers: resolved.map((r) => ({ name: r.row.full_name, email: r.row.email })),
    },
  });

  let sentTo: string[] = [];
  if (data.sendNow) {
    // Tokeny z tej samej transakcji — żeby nie generować drugi raz.
    const signers = await loadSigners(env.id);
    const tokens = new Map<string, string>();
    for (const s of signers) {
      const match = resolved.find((r) => r.row.email === s.email);
      if (match) tokens.set(s.id, match.token);
    }
    const now = new Date().toISOString();
    await db().from("esign_envelopes").update({ status: "wyslana", sent_at: now }).eq("id", env.id);
    await logEsignEvent({
      envelopeId: env.id,
      eventType: "wyslana",
      actorKind: "nadawca",
      actorUserId: userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    sentTo = await inviteDue({ ...env, status: "wyslana", sent_at: now }, tokens);
  }

  return {
    id: env.id,
    publicId: env.public_id,
    verifyCode: env.verify_code,
    verifyUrl: verifyUrl(env.verify_code),
    status: data.sendNow ? "wyslana" : "szkic",
    sentTo,
  };
}

/** Wysyłka szkicu (gdy kopertę zapisano bez wysyłki). */
export async function sendEnvelopeImpl(data: z.infer<typeof sendEnvelopeInput>, context: AuthCtx) {
  const { env } = await requireManaged(context.supabase, context.userId, data.envelopeId);
  if (env.status !== "szkic") throw new Error("Koperta została już wysłana.");
  const now = new Date().toISOString();
  await db().from("esign_envelopes").update({ status: "wyslana", sent_at: now }).eq("id", env.id);
  const meta = requestClientMeta();
  await logEsignEvent({
    envelopeId: env.id,
    eventType: "wyslana",
    actorKind: "nadawca",
    actorUserId: context.userId,
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  const sentTo = await inviteDue({ ...env, status: "wyslana", sent_at: now }, new Map());
  return { ok: true, sentTo };
}

/** Ponowne zaproszenie — nowy link (stary przestaje działać). */
export async function resendSignerLinkImpl(
  data: z.infer<typeof resendSignerLinkInput>,
  context: AuthCtx,
) {
  const { data: signer } = await db()
    .from("esign_signers")
    .select("*")
    .eq("id", data.signerId)
    .maybeSingle();
  if (!signer) throw new Error("Nie znaleziono podpisującego.");
  const { env } = await requireManaged(context.supabase, context.userId, signer.envelope_id);
  const live = await expireIfNeeded(env);
  if (live.status !== "wyslana") throw new Error("Koperta nie jest w trakcie podpisywania.");
  if (signer.status === "podpisany" || signer.status === "odrzucony")
    throw new Error("Ta osoba już zakończyła podpisywanie.");
  const token = randomToken();
  await db()
    .from("esign_signers")
    .update({
      token_hash: await hashToken(token),
      invited_at: new Date().toISOString(),
      token_expires_at: live.expires_at,
    })
    .eq("id", signer.id);
  const res = await sendSignerInvitation(live, signer as SignerRow, token, { resend: true });
  const meta = requestClientMeta();
  await logEsignEvent({
    envelopeId: live.id,
    signerId: signer.id,
    eventType: "ponowne_zaproszenie",
    actorKind: "nadawca",
    actorUserId: context.userId,
    ip: meta.ip,
    userAgent: meta.userAgent,
    payload: { email: signer.email, ok: res.ok, error: res.error ?? null },
  });
  if (!res.ok) throw new Error(res.error ?? "Nie udało się wysłać zaproszenia.");
  return { ok: true };
}

/**
 * Link do podpisu do przekazania ręcznie (SMS, komunikator) — dla dowolnej
 * osoby, także bez konta. Generuje nowy token; poprzedni link przestaje działać.
 */
export async function copySignerLinkImpl(
  data: z.infer<typeof copySignerLinkInput>,
  context: AuthCtx,
) {
  const { data: signer } = await db()
    .from("esign_signers")
    .select("*")
    .eq("id", data.signerId)
    .maybeSingle();
  if (!signer) throw new Error("Nie znaleziono podpisującego.");
  const { env } = await requireManaged(context.supabase, context.userId, signer.envelope_id);
  const live = await expireIfNeeded(env);
  if (live.status !== "wyslana") throw new Error("Koperta nie jest w trakcie podpisywania.");
  if (signer.status === "podpisany" || signer.status === "odrzucony")
    throw new Error("Ta osoba już zakończyła podpisywanie.");
  const token = randomToken();
  await db()
    .from("esign_signers")
    .update({
      token_hash: await hashToken(token),
      invited_at: signer.invited_at ?? new Date().toISOString(),
      token_expires_at: live.expires_at,
    })
    .eq("id", signer.id);
  const meta = requestClientMeta();
  await logEsignEvent({
    envelopeId: live.id,
    signerId: signer.id,
    eventType: "link_skopiowany",
    actorKind: "nadawca",
    actorUserId: context.userId,
    ip: meta.ip,
    userAgent: meta.userAgent,
    payload: { email: signer.email },
  });
  return { url: signerUrl(token), expiresAt: live.expires_at };
}

/** Zalogowany podpisujący (inwestor) otwiera swój link z panelu — bez e-maila. */
export async function openMySigningLinkImpl(
  data: z.infer<typeof openMySigningLinkInput>,
  context: AuthCtx,
) {
  const { data: signer } = await db()
    .from("esign_signers")
    .select("*")
    .eq("id", data.signerId)
    .maybeSingle();
  if (!signer) throw new Error("Nie znaleziono dokumentu do podpisu.");
  const myClients = await myClientIds(context.userId);
  if (!isMySigner(signer as SignerRow, context.userId, myClients, claimsEmail(context))) {
    throw new Error("Nie znaleziono dokumentu do podpisu.");
  }
  const env = await loadEnvelope(signer.envelope_id);
  if (!env) throw new Error("Nie znaleziono koperty.");
  const token = randomToken();
  await db()
    .from("esign_signers")
    .update({ token_hash: await hashToken(token), user_id: signer.user_id ?? context.userId })
    .eq("id", signer.id);
  return { url: signerUrl(token), token };
}

// ── listy i szczegóły ──────────────────────────────────────────────────────

export async function listMyEnvelopesImpl(
  data: z.infer<typeof listMyEnvelopesInput>,
  context: AuthCtx,
) {
  const { userId } = context;
  const role = await resolveOwnerRole(context.supabase as any, userId);
  let q = db()
    .from("esign_envelopes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(data.limit);
  if (role === "inwestor") q = q.eq("created_by", userId);
  else if (role === "operator") q = q.in("owner_role", ["admin", "operator"]);
  if (data.status) q = q.eq("status", data.status);
  const { data: envs } = await q;
  const ids = (envs ?? []).map((e: EnvelopeRow) => e.id);
  const { data: signers } = ids.length
    ? await db()
        .from("esign_signers")
        .select(
          "id, envelope_id, order_no, full_name, email, status, signed_at, role_label, signer_kind, identity_verified_at",
        )
        .in("envelope_id", ids)
        .order("order_no")
    : { data: [] };
  const byEnv = new Map<string, any[]>();
  for (const s of signers ?? []) {
    const arr = byEnv.get(s.envelope_id) ?? [];
    arr.push(s);
    byEnv.set(s.envelope_id, arr);
  }
  // Dokumenty, w których JA jestem podpisującym (np. inwestor zaproszony przez personel).
  const { data: mine } = await db()
    .from("esign_signers")
    .select("id, envelope_id, status, signed_at, role_label, order_no")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  const mineEnvIds = [...new Set((mine ?? []).map((m: any) => m.envelope_id))];
  const { data: mineEnvs } = mineEnvIds.length
    ? await db()
        .from("esign_envelopes")
        .select("id, public_id, title, status, sender_name, expires_at, completed_at, created_at")
        .in("id", mineEnvIds)
    : { data: [] };
  const toSign = (mine ?? [])
    .map((m: any) => ({
      signer: m,
      envelope: (mineEnvs ?? []).find((e: any) => e.id === m.envelope_id),
    }))
    .filter((x: any) => x.envelope);

  return {
    role,
    envelopes: (envs ?? []).map((e: EnvelopeRow) => ({
      ...e,
      signers: byEnv.get(e.id) ?? [],
      verifyUrl: verifyUrl(e.verify_code),
    })),
    toSign,
  };
}

export async function getEnvelopeDetailsImpl(
  data: z.infer<typeof getEnvelopeDetailsInput>,
  context: AuthCtx,
) {
  const role = await resolveOwnerRole(context.supabase as any, context.userId);
  let env = await loadEnvelope(data.envelopeId);
  if (!env) throw new Error("Nie znaleziono koperty.");
  const signers = await loadSigners(env.id);
  const myClients = await myClientIds(context.userId);
  const myEmail = claimsEmail(context);
  const isSigner = signers.some((s) => isMySigner(s, context.userId, myClients, myEmail));
  if (!canManage(env, role, context.userId) && !isSigner)
    throw new Error("Brak uprawnień do tej koperty.");
  env = await expireIfNeeded(env);
  const events = await loadEvents(env.id);
  return {
    envelope: { ...env, verifyUrl: verifyUrl(env.verify_code) },
    signers: signers.map(publicSignerRow),
    events,
    canManage: canManage(env, role, context.userId),
    mySignerId: signers.find((s) => isMySigner(s, context.userId, myClients, myEmail))?.id ?? null,
  };
}

/** Podpisany adres do pliku (źródło / podpisany) — 10 minut. */
export async function getEnvelopeFileUrlImpl(
  data: z.infer<typeof getEnvelopeFileUrlInput>,
  context: AuthCtx,
) {
  const role = await resolveOwnerRole(context.supabase as any, context.userId);
  const env = await loadEnvelope(data.envelopeId);
  if (!env) throw new Error("Nie znaleziono koperty.");
  const signers = await loadSigners(env.id);
  const myClients = await myClientIds(context.userId);
  const myEmail = claimsEmail(context);
  const isSigner = signers.some((s) => isMySigner(s, context.userId, myClients, myEmail));
  if (!canManage(env, role, context.userId) && !isSigner) throw new Error("Brak uprawnień.");
  const path = data.which === "podpisany" ? env.final_path : env.source_path;
  if (!path) throw new Error("Plik nie jest jeszcze dostępny.");
  const url = await signedFileUrl(path, 600, env.source_bucket);
  if (data.which === "podpisany") {
    const meta = requestClientMeta();
    await logEsignEvent({
      envelopeId: env.id,
      eventType: "pobranie_podpisanego",
      actorKind: isSigner && !canManage(env, role, context.userId) ? "podpisujacy" : "nadawca",
      actorUserId: context.userId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }
  return {
    url,
    filename: data.which === "podpisany" ? `${env.public_id}-podpisany.pdf` : env.source_filename,
  };
}

export async function cancelEnvelopeImpl(
  data: z.infer<typeof cancelEnvelopeInput>,
  context: AuthCtx,
) {
  const { env } = await requireManaged(context.supabase, context.userId, data.envelopeId);
  if (!["szkic", "wyslana"].includes(env.status))
    throw new Error("Tej koperty nie można już anulować.");
  const { data: upd } = await db()
    .from("esign_envelopes")
    .update({ status: "anulowana" })
    .eq("id", env.id)
    .in("status", ["szkic", "wyslana"])
    .select("id");
  if (!upd?.length) throw new Error("Koperta zmieniła status — odśwież widok.");
  const meta = requestClientMeta();
  await logEsignEvent({
    envelopeId: env.id,
    eventType: "anulowana",
    actorKind: "nadawca",
    actorUserId: context.userId,
    ip: meta.ip,
    userAgent: meta.userAgent,
    payload: { reason: data.reason ?? null },
  });
  return { ok: true };
}

/**
 * Niezgodność nazwiska z dokumentem tożsamości: nadawca akceptuje
 * (np. drugie nazwisko) albo poprawia dane podpisującego tak, by zgadzały
 * się z dokumentem — wtedy dopasowanie liczymy ponownie.
 */
export async function resolveIdentityMismatchImpl(
  data: z.infer<typeof resolveIdentityMismatchInput>,
  context: AuthCtx,
) {
  const { data: signer } = await db()
    .from("esign_signers")
    .select("*")
    .eq("id", data.signerId)
    .maybeSingle();
  if (!signer) throw new Error("Nie znaleziono podpisującego.");
  const { env } = await requireManaged(context.supabase, context.userId, signer.envelope_id);
  if (signer.status !== "niezgodnosc")
    throw new Error("Ten podpisujący nie ma niezgodności do rozstrzygnięcia.");
  const identity = signer.identity as SignerRow["identity"];
  const update: Record<string, unknown> = {};
  if (data.action === "popraw") {
    if (!data.correctedName) throw new Error("Podaj poprawione imię i nazwisko.");
    const ok = namesMatch(data.correctedName, identity?.fullName);
    if (!ok)
      throw new Error(
        `Poprawione dane nadal nie zgadzają się z dokumentem (${identity?.fullName ?? "—"}).`,
      );
    update.full_name = data.correctedName;
    update.identity = identity ? { ...identity, nameMatch: true } : identity;
    update.identity_mismatch_note =
      data.note ?? "Dane poprawione przez nadawcę zgodnie z dokumentem tożsamości.";
  } else {
    update.identity_mismatch_note =
      data.note ??
      `Nadawca zaakceptował różnicę między danymi (${signer.full_name}) a dokumentem tożsamości (${identity?.fullName ?? "—"}).`;
  }
  update.status = "zweryfikowany";
  update.identity_verified_at = signer.identity_verified_at ?? new Date().toISOString();
  const { error } = await db()
    .from("esign_signers")
    .update(update)
    .eq("id", signer.id)
    .eq("status", "niezgodnosc");
  if (error) throw new Error(error.message);
  const meta = requestClientMeta();
  await logEsignEvent({
    envelopeId: env.id,
    signerId: signer.id,
    eventType: "niezgodnosc_zaakceptowana",
    actorKind: "nadawca",
    actorUserId: context.userId,
    ip: meta.ip,
    userAgent: meta.userAgent,
    payload: {
      action: data.action,
      corrected_name: data.correctedName ?? null,
      note: update.identity_mismatch_note,
    },
  });
  return { ok: true };
}

/** Status koperty po zmianach podpisujących (używane w UI po akcjach). */
export function envelopeStatusAfter(env: EnvelopeRow, signers: SignerRow[]) {
  return deriveEnvelopeStatus(env.status, signers);
}
