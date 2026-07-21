/**
 * Kontrakt danych wejściowych umowy — typy TS + walidacja (zod).
 *
 * Odpowiednik `schema/umowa.schema.json`. To jest artefakt, który wypełnia AI;
 * renderer składa dokument wyłącznie na jego podstawie. `validateSchema` jest
 * portem `validator.waliduj_schemat` (warstwa 1 — kształt, typy, wzorce).
 *
 * Uwaga o wzorcach identyfikatorów: PESEL/KRS/NIP/nr KW mają wzorce, ale — jak
 * podkreśla README silnika — poprawny formalnie, lecz nieprawdziwy numer i tak
 * przejdzie walidację. To pole model ma zostawić `null`, a nie zmyślać.
 */

import { z } from "zod";

const kwota = z
  .object({
    cyframi: z.string().regex(/^\d{1,3}( \d{3})*,\d{2}$/),
    slownie: z.string().min(3),
  })
  .strict();

const dataPl = z.string().regex(/^\d{2}\.\d{2}\.\d{4}$/);
const pesel = z.string().regex(/^\d{11}$/);
const nip = z.string().regex(/^\d{10}$/).nullable();
const regon = z.string().regex(/^\d{9}(\d{5})?$/).nullable();
const krs = z.string().regex(/^\d{10}$/).nullable();

const stanCywilny = z.enum(["kawaler_panna", "zonaty_zamezna", "rozwiedziony", "wdowiec"]).nullable();
const ustrojMajatkowy = z.enum(["wspolnosc_ustawowa", "rozdzielnosc", "wspolnosc_umowna"]).nullable();

const FORMA = z.enum([
  "osoba_fizyczna",
  "jdg",
  "spolka_cywilna",
  "spolka_jawna",
  "spolka_partnerska",
  "spolka_komandytowa",
  "spolka_komandytowo_akcyjna",
  "sp_z_oo",
  "prosta_sa",
  "sa",
  "spoldzielnia",
  "fundacja",
  "stowarzyszenie",
  "inna",
]);

const osobaFizyczna = z
  .object({
    typ: z.literal("osoba_fizyczna"),
    imie_nazwisko: z.string().min(3),
    firma: z.string().nullable().optional(),
    pesel,
    nip: nip.optional(),
    regon: regon.optional(),
    dokument_tozsamosci: z.string().nullable().optional(),
    adres: z.string().min(5),
    telefon: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    stan_cywilny: stanCywilny.optional(),
    ustroj_majatkowy: ustrojMajatkowy.optional(),
  })
  .strict();

const reprezentant = z
  .object({
    imie_nazwisko: z.string().min(3),
    pesel: pesel.nullable().optional(),
    funkcja: z.string(),
    podstawa: z.string().nullable().optional(),
  })
  .strict();

const reprezentacja = z
  .union([z.array(reprezentant).min(1).max(6), reprezentant, z.null()])
  .optional();

const uchwala = z
  .object({
    wymagana: z.boolean(),
    podstawa: z.string().nullable().optional(),
    organ: z
      .enum(["zgromadzenie_wspolnikow", "walne_zgromadzenie", "rada_nadzorcza", "wspolnicy", "komplementariusze"])
      .nullable()
      .optional(),
    przedlozona: z.boolean().optional(),
    data: dataPl.nullable().optional(),
    numer: z.string().nullable().optional(),
    wylaczona_umowa_spolki: z.boolean().optional(),
  })
  .strict()
  .nullable();

const podmiotBase = {
  typ: z.literal("podmiot_gospodarczy"),
  nazwa: z.string().min(3),
  forma_prawna: z.string().nullable().optional(),
  krs: krs.optional(),
  nip: nip.optional(),
  regon: regon.optional(),
  adres: z.string().min(5),
  telefon: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  reprezentacja,
  forma: FORMA.optional(),
  kapital_zakladowy: kwota.nullable().optional(),
  reprezentacja_laczna: z.boolean().optional(),
  wspolnicy_sc: z.array(osobaFizyczna).min(2).nullable().optional(),
  uchwala_zobowiazanie: uchwala.optional(),
  uchwala_nieruchomosc: uchwala.optional(),
};

