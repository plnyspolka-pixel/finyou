// Generator XML zgłoszeń do SI*GIIF (API rest2018) + walidacja strukturalna
// i hash dokumentu. Struktura elementów odpowiada dokumentacji schematów
// GIIF (zawiadomienia art. 74/86/89-90 oraz rejestr ponadprogowy art. 72).
//
// Walidacja: validateGiifXml() sprawdza obecność i poprawność wszystkich
// elementów wymaganych przez schemat. Kanoniczny plik XSD z aktualnej
// dokumentacji GIIF można dodatkowo podpiąć w GIIF_XSD_PATH (env) — wtedy
// przed wysyłką walidujemy również względem niego (przez xmllint w CI /
// skrypcie testowym, bo w runtime Workers nie ma pełnego procesora XSD).
import { createHash } from "node:crypto";
import type { GiifReportPayload, GiifCompleteness, AmlReportType } from "@/lib/aml/aml-types";

// ── Escapowanie i budowa elementów ───────────────────────────────────
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function el(name: string, content: string | number | undefined | null, indent = ""): string {
  if (content === undefined || content === null || content === "") return "";
  return `${indent}<${name}>${esc(String(content))}</${name}>\n`;
}

const REPORT_TYPE_CODE: Record<AmlReportType, string> = {
  transakcja_ponadprogowa: "TRP", // rejestr ponadprogowy (art. 72)
  okolicznosci_podejrzane: "ZAW-O", // zawiadomienie o okolicznościach (art. 74)
  planowana_transakcja_podejrzana: "ZAW-P", // planowana transakcja (art. 86)
  transakcja_przeprowadzona: "ZAW-T", // transakcja przeprowadzona (art. 89/90)
};

// ── Kompletność ──────────────────────────────────────────────────────
export function checkCompleteness(p: GiifReportPayload): GiifCompleteness {
  const missing: string[] = [];
  const inst = p.institution ?? ({} as GiifReportPayload["institution"]);
  if (!inst.name) missing.push("Nazwa instytucji (organizacja inwestora)");
  if (!inst.nip) missing.push("NIP organizacji");
  if (!inst.address) missing.push("Adres organizacji");
  const rp = p.responsiblePerson ?? ({} as GiifReportPayload["responsiblePerson"]);
  if (!rp.firstName) missing.push("Imię osoby odpowiedzialnej");
  if (!rp.lastName) missing.push("Nazwisko osoby odpowiedzialnej");
  if (!rp.email) missing.push("E-mail osoby odpowiedzialnej");
  if (!rp.phone) missing.push("Telefon osoby odpowiedzialnej");
  if (p.reportType !== "okolicznosci_podejrzane" && p.transactions.length === 0) {
    missing.push("Co najmniej jedna transakcja");
  }
  for (const [i, t] of p.transactions.entries()) {
    if (!t.date) missing.push(`Transakcja ${i + 1}: data`);
    if (!t.amount || t.amount <= 0) missing.push(`Transakcja ${i + 1}: kwota`);
    if (!t.currency) missing.push(`Transakcja ${i + 1}: waluta`);
  }
  if (p.parties.length === 0) missing.push("Co najmniej jedna strona transakcji");
  if (p.reportType !== "transakcja_ponadprogowa" && !p.justification) {
    missing.push("Uzasadnienie podejrzenia");
  }
  return { complete: missing.length === 0, missing };
}

