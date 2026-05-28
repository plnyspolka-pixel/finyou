import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  startFirecrawlKwFetch,
  listKwJobs,
  getKwJobDetail,
  rerunKwParser,
} from "@/lib/kw-firecrawl.functions";
import { isValidKwFormat, KW_SECTIONS } from "@/lib/kw";

export const Route = createFileRoute("/admin/kw")({
  component: AdminKwPage,
});

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Oczekuje na pobranie",
  PROCESSING: "Pobieranie przez Firecrawl",
  SUCCESS: "Pobrano i przeanalizowano",
  PARTIAL_SUCCESS: "Pobrano część danych",
  RETRY_SCHEDULED: "Zaplanowano kolejną próbę",
  FAILED_INVALID_NUMBER: "Błędny numer KW",
  FAILED_NOT_FOUND: "Nie znaleziono księgi",
  FAILED_MAX_ATTEMPTS: "Przekroczono limit prób",
  REQUIRES_MANUAL_REVIEW: "Wymaga ręcznej weryfikacji",
  BLOCKED_BY_SECURITY: "Strona zablokowała pobieranie",
  RATE_LIMITED: "Limit / ograniczenie czasowe",
  FIRECRAWL_ERROR: "Błąd Firecrawl",
  PARSER_ERROR: "Błąd parsera",
  AI_ANALYSIS_ERROR: "Błąd analizy AI",
};

function statusVariant(s: string): "default" | "secondary" | "destructive" | "outline" {
  if (s === "SUCCESS") return "default";
  if (s === "PARTIAL_SUCCESS" || s === "PROCESSING" || s === "PENDING") return "secondary";
  if (s.startsWith("FAILED") || s.endsWith("ERROR") || s === "BLOCKED_BY_SECURITY" || s === "RATE_LIMITED")
    return "destructive";
  return "outline";
}

function AdminKwPage() {
  const qc = useQueryClient();
  const fetchKw = useServerFn(startFirecrawlKwFetch);
  const listJobs = useServerFn(listKwJobs);
  const reparse = useServerFn(rerunKwParser);

  const [kwInput, setKwInput] = useState("");
  const [validationMsg, setValidationMsg] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const jobsQuery = useQuery({
    queryKey: ["kw-jobs"],
    queryFn: () => listJobs({ data: {} }),
    refetchInterval: 10_000,
  });

  function validate(value: string): string | null {
    const v = value.trim().toUpperCase();
    if (!v) return "Podaj numer księgi wieczystej";
    if (!isValidKwFormat(v))
      return "Numer KW powinien mieć format np. LU1I/00123456/7";
    return null;
  }

  async function onFetch() {
    const err = validate(kwInput);
    setValidationMsg(err);
    if (err) return;
    setIsFetching(true);
    try {
      const res = await fetchKw({ data: { kw_number: kwInput.trim().toUpperCase() } });
      const label = STATUS_LABEL[res.status] ?? res.status;
      if (res.ok) toast.success(`Zakończono: ${label}`);
      else toast.error(res.error ? `${label}: ${res.error}` : label);
      await qc.invalidateQueries({ queryKey: ["kw-jobs"] });
      if (res.jobId) setSelectedJobId(res.jobId);
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd pobierania");
    } finally {
      setIsFetching(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Księgi wieczyste</h1>
        <p className="text-sm text-muted-foreground">
          Moduł testowo-operacyjny pobierania KW przez Firecrawl. Wpisz numer KW i kliknij „Pobierz dane z KW”.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pobieranie KW</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <div>
              <Label htmlFor="kw">Numer księgi wieczystej</Label>
              <Input
                id="kw"
                placeholder="np. LU1I/00123456/7"
                value={kwInput}
                onChange={(e) => {
                  setKwInput(e.target.value);
                  if (validationMsg) setValidationMsg(null);
                }}
                disabled={isFetching}
              />
              {validationMsg && (
                <p className="mt-1 text-xs text-destructive">{validationMsg}</p>
              )}
            </div>
            <div className="flex items-end">
              <Button onClick={onFetch} disabled={isFetching}>
                {isFetching ? "Pobieranie…" : "Pobierz dane z KW"}
              </Button>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  setKwInput("");
                  setValidationMsg(null);
                }}
                disabled={isFetching}
              >
                Wyczyść
              </Button>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Provider: Firecrawl. Pełen przebieg: wpisanie numeru → wyszukiwanie → przeglądanie aktualnej treści → działy I-O, I-Sp, II, III, IV.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ostatnie próby pobrania</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Numer KW</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Próby</TableHead>
                <TableHead>Brakujące działy</TableHead>
                <TableHead>Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(jobsQuery.data?.jobs ?? []).map((j: any) => (
                <TableRow key={j.id}>
                  <TableCell className="text-xs">
                    {new Date(j.created_at).toLocaleString("pl-PL")}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{j.kw_number}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(j.status)}>{STATUS_LABEL[j.status] ?? j.status}</Badge>
                  </TableCell>
                  <TableCell>{j.attempts}</TableCell>
                  <TableCell className="text-xs">
                    {Array.isArray(j.missing_sections) && j.missing_sections.length
                      ? j.missing_sections.join(", ")
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => setSelectedJobId(j.id)}>
                      Pokaż szczegóły
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!jobsQuery.data?.jobs?.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    Brak prób pobrania.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selectedJobId && (
        <JobDetail
          jobId={selectedJobId}
          onClose={() => setSelectedJobId(null)}
          onReparse={async () => {
            try {
              await reparse({ data: { job_id: selectedJobId } });
              toast.success("Parser uruchomiony ponownie");
              await qc.invalidateQueries({ queryKey: ["kw-jobs"] });
              await qc.invalidateQueries({ queryKey: ["kw-job", selectedJobId] });
            } catch (e: any) {
              toast.error(e?.message ?? "Błąd parsera");
            }
          }}
        />
      )}
    </div>
  );
}

