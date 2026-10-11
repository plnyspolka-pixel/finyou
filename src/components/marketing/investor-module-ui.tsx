import type { CSSProperties } from "react";
import { GRADE_BANDS, gradeRangeLabel } from "@/lib/risk-assessment/grade-bands";
import { Icon3D } from "./icon-3d";
import { investorModulePath, type FabRow, type InvestorModule } from "./investor-modules";

/**
 * Bloki podstron modułów inwestora: lista cecha → zaleta → korzyść i karty
 * modułów (landing /dla-inwestora oraz „Pozostałe moduły” na podstronach).
 * Układ responsywny w styles.css (.fy-fab-*, .fy-module-cards).
 */

const FAB_PARTS = [
  { key: "cecha", label: "Cecha", hint: "co to jest", color: "#7fb4f5" },
  { key: "zaleta", label: "Zaleta", hint: "co to robi", color: "#6fd3d0" },
  { key: "korzysc", label: "Korzyść", hint: "co zyskujesz", color: "#f0c667" },
] as const;

const labelStyle = (color: string): CSSProperties => ({
  display: "inline-block",
  fontSize: "0.68rem",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
  color,
});

/** Legenda nad listą — wyjaśnia trzy kolumny. */
export function FabLegend() {
  return (
    <ul
      aria-label="Jak czytać opis"
      style={{
        margin: "1.6rem auto 0",
        padding: 0,
        listStyle: "none",
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "0.5rem",
      }}
    >
      {FAB_PARTS.map((p, i) => (
        <li
          key={p.key}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "0.4rem 0.85rem",
            borderRadius: 999,
            border: `1px solid ${p.color}55`,
            background: `${p.color}12`,
            fontSize: "0.82rem",
          }}
        >
          <span style={labelStyle(p.color)}>
            {i + 1}. {p.label}
          </span>
          <span style={{ color: "var(--muted-foreground)" }}>— {p.hint}</span>
        </li>
      ))}
    </ul>
  );
}

