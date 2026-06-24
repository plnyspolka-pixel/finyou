import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Sparkles, Send, ArrowRight, Building2, FileText, ShieldCheck, CheckCircle2, Rocket, Briefcase, Save } from "lucide-react";
import { toast } from "sonner";
import { assistBusinessDescription } from "@/lib/ai-assist.functions";
import { gusCompanyLookup } from "@/lib/gus-bir.functions";
import { legalFormLabels } from "@/components/application-info-badges";

export const Route = createFileRoute("/wniosek-opis")({
  component: WniosekOpisPage,
  head: () => ({
    meta: [
      { title: "Zwiększ swoje szanse na sukces" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

type BoostItem = {
  key: string;
  done: boolean;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
};

function WniosekOpisPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const assist = useServerFn(assistBusinessDescription);
  const gusLookup = useServerFn(gusCompanyLookup);

  const [loanId, setLoanId] = useState<string | null>(null);
  const [purpose, setPurpose] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [hasCompanyData, setHasCompanyData] = useState(false);
  const [hasIncomeDocs, setHasIncomeDocs] = useState(false);
  const [hasBikReport, setHasBikReport] = useState(false);

  // Profil działalności
  const [bizStatus, setBizStatus] = useState<string>("");
  const [legalForm, setLegalForm] = useState<string>("");
  const [nip, setNip] = useState<string>("");
  const [nipVerifiedAt, setNipVerifiedAt] = useState<string | null>(null);
  const [isStartup, setIsStartup] = useState(false);
  const [startupDep, setStartupDep] = useState(false);
  const [bizSaving, setBizSaving] = useState(false);
  const [nipChecking, setNipChecking] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) void navigate({ to: "/logowanie" });
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data: c } = await supabase
        .from("clients")
        .select("id, nip, regon, krs, bik_report_uploaded_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!c) { setLoading(false); return; }
      setHasCompanyData(Boolean((c as any).nip || (c as any).regon || (c as any).krs));
      setHasBikReport(Boolean((c as any).bik_report_uploaded_at));

      const { data: la } = await supabase
        .from("loan_applications")
        .select("id, investor_description, investor_purpose, business_status, business_legal_form, nip, business_nip_verified_at, is_startup, startup_funding_dependency")
        .eq("client_id", c.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (la) {
        setLoanId(la.id);
        const r = la as any;
        setDescription(r.investor_description ?? "");
        setPurpose(r.investor_purpose ?? "");
        setBizStatus(r.business_status ?? "");
        setLegalForm(r.business_legal_form ?? "");
        setNip(r.nip ?? (c as any).nip ?? "");
        setNipVerifiedAt(r.business_nip_verified_at ?? null);
        setIsStartup(Boolean(r.is_startup));
        setStartupDep(Boolean(r.startup_funding_dependency));

        const { data: ds } = await supabase
          .from("documents")
          .select("document_type")
          .eq("loan_application_id", la.id);
        setHasIncomeDocs(
          (ds ?? []).some((d) => /doch[oó]d|pit|zaświadczen/i.test(String((d as any).document_type ?? "")))
        );
      }
      setLoading(false);
    })();
  }, [user]);

  const saveBusinessProfile = async () => {
    if (!loanId) return;
    setBizSaving(true);
    try {
      const { error } = await supabase
        .from("loan_applications")
        .update({
          business_status: (bizStatus || null) as any,
          business_legal_form: legalForm || null,
          nip: nip.trim() || null,
          is_startup: isStartup,
          startup_funding_dependency: isStartup ? startupDep : null,
        } as any)
        .eq("id", loanId);
      if (error) throw error;
      toast.success("Zapisano profil działalności");
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd zapisu");
    } finally {
      setBizSaving(false);
    }
  };

  const verifyNip = async () => {
    const clean = nip.replace(/\D/g, "");
    if (clean.length !== 10) { toast.error("NIP musi mieć 10 cyfr"); return; }
    if (!loanId) return;
    setNipChecking(true);
    try {
      const res: any = await gusLookup({ data: { nip: clean } });
      if (res?.success) {
        const stamp = new Date().toISOString();
        const { error } = await supabase
          .from("loan_applications")
          .update({ nip: clean, business_nip_verified_at: stamp } as any)
          .eq("id", loanId);
        if (error) throw error;
        setNip(clean);
        setNipVerifiedAt(stamp);
        toast.success(`NIP zweryfikowany${res?.company?.name ? ` — ${res.company.name}` : ""}`);
      } else {
        toast.error(res?.message ?? "Nie znaleziono firmy w GUS dla tego NIP");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd weryfikacji NIP");
    } finally {
      setNipChecking(false);
    }
  };

  const generate = async (mode: "draft" | "improve" | "expand") => {
    if (!loanId) { toast.error("Brak wniosku"); return; }
    setAiBusy(true);
    try {
      const res: any = await assist({
        data: { currentText: description, hint: purpose, mode, loanId },
      });
      if (res?.text) setDescription(res.text);
      toast.success("Gotowe — sprawdź i popraw wedle uznania.");
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd AI");
    } finally {
      setAiBusy(false);
    }
  };

  const saveDescription = async () => {
    if (!loanId) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("loan_applications")
        .update({
          investor_description: description.trim() || null,
          investor_purpose: purpose.trim() || null,
        })
        .eq("id", loanId);
      if (error) throw error;
      toast.success("Zapisano opis dla inwestora");
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd zapisu");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="grid min-h-screen place-items-center text-muted-foreground">Ładowanie…</div>;

  const hasInvestorDescription = description.trim().length > 0;

  const boostItems: BoostItem[] = [
    {
      key: "company",
      done: hasCompanyData,
      icon: Building2,
      title: "Pełne dane firmowe",
      description: "NIP, REGON, KRS i adres — automatycznie pobierzemy z rejestrów państwowych.",
      ctaLabel: hasCompanyData ? "Zarządzaj" : "Uzupełnij",
      ctaHref: "/klient/profil",
    },
    {
      key: "income",
      done: hasIncomeDocs,
      icon: FileText,
      title: "Dokumenty dochodowe",
      description: "PIT, zaświadczenia o dochodach, wyciąg bankowy — pokazują inwestorowi Twoją zdolność spłaty.",
      ctaLabel: hasIncomeDocs ? "Zarządzaj" : "Dodaj",
      ctaHref: "/klient/profil",
    },
    {
      key: "bik",
      done: hasBikReport,
      icon: ShieldCheck,
      title: "Raport BIK",
      description: "Pełny raport BIK najmocniej zwiększa zaufanie inwestora do Twojej historii kredytowej.",
      ctaLabel: hasBikReport ? "Zarządzaj" : "Wgraj",
      ctaHref: "/klient/profil",
    },
  ];
  const boostDone = (hasInvestorDescription ? 1 : 0) + boostItems.filter((b) => b.done).length;
  const boostTotal = boostItems.length + 1;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="rounded-2xl border bg-emerald-50/60 p-5 dark:bg-emerald-950/20">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm font-semibold">Wniosek przekazany do inwestora</span>
          </div>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight md:text-3xl">
            Zwiększ swoje szanse na sukces
          </h1>
          <p className="mt-2 text-sm text-muted-foreground md:text-base">
            Wniosek już jest u inwestora. Każdy z poniższych elementów nie jest wymagany,
            ale realnie zwiększa szansę, że inwestor wybierze właśnie Twój projekt.
          </p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-semibold">
            <Sparkles className="h-3.5 w-3.5 text-violet-500" />
            Postęp: {boostDone} / {boostTotal}
          </div>
        </div>

        {/* Profil działalności */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-violet-500" />
              Profil działalności
            </CardTitle>
            <CardDescription>
              Powiedz inwestorowi, czy prowadzisz działalność, czy to startup i w jakiej formie.
              Im więcej konkretów, tym wyższe zaufanie i lepsze warunki.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Czy prowadzisz działalność gospodarczą?</Label>
                <Select value={bizStatus} onValueChange={(v) => setBizStatus(v)}>
                  <SelectTrigger><SelectValue placeholder="Wybierz…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prowadzi">Tak, prowadzę</SelectItem>
                    <SelectItem value="zamierza">Zamierzam rozpocząć</SelectItem>
                    <SelectItem value="nie_zamierza">Nie, nie planuję</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(bizStatus === "prowadzi" || bizStatus === "zamierza") && (
                <div>
                  <Label>Forma prawna</Label>
                  <Select value={legalForm} onValueChange={(v) => setLegalForm(v)}>
                    <SelectTrigger><SelectValue placeholder="Wybierz formę…" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(legalFormLabels).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {(bizStatus === "prowadzi" || bizStatus === "zamierza") && (
              <div>
                <Label htmlFor="nip-input">NIP firmy</Label>
                <div className="flex gap-2">
                  <Input
                    id="nip-input"
                    inputMode="numeric"
                    maxLength={13}
                    placeholder="np. 5252344078"
                    value={nip}
                    onChange={(e) => { setNip(e.target.value); setNipVerifiedAt(null); }}
                  />
                  <Button type="button" variant="outline" onClick={() => void verifyNip()} disabled={nipChecking || !nip.trim()}>
                    {nipChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : nipVerifiedAt ? <><CheckCircle2 className="mr-1 h-4 w-4 text-emerald-600" /> Zweryfikowany</> : "Zweryfikuj w GUS"}
                  </Button>
                </div>
                {nipVerifiedAt && (
                  <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">NIP zweryfikowany w rejestrze GUS.</p>
                )}
              </div>
            )}

            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox checked={isStartup} onCheckedChange={(v) => setIsStartup(Boolean(v))} className="mt-0.5" />
                <span className="text-sm">
                  <span className="flex items-center gap-1 font-medium"><Rocket className="h-4 w-4 text-violet-500" />To jest startup</span>
                  <span className="block text-xs text-muted-foreground">Nowy projekt / nowa działalność, jeszcze bez historii finansowej.</span>
                </span>
              </label>
              {isStartup && (
                <label className="flex items-start gap-2 cursor-pointer pl-6">
                  <Checkbox checked={startupDep} onCheckedChange={(v) => setStartupDep(Boolean(v))} className="mt-0.5" />
                  <span className="text-sm">
                    Rozpoczęcie działalności jest <b>uzależnione</b> od uzyskania finansowania.
                    <span className="block text-xs text-muted-foreground">Inwestor wie, że bez jego decyzji projekt nie ruszy.</span>
                  </span>
                </label>
              )}
            </div>

            <div className="flex justify-end">
              <Button onClick={() => void saveBusinessProfile()} disabled={bizSaving || !loanId}>
                {bizSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" /> Zapisz profil</>}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Opis dla inwestora — kluczowy boost, edytowalny w miejscu */}
        <Card className="border-violet-200 bg-violet-50/30 dark:border-violet-900/50 dark:bg-violet-950/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {hasInvestorDescription ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <Sparkles className="h-5 w-5 text-violet-500" />
              )}
              Opis dla inwestora
            </CardTitle>
            <CardDescription>
              Krótka historia, dlaczego potrzebujesz finansowania i jak planujesz spłatę — buduje zaufanie inwestorów.
              Możesz wygenerować propozycję AI i ją doszlifować.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!loanId ? (
              <p className="text-sm text-muted-foreground">
                Najpierw uzupełnij wniosek.{" "}
                <Link to="/wniosek-formularz" className="font-semibold text-primary underline">
                  Przejdź do wniosku
                </Link>
              </p>
            ) : (
              <>
                <div>
                  <Label htmlFor="purpose">Cel pożyczki (krótko, 1–2 zdania)</Label>
                  <Input
                    id="purpose"
                    maxLength={500}
                    placeholder="np. zakup lokalu pod wynajem krótkoterminowy w Krakowie"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                  />
                </div>

                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <Label htmlFor="desc">Opis dla inwestora</Label>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" disabled={aiBusy} onClick={() => void generate("draft")}>
                        {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="mr-1 h-4 w-4" /> Wygeneruj</>}
                      </Button>
                      <Button type="button" size="sm" variant="outline" disabled={aiBusy || !description.trim()} onClick={() => void generate("improve")}>
                        Popraw AI
                      </Button>
                      <Button type="button" size="sm" variant="outline" disabled={aiBusy || !description.trim()} onClick={() => void generate("expand")}>
                        Rozwiń AI
                      </Button>
                    </div>
                  </div>
                  <Textarea
                    id="desc"
                    rows={8}
                    maxLength={4000}
                    placeholder="Akapit dla inwestora: na co środki, jaki efekt biznesowy, źródła spłaty, harmonogram…"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{description.length}/4000</p>
                </div>

                <div className="flex justify-end">
                  <Button onClick={() => void saveDescription()} disabled={submitting || !description.trim()}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="mr-2 h-4 w-4" /> Zapisz opis</>}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Pozostałe boostery */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {boostItems.map((it) => {
            const Icon = it.icon;
            return (
              <Card key={it.key} className={it.done ? "border-emerald-300/60" : "border-violet-200 dark:border-violet-900/50"}>
                <CardContent className="flex h-full flex-col gap-3 p-5">
                  <div className="flex items-center gap-2">
                    {it.done ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                    ) : (
                      <Icon className="h-5 w-5 shrink-0 text-violet-500" />
                    )}
                    <h3 className="text-base font-bold">{it.title}</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">{it.description}</p>
                  <Button asChild size="sm" variant={it.done ? "outline" : "secondary"} className="mt-auto self-start">
                    <Link to={it.ctaHref}>
                      {it.ctaLabel} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" asChild>
            <Link to="/klient">Wróć do wniosku</Link>
          </Button>
          <Button asChild variant="cta" size="cta">
            <Link to="/klient">Przejdź do panelu</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
