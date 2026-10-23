// Katalog startowy lead magnetów (brief agenta publikującego, p. 5.4) —
// czyste DANE: treść PDF, copy strony /pobierz/<slug>, mail z linkiem,
// hasło do komentarza i następny krok lejka. Bez I/O.
//
// Sześć materiałów, po trzy na tor, ułożonych w ścieżkę („drabinkę”):
//   inwestor:       START (świadomość) → KSIĘGA (umiejętność) → BŁĘDY (decyzja)
//                   → kalkulator LTV → program dla inwestorów,
//   pożyczkobiorca: ODMOWA (świadomość) → DOKUMENTY (przygotowanie)
//                   → PROCES (decyzja) → kalkulatory ILE / RATA → wniosek.
// Hasła są tymi samymi, które serie rolek (autopilot/series.ts) mają jako
// `defaultKeyword`, więc opis-lejek „Skomentuj HASŁO…” prowadzi do gotowego
// materiału. Kalkulatory (ILE, RATA, LTV) są w autopilot/calculators.ts, wzór
// umowy (UMOWA) pochodzi z zatwierdzonych szablonów właściciela — nie z kodu.
//
// PDF powstaje z tego pliku (pdf.ts) przy provisioningu i trafia jako zwykły
// plik do bucketa `lead-magnets` (ścieżka z `catalogFilePath`: slug + wersja),
// więc pobranie to podpisany link do pliku jak dla każdego innego materiału.
// Poprawka treści = commit + podbicie CATALOG_VERSION (nowa ścieżka → plik
// odświeża się przy następnym provisioningu). Każda zmiana musi przejść testy
// compliance (catalog.test.ts) — reguły twarde z autopilot/compliance-rules.ts.
import { COMPANY_DATA } from "@/lib/company";
import { SITE_URL } from "@/lib/seo/company";
import { RISK_LINES, SENDER_LINE } from "@/lib/autopilot/compliance-rules";
import { STARTER_CALCULATORS } from "@/lib/autopilot/calculators";
import { BORROWER_DEFAULT_CTA_URL, INVESTOR_PAGE_URL } from "@/lib/autopilot/profiles";
import { TRACK_TO_AUDIENCE, type Track } from "@/lib/autopilot/types";
import { CATALOG_SLUGS, isCatalogSlug, type CatalogSlug } from "./catalog-slugs";
import type { LeadMagnetAudience } from "./core";

export { CATALOG_SLUGS, isCatalogSlug, type CatalogSlug };

/** Wersja katalogu — na okładce PDF i w dzienniku provisioningu. Podbij przy zmianie treści. */
export const CATALOG_VERSION = "2026-10-23.2";

/** Prefiks ścieżek plików katalogu w buckecie `lead-magnets` (plik zespołu ma `<grupa>/<uuid>.<ext>`). */
export const CATALOG_FILE_PREFIX = "katalog/";

/** Ścieżka pliku PDF materiału w Storage: wersja w ścieżce = stary plik jest „nieaktualny” po zmianie treści. */
export function catalogFilePath(m: Pick<LeadMagnetBlueprint, "slug" | "file_name">): string {
  return `${CATALOG_FILE_PREFIX}${m.slug}/${CATALOG_VERSION}/${m.file_name}`;
}

/** Czy ścieżka w Storage należy do katalogu (plik wgrany przez provisioning, nie przez zespół). */
export function isCatalogFilePath(path: string | null | undefined): boolean {
  return typeof path === "string" && path.startsWith(CATALOG_FILE_PREFIX);
}

/** Oznaczenie treści AI wymagane przez bramkę compliance (kind lead_magnet / email). */
export const AI_MATERIAL_LINE =
  "Materiał przygotowany z użyciem AI i zweryfikowany przez zespół Finance You. Nie stanowi porady prawnej, podatkowej ani inwestycyjnej.";

export const START_URL = `${SITE_URL}/start`;
export const TOOL_URLS = {
  ile: `${SITE_URL}/narzedzie/ile-pod-nieruchomosc`,
  rata: `${SITE_URL}/narzedzie/kalkulator-raty`,
  ltv: `${SITE_URL}/narzedzie/kalkulator-ltv`,
} as const;

// ── Model treści PDF ─────────────────────────────────────────────────────────

export type PdfTableColumn = { label: string; width: number; align?: "left" | "right" };

export type PdfBlock =
  | { type: "lead"; text: string }
  | { type: "p"; text: string }
  | { type: "subheading"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "checklist"; items: string[] }
  | { type: "steps"; items: Array<{ title: string; text?: string }> }
  | { type: "important"; text: string }
  | { type: "risk"; text: string }
  | { type: "table"; columns: PdfTableColumn[]; rows: string[][] }
  | { type: "keyValues"; rows: Array<[string, string]> }
  | { type: "highlights"; items: Array<{ label: string; value: string; accent?: boolean }> };

export interface PdfSection {
  heading: string;
  blocks: PdfBlock[];
}

export type FunnelStage = "swiadomosc" | "przygotowanie" | "decyzja";

export interface LeadMagnetAction {
  label: string;
  url: string;
}

export interface LeadMagnetBlueprint {
  slug: CatalogSlug;
  track: Track;
  audience: LeadMagnetAudience;
  /** Hasło do komentarza (to samo co `defaultKeyword` serii rolek). */
  keyword: string;
  /** Wszystkie hasła (hasło główne + synonimy). */
  keywords: string[];
  stage: FunnelStage;
  /** Serie rolek (autopilot/series.ts), pod które materiał jest domyślnie podpięty. */
  series: string[];
  title: string;
  headline: string;
  subheadline: string;
  benefits: string[];
  cta_text: string;
  meta_description: string;
  thank_you_message: string;
  email_subject: string;
  email_body: string;
  subscriber_tags: string[];
  /** Następny krok lejka pokazywany po zapisie i w mailu. */
  next: LeadMagnetAction;
  file_name: string;
  /**
   * Własny skład PDF zamiast sekcji ReportWriter: „wzor-umowy” = treść umowy
   * z silnika klauzul (wzor-umowy.ts) + okładka/wprowadzenie z `pdf.sections`.
   */
  custom_pdf?: "wzor-umowy";
  pdf: {
    eyebrow: string;
    subtitle: string;
    sections: PdfSection[];
    closing: { heading: string; text: string; actions: LeadMagnetAction[] };
  };
}

type BlueprintInput = Omit<
  LeadMagnetBlueprint,
  "audience" | "keywords" | "email_body" | "subscriber_tags" | "file_name"
> & {
  synonyms?: string[];
  /** Treść maila między powitaniem a następnym krokiem ({tytul}, {link}). */
  email_intro: string;
  extra_tags?: string[];
};

function emailBody(track: Track, intro: string, next: LeadMagnetAction): string {
  return [
    "Cześć {imie}!",
    "",
    intro,
    "",
    `Następny krok: ${next.label} – ${next.url}`,
    "",
    "Jeśli ktoś z Twoich znajomych też chce dostać ten materiał, podeślij mu stronę {strona}.",
    "",
    "Pozdrawiamy,",
    "zespół Finance You",
    "",
    RISK_LINES[track],
    SENDER_LINE,
    AI_MATERIAL_LINE,
  ].join("\n");
}

function defineMagnet(input: BlueprintInput): LeadMagnetBlueprint {
  const { synonyms = [], email_intro, extra_tags = [], ...rest } = input;
  return {
    ...rest,
    audience: TRACK_TO_AUDIENCE[rest.track],
    keywords: [rest.keyword, ...synonyms],
    email_body: emailBody(rest.track, email_intro, rest.next),
    subscriber_tags: ["katalog", `katalog:${rest.slug}`, `etap:${rest.stage}`, ...extra_tags],
    file_name: `${rest.slug}.pdf`,
  };
}

const INVESTOR_ACTIONS: LeadMagnetAction[] = [
  { label: "Program dla inwestorów Finance You", url: INVESTOR_PAGE_URL },
  { label: "Kalkulator LTV i bufora bezpieczeństwa", url: TOOL_URLS.ltv },
  { label: "Wszystkie materiały i narzędzia", url: START_URL },
];

const BORROWER_ACTIONS: LeadMagnetAction[] = [
  { label: "Bezpłatny wniosek o finansowanie", url: BORROWER_DEFAULT_CTA_URL },
  { label: "Kalkulator: ile firma może uzyskać pod nieruchomość", url: TOOL_URLS.ile },
  { label: "Kalkulator raty i harmonogramu", url: TOOL_URLS.rata },
  { label: "Wszystkie materiały i narzędzia", url: START_URL },
];

// ── INWESTOR ─────────────────────────────────────────────────────────────────

