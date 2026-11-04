// Bot blogowy. Harmonogram (od 2026-11): co tydzień PORADNIK evergreen pod konkretną
// frazę z listy EVERGREEN_GUIDES (linkuje do strony produktu), co dwa tygodnie
// PRZEGLĄD prawno-rynkowy ze świeżych newsów (Google News RSS → briefing AI).
// Codzienne komentarze rynkowe wyłączone: w Search Console miały po kilka
// wyświetleń, szybko się starzały i powielały się nawzajem.
//
// Cron może wołać tick codziennie albo raz w tygodniu — o tym, co publikować,
// decyduje data ostatniej publikacji danego rodzaju (isDue), nie dzień tygodnia.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { PostKind } from "./seo/blog-schedule";
import { parseRssItems, type RssItem } from "@/lib/pr/core";
import { AI_MODEL_PRO, lovableAiJson } from "@/lib/lovable-ai.server";
import {
  currentDateContextPl,
  fixStaleYearInTitle,
  weekRangePl,
} from "@/lib/autopilot/date-context";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

async function ensureUniqueSlug(base: string): Promise<string> {
  const slug = base;
  let i = 0;
  while (true) {
    const candidate = i === 0 ? slug : `${slug}-${i}`;
    const { data } = await supabaseAdmin
      .from("ai_seo_articles")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
    i++;
    if (i > 100) throw new Error("unique slug failed");
  }
}

interface NewsBrief {
  summary: string;
  citations: { url: string; title?: string }[];
}

type Audience = "borrower" | "investor";
export type BlogTickKind = PostKind;

async function nextReviewTopic(): Promise<string> {
  const { data } = await supabaseAdmin
    .from("ai_seo_articles")
    .select("review_topic:raw_ai_output->>review_topic,published_at")
    .eq("source", "ai_autopilot")
    .not("raw_ai_output->>review_topic", "is", null)
    .order("published_at", { ascending: false })
    .limit(REVIEW_TOPICS.length * 2);
  return pickReviewTopic(((data ?? []) as any[]).map((r) => r.review_topic ?? undefined));
}

type NewsKind = Exclude<PostKind, "evergreen_guide">;

function audienceOf(kind: PostKind): Audience {
  if (kind === "borrower_news" || kind === "evergreen_guide") return "borrower";
  if (kind === "legal_market_monitor") return "borrower"; // regulacje/sądy/komornicy dotykają głównie właścicieli nieruchomości i pożyczkobiorców
  return "investor";
}

