// Sekcje poradnikowe podstrony produktu: ile można pożyczyć (przykład LTV),
// treść produktowa, koszty, porównanie z bankiem, branże, poradniki z bloga.
// Treść: src/lib/loan-product-guides.ts. Wszystko renderowane po stronie
// serwera — Google widzi pełny tekst i linki.
import type { CSSProperties } from "react";
import { Section, SectionHead } from "@/components/marketing/sections";
import { formatPLN } from "@/lib/labels";
import { kwotaNaReke } from "@/lib/contract-engine/fees";
import {
  BANK_COMPARISON,
  COST_ITEMS,
  INDUSTRIES,
  exampleLoanAmount,
  type ProductGuide,
} from "@/lib/loan-product-guides";

const wrap: CSSProperties = { maxWidth: "52rem", margin: "0 auto" };
const para: CSSProperties = {
  marginTop: "1rem",
  fontSize: "1rem",
  lineHeight: 1.7,
  color: "var(--foreground)",
};
const card: CSSProperties = {
  padding: "1.1rem 1.2rem",
  borderRadius: "var(--radius-xl)",
  border: "1px solid var(--border)",
  background: "var(--card)",
};
const muted: CSSProperties = {
  marginTop: "0.35rem",
  fontSize: "0.88rem",
  lineHeight: 1.55,
  color: "var(--muted-foreground)",
};
const cell: CSSProperties = {
  padding: "0.7rem 0.8rem",
  borderBottom: "1px solid var(--border)",
  textAlign: "left",
  verticalAlign: "top",
  fontSize: "0.9rem",
  lineHeight: 1.45,
};

const num: CSSProperties = { ...cell, textAlign: "right", whiteSpace: "nowrap" };
const small: CSSProperties = { ...cell, fontSize: "0.82rem", padding: "0.6rem 0.45rem" };