const startInwestora = defineMagnet({
  slug: "start-inwestora",
  track: "inwestor",
  keyword: "START",
  stage: "swiadomosc",
  series: ["czy-wiesz-ze", "bank-vs-ty", "dzien-x-ze-100"],
  title: "Jak zarabiać na nieruchomościach jak bank – przewodnik startowy inwestora",
  // Nagłówek i podtytuł: jeden komunikat w języku korzyści, nie opis materiału.
  headline:
    "Pobierz przewodnik startowy. Zarabiaj na nieruchomościach jak bank – bez kupowania, remontów i najemców.",
  subheadline:
    "Zanim zaangażujesz pierwszą złotówkę, dowiedz się, co naprawdę chroni Twój kapitał, gdzie czyha ryzyko i od czego zacząć. Czyta się w jeden wieczór.",
  // Punkty w języku korzyści i ciekawości (co w środku), nie spis rozdziałów.
  benefits: [
    "Zrozumiesz, jak zarabia się na nieruchomości, której nigdy nie kupisz – i dlaczego banki robią to od dekad",
    "Poznasz 5 filarów, które decydują, czy Twój kapitał wróci – zanim w ogóle zaczniesz rozmawiać o oprocentowaniu",
    "Dostaniesz uczciwą mapę ryzyk: co naprawdę może pójść nie tak i jak się na to przygotować",
    "Rozszyfrujesz 12 pojęć, przy których początkujący kiwają głową, choć ich nie rozumieją",
    "Wyjdziesz z planem na pierwsze 30 dni – od pierwszej rozmowy do pierwszej decyzji",
  ],
  cta_text: "Pobierz przewodnik",
  meta_description:
    "Bezpłatny przewodnik dla inwestorów prywatnych: jak zarabiać na pożyczkach zabezpieczonych hipoteką jak bank – mechanizm, zabezpieczenia, ryzyka i pierwsze kroki.",
  thank_you_message:
    "Dziękujemy! Link do przewodnika wysłaliśmy też na Twój e-mail. Następny krok: sprawdź, jaki bufor bezpieczeństwa daje konkretna transakcja – kalkulator LTV.",
  email_subject: "Twój przewodnik startowy inwestora: {tytul}",
  email_intro:
    "oto przewodnik „{tytul}”: {link}\n\nZacznij od rozdziału 3 (pięć filarów bezpieczeństwa) – to lista pytań, które warto zadać przy każdej transakcji. Rozdział 4 to uczciwa mapa ryzyk: przeczytaj go, zanim zaangażujesz pierwszą złotówkę.",
  next: { label: "Kalkulator LTV i bufora bezpieczeństwa", url: TOOL_URLS.ltv },
  pdf: {
    eyebrow: "Przewodnik startowy · dla inwestora prywatnego",
    subtitle:
      "Jak działa pożyczka zabezpieczona hipoteką, co chroni kapitał, gdzie są ryzyka i od czego zacząć.",
    sections: [
      {
        heading: "1. Dlaczego banki zarabiają na nieruchomościach, których nie kupują",
        blocks: [
          {
            type: "lead",
            text: "Bank nie musi kupować mieszkania, żeby na nim zarabiać. Pożycza pieniądze pod zabezpieczenie na nieruchomości i pobiera odsetki zgodnie z umową. Jeśli dłużnik nie spłaca, bank ma prawo zaspokoić się z nieruchomości. Ten sam mechanizm – pożyczka zabezpieczona hipoteką – jest dostępny dla prywatnego inwestora.",
          },
          {
            type: "p",
            text: "Różnica między inwestorem a bankiem nie leży w mechanizmie, tylko w skali i narzędziach. Bank ma dział analiz, prawników i windykację. Inwestor prywatny potrzebuje tej samej wiedzy w mniejszej skali: jak ocenić zabezpieczenie, jak czytać księgę wieczystą, jak skonstruować umowę i co zrobić, gdy spłata się opóźnia. Ten przewodnik porządkuje te tematy.",
          },
          {
            type: "table",
            columns: [
              { label: "Kryterium", width: 2 },
              { label: "Mieszkanie na wynajem", width: 3 },
              { label: "Pożyczka pod hipotekę", width: 3 },
            ],
            rows: [
              [
                "Kapitał na start",
                "cała cena nieruchomości (często z kredytem)",
                "kwota pożyczki – zwykle ułamek wartości nieruchomości",
              ],
              [
                "Praca własna",
                "remont, najemcy, awarie, rozliczenia",
                "analiza zabezpieczenia i umowy przed wypłatą, potem monitoring spłat",
              ],
              [
                "Skąd przychód",
                "czynsz – zależny od pustostanów",
                "odsetki i prowizja według umowy",
              ],
              [
                "Gdy coś pójdzie nie tak",
                "pustostan, zniszczenia, spór z najemcą",
                "opóźnienie spłaty, egzekucja z nieruchomości (czas i koszty)",
              ],
              ["Horyzont", "lata", "zwykle od kilku miesięcy do kilku lat"],
            ],
          },
          {
            type: "risk",
            text: "Ani najem, ani pożyczka pod hipotekę nie eliminują ryzyka. W pożyczce ryzykiem jest przede wszystkim brak spłaty oraz to, ile będzie warte zabezpieczenie w dniu, w którym trzeba z niego skorzystać.",
          },
        ],
      },
      {
        heading: "2. Jak działa pożyczka zabezpieczona hipoteką – krok po kroku",
        blocks: [
          {
            type: "steps",
            items: [
              {
                title: "Przedsiębiorca potrzebuje finansowania",
                text: "Cel gospodarczy: zakup, inwestycja, płynność, spłata droższych zobowiązań firmy. Bank odmawia albo jest za wolny.",
              },
              {
                title: "Ma nieruchomość, która może być zabezpieczeniem",
                text: "Mieszkanie, dom, lokal, działka, hala. Liczy się wartość po weryfikacji i stan prawny w księdze wieczystej.",
              },
              {
                title: "Inwestor udziela pożyczki na podstawie umowy",
                text: "Kwota, okres, odsetki w granicach odsetek maksymalnych, harmonogram, zabezpieczenia i zasady na wypadek opóźnienia.",
              },
              {
                title: "Hipoteka na rzecz inwestora trafia do księgi wieczystej",
                text: "Oświadczenie o ustanowieniu hipoteki w formie aktu notarialnego i wniosek o wpis w dziale IV. Zwykle także poddanie się egzekucji (art. 777 k.p.c.).",
              },
              {
                title: "Pożyczkobiorca spłaca według harmonogramu",
                text: "Odsetki najczęściej miesięcznie, kapitał w ratach albo na koniec okresu. Inwestor monitoruje wpłaty.",
              },
              {
                title: "Po spłacie hipoteka jest wykreślana",
                text: "Wierzyciel wydaje zgodę na wykreślenie. Przy braku spłaty: wezwania, próba ugody, a w ostateczności egzekucja z nieruchomości.",
              },
            ],
          },
          {
            type: "important",
            text: "Na platformie Finance You inwestor jest stroną umowy pożyczki i wierzycielem hipotecznym – finansuje przedsiębiorcę bezpośrednio, a hipoteka jest wpisywana na jego rzecz. Finance You dostarcza analizę zabezpieczenia, dokumenty, generator umowy i obsługę procesu. Dostęp do systemu jest płatny w formie abonamentu; aktualne warunki są na stronie programu dla inwestorów.",
          },
        ],
      },
      {
        heading: "3. Pięć filarów bezpieczeństwa inwestora",
        blocks: [
          { type: "subheading", text: "Filar 1: hipoteka" },
          {
            type: "p",
            text: "Hipoteka daje pierwszeństwo zaspokojenia z nieruchomości przed wierzycielami osobistymi dłużnika – według kolejności wpisów. Hipoteka na pierwszym miejscu w dziale IV to inna sytuacja niż hipoteka za bankiem. Suma hipoteki powinna obejmować kapitał, odsetki (także za opóźnienie) i koszty dochodzenia należności.",
          },
          { type: "subheading", text: "Filar 2: LTV, czyli bufor" },
          {
            type: "p",
            text: "LTV (loan to value) to stosunek łącznego zadłużenia zabezpieczonego na nieruchomości – Twojej pożyczki razem z wcześniejszymi hipotekami – do jej wartości. W systemie Finance You limit LTV wynosi 60 %. Przykład: nieruchomość warta 1 000 000 zł bez obciążeń – maksymalna pożyczka 600 000 zł, a 400 000 zł to bufor na spadek wartości, koszty i czas ewentualnej egzekucji.",
          },
          { type: "subheading", text: "Filar 3: księga wieczysta" },
          {
            type: "p",
            text: "Jedyne wiarygodne źródło informacji o właścicielu, obciążeniach i roszczeniach. Czytasz ją sam, przed decyzją, w elektronicznej przeglądarce ksiąg wieczystych. Szczegółowa checklista dział po dziale to osobny materiał – hasło KSIĘGA pod naszymi rolkami.",
          },
          { type: "subheading", text: "Filar 4: umowa i forma notarialna" },
          {
            type: "p",
            text: "Umowa pożyczki z harmonogramem, zasadami wcześniejszej spłaty, odsetkami za opóźnienie i opisem zabezpieczeń. Oświadczenie o ustanowieniu hipoteki w formie aktu notarialnego. Poddanie się egzekucji (art. 777 § 1 pkt 4–5 k.p.c.), które skraca drogę do tytułu wykonawczego, gdy spłata ustaje.",
          },
          { type: "subheading", text: "Filar 5: cel gospodarczy i weryfikacja pożyczkobiorcy" },
          {
            type: "p",
            text: "Finansowanie wyłącznie przedsiębiorców i wyłącznie na cel związany z działalnością. Pożyczka udzielona konsumentowi pod zabezpieczenie na nieruchomości podlega innym przepisom (ustawa o kredycie hipotecznym) i jest dla inwestora prywatnego pułapką prawną. Sprawdzane są: rejestr (KRS / CEIDG), zaległości publicznoprawne, postępowania i źródło spłaty.",
          },
          {
            type: "highlights",
            items: [
              { label: "Limit LTV w systemie", value: "60 %" },
              { label: "Forma ustanowienia hipoteki", value: "akt notarialny" },
              { label: "Finansowanie", value: "tylko cel gospodarczy", accent: true },
            ],
          },
        ],
      },
      {
        heading: "4. Uczciwa mapa ryzyk",
        blocks: [
          {
            type: "table",
            columns: [
              { label: "Ryzyko", width: 2 },
              { label: "Na czym polega", width: 3 },
              { label: "Jak je ograniczać", width: 3 },
            ],
            rows: [
              [
                "Brak lub opóźnienie spłaty",
                "pożyczkobiorca traci płynność albo cel nie wypalił",
                "odsetki za opóźnienie w umowie, monitoring wpłat, szybka reakcja, LTV z buforem",
              ],
              [
                "Spadek wartości zabezpieczenia",
                "rynek, stan techniczny, zmiana planu miejscowego",
                "konserwatywna wycena, niski udział pożyczki w wartości, płynne lokalizacje",
              ],
              [
                "Czas i koszt egzekucji",
                "od wezwania do licytacji mijają miesiące, czasem lata; koszty komornika i sądu schodzą z ceny jako pierwsze",
                "art. 777 k.p.c., suma hipoteki z zapasem na koszty, ugoda przed egzekucją",
              ],
              [
                "Wady prawne nieruchomości",
                "wzmianki w księdze, roszczenia, służebności, współwłasność, prawa lokatorów",
                "analiza księgi wieczystej przed decyzją, zgody współwłaścicieli i małżonka, oględziny",
              ],
              [
                "Płynność kapitału",
                "pieniądze są zamrożone do spłaty; wcześniejsze wyjście wymaga cesji wierzytelności",
                "planuj horyzont; nie angażuj środków potrzebnych w krótkim terminie",
              ],
              [
                "Koncentracja",
                "jedna duża pożyczka = jedno ryzyko",
                "podział kapitału między projekty, kwoty i terminy",
              ],
              [
                "Podatki i formalności",
                "odsetki podlegają opodatkowaniu; są obowiązki wobec urzędu skarbowego",
                "ustal zasady rozliczenia przed pierwszą transakcją (doradca podatkowy)",
              ],
            ],
          },
          {
            type: "risk",
            text: "Hipoteka zmniejsza ryzyko utraty kapitału, ale go nie usuwa. Zdarzają się sytuacje, w których z egzekucji odzyskuje się mniej, niż wynosiła pożyczka, albo odzyskuje się ją z dużym opóźnieniem. Nikt nie jest w stanie zapewnić wyniku – decyzja i jej skutki należą do inwestora.",
          },
        ],
      },
      {
        heading: "5. Słownik 12 pojęć",
        blocks: [
          {
            type: "keyValues",
            rows: [
              [
                "Hipoteka umowna",
                "ograniczone prawo rzeczowe ustanowione przez właściciela na rzecz wierzyciela; wpis w dziale IV księgi wieczystej.",
              ],
              [
                "Hipoteka przymusowa",
                "wpisana bez zgody właściciela na podstawie tytułu wykonawczego lub decyzji (urząd skarbowy, ZUS, wyrok) – sygnał ostrzegawczy.",
              ],
              [
                "LTV",
                "stosunek łącznego zadłużenia zabezpieczonego na nieruchomości do jej wartości; w systemie Finance You limit wynosi 60 %.",
              ],
              [
                "Księga wieczysta",
                "publiczny rejestr stanu prawnego nieruchomości: dział I (oznaczenie), II (własność), III (prawa i roszczenia), IV (hipoteki).",
              ],
              [
                "Wzmianka",
                "informacja, że do sądu wpłynął wniosek o wpis, który nie został jeszcze rozpoznany – treść wpisu jest nieznana do czasu jego dokonania.",
              ],
              [
                "Operat szacunkowy",
                "wycena rzeczoznawcy majątkowego na określony dzień; szacunek, nie cena sprzedaży.",
              ],
              [
                "Odsetki maksymalne",
                "górna granica odsetek umownych: dwukrotność odsetek ustawowych, czyli 2 × (stopa referencyjna NBP + 3,5 p.p.); dla odsetek za opóźnienie 2 × (stopa referencyjna NBP + 5,5 p.p.).",
              ],
              [
                "Harmonogram spłat",
                "terminy i kwoty rat; rata balonowa = kapitał spłacany jednorazowo na koniec okresu.",
              ],
              [
                "Poddanie się egzekucji",
                "oświadczenie dłużnika w akcie notarialnym (art. 777 k.p.c.) – po nadaniu klauzuli wykonalności pozwala wszcząć egzekucję bez procesu.",
              ],
              [
                "Cesja wierzytelności",
                "sprzedaż wierzytelności innemu inwestorowi – sposób na wcześniejsze wyjście z pożyczki.",
              ],
              [
                "Cel gospodarczy",
                "przeznaczenie środków związane z działalnością pożyczkobiorcy; warunek finansowania w systemie Finance You.",
              ],
              [
                "Prowizja od pożyczkobiorcy",
                "opłata Finance You płacona przez przedsiębiorcę – potrącana z wypłaty, nie obciąża inwestora.",
              ],
            ],
          },
        ],
      },
      {
        heading: "6. Plan pierwszych 30 dni",
        blocks: [
          {
            type: "steps",
            items: [
              {
                title: "Dni 1–3: zrozum mechanizm i ryzyka",
                text: "Ten przewodnik, rozdziały 2–4. Zapisz własnymi słowami, co się dzieje, gdy pożyczkobiorca przestaje płacić.",
              },
              {
                title: "Dni 4–7: naucz się czytać księgę wieczystą",
                text: "Checklista KSIĘGA. Otwórz w przeglądarce EKW dwie–trzy księgi nieruchomości, które znasz, i przejdź przez działy I–IV.",
              },
              {
                title: "Dni 8–14: ustal własne kryteria",
                text: "Maksymalne LTV, typy nieruchomości, lokalizacje, kwoty, horyzont. Zdecyduj, jaką część kapitału przeznaczasz na pożyczki – i jaką część pojedyncza pożyczka może stanowić.",
              },
              {
                title: "Dni 15–21: załóż konto i złóż zlecenie",
                text: "Rejestracja w panelu inwestora, weryfikacja tożsamości (KYC), zlecenie poszukiwania projektów według Twoich kryteriów.",
              },
              {
                title: "Dni 22–30: oceń pierwsze propozycje bez pośpiechu",
                text: "Raport o zabezpieczeniu, księga wieczysta, harmonogram, kalkulator LTV. Zadawaj pytania. Pominięcie projektu nic nie kosztuje – zła decyzja kosztuje dużo.",
              },
            ],
          },
        ],
      },
    ],
    closing: {
      heading: "Co dalej?",
      text: "Przelicz pierwszą hipotetyczną transakcję w kalkulatorze LTV, odbierz checklistę księgi wieczystej (hasło KSIĘGA) i zobacz, jak wygląda program dla inwestorów: analiza zabezpieczenia, generator umowy i obsługa spłat w jednym miejscu.",
      actions: INVESTOR_ACTIONS,
    },
  },
});

