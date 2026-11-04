import { describe, expect, it } from "vitest";
import {
  buildProceedingReport,
  extractSignatures,
  groupIntoProceedings,
  isInsolvencyNotice,
  parseMsigDetail,
  verifyIdentity,
} from "./official-msig-detail";
import {
  assembleOfficialMsigHits,
  officialMsigCourtMerge,
  selectOfficialMsigCandidates,
} from "./official-msig.server";

// Dane syntetyczne: PESEL 44051401359 to powszechnie używany przykładowy numer
// z poprawną sumą kontrolną, 02070803628 — drugi przykładowy (inny „imiennik”).
const PESEL = "44051401359";
const OTHER_PESEL = "02070803628";

const opening = {
  id: 101,
  entityName: "Nowak Adam",
  numberOfNotice: "9000",
  signatureOfCase: "XII GU 42/15, XII GUp 30/15.",
  krs: null,
  nip: null,
  page: 15,
  chapterName:
    "III. OGŁOSZENIA WYMAGANE PRZEZ PRAWO UPADŁOŚCIOWE I NAPRAWCZE/1. Postanowienie o ogłoszeniu upadłości",
  monitorNumber: "123/2015",
  dateOfPublication: "2015-06-29T00:00:00",
  textInPosition:
    "Poz. 9000. Nowak Adam. Sąd Rejonowy Szczecin-Centrum w Szczecinie, XII Wydział Gospodarczy, sygn. akt XII GU 42/15, XII GUp 30/15.",
  textInBody:
    "Sąd Rejonowy Szczecin-Centrum w Szczecinie, XII Wydział Gospodarczy, zawiadamia, iż postanowieniem z dnia 19 czerwca 2015 roku ogłoszono upadłość osoby fizycznej nieprowadzącej działalności gospodarczej Adama Nowaka, zamieszkałego w Szczecinie, PESEL " +
    PESEL +
    ", obejmującą likwidację majątku dłużnika, i zarejestrowano pod sygn. akt XII GUp 30/15. Wyznaczono Sędziego komisarza w osobie Sędziego Sądu Rejonowego Anny Testowej oraz syndyka w osobie Jana Przykładowego (ul. Prosta 1, 70-001 Szczecin).",
};
const followUp = {
  ...opening,
  id: 102,
  numberOfNotice: "1702",
  signatureOfCase: "XII GUp 30/15.",
  chapterName:
    "III. OGŁOSZENIA WYMAGANE PRZEZ PRAWO UPADŁOŚCIOWE/3. Ogłoszenie o sporządzeniu i przekazaniu sędziemu komisarzowi listy wierzytelności",
  monitorNumber: "8/2020",
  dateOfPublication: "2020-01-14T00:00:00",
  textInPosition:
    "Poz. 1702. Nowak Adam. Sąd Rejonowy Szczecin-Centrum w Szczecinie, XII Wydział Gospodarczy, sygn. akt XII GUp 30/15.",
  textInBody:
    "W związku ze złożeniem przez syndyka listy wierzytelności w postępowaniu upadłościowym Adama Nowaka, sygn. akt XII GUp 30/15, Sędzia komisarz ogłasza…",
};
const closing = {
  ...followUp,
  id: 103,
  chapterName:
    "III. OGŁOSZENIA WYMAGANE PRZEZ PRAWO UPADŁOŚCIOWE/6. Postanowienie o zakończeniu postępowania upadłościowego",
  monitorNumber: "100/2021",
  dateOfPublication: "2021-05-20T00:00:00",
  textInBody:
    "Sąd Rejonowy Szczecin-Centrum w Szczecinie postanowieniem z dnia 10 maja 2021 r. w sprawie XII GUp 30/15 stwierdził zakończenie postępowania upadłościowego.",
};
const inheritance = {
  ...opening,
  id: 201,
  entityName: "Wnioskodawca Nowak Adam",
  signatureOfCase: "I Ns 130/09.",
  chapterName:
    "V. OGŁOSZENIA WYMAGANE PRZEZ KODEKS POSTĘPOWANIA CYWILNEGO/1.Wezwanie spadkobierców",
  dateOfPublication: "2009-06-30T00:00:00",
  textInPosition:
    "Poz. 8651. Wnioskodawca Nowak Adam. Sąd Rejonowy w Mławie, I Wydział Cywilny, sygn. akt I Ns 130/09.",
  textInBody: "W Sądzie Rejonowym w Mławie toczy się postępowanie o stwierdzenie nabycia spadku…",
};

