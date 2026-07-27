// ════════════════════════════════════════════════════════════════════
// Wstawianie harmonogramu spłat jako TABELI Worda w miejsce placeholdera
// `[HARMONOGRAM]`. Dzięki temu wzór „umowa pożyczki z załącznikami REDLINE"
// może mieć cały harmonogram jako JEDEN placeholder — generator zamienia go na
// prawdziwą tabelę WordprocessingML (nie płaski tekst).
//
// Czyste funkcje (bez zależności serwerowych) — testowalne osobno.
// ════════════════════════════════════════════════════════════════════

export interface ScheduleRow {
  idx: number;
  date: string;
  rata: number;
  kap: number;
  ods: number;
  saldo: number;
}

const PL = (n: number) =>
  new Intl.NumberFormat("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Math.round((Number(n) || 0) * 100) / 100,
  );

function xmlEsc(s: string): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function tc(text: string, w: number, opts?: { bold?: boolean; right?: boolean }): string {
  const jc = opts?.right ? '<w:jc w:val="right"/>' : "";
  const rpr = opts?.bold ? "<w:rPr><w:b/></w:rPr>" : "";
  return (
    `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>` +
    `<w:p><w:pPr>${jc}</w:pPr><w:r>${rpr}<w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r></w:p></w:tc>`
  );
}

function tr(cells: string): string {
  return `<w:tr>${cells}</w:tr>`;
}

/** Buduje XML tabeli harmonogramu (nagłówek + wiersze + suma RAZEM). */
export function buildScheduleTableXml(schedule: ScheduleRow[]): string {
  const W = [560, 1500, 1600, 1600, 1600, 1700]; // szerokości kolumn (dxa)
  const totals = schedule.reduce(
    (acc, r) => ({ rata: acc.rata + r.rata, kap: acc.kap + r.kap, ods: acc.ods + r.ods }),
    { rata: 0, kap: 0, ods: 0 },
  );

  const header = tr(
    tc("Nr", W[0], { bold: true }) +
      tc("Termin", W[1], { bold: true }) +
      tc("Rata", W[2], { bold: true, right: true }) +
      tc("Kapitał", W[3], { bold: true, right: true }) +
      tc("Odsetki", W[4], { bold: true, right: true }) +
      tc("Saldo", W[5], { bold: true, right: true }),
  );

  const body = schedule
    .map((r) =>
      tr(
        tc(String(r.idx), W[0]) +
          tc(r.date, W[1]) +
          tc(PL(r.rata), W[2], { right: true }) +
          tc(PL(r.kap), W[3], { right: true }) +
          tc(PL(r.ods), W[4], { right: true }) +
          tc(PL(r.saldo), W[5], { right: true }),
      ),
    )
    .join("");

  const foot = tr(
    tc("", W[0], { bold: true }) +
      tc("RAZEM", W[1], { bold: true }) +
      tc(PL(totals.rata), W[2], { bold: true, right: true }) +
      tc(PL(totals.kap), W[3], { bold: true, right: true }) +
      tc(PL(totals.ods), W[4], { bold: true, right: true }) +
      tc("", W[5]),
  );

  const grid = W.map((w) => `<w:gridCol w:w="${w}"/>`).join("");
  const borders =
    "<w:tblBorders>" +
    '<w:top w:val="single" w:sz="4" w:space="0" w:color="999999"/>' +
    '<w:left w:val="single" w:sz="4" w:space="0" w:color="999999"/>' +
    '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="999999"/>' +
    '<w:right w:val="single" w:sz="4" w:space="0" w:color="999999"/>' +
    '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="cccccc"/>' +
    '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="cccccc"/>' +
    "</w:tblBorders>";

  return (
    `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>${borders}</w:tblPr>` +
    `<w:tblGrid>${grid}</w:tblGrid>${header}${body}${foot}</w:tbl><w:p/>`
  );
}

/**
 * Zamienia akapit zawierający `[HARMONOGRAM]` na tabelę harmonogramu.
 * Gdy placeholdera nie ma albo brak harmonogramu — zwraca XML bez zmian.
 * Placeholder musi być już „sklejony" (po normalizePlaceholders).
 */
export function injectScheduleTable(
  xml: string,
  schedule: ScheduleRow[] | null | undefined,
): string {
  if (!schedule || schedule.length === 0) return xml;
  if (!xml.includes("[HARMONOGRAM]")) return xml;
  const table = buildScheduleTableXml(schedule);
  // Podmień CAŁY akapit zawierający token (tabela nie może stać wewnątrz <w:p>).
  const paraRe = /<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?\[HARMONOGRAM\](?:(?!<\/w:p>)[\s\S])*?<\/w:p>/;
  if (paraRe.test(xml)) return xml.replace(paraRe, table);
  // Fallback: token poza akapitem — podmień sam token.
  return xml.replace(/\[HARMONOGRAM\]/, table);
}
