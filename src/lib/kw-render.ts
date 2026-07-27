// Odtwarzanie treści księgi wieczystej z danych OCR (screeny wgrane przez
// operatora) w DOKŁADNIE tym samym formacie, w jakim CMD KW Engine zapisuje
// działy w kw_documents: HTML tabel z etykietami pól EKW.
//
// Dzięki temu wszystko, co konsumuje kw_documents — parsery analizy ryzyka
// (kw-parser.server.ts), parser adresu (kw-address-core.ts) i podgląd treści
// KW w UI (kw-content-section.tsx) — działa identycznie dla treści z OCR
// jak dla treści pobranej z EKW.
//
// Moduł czysty (bez zależności serwerowych) — testowalny round-tripem
// przez istniejące parsery.

export interface KwExtractionOwner {
  /** Osoba fizyczna. */
  imiePierwsze?: string | null;
  imieDrugie?: string | null;
  nazwisko?: string | null;
  imieOjca?: string | null;
  imieMatki?: string | null;
  pesel?: string | null;
  /** Osoba prawna / instytucja. */
  nazwa?: string | null;
  regon?: string | null;
  siedziba?: string | null;
  /** Np. "1/2". */
  udzial?: string | null;
}

export interface KwExtractionDzialka {
  numer?: string | null;
  obreb?: string | null;
  polozenie?: string | null;
  sposobKorzystania?: string | null;
}

export interface KwExtractionHipoteka {
  numer?: string | number | null;
  /** Np. "HIPOTEKA UMOWNA", "HIPOTEKA PRZYMUSOWA". */
  rodzaj?: string | null;
  sumaKwota?: number | null;
  /** Np. "ZŁ", "EUR". */
  walutaSumy?: string | null;
  wierzyciel?: string | null;
  tresc?: string | null;
}

export interface KwExtraction {
  kwNumber?: string | null;
  sadRejonowy?: string | null;
  typKsiegi?: string | null;
  dzial1o?: {
    wojewodztwo?: string | null;
    powiat?: string | null;
    gmina?: string | null;
    miejscowosc?: string | null;
    ulica?: string | null;
    numerBudynku?: string | null;
    numerLokalu?: string | null;
    przeznaczenie?: string | null;
    /** Np. "45,50 M2" albo "0,0450 HA" — dosłownie jak w księdze. */
    obszar?: string | null;
    kondygnacja?: number | null;
    liczbaKondygnacji?: number | null;
    dzialki?: KwExtractionDzialka[] | null;
    inne?: string[] | null;
  } | null;
  dzial1sp?: { wpisy?: string[] | null } | null;
  dzial2?: { wlasciciele?: KwExtractionOwner[] | null } | null;
  dzial3?: {
    brakWpisu?: boolean | null;
    wpisy?: Array<{ rodzaj?: string | null; tresc?: string | null }> | null;
  } | null;
  dzial4?: { brakWpisu?: boolean | null; hipoteki?: KwExtractionHipoteka[] | null } | null;
  uwagi?: string[] | null;
}

export interface KwRenderedSections {
  okladka: string;
  dzial_1o: string | null;
  dzial_1s: string | null;
  dzial_2: string | null;
  dzial_3: string | null;
  dzial_4: string | null;
  /** Braki/zastrzeżenia do pokazania operatorowi. */
  warnings: string[];
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s && s !== "null" && s !== "undefined" ? s : null;
}

function row(label: string, value: string | null | undefined): string {
  const v = str(value);
  if (!v) return "";
  return `<tr><td class="csTytul">${esc(label)}</td><td class="csDane">${esc(v)}</td></tr>`;
}

// Wartości w EKW pisane są wersalikami — ujednolicamy, bo parsery działów
// (nazwiska, adres) rozpoznają wartości po pisowni CAPS.
function rowCaps(label: string, value: string | null | undefined): string {
  const v = str(value);
  return row(label, v ? v.toUpperCase() : null);
}

// Bez nagłówka w treści — etykiety sekcji dodaje UI (akordeon), a dodatkowy
// tekst zaśmiecałby dane wejściowe parserów.
function table(_title: string, rowsHtml: string): string | null {
  const body = rowsHtml.trim();
  if (!body) return null;
  return `<table class="kw-ocr">${body}</table>`;
}

