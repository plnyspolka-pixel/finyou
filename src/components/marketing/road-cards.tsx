// Karty „Twoja droga na rynek pożyczek pod zastaw nieruchomości” — sieć
// sprzedaży, szkolenie i mentoring (zawsze druga), cztery narzędzia. Ten sam
// zestaw na stronie głównej i (bez bieżącego modułu) jako „Pozostałe elementy
// abonamentu” na podstronach /dla-inwestora/<moduł>. Kolejność, grafika, opis,
// pieczątka i „szybki link” (lead magnet / produkt) z investor-modules.ts;
// tu tylko nadtytuł, ikona i wyjątek grafiki szkolenia (mentoring).
import { Icon3D, type Icon3DName } from "./icon-3d";
import { StampedFrame } from "./module-image";
import {
  INVESTOR_MODULES,
  investorModulePath,
  type InvestorModule,
  type ModuleQuickLink,
} from "./investor-modules";

type RoadCardExtra = {
  eyebrow: string;
  icon: Icon3DName;
  /** Zamiast grafiki i opisu modułu (szkolenie pokazujemy grafiką mentoringu). */
  image?: { src: string; alt: string };
  text?: string;
};

const EXTRAS: Record<string, RoadCardExtra> = {
  "siec-sprzedazy": { eyebrow: "Sprawy przychodzą do Ciebie", icon: "investors" },
  szkolenie: {
    eyebrow: "Na każdym etapie",
    icon: "handshake",
    image: {
      src: "/marketing/moduly/mentoring-1.webp",
      alt: "Mentor z 15-letnim stażem omawia z inwestorką dokumenty sprawy",
    },
    text: "7 modułów szkolenia i wsparcie inwestora z 15-letnim stażem. Nie jesteś sam — wspieramy Cię od początku do końca.",
  },
  "analityk-ai": { eyebrow: "Zanim wyłożysz", icon: "ai" },
  "kancelaria-ai": { eyebrow: "Zanim podpiszesz", icon: "documents" },
  "aml-compliance": { eyebrow: "Zanim przyjmiesz spłatę", icon: "complianceAml" },
  windykacja: { eyebrow: "Gdy rata nie przychodzi", icon: "shieldcheck" },
};

/** Drugi odnośnik pod „Poznaj szczegóły” — lead magnet, formularz albo produkt. */
export function QuickLink({ link, className }: { link: ModuleQuickLink; className?: string }) {
  return (
    <a
      className={["fy-quick-link", link.hit ? "fy-quick-link--hit" : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      href={link.href}
      download={link.download ? "" : undefined}
    >
      {link.hit && <span className="fy-hit-badge">HIT</span>}
      <span>{link.label}</span>
    </a>
  );
}

export function RoadCards({ exclude }: { exclude?: string }) {
  return (
    <div className="fy-sales-cards">
      {INVESTOR_MODULES.filter((m) => m.slug !== exclude).map((m: InvestorModule) => {
        const c = EXTRAS[m.slug];
        if (!c) return null;
        return (
          <article className="fy-sales-card fy-road-card" key={m.slug}>
            <Icon3D name={c.icon} size={48} />
            <span className="fy-sales-eyebrow">{c.eyebrow}</span>
            <h3>{m.name}</h3>
            <StampedFrame stamp={m.stamp}>
              <img
                className="fy-sales-tool-image"
                src={c.image?.src ?? m.image}
                alt={c.image?.alt ?? m.imageAlt}
                loading="lazy"
              />
            </StampedFrame>
            <p>{c.text ?? m.tagline}</p>
            {m.cardNote && <p className="fy-road-card-note">{m.cardNote}</p>}
            <div className="fy-road-card-links">
              <a className="fy-sales-link" href={investorModulePath(m.slug)}>
                Poznaj szczegóły →
              </a>
              {m.quickLink && <QuickLink link={m.quickLink} />}
            </div>
          </article>
        );
      })}
    </div>
  );
}
