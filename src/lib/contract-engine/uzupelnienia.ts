/**
 * Wartości domyślne i autouzupełnienia szkicu umowy (pkt 2, 6 i 7 zlecenia
 * „przypadki graniczne wniosek → KW → umowa").
 *
 * Zasada: każde pole użyte w szablonie jest albo wymagane w walidatorze, albo
 * ma wartość domyślną ustawianą tutaj — błąd renderu „Brak wartości dla pola"
 * nie może wyjść dopiero przy podglądzie. Każde uzupełnienie jest odnotowane
 * w `autokorekty` (informacja dla operatora, nie treść umowy).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Problem } from "./validator";
import type { KorektaGroszowa } from "./schedule";
import { formatKwotaPL, parseKwota } from "./schedule";
import { ostrzezeniaKosztowe } from "./cost-warnings";
import { sadZKodu, KW_COURT_CODES_SOURCE } from "../kw-court-codes";

export const DOMYSLNY_TERMIN_WEZWANIA_DNI = 7;
export const DOMYSLNY_CEL_POZYCZKI = "Finansowanie bieżącej działalności gospodarczej";
export const LATA_DO_DATY_GRANICZNEJ_777 = 10;

// ── miejscowość: mianownik → miejscownik ────────────────────────────
const MIEJSCOWNIK: Record<string, string> = {
  warszawa: "Warszawie",
  kraków: "Krakowie",
  łódź: "Łodzi",
  wrocław: "Wrocławiu",
  poznań: "Poznaniu",
  gdańsk: "Gdańsku",
  szczecin: "Szczecinie",
  bydgoszcz: "Bydgoszczy",
  lublin: "Lublinie",
  białystok: "Białymstoku",
  katowice: "Katowicach",
  gdynia: "Gdyni",
  częstochowa: "Częstochowie",
  radom: "Radomiu",
  toruń: "Toruniu",
  sosnowiec: "Sosnowcu",
  kielce: "Kielcach",
  rzeszów: "Rzeszowie",
  gliwice: "Gliwicach",
  zabrze: "Zabrzu",
  olsztyn: "Olsztynie",
  "bielsko-biała": "Bielsku-Białej",
  bytom: "Bytomiu",
  "zielona góra": "Zielonej Górze",
  rybnik: "Rybniku",
  "ruda śląska": "Rudzie Śląskiej",
  opole: "Opolu",
  tychy: "Tychach",
  "gorzów wielkopolski": "Gorzowie Wielkopolskim",
  elbląg: "Elblągu",
  płock: "Płocku",
  wałbrzych: "Wałbrzychu",
  włocławek: "Włocławku",
  tarnów: "Tarnowie",
  chorzów: "Chorzowie",
  koszalin: "Koszalinie",
  kalisz: "Kaliszu",
  legnica: "Legnicy",
  grudziądz: "Grudziądzu",
  słupsk: "Słupsku",
  jaworzno: "Jaworznie",
  "jelenia góra": "Jeleniej Górze",
  "nowy sącz": "Nowym Sączu",
  siedlce: "Siedlcach",
  "piotrków trybunalski": "Piotrkowie Trybunalskim",
  konin: "Koninie",
  piła: "Pile",
  zamość: "Zamościu",
  chełm: "Chełmie",
  "biała podlaska": "Białej Podlaskiej",
  puławy: "Puławach",
  sopot: "Sopocie",
  zakopane: "Zakopanem",
  pruszków: "Pruszkowie",
  piaseczno: "Piasecznie",
};
const JUZ_MIEJSCOWNIK = new Set(Object.values(MIEJSCOWNIK).map((v) => v.toLowerCase()));

/**
 * Odmienia nazwę miejscowości do miejscownika („Lublin” → „Lublinie”).
 * Forma już w miejscowniku zostaje bez zmian. `pewne = false`, gdy nazwy nie
 * ma w słowniku, a reguła końcówki nie jest jednoznaczna — wtedy nazwa
 * zostaje bez zmian i operator dostaje ostrzeżenie.
 */
