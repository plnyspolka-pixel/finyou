import { createFileRoute } from "@tanstack/react-router";
import { HomeLanding } from "@/components/landing/home-landing";
import { financialServiceLd } from "@/lib/seo/company";

/**
 * Kopia landinga finansowego `/` dla operatora Pawła Rutki —
 * w headerze i stopce jego numer telefonu zamiast firmowego.
 * `noindex`, żeby kopia nie konkurowała w Google ze stroną główną.
 */

export const PHONE_DISPLAY = "+48 515 568 775";
export const PHONE_HREF = "+48515568775";

export const Route = createFileRoute("/pawel")({
  head: () => ({
    meta: [
      { title: "Pożyczka pod zastaw nieruchomości — do 1 mln zł, decyzja w 24 h | Finance You" },
      {
        name: "description",
        content:
          "Pożyczka pod zastaw nieruchomości w Polsce do 1 000 000 zł. Decyzja w 24 godziny. Wypełnij wniosek online — wybierz typ nieruchomości, kwotę, okres i dołącz dokumenty.",
      },
      { name: "robots", content: "noindex, follow" },
      { property: "og:title", content: "Pożyczka pod zastaw nieruchomości — Finance You" },
      { property: "og:description", content: "Do 1 mln zł. Decyzja w 24 h. Złóż wniosek online." },
      { property: "og:url", content: "https://financeyou.pl/pawel" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://financeyou.pl/pawel" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(financialServiceLd({ pageUrl: "https://financeyou.pl/pawel" })),
      },
    ],
  }),
  component: PawelLanding,
});

function PawelLanding() {
  return (
    <HomeLanding
      contact={{ phone: PHONE_DISPLAY, phoneHref: PHONE_HREF }}
      chatSource="landing:pawel"
    />
  );
}
