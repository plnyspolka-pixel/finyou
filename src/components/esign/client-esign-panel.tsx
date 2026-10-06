// Panel KLIENTA pożyczkowego: dokumenty do podpisu (umowa od Finance You albo
// inwestora) i podpisane (pobranie PDF z Kartą podpisów). Podpis odbywa się na
// stronie /podpis/<token> — tu tylko „Otwórz i podpisz” (nowy link bez e-maila).
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  PenLine,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getEnvelopeFileUrl,
  listMyClientDocuments,
  openMySigningLink,
} from "@/lib/esign/esign-owner.functions";
import {
  ENVELOPE_STATUS_LABELS,
  formatSignedAt,
  pagesLabel,
  type EnvelopeStatus,
} from "@/lib/esign/esign-core";

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Wystąpił błąd";
}

function useMyDocuments() {
  const fetchDocs = useServerFn(listMyClientDocuments);
  return useQuery({ queryKey: ["esign-client-docs"], queryFn: () => fetchDocs() });
}

function useOpenAndSign() {
  const openLink = useServerFn(openMySigningLink);
  return useMutation({
    mutationFn: (signerId: string) => openLink({ data: { signerId } }),
    onSuccess: (r) => {
      window.location.href = r.url;
    },
    onError: (e) => toast.error(errMsg(e)),
  });
}

/** Krótki baner na pulpit klienta — tylko gdy jest coś do podpisu. */
export function ClientEsignBanner() {
  const docs = useMyDocuments();
  const open = useOpenAndSign();
  const items = docs.data?.toSign ?? [];
  if (!items.length) return null;
  return (
    <Card className="border-[oklch(0.28_0.12_265)]/40 bg-[oklch(0.97_0.02_265)]">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[oklch(0.28_0.12_265)] text-white">
            <PenLine className="h-4 w-4" />
          </span>
          <div>
            <p className="font-semibold">
              {items.length === 1
                ? "Masz dokument do podpisu"
                : `Masz ${items.length} dokumenty do podpisu`}
            </p>
            <p className="text-sm text-muted-foreground">
              {items[0].envelope.title}
              {items.length > 1 ? ` i ${items.length - 1} więcej` : ""} · od:{" "}
              {items[0].envelope.senderName ?? "Finance You"}
            </p>
          </div>
        </div>
        <Button onClick={() => open.mutate(items[0].signerId)} disabled={open.isPending}>
          {open.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <PenLine className="mr-2 h-4 w-4" />
          )}
          Otwórz i podpisz
        </Button>
      </CardContent>
    </Card>
  );
}

export function ClientEsignPanel() {
  const docs = useMyDocuments();
  const open = useOpenAndSign();
  const fileUrl = useServerFn(getEnvelopeFileUrl);
  const download = useMutation({
    mutationFn: (envelopeId: string) => fileUrl({ data: { envelopeId, which: "podpisany" } }),
    onSuccess: (r) => window.open(r.url, "_blank", "noopener"),
    onError: (e) => toast.error(errMsg(e)),
  });

  if (docs.isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie dokumentów…
      </div>
    );
  }
  const toSign = docs.data?.toSign ?? [];
  const signed = docs.data?.signed ?? [];
  const other = docs.data?.other ?? [];

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Dokumenty do podpisu</h1>
        <p className="text-sm text-muted-foreground">
          Umowy i dokumenty przesłane Ci do podpisu elektronicznego. Podpisujesz w formie
          dokumentowej: potwierdzasz tożsamość zdjęciem dokumentu i twarzy (Didit), wpisujesz kod
          jednorazowy i klikasz „Podpisuję”. Podpisany plik dostaniesz e-mailem i pobierzesz tutaj.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <PenLine className="h-4 w-4" /> Czekają na Twój podpis ({toSign.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {toSign.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              Nie masz teraz dokumentów do podpisu.
            </p>
          ) : (
            toSign.map((d) => (
              <div
                key={d.signerId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {d.envelope.publicId}
                    </span>
                    <span className="font-medium">{d.envelope.title}</span>
                    {d.roleLabel ? <Badge variant="outline">{d.roleLabel}</Badge> : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    <span>od: {d.envelope.senderName ?? "Finance You"}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> do{" "}
                      {formatSignedAt(d.envelope.expiresAt).split(" (")[0]}
                    </span>
                    <span>{pagesLabel(d.envelope.pageCount)}</span>
                  </div>
                </div>
                <Button onClick={() => open.mutate(d.signerId)} disabled={open.isPending}>
                  {open.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <PenLine className="mr-2 h-4 w-4" />
                  )}
                  Otwórz i podpisz
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Podpisane ({signed.length})
          </CardTitle>
          <CardDescription>
            Gdy podpiszą wszystkie strony, plik ze znacznikami na każdej stronie i Kartą podpisów
            jest gotowy do pobrania.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {signed.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">Brak podpisanych dokumentów.</p>
          ) : (
            signed.map((d) => (
              <div
                key={d.signerId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {d.envelope.publicId}
                    </span>
                    <span className="font-medium">{d.envelope.title}</span>
                    <Badge
                      className={
                        d.envelope.status === "zakonczona"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-blue-100 text-blue-800"
                      }
                    >
                      {d.envelope.status === "zakonczona"
                        ? "Podpisany przez wszystkich"
                        : "Twój podpis złożony — czekamy na pozostałych"}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Twój podpis: {formatSignedAt(d.signedAt)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {d.envelope.finalAvailable ? (
                    <Button
                      size="sm"
                      onClick={() => download.mutate(d.envelope.id)}
                      disabled={download.isPending}
                    >
                      <Download className="mr-1 h-4 w-4" /> Podpisany PDF
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline" asChild>
                    <a href={d.envelope.verifyUrl} target="_blank" rel="noreferrer">
                      <ShieldCheck className="mr-1 h-4 w-4" /> Weryfikacja
                    </a>
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {other.length ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" /> Zamknięte bez podpisu ({other.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {other.map((d) => (
              <div key={d.signerId} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {d.envelope.publicId}
                  </span>{" "}
                  {d.envelope.title}
                </span>
                <Badge variant="secondary">
                  {ENVELOPE_STATUS_LABELS[d.envelope.status as EnvelopeStatus] ?? d.envelope.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Podpis elektroniczny w formie dokumentowej (art. 77² Kodeksu cywilnego, art. 3 pkt 10 i art.
        25 eIDAS). Link do podpisu jest osobisty — nie przekazuj go dalej. Jeśli nie znasz dokumentu
        albo nadawcy, nie podpisuj i skontaktuj się z Finance You.{" "}
        <a className="inline-flex items-center gap-1 underline" href="/klient/powiadomienia">
          <ExternalLink className="h-3 w-3" /> Powiadomienia
        </a>
      </p>
    </div>
  );
}