function FabItem({ row }: { row: FabRow }) {
  return (
    <article
      style={{
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-2xl)",
        padding: "1.3rem",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Icon3D name={row.icon} size={44} />
        <h3 style={{ fontSize: "1.05rem", fontWeight: 800 }}>{row.title}</h3>
      </div>
      <dl className="fy-fab-grid">
        {FAB_PARTS.map((p) => {
          const benefit = p.key === "korzysc";
          return (
            <div
              key={p.key}
              className="fy-fab-cell"
              style={{
                borderRadius: "var(--radius-xl)",
                padding: "0.85rem 0.95rem",
                border: benefit ? "1px solid rgba(240,198,103,0.45)" : "1px solid var(--border)",
                background: benefit
                  ? "linear-gradient(160deg, rgba(240,198,103,0.12), rgba(240,198,103,0.04))"
                  : "rgba(120,160,255,0.04)",
              }}
            >
              <dt style={labelStyle(p.color)}>{p.label}</dt>
              <dd
                style={{
                  margin: "0.35rem 0 0",
                  fontSize: "0.88rem",
                  lineHeight: 1.55,
                  fontWeight: benefit ? 600 : 400,
                  color: benefit ? "var(--foreground)" : "var(--muted-foreground)",
                }}
              >
                {row[p.key]}
              </dd>
            </div>
          );
        })}
      </dl>
    </article>
  );
}

export function FabList({ rows }: { rows: FabRow[] }) {
  return (
    <div style={{ marginTop: "2rem", display: "grid", gap: "1rem" }}>
      {rows.map((r) => (
        <FabItem key={r.title} row={r} />
      ))}
    </div>
  );
}

function ModuleCard({ m }: { m: InvestorModule }) {
  return (
    <a
      href={investorModulePath(m.slug)}
      className="fy-module-card"
      style={{
        display: "flex",
        flexDirection: "column",
        textDecoration: "none",
        color: "inherit",
        background: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-2xl)",
        overflow: "hidden",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <img
        src={m.image}
        alt=""
        loading="lazy"
        width={1536}
        height={1024}
        style={{
          display: "block",
          width: "100%",
          height: "auto",
          aspectRatio: "3 / 2",
          objectFit: "cover",
        }}
      />
      <div
        style={{ display: "flex", flexDirection: "column", flex: 1, padding: "1rem 1.1rem 1.1rem" }}
      >
        <h3 style={{ fontSize: "1.05rem", fontWeight: 800 }}>{m.name}</h3>
        <p
          style={{
            marginTop: "0.35rem",
            flex: 1,
            fontSize: "0.85rem",
            lineHeight: 1.5,
            color: "var(--muted-foreground)",
          }}
        >
          {m.tagline}
        </p>
        <span
          style={{
            marginTop: "0.8rem",
            fontSize: "0.85rem",
            fontWeight: 700,
            color: "var(--accent)",
          }}
        >
          Zobacz moduł →
        </span>
      </div>
    </a>
  );
}

/** Karty modułów — `cols` to liczba kart w rzędzie na desktopie (niepełny rząd jest wyśrodkowany). */
export function ModuleCards({ modules, cols = 3 }: { modules: InvestorModule[]; cols?: number }) {
  return (
    <div className="fy-module-cards" style={{ "--fy-cols": cols } as CSSProperties}>
      {modules.map((m) => (
        <ModuleCard key={m.slug} m={m} />
      ))}
    </div>
  );
}

/**
 * Skala A–E oceny inwestycyjnej (Analityk AI): pięć klas z progami i kolorami
 * z GRADE_BANDS — tymi samymi, których używa panel inwestora i raport PDF —
 * pod nimi składowe oceny z wagami i twarde ograniczenia klasy.
 */
export function GradeScale({
  components,
  caps,
}: {
  components: { label: string; weight: number }[];
  caps: string;
}) {
  const maxWeight = Math.max(...components.map((c) => c.weight));
  return (
    <div style={{ marginTop: "2.5rem" }}>
      <ol className="fy-grade-grid" aria-label="Klasy oceny inwestycyjnej od A do E">
        {GRADE_BANDS.map((b) => (
          <li
            key={b.grade}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              padding: "1.1rem",
              borderRadius: "var(--radius-2xl)",
              border: `1px solid ${b.color}66`,
              background: `linear-gradient(170deg, ${b.color}26, ${b.color}08 70%)`,
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                aria-hidden
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 46,
                  height: 46,
                  flexShrink: 0,
                  borderRadius: 14,
                  background: b.color,
                  color: "#fff",
                  fontSize: "1.5rem",
                  fontWeight: 900,
                  boxShadow: `0 8px 22px -10px ${b.color}`,
                }}
              >
                {b.grade}
              </span>
              <span style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
                {gradeRangeLabel(b)} pkt
              </span>
            </div>
            <div style={{ fontSize: "0.98rem", fontWeight: 800, lineHeight: 1.25 }}>
              <span className="sr-only">Klasa {b.grade}: </span>
              {b.label}
            </div>
            <p
              style={{
                fontSize: "0.84rem",
                lineHeight: 1.5,
                color: "var(--muted-foreground)",
              }}
            >
              {b.description}
            </p>
          </li>
        ))}
      </ol>

      <div className="fy-grade-details">
        <div
          style={{
            padding: "1.3rem",
            borderRadius: "var(--radius-2xl)",
            border: "1px solid var(--border)",
            background: "var(--card)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <h3 style={{ fontSize: "1rem", fontWeight: 800 }}>Z czego składa się ocena</h3>
          <ul
            style={{
              marginTop: "0.9rem",
              padding: 0,
              listStyle: "none",
              display: "grid",
              gap: "0.6rem",
            }}
          >
            {components.map((c) => (
              <li key={c.label}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    fontSize: "0.85rem",
                  }}
                >
                  <span>{c.label}</span>
                  <span style={{ fontWeight: 700 }}>{c.weight}%</span>
                </div>
                <div
                  aria-hidden
                  style={{
                    marginTop: 5,
                    height: 6,
                    borderRadius: 999,
                    background: "rgba(120,160,255,0.12)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${(c.weight / maxWeight) * 100}%`,
                      height: "100%",
                      borderRadius: 999,
                      background: "linear-gradient(90deg, #5fa2f6, #f0c667)",
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div
          style={{
            padding: "1.3rem",
            borderRadius: "var(--radius-2xl)",
            border: "1px solid rgba(240,198,103,0.45)",
            background: "linear-gradient(160deg, rgba(240,198,103,0.12), rgba(240,198,103,0.04))",
          }}
        >
          <h3 style={{ fontSize: "1rem", fontWeight: 800 }}>Twarde reguły</h3>
          <p
            style={{
              marginTop: "0.6rem",
              fontSize: "0.88rem",
              lineHeight: 1.6,
              color: "var(--muted-foreground)",
            }}
          >
            {caps}
          </p>
          <p
            style={{
              marginTop: "0.6rem",
              fontSize: "0.88rem",
              lineHeight: 1.6,
              color: "var(--muted-foreground)",
            }}
          >
            Klasa jest neutralną klasyfikacją ryzyka, a nie rekomendacją inwestycyjną — widzisz ją w
            panelu przy wycenie Projektu i w raporcie PDF.
          </p>
        </div>
      </div>
    </div>
  );
}