export function miejscownikMiejscowosci(nazwa: string): { wynik: string; pewne: boolean } {
  const n = String(nazwa ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!n) return { wynik: n, pewne: false };
  const low = n.toLowerCase();
  if (MIEJSCOWNIK[low]) return { wynik: MIEJSCOWNIK[low], pewne: true };
  if (JUZ_MIEJSCOWNIK.has(low)) return { wynik: n, pewne: true };
  if (/\s/.test(n)) return { wynik: n, pewne: false }; // nazwy wieloczłonowe tylko ze słownika
  // Typowe końcówki miejscownika — nie odmieniamy drugi raz.
  if (/(?:ie|ku|iu|chu|cu|zu|ach|ym|im|em|y|i)$/i.test(n)) return { wynik: n, pewne: true };
  const reguly: [RegExp, string][] = [
    [/([cs])k$/i, "$1ku"], // Słupsk → Słupsku, Kraśnik → Kraśniku
    [/k$/i, "ku"],
    [/ów$/i, "owie"], // Rzeszów → Rzeszowie
    [/(?:ice|yce)$/i, ""], // obsługa niżej
    [/([iy])n$/i, "$1nie"], // Lublin → Lublinie
    [/an$/i, "anie"],
    [/om$/i, "omiu"], // Radom → Radomiu
    [/ec$/i, "cu"], // Sosnowiec → Sosnowcu
  ];
  if (/(?:ice|yce)$/i.test(n)) return { wynik: n.replace(/e$/i, "ach"), pewne: true };
  for (const [re, zam] of reguly) {
    if (zam && re.test(n)) return { wynik: n.replace(re, zam), pewne: true };
  }
  return { wynik: n, pewne: false };
}

// ── daty ────────────────────────────────────────────────────────────
function plusLata(dataPl: string, lata: number): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(dataPl ?? ""));
  if (!m) return null;
  const y = Number(m[3]) + lata;
  const mies = Number(m[2]);
  const dniWMies = new Date(Date.UTC(y, mies, 0)).getUTCDate();
  const d = Math.min(Number(m[1]), dniWMies);
  return `${String(d).padStart(2, "0")}.${m[2]}.${y}`;
}

function kwotaOk(k: any): boolean {
  return !!k && typeof k.cyframi === "string" && !Number.isNaN(parseKwota(k.cyframi));
}

/**
 * Uzupełnia wartości domyślne szkicu (mutuje `umowa`). Zwraca autokorekty
 * i problemy (wyłącznie OSTRZEZENIE / INFORMACJA — nigdy BLAD).
 */