const BRIEFS: Record<NewsKind, { sys: string; user: string }> = {
  borrower_news: {
    sys: "Jesteś analitykiem rynku finansowego w Polsce. Po polsku. Zwięźle.",
    user: "Wypisz 5 najważniejszych wiadomości z ostatnich 24h istotnych dla OSOBY POŻYCZAJĄCEJ pod zastaw nieruchomości w PL: stopy procentowe (RPP), WIBOR/inflacja, ceny mieszkań i nieruchomości w PL, sytuacja na rynku kredytów hipotecznych, regulacje konsumenckie (UOKiK, KNF), wyroki istotne dla kredytobiorców. Dla każdej wiadomości: 2-3 zdania z konkretem (liczby/data). Po liście dodaj 'KONTEKST_POŻYCZKOBIORCY:' i jeden akapit (4-6 zdań) co to oznacza dla osoby rozważającej pożyczkę pozabankową pod zastaw mieszkania/domu/działki.",
  },
  investor_news: {
    sys: "Jesteś analitykiem rynku finansowego w Polsce. Po polsku. Zwięźle.",
    user: "Wypisz 5 najważniejszych wiadomości z ostatnich 24h istotnych dla INWESTORA prywatnego w PL: stopy procentowe (RPP, FED, EBC), kurs PLN/EUR/USD, WIG20, S&P 500, ropa, złoto, BTC/ETH, ceny nieruchomości komercyjnych i mieszkaniowych w PL, alternatywne klasy aktywów (pożyczki prywatne, crowdfunding nieruchomościowy), regulacje wpływające na inwestowanie. Dla każdej wiadomości: 2-3 zdania z konkretem (liczby/data). Po liście dodaj 'KONTEKST_INWESTORSKI:' i jeden akapit (4-6 zdań) co to oznacza dla inwestora prywatnego, w szczególności rozważającego inwestowanie w pożyczki pod zastaw nieruchomości w PL (oczekiwana stopa zwrotu, ryzyko, dywersyfikacja).",
  },
  investor_review: {
    sys: "Jesteś senior analitykiem inwestycyjnym dla polskiego inwestora prywatnego (HNW, 100k–2M PLN kapitału). Po polsku, konkretnie, bez clickbaitu.",
    user: "Zbierz AKTUALNE (ostatnie 30 dni) dane do PRZEGLĄDU INWESTYCYJNEGO porównującego klasy aktywów dostępne dla polskiego inwestora prywatnego. TEMAT PORÓWNANIA: {{REVIEW_TOPIC}}. Dla tego porównania zwróć KONKRETNE LICZBY z ostatnich 30 dni: oprocentowanie / oczekiwana stopa zwrotu netto (po podatku Belki gdzie dotyczy), minimalny ticket, horyzont, płynność, ryzyko (1-5 + uzasadnienie), zabezpieczenie, opodatkowanie. Podaj źródła (URL) dla KAŻDEJ liczby. Na końcu dodaj 'WNIOSEK_DLA_INWESTORA:' z akapitem rekomendacji dywersyfikacyjnej.",
  },
  legal_market_monitor: {
    sys: "Jesteś analitykiem prawno-rynkowym monitorującym polski rynek nieruchomości i finansów. Po polsku, konkretnie, bez spekulacji poza to co wynika ze źródeł.",
    user: "Zbierz z ostatnich 7 dni KONKRETNE wiadomości (z datą, źródłem, liczbami) o zmianach lub propozycjach zmian mających wpływ na polski rynek nieruchomości i finansów. Obejmij WSZYSTKIE z poniższych obszarów, przynajmniej po 1 wiadomości z każdego jeśli są dostępne:\n(A) LEGISLACJA PL: projekty ustaw i rozporządzeń (Sejm/Senat/MS/MF/MRiT) dot. kredytów hipotecznych, pożyczek konsumenckich, ustawy antylichwiarskiej, wakacji kredytowych, WIBOR/WIRON, podatku PCC/od nieruchomości, planowania przestrzennego, najmu instytucjonalnego, spółdzielni;\n(B) SĄDY I ORZECZNICTWO: wyroki SN, TSUE, sądów apelacyjnych dot. kredytów (frankowicze, WIBOR, sankcja kredytu darmowego), egzekucji z nieruchomości, hipoteki, ksiąg wieczystych;\n(C) KOMORNICY I EGZEKUCJA: zmiany w ustawie o komornikach, opłatach egzekucyjnych, licytacjach nieruchomości (nowe zasady, statystyki KRK/KIRP);\n(D) ADWOKATURA / RADCOWIE PRAWNI / NOTARIUSZE: uchwały NRA/KRRP/KRN, stawki taksy notarialnej, zmiany zawodowe wpływające na obsługę transakcji nieruchomościowych;\n(E) REGULATORZY: KNF, UOKiK, UODO, NBP/RPP — komunikaty i decyzje dot. kredytów, pożyczek pozabankowych, deweloperów, DFG;\n(F) RYNEK NIERUCHOMOŚCI PL: dane GUS/AMRON/Otodom/Rynek Pierwotny — ceny mkw. w 7 największych miastach, liczba transakcji, oferta, mediana czasu sprzedaży;\n(G) ŚWIATOWE RYNKI: decyzje FED/EBC, kurs USD/EUR/PLN, ceny surowców (ropa, gaz, złoto), sytuacja na rynkach nieruchomości w DE/US/UK — TYLKO gdy da się wskazać konkretny mechanizm przełożenia na PL (koszt pieniądza, kapitał zagraniczny, ceny materiałów budowlanych).\n\nDla KAŻDEJ pozycji: data, źródło (URL), 3-4 zdania faktów + 1 zdanie 'MOŻLIWY WPŁYW:' z konkretnym przełożeniem na polski rynek nieruchomości / rynek pożyczek pod zastaw / właściciela nieruchomości. NIE spekuluj poza to co da się wyprowadzić z faktu. Jeżeli w danym obszarze nie ma nowości — napisz jawnie 'brak istotnych zdarzeń w ostatnich 7 dniach'.",
  },
};

// Zapytania do Google News (RSS) na każdy rodzaj wpisu. Operator `when:` ogranicza
// świeżość: 1d dla newsów dnia, 7d dla przeglądu tygodnia, 30d dla przeglądu inwestycyjnego.
const NEWS_QUERIES: Record<NewsKind, { when: string; queries: string[] }> = {
  borrower_news: {
    when: "1d",
    queries: [
      "stopy procentowe RPP",
      "WIBOR inflacja",
      "ceny mieszkań",
      "kredyty hipoteczne",
      "UOKiK KNF kredytobiorcy",
    ],
  },
  investor_news: {
    when: "1d",
    queries: [
      "RPP stopy procentowe",
      "kurs złotego EUR USD",
      "WIG20 giełda",
      "złoto ropa bitcoin",
      "rynek nieruchomości inwestycje",
    ],
  },
  investor_review: {
    when: "30d",
    queries: [
      "obligacje skarbowe oprocentowanie",
      "lokaty oprocentowanie ranking",
      "crowdfunding nieruchomościowy",
      "rentowność najmu mieszkań",
      "obligacje korporacyjne Catalyst",
    ],
  },
  legal_market_monitor: {
    when: "7d",
    queries: [
      "projekt ustawy kredyty hipoteczne",
      "wyrok SN TSUE kredyt",
      "komornicy licytacje nieruchomości",
      "notariusze taksa notarialna",
      "KNF UOKiK komunikat",
      "ceny mieszkań GUS transakcje",
      "Fed EBC stopy procentowe",
    ],
  },
};

async function fetchNewsItems(kind: NewsKind): Promise<RssItem[]> {
  const cfg = NEWS_QUERIES[kind];
  const batches = await Promise.all(
    cfg.queries.map(async (q) => {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${q} when:${cfg.when}`)}&hl=pl&gl=PL&ceid=PL:pl`;
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "FinanceYou-Blog-Autopilot/1.0 (+https://financeyou.pl)" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return [];
        return parseRssItems(await res.text(), `Google News: ${q}`).slice(0, 8);
      } catch {
        return [];
      }
    }),
  );
  const seen = new Set<string>();
  const out: RssItem[] = [];
  for (const it of batches.flat()) {
    const key = it.title.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out.slice(0, 40);
}

