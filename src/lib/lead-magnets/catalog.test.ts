// Katalog startowy lead magnetów: spójność z seriami i kalkulatorami, reguły
// twarde compliance dla strony / PDF / maila, zgodność ze schematem panelu,
// render PDF bez znaków spoza fontu.
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  AI_MATERIAL_LINE,
  CATALOG_SLUGS,
  CATALOG_VERSION,
  LEAD_MAGNET_CATALOG,
  catalogBySlug,
  catalogForTrack,
  catalogMagnetRow,
  catalogPageText,
  catalogPdfText,
  isCatalogSlug,
  resolveKeywordTarget,
} from "./catalog";
import { renderLeadMagnetPdf } from "./pdf";
import { leadMagnetCrossChecks, leadMagnetSchema } from "./schema";
import { normalizeForMatch, renderTemplate, subscriberTagsFor } from "./core";
import { evaluateCompliance } from "@/lib/autopilot/compliance-rules";
import { SERIES } from "@/lib/autopilot/series";
import { STARTER_CALCULATORS } from "@/lib/autopilot/calculators";
import { TRACKS } from "@/lib/autopilot/types";
import { charsOutsideFont } from "@/lib/pdf/report-writer";

const DATE = new Date(Date.UTC(2026, 9, 21, 10, 0, 0));

