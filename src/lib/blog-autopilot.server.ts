// Codzienny bot blogowy: zbiera świeże newsy finansowe (Perplexity + Firecrawl),
// pisze artykuł SEO przez Lovable AI, generuje okładkę i publikuje z linkami
// wewnętrznymi (do innych artykułów na blogu) i zewnętrznymi (źródłami).

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PPLX_URL = "https://api.perplexity.ai/chat/completions";

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
  let slug = base;
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
type PostKind = "borrower_news" | "investor_news" | "legal_market_monitor" | "investor_review";

async function pickNextKind(): Promise<PostKind> {
  // Rotacja 4-elementowa: borrower_news → investor_news → legal_market_monitor → investor_review → ...
  const { data } = await supabaseAdmin
    .from("ai_seo_articles")
    .select("audience,raw_ai_output,published_at")
    .eq("source", "ai_autopilot")
    .order("published_at", { ascending: false })
    .limit(1);
  const lastRow: any = data?.[0];
  const last: PostKind | undefined = lastRow?.raw_ai_output?.post_kind
    ?? (lastRow ? (lastRow.audience === "investor" ? "investor_news" : "borrower_news") : undefined);
  if (last === "borrower_news") return "investor_news";
  if (last === "investor_news") return "legal_market_monitor";
  if (last === "legal_market_monitor") return "investor_review";
  if (last === "investor_review") return "borrower_news";
  return "legal_market_monitor"; // first run
}

function audienceOf(kind: PostKind): Audience {
  if (kind === "borrower_news") return "borrower";
  if (kind === "legal_market_monitor") return "borrower"; // regulacje/sądy/komornicy dotykają głównie właścicieli nieruchomości i pożyczkobiorców
  return "investor";
}

const BRIEFS: Record<PostKind, { sys: string; user: string }> = {
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
    user: "Zbierz AKTUALNE (ostatnie 30 dni) dane do PRZEGLĄDU INWESTYCYJNEGO porównującego klasy aktywów dostępne dla polskiego inwestora prywatnego. Wybierz JEDEN temat porównawczy spośród: (1) Pożyczki pod zastaw nieruchomości vs obligacje skarbowe COI/EDO vs lokaty bankowe 12M; (2) Pożyczki pod zastaw vs crowdfunding nieruchomościowy (Shareholder, Social.Estate) vs REIT-y zagraniczne; (3) Mieszkania na wynajem vs pożyczki pod zastaw nieruchomości (yield netto, ROE z lewarem, koszty, podatki); (4) Pożyczki prywatne pod hipotekę vs obligacje korporacyjne (Catalyst) vs fundusze dłużne; (5) IKE/IKZE w ETF vs aktywne inwestowanie w pożyczki pod zastaw. Dla wybranego porównania zwróć KONKRETNE LICZBY z ostatnich 30 dni: oprocentowanie / oczekiwana stopa zwrotu netto (po podatku Belki gdzie dotyczy), minimalny ticket, horyzont, płynność, ryzyko (1-5 + uzasadnienie), zabezpieczenie, opodatkowanie. Podaj źródła (URL) dla KAŻDEJ liczby. Na końcu dodaj 'WNIOSEK_DLA_INWESTORA:' z akapitem rekomendacji dywersyfikacyjnej.",
  },
  legal_market_monitor: {
    sys: "Jesteś analitykiem prawno-rynkowym monitorującym polski rynek nieruchomości i finansów. Po polsku, konkretnie, bez spekulacji poza to co wynika ze źródeł.",
    user: "Zbierz z ostatnich 7 dni KONKRETNE wiadomości (z datą, źródłem, liczbami) o zmianach lub propozycjach zmian mających wpływ na polski rynek nieruchomości i finansów. Obejmij WSZYSTKIE z poniższych obszarów, przynajmniej po 1 wiadomości z każdego jeśli są dostępne:\n(A) LEGISLACJA PL: projekty ustaw i rozporządzeń (Sejm/Senat/MS/MF/MRiT) dot. kredytów hipotecznych, pożyczek konsumenckich, ustawy antylichwiarskiej, wakacji kredytowych, WIBOR/WIRON, podatku PCC/od nieruchomości, planowania przestrzennego, najmu instytucjonalnego, spółdzielni;\n(B) SĄDY I ORZECZNICTWO: wyroki SN, TSUE, sądów apelacyjnych dot. kredytów (frankowicze, WIBOR, sankcja kredytu darmowego), egzekucji z nieruchomości, hipoteki, ksiąg wieczystych;\n(C) KOMORNICY I EGZEKUCJA: zmiany w ustawie o komornikach, opłatach egzekucyjnych, licytacjach nieruchomości (nowe zasady, statystyki KRK/KIRP);\n(D) ADWOKATURA / RADCOWIE PRAWNI / NOTARIUSZE: uchwały NRA/KRRP/KRN, stawki taksy notarialnej, zmiany zawodowe wpływające na obsługę transakcji nieruchomościowych;\n(E) REGULATORZY: KNF, UOKiK, UODO, NBP/RPP — komunikaty i decyzje dot. kredytów, pożyczek pozabankowych, deweloperów, DFG;\n(F) RYNEK NIERUCHOMOŚCI PL: dane GUS/AMRON/Otodom/Rynek Pierwotny — ceny mkw. w 7 największych miastach, liczba transakcji, oferta, mediana czasu sprzedaży;\n(G) ŚWIATOWE RYNKI: decyzje FED/EBC, kurs USD/EUR/PLN, ceny surowców (ropa, gaz, złoto), sytuacja na rynkach nieruchomości w DE/US/UK — TYLKO gdy da się wskazać konkretny mechanizm przełożenia na PL (koszt pieniądza, kapitał zagraniczny, ceny materiałów budowlanych).\n\nDla KAŻDEJ pozycji: data, źródło (URL), 3-4 zdania faktów + 1 zdanie 'MOŻLIWY WPŁYW:' z konkretnym przełożeniem na polski rynek nieruchomości / rynek pożyczek pod zastaw / właściciela nieruchomości. NIE spekuluj poza to co da się wyprowadzić z faktu. Jeżeli w danym obszarze nie ma nowości — napisz jawnie 'brak istotnych zdarzeń w ostatnich 7 dniach'.",
  },
};