async function fetchFreshNewsBrief(kind: NewsKind, reviewTopic?: string): Promise<NewsBrief> {
  const base = BRIEFS[kind];
  const b = {
    ...base,
    user: base.user.replace("{{REVIEW_TOPIC}}", reviewTopic ?? REVIEW_TOPICS[0]),
  };
  const items = await fetchNewsItems(kind);
  if (items.length === 0) throw new Error("Google News RSS: brak świeżych wiadomości");
  const list = items
    .map(
      (it, i) =>
        `[${i + 1}] ${it.publishedAt?.slice(0, 10) ?? "b.d."} | ${it.source} | ${it.title}${it.snippet ? ` — ${it.snippet}` : ""} | ${it.url}`,
    )
    .join("\n");
  const parsed = await lovableAiJson<{ summary?: string; used?: number[] }>({
    model: AI_MODEL_PRO,
    system: `${b.sys} Pracujesz WYŁĄCZNIE na podanej liście wiadomości — nie dopisuj faktów, liczb ani dat spoza niej. Odpowiadasz JSON-em.`,
    user: `${b.user}

WIADOMOŚCI (nagłówki z Google News, numerowane):
${list}

Zwróć JSON: { "summary": "<briefing w formacie opisanym wyżej; przy każdej pozycji podaj datę, źródło i numer [n]>", "used": [<numery wykorzystanych wiadomości>] }`,
    temperature: 0.2,
  });
  const summary = String(parsed?.summary ?? "").trim();
  if (!summary) throw new Error("AI: pusty briefing");
  const used = Array.isArray(parsed?.used)
    ? parsed.used.map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= items.length)
    : [];
  const picked = (used.length ? used.map((n) => items[n - 1]) : items).slice(0, 8);
  return {
    summary,
    citations: picked.map((it) => ({ url: it.url, title: it.title })),
  };
}

interface RelatedArticle {
  slug: string;
  title: string;
  primary_keyword: string | null;
}

/** Próg podobieństwa tytułów (Jaccard), od którego nowy wpis uznajemy za duplikat. */
const DUPLICATE_TITLE_THRESHOLD = 0.6;

async function recentArticleTitles(): Promise<{ slug: string; title: string }[]> {
  const { data } = await supabaseAdmin
    .from("ai_seo_articles")
    .select("slug,title")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(80);
  return (data ?? []) as { slug: string; title: string }[];
}

async function pickInternalLinks(): Promise<RelatedArticle[]> {
  const { data } = await supabaseAdmin
    .from("ai_seo_articles")
    .select(
      "slug,title,primary_keyword,published_at,merged_into:raw_ai_output->>merged_into,noindex:raw_ai_output->noindex",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(120);
  // Linkujemy tylko do artykułów, które mają być w Google.
  const list = ((data ?? []) as any[])
    .filter((r) => isIndexable({ merged_into: r.merged_into, noindex: r.noindex }, r.slug))
    .map((r) => ({
      slug: r.slug,
      title: r.title,
      primary_keyword: r.primary_keyword,
    })) as RelatedArticle[];
  // pick 3 random
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, 3);
}

/**
 * Wspólne zasady stylu, SEO i zgodności z serwisem dla KAŻDEGO artykułu
 * generowanego na blog. Komunikacja zwrotów: realne stopy zwrotu inwestorów
 * na rynku prywatnych pożyczek pod zastaw nieruchomości komunikujemy jako
 * przedział od kilkunastu do nawet kilkudziesięciu procent rocznie — bez
 * gwarantowania wyniku i zawsze z zastrzeżeniem ryzyka.
 */
const STYLE_GUIDE = `ZASADY STYLU, SEO I ZGODNOŚCI Z SERWISEM (obowiązkowe):
- Ton jak w serwisie financeyou.pl: rzeczowy, ekspercki, konkretny; bez wykrzykników i sensacji; akapity 2-3 zdania; struktura H2/H3; listy tam, gdzie poprawiają skanowalność.
- SEO: fraza główna (primary_keyword) w tytule, w pierwszym akapicie i w co najmniej jednym H2; meta_title do 60 znaków z frazą główną; meta_description 140-155 znaków z frazą główną i konkretną korzyścią; excerpt 1-2 zdania.
- LINKI WEWNĘTRZNE: wpleć 2-3 linki do podanych artykułów bloga oraz dokładnie 1 CTA do strony ścieżki. Używaj WYŁĄCZNIE tych adresów serwisu: https://financeyou.pl/dla-klienta (finansowanie dla klienta), https://financeyou.pl/dla-inwestora (program partnerski dla inwestorów: szkolenie i narzędzia), https://financeyou.pl/oferty (aktualne oferty pożyczek), https://financeyou.pl/blog/... (artykuły) oraz strona produktu lub narzędzia wskazana w zadaniu (jeśli jest). NIGDY nie linkuj do /klient ani /inwestor — to panele wymagające logowania.
- ZWROTY Z INWESTYCJI (spójna komunikacja Finance You): NIE podawaj stóp zwrotu, oprocentowania ani łącznej wartości kapitału jako obietnicy lub typowego wyniku. Opisuj mechanizm (odsetki od pożyczki zabezpieczonej hipoteką, decyzja i ryzyko po stronie inwestora). Liczby rynkowe (stopy NBP, inflacja, oprocentowanie lokat, obligacji) przytaczaj wyłącznie ze źródeł briefingu z podanym źródłem. ZAKAZANE: "gwarantowany zysk/zwrot", "pewny zysk", "bez ryzyka", "zarobisz X%". Zawsze zaznacz, że wynik zależy od parametrów konkretnej transakcji.
- W artykułach inwestorskich zaznacz, że inwestowanie wiąże się z ryzykiem, w tym utraty części lub całości kapitału, a decyzja należy do inwestora. W artykułach pożyczkowych zaznacz, że kalkulacje są orientacyjne, zgłoszenie jest bezpłatne, a decyzja o finansowaniu należy do finansujących.`;

