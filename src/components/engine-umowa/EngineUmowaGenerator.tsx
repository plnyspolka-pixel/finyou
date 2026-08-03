import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Sparkles,
  RefreshCw,
  FileDown,
  Eye,
  Copy,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ListChecks,
} from "lucide-react";

import { listClientProfiles } from "@/lib/client-profile.functions";
import {
  previewUmowaFromEngine,
  generateUmowaFromEngine,
} from "@/lib/contract-engine/generate-umowa.functions";
import type { Problem } from "@/lib/contract-engine/validator";
import { listaKlauzul, type KlauzulaMeta } from "@/lib/contract-engine/clause-select";
import { borrowerDisplayName } from "@/lib/client-profile-math";
import type { ClientProfile } from "@/lib/client-profile-types";

interface ProfileRow {
  id: string;
  borrower_type: string | null;
  nip: string | null;
  completion_percent: number | null;
  updated_at: string | null;
  data: ClientProfile;
}

function nazwaProfilu(row: ProfileRow): string {
  try {
    const n = borrowerDisplayName(row.data);
    if (n && n !== "Pożyczkobiorca") return n;
  } catch {
    /* dane profilu niekompletne — spadamy na NIP/id */
  }
  return row.nip || row.id.slice(0, 8);
}

/** Klauzule pogrupowane po sekcji (do panelu wyboru). */
function grupujKlauzule(klauzule: KlauzulaMeta[]): { sekcja: string; items: KlauzulaMeta[] }[] {
  const grupy: { sekcja: string; items: KlauzulaMeta[] }[] = [];
  for (const k of klauzule) {
    let g = grupy.find((x) => x.sekcja === k.sekcjaTytul);
    if (!g) {
      g = { sekcja: k.sekcjaTytul, items: [] };
      grupy.push(g);
    }
    g.items.push(k);
  }
  return grupy;
}

export interface EngineUmowaGeneratorProps {
  title?: string;
  subtitle?: string;
}

/**
 * Generator umowy pożyczki z silnika klauzul (contract-engine).
 * Umowa jest składana deterministycznie z klauzul na podstawie profilu klienta;
 * operator może wyłączyć wybrane klauzule (panel „Klauzule umowy").
 */
