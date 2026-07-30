/**
 * Kontrakt danych umowy — port `schema/umowa.schema.json` na zod.
 *
 * To jest jedyny artefakt, który wypełnia AI. Renderer składa dokument
 * wyłącznie na jego podstawie. `additionalProperties: false` z JSON Schema jest
 * odwzorowane przez `.strict()` — dzięki temu dane z usuniętymi świadomie polami
 * (weksel in blanco, cesja polisy, współwłasność ułamkowa) są odrzucane na
 * poziomie schematu (testy I3–I5, I7, I10).
 */
import { z } from "zod";

// ── typy pierwotne ─────────────────────────────────────────────
export const kwotaSchema = z
  .object({
    cyframi: z.string().regex(/^\d{1,3}( \d{3})*,\d{2}$/, "Format polski, np. '50 000,00'"),
    slownie: z.string().min(3),
  })
  .strict();

const dataPl = z.string().regex(/^\d{2}\.\d{2}\.\d{4}$/, "DD.MM.RRRR");

const nullableStr = z.string().nullable().optional();
const pesel = z.string().regex(/^\d{11}$/);
const nip = z
  .string()
  .regex(/^\d{10}$/)
  .nullable()
  .optional();
const regon = z
  .string()
  .regex(/^\d{9}(\d{5})?$/)
  .nullable()
  .optional();
const krs = z
  .string()
  .regex(/^\d{10}$/)
  .nullable()
  .optional();

const stanCywilny = z
  .enum(["kawaler_panna", "zonaty_zamezna", "rozwiedziony", "wdowiec"])
  .nullable()
  .optional();
const ustrojMajatkowy = z
  .enum(["wspolnosc_ustawowa", "rozdzielnosc", "wspolnosc_umowna"])
  .nullable()
  .optional();

export const FORMY = [
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
] as const;

// ── reprezentant / uchwała ─────────────────────────────────────
const reprezentant = z
  .object({
    imie_nazwisko: z.string().min(3),
    pesel: pesel.nullable().optional(),
    funkcja: z.string(),
    podstawa: nullableStr,
  })
  .strict();

const reprezentacja = z
  .union([z.array(reprezentant).min(1).max(6), reprezentant, z.null()])
  .optional();

const uchwala = z
  .object({
    wymagana: z.boolean(),
    podstawa: nullableStr,
    organ: z
      .enum([
        "zgromadzenie_wspolnikow",
        "walne_zgromadzenie",
        "rada_nadzorcza",
        "wspolnicy",
        "komplementariusze",
      ])
      .nullable()
      .optional(),
    przedlozona: z.boolean().optional(),
    data: dataPl.nullable().optional(),
    numer: nullableStr,
    wylaczona_umowa_spolki: z.boolean().optional(),
  })
  .strict()
  .nullable()
  .optional();

// ── osoba fizyczna / podmiot gospodarczy ───────────────────────
const osobaFizycznaBase = {
  typ: z.literal("osoba_fizyczna"),
  imie_nazwisko: z.string().min(3),
  firma: nullableStr,
  pesel,
  nip,
  regon,
  dokument_tozsamosci: nullableStr,
  adres: z.string().min(5),
  telefon: nullableStr,
  email: nullableStr,
  stan_cywilny: stanCywilny,
  ustroj_majatkowy: ustrojMajatkowy,
};

export const osobaFizyczna = z.object(osobaFizycznaBase).strict();

const podmiotBase = {
  typ: z.literal("podmiot_gospodarczy"),
  nazwa: z.string().min(3),
  forma_prawna: nullableStr,
  krs,
  nip,
  regon,
  adres: z.string().min(5),
  telefon: nullableStr,
  email: nullableStr,
  reprezentacja,
  forma: z.enum(FORMY).optional(),
  kapital_zakladowy: kwotaSchema.nullable().optional(),
  reprezentacja_laczna: z.boolean().optional(),
  wspolnicy_sc: z.array(osobaFizyczna).min(2).nullable().optional(),
  uchwala_zobowiazanie: uchwala,
  uchwala_nieruchomosc: uchwala,
};

export const podmiotGospodarczy = z.object(podmiotBase).strict();

export const strona = z.discriminatedUnion("typ", [osobaFizyczna, podmiotGospodarczy]);

// ── poręczyciel (osoba fizyczna / podmiot) — dodatkowe pola ─────
const zgodaMalzonka = z
  .object({ na_hipoteke: z.boolean(), na_poreczenie: z.boolean() })
  .strict()
  .nullable()
  .optional();
const zakresOdp = z.enum(["rzeczowa", "rzeczowa_i_osobista"]).optional();

const poreczicielOsoba = z
  .object({
    ...osobaFizycznaBase,
    zakres_odpowiedzialnosci: zakresOdp,
    zgoda_malzonka: zgodaMalzonka,
  })
  .strict();