/**
 * Frazy niedozwolone w opublikowanym artykule — niespójne z komunikacją
 * serwisu (serwis nie gwarantuje zysku ani finansowania). Wykrycie nie
 * blokuje publikacji (na stronie artykułu i tak renderujemy notę prawną),
 * ale zostawia ostrzeżenie w ai_growth_action_log do ręcznego przeglądu.
 */
const BANNED_CLAIMS: RegExp[] = [
  /gwarantowan\w*\s+(zysk|zwrot|stop\w*|oprocentowani\w*)/i,
  /(zysk|zwrot)\s+gwarantowan\w*/i,
  /pewn\w*\s+zysk/i,
  /bez\s+(żadnego\s+)?ryzyka/i,
  /zarobisz\s+\d/i,
  /gwarancj\w*\s+(zysku|zwrotu)/i,
];

export function findBannedClaims(md: string): string[] {
  const found: string[] = [];
  for (const re of BANNED_CLAIMS) {
    const m = md.match(re);
    if (m) found.push(m[0]);
  }
  return found;
}

interface ArticleDraft {
  title: string;
  meta_title: string;
  meta_description: string;
  excerpt: string;
  content_md: string;
  primary_keyword: string;
  keywords: string[];
  cover_prompt: string;
  cover_alt: string;
}

