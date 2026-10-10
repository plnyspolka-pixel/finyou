// Umowy pożyczki z silnika klauzul (src/lib/contract-engine). Zasada silnika
// obowiązuje też w MCP: model wypełnia WYŁĄCZNIE dane zgodne ze schematem
// `UmowaData`, a tekst umowy składa kod deterministycznie z biblioteki
// klauzul. Kwoty słownie, harmonogram rat i identyfikatory nieruchomości
// dolicza kod; walidator zwraca braki do uzupełnienia.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { actorId, fail, handle, linkBlock, ok, oneOf, requireUser, WRITE } from "../_helpers";
import { KATALOG_SCHEMATU } from "@/lib/contract-engine/umowa-schema-catalog";
import type { ClientProfile } from "@/lib/client-profile-types";

const ZASADY_DANYCH = [
  "Używaj wyłącznie danych od użytkownika albo z systemu (profil klienta, KW). Nigdy nie wymyślaj PESEL, NIP, KRS, numerów KW, rachunków, kwot ani dat — dopytaj.",
  'Kwoty jako {"cyframi": "50 000,00"} (spacje tysięcy, przecinek, 2 miejsca); pola "slownie" nie wypełniaj — doliczy je system.',
  'Daty "DD.MM.RRRR"; oprocentowanie z jednym miejscem po przecinku (np. "15,5"); PESEL 11 cyfr, NIP 10 cyfr.',
  'Nie licz harmonogramu (warunki.harmonogram.raty) ani raty końcowej — policzy je silnik z kwoty, prowizji, oprocentowania, liczby rat, typu, daty pierwszej raty i (przy typie "balonowy") pułapu kwota_raty.',
  "Nie nadawaj identyfikatorów nieruchomości (id) — nada je system.",
  "Domyślne praktyki Finance You: prowizja inwestora zawsze w ratach (pole model pomijaj), Prowizja Finance You potrącana z wypłaty; hipoteka i kwota z art. 777 zwykle 2× łącznej kwoty do spłaty — zawsze potwierdź je z użytkownikiem.",
  "Łatka (patch) to deep-merge: obiekty są scalane, tablice podmieniane w całości (podając tablicę, podaj ją kompletną), null usuwa wartość.",
  "Błędy walidatora (problemy.bledy) to wyłącznie braki i niespójności konstrukcyjne. Ryzyko kosztowe (łączna prowizja ponad min(10% + 10% × lata, 45%) kwoty netto, koszt pozaodsetkowy i całkowity w skali roku, ryzyko art. 359 § 2² i art. 388 k.c., JDG założona < 30 dni przed umową) silnik pokazuje w problemy.ostrzezenia — nigdy nie blokuje; decyzja należy do zarządu. Dokument zawiera tylko treść wiążącą.",
  "Wartości domyślne (odnotowane w autokorekty): zabezpieczenia.egzekucja_777.termin_wezwania_dni = 7; data_graniczna = data umowy + 10 lat; gdy podano tylko kwotę hipoteki albo tylko kwotę z art. 777 — ta sama dla obu; meta.miejscowosc można podać w mianowniku („Lublin”) — system odmieni; brak sądu — ze słownika kodów wydziałów KW.",
  'Prowizja częściowo w racie balonowej: warunki.prowizja.w_racie_koncowej {cyframi} (część łącznej prowizji płatna z ratą końcową; reszta równo w ratach); warunki.harmonogram.amortyzacja_kapitalu ("nadwyzka_raty" | "w_balonie"). Gotowe pola zwraca calculate_repayment_schedule w draft_contract_patch.',
  "Numery KW podawaj w dowolnym zapisie — system dopełnia numer zerami do 8 cyfr (KR1P/610770/2 → KR1P/00610770/2) i sprawdza cyfrę kontrolną; błędna cyfra blokuje umowę.",
  "Harmonogram balonowy: podaj warunki.harmonogram.kwota_raty (pułap raty) — silnik liczy raty z odsetek od salda i STAŁEJ prowizji inwestora (warunki.prowizja.kwota) rozłożonej równo; nadwyżka kapitału trafia do ostatniej raty. Oprocentowanie nie może przekraczać odsetek maksymalnych (art. 359 § 2¹ KC — dziś 14,5 %); Prowizja Finance You (5% Kwoty Pożyczki, min 5 000 zł, bez VAT) jest potrącana z Kwoty Pożyczki przy wypłacie i opisana wprost w § 2 umowy — tylko gdy Pożyczkodawcą nie jest Finance You (warunki.prowizja_finance_you — system wylicza ją sam, jeśli pole pominięto; rachunki.finance_you system wpisuje zawsze automatycznie). Kwota Pożyczki w całości, także część przekazana Finance You, jest oprocentowana dla Pożyczkodawcy. Osobnego załącznika z dyspozycją wypłaty nie ma.",
];

