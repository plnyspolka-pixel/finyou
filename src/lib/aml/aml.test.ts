// Testy jednostkowe modułu AML: generator/walidator XML GIIF, hash,
// przeliczenie progu EUR, propozycja ryzyka, PDF i zawiadomienie papierowe.
import { describe, it, expect } from "vitest";
import {
  buildGiifXml,
  validateGiifXml,
  checkCompleteness,
  sha256Hex,
} from "@/lib/aml/giif-xml.server";
import { toEurEquivalent } from "@/lib/aml/nbp-eur.server";
import { proposeRiskLevel } from "@/lib/aml/risk-proposal";
import { buildPdfBytes } from "@/lib/aml/giif-pdf.server";
import { buildGiifPaperNoticeHtml, paperAllowedFor } from "@/lib/aml/giif-paper";
import {
  AML_THRESHOLD_EUR,
  readinessFromStatus,
  statusFromReadiness,
  type GiifReportPayload,
} from "@/lib/aml/aml-types";

const PAYLOAD: GiifReportPayload = {
  reportType: "transakcja_ponadprogowa",
  institution: {
    name: "Testowy Inwestor Sp. z o.o.",
    nip: "1234567890",
    address: "ul. Przykładowa 1",
    city: "Warszawa",
    postalCode: "00-001",
    country: "PL",
  },
  responsiblePerson: {
    firstName: "Jan",
    lastName: "Kowalski",
    email: "jan@example.com",
    phone: "+48 600 000 000",
  },
  customer: {
    name: "Klient Testowy",
    entityType: "osoba_fizyczna",
    pesel: "90010112345",
    countryResidence: "PL",
  },
  parties: [{ role: "klient", name: "Klient Testowy", country: "PL" }],
  transactions: [
    {
      date: "2026-07-15",
      type: "wplata_gotowkowa",
      amount: 70000,
      currency: "PLN",
      eurEquivalent: 16400.12,
      nbpRate: 4.2683,
      nbpTableNo: "135/A/NBP/2026",
    },
  ],
  justification: "Transakcja gotówkowa przekraczająca równowartość 15 000 EUR.",
};

