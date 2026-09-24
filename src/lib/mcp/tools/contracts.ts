// Umowy pożyczki z silnika klauzul (src/lib/contract-engine). Zasada silnika
// obowiązuje też w MCP: model wypełnia WYŁĄCZNIE dane zgodne ze schematem
// `UmowaData`, a tekst umowy składa kod deterministycznie z biblioteki
// klauzul. Kwoty słownie, harmonogram rat i identyfikatory nieruchomości
// dolicza kod; walidator zwraca braki do uzupełnienia.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { actorId, fail, handle, linkBlock, ok, oneOf, requireUser, WRITE } from "../_helpers";
import { compactKwNumber, validateKwNumber } from "@/lib/kw";
import { KATALOG_SCHEMATU } from "@/lib/contract-engine/umowa-schema-catalog";
import type { ClientProfile } from "@/lib/client-profile-types";

const ZASADY_DANYCH = [
  "Używaj wyłącznie danych od użytkownika albo z systemu (profil klienta, KW). Nigdy nie wymyślaj PESEL, NIP, KRS, numerów KW, rachunków, kwot ani dat — dopytaj.",
  'Kwoty jako {"cyframi": "50 000,00"} (spacje tysięcy, przecinek, 2 miejsca); pola "slownie" nie wypełniaj — doliczy je system.',
  'Daty "DD.MM.RRRR"; oprocentowanie z jednym miejscem po przecinku (np. "15,5"); PESEL 11 cyfr, NIP 10 cyfr.',
  'Nie licz harmonogramu (warunki.harmonogram.raty) ani raty końcowej — policzy je silnik z kwoty, prowizji, oprocentowania, liczby rat, typu, daty pierwszej raty i (przy typie "balonowy") pułapu kwota_raty.',
  "Nie nadawaj identyfikatorów nieruchomości (id) — nada je system.",
  'Domyślne praktyki Finance You: prowizja model "nie_potracana_raty"; hipoteka i kwota z art. 777 zwykle 2× łącznej kwoty do spłaty — zawsze potwierdź je z użytkownikiem.',
  "Łatka (patch) to deep-merge: obiekty są scalane, tablice podmieniane w całości (podając tablicę, podaj ją kompletną), null usuwa wartość.",
  "Silnik nie ocenia ryzyka prawnego ani parametrów (limity prowizji, odsetki maksymalne, terminy) — problemy walidatora to wyłącznie braki i niespójności konstrukcyjne. Dokument zawiera tylko treść wiążącą.",
  "Numery KW podawaj w dowolnym zapisie — system dopełnia numer zerami do 8 cyfr (KR1P/610770/2 → KR1P/00610770/2) i sprawdza cyfrę kontrolną; błędna cyfra blokuje umowę.",
  "Harmonogram balonowy z ratą końcową „kapitał + pułap”: podaj warunki.harmonogram.kwota_raty (pułap) i kwota_raty_koncowej_docelowa — silnik sam dobierze prowizję do grosza.",
];

const excludedClausesSchema = z
  .array(z.string())
  .optional()
  .describe("ID klauzul wyłączonych z umowy (lista w get_contract_schema, include_clauses=true).");

// ── pomocnicze ───────────────────────────────────────────────────────────────

async function loadProfile(s: SupabaseClient, profileId: string) {
  const row = await oneOf<{ id: string; data: object; updated_at: string }>(
    s.from("client_profiles").select("id, data, updated_at").eq("id", profileId),
    "client_profiles",
  );
  if (!row) throw new Error("Profil klienta nie znaleziony (albo brak dostępu).");
  return { ...(row.data as object), id: row.id, updatedAt: row.updated_at } as ClientProfile;
}

function pesele(strona: any): string[] {
  const list = Array.isArray(strona) ? strona : strona ? [strona] : [];
  return list.map((p: any) => String(p?.pesel ?? "")).filter((p: string) => /^\d{11}$/.test(p));
}

