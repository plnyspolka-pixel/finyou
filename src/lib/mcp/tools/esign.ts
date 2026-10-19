// Podpis dokumentowy (koperty e-podpisu) z MCP. Cienkie opakowania na
// implementację NADAWCY z panelu (src/lib/esign/esign-owner.server.ts) — te same
// uprawnienia (administrator / operator / inwestor), ta sama kontrola własności
// kopert, ten sam rejestr zdarzeń i te same zaproszenia e-mail do podpisujących.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { actorId, DESTRUCTIVE, handle, ok, requireUser, SENDS, userClient } from "../_helpers";
import type { AuthCtx } from "@/lib/esign/esign.server";
import { documentMarkdownSchema, documentHeaderSchema } from "@/lib/esign/esign-markdown";
import previewEsignDocument from "./preview-esign-document";

/** Kontekst nadawcy jak w server functions panelu: klient z tokenem użytkownika + id + claims. */
function esignCtx(ctx: ToolContext): AuthCtx {
  requireUser(ctx);
  return { supabase: userClient(ctx), userId: actorId(ctx), claims: ctx.getClaims() ?? {} };
}

const owner = () => import("@/lib/esign/esign-owner.server");

const signerSchema = z.object({
  kind: z
    .enum(["ja", "klient", "inwestor", "zewnetrzny"])
    .describe(
      "ja — zalogowany użytkownik (nadawca podpisuje sam); klient — klient pożyczkowy z systemu (client_id); inwestor — konto inwestora (user_id); zewnetrzny — dowolna osoba (full_name + email).",
    ),
  client_id: z.string().uuid().optional().describe("Dla kind=klient: clients.id."),
  user_id: z.string().uuid().optional().describe("Dla kind=inwestor: konto inwestora."),
  full_name: z.string().trim().max(160).optional(),
  email: z.string().trim().email().max(255).optional(),
  phone: z.string().trim().max(30).optional(),
  role_label: z
    .string()
    .trim()
    .max(80)
    .optional()
    .describe("Rola w dokumencie, np. „Pożyczkodawca”, „Pożyczkobiorca”."),
  order_no: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Kolejność przy signing_mode=kolejno."),
});

export const createEsignEnvelope = defineTool({
  name: "create_esign_envelope",
  title: "Create e-signature envelope",
  description:
    "Tworzy kopertę e-podpisu z dokładnie jednego źródła: generated_document_id XOR file_base64 XOR document_markdown (maks. 200 000 znaków, PDF A4). Markdown i opcjonalny document_header na każdej stronie są dostępne tylko administratorowi. Obsługuje nagłówki, bold/italic, listy, tabele, ->tytuł<- i \\pagebreak. Przed utworzeniem można użyć preview_esign_document. Podpisujący: ja, klient, inwestor, zewnetrzny. Zachowuje standardową weryfikację tożsamości i kod podpisu. Domyślnie SZKIC (send_now=false); wysyłka tylko po zgodzie przez send_esign_envelope lub send_now=true. Zwraca id, kod weryfikacji i adresy zaproszeń.",
  inputSchema: {
    title: z.string().trim().min(3).max(200),
    message: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .describe("Wiadomość do podpisujących w zaproszeniu."),
    generated_document_id: z
      .string()
      .uuid()
      .optional()
      .describe("Wygenerowana umowa (generated_documents.id)."),
    file_name: z.string().trim().min(1).max(200).optional(),
    file_base64: z.string().min(16).optional().describe("PDF w base64 (zamiast umowy z rejestru)."),
    document_markdown: documentMarkdownSchema.optional().describe("Treść dokumentu Markdown, do 200 000 znaków; alternatywa dla pliku i generated_document_id. Tylko administrator."),
    document_header: documentHeaderSchema.optional().describe("Krótki nagłówek każdej strony PDF, tylko z document_markdown."),
    client_id: z.string().uuid().optional(),
    loan_application_id: z.string().uuid().optional(),
    signing_mode: z
      .enum(["rownolegle", "kolejno"])
      .default("rownolegle")
      .describe("rownolegle — wszyscy naraz; kolejno — wg order_no."),
    expires_in_days: z.number().int().min(1).max(90).optional(),
    signers: z.array(signerSchema).min(1).max(10),
    send_now: z.boolean().default(false),
  },
  annotations: SENDS,
  handler: (args, ctx: ToolContext) =>
    handle(async () => {
      const context = esignCtx(ctx);
      const { createEnvelopeInput } = await import("@/lib/esign/esign-schemas");
      const data = createEnvelopeInput.parse({
        title: args.title,
        message: args.message ?? null,
        signingMode: args.signing_mode,
        ...(args.expires_in_days ? { expiresInDays: args.expires_in_days } : {}),
        fileName: args.file_name ?? null,
        fileBase64: args.file_base64 ?? null,
        generatedDocumentId: args.generated_document_id ?? null,
        documentMarkdown: args.document_markdown ?? null,
        documentHeader: args.document_header ?? null,
        clientId: args.client_id ?? null,
        loanApplicationId: args.loan_application_id ?? null,
        context: { zrodlo: "mcp" },
        sendNow: args.send_now,
        signers: args.signers.map((s) => ({
          kind: s.kind,
          clientId: s.client_id ?? null,
          userId: s.user_id ?? null,
          fullName: s.full_name ?? null,
          email: s.email ?? null,
          phone: s.phone ?? null,
          roleLabel: s.role_label ?? null,
          ...(s.order_no ? { orderNo: s.order_no } : {}),
        })),
      });
      return ok(await (await owner()).createEnvelopeImpl(data, context));
    }),
});

