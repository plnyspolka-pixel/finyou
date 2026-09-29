// Wspólne dane firmowe i buildery JSON-LD (schema.org) dla publicznych stron.
// Jedno źródło prawdy — strony (index, /pozyczki/*, kalkulatory, raport)
// importują stąd zamiast powielać dane adresowe i strukturę grafu.

import { COMPANY_DATA } from "@/lib/company";

export const SITE_URL = COMPANY_DATA.website;

export const COMPANY = {
  name: COMPANY_DATA.name,
  legalName: COMPANY_DATA.legalName,
  url: SITE_URL,
  email: COMPANY_DATA.email,
  phone: COMPANY_DATA.phone.e164,
  nip: COMPANY_DATA.nip,
  address: {
    streetAddress: COMPANY_DATA.street,
    addressLocality: COMPANY_DATA.city,
    postalCode: COMPANY_DATA.postalCode,
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
    areaServed: opts?.areaServedName ? { "@type": "City", name: opts.areaServedName } : "PL",
    description:
      "Prywatne pożyczki dla firm pod zastaw nieruchomości w Polsce (wyłącznie cel związany z działalnością gospodarczą) — decyzja w 24 godziny, do 1 000 000 zł.",
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