export function uzupelnijDomyslne(umowa: any): {
  autokorekty: KorektaGroszowa[];
  problemy: Problem[];
} {
  const autokorekty: KorektaGroszowa[] = [];
  const problemy: Problem[] = [];
  if (!umowa || typeof umowa !== "object") return { autokorekty, problemy };

  // meta.miejscowosc — mianownik → miejscownik („zawarta w Lublinie”).
  const mies = umowa.meta?.miejscowosc;
  if (typeof mies === "string" && mies.trim()) {
    const { wynik, pewne } = miejscownikMiejscowosci(mies);
    if (wynik !== mies) {
      umowa.meta.miejscowosc = wynik;
      autokorekty.push({
        sciezka: "meta.miejscowosc",
        komunikat: `Miejscowość odmieniona do miejscownika: „${mies}” → „${wynik}”.`,
      });
    } else if (!pewne) {
      problemy.push({
        poziom: "OSTRZEZENIE",
        sciezka: "meta.miejscowosc",
        komunikat: `Sprawdź, czy „${mies}” jest w miejscowniku („zawarta w …”) — nazwy nie ma w słowniku odmiany.`,
      });
    }
  }

  // Cel pożyczki — domyślnie finansowanie bieżącej działalności (wniosek i § 1).
  if (
    umowa.warunki &&
    typeof umowa.warunki === "object" &&
    !String(umowa.warunki.cel ?? "").trim()
  ) {
    umowa.warunki.cel = DOMYSLNY_CEL_POZYCZKI;
    autokorekty.push({
      sciezka: "warunki.cel",
      komunikat: `Cel pożyczki: domyślnie „${DOMYSLNY_CEL_POZYCZKI}”.`,
    });
  }

  // Sąd z kodu wydziału KW, gdy brak (słownik kw_court_codes).
  const nier: any[] = Array.isArray(umowa.nieruchomosci) ? umowa.nieruchomosci : [];
  nier.forEach((n, i) => {
    if (!n || typeof n !== "object" || String(n.sad ?? "").trim() || !n.nr_kw) return;
    const sad = sadZKodu(n.nr_kw);
    if (!sad) return;
    n.sad = sad;
    autokorekty.push({
      sciezka: `nieruchomosci[${i}].sad`,
      komunikat: `Sąd uzupełniony ze słownika kodów wydziałów KW (${String(n.nr_kw).slice(0, 4).toUpperCase()} → ${sad}; źródło: ${KW_COURT_CODES_SOURCE}).`,
    });
  });

  const e777 = umowa.zabezpieczenia?.egzekucja_777;
  if (e777 && typeof e777 === "object") {
    if (e777.termin_wezwania_dni == null) {
      e777.termin_wezwania_dni = DOMYSLNY_TERMIN_WEZWANIA_DNI;
      autokorekty.push({
        sciezka: "zabezpieczenia.egzekucja_777.termin_wezwania_dni",
        komunikat: `Termin wezwania do zapłaty przed egzekucją z art. 777: domyślnie ${DOMYSLNY_TERMIN_WEZWANIA_DNI} dni.`,
      });
    }
    if (!e777.data_graniczna) {
      const dg = plusLata(umowa.meta?.data_umowy, LATA_DO_DATY_GRANICZNEJ_777);
      if (dg) {
        e777.data_graniczna = dg;
        autokorekty.push({
          sciezka: "zabezpieczenia.egzekucja_777.data_graniczna",
          komunikat: `Data graniczna wystąpienia o klauzulę wykonalności (art. 777): data umowy + ${LATA_DO_DATY_GRANICZNEJ_777} lat = ${dg} (ustalenie zarządu).`,
        });
      }
    }
  }

  // Kwota hipoteki ↔ kwota z art. 777: gdy podana tylko jedna — dla obu.
  const hipoteki = nier.filter((n) => n && typeof n === "object");
  const kwotyHip = hipoteki.map((n) => n.hipoteka?.kwota).filter(kwotaOk);
  if (e777 && typeof e777 === "object" && !kwotaOk(e777.kwota) && kwotyHip.length > 0) {
    const rozne = new Set(kwotyHip.map((k: any) => k.cyframi));
    if (rozne.size === 1) {
      e777.kwota = { cyframi: kwotyHip[0].cyframi, slownie: "" };
      autokorekty.push({
        sciezka: "zabezpieczenia.egzekucja_777.kwota",
        komunikat: `Kwota poddania się egzekucji (art. 777) przyjęta z kwoty hipoteki: ${kwotyHip[0].cyframi} zł.`,
      });
    }
  } else if (e777 && kwotaOk(e777.kwota) && kwotyHip.length === 0) {
    hipoteki.forEach((n) => {
      const i = nier.indexOf(n);
      const bezHipotekIV = !(n.obciazenia ?? []).some((o: any) => o?.dzial === "IV");
      n.hipoteka = {
        ...(n.hipoteka ?? {}),
        kwota: { cyframi: e777.kwota.cyframi, slownie: "" },
        ...(n.hipoteka?.pierwszenstwo ? {} : bezHipotekIV ? { pierwszenstwo: "pierwsze" } : {}),
      };
      autokorekty.push({
        sciezka: `nieruchomosci[${i}].hipoteka.kwota`,
        komunikat: `Kwota hipoteki przyjęta z kwoty poddania się egzekucji (art. 777): ${e777.kwota.cyframi} zł.`,
      });
    });
  }
  if (e777 && !kwotaOk(e777.kwota) && kwotyHip.length === 0) {
    const raty: any[] = umowa.warunki?.harmonogram?.raty ?? [];
    const suma = raty.reduce((a, r) => a + (parseKwota(r?.rata_razem) || 0), 0);
    if (suma > 0)
      problemy.push({
        poziom: "INFORMACJA",
        sciezka: "zabezpieczenia.egzekucja_777.kwota",
        komunikat: `Podpowiedź: hipoteka i kwota z art. 777 zwykle 2 × łączna kwota do spłaty = ${formatKwotaPL(Math.round(suma * 200) / 100)} zł — potwierdź z użytkownikiem (nie uzupełniono automatycznie).`,
      });
  }

  return { autokorekty, problemy };
}

/** Ostrzeżenia kosztowe (pkt 6) z danych umowy i policzonego harmonogramu. */
export function problemyKosztowe(umowa: any): Problem[] {
  const w = umowa?.warunki;
  if (!w) return [];
  const raty: any[] = w.harmonogram?.raty ?? [];
  const pb = Array.isArray(umowa.pozyczkobiorca) ? umowa.pozyczkobiorca : [umowa.pozyczkobiorca];
  const startJdg = pb
    .map((p: any) => p?.data_rozpoczecia_dzialalnosci)
    .filter(Boolean)
    .sort((a: string, b: string) =>
      b.split(".").reverse().join("").localeCompare(a.split(".").reverse().join("")),
    )[0];
  const odsetki = raty.reduce((a, r) => a + (parseKwota(r?.odsetki) || 0), 0);
  return ostrzezeniaKosztowe({
    kwotaPozyczki: parseKwota(w.kwota_pozyczki?.cyframi) || 0,
    prowizjaInwestora: parseKwota(w.prowizja?.kwota?.cyframi) || 0,
    prowizjaFY: parseKwota(w.prowizja_finance_you?.kwota?.cyframi) || 0,
    odsetki,
    liczbaRat: Number(w.harmonogram?.liczba_rat) || raty.length,
    dataUmowy: umowa.meta?.data_umowy ?? null,
    dataRozpoczeciaDzialalnosci: startJdg ?? null,
  });
}

