import { COMPANY_DATA, COMPANY_REGISTRY_LINE } from "@/lib/company";
import { useState } from "react";
import type { ReactNode } from "react";
import { FinanceYouLogo } from "@/components/finance-you-logo";
import { MktButton } from "./primitives";
import { ACTIVE_SOCIAL_LINKS, type SocialKey } from "./social-links";
import { INVESTOR_MODULES, investorModulePath } from "./investor-modules";

/**
 * Finance You — marketing chrome (header, footer, sticky CTA) + shell wrapper.
 * The shell applies the `.fy-marketing` scope so the dark-glow theme stays on
 * the public pages and never leaks into the authenticated app.
 */

export type MarketingPage =
  | "home"
  | "klient"
  | "inwestor"
  | "inwestorModul"
  | "posrednik"
  | "blog"
  | "kalkulator";

const CONTACT = { phone: COMPANY_DATA.phone.display, email: COMPANY_DATA.email };

/** Monochromatyczne glify marek (viewBox 24×24, wypełnienie `currentColor`). */
const SOCIAL_ICON_PATHS: Record<SocialKey, string> = {
  facebook:
    "M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z",
  instagram:
    "M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z",
  youtube:
    "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  tiktok:
    "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  x: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
  linkedin:
    "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
};

function SocialIcon({ name, size = 18 }: { name: SocialKey; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={SOCIAL_ICON_PATHS[name]} />
    </svg>
  );
}

const PAGE_PATH: Record<MarketingPage, string> = {
  home: "/",
  klient: "/dla-klienta",
  inwestor: "/dla-inwestora",
  inwestorModul: "/dla-inwestora",
  posrednik: "/dla-posrednika",
  blog: "/blog",
  kalkulator: "/kalkulator-ltv",
};

/** Pozycja nawigacji podświetlana na danej stronie — podstrony modułów należą do „Inwestor". */
const NAV_KEY: Partial<Record<MarketingPage, string>> = { inwestorModul: "inwestor" };

const HEADER_CTA: Record<MarketingPage, { label: string; href: string }> = {
  home: { label: "Wybierz ścieżkę", href: "#sciezki" },
  klient: { label: "Złóż wniosek", href: "/rejestracja?role=klient" },
  // Inwestor najpierw poznaje warunki w cenniku (abonament), potem zakłada konto
  // (nagłówek z page="inwestor" renderuje się tylko na /dla-inwestora).
  inwestor: { label: "Dołącz do klubu", href: "#cennik" },
  // Podstrony modułów (/dla-inwestora/<moduł>) — ten sam cel, ale pełną ścieżką.
  inwestorModul: { label: "Dołącz do klubu", href: "/dla-inwestora#cennik" },
  posrednik: { label: "Dołącz jako pośrednik", href: "/rejestracja?role=posrednik" },
  blog: { label: "Wybierz ścieżkę", href: "/#sciezki" },
  kalkulator: { label: "Złóż wniosek", href: "/dla-klienta" },
};

/** Kotwice podstron inwestora na /dla-inwestora — sub-menu pod pozycją "Inwestor".
 *  `hidden` zdejmuje wpis z menu, gdy sekcja jest schowana na landingu
 *  (flagi SHOW w routes/dla-inwestora.tsx) — wpis zostaje, żeby dało się go przywrócić. */
const INVESTOR_ANCHORS: { label: string; hash: string; hidden?: boolean }[] = [
  { label: "Akademia Inwestora", hash: "#akademia", hidden: true },
  { label: "7 warstw ochrony inwestycji", hash: "#ochrona", hidden: true },
  { label: "Windykacja AI", hash: "#windykacja-ai", hidden: true },
  { label: "Co zyskujesz", hash: "#korzysci" },
  { label: "Cennik", hash: "#cennik" },
];

type InvestorMenuLink = { label: string; href: string; sep?: boolean };

/** Sub-menu "Inwestor": najpierw podstrony modułów (/dla-inwestora/<moduł>),
 *  potem kotwice landingu — na samym landingu same hashe, gdzie indziej pełna ścieżka. */
function investorMenuLinks(page: MarketingPage): InvestorMenuLink[] {
  const modules = INVESTOR_MODULES.map((m) => ({
    label: m.menuLabel,
    href: investorModulePath(m.slug),
  }));
  const anchors = INVESTOR_ANCHORS.filter((a) => !a.hidden).map((a, i) => ({
    label: a.label,
    href: page === "inwestor" ? a.hash : PAGE_PATH.inwestor + a.hash,
    sep: i === 0,
  }));
  return [...modules, ...anchors];
}