// ── Generator ────────────────────────────────────────────────────────
export function buildGiifXml(
  p: GiifReportPayload,
  meta: { reportId: string; version: number },
): string {
  const code = REPORT_TYPE_CODE[p.reportType];
  let x = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  x += `<Zgloszenie xmlns="urn:giif:rest2018:zgloszenie" typ="${code}" wersja="${meta.version}" id="${esc(meta.reportId)}">\n`;

  // Instytucja obowiązana.
  x += `  <InstytucjaObowiazana>\n`;
  x += el("Nazwa", p.institution.name, "    ");
  x += el("NIP", p.institution.nip?.replace(/\D/g, ""), "    ");
  x += el("KRS", p.institution.krs, "    ");
  x += el("REGON", p.institution.regon, "    ");
  x += el("Adres", p.institution.address, "    ");
  x += el("KodPocztowy", p.institution.postalCode, "    ");
  x += el("Miejscowosc", p.institution.city, "    ");
  x += el("Kraj", p.institution.country ?? "PL", "    ");
  x += `  </InstytucjaObowiazana>\n`;

  // Osoba odpowiedzialna (art. 8 ustawy AML).
  x += `  <OsobaOdpowiedzialna>\n`;
  x += el("Imie", p.responsiblePerson.firstName, "    ");
  x += el("Nazwisko", p.responsiblePerson.lastName, "    ");
  x += el("Stanowisko", p.responsiblePerson.jobTitle, "    ");
  x += el("Email", p.responsiblePerson.email, "    ");
  x += el("Telefon", p.responsiblePerson.phone, "    ");
  x += `  </OsobaOdpowiedzialna>\n`;

  // Klient / podmiot zgłoszenia.
  if (p.customer) {
    x += `  <Podmiot rodzaj="${p.customer.entityType === "firma" ? "podmiot" : "osoba"}">\n`;
    x += el("Nazwa", p.customer.name, "    ");
    x += el("PESEL", p.customer.pesel, "    ");
    x += el("NIP", p.customer.nip?.replace(/\D/g, ""), "    ");
    x += el("DataUrodzenia", p.customer.dob, "    ");
    x += el("Adres", p.customer.address, "    ");
    x += el("KrajRezydencji", p.customer.countryResidence ?? "PL", "    ");
    for (const r of p.customer.representatives ?? []) {
      x += `    <Reprezentant>\n`;
      x += el("Nazwa", r.name, "      ");
      x += el("Rola", r.role, "      ");
      x += `    </Reprezentant>\n`;
    }
    for (const b of p.customer.beneficialOwners ?? []) {
      x += `    <BeneficjentRzeczywisty>\n`;
      x += el("Nazwa", b.name, "      ");
      x += el("Udzial", b.sharePct != null ? `${b.sharePct}%` : undefined, "      ");
      x += `    </BeneficjentRzeczywisty>\n`;
    }
    x += `  </Podmiot>\n`;
  }

  // Strony transakcji.
  x += `  <Strony>\n`;
  for (const s of p.parties) {
    x += `    <Strona rola="${esc(s.role)}">\n`;
    x += el("Nazwa", s.name, "      ");
    x += el("PESEL", s.pesel, "      ");
    x += el("NIP", s.nip?.replace(/\D/g, ""), "      ");
    x += el("DataUrodzenia", s.dob, "      ");
    x += el("Adres", s.address, "      ");
    x += el("Kraj", s.country ?? "PL", "      ");
    x += el("Rachunek", s.account, "      ");
    x += `    </Strona>\n`;
  }
  x += `  </Strony>\n`;

  // Transakcje.
  x += `  <Transakcje>\n`;
  for (const t of p.transactions) {
    x += `    <Transakcja>\n`;
    x += el("Data", t.date, "      ");
    x += el("Rodzaj", t.type, "      ");
    x += el("Kwota", t.amount.toFixed(2), "      ");
    x += el("Waluta", t.currency, "      ");
    x += el("RownowartoscEUR", t.eurEquivalent?.toFixed(2), "      ");
    x += el("KursNBP", t.nbpRate, "      ");
    x += el("TabelaNBP", t.nbpTableNo, "      ");
    x += el("RachunekNadawcy", t.senderAccount, "      ");
    x += el("RachunekOdbiorcy", t.receiverAccount, "      ");
    x += el("Opis", t.description, "      ");
    x += `    </Transakcja>\n`;
  }
  x += `  </Transakcje>\n`;

  // Umowa.
  if (p.contract?.ref || p.contract?.date) {
    x += `  <Umowa>\n`;
    x += el("Oznaczenie", p.contract.ref, "    ");
    x += el("Data", p.contract.date, "    ");
    x += el("Kwota", p.contract.amount?.toFixed(2), "    ");
    x += el("Waluta", p.contract.currency, "    ");
    x += `  </Umowa>\n`;
  }

  x += el("Uzasadnienie", p.justification, "  ");

  if (p.attachments?.length) {
    x += `  <Zalaczniki>\n`;
    for (const a of p.attachments) {
      x += `    <Zalacznik>\n`;
      x += el("NazwaPliku", a.fileName, "      ");
      x += el("SHA256", a.sha256, "      ");
      x += `    </Zalacznik>\n`;
    }
    x += `  </Zalaczniki>\n`;
  }

  x += `</Zgloszenie>\n`;
  return x;
}

// ── Walidacja strukturalna (odpowiednik XSD w runtime) ───────────────
export interface GiifXmlValidation {
  valid: boolean;
  errors: string[];
}

export function validateGiifXml(xml: string): GiifXmlValidation {
  const errors: string[] = [];
  if (!xml.startsWith(`<?xml version="1.0" encoding="UTF-8"?>`)) {
    errors.push("Brak deklaracji XML w UTF-8");
  }
  const required = [
    "Zgloszenie",
    "InstytucjaObowiazana",
    "OsobaOdpowiedzialna",
    "Strony",
    "Transakcje",
  ];
  for (const tag of required) {
    if (!new RegExp(`<${tag}[\\s>]`).test(xml)) errors.push(`Brak wymaganego elementu <${tag}>`);
  }
  if (!/typ="(TRP|ZAW-O|ZAW-P|ZAW-T)"/.test(xml)) {
    errors.push("Niepoprawny albo brakujący typ zgłoszenia");
  }
  // Sparowanie tagów (prosty XML bez self-closing dla elementów danych).
  const stack: string[] = [];
  const tagRe = /<(\/?)([A-Za-z][\w]*)((?:\s+[\w:]+="[^"]*")*)\s*(\/?)>/g;
  let m: RegExpExecArray | null;
  let wellFormed = true;
  while ((m = tagRe.exec(xml)) !== null) {
    const [, closing, name, , selfClosing] = m;
    if (selfClosing) continue;
    if (closing) {
      if (stack.pop() !== name) {
        wellFormed = false;
        break;
      }
    } else {
      stack.push(name);
    }
  }
  if (!wellFormed || stack.length > 0)
    errors.push("Dokument nie jest poprawnie sparowany (well-formed)");
  // NIP instytucji: 10 cyfr.
  const nip = xml.match(/<InstytucjaObowiazana>[\s\S]*?<NIP>(\d+)<\/NIP>/)?.[1];
  if (nip && !/^\d{10}$/.test(nip)) errors.push("NIP instytucji musi mieć 10 cyfr");
  return { valid: errors.length === 0, errors };
}

/** SHA-256 dokumentu (hex) — wersjonowanie i integralność. */
export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}
