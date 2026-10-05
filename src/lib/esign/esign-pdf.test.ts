import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import {
  describeIdentity,
  inspectPdf,
  stampSignedPdf,
  type StampInput,
  type StampSigner,
} from "./esign-pdf";

async function samplePdf(pages: number, opts: { rotate?: number; size?: [number, number] } = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage(opts.size ?? [595.28, 841.89]);
    page.drawText(`Umowa pozyczki - strona ${i + 1}`, { x: 50, y: 780, size: 14, font });
    page.drawText("Tekst na samej gorze marginesu", { x: 50, y: 830, size: 9, font });
    if (opts.rotate) page.setRotation(degrees(opts.rotate));
  }
  return doc.save();
}

const signer = (n: number, extra: Partial<StampSigner> = {}): StampSigner => ({
  fullName: `Osoba Testowa ${n}`,
  roleLabel: n === 1 ? "Pożyczkodawca" : "Pożyczkobiorca",
  email: `osoba${n}@example.com`,
  phone: "+48 600 000 00" + n,
  capacity:
    n === 2
      ? {
          mode: "firma",
          company: {
            name: "Zażółć sp. z o.o.",
            nip: "1234567890",
            krs: "0000123456",
            role: "Prezes Zarządu",
          },
        }
      : { mode: "osoba", company: null },
  identity: {
    provider: "didit",
    sessionId: `sess-${n}`,
    source: n === 1 ? "pipeline" : "esign",
    fullName: `Osoba Testowa ${n}`,
    firstName: "Osoba",
    lastName: `Testowa ${n}`,
    documentType: "Dowód osobisty",
    documentNumberMasked: "*****1234",
    dateOfBirth: "1990-01-01",
    issuingCountry: "PL",
    checks: ["dokument tożsamości", "test żywotności", "porównanie twarzy"],
    decidedAt: "2026-10-05T12:10:00Z",
    nameMatch: true,
  },
  otpChannel: n === 1 ? "sms" : "email",
  otpTarget: n === 1 ? "*********001" : "os****@example.com",
  signedAt: `2026-10-05T12:2${n}:31Z`,
  ip: "203.0.113.10",
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  statements: [
    "Zapoznałem(-am) się z całą treścią dokumentu.",
    "Wyrażam zgodę na formę dokumentową.",
  ],
  signatureHash: "a".repeat(64),
  ...extra,
});

function input(sourceBytes: Uint8Array, signers: StampSigner[]): StampInput {
  return {
    sourceBytes,
    publicId: "FY-SIGN-000012",
    title: "Umowa pożyczki nr 12/2026",
    sourceFilename: "umowa-pozyczki.pdf",
    sourceSha256: "b".repeat(64),
    verifyUrl: "https://app.financeyou.pl/weryfikacja/K7MXQ2PA9T",
    verifyUrlShort: "app.financeyou.pl/weryfikacja/K7MXQ2PA9T",
    sender: { name: "Operator FY", email: "operator@financeyou.pl" },
    operatorName: "Finance You sp. z o.o.",
    createdAt: "2026-10-05T11:00:00Z",
    sentAt: "2026-10-05T11:05:00Z",
    completedAt: "2026-10-05T12:22:31Z",
    signingMode: "rownolegle",
    signers,
    events: Array.from({ length: 30 }, (_, i) => ({
      at: `2026-10-05T11:${String(i).padStart(2, "0")}:00Z`,
      label:
        i % 2
          ? "Link otwarty"
          : "Zdarzenie o dość długiej nazwie, które musi się zawinąć w kolumnie",
      actor: i % 3 ? "Osoba Testowa 1 <osoba1@example.com>" : "system",
      ip: "203.0.113.10",
    })),
    now: new Date(Date.UTC(2026, 9, 5, 12, 30, 0)),
  };
}

describe("stampSignedPdf", () => {
  it("osadza wszystkie strony, dodaje Kartę podpisów i metadane", async () => {
    const src = await samplePdf(3);
    const res = await stampSignedPdf(input(src, [signer(1), signer(2)]));
    expect(res.sourcePages).toBe(3);
    expect(res.kartaPages).toBeGreaterThanOrEqual(1);
    const out = await PDFDocument.load(res.bytes);
    expect(out.getPageCount()).toBe(3 + res.kartaPages);
    const [p0] = out.getPages();
    expect(Math.round(p0.getWidth())).toBe(595);
    expect(Math.round(p0.getHeight())).toBe(842);
    expect(out.getTitle()).toContain("FY-SIGN-000012");
    expect(out.getSubject()).toContain("b".repeat(64));
  });

  it("radzi sobie z wieloma podpisującymi, obróconą stroną i nietypowym formatem", async () => {
    const src = await samplePdf(2, { rotate: 90, size: [612, 792] });
    const res = await stampSignedPdf(input(src, [signer(1), signer(2), signer(3), signer(4)]));
    const out = await PDFDocument.load(res.bytes);
    expect(out.getPageCount()).toBe(2 + res.kartaPages);
    // Strona obrócona o 90° jest renderowana w orientacji wyświetlanej (poziomej).
    const [p0] = out.getPages();
    expect(p0.getWidth()).toBeGreaterThan(p0.getHeight());
  });

  it("inspectPdf liczy strony; describeIdentity opisuje weryfikację po polsku", async () => {
    const src = await samplePdf(5);
    expect(await inspectPdf(src)).toEqual({ pages: 5, encrypted: false });
    expect(describeIdentity(signer(1).identity)).toContain(
      "Didit — dokument tożsamości, test żywotności, porównanie twarzy",
    );
    expect(describeIdentity(signer(1).identity)).toContain("KYC z pipeline'u inwestora");
    expect(describeIdentity(null)).toBe("brak potwierdzenia tożsamości");
  });
});