/** Ile można pożyczyć + treść produktowa — zaraz pod opisem „jak to działa”. */
export function LoanGuideTop({ guide, productName }: { guide: ProductGuide; productName: string }) {
  const ex = guide.ltvExample;
  const amount = exampleLoanAmount(ex);
  return (
    <>
      <Section tint id="ile-mozna-pozyczyc">
        <div style={wrap}>
          <SectionHead
            eyebrow="Kwota"
            title={`Ile można pożyczyć — ${productName.toLowerCase()}`}
            sub="Kwota zależy od wartości nieruchomości i jej obecnych obciążeń (LTV — stosunek pożyczki do wartości zabezpieczenia)."
          />
          <p style={para}>
            Inwestorzy finansują zwykle do 50–60% wartości rynkowej nieruchomości, w kwotach do{" "}
            {formatPLN(1_000_000)}. Od tej kwoty odejmuje się zadłużenie, które już ciąży na
            nieruchomości — chyba że pożyczka ma je spłacić. Dokładną kwotę policzysz w{" "}
            <a href="/kalkulator-ltv">kalkulatorze LTV</a>.
          </p>
          <div style={{ ...card, marginTop: "1.5rem" }}>
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
              Przykład (orientacyjny): {ex.label}
            </h3>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.8rem" }}>
              <tbody>
                <tr>
                  <th style={cell}>Wartość rynkowa</th>
                  <td style={num}>{formatPLN(ex.propertyValue)}</td>
                </tr>
                <tr>
                  <th style={cell}>Przyjęte LTV</th>
                  <td style={num}>{ex.ltvPct}%</td>
                </tr>
                {ex.existingDebt ? (
                  <tr>
                    <th style={cell}>Obecne zadłużenie do spłaty</th>
                    <td style={num}>− {formatPLN(ex.existingDebt)}</td>
                  </tr>
                ) : null}
                <tr>
                  <th style={cell}>Orientacyjna kwota pożyczki</th>
                  <td style={{ ...num, fontWeight: 800 }}>{formatPLN(amount)}</td>
                </tr>
                <tr>
                  <th style={{ ...cell, borderBottom: 0 }}>Na konto po potrąceniu prowizji</th>
                  <td style={{ ...num, borderBottom: 0 }}>{formatPLN(kwotaNaReke(amount))}</td>
                </tr>
              </tbody>
            </table>
            <p style={muted}>
              Przykład poglądowy — ostateczną kwotę, okres i koszt określa propozycja inwestora po
              analizie księgi wieczystej i wyceny.
            </p>
          </div>
        </div>
      </Section>

      {/* Jedna sekcja z kilkoma H2 — zachowuje naprzemienne tło sekcji strony. */}
      <Section>
        <div style={wrap}>
          {guide.sections.map((s, i) => (
            <div key={s.h} style={{ marginTop: i === 0 ? 0 : "2.75rem" }}>
              <h2 style={{ margin: 0, fontSize: "clamp(1.4rem, 2.6vw, 1.9rem)", fontWeight: 800 }}>
                {s.h}
              </h2>
              {s.p.map((t) => (
                <p key={t.slice(0, 40)} style={para}>
                  {t}
                </p>
              ))}
              {s.list && (
                <ul style={{ margin: "1rem 0 0", paddingLeft: "1.2rem", display: "grid", gap: 6 }}>
                  {s.list.map((li) => (
                    <li key={li} style={{ fontSize: "0.98rem", lineHeight: 1.6 }}>
                      {li}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

/** Koszty, porównanie z bankiem, branże i poradniki — pod procedurą, przed FAQ. */
export function LoanGuideBottom({
  guide,
  productName,
}: {
  guide: ProductGuide;
  productName: string;
}) {
  return (
    <>
      <Section id="koszty">
        <div style={wrap}>
          <SectionHead
            eyebrow="Koszty"
            title="Ile kosztuje pożyczka — z czego składa się koszt"
            sub="Wszystkie koszty widzisz w propozycji przed podpisaniem umowy."
          />
          <div
            style={{
              marginTop: "1.5rem",
              display: "grid",
              gap: "0.9rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(15rem, 1fr))",
            }}
          >
            {COST_ITEMS.map((c) => (
              <div key={c.t} style={card}>
                <h3 style={{ margin: 0, fontSize: "0.98rem", fontWeight: 700 }}>{c.t}</h3>
                <p style={muted}>{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section tint id="porownanie">
        <div style={wrap}>
          <SectionHead
            eyebrow="Porównanie"
            title={`${productName} czy kredyt firmowy w banku?`}
            sub="Bank jest zwykle tańszy, ale wolniejszy i bardziej wymagający. Pożyczka pod zastaw wygrywa czasem i dostępnością."
          />
          <div style={{ overflowX: "auto", marginTop: "1.5rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={small} scope="col" />
                  <th style={{ ...small, fontWeight: 700 }} scope="col">
                    Kredyt w banku
                  </th>
                  <th style={{ ...small, fontWeight: 700 }} scope="col">
                    Pożyczka pod zastaw (Finance You)
                  </th>
                </tr>
              </thead>
              <tbody>
                {BANK_COMPARISON.map((r) => (
                  <tr key={r.k}>
                    <th style={{ ...small, fontWeight: 600 }} scope="row">
                      {r.k}
                    </th>
                    <td style={{ ...small, color: "var(--muted-foreground)" }}>{r.bank}</td>
                    <td style={small}>{r.fy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section id="branze">
        <div style={wrap}>
          <SectionHead
            eyebrow="Dla kogo"
            title="Dla jakich firm — przykłady z wniosków"
            sub="Finansujemy wyłącznie cele związane z działalnością gospodarczą lub rolniczą."
          />
          <div
            style={{
              marginTop: "1.5rem",
              display: "grid",
              gap: "0.9rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))",
            }}
          >
            {INDUSTRIES.map((b) => (
              <div key={b.t} style={card}>
                <h3 style={{ margin: 0, fontSize: "0.98rem", fontWeight: 700 }}>{b.t}</h3>
                <p style={muted}>{b.d}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {guide.related.length > 0 && (
        <Section tint id="poradniki">
          <div style={wrap}>
            <SectionHead eyebrow="Poradniki" title="Przeczytaj, zanim złożysz wniosek" />
            <ul style={{ margin: "1.5rem 0 0", paddingLeft: "1.2rem", display: "grid", gap: 10 }}>
              {guide.related.map((r) => (
                <li key={r.slug} style={{ fontSize: "1rem", lineHeight: 1.5 }}>
                  <a href={`/blog/${r.slug}`}>{r.title}</a>
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}
    </>
  );
}
