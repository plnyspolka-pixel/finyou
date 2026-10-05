// Podpis dokumentowy — schematy wejścia server functions (zod). Plik bez
// importów serwerowych: trafia także do paczki klienta (typy + walidacja).
import { z } from "zod";
import { TOKEN_TTL_DAYS } from "./esign-core";

export const CompanySchema = z.object({
  name: z.string().trim().min(2).max(300),
  nip: z.string().trim().max(20).optional().nullable(),
  krs: z.string().trim().max(20).optional().nullable(),
  regon: z.string().trim().max(20).optional().nullable(),
  legalForm: z.string().trim().max(120).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  role: z.string().trim().max(120).optional().nullable(),
});

export const SignerInput = z.object({
  kind: z.enum(["zewnetrzny", "inwestor", "ja"]).default("zewnetrzny"),
  /** Dla kind=inwestor: konto inwestora z systemu. */
  userId: z.string().uuid().optional().nullable(),
  fullName: z.string().trim().max(160).optional().nullable(),
  email: z.string().trim().email().max(255).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  roleLabel: z.string().trim().max(80).optional().nullable(),
  /** osoba — we własnym imieniu; firma — w imieniu `company` (klient zewnętrzny). */
  capacityMode: z.enum(["osoba", "firma"]).default("osoba"),
  company: CompanySchema.optional().nullable(),
  orderNo: z.number().int().min(1).max(50).optional(),
});

export const CreateInput = z.object({
  title: z.string().trim().min(3).max(200),
  message: z.string().trim().max(2000).optional().nullable(),
  signingMode: z.enum(["rownolegle", "kolejno"]).default("rownolegle"),
  expiresInDays: z.number().int().min(1).max(90).default(TOKEN_TTL_DAYS),
  fileName: z.string().trim().min(1).max(200),
  fileBase64: z.string().min(16),
  context: z.record(z.string(), z.unknown()).optional(),
  signers: z.array(SignerInput).min(1).max(10),
  sendNow: z.boolean().default(true),
});

export type CreateEnvelopeInput = z.infer<typeof CreateInput>;

export const TokenInput = z.object({ token: z.string().min(20).max(128) });

// ── nadawca ────────────────────────────────────────────────────────────────
export const searchSignerCandidatesInput = z.object({ q: z.string().trim().min(2).max(120) });

export const createEnvelopeInput = CreateInput;

export const sendEnvelopeInput = z.object({ envelopeId: z.string().uuid() });

export const resendSignerLinkInput = z.object({ signerId: z.string().uuid() });

export const openMySigningLinkInput = z.object({ signerId: z.string().uuid() });

export const listMyEnvelopesInput = z.object({
  status: z
    .enum(["szkic", "wyslana", "zakonczona", "odrzucona", "anulowana", "wygasla"])
    .optional(),
  limit: z.number().int().min(1).max(200).default(100),
});

export const getEnvelopeDetailsInput = z.object({ envelopeId: z.string().uuid() });

export const getEnvelopeFileUrlInput = z.object({
  envelopeId: z.string().uuid(),
  which: z.enum(["zrodlo", "podpisany"]),
});

export const cancelEnvelopeInput = z.object({
  envelopeId: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
});

export const resolveIdentityMismatchInput = z.object({
  signerId: z.string().uuid(),
  action: z.enum(["akceptuj", "popraw"]),
  correctedName: z.string().trim().min(3).max(160).optional(),
  note: z.string().trim().max(500).optional(),
});

// ── podpisujący ────────────────────────────────────────────────────────────
export const getSigningSessionInput = TokenInput;

export const getSigningDocumentInput = TokenInput.extend({
  which: z.enum(["zrodlo", "podpisany"]).default("zrodlo"),
});

export const startSignerIdentityInput = TokenInput;

export const refreshSignerIdentityInput = TokenInput;

export const chooseSigningCapacityInput = TokenInput.extend({ mode: z.enum(["osoba", "firma"]) });

export const requestSigningOtpInput = TokenInput.extend({
  channel: z.enum(["sms", "email"]).optional(),
});

export const confirmSignatureInput = TokenInput.extend({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Kod ma 6 cyfr."),
  statements: z.record(z.string(), z.boolean()),
});

export const rejectSigningInput = TokenInput.extend({ reason: z.string().trim().min(3).max(1000) });

export const getVerificationInput = z.object({ code: z.string().trim().min(6).max(32) });