// ── zmiana nazwiska: ten sam PESEL, inne nazwisko w dziale II KW ───────
function normNazwa(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z]+/g, " ")
    .trim();
}

/**
 * Pkt 3: gdy właściciel z działu II ma PESEL strony (pożyczkobiorcy albo
 * poręczyciela), ale inne imię i nazwisko — strona zostaje pod aktualnym
 * nazwiskiem (CEIDG), a umowa dostaje adnotację „ujawniona w dziale II księgi
 * wieczystej nr … jako …” (komparycja i § 5). Rozbieżność nie blokuje umowy
 * — blokuje wypłatę (R-IDENTITY jako warunek wypłaty). Inny PESEL = brak
 * dopasowania, nic się nie dopisuje. Mutuje `umowa`.
 */
export function dopiszUjawnieniaZKw(
  umowa: any,
  nrKw: string,
  wlascicieleKw: { imie_nazwisko: string; pesel?: string | null }[],
): KorektaGroszowa[] {
  const out: KorektaGroszowa[] = [];
  const strony: [any, string][] = [];
  const pb = umowa?.pozyczkobiorca;
  (Array.isArray(pb) ? pb : pb ? [pb] : []).forEach((p: any, i: number) =>
    strony.push([p, Array.isArray(pb) ? `pozyczkobiorca[${i}]` : "pozyczkobiorca"]),
  );
  if (umowa?.porecziciel) strony.push([umowa.porecziciel, "porecziciel"]);
  for (const [s, sciezka] of strony) {
    if (s?.typ !== "osoba_fizyczna" || !/^\d{11}$/.test(String(s.pesel ?? ""))) continue;
    const w = wlascicieleKw.find((o) => o.pesel === s.pesel);
    if (!w || !w.imie_nazwisko) continue;
    if (normNazwa(w.imie_nazwisko) === normNazwa(s.imie_nazwisko)) continue;
    const lista: any[] = Array.isArray(s.ujawnienie_w_kw) ? s.ujawnienie_w_kw : [];
    if (lista.some((u) => normNazwa(u?.nr_kw) === normNazwa(nrKw))) continue;
    s.ujawnienie_w_kw = [...lista, { nr_kw: nrKw, imie_nazwisko: w.imie_nazwisko }];
    out.push({
      sciezka: `${sciezka}.ujawnienie_w_kw`,
      komunikat:
        `${nrKw}: ten sam PESEL, inne nazwisko w dziale II („${w.imie_nazwisko}”) niż strony („${s.imie_nazwisko}”) — ` +
        `umowa pod aktualnym nazwiskiem z adnotacją o nazwisku z KW; wypłata wymaga dokumentu zmiany nazwiska ` +
        `(warunek wypłaty R-IDENTITY).`,
    });
  }
  return out;
}

/** "2026-10-01T…" → "01.10.2026"; nieprawidłowa data → null. */
function isoNaDatePl(iso: string | null | undefined): string | null {
  const t = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(t)) return null;
  // Data w strefie Europe/Warsaw — dzień przyjęcia wniosku, jak widzi go operator.
  const [y, m, d] = new Date(t)
    .toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" })
    .split("-");
  return `${d}.${m}.${y}`;
}

/**
 * Protokół z negocjacji (Zał. nr 2): okres negocjacji liczony od dnia
 * przyjęcia wniosku do systemu (`loan_applications.created_at`). Podana
 * ręcznie `data_od` nie jest nadpisywana. Mutuje `umowa`.
 */
export function ustawPoczatekNegocjacji(
  umowa: any,
  wniosekPrzyjetyIso: string | null | undefined,
): KorektaGroszowa[] {
  const dataOd = isoNaDatePl(wniosekPrzyjetyIso);
  if (!umowa || !dataOd) return [];
  if (umowa.protokol_negocjacji?.data_od) return [];
  umowa.protokol_negocjacji = { ...(umowa.protokol_negocjacji ?? {}), data_od: dataOd };
  return [
    {
      sciezka: "protokol_negocjacji.data_od",
      komunikat: `Negocjacje liczone od dnia przyjęcia wniosku do systemu: ${dataOd}.`,
    },
  ];
}