const person = {
  kind: "person" as const,
  name: "Adam Nowak",
  firstName: "Adam",
  lastName: "Nowak",
  pesel: PESEL,
};
const listRow = (d: typeof opening) => ({
  id: d.id,
  monitorNumber: d.monitorNumber,
  dateOfPublication: d.dateOfPublication,
  entityName: d.entityName,
  signatureOfCase: d.signatureOfCase,
});

function detailsMap(...raw: Array<typeof opening>) {
  return new Map(raw.map((r) => [r.id, parseMsigDetail(r)] as const));
}

describe("MSiG — treść pozycji (Detalis)", () => {
  it("wyciąga sąd, sygnatury, PESEL i rozdział", () => {
    const d = parseMsigDetail(opening)!;
    expect(d.court).toBe("Sąd Rejonowy Szczecin-Centrum w Szczecinie");
    expect(d.signatures).toEqual(["XII GU 42/15", "XII GUP 30/15"]);
    expect(d.pesels).toEqual([PESEL]);
    expect(d.chapter).toBe("Postanowienie o ogłoszeniu upadłości");
    expect(d.residence).toBe("Szczecinie");
  });
  it("odrzuca 11 cyfr bez poprawnej sumy kontrolnej PESEL", () => {
    expect(parseMsigDetail({ ...opening, textInBody: "PESEL 12345678901" })!.pesels).toEqual([]);
  });
  it("sygnatury także z treści, gdy lista ich nie podaje", () => {
    expect(extractSignatures("postępowaniu P.P.U.H. (Sygn. akt V GUp 6/17) zawiadamia")).toEqual([
      "V GUP 6/17",
    ]);
  });
  it("zgodny PESEL potwierdza, inny PESEL wyklucza, brak PESEL — nieustalone", () => {
    const d = parseMsigDetail(opening)!;
    expect(verifyIdentity(person, d).verdict).toBe("confirmed");
    expect(verifyIdentity({ ...person, pesel: OTHER_PESEL }, d).verdict).toBe("contradicted");
    expect(verifyIdentity({ ...person, pesel: null }, d).verdict).toBe("unknown");
    expect(verifyIdentity(person, parseMsigDetail(followUp)!).verdict).toBe("unknown");
  });
  it("spadek / zasiedzenie nie są ogłoszeniem o niewypłacalności", () => {
    expect(isInsolvencyNotice(parseMsigDetail(inheritance)!)).toBe(false);
    expect(isInsolvencyNotice(parseMsigDetail(opening)!)).toBe(true);
  });
  it("łączy ogłoszenia sprawy po sądzie i wspólnej sygnaturze", () => {
    const groups = groupIntoProceedings(
      [opening, followUp, inheritance].map((r) => parseMsigDetail(r)!),
    );
    expect(groups.map((g) => g.map((d) => d.id))).toEqual([[101, 102], [201]]);
  });
  it("łączy postanowienie „GU” z ogłoszeniami „GUp” tego samego sądu i osoby", () => {
    const gu = parseMsigDetail({
      ...opening,
      signatureOfCase: "XII GU 42/15.",
      textInPosition: opening.textInPosition.replace(", XII GUp 30/15", ""),
      textInBody: opening.textInBody.replace(" i zarejestrowano pod sygn. akt XII GUp 30/15", ""),
    })!;
    expect(gu.signatures).toEqual(["XII GU 42/15"]);
    const later = parseMsigDetail({ ...followUp, dateOfPublication: "2016-01-10T00:00:00" })!;
    expect(groupIntoProceedings([gu, later])).toHaveLength(2);
    expect(
      groupIntoProceedings([gu, later], { mergeByCourt: officialMsigCourtMerge(person) }),
    ).toHaveLength(1);
  });
  it("raport: rodzaj, status zakończenia, organy, oś czasu bez PESEL", () => {
    const g = [opening, followUp, closing].map((r) => parseMsigDetail(r)!);
    const r = buildProceedingReport(g, {
      identityBasis: "PESEL zgodny",
      incomplete: false,
      today: "2026-11-04",
    });
    expect(r.kind).toContain("Upadłość konsumencka");
    expect(r.status).toBe("closed");
    expect(r.decisionDate).toBe("19 czerwca 2015");
    expect(r.officials).toEqual([
      "Sędzia komisarz: w osobie Anny Testowej",
      "Syndyk: w osobie Jana Przykładowego",
    ]);
    expect(r.timeline.map((t) => t.publicationDate)).toEqual([
      "2015-06-29",
      "2020-01-14",
      "2021-05-20",
    ]);
    expect(JSON.stringify(r)).not.toContain(PESEL);
  });
  it("brak zakończenia przed KRZ — odsyła do KRZ", () => {
    const g = [opening, followUp].map((r) => parseMsigDetail(r)!);
    const r = buildProceedingReport(g, {
      identityBasis: "x",
      incomplete: false,
      today: "2026-11-04",
    });
    expect(r.status).toBe("unknown");
    expect(r.statusNote).toContain("KRZ");
  });
});