async function writeArticleFromNews(
  brief: NewsBrief,
  internal: RelatedArticle[],
  kind: PostKind,
  recentTitles: string[] = [],
): Promise<ArticleDraft> {
  const audience = audienceOf(kind);

  const internalList = internal
    .map(
      (a) =>
        `- [${a.title}](/blog/${a.slug})${a.primary_keyword ? ` — kw: ${a.primary_keyword}` : ""}`,
    )
    .join("\n");
  const externalList = brief.citations
    .map((c) => (c.title ? `- ${c.title}: ${c.url}` : `- ${c.url}`))
    .join("\n");

  const structureHint =
    kind === "investor_review"
      ? "Markdown, 1100-1700 słów. Struktura: krótki lead (problem inwestora), H2 'Porównywane klasy aktywów' (lista), H2 'Tabela porównawcza' (markdown table z kolumnami: Klasa aktywów | Oczekiwana stopa zwrotu netto | Min. ticket | Horyzont | Płynność | Ryzyko 1-5 | Zabezpieczenie | Podatek), H2 'Analiza' (po jednym akapicie na każdą klasę z LICZBAMI z briefingu), H2 'Dla kogo która opcja', H2 'Wnioski i rekomendacja dywersyfikacji', H2 'Linki i źródła', FAQ (3 Q&A). WPLEĆ 2-3 linki wewnętrzne. ZAWSZE podawaj liczby z briefingu, NIGDY nie wymyślaj."
      : kind === "legal_market_monitor"
        ? "Markdown, 1000-1500 słów. Format PRZEGLĄDU TYGODNIA. Struktura: krótki lead (1 akapit — co najważniejszego wydarzyło się w minionym tygodniu na styku prawa, sądów i rynku nieruchomości w PL), H2 'Legislacja i regulatorzy' (Sejm/Senat/MS/MF/KNF/UOKiK — pod-punkty z datą + źródło + 'Możliwy wpływ:'), H2 'Sądy i orzecznictwo' (SN/TSUE/apelacyjne — j.w.), H2 'Komornicy i egzekucja z nieruchomości', H2 'Notariat, adwokatura i radcowie prawni', H2 'Rynek nieruchomości w Polsce' (dane z GUS/AMRON/Otodom — liczby, miasta), H2 'Świat → Polska' (FED/EBC/USD/EUR/surowce — wyłącznie z konkretnym mechanizmem przełożenia na PL), H2 'Podsumowanie tygodnia — co to zmienia dla właściciela nieruchomości i pożyczkobiorcy' (2-3 akapity), H2 'Linki i źródła', FAQ (3 Q&A). WPLEĆ 2-3 linki wewnętrzne. KAŻDA teza musi mieć źródło z briefingu — NIE dopisuj zdarzeń spoza briefingu. Jeżeli w danej sekcji brief mówi 'brak zdarzeń', napisz to jawnie."
        : "Markdown, 700-1100 słów. Struktura: krótki lead, H2 'Co się stało', H2 'Co to znaczy dla inwestora', H2 'Co to znaczy dla osób z nieruchomością', H2 'Linki i źródła', FAQ (3 Q&A). WPLEĆ naturalnie 2-3 linki wewnętrzne z podanej listy. NA KOŃCU 'Linki i źródła' wymień zewnętrzne źródła.";

  let audienceBrief: string;
  if (kind === "investor_review") {
    audienceBrief = `GRUPA DOCELOWA: INWESTOR PRYWATNY (HNW, 100k–2M PLN kapitału) szukający OBIEKTYWNEGO PRZEGLĄDU I PORÓWNANIA klas aktywów. Pisz analitycznie, jak rzetelny analityk inwestycyjny — nie sprzedażowo. Pożyczki pod zastaw nieruchomości pokaż jako JEDNĄ z opcji, z plusami I minusami. CTA do "[zostań partnerem Finance You](https://financeyou.pl/dla-inwestora)" wpleć dyskretnie 1 raz na końcu sekcji wniosków.`;
  } else if (kind === "legal_market_monitor") {
    audienceBrief = `GRUPA DOCELOWA: WŁAŚCICIEL NIERUCHOMOŚCI, POŻYCZKOBIORCA, PROFESJONALIŚCI RYNKU (pośrednicy, doradcy, prawnicy) śledzący zmiany w prawie i sytuację rynkową. Styl newsroom / przegląd prawny — rzeczowo, bez sensacji, KAŻDA teza z datą i źródłem, KAŻDA sekcja kończy się zdaniem "Możliwy wpływ:" z konkretnym mechanizmem przełożenia na rynek nieruchomości / rynek pożyczek pod zastaw. Pisz tak, żeby czytelnik po lekturze wiedział, czy sytuacja jest dla niego korzystna, neutralna czy niekorzystna i dlaczego. CTA do "[sprawdź bezpłatnie możliwości finansowania](https://financeyou.pl/dla-klienta)" wpleć dyskretnie 1 raz w podsumowaniu.`;
  } else if (audience === "investor") {
    audienceBrief = `GRUPA DOCELOWA: INWESTOR PRYWATNY rozważający lokowanie kapitału w pożyczki pod zastaw nieruchomości (mechanizm zarabiania na odsetkach jak bank, zabezpieczenie hipoteczne, ryzyko, dywersyfikacja – BEZ podawania stóp zwrotu jako obietnicy). Pisz językiem inwestycyjnym, bez infantylizowania. CTA do "[zostań partnerem Finance You](https://financeyou.pl/dla-inwestora)" wpleć 1 raz.`;
  } else {
    audienceBrief = `GRUPA DOCELOWA: WŁAŚCICIEL NIERUCHOMOŚCI, który potrzebuje finansowania szybciej lub łatwiej niż w banku (odmowa banku, II hipoteka, płynność, inwestycja, start działalności). Piszesz do przedsiębiorców w szerokim sensie — także do osób, które dopiero zakładają firmę: obsługujemy start-upy od pierwszego dnia działalności, staż firmy nie jest wymagany. Nie akcentuj co akapit, że oferta jest „tylko dla firm” — wystarczy jedna naturalna wzmianka o celu związanym z działalnością. Nie pisz o finansowaniu celów konsumpcyjnych (wakacje, samochód, wesele) i nie obiecuj finansowania „bez zdolności” ani „bez weryfikacji” („bez BIK” i „minimum formalności” są w porządku, bo decyduje nieruchomość). Pisz językiem korzyści i jasnych procedur. CTA do "[złóż bezpłatny wniosek o finansowanie](https://financeyou.pl/dla-klienta)" wpleć 1-2 razy.`;
  }

  const sys = `${currentDateContextPl()}\nJesteś senior copywriterem finansowym dla Finance You (pożyczki pod zastaw nieruchomości w PL). Piszesz po polsku, konkretnie, bez clickbaitu i bez "AI-słów" (rewolucyjny, niesamowity, w erze AI itp.). Konkrety, liczby z briefingu, akapity 2-3 zdania, H2/H3, listy. NIE wymyślaj liczb spoza briefingu.\n${audienceBrief}\n\n${STYLE_GUIDE}\n\nZWRÓĆ WYŁĄCZNIE JEDEN OBIEKT JSON zgodny ze schematem, bez markdown code fence, bez komentarza.`;

  const briefLabel =
    kind === "investor_review"
      ? "BRIEFING (dane do przeglądu porównawczego, ostatnie 30 dni):"
      : kind === "legal_market_monitor"
        ? "BRIEFING (monitoring zmian w prawie i na rynku, ostatnie 7 dni):"
        : "BRIEFING (świeże wiadomości z ostatnich 24h):";
  const taskLabel =
    kind === "investor_review"
      ? "Napisz dogłębny PRZEGLĄD INWESTYCYJNY porównujący klasy aktywów. Tytuł musi być porównawczy (np. zawierać 'vs', 'porównanie', 'ranking', 'co się bardziej opłaca')."
      : kind === "legal_market_monitor"
        ? `Napisz cotygodniowy PRZEGLĄD PRAWNO-RYNKOWY za okres ${weekRangePl()}. Tytuł ma zawierać ramkę czasową (np. 'Przegląd tygodnia ${weekRangePl()}', 'Co zmieniło się w prawie i na rynku nieruchomości') — wyłącznie ten zakres dat, bez clickbaitu.`
        : `Napisz codzienny post blogowy dla ${audience === "investor" ? "INWESTORA" : "POŻYCZKOBIORCY"}. Tytuł musi sugerować aktualność i wyraźnie celować w tę grupę odbiorców.`;

  const userMsg = `${briefLabel}
${brief.summary}

ŹRÓDŁA do podlinkowania w sekcji "Linki i źródła":
${externalList || "(brak)"}

LINKI WEWNĘTRZNE do wplecenia w treść (2-3 z poniższych, naturalnie w kontekście):
${internalList || "(brak — pomiń linki wewnętrzne)"}

${taskLabel}

OSTATNIE TYTUŁY NA BLOGU (NIE powtarzaj ich ani ich schematu — tytuł, fraza główna i kąt artykułu muszą być wyraźnie inne):
${recentTitles.length ? recentTitles.map((t) => `- ${t}`).join("\n") : "(brak)"}

WYMAGANY OPIS POLA content_md: ${structureHint}
Zwróć pojedynczy JSON: { "title", "meta_title", "meta_description", "excerpt", "primary_keyword", "keywords" (array of strings), "content_md", "cover_prompt", "cover_alt" }.`;

  const jsonSchema = {
    type: "object",
    properties: {
      title: { type: "string" },
      meta_title: { type: "string" },
      meta_description: { type: "string" },
      excerpt: { type: "string" },
      primary_keyword: { type: "string" },
      keywords: { type: "array", items: { type: "string" } },
      content_md: { type: "string" },
      cover_prompt: { type: "string" },
      cover_alt: { type: "string" },
    },
    required: [
      "title",
      "meta_title",
      "meta_description",
      "excerpt",
      "primary_keyword",
      "keywords",
      "content_md",
      "cover_prompt",
      "cover_alt",
    ],
  };

  const parsed = await lovableAiJson<ArticleDraft>({
    model: AI_MODEL_PRO,
    system: sys,
    user: `${userMsg}\n\nSCHEMAT JSON (wszystkie pola wymagane): ${JSON.stringify(jsonSchema)}`,
    temperature: 0.4,
    timeoutMs: 180_000,
  });
  for (const k of jsonSchema.required) {
    if ((parsed as any)?.[k] == null) throw new Error(`AI writer: brak pola ${k}`);
  }
  // Ostatnia linia obrony przed „starym rokiem” w tytułach (patrz date-context.ts).
  const draft = parsed as ArticleDraft;
  draft.title = fixStaleYearInTitle(draft.title).text;
  draft.meta_title = fixStaleYearInTitle(draft.meta_title).text;
  return draft;
}

