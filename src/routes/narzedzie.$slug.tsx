// Narzędzie-lead-magnet: /narzedzie/<slug> (brief 5.4 p.2). Kalkulator z
// konfiguracji (src/lib/autopilot/calculators.ts) liczony silnikiem na
// zweryfikowanych funkcjach systemu. Część wyniku widać od razu, pełny wynik
// po zapisie na listę (zgoda RODO z mechanizmu lead magnetów) albo z linku
// w mailu (?t=<token>).
import { createFileRoute, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, type FormEvent } from "react";
import { Check, Lock, ShieldCheck, Phone } from "lucide-react";
import { getPublicToolFn, submitToolSignupFn } from "@/lib/autopilot/tools.functions";
import { runCalculator, type CalculatorConfig } from "@/lib/autopilot/calculator-engine";
import { RISK_LINES } from "@/lib/autopilot/compliance-rules";
import { consentTextFor } from "@/lib/lead-magnets/core";
import { TRACK_TO_AUDIENCE } from "@/lib/autopilot/types";
import { FocusShell, focusFieldStyle } from "@/components/marketing/focus-shell";
import { MktButton, Eyebrow } from "@/components/marketing/primitives";
import { Icon3D } from "@/components/marketing/icon-3d";
import { formatToolInput } from "@/lib/autopilot/tool-input";
import { COMPANY_DATA } from "@/lib/company";
import { SITE_URL } from "@/lib/seo/company";

type Search = Record<string, string | undefined>;

const str = (v: unknown, max = 200) =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;

const toolQuery = (slug: string, token?: string) =>
  queryOptions({
    queryKey: ["public-tool", slug, token ?? null],
    queryFn: () => getPublicToolFn({ data: { slug, token } }),
    staleTime: 60_000,
  });

