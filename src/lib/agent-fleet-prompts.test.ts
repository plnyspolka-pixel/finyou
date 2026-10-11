// Twarde zasady w promptach floty agentów: to, co prompt MUSI zawierać
// (ujawnienie AI, nagrywanie tylko w głosie, ceny tylko z narzędzia, STOP),
// i czego NIE może (obietnice zysku, numery spoza listy, zachęta do PESEL).
// Test nie ocenia jakości rozmowy — od tego są testy symulacyjne w
// ElevenLabs (docs/agents/scenariusze-testowe.md).
import { describe, expect, it } from "vitest";
import {
  TRIAGE_FIRST_MESSAGE_TEXT,
  TRIAGE_FIRST_MESSAGE_VOICE,
  TRIAGE_INTENTS,
  buildTriagePrompt,
} from "./triage-agent-prompt";
import {
  INVESTOR_OBJECTIONS,
  INVESTOR_PRESALE_FIRST_MESSAGE_TEXT,
  INVESTOR_PRESALE_FIRST_MESSAGE_VOICE,
  buildInvestorPresalePrompt,
} from "./investor-presale-prompt";
import {
  WIND_INBOUND_APPENDIX,
  WIND_TEXT_OPENERS,
  WIND_TEXT_PLACEHOLDERS,
  WIND_TEXT_VARIABLE_NAMES,
  buildWindTextPrompt,
} from "./windykacja-text-agent-prompt";
import { WIND_AGENT_VARIABLE_NAMES } from "./windykacja-agent-prompt";
import { COMPANY_DATA } from "./company";

const ALL = {
  "recepcja/głos": buildTriagePrompt("voice"),
  "recepcja/tekst": buildTriagePrompt("text"),
  "inwestor/głos": buildInvestorPresalePrompt("voice"),
  "inwestor/tekst": buildInvestorPresalePrompt("text"),
  "windykacja/tekst": buildWindTextPrompt(),
  "windykacja/przychodząca": WIND_INBOUND_APPENDIX,
};

/** Numery telefonów w tekście (9+ cyfr, z odstępami), po normalizacji do 9 cyfr krajowych. */
function phoneNumbers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/(?:\+?48[ -]?)?(?:\d[ -]?){9}/g)) {
    const d = m[0].replace(/\D/g, "");
    out.push(d.length === 11 && d.startsWith("48") ? d.slice(2) : d);
  }
  return out;
}

const ALLOWED_PHONES = new Set([
  COMPANY_DATA.phone.e164.replace(/^\+48/, ""),
  "800702222", // Centrum Wsparcia — wyłącznie w sytuacji zagrożenia życia
]);

