import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  FileText,
  FolderOpen,
  Briefcase,
  Send,
  Tag,
  Plug,
  Settings,
  ShieldCheck,
  Mic,
  GraduationCap,
  Code2,
  Wand2,
  Receipt,
  BookOpen,
  Facebook,
  Mail,
  Search,
  Sparkles,
  Link2,
  TrendingDown,
  Eye,
  Bot,
  FileCheck,
  FileSignature,
  Image as ImageIcon,
  Network,
  Coins,
  Share2,
  Wallet,
  Building2,
  MapPinned,
  MessageCircle,
  IdCard,
  Youtube,
  Clapperboard,
  Handshake,
  Megaphone,
  Landmark,
  Download,
} from "lucide-react";

/**
 * Jedno źródło prawdy nawigacji panelu /admin: sekcje sidebara, huby, zakładki
 * i indeks wyszukiwarki. Ścieżki odpowiadają istniejącym route'om w `src/routes`.
 */

export type AdminNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Jedno zdanie opisu (PL) — widoczne na kafelku huba. */
  description: string;
  /** Dodatkowe hasła do wyszukiwarki (dopasowanie bez diakrytyków). */
  synonyms: string[];
  exact?: boolean;
  /** Klucz licznika z `use-admin-badges` (np. nowe wnioski, nieprzeczytane wiadomości). */
  badgeKey?: string;
};

export type AccentKey =
  | "gold"
  | "blue"
  | "green"
  | "violet"
  | "teal"
  | "magenta"
  | "slate"
  | "brand";

export type AdminSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  hubPath: string;
  accent: AccentKey;
  /** Krótki opis sekcji — nagłówek huba. */
  description: string;
  items: AdminNavItem[];
  subsections?: { label: string; items: AdminNavItem[] }[];
  isSettings?: boolean;
  /** Dodatkowe prefiksy ścieżek liczone jako „wewnątrz sekcji" (np. widoki szczegółów). */
  extraPrefixes?: string[];
};

/** Klasy Tailwind akcentu sekcji — spójne z brandingiem (ciemny brąz + złoto). */
export const accentClasses: Record<
  AccentKey,
  { bar: string; iconBg: string; iconText: string; border: string; dot: string; cardHover: string }
> = {
  brand: {
    bar: "bg-primary",
    iconBg: "bg-primary/15",
    iconText: "text-primary",
    border: "border-primary/40",
    dot: "bg-primary",
    cardHover: "group-hover:border-primary/40",
  },
  gold: {
    bar: "bg-amber-500",
    iconBg: "bg-amber-500/15",
    iconText: "text-amber-600 dark:text-amber-400",
    border: "border-amber-500/40",
    dot: "bg-amber-500",
    cardHover: "group-hover:border-amber-500/40",
  },
  blue: {
    bar: "bg-sky-600",
    iconBg: "bg-sky-500/15",
    iconText: "text-sky-600 dark:text-sky-400",
    border: "border-sky-500/40",
    dot: "bg-sky-500",
    cardHover: "group-hover:border-sky-500/40",
  },
  green: {
    bar: "bg-emerald-600",
    iconBg: "bg-emerald-500/15",
    iconText: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500/40",
    dot: "bg-emerald-500",
    cardHover: "group-hover:border-emerald-500/40",
  },
  violet: {
    bar: "bg-violet-600",
    iconBg: "bg-violet-500/15",
    iconText: "text-violet-600 dark:text-violet-400",
    border: "border-violet-500/40",
    dot: "bg-violet-500",
    cardHover: "group-hover:border-violet-500/40",
  },
  teal: {
    bar: "bg-teal-600",
    iconBg: "bg-teal-500/15",
    iconText: "text-teal-600 dark:text-teal-400",
    border: "border-teal-500/40",
    dot: "bg-teal-500",
    cardHover: "group-hover:border-teal-500/40",
  },
  magenta: {
    bar: "bg-fuchsia-600",
    iconBg: "bg-fuchsia-500/15",
    iconText: "text-fuchsia-600 dark:text-fuchsia-400",
    border: "border-fuchsia-500/40",
    dot: "bg-fuchsia-500",
    cardHover: "group-hover:border-fuchsia-500/40",
  },
  slate: {
    bar: "bg-slate-500",
    iconBg: "bg-slate-500/15",
    iconText: "text-slate-600 dark:text-slate-400",
    border: "border-slate-500/40",
    dot: "bg-slate-500",
    cardHover: "group-hover:border-slate-500/40",
  },
};

