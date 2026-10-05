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
  sendEnvelopeInput,
  resendSignerLinkInput,
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
  verifyUrl,
  type AuthCtx,
  type EnvelopeRow,
  type SignerRow,
} from "./esign.server";

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

  // Plik: PDF, limit rozmiaru, bez szyfrowania.
  const bytes = base64ToBytes(data.fileBase64);
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
      source_filename: data.fileName.replace(/[^\w.\- ()ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, "_").slice(0, 200),
      source_sha256: sourceSha,
      source_bytes: bytes.byteLength,
      page_count: info.pages,
      expires_at: expiresAt,
      context: data.context ?? {},
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

/** Zalogowany podpisujący (inwestor) otwiera swój link z panelu — bez e-maila. */
export async function openMySigningLinkImpl(
  data: z.infer<typeof openMySigningLinkInput>,
  context: AuthCtx,
) {
  const { data: signer } = await db()
    .from("esign_signers")
    .select("*")
    .eq("id", data.signerId)
    .eq("user_id", context.userId)
    .maybeSingle();
  if (!signer) throw new Error("Nie znaleziono dokumentu do podpisu.");
  const env = await loadEnvelope(signer.envelope_id);
  if (!env) throw new Error("Nie znaleziono koperty.");
  const token = randomToken();
  await db()
    .from("esign_signers")
    .update({ token_hash: await hashToken(token) })
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
  const isSigner = signers.some((s) => s.user_id === context.userId);
  if (!canManage(env, role, context.userId) && !isSigner)
    throw new Error("Brak uprawnień do tej koperty.");
  env = await expireIfNeeded(env);
  const events = await loadEvents(env.id);
  return {
    envelope: { ...env, verifyUrl: verifyUrl(env.verify_code) },
    signers: signers.map(publicSignerRow),
    events,
    canManage: canManage(env, role, context.userId),
    mySignerId: signers.find((s) => s.user_id === context.userId)?.id ?? null,
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
  const isSigner = signers.some((s) => s.user_id === context.userId);
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