const checklistaKsiegi = defineMagnet({
  slug: "checklista-ksiegi-wieczystej",
  track: "inwestor",
  keyword: "KSIĘGA",
  stage: "przygotowanie",
  series: ["audyt-zabezpieczenia"],
  title: "Checklista księgi wieczystej: co sprawdzić przed pożyczką pod hipotekę",
  // Nagłówek i podtytuł: jeden komunikat w języku korzyści, nie opis materiału.
  headline:
    "Pobierz checklistę księgi wieczystej. Wyłap wady zabezpieczenia w 20 minut, zanim zaangażujesz kapitał.",
  subheadline:
    "Jeden wpis w dziale III albo IV może zamienić dobre zabezpieczenie w kłopot. Ta lista pokaże Ci, gdzie patrzeć i o co dopytać, zanim podpiszesz cokolwiek.",
  // Punkty w języku korzyści i ciekawości (co w środku), nie spis rozdziałów.
  benefits: [
    "Sprawdzisz księgę wieczystą w 20 minut, bez prawnika – i zrozumiesz, co właściwie widzisz",
    "Poznasz wpisy, które z pozoru wyglądają niewinnie, a dyskwalifikują zabezpieczenie",
    "Dostaniesz ponad 30 punktów do odhaczenia, dział po dziale, wyjaśnionych po ludzku",
    "Zobaczysz tabelę sygnałów ostrzegawczych – i co zrobić, gdy któryś się pojawi",
    "Dowiesz się, o co zapytać pożyczkobiorcę i notariusza, zanim podpiszesz cokolwiek",
  ],
  cta_text: "Pobierz checklistę",
  meta_description:
    "Bezpłatna checklista księgi wieczystej dla inwestora: działy I–IV, wzmianki, hipoteki, służebności i sygnały ostrzegawcze przed udzieleniem pożyczki pod hipotekę.",
  thank_you_message:
    "Dziękujemy! Checklistę wysłaliśmy też na Twój e-mail. Przelicz teraz LTV i bufor bezpieczeństwa konkretnej transakcji w kalkulatorze.",
  email_subject: "Twoja checklista księgi wieczystej: {tytul}",
  email_intro:
    "oto „{tytul}”: {link}\n\nWydrukuj strony z checklistą i odhaczaj punkty przy każdej księdze – zajmuje to około 20 minut i wyłapuje większość wad zabezpieczenia. Tabela sygnałów ostrzegawczych (rozdział 5) mówi, co zrobić, gdy coś się nie zgadza.",
  next: { label: "Kalkulator LTV i bufora bezpieczeństwa", url: TOOL_URLS.ltv },
  pdf: {
    eyebrow: "Checklista · dla inwestora prywatnego",
    subtitle:
      "Dział po dziale: co czytać, które wpisy są sygnałem ostrzegawczym i o co dopytać przed podpisaniem umowy.",
    sections: [
      {
        heading: "1. Zanim otworzysz księgę",
        blocks: [
          {
            type: "lead",
            text: "Księga wieczysta jest jawna: każdy może ją przeczytać w elektronicznej przeglądarce Ministerstwa Sprawiedliwości (ekw.ms.gov.pl), znając jej numer. Domniemywa się, że stan ujawniony w księdze jest zgodny z rzeczywistym stanem prawnym – i na tym domniemaniu (rękojmia wiary publicznej ksiąg wieczystych) opiera się skuteczność hipoteki.",
          },
          {
            type: "checklist",
            items: [
              "Mam numer księgi od pożyczkobiorcy (trzy części: kod wydziału sądu, numer księgi, cyfra kontrolna).",
              "Numer z aktu notarialnego nabycia zgadza się z numerem, który dostałem.",
              "Otworzyłem w EKW zarówno „treść aktualną”, jak i „treść zupełną” (z wpisami wykreślonymi i historią).",
              "Zapisałem datę i godzinę odczytu – przed podpisaniem umowy powtarzam odczyt.",
              "Dla lokalu otworzyłem również księgę gruntową budynku (udział w nieruchomości wspólnej).",
            ],
          },
          {
            type: "important",
            text: "Treść zupełna pokazuje także wpisy wykreślone. Historia wcześniejszych hipotek, egzekucji czy ostrzeżeń mówi dużo o tym, jak właściciel zarządza zobowiązaniami.",
          },
        ],
      },
      {
        heading: "2. Dział I – oznaczenie nieruchomości i prawa związane",
        blocks: [
          {
            type: "checklist",
            items: [
              "Rodzaj nieruchomości zgadza się z opisem pożyczkobiorcy: lokal, grunt zabudowany, grunt niezabudowany, użytkowanie wieczyste.",
              "Adres, numer działki i obręb zgadzają się z wypisem z ewidencji gruntów.",
              "Powierzchnia w księdze odpowiada ewidencji; rozbieżność wymaga wyjaśnienia (sprostowanie działu I-O).",
              "Dział I-Sp (prawa związane z własnością): służebność drogi na cudzej działce – dojazd jest zapewniony prawnie, nie „zwyczajowo”.",
              "Grunt: sposób korzystania (R – rolny, B – zabudowany, Bp – przeznaczony pod zabudowę, Ls – leśny). Grunt rolny oznacza ograniczenia w obrocie i mniejszą płynność.",
              "Lokal: udział w nieruchomości wspólnej i powiązana księga gruntowa; sprawdzam, czy budynek stoi na gruncie własnym, czy w użytkowaniu wieczystym.",
            ],
          },
          {
            type: "p",
            text: "Dlaczego to ważne: błąd w dziale I nie dyskwalifikuje zabezpieczenia, ale potrafi wydłużyć wpis hipoteki i sprzedaż w razie egzekucji o wiele tygodni.",
          },
        ],
      },
      {
        heading: "3. Dział II – własność",
        blocks: [
          {
            type: "checklist",
            items: [
              "Właścicielem jest dokładnie ten podmiot, który będzie dłużnikiem rzeczowym – porównuję z KRS / CEIDG i dokumentem tożsamości.",
              "Podstawa wpisu własności: akt notarialny, postanowienie o stwierdzeniu nabycia spadku, umowa darowizny. Przy spadku i darowiźnie pytam o roszczenia innych spadkobierców i zachowek.",
              "Współwłasność: znam udziały wszystkich współwłaścicieli; hipoteka na całej nieruchomości wymaga zgody każdego z nich (hipoteka na udziale to słabsze zabezpieczenie).",
              "Małżeńska wspólność majątkowa: oboje małżonkowie podpiszą oświadczenie o ustanowieniu hipoteki.",
              "Użytkowanie wieczyste: sprawdzam termin, na jaki prawo ustanowiono, i czy nie ma zaległości w opłacie rocznej.",
              "Osoba fizyczna jako właściciel, firma jako pożyczkobiorca: w umowie rozdzielam dłużnika osobistego (firma) i dłużnika rzeczowego (właściciel).",
            ],
          },
        ],
      },
      {
        heading: "4. Dział III – prawa, roszczenia i ograniczenia",
        blocks: [
          {
            type: "checklist",
            items: [
              "Brak wpisu o wszczęciu egzekucji z nieruchomości – taki wpis dyskwalifikuje zabezpieczenie do czasu umorzenia postępowania.",
              "Brak ostrzeżenia o niezgodności treści księgi z rzeczywistym stanem prawnym.",
              "Służebności osobiste (mieszkania, dożywocie): nie wygasają przy sprzedaży i mocno obniżają wartość w egzekucji.",
              "Służebności gruntowe i przesyłu: oceniam wpływ na wartość (słup na środku działki, droga przez posesję).",
              "Roszczenia o zawarcie umowy przyrzeczonej – ktoś już ma roszczenie o przeniesienie własności; do wyjaśnienia przed decyzją.",
              "Prawo pierwokupu na rzecz osoby trzeciej, gminy albo Krajowego Ośrodka Wsparcia Rolnictwa (grunty rolne).",
              "Najem lub dzierżawa ujawnione w księdze: umowa wiąże nabywcę; długoterminowy najem obniża cenę przy sprzedaży.",
              "Zakaz zbywania lub obciążania (zabezpieczenie roszczeń w postępowaniu sądowym) – blokuje skuteczne ustanowienie hipoteki.",
              "Wzmianki o wnioskach w dziale III: nie wiem, co jest w środku, dopóki nie zobaczę wniosku – proszę pożyczkobiorcę o kopię.",
            ],
          },
        ],
      },
      {
        heading: "5. Dział IV – hipoteki",
        blocks: [
          {
            type: "checklist",
            items: [
              "Wszystkie hipoteki i ich sumy – liczę łączne obciążenie, nie tylko kapitał aktualnie spłacany (suma hipoteki to górna granica odpowiedzialności z nieruchomości).",
              "Kolejność: moja hipoteka wejdzie na pierwsze miejsce czy za kimś? Zaspokojenie następuje według pierwszeństwa – hipoteka na drugim miejscu dostaje to, co zostanie.",
              "Hipoteka przymusowa (urząd skarbowy, ZUS, komornik) – dłużnik nie reguluje zobowiązań publicznych; zwykle rezygnuję.",
              "Hipoteka łączna – obciąża kilka nieruchomości naraz; sprawdzam pozostałe księgi.",
              "Pożyczka ma spłacić wcześniejszą hipotekę: mam zaświadczenie o saldzie od wierzyciela i promesę zgody na wykreślenie; wypłata idzie bezpośrednio do wierzyciela.",
              "Wzmianki w dziale IV: cudza hipoteka może czekać na wpis i wyprzedzić moją (pierwszeństwo liczy się według chwili złożenia wniosku).",
              "Mój wpis: suma hipoteki obejmuje kapitał, odsetki (także za opóźnienie) i koszty dochodzenia należności; waluta zgodna z umową.",
            ],
          },
          {
            type: "table",
            columns: [
              { label: "Wpis", width: 2 },
              { label: "Co oznacza", width: 3 },
              { label: "Reakcja", width: 3 },
            ],
            rows: [
              [
                "Ostrzeżenie o egzekucji (dział III)",
                "komornik prowadzi egzekucję z nieruchomości",
                "stop – do wyjaśnienia i umorzenia egzekucji",
              ],
              [
                "Hipoteka przymusowa (dział IV)",
                "zaległości wobec urzędu, ZUS albo wyrok sądu",
                "żądam zaświadczeń o niezaleganiu i planu spłaty; zwykle rezygnuję",
              ],
              [
                "Wzmianka o wniosku",
                "coś czeka na wpis – nie wiadomo co",
                "kopia wniosku od pożyczkobiorcy albo czekam na rozpoznanie",
              ],
              [
                "Służebność mieszkania / dożywocie",
                "osoba trzecia ma prawo mieszkać dożywotnio",
                "wartość w egzekucji znacznie niższa – obniżam LTV albo rezygnuję",
              ],
              [
                "Zakaz zbywania i obciążania",
                "sąd zabezpieczył cudze roszczenie",
                "hipoteki nie da się skutecznie ustanowić – rezygnuję",
              ],
              [
                "Grunt rolny",
                "ograniczenia w obrocie, pierwokup KOWR",
                "liczę się z długą sprzedażą; konsultacja prawna",
              ],
              [
                "Współwłasność bez zgody wszystkich",
                "hipoteka tylko na udziale",
                "zgoda wszystkich współwłaścicieli albo niższa kwota",
              ],
            ],
          },
        ],
      },
      {
        heading: "6. Poza księgą – stan faktyczny",
        blocks: [
          {
            type: "checklist",
            items: [
              "Oglądam nieruchomość (osobiście albo przez osobę zaufaną): stan techniczny, kto mieszka, czy prowadzona jest działalność.",
              "Osoby zameldowane i lokatorzy: ochrona lokatorów wydłuża egzekucję, nawet gdy księga jest czysta.",
              "Plan miejscowy lub studium: przeznaczenie terenu wpływa na wartość i płynność.",
              "Zaległości wobec wspólnoty lub spółdzielni, podatek od nieruchomości, media.",
              "Ubezpieczenie budynku z cesją praw z polisy na wierzyciela na czas pożyczki.",
              "Wycena: ceny transakcyjne z okolicy, nie tylko ofertowe; wycena to szacunek – w egzekucji sprzedaje się taniej.",
            ],
          },
        ],
      },
      {
        heading: "7. Pytania do pożyczkobiorcy i do notariusza",
        blocks: [
          { type: "subheading", text: "Do pożyczkobiorcy" },
          {
            type: "bullets",
            items: [
              "Skąd wzmianka w dziale III / IV i czego dotyczy wniosek?",
              "Kto mieszka w nieruchomości i na jakiej podstawie?",
              "Czy są zaległości wobec urzędu skarbowego, ZUS, wspólnoty?",
              "Z czego będą spłacane odsetki i kapitał? Jaki jest plan B?",
              "Czy małżonek i współwłaściciele wiedzą o pożyczce i podpiszą akt?",
            ],
          },
          { type: "subheading", text: "Do notariusza" },
          {
            type: "bullets",
            items: [
              "Czy suma hipoteki obejmuje odsetki i koszty dochodzenia należności?",
              "Czy akt zawiera poddanie się egzekucji (art. 777 § 1 pkt 4–5 k.p.c.) co do kwoty pożyczki i odsetek?",
              "Kiedy zostanie złożony elektroniczny wniosek o wpis i jaki jest numer wzmianki?",
              "Jakie zgody są potrzebne (małżonek, współwłaściciele, organ spółki)?",
            ],
          },
          {
            type: "risk",
            text: "Nawet bezbłędnie przeczytana księga nie usuwa ryzyka: wartość nieruchomości może spaść, a egzekucja trwa i kosztuje. Checklista ogranicza ryzyko błędu prawnego – decyzja o pożyczce i jej skutki należą do inwestora.",
          },
        ],
      },
    ],
    closing: {
      heading: "Co dalej?",
      text: "Po przejściu checklisty przelicz LTV i bufor bezpieczeństwa w kalkulatorze – sprawdzisz, jaki spadek wartości nieruchomości zabezpieczenie jeszcze wytrzyma. W programie dla inwestorów analizę księgi wieczystej i ocenę ryzyka dostajesz w raporcie o inwestycji.",
      actions: INVESTOR_ACTIONS,
    },
  },
});

