// Parser i walidacja numeru PESEL — czysta, deterministyczna logika.
// PESEL koduje datę urodzenia, płeć oraz cyfrę kontrolną. Wykorzystujemy to
// do wyznaczenia wieku i płci właściciela nieruchomości na potrzeby
// aktuarialnej oceny ryzyka (dalsze trwanie życia, ryzyko sukcesji).
//
// UWAGA: dane wrażliwe (RODO). Ten moduł nie przechowuje PESEL — jedynie
// wyprowadza z niego cechy statystyczne (data urodzenia, płeć, wiek).

export type Sex = "M" | "K";

export interface PeselInfo {
  valid: boolean;
  /** ISO date YYYY-MM-DD lub null, gdy nie udało się wyznaczyć daty. */
  birthDate: string | null;
  sex: Sex | null;
  /** Wiek w pełnych latach na dzień odniesienia (domyślnie dziś). */
  age: number | null;
  /** Powód odrzucenia, gdy valid=false. */
  error?: string;
}

// Kodowanie stulecia w cyfrach miesiąca (PESEL):
//   1800–1899: +80, 1900–1999: +0, 2000–2099: +20, 2100–2199: +40, 2200–2299: +60
function decodeCentury(monthField: number): { century: number; month: number } | null {
  if (monthField >= 1 && monthField <= 12) return { century: 1900, month: monthField };
  if (monthField >= 21 && monthField <= 32) return { century: 2000, month: monthField - 20 };
  if (monthField >= 41 && monthField <= 52) return { century: 2100, month: monthField - 40 };
  if (monthField >= 61 && monthField <= 72) return { century: 2200, month: monthField - 60 };
  if (monthField >= 81 && monthField <= 92) return { century: 1800, month: monthField - 80 };
  return null;
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function validChecksum(digits: number[]): boolean {
  const weights = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
  const sum = weights.reduce((acc, w, i) => acc + w * digits[i], 0);
  const control = (10 - (sum % 10)) % 10;
  return control === digits[10];
}

/**
 * Parsuje i waliduje PESEL. `referenceDate` pozwala wyznaczyć wiek na konkretny dzień
 * (przydatne w testach oraz przy wycenach historycznych).
 */
export function parsePesel(raw: string | null | undefined, referenceDate?: Date): PeselInfo {
  const s = (raw ?? "").replace(/\s+/g, "");
  if (!/^\d{11}$/.test(s)) {
    return {
      valid: false,
      birthDate: null,
      sex: null,
      age: null,
      error: "PESEL musi mieć 11 cyfr.",
    };
  }
  const digits = s.split("").map((c) => Number(c));

  const yy = digits[0] * 10 + digits[1];
  const monthField = digits[2] * 10 + digits[3];
  const day = digits[4] * 10 + digits[5];

  const century = decodeCentury(monthField);
  if (!century) {
    return {
      valid: false,
      birthDate: null,
      sex: null,
      age: null,
      error: "Nieprawidłowe kodowanie miesiąca/stulecia.",
    };
  }
  const year = century.century + yy;
  if (!isRealDate(year, century.month, day)) {
    return {
      valid: false,
      birthDate: null,
      sex: null,
      age: null,
      error: "Zakodowana data urodzenia nie istnieje.",
    };
  }
  if (!validChecksum(digits)) {
    return {
      valid: false,
      birthDate: null,
      sex: null,
      age: null,
      error: "Błędna cyfra kontrolna.",
    };
  }

  // 10. cyfra (indeks 9): nieparzysta → mężczyzna, parzysta → kobieta.
  const sex: Sex = digits[9] % 2 === 1 ? "M" : "K";
  const birthDate = `${year.toString().padStart(4, "0")}-${String(century.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const age = computeAge(birthDate, referenceDate);

  return { valid: true, birthDate, sex, age };
}

/** Wiek w pełnych latach na dzień odniesienia (domyślnie: teraz). */
export function computeAge(birthDateIso: string, referenceDate?: Date): number | null {
  const bd = new Date(`${birthDateIso}T00:00:00Z`);
  if (Number.isNaN(bd.getTime())) return null;
  const ref = referenceDate ?? new Date();
  let age = ref.getUTCFullYear() - bd.getUTCFullYear();
  const beforeBirthday =
    ref.getUTCMonth() < bd.getUTCMonth() ||
    (ref.getUTCMonth() === bd.getUTCMonth() && ref.getUTCDate() < bd.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age <= 130 ? age : null;
}

export function sexLabel(sex: Sex | null): string {
  if (sex === "M") return "mężczyzna";
  if (sex === "K") return "kobieta";
  return "nieznana";
}
