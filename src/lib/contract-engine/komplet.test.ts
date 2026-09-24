/**
 * Komplet dokumentów w jednym .docx — snapshoty tekstu dla trzech przypadków
 * zlecenia i kontrole konstrukcji pliku.
 *
 *  (a) JDG, 1 KW, balon, hipoteka na kolejnym miejscu z roszczeniem o
 *      opróżnione miejsce — zarazem przypadek końcowy zlecenia,
 *  (b) dwoje pożyczkobiorców solidarnie, współwłasność 1/2,
 *  (c) spółka z o.o. z poręczycielem rzeczowym.
 *
 * Snapshot to tekst wyciągnięty z word/document.xml gotowego pliku (akapity,
 * tabele „ | ”), więc łapie każdą zmianę treści wiążącej.
 */
import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import { przetworzSzkic } from "./umowa-agent-core";
import { generujKomplet, WERSJA_BIBLIOTEKI, type KompletWynik } from "./komplet";
import { tekstZDocx } from "./umowa-docx";
import biblioteka from "./clauses.json";
import { przypadekA, przypadekB, przypadekC } from "./fixtures/komplet-przypadki";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function komplet(dane: any): Promise<KompletWynik> {
  const { umowa, problemy } = przetworzSzkic(dane);
  const bledy = problemy.filter((p) => p.poziom === "BLAD");
  if (bledy.length) throw new Error(JSON.stringify(bledy));
  return generujKomplet(umowa);
}

const PRZYPADKI = [
  ["a — JDG, balon, kolejne miejsce + roszczenie", przypadekA],
  ["b — dwoje pożyczkobiorców, współwłasność 1/2", przypadekB],
  ["c — sp. z o.o. + poręczyciel rzeczowy", przypadekC],
] as const;

describe("snapshot tekstu DOCX", () => {
  for (const [nazwa, dane] of PRZYPADKI) {
    it(nazwa, async () => {
      const k = await komplet(dane());
      const tekst = await tekstZDocx(k.bytes);
      expect(tekst).toBe(k.tekst); // tekst do hasha = tekst z pliku
      expect(tekst).toMatchSnapshot();
    });
  }
});

// Treści nie-umowne, które nie mogą trafić do dokumentu (pkt 6 zlecenia).
const ZAKAZANE = [
  /uwag[ai]\b/i,
  /ostrze[żz]e/i,
  /do sprawdzenia/i,
  /do weryfikacji/i,
  /\bWAŻNE\b/,
  /\bTODO\b/i,
  /komentarz/i,
  /notatk/i,
  /podsumowanie ryzyka/i,
  /znak wodny/i,
  /\bDRAFT\b|\bPROJEKT\b|\bSZKIC\b/,
  /\{\{|\}\}/,
  /\[[A-ZĄĆĘŁŃÓŚŹŻ ]{3,}\]/, // placeholdery typu [NR RACHUNKU]
  /rozważ/i,
  /ryzyk[oa] prawn/i,
];

describe("dokument = wyłącznie treść wiążąca", () => {
  for (const [nazwa, dane] of PRZYPADKI) {
    it(`${nazwa}: brak ostrzeżeń, uwag, notatek, placeholderów`, async () => {
      const { tekst, documentXml } = await komplet(dane());
      for (const re of ZAKAZANE) expect(tekst, String(re)).not.toMatch(re);
      // uwagi prawne z biblioteki (metadane dla prawnika) nigdy nie trafiają do treści
      for (const k of (biblioteka as any).klauzule) {
        if (k.uwaga_prawna) expect(tekst).not.toContain(k.uwaga_prawna.slice(0, 40));
      }
      // bez znaków wodnych / nagłówków / komentarzy Worda
      expect(documentXml).not.toMatch(/<w:(pict|comment|headerReference|footerReference)\b/);
    });
  }
});

