import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Copy,
  Download,
  Plus,
  RefreshCw,
  Search,
  Save,
  FileText,
  Printer,
  Sparkles,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

import {
  emptyProfile,
  borrowerTypeLabels,
  propertyTypeLabels,
  idDocumentTypeLabels,
  type ClientProfile,
  type BorrowerType,
  type PropertyType,
  type IdDocumentType,
  type InvestorReturnType,
} from "@/lib/client-profile-types";
import {
  buildDirectorSchedule,
  calculateProfileCompletion,
  recommendSecurity,
  formatPLN,
  formatDate,
  borrowerDisplayName,
} from "@/lib/client-profile-math";
import {
  generateApplicationDoc,
  generateContractDoc,
  generateScheduleDoc,
  generateProtocolDoc,
} from "@/lib/client-profile-docs";
import {
  listClientProfiles,
  saveClientProfile,
  getClientProfile,
  fetchCompanyByNip,
} from "@/lib/client-profile.functions";
import {
  previewUmowaFromEngine,
  generateUmowaFromEngine,
} from "@/lib/contract-engine/generate-umowa.functions";
import type { Problem } from "@/lib/contract-engine";

export const Route = createFileRoute("/admin/kreator-pozyczki")({
  validateSearch: (s: Record<string, unknown>) => ({
    profileId: typeof s.profileId === "string" ? s.profileId : undefined,
  }),
  component: KreatorPozyczki,
});

// ════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════

const numOrUndef = (v: string): number | undefined => {
  if (!v) return undefined;
  const x = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(x) ? x : undefined;
};

function update<T extends object>(
  setter: (u: (prev: ClientProfile) => ClientProfile) => void,
  path: string,
) {
  return (value: any) => {
    setter((prev) => {
      const next: any = structuredClone(prev);
      const parts = path.split(".");
      let cursor = next;
      for (let i = 0; i < parts.length - 1; i++) {
        cursor[parts[i]] = cursor[parts[i]] ?? {};
        cursor = cursor[parts[i]];
      }
      cursor[parts[parts.length - 1]] = value;
      return next;
    });
  };
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success("Skopiowano do schowka"),
    () => toast.error("Nie udało się skopiować"),
  );
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function printText(text: string) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(
    `<pre style="font-family:ui-monospace,monospace;white-space:pre-wrap;padding:24px">${text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] as string)}</pre>`,
  );
  w.document.close();
  w.print();
}

// ════════════════════════════════════════════════════════════════════
// PROFILE LIST
// ════════════════════════════════════════════════════════════════════

