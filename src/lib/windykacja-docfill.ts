// ════════════════════════════════════════════════════════════════════
// AUTO-UZUPEŁNIANIE gotowych szablonów DOCX z Kreatora dokumentów danymi
// sprawy windykacyjnej. Mapuje pola wzoru (DocField) na wartości pozycyjne
// (indeks wystąpienia → wartość), zgodne z `generateDocxFromTemplate`.
//
// Wierzyciel = inwestor — właściciel sprawy, dane z jego profilu
//              (strona „pożyczkodawca/wierzyciel"; investor-party.ts).
// Dłużnik    = pożyczkobiorca ze sprawy (strona „pożyczkobiorca/dłużnik").
// Puste wartości są pomijane — odpowiadające tokeny [KLUCZ] zostają we wzorze
// do ręcznego uzupełnienia.
// ════════════════════════════════════════════════════════════════════

import { COMPANY_DATA } from "@/lib/company";
import type { DocField } from "./document-fields";
import { amountKind, isFinanceYouAccountField } from "./document-fields";
import { amountToWordsPLN } from "./amount-to-words-pl";
import { creditorFieldValue, type CreditorParty } from "./investor-party";

const PL_NUM = (n: number) =>
  new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Math.round((Number(n) || 0) * 100) / 100,
  );

function dmy(iso?: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("T")[0].split("-");
  if (!y || !m || !d) return "";
  return `${d}.${m}.${y}`;
}

/** Dane Finance You jako pożyczkodawcy (kreator udzielenia pożyczki). */
export const FY_CREDITOR = {
  name: COMPANY_DATA.legalName,
  legalForm: COMPANY_DATA.legalForm,
  representative: COMPANY_DATA.representative,
};

export interface WindFillContext {
  /** Wierzyciel z profilu właściciela sprawy; brak — pola wierzyciela zostają puste. */
  wierzyciel?: CreditorParty | null;
  dluznik: string;
  adres: string;
  pesel?: string | null;
  nip?: string | null;
  kwota_zalegla: number;
  saldo: number;
  prowizja?: number | null;
  kwota_pozyczki?: number | null;
  numer_kw?: string | null;
  akt_777?: string | null;
  numer_umowy?: string | null;
  data_umowy?: string | null;
  rachunek?: string | null;
  /** Data wystawienia (ISO); domyślnie dziś (ustaw na wywołaniu). */
  dataISO: string;
}

const isDebtorParty = (f: DocField) => f.groupKey === "pozyczkobiorca";
const isCreditorParty = (f: DocField) => f.groupKey === "pozyczkodawca";
/** Dane strony wierzyciela — tylko z profilu (nigdy dane dłużnika ani kwoty). */
const CREDITOR_SEMANTICS = new Set<DocField["semantic"]>([
  "name",
  "address",
  "pesel",
  "nip",
  "regon",
  "krs",
  "idLine",
  "bank",
  "phone",
  "email",
  "legalForm",
  "representative",
]);

function amountForField(f: DocField, ctx: WindFillContext): number {
  switch (amountKind(f.key)) {
    case "prowizja":
      return Number(ctx.prowizja ?? 0);
    case "netto":
      return Number(ctx.kwota_pozyczki ?? 0);
    case "brutto":
    case "total":
      return Number(ctx.saldo ?? 0);
    default:
      return Number(ctx.kwota_zalegla ?? 0);
  }
}

/** Buduje mapę wartości pozycyjnych dla wzoru. */
export function buildWindTemplateValues(
  fields: DocField[],
  ctx: WindFillContext,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const f of fields) {
    let v = "";
    // Rachunek prowizji Finance You to nie rachunek wierzyciela ani rachunek
    // do spłaty — jak w kreatorze udzielenia pożyczki.
    if (isFinanceYouAccountField(f)) {
      values[f.id] = COMPANY_DATA.bankAccount;
      continue;
    }
    if (isCreditorParty(f)) {
      // Rachunek do spłaty: z umowy sprawy, a gdy go brak — z profilu wierzyciela.
      if (f.semantic === "bank" && ctx.rachunek) v = ctx.rachunek;
      else if (ctx.wierzyciel) v = creditorFieldValue(f, ctx.wierzyciel) ?? "";
      if (v || CREDITOR_SEMANTICS.has(f.semantic)) {
        if (v) values[f.id] = v;
        continue;
      }
    }
    switch (f.semantic) {
      case "name":
        v = isDebtorParty(f) ? ctx.dluznik : "";
        break;
      case "address":
        v = isDebtorParty(f) ? ctx.adres : "";
        break;
      case "pesel":
        v = isDebtorParty(f) ? (ctx.pesel ?? "") : "";
        break;
      case "nip":
        v = isDebtorParty(f) ? (ctx.nip ?? "") : "";
        break;
      case "idLine":
        v = isDebtorParty(f) && ctx.pesel ? `PESEL ${ctx.pesel}` : "";
        break;
      case "amount":
        v = PL_NUM(amountForField(f, ctx));
        break;
      case "amountWords":
        v = amountToWordsPLN(amountForField(f, ctx));
        break;
      case "date":
        v = /umow/i.test(f.key) ? dmy(ctx.data_umowy) : dmy(ctx.dataISO);
        break;
      case "kw":
        v = ctx.numer_kw ?? "";
        break;
      default:
        v = "";
    }
    if (v) values[f.id] = v;
  }
  return values;
}