const bledyInwestora = defineMagnet({
  slug: "bledy-inwestora",
  track: "inwestor",
  keyword: "BŁĘDY",
  stage: "decyzja",
  series: ["3-bledy-inwestora"],
  title: "7 błędów inwestora w pożyczkach pod hipotekę – i jak ich uniknąć",
  // Nagłówek i podtytuł: jeden komunikat w języku korzyści, nie opis materiału.
  headline:
    "Pobierz 7 błędów inwestora. Dowiedz się, na czym inni stracili pieniądze – zanim powtórzysz ich błąd.",
  subheadline:
    "Każdy błąd ma sygnał ostrzegawczy, cenę i prostą procedurę, która go zatrzymuje. Na końcu 15 pytań, które zadasz sobie przed każdą decyzją.",
  // Punkty w języku korzyści i ciekawości (co w środku), nie spis rozdziałów.
  benefits: [
    "Poznasz 7 błędów, przez które inwestorzy tracą pieniądze – i jak ich uniknąć, zanim podpiszesz umowę",
    "Przy każdym błędzie: po czym go poznać, ile kosztuje i jak go uniknąć jednym działaniem",
    "Zobaczysz na liczbach, jak LTV i kolejność hipotek decydują, ile odzyskasz z egzekucji",
    "Dowiesz się, co zrobić w pierwszym tygodniu opóźnienia, żeby nie stracić kontroli",
    "Dostaniesz 15 pytań „przed decyzją” – jeśli na któreś nie znasz odpowiedzi, nie wypłacaj pieniędzy",
  ],
  cta_text: "Pobierz 7 błędów",
  meta_description:
    "7 błędów inwestora w pożyczkach zabezpieczonych hipoteką: wycena, księga wieczysta, LTV, umowa, weryfikacja pożyczkobiorcy, plan na opóźnienie, koncentracja. Bezpłatny PDF.",
  thank_you_message:
    "Dziękujemy! Materiał wysłaliśmy też na Twój e-mail. Zobacz, jak wygląda program dla inwestorów Finance You – analiza zabezpieczenia, generator umowy i obsługa spłat w jednym miejscu.",
  email_subject: "7 błędów inwestora – Twój materiał od Finance You",
  email_intro:
    "oto „{tytul}”: {link}\n\nZacznij od błędu 3 (za wysokie LTV) – przykład liczbowy pokazuje, jak kilkanaście punktów procentowych LTV zmienia wynik egzekucji. Lista kontrolna z ostatniego rozdziału jest do wydruku: odhaczaj ją przed każdą decyzją.",
  next: { label: "Program dla inwestorów Finance You", url: INVESTOR_PAGE_URL },
  pdf: {
    eyebrow: "Przewodnik · dla inwestora prywatnego",
    subtitle:
      "Jak rozpoznać każdy z błędów, co naprawdę kosztuje i co zrobić zamiast tego – z przykładem liczbowym i listą kontrolną.",
    sections: [
      {
        heading: "Zanim zaczniesz",
        blocks: [
          {
            type: "lead",
            text: "Inwestorzy w pożyczkach pod hipotekę rzadko tracą pieniądze przez pech. Tracą je przez powtarzalne błędy: nadmierne zaufanie do wyceny, nieprzeczytaną księgę wieczystą, zbyt wysokie LTV, słabą umowę, brak weryfikacji pożyczkobiorcy, brak planu na opóźnienie i koncentrację kapitału. Każdy z nich da się wyłapać przed wypłatą.",
          },
        ],
      },
      {
        heading: "Błąd 1: ufasz wycenie zamiast ją sprawdzić",
        blocks: [
          {
            type: "p",
            text: "Operat szacunkowy to szacunek na dzień sporządzenia, wykonany na zlecenie – często właściciela. W egzekucji nieruchomość nie sprzedaje się za wartość z operatu: cena wywołania na pierwszej licytacji to trzy czwarte sumy oszacowania, na drugiej – dwie trzecie. Do tego dochodzą koszty postępowania, które schodzą z ceny jako pierwsze.",
          },
          { type: "subheading", text: "Jak rozpoznać" },
          {
            type: "bullets",
            items: [
              "Wycena starsza niż 6 miesięcy albo sporządzona na inny cel (np. ubezpieczeniowy).",
              "Wartość wyraźnie powyżej cen transakcyjnych podobnych nieruchomości w okolicy.",
              "Operat dostarczony przez pożyczkobiorcę bez niezależnej weryfikacji.",
            ],
          },
          { type: "subheading", text: "Co zrobić zamiast tego" },
          {
            type: "bullets",
            items: [
              "Własny przegląd cen transakcyjnych (nie ofertowych) i rozmowa z lokalnym pośrednikiem.",
              "Konserwatywna korekta wartości – i liczenie LTV od wartości po korekcie.",
              "Pytanie kontrolne: „Czy w 6 miesięcy sprzedam to za 70 % wyceny?”. Jeśli nie – za wysoka wycena albo za duża kwota.",
            ],
          },
        ],
      },
      {
        heading: "Błąd 2: nie czytasz księgi wieczystej (albo czytasz tylko dział IV)",
        blocks: [
          {
            type: "p",
            text: "Dział IV mówi o hipotekach, ale to dział III ukrywa wpisy, które potrafią zniszczyć zabezpieczenie: ostrzeżenie o egzekucji, służebność mieszkania, dożywocie, zakaz zbywania, roszczenia osób trzecich. Wzmianka o wniosku w dowolnym dziale oznacza, że stan księgi zaraz się zmieni.",
          },
          {
            type: "bullets",
            items: [
              "Czytaj treść zupełną, nie tylko aktualną – historia wykreślonych wpisów mówi o właścicielu.",
              "Dla lokalu otwórz także księgę gruntową budynku.",
              "Powtórz odczyt w dniu podpisania aktu.",
            ],
          },
          {
            type: "important",
            text: "Pełna checklista działów I–IV z tabelą sygnałów ostrzegawczych to osobny materiał: hasło KSIĘGA pod naszymi rolkami albo strona financeyou.pl/pobierz/checklista-ksiegi-wieczystej.",
          },
        ],
      },
      {
        heading: "Błąd 3: za wysokie LTV, czyli brak bufora",
        blocks: [
          {
            type: "p",
            text: "LTV to łączne zadłużenie zabezpieczone na nieruchomości (Twoja pożyczka plus wcześniejsze hipoteki) do jej wartości. Bufor między LTV a 100 % to zapas na spadek wartości, obniżki na licytacji, koszty egzekucji i narastające odsetki. W systemie Finance You limit LTV wynosi 60 % – poniżej jest zdrowo, powyżej zaczyna się hazard.",
          },
          {
            type: "table",
            columns: [
              { label: "Pozycja", width: 3 },
              { label: "Scenariusz A (LTV 50 %)", width: 2, align: "right" },
              { label: "Scenariusz B (LTV 75 %)", width: 2, align: "right" },
            ],
            rows: [
              ["Wartość nieruchomości z wyceny", "1 000 000 zł", "1 000 000 zł"],
              ["Kwota pożyczki", "500 000 zł", "750 000 zł"],
              ["Cena uzyskana w egzekucji (po obniżkach)", "700 000 zł", "700 000 zł"],
              ["Koszty postępowania i komornika", "–50 000 zł", "–50 000 zł"],
              ["Do podziału dla wierzycieli", "650 000 zł", "650 000 zł"],
              ["Kapitał + odsetki za opóźnienie + koszty", "580 000 zł", "850 000 zł"],
              ["Wynik dla inwestora", "odzysk pełny", "brakuje 200 000 zł"],
            ],
          },
          {
            type: "risk",
            text: "Liczby są przykładowe. W rzeczywistości cena z licytacji może być niższa, a egzekucja dłuższa – im wyższe LTV, tym mniej miejsca na błąd.",
          },
        ],
      },
      {
        heading: "Błąd 4: ignorujesz płynność nieruchomości",
        blocks: [
          {
            type: "p",
            text: "Zabezpieczenie jest tyle warte, ile ktoś za nie zapłaci w rozsądnym czasie. Nieruchomości trudne do sprzedaży: udział w nieruchomości, grunt rolny, lokal użytkowy w małej miejscowości, dom w budowie, nieruchomość z lokatorami, nietypowe obiekty (stacja paliw, pensjonat, hala specjalistyczna).",
          },
          {
            type: "bullets",
            items: [
              "Zadaj pytanie: kto i za ile kupi to w pół roku?",
              "Dla nietypowych nieruchomości obniż LTV, nie podnoś odsetek – odsetki nie naprawiają złego zabezpieczenia.",
              "Lokalizacja: ceny transakcyjne, czas sprzedaży ofert w okolicy, plan miejscowy. W panelu inwestora ocenę lokalizacji dostajesz w raporcie.",
            ],
          },
        ],
      },
      {
        heading: "Błąd 5: słaba umowa",
        blocks: [
          {
            type: "p",
            text: "Umowa pisana „z internetu” albo na kolanie wychodzi na jaw dopiero przy opóźnieniu. Dobra umowa pożyczki pod hipotekę zawiera co najmniej:",
          },
          {
            type: "checklist",
            items: [
              "Harmonogram spłat z datami i kwotami (odsetki i kapitał) oraz rachunek do spłaty.",
              "Odsetki kapitałowe w granicach odsetek maksymalnych i odsetki za opóźnienie.",
              "Zasady wcześniejszej spłaty i wypowiedzenia umowy.",
              "Sumę hipoteki z zapasem na odsetki i koszty dochodzenia należności.",
              "Poddanie się egzekucji w akcie notarialnym (art. 777 k.p.c.) co do kapitału i odsetek.",
              "Oświadczenia pożyczkobiorcy: cel gospodarczy, brak postępowań egzekucyjnych i restrukturyzacyjnych, prawdziwość dokumentów.",
              "Zakaz dalszego obciążania i zbywania nieruchomości bez zgody wierzyciela w czasie trwania pożyczki.",
              "Cesję praw z polisy ubezpieczenia nieruchomości.",
              "Adresy do doręczeń i zasady kontaktu przy opóźnieniu.",
            ],
          },
          {
            type: "important",
            text: "Nie pisz umowy od zera. Korzystaj z zatwierdzonych szablonów (w systemie Finance You – generator umowy pożyczki) i konsultuj zmiany z prawnikiem. Sztuczna inteligencja nie zastępuje przeglądu prawnego.",
          },
        ],
      },
      {
        heading: "Błąd 6: nie weryfikujesz pożyczkobiorcy i celu",
        blocks: [
          {
            type: "p",
            text: "Hipoteka zabezpiecza, ale spłacać ma człowiek i jego firma. Zanim wypłacisz, sprawdź:",
          },
          {
            type: "checklist",
            items: [
              "KRS / CEIDG: firma istnieje, jest aktywna, reprezentacja zgadza się z osobą, która podpisuje.",
              "Zaległości wobec urzędu skarbowego i ZUS (zaświadczenia o niezaleganiu albo plan spłaty z wypłaty).",
              "Krajowy Rejestr Zadłużonych: brak postępowań upadłościowych i restrukturyzacyjnych.",
              "Cel gospodarczy opisany konkretnie: na co idą środki i z czego nastąpi spłata.",
              "Pożyczkobiorca jest przedsiębiorcą – pożyczka konsumentowi pod zabezpieczenie na nieruchomości podlega ustawie o kredycie hipotecznym i jest poza modelem prywatnego inwestora.",
            ],
          },
        ],
      },
      {
        heading: "Błąd 7: nie masz planu na opóźnienie i wkładasz wszystko w jedną pożyczkę",
        blocks: [
          {
            type: "p",
            text: "Opóźnienie spłaty nie jest wyjątkiem – jest scenariuszem, na który trzeba mieć procedurę. Im szybsza i spokojniejsza reakcja, tym większa szansa na ugodę zamiast egzekucji.",
          },
          {
            type: "steps",
            items: [
              {
                title: "Dzień 1 po terminie: kontakt",
                text: "Telefon lub wiadomość: co się stało, kiedy wpłata. Zapisz ustalenia.",
              },
              {
                title: "Dzień 3: wezwanie na piśmie",
                text: "Wezwanie do zapłaty z naliczeniem odsetek za opóźnienie, wysłane na adres z umowy.",
              },
              {
                title: "Dzień 7–14: propozycja rozwiązania",
                text: "Harmonogram naprawczy albo aneks – tylko na piśmie i tylko z realnym źródłem spłaty.",
              },
              {
                title: "Po bezskutecznym wezwaniu: wypowiedzenie i klauzula wykonalności",
                text: "Wniosek o nadanie klauzuli wykonalności aktowi notarialnemu (art. 777 k.p.c.), a następnie wniosek egzekucyjny do komornika – z udziałem prawnika.",
              },
            ],
          },
          {
            type: "p",
            text: "Koncentracja: jedna pożyczka na cały kapitał to jedno ryzyko bez amortyzacji. Dziel kapitał między kilka projektów, różne kwoty i terminy – i nie angażuj środków, których możesz potrzebować w krótkim czasie.",
          },
        ],
      },
      {
        heading: "Lista kontrolna „przed decyzją”",
        blocks: [
          {
            type: "checklist",
            items: [
              "Sprawdziłem ceny transakcyjne i skorygowałem wycenę.",
              "LTV liczone od wartości po korekcie mieści się w moim limicie (nie wyżej niż 60 %).",
              "Przeczytałem treść zupełną księgi: działy I–IV, wzmianki, historia.",
              "Dla lokalu sprawdziłem także księgę gruntową budynku.",
              "Nie ma ostrzeżeń o egzekucji, zakazu zbywania, służebności osobistych ani dożywocia.",
              "Moja hipoteka będzie na pierwszym miejscu albo świadomie akceptuję dalsze miejsce przy odpowiednio niższym LTV.",
              "Zgody małżonka i wszystkich współwłaścicieli są zapewnione.",
              "Wiem, kto mieszka w nieruchomości i na jakiej podstawie.",
              "Pożyczkobiorca jest aktywnym przedsiębiorcą, cel jest gospodarczy i opisany konkretnie.",
              "Brak zaległości wobec urzędu skarbowego i ZUS albo spłata z wypłaty.",
              "Umowa zawiera harmonogram, odsetki za opóźnienie, zasady wcześniejszej spłaty i zakaz dalszego obciążania.",
              "Akt notarialny zawiera poddanie się egzekucji (art. 777 k.p.c.) i hipotekę z zapasem na odsetki i koszty.",
              "Mam cesję praw z polisy ubezpieczeniowej nieruchomości.",
              "Mam procedurę na opóźnienie i kontakt do prawnika.",
              "Ta pożyczka to rozsądna część mojego kapitału – nie całość.",
            ],
          },
          {
            type: "risk",
            text: "Lista kontrolna ogranicza błędy, ale nie gwarancja wyniku – takiej nie ma. Inwestowanie w pożyczki pod hipotekę wiąże się z ryzykiem utraty części lub całości kapitału, a decyzja należy do inwestora.",
          },
        ],
      },
    ],
    closing: {
      heading: "Co dalej?",
      text: "W programie dla inwestorów Finance You większość tej listy dostajesz w gotowej formie: raport o zabezpieczeniu z analizą księgi wieczystej i oceną ryzyka, generator umowy z zatwierdzonych szablonów, harmonogram zaakceptowany przez klienta oraz obsługę spłat i windykacji. Zobacz, jak to działa.",
      actions: INVESTOR_ACTIONS,
    },
  },
});