const poreczicielPodmiot = z
  .object({
    ...podmiotBase,
    zakres_odpowiedzialnosci: zakresOdp,
    zgoda_malzonka: zgodaMalzonka,
  })
  .strict();
const porecziciel = z.union([poreczicielOsoba, poreczicielPodmiot, z.null()]).optional();

// ── obciążenia / nieruchomość ──────────────────────────────────
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
    wierzyciel: nullableStr,
    kwota: nullableStr,
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
      .object({
        imie_nazwisko: z.string(),
        pesel,
        adres: nullableStr,
      })
      .strict()
      .nullable()
      .optional(),
    kwota_splaty: kwotaSchema.nullable().optional(),
    wierzyciel_rachunek: nullableStr,
  })
  .strict();

const wspolwlasnosc = z
  .object({
    rodzaj: z.enum(["laczna_malzenska"]),
    wspolwlasciciele: z
      .array(
        z
          .object({
            imie_nazwisko: z.string(),
            pesel: pesel.nullable().optional(),
          })
          .strict(),
      )
      .min(2),
  })
  .strict()
  .nullable()
  .optional();

const hipoteka = z
  .object({
    kwota: kwotaSchema,
    pierwszenstwo: z.enum(["pierwsze", "kolejne", "oproznione_miejsce"]),
    oproznione_miejsce_po: nullableStr,
  })
  .strict();

const nieruchomosc = z
  .object({
    id: z.string().regex(/^N[0-9]+$/),
    nr_kw: z.string().min(5),
    sad: z.string().min(5),
    opis: z.string(),
    rodzaj: z
      .enum(["lokal", "dom", "dzialka_budowlana", "grunt_rolny", "lokal_uzytkowy", "inne"])
      .optional(),
    wlasciciel_ref: z.enum(["pozyczkobiorca", "porecziciel", "osoba_trzecia"]),
    wlasciciel_dane: z.union([strona, z.null()]).optional(),
    wspolwlasnosc,
    obciazenia: z.array(obciazenie).optional(),
    hipoteka: hipoteka.optional(),
    zakres: z.enum(["cala_kw", "po_odlaczeniu"]).optional(),
    dzialki_w_kw: z.array(z.string()).optional(),
    dzialki_do_odlaczenia: z.array(z.string()).optional(),
    wlasciciel_index: z.number().int().min(0).nullable().optional(),
    // Roszczenie o przeniesienie hipoteki na przyszłe opróżnione miejsce (art. 101¹ u.k.w.h.).
    roszczenie_oproznione_miejsce: z.boolean().optional(),
  })
  .strict();

// ── warunki ────────────────────────────────────────────────────
const rataSchema = z
  .object({
    nr: z.number().int(),
    termin: dataPl,
    kapital: z.string(),
    odsetki: z.string(),
    prowizja: z.string(),
    rata_razem: z.string(),
    saldo: z.string(),
    uwagi: nullableStr,
  })
  .strict();

const harmonogram = z
  .object({
    liczba_rat: z.number().int().min(1).max(360),
    typ: z.enum(["balonowy", "rowne_raty", "malejace"]),
    data_pierwszej_raty: dataPl,
    dzien_miesiaca: z.number().int().min(1).max(28),
    kwota_raty: kwotaSchema.nullable().optional(),
    kwota_raty_koncowej: kwotaSchema.nullable().optional(),
    raty: z.array(rataSchema).optional(),
  })
  .strict();

const warunki = z
  .object({
    kwota_pozyczki: kwotaSchema,
    prowizja: z
      .object({
        kwota: kwotaSchema,
        model: z.enum(["nie_potracana_raty", "potracana_z_wyplaty"]).optional(),
      })
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
        kwota: kwotaSchema,
        poddaje_sie: z
          .array(z.enum(["pozyczkobiorca", "porecziciel", "wlasciciel_osoba_trzecia"]))
          .min(1),
        data_graniczna: dataPl,
        termin_wezwania_dni: z.number().int().optional(),
      })
      .strict(),
    charakter_hipoteki: z.enum(["laczna", "odrebna"]).optional(),
  })
  .strict();

// ── korzeń ─────────────────────────────────────────────────────
export const umowaSchema = z
  .object({
    meta: z
      .object({
        data_umowy: dataPl,
        miejscowosc: z.string(),
        numer_umowy: nullableStr,
        wersja_wzoru: z.string().optional(),
      })
      .strict(),
    pozyczkodawca: strona,
    pozyczkobiorca: z.union([strona, z.array(strona).min(1).max(6)]),
    porecziciel,
    warunki,
    nieruchomosci: z.array(nieruchomosc).min(1),
    zabezpieczenia,
    oswiadczenia_dodatkowe: z.array(z.string()).optional(),
  })
  .strict();

export type UmowaData = z.infer<typeof umowaSchema>;
