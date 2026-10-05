import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  capacityLabel,
  deriveEnvelopeStatus,
  eventHash,
  formatSignedAt,
  maskDocumentNumber,
  maskEmail,
  maskPhone,
  missingStatements,
  namesMatch,
  nextSignersToInvite,
  normalizeName,
  randomOtp,
  randomToken,
  randomVerifyCode,
  requiredStatements,
  sha256Hex,
  signerTurnActive,
  verifyEventChain,
} from "./esign-core";

describe("namesMatch", () => {
  it("toleruje diakrytyki, wielkość liter i drugie imiona z dokumentu", () => {
    expect(namesMatch("Zażółć Gęślą", "ZAZOLC JAN GESLA")).toBe(true);
    expect(namesMatch("Anna Nowak-Kowalska", "Anna Maria Nowak Kowalska")).toBe(true);
    expect(namesMatch("jan kowalski", "KOWALSKI JAN")).toBe(true);
  });
  it("odrzuca inne nazwisko i puste dane", () => {
    expect(namesMatch("Jan Kowalski", "Jan Nowak")).toBe(false);
    expect(namesMatch("Jan Kowalski", "")).toBe(false);
    expect(namesMatch("", "Jan Kowalski")).toBe(false);
  });
  it("normalizeName usuwa znaki specjalne", () => {
    expect(normalizeName("  Łukasz  O'Brien-Śmiały ")).toBe("lukasz o brien smialy");
  });
});

describe("maskowanie", () => {
  it("numer dokumentu — tylko 4 ostatnie znaki", () => {
    expect(maskDocumentNumber("ABC 123456")).toBe("*****3456");
    expect(maskDocumentNumber("AB12")).toBe("****");
    expect(maskDocumentNumber(null)).toBeNull();
  });
  it("e-mail i telefon", () => {
    expect(maskEmail("jan.kowalski@example.com")).toBe("ja**********@example.com");
    expect(maskEmail("a@b.pl")).toBe("a**@b.pl");
    expect(maskPhone("+48 600 700 800")).toBe("********800");
  });
});

describe("reprezentacja i oświadczenia", () => {
  it("etykieta podpisu w imieniu spółki", () => {
    expect(
      capacityLabel("Anna Nowak", {
        mode: "firma",
        company: {
          name: "ABC sp. z o.o.",
          nip: "1234567890",
          krs: "0000123456",
          role: "Prezes Zarządu",
        },
      }),
    ).toBe(
      "ABC sp. z o.o. (NIP 1234567890, KRS 0000123456) — reprezentowana przez: Anna Nowak, Prezes Zarządu",
    );
    expect(capacityLabel("Anna Nowak", { mode: "osoba", company: null })).toBe("Anna Nowak");
  });
  it("umocowanie wymagane tylko dla firmy; checkboxy puste = brak", () => {
    expect(requiredStatements(null)).toEqual(["zapoznanie", "forma_dokumentowa", "tozsamosc"]);
    expect(requiredStatements({ mode: "firma", company: { name: "X" } })).toContain("umocowanie");
    expect(missingStatements({}, null)).toHaveLength(3);
    expect(
      missingStatements({ zapoznanie: true, forma_dokumentowa: true, tozsamosc: true }, null),
    ).toEqual([]);
  });
});

describe("statusy koperty i kolejność", () => {
  it("deriveEnvelopeStatus", () => {
    expect(
      deriveEnvelopeStatus("wyslana", [{ status: "podpisany" }, { status: "podpisany" }]),
    ).toBe("zakonczona");
    expect(
      deriveEnvelopeStatus("wyslana", [{ status: "podpisany" }, { status: "odrzucony" }]),
    ).toBe("odrzucona");
    expect(deriveEnvelopeStatus("wyslana", [{ status: "podpisany" }, { status: "oczekuje" }])).toBe(
      "wyslana",
    );
    expect(deriveEnvelopeStatus("anulowana", [{ status: "podpisany" }])).toBe("anulowana");
  });
  it("tryb kolejno odsłania podpisujących po kolei", () => {
    const all = [
      { order_no: 1, status: "oczekuje" as const, invited_at: null },
      { order_no: 2, status: "oczekuje" as const, invited_at: null },
    ];
    expect(signerTurnActive("kolejno", all[1], all)).toBe(false);
    expect(signerTurnActive("rownolegle", all[1], all)).toBe(true);
    expect(nextSignersToInvite("kolejno", all).map((s) => s.order_no)).toEqual([1]);
    expect(nextSignersToInvite("rownolegle", all).map((s) => s.order_no)).toEqual([1, 2]);
    const afterFirst = [{ ...all[0], status: "podpisany" as const, invited_at: "x" }, all[1]];
    expect(nextSignersToInvite("kolejno", afterFirst).map((s) => s.order_no)).toEqual([2]);
  });
});

describe("łańcuch hashy", () => {
  it("sha256Hex i kanoniczny JSON", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } })).toBe(
      '{"a":{"c":[3,{"y":2,"z":1}],"d":2},"b":1}',
    );
  });
  it("verifyEventChain wykrywa manipulację", async () => {
    const base = { envelope_id: "env-1", signer_id: null as string | null };
    const e1 = {
      ...base,
      event_type: "utworzona",
      created_at: "2026-10-05T10:00:00.000Z",
      payload: { a: 1 },
      prev_hash: null as string | null,
      hash: "",
    };
    e1.hash = await eventHash({
      prevHash: null,
      envelopeId: e1.envelope_id,
      signerId: null,
      eventType: e1.event_type,
      createdAt: e1.created_at,
      payload: e1.payload,
    });
    const e2 = {
      ...base,
      event_type: "wyslana",
      created_at: "2026-10-05T10:01:00.000Z",
      payload: {},
      prev_hash: e1.hash,
      hash: "",
    };
    e2.hash = await eventHash({
      prevHash: e1.hash,
      envelopeId: e2.envelope_id,
      signerId: null,
      eventType: e2.event_type,
      createdAt: e2.created_at,
      payload: e2.payload,
    });
    expect(await verifyEventChain([e1, e2])).toBe(-1);
    expect(await verifyEventChain([{ ...e1, payload: { a: 2 } }, e2])).toBe(0);
    expect(await verifyEventChain([e1, { ...e2, prev_hash: "zle" }])).toBe(1);
  });
});

describe("kody i tokeny", () => {
  it("mają oczekiwaną długość i alfabet", () => {
    expect(randomVerifyCode()).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomOtp()).toMatch(/^\d{6}$/);
  });
  it("formatSignedAt pokazuje czas polski i UTC", () => {
    const s = formatSignedAt("2026-10-05T12:22:31.000Z");
    expect(s).toContain("05.10.2026 14:22:31");
    expect(s).toContain("(2026-10-05T12:22:31Z)");
  });
});
