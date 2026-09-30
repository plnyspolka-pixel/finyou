// Parser pliku CSV z listą adresów do importu subskrybentów mailingu.
// Obsługuje separator "," lub ";" (Excel PL), pola w cudzysłowach i BOM.
// Rozpoznawane kolumny (bez względu na wielkość liter):
//   email | e-mail | adres_email          — wymagana
//   first_name | imie | imię              — opcjonalna
//   last_name | nazwisko                  — opcjonalna
//   tags | tagi                           — opcjonalna, wiele tagów rozdzielonych "|"

export type SubscriberCsvRow = {
  email: string;
  first_name?: string;
  last_name?: string;
  tags?: string[];
};

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

const COLS: Record<keyof SubscriberCsvRow, string[]> = {
  email: ["email", "e-mail", "adres_email", "mail"],
  first_name: ["first_name", "imie", "imię"],
  last_name: ["last_name", "nazwisko"],
  tags: ["tags", "tagi"],
};

export function parseSubscriberCsv(text: string): { rows: SubscriberCsvRow[]; error?: string } {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  if (!lines.length) return { rows: [], error: "Plik jest pusty" };
  const sep = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const header = splitLine(lines[0], sep).map((h) => h.toLowerCase());
  const idx = (k: keyof SubscriberCsvRow) => header.findIndex((h) => COLS[k].includes(h));
  const iEmail = idx("email");
  if (iEmail < 0) return { rows: [], error: "Brak kolumny „email” w pierwszym wierszu" };
  const iFirst = idx("first_name");
  const iLast = idx("last_name");
  const iTags = idx("tags");

  const rows: SubscriberCsvRow[] = [];
  for (const line of lines.slice(1)) {
    const v = splitLine(line, sep);
    const email = v[iEmail];
    if (!email) continue;
    const row: SubscriberCsvRow = { email };
    if (iFirst >= 0 && v[iFirst]) row.first_name = v[iFirst].slice(0, 120);
    if (iLast >= 0 && v[iLast]) row.last_name = v[iLast].slice(0, 120);
    if (iTags >= 0 && v[iTags]) {
      const tags = v[iTags]
        .split("|")
        .map((t) => t.trim().slice(0, 60))
        .filter(Boolean)
        .slice(0, 10);
      if (tags.length) row.tags = tags;
    }
    rows.push(row);
  }
  return { rows };
}