describe("prompty floty — wspólne bezpieczniki", () => {
  for (const [name, prompt] of Object.entries(ALL)) {
    it(`${name}: tylko dozwolone numery telefonów`, () => {
      for (const p of phoneNumbers(prompt)) expect(ALLOWED_PHONES, `numer ${p}`).toContain(p);
    });

    it(`${name}: bez obietnic zysku i bezpieczeństwa`, () => {
      const lower = prompt.toLowerCase();
      // Słowa mogą paść wyłącznie w zakazie („nie używasz słów …”) — sprawdzamy,
      // że żadne nie stoi w zdaniu twierdzącym o naszej ofercie.
      for (const phrase of ["gwarantujemy", "zarobisz", "pewny zysk", "bez ryzyka dla", "na pewno dostanie"]) {
        expect(lower).not.toContain(phrase);
      }
    });

    it(`${name}: nie prosi o PESEL ani numer dowodu`, () => {
      // „nie prosisz o PESEL” to zakaz — wykrywamy wyłącznie prośbę twierdzącą.
      expect(prompt).not.toMatch(/(?<!nie )(?<!NIGDY nie )prosisz o (?:PESEL|numer dowodu)/i);
    });

    it(`${name}: nie ma nierozwiniętych interpolacji JS`, () => {
      expect(prompt).not.toMatch(/\$\{|undefined|\[object Object\]/);
    });
  }
});

describe("recepcja (A0)", () => {
  it("rozpoznaje wszystkie sześć potrzeb i ma trasę dla każdej", () => {
    const p = buildTriagePrompt("voice");
    expect(TRIAGE_INTENTS).toHaveLength(6);
    for (const i of TRIAGE_INTENTS) expect(p).toContain(i.label);
  });

  it("ujawnia AI w obu kanałach, a nagrywanie tylko w głosie", () => {
    expect(TRIAGE_FIRST_MESSAGE_VOICE).toMatch(/asystent AI/);
    expect(TRIAGE_FIRST_MESSAGE_VOICE).toMatch(/nagrywana/);
    expect(TRIAGE_FIRST_MESSAGE_TEXT).toMatch(/asystent AI/);
    expect(TRIAGE_FIRST_MESSAGE_TEXT).not.toMatch(/nagryw/);
    expect(buildTriagePrompt("text")).toContain("Nie wspominasz o nagrywaniu");
  });

  it("niczego nie ujawnia i zapisuje potrzeby przed przełączeniem", () => {
    const p = buildTriagePrompt("text");
    expect(p).toContain("Recepcja niczego nie ujawnia");
    expect(p).toMatch(/save_needs[\s\S]*transfer_to_agent/);
    expect(p).toContain("identify_caller");
  });
});

describe("presale inwestora (A2P)", () => {
  const voice = buildInvestorPresalePrompt("voice");
  const text = buildInvestorPresalePrompt("text");

  it("ceny wyłącznie z narzędzia — prompt nie zawiera kwot abonamentu", () => {
    for (const p of [voice, text]) {
      expect(p).toContain("WYŁĄCZNIE z narzędzia get_pricing");
      expect(p).not.toMatch(/1 ?500 ?zł|7 ?000 ?zł/);
    }
  });

  it("rozpoznanie potrzeb jest rdzeniem i trafia do save_investor_needs", () => {
    expect(voice).toContain("ROZPOZNANIE POTRZEB — RDZEŃ ROZMOWY");
    for (const field of ["ticket_pln", "horizon_months", "decision_role", "experience"]) {
      expect(voice).toContain(field);
    }
  });

  it("każda obiekcja ma odpowiedź w prompcie", () => {
    expect(INVESTOR_OBJECTIONS.length).toBeGreaterThanOrEqual(10);
    for (const o of INVESTOR_OBJECTIONS) expect(voice).toContain(o.key);
  });

  it("ujawnienie AI, nagrywanie tylko w głosie", () => {
    expect(INVESTOR_PRESALE_FIRST_MESSAGE_VOICE).toMatch(/asystent AI.*nagrywana/);
    expect(INVESTOR_PRESALE_FIRST_MESSAGE_TEXT).toMatch(/asystent AI/);
    expect(INVESTOR_PRESALE_FIRST_MESSAGE_TEXT).not.toMatch(/nagryw/);
  });

  it("jedyne liczby procentowe to limit LTV i odsetek maksymalnych", () => {
    const percents = [...voice.matchAll(/(\d+(?:,\d+)?)\s?%/g)].map((m) => m[1]);
    for (const p of percents) expect(["60", "14,5"]).toContain(p);
  });
});

describe("windykacja tekstowa (A4T) i rozmowa przychodząca (A4)", () => {
  const p = buildWindTextPrompt();

  it("bez nagrywania, z ujawnieniem AI i obsługą STOP", () => {
    expect(p).not.toMatch(/nagryw/);
    expect(p).toContain("asystentem AI Finance You");
    expect(p).toContain("„STOP”");
    expect(p).toContain("prosba_nie_dzwonic");
  });

  it("korzysta z kompletu zmiennych telefonu i ma placeholdery dla wszystkich", () => {
    for (const v of WIND_AGENT_VARIABLE_NAMES) expect(p).toContain(`{{${v}}}`);
    for (const v of WIND_TEXT_VARIABLE_NAMES) expect(WIND_TEXT_PLACEHOLDERS[v]).toBeTruthy();
  });

  it("dane sprawy dopiero po verify_identity, rachunek tylko z akt", () => {
    expect(p).toMatch(/WYŁĄCZNIE po udanym verify_identity/);
    expect(p).toContain("get_payment_instructions");
    expect(p).toContain("Nigdy nie podajesz innego rachunku");
  });

  it("zakazane słownictwo pada co najwyżej w zakazie", () => {
    for (const word of ["dłużnik", "BIG", "KRD", "BIK"]) expect(p).not.toContain(word);
    // groźby wymienione wyłącznie w sekcji „CZEGO NIE ROBISZ”
    const forbiddenSection = p.slice(p.indexOf("=== CZEGO NIE ROBISZ NIGDY ==="));
    for (const word of ["policji", "prokuratury", "więzienia"]) {
      expect(p.indexOf(word)).toBe(p.length - forbiddenSection.length + forbiddenSection.indexOf(word));
    }
  });

  it("otwarcia systemowe bez kwot i bez słowa „zaległość”", () => {
    for (const opener of Object.values(WIND_TEXT_OPENERS)) {
      expect(opener).not.toMatch(/\d/);
      expect(opener.toLowerCase()).not.toContain("zaległ");
    }
    expect(WIND_TEXT_OPENERS.sms).toContain("STOP");
  });

  it("dodatek przychodzący: tożsamość → akta → zapis deklaracji, bez PESEL", () => {
    expect(WIND_INBOUND_APPENDIX).toMatch(/verify_identity[\s\S]*get_collection_case[\s\S]*record_payment_promise/);
    expect(WIND_INBOUND_APPENDIX).toContain("Nigdy nie prosisz o PESEL");
  });
});
