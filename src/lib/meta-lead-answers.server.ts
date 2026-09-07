// Mapowanie odpowiedzi z formularzy błyskawicznych Meta na dane wniosku.
// Formularze FY zadają dwa pytania biznesowe:
//   - `typ_nieruchomosci` (mieszkanie / dom / działka rolna / działka budowlana / lokal usługowy / inna)
//   - `kwota` (kwota pożyczki, wpisywana ręcznie przez klienta)
// Bez tego mapowania wnioski z Meta lądowały ze statusem „brak kwoty".
import { mapPropertyType } from "@/lib/lead-enrichment.server";

type FieldDatum = { name?: string; values?: unknown };

function valueOf(fd: unknown, names: string[]): string | null {
  if (!Array.isArray(fd)) return null;
  for (const f of fd as FieldDatum[]) {
    const name = String(f?.name ?? "").toLowerCase();
    if (!names.some((n) => name.includes(n))) continue;
    const v = Array.isArray(f?.values) ? f.values[0] : f?.values;
    const s = v == null ? "" : String(v).trim();
    if (s) return s;
  }
  return null;
}

/** Kwota pożyczki z pola `kwota` / „ile” — akceptuje „300 000 zł", „300.000", „300000". */
export function extractLoanAmount(fd: unknown): number | null {
  const raw = valueOf(fd, ["kwota", "amount", "ile", "pozyczk", "pożyczk"]);
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Odsiej oczywiste śmieci (numer telefonu wklejony w kwotę).
  if (n > 100_000_000) return null;
  return n;
}

/** Surowa odpowiedź o typ nieruchomości (np. „lokal_uslugowy", „dom"). */
export function extractPropertyTypeRaw(fd: unknown): string | null {
  return valueOf(fd, ["typ_nieruchomosci", "nieruchomo", "property"]);
}

/**
 * Dopisuje do wniosku kwotę z formularza i tworzy wpis nieruchomości z wybranym
 * typem (bez KW — KW dochodzi później). Nie nadpisuje danych już uzupełnionych.
 */
export async function applyMetaAnswersToApplication(
  admin: any,
  loanApplicationId: string,
  fd: unknown,
): Promise<void> {
  if (!loanApplicationId) return;
  const amount = extractLoanAmount(fd);
  const typeRaw = extractPropertyTypeRaw(fd);
  if (amount == null && !typeRaw) return;

  const { data: app } = await admin
    .from("loan_applications")
    .select("id, loan_amount, status")
    .eq("id", loanApplicationId)
    .maybeSingle();
  if (!app) return;

  if (amount != null && !app.loan_amount) {
    const patch: Record<string, unknown> = { loan_amount: amount };
    if (app.status === "brak_kwoty") patch.status = "kompletowanie_danych";
    await admin.from("loan_applications").update(patch).eq("id", loanApplicationId);
  }

  if (typeRaw) {
    const { data: props } = await admin
      .from("properties")
      .select("id")
      .eq("loan_application_id", loanApplicationId)
      .limit(1);
    if (!props || props.length === 0) {
      await admin.from("properties").insert({
        loan_application_id: loanApplicationId,
        property_type: mapPropertyType(typeRaw),
      });
    }
  }
}