function ProfileList({
  onOpen,
  onCreateBlank,
}: {
  onOpen: (id: string) => void;
  onCreateBlank: () => void;
}) {
  const listFn = useServerFn(listClientProfiles);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["client-profiles"],
    queryFn: () => listFn(),
  });
  const profiles = data?.profiles ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Profile klientów pożyczkowych</CardTitle>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" /> Odśwież
          </Button>
          <Button size="sm" onClick={onCreateBlank}>
            <Plus className="h-4 w-4 mr-2" /> Nowy profil
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Ładowanie…</p>
        ) : profiles.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak profili. Utwórz nowy aby rozpocząć.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pożyczkobiorca</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>NIP</TableHead>
                <TableHead>Kompletność</TableHead>
                <TableHead>Aktualizacja</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((p: any) => {
                const prof = { ...(p.data as ClientProfile), id: p.id };
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{borrowerDisplayName(prof)}</TableCell>
                    <TableCell>
                      {borrowerTypeLabels[p.borrower_type as BorrowerType] ?? p.borrower_type}
                    </TableCell>
                    <TableCell>{p.nip ?? "—"}</TableCell>
                    <TableCell>{calculateProfileCompletion(prof).percent}%</TableCell>
                    <TableCell>{formatDate(p.updated_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => onOpen(p.id)}>
                        Otwórz
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════
// EDITOR
// ════════════════════════════════════════════════════════════════════

function Editor({ profileId, onBack }: { profileId: string | null; onBack: () => void }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getClientProfile);
  const saveFn = useServerFn(saveClientProfile);
  const nipFn = useServerFn(fetchCompanyByNip);

  const [profile, setProfile] = useState<ClientProfile>(() => emptyProfile());
  const [loading, setLoading] = useState(!!profileId);
  const [nipBusy, setNipBusy] = useState(false);
  const [nipStages, setNipStages] = useState<
    Array<{ name: string; status: string; message?: string }>
  >([]);
  const [nipWarnings, setNipWarnings] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    if (profileId) {
      setLoading(true);
      getFn({ data: { id: profileId } })
        .then((res) => {
          if (active) setProfile(res.profile);
        })
        .catch((e: any) => toast.error(e?.message ?? "Nie udało się załadować profilu"))
        .finally(() => active && setLoading(false));
    } else {
      setProfile(emptyProfile());
    }
    return () => {
      active = false;
    };
  }, [profileId, getFn]);

  const set = (path: string) => update(setProfile, path);
  const setBool = (path: string) => (v: boolean) => set(path)(v);
  const setNum = (path: string) => (v: string) => set(path)(numOrUndef(v));

  // mark field as manually edited
  const setManual = (path: string) => (value: any) => {
    setProfile((prev) => {
      const next: any = structuredClone(prev);
      const parts = path.split(".");
      let cursor = next;
      for (let i = 0; i < parts.length - 1; i++) {
        cursor[parts[i]] = cursor[parts[i]] ?? {};
        cursor = cursor[parts[i]];
      }
      cursor[parts[parts.length - 1]] = value;
      next.fieldSources = { ...(next.fieldSources ?? {}), [path]: "Ręcznie" };
      return next;
    });
  };

  // ── derived ──────────────────────────────────────────────
  const schedule = useMemo(() => buildDirectorSchedule(profile.offerData), [profile.offerData]);
  const completion = useMemo(() => calculateProfileCompletion(profile), [profile]);
  const securityRec = useMemo(
    () => recommendSecurity(schedule, profile.offerData),
    [schedule, profile.offerData],
  );

  const saveMut = useMutation({
    mutationFn: async () => saveFn({ data: profile as any }),
    onSuccess: (res) => {
      toast.success("Zapisano profil");
      qc.invalidateQueries({ queryKey: ["client-profiles"] });
      if (!profile.id && res?.id) setProfile((p) => ({ ...p, id: res.id }));
    },
    onError: (e: any) => toast.error(e?.message ?? "Nie udało się zapisać"),
  });

  async function handleFetchNip() {
    const nip = profile.borrowerData.nip?.trim();
    if (!nip) {
      toast.error("Podaj NIP");
      return;
    }
    setNipBusy(true);
    setNipStages([]);
    setNipWarnings([]);
    try {
      const res: any = await nipFn({
        data: { nip, knownKrs: profile.borrowerData.krs || undefined },
      });
      setNipStages(res.stages ?? []);
      setNipWarnings(res.warnings ?? []);
      if (!res.success) {
        toast.error(res.message ?? res.error ?? "Nie znaleziono danych");
        return;
      }
      // detect manual conflicts
      const prevSources = profile.fieldSources ?? {};
      const incoming: Record<string, any> = res.data ?? {};
      const conflicts: string[] = [];
      for (const [k, v] of Object.entries(incoming)) {
        const path = `borrowerData.${k}`;
        const current = (profile.borrowerData as any)[k];
        if (prevSources[path] === "Ręcznie" && current && current !== v) {
          conflicts.push(k);
        }
      }
      let overwriteManual = true;
      if (conflicts.length > 0) {
        overwriteManual = window.confirm(
          `Niektóre pola były edytowane ręcznie (${conflicts.join(", ")}). Czy zastąpić je danymi z rejestru?`,
        );
      }

      setProfile((prev) => {
        const nextBorrower: any = { ...prev.borrowerData };
        const nextSources: Record<string, any> = { ...(prev.fieldSources ?? {}) };
        for (const [k, v] of Object.entries(incoming)) {
          const path = `borrowerData.${k}`;
          if (!overwriteManual && nextSources[path] === "Ręcznie") continue;
          if (v === undefined || v === null || v === "") continue;
          nextBorrower[k] = v;
          nextSources[path] = (res.fieldSources?.[k] ?? res.source) as any;
        }
        // auto-pick borrower type for KRS company on first run
        let borrowerType = prev.borrowerType;
        if (res.entityType === "KRS_COMPANY" && prev.borrowerType === "JDG") {
          borrowerType = "sp_zoo";
        }
        return { ...prev, borrowerType, borrowerData: nextBorrower, fieldSources: nextSources };
      });
      toast.success(
        res.entityType === "JDG"
          ? "Pobrano dane JDG z CEIDG"
          : res.entityType === "KRS_COMPANY"
            ? "Pobrano dane spółki z KRS/PRS"
            : `Pobrano dane z ${res.source}`,
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd pobierania danych");
    } finally {
      setNipBusy(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Ładowanie profilu…</p>;

  const b = profile.borrowerData;
  const prop = profile.propertyData;
  const inv = profile.investorData;
  const off = profile.offerData;
  const sec = profile.securityData;
  const rep = profile.representativeData ?? {};
  const isCompany = profile.borrowerType !== "JDG";

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Button variant="ghost" size="sm" onClick={onBack} className="mb-2">
                ← Lista profili
              </Button>
              <h2 className="text-lg font-semibold">{borrowerDisplayName(profile)}</h2>
              <div className="text-sm text-muted-foreground">
                {borrowerTypeLabels[profile.borrowerType]} · NIP: {b.nip ?? "—"}
              </div>
            </div>
            <div className="flex items-center gap-4 min-w-[260px]">
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span>Kompletność profilu</span>
                  <span className="font-semibold">{completion.percent}%</span>
                </div>
                <Progress value={completion.percent} />
              </div>
              <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                <Save className="h-4 w-4 mr-2" /> {saveMut.isPending ? "Zapisuję…" : "Zapisz"}
              </Button>
            </div>
          </div>
          {completion.criticalMissing.length > 0 && (
            <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              <strong>Brakuje krytycznych pól:</strong> {completion.criticalMissing.join(", ")}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="klient">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="klient">1. Profil klienta</TabsTrigger>
          <TabsTrigger value="nieruchomosc">2. Nieruchomość</TabsTrigger>
          <TabsTrigger value="inwestor">3. Inwestor</TabsTrigger>
          <TabsTrigger value="oferta">4. Oferta</TabsTrigger>
          <TabsTrigger value="harmonogram">5. Harmonogram</TabsTrigger>
          <TabsTrigger value="zabezpieczenia">6. Zabezpieczenia</TabsTrigger>
          <TabsTrigger value="dokumenty">7. Dokumenty</TabsTrigger>
        </TabsList>

        {/* ════════ 1. KLIENT ════════ */}
        <TabsContent value="klient" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Forma prawna pożyczkobiorcy</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Typ pożyczkobiorcy</Label>
                <Select
                  value={profile.borrowerType}
                  onValueChange={(v) => set("borrowerType")(v as BorrowerType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(borrowerTypeLabels).map(([k, l]) => (
                      <SelectItem key={k} value={k}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cel pożyczki</Label>
                <Input
                  value={b.loanPurpose ?? ""}
                  onChange={(e) => set("borrowerData.loanPurpose")(e.target.value)}
                  placeholder="np. inwestycja w obrót firmy"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Identyfikacja w rejestrach (CEIDG / GUS / KRS)</CardTitle>
                <Button variant="outline" size="sm" onClick={handleFetchNip} disabled={nipBusy}>
                  <Search className="h-4 w-4 mr-2" />{" "}
                  {nipBusy ? "Pobieram…" : "Pobierz dane po NIP"}
                </Button>
              </div>
            </CardHeader>
            {(nipStages.length > 0 || nipWarnings.length > 0) && (
              <div className="px-6 pb-3 -mt-2">
                <div className="rounded border bg-muted/30 p-3 text-xs space-y-2">
                  <div className="font-semibold text-foreground">
                    Diagnostyka pobierania danych po NIP
                  </div>
                  <ol className="space-y-1">
                    {nipStages.map((s) => {
                      const color =
                        s.status === "sukces"
                          ? "text-green-700"
                          : s.status === "błąd"
                            ? "text-red-700"
                            : s.status === "brak danych"
                              ? "text-amber-700"
                              : s.status === "pominięto"
                                ? "text-muted-foreground"
                                : s.status === "trwa"
                                  ? "text-blue-700"
                                  : "text-muted-foreground";
                      return (
                        <li key={s.name} className="flex flex-wrap items-baseline gap-2">
                          <span className="font-medium">{s.name}:</span>
                          <span className={color}>{s.status}</span>
                          {s.message && (
                            <span className="text-muted-foreground">— {s.message}</span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                  {nipWarnings.length > 0 && (
                    <div className="text-amber-700">
                      <div className="font-medium">Ostrzeżenia:</div>
                      <ul className="list-disc ml-5">
                        {nipWarnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
            <CardContent className="grid md:grid-cols-3 gap-4">
              <div>
                <Label>NIP</Label>
                <Input
                  value={b.nip ?? ""}
                  onChange={(e) => set("borrowerData.nip")(e.target.value)}
                />
              </div>
              <div>
                <Label>REGON</Label>
                <Input
                  value={b.regon ?? ""}
                  onChange={(e) => set("borrowerData.regon")(e.target.value)}
                />
              </div>
              {isCompany && (
                <div>
                  <Label>KRS</Label>
                  <Input
                    value={b.krs ?? ""}
                    onChange={(e) => set("borrowerData.krs")(e.target.value)}
                  />
                </div>
              )}
              <div className="md:col-span-3">
                <Label>Nazwa firmy</Label>
                <Input
                  value={b.companyName ?? ""}
                  onChange={(e) => set("borrowerData.companyName")(e.target.value)}
                />
              </div>
              <div>
                <Label>Status działalności</Label>
                <Input
                  value={b.businessStatus ?? ""}
                  onChange={(e) => set("borrowerData.businessStatus")(e.target.value)}
                />
              </div>
              <div>
                <Label>Data rozpoczęcia</Label>
                <Input
                  type="date"
                  value={b.businessStartDate ?? ""}
                  onChange={(e) => set("borrowerData.businessStartDate")(e.target.value)}
                />
              </div>
              <div>
                <Label>PKD główny</Label>
                <Input
                  value={`${b.mainPkdCode ?? ""} ${b.mainPkdName ?? ""}`.trim()}
                  onChange={(e) => set("borrowerData.mainPkdName")(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {!isCompany ? (
            <Card>
              <CardHeader>
                <CardTitle>Dane osobowe (JDG)</CardTitle>
              </CardHeader>
              <CardContent className="grid md:grid-cols-3 gap-4">
                <div>
                  <Label>Imię</Label>
                  <Input
                    value={b.firstName ?? ""}
                    onChange={(e) => set("borrowerData.firstName")(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Nazwisko</Label>
                  <Input
                    value={b.lastName ?? ""}
                    onChange={(e) => set("borrowerData.lastName")(e.target.value)}
                  />
                </div>
                <div>
                  <Label>PESEL</Label>
                  <Input
                    value={b.pesel ?? ""}
                    onChange={(e) => set("borrowerData.pesel")(e.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Adres działalności</Label>
                  <Input
                    value={b.businessAddress ?? ""}
                    onChange={(e) => set("borrowerData.businessAddress")(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Wspólność majątkowa</Label>
                  <Input
                    value={b.maritalPropertyCommunity ?? ""}
                    onChange={(e) => set("borrowerData.maritalPropertyCommunity")(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Dane spółki + reprezentacja</CardTitle>
              </CardHeader>
              <CardContent className="grid md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label>Adres siedziby</Label>
                  <Input
                    value={b.registeredAddress ?? ""}
                    onChange={(e) => set("borrowerData.registeredAddress")(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Sposób reprezentacji</Label>
                  <Input
                    value={b.representationDescription ?? ""}
                    onChange={(e) => set("borrowerData.representationDescription")(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Kapitał zakładowy</Label>
                  <Input
                    value={b.shareCapital ?? ""}
                    onChange={(e) => set("borrowerData.shareCapital")(e.target.value)}
                  />
                </div>
                <div className="md:col-span-2 border-t pt-4">
                  <div className="text-sm font-semibold mb-3">Osoba podpisująca umowę</div>
                </div>
                <div>
                  <Label>Imię</Label>
                  <Input
                    value={rep.firstName ?? ""}
                    onChange={(e) => set("representativeData.firstName")(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Nazwisko</Label>
                  <Input
                    value={rep.lastName ?? ""}
                    onChange={(e) => set("representativeData.lastName")(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Funkcja</Label>
                  <Input
                    value={rep.role ?? ""}
                    onChange={(e) => set("representativeData.role")(e.target.value)}
                    placeholder="np. Prezes Zarządu"
                  />
                </div>
                <div>
                  <Label>PESEL</Label>
                  <Input
                    value={rep.pesel ?? ""}
                    onChange={(e) => set("representativeData.pesel")(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Typ dokumentu</Label>
                  <Select
                    value={rep.idDocument?.type ?? ""}
                    onValueChange={(v) =>
                      set("representativeData.idDocument.type")(v as IdDocumentType)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(idDocumentTypeLabels).map(([k, l]) => (
                        <SelectItem key={k} value={k}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Numer dokumentu</Label>
                  <Input
                    value={rep.idDocument?.number ?? ""}
                    onChange={(e) => set("representativeData.idDocument.number")(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Kontakt + tożsamość pożyczkobiorcy</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-4">
              <div>
                <Label>Telefon</Label>
                <Input
                  value={b.phone ?? ""}
                  onChange={(e) => set("borrowerData.phone")(e.target.value)}
                />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input
                  value={b.email ?? ""}
                  onChange={(e) => set("borrowerData.email")(e.target.value)}
                />
              </div>
              <div>
                <Label>Strona www</Label>
                <Input
                  value={b.website ?? ""}
                  onChange={(e) => set("borrowerData.website")(e.target.value)}
                />
              </div>
              {!isCompany && (
                <>
                  <div>
                    <Label>Dokument tożsamości</Label>
                    <Select
                      value={b.idDocument?.type ?? ""}
                      onValueChange={(v) =>
                        set("borrowerData.idDocument.type")(v as IdDocumentType)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Wybierz" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(idDocumentTypeLabels).map(([k, l]) => (
                          <SelectItem key={k} value={k}>
                            {l}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Numer dokumentu</Label>
                    <Input
                      value={b.idDocument?.number ?? ""}
                      onChange={(e) => set("borrowerData.idDocument.number")(e.target.value)}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════ 2. NIERUCHOMOŚĆ ════════ */}
        <TabsContent value="nieruchomosc" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Nieruchomość zabezpieczająca</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-4">
              <div>
                <Label>Typ nieruchomości</Label>
                <Select
                  value={prop.type ?? ""}
                  onValueChange={(v) => set("propertyData.type")(v as PropertyType)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Wybierz" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(propertyTypeLabels).map(([k, l]) => (
                      <SelectItem key={k} value={k}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Numer KW</Label>
                <Input
                  value={prop.landRegisterNumber ?? ""}
                  onChange={(e) => set("propertyData.landRegisterNumber")(e.target.value)}
                />
              </div>
              <div>
                <Label>Szacunkowa wartość (PLN)</Label>
                <Input
                  type="number"
                  value={prop.estimatedValue ?? ""}
                  onChange={(e) => setNum("propertyData.estimatedValue")(e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <Label>Adres</Label>
                <Input
                  value={prop.address ?? ""}
                  onChange={(e) => set("propertyData.address")(e.target.value)}
                />
              </div>
              <div>
                <Label>Miasto</Label>
                <Input
                  value={prop.city ?? ""}
                  onChange={(e) => set("propertyData.city")(e.target.value)}
                />
              </div>
              <div>
                <Label>Województwo</Label>
                <Input
                  value={prop.voivodeship ?? ""}
                  onChange={(e) => set("propertyData.voivodeship")(e.target.value)}
                />
              </div>
              <div className="md:col-span-3">
                <Label>Opis</Label>
                <Textarea
                  value={prop.description ?? ""}
                  onChange={(e) => set("propertyData.description")(e.target.value)}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Stan prawny</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-4">
              <div className="flex items-center justify-between border rounded-md p-3">
                <Label>Istniejąca hipoteka</Label>
                <Switch
                  checked={!!prop.hasExistingMortgage}
                  onCheckedChange={setBool("propertyData.hasExistingMortgage")}
                />
              </div>
              <div>
                <Label>Kwota istniejącego zadłużenia</Label>
                <Input
                  type="number"
                  value={prop.existingDebtAmount ?? ""}
                  onChange={(e) => setNum("propertyData.existingDebtAmount")(e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between border rounded-md p-3">
                <Label>Właściciel = pożyczkobiorca</Label>
                <Switch
                  checked={!!prop.owner?.isBorrower}
                  onCheckedChange={setBool("propertyData.owner.isBorrower")}
                />
              </div>
              {!prop.owner?.isBorrower && (
                <>
                  <div>
                    <Label>Imię właściciela</Label>
                    <Input
                      value={prop.owner?.firstName ?? ""}
                      onChange={(e) => set("propertyData.owner.firstName")(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Nazwisko właściciela</Label>
                    <Input
                      value={prop.owner?.lastName ?? ""}
                      onChange={(e) => set("propertyData.owner.lastName")(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>PESEL właściciela</Label>
                    <Input
                      value={prop.owner?.pesel ?? ""}
                      onChange={(e) => set("propertyData.owner.pesel")(e.target.value)}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pliki klienta</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Wgrane pliki:{" "}
                <strong>{profile.uploadedPhotos.length + profile.uploadedDocuments.length}</strong>.
                Uploadem plików można zarządzać z poziomu modułu „Pliki klienta".
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════ 3. INWESTOR ════════ */}
        <TabsContent value="inwestor" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Dane inwestora</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Imię i nazwisko</Label>
                <Input
                  value={inv.fullName ?? ""}
                  onChange={(e) => set("investorData.fullName")(e.target.value)}
                />
              </div>
              <div>
                <Label>Nazwa firmy (opcjonalnie)</Label>
                <Input
                  value={inv.companyName ?? ""}
                  onChange={(e) => set("investorData.companyName")(e.target.value)}
                />
              </div>
              <div>
                <Label>NIP / PESEL</Label>
                <Input
                  value={inv.nip ?? ""}
                  onChange={(e) => set("investorData.nip")(e.target.value)}
                />
              </div>
              <div>
                <Label>Adres</Label>
                <Input
                  value={inv.address ?? ""}
                  onChange={(e) => set("investorData.address")(e.target.value)}
                />
              </div>
              <div>
                <Label>Telefon</Label>
                <Input
                  value={inv.phone ?? ""}
                  onChange={(e) => set("investorData.phone")(e.target.value)}
                />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input
                  value={inv.email ?? ""}
                  onChange={(e) => set("investorData.email")(e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <Label>Rachunek bankowy (do spłat)</Label>
                <Input
                  value={inv.bankAccount ?? ""}
                  onChange={(e) => set("investorData.bankAccount")(e.target.value)}
                  placeholder="PL00 0000 0000 0000 0000 0000 0000"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════ 4. OFERTA ════════ */}
        <TabsContent value="oferta" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Parametry pożyczki</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-4">
              <div>
                <Label>Kwota „na rękę” dla klienta (PLN)</Label>
                <Input
                  type="number"
                  value={off.netAmountToClient ?? ""}
                  onChange={(e) => setNum("offerData.netAmountToClient")(e.target.value)}
                />
              </div>
              <div>
                <Label>Prowizja kredytowana (PLN)</Label>
                <Input
                  type="number"
                  value={off.creditedCommission ?? ""}
                  onChange={(e) => setNum("offerData.creditedCommission")(e.target.value)}
                />
              </div>
              <div>
                <Label>Okres pożyczki (mies.)</Label>
                <Input
                  type="number"
                  value={off.loanTermMonths ?? ""}
                  onChange={(e) => setNum("offerData.loanTermMonths")(e.target.value)}
                />
              </div>
              <div>
                <Label>Maksymalna miesięczna rata klienta (PLN)</Label>
                <Input
                  type="number"
                  value={off.maxMonthlyPaymentByClient ?? ""}
                  onChange={(e) => setNum("offerData.maxMonthlyPaymentByClient")(e.target.value)}
                />
              </div>
              <div>
                <Label>Oprocentowanie roczne (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={off.annualInterestPercent ?? ""}
                  onChange={(e) => setNum("offerData.annualInterestPercent")(e.target.value)}
                />
              </div>
              <div>
                <Label>Wynagrodzenie inwestora — typ</Label>
                <Select
                  value={off.investorMonthlyReturnType ?? "amount"}
                  onValueChange={(v) =>
                    set("offerData.investorMonthlyReturnType")(v as InvestorReturnType)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="amount">Kwotowo (PLN/mies.)</SelectItem>
                    <SelectItem value="percent">Procentowo (% kwoty „na rękę”/mies.)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {off.investorMonthlyReturnType === "percent" ? (
                <div>
                  <Label>Wynagrodzenie miesięczne (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={off.investorMonthlyReturnPercent ?? ""}
                    onChange={(e) =>
                      setNum("offerData.investorMonthlyReturnPercent")(e.target.value)
                    }
                  />
                </div>
              ) : (
                <div>
                  <Label>Wynagrodzenie miesięczne (PLN)</Label>
                  <Input
                    type="number"
                    value={off.investorMonthlyReturnAmount ?? ""}
                    onChange={(e) =>
                      setNum("offerData.investorMonthlyReturnAmount")(e.target.value)
                    }
                  />
                </div>
              )}
              <div>
                <Label>Data wypłaty</Label>
                <Input
                  type="date"
                  value={off.payoutDate ?? ""}
                  onChange={(e) => set("offerData.payoutDate")(e.target.value)}
                />
              </div>
              <div>
                <Label>Data zawarcia umowy</Label>
                <Input
                  type="date"
                  value={off.agreementDate ?? ""}
                  onChange={(e) => set("offerData.agreementDate")(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Wyliczenia automatyczne</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-4 gap-3 text-sm">
              <Stat
                label="Kwota Pożyczki (pełna wypłata)"
                value={formatPLN(schedule?.nominalLoanAmount)}
              />
              <Stat
                label="Wynagrodzenie inwestora / mies. (odsetki + prowizja)"
                value={formatPLN(schedule?.expectedMonthlyInvestorReturn)}
              />
              <Stat
                label="Odsetki / mies. (śr.)"
                value={formatPLN(schedule?.monthlyInterestAmount)}
              />
              <Stat label="Prowizja / mies." value={formatPLN(schedule?.monthlyCommissionAmount)} />
              <Stat
                label="Prowizja (% Kwoty Pożyczki)"
                value={`${(schedule?.monthlyCommissionPercent ?? 0).toFixed(4)}%`}
              />
              <Stat label="Rata balonowa" value={formatPLN(schedule?.balloonPayment)} />
              <Stat
                label="Całk. zobowiązanie klienta"
                value={formatPLN(schedule?.totalClientObligation)}
              />
              <Stat
                label="Zysk inwestora (annualized)"
                value={`${formatPLN(schedule?.annualizedInvestorProfitAmount)} (${schedule?.annualizedInvestorProfitPercent ?? 0}%)`}
              />
            </CardContent>
            {schedule && (schedule.warnings.length > 0 || schedule.infos.length > 0) && (
              <CardContent className="space-y-1 text-sm">
                {schedule.warnings.map((w, i) => (
                  <div key={`w${i}`} className="text-amber-700">
                    ⚠ {w}
                  </div>
                ))}
                {schedule.infos.map((w, i) => (
                  <div key={`i${i}`} className="text-muted-foreground">
                    ℹ {w}
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        </TabsContent>

        {/* ════════ 5. HARMONOGRAM ════════ */}
        <TabsContent value="harmonogram" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Harmonogram spłat</CardTitle>
            </CardHeader>
            <CardContent>
              {!schedule ? (
                <p className="text-sm text-muted-foreground">
                  Uzupełnij ofertę aby wygenerować harmonogram (kwota, okres, max rata, data
                  wypłaty, wynagrodzenie inwestora).
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lp.</TableHead>
                        <TableHead>Data raty</TableHead>
                        <TableHead className="text-right">Kwota raty</TableHead>
                        <TableHead className="text-right">Kapitał</TableHead>
                        <TableHead className="text-right">Odsetki</TableHead>
                        <TableHead className="text-right">Prowizja</TableHead>
                        <TableHead className="text-right">Kapitał pozostały</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {schedule.rows.map((r) => (
                        <TableRow
                          key={String(r.index)}
                          className={r.isBalloon ? "bg-muted/40 font-semibold" : ""}
                        >
                          <TableCell>
                            {r.isBalloon ? (
                              <>
                                <Badge variant="secondary">Balon</Badge> {r.index}
                              </>
                            ) : (
                              r.index
                            )}
                          </TableCell>
                          <TableCell>{formatDate(r.date)}</TableCell>
                          <TableCell className="text-right">{formatPLN(r.paymentAmount)}</TableCell>
                          <TableCell className="text-right">{formatPLN(r.capital)}</TableCell>
                          <TableCell className="text-right">{formatPLN(r.interest)}</TableCell>
                          <TableCell className="text-right">{formatPLN(r.commission)}</TableCell>
                          <TableCell className="text-right">
                            {formatPLN(r.remainingCapital)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════ 6. ZABEZPIECZENIA ════════ */}
        <TabsContent value="zabezpieczenia" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Rekomendacje (automatyczne, na podstawie harmonogramu)</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-3 text-sm">
              <Stat
                label="Całk. zobowiązanie klienta"
                value={formatPLN(securityRec?.totalClientObligation)}
              />
              <Stat
                label="Min. kwota hipoteki (150%)"
                value={formatPLN(securityRec?.minimumMortgageAmount)}
              />
              <Stat
                label="Rek. kwota art. 777 k.p.c. (150%)"
                value={formatPLN(securityRec?.recommended777Amount)}
              />
              <Stat
                label="Rek. okres egzekucji"
                value={`${securityRec?.recommended777PeriodMonths ?? 0} mies.`}
              />
              <Stat
                label="Rek. data graniczna art. 777"
                value={formatDate(securityRec?.recommended777Deadline)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ustalenia zabezpieczeń</CardTitle>
            </CardHeader>
            <CardContent className="grid md:grid-cols-3 gap-4">
              <div>
                <Label>Kwota hipoteki (PLN)</Label>
                <Input
                  type="number"
                  value={sec.mortgageAmount ?? ""}
                  onChange={(e) => setNum("securityData.mortgageAmount")(e.target.value)}
                />
              </div>
              <div>
                <Label>Kwota art. 777 § 1 pkt 5 k.p.c. (PLN)</Label>
                <Input
                  type="number"
                  value={sec.art777Amount ?? ""}
                  onChange={(e) => setNum("securityData.art777Amount")(e.target.value)}
                />
              </div>
              <div>
                <Label>Termin klauzuli wykonalności</Label>
                <Input
                  type="date"
                  value={sec.art777ClauseDeadline ?? ""}
                  onChange={(e) => set("securityData.art777ClauseDeadline")(e.target.value)}
                />
              </div>
              <div>
                <Label>Poręczyciel (imię i nazwisko)</Label>
                <Input
                  value={sec.guarantorName ?? ""}
                  onChange={(e) => set("securityData.guarantorName")(e.target.value)}
                />
              </div>
              <div>
                <Label>PESEL poręczyciela</Label>
                <Input
                  value={sec.guarantorPesel ?? ""}
                  onChange={(e) => set("securityData.guarantorPesel")(e.target.value)}
                />
              </div>
              <div className="md:col-span-3">
                <Label>Uwagi</Label>
                <Textarea
                  value={sec.notes ?? ""}
                  onChange={(e) => set("securityData.notes")(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="md:col-span-3 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!securityRec) {
                      toast.error("Brak harmonogramu");
                      return;
                    }
                    setProfile((prev) => ({
                      ...prev,
                      securityData: {
                        ...prev.securityData,
                        mortgageAmount: securityRec.minimumMortgageAmount,
                        art777Amount: securityRec.recommended777Amount,
                        art777ClauseDeadline: securityRec.recommended777Deadline,
                      },
                    }));
                    toast.success("Zastosowano rekomendacje");
                  }}
                >
                  Zastosuj rekomendacje
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════ 7. DOKUMENTY ════════ */}
        <TabsContent value="dokumenty" className="space-y-4">
          {completion.criticalMissing.length > 0 && (
            <Card>
              <CardContent className="py-4 text-sm text-amber-700 bg-amber-50">
                Profil zawiera braki krytyczne. Dokumenty można wygenerować, ale wymagają
                uzupełnienia: {completion.criticalMissing.join(", ")}.
              </CardContent>
            </Card>
          )}
          <EngineContractBlock profile={profile} />
          <DocBlock
            title="Wniosek pożyczkowy"
            text={generateApplicationDoc(profile)}
            filename={`wniosek_${profile.id ?? "draft"}.txt`}
          />
          <DocBlock
            title="Umowa pożyczki (tekst roboczy)"
            text={generateContractDoc(profile, schedule)}
            filename={`umowa_${profile.id ?? "draft"}.txt`}
          />
          <DocBlock
            title="Załącznik nr 1 — Harmonogram"
            text={generateScheduleDoc(profile, schedule)}
            filename={`harmonogram_${profile.id ?? "draft"}.txt`}
          />
          <DocBlock
            title="Załącznik nr 2 — Protokół negocjacji"
            text={generateProtocolDoc(profile, schedule)}
            filename={`protokol_${profile.id ?? "draft"}.txt`}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded-md p-3 bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}

/**
 * Generacja umowy z SILNIKA KLAUZUL (pkt 3.4). Dokument jest składany
 * deterministycznie z biblioteki klauzul na podstawie `UmowaData` zbudowanej z
 * profilu — nie z wypełnianego wzoru. Panel pokazuje podgląd, listę braków
 * (brama walidacji) oraz pobiera plik .docx, gdy nie ma błędów blokujących.
 */
function EngineContractBlock({ profile }: { profile: ClientProfile }) {
  const previewFn = useServerFn(previewUmowaFromEngine);
  const generateFn = useServerFn(generateUmowaFromEngine);

  const [miejscowosc, setMiejscowosc] = useState<string>(profile.propertyData?.city ?? "");
  const [busy, setBusy] = useState<"" | "preview" | "docx">("");
  const [preview, setPreview] = useState<string>("");
  const [problemy, setProblemy] = useState<Problem[]>([]);
  const [blocked, setBlocked] = useState<boolean | null>(null);

  const saved = !!profile.id;
  const bledy = problemy.filter((p) => p.poziom === "BLAD");
  const ostrzezenia = problemy.filter((p) => p.poziom === "OSTRZEZENIE");

  async function runPreview() {
    if (!profile.id) return;
    setBusy("preview");
    try {
      const res: any = await previewFn({
        data: { profileId: profile.id, miejscowosc: miejscowosc || undefined },
      });
      setPreview(res.previewText ?? "");
      setProblemy(res.problemy ?? []);
      setBlocked(!!res.blocked);
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd podglądu");
    } finally {
      setBusy("");
    }
  }

  async function runDocx() {
    if (!profile.id) return;
    setBusy("docx");
    try {
      const res: any = await generateFn({
        data: { profileId: profile.id, miejscowosc: miejscowosc || undefined },
      });
      setProblemy(res.problemy ?? []);
      setBlocked(!!res.blocked);
      if (res.blocked) {
        toast.error("Umowy nie wygenerowano — uzupełnij braki.");
      } else if (res.signedUrl) {
        window.open(res.signedUrl, "_blank");
        toast.success("Umowa wygenerowana (.docx).");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd generacji");
    } finally {
      setBusy("");
    }
  }

  return (
    <Card className="border-primary/40">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> Umowa pożyczki — silnik klauzul
        </CardTitle>
        <div className="flex items-end gap-2">
          <div className="grid gap-1">
            <Label className="text-xs">Miejscowość zawarcia</Label>
            <Input
              className="h-9 w-40"
              value={miejscowosc}
              onChange={(e) => setMiejscowosc(e.target.value)}
              placeholder="np. Lublin"
            />
          </div>
          <Button size="sm" variant="outline" disabled={!saved || !!busy} onClick={runPreview}>
            {busy === "preview" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 mr-2" />
            )}
            Podgląd
          </Button>
          <Button size="sm" disabled={!saved || !!busy || blocked === true} onClick={runDocx}>
            {busy === "docx" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Pobierz .docx
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!saved && (
          <div className="text-sm text-amber-700 bg-amber-50 rounded p-3">
            Zapisz profil (przycisk „Zapisz"), aby wygenerować umowę z silnika.
          </div>
        )}

        {bledy.length > 0 && (
          <div className="text-sm rounded p-3 bg-red-50 text-red-800 space-y-1">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4" /> Braki blokujące ({bledy.length}) — uzupełnij,
              aby wygenerować:
            </div>
            <ul className="list-disc pl-6">
              {bledy.map((p, i) => (
                <li key={i}>
                  <span className="font-mono text-xs">{p.sciezka}</span> — {p.komunikat}
                </li>
              ))}
            </ul>
          </div>
        )}

        {ostrzezenia.length > 0 && (
          <div className="text-sm rounded p-3 bg-amber-50 text-amber-800 space-y-1">
            <div className="font-medium">
              Ostrzeżenia ({ostrzezenia.length}) — nie blokują generacji:
            </div>
            <ul className="list-disc pl-6">
              {ostrzezenia.map((p, i) => (
                <li key={i}>{p.komunikat}</li>
              ))}
            </ul>
          </div>
        )}

        {blocked === false && bledy.length === 0 && (
          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4" /> Dane kompletne — umowa gotowa do wygenerowania.
          </div>
        )}

        {preview && (
          <pre className="text-xs whitespace-pre-wrap bg-muted/40 rounded p-3 max-h-96 overflow-auto">
            {preview}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

function DocBlock({ title, text, filename }: { title: string; text: string; filename: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-4 w-4" /> {title}
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => copyToClipboard(text)}>
            <Copy className="h-4 w-4 mr-2" />
            Kopiuj
          </Button>
          <Button size="sm" variant="outline" onClick={() => downloadText(filename, text)}>
            <Download className="h-4 w-4 mr-2" />
            Pobierz
          </Button>
          <Button size="sm" variant="outline" onClick={() => printText(text)}>
            <Printer className="h-4 w-4 mr-2" />
            Drukuj
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <pre className="text-xs whitespace-pre-wrap bg-muted/40 rounded p-3 max-h-80 overflow-auto">
          {text}
        </pre>
      </CardContent>
    </Card>
  );
}

// ════════════════════════════════════════════════════════════════════
// ROOT
// ════════════════════════════════════════════════════════════════════

function KreatorPozyczki() {
  const search = Route.useSearch();
  const [view, setView] = useState<{ mode: "list" } | { mode: "edit"; id: string | null }>(
    search.profileId ? { mode: "edit", id: search.profileId } : { mode: "list" },
  );

  useEffect(() => {
    if (search.profileId) setView({ mode: "edit", id: search.profileId });
  }, [search.profileId]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Kreator umów pożyczkowych B2B</h1>
        <p className="text-sm text-muted-foreground">
          Profil klienta, oferta inwestora, harmonogram „Dyrektor Finansowy”, zabezpieczenia,
          dokumenty.
        </p>
      </div>
      {view.mode === "list" ? (
        <ProfileList
          onOpen={(id) => setView({ mode: "edit", id })}
          onCreateBlank={() => setView({ mode: "edit", id: null })}
        />
      ) : (
        <Editor profileId={view.id} onBack={() => setView({ mode: "list" })} />
      )}
    </div>
  );
}
