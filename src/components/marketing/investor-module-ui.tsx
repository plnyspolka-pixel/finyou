import { useEffect, useState, type CSSProperties } from "react";
import { GRADE_BANDS, gradeRangeLabel } from "@/lib/risk-assessment/grade-bands";
import { Icon3D } from "./icon-3d";
import { investorModulePath, type FabRow, type InvestorModule } from "./investor-modules";

/**
 * Bloki podstron modułów inwestora: karty funkcji i karty modułów (landing
 * /dla-inwestora oraz „Pozostałe moduły” na podstronach), a także skala A–E.
 * Układ responsywny w styles.css (.fy-feature-grid, .fy-module-cards).
 */

/**
 * Karty funkcji modułu. Pola cecha/zaleta/korzyść to tylko szkielet pisania —
 * na stronie karta czyta się jak tytuł, jeden opis i wyróżnione zdanie
 * o korzyści, bez etykiet.
 */
export function FeatureCards({ rows }: { rows: FabRow[] }) {
  return (
    <div className="fy-feature-grid">
      {rows.map((r) => (
        <article
          key={r.title}
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-2xl)",
            padding: "1.4rem",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Icon3D name={r.icon} size={44} />
            <h3 style={{ fontSize: "1.05rem", fontWeight: 800, lineHeight: 1.3 }}>{r.title}</h3>
          </div>
          <p
            style={{
              marginTop: "0.8rem",
              fontSize: "0.92rem",
              lineHeight: 1.6,
              color: "var(--muted-foreground)",
            }}
          >
            {r.cecha} {r.zaleta}
          </p>
          <p
            style={{
              marginTop: "0.7rem",
              paddingLeft: "0.75rem",
              borderLeft: "2px solid #f0c667",
              fontSize: "0.95rem",
              lineHeight: 1.55,
              fontWeight: 600,
              color: "var(--foreground)",
            }}
          >
            {r.korzysc}
          </p>
        </article>
      ))}
    </div>
  );
}

// Slajdy karty: `image` + `slides`. Przewijają się same (bez przycisków —
// cała karta jest linkiem), stoją pod kursorem i przy ograniczonym ruchu.
const SLIDE_MS = 4500;

function CardSlides({ m }: { m: InvestorModule }) {
  const images = [m.image, ...(m.slides ?? [])];
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (images.length < 2 || paused) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setIdx((i) => (i + 1) % images.length), SLIDE_MS);
    return () => window.clearInterval(t);
  }, [images.length, paused]);
  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{ position: "relative", aspectRatio: "3 / 2", overflow: "hidden" }}
    >
      {images.map((src, i) => (
        <img
          key={src}
          src={src}
          alt=""
          loading="lazy"
          width={1536}
          height={1024}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: i === idx ? 1 : 0,
            transition: "opacity .6s ease",
          }}
        />
      ))}
      {m.bonus && (
        <span
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            borderRadius: 999,
            padding: "0.3rem 0.75rem",
            fontSize: "0.75rem",
            fontWeight: 900,
            letterSpacing: "0.1em",
            background: "linear-gradient(95deg,#f0c667,#f6dc9c)",
            color: "#101430",
            boxShadow: "0 8px 24px -10px rgba(240,198,103,0.8)",
          }}
        >
          BONUS
        </span>
      )}
      {images.length > 1 && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            bottom: 10,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "center",
            gap: 6,
          }}
        >
          {images.map((src, i) => (
            <span
              key={src}
              style={{
                width: i === idx ? 18 : 7,
                height: 7,
                borderRadius: 999,
                background: i === idx ? "#f0c667" : "rgba(255,255,255,.55)",
                transition: "all .3s ease",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ModuleCard({ m, compact }: { m: InvestorModule; compact?: boolean }) {
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
      {!compact && <CardSlides m={m} />}
      <div
        style={{ display: "flex", flexDirection: "column", flex: 1, padding: "1rem 1.1rem 1.1rem" }}
      >
        <h3 style={{ fontSize: "1.05rem", fontWeight: 800 }}>
          {m.bonus && compact && <span style={{ color: "#d4a03a" }}>BONUS · </span>}
          {m.name}
        </h3>
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
          {m.slug === "szkolenie" ? "Zobacz program →" : "Zobacz moduł →"}
        </span>
      </div>
    </a>
  );
}

/**
 * Karty modułów — `cols` to liczba kart w rzędzie na desktopie (niepełny rząd
 * jest wyśrodkowany). `compact` — bez grafiki, dwie kolumny (podstrony modułów).
 */
export function ModuleCards({
  modules,
  cols = 3,
  compact = false,
}: {
  modules: InvestorModule[];
  cols?: number;
  compact?: boolean;
}) {
  return (
    <div
      className={compact ? "fy-module-cards fy-module-cards--compact" : "fy-module-cards"}
      style={compact ? undefined : ({ "--fy-cols": cols } as CSSProperties)}
    >
      {modules.map((m) => (
        <ModuleCard key={m.slug} m={m} compact={compact} />
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
