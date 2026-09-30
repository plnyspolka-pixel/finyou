/**
 * Baner zgód na cookies + okno ustawień. „Odrzuć” jest tak samo widoczne
 * jak „Akceptuj” (wytyczne EROD 03/2022), a kategorie opcjonalne startują
 * odznaczone. Ustawienia otwiera też każdy link `href="#ustawienia-cookies"`.
 */
import { useEffect, useState } from "react";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  onOpenCookieSettings,
  saveConsent,
  useCookieConsent,
  type ConsentSource,
} from "@/lib/cookie-consent";

const CATEGORIES = [
  {
    key: "necessary",
    title: "Niezbędne",
    desc: "Logowanie, bezpieczeństwo, działanie formularzy i zapamiętanie Twojego wyboru. Nie da się ich wyłączyć.",
  },
  {
    key: "analytics",
    title: "Analityczne",
    desc: "Statystyki odwiedzin i sposobu korzystania ze strony (Google Analytics, Microsoft Clarity), dzięki którym ją ulepszamy.",
  },
  {
    key: "marketing",
    title: "Marketingowe",
    desc: "Mierzenie skuteczności reklam i dopasowanie reklam (Meta Pixel, Google Ads).",
  },
] as const;

export function CookieBanner() {
  const consent = useCookieConsent();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(
    () =>
      onOpenCookieSettings(() => {
        setSettingsOpen(true);
      }),
    [],
  );

  // Otwierając ustawienia pokazujemy aktualny wybór.
  useEffect(() => {
    if (!settingsOpen) return;
    setAnalytics(consent?.analytics ?? false);
    setMarketing(consent?.marketing ?? false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tylko w chwili otwarcia
  }, [settingsOpen]);

  const decide = (a: boolean, m: boolean, source: ConsentSource) => {
    setSettingsOpen(false);
    saveConsent({ analytics: a, marketing: m }, source);
  };

  const values = { analytics, marketing } as const;
  const setters = { analytics: setAnalytics, marketing: setMarketing } as const;

  return (
    <>
      {consent === null && !settingsOpen && (
        <div
          role="region"
          aria-label="Zgoda na pliki cookies"
          className="fixed inset-x-0 bottom-0 z-[60] p-3 sm:p-4"
        >
          <div className="mx-auto flex max-w-4xl flex-col gap-4 rounded-xl border bg-card p-4 text-card-foreground shadow-2xl sm:p-5 md:flex-row md:items-end">
            <div className="flex-1 text-sm">
              <p className="flex items-center gap-2 font-semibold text-foreground">
                <Cookie className="h-4 w-4 text-accent" aria-hidden />
                Szanujemy Twoją prywatność
              </p>
              <p className="mt-1.5 text-muted-foreground">
                Używamy niezbędnych plików cookies, aby strona działała. Za Twoją zgodą użyjemy też
                cookies analitycznych i marketingowych. Zgodę możesz w każdej chwili zmienić lub
                wycofać w „Ustawieniach cookies” w stopce strony. Szczegóły w{" "}
                <a href="/polityka-cookies" className="underline hover:text-foreground">
                  polityce cookies
                </a>
                .
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row md:shrink-0">
              <Button variant="outline" onClick={() => setSettingsOpen(true)}>
                Ustawienia
              </Button>
              <Button variant="outline" onClick={() => decide(false, false, "banner_reject")}>
                Odrzuć opcjonalne
              </Button>
              <Button onClick={() => decide(true, true, "banner_accept_all")}>
                Akceptuj wszystkie
              </Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ustawienia cookies</DialogTitle>
            <DialogDescription>
              Wybierz, na które pliki cookies się zgadzasz. Więcej w{" "}
              <a href="/polityka-cookies" className="underline">
                polityce cookies
              </a>
              .
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-3">
            {CATEGORIES.map((c) => {
              const id = `cookie-cat-${c.key}`;
              const locked = c.key === "necessary";
              return (
                <li key={c.key} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor={id} className="text-sm font-semibold">
                      {c.title}
                    </label>
                    <Switch
                      id={id}
                      checked={locked ? true : values[c.key]}
                      disabled={locked}
                      onCheckedChange={locked ? undefined : (v) => setters[c.key](v)}
                      aria-describedby={`${id}-desc`}
                    />
                  </div>
                  <p id={`${id}-desc`} className="mt-1 text-xs text-muted-foreground">
                    {c.desc}
                  </p>
                </li>
              );
            })}
          </ul>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => decide(false, false, "settings")}>
              Odrzuć opcjonalne
            </Button>
            <Button variant="outline" onClick={() => decide(analytics, marketing, "settings")}>
              Zapisz wybór
            </Button>
            <Button onClick={() => decide(true, true, "settings")}>Akceptuj wszystkie</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
