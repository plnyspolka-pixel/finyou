import { useEffect, useRef, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getFreeLessonVideo, saveFreeLessonProgress } from "@/lib/free-lesson.functions";
import { submitLeadMagnetSignup } from "@/lib/lead-magnets/lead-magnets.functions";
import { newVideoMilestones } from "@/lib/free-lesson";
import { hasConsent } from "@/lib/cookie-consent";
import type { PublicLeadMagnet } from "@/lib/lead-magnets/core";
import { SUBSCRIPTION_PRICE_SENTENCE, SUBSCRIPTION_YEARLY_PER_MONTH_PLN, plnLabel } from "@/lib/investor-plan/plans";
import { MktButton, Eyebrow } from "./primitives";
import { focusFieldStyle } from "./focus-shell";

export function FreeLessonExperience({ magnet, token: initialToken }: { magnet: PublicLeadMagnet; token?: string }) {
  const signupFn = useServerFn(submitLeadMagnetSignup);
  const videoFn = useServerFn(getFreeLessonVideo);
  const progressFn = useServerFn(saveFreeLessonProgress);
  const [token, setToken] = useState(initialToken ?? "");
  const [firstName, setFirstName] = useState(""); const [email, setEmail] = useState(""); const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [video, setVideo] = useState<Awaited<ReturnType<typeof getFreeLessonVideo>> | null>(null);
  const media = useRef<HTMLVideoElement>(null); const milestones = useRef(new Set<number>());
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = () => videoFn({ data: { token } }).then(v => {
      if (cancelled) return;
      const previousTime = media.current?.currentTime ?? 0;
      const playing = Boolean(media.current && !media.current.paused);
      setVideo(v);
      if (media.current && previousTime > 0) media.current.addEventListener("loadedmetadata", () => { if (media.current) { media.current.currentTime = previousTime; if (playing) void media.current.play().catch(() => {}); } }, { once: true });
    }).catch(() => { if (!cancelled) setError("Link nieważny lub wygasł. Zapisz się ponownie."); });
    void load(); const timer = setInterval(() => { void load(); }, 10 * 60 * 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [token, videoFn]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!consent) return; setBusy(true); setError("");
    try {
      const result = await signupFn({ data: { slug: magnet.slug, first_name: firstName, email, consent: true } });
      const nextToken = result.download_url ? new URL(result.download_url).searchParams.get("t") : null;
      if (!nextToken) throw new Error("Nie udało się otworzyć lekcji.");
      setToken(nextToken);
      const url = new URL(window.location.href); url.searchParams.set("t", nextToken); window.history.replaceState(null, "", url);
      const { trackEvent } = await import("@/lib/fb-pixel");
      await trackEvent("Lead", { content_category: "investor", content_name: "darmowa-lekcja" });
    } catch (e) { setError(e instanceof Error ? e.message : "Nie udało się zapisać."); } finally { setBusy(false); }
  };
  const progress = (percent: number) => {
    if (!token) return;
    const fresh = newVideoMilestones(percent, milestones.current);
    for (const p of fresh) {
      const event = p === 0 ? "video_start" : p === 100 ? "video_complete" : `video_${p}`;
      if (hasConsent("marketing")) (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq?.("trackCustom", event, { content_name: "darmowa-lekcja" });
      if (hasConsent("analytics")) window.gtag?.("event", event, { content_name: "darmowa-lekcja", video_percent: p });
    }
    if (fresh.length && (hasConsent("analytics") || hasConsent("marketing"))) void progressFn({ data: { token, percent: Math.min(100, Math.floor(percent)) } }).catch(() => {});
  };
  return <section className="fy-tool-layout"><div className="fy-tool-intro"><Eyebrow tone="gold">Bezpłatna lekcja · dla inwestora</Eyebrow><h1 className="mt-4 text-3xl font-extrabold leading-tight">{magnet.headline}</h1><p className="mt-5 text-muted-foreground">{magnet.subheadline}</p><ul className="fy-sales-checks">{magnet.benefits.map(b => <li key={b}>✓ {b}</li>)}</ul></div><div className="fy-tool-panel fy-sales-video-box">{error && <p role="alert" className="mb-4 text-destructive">{error}</p>}{video ? <><video ref={media} controls playsInline preload="metadata" className="fy-sales-video" src={video.url} poster={video.poster ?? undefined} onPlay={() => progress(0)} onTimeUpdate={e => { const v = e.currentTarget; if (v.duration > 0) progress(v.currentTime / v.duration * 100); }} onEnded={() => progress(100)}/><h2 className="mt-5 text-xl font-bold">{video.title}</h2><p className="mt-3 text-sm text-muted-foreground">{video.description}</p><p className="mt-5">7 modułów: strategia, prawo, operacje, nieruchomość, klient, case study i windykacja.</p><p className="mt-3 font-semibold">{SUBSCRIPTION_PRICE_SENTENCE}</p><p className="mt-2 text-sm text-muted-foreground">Ok. {plnLabel(SUBSCRIPTION_YEARLY_PER_MONTH_PLN)} miesięcznie w 12 ratach; warunki określa dostawca przed zakupem.</p><div className="fy-sales-actions"><MktButton variant="gold" href="/#cennik">Zobacz program i cenę</MktButton><MktButton variant="outline" href="/abonament-inwestora?okres=rocznie&kod=">Mam kod rabatowy</MktButton></div></> : <form onSubmit={submit} className="grid gap-5"><label className="grid gap-2">Imię<input required value={firstName} onChange={e => setFirstName(e.target.value)} style={focusFieldStyle} maxLength={80} autoComplete="given-name"/></label><label className="grid gap-2">E-mail<input required type="email" value={email} onChange={e => setEmail(e.target.value)} style={focusFieldStyle} maxLength={255} autoComplete="email"/></label><label className="flex gap-3 text-sm text-muted-foreground"><input required type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/><span>{magnet.consent_text} <a className="underline" href="/polityka-prywatnosci">Polityka prywatności</a></span></label><MktButton type="submit" variant="gold" disabled={busy}>{busy ? "Otwieram lekcję…" : "Obejrzyj darmową lekcję"}</MktButton><p className="text-xs text-muted-foreground">Odtwarzacz otworzy się tutaj. Link w e-mailu jest ważny 30 dni.</p></form>}</div></section>;
}