const wzorUmowyPozyczki = defineMagnet({
  slug: "wzor-umowy-pozyczki",
  track: "inwestor",
  keyword: "UMOWA",
  synonyms: ["WZÓR"],
  stage: "decyzja",
  series: ["nie-mow-powiedz-inwestor"],
  custom_pdf: "wzor-umowy",
  title: "Wzór umowy pożyczki pod hipotekę dla inwestora",
  // Strona zapisu: jeden komunikat, bez wykładu — szczegóły są w samym PDF-ie.
  // „5–10” z łącznikiem słów (U+2060) po półpauzie, żeby nagłówek nie łamał się w środku kwoty.
  headline:
    "Pobierz wzór umowy pożyczki. Oszczędź 5–\u206010 tys. zł na kosztach kancelarii prawnej.",
  subheadline:
    "Tyle kosztuje napisanie takiej umowy od zera w kancelarii. Tu dostajesz gotowy tekst z biblioteki klauzul, z której Finance You składa prawdziwe umowy dla inwestorów.",
  // Punkty w języku korzyści i ciekawości (co w środku), nie spis paragrafów.
  benefits: [
    "Zobaczysz, jak zapisać zabezpieczenie, żeby mieć z czego odzyskać pieniądze, gdy pożyczkobiorca przestanie płacić",
    "Poznasz 3 zapisy, bez których umowa jest tylko kartką papieru – wzory z internetu zwykle ich nie mają",
    "Dowiesz się, jakich dokumentów żądać, zanim wypłacisz choćby złotówkę",
    "Sprawdzisz na przykładzie 100 000 zł, jak wygląda umowa, którą podpisują inwestorzy Finance You",
  ],
  cta_text: "Pobierz wzór umowy",
  meta_description:
    "Wzór umowy pożyczki pod hipotekę dla inwestora prywatnego z biblioteki klauzul Finance You. Pobierz i oszczędź 5–10 tys. zł na kosztach kancelarii prawnej.",
  thank_you_message:
    "Dziękujemy! Wzór jest już w Twojej skrzynce. Komplet z załącznikami 1–4 i wnioskiem składa generator umowy w programie dla inwestorów.",
  email_subject: "Twój wzór umowy pożyczki pod hipotekę: {tytul}",
  email_intro:
    "oto „{tytul}”: {link}\n\nTo sama umowa – bez załączników. Zwróć uwagę na § 2 (warunki wejścia w życie i wypłaty), § 3 (hipoteka i art. 777 k.p.c.) oraz § 7 (wypowiedzenie). Załączniki 1–4, które umowa wymienia, składa dla konkretnej transakcji generator umowy w pakiecie dokumentów programu dla inwestorów – razem z wnioskiem i wersją do e-podpisu.",
  next: { label: "Program dla inwestorów Finance You (pakiet dokumentów)", url: INVESTOR_PAGE_URL },
  pdf: {
    eyebrow: "Wzór umowy · dla inwestora prywatnego",
    subtitle:
      "Sama umowa pożyczki zabezpieczonej hipoteką – z biblioteki klauzul silnika umów Finance You, na przykładowych stronach i warunkach. Załączniki 1–4 i wniosek: zajawki w tym pliku, komplet w pakiecie dokumentów.",
    sections: [
      {
        heading: "Jak czytać ten wzór",
        blocks: [
          {
            type: "lead",
            text: "Ten dokument to tekst umowy, jaką Finance You składa dla inwestorów finansujących przedsiębiorców pod hipotekę. Nie jest napisany od zera na potrzeby materiału: pochodzi z tej samej biblioteki klauzul, z której generator umowy składa prawdziwe dokumenty do podpisu.",
          },
          {
            type: "bullets",
            items: [
              "Strony są przykładowe: Anna Inwestorska (inwestorka) i Jan Przykładowy (przedsiębiorca na jednoosobowej działalności). PESEL, NIP, numer księgi wieczystej i rachunki zastąpiono symbolami X – generator wstawia dane konkretnej transakcji.",
              "Kwoty, terminy i oprocentowanie są przykładowe: 100 000 zł kapitału, 12 rat, hipoteka i poddanie się egzekucji do 260 000 zł. Oprocentowanie przykładu jest równe odsetkom maksymalnym na dzień wydania materiału.",
              "Pożyczkodawcą jest osoba fizyczna (inwestor), pożyczkobiorcą – przedsiębiorca prowadzący jednoosobową działalność. Dla spółek, poręczycieli, współwłasności i wcześniejszych hipotek biblioteka ma osobne klauzule, które generator włącza automatycznie.",
              "Umowa wymienia cztery załączniki (1–4) i składa się ją razem z wnioskiem. W tym wzorze są tylko ich zajawki – komplet dla konkretnej transakcji daje pakiet dokumentów (opis na końcu).",
            ],
          },
          {
            type: "important",
            text: "Wzór ma charakter edukacyjny. Przed użyciem we własnej transakcji skonsultuj treść z własną kancelarią – każda umowa wymaga dopasowania do stron, nieruchomości i warunków.",
          },
        ],
      },
      {
        heading: "Na co zwrócić uwagę",
        blocks: [
          {
            type: "keyValues",
            rows: [
              [
                "§ 2 – wypłata i wejście w życie",
                "wypłata dopiero po dokumentach: oryginał umowy, wypisy aktów z żądaniem wpisu hipoteki i poddaniem się egzekucji, komplet oryginałów.",
              ],
              [
                "§ 3 – zabezpieczenia",
                "hipoteka do sumy obejmującej kapitał, odsetki i koszty; art. 777 § 1 pkt 5 k.p.c.; zakaz zbycia i dalszego obciążania bez zgody wierzyciela.",
              ],
              [
                "§ 4 – windykacja",
                "odsetki za opóźnienie, kolejność zaliczania wpłat, koszty według tabeli opłat (Załącznik nr 3).",
              ],
              [
                "§ 5 – oświadczenia",
                "status przedsiębiorcy i cel gospodarczy, stan nieruchomości, brak zaległości wobec US i ZUS, majątek osobisty, aktywna działalność.",
              ],
              [
                "§ 7 – wypowiedzenie",
                "po 14 dniach opóźnienia i przy nieprawdziwych oświadczeniach; spłata całości w 7 dni od doręczenia.",
              ],
            ],
          },
        ],
      },
    ],
    closing: {
      heading: "Co dalej?",
      text: "Komplet do podpisu – wniosek, umowę i załączniki 1–4 dla konkretnej transakcji – składa generator umowy w programie dla inwestorów Finance You. Tam też jest analiza księgi wieczystej i ocena ryzyka zabezpieczenia, harmonogram zaakceptowany przez klienta oraz obsługa spłat i windykacji.",
      actions: INVESTOR_ACTIONS,
    },
  },
});

// ── POŻYCZKOBIORCA ───────────────────────────────────────────────────────────

