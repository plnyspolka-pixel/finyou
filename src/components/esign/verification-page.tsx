// Publiczna weryfikacja podpisanego dokumentu po kodzie z paska na stronie:
// status, podpisujący, skróty SHA-256 + lokalne porównanie pliku (WebCrypto —
// plik nie opuszcza przeglądarki).
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, FileSearch, Loader2, ShieldCheck, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getVerification } from "@/lib/esign/esign-public.functions";
import {
  bytesToHex,
  ENVELOPE_STATUS_LABELS,
  formatSignedAt,
  pagesLabel,
  type EnvelopeStatus,
} from "@/lib/esign/esign-core";

async function fileSha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  return bytesToHex(await crypto.subtle.digest("SHA-256", buf));
}

export function VerificationPage({ code }: { code: string }) {
  const fetchV = useServerFn(getVerification);
  const q = useQuery({
    queryKey: ["esign-verify", code],
    queryFn: () => fetchV({ data: { code } }),
    retry: false,
  });
  const [check, setCheck] = useState<{ name: string; sha: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      setCheck({ name: f.name, sha: await fileSha256(f) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(120%_80%_at_50%_-10%,oklch(0.93_0.03_265),transparent_60%)]">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:py-12">
        <header className="flex items-start gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-[oklch(0.28_0.12_265)] text-sm font-black text-white">
            FY
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Finance You · Weryfikacja podpisu dokumentowego
            </p>
            <h1 className="text-xl font-bold md:text-2xl">Sprawdź autentyczność dokumentu</h1>
          </div>
        </header>

        {q.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Sprawdzanie…
          </div>
        ) : !q.data || !q.data.found ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <XCircle className="h-5 w-5 text-destructive" /> Nie znaleziono dokumentu o kodzie{" "}
                {code}
              </CardTitle>
              <CardDescription>
                Sprawdź kod z paska na stronie dokumentu („Weryfikacja: …/weryfikacja/KOD”). Jeśli
                kod jest poprawny, a dokument nie istnieje — plik mógł zostać podrobiony.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    {q.data.publicId} · {q.data.title}
                  </CardTitle>
                  <Badge
                    className={
                      q.data.status === "zakonczona"
                        ? "bg-emerald-100 text-emerald-800"
                        : q.data.status === "wyslana"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-muted text-muted-foreground"
                    }
                  >
                    {ENVELOPE_STATUS_LABELS[q.data.status as EnvelopeStatus] ?? q.data.status}
                  </Badge>
                </div>
                <CardDescription>
                  {pagesLabel(q.data.pageCount)} dokumentu źródłowego · wysłano{" "}
                  {formatSignedAt(q.data.sentAt).split(" (")[0]}
                  {q.data.completedAt
                    ? ` · zamknięto ${formatSignedAt(q.data.completedAt).split(" (")[0]}`
                    : ""}{" "}
                  · operator: {q.data.operatorName}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <p className="mb-1 font-medium">Podpisujący</p>
                  <ul className="space-y-1">
                    {q.data.signers.map((s, i) => (
                      <li
                        key={i}
                        className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-2"
                      >
                        <span>
                          <span className="font-medium">{s.capacity ?? s.fullName}</span>
                          {s.roleLabel ? (
                            <span className="text-muted-foreground"> · {s.roleLabel}</span>
                          ) : null}
                          {s.identityMethod ? (
                            <span className="block text-xs text-muted-foreground">
                              {s.identityMethod}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {s.status === "podpisany" ? (
                            <span className="flex items-center gap-1 text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" /> {formatSignedAt(s.signedAt)}
                            </span>
                          ) : (
                            s.status
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="grid gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">SHA-256 dokumentu źródłowego: </span>
                    <code className="break-all">{q.data.sourceSha256}</code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">SHA-256 podpisanego pliku: </span>
                    <code className="break-all">
                      {q.data.finalSha256 ?? "— (dokument nie został jeszcze zamknięty)"}
                    </code>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5" /> Historia dokumentu: {q.data.eventsCount}{" "}
                    zdarzeń, łańcuch skrótów{" "}
                    {q.data.chainOk ? "spójny" : "NIESPÓJNY — skontaktuj się z operatorem"}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileSearch className="h-5 w-5" /> Porównaj posiadany plik
                </CardTitle>
                <CardDescription>
                  Wskaż plik PDF, który otrzymałeś(-aś). Skrót liczymy w Twojej przeglądarce — plik
                  nie jest nigdzie wysyłany.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <input
                  ref={inputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => void onFile(e.target.files?.[0])}
                />
                <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
                  {busy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  Wybierz plik PDF
                </Button>
                {check ? (
                  <CheckResult
                    check={check}
                    finalSha={q.data.finalSha256}
                    sourceSha={q.data.sourceSha256}
                  />
                ) : null}
              </CardContent>
            </Card>

            <p className="text-xs leading-relaxed text-muted-foreground">
              Dokument podpisano w formie dokumentowej (art. 77² KC) podpisem elektronicznym w
              rozumieniu art. 3 pkt 10 eIDAS; tożsamość podpisujących potwierdzono weryfikacją
              dokumentu tożsamości (Didit). Zgodnie z art. 25 ust. 1 eIDAS podpisowi elektronicznemu
              nie można odmówić skutku prawnego wyłącznie z powodu postaci elektronicznej. Treść
              dokumentu nie jest publicznie udostępniana — strona potwierdza wyłącznie fakt
              podpisania i integralność pliku.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function CheckResult({
  check,
  finalSha,
  sourceSha,
}: {
  check: { name: string; sha: string };
  finalSha: string | null;
  sourceSha: string;
}) {
  const isFinal = finalSha && check.sha === finalSha;
  const isSource = check.sha === sourceSha;
  return (
    <div
      className={
        "rounded-lg border p-3 text-sm " +
        (isFinal
          ? "border-emerald-200 bg-emerald-50"
          : isSource
            ? "border-amber-200 bg-amber-50"
            : "border-red-200 bg-red-50")
      }
    >
      <p className="font-medium">
        {isFinal ? (
          <span className="flex items-center gap-2 text-emerald-800">
            <CheckCircle2 className="h-4 w-4" /> Plik jest zgodny z podpisanym dokumentem
          </span>
        ) : isSource ? (
          <span className="text-amber-900">
            To dokument źródłowy sprzed podpisania (bez znaczników i Karty podpisów)
          </span>
        ) : (
          <span className="flex items-center gap-2 text-red-800">
            <XCircle className="h-4 w-4" /> Plik NIE jest zgodny z podpisanym dokumentem
          </span>
        )}
      </p>
      <p className="mt-1 break-all text-xs text-muted-foreground">
        {check.name} · SHA-256 {check.sha}
      </p>
    </div>
  );
}
