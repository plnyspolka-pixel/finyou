// head() podstron produktów /pozyczka-* — meta, canonical, OG i JSON-LD
// (FinancialService, LoanOrCredit, FAQPage, BreadcrumbList).
import { getLoanProduct } from "@/lib/loan-products";
import { breadcrumbLd, faqPageLd, financialServiceLd, SITE_URL } from "@/lib/seo/company";

/** `head()` dla trasy produktu — meta, canonical, OG i JSON-LD. */
export function loanProductHead(slug: string) {
  const p = getLoanProduct(slug);
  const url = `${SITE_URL}/${p.slug}`;
  return {
    meta: [
      { title: p.metaTitle },
      { name: "description", content: p.metaDescription },
      { name: "robots", content: "index, follow, max-image-preview:large, max-snippet:-1" },
      { property: "og:title", content: p.metaTitle },
      { property: "og:description", content: p.metaDescription },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { property: "og:site_name", content: "Finance You" },
      { property: "og:locale", content: "pl_PL" },
    ],
    links: [
      { rel: "canonical", href: url },
      { rel: "alternate", hrefLang: "pl", href: url },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(financialServiceLd({ pageUrl: url })),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "LoanOrCredit",
          name: p.h1,
          description: p.metaDescription,
          url,
          provider: { "@id": `${SITE_URL}/#organization` },
          areaServed: "PL",
          currency: "PLN",
          amount: { "@type": "MonetaryAmount", currency: "PLN", maxValue: 1_000_000 },
          requiredCollateral: "Hipoteka na nieruchomości",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify(faqPageLd(p.faq.map((f) => ({ question: f.q, answer: f.a })))),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify(
          breadcrumbLd([
            { name: "Finance You", path: "/" },
            { name: "Dla klienta", path: "/dla-klienta" },
            { name: p.menuLabel, path: `/${p.slug}` },
          ]),
        ),
      },
    ],
  };
}