export const adminSections: AdminSection[] = [
  {
    id: "pulpit",
    label: "Pulpit",
    icon: LayoutDashboard,
    hubPath: "/admin",
    accent: "brand",
    description: "Lejek sprzedaży i automatyzacje w jednym widoku.",
    items: [
      {
        to: "/admin",
        label: "Pulpit",
        icon: LayoutDashboard,
        description: "Przegląd lejka sprzedaży, kolejek follow-up i asystent panelu (czat AI).",
        synonyms: [
          "dashboard",
          "start",
          "przeglad",
          "asystent",
          "bot",
          "czat ai",
          "ai administrator",
          "assistant",
        ],
        exact: true,
      },
    ],
  },
  {
    id: "sprzedaz",
    label: "Sprzedaż",
    icon: Handshake,
    hubPath: "/admin/sprzedaz",
    accent: "gold",
    description: "Klienci, wnioski i narzędzia przygotowania pożyczki.",
    extraPrefixes: ["/admin/wnioski", "/admin/przypomnienia", "/admin/dokumenty"],
    items: [
      {
        to: "/admin/klienci",
        label: "Klienci",
        icon: Users,
        description: "Baza klientów pożyczkowych z leadami i przypomnieniami.",
        synonyms: ["leady", "przypomnienia", "crm", "kontakty"],
      },
      {
        to: "/admin/wnioski-niekompletne",
        label: "Wnioski (wszystkie)",
        icon: FileText,
        description: "Wszystkie wnioski pożyczkowe wraz z kompletnością danych.",
        synonyms: ["wnioski", "niekompletne", "aplikacje"],
        badgeKey: "noweWnioski",
      },
      {
        to: "/admin/follow-up-braki",
        label: "Follow-up braków",
        icon: Send,
        description: "Automatyczne dopominanie się brakujących danych we wnioskach.",
        synonyms: ["followup", "braki", "przypomnienia o brakach"],
      },
      {
        to: "/admin/kreator-pozyczki",
        label: "Kreator pożyczki",
        icon: Wand2,
        description: "Krok po kroku przygotowanie parametrów pożyczki.",
        synonyms: ["kreator", "pozyczka", "kalkulator"],
      },
      {
        to: "/admin/generator-umowy",
        label: "Generator umowy pożyczki",
        icon: FileCheck,
        description: "Generowanie umowy pożyczki z danych wniosku.",
        synonyms: ["umowa", "generator", "dokument umowy"],
      },
      {
        to: "/admin/kreator-dokumentow",
        label: "Kreator dokumentów B2B",
        icon: FileSignature,
        description: "Tworzenie dokumentów B2B: umowy, oświadczenia, załączniki.",
        synonyms: ["dokumenty", "b2b", "szablony"],
      },
      {
        to: "/admin/kw",
        label: "Księgi wieczyste",
        icon: BookOpen,
        description: "Pobieranie i analiza ksiąg wieczystych nieruchomości.",
        synonyms: ["kw", "nieruchomosci", "ksiegi", "hipoteka"],
      },
      {
        to: "/admin/potencjal-lokalizacyjny",
        label: "Potencjał lokalizacyjny",
        icon: MapPinned,
        description: "Ocena potencjału lokalizacji nieruchomości (dane GUS).",
        synonyms: ["lokalizacja", "gus", "scoring lokalizacji"],
      },
    ],
  },
  {
    id: "komunikacja",
    label: "Komunikacja",
    icon: MessageCircle,
    hubPath: "/admin/komunikacja",
    accent: "blue",
    description: "Wszystkie kanały kontaktu z klientami i automaty AI.",
    items: [
      {
        to: "/admin/skrzynka",
        label: "Skrzynka mailowa",
        icon: Mail,
        description: "Wiadomości email przychodzące i wychodzące.",
        synonyms: ["mail", "email", "poczta", "inbox"],
        badgeKey: "nieprzeczytaneMaile",
      },
      {
        to: "/admin/messenger",
        label: "Messenger / Instagram DM",
        icon: MessageCircle,
        description: "Rozmowy z Messengera i Instagram Direct.",
        synonyms: ["messenger", "instagram", "dm", "facebook"],
        badgeKey: "nieprzeczytaneDM",
      },
      {
        to: "/admin/czat",
        label: "Czat na stronie",
        icon: MessageCircle,
        description: "Rozmowy z czatu osadzonego na stronie.",
        synonyms: ["czat", "chat", "livechat"],
      },
      {
        to: "/admin/voicebot",
        label: "Voicebot",
        icon: Mic,
        description: "Rozmowy telefoniczne prowadzone przez voicebota.",
        synonyms: ["telefon", "polaczenia", "bot glosowy"],
      },
      {
        to: "/admin/text-agent",
        label: "Agent DM",
        icon: Bot,
        description: "Agent AI odpowiadający w Messengerze, na Instagramie i mailu.",
        synonyms: ["agent", "autoresponder", "ai dm"],
      },
      {
        to: "/admin/avatar-faq",
        label: "Awatar FAQ (Filip)",
        icon: Bot,
        description: "Wideo-awatar odpowiadający na najczęstsze pytania.",
        synonyms: ["awatar", "faq", "filip", "wideo bot"],
      },
      {
        to: "/admin/eksport-historii",
        label: "Eksport historii",
        icon: Download,
        description:
          "Pełna historia rozmów voicebota, SMS, maili i Messengera w jednej paczce ZIP, zestawiona z wnioskami.",
        synonyms: ["eksport", "export", "zip", "paczka", "historia", "archiwum", "transkrypcje"],
      },
    ],
  },
  {
    id: "inwestorzy",
    label: "Inwestorzy",
    icon: Briefcase,
    hubPath: "/admin/inwestycje",
    accent: "green",
    description: "Inwestorzy, projekty i dystrybucja ofert inwestycyjnych.",
    items: [
      {
        to: "/admin/inwestorzy",
        label: "Lista inwestorów",
        icon: Briefcase,
        description: "Baza inwestorów wraz ze statusami i dokumentami.",
        synonyms: ["inwestor", "baza inwestorow"],
      },
      {
        to: "/admin/projekty",
        label: "Projekty inwestycyjne",
        icon: FolderOpen,
        description: "Projekty pożyczkowe przygotowane pod inwestorów.",
        synonyms: ["projekty", "inwestycje"],
      },
      {
        to: "/admin/oferty",
        label: "Oferty",
        icon: Tag,
        description: "Oferty inwestycyjne publikowane dla inwestorów.",
        synonyms: ["oferta", "oferty inwestycyjne"],
      },
      {
        to: "/admin/dystrybucja",
        label: "Dystrybucja ofert",
        icon: Send,
        description: "Wysyłka ofert do inwestorów i śledzenie odpowiedzi.",
        synonyms: ["dystrybucja", "wysylka ofert"],
      },
      {
        to: "/admin/karty-ofert",
        label: "Karty ofert",
        icon: IdCard,
        description: "Graficzne karty ofert do udostępniania.",
        synonyms: ["karty", "pdf oferty"],
      },
      {
        to: "/admin/szkolenia",
        label: "Szkolenia",
        icon: GraduationCap,
        description: "Materiały szkoleniowe dla inwestorów.",
        synonyms: ["szkolenia", "kursy", "edukacja"],
      },
    ],
  },
  {
    id: "posrednicy",
    label: "Pośrednicy",
    icon: Network,
    hubPath: "/admin/posrednicy",
    accent: "violet",
    description: "Program pośredników: partnerzy, prowizje i rozliczenia.",
    items: [
      {
        to: "/admin/program-posrednikow",
        label: "Pulpit programu",
        icon: Network,
        description: "Przegląd programu pośredników w jednym miejscu.",
        synonyms: ["program posrednikow", "partnerzy przeglad"],
        exact: true,
      },
      {
        to: "/admin/program-posrednikow/partnerzy",
        label: "Partnerzy",
        icon: Users,
        description: "Lista partnerów programu pośredników.",
        synonyms: ["partnerzy", "posrednicy lista"],
      },
      {
        to: "/admin/program-posrednikow/struktura",
        label: "Struktura partnerska",
        icon: Share2,
        description: "Drzewo poleceń i struktura partnerska.",
        synonyms: ["struktura", "drzewo", "polecenia"],
      },
      {
        to: "/admin/program-posrednikow/zdarzenia",
        label: "Zdarzenia prowizyjne",
        icon: Send,
        description: "Zdarzenia naliczające prowizje partnerów.",
        synonyms: ["zdarzenia", "naliczenia"],
      },
      {
        to: "/admin/program-posrednikow/prowizje",
        label: "Prowizje",
        icon: Coins,
        description: "Naliczone prowizje partnerów programu.",
        synonyms: ["prowizja", "wynagrodzenia partnerow"],
      },
      {
        to: "/admin/program-posrednikow/wyplaty",
        label: "Paczki wypłat",
        icon: Wallet,
        description: "Paczki wypłat prowizji dla partnerów.",
        synonyms: ["wyplaty", "przelewy"],
      },
      {
        to: "/admin/program-posrednikow/rozliczenia",
        label: "Rozliczenia B2B / nierejestrowana",
        icon: FileCheck,
        description: "Rozliczenia partnerów: faktury B2B i działalność nierejestrowana.",
        synonyms: ["rozliczenia", "b2b", "nierejestrowana"],
      },
      {
        to: "/admin/program-posrednikow/ustawienia",
        label: "Stawki, limity, reguły",
        icon: Settings,
        description: "Konfiguracja stawek, limitów i reguł programu.",
        synonyms: ["stawki", "limity", "reguly", "ustawienia programu"],
      },
    ],
  },
  {
    id: "finanse",
    label: "Finanse",
    icon: Landmark,
    hubPath: "/admin/finanse",
    accent: "teal",
    description: "Płatności, księgowość, faktury i podmioty gospodarcze.",
    extraPrefixes: ["/admin/ksiegowosc"],
    items: [
      {
        to: "/admin/platnosci-dostep",
        label: "Płatności za dostęp",
        icon: Wallet,
        description: "Płatności klientów za dostęp do platformy.",
        synonyms: ["platnosci", "abonament", "stripe"],
      },
      {
        to: "/admin/ksiegowosc",
        label: "Pulpit księgowości",
        icon: Receipt,
        description: "Przegląd księgowości: przychody, dokumenty, rejestry.",
        synonyms: ["ksiegowosc", "rachunkowosc"],
        exact: true,
      },
      {
        to: "/admin/ksiegowosc/faktury",
        label: "Faktury sprzedaży",
        icon: FileText,
        description: "Wystawianie i przegląd faktur sprzedaży.",
        synonyms: ["faktury", "fv", "faktura"],
      },
      {
        to: "/admin/ksiegowosc/podmioty",
        label: "Podmioty gospodarcze",
        icon: Building2,
        description: "Podmioty gospodarcze używane w dokumentach i fakturach.",
        synonyms: ["podmioty", "firmy", "nip"],
      },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: Megaphone,
    hubPath: "/admin/marketing",
    accent: "magenta",
    description: "Reklamy, content, wideo, email i analityka marketingowa.",
    items: [],
    subsections: [
      {
        label: "Reklamy",
        items: [
          {
            to: "/admin/meta",
            label: "Meta Ads",
            icon: Facebook,
            description: "Kampanie reklamowe Meta (Facebook i Instagram).",
            synonyms: ["meta", "facebook ads", "reklamy fb"],
          },
          {
            to: "/admin/fb-ads/kreator",
            label: "Kreator FB Ads",
            icon: Facebook,
            description: "Kreator kreacji reklamowych na Facebooka.",
            synonyms: ["fb ads", "kreator reklam"],
          },
          {
            to: "/admin/google-ads/kreator",
            label: "Kreator Google Ads",
            icon: Search,
            description: "Kreator kampanii reklamowych Google Ads.",
            synonyms: ["google ads", "adwords"],
          },
        ],
      },
      {
        label: "Content i SEO",
        items: [
          {
            to: "/admin/ai-seo",
            label: "AI SEO Content",
            icon: FileText,
            description: "Generowanie treści SEO wspierane AI.",
            synonyms: ["seo", "content", "artykuly"],
          },
          {
            to: "/admin/ai-growth-engine",
            label: "AI Growth Engine",
            icon: Sparkles,
            description: "Silnik wzrostu: pomysły i automatyzacje marketingowe.",
            synonyms: ["growth", "wzrost"],
          },
          {
            to: "/admin/ai-outreach",
            label: "AI Outreach",
            icon: Send,
            description: "Automatyczny outreach do partnerów i mediów.",
            synonyms: ["outreach", "cold mail"],
          },
          {
            to: "/admin/pr-media",
            label: "Digital PR",
            icon: Send,
            description: "Publikacje PR i kontakty z mediami.",
            synonyms: ["pr", "media", "publikacje"],
          },
          {
            to: "/admin/ai-linkbuilding",
            label: "AI Link Building",
            icon: Link2,
            description: "Pozyskiwanie linków wspierane AI.",
            synonyms: ["linki", "linkbuilding", "backlinki"],
          },
          {
            to: "/admin/ai-serp",
            label: "SERP Tracker",
            icon: Search,
            description: "Monitoring pozycji w wynikach wyszukiwania.",
            synonyms: ["serp", "pozycje", "google pozycje"],
          },
          {
            to: "/admin/ai-competitors",
            label: "Competitor Watch",
            icon: Eye,
            description: "Obserwacja działań konkurencji.",
            synonyms: ["konkurencja", "competitors"],
          },
          {
            to: "/admin/marketing/landing",
            label: "Landing Pages",
            icon: FileText,
            description: "Strony docelowe kampanii marketingowych.",
            synonyms: ["landing", "strony docelowe", "lp"],
          },
        ],
      },
      {
        label: "Wideo i social",
        items: [
          {
            to: "/admin/marketing/social",
            label: "Social Media AI",
            icon: Sparkles,
            description: "Planowanie i generowanie postów social media.",
            synonyms: ["social", "posty", "media spolecznosciowe"],
          },
          {
            to: "/admin/studio-publikacji",
            label: "Studio publikacji",
            icon: Clapperboard,
            description: "Studio nagrań i publikacji wideo z awatarami.",
            synonyms: ["studio", "publikacje", "heygen"],
          },
          {
            to: "/admin/youtube-shorts",
            label: "YouTube Shorts",
            icon: Youtube,
            description: "Generowanie i publikacja shortów na YouTube.",
            synonyms: ["shorty", "rolki", "shorts"],
          },
          {
            to: "/admin/video-pipeline",
            label: "Pipeline YouTube",
            icon: Youtube,
            description: "Pipeline artykułów przerabianych na wideo YouTube.",
            synonyms: ["pipeline", "wideo z artykulow"],
          },
          {
            to: "/admin/materialy",
            label: "Materiały marketingowe",
            icon: ImageIcon,
            description: "Biblioteka grafik i materiałów marketingowych.",
            synonyms: ["materialy", "grafiki", "kreacje"],
          },
        ],
      },
      {
        label: "Email",
        items: [
          {
            to: "/admin/marketing/email",
            label: "Email Marketing",
            icon: Mail,
            description: "Kampanie i sekwencje email marketingowe.",
            synonyms: ["email marketing", "kampanie mailowe"],
          },
          {
            to: "/admin/mailing",
            label: "Mailing",
            icon: Mail,
            description: "Wysyłki mailingowe i newsletter.",
            synonyms: ["mailing", "newsletter", "wysylka"],
          },
        ],
      },
      {
        label: "Analityka",
        items: [
          {
            to: "/admin/marketing/tracking",
            label: "Tracking UTM",
            icon: Link2,
            description: "Śledzenie źródeł ruchu i parametrów UTM.",
            synonyms: ["utm", "tracking", "zrodla ruchu"],
          },
          {
            to: "/admin/clarity",
            label: "Clarity (UX & analiza AI)",
            icon: Eye,
            description: "Nagrania sesji i analiza UX z Microsoft Clarity.",
            synonyms: ["clarity", "ux", "heatmapy"],
          },
          {
            to: "/admin/ai-funnel",
            label: "Funnel Analyzer",
            icon: TrendingDown,
            description: "Analiza lejka konwersji wspierana AI.",
            synonyms: ["funnel", "lejek", "konwersja"],
          },
        ],
      },
    ],
  },
  {
    id: "ustawienia",
    label: "Ustawienia",
    icon: Settings,
    hubPath: "/admin/konfiguracja",
    accent: "slate",
    description: "Jednorazowa konfiguracja, integracje i uprawnienia.",
    isSettings: true,
    items: [
      {
        to: "/admin/ustawienia",
        label: "Ustawienia",
        icon: Settings,
        description: "Ogólne ustawienia platformy.",
        synonyms: ["ustawienia", "konfiguracja"],
      },
      {
        to: "/admin/integracje",
        label: "Integracje",
        icon: Plug,
        description: "Połączenia z usługami zewnętrznymi i klucze API.",
        synonyms: ["integracje", "api", "polaczenia"],
      },
      {
        to: "/admin/role",
        label: "Role użytkowników",
        icon: ShieldCheck,
        description: "Nadawanie ról i uprawnień użytkownikom.",
        synonyms: ["role", "uprawnienia"],
      },
      {
        to: "/admin/operatorzy",
        label: "Operatorzy wewnętrzni",
        icon: ShieldCheck,
        description: "Konta operatorów wewnętrznych platformy.",
        synonyms: ["operatorzy", "zespol"],
      },
      {
        to: "/admin/zespol-aktywnosc",
        label: "Zespół i aktywność",
        icon: Eye,
        description: "Aktywność zespołu i historia działań.",
        synonyms: ["aktywnosc", "logi", "audyt"],
      },
      {
        to: "/admin/zgody",
        label: "Treści zgód",
        icon: FileCheck,
        description: "Treści zgód marketingowych i regulaminów.",
        synonyms: ["zgody", "rodo", "regulamin"],
      },
      {
        to: "/admin/embed",
        label: "Wniosek do osadzenia",
        icon: Code2,
        description: "Kod osadzenia formularza wniosku na stronach zewnętrznych.",
        synonyms: ["embed", "osadzenie", "iframe"],
      },
      {
        to: "/admin/pixele",
        label: "Pixele FB",
        icon: Facebook,
        description: "Konfiguracja pixeli Facebooka i zdarzeń konwersji.",
        synonyms: ["pixel", "piksele", "konwersje fb"],
      },
      {
        to: "/admin/facebook-connect",
        label: "Facebook Connect",
        icon: Facebook,
        description: "Połączenie konta Facebook z platformą.",
        synonyms: ["facebook", "connect", "polaczenie fb"],
      },
    ],
  },
];

/** Wszystkie itemy sekcji (z podsekcjami) w kolejności deklaracji. */
export function sectionItems(section: AdminSection): AdminNavItem[] {
  return [...section.items, ...(section.subsections ?? []).flatMap((s) => s.items)];
}

export type FlatAdminNavItem = AdminNavItem & { sectionId: string; sectionLabel: string };

/** Płaska lista wszystkich itemów nawigacji — indeks wyszukiwarki. */
export const allAdminNavItems: FlatAdminNavItem[] = adminSections.flatMap((section) =>
  sectionItems(section).map((item) => ({
    ...item,
    sectionId: section.id,
    sectionLabel: section.label,
  })),
);

function itemMatches(item: AdminNavItem, pathname: string): boolean {
  return item.exact ? pathname === item.to : pathname.startsWith(item.to);
}

/**
 * Czy ścieżka należy do sekcji (hub, dowolny item albo `extraPrefixes`).
 * Działa też dla sekcji syntetycznych spoza `adminSections` (np. widok księgowości).
 */
export function isSectionActive(section: AdminSection, pathname: string): boolean {
  if (section.id === "pulpit") return pathname === "/admin" || pathname === "/admin/";
  // Puste hubPath = sekcja syntetyczna (pojedynczy link) — decydują same itemy.
  if (
    section.hubPath &&
    (pathname === section.hubPath || pathname.startsWith(section.hubPath + "/"))
  ) {
    return true;
  }
  if (sectionItems(section).some((item) => itemMatches(item, pathname))) return true;
  return (section.extraPrefixes ?? []).some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** Sekcja, do której należy bieżąca ścieżka (aktywna też na podstronach). */
export function findSectionByPath(pathname: string): AdminSection | undefined {
  if (pathname === "/admin" || pathname === "/admin/") {
    return adminSections.find((s) => s.id === "pulpit");
  }
  return adminSections.find(
    (section) => section.id !== "pulpit" && isSectionActive(section, pathname),
  );
}

/**
 * Ścieżki dostępne dla roli `ksiegowosc` — odpowiadają linkom `accountingGroups`
 * w `src/routes/admin.tsx`. Zawężają wyszukiwarkę, huby i zakładki tej roli.
 */
export const accountingAllowedPaths = [
  "/admin/ksiegowosc",
  "/admin/ksiegowosc/faktury",
  "/admin/ksiegowosc/podmioty",
  "/admin/program-posrednikow/rozliczenia",
];

/** Czy ścieżka to hub sekcji (siatka kafelków, bez zakładek). */
export function isHubPath(pathname: string): boolean {
  return adminSections.some((s) => s.id !== "pulpit" && s.hubPath === pathname);
}
