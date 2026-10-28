// Karty „Twoja droga na rynek pożyczek pod zastaw nieruchomości” — sieć
// sprzedaży, cztery narzędzia, szkolenie i indywidualny mentoring. Ten sam
// zestaw na stronie głównej i (bez bieżącego modułu) jako „Pozostałe elementy
// abonamentu” na podstronach /dla-inwestora/<moduł>. Grafika, opis i link
// z investor-modules.ts; tu tylko kolejność, nadtytuł, ikona i wyjątki.
import { Icon3D, type Icon3DName } from "./icon-3d";
import { investorModuleBySlug, investorModulePath } from "./investor-modules";

type RoadCard = {
  slug: string;
  eyebrow: string;
  icon: Icon3DName;
  /** Zamiast grafiki i opisu modułu (szkolenie pokazujemy grafiką mentoringu). */
  image?: { src: string; alt: string };
  text?: string;
};

const ROAD_CARDS: RoadCard[] = [
  { slug: "siec-sprzedazy", eyebrow: "Sprawy przychodzą do Ciebie", icon: "investors" },
  { slug: "analityk-ai", eyebrow: "Zanim wyłożysz", icon: "ai" },
  { slug: "kancelaria-ai", eyebrow: "Zanim podpiszesz", icon: "documents" },
  { slug: "aml-compliance", eyebrow: "Zanim przyjmiesz spłatę", icon: "complianceAml" },
  { slug: "windykator-ai", eyebrow: "Gdy rata nie przychodzi", icon: "shieldcheck" },
  {
    slug: "szkolenie",
    eyebrow: "Na każdym etapie",
    icon: "handshake",
    image: {
      src: "/marketing/moduly/mentoring-1.webp",
      alt: "Mentor z 15-letnim stażem omawia z inwestorką dokumenty sprawy",
    },
    text: "7 modułów szkolenia i wsparcie inwestora z 15-letnim stażem w pożyczkach pod zastaw nieruchomości. Nie jesteś sam — wspieramy Cię od początku do końca.",
  },
];

export function RoadCards({ exclude }: { exclude?: string }) {
  return (
    <div className="fy-sales-cards">
      {ROAD_CARDS.filter((c) => c.slug !== exclude).map((c) => {
        const m = investorModuleBySlug(c.slug);
        if (!m) return null;
        return (
          <article className="fy-sales-card" key={c.slug}>
            <Icon3D name={c.icon} size={48} />
            <span className="fy-sales-eyebrow">{c.eyebrow}</span>
            <h3>{m.name}</h3>
            <img
              className="fy-sales-tool-image"
              src={c.image?.src ?? m.image}
              alt={c.image?.alt ?? m.imageAlt}
              loading="lazy"
            />
            <p>{c.text ?? m.tagline}</p>
            <a className="fy-sales-link" href={investorModulePath(m.slug)}>
              Poznaj szczegóły →
            </a>
          </article>
        );
      })}
    </div>
  );
}