import { pickStockPhoto } from "./blog-stock-photos";
import { isIndexable, isNoDataTitle, mostSimilarTitle } from "./seo/article-index";
import {
  EVERGREEN_GUIDES,
  REVIEW_TOPICS,
  SCHEDULE,
  isDue,
  pickGuide,
  pickReviewTopic,
} from "./seo/blog-schedule";

/**
 * Okładka artykułu = darmowe zdjęcie stockowe (Unsplash) + wordmark Finance You
 * nakładany jako overlay CSS po stronie klienta (komponent BlogCover).
 *
 * Wcześniej okładki były generowane modelem AI i stamplowane jimp-em po stronie
 * serwera. Na Cloudflare Workers jimp wybucha ("Inflate cannot be invoked
 * without new" — pako/zlib nie działa w środowisku Workera), przez co od
 * 10.06.2026 codzienny tick padał przy generacji okładki i żaden nowy artykuł
 * nie był publikowany. Stock + overlay rozwiązuje to bez kompozycji serwerowej.
 */
function pickCover(kind: PostKind): { url: string; alt: string } {
  const audience = audienceOf(kind);
  const photo = pickStockPhoto(audience, kind === "investor_review");
  return { url: photo.url, alt: photo.alt };
}

type TickResult = { ok: boolean; reason?: string; slug?: string; id?: string };

async function lastPublishedOf(kind: PostKind): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("ai_seo_articles")
    .select("published_at")
    .eq("source", "ai_autopilot")
    .eq("raw_ai_output->>post_kind", kind)
    .order("published_at", { ascending: false })
    .limit(1);
  return (data?.[0]?.published_at as string | undefined) ?? null;
}

async function usedGuideTopics(): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("ai_seo_articles")
    .select("guide_topic:raw_ai_output->>guide_topic")
    .eq("source", "ai_autopilot")
    .not("raw_ai_output->>guide_topic", "is", null)
    .order("published_at", { ascending: false })
    .limit(200);
  return ((data ?? []) as any[]).map((r) => String(r.guide_topic));
}