describe("MSiG — zawężanie trafień po PESEL", () => {
  const rows = [opening, followUp, inheritance].map(listRow);
  const candidates = selectOfficialMsigCandidates(person, rows, 15);

  it("zgodny PESEL → identifier + pogłębiony raport, spadek pominięty", () => {
    const a = assembleOfficialMsigHits(
      person,
      candidates,
      detailsMap(opening, followUp, inheritance),
      { today: "2026-11-04" },
    );
    expect(a.confirmedCases).toBe(1);
    expect(a.neutral).toBe(1);
    expect(a.hits).toHaveLength(1);
    expect(a.hits[0]).toMatchObject({
      match: "identifier",
      caseSignature: "XII GU 42/15, XII GUP 30/15",
    });
    expect(a.hits[0].proceeding?.noticesCount).toBe(2);
    expect(a.hits[0].url).toContain("Download?id=101");
    expect(JSON.stringify(a)).not.toContain(PESEL);
  });
  it("inny PESEL → cała sprawa imiennika odrzucona", () => {
    const other = { ...person, pesel: OTHER_PESEL };
    const a = assembleOfficialMsigHits(
      other,
      candidates,
      detailsMap(opening, followUp, inheritance),
    );
    expect(a.hits).toEqual([]);
    expect(a.rejected).toBe(2);
  });
  it("brak PESEL podmiotu → name_only z rozdziałem zamiast „rodzaj nieustalony”", () => {
    const noPesel = { ...person, pesel: null };
    const a = assembleOfficialMsigHits(
      noPesel,
      candidates,
      detailsMap(opening, followUp, inheritance),
    );
    expect(a.hits).toHaveLength(1);
    expect(a.hits[0].match).toBe("name_only");
    expect(a.hits[0].title).toContain("Postanowienie o ogłoszeniu upadłości");
    expect(a.hits[0].proceeding).toBeUndefined();
  });
  it("kandydat bez pobranej treści zostaje jak dotąd (name_only z listy)", () => {
    const a = assembleOfficialMsigHits(person, candidates, new Map([[101, null]]));
    expect(a.unverified).toBe(3);
    expect(a.hits.every((h) => h.match === "name_only")).toBe(true);
  });
});
