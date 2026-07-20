// Generator PDF zgłoszenia GIIF — sami budujemy bajty PDF (w tym środowisku
// nie ma zewnętrznych bibliotek PDF; ten sam mechanizm co loan-calc-pdf).
// Tekst widoczny jest ASCII-fold (fonty standardowe nie mają ogonków);
// pełne dane w oryginalnej pisowni niesie XML, który jest dokumentem
// właściwym — PDF służy do podglądu i archiwum.
import type { GiifReportPayload } from "@/lib/aml/aml-types";
import { REPORT_TYPE_LABELS } from "@/lib/aml/aml-types";

function fold(s: string): string {
  const map: Record<string, string> = {
    ą: "a",
    ć: "c",
    ę: "e",
    ł: "l",
    ń: "n",
    ó: "o",
    ś: "s",
    ż: "z",
    ź: "z",
    Ą: "A",
    Ć: "C",
    Ę: "E",
    Ł: "L",
    Ń: "N",
    Ó: "O",
    Ś: "S",
    Ż: "Z",
    Ź: "Z",
  };
  return s.replace(/[ąćęłńóśżźĄĆĘŁŃÓŚŻŹ]/g, (ch) => map[ch] ?? ch).replace(/[^\x20-\x7e]/g, "?");
}

function pdfEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrap(s: string, width: number): string[] {
  const out: string[] = [];
  for (const para of s.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      if ((line + " " + word).trim().length > width) {
        if (line) out.push(line);
        line = word;
      } else {
        line = (line ? line + " " : "") + word;
      }
    }
    out.push(line);
  }
  return out;
}

export function buildGiifReportLines(
  p: GiifReportPayload,
  meta: { reportId: string; version: number; generatedAt: string },
): string[] {
  const L: string[] = [];
  const H = (t: string) => {
    L.push("");
    L.push(t.toUpperCase());
    L.push("-".repeat(t.length));
  };
  L.push("ZGLOSZENIE DO GENERALNEGO INSPEKTORA INFORMACJI FINANSOWEJ (GIIF)");
  L.push(`Rodzaj: ${fold(REPORT_TYPE_LABELS[p.reportType])}`);
  L.push(`Identyfikator: ${meta.reportId}  Wersja: ${meta.version}`);
  L.push(`Wygenerowano: ${meta.generatedAt}`);

  H("Instytucja obowiazana");
  L.push(fold(p.institution.name ?? ""));
  L.push(
    `NIP: ${p.institution.nip ?? "-"}  KRS: ${p.institution.krs ?? "-"}  REGON: ${p.institution.regon ?? "-"}`,
  );
  L.push(
    fold(
      `${p.institution.address ?? ""} ${p.institution.postalCode ?? ""} ${p.institution.city ?? ""}`.trim(),
    ),
  );

  H("Osoba odpowiedzialna");
  L.push(
    fold(
      `${p.responsiblePerson.firstName} ${p.responsiblePerson.lastName}${p.responsiblePerson.jobTitle ? ", " + p.responsiblePerson.jobTitle : ""}`,
    ),
  );
  L.push(`E-mail: ${p.responsiblePerson.email ?? "-"}  Tel: ${p.responsiblePerson.phone ?? "-"}`);
  if (
    p.signerPerson &&
    (p.signerPerson.firstName !== p.responsiblePerson.firstName ||
      p.signerPerson.lastName !== p.responsiblePerson.lastName)
  ) {
    L.push(fold(`Osoba podpisujaca: ${p.signerPerson.firstName} ${p.signerPerson.lastName}`));
  }

  if (p.customer) {
    H("Podmiot zgloszenia");
    L.push(
      fold(
        `${p.customer.name} (${p.customer.entityType === "firma" ? "podmiot" : "osoba fizyczna"})`,
      ),
    );
    if (p.customer.pesel) L.push(`PESEL: ${p.customer.pesel}`);
    if (p.customer.nip) L.push(`NIP: ${p.customer.nip}`);
    if (p.customer.dob) L.push(`Data urodzenia: ${p.customer.dob}`);
    if (p.customer.address) L.push(fold(`Adres: ${p.customer.address}`));
    for (const r of p.customer.representatives ?? [])
      L.push(fold(`Reprezentant: ${r.name}${r.role ? " (" + r.role + ")" : ""}`));
    for (const b of p.customer.beneficialOwners ?? [])
      L.push(
        fold(
          `Beneficjent rzeczywisty: ${b.name}${b.sharePct != null ? " (" + b.sharePct + "%)" : ""}`,
        ),
      );
  }

  H("Strony transakcji");
  for (const s of p.parties) {
    L.push(
      fold(
        `- [${s.role}] ${s.name}${s.account ? ", rachunek: " + s.account : ""}${s.country ? ", kraj: " + s.country : ""}`,
      ),
    );
  }

  H("Transakcje");
  for (const t of p.transactions) {
    L.push(
      fold(
        `- ${t.date}  ${t.type}  ${t.amount.toFixed(2)} ${t.currency}` +
          (t.eurEquivalent != null
            ? `  (= ${t.eurEquivalent.toFixed(2)} EUR, kurs ${t.nbpRate ?? "-"}, tabela ${t.nbpTableNo ?? "-"})`
            : ""),
      ),
    );
    if (t.senderAccount || t.receiverAccount)
      L.push(`    ${t.senderAccount ?? "?"} -> ${t.receiverAccount ?? "?"}`);
    if (t.description) for (const w of wrap(fold(t.description), 90)) L.push(`    ${w}`);
  }

  if (p.contract?.ref || p.contract?.date) {
    H("Umowa");
    L.push(
      fold(
        `${p.contract.ref ?? ""} z dnia ${p.contract.date ?? "-"}` +
          (p.contract.amount != null
            ? `, kwota ${p.contract.amount.toFixed(2)} ${p.contract.currency ?? "PLN"}`
            : ""),
      ),
    );
  }

  if (p.justification) {
    H("Uzasadnienie");
    for (const w of wrap(fold(p.justification), 95)) L.push(w);
  }

  if (p.attachments?.length) {
    H("Zalaczniki");
    for (const a of p.attachments)
      L.push(
        fold(`- ${a.fileName}${a.sha256 ? " (SHA-256: " + a.sha256.slice(0, 16) + "...)" : ""}`),
      );
  }

  return L;
}