/** Nieruchomości z treści KW w cache (kw_documents) → szkice `nieruchomosc` silnika. */
async function nieruchomosciZKw(
  s: SupabaseClient,
  kwNumbers: string[],
  umowa: any,
): Promise<{ nieruchomosci: any[]; ostrzezenia: string[] }> {
  const { decodeMaybeBase64 } = await import("@/lib/kw-fetch.server");
  const { kwDocumentToExtraction } = await import("@/lib/kw-extraction");
  const { mapujKwDoNieruchomosci } = await import("@/lib/contract-engine/kw-mapper");
  const { scalPatch } = await import("@/lib/contract-engine/umowa-agent-core");
  const out: any[] = [];
  const ostrzezenia: string[] = [];
  const istniejace: any[] = Array.isArray(umowa?.nieruchomosci) ? umowa.nieruchomosci : [];

  for (const [i, raw] of kwNumbers.entries()) {
    const kw = validateKwNumber(raw);
    if (!kw.ok) throw new Error(kw.message);
    const { compact, value: label } = kw;
    const row = await oneOf<Record<string, string | null>>(
      s
        .from("kw_documents")
        .select("kw_number, okladka, dzial_1o, dzial_1s, dzial_2, dzial_3, dzial_4")
        .eq("kw_number", compact),
      "kw_documents",
    );
    const sekcje = row
      ? {
          kwNumber: row.kw_number,
          okladka: decodeMaybeBase64(row.okladka),
          dzial_1o: decodeMaybeBase64(row.dzial_1o),
          dzial_1s: decodeMaybeBase64(row.dzial_1s),
          dzial_2: decodeMaybeBase64(row.dzial_2),
          dzial_3: decodeMaybeBase64(row.dzial_3),
          dzial_4: decodeMaybeBase64(row.dzial_4),
        }
      : null;
    if (!sekcje || !(sekcje.dzial_1o || sekcje.dzial_2 || sekcje.dzial_4)) {
      throw new Error(
        `Brak treści KW ${label} w cache — pobierz ją najpierw narzędziem fetch_kw_content.`,
      );
    }
    const ekstrakcja = kwDocumentToExtraction(sekcje);

    // Właściciele z działu II jako szkic pożyczkobiorców, gdy szkic ich
    // jeszcze nie ma (imię i nazwisko, PESEL; adres uzupełnia użytkownik).
    if (!umowa?.pozyczkobiorca) {
      const osoby = (ekstrakcja.dzial2?.wlasciciele ?? []).filter((o) => o?.pesel && o?.nazwisko);
      if (osoby.length) {
        const strony = osoby.map((o) => ({
          typ: "osoba_fizyczna",
          imie_nazwisko: [o.imiePierwsze, o.imieDrugie, o.nazwisko].filter(Boolean).join(" "),
          pesel: o.pesel,
        }));
        umowa.pozyczkobiorca = strony.length === 1 ? strony[0] : strony;
        ostrzezenia.push(
          `${label}: pożyczkobiorców przyjęto z działu II (właściciele) — uzupełnij adresy i dane kontaktowe.`,
        );
      }
    }

    // Sąd prowadzący księgę: z okładki, a gdy jej brak — z innej księgi tego
    // samego wydziału (ten sam prefiks, np. KR1P) w cache kw_documents.
    if (!ekstrakcja.sadRejonowy) {
      const { data: inne } = await s
        .from("kw_documents")
        .select("kw_number, okladka, dzial_1o, dzial_2")
        .like("kw_number", `${compact.slice(0, 4)}%`)
        .neq("kw_number", compact)
        .limit(10);
      for (const d of inne ?? []) {
        const sad = kwDocumentToExtraction({
          kwNumber: d.kw_number,
          okladka: decodeMaybeBase64(d.okladka),
          dzial_1o: decodeMaybeBase64(d.dzial_1o),
          dzial_2: decodeMaybeBase64(d.dzial_2),
        }).sadRejonowy;
        if (sad) {
          ekstrakcja.sadRejonowy = sad;
          break;
        }
      }
    }

    const mapped = mapujKwDoNieruchomosci(ekstrakcja, {
      id: `N${i + 1}`,
      pozyczkobiorcaPesele: pesele(umowa?.pozyczkobiorca),
      poreczicielPesel: pesele(umowa?.porecziciel)[0] ?? null,
    });
    ostrzezenia.push(...mapped.ostrzezenia.map((o) => `${label}: ${o}`));
    if (mapped.odrzucona || !mapped.nieruchomosc) {
      throw new Error(
        `KW ${label}: sprawy nie da się obsłużyć silnikiem — ${mapped.powod ?? "brak powodu"}.`,
      );
    }
    // Pola podane wcześniej dla tej samej KW (np. hipoteka, sposób usunięcia
    // obciążeń) mają pierwszeństwo przed szkicem z mapera.
    const wczesniej = istniejace.find((n) => compactKwNumber(n?.nr_kw) === compact);
    out.push(wczesniej ? scalPatch(mapped.nieruchomosc, wczesniej) : mapped.nieruchomosc);
  }
  return { nieruchomosci: out, ostrzezenia };
}

