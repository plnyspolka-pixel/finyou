// Narzędzie-lead-magnet: /narzedzie/<slug> (brief 5.4 p.2). Kalkulator z
// konfiguracji (src/lib/autopilot/calculators.ts) liczony silnikiem na
// zweryfikowanych funkcjach systemu. Część wyniku widać od razu, pełny wynik
// po zapisie na listę (zgoda RODO z mechanizmu lead magnetów) albo z linku
// w mailu (?t=<token>).
import { createFileRoute, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, type FormEvent } from "react";
import { Calculator, Lock, ShieldCheck } from "lucide-react";
import { getPublicToolFn, submitToolSignupFn } from "@/lib/autopilot/tools.functions";
import { runCalculator, type CalculatorConfig } from "@/lib/autopilot/calculator-engine";
import { RISK_LINES } from "@/lib/autopilot/compliance-rules";
import { consentTextFor } from "@/lib/lead-magnets/core";
import { TRACK_TO_AUDIENCE } from "@/lib/autopilot/types";
import { FinanceYouLogo } from "@/components/finance-you-logo";
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
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  notFoundComponent: () => (
    <main className="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <h1 className="text-2xl font-extrabold">Tego narzędzia nie ma</h1>
        <a className="mt-3 inline-block text-accent underline" href="/start">
          Zobacz, co mamy na start
        </a>
      </div>
    </main>
  ),
  component: ToolPage,
});

function ToolPage() {
  const { slug } = Route.useParams();
  const search = Route.useSearch();
  const { data } = useSuspenseQuery(toolQuery(slug, search.t));
  const cfg = data.tool!.config as CalculatorConfig;
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of cfg.fields) {
      const fromUrl = search[f.key];
      v[f.key] = fromUrl ?? (f.default != null ? String(f.default) : "");
    }
    return v;
  });
  const [unlocked, setUnlocked] = useState<boolean>(data.unlocked);
  const run = useMemo(() => runCalculator(cfg, values, { unlocked }), [cfg, values, unlocked]);

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground">
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        <header className="flex items-center justify-between">
          <a href="/start" aria-label="Finance You – start">
            <FinanceYouLogo size="sm" />
          </a>
        </header>
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent">
            <Calculator className="h-4 w-4" aria-hidden /> Bezpłatne narzędzie
          </p>
          <h1 className="mt-2 text-2xl font-extrabold leading-tight">{cfg.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{cfg.promise}</p>
        </div>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4">
            {cfg.fields.map((f) => (
              <label key={f.key} className="flex flex-col gap-1 text-sm font-medium">
                {f.label}
                {f.unit ? (
                  <span className="text-xs font-normal text-muted-foreground">
                    {f.unit === "pln" ? "zł" : f.unit === "pct" ? "%" : "miesiące"}
                  </span>
                ) : null}
                <input
                  inputMode="decimal"
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  className="rounded-lg border border-border bg-background px-3 py-2.5 text-base"
                  aria-invalid={Boolean(run.errors[f.key])}
                />
                {run.errors[f.key] ? (
                  <span className="text-xs text-destructive">{run.errors[f.key]}</span>
                ) : f.help ? (
                  <span className="text-xs font-normal text-muted-foreground">{f.help}</span>
                ) : null}
              </label>
            ))}
          </div>
        </section>

        {run.ok ? (
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-lg font-bold">Wynik</h2>
            <dl className="mt-3 flex flex-col gap-2">
              {run.visible.map((r) => (
                <div key={r.key} className="flex items-baseline justify-between gap-4">
                  <dt className="text-sm text-muted-foreground">{r.label}</dt>
                  <dd className="text-right text-base font-bold">{r.value}</dd>
                </div>
              ))}
              {run.gated.map((r) => (
                <div key={r.key} className="flex items-baseline justify-between gap-4 opacity-70">
                  <dt className="text-sm text-muted-foreground">{r.label}</dt>
                  <dd className="flex items-center gap-1 text-right text-sm">
                    <Lock className="h-3.5 w-3.5" aria-hidden /> po zapisie
                  </dd>
                </div>
              ))}
            </dl>
            {run.gated.length > 0 && data.tool!.signupOpen ? (
              <UnlockForm cfg={cfg} values={values} onUnlocked={() => setUnlocked(true)} />
            ) : null}
          </section>
        ) : null}

        <section className="text-xs leading-relaxed text-muted-foreground">
          <p className="font-semibold">Założenia</p>
          <ul className="mt-1 list-disc pl-4">
            {cfg.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <p className="mt-3">{RISK_LINES[cfg.track]}</p>
          <p className="mt-2">
            {COMPANY_DATA.legalName} · KRS {COMPANY_DATA.krs} · {COMPANY_DATA.email}
          </p>
        </section>
      </div>
    </main>
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
        className="rounded-lg border border-border bg-background px-3 py-2.5 text-base"
        autoComplete="given-name"
      />
      <input
        type="email"
        required
        placeholder="Twój e-mail"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="rounded-lg border border-border bg-background px-3 py-2.5 text-base"
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
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          {consentTextFor(TRACK_TO_AUDIENCE[cfg.track])}{" "}
          <a href="/polityka-prywatnosci" className="underline">
            Polityka prywatności
          </a>
        </span>
      </label>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <button
        type="submit"
        disabled={busy}
        className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-60"
      >
        <ShieldCheck className="h-4 w-4" aria-hidden />
        {busy ? "Zapisuję…" : "Pokaż pełny wynik"}
      </button>
    </form>
  );
}