const bankOdmowil = defineMagnet({
  slug: "bank-odmowil-co-dalej",
  track: "pozyczkobiorca",
  keyword: "ODMOWA",
  stage: "swiadomosc",
  series: ["bank-odmowil"],
  title: "Bank odmówił? 5 dróg do finansowania firmy pod nieruchomość",
  // Nagłówek i podtytuł: jeden komunikat w języku korzyści, nie opis materiału.
  headline:
    "Bank odmówił? Pobierz przewodnik: 5 realnych dróg do finansowania firmy, gdy masz nieruchomość.",
  subheadline:
    "Odmowa banku nie zamyka tematu. Zobacz, kto zamiast banku patrzy na Twoją nieruchomość, ile realnie możesz uzyskać i jakich ofert unikać.",
  // Punkty w języku korzyści i ciekawości (co w środku), nie spis rozdziałów.
  benefits: [
    "Zrozumiesz, dlaczego bank odmówił – i które z tych powodów nie mają znaczenia, gdy masz nieruchomość",
    "Poznasz 5 dróg do finansowania firmy, z plusami, minusami i czasem, którego naprawdę wymagają",
    "Policzysz, ile możesz uzyskać pod swoją nieruchomość – wzór i przykłady do własnych liczb",
    "Zobaczysz pełny koszt bez drobnego druku: prowizja, odsetki, notariusz, wpis hipoteki",
    "Rozpoznasz 9 cech ofert, od których trzeba trzymać się z daleka",
    "Wyjdziesz z planem na 7 dni – co zrobić najpierw, żeby nie tracić czasu",
  ],
  cta_text: "Pobierz przewodnik",
  meta_description:
    "Bank odmówił finansowania firmie? Bezpłatny przewodnik: 5 dróg do finansowania pod nieruchomość, LTV na przykładach, koszty i czerwone flagi ofert.",
  thank_you_message:
    "Dziękujemy! Przewodnik wysłaliśmy też na Twój e-mail. Sprawdź od razu, ile Twoja firma może uzyskać pod nieruchomość – kalkulator ILE.",
  email_subject: "Bank odmówił? Twój przewodnik: {tytul}",
  email_intro:
    "oto przewodnik „{tytul}”: {link}\n\nZacznij od rozdziału 3 – tabela z przykładami pokazuje, ile orientacyjnie można uzyskać pod nieruchomość o danej wartości. Rozdział 5 (czerwone flagi) uchroni Cię przed ofertami, które kosztują więcej, niż dają.",
  next: { label: "Kalkulator: ile firma może uzyskać pod nieruchomość", url: TOOL_URLS.ile },
  pdf: {
    eyebrow: "Przewodnik · dla przedsiębiorcy",
    subtitle:
      "Dlaczego banki odmawiają, kto patrzy na Twoją nieruchomość, ile realnie możesz uzyskać i jakich ofert unikać.",
    sections: [
      {
        heading: "1. Dlaczego bank odmówił – i co to naprawdę znaczy",
        blocks: [
          {
            type: "lead",
            text: "Bank ocenia przede wszystkim zdolność liczoną z dochodu, historię kredytową i formalny profil firmy. Odmowa oznacza, że nie pasujesz do jego szablonu – nie, że Twoja firma nie ma zdolności do spłaty. Finansowanie pozabankowe pod nieruchomość ocenia inaczej: liczy się wartość i stan prawny zabezpieczenia, cel gospodarczy i realny plan spłaty.",
          },
          {
            type: "table",
            columns: [
              { label: "Powód odmowy w banku", width: 3 },
              { label: "Znaczenie przy finansowaniu pod nieruchomość", width: 4 },
            ],
            rows: [
              [
                "Krótka historia firmy (poniżej 12–24 miesięcy)",
                "mniejsze – liczy się zabezpieczenie i źródło spłaty",
              ],
              [
                "Zdolność liczona z dochodu (PIT / CIT)",
                "mniejsze – ocena opiera się na nieruchomości i planie spłaty",
              ],
              [
                "Wpisy w historii kredytowej, opóźnienia w przeszłości",
                "mniejsze, ale sprawdzane: ważne, czy zaległości są uregulowane",
              ],
              ["Branża uznana za ryzykowną", "zwykle nie ma znaczenia"],
              [
                "Zaległości wobec ZUS / urzędu skarbowego",
                "duże – zwykle muszą być spłacone (często z wypłaty)",
              ],
              [
                "Egzekucja komornicza z nieruchomości",
                "duże – blokuje hipotekę do czasu umorzenia postępowania",
              ],
              [
                "Nieruchomość już obciążona hipoteką",
                "zależy od LTV: liczy się łączne obciążenie, nie sama kolejna hipoteka",
              ],
            ],
          },
          {
            type: "important",
            text: "Finansowanie pozabankowe pod nieruchomość w systemie Finance You jest dla przedsiębiorców i na cel związany z działalnością gospodarczą. To nie jest obejście zasad – to inny model oceny: zamiast zdolności z dochodu liczy się zabezpieczenie, cel i plan spłaty. Decyzję podejmują finansujący.",
          },
        ],
      },
      {
        heading: "2. Pięć dróg do finansowania firmy, gdy masz nieruchomość",
        blocks: [
          {
            type: "subheading",
            text: "Droga 1: pożyczka pod hipotekę od prywatnego finansującego",
          },
          {
            type: "bullets",
            items: [
              "Dla kogo: firmy (także jednoosobowe) z nieruchomością o czytelnym stanie prawnym.",
              "Plusy: decyzja na podstawie zabezpieczenia, elastyczny harmonogram (odsetki miesięcznie, kapitał na koniec), możliwość spłaty wcześniejszych zobowiązań z wypłaty.",
              "Minusy: koszt wyższy niż kredyt bankowy, konieczny notariusz i wpis hipoteki, ryzyko utraty nieruchomości przy braku spłaty.",
              "Czas: zwykle 2–4 tygodnie od kompletu dokumentów; wpis hipoteki zależy od sądu.",
            ],
          },
          {
            type: "subheading",
            text: "Droga 2: refinansowanie drogich zobowiązań jedną pożyczką pod hipotekę",
          },
          {
            type: "bullets",
            items: [
              "Dla kogo: firmy spłacające kilka drogich zobowiązań (pożyczki obrotowe, zaległości, leasingi).",
              "Plusy: jedna rata, zwykle niższe obciążenie miesięczne, spłata wierzycieli bezpośrednio z wypłaty.",
              "Minusy: wydłużenie zadłużenia, hipoteka na nieruchomości, wymaga uporządkowanej listy wierzycieli.",
            ],
          },
          { type: "subheading", text: "Droga 3: kredyt w innym banku po uporządkowaniu sytuacji" },
          {
            type: "bullets",
            items: [
              "Dla kogo: firmy, które mogą poczekać i mają szansę poprawić profil (spłata zaległości, zamknięty rok obrotowy).",
              "Plusy: niższy koszt.",
              "Minusy: czas (zwykle 1–3 miesiące), ta sama ocena zdolności; w międzyczasie bywa potrzebna pożyczka pomostowa pod hipotekę.",
            ],
          },
          { type: "subheading", text: "Droga 4: leasing zwrotny nieruchomości" },
          {
            type: "bullets",
            items: [
              "Dla kogo: większe firmy z nieruchomością komercyjną.",
              "Plusy: wyższa kwota niż przy pożyczce, nieruchomość dalej służy firmie.",
              "Minusy: utrata własności na czas leasingu, długie procedury, skutki podatkowe (VAT, PCC), zwykle tylko duże kwoty.",
            ],
          },
          {
            type: "subheading",
            text: "Droga 5: finansowanie niezabezpieczone – faktoring, pożyczka obrotowa, środki publiczne",
          },
          {
            type: "bullets",
            items: [
              "Dla kogo: firmy z fakturami o odroczonym terminie albo potrzebą małej kwoty.",
              "Plusy: bez hipoteki, często szybciej.",
              "Minusy: małe kwoty, krótkie okresy, wysoki koszt; programy publiczne – długie nabory i konkursy.",
            ],
          },
        ],
      },
      {
        heading: "3. Ile możesz uzyskać – LTV na przykładach",
        blocks: [
          {
            type: "p",
            text: "LTV to stosunek łącznego zadłużenia zabezpieczonego na nieruchomości do jej wartości. W systemie Finance You limit LTV wynosi 60 % i obejmuje istniejące obciążenia hipoteczne. Prowizja Finance You jest potrącana z wypłaty – nie płacisz nic z góry.",
          },
          {
            type: "highlights",
            items: [
              { label: "Limit LTV w systemie", value: "60 %" },
              { label: "Opłaty z góry", value: "brak", accent: true },
              { label: "Cel finansowania", value: "gospodarczy" },
            ],
          },
          {
            type: "table",
            columns: [
              { label: "Wartość nieruchomości", width: 2, align: "right" },
              { label: "Obciążenia w dziale IV", width: 2, align: "right" },
              { label: "Maks. kwota przy LTV 60 %", width: 2, align: "right" },
              { label: "Orientacyjnie na rękę", width: 2, align: "right" },
            ],
            rows: [
              ["500 000 zł", "0 zł", "300 000 zł", "285 000 zł"],
              ["1 000 000 zł", "100 000 zł", "500 000 zł", "475 000 zł"],
              ["2 000 000 zł", "900 000 zł", "300 000 zł", "285 000 zł"],
              ["800 000 zł", "600 000 zł", "0 zł", "obciążenia powyżej limitu LTV"],
            ],
          },
          {
            type: "bullets",
            items: [
              "Maksymalna kwota = 60 % wartości nieruchomości (limit LTV) − istniejące obciążenia hipoteczne.",
              "Na rękę = kwota udzielona − prowizja Finance You (pięć procent kwoty udzielonej, nie mniej niż 5 000 zł, bez VAT).",
              "Własne liczby wpisz w kalkulatorze ILE – pełne wyliczenie przyjdzie mailem.",
            ],
          },
          {
            type: "risk",
            text: "Kwota jest orientacyjna. Finansujący ustalają ją po analizie nieruchomości, firmy i celu – mogą zaproponować mniej albo odmówić. Zabezpieczenie na nieruchomości oznacza ryzyko jej utraty przy braku spłaty.",
          },
        ],
      },
      {
        heading: "4. Koszty bez tajemnic",
        blocks: [
          {
            type: "keyValues",
            rows: [
              [
                "Prowizja Finance You",
                "pięć procent kwoty udzielonej, nie mniej niż 5 000 zł, bez VAT – potrącana z wypłaty. Przykład: kwota udzielona 100 000 zł → 5 000 zł do Finance You, 95 000 zł na rachunek firmy.",
              ],
              [
                "Odsetki dla finansującego",
                "ustalane w umowie z finansującym, zawsze w granicach odsetek maksymalnych (dwukrotność odsetek ustawowych, zależna od stopy referencyjnej NBP).",
              ],
              [
                "Notariusz",
                "taksa notarialna za akt: oświadczenie o ustanowieniu hipoteki i poddanie się egzekucji – zależna od kwoty.",
              ],
              [
                "Wpis hipoteki",
                "opłata sądowa za wpis w dziale IV księgi wieczystej oraz podatek od czynności cywilnoprawnych od ustanowienia hipoteki.",
              ],
              ["Wycena", "jeśli wymagana – wynagrodzenie rzeczoznawcy majątkowego."],
              ["Wcześniejsza spłata", "zasady w umowie – pytaj o nie przed podpisaniem, nie po."],
            ],
          },
          {
            type: "risk",
            text: "Nie płać prowizji, „opłaty za analizę” ani „rezerwacji środków” przed decyzją i przed wypłatą. W modelu Finance You prowizja jest potrącana dopiero z wypłacanej kwoty. Każdy koszt policz do całości: suma odsetek i opłat musi mieścić się w granicach odsetek maksymalnych.",
          },
        ],
      },
      {
        heading: "5. Czerwone flagi – 9 cech ofert, których unikać",
        blocks: [
          {
            type: "bullets",
            items: [
              "Opłata z góry za „analizę”, „rezerwację środków” albo „ubezpieczenie” przed wypłatą.",
              "Umowa przewłaszczenia na zabezpieczenie zamiast hipoteki, bez jasnych zasad zwrotu własności po spłacie.",
              "Brak aktu notarialnego i brak wpisu w księdze wieczystej („zaufaj nam”).",
              "Brak harmonogramu spłat na piśmie albo rata balonowa, o której dowiadujesz się na końcu.",
              "Odsetki i opłaty łącznie przekraczające odsetki maksymalne, ukryte w „opłatach administracyjnych”.",
              "Oferta skierowana do konsumentów pod zastaw mieszkania, w którym mieszkają – poza reżimem ustawy o kredycie hipotecznym.",
              "Pośrednik, który nie mówi, kto jest finansującym, i żąda prowizji przed wypłatą.",
              "Nacisk na podpisanie „od ręki”, bez czasu na przeczytanie umowy i konsultację z własnym prawnikiem.",
              "Obietnice akceptacji składane przed obejrzeniem jakichkolwiek dokumentów.",
            ],
          },
        ],
      },
      {
        heading: "6. Plan na 7 dni",
        blocks: [
          {
            type: "steps",
            items: [
              {
                title: "Dzień 1: policz i sprawdź",
                text: "Orientacyjna kwota w kalkulatorze ILE; własna księga wieczysta w EKW – działy III i IV (egzekucje, hipoteki, wzmianki).",
              },
              {
                title: "Dzień 2: opisz cel i spłatę",
                text: "Pięć zdań: na co idą środki, z czego będą spłacane odsetki i kapitał, jaki jest plan B.",
              },
              {
                title: "Dni 3–4: skompletuj dokumenty",
                text: "Checklista DOKUMENTY: firma, nieruchomość, cel, osoby. Braki uzupełnisz później, ale każdy brak to dodatkowe dni.",
              },
              {
                title: "Dzień 5: złóż bezpłatny wniosek",
                text: "Kilka minut online. Wniosek do niczego nie zobowiązuje i nic nie kosztuje.",
              },
              {
                title: "Dni 6–7: odpowiedz analitykowi",
                text: "Pytania o nieruchomość, cel i spłatę. Potem propozycje finansujących – decydujesz, czy i którą przyjąć.",
              },
            ],
          },
          { type: "subheading", text: "Najczęstsze pytania" },
          {
            type: "bullets",
            items: [
              "Czy muszę prowadzić firmę? Tak – finansowanie jest na cel gospodarczy; wystarczy jednoosobowa działalność.",
              "Czy nieruchomość musi należeć do firmy? Nie – zabezpieczeniem może być nieruchomość prywatna właściciela (dłużnik rzeczowy), za zgodą małżonka przy wspólności majątkowej.",
              "Jak szybko? Zwykle 2–4 tygodnie od kompletu dokumentów; termin wpisu hipoteki zależy od sądu.",
              "Czy mogę stracić nieruchomość? Przy braku spłaty finansujący może dochodzić należności z nieruchomości – to realne ryzyko, dlatego plan spłaty jest ważniejszy niż kwota.",
            ],
          },
        ],
      },
    ],
    closing: {
      heading: "Co dalej?",
      text: "Policz orientacyjną kwotę w kalkulatorze ILE i ratę w kalkulatorze RATA, odbierz checklistę dokumentów (hasło DOKUMENTY) i złóż bezpłatny wniosek. Analityk odezwie się z pytaniami – bez opłat i bez zobowiązań.",
      actions: BORROWER_ACTIONS,
    },
  },
});

