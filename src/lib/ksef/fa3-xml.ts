// Generator XML faktury ustrukturyzowanej FA(3) dla KSeF 2.0.
// Zgodny ze schematem schemat_FA(3)_v1-0E.xsd (CIRFMF/ksef-docs); testy walidują
// wynik względem tego XSD. Zakres: faktura VAT (RodzajFaktury=VAT) w PLN, stawki
// 23/8/5/0 KR/zw, zwolnienie przedmiotowe (art. 43) i podmiotowe (art. 113),
// nabywca z NIP, zagraniczny albo bez identyfikatora (konsument).

export const FA3_NAMESPACE = "http://crd.gov.pl/wzor/2025/06/25/13775/";
export const FA3_FORM_CODE = { systemCode: "FA (3)", schemaVersion: "1-0E", value: "FA" } as const;

/** Stawki przyjmowane przez platformę → kod P_12 w FA(3). */
const RATE_CODES: Record<string, string> = {
  "23": "23",
  "22": "22",
  "8": "8",
  "7": "7",
  "5": "5",
  "0": "0 KR",
  "0 KR": "0 KR",
  zw: "zw",
};

export type Fa3Line = {
  name: string;
  quantity: number;
  unit?: string | null;
  unitNet: number;
  vatRate: string;
  /** Wartości pozycji, jeśli policzone przy tworzeniu faktury (dokładniejsze niż qty × unitNet). */
  net?: number;
  vat?: number;
};

export type Fa3Seller = {
  legal_name: string;
  nip: string | null | undefined;
  address_street?: string | null;
  address_postal_code?: string | null;
  address_city?: string | null;
  address_country?: string | null;
  email?: string | null;
  bank_account?: string | null;
  regon?: string | null;
};

export type Fa3Invoice = {
  invoice_number: string;
  issue_date: string;
  sale_date?: string | null;
  due_date?: string | null;
  currency: string;
  buyer_name?: string | null;
  buyer_nip?: string | null;
  buyer_street?: string | null;
  buyer_postal_code?: string | null;
  buyer_city?: string | null;
  buyer_country?: string | null;
  buyer_email?: string | null;
  items: Fa3Line[];
  /** Podstawa zwolnienia (P_19A) — wymagana, gdy jakakolwiek pozycja ma stawkę `zw`. */
  vat_exemption_basis?: string | null;
  /** Faktura do już zapłaconej należności (np. wpłata Tpay) → Zaplacono + DataZaplaty. */
  paid_date?: string | null;
  /** Moment wygenerowania (DataWytworzeniaFa); domyślnie teraz. */
  generated_at?: Date;
};

