import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";
import {
  listWindDashboard,
  createWindCase,
  seedWindDemo,
  type WindCase,
  type WindLoan,
  type WindBorrower,
} from "@/lib/windykacja.functions";
import {
  PATH_BADGE,
  PATH_LABELS,
  stageLabel,
  delayColorClass,
  suggestNextAction,
  needsActionToday,
  type WindPath,
  type WindEventLite,
} from "@/lib/windykacja-procedure";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  ContractScanField,
  PaymentScansField,
  type PaymentScan,
} from "@/components/inwestor/wind-smart-scan";
import { formatPLN, formatDate } from "@/lib/labels";
import {
  Gavel,
  Plus,
  AlertTriangle,
  Wallet,
  FolderOpen,
  Flame,
  Loader2,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/inwestor/windykacja/")({
  component: WindykacjaDashboard,
});

type CaseRow = WindCase & { loan: (WindLoan & { borrower: WindBorrower }) | null };
type DashEvent = WindEventLite & { case_id: string; tytul: string };

const PRIORITY_BADGE: Record<string, string> = {
  niski: "bg-muted text-muted-foreground",
  sredni: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  wysoki: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  krytyczny: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

const nowISO = () => new Date().toISOString();

function WindykacjaDashboard() {
  const navigate = useNavigate();
  const fetchDash = useServerFn(listWindDashboard);
  const createCase = useServerFn(createWindCase);
  const seedDemo = useServerFn(seedWindDemo);

  const [cases, setCases] = useState<CaseRow[]>([]);
  const [eventsByCase, setEventsByCase] = useState<Record<string, DashEvent[]>>({});
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [pathFilter, setPathFilter] = useState<string>("all");

  const reload = useCallback(async () => {
    try {
      const res = await fetchDash();
      setCases(res.cases as CaseRow[]);
      const map: Record<string, DashEvent[]> = {};
      for (const e of res.events) {
        (map[e.case_id] ??= []).push(e as unknown as DashEvent);
      }
      setEventsByCase(map);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się pobrać danych");
    } finally {
      setLoading(false);
    }
  }, [fetchDash]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const metrics = useMemo(() => {
    const active = cases.filter((c) => !c.data_zamkniecia);
    const total = active.reduce((s, c) => s + Number(c.kwota_zalegla || 0), 0);
    const today = active.filter((c) =>
      needsActionToday(
        {
          sciezka: c.sciezka,
          etap: c.etap,
          opoznienie_dni: c.opoznienie_dni,
          kwota_zalegla: c.kwota_zalegla,
        },
        eventsByCase[c.id] ?? [],
        nowISO(),
      ),
    );
    const critical = active.filter((c) => c.priorytet === "krytyczny");
    return {
      activeCount: active.length,
      total,
      todayCount: today.length,
      criticalCount: critical.length,
      today,
    };
  }, [cases, eventsByCase]);

  const filtered = useMemo(() => {
    const list = pathFilter === "all" ? cases : cases.filter((c) => c.sciezka === pathFilter);
    return [...list].sort((a, b) => {
      const pr = ["krytyczny", "wysoki", "sredni", "niski"];
      const d = pr.indexOf(a.priorytet) - pr.indexOf(b.priorytet);
      if (d !== 0) return d;
      return b.opoznienie_dni - a.opoznienie_dni;
    });
  }, [cases, pathFilter]);

  const onSeed = async () => {
    setSeeding(true);
    try {
      await seedDemo();
      toast.success("Dodano dane przykładowe");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się dodać danych");
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-6">
      <FancyPageHeader
        eyebrow="Windykacja"
        title="Panel windykacji"
        subtitle="Prowadź proces windykacji krok po kroku — z rejestrem dowodowym, terminami doręczeń i podpowiedzią następnego działania."
        actions={
          <NewCaseDialog
            onCreated={(id) =>
              navigate({ to: "/inwestor/windykacja/$caseId", params: { caseId: id } })
            }
            createCase={createCase}
          />
        }
      />

      {/* Karty metryczne */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={FolderOpen} label="Sprawy w toku" value={String(metrics.activeCount)} />
        <Metric icon={Wallet} label="Kwota w windykacji" value={formatPLN(metrics.total)} />
        <Metric
          icon={AlertTriangle}
          label="Wymaga działania dziś"
          value={String(metrics.todayCount)}
          accent="amber"
        />
        <Metric
          icon={Flame}
          label="Sprawy krytyczne"
          value={String(metrics.criticalCount)}
          accent="red"
        />
      </div>

      {loading ? (
        <p className="text-muted-foreground">Ładowanie…</p>
      ) : cases.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <Gavel className="h-10 w-10 mx-auto text-muted-foreground" />
            <p className="text-muted-foreground">Brak spraw windykacyjnych.</p>
            <div className="flex items-center justify-center gap-2">
              <NewCaseDialog
                onCreated={(id) =>
                  navigate({ to: "/inwestor/windykacja/$caseId", params: { caseId: id } })
                }
                createCase={createCase}
              />
              <Button variant="outline" onClick={onSeed} disabled={seeding}>
                {seeding ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Załaduj dane
                przykładowe
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Wymaga działania dziś */}
          {metrics.today.length > 0 && (
            <Card className="border-amber-300 dark:border-amber-800">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" /> Wymaga działania dziś (
                  {metrics.today.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {metrics.today.map((c) => {
                  const s = suggestNextAction(
                    {
                      sciezka: c.sciezka,
                      etap: c.etap,
                      opoznienie_dni: c.opoznienie_dni,
                      kwota_zalegla: c.kwota_zalegla,
                    },
                    eventsByCase[c.id] ?? [],
                    nowISO(),
                  );
                  return (
                    <Link
                      key={c.id}
                      to="/inwestor/windykacja/$caseId"
                      params={{ caseId: c.id }}
                      className="flex items-center justify-between gap-3 rounded-md border p-3 hover:border-primary transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">
                          {c.loan?.borrower?.imie_nazwisko ?? "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">{s.text}</div>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Filtr + lista spraw */}
          <Card>
            <CardHeader className="flex flex-col items-start gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">Sprawy ({filtered.length})</CardTitle>
              <Select value={pathFilter} onValueChange={setPathFilter}>
                <SelectTrigger className="h-9 w-full sm:w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie ścieżki</SelectItem>
                  {(Object.keys(PATH_LABELS) as WindPath[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {PATH_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent className="space-y-2">
              {filtered.map((c) => {
                const ev = eventsByCase[c.id] ?? [];
                const last = ev[0];
                return (
                  <Link
                    key={c.id}
                    to="/inwestor/windykacja/$caseId"
                    params={{ caseId: c.id }}
                    className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1fr_auto] gap-3 items-center rounded-md border p-3 hover:border-primary transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {c.loan?.borrower?.imie_nazwisko ?? "—"}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        Umowa {c.loan?.numer_umowy ?? "—"} ·{" "}
                        {last
                          ? `${last.tytul} (${formatDate(last.data_zdarzenia)})`
                          : "brak zdarzeń"}
                      </div>
                    </div>
                    <div>
                      <div className="text-lg font-bold tabular-nums">
                        {formatPLN(c.kwota_zalegla)}
                      </div>
                      <div className={`text-xs font-medium ${delayColorClass(c.opoznienie_dni)}`}>
                        opóźnienie {c.opoznienie_dni} dni
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 items-start">
                      <Badge className={PATH_BADGE[c.sciezka]}>{PATH_LABELS[c.sciezka]}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {stageLabel(c.sciezka, c.etap)}
                      </span>
                    </div>
                    <Badge className={PRIORITY_BADGE[c.priorytet]}>{c.priorytet}</Badge>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
  accent?: "amber" | "red";
}) {
  const color =
    accent === "amber" ? "text-amber-600" : accent === "red" ? "text-red-600" : "text-primary";
  return (
    <Card>
      <CardContent className="pt-5 flex items-center gap-3">
        <div className={`grid h-10 w-10 place-items-center rounded-lg bg-muted ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-bold tabular-nums truncate">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function NewCaseDialog({
  onCreated,
  createCase,
}: {
  onCreated: (caseId: string) => void;
  createCase: ReturnType<typeof useServerFn<typeof createWindCase>>;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [payments, setPayments] = useState<PaymentScan[]>([]);
  const [f, setF] = useState({
    imie_nazwisko: "",
    typ: "osoba_fizyczna" as "osoba_fizyczna" | "firma",
    pesel: "",
    email: "",
    telefon: "",
    adres_zamieszkania: "",
    numer_umowy: "",
    data_umowy: "",
    kwota_pozyczki: "",
    kwota_calkowita: "",
    prowizja: "",
    termin_splaty: "",
    kwota_zalegla: "",
    numer_kw: "",
    sciezka: "miekka" as WindPath,
    priorytet: "sredni" as "niski" | "sredni" | "wysoki" | "krytyczny",
  });
  const upd = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  // Automatyczne wyliczenie należności: kwota do zwrotu − suma wpłat.
  const sumaWplat = payments.reduce((s, p) => s + (Number(p.kwota) || 0), 0);
  const naleznoscBazowa = Number(f.kwota_calkowita) || Number(f.kwota_pozyczki) || 0;
  const wyliczonaZaleglosc = Math.max(0, naleznoscBazowa - sumaWplat);

  const uploadToStorage = async (file: File, label: string): Promise<string | null> => {
    if (!user?.id) return null;
    const safe = file.name.replace(/[^\w.-]+/g, "_");
    const path = `windykacja/${user.id}/nowa/${Date.now()}_${label}_${safe}`;
    const { error } = await supabase.storage.from(CLIENT_FILES_BUCKET).upload(path, file, {
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });
    if (error) {
      toast.error(`Upload (${label}): ${error.message}`);
      return null;
    }
    return path;
  };

  const submit = async () => {
    if (!f.imie_nazwisko.trim()) {
      setShowDetails(true);
      toast.error("Podaj dłużnika (wgraj umowę albo wpisz ręcznie)");
      return;
    }
    setBusy(true);
    try {
      // 1) Skan umowy + potwierdzenia przelewów → Storage (dowody w aktach).
      const umowaUrl = contractFile ? await uploadToStorage(contractFile, "umowa") : null;
      const wplaty: Array<{ kwota: number; data: string; zalacznik_url?: string | null }> = [];
      for (const p of payments) {
        const kwota = Number(p.kwota) || 0;
        if (kwota <= 0) continue;
        const url = await uploadToStorage(p.file, "wplata");
        wplaty.push({ kwota, data: p.data, zalacznik_url: url });
      }

      // 2) Utworzenie sprawy — system sam liczy należność z umowy i wpłat.
      const res = await createCase({
        data: {
          imie_nazwisko: f.imie_nazwisko,
          typ: f.typ,
          pesel: f.pesel,
          email: f.email,
          telefon: f.telefon,
          adres_zamieszkania: f.adres_zamieszkania,
          adres_do_doreczen: f.adres_zamieszkania,
          email_zgoda_doreczenia: false,
          numer_umowy: f.numer_umowy,
          data_umowy: f.data_umowy,
          kwota_pozyczki: Number(f.kwota_pozyczki) || 0,
          kwota_calkowita: Number(f.kwota_calkowita) || 0,
          prowizja: Number(f.prowizja) || 0,
          termin_splaty: f.termin_splaty,
          numer_kw: f.numer_kw,
          oprocentowanie_roczne: 0,
          stopa_odsetek_max: 24.5,
          kwota_zalegla: Number(f.kwota_zalegla) || 0,
          sciezka: f.sciezka,
          etap:
            f.sciezka === "miekka"
              ? "kontakt_wstepny"
              : f.sciezka === "standardowa"
                ? "wezwanie"
                : f.sciezka === "twarda"
                  ? "wypowiedzenie"
                  : "ocena_przeslanek",
          priorytet: f.priorytet,
          umowa_url: umowaUrl,
          wplaty,
        },
      });
      toast.success("Utworzono sprawę — należność wyliczona z umowy i wpłat");
      setOpen(false);
      onCreated(res.caseId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się utworzyć sprawy");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-1" /> Nowa sprawa
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nowa sprawa windykacyjna</DialogTitle>
          <DialogDescription>
            Krok 1: wgraj umowę pożyczki. Krok 2: wgraj potwierdzenia przelewów otrzymanych od
            klienta. System sam wyliczy należność.
          </DialogDescription>
        </DialogHeader>
        <ContractScanField
          onFile={setContractFile}
          onExtract={(d) =>
            setF((p) => ({
              ...p,
              imie_nazwisko: d.imie_nazwisko ?? p.imie_nazwisko,
              typ: d.typ ?? p.typ,
              pesel: d.pesel ?? d.nip ?? p.pesel,
              email: d.email ?? p.email,
              telefon: d.telefon ?? p.telefon,
              adres_zamieszkania: d.adres ?? p.adres_zamieszkania,
              numer_umowy: d.numer_umowy ?? p.numer_umowy,
              data_umowy: d.data_umowy ?? p.data_umowy,
              kwota_pozyczki:
                d.kwota_pozyczki != null ? String(d.kwota_pozyczki) : p.kwota_pozyczki,
              kwota_calkowita:
                d.kwota_calkowita != null ? String(d.kwota_calkowita) : p.kwota_calkowita,
              prowizja: d.prowizja != null ? String(d.prowizja) : p.prowizja,
              termin_splaty: d.termin_splaty ?? p.termin_splaty,
              numer_kw: d.numer_kw ?? p.numer_kw,
            }))
          }
        />

        {/* KROK 2: potwierdzenia przelewów → system liczy należność. */}
        <PaymentScansField payments={payments} onChange={setPayments} />

        {/* Automatyczne wyliczenie należności. */}
        {naleznoscBazowa > 0 && (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Kwota do zwrotu (z umowy)</span>
              <span className="tabular-nums">{formatPLN(naleznoscBazowa)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">
                Wpłaty klienta ({payments.filter((p) => Number(p.kwota) > 0).length})
              </span>
              <span className="tabular-nums">− {formatPLN(sumaWplat)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between border-t pt-1 font-semibold">
              <span>Wyliczona należność</span>
              <span className="tabular-nums">{formatPLN(wyliczonaZaleglosc)}</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Odsetki (kapitałowe i maksymalne za opóźnienie) system doliczy automatycznie w karcie
              sprawy, na podstawie dat z umowy i wpłat.
            </p>
          </div>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-center text-muted-foreground"
          onClick={() => setShowDetails((s) => !s)}
        >
          {showDetails ? "Ukryj dane szczegółowe" : "Sprawdź / popraw dane odczytane z umowy"}
        </Button>

        <div className={showDetails ? "grid sm:grid-cols-2 gap-3" : "hidden"}>
          <Fld label="Dłużnik / firma" className="sm:col-span-2">
            <Input value={f.imie_nazwisko} onChange={(e) => upd("imie_nazwisko", e.target.value)} />
          </Fld>
          <Fld label="Typ">
            <Select value={f.typ} onValueChange={(v) => upd("typ", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="osoba_fizyczna">Osoba fizyczna</SelectItem>
                <SelectItem value="firma">Firma</SelectItem>
              </SelectContent>
            </Select>
          </Fld>
          <Fld label="PESEL / NIP">
            <Input value={f.pesel} onChange={(e) => upd("pesel", e.target.value)} />
          </Fld>
          <Fld label="E-mail">
            <Input value={f.email} onChange={(e) => upd("email", e.target.value)} />
          </Fld>
          <Fld label="Telefon">
            <Input value={f.telefon} onChange={(e) => upd("telefon", e.target.value)} />
          </Fld>
          <Fld label="Adres" className="sm:col-span-2">
            <Input
              value={f.adres_zamieszkania}
              onChange={(e) => upd("adres_zamieszkania", e.target.value)}
            />
          </Fld>
          <Fld label="Numer umowy">
            <Input value={f.numer_umowy} onChange={(e) => upd("numer_umowy", e.target.value)} />
          </Fld>
          <Fld label="Data umowy">
            <Input
              type="date"
              value={f.data_umowy}
              onChange={(e) => upd("data_umowy", e.target.value)}
            />
          </Fld>
          <Fld label="Kwota pożyczki (zł)">
            <Input
              type="number"
              value={f.kwota_pozyczki}
              onChange={(e) => upd("kwota_pozyczki", e.target.value)}
            />
          </Fld>
          <Fld label="Kwota całkowita do zwrotu (zł)">
            <Input
              type="number"
              value={f.kwota_calkowita}
              onChange={(e) => upd("kwota_calkowita", e.target.value)}
            />
          </Fld>
          <Fld label="Prowizja Finance You (zł)">
            <Input
              type="number"
              value={f.prowizja}
              onChange={(e) => upd("prowizja", e.target.value)}
            />
          </Fld>
          <Fld label="Termin spłaty">
            <Input
              type="date"
              value={f.termin_splaty}
              onChange={(e) => upd("termin_splaty", e.target.value)}
            />
          </Fld>
          <Fld label="Kwota zaległa (zł) — puste = wyliczona automatycznie">
            <Input
              type="number"
              value={f.kwota_zalegla}
              placeholder={wyliczonaZaleglosc > 0 ? String(wyliczonaZaleglosc) : ""}
              onChange={(e) => upd("kwota_zalegla", e.target.value)}
            />
          </Fld>
          <Fld label="Numer KW">
            <Input value={f.numer_kw} onChange={(e) => upd("numer_kw", e.target.value)} />
          </Fld>
          <Fld label="Ścieżka">
            <Select value={f.sciezka} onValueChange={(v) => upd("sciezka", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PATH_LABELS) as WindPath[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PATH_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Fld>
          <Fld label="Priorytet">
            <Select value={f.priorytet} onValueChange={(v) => upd("priorytet", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="niski">Niski</SelectItem>
                <SelectItem value="sredni">Średni</SelectItem>
                <SelectItem value="wysoki">Wysoki</SelectItem>
                <SelectItem value="krytyczny">Krytyczny</SelectItem>
              </SelectContent>
            </Select>
          </Fld>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Anuluj
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-1" />
            )}{" "}
            Utwórz sprawę
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Fld({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
