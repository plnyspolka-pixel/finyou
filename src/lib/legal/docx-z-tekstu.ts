/**
 * Dokumenty pakietu inwestora jako .docx.
 *
 * • `blokiZTekstu` — jedna linia `content_text` = jeden akapit (jak w v6),
 *   z formatowaniem nagłówków (§, ZAŁĄCZNIK NR, wiersze wersalikami).
 *   Tekst wyciągnięty z wygenerowanego .docx jest równy `content_text`,
 *   więc SHA-256 treści (zapisywany w akceptacjach) odpowiada plikowi.
 * • `podmienWDocx` — punktowe podmiany w oryginalnym .docx (NDA, RODO),
 *   żeby zachować ich układ, nagłówki i stopki.
 */
import type { Blok } from "@/lib/contract-engine/umowa-docx";

const WERSALIKI = /^[A-ZĄĆĘŁŃÓŚŹŻ0-9][A-ZĄĆĘŁŃÓŚŹŻ0-9 /,.—–()-]{2,}$/;

function jestNaglowkiem(linia: string): boolean {
  if (linia.length > 120) return false;
  if (/^§ [0-9A-Z]+\. /.test(linia)) return true;
  if (linia === "Preambuła") return true;
  return WERSALIKI.test(linia) && /[A-ZĄĆĘŁŃÓŚŹŻ]{3}/.test(linia);
}

export function blokiZTekstu(tekst: string): Blok[] {
  const linie = tekst.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n");
  const bloki: Blok[] = [];
  let poZalaczniku = false;
  linie.forEach((linia, i) => {
    if (i === 0) {
      bloki.push({ t: "tytul", tekst: linia });
      return;
    }
    if (i === 1 || poZalaczniku) {
      poZalaczniku = false;
      bloki.push({ t: "podtytul", tekst: linia });
      return;
    }
    if (/^ZAŁĄCZNIK NR \d+$/.test(linia)) {
      bloki.push({ t: "tytul", tekst: linia, nowaStrona: true });
      poZalaczniku = true;
      return;
    }
    if (jestNaglowkiem(linia)) {
      bloki.push({ t: "naglowek", tekst: linia });
      return;
    }
    const doLewej = linia.length < 70 || /^[☐☒_]/.test(linia);
    bloki.push({
      t: "akapit",
      runs: [{ tekst: linia }],
      align: doLewej ? "left" : "both",
    });
  });
  return bloki;
}

export interface Podmiana {
  z: string;
  na: string;
}

/**
 * Podmienia fragmenty tekstu w częściach XML oryginalnego .docx
 * (document.xml, nagłówki, stopki). Każda podmiana musi trafić co najmniej
 * raz — inaczej błąd (fragment rozbity na kilka runów).
 */
export async function podmienWDocx(bajty: Uint8Array, podmiany: Podmiana[]): Promise<Uint8Array> {
  const { default: PizZip } = await import("pizzip");
  const zip = new PizZip(bajty);
  const czesci = Object.keys(zip.files).filter((n) =>
    /^word\/(document|header\d*|footer\d*)\.xml$/.test(n),
  );
  const date = new Date(Date.UTC(2020, 0, 1));
  const trafienia = new Map<string, number>();
  for (const nazwa of czesci) {
    let xml = zip.file(nazwa)!.asText();
    for (const p of podmiany) {
      const n = xml.split(p.z).length - 1;
      if (n > 0) {
        xml = xml.split(p.z).join(p.na);
        trafienia.set(p.z, (trafienia.get(p.z) ?? 0) + n);
      }
    }
    zip.file(nazwa, xml, { date });
  }
  for (const p of podmiany) {
    if (!trafienia.get(p.z)) throw new Error(`Brak fragmentu w .docx: ${p.z}`);
  }
  // Stała data wszystkich wpisów → powtarzalny plik.
  for (const nazwa of Object.keys(zip.files)) {
    const f = zip.files[nazwa];
    if (!f.dir) zip.file(nazwa, f.asUint8Array(), { date, binary: true });
  }
  return zip.generate({ type: "uint8array", compression: "DEFLATE" });
}