function JobDetail({
  jobId,
  onClose,
  onReparse,
}: {
  jobId: string;
  onClose: () => void;
  onReparse: () => void;
}) {
  const getDetail = useServerFn(getKwJobDetail);
  const q = useQuery({
    queryKey: ["kw-job", jobId],
    queryFn: () => getDetail({ data: { job_id: jobId } }),
  });

  if (q.isLoading) return <Card><CardContent className="py-6 text-sm text-muted-foreground">Ładowanie szczegółów…</CardContent></Card>;
  if (!q.data?.job) return null;
  const { job, sources, attempts, analysis } = q.data;

  const sectionByKey: Record<string, any> = {};
  for (const s of sources) sectionByKey[s.section_key] = s;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Szczegóły zadania — {job.kw_number}</CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onReparse}>
              Uruchom parser ponownie
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              Zamknij
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 text-sm md:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Status: </span>
            <Badge variant={statusVariant(job.status)}>{STATUS_LABEL[job.status] ?? job.status}</Badge>
          </div>
          <div><span className="text-muted-foreground">Provider:</span> {job.fetch_provider ?? "firecrawl"}</div>
          <div><span className="text-muted-foreground">Liczba prób:</span> {job.attempts}</div>
          <div><span className="text-muted-foreground">Pobrano:</span> {job.fetched_at ? new Date(job.fetched_at).toLocaleString("pl-PL") : "—"}</div>
          {job.error_message && (
            <div className="md:col-span-2 text-destructive">Błąd: {job.error_message}</div>
          )}
          {job.failure_reason && (
            <div className="md:col-span-2 text-muted-foreground">Powód: {job.failure_reason}</div>
          )}
        </div>

        <Tabs defaultValue="sections">
          <TabsList>
            <TabsTrigger value="sections">Działy</TabsTrigger>
            <TabsTrigger value="search">Wynik wyszukiwania</TabsTrigger>
            <TabsTrigger value="json">Parsed JSON</TabsTrigger>
            <TabsTrigger value="analysis">Analiza</TabsTrigger>
            <TabsTrigger value="attempts">Surowa odpowiedź</TabsTrigger>
          </TabsList>

          <TabsContent value="sections" className="space-y-3">
            {KW_SECTIONS.map((s) => {
              const row = sectionByKey[s.key];
              return (
                <div key={s.key} className="rounded-md border p-3">
                  <div className="flex items-center justify-between">
                    <strong>{s.label}</strong>
                    <Badge variant={row?.success ? "default" : "destructive"}>
                      {row?.success ? "Pobrano" : "Brak"}
                    </Badge>
                  </div>
                  {row?.markdown && (
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
                      {row.markdown.slice(0, 8000)}
                    </pre>
                  )}
                  {!row?.markdown && row?.raw_html && (
                    <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
                      {row.raw_html.slice(0, 4000)}
                    </pre>
                  )}
                  {row?.screenshot_url && (
                    <a href={row.screenshot_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs underline">
                      Screenshot
                    </a>
                  )}
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="search">
            {sectionByKey["SEARCH_RESULT"] ? (
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
                {sectionByKey["SEARCH_RESULT"].markdown ?? sectionByKey["SEARCH_RESULT"].raw_html?.slice(0, 6000) ?? ""}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">Brak zapisanego ekranu wyniku wyszukiwania.</p>
            )}
          </TabsContent>

          <TabsContent value="json">
            <pre className="max-h-96 overflow-auto rounded bg-muted p-2 text-xs">
              {JSON.stringify(job.parsed_json ?? null, null, 2)}
            </pre>
          </TabsContent>

          <TabsContent value="analysis" className="space-y-2 text-sm">
            {analysis ? (
              <>
                <div>Scoring prawny: <strong>{analysis.legal_risk_score ?? "—"}/100</strong></div>
                {analysis.analysis_warning && (
                  <div className="rounded border border-destructive/40 bg-destructive/10 p-2 text-destructive text-xs">
                    {analysis.analysis_warning}
                  </div>
                )}
                <pre className="whitespace-pre-wrap rounded bg-muted p-2 text-xs">
                  {analysis.investor_summary ?? ""}
                </pre>
                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground">Flagi ryzyka</summary>
                  <pre className="mt-1 max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
                    {JSON.stringify(analysis.risk_flags, null, 2)}
                  </pre>
                </details>
              </>
            ) : (
              <p className="text-muted-foreground">Brak analizy.</p>
            )}
          </TabsContent>

          <TabsContent value="attempts" className="space-y-3">
            {attempts.map((a: any) => (
              <details key={a.id} className="rounded-md border p-2">
                <summary className="cursor-pointer text-sm">
                  Próba #{a.attempt_number} — {STATUS_LABEL[a.status] ?? a.status} —{" "}
                  {a.finished_at ? new Date(a.finished_at).toLocaleString("pl-PL") : "—"}
                </summary>
                {a.error_message && <p className="mt-2 text-xs text-destructive">{a.error_message}</p>}
                <div className="mt-2">
                  <div className="text-xs font-semibold">Request</div>
                  <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
                    {JSON.stringify(a.firecrawl_request ?? null, null, 2)}
                  </pre>
                </div>
                <div className="mt-2">
                  <div className="text-xs font-semibold">Response</div>
                  <pre className="max-h-96 overflow-auto rounded bg-muted p-2 text-xs">
                    {JSON.stringify(a.firecrawl_response ?? null, null, 2)}
                  </pre>
                </div>
              </details>
            ))}
            {!attempts.length && <p className="text-sm text-muted-foreground">Brak prób.</p>}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