describe("GIIF XML", () => {
  it("generuje poprawny, kompletny i walidowalny XML", () => {
    const completeness = checkCompleteness(PAYLOAD);
    expect(completeness.complete).toBe(true);

    const xml = buildGiifXml(PAYLOAD, { reportId: "r-1", version: 1 });
    expect(xml).toContain('typ="TRP"');
    expect(xml).toContain("<NIP>1234567890</NIP>");
    expect(xml).toContain("<RownowartoscEUR>16400.12</RownowartoscEUR>");

    const validation = validateGiifXml(xml);
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it("wykrywa braki kompletności", () => {
    const incomplete = {
      ...PAYLOAD,
      institution: { ...PAYLOAD.institution, nip: "" },
      parties: [],
    };
    const c = checkCompleteness(incomplete);
    expect(c.complete).toBe(false);
    expect(c.missing.join(" ")).toContain("NIP");
  });

  it("escapuje znaki specjalne i pozostaje well-formed", () => {
    const withSpecial = {
      ...PAYLOAD,
      justification: 'Podejrzenie <structuring> & "smurfing"',
    };
    const xml = buildGiifXml(withSpecial, { reportId: "r-2", version: 1 });
    expect(xml).toContain("&lt;structuring&gt; &amp; &quot;smurfing&quot;");
    expect(validateGiifXml(xml).valid).toBe(true);
  });

  it("liczy stabilny hash SHA-256", () => {
    const xml = buildGiifXml(PAYLOAD, { reportId: "r-1", version: 1 });
    expect(sha256Hex(xml)).toBe(sha256Hex(xml));
    expect(sha256Hex(xml)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("próg 15 000 EUR", () => {
  it("przelicza PLN na EUR po kursie NBP", () => {
    expect(toEurEquivalent(64024.5, "PLN", 4.2683)).toBeCloseTo(15000.0, 1);
    expect(toEurEquivalent(64024.5, "PLN", 4.2683) > AML_THRESHOLD_EUR).toBe(false);
    expect(toEurEquivalent(70000, "PLN", 4.2683) > AML_THRESHOLD_EUR).toBe(true);
  });
  it("EUR pozostaje 1:1", () => {
    expect(toEurEquivalent(16000, "EUR", 4.2683)).toBe(16000);
  });
  it("odrzuca nieobsługiwaną walutę", () => {
    expect(() => toEurEquivalent(100, "USD", 4.2)).toThrow();
  });
});

describe("propozycja ryzyka", () => {
  it("sankcja → nieakceptowalne", () => {
    expect(proposeRiskLevel({ sanctionHit: true }).level).toBe("unacceptable");
  });
  it("PEP + kraj wysokiego ryzyka → wysokie", () => {
    const p = proposeRiskLevel({ pepStatus: true, countryResidence: "IR" });
    expect(p.level).toBe("high");
    expect(p.factors.length).toBeGreaterThanOrEqual(2);
  });
  it("czysty profil krajowy → niskie", () => {
    expect(proposeRiskLevel({ countryResidence: "PL", countryActivity: "PL" }).level).toBe("low");
  });
});

describe("PDF", () => {
  it("buduje strukturalnie poprawny PDF", () => {
    const bytes = buildPdfBytes(["ZGLOSZENIE GIIF", "Linia testowa", "Zażółć gęślą jaźń"]);
    const s = String.fromCharCode(...bytes.slice(0, 8));
    expect(s.startsWith("%PDF-1.4")).toBe(true);
    const tail = String.fromCharCode(...bytes.slice(-40));
    expect(tail).toContain("%%EOF");
  });
});

describe("zawiadomienie papierowe", () => {
  const SAR: GiifReportPayload = {
    ...PAYLOAD,
    reportType: "okolicznosci_podejrzane",
    justification: "Klient <b>odmówił</b> wskazania źródła środków.",
  };

  it("zawiera adresata GIIF, podstawę prawną, przyczynę i miejsce na podpis", () => {
    const html = buildGiifPaperNoticeHtml(SAR, {
      reportId: "00000000-0000-0000-0000-000000000001",
      version: 2,
      reason: "brak kwalifikowanego podpisu elektronicznego",
      date: "29.09.2026",
    });
    expect(html).toContain("ul. Świętokrzyska 12");
    expect(html).toContain("art. 74 ust. 1");
    expect(html).toContain("Dz.U. z 2025 r. poz. 644");
    expect(html).toContain("brak kwalifikowanego podpisu elektronicznego");
    expect(html).toContain("podpis własnoręczny");
    expect(html).toContain("Jan Kowalski");
    // Treść użytkownika jest escapowana.
    expect(html).toContain("&lt;b&gt;odmówił&lt;/b&gt;");
    expect(html).not.toContain("<b>odmówił</b>");
  });

  it("nie dopuszcza papieru dla transakcji ponadprogowych (art. 72)", () => {
    expect(paperAllowedFor("transakcja_ponadprogowa")).toBe(false);
    expect(paperAllowedFor("okolicznosci_podejrzane")).toBe(true);
    expect(paperAllowedFor("planowana_transakcja_podejrzana")).toBe(true);
  });
});

describe("gotowość do wysyłki w SI*GIIF", () => {
  it("mapuje deklaracje inwestora na status i z powrotem", () => {
    const cases = [
      { hasQualifiedSignature: false, registeredInSiGiif: false },
      { hasQualifiedSignature: true, registeredInSiGiif: false },
      { hasQualifiedSignature: true, registeredInSiGiif: true },
    ];
    for (const r of cases) expect(readinessFromStatus(statusFromReadiness(r))).toEqual(r);
    expect(statusFromReadiness(cases[0])).toBe("not_connected");
    expect(statusFromReadiness(cases[2])).toBe("active");
    // Stare statusy z usuniętego kreatora mTLS nie oznaczają gotowości.
    expect(readinessFromStatus("csr_generated")).toEqual(cases[0]);
  });
});
