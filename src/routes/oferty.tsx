import { createFileRoute } from "@tanstack/react-router";
import { RecentApplicationsList } from "@/components/landing/recent-applications-list";

const TITLE = "Oferty pożyczek pod zastaw nieruchomości — aktualne wnioski | Finance You";
const DESCRIPTION =
  "Aktualne oferty pożyczek pod zastaw nieruchomości w Polsce. Kwoty, okresy, oprocentowanie i miasto — wnioski klientów po kalkulatorze, czekające na inwestora. Aktualizacja codzienna.";
const URL = "https://financeyou.pl/oferty";
const OG_IMAGE = "https://financeyou.pl/og/oferty.jpg";

export const Route = createFileRoute("/oferty")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      {
        name: "keywords",
        content:
          "oferty pożyczek pod zastaw nieruchomości, pożyczki pod hipotekę, pożyczka prywatna, pożyczka pozabankowa, inwestycje w pożyczki, pożyczki społecznościowe, pożyczki zabezpieczone",
      },
      { name: "robots", content: "index, follow, max-image-preview:large" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:url", content: URL },
      { property: "og:locale", content: "pl_PL" },
      { property: "og:image", content: OG_IMAGE },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
      { name: "twitter:image", content: OG_IMAGE },
    ],
    links: [
      { rel: "canonical", href: URL },
      { rel: "alternate", hrefLang: "pl", href: URL },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Oferty pożyczek pod zastaw nieruchomości",
          description: DESCRIPTION,
          url: URL,
          inLanguage: "pl-PL",
          isPartOf: {
            "@type": "WebSite",
            name: "Finance You",
            url: "https://financeyou.pl",
          },
          about: {
            "@type": "FinancialProduct",
            name: "Pożyczka pod zastaw nieruchomości",
            areaServed: "PL",
          },
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Strona główna",
              item: "https://financeyou.pl/",
            },
            { "@type": "ListItem", position: 2, name: "Oferty", item: URL },
          ],
        }),
      },
    ],
  }),
  component: OfertyPage,
});

function OfertyPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 pt-10 md:px-6 md:pt-14">
        <nav aria-label="breadcrumb" className="text-xs text-muted-foreground">
          <a href="/" className="hover:underline">
            Strona główna
          </a>
          <span className="mx-2">/</span>
          <span className="text-foreground">Oferty</span>
        </nav>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
          Oferty pożyczek pod zastaw nieruchomości
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
          Aktualne wnioski klientów po przejściu kalkulatora — kwoty, okresy i miasta czekające na
          inwestora. Filtruj po typie nieruchomości, kwocie i oprocentowaniu.
        </p>
      </div>
      <RecentApplicationsList />
    </main>
  );
}