/** Kwota w formacie EKW: "300 000,00" (zwykłe spacje jako separatory tysięcy). */
export function formatKwAmount(n: number): string {
  return n
    .toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/[  ]/g, " ");
}

function renderDzial1o(d: NonNullable<KwExtraction["dzial1o"]>): string | null {
  let rows = "";
  rows += rowCaps("Województwo", d.wojewodztwo);
  rows += rowCaps("Powiat", d.powiat);
  rows += rowCaps("Gmina", d.gmina);
  rows += rowCaps("Miejscowość", d.miejscowosc);
  // Ulica/nr budynku/nr lokalu w układzie CMD: wiersz etykiet + wiersz trzech
  // komórek wartości (tak czyta je parser adresu — cellsAfter „Numer lokalu").
  if (str(d.ulica) || str(d.numerBudynku) || str(d.numerLokalu)) {
    const cell = (v: string | null | undefined, caps = false) => {
      const s = str(v);
      return esc(s ? (caps ? s.toUpperCase() : s) : "---");
    };
    rows +=
      `<tr><td class="csTytul">Ulica</td><td class="csTytul">Numer budynku</td><td class="csTytul">Numer lokalu</td></tr>` +
      `<tr><td class="csBDane">${cell(d.ulica, true)}</td><td class="csBDane">${cell(d.numerBudynku)}</td><td class="csBDane">${cell(d.numerLokalu)}</td></tr>`;
  }
  rows += rowCaps("Przeznaczenie lokalu", d.przeznaczenie);
  rows += rowCaps("Obszar", d.obszar);
  if (d.kondygnacja != null) rows += row("Kondygnacja", String(d.kondygnacja));
  if (d.liczbaKondygnacji != null) rows += row("Liczba kondygnacji", String(d.liczbaKondygnacji));
  for (const dz of d.dzialki ?? []) {
    rows += row("Numer działki", dz?.numer);
    rows += row("Obręb ewidencyjny", dz?.obreb);
    // Uwaga: celowo NIE używamy etykiety „Położenie…" — kolidowałaby z parserem
    // adresu (kw-address-core), który szuka komórek za etykietą „Położenie".
    rows += row("Umiejscowienie działki", dz?.polozenie);
    rows += row("Sposób korzystania", dz?.sposobKorzystania);
  }
  for (const line of d.inne ?? []) rows += row("Informacja dodatkowa", line);
  return table("Dział I-O — Oznaczenie nieruchomości", rows);
}

function renderDzial2(d: NonNullable<KwExtraction["dzial2"]>): string | null {
  let rows = "";
  let lp = 0;
  for (const w of d.wlasciciele ?? []) {
    if (!w) continue;
    lp += 1;
    rows += row("Lp.", String(lp));
    rows += row("Wielkość udziału", w.udzial);
    if (str(w.nazwa)) {
      // Osoba prawna / instytucja.
      rows += rowCaps("Nazwa", w.nazwa);
      rows += rowCaps("Siedziba", w.siedziba);
      rows += row("REGON", w.regon);
    } else {
      rows += rowCaps("Imię pierwsze", w.imiePierwsze);
      rows += rowCaps("Imię drugie", w.imieDrugie);
      rows += rowCaps("Nazwisko / pierwszy człon nazwiska złożonego", w.nazwisko);
      rows += rowCaps("Imię ojca", w.imieOjca);
      rows += rowCaps("Imię matki", w.imieMatki);
      rows += row("PESEL", w.pesel);
    }
  }
  return table("Dział II — Własność", rows);
}

function renderDzial3(d: NonNullable<KwExtraction["dzial3"]>): string | null {
  const wpisy = (d.wpisy ?? []).filter((w) => str(w?.rodzaj) || str(w?.tresc));
  if (d.brakWpisu || wpisy.length === 0) {
    return table("Dział III — Prawa, roszczenia i ograniczenia", row("Wpisy", "BRAK WPISU"));
  }
  let rows = "";
  wpisy.forEach((w, i) => {
    rows += row("Numer wpisu", String(i + 1));
    rows += row("Rodzaj wpisu", w.rodzaj);
    rows += row("Treść wpisu", w.tresc);
  });
  return table("Dział III — Prawa, roszczenia i ograniczenia", rows);
}

