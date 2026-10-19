// Wspólny komponent narzędzi-lead-magnetów (kalkulatory z konfiguracji).
// Wynik `teaser` widać od razu; pełny wynik z założeniami — po zapisie na listę
// (istniejący mechanizm lead magnetów: zgoda RODO, mail powitalny, atrybucja).
import { useMemo, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MktButton } from "@/components/marketing/primitives";
import {
  evaluateCalculator,
  formatCalculatorValue,
  type CalculatorConfig,
} from "@/lib/lead-magnet-tools/calculator-engine";
import { submitLeadMagnetSignup } from "@/lib/lead-magnets/lead-magnets.functions";

const input: React.CSSProperties = {
  width: "100%",
  padding: "0.7rem 0.9rem",
  borderRadius: "var(--radius-xl)",
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--foreground)",
  fontSize: "1rem",
};

export function CalculatorTool({
  config,
  gate,
  utm,
}: {
  config: CalculatorConfig;
  /** Lead magnet o tym samym slugu — gdy istnieje, pełny wynik jest po zapisie. */
  gate: { slug: string; consentText: string } | null;
  utm?: Record<string, string | undefined>;
}) {
  const submit = useServerFn(submitLeadMagnetSignup);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      config.fields.map((f) => [f.id, f.default != null ? String(f.default) : ""]),
    ),
  );
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [unlocked, setUnlocked] = useState(!gate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(values).map(([k, v]) => [
          k,
          v.trim() === "" ? undefined : Number(v.replace(/\s/g, "").replace(",", ".")),
        ]),
      ),
    [values],
  );
  const result = useMemo(() => evaluateCalculator(config, parsed), [config, parsed]);
  const anyInput = Object.values(values).some((v) => v.trim() !== "");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!gate) return;
    setError(null);
    if (!/.+@.+\..+/.test(email)) return setError("Podaj poprawny adres e-mail.");
    if (!consent) return setError("Zaznacz zgodę — bez niej nie możemy wysłać wyniku.");
    setBusy(true);
    try {
      const u = utm && Object.values(utm).some(Boolean) ? utm : undefined;
      await submit({
        data: {
          slug: gate.slug,
          email: email.trim(),
          consent: true,
          website: website || undefined,
          utm: u,
        },
      });
      setUnlocked(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się zapisać. Spróbuj ponownie.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "1.2rem" }}>
      <div style={{ display: "grid", gap: "0.8rem" }}>
        {config.fields.map((f) => (
          <label key={f.id} style={{ display: "grid", gap: "0.35rem", fontSize: "0.92rem" }}>
            <span>{f.label}</span>
            <input
              inputMode="decimal"
              style={input}
              value={values[f.id] ?? ""}
              onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
            />
            {f.help && (
              <span style={{ fontSize: "0.8rem", color: "var(--muted-foreground)" }}>{f.help}</span>
            )}
          </label>
        ))}
      </div>

      {anyInput && !result.ok && (
        <p style={{ color: "var(--muted-foreground)", fontSize: "0.9rem" }}>
          {result.errors.join(" ")}
        </p>
      )}

      {result.ok && (
        <div style={{ display: "grid", gap: "0.6rem" }}>
          {(unlocked ? result.full : result.teaser).map((r) => (
            <div
              key={r.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "1rem",
                fontSize: "1.05rem",
              }}
            >
              <span>{r.label}</span>
              <strong style={{ color: "var(--gold)" }}>
                {formatCalculatorValue(r.value, r.format)}
              </strong>
            </div>
          ))}
          {unlocked && (
            <ul
              style={{
                margin: 0,
                paddingLeft: "1.1rem",
                fontSize: "0.85rem",
                color: "var(--muted-foreground)",
              }}
            >
              {config.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {result.ok && !unlocked && gate && (
        <form onSubmit={onSubmit} style={{ display: "grid", gap: "0.7rem" }}>
          <p style={{ margin: 0, fontSize: "0.95rem" }}>
            Pełny wynik z wyjaśnieniem i założeniami wyślemy Ci mailem — i pokażemy od razu tutaj.
          </p>
          <input
            type="email"
            placeholder="Twój e-mail"
            style={input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            style={{ position: "absolute", left: "-9999px" }}
            aria-hidden="true"
          />
          <label
            style={{
              display: "flex",
              gap: "0.5rem",
              fontSize: "0.8rem",
              color: "var(--muted-foreground)",
            }}
          >
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>{gate.consentText}</span>
          </label>
          {error && (
            <p style={{ margin: 0, color: "var(--destructive)", fontSize: "0.85rem" }}>{error}</p>
          )}
          <MktButton type="submit" variant="gold" disabled={busy}>
            {busy ? "Zapisuję…" : "Pokaż pełny wynik"}
          </MktButton>
        </form>
      )}

      <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: 0 }}>
        {config.disclaimer}
      </p>
    </div>
  );
}