describe("przypadek końcowy zlecenia (a)", () => {
  it("jeden DOCX: wniosek → umowa §1–7 → Zał. 1–3, każda część od nowej strony", async () => {
    const { tekst, documentXml } = await komplet(przypadekA());
    const kolejnosc = [
      "WNIOSEK O UDZIELENIE POŻYCZKI PIENIĘŻNEJ",
      "UMOWA POŻYCZKI",
      "§ 1 – PRZEDMIOT UMOWY",
      "§ 2 – KWOTA POŻYCZKI, PROWIZJA I WARUNKI WYPŁATY",
      "§ 3 – ZABEZPIECZENIA",
      "§ 4 – WINDYKACJA I SKUTKI OPÓŹNIENIA",
      "§ 5 – OŚWIADCZENIA STRON",
      "§ 6 – POSTANOWIENIA OGÓLNE",
      "§ 7 – WYPOWIEDZENIE UMOWY",
      "ZAŁĄCZNIK NR 1 DO UMOWY POŻYCZKI",
      "ZAŁĄCZNIK NR 2 DO UMOWY POŻYCZKI",
      "ZAŁĄCZNIK NR 3 DO UMOWY POŻYCZKI",
    ];
    let poz = -1;
    for (const t of kolejnosc) {
      const i = tekst.indexOf(t, poz + 1);
      expect(i, t).toBeGreaterThan(poz);
      poz = i;
    }
    expect(tekst).not.toContain("§ 8");
    expect((documentXml.match(/<w:pageBreakBefore\/>/g) ?? []).length).toBe(4);
  });

  it("kwoty: prowizja dobrana do grosza, 35 × 900,00 + 25 900,00, KW znormalizowana", async () => {
    const { tekst } = await komplet(przypadekA());
    expect(tekst).toContain("(21 525,12 zł)");
    expect(tekst).toContain("35 rat po 900,00 zł oraz rata końcowa (balonowa) 25 900,00 zł");
    expect(tekst).toContain("36 | 24.09.2029 | 25 900,00 | 25 000,00 | 302,08 | 597,92 | 0,00");
    expect(tekst).toContain("Razem |  | 57 400,00 | 25 000,00 | 10 874,88 | 21 525,12 |");
    expect(tekst).toContain("księgę wieczystą nr KR1P/00610770/2");
    expect(tekst).not.toContain("KR1P/610770/2");
    // hipoteka 99 000 zł na kolejnym miejscu: wpis poprzedzający w stanie obciążeń
    expect(tekst).toContain("hipoteka umowna na rzecz Bank Przykładowy S.A. na kwotę 62 000,00 zł");
    // roszczenie o przeniesienie na opróżnione miejsce + 777 do 99 000 zł
    expect(tekst).toContain("roszczenie o przeniesienie hipoteki");
    expect(tekst).toContain("art. 777 §1 pkt 5 k.p.c. do kwoty 99 000,00 zł");
  });

  it("odesłania liczone po numeracji (doręczenia → 777, wypowiedzenie → zakaz rozporządzania)", async () => {
    const { tekst } = await komplet(przypadekA());
    expect(tekst).toContain("wezwania, o którym mowa w § 3 ust. 4, które doręcza się");
    expect(tekst).toContain("bez zgody Pożyczkodawcy, o której mowa w § 3 ust. 3.");
    expect(tekst).toContain("(§ 4 ust. 5 Umowy)"); // Zał. 3 → zwrot kosztów
  });

  it("bloki podpisów to niewidoczne tabele, bez tabulatorów", async () => {
    const { documentXml, tekst } = await komplet(przypadekA());
    expect(documentXml).not.toMatch(/<w:tab\b|<w:tabs\b/);
    const bezRamek = documentXml.match(/<w:tblBorders><w:top w:val="nil"\/>/g) ?? [];
    expect(bezRamek.length).toBe(5); // wniosek, umowa, Zał. 1, 2, 3
    expect(tekst).toContain(
      "…………………………………… / Pożyczkobiorca / Tomasz Wiśniewski | …………………………………… / Pożyczkodawca / FINANCE YOU sp. z o.o. / Filip Bielak – prezes zarządu",
    );
  });

  it("deterministyczny: te same dane → ten sam plik i hash; wersja biblioteki w wyniku", async () => {
    const k1 = await komplet(przypadekA());
    const k2 = await komplet(przypadekA());
    expect(k1.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(k1.sha256).toBe(k2.sha256);
    expect(Buffer.from(k1.bytes).equals(Buffer.from(k2.bytes))).toBe(true);
    expect(k1.wersjaBiblioteki).toBe(WERSJA_BIBLIOTEKI);
    expect(WERSJA_BIBLIOTEKI).toBe("1.1");
  });

  it("plik .docx ma komplet części pakietu (document, styles, relacje)", async () => {
    const { bytes } = await komplet(przypadekA());
    const zip = new PizZip(bytes);
    for (const f of [
      "[Content_Types].xml",
      "_rels/.rels",
      "word/document.xml",
      "word/styles.xml",
      "word/_rels/document.xml.rels",
    ])
      expect(zip.file(f), f).not.toBeNull();
  });
});

describe("przypadki (b) i (c) — konstrukcja", () => {
  it("(b) solidarność, udziały 1/2, formy mnogie, pośrednik w protokole", async () => {
    const { tekst } = await komplet(przypadekB());
    expect(tekst).toContain(
      "Pożyczkobiorcy odpowiadają za zobowiązania wynikające z niniejszej Umowy solidarnie",
    );
    expect(tekst).toContain("w udziale wynoszącym 1/2 części");
    expect(tekst).toContain("niniejszą Umowę zawarli jako przedsiębiorcy");
    expect(tekst).toContain("Pośrednik finansowy: | Jan Pośrednik (tel. 600 700 800)");
    expect(tekst).toContain("Negocjacje trwały: | 10.09.2026 – 24.09.2026");
    expect(tekst).toContain("Umowę sporządzono w 3 jednobrzmiących egzemplarzach");
  });

  it("(c) spółka: reprezentant w podpisie, zabezpieczenie rzeczowe poręczyciela, majątek osobisty", async () => {
    const { tekst } = await komplet(przypadekC());
    expect(tekst).toContain("ZABEZPIECZENIE RZECZOWE PORĘCZYCIELA");
    expect(tekst).toContain(
      "Pożyczkobiorca / Przykład Logistyka sp. z o.o. / Paweł Nowicki – prezes zarządu",
    );
    expect(tekst).toContain("…………………………………… / Poręczyciel / Paweł Nowicki");
    expect(tekst).toContain("ustrój rozdzielności majątkowej");
    expect(tekst).toContain("Poręczyciel: | Paweł Nowicki");
  });
});
