// Oświadczenie o statusie PEP (art. 46 ust. 2 ustawy AML) — wspólne dla
// formularzy (klient) i serwera (walidacja, zapis treści). Zmiana treści
// wymaga podbicia DECLARATION_TEXT_VERSION — zapisujemy wersję i pełny tekst
// przy każdym oświadczeniu (dowód dla kontroli GIIF).
import { z } from "zod";

export const DECLARATION_TEXT_VERSION = "pep-2026-10-v1";

/** Kategorie stanowisk z krajowego wykazu (rozporządzenie MF z 27.07.2021, t.j. Dz.U. 2023 poz. 1632 ze zm.). */
export const PEP_POSITION_CATEGORIES = [
  {
    code: "a",
    label:
      "Prezydent RP, Prezes / wiceprezes Rady Ministrów, minister, sekretarz lub podsekretarz stanu",
  },
  { code: "b", label: "Poseł, senator, poseł do Parlamentu Europejskiego" },
  {
    code: "c",
    label: "Członek organu partii politycznej (reprezentującego lub uprawnionego do zobowiązań)",
  },
  { code: "d", label: "Sędzia lub członek: SN, TK, NSA, sądu apelacyjnego, Trybunału Stanu" },
  {
    code: "e",
    label: "Prezes / członek Zarządu NBP, członek RPP, Prezes / wiceprezes / członek Kolegium NIK",
  },
  { code: "f", label: "Ambasador, chargé d'affaires, generał / admirał, pełnomocnik MON" },
  {
    code: "g",
    label:
      "Członek zarządu lub rady nadzorczej przedsiębiorstwa państwowego lub spółki Skarbu Państwa (>50%)",
  },
  { code: "h", label: "Dyrektor / członek organu organizacji międzynarodowej" },
  {
    code: "i-j",
    label:
      "Inne stanowisko z krajowego wykazu (np. wojewoda, starosta, wójt / burmistrz / prezydent miasta, prezes urzędu centralnego, komendant główny służby)",
  },
  { code: "foreign", label: "Eksponowane stanowisko polityczne w innym państwie" },
] as const;

export const FAMILY_RELATIONS = [
  { code: "spouse", label: "małżonek / osoba pozostająca we wspólnym pożyciu" },
  { code: "child", label: "dziecko" },
  {
    code: "child_spouse",
    label: "małżonek dziecka / osoba pozostająca z dzieckiem we wspólnym pożyciu",
  },
  { code: "parent", label: "rodzic" },
] as const;

export const CRIMINAL_LIABILITY_CLAUSE =
  "Jestem świadomy/a odpowiedzialności karnej za złożenie fałszywego oświadczenia.";

export const DECLARATION_TEXT = [
  "Oświadczenie o statusie osoby zajmującej eksponowane stanowisko polityczne (PEP)",
  "Na podstawie art. 46 ust. 2 ustawy z dnia 1 marca 2018 r. o przeciwdziałaniu praniu pieniędzy oraz finansowaniu terroryzmu oświadczam, że:",
  "1. jestem / nie jestem osobą zajmującą eksponowane stanowisko polityczne (PEP) w rozumieniu art. 2 ust. 2 pkt 11 ustawy (także w okresie 12 miesięcy od zaprzestania pełnienia funkcji);",
  "2. jestem / nie jestem członkiem rodziny osoby zajmującej eksponowane stanowisko polityczne (małżonek lub osoba pozostająca we wspólnym pożyciu, dziecko i jego małżonek lub osoba pozostająca z nim we wspólnym pożyciu, rodzic);",
  "3. jestem / nie jestem osobą znaną jako bliski współpracownik osoby zajmującej eksponowane stanowisko polityczne (wspólne władanie podmiotem, bliskie stosunki gospodarcze lub beneficjent rzeczywisty podmiotu utworzonego na rzecz PEP).",
  "Dane wskazanych osób powiązanych podaję zgodnie z prawdą. Zobowiązuję się niezwłocznie poinformować Finance You sp. z o.o. o zmianie powyższych okoliczności.",
  CRIMINAL_LIABILITY_CLAUSE,
].join("\n");

const RelatedPerson = z.object({
  relation: z.enum(["family", "associate"]),
  family_relation: z.enum(["spouse", "child", "child_spouse", "parent"]).optional().nullable(),
  first_name: z.string().trim().min(1, "Podaj imię").max(100),
  last_name: z.string().trim().min(1, "Podaj nazwisko").max(100),
  position: z.string().trim().min(2, "Podaj stanowisko").max(300),
});

export const PepDeclarationInput = z
  .object({
    is_pep: z.boolean(),
    pep_position_category: z.string().max(20).optional().nullable(),
    pep_position_detail: z.string().trim().max(300).optional().nullable(),
    is_family_member: z.boolean(),
    is_close_associate: z.boolean(),
    related_persons: z.array(RelatedPerson).max(10).default([]),
    criminal_liability_acknowledged: z.literal(true, {
      errorMap: () => ({ message: "Potwierdź świadomość odpowiedzialności karnej." }),
    }),
    declaration_text_version: z.string().max(40),
  })
  .superRefine((v, ctx) => {
    if (v.is_pep && !v.pep_position_category) {
      ctx.addIssue({
        code: "custom",
        path: ["pep_position_category"],
        message: "Wybierz kategorię stanowiska.",
      });
    }
    if (v.is_family_member && !v.related_persons.some((p) => p.relation === "family")) {
      ctx.addIssue({
        code: "custom",
        path: ["related_persons"],
        message: "Podaj dane osoby PEP (członka rodziny).",
      });
    }
    if (v.is_close_associate && !v.related_persons.some((p) => p.relation === "associate")) {
      ctx.addIssue({
        code: "custom",
        path: ["related_persons"],
        message: "Podaj dane osoby PEP (współpracownika).",
      });
    }
  });

export type PepDeclarationValue = z.infer<typeof PepDeclarationInput>;

export function emptyDeclaration(): Omit<PepDeclarationValue, "criminal_liability_acknowledged"> & {
  criminal_liability_acknowledged: boolean;
} {
  return {
    is_pep: false,
    pep_position_category: null,
    pep_position_detail: null,
    is_family_member: false,
    is_close_associate: false,
    related_persons: [],
    criminal_liability_acknowledged: false,
    declaration_text_version: DECLARATION_TEXT_VERSION,
  };
}

/** Komunikat błędu dla formularza (pierwszy problem) albo null, gdy oświadczenie kompletne. */
export function declarationError(v: unknown): string | null {
  const r = PepDeclarationInput.safeParse(v);
  return r.success ? null : (r.error.issues[0]?.message ?? "Uzupełnij oświadczenie PEP.");
}

export function anyYes(
  v: Pick<PepDeclarationValue, "is_pep" | "is_family_member" | "is_close_associate">,
): boolean {
  return v.is_pep || v.is_family_member || v.is_close_associate;
}