const podmiotGospodarczy = z.object(podmiotBase).strict();

const strona = z.discriminatedUnion("typ", [osobaFizyczna, podmiotGospodarczy]);

const zakresOdp = z.enum(["rzeczowa", "rzeczowa_i_osobista"]).optional();
const zgodaMalzonka = z
  .object({ na_hipoteke: z.boolean(), na_poreczenie: z.boolean() })
  .strict()
  .nullable()
  .optional();

const poreczicielOsobaFizyczna = z
  .object({
    typ: z.literal("osoba_fizyczna"),
    imie_nazwisko: z.string().min(3),
    firma: z.string().nullable().optional(),
    pesel,
    nip: nip.optional(),
    regon: regon.optional(),
    dokument_tozsamosci: z.string().nullable().optional(),
    adres: z.string().min(5),
    telefon: z.string().nullable().optional(),
    email: z.string().nullable().optional(),
    stan_cywilny: stanCywilny.optional(),
    ustroj_majatkowy: ustrojMajatkowy.optional(),
    zakres_odpowiedzialnosci: zakresOdp,
    zgoda_malzonka: zgodaMalzonka,
  })
  .strict();

const poreczicielPodmiot = z
  .object({ ...podmiotBase, zakres_odpowiedzialnosci: zakresOdp, zgoda_malzonka: zgodaMalzonka })
  .strict();

const obciazenie = z
  .object({
    dzial: z.enum(["III", "IV"]),
    rodzaj: z.enum([
      "hipoteka_umowna",
      "hipoteka_przymusowa",
      "sluzebnosc_osobista",
      "sluzebnosc_gruntowa",
      "dozywocie",
      "roszczenie",
      "egzekucja_sadowa",
      "egzekucja_administracyjna",
      "najem_dzierzawa",
      "zakaz_zbywania",
      "inne",
    ]),
    opis: z.string().min(3),
    wierzyciel: z.string().nullable().optional(),
    kwota: z.string().nullable().optional(),
    sposob_usuniecia: z
      .enum([
        "brak",
        "wykreslenie_przed_wyplata",
        "wykreslenie_ze_srodkow_pozyczki",
        "zrzeczenie_uprawnionego",
        "pozostaje_akceptowane",
      ])
      .optional(),
    uprawniony_do_zrzeczenia: z
      .object({ imie_nazwisko: z.string(), pesel, adres: z.string().nullable().optional() })
      .strict()
      .nullable()
      .optional(),
    kwota_splaty: kwota.nullable().optional(),
    wierzyciel_rachunek: z.string().nullable().optional(),
  })
  .strict();

const nieruchomosc = z
  .object({
    id: z.string().regex(/^N[0-9]+$/),
    nr_kw: z.string().min(5),
    sad: z.string().min(5),
    opis: z.string(),
    rodzaj: z.enum(["lokal", "dom", "dzialka_budowlana", "grunt_rolny", "lokal_uzytkowy", "inne"]).optional(),
    wlasciciel_ref: z.enum(["pozyczkobiorca", "porecziciel", "osoba_trzecia"]),
    wlasciciel_dane: strona.nullable().optional(),
    wspolwlasnosc: z
      .object({
        rodzaj: z.enum(["laczna_malzenska"]),
        wspolwlasciciele: z
          .array(z.object({ imie_nazwisko: z.string(), pesel: pesel.nullable().optional() }).strict())
          .min(2),
      })
      .strict()
      .nullable()
      .optional(),
    obciazenia: z.array(obciazenie).optional(),
    hipoteka: z
      .object({
        kwota,
        pierwszenstwo: z.enum(["pierwsze", "kolejne", "oproznione_miejsce"]),
        oproznione_miejsce_po: z.string().nullable().optional(),
      })
      .strict()
      .optional(),
    zakres: z.enum(["cala_kw", "po_odlaczeniu"]).optional(),
    dzialki_w_kw: z.array(z.string()).optional(),
    dzialki_do_odlaczenia: z.array(z.string()).optional(),
    wlasciciel_index: z.number().int().min(0).nullable().optional(),
  })
  .strict();