async function fetchFreshNewsBrief(pplxKey: string, kind: PostKind): Promise<NewsBrief> {
  const b = BRIEFS[kind];
  const res = await fetch(PPLX_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${pplxKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "sonar",
      search_recency_filter: kind === "investor_review" ? "month" : kind === "legal_market_monitor" ? "week" : "day",
      messages: [
        { role: "system", content: b.sys },
        { role: "user", content: b.user },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Perplexity ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const json: any = await res.json();
  const summary: string = json.choices?.[0]?.message?.content ?? "";
  const rawCitations: string[] = json.citations ?? json.search_results?.map((r: any) => r.url) ?? [];
  const citations = rawCitations.slice(0, 8).map((url) => ({ url }));
  return { summary, citations };
}


interface RelatedArticle {
  slug: string;
  title: string;
  primary_keyword: string | null;
}

async function pickInternalLinks(): Promise<RelatedArticle[]> {
  const { data } = await supabaseAdmin
    .from("ai_seo_articles")
    .select("slug,title,primary_keyword,published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(40);
  const list = (data ?? []) as RelatedArticle[];
  // pick 3 random
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, 3);
}

/**
 * Wspólne zasady stylu, SEO i zgodności z serwisem dla KAŻDEGO artykułu
 * generowanego na blog. Serwis financeyou.pl celowo NIE obiecuje żadnych
 * konkretnych stóp zwrotu ani nie gwarantuje zysku/finansowania — artykuły
 * muszą być z tym spójne.
 */
const STYLE_GUIDE = `ZASADY STYLU, SEO I ZGODNOŚCI Z SERWISEM (obowiązkowe):
- Ton jak w serwisie financeyou.pl: rzeczowy, ekspercki, konkretny; bez wykrzykników i sensacji; akapity 2-3 zdania; struktura H2/H3; listy tam, gdzie poprawiają skanowalność.
- SEO: fraza główna (primary_keyword) w tytule, w pierwszym akapicie i w co najmniej jednym H2; meta_title do 60 znaków z frazą główną; meta_description 140-155 znaków z frazą główną i konkretną korzyścią; excerpt 1-2 zdania.
- LINKI WEWNĘTRZNE: wpleć 2-3 linki do podanych artykułów bloga oraz dokładnie 1 CTA do strony ścieżki. Używaj WYŁĄCZNIE tych adresów serwisu: https://financeyou.pl/dla-klienta (finansowanie dla klienta), https://financeyou.pl/dla-inwestora (Klub Inwestorów Hipotecznych), https://financeyou.pl/oferty (aktualne oferty pożyczek), https://financeyou.pl/blog/... (artykuły). NIGDY nie linkuj do /klient ani /inwestor — to panele wymagające logowania.
- ZWROTY Z INWESTYCJI (spójność z serwisem): Finance You nigdzie w serwisie nie obiecuje konkretnej stopy zwrotu ani nie gwarantuje zysku. Liczby o oprocentowaniu/stopach zwrotu przytaczaj TYLKO ze źródeł briefingu, zawsze jako dane rynkowe z podanym źródłem — nigdy jako wynik oferowany przez Finance You. ZAKAZANE: "gwarantowany zysk/zwrot", "pewny zysk", "bez ryzyka", "zarobisz X%", przypisywanie Finance You jakiejkolwiek stopy zwrotu.
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
  _lovableKey: string,
  brief: NewsBrief,
  internal: RelatedArticle[],
  kind: PostKind,
): Promise<ArticleDraft> {
  const audience = audienceOf(kind);

  const internalList = internal
    .map((a) => `- [${a.title}](/blog/${a.slug})${a.primary_keyword ? ` — kw: ${a.primary_keyword}` : ""}`)
    .join("\n");
  const externalList = brief.citations.map((c) => `- ${c.url}`).join("\n");

  const structureHint = kind === "investor_review"
    ? "Markdown, 1100-1700 słów. Struktura: krótki lead (problem inwestora), H2 'Porównywane klasy aktywów' (lista), H2 'Tabela porównawcza' (markdown table z kolumnami: Klasa aktywów | Oczekiwana stopa zwrotu netto | Min. ticket | Horyzont | Płynność | Ryzyko 1-5 | Zabezpieczenie | Podatek), H2 'Analiza' (po jednym akapicie na każdą klasę z LICZBAMI z briefingu), H2 'Dla kogo która opcja', H2 'Wnioski i rekomendacja dywersyfikacji', H2 'Linki i źródła', FAQ (3 Q&A). WPLEĆ 2-3 linki wewnętrzne. ZAWSZE podawaj liczby z briefingu, NIGDY nie wymyślaj."
    : kind === "legal_market_monitor"
    ? "Markdown, 1000-1500 słów. Format PRZEGLĄDU TYGODNIA. Struktura: krótki lead (1 akapit — co najważniejszego wydarzyło się w minionym tygodniu na styku prawa, sądów i rynku nieruchomości w PL), H2 'Legislacja i regulatorzy' (Sejm/Senat/MS/MF/KNF/UOKiK — pod-punkty z datą + źródło + 'Możliwy wpływ:'), H2 'Sądy i orzecznictwo' (SN/TSUE/apelacyjne — j.w.), H2 'Komornicy i egzekucja z nieruchomości', H2 'Notariat, adwokatura i radcowie prawni', H2 'Rynek nieruchomości w Polsce' (dane z GUS/AMRON/Otodom — liczby, miasta), H2 'Świat → Polska' (FED/EBC/USD/EUR/surowce — wyłącznie z konkretnym mechanizmem przełożenia na PL), H2 'Podsumowanie tygodnia — co to zmienia dla właściciela nieruchomości i pożyczkobiorcy' (2-3 akapity), H2 'Linki i źródła', FAQ (3 Q&A). WPLEĆ 2-3 linki wewnętrzne. KAŻDA teza musi mieć źródło z briefingu — NIE dopisuj zdarzeń spoza briefingu. Jeżeli w danej sekcji brief mówi 'brak zdarzeń', napisz to jawnie."
    : "Markdown, 700-1100 słów. Struktura: krótki lead, H2 'Co się stało', H2 'Co to znaczy dla inwestora', H2 'Co to znaczy dla osób z nieruchomością', H2 'Linki i źródła', FAQ (3 Q&A). WPLEĆ naturalnie 2-3 linki wewnętrzne z podanej listy. NA KOŃCU 'Linki i źródła' wymień zewnętrzne źródła.";


  let audienceBrief: string;
  if (kind === "investor_review") {
    audienceBrief = `GRUPA DOCELOWA: INWESTOR PRYWATNY (HNW, 100k–2M PLN kapitału) szukający OBIEKTYWNEGO PRZEGLĄDU I PORÓWNANIA klas aktywów. Pisz analitycznie, jak rzetelny analityk inwestycyjny — nie sprzedażowo. Pożyczki pod zastaw nieruchomości pokaż jako JEDNĄ z opcji, z plusami I minusami. CTA do "[poznaj Klub Inwestorów Hipotecznych Finance You](https://financeyou.pl/dla-inwestora)" wpleć dyskretnie 1 raz na końcu sekcji wniosków.`;
  } else if (kind === "legal_market_monitor") {
    audienceBrief = `GRUPA DOCELOWA: WŁAŚCICIEL NIERUCHOMOŚCI, POŻYCZKOBIORCA, PROFESJONALIŚCI RYNKU (pośrednicy, doradcy, prawnicy) śledzący zmiany w prawie i sytuację rynkową. Styl newsroom / przegląd prawny — rzeczowo, bez sensacji, KAŻDA teza z datą i źródłem, KAŻDA sekcja kończy się zdaniem "Możliwy wpływ:" z konkretnym mechanizmem przełożenia na rynek nieruchomości / rynek pożyczek pod zastaw. Pisz tak, żeby czytelnik po lekturze wiedział, czy sytuacja jest dla niego korzystna, neutralna czy niekorzystna i dlaczego. CTA do "[sprawdź bezpłatnie możliwości finansowania](https://financeyou.pl/dla-klienta)" wpleć dyskretnie 1 raz w podsumowaniu.`;
  } else if (audience === "investor") {
    audienceBrief = `GRUPA DOCELOWA: INWESTOR PRYWATNY rozważający lokowanie kapitału w pożyczki pod zastaw nieruchomości (pasywny dochód, zabezpieczenie hipoteczne, ryzyko, dywersyfikacja). Pisz językiem inwestycyjnym, bez infantylizowania. CTA do "[poznaj Klub Inwestorów Hipotecznych Finance You](https://financeyou.pl/dla-inwestora)" wpleć 1 raz.`;
  } else {
    audienceBrief = `GRUPA DOCELOWA: OSOBA POSZUKUJĄCA POŻYCZKI pod zastaw mieszkania/domu/działki (zła historia w BIK, brak zdolności w banku, II hipoteka, szybka gotówka). Pisz językiem korzyści i jasnych procedur. CTA do "[złóż bezpłatny wniosek o finansowanie](https://financeyou.pl/dla-klienta)" wpleć 1-2 razy.`;
  }

  const sys = `Jesteś senior copywriterem finansowym dla Finance You (pożyczki pod zastaw nieruchomości w PL). Piszesz po polsku, konkretnie, bez clickbaitu i bez "AI-słów" (rewolucyjny, niesamowity, w erze AI itp.). Konkrety, liczby z briefingu, akapity 2-3 zdania, H2/H3, listy. NIE wymyślaj liczb spoza briefingu.\n${audienceBrief}\n\n${STYLE_GUIDE}\n\nZWRÓĆ WYŁĄCZNIE JEDEN OBIEKT JSON zgodny ze schematem, bez markdown code fence, bez komentarza.`;

  const briefLabel = kind === "investor_review"
    ? "BRIEFING (dane do przeglądu porównawczego, ostatnie 30 dni):"
    : kind === "legal_market_monitor"
    ? "BRIEFING (monitoring zmian w prawie i na rynku, ostatnie 7 dni):"
    : "BRIEFING (świeże wiadomości z ostatnich 24h):";
  const taskLabel = kind === "investor_review"
    ? "Napisz dogłębny PRZEGLĄD INWESTYCYJNY porównujący klasy aktywów. Tytuł musi być porównawczy (np. zawierać 'vs', 'porównanie', 'ranking', 'co się bardziej opłaca')."
    : kind === "legal_market_monitor"
    ? "Napisz cotygodniowy PRZEGLĄD PRAWNO-RYNKOWY. Tytuł ma zawierać ramkę czasową (np. 'Przegląd tygodnia', datę tygodnia, 'Co zmieniło się w prawie i na rynku nieruchomości') — bez clickbaitu."
    : `Napisz codzienny post blogowy dla ${audience === "investor" ? "INWESTORA" : "POŻYCZKOBIORCY"}. Tytuł musi sugerować aktualność i wyraźnie celować w tę grupę odbiorców.`;

  const userMsg = `${briefLabel}
${brief.summary}

ŹRÓDŁA do podlinkowania w sekcji "Linki i źródła":
${externalList || "(brak)"}

LINKI WEWNĘTRZNE do wplecenia w treść (2-3 z poniższych, naturalnie w kontekście):
${internalList || "(brak — pomiń linki wewnętrzne)"}

${taskLabel}

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
    required: ["title", "meta_title", "meta_description", "excerpt", "primary_keyword", "keywords", "content_md", "cover_prompt", "cover_alt"],
  };

  const pplxKey = process.env.PERPLEXITY_API_KEY;
  if (!pplxKey) throw new Error("PERPLEXITY_API_KEY missing");
  const res = await fetch(PPLX_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${pplxKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sonar-pro",
      search_recency_filter: kind === "investor_review" ? "month" : "week",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: userMsg },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "blog_post", schema: jsonSchema },
      },
    }),
  });
  if (!res.ok) throw new Error(`Perplexity writer ${res.status}: ${await res.text().catch(() => "")}`);
  const json: any = await res.json();
  const raw: string = json.choices?.[0]?.message?.content ?? "";
  const cleaned = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}$/);
    if (!m) throw new Error("Perplexity writer returned non-JSON");
    parsed = JSON.parse(m[0]);
  }
  return parsed as ArticleDraft;
}

