// Publiczna strona lead magnetu: /pobierz/<slug>. Tu trafia link z odpowiedzi
// na komentarz (FB / IG / YouTube) albo z posta. Osoba zostawia e-mail (i zgodę
// na newsletter), dostaje link do pliku od razu i w mailu.
import { createFileRoute, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type CSSProperties, type FormEvent } from "react";
import { Check, Download, Mail, ShieldCheck } from "lucide-react";
import {
  getPublicLeadMagnetFn,
  submitLeadMagnetSignup,
} from "@/lib/lead-magnets/lead-magnets.functions";
import type { PublicLeadMagnet } from "@/lib/lead-magnets/core";
import { FinanceYouLogo } from "@/components/finance-you-logo";
import { MktButton, Eyebrow, MktBadge } from "@/components/marketing/primitives";
import { COMPANY_DATA } from "@/lib/company";
import { SITE_URL } from "@/lib/seo/company";

type SearchParams = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  ref?: string;
};

const str = (v: unknown, max = 200) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

const magnetQuery = (slug: string) =>
  queryOptions({
    queryKey: ["public-lead-magnet", slug],
    queryFn: () => getPublicLeadMagnetFn({ data: { slug } }),
    staleTime: 60_000,
  });

export const Route = createFileRoute("/pobierz/$slug")({
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    utm_source: str(search.utm_source),
    utm_medium: str(search.utm_medium),
    utm_campaign: str(search.utm_campaign),
    utm_term: str(search.utm_term),
    utm_content: str(search.utm_content),
    ref: str(search.ref, 120),
  }),
  loader: async ({ params, context }) => {
    const res = await context.queryClient.ensureQueryData(magnetQuery(params.slug));
    if (!res.magnet) throw notFound();
    return res;
  },
  head: ({ loaderData }) => {
    const m = (loaderData?.magnet as PublicLeadMagnet | null) ?? null;
    if (!m) return { meta: [{ title: "Nie znaleziono" }] };
    const title = `${m.title} — bezpłatny materiał | Finance You`;
    const desc = m.meta_description ?? m.subheadline ?? m.headline;
    const url = `${SITE_URL}/pobierz/${m.slug}`;
    const image = m.og_image_url ?? m.cover_image_url ?? null;
    const meta: Array<Record<string, string>> = [
      { title },
      { name: "description", content: desc },
      { property: "og:title", content: title },
      { property: "og:description", content: desc },
      { property: "og:url", content: url },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "pl_PL" },
      { name: "twitter:card", content: image ? "summary_large_image" : "summary" },
    ];
    if (image) {
      meta.push({ property: "og:image", content: image });
      meta.push({ name: "twitter:image", content: image });
    }
    return { meta, links: [{ rel: "canonical", href: url }] };
  },
  notFoundComponent: () => (
    <Shell>
      <div style={{ textAlign: "center", padding: "4rem 1rem" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 800 }}>Tego materiału już nie ma</h1>
        <p style={{ color: "var(--muted-foreground)", marginTop: "0.6rem" }}>
          Link wygasł albo materiał został wycofany. Zobacz, co jeszcze mamy na financeyou.pl.
        </p>
        <div style={{ marginTop: "1.5rem" }}>
          <MktButton href="/" variant="cta">
            Przejdź na stronę główną
          </MktButton>
        </div>
      </div>
    </Shell>
  ),
  errorComponent: ({ error }) => (
    <Shell>
      <div style={{ textAlign: "center", padding: "4rem 1rem" }}>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800 }}>Nie udało się wczytać strony</h1>
        <p style={{ color: "var(--muted-foreground)", marginTop: "0.6rem" }}>
          {(error as Error).message}
        </p>
      </div>
    </Shell>
  ),
  component: LeadMagnetPage,
});

