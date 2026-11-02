import { describe, expect, it } from "vitest";
import { eligibilityForGeneratedDocument, eligibilityForTemplateSlug, eligibleTemplateSlugs, LOAN_PACKAGE_SLUG } from "./document-signing-policy";

describe("forma dokumentowa — konserwatywna biała lista", () => {
  it("obejmuje tylko 10 jawnie dozwolonych typów pism", () => {
    expect(eligibleTemplateSlugs()).toHaveLength(10);
    for (const slug of eligibleTemplateSlugs()) {
      expect(eligibilityForTemplateSlug(slug).allowed).toBe(true);
    }
  });
  it.each([
    "u05-oswiadczenie-777-instrukcja-dla-notariusza",
    "u06-hipoteka-oswiadczenie-i-wniosek-o-wpis",
    "22-zgoda-na-wykreslenie-hipoteki",
    "11-umowa-przelewu-wierzytelnosci-cesja",
    "08-ugoda-rozlozenie-na-raty",
    "17-pozew-o-zaplate",
    "14-wniosek-o-klauzule-wykonalnosci-777",
    "u08-klauzula-informacyjna-rodo",
    "00-spis-tresci-i-instrukcja-pakietu",
    "nieznany-dokument",
  ])("blokuje podpis dokumentowy dla %s", slug => {
    expect(eligibilityForTemplateSlug(slug).allowed).toBe(false);
  });
  it("pozwala na pakiet bez poręczyciela, ale blokuje poręczenie i starsze wersje bez audytu", () => {
    expect(eligibilityForGeneratedDocument({
      template_slug: LOAN_PACKAGE_SLUG, form_data: { audyt: { ma_poreczyciela: false } },
    }).allowed).toBe(true);
    expect(eligibilityForGeneratedDocument({
      template_slug: LOAN_PACKAGE_SLUG, form_data: { audyt: { ma_poreczyciela: true } },
    }).allowed).toBe(false);
    expect(eligibilityForGeneratedDocument({
      template_slug: LOAN_PACKAGE_SLUG, form_data: { audyt: {} },
    }).allowed).toBe(false);
    expect(eligibilityForGeneratedDocument({ template_slug: LOAN_PACKAGE_SLUG }).allowed).toBe(false);
  });
});
