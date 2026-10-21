// Dokumenty prawne — publikacja aktualnych wersji w bazie (lib/legal/dokumenty-1-0.ts).
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { WRITE_IDEMPOTENT, handle, ok, requireRolesAdmin } from "../_helpers";

const POTWIERDZENIE = "OPUBLIKUJ DOKUMENTY";

export const publishLegalDocuments = defineTool({
  name: "publish_legal_documents",
  title: "Opublikuj aktualne dokumenty prawne",
  description: `Publikuje w bazie aktualne wersje dokumentów prawnych z treści w kodzie: regulamin klienta 2.0 (Prowizja od Pożyczkobiorcy 7%), politykę prywatności 1.0 i pakiet inwestora FY-LEGAL-2.0. Niczego nie usuwa: poprzednie wersje regulaminu i polityki zostają jako nieaktywne, akceptacje poprzednich wersji zostają, a użytkownicy akceptują nową wersję przy następnym wejściu do panelu. Idempotentne. Przerywa, gdy baza ma wersję o tym samym numerze z inną treścią. Wymaga confirm = "${POTWIERDZENIE}". Tylko administrator.`,
  inputSchema: {
    confirm: z.literal(POTWIERDZENIE),
  },
  annotations: WRITE_IDEMPOTENT,
  handler: (_a, ctx: ToolContext) =>
    handle(async () => {
      const db = await requireRolesAdmin(ctx, ["administrator"]);
      const [{ opublikujDokumenty }, { DANE_DOKUMENTOW_1_0 }] = await Promise.all([
        import("@/lib/legal/dokumenty-1-0"),
        import("@/lib/legal/dokumenty-1-0.dane"),
      ]);
      const wynik = await opublikujDokumenty(db, DANE_DOKUMENTOW_1_0);
      return ok({
        komunikat: wynik.zastosowano
          ? `Opublikowano: ${wynik.dokumenty.join(", ")}. Akceptacje poprzednich wersji zostały.`
          : "Baza ma już aktualne dokumenty — nic nie zmieniono.",
        ...wynik,
      });
    }),
});

export const legalDocsTools = [publishLegalDocuments];
