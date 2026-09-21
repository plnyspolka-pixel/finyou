// Windykacja: sprawa w całości, pożyczki inwestora, starszy moduł spraw.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { fail, handle, ok, oneOf, requireUser, rowsOf, section } from "../_helpers";
import { defineListTool, text, uuid } from "../_list-tool";

export const getCollectionCase = defineTool({
  name: "get_collection_case",
  title: "Get collection case",
  description:
    "Sprawa windykacyjna w całości: etap, ścieżka, priorytet, zaległość i opóźnienie, pożyczka (umowa, kwoty, saldo, terminy), dłużnik (bez PESEL i numeru dowodu) oraz chronologia zdarzeń z doręczeniami. Inwestor widzi swoje (RLS), zespół — wszystkie.",
  inputSchema: { id: z.string().uuid() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ id }, ctx: ToolContext) =>
    handle(async () => {
      const s = requireUser(ctx);
      const c = await oneOf(
        s.from("wind_collection_cases").select("*").eq("id", id),
        "wind_collection_cases",
      );
      if (!c) return fail("Nie znaleziono sprawy (albo brak uprawnień).");
      const errors: string[] = [];
      const loan = await section(errors, "wind_loans", () =>
        oneOf(
          s
            .from("wind_loans")
            .select(
              "id, numer_umowy, borrower_id, kwota_pozyczki, kwota_calkowita, saldo_pozostale, oprocentowanie_roczne, stopa_odsetek_max, prowizja, status, data_umowy, termin_splaty, data_ostatniej_wplaty, data_wypowiedzenia, numer_kw, kwota_hipoteki, kwota_777",
            )
            .eq("id", c.loan_id),
          "wind_loans",
        ),
      );
      const [borrower, events] = await Promise.all([
        section(errors, "wind_borrowers", async () =>
          loan?.borrower_id
            ? oneOf(
                s
                  .from("wind_borrowers")
                  .select(
                    "id, imie_nazwisko, typ, telefon, email, email_zgoda_doreczenia, adres_do_doreczen, nip, notatki",
                  )
                  .eq("id", loan.borrower_id),
                "wind_borrowers",
              )
            : null,
        ),
        section(errors, "wind_events", () =>
          rowsOf(
            s
              .from("wind_events")
              .select(
                "id, typ, kategoria, tytul, tresc, data_zdarzenia, status_doreczenia, data_doreczenia, autor, zalacznik_url, created_at",
              )
              .eq("case_id", id)
              .order("data_zdarzenia", { ascending: false })
              .limit(200),
            "wind_events",
          ),
        ),
      ]);
      return ok({ case: c, loan, borrower, events: events ?? [], errors });
    }),
});

export const listWindLoans = defineListTool({
  name: "list_wind_loans",
  title: "List investor loans (collections module)",
  description:
    "Pożyczki w module windykacji: numer umowy, kwoty, saldo, oprocentowanie, status (aktywna, w zwłoce, wypowiedziana, spłacona…), terminy, KW — z danymi pożyczkobiorcy (bez PESEL). Inwestor widzi swoje (RLS), zespół — wszystkie.",
  table: "wind_loans",
  columns:
    "id, numer_umowy, borrower_id, investor_user_id, kwota_pozyczki, kwota_calkowita, saldo_pozostale, oprocentowanie_roczne, status, data_umowy, termin_splaty, data_ostatniej_wplaty, data_wypowiedzenia, numer_kw, created_at",
  resultKey: "loans",
  filters: {
    status: text(
      "status",
      "Status pożyczki (aktywna, w_zwloce, wypowiedziana, windykacja_komornicza, splacona, windykacja_karna).",
    ),
    investor_user_id: uuid("investor_user_id", "Tylko pożyczki tego inwestora."),
  },
  attach: [
    {
      key: "borrower_id",
      table: "wind_borrowers",
      columns: "id, imie_nazwisko, typ, telefon, email",
      as: "borrower",
    },
  ],
});

export const listDebtCollectionCases = defineListTool({
  name: "list_debt_collection_cases",
  title: "List debt collection cases (legacy)",
  description:
    "Starszy moduł spraw windykacyjnych (kalkulator kosztów działań): dłużnik, umowa, kapitał, stopy odsetek, status. Widoczność wg RLS.",
  table: "debt_collection_cases",
  columns:
    "id, investor_user_id, status, debtor_name, contract_number, principal_amount, payout_date, contractual_annual_rate, penalty_annual_rate, max_statutory_rate, notes, created_at, updated_at",
  resultKey: "cases",
  filters: {
    status: text("status", "Status sprawy."),
    investor_user_id: uuid("investor_user_id", "Tylko sprawy tego inwestora."),
  },
});

export const collectionsExtraTools = [getCollectionCase, listWindLoans, listDebtCollectionCases];
