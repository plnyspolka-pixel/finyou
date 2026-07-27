/**
 * Mapper `KwExtraction` → schemat silnika (`nieruchomosc`) — pkt 3.3.2 zlecenia.
 *
 * Wejściem jest już ustrukturyzowana treść KW (`KwExtraction` z `kw-render.ts`),
 * a nie surowy HTML — parser HTML/JSON → `KwExtraction` (pkt 3.3.1) jest osobnym
 * ogniwem. Mapper jest deterministyczny i **nie zgaduje**: pola, których nie da
 * się wyprowadzić z KW (`sposob_usuniecia`, adres właściciela-osoby trzeciej,
 * nowa hipoteka do ustanowienia), zostawia do uzupełnienia przez operatora
 * i sygnalizuje w `ostrzezenia`. Wynik jest szkicem do przeglądu operatora
 * przed generowaniem umowy.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { KwExtraction, KwExtractionOwner } from "../kw-render";

export interface KwMapContext {
  /** Lokalny identyfikator nieruchomości w danych umowy, np. "N1". */
  id: string;
  /** PESEL-e wszystkich pożyczkobiorców (osób fizycznych). */
  pozyczkobiorcaPesele: string[];
  /** PESEL poręczyciela (osoby fizycznej), jeśli występuje. */
  poreczicielPesel?: string | null;
}

export interface KwMapResult {
  /** true, gdy sprawy nie da się obsłużyć silnikiem (np. współwłasność ułamkowa z osobą trzecią). */
  odrzucona: boolean;
  powod?: string;
  /** Szkic `nieruchomosc` (częściowy — operator uzupełnia pola niewyprowadzalne z KW). */
  nieruchomosc?: any;
  ostrzezenia: string[];
}

// ── klasyfikacja wpisów działu III → enum obciazenie.rodzaj ────
function klasyfikujDzialIII(rodzajTekst: string | null | undefined): string {
  const t = (rodzajTekst ?? "").toUpperCase();
  if (!t) return "inne";
  if (t.includes("DOŻYWOC") || t.includes("DOZYWOC")) return "dozywocie";
  if (t.includes("SŁUŻEBNOŚĆ OSOBISTA") || t.includes("SLUZEBNOSC OSOBISTA"))
    return "sluzebnosc_osobista";
  if (t.includes("SŁUŻEBNOŚĆ") || t.includes("SLUZEBNOSC")) return "sluzebnosc_gruntowa";
  if (t.includes("ADMINISTRACYJN")) return "egzekucja_administracyjna";
  if (t.includes("EGZEKUC") || t.includes("ZAJĘCI") || t.includes("ZAJECI"))
    return "egzekucja_sadowa";
  if (t.includes("ROSZCZENIE")) return "roszczenie";
  if (t.includes("NAJEM") || t.includes("DZIERŻAW") || t.includes("DZIERZAW"))
    return "najem_dzierzawa";
  if (t.includes("ZAKAZ ZBY")) return "zakaz_zbywania";
  if (t.includes("HIPOTEKA PRZYMUSOWA")) return "hipoteka_przymusowa";
  return "inne";
}

function klasyfikujHipoteke(rodzajTekst: string | null | undefined): string {
  const t = (rodzajTekst ?? "").toUpperCase();
  if (t.includes("PRZYMUSOWA")) return "hipoteka_przymusowa";
  return "hipoteka_umowna";
}

// ── typ nieruchomości (rodzaj) — best-effort, domyślnie "inne" ──
function klasyfikujRodzajNieruchomosci(kw: KwExtraction): string {
  const typ = (kw.typKsiegi ?? "").toUpperCase();
  const prz = (kw.dzial1o?.przeznaczenie ?? "").toUpperCase();
  if (typ.includes("LOKAL") || prz.includes("LOKAL MIESZKALN")) return "lokal";
  if (
    prz.includes("USŁUGOW") ||
    prz.includes("USLUGOW") ||
    prz.includes("UŻYTKOW") ||
    prz.includes("UZYTKOW")
  )
    return "lokal_uzytkowy";
  if (prz.includes("ROLN") || prz.includes("R-GRUNTY")) return "grunt_rolny";
  if (prz.includes("BUDOWLAN") || prz.includes("ZABUDOW")) return "dzialka_budowlana";
  if (typ.includes("BUDYNKOWA") || prz.includes("DOM") || prz.includes("BUDYNEK")) return "dom";
  return "inne";
}

