// MPZP w punkcie nieruchomości — parser odpowiedzi GetFeatureInfo Krajowej
// Integracji MPZP (GUGiK). Każda gmina ma inne kolumny tabel, więc pola
// rozpoznajemy po nagłówkach (nazwa planu, oznaczenie/symbol, przeznaczenie,
// uchwała, data, link). Czysta logika — testowalna.

export interface MpzpPlanHit {
  planName: string | null;
  /** Symbol terenu, np. „MN.1”, „KP.1”. */
  symbol: string | null;
  /** Przeznaczenie terenu (opis symbolu). */
  purpose: string | null;
  resolution: string | null;
  adoptedAt: string | null;
  validFrom: string | null;
  url: string | null;
  /** Nazwa warstwy gminnej, z której pochodzi wpis. */
  layer: string | null;
}

export interface MpzpInfo {
  status: "found" | "none" | "unavailable";
  /** Gmina wskazana przez usługę (także przy braku planu). */
  commune: string | null;
  plans: MpzpPlanHit[];
  note: string;
  source: "KIMPZP GUGiK";
}

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

function pick(row: Record<string, string>, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    for (const [k, v] of Object.entries(row)) {
      if (p.test(k) && v && v.toLowerCase() !== "null") return v.slice(0, 300);
    }
  }
  return null;
}

export function parseMpzpFeatureInfo(htmlText: string): MpzpInfo {
  const html = htmlText.replace(/<style[\s\S]*?<\/style>/gi, "");
  const plain = decode(html);
  const communeNone = plain.match(/([\p{L} .-]{2,60}):\s*brak wyniku/u);
  if (/brak serwisu/i.test(plain)) {
    return {
      status: "unavailable",
      commune: null,
      plans: [],
      note: "Gmina nie udostępnia planów w Krajowej Integracji MPZP — sprawdź w urzędzie gminy / BIP.",
      source: "KIMPZP GUGiK",
    };
  }
  const plans: MpzpPlanHit[] = [];
  const layers = [...html.matchAll(/layer name:\s*'([^']+)'/gi)].map((m) => m[1]);
  const tables = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map((m) => m[0]);
  tables.forEach((t, ti) => {
    const rows = [...t.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((r) =>
      [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => decode(c[1])),
    );
    if (rows.length < 2) return;
    const head = rows[0];
    for (const r of rows.slice(1)) {
      const row: Record<string, string> = {};
      head.forEach((h, i) => (row[h.toLowerCase()] = r[i] ?? ""));
      const hit: MpzpPlanHit = {
        planName: pick(row, [/nazwa.*(mpzp|plan)/, /^nazwa$/, /tytu/]),
        symbol: pick(row, [/^oznaczenie$/, /symbol/, /oznacz/]),
        purpose: pick(row, [/opis_oznac/, /przeznacz/, /opis/, /funkcj/, /rodzaj oznaczenia/]),
        resolution: pick(row, [/uchwal/, /nr uchw/]),
        adoptedAt: pick(row, [/data uchwal/]),
        validFrom: pick(row, [/obowi[aą]zyw/, /wej[sś]cia/]),
        url: pick(row, [/^www$/, /link/, /url/, /adres/]),
        layer: layers[ti] ?? null,
      };
      if (hit.planName || hit.symbol || hit.purpose) plans.push(hit);
    }
  });
  // Ten sam teren bywa w kilku warstwach skali — usuwamy powtórki.
  const seen = new Set<string>();
  const unique = plans.filter((p) => {
    const k = `${p.planName}|${p.symbol}|${p.purpose}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (unique.length) {
    return {
      status: "found",
      commune: communeNone?.[1]?.trim() ?? null,
      plans: unique.slice(0, 6),
      note: "Teren objęty miejscowym planem zagospodarowania przestrzennego (Krajowa Integracja MPZP). Treść planu zweryfikuj w uchwale (link do BIP).",
      source: "KIMPZP GUGiK",
    };
  }
  if (communeNone) {
    return {
      status: "none",
      commune: communeNone[1].trim(),
      plans: [],
      note: `Gmina ${communeNone[1].trim()}: punkt poza obowiązującymi planami w Krajowej Integracji MPZP — prawdopodobnie brak MPZP (zabudowa na podstawie decyzji WZ). Potwierdź w gminie.`,
      source: "KIMPZP GUGiK",
    };
  }
  return {
    status: "unavailable",
    commune: null,
    plans: [],
    note: "Nie odczytano danych planu z Krajowej Integracji MPZP — sprawdź w urzędzie gminy.",
    source: "KIMPZP GUGiK",
  };
}