function renderDzial4(d: NonNullable<KwExtraction["dzial4"]>): string | null {
  const hipoteki = (d.hipoteki ?? []).filter(
    (h) => str(h?.rodzaj) || h?.sumaKwota != null || str(h?.wierzyciel) || str(h?.tresc),
  );
  if (d.brakWpisu || hipoteki.length === 0) {
    return table("Dział IV — Hipoteki", row("Wpisy", "BRAK WPISU"));
  }
  let rows = "";
  hipoteki.forEach((h, i) => {
    rows += row("Numer hipoteki (roszczenia)", String(str(h.numer) ?? i + 1));
    rows += rowCaps("Rodzaj hipoteki (roszczenia)", h.rodzaj ?? "HIPOTEKA");
    if (h.sumaKwota != null && Number.isFinite(h.sumaKwota) && h.sumaKwota > 0) {
      rows += row("Suma", formatKwAmount(h.sumaKwota));
      rows += rowCaps("Waluta sumy", str(h.walutaSumy) ?? "ZŁ");
    }
    if (str(h.wierzyciel)) {
      rows += row("Wierzyciel hipoteczny", "—");
      rows += rowCaps("Nazwa", h.wierzyciel);
    }
    rows += row("Treść wpisu", h.tresc);
  });
  return table("Dział IV — Hipoteki", rows);
}

/**
 * Buduje komplet sekcji kw_documents z wyniku ekstrakcji OCR.
 * Sekcje, których nie było na screenach (null w ekstrakcji), pozostają null —
 * a operator dostaje o tym ostrzeżenie (parser potraktuje null jak brak danych,
 * nie jak „brak wpisów").
 */
export function renderKwSections(
  x: KwExtraction,
  opts?: { importedAt?: string },
): KwRenderedSections {
  const warnings: string[] = [];

  const dzial_1o = x.dzial1o ? renderDzial1o(x.dzial1o) : null;
  const dzial_1s = x.dzial1sp
    ? table(
        "Dział I-Sp — Spis praw związanych",
        (x.dzial1sp.wpisy ?? []).map((w) => row("Wpis", w)).join(""),
      )
    : null;
  const dzial_2 = x.dzial2 ? renderDzial2(x.dzial2) : null;
  const dzial_3 = x.dzial3 ? renderDzial3(x.dzial3) : null;
  const dzial_4 = x.dzial4 ? renderDzial4(x.dzial4) : null;

  if (!dzial_1o) warnings.push("Screeny nie objęły działu I-O (oznaczenie/adres nieruchomości).");
  if (!dzial_2)
    warnings.push("Screeny nie objęły działu II (własność) — nie zweryfikowano właściciela.");
  if (!dzial_3) warnings.push("Screeny nie objęły działu III (prawa/roszczenia/ograniczenia).");
  if (!dzial_4) warnings.push("Screeny nie objęły działu IV (hipoteki) — stan obciążeń NIEZNANY.");
  warnings.push(...(x.uwagi ?? []).map((u) => str(u)).filter((u): u is string => !!u));

  let okladkaRows = "";
  okladkaRows += row("Numer księgi wieczystej", x.kwNumber);
  okladkaRows += row("Typ księgi", x.typKsiegi);
  okladkaRows += row("Sąd rejonowy", x.sadRejonowy);
  okladkaRows += row(
    "Źródło treści",
    "OCR ze zrzutów ekranu (import ręczny) — nie jest to odpis z EKW",
  );
  if (opts?.importedAt) okladkaRows += row("Data importu", opts.importedAt);
  const missing = [
    !dzial_1o ? "I-O" : null,
    !dzial_2 ? "II" : null,
    !dzial_3 ? "III" : null,
    !dzial_4 ? "IV" : null,
  ].filter(Boolean);
  if (missing.length) okladkaRows += row("Działy nieobjęte importem", missing.join(", "));
  const okladka =
    `<p><b>Treść KW odtworzona z wgranych zrzutów ekranu (OCR)</b> — zweryfikuj z oryginałem lub pobierz odpis z EKW.</p>` +
    (table("Okładka", okladkaRows) ?? "");

  return { okladka, dzial_1o, dzial_1s, dzial_2, dzial_3, dzial_4, warnings };
}
