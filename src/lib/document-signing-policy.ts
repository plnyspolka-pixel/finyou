/**
 * Konserwatywna biała lista podpisu dokumentowego Finance You.
 * To ocena przydatności modułu podpisu, NIE kwalifikowana opinia prawna.
 * Brak pozycji na liście => brak oferty podpisania zwykłym e-podpisem.
 *
 * Podstawy: art. 77(2)-77(3), 78(1), 720 §2, 876 §2, 245 §2 KC,
 * art. 31 UKWH, art. 777 KPC; pisma procesowe wymagają właściwej
 * drogi wniesienia do sądu/organów (nie podpisu z własnej aplikacji).
 */
export type SigningDecision = { allowed: boolean; reason: string };
export const LOAN_PACKAGE_SLUG = "silnik-umow-komplet";

const DOCUMENTARY_SIGNATURE_SLUGS = new Set([
  "02-monit-przypomnienie-o-platnosci",
  "03-wezwanie-do-zaplaty-standardowe",
  "04-ostateczne-przedsadowe-wezwanie-do-zaplaty",
  "05-wezwanie-do-zaplaty-do-poreczyciela",
  "06-wezwanie-z-ostrzezeniem-big-krd",
  "07-oswiadczenie-o-uznaniu-dlugu",
  "09-protokol-z-negocjacji-windykacyjnych",
  "10-oswiadczenie-o-potraceniu-wierzytelnosci",
  "12-zawiadomienie-o-cesji-wierzytelnosci",
  "u07-pokwitowanie-wyplaty-pozyczki",
]);

const NOTARY_SLUGS = new Set([
  "u05-oswiadczenie-777-instrukcja-dla-notariusza",
  "u06-hipoteka-oswiadczenie-i-wniosek-o-wpis",
  "22-zgoda-na-wykreslenie-hipoteki",
  "21-promesa-wykreslenia-hipoteki",
]);

const COURT_SLUGS = new Set([
  "13-oswiadczenie-wierzyciela-art-786-kpc",
  "14-wniosek-o-klauzule-wykonalnosci-777",
  "15-wniosek-o-przyspieszenie-klauzuli",
  "16-skarga-na-przewleklosc-postepowania",
  "17-pozew-o-zaplate",
  "18-wniosek-o-zabezpieczenie-roszczenia",
  "19-wniosek-egzekucyjny-do-komornika",
  "20-wniosek-o-wyjawienie-majatku",
  "25-zawiadomienie-o-mozliwosci-popelnienia-przestepstwa",
]);

const WRITTEN_OR_SPECIAL_SLUGS = new Set([
  "01-aneks-przedluzenie-terminu-i-prowizja",
  "08-ugoda-rozlozenie-na-raty",
  "11-umowa-przelewu-wierzytelnosci-cesja",
]);

const INFORMATIVE_SLUGS = new Set([
  "00-spis-tresci-i-instrukcja-pakietu",
  "procedura-aml-cft-b2b",
  "u09-karta-aml-kyc-ocena-ryzyka",
  "u08-klauzula-informacyjna-rodo",
  "23-zalacznik-3-tabela-oplat-windykacyjnych",
  "24-rejestr-kosztow-windykacyjnych",
]);

export function eligibilityForTemplateSlug(slug: string | null | undefined): SigningDecision {
  if (!slug) return { allowed: false, reason: "Brak klasyfikacji dokumentu. Podpis dokumentowy nie jest dostępny." };
  if (DOCUMENTARY_SIGNATURE_SLUGS.has(slug)) {
    return { allowed: true, reason: "Dopuszczony podpis dokumentowy (art. 77² i 77³ KC), o ile umowa stron nie wymaga formy surowszej." };
  }
  if (NOTARY_SLUGS.has(slug)) {
    return { allowed: false, reason: "Czynność związana z hipoteką albo art. 777 KPC wymaga notariusza lub szczególnej formy. Nie oferujemy podpisu dokumentowego." };
  }
  if (COURT_SLUGS.has(slug)) {
    return { allowed: false, reason: "Pismo do sądu, komornika albo organu należy złożyć właściwą drogą i w wymaganej formie; podpis dokumentowy Finance You jej nie zastępuje." };
  }
  if (WRITTEN_OR_SPECIAL_SLUGS.has(slug)) {
    return { allowed: false, reason: "Forma zależy od pierwotnej umowy, rodzaju wierzytelności albo szczególnych warunków. Wymaga odrębnej weryfikacji lub podpisu kwalifikowanego." };
  }
  if (INFORMATIVE_SLUGS.has(slug)) {
    return { allowed: false, reason: "Materiał informacyjny, instrukcja lub wewnętrzny rejestr — nie jest przewidziany do podpisu przez strony." };
  }
  return { allowed: false, reason: "Niezweryfikowany wzór — e-podpis wyłączony do czasu weryfikacji prawnej." };
}

export function eligibilityForGeneratedDocument(
  document: { template_slug?: string | null; form_data?: unknown },
): SigningDecision {
  if (document.template_slug !== LOAN_PACKAGE_SLUG) {
    return eligibilityForTemplateSlug(document.template_slug);
  }
  const raw = document.form_data;
  const meta = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>).audyt : undefined;
  const audited = meta && typeof meta === "object" && !Array.isArray(meta)
    ? meta as Record<string, unknown> : null;
  if (audited?.ma_poreczyciela === true) {
    return { allowed: false, reason: "Pakiet zawiera oświadczenie poręczyciela. Art. 876 §2 KC wymaga formy pisemnej pod rygorem nieważności; podpis dokumentowy wyłączony dla całego pliku." };
  }
  if (audited?.ma_poreczyciela !== false) {
    return { allowed: false, reason: "Wersja pakietu bez potwierdzonego statusu poręczenia. Nie można bezpiecznie zaoferować podpisu dokumentowego." };
  }
  return { allowed: true, reason: "Pakiet bez poręczenia może zostać podpisany dokumentowo jako umowa pożyczki. Akt hipoteki i art. 777 nadal osobno u notariusza." };
}

export function eligibleTemplateSlugs(): readonly string[] {
  return [...DOCUMENTARY_SIGNATURE_SLUGS];
}
