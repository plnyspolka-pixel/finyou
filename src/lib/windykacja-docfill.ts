// ════════════════════════════════════════════════════════════════════
// AUTO-UZUPEŁNIANIE gotowych szablonów DOCX z Kreatora dokumentów danymi
// sprawy windykacyjnej. Mapuje pola wzoru (DocField) na wartości pozycyjne
// (indeks wystąpienia → wartość), zgodne z `generateDocxFromTemplate`.
//
// Wierzyciel = Finance You (strona „pożyczkodawca/wierzyciel").
// Dłużnik    = pożyczkobiorca ze sprawy (strona „pożyczkobiorca/dłużnik").
// Puste wartości są pomijane — odpowiadające tokeny [KLUCZ] zostają we wzorze
// do ręcznego uzupełnienia.
// ════════════════════════════════════════════════════════════════════

import type { DocField } from "./document-fields";
import { amountKind } from "./document-fields";
import { amountToWordsPLN } from "./amount-to-words-pl";

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

/** Dane Finance You jako wierzyciela (uzupełniane w pisma windykacyjne). */
export const FY_CREDITOR = {
  name: "Finance You sp. z o.o.",
  legalForm: "spółka z ograniczoną odpowiedzialnością",
  representative: "Filip Bielak – Prezes Zarządu",
};

export interface WindFillContext {
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
    switch (f.semantic) {
      case "name":
        v = isDebtorParty(f) ? ctx.dluznik : isCreditorParty(f) ? FY_CREDITOR.name : "";
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
      case "bank":
        v = isCreditorParty(f) ? (ctx.rachunek ?? "") : "";
        break;
      case "legalForm":
        v = isCreditorParty(f) ? FY_CREDITOR.legalForm : "";
        break;
      case "representative":
        v = isCreditorParty(f) ? FY_CREDITOR.representative : "";
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
