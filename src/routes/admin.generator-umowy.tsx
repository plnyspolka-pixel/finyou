import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";

import { listClientProfiles } from "@/lib/client-profile.functions";
import {
  previewUmowaFromEngine,
  generateUmowaFromEngine,
} from "@/lib/contract-engine/generate-umowa.functions";
import type { Problem } from "@/lib/contract-engine/validator";
import { borrowerDisplayName } from "@/lib/client-profile-math";
import type { ClientProfile } from "@/lib/client-profile-types";

export const Route = createFileRoute("/admin/generator-umowy")({
  component: GeneratorUmowyPage,
});

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

function GeneratorUmowyPage() {
  const listFn = useServerFn(listClientProfiles);
  const previewFn = useServerFn(previewUmowaFromEngine);
  const generateFn = useServerFn(generateUmowaFromEngine);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["client-profiles"],
    queryFn: () => listFn(),
  });
  const profiles: ProfileRow[] = (data?.profiles ?? []) as ProfileRow[];

  const [profileId, setProfileId] = useState<string>("");
  const [miejscowosc, setMiejscowosc] = useState<string>("");
  const [numerUmowy, setNumerUmowy] = useState<string>("");
  const [dataUmowy, setDataUmowy] = useState<string>("");

  const [busy, setBusy] = useState<"" | "preview" | "docx">("");
  const [preview, setPreview] = useState<string>("");
  const [problemy, setProblemy] = useState<Problem[]>([]);
  const [blocked, setBlocked] = useState<boolean | null>(null);

  const selected = useMemo(() => profiles.find((p) => p.id === profileId), [profiles, profileId]);
  const bledy = problemy.filter((p) => p.poziom === "BLAD");
  const ostrzezenia = problemy.filter((p) => p.poziom === "OSTRZEZENIE");

  function buildInput() {
    return {
      profileId,
      miejscowosc: miejscowosc || undefined,
      numerUmowy: numerUmowy || undefined,
      dataUmowy: dataUmowy || undefined,
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
          <Sparkles className="h-6 w-6 text-primary" /> Generator umowy pożyczki
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Umowa jest składana deterministycznie z biblioteki klauzul (silnik) na podstawie profilu
          klienta — nie z wypełnianego wzoru z lukami. Walidacja jest bramą: błędy blokujące
          wstrzymują generację pliku.
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
            <Button
              variant="secondary"
              onClick={runDocx}
              disabled={!profileId || busy !== ""}
            >
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

      {/* Problemy walidacji */}
      {problemy.length > 0 ? (
        <Card
          className={
            blocked ? "border-destructive/50" : "border-amber-500/40"
          }
        >
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
                    <code className="text-xs text-muted-foreground">{p.sciezka}</code>{" "}
                    {p.komunikat}
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