export const Route = createFileRoute("/narzedzie/$slug")({
  validateSearch: (search: Record<string, unknown>): Search => {
    const out: Search = {};
    for (const [k, v] of Object.entries(search)) {
      const s = str(typeof v === "number" ? String(v) : v, 80);
      if (s && /^[a-z_0-9]+$/.test(k)) out[k] = s;
    }
    return out;
  },
  loaderDeps: ({ search }) => ({ t: search.t }),
  loader: async ({ params, context, deps }) => {
    const res = await context.queryClient.ensureQueryData(toolQuery(params.slug, deps.t));
    if (!res.tool) throw notFound();
    return res;
  },
  head: ({ loaderData, params }) => {
    const cfg = loaderData?.tool?.config;
    const url = `${SITE_URL}/narzedzie/${params.slug}`;
    if (!cfg) return { meta: [{ title: "Nie znaleziono" }] };
    return {
      meta: [
        { title: `${cfg.title} | Finance You` },
        { name: "description", content: cfg.promise },
        { property: "og:title", content: cfg.title },
        { property: "og:description", content: cfg.promise },
        { property: "og:url", content: url },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  notFoundComponent: () => (
    <FocusShell>
      <div className="px-5 py-16 text-center">
        <h1 className="text-2xl font-extrabold">Tego narzędzia nie ma</h1>
        <div className="mt-6">
          <MktButton href="/" variant="cta">
            Przejdź na stronę główną
          </MktButton>
        </div>
      </div>
    </FocusShell>
  ),
  component: ToolPage,
});

function ToolPage() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const { data } = useSuspenseQuery(toolQuery(slug, search.t));
  if (!data.tool) return null;
  return (
    <ToolCalculator
      cfg={data.tool.config}
      initialUnlocked={data.unlocked}
      signupOpen={data.tool.signupOpen}
    />
  );
}

function ToolCalculator({
  cfg,
  initialUnlocked,
  signupOpen,
}: {
  cfg: CalculatorConfig;
  initialUnlocked: boolean;
  signupOpen: boolean;
}) {
  const search = Route.useSearch();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of cfg.fields) {
      const fromUrl = search[f.key];
      v[f.key] = fromUrl ?? (f.default != null ? String(f.default) : "");
    }
    return v;
  });
  const [unlocked, setUnlocked] = useState<boolean>(initialUnlocked);
  const run = useMemo(() => runCalculator(cfg, values, { unlocked }), [cfg, values, unlocked]);

  const borrower = cfg.track === "pozyczkobiorca";
  const mainResult = run.visible[0];
  return (
    <FocusShell>
      <section className="fy-tool-layout">
        <div className="fy-tool-intro">
          <Icon3D name={borrower ? "calculator" : "kalkulator"} size={64} className="mb-3" />
          <Eyebrow tone="gold">
            Bezpłatne narzędzie · {borrower ? "dla klienta" : "dla inwestora"}
          </Eyebrow>
          <h1 className="mt-3 text-3xl font-black leading-tight md:text-4xl">{cfg.title}</h1>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground">{cfg.promise}</p>
        </div>
        <ul className="fy-tool-assumptions">
          {cfg.assumptions.map((a) => (
            <li key={a} className="flex items-start gap-3">
              <Check size={18} className="mt-1 shrink-0" style={{ color: "var(--gold-600)" }} />
              <span>{a}</span>
            </li>
          ))}
        </ul>
        <div className="fy-tool-panel">
          <div className="fy-tool-card">
            <h2 className="mb-5 text-xl font-bold">
              {borrower ? "Sprawdź kwotę finansowania" : "Policz LTV i bufor"}
            </h2>
            <div className="grid gap-5">
              {cfg.fields.map((f) => (
                <label key={f.key} className="grid gap-2 text-sm font-semibold">
                  {f.label}
                  <span className="relative block">
                    <input
                      inputMode="decimal"
                      aria-invalid={Boolean(run.errors[f.key])}
                      aria-describedby={run.errors[f.key] ? `error-${f.key}` : undefined}
                      value={formatToolInput(values[f.key] ?? "")}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [f.key]: e.target.value.replace(/\s/g, "") }))
                      }
                      style={{ ...focusFieldStyle, paddingRight: "4.5rem" }}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-muted-foreground">
                      {f.unit === "pln"
                        ? "zł"
                        : f.unit === "pct"
                          ? "%"
                          : f.unit === "months"
                            ? "mies."
                            : ""}
                    </span>
                  </span>
                  {run.errors[f.key] ? (
                    <span id={`error-${f.key}`} className="text-xs text-destructive">
                      {run.errors[f.key]}
                    </span>
                  ) : f.help ? (
                    <span className="text-xs font-normal text-muted-foreground">{f.help}</span>
                  ) : null}
                </label>
              ))}
            </div>
            {run.ok && mainResult ? (
              <div className="fy-tool-result" aria-live="polite">
                <p className="text-sm text-muted-foreground">{mainResult.label}</p>
                <p className="fy-tool-main-number">{mainResult.value}</p>
                <dl className="mt-5 grid gap-3">
                  {run.visible.slice(1).map((r) => (
                    <div
                      key={r.key}
                      className="flex flex-wrap items-baseline justify-between gap-2"
                    >
                      <dt className="text-sm text-muted-foreground">{r.label}</dt>
                      <dd className="font-semibold">{r.value}</dd>
                    </div>
                  ))}
                  {run.gated.map((r) => (
                    <div
                      key={r.key}
                      className="flex flex-wrap items-baseline justify-between gap-2"
                    >
                      <dt className="text-sm text-muted-foreground">{r.label}</dt>
                      <dd className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Lock size={14} /> po zapisie
                      </dd>
                    </div>
                  ))}
                </dl>
                {borrower ? (
                  <div className="mt-6 grid gap-3">
                    <MktButton
                      href={`/dla-klienta?kwota=${encodeURIComponent(mainResult.value.replace(/[^0-9]/g, ""))}#wniosek`}
                      variant="gold"
                      style={{
                        whiteSpace: "normal",
                        height: "auto",
                        minHeight: "3rem",
                        padding: "0.8rem 1rem",
                        textAlign: "center",
                        lineHeight: 1.4,
                      }}
                    >
                      Złóż bezpłatny wniosek na tę kwotę
                    </MktButton>
                    <MktButton
                      href="tel:+48732059898"
                      variant="outline"
                      style={{
                        whiteSpace: "normal",
                        height: "auto",
                        minHeight: "3rem",
                        padding: "0.8rem 0.5rem",
                        lineHeight: 1.4,
                        textAlign: "center",
                      }}
                    >
                      <Phone size={16} />
                      Zadzwoń: +48 732 059 898
                    </MktButton>
                  </div>
                ) : run.gated.length > 0 && signupOpen ? (
                  <UnlockForm cfg={cfg} values={values} onUnlocked={() => setUnlocked(true)} />
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="mt-5 px-1 text-xs leading-relaxed text-muted-foreground">
            <p>{RISK_LINES[cfg.track]}</p>
            <p className="mt-2">
              {COMPANY_DATA.legalName} · KRS {COMPANY_DATA.krs} · {COMPANY_DATA.email}
            </p>
          </div>
        </div>
      </section>
    </FocusShell>
  );
}

function UnlockForm({
  cfg,
  values,
  onUnlocked,
}: {
  cfg: CalculatorConfig;
  values: Record<string, string>;
  onUnlocked: () => void;
}) {
  const search = Route.useSearch();
  const submitFn = useServerFn(submitToolSignupFn);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<boolean | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/.+@.+\..+/.test(email)) return setError("Podaj poprawny adres e-mail.");
    if (!consent) return setError("Zaznacz zgodę – bez niej nie wyślemy wyniku.");
    setBusy(true);
    try {
      const utm = {
        source: search.utm_source,
        medium: search.utm_medium,
        campaign: search.utm_campaign,
        content: search.utm_content,
      };
      const res = await submitFn({
        data: {
          slug: cfg.slug,
          email: email.trim(),
          first_name: firstName.trim() || undefined,
          consent: true,
          website: website || undefined,
          values,
          utm: Object.values(utm).some(Boolean) ? utm : undefined,
        },
      });
      setSent(res.emailSent);
      onUnlocked();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się zapisać. Spróbuj ponownie.");
    } finally {
      setBusy(false);
    }
  }

  if (sent !== null) {
    return (
      <p className="mt-4 rounded-lg bg-muted p-3 text-sm">
        {sent
          ? "Gotowe – pełny wynik jest powyżej i w Twojej skrzynce."
          : "Gotowe – pełny wynik jest powyżej."}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
      <p className="text-sm font-semibold">Pokaż pełny wynik i wyślij go mailem</p>
      <input
        type="text"
        placeholder="Imię (opcjonalnie)"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
        style={focusFieldStyle}
        autoComplete="given-name"
      />
      <input
        type="email"
        required
        placeholder="Twój e-mail"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={focusFieldStyle}
        autoComplete="email"
      />
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="hidden"
        name="website"
      />
      <label className="flex cursor-pointer items-start gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="fy-consent-checkbox"
        />
        <span>
          {consentTextFor(TRACK_TO_AUDIENCE[cfg.track])}{" "}
          <a href="/polityka-prywatnosci" className="underline">
            Polityka prywatności
          </a>
        </span>
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <MktButton
        type="submit"
        disabled={busy}
        variant="gold"
        style={{ whiteSpace: "normal", height: "auto", minHeight: "3rem", padding: "0.8rem 1rem" }}
      >
        <ShieldCheck className="h-4 w-4" aria-hidden />
        {busy ? "Zapisuję…" : "Pokaż pełny wynik"}
      </MktButton>
    </form>
  );
}
