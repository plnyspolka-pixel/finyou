import { useState } from "react";
import type { ReactNode } from "react";
import { FinanceYouLogo } from "@/components/finance-you-logo";
import { BrandIcon } from "./brand-icon";
import { MktButton } from "./primitives";

/**
 * Finance You — marketing chrome (header, footer, sticky CTA) + shell wrapper.
 * The shell applies the `.fy-marketing` scope so the dark-glow theme stays on
 * the public pages and never leaks into the authenticated app.
 */

export type MarketingPage = "home" | "klient" | "inwestor" | "posrednik" | "blog" | "kalkulator";

/** Nadpisanie danych kontaktowych — np. kopia landinga z telefonem operatora. */
export type MarketingContact = { phone: string; phoneHref: string };

const CONTACT = { phone: "+48 732 059 898", email: "kontakt@financeyou.pl" };

const PAGE_PATH: Record<MarketingPage, string> = {
  home: "/",
  klient: "/dla-klienta",
  inwestor: "/dla-inwestora",
  posrednik: "/dla-posrednika",
  blog: "/blog",
  kalkulator: "/kalkulator-pozyczki",
};

const HEADER_CTA: Record<MarketingPage, { label: string; href: string }> = {
  home: { label: "Wybierz ścieżkę", href: "#sciezki" },
  klient: { label: "Złóż wniosek", href: "/rejestracja?role=klient" },
  inwestor: { label: "Dołącz do klubu", href: "/rejestracja?role=inwestor" },
  posrednik: { label: "Dołącz jako pośrednik", href: "/rejestracja?role=posrednik" },
  blog: { label: "Wybierz ścieżkę", href: "/#sciezki" },
  kalkulator: { label: "Złóż wniosek", href: "/dla-klienta" },
};

/** Kotwice podstron inwestora na /dla-inwestora — sub-menu pod pozycją "Inwestor". */
const INVESTOR_ANCHORS = [
  { label: "Akademia Inwestora", hash: "#akademia" },
  { label: "7 warstw ochrony inwestycji", hash: "#ochrona" },
  { label: "Windykacja AI", hash: "#windykacja-ai" },
  { label: "Cennik", hash: "#cennik" },
];

export function SiteHeader({
  page = "home",
  contact,
}: {
  page?: MarketingPage;
  contact?: MarketingContact;
}) {
  const [open, setOpen] = useState(false);
  const nav = [
    { label: "Klient", href: PAGE_PATH.klient, key: "klient" as const },
    { label: "Inwestor", href: PAGE_PATH.inwestor, key: "inwestor" as const },
    { label: "Kalkulator pożyczki", href: PAGE_PATH.kalkulator, key: "kalkulator" as const },
    { label: "Jak działa", href: page === "home" ? "#jak-dziala" : "/#jak-dziala", key: "jak" },
    { label: "Blog", href: "/blog", key: "blog" },
    { label: "FAQ", href: page === "blog" ? "/dla-klienta#faq" : "#faq", key: "faq" },
  ];
  const investorLinks = INVESTOR_ANCHORS.map((a) => ({
    label: a.label,
    href: page === "inwestor" ? a.hash : PAGE_PATH.inwestor + a.hash,
  }));
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
                  fontWeight: page === n.key ? 700 : 500,
                  color: page === n.key ? "var(--accent)" : "var(--muted-foreground)",
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
                    <a key={l.label} href={l.href}>
                      {l.label}
                    </a>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        {contact && (
          <a
            href={`tel:${contact.phoneHref}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: "0.9rem",
              fontWeight: 700,
              color: "var(--accent)",
              textDecoration: "none",
              whiteSpace: "nowrap",
            }}
          >
            <BrandIcon name="phone" size={16} /> {contact.phone}
          </a>
        )}
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
        <button
          className="fy-burger"
          onClick={() => setOpen(!open)}
          aria-label="Menu"
          style={{
            display: "none",
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
          <MktButton variant="cta" href={cta.href} style={{ marginTop: 8 }}>
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

export function SiteFooter({ contact }: { contact?: MarketingContact }) {
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
        { t: "Kalkulator pożyczki", href: PAGE_PATH.kalkulator },
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
            ul. Nowogrodzka 31
            <br />
            00-511 Warszawa
          </address>
          <div
            style={{ marginTop: "0.8rem", fontSize: "0.78rem", color: "var(--muted-foreground)" }}
          >
            {(contact ?? CONTACT).phone} · {CONTACT.email}
          </div>
          <div
            style={{
              marginTop: "0.4rem",
              fontSize: "0.68rem",
              color: "var(--muted-foreground)",
              fontFamily: "var(--font-mono)",
            }}
          >
            KRS 0000635207 · NIP 7010611803
          </div>
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
  contact,
  children,
}: {
  page?: MarketingPage;
  sticky?: { label: string; href: string };
  contact?: MarketingContact;
  children: ReactNode;
}) {
  return (
    <div className="fy-marketing">
      <SiteHeader page={page} contact={contact} />
      {children}
      <SiteFooter contact={contact} />
      {sticky ? <StickyCTA label={sticky.label} href={sticky.href} /> : null}
    </div>
  );
}
