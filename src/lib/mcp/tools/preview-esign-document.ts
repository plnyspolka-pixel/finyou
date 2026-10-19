import { defineTool } from "@lovable.dev/mcp-js";
import { actorId, handle, ok, requireRolesAdmin } from "../_helpers";
import { previewDocumentInput } from "@/lib/esign/esign-markdown";

export default defineTool({
  name: "preview_esign_document",
  title: "Preview e-signature document",
  description: "Tylko administrator: renderuje document_markdown do PDF A4 z opcjonalnym document_header; zapisuje prywatny podgląd bez koperty i wysyłki, zwraca podpisany link ważny 1 godzinę, page_count i sha256.",
  inputSchema: previewDocumentInput.shape,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: (args, ctx) => handle(async () => {
    const data = previewDocumentInput.parse(args);
    const admin = await requireRolesAdmin(ctx, ["administrator"]);
    const { renderEsignMarkdown } = await import("@/lib/esign/esign-markdown");
    const { inspectPdf } = await import("@/lib/esign/esign-pdf");
    const { sha256Hex } = await import("@/lib/esign/esign-core");
    const { uploadBytes, signedFileUrl } = await import("@/lib/esign/esign.server");
    const bytes = await renderEsignMarkdown(data.document_markdown, data.document_header);
    if (bytes.byteLength > 15 * 1024 * 1024) throw new Error("Plik PDF jest za duży (limit 15 MB).");
    const info = await inspectPdf(bytes);
    const sha256 = await sha256Hex(bytes);
    const id = crypto.randomUUID();
    const path = `podglady/${actorId(ctx)}/${id}.pdf`;
    await uploadBytes(path, bytes);
    const { error } = await admin.from("audit_logs").insert({
      user_id: actorId(ctx), action: "esign_document_preview", object_type: "esign_document_preview", object_id: id,
      new_value: { source_path: path, sha256, page_count: info.pages, source_bytes: bytes.byteLength, via: "mcp" },
    });
    if (error) throw new Error(`Nie udało się zapisać audytu: ${error.message}`);
    return ok({ url: await signedFileUrl(path, 3600), expires_in_seconds: 3600, page_count: info.pages, sha256 });
  }),
});