export function EngineUmowaGenerator({ title, subtitle }: EngineUmowaGeneratorProps = {}) {
  const listFn = useServerFn(listClientProfiles);
  const previewFn = useServerFn(previewUmowaFromEngine);
  const generateFn = useServerFn(generateUmowaFromEngine);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["client-profiles"],
    queryFn: () => listFn(),
  });
  const profiles: ProfileRow[] = (data?.profiles ?? []) as ProfileRow[];

  const klauzule = useMemo(() => listaKlauzul(), []);
  const grupy = useMemo(() => grupujKlauzule(klauzule), [klauzule]);

  const [profileId, setProfileId] = useState<string>("");
  const [miejscowosc, setMiejscowosc] = useState<string>("");
  const [numerUmowy, setNumerUmowy] = useState<string>("");
  const [dataUmowy, setDataUmowy] = useState<string>("");
  // ID klauzul WYŁĄCZONYCH z umowy (domyślnie żadna — wszystkie włączone).
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const [busy, setBusy] = useState<"" | "preview" | "docx">("");
  const [preview, setPreview] = useState<string>("");
  const [problemy, setProblemy] = useState<Problem[]>([]);
  const [blocked, setBlocked] = useState<boolean | null>(null);

  const selected = useMemo(() => profiles.find((p) => p.id === profileId), [profiles, profileId]);
  const bledy = problemy.filter((p) => p.poziom === "BLAD");
  const ostrzezenia = problemy.filter((p) => p.poziom === "OSTRZEZENIE");
  const wlaczonych = klauzule.length - excluded.size;

  function toggleClause(id: string, on: boolean) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (on) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const wlaczWszystkie = () => setExcluded(new Set());
  const wylaczWszystkie = () => setExcluded(new Set(klauzule.map((k) => k.id)));

  function buildInput() {
    return {
      profileId,
      miejscowosc: miejscowosc || undefined,
      numerUmowy: numerUmowy || undefined,
      dataUmowy: dataUmowy || undefined,
      excludedClauses: excluded.size ? Array.from(excluded) : undefined,
    };
  }

  async function runPreview() {
    if (!profileId) return;
    setBusy("preview");
    try {
      const res: any = await previewFn({ data: buildInput() });
      setPreview(res.previewText ?? "");
      setProblemy(res.problemy ?? []);
      setBlocked(!!res.blocked);
      if (res.blocked) toast.warning("Podgląd niepełny — są błędy blokujące do uzupełnienia.");
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd podglądu");
    } finally {
      setBusy("");
    }
  }

  async function runDocx() {
    if (!profileId) return;
    setBusy("docx");
    try {
      const res: any = await generateFn({ data: buildInput() });
      setProblemy(res.problemy ?? []);
      setBlocked(!!res.blocked);
      if (res.blocked) {
        toast.error("Umowy nie wygenerowano — uzupełnij braki blokujące.");
      } else if (res.signedUrl) {
        window.open(res.signedUrl, "_blank");
        toast.success("Umowa wygenerowana (.docx).");
      } else {
        toast.error("Nie otrzymano pliku — spróbuj ponownie.");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd generacji");
    } finally {
      setBusy("");
    }
  }

  async function copyPreview() {
    try {
      await navigator.clipboard.writeText(preview);
      toast.success("Skopiowano podgląd.");
    } catch {
      toast.error("Nie udało się skopiować.");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Sparkles className="h-6 w-6 text-primary" /> {title ?? "Generator umowy pożyczki"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {subtitle ??
            "Umowa jest składana deterministycznie z biblioteki klauzul (silnik) na podstawie profilu klienta — nie z wypełnianego wzoru z lukami. Prowizja jest rozliczana w ratach (bez potrącania z kwoty brutto). Walidacja jest bramą: błędy blokujące wstrzymują generację."}
        </p>
      </div>

      {/* Wejście */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Dane wejściowe</CardTitle>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Odśwież profile
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Profil klienta</Label>
            <Select value={profileId} onValueChange={setProfileId}>
              <SelectTrigger>
                <SelectValue placeholder={isLoading ? "Wczytywanie…" : "Wybierz profil klienta"} />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {nazwaProfilu(p)}
                    {typeof p.completion_percent === "number"
                      ? ` — ${p.completion_percent}% uzupełnienia`
                      : ""}
                  </SelectItem>
                ))}
                {profiles.length === 0 && !isLoading ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    Brak profili — utwórz je w „Kreatorze pożyczki”.
                  </div>
                ) : null}
              </SelectContent>
            </Select>
            {selected ? (
              <p className="text-xs text-muted-foreground">
                {selected.borrower_type ? `Typ: ${selected.borrower_type}. ` : ""}
                {selected.nip ? `NIP: ${selected.nip}.` : ""}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>Miejscowość zawarcia</Label>
              <Input
                value={miejscowosc}
                onChange={(e) => setMiejscowosc(e.target.value)}
                placeholder="np. Lublinie"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Numer umowy (opcjonalnie)</Label>
              <Input
                value={numerUmowy}
                onChange={(e) => setNumerUmowy(e.target.value)}
                placeholder="np. FP/2026/014"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Data zawarcia (opcjonalnie)</Label>
              <Input type="date" value={dataUmowy} onChange={(e) => setDataUmowy(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={runPreview} disabled={!profileId || busy !== ""}>
              {busy === "preview" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Eye className="mr-2 h-4 w-4" />
              )}
              Podgląd
            </Button>
            <Button variant="secondary" onClick={runDocx} disabled={!profileId || busy !== ""}>
              {busy === "docx" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="mr-2 h-4 w-4" />
              )}
              Generuj .docx
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Wybór klauzul */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-5 w-5 text-primary" /> Klauzule umowy
            <Badge variant="outline" className="ml-1 font-normal">
              {wlaczonych}/{klauzule.length} włączonych
            </Badge>
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={wlaczWszystkie}>
              Włącz wszystkie
            </Button>
            <Button variant="ghost" size="sm" onClick={wylaczWszystkie}>
              Wyłącz wszystkie
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            Silnik domyślnie dobiera klauzule po warunkach (część pojawia się tylko, gdy dane tego
            wymagają). Poniżej możesz WYŁĄCZYĆ konkretne klauzule z tej umowy. Klauzule oznaczone
            „zawsze" pojawiają się w każdej umowie — wyłączaj je świadomie.
          </p>
          <div className="max-h-[360px] overflow-y-auto rounded-md border">
            {grupy.map((g) => (
              <div key={g.sekcja} className="border-b last:border-b-0">
                <div className="bg-muted/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.sekcja}
                </div>
                <ul className="divide-y">
                  {g.items.map((k) => {
                    const on = !excluded.has(k.id);
                    return (
                      <li key={k.id} className="flex items-start gap-3 px-3 py-2">
                        <Checkbox
                          id={`kl-${k.id}`}
                          checked={on}
                          onCheckedChange={(v) => toggleClause(k.id, v === true)}
                          className="mt-0.5"
                        />
                        <label htmlFor={`kl-${k.id}`} className="min-w-0 cursor-pointer">
                          <span className="flex items-center gap-2">
                            <code className="text-[11px] text-muted-foreground">{k.id}</code>
                            {k.obowiazkowa ? (
                              <Badge variant="secondary" className="text-[9px] font-normal">
                                zawsze
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] font-normal">
                                warunkowa
                              </Badge>
                            )}
                          </span>
                          <span className="block text-[13px] leading-snug text-foreground/90">
                            {k.snippet}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Problemy walidacji */}
      {problemy.length > 0 ? (
        <Card className={blocked ? "border-destructive/50" : "border-amber-500/40"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {blocked ? (
                <XCircle className="h-5 w-5 text-destructive" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              )}
              Walidacja
              <Badge variant="outline" className="ml-1">
                {bledy.length} błędów
              </Badge>
              <Badge variant="outline">{ostrzezenia.length} ostrzeżeń</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {blocked ? (
              <p className="text-sm text-destructive">
                Umowy nie da się wygenerować, dopóki nie zostaną usunięte błędy blokujące.
              </p>
            ) : null}
            <ul className="grid gap-1.5 text-sm">
              {[...bledy, ...ostrzezenia].map((p, i) => (
                <li key={i} className="flex items-start gap-2">
                  {p.poziom === "BLAD" ? (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  )}
                  <span>
                    <code className="text-xs text-muted-foreground">{p.sciezka}</code> {p.komunikat}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* Podgląd tekstowy */}
      {preview ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-primary" /> Podgląd umowy
            </CardTitle>
            <Button variant="outline" size="sm" onClick={copyPreview}>
              <Copy className="mr-2 h-4 w-4" /> Kopiuj
            </Button>
          </CardHeader>
          <CardContent>
            <Textarea
              readOnly
              value={preview}
              className="min-h-[420px] font-mono text-xs leading-relaxed"
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