type Problem = { poziom: string; sciezka: string; komunikat: string };

function podsumujProblemy(problemy: Problem[]) {
  const by = (p: string) => problemy.filter((x) => x.poziom === p);
  return {
    bledy: by("BLAD"),
    ostrzezenia: by("OSTRZEZENIE"),
    informacje: problemy.filter((x) => x.poziom !== "BLAD" && x.poziom !== "OSTRZEZENIE"),
  };
}

/** Szkic z parametrów narzędzia: profil → umowa → patch → KW, potem uzupełnienia i walidacja. */
async function zbudujSzkic(
  s: SupabaseClient,
  args: {
    profile_id?: string;
    calc?: Record<string, unknown>;
    umowa?: Record<string, unknown>;
    patch?: Record<string, unknown>;
    kw_numbers?: string[];
  },
) {
  const { scalPatch, przetworzSzkic } = await import("@/lib/contract-engine/umowa-agent-core");
  const problemyStartowe: Problem[] = [];
  let szkic: any = {};

  if (args.profile_id) {
    const { buildUmowaData, profileToCalcPayload } =
      await import("@/lib/contract-engine/profile-to-umowa");
    const profile = await loadProfile(s, args.profile_id);
    const calc = (args.calc as any) ?? profileToCalcPayload(profile);
    if (calc) {
      szkic = buildUmowaData(profile, calc);
    } else {
      problemyStartowe.push({
        poziom: "OSTRZEZENIE",
        sciezka: "profile.offerData",
        komunikat:
          "Profil nie ma kompletnej oferty (kwota, okres, maks. rata, data wypłaty) — warunki umowy uzupełnij ręcznie.",
      });
    }
  }
  if (args.umowa) szkic = scalPatch(szkic, structuredClone(args.umowa));
  if (args.patch) szkic = scalPatch(szkic, structuredClone(args.patch));

  let kwOstrzezenia: string[] = [];
  if (args.kw_numbers?.length) {
    const r = await nieruchomosciZKw(s, args.kw_numbers, szkic);
    szkic.nieruchomosci = r.nieruchomosci;
    kwOstrzezenia = r.ostrzezenia;
  }

  const { umowa, problemy, autokorekty } = przetworzSzkic(szkic);
  const wszystkie = [...problemyStartowe, ...(problemy as Problem[])];
  return {
    umowa,
    problemy: wszystkie,
    autokorekty,
    kwOstrzezenia,
    blocked: wszystkie.some((p) => p.poziom === "BLAD"),
  };
}

// ── narzędzia ────────────────────────────────────────────────────────────────

export const getContractSchema = defineTool({
  name: "get_contract_schema",
  title: "Get loan contract data schema",
  description:
    "Schemat danych umowy pożyczki (UmowaData) dla silnika klauzul Finance You i zasady wypełniania — przeczytaj przed `draft_contract`. `include_clauses=true` dołącza listę klauzul (ID, sekcja, czy obowiązkowa, skrót treści) do ewentualnego wyłączenia.",
  inputSchema: {
    include_clauses: z.boolean().default(false),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ include_clauses }, ctx: ToolContext) =>
    handle(async () => {
      requireUser(ctx);
      const out: Record<string, unknown> = {
        schema: KATALOG_SCHEMATU.trim(),
        rules: ZASADY_DANYCH,
        workflow: [
          "1. draft_contract z profile_id (dane z profilu klienta i oferty) i/lub kw_numbers (nieruchomości z treści KW) albo z danymi od użytkownika w `umowa`.",
          "2. Uzupełniaj braki z listy `problemy.bledy`, przekazując poprzedni `umowa` z wyniku + `patch` ze zmianami.",
          "3. Gdy `blocked=false`, pokaż użytkownikowi podgląd (`preview_text`) i po akceptacji wywołaj generate_contract_docx z tym samym `umowa` (i `loan_application_id`, gdy umowa dotyczy wniosku) — powstaje jeden .docx: wniosek, umowa, Zał. 1 harmonogram, Zał. 2 protokół z negocjacji, Zał. 3 tabela opłat windykacyjnych.",
        ],
      };
      if (include_clauses) {
        const { listaKlauzul } = await import("@/lib/contract-engine/clause-select");
        out.clauses = listaKlauzul();
      }
      return ok(out);
    }),
});

