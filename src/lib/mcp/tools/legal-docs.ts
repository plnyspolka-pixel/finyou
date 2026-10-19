// Dokumenty prawne 1.0 — jednorazowe wgranie do bazy (lib/legal/dokumenty-1-0.ts).
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { DESTRUCTIVE, handle, ok, requireRolesAdmin } from "../_helpers";

const POTWIERDZENIE = "WGRAJ DOKUMENTY 1.0";

export const applyLegalDocuments10 = defineTool({
  name: "apply_legal_documents_1_0",
  title: "Wgraj dokumenty prawne 1.0",
  description: `Wgrywa do bazy dokumenty prawne w wersji 1.0 (regulamin klienta, polityka prywatności, pakiet inwestora FY-LEGAL-1.0) z treści w kodzie. USUWA wcześniejsze wersje regulaminu i polityki oraz WSZYSTKIE akceptacje regulaminu, polityki i pakietu inwestora — użytkownicy akceptują 1.0 od nowa. Idempotentne: gdy baza ma już te dokumenty, nic nie zmienia. Wymaga confirm = "${POTWIERDZENIE}". Tylko administrator.`,
  inputSchema: {
    confirm: z.literal(POTWIERDZENIE),
  },
  annotations: DESTRUCTIVE,
  handler: (_a, ctx: ToolContext) =>
    handle(async () => {
      const db = await requireRolesAdmin(ctx, ["administrator"]);
      const [{ zastosujDokumenty }, { DANE_DOKUMENTOW_1_0 }] = await Promise.all([
        import("@/lib/legal/dokumenty-1-0"),
        import("@/lib/legal/dokumenty-1-0.dane"),
      ]);
      const wynik = await zastosujDokumenty(db, DANE_DOKUMENTOW_1_0);
      return ok({
        komunikat: wynik.zastosowano
          ? `Wgrano dokumenty 1.0. Usunięte akceptacje: ${wynik.usunieteAkceptacjeZgod} (regulamin/polityka), ${wynik.usunieteAkceptacjeUmow} (pakiet inwestora).`
          : "Baza ma już dokumenty 1.0 — nic nie zmieniono.",
        ...wynik,
      });
    }),
});

export const legalDocsTools = [applyLegalDocuments10];
