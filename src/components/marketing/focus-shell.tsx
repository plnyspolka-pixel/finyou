import { FinanceYouLogo } from "@/components/finance-you-logo";
import { COMPANY_DATA } from "@/lib/company";
import type { CSSProperties } from "react";
export const focusFieldStyle: CSSProperties = { width: "100%", padding: "0.8rem 1rem", borderRadius: "var(--radius-xl)", border: "1px solid var(--border)", color: "var(--foreground)", fontSize: "1rem" };
/** Skupiona strona bez pełnej nawigacji — logo, treść, krótka stopka. */
export function FocusShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fy-marketing" style={{ display: "flex", flexDirection: "column" }}>
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--background)",
          backdropFilter: "blur(14px)",
        }}
      >
        <div
          style={{
            maxWidth: "72rem",
            margin: "0 auto",
            padding: "0.9rem 1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <a
            href="/"
            style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}
          >
            <FinanceYouLogo variant="dark" size="sm" />
          </a>
          <span style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>
            Bezpłatnie od Finance You
          </span>
        </div>
      </header>
      <main style={{ flex: 1 }}>{children}</main>
      <footer
        style={{
          borderTop: "1px solid var(--border)",
          padding: "1.4rem 1.25rem 2rem",
          textAlign: "center",
          fontSize: "0.78rem",
          color: "var(--muted-foreground)",
        }}
      >
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/">financeyou.pl</a>
          <a href="/polityka-prywatnosci">Polityka prywatności</a>
          <a href={`mailto:${COMPANY_DATA.email}`}>{COMPANY_DATA.email}</a>
        </div>
        <p style={{ margin: "0.6rem 0 0" }}>
          {COMPANY_DATA.legalName}, {COMPANY_DATA.addressFull}
        </p>
      </footer>
    </div>
  );
}