export const sendEsignEnvelope = defineTool({
  name: "send_esign_envelope",
  title: "Send e-signature envelope",
  description:
    "Wysyła szkic koperty e-podpisu: zaproszenia e-mail z linkiem do podpisu (przy trybie kolejno — do pierwszych w kolejce). Tylko na wyraźne polecenie użytkownika.",
  inputSchema: { envelope_id: z.string().uuid() },
  annotations: SENDS,
  handler: ({ envelope_id }, ctx: ToolContext) =>
    handle(async () =>
      ok(await (await owner()).sendEnvelopeImpl({ envelopeId: envelope_id }, esignCtx(ctx))),
    ),
});

export const listEsignEnvelopes = defineTool({
  name: "list_esign_envelopes",
  title: "List e-signature envelopes",
  description:
    "Koperty e-podpisu widoczne dla użytkownika (administrator — wszystkie; operator — personelu; inwestor — swoje): tytuł, status (szkic / wyslana / zakonczona / odrzucona / anulowana / wygasla), podpisujący i ich postęp.",
  inputSchema: {
    status: z
      .enum(["szkic", "wyslana", "zakonczona", "odrzucona", "anulowana", "wygasla"])
      .optional(),
    limit: z.number().int().min(1).max(200).default(50),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ status, limit }, ctx: ToolContext) =>
    handle(async () =>
      ok(await (await owner()).listMyEnvelopesImpl({ status, limit }, esignCtx(ctx))),
    ),
});

export const getEsignEnvelope = defineTool({
  name: "get_esign_envelope",
  title: "Get e-signature envelope",
  description:
    "Szczegóły koperty e-podpisu: status, podpisujący (id do `resend_esign_link`), weryfikacja tożsamości, historia zdarzeń.",
  inputSchema: { envelope_id: z.string().uuid() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ envelope_id }, ctx: ToolContext) =>
    handle(async () =>
      ok(await (await owner()).getEnvelopeDetailsImpl({ envelopeId: envelope_id }, esignCtx(ctx))),
    ),
});

export const getEsignEnvelopeFile = defineTool({
  name: "get_esign_envelope_file",
  title: "Get e-signature envelope file link",
  description:
    "Podpisany link do pliku koperty: `zrodlo` (dokument wysłany do podpisu) albo `podpisany` (po zakończeniu, z kartą podpisów).",
  inputSchema: {
    envelope_id: z.string().uuid(),
    which: z.enum(["zrodlo", "podpisany"]).default("zrodlo"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ envelope_id, which }, ctx: ToolContext) =>
    handle(async () =>
      ok(
        await (
          await owner()
        ).getEnvelopeFileUrlImpl({ envelopeId: envelope_id, which }, esignCtx(ctx)),
      ),
    ),
});

export const resendEsignLink = defineTool({
  name: "resend_esign_link",
  title: "Resend e-signature link",
  description:
    "Ponownie wysyła podpisującemu e-mail z nowym linkiem do podpisu (stary link przestaje działać). `signer_id` z `get_esign_envelope`.",
  inputSchema: { signer_id: z.string().uuid() },
  annotations: SENDS,
  handler: ({ signer_id }, ctx: ToolContext) =>
    handle(async () =>
      ok(await (await owner()).resendSignerLinkImpl({ signerId: signer_id }, esignCtx(ctx))),
    ),
});

export const sendEsignInterimCopy = defineTool({
  name: "send_esign_interim_copy",
  title: "Send partially signed e-signature copy",
  description:
    "Wysyła wskazanym adresom (1–5) kopię dokumentu z koperty W TRAKCIE podpisywania, gdy część stron już podpisała: PDF ze znacznikiem na każdej stronie i Kartą podpisów w wariancie „podpisano częściowo n z N” — kto podpisał (z pełnym śladem) i kto jeszcze NIE. Koperta zostaje otwarta; plik końcowy pójdzie automatycznie po ostatnim podpisie. Plik zapisuje się obok koperty, wysyłka trafia do historii dokumentu. Realna wiadomość — tylko po pokazaniu adresów i treści i wyraźnym poleceniu użytkownika.",
  inputSchema: {
    envelope_id: z.string().uuid(),
    recipients: z.array(z.string().trim().email().max(255)).min(1).max(5),
    note: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .describe("Krótki wstęp na początku maila (opcjonalnie)."),
  },
  annotations: SENDS,
  handler: ({ envelope_id, recipients, note }, ctx: ToolContext) =>
    handle(async () =>
      ok(
        await (
          await owner()
        ).sendInterimCopyImpl({ envelopeId: envelope_id, recipients, note }, esignCtx(ctx)),
      ),
    ),
});

export const cancelEsignEnvelope = defineTool({
  name: "cancel_esign_envelope",
  title: "Cancel e-signature envelope",
  description:
    "Anuluje kopertę e-podpisu (linki przestają działać). Tylko na wyraźne polecenie użytkownika.",
  inputSchema: {
    envelope_id: z.string().uuid(),
    reason: z.string().trim().max(500).optional(),
  },
  annotations: DESTRUCTIVE,
  handler: ({ envelope_id, reason }, ctx: ToolContext) =>
    handle(async () =>
      ok(
        await (
          await owner()
        ).cancelEnvelopeImpl({ envelopeId: envelope_id, reason }, esignCtx(ctx)),
      ),
    ),
});

export const esignTools = [
  createEsignEnvelope,
  previewEsignDocument,
  sendEsignEnvelope,
  listEsignEnvelopes,
  getEsignEnvelope,
  getEsignEnvelopeFile,
  resendEsignLink,
  sendEsignInterimCopy,
  cancelEsignEnvelope,
];
