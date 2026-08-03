// Wspólne dane firmowe i buildery JSON-LD (schema.org) dla publicznych stron.
// Jedno źródło prawdy — strony (index, /pozyczki/*, kalkulatory, raport)
// importują stąd zamiast powielać dane adresowe i strukturę grafu.

export const SITE_URL = "https://financeyou.pl";

export const COMPANY = {
  name: "Finance You",
  legalName: "Finance You sp. z o.o.",
  url: SITE_URL,
  email: "kontakt@financeyou.pl",
  phone: "+48732059898",
  nip: "7010611803",
  address: {
    streetAddress: "ul. Nowogrodzka 31",
    addressLocality: "Warszawa",
    postalCode: "00-511",
    addressCountry: "PL",
  },
} as const;

/**
 * FinancialService (podklasa LocalBusiness) z pełnymi danymi firmy.
 * `areaServedName` pozwala zawęzić obszar na podstronach lokalizacyjnych
 * (np. "Kraków"); bez argumentu — cała Polska.
 */
export function financialServiceLd(opts?: { areaServedName?: string; pageUrl?: string }) {
  return {
    "@context": "https://schema.org",
    "@type": ["FinancialService", "LocalBusiness"],
    "@id": `${SITE_URL}/#organization`,
    name: `${COMPANY.name} — pożyczki pod zastaw nieruchomości`,
    legalName: COMPANY.legalName,
    url: opts?.pageUrl ?? SITE_URL,
    email: COMPANY.email,
    telephone: COMPANY.phone,
    taxID: COMPANY.nip,
    address: {
      "@type": "PostalAddress",
      ...COMPANY.address,
    },
    areaServed: opts?.areaServedName
      ? { "@type": "City", name: opts.areaServedName }
      : "PL",
    description:
      "Prywatne pożyczki pod zastaw nieruchomości w Polsce — decyzja w 24 godziny, do 1 000 000 zł.",
  };
}

export type FaqItem = { question: string; answer: string };

export function faqPageLd(faqs: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  };
}

export function breadcrumbLd(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path}`,
    })),
  };
}