async function writeEvergreenGuide(
  guide: (typeof EVERGREEN_GUIDES)[number],
  internal: RelatedArticle[],
  recentTitles: string[],
): Promise<ArticleDraft> {
  const internalList = internal
    .map(
      (a) =>
        `- [${a.title}](/blog/${a.slug})${a.primary_keyword ? ` — kw: ${a.primary_keyword}` : ""}`,
    )
    .join("\n");
  const sys = `${currentDateContextPl()}
Jesteś senior copywriterem finansowym i ekspertem SEO dla Finance You (pożyczki pod zastaw nieruchomości w PL na cel związany z działalnością — także dla firm od pierwszego dnia). Piszesz po polsku, konkretnie, bez clickbaitu i bez "AI-słów". Poradnik ma być lepszy niż to, co dziś jest w top 10 Google na tę frazę: praktyczny, z przykładami, listami kroków, tabelą tam, gdzie pomaga.
GRUPA DOCELOWA: właściciel nieruchomości i przedsiębiorca — także osoba, która dopiero zakłada firmę (obsługujemy start-upy od pierwszego dnia działalności, staż nie jest wymagany). O celu związanym z działalnością wspomnij raz, naturalnie — nie powtarzaj „tylko dla firm”. Nie pisz o finansowaniu celów konsumpcyjnych, nie obiecuj finansowania „bez zdolności” ani „bez weryfikacji” („bez BIK” i „minimum formalności” są w porządku).
NIE podawaj konkretnych statystyk, stóp, prowizji ani dat, których nie znasz na pewno — opisuj mechanizm i przykładowe wyliczenia wyraźnie oznaczone jako orientacyjne.

${STYLE_GUIDE}

ZWRÓĆ WYŁĄCZNIE JEDEN OBIEKT JSON zgodny ze schematem, bez markdown code fence, bez komentarza.`;
  const user = `Napisz PORADNIK evergreen (ponadczasowy — bez odniesień do „dziś”, bieżących newsów i dat).
TEMAT: ${guide.topic}
FRAZA GŁÓWNA (primary_keyword): ${guide.keyword}
STRONA PRODUKTU do podlinkowania 2 razy (w treści i w podsumowaniu): https://financeyou.pl${guide.target}

LINKI WEWNĘTRZNE do wplecenia (2-3, naturalnie):
${internalList || "(brak)"}

OSTATNIE TYTUŁY NA BLOGU (nie powtarzaj ich ani ich schematu):
${recentTitles.map((t) => `- ${t}`).join("\n") || "(brak)"}

WYMAGANY OPIS POLA content_md: Markdown, 1300-1900 słów. Struktura: lead (2-3 zdania: komu i w czym pomoże poradnik), H2 z definicją/odpowiedzią wprost na frazę (pierwsze 2 zdania = odpowiedź do fragmentu wyróżnionego Google), H2 „Jak to działa krok po kroku” (lista numerowana), H2 o warunkach i dokumentach, H2 z przykładem liczbowym (orientacyjnym, oznaczonym jako przykład), H2 „Na co uważać” (ryzyka, koszty, typowe błędy), H2 „Podsumowanie”, na końcu „FAQ” z 5 pytaniami, które ludzie wpisują w Google (H3 pytanie + 2-4 zdania odpowiedzi). Tytuł: zawiera frazę główną, max 65 znaków, bez roku.
Zwróć pojedynczy JSON: { "title", "meta_title", "meta_description", "excerpt", "primary_keyword", "keywords" (array of strings), "content_md", "cover_prompt", "cover_alt" }.`;
  const parsed = await lovableAiJson<ArticleDraft>({
    model: AI_MODEL_PRO,
    system: sys,
    user,
    temperature: 0.4,
    timeoutMs: 180_000,
  });
  for (const k of ["title", "meta_title", "meta_description", "excerpt", "content_md"]) {
    if ((parsed as any)?.[k] == null) throw new Error(`AI writer: brak pola ${k}`);
  }
  const draft = parsed as ArticleDraft;
  draft.primary_keyword = draft.primary_keyword || guide.keyword;
  draft.keywords = Array.isArray(draft.keywords) ? draft.keywords : [guide.keyword];
  draft.title = fixStaleYearInTitle(draft.title).text;
  draft.meta_title = fixStaleYearInTitle(draft.meta_title).text;
  return draft;
}

/**
 * Tick harmonogramu: publikuje każdy rodzaj, któremu minął odstęp (najwyżej
 * jeden wpis na rodzaj). `force` (prywatny sekret) publikuje poradnik od ręki;
 * `kind` wymusza konkretny rodzaj.
 */
export async function runDailyBlogTick(
  opts: { force?: boolean; kind?: PostKind } = {},
): Promise<{ ok: boolean; reason?: string; results: (TickResult & { kind: PostKind })[] }> {
  if (!process.env.ANTHROPIC_API_KEY)
    return { ok: false, reason: "ANTHROPIC_API_KEY missing", results: [] };

  const kinds: PostKind[] = [];
  if (opts.kind) kinds.push(opts.kind);
  else if (opts.force) kinds.push("evergreen_guide");
  else {
    for (const item of SCHEDULE) {
      if (isDue(await lastPublishedOf(item.kind), item.everyDays)) kinds.push(item.kind);
    }
  }
  if (kinds.length === 0) return { ok: true, reason: "nothing due", results: [] };

  const results: (TickResult & { kind: PostKind })[] = [];
  for (const kind of kinds) {
    try {
      results.push({ kind, ...(await publishOne(kind)) });
    } catch (err) {
      // Wcześniej błąd ticka nie zostawiał śladu (500 do crona) — tak przepadły
      // publikacje z 26.10 i 2.11.2026. Teraz każdy błąd trafia do dziennika.
      const msg = err instanceof Error ? err.message : String(err);
      await supabaseAdmin.from("ai_growth_action_log").insert({
        module: "seo_content_engine",
        action: "daily_autopost",
        status: "error",
        summary: `[${kind}] błąd publikacji: ${msg.slice(0, 300)}`,
        payload: { kind, error: msg },
      });
      results.push({ kind, ok: false, reason: msg });
    }
  }
  return { ok: results.every((r) => r.ok), results };
}

