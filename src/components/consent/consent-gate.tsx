/**
 * Bramka akceptacji nowej wersji regulaminu klienta / polityki prywatności.
 * Dopóki aktywna wersja nie jest zaakceptowana, zamiast treści panelu
 * pokazujemy krótką informację z linkami i osobnymi checkboxami
 * (żaden nie startuje zaznaczony).
 */
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { acceptConsents, getMyConsentState } from "@/lib/consent/consent.functions";
import { CONSENT_LINKS, type ConsentAudience } from "@/lib/consent/consent-core";

export function ConsentGate({
  audience,
  children,
}: {
  audience: ConsentAudience;
  children: ReactNode;
}) {
  const qc = useQueryClient();
  const fetchState = useServerFn(getMyConsentState);
  const accept = useServerFn(acceptConsents);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const q = useQuery({
    queryKey: ["consent-state", audience],
    queryFn: () => fetchState({ data: { audience } }),
    staleTime: 5 * 60_000,
  });

  const m = useMutation({
    mutationFn: (ids: string[]) => accept({ data: { audience, documentIds: ids } }),
    onSuccess: () => {
      toast.success("Dziękujemy — akceptacja zapisana.");
      void qc.invalidateQueries({ queryKey: ["consent-state", audience] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = q.data?.pending ?? [];
  // Błąd odczytu nie blokuje panelu — bramka wraca przy kolejnym wejściu.
  if (q.isLoading || q.isError || pending.length === 0) return <>{children}</>;

  const allChecked = pending.every((p) => checked[p.id]);

  return (
    <div className="mx-auto max-w-2xl py-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            Zaktualizowaliśmy dokumenty
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Aby dalej korzystać z panelu, zapoznaj się z nowymi wersjami dokumentów i zaakceptuj je.
            Najważniejsze zmiany: finansowanie wyłącznie na cel związany z działalnością
            gospodarczą, jedyna opłata to prowizja Finance You 7% kwoty pożyczki (nie mniej niż 5
            000 zł, bez VAT), potrącana z wypłaty, a decyzje o odrzuceniu wniosku zawsze podejmuje
            człowiek.
          </p>
          <ul className="space-y-3">
            {pending.map((p) => {
              const link = CONSENT_LINKS[p.kind];
              return (
                <li key={p.id} className="flex items-start gap-3">
                  <Checkbox
                    id={`consent-${p.id}`}
                    checked={!!checked[p.id]}
                    onCheckedChange={(v) => setChecked((c) => ({ ...c, [p.id]: v === true }))}
                  />
                  <label htmlFor={`consent-${p.id}`} className="leading-snug">
                    Zapoznałem(-am) się i akceptuję:{" "}
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent underline"
                    >
                      {link.label}
                    </a>{" "}
                    (wersja {p.version})
                  </label>
                </li>
              );
            })}
          </ul>
          <Button
            disabled={!allChecked || m.isPending}
            onClick={() => m.mutate(pending.map((p) => p.id))}
          >
            {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Akceptuję i przechodzę dalej
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