const checklistaDokumentow = defineMagnet({
  slug: "checklista-dokumentow",
  track: "pozyczkobiorca",
  keyword: "DOKUMENTY",
  stage: "przygotowanie",
  series: ["3-bledy-finansowanie"],
  title: "Checklista dokumentów do finansowania pod zastaw nieruchomości",
  // Nagłówek i podtytuł: jeden komunikat w języku korzyści, nie opis materiału.
  headline:
    "Pobierz checklistę dokumentów. Skompletuj wszystko w 48 godzin i skróć drogę od wniosku do wypłaty.",
  subheadline:
    "Wiesz dokładnie, co przygotować dla firmy, nieruchomości i celu finansowania – i co jest naprawdę konieczne, a co tylko przyspiesza decyzję. Bez odsyłania dokumentów do poprawy.",
  // Punkty w języku korzyści i ciekawości (co w środku), nie spis rozdziałów.
  benefits: [
    "Zbierzesz komplet dokumentów w 48 godzin – wiesz dokładnie, co, skąd i w jakiej kolejności",
    "Rozróżnisz, co jest naprawdę konieczne, a co tylko przyspiesza decyzję",
    "Dostaniesz gotowe ścieżki: skąd pobrać każdy dokument online i ile to zajmuje",
    "Poznasz braki, które najczęściej wydłużają proces o tygodnie – i unikniesz ich od razu",
    "Dowiesz się, jak przygotować skany, żeby analityk nie odsyłał ich do poprawy",
  ],
  cta_text: "Pobierz checklistę",
  meta_description:
    "Bezpłatna checklista dokumentów do pożyczki pod zastaw nieruchomości dla firm: firma, nieruchomość, cel finansowania, osoby. Co jest konieczne, co przyspiesza decyzję.",
  thank_you_message:
    "Dziękujemy! Checklistę wysłaliśmy też na Twój e-mail. Gdy masz komplet, złóż bezpłatny wniosek – analityk odezwie się z pytaniami.",
  email_subject: "Twoja checklista dokumentów: {tytul}",
  email_intro:
    "oto „{tytul}”: {link}\n\nWydrukuj ją i odhaczaj. Dokumenty oznaczone (K) są konieczne, (P) przyspieszają decyzję. Wniosek możesz złożyć od razu, a braki uzupełnić – ale komplet na starcie to zwykle tydzień zaoszczędzony.",
  next: { label: "Bezpłatny wniosek o finansowanie", url: BORROWER_DEFAULT_CTA_URL },
  pdf: {
    eyebrow: "Checklista · dla przedsiębiorcy",
    subtitle:
      "Firma, nieruchomość, cel finansowania, osoby – co jest konieczne, co przyspiesza decyzję, skąd to wziąć.",
    sections: [
      {
        heading: "Jak korzystać z checklisty",
        blocks: [
          {
            type: "lead",
            text: "Finansowanie pod zastaw nieruchomości opiera się na trzech pytaniach: kto pożycza (firma), co zabezpiecza (nieruchomość) i z czego nastąpi spłata (cel i plan). Dokumenty poniżej odpowiadają na te pytania. (K) = konieczne do decyzji, (P) = przyspiesza decyzję albo podnosi kwotę.",
          },
          {
            type: "important",
            text: "Nie musisz mieć kompletu na start – wniosek składasz od razu, a braki uzupełniasz. Ale każdy brakujący dokument to dodatkowy dzień albo tydzień, bo analiza zatrzymuje się na pytaniu bez odpowiedzi.",
          },
        ],
      },
      {
        heading: "A. Firma (pożyczkobiorca)",
        blocks: [
          {
            type: "checklist",
            items: [
              "(K) Numer KRS albo wpis w CEIDG – aktualny, status „aktywna”.",
              "(K) NIP i REGON; dla spółki – umowa spółki i aktualny skład zarządu.",
              "(K) Dla spółki: uchwała wspólników / zgoda organu na zaciągnięcie pożyczki i ustanowienie hipoteki, jeśli wymaga tego umowa spółki lub przepisy.",
              "(K) Dokumenty finansowe za ostatni zamknięty rok: PIT / CIT z potwierdzeniem złożenia albo sprawozdanie finansowe; przy KPiR – podsumowanie roku.",
              "(K) Wyciągi z rachunku firmowego z ostatnich 3–6 miesięcy.",
              "(P) Zaświadczenia o niezaleganiu z urzędu skarbowego i ZUS – albo oświadczenie o zaległościach z planem ich spłaty (często z wypłaty).",
              "(P) Lista obecnych zobowiązań: kredyty, leasingi, pożyczki – wierzyciel, kwota pozostała, rata.",
              "(P) Krótki opis firmy: czym się zajmuje, od kiedy, główni klienci i dostawcy.",
            ],
          },
        ],
      },
      {
        heading: "B. Nieruchomość (zabezpieczenie)",
        blocks: [
          {
            type: "checklist",
            items: [
              "(K) Numer księgi wieczystej – analityk sprawdzi działy I–IV w EKW.",
              "(K) Podstawa nabycia: akt notarialny, postanowienie o stwierdzeniu nabycia spadku, umowa darowizny.",
              "(K) Wypis z rejestru gruntów (dla gruntów także wyrys z mapy ewidencyjnej) – ze starostwa, często online.",
              "(K) Aktualne zdjęcia: z zewnątrz, wnętrza, otoczenie, dojazd.",
              "(P) Operat szacunkowy, jeśli masz (nie starszy niż 12 miesięcy).",
              "(P) Dla gruntu: wypis z planu miejscowego albo decyzja o warunkach zabudowy.",
              "(P) Dla lokalu: zaświadczenie ze wspólnoty / spółdzielni o braku zaległości; dla spółdzielczego własnościowego prawa – zaświadczenie ze spółdzielni.",
              "(P) Umowy najmu, jeśli nieruchomość jest wynajmowana.",
              "(P) Polisa ubezpieczenia budynku.",
              "(K, gdy dotyczy) Przy istniejącej hipotece: zaświadczenie o saldzie od wierzyciela i promesa zgody na wykreślenie po spłacie.",
            ],
          },
        ],
      },
      {
        heading: "C. Cel finansowania i spłata",
        blocks: [
          {
            type: "checklist",
            items: [
              "(K) Opis celu gospodarczego: na co konkretnie idą środki (zakup maszyny, towaru, spłata zobowiązań firmy, inwestycja w nieruchomość, kapitał obrotowy pod kontrakt).",
              "(K) Źródło spłaty: z czego będą spłacane odsetki i kapitał (przychody, sprzedaż, refinansowanie bankowe) – i kiedy.",
              "(P) Dokumenty potwierdzające cel: umowa przedwstępna, faktura pro forma, kosztorys, kontrakt.",
              "(P) Preferowany harmonogram: kwota, okres, rata miesięczna czy kapitał na koniec.",
            ],
          },
          {
            type: "important",
            text: "„Na firmę” nie jest opisem celu. Finansujący chcą wiedzieć, na co idą pieniądze i skąd wrócą – konkretny opis skraca analizę bardziej niż jakikolwiek inny dokument.",
          },
        ],
      },
      {
        heading: "D. Osoby",
        blocks: [
          {
            type: "checklist",
            items: [
              "(K) Dokument tożsamości reprezentantów firmy i właścicieli nieruchomości.",
              "(K) Stan cywilny właściciela nieruchomości; przy wspólności majątkowej – dane małżonka, który podpisze oświadczenie o ustanowieniu hipoteki.",
              "(K) Współwłaściciele: zgoda każdego z nich na obciążenie nieruchomości.",
              "(P) Pełnomocnictwa notarialne, jeśli ktoś działa w zastępstwie.",
            ],
          },
        ],
      },
      {
        heading: "Skąd wziąć dokumenty i ile to trwa",
        blocks: [
          {
            type: "table",
            columns: [
              { label: "Dokument", width: 3 },
              { label: "Gdzie", width: 3 },
              { label: "Czas", width: 1.5 },
            ],
            rows: [
              ["Treść księgi wieczystej", "ekw.ms.gov.pl (po numerze księgi)", "od ręki"],
              ["Wypis z CEIDG / odpis z KRS", "ceidg.gov.pl, ekrs.ms.gov.pl", "od ręki"],
              ["Zaświadczenie o niezaleganiu – urząd skarbowy", "e-Urząd Skarbowy", "do 7 dni"],
              ["Zaświadczenie o niezaleganiu – ZUS", "PUE ZUS", "do 7 dni"],
              ["Wypis z rejestru gruntów", "starostwo / e-usługi geodezyjne", "1–14 dni"],
              ["Wypis z planu miejscowego", "urząd gminy", "do 14–30 dni"],
              ["Zaświadczenie ze wspólnoty / spółdzielni", "zarządca / administracja", "kilka dni"],
              ["Operat szacunkowy", "rzeczoznawca majątkowy", "1–2 tygodnie"],
              ["Zaświadczenie o saldzie hipoteki", "obecny wierzyciel (bank)", "kilka dni"],
            ],
          },
        ],
      },
      {
        heading: "Najczęstsze braki, które kosztują tygodnie",
        blocks: [
          {
            type: "bullets",
            items: [
              "Nieaktualna księga: wzmianka czeka na wpis, a właściciel o niej nie wie.",
              "Brak zgody małżonka albo współwłaściciela – wychodzi dopiero u notariusza.",
              "Zaległości wobec ZUS / urzędu skarbowego ujawnione na końcu zamiast na początku.",
              "Rozbieżność powierzchni między księgą a ewidencją gruntów.",
              "Nieczytelne skany, ucięte strony, zdjęcia dokumentów pod kątem.",
              "Brak konkretnego opisu celu i źródła spłaty.",
            ],
          },
          { type: "subheading", text: "Jak przygotować skany" },
          {
            type: "bullets",
            items: [
              "PDF, cały dokument w jednym pliku, wszystkie strony (także puste z pieczęcią).",
              "Nazwy plików mówiące, co jest w środku: „KRS_odpis_2026-10.pdf”, „KW_tresc_zupelna.pdf”.",
              "Dokumenty urzędowe nie starsze niż 3 miesiące; operat – do 12 miesięcy.",
              "Zdjęcia nieruchomości w pionie i poziomie, przy świetle dziennym, bez osób.",
            ],
          },
          {
            type: "risk",
            text: "Komplet dokumentów przyspiesza analizę, ale nie przesądza o decyzji – podejmują ją finansujący po ocenie nieruchomości, firmy i celu. Zabezpieczenie na nieruchomości oznacza ryzyko jej utraty przy braku spłaty.",
          },
        ],
      },
    ],
    closing: {
      heading: "Co dalej?",
      text: "Masz komplet? Złóż bezpłatny wniosek – analityk sprawdzi księgę i wartość, a Ty dostaniesz pytania tylko o to, czego brakuje. Zanim złożysz, policz orientacyjną kwotę (ILE) i ratę (RATA).",
      actions: BORROWER_ACTIONS,
    },
  },
});