function imieNazwiskoWlasciciela(o: KwExtractionOwner): string {
  return [o.imiePierwsze, o.imieDrugie, o.nazwisko]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

function opisNieruchomosci(kw: KwExtraction): string {
  const d = kw.dzial1o ?? {};
  const czesci = [
    d.ulica ? `ul. ${d.ulica}${d.numerBudynku ? " " + d.numerBudynku : ""}` : null,
    d.numerLokalu ? `lok. ${d.numerLokalu}` : null,
    d.miejscowosc,
    d.obszar ? `pow. ${d.obszar}` : null,
    d.przeznaczenie,
  ].filter(Boolean);
  return czesci.join(", ") || (kw.typKsiegi ?? "nieruchomość");
}

// ── główny mapper ──────────────────────────────────────────────
export function mapujKwDoNieruchomosci(kw: KwExtraction, ctx: KwMapContext): KwMapResult {
  const ostrzezenia: string[] = [];
  const pbSet = new Set((ctx.pozyczkobiorcaPesele ?? []).filter(Boolean));
  const porPesel = ctx.poreczicielPesel || null;

  // --- właściciele (dział II) ---
  const wlasciciele = (kw.dzial2?.wlasciciele ?? []).filter(Boolean) as KwExtractionOwner[];

  let wlasciciel_ref: string | null = null;
  let wlasciciel_dane: any = undefined;
  let wspolwlasnosc: any = undefined;

  const dopasuj = (o: KwExtractionOwner): "pozyczkobiorca" | "porecziciel" | "osoba_trzecia" => {
    const p = o.pesel || "";
    if (p && pbSet.has(p)) return "pozyczkobiorca";
    if (p && porPesel && p === porPesel) return "porecziciel";
    return "osoba_trzecia";
  };

  if (wlasciciele.length === 0) {
    ostrzezenia.push("Brak właściciela w dziale II KW — ustal wlasciciel_ref ręcznie.");
    wlasciciel_ref = null;
  } else if (wlasciciele.length === 1) {
    const o = wlasciciele[0];
    wlasciciel_ref = dopasuj(o);
    if (wlasciciel_ref === "osoba_trzecia") {
      wlasciciel_dane = budujWlascicielaDane(o, ostrzezenia);
    }
  } else {
    // więcej niż jeden właściciel
    const role = wlasciciele.map(dopasuj);
    const wszyscyPozyczkobiorcy = role.every((r) => r === "pozyczkobiorca");
    if (!wszyscyPozyczkobiorcy) {
      return {
        odrzucona: true,
        powod:
          "Współwłasność z osobą spoza transakcji — Finance You nie przyjmuje nieruchomości we współwłasności " +
          "ułamkowej z osobami trzecimi (wariant 'ulamkowa' świadomie usunięty ze schematu).",
        ostrzezenia,
      };
    }
    wlasciciel_ref = "pozyczkobiorca";
    wspolwlasnosc = {
      rodzaj: "laczna_malzenska",
      wspolwlasciciele: wlasciciele.map((o) => ({
        imie_nazwisko: imieNazwiskoWlasciciela(o),
        pesel: o.pesel ?? null,
      })),
    };
    // zgoda małżonka nie jest wymagana — silnik wykrywa to sam (oboje są stroną)
  }

  // --- działki (dział I-O) ---
  const dzialki_w_kw = (kw.dzial1o?.dzialki ?? [])
    .map((d) => (d?.numer ?? "").trim())
    .filter(Boolean);

  // --- obciążenia (działy III i IV) ---
  const obciazenia: any[] = [];
  for (const w of kw.dzial3?.wpisy ?? []) {
    if (!w) continue;
    const rodzaj = klasyfikujDzialIII(w.rodzaj);
    obciazenia.push({
      dzial: "III",
      rodzaj,
      opis: (w.tresc || w.rodzaj || "wpis działu III").trim(),
      sposob_usuniecia: "brak", // NIE wyprowadzalne z KW — operator/AI ustawia
    });
    if (rodzaj === "inne" && w.rodzaj)
      ostrzezenia.push(
        `Nierozpoznany rodzaj wpisu działu III ("${w.rodzaj}") — zmapowano na 'inne'.`,
      );
  }
  for (const hip of kw.dzial4?.hipoteki ?? []) {
    if (!hip) continue;
    const waluta = (hip.walutaSumy ?? "").toUpperCase().replace(/\s/g, "");
    if (waluta && waluta !== "ZŁ" && waluta !== "ZL" && waluta !== "PLN")
      ostrzezenia.push(
        `Hipoteka w walucie ${hip.walutaSumy} — silnik zakłada PLN, zweryfikuj kwotę.`,
      );
    obciazenia.push({
      dzial: "IV",
      rodzaj: klasyfikujHipoteke(hip.rodzaj),
      opis: (hip.tresc || hip.rodzaj || "hipoteka").trim(),
      wierzyciel: hip.wierzyciel ?? null,
      kwota: hip.sumaKwota != null ? formatKwota(hip.sumaKwota) : null,
      sposob_usuniecia: "brak", // NIE wyprowadzalne z KW — operator/AI ustawia
    });
  }
  if (
    obciazenia.some((o) =>
      ["egzekucja_administracyjna", "dozywocie", "hipoteka_przymusowa"].includes(o.rodzaj),
    )
  )
    ostrzezenia.push(
      "Wpisy ryzykowne (egzekucja administracyjna / dożywocie / hipoteka przymusowa) mają sposob_usuniecia='brak' — " +
        "walidator ostrzeże, dopóki operator nie ustawi sposobu neutralizacji.",
    );

  const nieruchomosc: any = {
    id: ctx.id,
    nr_kw: kw.kwNumber ?? null,
    sad: kw.sadRejonowy ?? null,
    opis: opisNieruchomosci(kw),
    rodzaj: klasyfikujRodzajNieruchomosci(kw),
    wlasciciel_ref,
    ...(wlasciciel_dane !== undefined ? { wlasciciel_dane } : {}),
    ...(wspolwlasnosc !== undefined ? { wspolwlasnosc } : {}),
    obciazenia,
    dzialki_w_kw,
    // 'hipoteka' (nowa, ustanawiana) NIE pochodzi z KW — uzupełnia ją etap kalkulatora/warunków.
  };
  if (!kw.kwNumber) ostrzezenia.push("Brak numeru KW — uzupełnij nr_kw.");
  if (!kw.sadRejonowy) ostrzezenia.push("Brak sądu rejonowego — uzupełnij sad.");
  if (dzialki_w_kw.length > 1)
    ostrzezenia.push(
      `KW obejmuje ${dzialki_w_kw.length} działek — hipoteka obciąży wszystkie (art. 65 u.k.w.h.).`,
    );

  return { odrzucona: false, nieruchomosc, ostrzezenia };
}

function budujWlascicielaDane(o: KwExtractionOwner, ostrzezenia: string[]): any {
  if (o.pesel || o.nazwisko) {
    ostrzezenia.push(
      "Właściciel-osoba trzecia: KW nie zawiera adresu zamieszkania — uzupełnij wlasciciel_dane.adres przed generowaniem.",
    );
    return {
      typ: "osoba_fizyczna",
      imie_nazwisko: imieNazwiskoWlasciciela(o) || null,
      pesel: o.pesel ?? null,
      adres: null, // niewyprowadzalne z KW
    };
  }
  // podmiot (brak PESEL, jest nazwa)
  ostrzezenia.push(
    "Właściciel-osoba trzecia jest podmiotem — KW nie zawiera KRS/adresu, uzupełnij wlasciciel_dane.",
  );
  return {
    typ: "podmiot_gospodarczy",
    nazwa: o.nazwa ?? null,
    regon: o.regon ?? null,
    adres: o.siedziba ?? null,
  };
}

/** Formatuje kwotę hipoteki (liczba) jako string polski "1 234,56". */
function formatKwota(n: number): string {
  const [int, dec] = Math.abs(n).toFixed(2).split(".");
  return (n < 0 ? "-" : "") + int.replace(/\B(?=(\d{3})+(?!\d))/g, " ") + "," + dec;
}
