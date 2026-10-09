// Spójność danych klienta z CEIDG (pkt 3 i 9 zlecenia „przypadki graniczne").
//
// Zasada zarządu: nazwisko do umowy bierzemy z CEIDG (aktualne dane
// przedsiębiorcy). Wpis CEIDG ustalamy po NIP klienta (dopasowanie pewne),
// nigdy po nazwisku z KW — tożsamość kotwiczy PESEL klienta, a imię musi się
// zgadzać, żeby zmiana nazwiska nie przeniosła danych innej osoby.
// Moduł czysty — testowalny.
import type { CeidgActivity } from "@/lib/risk-assessment/types";

export interface KlientTozsamosc {
  first_name: string | null;
  last_name: string | null;
  city?: string | null;
  previous_names?: string[] | null;
}

export interface PropozycjaZmiany {
  pole: "first_name" | "last_name" | "city";
  obecnie: string | null;
  z_ceidg: string;
}

export interface PorownanieCeidg {
  /** Zmiana nazwiska do automatycznego zastosowania (pewny wpis CEIDG, imię zgodne). */
  zmianaNazwiska: { z: string; na: string } | null;
  /** Wszystkie rozbieżności — propozycje dla operatora. */
  propozycje: PropozycjaZmiany[];
}

export function normNazwy(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z]+/g, " ")
    .trim();
}

/** „GRAŻYNA” → „Grażyna”, „KOWALSKA-NOWAK” → „Kowalska-Nowak”. */
export function wielkaLiteraNazwy(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

/** Porównuje dane klienta z wpisem CEIDG. */
export function porownajZCeidg(k: KlientTozsamosc, ceidg: CeidgActivity | null): PorownanieCeidg {
  const out: PorownanieCeidg = { zmianaNazwiska: null, propozycje: [] };
  const c = ceidg?.company;
  if (!ceidg?.available || !c) return out;
  const pewny = ceidg.matchConfidence === "high" && ceidg.status === "aktywny";
  if (!pewny) return out;

  const imie = c.ownerFirstName ? wielkaLiteraNazwy(c.ownerFirstName) : null;
  const nazwisko = c.ownerLastName ? wielkaLiteraNazwy(c.ownerLastName) : null;
  const imieZgodne =
    !!imie && normNazwy(imie).split(" ")[0] === normNazwy(k.first_name).split(" ")[0];

  if (imie && !imieZgodne)
    out.propozycje.push({ pole: "first_name", obecnie: k.first_name, z_ceidg: imie });
  if (nazwisko && normNazwy(nazwisko) !== normNazwy(k.last_name)) {
    out.propozycje.push({ pole: "last_name", obecnie: k.last_name, z_ceidg: nazwisko });
    if (imieZgodne && k.last_name) out.zmianaNazwiska = { z: k.last_name, na: nazwisko };
  }
  if (c.city && k.city && normNazwy(c.city) !== normNazwy(k.city))
    out.propozycje.push({ pole: "city", obecnie: k.city, z_ceidg: wielkaLiteraNazwy(c.city) });
  return out;
}

/** Lista poprzednich nazwisk po zmianie (bez duplikatów, bez nazwiska bieżącego). */
export function dopiszPoprzednieNazwisko(
  poprzednie: string[] | null | undefined,
  stare: string,
  nowe: string,
): string[] {
  const lista = [...(poprzednie ?? [])];
  if (
    stare &&
    normNazwy(stare) !== normNazwy(nowe) &&
    !lista.some((x) => normNazwy(x) === normNazwy(stare))
  )
    lista.push(stare);
  return lista.filter((x) => normNazwy(x) !== normNazwy(nowe));
}