/** Skupiona strona bez pełnej nawigacji — logo, treść, krótka stopka. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fy-marketing" style={{ display: "flex", flexDirection: "column" }}>
      <header
        style={{
          borderBottom: "1px solid rgba(84,124,214,0.25)",
          background: "rgba(9,14,38,0.8)",
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
            Bezpłatny materiał od Finance You
          </span>
        </div>
      </header>
      <main style={{ flex: 1 }}>{children}</main>
      <footer
        style={{
          borderTop: "1px solid rgba(84,124,214,0.2)",
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

function LeadMagnetPage() {
  const { slug } = Route.useParams();
  const { data } = useSuspenseQuery(magnetQuery(slug));
  const magnet = data.magnet as PublicLeadMagnet;

  return (
    <Shell>
      <section style={{ maxWidth: "72rem", margin: "0 auto", padding: "3rem 1.25rem 4rem" }}>
        <div
          style={{
            display: "grid",
            gap: "2.5rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 22rem), 1fr))",
            alignItems: "start",
          }}
        >
          <div>
            <Eyebrow tone="gold">
              {magnet.audience === "inwestor" ? "Dla inwestora" : "Dla klienta pożyczkowego"}
              {" · "}bezpłatnie
            </Eyebrow>
            <h1
              style={{
                marginTop: "0.7rem",
                fontSize: "clamp(2rem, 3.8vw, 2.9rem)",
                fontWeight: 900,
                letterSpacing: "-0.02em",
                lineHeight: 1.08,
              }}
            >
              {magnet.headline}
            </h1>
            {magnet.subheadline && (
              <p
                style={{
                  marginTop: "1rem",
                  fontSize: "1.05rem",
                  lineHeight: 1.65,
                  color: "var(--muted-foreground)",
                }}
              >
                {magnet.subheadline}
              </p>
            )}
            {magnet.cover_image_url && (
              <img
                src={magnet.cover_image_url}
                alt={magnet.title}
                loading="eager"
                style={{
                  marginTop: "1.5rem",
                  width: "100%",
                  maxWidth: "28rem",
                  borderRadius: "var(--radius-2xl)",
                  boxShadow: "var(--shadow-lg)",
                  border: "1px solid var(--border)",
                }}
              />
            )}
            {magnet.benefits.length > 0 && (
              <ul
                style={{
                  listStyle: "none",
                  padding: 0,
                  margin: "1.6rem 0 0",
                  display: "grid",
                  gap: "0.65rem",
                }}
              >
                {magnet.benefits.map((b, i) => (
                  <li key={i} style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
                    <span
                      style={{
                        flexShrink: 0,
                        marginTop: "0.15rem",
                        width: 22,
                        height: 22,
                        borderRadius: 999,
                        display: "grid",
                        placeItems: "center",
                        background: "oklch(0.78 0.18 85 / 0.16)",
                        color: "var(--gold-600)",
                      }}
                    >
                      <Check size={14} />
                    </span>
                    <span style={{ lineHeight: 1.55 }}>{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <SignupCard magnet={magnet} />
        </div>
      </section>
    </Shell>
  );
}

const fieldStyle: CSSProperties = {
  width: "100%",
  padding: "0.8rem 1rem",
  borderRadius: "var(--radius-xl)",
  border: "1px solid var(--border)",
  color: "var(--foreground)",
  fontSize: "1rem",
};

function SignupCard({ magnet }: { magnet: PublicLeadMagnet }) {
  const search = Route.useSearch();
  const submitFn = useServerFn(submitLeadMagnetSignup);
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    message: string;
    download_url: string | null;
    email_sent: boolean;
  } | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/.+@.+\..+/.test(email)) {
      setError("Podaj poprawny adres e-mail.");
      return;
    }
    if (!consent) {
      setError("Zaznacz zgodę — bez niej nie możemy wysłać materiału.");
      return;
    }
    setSubmitting(true);
    try {
      const utm = {
        source: search.utm_source,
        medium: search.utm_medium,
        campaign: search.utm_campaign,
        term: search.utm_term,
        content: search.utm_content,
      };
      const res = await submitFn({
        data: {
          slug: magnet.slug,
          email: email.trim(),
          first_name: firstName.trim() || undefined,
          consent: true,
          website: website || undefined,
          ref: search.ref,
          utm: Object.values(utm).some(Boolean) ? utm : undefined,
        },
      });
      setDone({
        message: res.thank_you_message,
        download_url: res.download_url,
        email_sent: res.email_sent,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się zapisać. Spróbuj ponownie.");
    } finally {
      setSubmitting(false);
    }
  }

  const card: CSSProperties = {
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-3xl)",
    boxShadow: "var(--shadow-lg)",
    padding: "1.75rem",
  };

  if (done) {
    return (
      <div style={card}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 999,
            display: "grid",
            placeItems: "center",
            background: "oklch(0.62 0.15 155 / 0.16)",
            color: "oklch(0.75 0.15 155)",
          }}
        >
          <Check size={26} />
        </div>
        <h2 style={{ marginTop: "1rem", fontSize: "1.5rem", fontWeight: 800 }}>Gotowe!</h2>
        <p style={{ marginTop: "0.5rem", color: "var(--muted-foreground)", lineHeight: 1.6 }}>
          {done.message}
        </p>
        {done.download_url && (
          <div style={{ marginTop: "1.25rem" }}>
            <MktButton
              href={done.download_url}
              variant="gold"
              size="lg"
              target="_blank"
              rel="noopener"
            >
              <Download size={18} style={{ marginRight: 8 }} />
              Pobierz {magnet.file_name ? `(${magnet.file_name})` : "materiał"}
            </MktButton>
          </div>
        )}
        <p
          style={{
            marginTop: "1.1rem",
            fontSize: "0.85rem",
            color: "var(--muted-foreground)",
            display: "flex",
            gap: "0.5rem",
            alignItems: "flex-start",
          }}
        >
          <Mail size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            {done.email_sent
              ? `Link wysłaliśmy też na ${email.trim()} — jeśli go nie widzisz, sprawdź folder „Oferty” albo spam.`
              : "Nie udało się wysłać maila z linkiem — skorzystaj z przycisku powyżej albo napisz do nas."}
          </span>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} style={card} noValidate>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
        <MktBadge variant="gold">{magnet.title}</MktBadge>
        {magnet.file_name && (
          <span style={{ fontSize: "0.78rem", color: "var(--muted-foreground)" }}>
            {magnet.file_name}
          </span>
        )}
      </div>
      <h2 style={{ marginTop: "0.9rem", fontSize: "1.45rem", fontWeight: 800, lineHeight: 1.2 }}>
        Gdzie wysłać materiał?
      </h2>
      <p style={{ marginTop: "0.4rem", fontSize: "0.92rem", color: "var(--muted-foreground)" }}>
        Zostaw e-mail — link do pobrania pokażemy od razu i wyślemy na skrzynkę.
      </p>

      <div style={{ display: "grid", gap: "0.9rem", marginTop: "1.25rem" }}>
        <label style={{ display: "grid", gap: "0.35rem", fontSize: "0.85rem", fontWeight: 600 }}>
          Imię (opcjonalnie)
          <input
            style={fieldStyle}
            type="text"
            name="first_name"
            autoComplete="given-name"
            maxLength={80}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="np. Anna"
          />
        </label>
        <label style={{ display: "grid", gap: "0.35rem", fontSize: "0.85rem", fontWeight: 600 }}>
          E-mail <span style={{ color: "var(--gold-600)" }}>*</span>
          <input
            style={fieldStyle}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            maxLength={255}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="twoj@adres.pl"
          />
        </label>
        {/* Pułapka na boty — niewidoczna dla ludzi. */}
        <div
          style={{
            position: "absolute",
            left: "-10000px",
            width: 1,
            height: 1,
            overflow: "hidden",
          }}
          aria-hidden
        >
          <label>
            Strona www
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </label>
        </div>
        <label
          style={{
            display: "flex",
            gap: "0.6rem",
            alignItems: "flex-start",
            fontSize: "0.8rem",
            lineHeight: 1.5,
            color: "var(--muted-foreground)",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            name="consent"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0 }}
          />
          <span>
            {magnet.consent_text}{" "}
            <a href="/polityka-prywatnosci" target="_blank" rel="noopener">
              Polityka prywatności
            </a>
            .
          </span>
        </label>
      </div>

      {error && (
        <p
          role="alert"
          style={{
            marginTop: "0.9rem",
            fontSize: "0.85rem",
            color: "#ffb4b4",
            background: "rgba(220, 60, 60, 0.12)",
            border: "1px solid rgba(220, 60, 60, 0.35)",
            borderRadius: "var(--radius-xl)",
            padding: "0.6rem 0.8rem",
          }}
        >
          {error}
        </p>
      )}

      <div style={{ marginTop: "1.25rem" }}>
        <MktButton
          type="submit"
          variant="gold"
          size="lg"
          disabled={submitting}
          style={{ width: "100%" }}
        >
          {submitting ? "Wysyłam…" : magnet.cta_text}
        </MktButton>
      </div>
      <p
        style={{
          marginTop: "0.9rem",
          fontSize: "0.75rem",
          color: "var(--muted-foreground)",
          display: "flex",
          gap: "0.4rem",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ShieldCheck size={14} /> Zero spamu. Wypisujesz się jednym kliknięciem.
      </p>
    </form>
  );
}