const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function esc(s: unknown): string {
  return (
    String(s ?? "")
      // Znaki niedozwolone w XML 1.0 i odrzucane przez KSeF (weryfikacja-faktury.md).
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u0084\u0086-\u009F]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Kwota: dokładnie 2 miejsca po przecinku (TKwotowy). */
function amt(n: number): string {
  const v = round2(n);
  return (Object.is(v, -0) ? 0 : v).toFixed(2);
}

/** Liczba z maks. `digits` miejscami po przecinku, bez zbędnych zer (TIlosci / TKwotowy2). */
function dec(n: number, digits: number): string {
  const s = Number(n).toFixed(digits);
  return s.includes(".") ? s.replace(/\.?0+$/, "") : s;
}

/** Tylko cyfry NIP (bez „PL”, myślników, spacji). */
export function normalizeNip(nip: string | null | undefined): string {
  return String(nip ?? "")
    .toUpperCase()
    .replace(/^PL/, "")
    .replace(/[^0-9]/g, "");
}

/** Suma kontrolna NIP (KSeF sprawdza ją na produkcji). */
export function isValidNip(nip: string | null | undefined): boolean {
  const d = normalizeNip(nip);
  if (!/^[1-9]((\d[1-9])|([1-9]\d))\d{7}$/.test(d)) return false;
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = w.reduce((a, x, i) => a + x * Number(d[i]), 0);
  return sum % 11 === Number(d[9]);
}

export function rateCode(rate: string): string {
  const code = RATE_CODES[String(rate).trim()];
  if (!code)
    throw new Error(
      `Stawka VAT „${rate}” nie jest obsługiwana w KSeF (dozwolone: 23, 8, 5, 0, zw).`,
    );
  return code;
}

type Group = { net: number; vat: number };

/** Wiersze FA + sumy wg stawek. Wartości pozycji: zapisane `net`/`vat` albo qty × cena. */
export function computeFa3Totals(items: Fa3Line[]) {
  const lines = items.map((it) => {
    const code = rateCode(it.vatRate);
    const pct = /^\d+$/.test(code) ? Number(code) : 0;
    const net = round2(it.net ?? it.quantity * it.unitNet);
    const vat = round2(it.vat ?? (net * pct) / 100);
    return { ...it, code, net, vat };
  });
  const groups: Record<string, Group> = {};
  for (const l of lines) {
    const g = (groups[l.code] ??= { net: 0, vat: 0 });
    g.net = round2(g.net + l.net);
    g.vat = round2(g.vat + l.vat);
  }
  const gross = round2(lines.reduce((a, l) => a + l.net + l.vat, 0));
  return { lines, groups, gross };
}

/**
 * Sprawdza dane przed nadaniem numeru i wysyłką. Zwraca listę problemów
 * (pusta = można wysyłać). Nie rzuca — wywołujący decyduje.
 */
export function validateFa3(inv: Omit<Fa3Invoice, "invoice_number">, seller: Fa3Seller): string[] {
  const p: string[] = [];
  if (!isValidNip(seller.nip)) p.push("Podmiot wystawiający: brak lub nieprawidłowy NIP.");
  if (!seller.legal_name?.trim()) p.push("Podmiot wystawiający: brak pełnej nazwy.");
  if (!seller.address_street?.trim() || !seller.address_city?.trim())
    p.push("Podmiot wystawiający: uzupełnij adres (ulica i numer, kod pocztowy, miejscowość).");
  if ((inv.currency || "PLN").toUpperCase() !== "PLN")
    p.push("Wysyłka do KSeF obsługuje na razie tylko faktury w PLN.");
  if (!inv.items?.length) p.push("Faktura nie ma pozycji.");
  for (const [i, it] of (inv.items ?? []).entries()) {
    if (!it.name?.trim()) p.push(`Pozycja ${i + 1}: brak nazwy.`);
    if (!(Number(it.quantity) > 0)) p.push(`Pozycja ${i + 1}: ilość musi być dodatnia.`);
    try {
      rateCode(it.vatRate);
    } catch (e) {
      p.push(`Pozycja ${i + 1}: ${(e as Error).message}`);
    }
  }
  const hasZw = (inv.items ?? []).some((it) => String(it.vatRate).trim() === "zw");
  if (hasZw && !inv.vat_exemption_basis?.trim())
    p.push(
      "Pozycje zwolnione (zw) wymagają podstawy zwolnienia (np. „art. 43 ust. 1 pkt 38 ustawy o VAT”).",
    );
  const nip = normalizeNip(inv.buyer_nip);
  const buyerPl = (inv.buyer_country || "PL").toUpperCase() === "PL";
  if (nip && buyerPl && !isValidNip(nip)) p.push(`Nabywca: nieprawidłowy NIP ${inv.buyer_nip}.`);
  if (!inv.buyer_name?.trim()) p.push("Nabywca: brak nazwy / imienia i nazwiska.");
  return p;
}

/** Buduje XML FA(3). Rzuca, gdy dane nie przechodzą `validateFa3`. */
export function buildFa3Xml(inv: Fa3Invoice, seller: Fa3Seller): string {
  const problems = validateFa3(inv, seller);
  if (problems.length) throw new Error(problems.join(" "));
  const { lines, groups, gross } = computeFa3Totals(inv.items);
  const generated = (inv.generated_at ?? new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
  const out: string[] = [];
  const el = (tag: string, v: unknown) => out.push(`<${tag}>${esc(v)}</${tag}>`);

  out.push('<?xml version="1.0" encoding="UTF-8"?>');
  out.push(`<Faktura xmlns="${FA3_NAMESPACE}">`);
  out.push("<Naglowek>");
  out.push('<KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza>');
  el("WariantFormularza", 3);
  el("DataWytworzeniaFa", generated);
  el("SystemInfo", "Finance You");
  out.push("</Naglowek>");

  // Sprzedawca
  out.push("<Podmiot1><DaneIdentyfikacyjne>");
  el("NIP", normalizeNip(seller.nip));
  el("Nazwa", seller.legal_name);
  out.push("</DaneIdentyfikacyjne><Adres>");
  el("KodKraju", (seller.address_country || "PL").toUpperCase());
  el("AdresL1", seller.address_street);
  el("AdresL2", `${seller.address_postal_code ?? ""} ${seller.address_city ?? ""}`);
  out.push("</Adres>");
  if (seller.email?.trim()) {
    out.push("<DaneKontaktowe>");
    el("Email", seller.email.trim());
    out.push("</DaneKontaktowe>");
  }
  out.push("</Podmiot1>");

  // Nabywca
  const buyerCountry = (inv.buyer_country || "PL").toUpperCase();
  const buyerNip = normalizeNip(inv.buyer_nip);
  out.push("<Podmiot2><DaneIdentyfikacyjne>");
  if (buyerNip && buyerCountry === "PL") el("NIP", buyerNip);
  else if (inv.buyer_nip?.trim() && buyerCountry !== "PL") {
    el("KodKraju", buyerCountry);
    el("NrID", inv.buyer_nip.trim());
  } else el("BrakID", 1);
  if (inv.buyer_name?.trim()) el("Nazwa", inv.buyer_name);
  out.push("</DaneIdentyfikacyjne>");
  const buyerL1 = inv.buyer_street?.trim() || inv.buyer_city?.trim();
  if (buyerL1) {
    out.push("<Adres>");
    el("KodKraju", buyerCountry);
    el("AdresL1", buyerL1);
    const l2 = inv.buyer_street?.trim()
      ? `${inv.buyer_postal_code ?? ""} ${inv.buyer_city ?? ""}`.trim()
      : (inv.buyer_postal_code ?? "").trim();
    if (l2) el("AdresL2", l2);
    out.push("</Adres>");
  }
  if (inv.buyer_email?.trim()) {
    out.push("<DaneKontaktowe>");
    el("Email", inv.buyer_email.trim());
    out.push("</DaneKontaktowe>");
  }
  el("JST", 2);
  el("GV", 2);
  out.push("</Podmiot2>");

  // Fa
  out.push("<Fa>");
  el("KodWaluty", "PLN");
  el("P_1", inv.issue_date);
  el("P_2", inv.invoice_number);
  if (inv.sale_date && inv.sale_date !== inv.issue_date) el("P_6", inv.sale_date);
  const pair = (code: string, n13: string, n14: string) => {
    const g = groups[code];
    if (!g) return;
    el(n13, amt(g.net));
    el(n14, amt(g.vat));
  };
  // 22% to stawka historyczna — sumuje się razem z 23% w P_13_1.
  if (groups["22"]) {
    groups["23"] = {
      net: round2((groups["23"]?.net ?? 0) + groups["22"].net),
      vat: round2((groups["23"]?.vat ?? 0) + groups["22"].vat),
    };
  }
  if (groups["7"]) {
    groups["8"] = {
      net: round2((groups["8"]?.net ?? 0) + groups["7"].net),
      vat: round2((groups["8"]?.vat ?? 0) + groups["7"].vat),
    };
  }
  pair("23", "P_13_1", "P_14_1");
  pair("8", "P_13_2", "P_14_2");
  pair("5", "P_13_3", "P_14_3");
  if (groups["0 KR"]) el("P_13_6_1", amt(groups["0 KR"].net));
  if (groups["zw"]) el("P_13_7", amt(groups["zw"].net));
  el("P_15", amt(gross));

  out.push("<Adnotacje>");
  el("P_16", 2);
  el("P_17", 2);
  el("P_18", 2);
  el("P_18A", 2);
  out.push("<Zwolnienie>");
  if (groups["zw"]) {
    el("P_19", 1);
    el("P_19A", inv.vat_exemption_basis);
  } else el("P_19N", 1);
  out.push("</Zwolnienie>");
  out.push("<NoweSrodkiTransportu><P_22N>1</P_22N></NoweSrodkiTransportu>");
  el("P_23", 2);
  out.push("<PMarzy><P_PMarzyN>1</P_PMarzyN></PMarzy>");
  out.push("</Adnotacje>");
  el("RodzajFaktury", "VAT");

  lines.forEach((l, i) => {
    out.push("<FaWiersz>");
    el("NrWierszaFa", i + 1);
    el("P_7", l.name);
    el("P_8A", l.unit || "szt.");
    el("P_8B", dec(l.quantity, 6));
    el("P_9A", dec(l.unitNet, 8));
    el("P_11", amt(l.net));
    el("P_12", l.code);
    out.push("</FaWiersz>");
  });

  const nrb = String(seller.bank_account ?? "").replace(/\s+/g, "");
  if (inv.paid_date || inv.due_date || nrb) {
    out.push("<Platnosc>");
    if (inv.paid_date) {
      el("Zaplacono", 1);
      el("DataZaplaty", inv.paid_date);
    } else {
      if (inv.due_date) {
        out.push("<TerminPlatnosci>");
        el("Termin", inv.due_date);
        out.push("</TerminPlatnosci>");
      }
      el("FormaPlatnosci", 6); // przelew
      if (nrb.length >= 10 && nrb.length <= 34) {
        out.push("<RachunekBankowy>");
        el("NrRB", nrb);
        out.push("</RachunekBankowy>");
      }
    }
    out.push("</Platnosc>");
  }
  out.push("</Fa>");

  if (seller.regon && /^\d{9}(\d{5})?$/.test(seller.regon.trim())) {
    out.push("<Stopka><Rejestry>");
    el("REGON", seller.regon.trim());
    out.push("</Rejestry></Stopka>");
  }
  out.push("</Faktura>");
  return out.join("\n");
}