export function SiteHeader({ page = "home" }: { page?: MarketingPage }) {
  const [open, setOpen] = useState(false);
  const active = NAV_KEY[page] ?? page;
  const nav = [
    { label: "Klient", href: PAGE_PATH.klient, key: "klient" as const },
    { label: "Inwestor", href: PAGE_PATH.inwestor, key: "inwestor" as const },
    { label: "Jak działa", href: page === "home" ? "#jak-dziala" : "/#jak-dziala", key: "jak" },
    { label: "Blog", href: "/blog", key: "blog" },
    {
      label: "FAQ",
      href:
        page === "blog"
          ? "/dla-klienta#faq"
          : page === "inwestorModul"
            ? "/dla-inwestora#faq"
            : "#faq",
      key: "faq",
    },
  ];
  const investorLinks = investorMenuLinks(page);
  const cta = HEADER_CTA[page];
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        borderBottom: "1px solid rgba(84,124,214,0.25)",
        background: "rgba(9,14,38,0.8)",
        backdropFilter: "blur(14px)",
      }}
    >
      <div
        style={{
          maxWidth: "80rem",
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          padding: "0.7rem 1.5rem",
        }}
      >
        <a
          href="/"
          style={{ display: "flex", alignItems: "center" }}
          aria-label="Finance You — strona główna"
        >
          <FinanceYouLogo variant="dark" size="lg" />
        </a>
        <nav className="fy-nav-desktop" style={{ display: "flex", gap: "1.4rem" }}>
          {nav.map((n) => {
            const link = (
              <a
                key={n.key}
                href={n.href}
                style={{
                  fontSize: "0.85rem",
                  fontWeight: active === n.key ? 700 : 500,
                  color: active === n.key ? "var(--accent)" : "var(--muted-foreground)",
                  textDecoration: "none",
                }}
              >
                {n.label}
              </a>
            );
            if (n.key !== "inwestor") return link;
            return (
              <div key={n.key} className="fy-nav-drop">
                {link}
                <div className="fy-nav-drop-panel">
                  {investorLinks.map((l) => (
                    <a
                      key={l.label}
                      href={l.href}
                      className={l.sep ? "fy-nav-drop-sep" : undefined}
                    >
                      {l.label}
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <div
          className="fy-nav-desktop"
          style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
        >
          <MktButton size="sm" variant="ghost" href="/logowanie">
            Zaloguj
          </MktButton>
          <MktButton size="sm" variant="cta" href={cta.href}>
            {cta.label}
          </MktButton>
        </div>
        <div
          className="fy-nav-mobile"
          style={{ display: "none", gap: "0.5rem", alignItems: "center" }}
        >
          <MktButton size="sm" variant="ghost" href="/logowanie">
            Panel
          </MktButton>
          <button
            className="fy-burger"
            onClick={() => setOpen(!open)}
            aria-label="Menu"
            style={{
              display: "inline-flex",
              background: "none",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "0.4rem 0.55rem",
              cursor: "pointer",
            }}
          >
            <span
              style={{
                display: "block",
                width: 18,
                height: 2,
                background: "var(--foreground)",
                boxShadow: "0 6px 0 var(--foreground), 0 -6px 0 var(--foreground)",
              }}
            />
          </button>
        </div>
      </div>
      {open && (
        <div
          style={{
            borderTop: "1px solid var(--border)",
            background: "var(--card)",
            padding: "0.75rem 1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {nav.flatMap((n) => [
            <a
              key={n.key}
              href={n.href}
              onClick={() => setOpen(false)}
              style={{
                padding: "0.6rem 0",
                fontSize: "0.9rem",
                fontWeight: 600,
                color: "var(--foreground)",
                textDecoration: "none",
                borderBottom: "1px solid var(--border)",
              }}
            >
              {n.label}
            </a>,
            ...(n.key === "inwestor"
              ? investorLinks.map((l) => (
                  <a
                    key={l.label}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    style={{
                      padding: "0.55rem 0 0.55rem 1.1rem",
                      fontSize: "0.85rem",
                      fontWeight: 500,
                      color: "var(--muted-foreground)",
                      textDecoration: "none",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    {l.label}
                  </a>
                ))
              : []),
          ])}
          <MktButton variant="ghost" href="/logowanie" style={{ marginTop: 8 }}>
            Zaloguj się do panelu
          </MktButton>
          {/* CTA inwestora to kotwica na tej samej stronie (#cennik) — menu musi
              się zamknąć, inaczej zasłoni cennik. */}
          <MktButton
            variant="cta"
            href={cta.href}
            onClick={() => setOpen(false)}
            style={{ marginTop: 8 }}
          >
            {cta.label}
          </MktButton>
        </div>
      )}
    </header>
  );
}

export function StickyCTA({ label, href }: { label: string; href: string }) {
  return (
    <div
      className="fy-sticky"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 45,
        display: "none",
        padding: "0.7rem 1rem",
        background: "rgba(9,14,38,0.92)",
        backdropFilter: "blur(12px)",
        borderTop: "1px solid rgba(84,124,214,0.3)",
      }}
    >
      <MktButton variant="cta" href={href} style={{ width: "100%" }}>
        {label}
      </MktButton>
    </div>
  );
}

export function SiteFooter() {
  const cols = [
    {
      h: "Ścieżki",
      links: [
        { t: "Klient", href: PAGE_PATH.klient },
        { t: "Inwestor", href: PAGE_PATH.inwestor },
      ],
    },
    {
      h: "Platforma",
      links: [
        { t: "Jak działa", href: "/#jak-dziala" },
        { t: "Blog", href: "/blog" },
        { t: "FAQ", href: PAGE_PATH.klient + "#faq" },
      ],
    },
    {
      h: "Informacje",
      links: [
        { t: "Polityka prywatności", href: "/polityka-prywatnosci" },
        { t: "Regulamin", href: "/regulamin" },
        { t: "Polityka cookies", href: "/polityka-cookies" },
        { t: "Ustawienia cookies", href: "#ustawienia-cookies" },
      ],
    },
  ];
  return (
    <footer style={{ borderTop: "1px solid var(--border)", background: "var(--card)" }}>
      <div
        className="fy-foot"
        style={{
          maxWidth: "72rem",
          margin: "0 auto",
          padding: "3.5rem 1.5rem",
          display: "grid",
          gap: "2.5rem",
          gridTemplateColumns: "1.6fr 1fr 1fr 1fr",
        }}
      >
        <div>
          <FinanceYouLogo variant="dark" size="md" />
          <p style={{ marginTop: "1rem", fontSize: "0.85rem", fontWeight: 600 }}>
            Finance You sp. z o.o.
          </p>
          <address
            style={{
              marginTop: "0.25rem",
              fontStyle: "normal",
              fontSize: "0.85rem",
              lineHeight: 1.6,
              color: "var(--muted-foreground)",
            }}
          >
            {COMPANY_DATA.street}
            <br />
            {COMPANY_DATA.postalCode} {COMPANY_DATA.city}
          </address>
          <div
            style={{ marginTop: "0.8rem", fontSize: "0.78rem", color: "var(--muted-foreground)" }}
          >
            {CONTACT.phone} · {CONTACT.email}
          </div>
          <div
            style={{
              marginTop: "0.4rem",
              fontSize: "0.68rem",
              color: "var(--muted-foreground)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {COMPANY_REGISTRY_LINE}
          </div>
          {ACTIVE_SOCIAL_LINKS.length > 0 && (
            <div className="fy-social" style={{ marginTop: "1.4rem" }}>
              <h3
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Obserwuj nas
              </h3>
              <ul
                style={{
                  marginTop: "0.7rem",
                  padding: 0,
                  listStyle: "none",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                {ACTIVE_SOCIAL_LINKS.map((s) => (
                  <li key={s.key}>
                    <a
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Finance You na ${s.label} (otwiera się w nowej karcie)`}
                      title={s.label}
                    >
                      <SocialIcon name={s.key} />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {cols.map((c) => (
          <div key={c.h}>
            <h3
              style={{
                fontSize: "0.78rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {c.h}
            </h3>
            <ul
              style={{
                marginTop: "1rem",
                padding: 0,
                listStyle: "none",
                display: "grid",
                gap: "0.55rem",
              }}
            >
              {c.links.map((l) => (
                <li key={l.t}>
                  <a
                    href={l.href}
                    style={{
                      fontSize: "0.85rem",
                      color: "var(--muted-foreground)",
                      textDecoration: "none",
                    }}
                  >
                    {l.t}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div
        style={{
          borderTop: "1px solid var(--border)",
          padding: "1.4rem",
          textAlign: "center",
          fontSize: "0.74rem",
          color: "var(--muted-foreground)",
        }}
      >
        © 2026 Finance You sp. z o.o. · Platforma dla rynku prywatnych pożyczek zabezpieczonych
        nieruchomościami. Materiały mają charakter informacyjny i nie stanowią oferty.
      </div>
    </footer>
  );
}

/** Wraps a marketing page in the scoped dark theme + header/footer/sticky CTA. */
export function MarketingShell({
  page = "home",
  sticky,
  children,
}: {
  page?: MarketingPage;
  sticky?: { label: string; href: string };
  children: ReactNode;
}) {
  return (
    <div className="fy-marketing">
      <SiteHeader page={page} />
      {children}
      <SiteFooter />
      {sticky ? <StickyCTA label={sticky.label} href={sticky.href} /> : null}
    </div>
  );
}