const odWnioskuDoWyplaty = defineMagnet({
  slug: "od-wniosku-do-wyplaty",
  track: "pozyczkobiorca",
  keyword: "PROCES",
  stage: "decyzja",
  series: ["od-wniosku-do-wyplaty", "mit-vs-fakt"],
  title: "Od wniosku do wypłaty: mapa procesu finansowania pod hipotekę",
  // Nagłówek i podtytuł: jeden komunikat w języku korzyści, nie opis materiału.
  headline:
    "Pobierz mapę procesu. Zobacz, co dzieje się od wniosku do wypłaty i kiedy pieniądze trafią na konto firmy.",
  subheadline:
    "10 kroków z realnymi terminami, dokumentami na każdym etapie i rozliczeniem wypłaty na przykładzie. Plus 8 mitów o finansowaniu pozabankowym, które warto odłożyć.",
  // Punkty w języku korzyści i ciekawości (co w środku), nie spis rozdziałów.
  benefits: [
    "Zobaczysz całą drogę w 10 krokach – kto, co i kiedy robi, zanim pieniądze trafią na konto firmy",
    "Dowiesz się, co naprawdę dzieje się u notariusza i w sądzie wieczystoksięgowym – i ile to trwa",
    "Policzysz na przykładzie, ile z kwoty pożyczki trafi na Twoje konto po prowizji i spłacie starej hipoteki",
    "Skonfrontujesz 8 mitów o pożyczkach pozabankowych z tym, jak jest naprawdę",
    "Poznasz, co najczęściej wydłuża proces – i jak to ominąć",
  ],
  cta_text: "Pobierz mapę procesu",
  meta_description:
    "Jak wygląda finansowanie firmy pod hipotekę od wniosku do wypłaty: 10 kroków, terminy, notariusz, wpis hipoteki, rozliczenie wypłaty i mity o pożyczkach pozabankowych.",
  thank_you_message:
    "Dziękujemy! Mapę procesu wysłaliśmy też na Twój e-mail. Pierwszy krok to bezpłatny wniosek – zajmuje kilka minut i do niczego nie zobowiązuje.",
  email_subject: "Mapa procesu od wniosku do wypłaty: {tytul}",
  email_intro:
    "oto „{tytul}”: {link}\n\nNa pierwszej stronie masz cały proces w 10 krokach z typowymi terminami. Rozdział 3 pokazuje na liczbach, jak liczona jest wypłata, a rozdział 4 rozprawia się z mitami o finansowaniu pozabankowym.",
  next: { label: "Bezpłatny wniosek o finansowanie", url: BORROWER_DEFAULT_CTA_URL },
  pdf: {
    eyebrow: "Mapa procesu · dla przedsiębiorcy",
    subtitle:
      "10 kroków z typowymi terminami, notariusz i wpis hipoteki, rozliczenie wypłaty, mity i fakty.",
    sections: [
      {
        heading: "1. Cały proces w 10 krokach",
        blocks: [
          {
            type: "steps",
            items: [
              {
                title: "Bezpłatny wniosek online (10–15 minut)",
                text: "Dane firmy, nieruchomości, kwota i cel. Nie zobowiązuje i nic nie kosztuje.",
              },
              {
                title: "Wstępna analiza (1–3 dni robocze)",
                text: "Księga wieczysta, orientacyjna wartość, cel gospodarczy, LTV. Analityk zadaje pierwsze pytania.",
              },
              {
                title: "Dokumenty (2–10 dni – zależy od Ciebie)",
                text: "Komplet według checklisty DOKUMENTY: firma, nieruchomość, cel i spłata, osoby.",
              },
              {
                title: "Analiza zabezpieczenia i raport (kilka dni)",
                text: "Weryfikacja księgi, wartości, lokalizacji, zobowiązań i źródła spłaty.",
              },
              {
                title: "Propozycje finansujących (kilka dni)",
                text: "Kwota, okres, odsetki, harmonogram. Możesz odrzucić każdą – bez kosztów.",
              },
              {
                title: "Uzgodnienie umowy",
                text: "Projekt umowy pożyczki, Twoje pytania, ewentualna konsultacja z własnym prawnikiem.",
              },
              {
                title: "Notariusz",
                text: "Oświadczenie o ustanowieniu hipoteki i poddanie się egzekucji (art. 777 k.p.c.); umowa pożyczki, jeśli zawierana w tej formie. Podpisują reprezentanci firmy, właściciele nieruchomości i małżonkowie.",
              },
              {
                title: "Wniosek o wpis hipoteki",
                text: "Składa notariusz elektronicznie; w księdze pojawia się wzmianka. Sam wpis trwa od kilku dni do kilku tygodni – zależy od sądu.",
              },
              {
                title: "Wypłata",
                text: "Zgodnie z umową: po złożeniu wniosku o wpis albo po wpisie. Prowizja Finance You potrącana z kwoty; zobowiązania do spłaty (np. wcześniejsza hipoteka) przelewane bezpośrednio do wierzycieli.",
              },
              {
                title: "Spłata i zakończenie",
                text: "Odsetki według harmonogramu, kapitał w ratach albo na koniec. Po spłacie – zgoda wierzyciela na wykreślenie hipoteki (tzw. kwit mazalny) i wniosek do sądu.",
              },
            ],
          },
          {
            type: "highlights",
            items: [
              { label: "Wniosek", value: "bezpłatny" },
              { label: "Dokumenty → wypłata", value: "zwykle 2–4 tyg." },
              { label: "Prowizja", value: "dopiero z wypłaty", accent: true },
              { label: "Decyzja", value: "po stronie finansujących" },
            ],
          },
        ],
      },
      {
        heading: "2. Co dzieje się u notariusza",
        blocks: [
          {
            type: "bullets",
            items: [
              "Kto podpisuje: reprezentanci firmy (zgodnie z KRS / CEIDG), właściciele nieruchomości, małżonkowie przy wspólności majątkowej, pełnomocnicy z pełnomocnictwem notarialnym.",
              "Co zabrać: dokumenty tożsamości, odpis z KRS / wypis z CEIDG, numer księgi wieczystej, podstawę nabycia nieruchomości, uchwałę wspólników (spółki), zaświadczenie o saldzie od obecnego wierzyciela (gdy pożyczka spłaca hipotekę).",
              "Co zawiera akt: oświadczenie właściciela o ustanowieniu hipoteki do określonej sumy na rzecz finansującego, poddanie się egzekucji co do kapitału i odsetek (art. 777 § 1 pkt 4–5 k.p.c.), wniosek o wpis do księgi wieczystej.",
              "Co płacisz przy akcie: taksę notarialną, opłatę sądową za wpis hipoteki i podatek od czynności cywilnoprawnych od ustanowienia hipoteki (kwoty zależne od rodzaju wpisu i wartości).",
              "Czego oczekiwać: notariusz odczytuje akt w całości – pytaj o każdy zapis, którego nie rozumiesz, zanim podpiszesz.",
            ],
          },
          {
            type: "important",
            text: "Poddanie się egzekucji oznacza, że przy braku spłaty finansujący może uzyskać klauzulę wykonalności bez procesu sądowego. To standard w pożyczkach pod hipotekę – i powód, dla którego plan spłaty trzeba mieć przed podpisaniem, nie po.",
          },
        ],
      },
      {
        heading: "3. Jak liczona jest wypłata",
        blocks: [
          {
            type: "table",
            columns: [
              { label: "Pozycja", width: 4 },
              { label: "Kwota", width: 2, align: "right" },
            ],
            rows: [
              ["Kwota udzielona (z umowy)", "300 000 zł"],
              ["Prowizja Finance You – potrącana z wypłaty", "–15 000 zł"],
              ["Spłata wcześniejszej hipoteki – przelew bezpośrednio do banku", "–120 000 zł"],
              ["Na rachunek firmy", "165 000 zł"],
            ],
          },
          {
            type: "bullets",
            items: [
              "Prowizja Finance You to pięć procent kwoty udzielonej, nie mniej niż 5 000 zł, bez VAT – nie ma opłat z góry.",
              "Odsetki dla finansującego są w harmonogramie, nie w wypłacie – płacisz je według umowy.",
              "Koszty notariusza i wpisu hipoteki płacisz przy akcie, poza wypłatą.",
              "Zobowiązania spłacane z wypłaty idą bezpośrednio do wierzycieli – to warunek wykreślenia ich hipotek.",
            ],
          },
        ],
      },
      {
        heading: "4. Mit vs fakt",
        blocks: [
          {
            type: "table",
            columns: [
              { label: "Mit", width: 3 },
              { label: "Fakt", width: 5 },
            ],
            rows: [
              [
                "Pożyczka pozabankowa to lichwa.",
                "Odsetki mają ustawowy limit (odsetki maksymalne), który obowiązuje każdego pożyczkodawcę. Sprawdź, czy wszystkie opłaty razem mieszczą się w limicie.",
              ],
              [
                "Jeśli spóźnię się z ratą, od razu stracę nieruchomość.",
                "Egzekucja z nieruchomości to procedura sądowo-komornicza, która trwa i zaczyna się od wezwań i próby ugody. Ale opóźnienie kosztuje (odsetki za opóźnienie) i może zakończyć się utratą nieruchomości.",
              ],
              [
                "To tylko dla dużych firm.",
                "Wystarczy jednoosobowa działalność gospodarcza i cel związany z firmą.",
              ],
              [
                "Liczy się tylko historia kredytowa.",
                "Historia ma mniejsze znaczenie niż zabezpieczenie, cel i plan spłaty. Ale aktualne zaległości wobec ZUS / urzędu skarbowego i egzekucje mają znaczenie duże.",
              ],
              [
                "Pieniądze w 24 godziny.",
                "Realnie: tygodnie. Akt notarialny i wniosek o wpis hipoteki wymagają czasu. Obietnice „jutro na koncie” to sygnał ostrzegawczy.",
              ],
              [
                "Nieruchomość musi należeć do firmy.",
                "Zabezpieczeniem może być nieruchomość prywatna właściciela (dłużnik rzeczowy) – za zgodą małżonka i współwłaścicieli.",
              ],
              [
                "Trzeba zapłacić z góry za analizę.",
                "W modelu Finance You nie ma opłat z góry: prowizja jest potrącana z wypłaty. Opłaty wstępne to czerwona flaga.",
              ],
              [
                "Cel nie ma znaczenia.",
                "Finansowanie jest wyłącznie na cel gospodarczy – i jest to sprawdzane. Dla konsumentów obowiązują inne przepisy.",
              ],
            ],
          },
        ],
      },
      {
        heading: "5. Co wydłuża proces – i co go skraca",
        blocks: [
          { type: "subheading", text: "Wydłuża" },
          {
            type: "bullets",
            items: [
              "Wzmianki i nieuporządkowane wpisy w księdze wieczystej.",
              "Brak zgody małżonka albo współwłaściciela ujawniony u notariusza.",
              "Zaległości publicznoprawne bez planu spłaty.",
              "Dokumenty dosyłane po jednym, nieczytelne skany.",
              "Cel opisany ogólnikowo („na firmę”).",
            ],
          },
          { type: "subheading", text: "Skraca" },
          {
            type: "bullets",
            items: [
              "Komplet dokumentów z checklisty DOKUMENTY na starcie.",
              "Własny odczyt księgi wieczystej przed wnioskiem (działy III i IV).",
              "Konkretny cel i źródło spłaty w kilku zdaniach.",
              "Szybkie odpowiedzi na pytania analityka.",
              "Zaświadczenia o saldzie od obecnych wierzycieli zamówione od razu.",
            ],
          },
          {
            type: "risk",
            text: "Terminy w tej mapie są typowe, nie gwarantowane – nie zależą wyłącznie od Finance You (sąd wieczystoksięgowy, urzędy, wierzyciele). Decyzję o finansowaniu podejmują finansujący, a zabezpieczenie na nieruchomości oznacza ryzyko jej utraty przy braku spłaty.",
          },
        ],
      },
    ],
    closing: {
      heading: "Co dalej?",
      text: "Pierwszy krok to bezpłatny wniosek – kilka minut online, bez zobowiązań. Zanim go złożysz, policz orientacyjną kwotę (kalkulator ILE) i ratę przy własnych założeniach (kalkulator RATA).",
      actions: BORROWER_ACTIONS,
    },
  },
});

// ── Katalog i rejestr haseł ──────────────────────────────────────────────────

export const LEAD_MAGNET_CATALOG: readonly LeadMagnetBlueprint[] = [
  startInwestora,
  checklistaKsiegi,
  bledyInwestora,
  wzorUmowyPozyczki,
  bankOdmowil,
  checklistaDokumentow,
  odWnioskuDoWyplaty,
];

export function catalogBySlug(slug: string): LeadMagnetBlueprint | null {
  return LEAD_MAGNET_CATALOG.find((m) => m.slug === slug) ?? null;
}

export function catalogForTrack(track: Track): LeadMagnetBlueprint[] {
  return LEAD_MAGNET_CATALOG.filter((m) => m.track === track);
}

/** Porównanie haseł „po ludzku” (wielkość liter, polskie znaki). */
function keywordKey(k: string): string {
  return k.toLocaleLowerCase("pl").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l").trim();
}

export type KeywordTarget =
  | { kind: "catalog"; slug: string; title: string; name: string; path: string; track: Track }
  | { kind: "tool"; slug: string; title: string; name: string; path: string; track: Track };

/**
 * Hasło z komentarza / serii rolek → materiał (katalog albo kalkulator).
 * `name` to forma do zdania „Skomentuj HASŁO, a wyślę Ci …”.
 */
export function resolveKeywordTarget(keyword: string | null | undefined): KeywordTarget | null {
  const key = keywordKey(String(keyword ?? ""));
  if (!key) return null;
  for (const m of LEAD_MAGNET_CATALOG) {
    if (m.keywords.some((k) => keywordKey(k) === key)) {
      return {
        kind: "catalog",
        slug: m.slug,
        title: m.title,
        name: keywordName(m),
        path: `/pobierz/${m.slug}`,
        track: m.track,
      };
    }
  }
  for (const c of STARTER_CALCULATORS) {
    if (keywordKey(c.keyword) === key) {
      return {
        kind: "tool",
        slug: c.slug,
        title: c.title,
        name: `kalkulator „${c.title}”`,
        path: `/narzedzie/${c.slug}`,
        track: c.track,
      };
    }
  }
  return null;
}

function keywordName(m: LeadMagnetBlueprint): string {
  if (m.slug.startsWith("checklista")) return `checklistę „${m.title}”`;
  if (m.slug.startsWith("wzor")) return `wzór „${m.title}”`;
  if (m.slug === "od-wniosku-do-wyplaty") return `mapę procesu „${m.title}”`;
  return `przewodnik „${m.title}”`;
}

// ── Wiersz lead_magnets i tekst do kontroli ──────────────────────────────────

/** Wiersz `lead_magnets` dla materiału z katalogu (bez id / created_by). */
export function catalogMagnetRow(
  m: LeadMagnetBlueprint,
  publish: boolean,
  /** Plik wgrany do Storage przez provisioning; bez niego PDF powstaje w locie (awaryjnie). */
  file: { path: string; size: number } | null = null,
) {
  return {
    slug: m.slug,
    title: m.title,
    audience: m.audience,
    headline: m.headline,
    subheadline: m.subheadline,
    benefits: m.benefits,
    cta_text: m.cta_text,
    cover_image_url: null,
    og_image_url: null,
    meta_description: m.meta_description,
    // Plik PDF w buckecie `lead-magnets` (catalogFilePath). Bez pliku trasa
    // pobierania składa PDF w locie — tylko awaryjnie, do czasu wgrania.
    file_path: file?.path ?? null,
    file_url: null,
    file_name: m.file_name,
    file_size: file?.size ?? null,
    mime_type: "application/pdf",
    thank_you_message: m.thank_you_message,
    instant_download: true,
    email_subject: m.email_subject,
    email_body: m.email_body,
    subscriber_tags: m.subscriber_tags,
    create_crm_lead: false,
    trigger_keywords: m.keywords,
    match_any_post: false,
    email_in_dm_platforms: ["instagram"],
    published: publish,
  };
}

function blockText(b: PdfBlock): string[] {
  switch (b.type) {
    case "lead":
    case "p":
    case "subheading":
    case "important":
    case "risk":
      return [b.text];
    case "bullets":
    case "checklist":
      return b.items;
    case "steps":
      return b.items.flatMap((s) => [s.title, s.text ?? ""]);
    case "table":
      return [b.columns.map((c) => c.label).join(" | "), ...b.rows.map((r) => r.join(" | "))];
    case "keyValues":
      return b.rows.map(([k, v]) => `${k}: ${v}`);
    case "highlights":
      return b.items.map((h) => `${h.label}: ${h.value}`);
  }
}

/** Cały tekst PDF-u (okładka, sekcje, zakończenie, stopka) — do compliance i testów fontu. */
export function catalogPdfText(m: LeadMagnetBlueprint): string {
  const out: string[] = [m.pdf.eyebrow, m.title, m.pdf.subtitle, ...m.benefits];
  for (const s of m.pdf.sections) {
    out.push(s.heading);
    for (const b of s.blocks) out.push(...blockText(b));
  }
  out.push(m.pdf.closing.heading, m.pdf.closing.text);
  for (const a of m.pdf.closing.actions) out.push(`${a.label}: ${a.url}`);
  out.push(...catalogFooterLines(m));
  return out.filter(Boolean).join("\n");
}

/** Stopka PDF: ryzyko, nadawca, AI, kontakt, wersja. */
export function catalogFooterLines(m: LeadMagnetBlueprint): string[] {
  return [
    RISK_LINES[m.track],
    SENDER_LINE,
    AI_MATERIAL_LINE,
    `${COMPANY_DATA.legalName}, ${COMPANY_DATA.addressFull} · NIP ${COMPANY_DATA.nip} · ${COMPANY_DATA.email} · ${COMPANY_DATA.phone.display} · ${COMPANY_DATA.website}`,
    `Wersja materiału ${CATALOG_VERSION}. Stan przepisów i parametrów systemu na dzień wydania.`,
  ];
}

/** Tekst strony /pobierz/<slug> (nagłówki, korzyści, CTA, podziękowanie). */
export function catalogPageText(m: LeadMagnetBlueprint): string {
  return [
    m.title,
    m.headline,
    m.subheadline,
    ...m.benefits,
    m.cta_text,
    m.meta_description,
    m.thank_you_message,
  ].join("\n");
}
