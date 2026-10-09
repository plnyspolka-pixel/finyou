import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import type { WindDebtLoan } from "@/lib/windykacja-debt";
import { warsawToday } from "@/lib/windykacja-recalc";
import { fail, handle, ok, requireUser, section } from "../_helpers";
import {
  WIND_DEBT_LOAN_COLS,
  type WindRow,
  harmonogramSkrot,
  loadWindDebtEvents,
  windZadluzenie,
} from "./collections-extra";

const WYNIKI = ["splacona", "ugoda", "egzekucja_w_toku", "umorzona", "przekazana_karna"] as const;

export type WindCaseStatusFilter =
  | { kind: "otwarte" }
  | { kind: "zamkniete" }
  | { kind: "wynik"; wynik: (typeof WYNIKI)[number] };

/**
 * Filtr `status` sprawy (tabela nie ma kolumny status): otwarte / zamknięte
 * albo wynik zamknięcia. Nieznana wartość → null.
 */
export function caseStatusFilter(status: string): WindCaseStatusFilter | null {
  const v = status.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/ł/g, "l");
  if (["otwarte", "otwarta", "open"].includes(v)) return { kind: "otwarte" };
  if (["zamkniete", "zamknieta", "closed"].includes(v)) return { kind: "zamkniete" };
  const wynik = WYNIKI.find((w) => w === v);
  return wynik ? { kind: "wynik", wynik } : null;
}

export default defineTool({
  name: "list_collection_cases",
  title: "List collection (windykacja) cases",
  description:
    "Sprawy windykacyjne z pożyczką (numer umowy, pożyczkodawca, status, skrót harmonogramu rat), dłużnikiem i `zadluzenie` na dziś liczonym jak na karcie sprawy: doZaplatyTeraz (zaległe raty + odsetki za opóźnienie + koszty; po wypowiedzeniu całe zadłużenie), zaleglosc, odsetkiZaOpoznienie, koszty, calosc (z ratami przyszłymi), dniOpoznienia, najstarszaZalegla, zrodlo (harmonogram / termin). kwota_zalegla i opoznienie_dni w sprawie to zapisana migawka. Filtry: status (otwarte, zamkniete albo wynik: splacona, ugoda, egzekucja_w_toku, umorzona, przekazana_karna), limit. Widoczność wg RLS.",
  inputSchema: {
    status: z
      .string()
      .optional()
      .describe(
        "otwarte | zamkniete | wynik zamknięcia (splacona, ugoda, egzekucja_w_toku, umorzona, przekazana_karna).",
      ),
    limit: z.number().int().min(1).max(50).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ status, limit }, ctx: ToolContext) =>
    handle(async () => {
      const s = requireUser(ctx);
      let q = s
        .from("wind_collection_cases")
        .select(
          `*, loan:wind_loans(id, numer_umowy, investor_user_id, pozyczkodawca, saldo_pozostale, ${WIND_DEBT_LOAN_COLS}, borrower:wind_borrowers(imie_nazwisko, typ))`,
        )
        .order("created_at", { ascending: false })
        .limit(limit ?? 20);
      if (status) {
        const f = caseStatusFilter(status);
        if (!f) {
          return fail(
            `Nieznany status „${status}". Dozwolone: otwarte, zamkniete, ${WYNIKI.join(", ")}.`,
          );
        }
        if (f.kind === "otwarte") q = q.is("data_zamkniecia", null);
        else if (f.kind === "zamkniete") q = q.not("data_zamkniecia", "is", null);
        else q = q.eq("wynik", f.wynik);
      }
      const { data, error } = await q;
      if (error) return fail(error.message);
      const rows = (data ?? []) as WindRow[];

      const errors: string[] = [];
      const debtEvents = rows.length
        ? await section(errors, "zadluzenie", () =>
            loadWindDebtEvents(
              s,
              rows.map((c) => c.id as string),
            ),
          )
        : new Map();
      const asOf = warsawToday();
      const cases = rows.map(({ loan, ...kase }) => {
        const { harmonogram, borrower, ...loanRest } = (loan ?? {}) as WindRow;
        return {
          ...kase,
          loan: loan ? { ...loanRest, harmonogram_skrot: harmonogramSkrot(harmonogram) } : null,
          borrower: borrower ?? null,
          zadluzenie:
            loan && debtEvents
              ? windZadluzenie({
                  loan: loan as WindDebtLoan,
                  kwotaZalegla: kase.kwota_zalegla,
                  events: debtEvents.get(kase.id) ?? [],
                  asOf,
                })
              : null,
        };
      });
      return ok({ cases, ...(errors.length ? { errors } : {}) });
    }),
});