const excludedClausesSchema = z
  .array(z.string())
  .optional()
  .describe("ID klauzul wyłączonych z umowy (lista w get_contract_schema, include_clauses=true).");

// ── pomocnicze ───────────────────────────────────────────────────────────────

async function loadProfile(s: SupabaseClient, profileId: string) {
  const row = await oneOf<{
    id: string;
    data: object;
    updated_at: string;
    source_application_id: string | null;
  }>(
    s
      .from("client_profiles")
      .select("id, data, updated_at, source_application_id")
      .eq("id", profileId),
    "client_profiles",
  );
  if (!row) throw new Error("Profil klienta nie znaleziony (albo brak dostępu).");
  return {
    profile: { ...(row.data as object), id: row.id, updatedAt: row.updated_at } as ClientProfile,
    sourceApplicationId: row.source_application_id,
  };
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
    loan_application_id?: string;
  },
) {
  const { scalPatch, przetworzSzkic } = await import("@/lib/contract-engine/umowa-agent-core");
  const problemyStartowe: Problem[] = [];
  const kartotekaKorekty: { sciezka: string; komunikat: string }[] = [];
  let szkic: any = {};
  let wniosekId: string | null = args.loan_application_id ?? null;

  if (args.profile_id) {
    const { buildUmowaData, profileToCalcPayload } =
      await import("@/lib/contract-engine/profile-to-umowa");
    const { profile, sourceApplicationId } = await loadProfile(s, args.profile_id);
    wniosekId ??= sourceApplicationId;
    const calc = (args.calc as any) ?? profileToCalcPayload(profile);
    if (calc) {
      szkic = buildUmowaData(profile, calc);
      // PESEL, dokument tożsamości, rachunek do wypłaty i nazwisko z CEIDG —
      // z dedykowanych pól kartoteki klienta (pkt 3 i 9).
      const { kartotekaKlientaProfilu } = await import("@/lib/clients/kartoteka-umowy.server");
      const { scalKartotekeDoUmowy } = await import("@/lib/clients/kartoteka-umowy");
      const kartoteka = await kartotekaKlientaProfilu(s, sourceApplicationId);
      if (kartoteka) kartotekaKorekty.push(...scalKartotekeDoUmowy(szkic, kartoteka));
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
  let kwAutokorekty: { sciezka: string; komunikat: string }[] = [];
  if (args.kw_numbers?.length) {
    const { nieruchomosciZKw } = await import("@/lib/contract-engine/kw-nieruchomosci.server");
    const r = await nieruchomosciZKw(s, args.kw_numbers, szkic);
    szkic.nieruchomosci = r.nieruchomosci;
    kwOstrzezenia = r.ostrzezenia;
    kwAutokorekty = r.autokorekty;
  }

  // Zał. nr 2: okres negocjacji od dnia przyjęcia wniosku do systemu.
  if (wniosekId) {
    const { dataPrzyjeciaWniosku } = await import("@/lib/clients/kartoteka-umowy.server");
    const { ustawPoczatekNegocjacji } = await import("@/lib/contract-engine/uzupelnienia");
    kartotekaKorekty.push(
      ...ustawPoczatekNegocjacji(szkic, await dataPrzyjeciaWniosku(s, wniosekId)),
    );
  }

  const przetworzony = przetworzSzkic(szkic);
  const { umowa, problemy } = przetworzony;
  const autokorekty = [...kartotekaKorekty, ...kwAutokorekty, ...przetworzony.autokorekty];
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
    "Buduje i sprawdza szkic umowy pożyczki w silniku klauzul — niczego nie zapisuje. Źródła danych (łączone w tej kolejności): `profile_id` (profil klienta z ofertą — strony, warunki, zabezpieczenia; kalkulację można nadpisać `calc`), `umowa` (pełny szkic z poprzedniego wywołania), `patch` (zmiany do naniesienia), `kw_numbers` (nieruchomości z treści KW w cache: właściciele, współwłasność, obciążenia z działów III/IV). System dolicza kwoty słownie, harmonogram rat i identyfikatory nieruchomości, domyka grosze, normalizuje numery KW (dopełnienie do 8 cyfr + cyfra kontrolna), waliduje kompletność i spójność konstrukcyjną. Zwraca uzupełniony `umowa` (przekaż go w kolejnym wywołaniu), problemy (błędy blokują umowę), autokorekty i — gdy brak błędów — podgląd tekstu całego kompletu (wniosek, umowa, Zał. 1–3), identyczny z treścią pliku generowanego przez `generate_contract_docx`. Schemat: `get_contract_schema`.",
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
    loan_application_id: z
      .string()
      .uuid()
      .optional()
      .describe(
        "Id wniosku (loan_applications) — okres negocjacji w Zał. nr 2 liczony od dnia przyjęcia wniosku (domyślnie wniosek z profilu).",
      ),
    preview: z
      .boolean()
      .default(true)
      .describe(
        "Dołącz podgląd tekstu całego kompletu (wniosek, umowa, Zał. 1–3), gdy brak błędów.",
      ),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: (args, ctx: ToolContext) =>
    handle(async () => {
      const s = requireUser(ctx);
      const r = await zbudujSzkic(s, args);
      let previewText: string | null = null;
      if (!r.blocked && args.preview) {
        try {
          const { tekstKompletu } = await import("@/lib/contract-engine/komplet");
          previewText = tekstKompletu(r.umowa, { excludedClauses: args.excluded_clauses });
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
    "Generuje z silnika klauzul JEDEN plik .docx z kompletem dokumentów pożyczki, w kolejności: (1) Wniosek o udzielenie pożyczki pieniężnej (dane, charakter niekonsumencki, warunki, oświadczenia AML, PEP, ocena AML dla pożyczkodawcy, odpowiedzialność karna), (2) Umowa pożyczki (§ z biblioteki klauzul: przedmiot, kwota/prowizja/wypłata, zabezpieczenia, windykacja, oświadczenia z RODO, postanowienia ogólne, wypowiedzenie), (3) Załącznik nr 1 — Harmonogram spłat (tabela rat: nr, termin, rata, kapitał, odsetki, prowizja, saldo + sumy), (4) Załącznik nr 2 — Protokół z negocjacji indywidualnych, (5) Załącznik nr 3 — Tabela opłat windykacyjnych; pod każdą częścią blok podpisów. Dokument zawiera wyłącznie treść wiążącą. Zapisuje plik w Storage i trwały wpis w rejestrze wygenerowanych dokumentów (powiązany z `loan_application_id`, gdy podany) wraz z audytem (kto, kiedy, SHA-256 treści, wersja biblioteki klauzul); zwraca link do pobrania (ważny 1 h) oraz pełny tekst kompletu (`tekst` — do porównania bez pobierania pliku; później: `get_generated_document_text`). Przyjmuje te same źródła co `draft_contract`; przy błędach walidacji nie generuje pliku i zwraca braki. Wywołuj po akceptacji podglądu przez użytkownika.",
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
          tekst: komplet.tekst,
        },
        undefined,
        linkBlock(signedUrl, nazwa, DOCX_MIME, "Komplet umowy pożyczki (.docx)"),
      );
    }),
});

export const getGeneratedDocumentText = defineTool({
  name: "get_generated_document_text",
  title: "Get generated document text",
  description:
    "Tekst wygenerowanego dokumentu .docx z rejestru `generated_documents` (np. kompletu umowy pożyczki z `generate_contract_docx`) — akapity i tabele (komórki rozdzielone „ | ”), bez pobierania pliku ze Storage. Dla kompletu z silnika zwraca też audyt (SHA-256, wersja biblioteki klauzul) i sprawdza, czy SHA-256 tekstu pliku zgadza się z zapisanym przy generacji.",
  inputSchema: {
    id: z.string().uuid().describe("Id dokumentu (generated_documents.id)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ id }, ctx: ToolContext) =>
    handle(async () => {
      const s = requireUser(ctx);
      const row = await oneOf<{
        id: string;
        template_name: string | null;
        template_slug: string | null;
        docx_path: string | null;
        form_data: any;
        loan_application_id: string | null;
        created_at: string;
        created_by: string | null;
      }>(
        s
          .from("generated_documents")
          .select(
            "id, template_name, template_slug, docx_path, form_data, loan_application_id, created_at, created_by",
          )
          .eq("id", id),
        "generated_documents",
      );
      if (!row) return fail("Dokument nie znaleziony (albo brak dostępu).");
      if (!row.docx_path) return fail("Dokument nie ma pliku .docx.");
      const { CLIENT_FILES_BUCKET } = await import("@/lib/storage-buckets");
      const { data: blob, error } = await s.storage
        .from(CLIENT_FILES_BUCKET)
        .download(row.docx_path);
      if (error || !blob)
        return fail(`Nie udało się pobrać pliku: ${error?.message ?? "brak pliku"}`);
      const { tekstZDocx } = await import("@/lib/contract-engine/umowa-docx");
      const { sha256Hex } = await import("@/lib/contract-engine/komplet");
      const tekst = await tekstZDocx(new Uint8Array(await blob.arrayBuffer()));
      const sha256 = await sha256Hex(tekst);
      const audyt = row.form_data?.audyt ?? null;
      return ok({
        id: row.id,
        template_name: row.template_name,
        template_slug: row.template_slug,
        loan_application_id: row.loan_application_id,
        created_at: row.created_at,
        created_by: row.created_by,
        docx_path: row.docx_path,
        audyt,
        sha256,
        sha256_zgodny: audyt?.sha256 ? audyt.sha256 === sha256 : null,
        tekst,
      });
    }),
});

const MAKS_PLIK_B = 5 * 1024 * 1024;

type GenDocRow = {
  id: string;
  template_name: string | null;
  template_slug: string | null;
  docx_path: string | null;
  form_data: any;
  loan_application_id: string | null;
  lead_id: string | null;
  parent_document_id: string | null;
  version: number | null;
  created_at: string;
  created_by: string | null;
};

const GEN_DOC_SELECT =
  "id, template_name, template_slug, docx_path, form_data, loan_application_id, lead_id, parent_document_id, version, created_at, created_by";

async function pobierzDocx(s: SupabaseClient, path: string): Promise<Uint8Array> {
  const { CLIENT_FILES_BUCKET } = await import("@/lib/storage-buckets");
  const { data: blob, error } = await s.storage.from(CLIENT_FILES_BUCKET).download(path);
  if (error || !blob)
    throw new Error(`Nie udało się pobrać pliku: ${error?.message ?? "brak pliku"}`);
  return new Uint8Array(await blob.arrayBuffer());
}

async function sha256Bajtow(b: Uint8Array): Promise<string> {
  const h = await globalThis.crypto.subtle.digest("SHA-256", b as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(h))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

export const getGeneratedDocumentFile = defineTool({
  name: "get_generated_document_file",
  title: "Get generated document file (.docx, base64)",
  description:
    "Plik .docx z rejestru `generated_documents` jako base64 (do ~5 MB) — bez podpisanego linku do Storage, który bywa nieosiągalny z sandboxa asystenta. Zwraca też SHA-256 pliku i tekstu (audyt), numer wersji i id dokumentu bazowego. Ręcznie poprawioną wersję zapisuj z powrotem przez `upload_generated_document_version` (nie jako osobny plik poza rejestrem).",
  inputSchema: {
    id: z.string().uuid().describe("Id dokumentu (generated_documents.id)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ id }, ctx: ToolContext) =>
    handle(async () => {
      const s = requireUser(ctx);
      const row = await oneOf<GenDocRow>(
        (s as any).from("generated_documents").select(GEN_DOC_SELECT).eq("id", id),
        "generated_documents",
      );
      if (!row) return fail("Dokument nie znaleziony (albo brak dostępu).");
      if (!row.docx_path) return fail("Dokument nie ma pliku .docx.");
      const bajty = await pobierzDocx(s, row.docx_path);
      if (bajty.length > MAKS_PLIK_B)
        return fail(
          `Plik ma ${bajty.length} B — powyżej limitu ${MAKS_PLIK_B} B dla przesyłu przez MCP.`,
        );
      const { tekstZDocx } = await import("@/lib/contract-engine/umowa-docx");
      const { sha256Hex } = await import("@/lib/contract-engine/komplet");
      const { DOCX_MIME } = await import("@/lib/contract-engine/umowa-storage.server");
      const tekst = await tekstZDocx(bajty);
      return ok({
        id: row.id,
        file_name: row.docx_path.split("/").pop(),
        mime_type: DOCX_MIME,
        size_bytes: bajty.length,
        version: row.version ?? 1,
        parent_document_id: row.parent_document_id,
        sha256_pliku: await sha256Bajtow(bajty),
        sha256_tekstu: await sha256Hex(tekst),
        audyt: row.form_data?.audyt ?? null,
        file_base64: Buffer.from(bajty).toString("base64"),
      });
    }),
});

export const uploadGeneratedDocumentVersion = defineTool({
  name: "upload_generated_document_version",
  title: "Upload manually corrected document version",
  description:
    "Zapisuje ręcznie poprawioną wersję dokumentu z rejestru (np. kompletu umowy) jako NOWĄ WERSJĘ tego samego dokumentu: plik .docx (base64, do ~5 MB) trafia do Storage, w `generated_documents` powstaje wiersz z `parent_document_id` (dokument bazowy), kolejnym numerem `version`, autorem, powodem i SHA-256 tekstu, a w audycie — wpis `contract_version_uploaded`. Wynik zawiera różnicę tekstu względem wersji z silnika (linie dodane/usunięte) — ta sama trafia do panelu dokumentu. Wersja silnika pozostaje nienaruszona.",
  inputSchema: {
    parent_id: z
      .string()
      .uuid()
      .describe("Id dokumentu, którego wersję zapisujesz (bazowego albo dowolnej jego wersji)."),
    file_base64: z.string().min(100).describe("Plik .docx zakodowany base64."),
    reason: z.string().min(5).max(1000).describe("Powód ręcznej poprawki (trafia do audytu)."),
  },
  annotations: WRITE,
  handler: ({ parent_id, file_base64, reason }, ctx: ToolContext) =>
    handle(async () => {
      const s = requireUser(ctx);
      const userId = actorId(ctx);
      const rodzic = await oneOf<GenDocRow>(
        (s as any).from("generated_documents").select(GEN_DOC_SELECT).eq("id", parent_id),
        "generated_documents",
      );
      if (!rodzic) return fail("Dokument nie znaleziony (albo brak dostępu).");
      const rootId = rodzic.parent_document_id ?? rodzic.id;
      const root =
        rootId === rodzic.id
          ? rodzic
          : await oneOf<GenDocRow>(
              (s as any).from("generated_documents").select(GEN_DOC_SELECT).eq("id", rootId),
              "generated_documents",
            );
      if (!root?.docx_path) return fail("Dokument bazowy nie ma pliku .docx.");

      const bajty = new Uint8Array(Buffer.from(file_base64.replace(/\s+/g, ""), "base64"));
      if (bajty.length > MAKS_PLIK_B) return fail(`Plik przekracza limit ${MAKS_PLIK_B} B.`);
      const { tekstZDocx } = await import("@/lib/contract-engine/umowa-docx");
      let tekst: string;
      try {
        tekst = await tekstZDocx(bajty);
      } catch {
        return fail("To nie jest poprawny plik .docx (brak word/document.xml).");
      }
      const { sha256Hex } = await import("@/lib/contract-engine/komplet");
      const { diffTekstu } = await import("@/lib/contract-engine/diff-tekstu");
      const sha256 = await sha256Hex(tekst);
      const tekstSilnika = await tekstZDocx(await pobierzDocx(s, root.docx_path));
      const diff = diffTekstu(tekstSilnika, tekst);

      const { data: wersje, error: wErr } = await (s as any)
        .from("generated_documents")
        .select("version")
        .or(`id.eq.${rootId},parent_document_id.eq.${rootId}`);
      if (wErr) throw new Error(`generated_documents: ${wErr.message}`);
      const wersja = Math.max(1, ...(wersje ?? []).map((w: any) => Number(w.version) || 1)) + 1;

      const { CLIENT_FILES_BUCKET } = await import("@/lib/storage-buckets");
      const { DOCX_MIME } = await import("@/lib/contract-engine/umowa-storage.server");
      const bazowaNazwa = (root.docx_path.split("/").pop() ?? "dokument.docx").replace(
        /\.docx$/i,
        "",
      );
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const docxPath = `generated/${userId}/${ts}_${bazowaNazwa.slice(0, 50)}_v${wersja}.docx`;
      const { error: upErr } = await s.storage
        .from(CLIENT_FILES_BUCKET)
        .upload(docxPath, new Blob([bajty], { type: DOCX_MIME }), { upsert: false });
      if (upErr) throw new Error(`Upload DOCX: ${upErr.message}`);

      const audyt = {
        sha256,
        zrodlo: "reczna_poprawka",
        autor: userId,
        powod: reason,
        wersja,
        wersja_bazowa_id: rootId,
        sha256_wersji_silnika: root.form_data?.audyt?.sha256 ?? null,
      };
      const { data: row, error: insErr } = await (s as any)
        .from("generated_documents")
        .insert({
          template_name: root.template_name,
          template_slug: root.template_slug,
          loan_application_id: root.loan_application_id,
          lead_id: root.lead_id,
          parent_document_id: rootId,
          version: wersja,
          version_reason: reason,
          content_sha256: sha256,
          form_data: { audyt, diff_wzgledem_silnika: diff },
          docx_path: docxPath,
          file_size_bytes: bajty.length,
          created_by: userId,
        })
        .select("id")
        .single();
      if (insErr || !row) {
        await s.storage
          .from(CLIENT_FILES_BUCKET)
          .remove([docxPath])
          .catch(() => undefined);
        throw new Error(`Zapis w rejestrze dokumentów: ${insErr?.message ?? "brak wiersza"}`);
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: audErr } = await supabaseAdmin.from("audit_logs").insert({
        user_id: userId,
        action: "contract_version_uploaded",
        object_type: "generated_document",
        object_id: row.id,
        previous_value: { document_id: rootId, sha256: audyt.sha256_wersji_silnika },
        new_value: { ...audyt, docx_path: docxPath, dodane: diff.dodane, usuniete: diff.usuniete },
      });
      if (audErr) throw new Error(`Zapis audytu wersji: ${audErr.message}`);
      return ok({
        saved: true,
        generated_document_id: row.id,
        parent_document_id: rootId,
        version: wersja,
        sha256,
        diff_wzgledem_silnika: diff,
      });
    }),
});

export const contractTools = [
  getContractSchema,
  draftContract,
  generateContractDocx,
  getGeneratedDocumentText,
  getGeneratedDocumentFile,
  uploadGeneratedDocumentVersion,
];