/** Buduje wielostronicowy PDF (Courier 9pt, A4) z podanych linii tekstu. */
export function buildPdfBytes(lines: string[]): Uint8Array {
  const PAGE_W = 595,
    PAGE_H = 842,
    MARGIN = 40,
    FS = 9,
    LH = 12;
  const linesPerPage = Math.floor((PAGE_H - 2 * MARGIN) / LH);
  const pages: string[][] = [];
  for (let i = 0; i < Math.max(1, lines.length); i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage));
  }

  const objects: string[] = [];
  const add = (body: string) => objects.push(body); // id = objects.length (1-based)
  let nextId = 1;
  const catalogId = nextId++;
  const pagesId = nextId++;
  const fontId = nextId++;
  add(`${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj\n`);
  const pageObjIds: number[] = [];
  const pageObjs: string[] = [];
  for (const pageLines of pages) {
    const pageId = nextId++;
    const contentId = nextId++;
    pageObjIds.push(pageId);
    let stream = `BT /F1 ${FS} Tf ${MARGIN} ${PAGE_H - MARGIN} Td ${LH} TL\n`;
    for (const line of pageLines) stream += `(${pdfEscape(fold(line))}) Tj T*\n`;
    stream += "ET";
    pageObjs.push(
      `${pageId} 0 obj\n<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
      `${contentId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    );
  }
  add(
    `${pagesId} 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map((i) => `${i} 0 R`).join(" ")}] /Count ${pageObjIds.length} >>\nendobj\n`,
  );
  add(`${fontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n`);
  for (const o of pageObjs) add(o);

  // Posortuj obiekty po id (offsety w xref muszą odpowiadać kolejności id).
  const byId = objects
    .map((o) => ({ id: Number(o.match(/^(\d+) 0 obj/)?.[1] ?? 0), o }))
    .sort((a, b) => a.id - b.id);

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const { o } of byId) {
    offsets.push(pdf.length);
    pdf += o;
  }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${byId.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${byId.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

export function buildGiifReportPdf(
  p: GiifReportPayload,
  meta: { reportId: string; version: number; generatedAt: string },
): Uint8Array {
  return buildPdfBytes(buildGiifReportLines(p, meta));
}