describe("katalog — struktura", () => {
  it("slugi katalogu są unikalne i zgodne z lekką listą CATALOG_SLUGS", () => {
    const slugs = LEAD_MAGNET_CATALOG.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect([...slugs].sort()).toEqual([...CATALOG_SLUGS].sort());
    for (const s of slugs) expect(isCatalogSlug(s)).toBe(true);
    expect(isCatalogSlug("inny-material")).toBe(false);
    expect(catalogBySlug("nie-ma")).toBeNull();
  });

  it("każdy tor ma co najmniej trzy materiały pokrywające trzy etapy lejka", () => {
    for (const track of TRACKS) {
      const list = catalogForTrack(track);
      expect(list.length).toBeGreaterThanOrEqual(3);
      expect(new Set(list.map((m) => m.stage))).toEqual(
        new Set(["swiadomosc", "przygotowanie", "decyzja"]),
      );
      for (const m of list) expect(m.audience).toBe(track === "inwestor" ? "inwestor" : "klient");
    }
  });

  it("hasła są unikalne w katalogu i nie kolidują z kalkulatorami", () => {
    const keys = [
      ...LEAD_MAGNET_CATALOG.flatMap((m) => m.keywords),
      ...STARTER_CALCULATORS.map((c) => c.keyword),
    ].map(normalizeForMatch);
    expect(new Set(keys).size).toBe(keys.length);
    for (const m of LEAD_MAGNET_CATALOG) expect(m.keywords[0]).toBe(m.keyword);
  });

  it("każda seria rolek ma gotowy materiał pod swoje hasło", () => {
    for (const s of SERIES) {
      if (!s.defaultKeyword) continue;
      const t = resolveKeywordTarget(s.defaultKeyword);
      expect(t, `${s.slug} → ${s.defaultKeyword}`).not.toBeNull();
      expect(t!.track).toBe(s.track);
    }
    // Materiał deklaruje serie, które istnieją i są z tego samego toru.
    for (const m of LEAD_MAGNET_CATALOG) {
      for (const slug of m.series) {
        const s = SERIES.find((x) => x.slug === slug);
        expect(s, `${m.slug} → seria ${slug}`).toBeDefined();
        expect(s!.track).toBe(m.track);
      }
    }
  });

  it("rejestr haseł: polskie znaki i wielkość liter nie mają znaczenia, kalkulatory też są", () => {
    expect(resolveKeywordTarget("ksiega")?.slug).toBe("checklista-ksiegi-wieczystej");
    expect(resolveKeywordTarget("Błędy")?.kind).toBe("catalog");
    expect(resolveKeywordTarget("ltv")).toMatchObject({ kind: "tool", slug: "kalkulator-ltv" });
    expect(resolveKeywordTarget("start")?.name).toContain("przewodnik");
    expect(resolveKeywordTarget("umowa")?.slug).toBe("wzor-umowy-pozyczki");
    expect(resolveKeywordTarget("wzor")?.name).toContain("wzór");
    expect(resolveKeywordTarget("")).toBeNull();
    expect(resolveKeywordTarget("NIEMA")).toBeNull();
  });

  it("następny krok prowadzi w głąb lejka toru", () => {
    for (const m of LEAD_MAGNET_CATALOG) {
      expect(m.next.url).toMatch(/^https:\/\//);
      expect(m.pdf.closing.actions.length).toBeGreaterThanOrEqual(3);
      // Wzór umowy niesie treść z silnika klauzul — sekcje katalogu to tylko wprowadzenie.
      expect(m.pdf.sections.length).toBeGreaterThanOrEqual(m.custom_pdf ? 1 : 4);
    }
    expect(catalogBySlug("checklista-dokumentow")!.next.url).toContain("wniosek");
    expect(catalogBySlug("start-inwestora")!.next.url).toContain("kalkulator-ltv");
  });
});

describe("katalog — compliance (reguły twarde z briefu 5.7)", () => {
  for (const m of LEAD_MAGNET_CATALOG) {
    it(`${m.slug}: strona, PDF i mail bez blokad; PDF i mail ze stopką`, () => {
      const page = evaluateCompliance(catalogPageText(m), { kind: "lead_magnet", track: m.track });
      const pdf = evaluateCompliance(catalogPdfText(m), { kind: "lead_magnet", track: m.track });
      const mail = evaluateCompliance(m.email_body, { kind: "email", track: m.track });
      expect(page.blocks, "strona").toEqual([]);
      expect(pdf.blocks, "pdf").toEqual([]);
      expect(mail.blocks, "mail").toEqual([]);
      expect(pdf.requires, "pdf: stopka").toEqual([]);
      expect(mail.requires, "mail: stopka").toEqual([]);
      expect(m.email_body).toContain(AI_MATERIAL_LINE);
    });
  }
});

describe("katalog — zgodność z mechanizmem lead magnetów", () => {
  it("wiersz z katalogu przechodzi schemat panelu także jako opublikowany bez pliku", () => {
    for (const m of LEAD_MAGNET_CATALOG) {
      const row = catalogMagnetRow(m, true);
      // Wiersz bazy ma null w adresach; formularz panelu / MCP przekazuje pusty string.
      const parsed = leadMagnetSchema.parse({
        ...row,
        cover_image_url: row.cover_image_url ?? "",
        og_image_url: row.og_image_url ?? "",
        file_url: row.file_url ?? "",
      });
      expect(parsed.published).toBe(true);
      expect(parsed.file_path ?? null).toBeNull();
      expect(parsed.trigger_keywords).toEqual(m.keywords);
      expect(
        leadMagnetCrossChecks({
          slug: m.slug,
          match_any_post: false,
          trigger_keywords: m.keywords,
          published: true,
          reply_private_template: "{link}",
          reply_fallback_template: "{link}",
          email_body: m.email_body,
        }),
      ).toBeNull();
    }
    // Slug spoza katalogu nadal wymaga pliku albo adresu.
    expect(
      leadMagnetCrossChecks({
        slug: "wlasny-material",
        match_any_post: false,
        trigger_keywords: [],
        published: true,
        reply_private_template: "{link}",
        reply_fallback_template: "{link}",
        email_body: "{link}",
      }),
    ).toMatch(/plik/i);
  });

  it("mail ma {link} i {tytul}, renderuje się bez imienia i z imieniem", () => {
    for (const m of LEAD_MAGNET_CATALOG) {
      expect(m.email_body).toContain("{link}");
      expect(m.email_body).toContain("{tytul}");
      const bez = renderTemplate(m.email_body, { tytul: m.title, link: "https://x.test/t" });
      expect(bez.startsWith("Cześć!")).toBe(true);
      expect(bez).toContain("https://x.test/t");
      expect(bez).toContain(m.next.url);
      const z = renderTemplate(m.email_body, { imie: "Anna", tytul: m.title, link: "https://x" });
      expect(z.startsWith("Cześć Anna!")).toBe(true);
      expect(m.email_subject.length).toBeLessThanOrEqual(200);
    }
  });

  it("tagi subskrybenta: lead-magnet, grupa, slug, katalog i etap", () => {
    const m = catalogBySlug("bank-odmowil-co-dalej")!;
    const tags = subscriberTagsFor({
      slug: m.slug,
      audience: m.audience,
      extra: m.subscriber_tags,
    });
    expect(tags).toEqual(
      expect.arrayContaining([
        "lead-magnet",
        "klient",
        "lead-magnet:bank-odmowil-co-dalej",
        "katalog",
        "katalog:bank-odmowil-co-dalej",
        "etap:swiadomosc",
      ]),
    );
  });
});

describe("katalog — render PDF", () => {
  it("tekst materiałów mieści się w foncie (polskie znaki, cudzysłowy, pauzy)", async () => {
    for (const m of LEAD_MAGNET_CATALOG) {
      expect(await charsOutsideFont(catalogPdfText(m)), m.slug).toEqual([]);
    }
  });

  for (const m of LEAD_MAGNET_CATALOG) {
    it(`${m.slug}: wielostronicowy A4 z okładką i metadanymi`, async () => {
      const bytes = await renderLeadMagnetPdf(m, { generatedAt: DATE });
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(4);
      expect(doc.getPageCount()).toBeLessThanOrEqual(22);
      expect(doc.getTitle()).toBe(m.title);
      expect(doc.getSubject()).toContain(CATALOG_VERSION);
      expect(doc.getAuthor()).toBe("Finance You");
      const { width, height } = doc.getPage(0).getSize();
      expect(Math.round(width)).toBe(595);
      expect(Math.round(height)).toBe(842);
    });
  }
});
