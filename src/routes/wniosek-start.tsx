import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

type ConsentKind = "privacy" | "marketing" | "terms";
type ConsentDoc = { id: string; kind: ConsentKind; title: string; content: string; version: number };

export const Route = createFileRoute("/wniosek-start")({
  component: WniosekStartPage,
  head: () => ({
    meta: [
      { title: "Kontynuuj wniosek" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const STORAGE_KEY = "embed_calc_v1";

function captureParamsToStorage() {
  if (typeof window === "undefined") return;
  const sp = new URLSearchParams(window.location.search);
  if (!sp.get("amount") && !sp.get("secType")) return;
  const payload = {
    amount: Number(sp.get("amount")) || null,
    annualRate: Number(sp.get("annualRate")) || null,
    months: Number(sp.get("months")) || null,
    maxPayment: Number(sp.get("maxPayment")) || null,
    secType: sp.get("secType") || null,
    source: sp.get("source") || "embed",
  };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* noop */
  }
}

function getNextPath(): string {
  if (typeof window === "undefined") return "/wniosek-warunki";
  const sp = new URLSearchParams(window.location.search);
  const next = sp.get("next");
  if (next && /^\/[a-z0-9/_-]+$/i.test(next)) return next;
  // Po podaniu danych → zawsze do kalkulatora (warunki: oprocentowanie + max rata)
  return "/wniosek-warunki";
}


function WniosekStartPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [consentDocs, setConsentDocs] = useState<Record<ConsentKind, ConsentDoc | null>>({ privacy: null, marketing: null, terms: null });
  const [accepted, setAccepted] = useState<Record<ConsentKind, boolean>>({ privacy: false, marketing: false, terms: false });
  const [contactConsent, setContactConsent] = useState(false);

  // Stan "user jest zalogowany przez OAuth, ale brak numeru telefonu"
  const [needsPhone, setNeedsPhone] = useState<null | { userId: string }>(null);
  const [phonePost, setPhonePost] = useState("");
  const [phoneBusy, setPhoneBusy] = useState(false);

  // Zapamiętaj parametry kalkulatora przed jakimkolwiek redirectem (OAuth wraca tu z powrotem).
  useEffect(() => {
    captureParamsToStorage();
    // Prefill z linku /wniosek/$token (lead z Meta itp.)
    try {
      const raw = sessionStorage.getItem("wniosek_prefill_v1");
      if (raw) {
        const p = JSON.parse(raw);
        if (p.firstName) setFirstName(p.firstName);
        if (p.lastName && p.lastName !== "—") setLastName(p.lastName);
        if (p.email) setEmail(p.email);
        if (p.phone) setPhone(p.phone);
      }
    } catch { /* noop */ }
  }, []);

  // Pobierz aktywne treści zgód
  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("consent_documents")
        .select("id, kind, title, content, version")
        .eq("is_active", true);
      const next: Record<ConsentKind, ConsentDoc | null> = { privacy: null, marketing: null, terms: null };
      (data as ConsentDoc[] | null)?.forEach((d) => { next[d.kind] = d; });
      setConsentDocs(next);
    })();
  }, []);

  // Już zalogowany → sprawdź czy ma numer telefonu. Jeśli nie — pokaż formularz "podaj telefon".
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    void (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("phone")
        .eq("user_id", user.id)
        .maybeSingle();
      const existingPhone = (profile as { phone?: string | null } | null)?.phone;
      if (!existingPhone || existingPhone.trim().length < 6) {
        setNeedsPhone({ userId: user.id });
      } else {
        void navigate({ to: getNextPath() });
      }
    })();
  }, [authLoading, user, navigate]);

  const oauth = async (provider: "google" | "apple") => {
    const sp = new URLSearchParams(window.location.search);
    const ret = new URL("/wniosek-start", window.location.origin);
    const nx = sp.get("next");
    if (nx) ret.searchParams.set("next", nx);
    const res = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: ret.toString(),
    });
    if (res.error) {
      const msg = res.error.message || "";
      if (/cancel/i.test(msg)) return;
      toast.error("Logowanie nie powiodło się", { description: msg });
    }
  };

  const submitPhonePost = async (e: FormEvent) => {
    e.preventDefault();
    if (!needsPhone) return;
    if (!phonePost.trim() || phonePost.trim().length < 9) {
      toast.error("Podaj poprawny numer telefonu");
      return;
    }
    setPhoneBusy(true);
    const { error } = await supabase
      .from("profiles")
      .upsert({ user_id: needsPhone.userId, phone: phonePost.trim() }, { onConflict: "user_id" });
    if (!error) {
      // synchronizuj też w clients jeśli istnieje
      await supabase.from("clients").update({ phone: phonePost.trim() }).eq("user_id", needsPhone.userId);
    }
    setPhoneBusy(false);
    if (error) {
      toast.error("Nie udało się zapisać numeru", { description: error.message });
      return;
    }
    toast.success("Numer zapisany");
    void navigate({ to: getNextPath() });
  };

  const submitSignup = async (e: FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim() || !password) {
      toast.error("Uzupełnij wszystkie pola");
      return;
    }
    // Wymagane: polityka prywatności + regulamin + zgoda na kontakt. Marketing — dobrowolny.
    if (!accepted.privacy) {
      toast.error("Musisz zaakceptować politykę prywatności i regulamin");
      return;
    }
    if (consentDocs.terms && !accepted.terms) {
      toast.error("Musisz zaakceptować regulamin");
      return;
    }
    if (!contactConsent) {
      toast.error("Musisz wyrazić zgodę na kontakt — bez niej nie obsłużymy wniosku");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/wniosek-start`,
        data: { first_name: firstName, last_name: lastName, phone },
      },
    });
    setBusy(false);
    if (error) {
      toast.error("Rejestracja nie powiodła się", { description: error.message });
      return;
    }
    if (data.user) {
      await supabase.from("profiles").update({ phone }).eq("user_id", data.user.id);
    }
    // Zapisz zgody (snapshot wersji) jako klienta — jeśli klient z tym user_id istnieje, zaktualizuj; inaczej wstaw.
    if (data.user) {
      const versions: Record<string, { id: string; version: number; accepted: boolean }> = {};
      (Object.keys(accepted) as ConsentKind[]).forEach((k) => {
        const doc = consentDocs[k];
        if (doc) versions[k] = { id: doc.id, version: doc.version, accepted: accepted[k] };
      });
      const consentPayload = {
        consent_rodo: !!accepted.privacy,
        consent_marketing: !!accepted.marketing,
        consent_terms: !!accepted.terms,
        consent_phone: contactConsent,
        consent_email: contactConsent,
        consent_sms: contactConsent,
        consent_versions: versions,
        consents_accepted_at: new Date().toISOString(),
      };
      const { data: existing } = await supabase.from("clients").select("id").eq("user_id", data.user.id).maybeSingle();
      if (existing?.id) {
        await supabase.from("clients").update(consentPayload).eq("id", existing.id);
      } else {
        await supabase.from("clients").insert({
          user_id: data.user.id,
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          source: "wniosek-start",
          ...consentPayload,
        });
      }
    }
    if (!data.session) {
      // Auto-confirm jest włączone — od razu logujemy bez potwierdzania maila
      await supabase.auth.signInWithPassword({ email, password });
    }
    toast.success("Konto utworzone");
    try {
      const { trackEvent } = await import("@/lib/fb-pixel");
      await trackEvent("StartApplication", { content_name: "Start wniosku" }, { email, phone, firstName, lastName });
    } catch {}
    navigate({ to: getNextPath() });
  };

  const submitSignin = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error("Nie udało się zalogować", { description: error.message });
      return;
    }
    navigate({ to: getNextPath() });
  };

  // Render: brakuje telefonu po OAuth
  if (needsPhone) {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Jeszcze jedna rzecz — Twój telefon</CardTitle>
            <CardDescription>
              Skontaktujemy się z Tobą w sprawie wniosku. Numer jest wymagany, żeby przejść do kolejnego kroku.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submitPhonePost}>
              <div className="space-y-2">
                <Label htmlFor="phone-post">Numer telefonu</Label>
                <Input
                  id="phone-post"
                  type="tel"
                  required
                  autoFocus
                  value={phonePost}
                  onChange={(e) => setPhonePost(e.target.value)}
                  placeholder="+48 600 000 000"
                />
              </div>
              <Button type="submit" variant="cta" size="cta" className="w-full" disabled={phoneBusy}>
                {phoneBusy ? "Zapisuję…" : "Zapisz numer i kontynuuj"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{mode === "signup" ? "Zobacz harmonogram spłat" : "Zaloguj się"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">


          {mode === "signup" ? (
            <form className="space-y-4" onSubmit={submitSignup}>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="fn">Imię</Label>
                  <Input id="fn" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ln">Nazwisko</Label>
                  <Input id="ln" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefon</Label>
                <Input id="phone" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+48 600 000 000" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Hasło</Label>
                <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              
              <div className="space-y-2 rounded-md border p-3 text-sm">
                <label className="flex items-start gap-2">
                  <Checkbox
                    checked={accepted.privacy}
                    onCheckedChange={(v) => setAccepted({ ...accepted, privacy: v === true })}
                    className="mt-0.5"
                  />
                  <span className="leading-snug">
                    Akceptuję{" "}
                    <a href="/polityka-prywatnosci" target="_blank" rel="noreferrer" className="text-accent hover:underline">politykę prywatności</a>
                    {" "}oraz{" "}
                    <a href="/regulamin" target="_blank" rel="noreferrer" className="text-accent hover:underline">regulamin serwisu</a>
                    <span className="text-destructive"> *</span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <Checkbox
                    checked={contactConsent}
                    onCheckedChange={(v) => setContactConsent(v === true)}
                    className="mt-0.5"
                  />
                  <span className="leading-snug">
                    Wyrażam zgodę na kontakt telefoniczny, e-mailowy oraz SMS-owy, w tym z wykorzystaniem agentów konwersacyjnych AI, w celu obsługi mojego wniosku.
                    <span className="text-destructive"> *</span>
                  </span>
                </label>
              </div>
              <Button type="submit" variant="cta" size="cta" className="w-full" disabled={busy}>
                {busy ? "Tworzenie konta…" : "Zobacz harmonogram spłat"}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Masz już konto?{" "}
                <button type="button" className="font-medium text-accent hover:underline" onClick={() => setMode("signin")}>
                  Zaloguj się
                </button>
              </p>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={submitSignin}>
              <div className="space-y-2">
                <Label htmlFor="email2">E-mail</Label>
                <Input id="email2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password2">Hasło</Label>
                <Input id="password2" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" variant="cta" size="cta" className="w-full" disabled={busy}>
                {busy ? "Logowanie…" : "Zaloguj się i kontynuuj"}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Nie masz jeszcze konta?{" "}
                <button type="button" className="font-medium text-accent hover:underline" onClick={() => setMode("signup")}>
                  Załóż konto
                </button>
              </p>
            </form>
          )}

          <p className="text-center text-xs text-muted-foreground">
            <Link to="/" className="hover:underline">Wróć do strony głównej</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ConsentCheckboxes({
  docs, accepted, onChange,
}: {
  docs: Record<ConsentKind, ConsentDoc | null>;
  accepted: Record<ConsentKind, boolean>;
  onChange: (next: Record<ConsentKind, boolean>) => void;
}) {
  const items: { key: ConsentKind; required: boolean }[] = [
    { key: "privacy", required: true },
    { key: "terms", required: true },
    { key: "marketing", required: false },
  ];
  const visible = items.filter((it) => docs[it.key]);
  if (visible.length === 0) return null;
  return (
    <div className="space-y-2 rounded-md border p-3">
      {visible.map(({ key, required }) => {
        const doc = docs[key]!;
        return (
          <label key={key} className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={accepted[key]}
              onCheckedChange={(v) => onChange({ ...accepted, [key]: v === true })}
              className="mt-0.5"
            />
            <span className="leading-snug">
              {doc.title}{required && <span className="text-destructive"> *</span>}{" "}
              <Dialog>
                <DialogTrigger asChild>
                  <button type="button" className="text-accent hover:underline">(czytaj)</button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader><DialogTitle>{doc.title}</DialogTitle></DialogHeader>
                  <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm text-muted-foreground">
                    {doc.content}
                  </div>
                </DialogContent>
              </Dialog>
            </span>
          </label>
        );
      })}
    </div>
  );
}