const rata = z
  .object({
    nr: z.number().int(),
    termin: dataPl,
    kapital: z.string(),
    odsetki: z.string(),
    prowizja: z.string(),
    rata_razem: z.string(),
    saldo: z.string(),
    uwagi: z.string().nullable().optional(),
  })
  .strict();

const harmonogram = z
  .object({
    liczba_rat: z.number().int().min(1).max(360),
    typ: z.enum(["balonowy", "rowne_raty", "malejace"]),
    data_pierwszej_raty: dataPl,
    dzien_miesiaca: z.number().int().min(1).max(28),
    kwota_raty: kwota.nullable().optional(),
    kwota_raty_koncowej: kwota.nullable().optional(),
    raty: z.array(rata).optional(),
  })
  .strict();

const warunki = z
  .object({
    kwota_pozyczki: kwota,
    prowizja: z
      .object({ kwota, model: z.enum(["nie_potracana_raty", "potracana_z_wyplaty"]).optional() })
      .strict(),
    oprocentowanie: z.string().regex(/^\d{1,2},\d$/),
    cel: z.string().min(5),
    harmonogram,
    rachunki: z.object({ wyplata: z.string(), splata: z.string() }).strict(),
  })
  .strict();

const zabezpieczenia = z
  .object({
    egzekucja_777: z
      .object({
        kwota,
        poddaje_sie: z.array(z.enum(["pozyczkobiorca", "porecziciel", "wlasciciel_osoba_trzecia"])).min(1),
        data_graniczna: dataPl,
        termin_wezwania_dni: z.number().int().optional(),
      })
      .strict(),
    charakter_hipoteki: z.enum(["laczna", "odrebna"]).optional(),
  })
  .strict();

export const umowaSchema = z
  .object({
    meta: z
      .object({
        data_umowy: dataPl,
        miejscowosc: z.string(),
        numer_umowy: z.string().nullable().optional(),
        wersja_wzoru: z.string().optional(),
      })
      .strict(),
    pozyczkodawca: strona,
    pozyczkobiorca: z.union([strona, z.array(strona).min(1).max(6)]),
    porecziciel: z.union([poreczicielOsobaFizyczna, poreczicielPodmiot, z.null()]).optional(),
    warunki,
    nieruchomosci: z.array(nieruchomosc).min(1),
    zabezpieczenia,
    oswiadczenia_dodatkowe: z.array(z.string()).optional(),
  })
  .strict();

// ── typy ─────────────────────────────────────────────────────
export type UmowaDane = z.infer<typeof umowaSchema>;
export type OsobaFizyczna = z.infer<typeof osobaFizyczna>;
export type PodmiotGospodarczy = z.infer<typeof podmiotGospodarczy>;
export type Strona = z.infer<typeof strona>;
export type Nieruchomosc = z.infer<typeof nieruchomosc>;
export type Obciazenie = z.infer<typeof obciazenie>;
export type Reprezentant = z.infer<typeof reprezentant>;
export type Rata = z.infer<typeof rata>;

// ── walidacja warstwy 1 (odpowiednik waliduj_schemat) ────────
import { Problem } from "./validator-types";

/**
 * Waliduje kształt danych względem schematu. Zwraca listę problemów
 * (pustą, gdy dane są zgodne) — mapowaną z błędów zod na ścieżki.
 */
export function validateSchema(dane: unknown): Problem[] {
  const res = umowaSchema.safeParse(dane);
  if (res.success) return [];
  return res.error.issues.map((issue) => {
    const sciezka = issue.path.map((p) => String(p)).join(".") || "(korzeń)";
    return new Problem("BLAD", sciezka, issue.message);
  });
}
