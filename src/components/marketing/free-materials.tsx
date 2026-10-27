// Dział „Darmowe materiały” na landingach /dla-klienta i /dla-inwestora:
// opublikowane lead magnety grupy (PDF za e-mail → /pobierz/<slug>) i
// kalkulatory toru (/narzedzie/<slug>). Dane: getFreeMaterialsFn (loader).
import { useState, type CSSProperties } from "react";
import { Section, SectionHead } from "./sections";
import { Icon3D, type Icon3DName } from "./icon-3d";
import { MktBadge, MktButton } from "./primitives";
import {
  FREE_MATERIALS_COPY,
  FREE_MATERIALS_NOTE,
  FREE_MATERIALS_SECTION_ID,
  freeMaterialHref,
  type FreeMaterial,
  type FreeMaterials,
  type FreeTool,
} from "@/lib/lead-magnets/free-materials";
import type { CatalogSlug } from "@/lib/lead-magnets/catalog-slugs";
import type { LeadMagnetAudience } from "@/lib/lead-magnets/core";
import { FREE_LESSON_COPY, FREE_LESSON_SLUG } from "@/lib/free-lesson";

export const CATALOG_ICON: Record<CatalogSlug, Icon3DName> = {
  "start-inwestora": "knowledge",
  "checklista-ksiegi-wieczystej": "procedures",
  "bledy-inwestora": "shieldcheck",
  "wzor-umowy-pozyczki": "documents",
  "bank-odmowil-co-dalej": "loan",
  "checklista-dokumentow": "dossier",
  "od-wniosku-do-wyplaty": "status",
};

export function FreeMaterialsSection({ data }: { data: FreeMaterials }) {
  if (data.materials.length === 0 && data.tools.length === 0) return null;
  const copy = FREE_MATERIALS_COPY[data.audience];
  return (
    <Section id={FREE_MATERIALS_SECTION_ID} tint>
      <SectionHead eyebrow={copy.eyebrow} title={copy.title} sub={copy.sub} />

      {/* Dwa podpisane bloki — nie mieszamy materiałów i kalkulatorów w jednej siatce. */}
      {data.materials.length > 0 && (
        <>
          <h3 style={blockTitle}>Do pobrania</h3>
          <div style={grid}>
            {data.materials.map((m) => (
              <MaterialCard key={m.slug} audience={data.audience} m={m} />
            ))}
          </div>
        </>
      )}
      {data.tools.length > 0 && (
        <>
          <h3 style={blockTitle}>Kalkulatory online</h3>
          <div style={grid}>
            {data.tools.map((t) => (
              <ToolCard key={t.slug} t={t} />
            ))}
          </div>
        </>
      )}

      <p
        style={{
          marginTop: "1.6rem",
          maxWidth: "52rem",
          fontSize: "0.78rem",
          lineHeight: 1.55,
          color: "var(--muted-foreground)",
        }}
      >
        {FREE_MATERIALS_NOTE}
      </p>
    </Section>
  );
}

const blockTitle: CSSProperties = {
  marginTop: "2.2rem",
  fontSize: "1.2rem",
  fontWeight: 750,
};

const grid: CSSProperties = {
  marginTop: "1rem",
  display: "grid",
  gap: "1rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 17rem), 1fr))",
  gridAutoRows: "1fr",
};

function useCard(): [
  boolean,
  CSSProperties,
  { onMouseEnter: () => void; onMouseLeave: () => void },
] {
  const [h, setH] = useState(false);
  const style: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    background: "var(--card)",
    border: `1px solid ${h ? "var(--accent)" : "var(--border)"}`,
    borderRadius: "var(--radius-2xl)",
    padding: "1.4rem",
    boxShadow: h ? "var(--shadow-lg)" : "var(--shadow-sm)",
    transform: h ? "translateY(-2px)" : "none",
    transition: "all var(--duration-base) var(--ease-out)",
  };
  return [h, style, { onMouseEnter: () => setH(true), onMouseLeave: () => setH(false) }];
}

function MaterialCard({ audience, m }: { audience: LeadMagnetAudience; m: FreeMaterial }) {
  const [, style, handlers] = useCard();
  const icon: Icon3DName = m.catalog
    ? CATALOG_ICON[m.catalog]
    : m.material_type === "video"
      ? "training"
      : "documents";
  // Lekcja 1: opis zgodny z nagraniem (FREE_LESSON_COPY), niezależnie od bazy.
  const lesson = m.slug === FREE_LESSON_SLUG;
  const title = lesson ? FREE_LESSON_COPY.title : m.title;
  const headline = lesson ? FREE_LESSON_COPY.subtitle : m.headline;
  const benefits: readonly string[] = lesson ? FREE_LESSON_COPY.benefits : m.benefits;
  return (
    <article {...handlers} style={style}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Icon3D name={icon} size={48} />
        <MktBadge variant="secondary">
          {m.material_type === "video" ? "Wideo · bezpłatnie" : "PDF · bezpłatnie"}
        </MktBadge>
      </div>
      <h3 style={{ marginTop: "0.9rem", fontSize: "1.05rem", fontWeight: 700, lineHeight: 1.3 }}>
        {title}
      </h3>
      <p
        style={{
          marginTop: "0.55rem",
          fontSize: "0.88rem",
          lineHeight: 1.55,
          color: "var(--muted-foreground)",
        }}
      >
        {headline}
      </p>
      {benefits.length > 0 && (
        <ul
          style={{
            margin: "0.7rem 0 0",
            paddingLeft: "1.1rem",
            listStyle: "disc",
            fontSize: "0.84rem",
            lineHeight: 1.5,
            color: "var(--muted-foreground)",
          }}
        >
          {benefits.map((b) => (
            <li key={b} style={{ marginTop: "0.3rem" }}>
              {b}
            </li>
          ))}
        </ul>
      )}
      <div style={{ marginTop: "auto", paddingTop: "1.1rem" }}>
        <MktButton variant="outline" size="sm" href={freeMaterialHref(audience, m.slug)}>
          {m.cta_text} →
        </MktButton>
      </div>
    </article>
  );
}

function ToolCard({ t }: { t: FreeTool }) {
  const [, style, handlers] = useCard();
  return (
    <article {...handlers} style={style}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Icon3D name="calculator" size={48} />
        <MktBadge variant="secondary">Narzędzie · online</MktBadge>
      </div>
      <h3 style={{ marginTop: "0.9rem", fontSize: "1.05rem", fontWeight: 700, lineHeight: 1.3 }}>
        {t.title}
      </h3>
      <p
        style={{
          marginTop: "0.55rem",
          fontSize: "0.88rem",
          lineHeight: 1.55,
          color: "var(--muted-foreground)",
        }}
      >
        {t.promise}
      </p>
      <div style={{ marginTop: "auto", paddingTop: "1.1rem" }}>
        <MktButton variant="outline" size="sm" href={t.url}>
          Policz teraz
        </MktButton>
      </div>
    </article>
  );
}