export const draftContract = defineTool({
  name: "draft_contract",
  title: "Draft loan contract (validate + preview)",
  description:
    "Buduje i sprawdza szkic umowy pożyczki w silniku klauzul — niczego nie zapisuje. Źródła danych (łączone w tej kolejności): `profile_id` (profil klienta z ofertą — strony, warunki, zabezpieczenia; kalkulację można nadpisać `calc`), `umowa` (pełny szkic z poprzedniego wywołania), `patch` (zmiany do naniesienia), `kw_numbers` (nieruchomości z treści KW w cache: właściciele, współwłasność, obciążenia z działów III/IV). System dolicza kwoty słownie, harmonogram rat i identyfikatory nieruchomości, domyka grosze, normalizuje numery KW (dopełnienie do 8 cyfr + cyfra kontrolna), waliduje kompletność i spójność konstrukcyjną. Zwraca uzupełniony `umowa` (przekaż go w kolejnym wywołaniu), problemy (błędy blokują umowę), autokorekty i — gdy brak błędów — podgląd tekstu umowy. Schemat: `get_contract_schema`.",
  inputSchema: {
    profile_id: z.string().uuid().optional().describe("Id profilu klienta (client_profiles)."),
    calc: z
      .record(z.string(), z.any())
      .optional()
      .describe("Kalkulacja z kalkulatora (LoanCalcPayload); domyślnie z oferty w profilu."),
    umowa: z
      .record(z.string(), z.any())
      .optional()
      .describe("Szkic danych UmowaData (np. `umowa` z poprzedniego wyniku)."),
    patch: z
      .record(z.string(), z.any())
      .optional()
      .describe("Zmiany do naniesienia na szkic (deep-merge, tablice podmieniane w całości)."),
    kw_numbers: z
      .array(z.string().min(5))
      .max(6)
      .optional()
      .describe("Numery KW zabezpieczenia — nieruchomości z treści KW w cache."),
    excluded_clauses: excludedClausesSchema,
    preview: z.boolean().default(true).describe("Dołącz podgląd tekstu umowy, gdy brak błędów."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx: ToolContext) =>
    handle(async () => {
      const s = requireUser(ctx);
      const r = await zbudujSzkic(s, args);
      let previewText: string | null = null;
      if (!r.blocked && args.preview) {
        try {
          const { renderuj } = await import("@/lib/contract-engine/renderer");
          const { formatuj } = await import("@/lib/contract-engine/formatter");
          const { bibliotekaBez } = await import("@/lib/contract-engine/clause-select");
          previewText = formatuj(renderuj(r.umowa, bibliotekaBez(args.excluded_clauses ?? [])));
        } catch (e) {
          r.problemy.push({
            poziom: "BLAD",
            sciezka: "render",
            komunikat: `Nie udało się wyrenderować dokumentu: ${(e as Error)?.message ?? e}`,
          });
          r.blocked = true;
        }
      }
      return ok({
        blocked: r.blocked,
        problemy: podsumujProblemy(r.problemy),
        autokorekty: r.autokorekty,
        kw_ostrzezenia: r.kwOstrzezenia,
        preview_text: previewText,
        umowa: r.umowa,
      });
    }),
});

export const generateContractDocx = defineTool({
  name: "generate_contract_docx",
  title: "Generate loan contract document set (.docx)",
  description:
    "Generuje z silnika klauzul JEDEN plik .docx z kompletem dokumentów pożyczki, w kolejności: (1) Wniosek o udzielenie pożyczki pieniężnej (dane, charakter niekonsumencki, warunki, oświadczenia AML, PEP, ocena AML dla pożyczkodawcy, odpowiedzialność karna), (2) Umowa pożyczki (§ z biblioteki klauzul: przedmiot, kwota/prowizja/wypłata, zabezpieczenia, windykacja, oświadczenia z RODO, postanowienia ogólne, wypowiedzenie), (3) Załącznik nr 1 — Harmonogram spłat (tabela rat: nr, termin, rata, kapitał, odsetki, prowizja, saldo + sumy), (4) Załącznik nr 2 — Protokół z negocjacji indywidualnych, (5) Załącznik nr 3 — Tabela opłat windykacyjnych; pod każdą częścią blok podpisów. Dokument zawiera wyłącznie treść wiążącą. Zapisuje plik w Storage i trwały wpis w rejestrze wygenerowanych dokumentów (powiązany z `loan_application_id`, gdy podany) wraz z audytem (kto, kiedy, SHA-256 treści, wersja biblioteki klauzul); zwraca link do pobrania (ważny 1 h). Przyjmuje te same źródła co `draft_contract`; przy błędach walidacji nie generuje pliku i zwraca braki. Wywołuj po akceptacji podglądu przez użytkownika.",
  inputSchema: {
    profile_id: z.string().uuid().optional(),
    calc: z.record(z.string(), z.any()).optional(),
    umowa: z.record(z.string(), z.any()).optional(),
    patch: z.record(z.string(), z.any()).optional(),
    kw_numbers: z.array(z.string().min(5)).max(6).optional(),
    excluded_clauses: excludedClausesSchema,
    loan_application_id: z
      .string()
      .uuid()
      .optional()
      .describe("Id wniosku (loan_applications), z którym wiązany jest wygenerowany komplet."),
  },
  annotations: WRITE,
  handler: (args, ctx: ToolContext) =>
    handle(async () => {
      const s = requireUser(ctx);
      const userId = actorId(ctx);
      if (!args.profile_id && !args.umowa && !args.patch)
        return fail("Podaj umowa (szkic z draft_contract) albo profile_id.");
      const r = await zbudujSzkic(s, args);
      if (r.blocked) {
        return ok({
          generated: false,
          blocked: true,
          message: "Umowa ma błędy blokujące — uzupełnij dane (draft_contract) i spróbuj ponownie.",
          problemy: podsumujProblemy(r.problemy),
          umowa: r.umowa,
        });
      }

      const { generujKomplet, CZESCI_KOMPLETU } = await import("@/lib/contract-engine/komplet");
      let komplet: Awaited<ReturnType<typeof generujKomplet>>;
      try {
        komplet = await generujKomplet(r.umowa, { excludedClauses: args.excluded_clauses });
      } catch (e) {
        return fail(`Nie udało się złożyć dokumentu: ${(e as Error)?.message ?? e}`);
      }

      const { zapiszUmoweDocx, DOCX_MIME } =
        await import("@/lib/contract-engine/umowa-storage.server");
      const { docxPath, signedUrl, documentId } = await zapiszUmoweDocx(s, {
        userId,
        komplet,
        numerUmowy: r.umowa?.meta?.numer_umowy,
        templateName: "Komplet umowy pożyczki (MCP, silnik klauzul)",
        zrodlo: "mcp",
        loanApplicationId: args.loan_application_id ?? null,
        formData: {
          ...(args.profile_id ? { client_profile_id: args.profile_id } : {}),
          ...(args.excluded_clauses?.length ? { excluded_clauses: args.excluded_clauses } : {}),
        },
      });
      const nazwa = docxPath.split("/").pop() ?? "umowa.docx";
      return ok(
        {
          generated: true,
          generated_document_id: documentId,
          loan_application_id: args.loan_application_id ?? null,
          docx_path: docxPath,
          download_url: signedUrl,
          file_size_bytes: komplet.bytes.length,
          czesci: CZESCI_KOMPLETU,
          sha256: komplet.sha256,
          wersja_biblioteki_klauzul: komplet.wersjaBiblioteki,
          problemy: podsumujProblemy(r.problemy),
          autokorekty: r.autokorekty,
        },
        undefined,
        linkBlock(signedUrl, nazwa, DOCX_MIME, "Komplet umowy pożyczki (.docx)"),
      );
    }),
});

export const contractTools = [getContractSchema, draftContract, generateContractDocx];