async function publishOne(kind: PostKind): Promise<TickResult> {
  const audience = audienceOf(kind);
  const reviewTopic = kind === "investor_review" ? await nextReviewTopic() : undefined;
  const guide = kind === "evergreen_guide" ? pickGuide(await usedGuideTopics()) : undefined;
  const brief: NewsBrief = guide
    ? { summary: "", citations: [] }
    : await fetchFreshNewsBrief(kind as NewsKind, reviewTopic);
  const internal = await pickInternalLinks();
  const recent = await recentArticleTitles();
  const recentTitles = recent.slice(0, 25).map((r) => r.title);
  const draft = guide
    ? await writeEvergreenGuide(guide, internal, recentTitles)
    : await writeArticleFromNews(brief, internal, kind, recentTitles);
  const cover = pickCover(kind);

  // Strażnik jakości indeksu: wpis „o braku danych” nie jest publikowany,
  // a wpis niemal identyczny z istniejącym trafia jako noindex — Google
  // przy wielu duplikatach obniża ocenę całego bloga.
  if (isNoDataTitle(draft.title)) {
    await supabaseAdmin.from("ai_growth_action_log").insert({
      module: "seo_content_engine",
      action: "daily_autopost",
      status: "warning",
      summary: `[${kind}] pominięty — brak świeżych danych: ${draft.title}`,
      payload: { kind, title: draft.title },
    });
    return { ok: true, reason: "skipped: no fresh data" };
  }
  const similar = mostSimilarTitle(draft.title, recent);
  const isDuplicate = !!similar && similar.score >= DUPLICATE_TITLE_THRESHOLD;

  const slug = await ensureUniqueSlug(slugify(draft.title));
  const wordCount = (draft.content_md.match(/\S+/g) ?? []).length;

  const ctaUrl =
    audience === "investor"
      ? "https://financeyou.pl/dla-inwestora"
      : "https://financeyou.pl/dla-klienta";
  const ctaLabel =
    audience === "investor" ? "Zostań partnerem Finance You" : "Sprawdź możliwości bezpłatnie";

  const { data: inserted, error } = await supabaseAdmin
    .from("ai_seo_articles")
    .insert({
      slug,
      title: draft.title,
      meta_title: draft.meta_title,
      meta_description: draft.meta_description,
      excerpt: draft.excerpt,
      content_md: draft.content_md,
      primary_keyword: draft.primary_keyword,
      keywords: draft.keywords ?? [],
      word_count: wordCount,
      reading_minutes: Math.max(1, Math.round(wordCount / 200)),
      status: "published",
      audience,
      cta_url: ctaUrl,
      cta_label: ctaLabel,

      source: "ai_autopilot",
      raw_ai_output: {
        ...draft,
        post_kind: kind,
        ...(reviewTopic ? { review_topic: reviewTopic } : {}),
        ...(guide ? { guide_topic: guide.topic, target_page: guide.target } : {}),
        ...(isDuplicate ? { noindex: true, similar_to: similar!.slug } : {}),
      } as any,
      published_at: new Date().toISOString(),
      content_refreshed_at: new Date().toISOString(),
      cover_image_url: cover.url,
      cover_image_alt: cover.alt || draft.cover_alt,
      external_links: brief.citations,
      internal_link_slugs: internal.map((i) => i.slug),
    })
    .select("id,slug")
    .single();

  if (error) throw new Error(error.message);

  await supabaseAdmin.from("ai_growth_action_log").insert({
    module: "seo_content_engine",
    action: "daily_autopost",
    status: "ok",
    summary: `[${kind}] ${draft.title}`,
    payload: {
      article_id: inserted.id,
      slug: inserted.slug,
      kind,
      sources: brief.citations.length,
      ...(isDuplicate
        ? { noindex: true, similar_to: similar!.slug, similarity: similar!.score }
        : {}),
    },
  });

  // Strażnik spójności z serwisem: serwis nie obiecuje zysków, więc artykuł
  // też nie może. Wykryte frazy nie blokują publikacji (strona artykułu
  // renderuje notę prawną), ale zostawiają ostrzeżenie do ręcznego przeglądu.
  const banned = findBannedClaims(`${draft.title}\n${draft.excerpt}\n${draft.content_md}`);
  if (banned.length > 0) {
    await supabaseAdmin.from("ai_growth_action_log").insert({
      module: "seo_content_engine",
      action: "compliance_warning",
      // CHECK w ai_growth_action_log dopuszcza 'warning' od migracji
      // 20261019180000 – wcześniej wpis był cicho odrzucany.
      status: "warning",
      summary: `Artykuł ${inserted.slug} zawiera frazy niezgodne z komunikacją serwisu: ${banned.join("; ")}`,
      payload: { article_id: inserted.id, slug: inserted.slug, banned_phrases: banned },
    });
  }

  return { ok: true, slug: inserted.slug, id: inserted.id };
}
