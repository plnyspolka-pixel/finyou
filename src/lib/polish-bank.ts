// Lokalna walidacja polskich rachunków NRB/IBAN + rozpoznawanie banku po identyfikatorze.
// Działa w pełni lokalnie — bez zewnętrznych API.

export type BankDetectResult =
  | {
      success: true;
      input: string;
      normalized: string;
      format: "NRB" | "IBAN";
      country: "PL";
      isValid: true;
      checksumValid: true;
      bankIdentifier: string;
      clearingNumber: string;
      branchIdentifier: string;
      bankName: string | null;
      message: string;
    }
  | {
      success: false;
      isValid: false;
      errorCode: "INVALID_ACCOUNT_NUMBER" | "TOO_SHORT";
      message: string;
    };

export const POLISH_BANKS: Record<string, string> = {
  "1010": "Narodowy Bank Polski",
  "1020": "PKO Bank Polski",
  "1030": "Bank Handlowy w Warszawie / Citi Handlowy",
  "1050": "ING Bank Śląski",
  "1060": "Bank BPH",
  "1090": "Santander Bank Polska",
  "1130": "Bank Gospodarstwa Krajowego",
  "1140": "mBank",
  "1160": "Bank Millennium",
  "1240": "Bank Pekao",
  "1280": "HSBC",
  "1320": "Bank Pocztowy",
  "1540": "Bank Ochrony Środowiska",
  "1580": "Mercedes-Benz Bank Polska",
  "1610": "SGB-Bank",
  "1680": "Plus Bank",
  "1840": "Societe Generale",
  "1870": "Nest Bank",
  "1930": "Bank Polskiej Spółdzielczości",
  "1940": "Credit Agricole Bank Polska",
  "2030": "BNP Paribas Bank Polska",
  "2120": "Santander Consumer Bank",
  "2160": "Toyota Bank Polska",
  "2190": "DNB Bank Polska",
  "2480": "Getin Noble Bank / VeloBank — sprawdzić aktualny status",
  "2490": "Alior Bank",
};

export function cleanAccountInput(raw: string): string {
  return (raw ?? "")
    .replace(/[\s\-]/g, "")
    .replace(/[^0-9A-Za-z]/g, "")
    .toUpperCase();
}

function ibanMod97(iban: string): number {
  // Przesuń pierwsze 4 znaki na koniec, zamień litery na liczby (A=10..Z=35), policz mod 97.
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const val = code >= 48 && code <= 57 ? ch : String(code - 55); // A=65 → 10
    for (const d of val) remainder = (remainder * 10 + (d.charCodeAt(0) - 48)) % 97;
  }
  return remainder;
}

export function detectPolishBankAccount(raw: string): BankDetectResult {
  const input = raw ?? "";
  const cleaned = cleanAccountInput(input);

  if (!cleaned) {
    return {
      success: false,
      isValid: false,
      errorCode: "TOO_SHORT",
      message: "Wpisz 26-cyfrowy numer rachunku albo IBAN.",
    };
  }

  let format: "NRB" | "IBAN";
  let nrb: string;
  let iban: string;

  if (/^PL/.test(cleaned)) {
    format = "IBAN";
    iban = cleaned;
    if (iban.length !== 28 || !/^PL\d{26}$/.test(iban)) {
      return {
        success: false,
        isValid: false,
        errorCode: "INVALID_ACCOUNT_NUMBER",
        message: "Numer rachunku bankowego jest nieprawidłowy.",
      };
    }
    nrb = iban.slice(2);
  } else if (/^\d{26}$/.test(cleaned)) {
    format = "NRB";
    nrb = cleaned;
    iban = "PL" + nrb;
  } else {
    if (/^\d+$/.test(cleaned) && cleaned.length < 26) {
      return {
        success: false,
        isValid: false,
        errorCode: "TOO_SHORT",
        message: "Wpisz 26-cyfrowy numer rachunku albo IBAN.",
      };
    }
    return {
      success: false,
      isValid: false,
      errorCode: "INVALID_ACCOUNT_NUMBER",
      message: "Numer rachunku bankowego jest nieprawidłowy.",
    };
  }

  if (ibanMod97(iban) !== 1) {
    return {
      success: false,
      isValid: false,
      errorCode: "INVALID_ACCOUNT_NUMBER",
      message: "Numer rachunku bankowego jest nieprawidłowy.",
    };
  }

  const clearingNumber = nrb.slice(2, 10);
  const bankIdentifier = nrb.slice(2, 6);
  const branchIdentifier = nrb.slice(6, 10);
  const bankName = POLISH_BANKS[bankIdentifier] ?? null;

  return {
    success: true,
    input,
    normalized: format === "IBAN" ? iban : nrb,
    format,
    country: "PL",
    isValid: true,
    checksumValid: true,
    bankIdentifier,
    clearingNumber,
    branchIdentifier,
    bankName,
    message: bankName
      ? `Bank: ${bankName}`
      : "Numer rachunku jest poprawny, ale bank nie został rozpoznany.",
  };
}

export function formatAccountGroups(nrbOrIban: string): string {
  const c = cleanAccountInput(nrbOrIban);
  if (/^PL\d{26}$/.test(c))
    return c.replace(
      /^(PL)(\d{2})(\d{4})(\d{4})(\d{4})(\d{4})(\d{4})(\d{4})$/,
      "$1$2 $3 $4 $5 $6 $7 $8",
    );
  if (/^\d{26}$/.test(c))
    return c.replace(/^(\d{2})(\d{4})(\d{4})(\d{4})(\d{4})(\d{4})(\d{4})$/, "$1 $2 $3 $4 $5 $6 $7");
  return nrbOrIban;
}

export function maskAccount(nrbOrIban: string): string {
  const c = cleanAccountInput(nrbOrIban);
  const digits = c.startsWith("PL") ? c.slice(2) : c;
  if (digits.length < 10) return formatAccountGroups(c);
  const head = digits.slice(0, 6);
  const tail = digits.slice(-4);
  const masked = `${head.slice(0, 2)} ${head.slice(2, 6)} **** **** **** **** ${tail}`;
  return c.startsWith("PL") ? `PL ${masked}` : masked;
}

export function logSafeAccount(nrbOrIban: string): string {
  const c = cleanAccountInput(nrbOrIban);
  return c ? `****${c.slice(-4)}` : "";
}
