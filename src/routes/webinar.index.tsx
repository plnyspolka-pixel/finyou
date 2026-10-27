import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FocusShell, focusFieldStyle } from "@/components/marketing/focus-shell";
import { Eyebrow, MktButton } from "@/components/marketing/primitives";
import { Icon3D } from "@/components/marketing/icon-3d";
import { submitLeadMagnetSignup } from "@/lib/lead-magnets/lead-magnets.functions";
import { consentTextFor } from "@/lib/lead-magnets/core";
import { hasConsent } from "@/lib/cookie-consent";
import { WEBINAR_ENABLED, WEBINAR_SLUG } from "@/lib/webinar";

export const Route = createFileRoute("/webinar/")({
  head: () => ({
    meta: [
      { title: "Webinar dla inwestorów — pokaz co 15 minut | Finance You" },
      {
        name: "description",
        content:
          "Zapisz się na webinar dla inwestorów Finance You. Pokaz nagrania startuje co 15 minut.",
      },
      { name: "robots", content: WEBINAR_ENABLED ? "index,follow" : "noindex,nofollow" },
    ],
  }),
  component: WebinarSignupPage,
});

export function WebinarSignupPage({ enabled = WEBINAR_ENABLED }: { enabled?: boolean }) {
  return (
    <FocusShell>
      <section className="fy-tool-layout">
        <div className="fy-tool-intro">
          <Icon3D name="training" size={64} className="mb-3" />
          <Eyebrow tone="gold">Webinar dla inwestorów · bezpłatnie</Eyebrow>
          <h1 className="mt-3 text-3xl font-black leading-tight md:text-4xl">
            {enabled ? "Najbliższy pokaz startuje o pełnym kwadransie" : "Webinar startuje wkrótce"}
          </h1>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground">
            {enabled
              ? "Zapisz się, a od razu przejdziesz do pokoju. Pokaz nagrania rusza co 15 minut — o :00, :15, :30 i :45."
              : "Przygotowujemy nagranie webinaru dla inwestorów. Do tego czasu obejrzyj darmową lekcję szkolenia."}
          </p>
          {!enabled && (
            <div className="fy-sales-actions">
              <MktButton variant="gold" href="/pobierz/darmowa-lekcja">
                Obejrzyj darmową lekcję
              </MktButton>
            </div>
          )}
        </div>
        {enabled && (
          <div className="fy-tool-panel fy-sales-video-box">
            <WebinarSignupForm />
          </div>
        )}
      </section>
    </FocusShell>
  );
}

function WebinarSignupForm() {
  const signupFn = useServerFn(submitLeadMagnetSignup);
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!consent) return;
    setBusy(true);
    setError("");
    try {
      const r = await signupFn({
        data: { slug: WEBINAR_SLUG, first_name: firstName, email, consent: true, website },
      });
      const { trackEvent } = await import("@/lib/fb-pixel");
      await trackEvent("Lead", { content_category: "investor", content_name: WEBINAR_SLUG });
      if (hasConsent("marketing"))
        (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq?.(
          "trackCustom",
          "webinar_signup",
        );
      if (hasConsent("analytics")) window.gtag?.("event", "webinar_signup");
      if (r.download_url) window.location.assign(r.download_url);
      else setDone(r.thank_you_message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nie udało się zapisać.");
    } finally {
      setBusy(false);
    }
  };

  if (done) return <p className="text-base">{done}</p>;
  return (
    <form onSubmit={submit} className="grid gap-5">
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <label className="grid gap-2">
        Imię
        <input
          required
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          style={focusFieldStyle}
          maxLength={80}
          autoComplete="given-name"
        />
      </label>
      <label className="grid gap-2">
        E-mail
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={focusFieldStyle}
          maxLength={255}
          autoComplete="email"
        />
      </label>
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="hidden"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
      />
      <label className="flex cursor-pointer items-start gap-3 text-sm text-muted-foreground">
        <input
          required
          type="checkbox"
          className="fy-consent-checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>
          {consentTextFor("inwestor")}{" "}
          <a className="underline" href="/polityka-prywatnosci">
            Polityka prywatności
          </a>
        </span>
      </label>
      <MktButton type="submit" variant="gold" disabled={busy}>
        {busy ? "Zapisuję…" : "Zapisz się"}
      </MktButton>
    </form>
  );
}