import { pickStockPhoto } from "./blog-stock-photos";

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


export async function runDailyBlogTick(opts: { force?: boolean } = {}): Promise<{
  ok: boolean;
  reason?: string;
  slug?: string;
  id?: string;
}> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const pplxKey = process.env.PERPLEXITY_API_KEY;
  if (!lovableKey) return { ok: false, reason: "LOVABLE_API_KEY missing" };
  if (!pplxKey) return { ok: false, reason: "PERPLEXITY_API_KEY missing" };

  // Nie publikuj 2 razy tego samego dnia (chyba że force=1)
  if (!opts.force) {
    const since = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("ai_seo_articles")
      .select("id")
      .eq("source", "ai_autopilot")
      .gte("published_at", since)
      .limit(1);
    if (recent && recent.length > 0) {
      return { ok: true, reason: "already published today" };
    }
  }

  const kind = await pickNextKind();
  const audience = audienceOf(kind);
  const brief = await fetchFreshNewsBrief(pplxKey, kind);
  const internal = await pickInternalLinks();
  const draft = await writeArticleFromNews(lovableKey, brief, internal, kind);
  const cover = pickCover(kind);

  const slug = await ensureUniqueSlug(slugify(draft.title));
  const wordCount = (draft.content_md.match(/\S+/g) ?? []).length;

  const ctaUrl = audience === "investor" ? "https://financeyou.pl/dla-inwestora" : "https://financeyou.pl/dla-klienta";
  const ctaLabel = audience === "investor" ? "Poznaj Klub Inwestorów" : "Sprawdź możliwości bezpłatnie";

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
      raw_ai_output: { ...draft, post_kind: kind } as any,
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
    payload: { article_id: inserted.id, slug: inserted.slug, kind, sources: brief.citations.length },
  });

  // Strażnik spójności z serwisem: serwis nie obiecuje zysków, więc artykuł
  // też nie może. Wykryte frazy nie blokują publikacji (strona artykułu
  // renderuje notę prawną), ale zostawiają ostrzeżenie do ręcznego przeglądu.
  const banned = findBannedClaims(`${draft.title}\n${draft.excerpt}\n${draft.content_md}`);
  if (banned.length > 0) {
    await supabaseAdmin.from("ai_growth_action_log").insert({
      module: "seo_content_engine",
      action: "compliance_warning",
      status: "warning",
      summary: `Artykuł ${inserted.slug} zawiera frazy niezgodne z komunikacją serwisu: ${banned.join("; ")}`,
      payload: { article_id: inserted.id, slug: inserted.slug, banned_phrases: banned },
    });
  }

  return { ok: true, slug: inserted.slug, id: inserted.id };
}
