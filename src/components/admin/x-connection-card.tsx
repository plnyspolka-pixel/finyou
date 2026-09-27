// Karta połączenia konta X (dawniej Twitter, OAuth 2.0) — odpowiednik karty
// TikToka. Meta jedzie na sekretach środowiska, więc własnej karty nie
// potrzebuje.
//
// Komponent jest samowystarczalny (własne zapytanie o status i mutacje), bo
// renderuje się w DWÓCH miejscach: w /admin/ustawienia (tam użytkownik jej
// szuka) i w /admin/studio-publikacji (tam się publikuje). Jedno źródło
// prawdy — klucz zapytania `x-status` jest wspólny, więc po połączeniu albo
// rozłączeniu obie strony odświeżają się same.
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Twitter, Unplug } from "lucide-react";
import { toast } from "sonner";
import { getXIntegrationStatus, startXConnect, disconnectXAccount } from "@/lib/x.functions";

export function XConnectionCard() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getXIntegrationStatus);
  const connectFn = useServerFn(startXConnect);
  const disconnectFn = useServerFn(disconnectXAccount);

  const { data: status, isLoading } = useQuery({
    queryKey: ["x-status"],
    queryFn: () => statusFn(),
  });

  // Powrót z OAuth X-a (/api/x/callback dokleja ?x=…). Obsługa jest tutaj, żeby
  // zadziałała niezależnie od tego, z której strony ruszył flow.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const x = params.get("x");
    if (!x) return;
    if (x === "connected") {
      toast.success("Konto X połączone!");
      qc.invalidateQueries({ queryKey: ["x-status"] });
      qc.invalidateQueries({ queryKey: ["studio-status"] });
    }
    if (x === "error") {
      toast.error(`Połączenie z X nieudane: ${params.get("reason") ?? "nieznany błąd"}`);
    }
    window.history.replaceState({}, "", window.location.pathname);
  }, [qc]);

  const connectM = useMutation({
    mutationFn: () => connectFn(),
    // `url` to /api/x/auth?state=… — ten endpoint robi redirect na X-a.
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const disconnectM = useMutation({
    mutationFn: () => disconnectFn(),
    onSuccess: () => {
      toast.success("Odłączono konto X");
      qc.invalidateQueries({ queryKey: ["x-status"] });
      qc.invalidateQueries({ queryKey: ["studio-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Twitter className="h-5 w-5" /> X
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : !status?.envConfigured ? (
          <div className="space-y-2">
            <p className="font-medium text-destructive">
              Brak konfiguracji — ustaw sekrety X_CLIENT_ID i X_CLIENT_SECRET.
            </p>
            <p className="text-muted-foreground">
              W X Developer Console ustaw typ aplikacji na <b>Web App, Automated App or Bot</b>{" "}
              (klient poufny), uprawnienia na <b>Read and write</b>, a jako Callback URI wpisz{" "}
              <code className="break-all rounded bg-muted px-1">{status?.redirectUri}</code>.
            </p>
          </div>
        ) : status.connected ? (
          <div className="flex flex-wrap items-start gap-4">
            <div className="space-y-1">
              <p className="flex items-center gap-2 font-medium">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-green-500"
                  aria-hidden
                />
                Połączono
                {status.username && (
                  <code className="rounded bg-muted px-1 text-xs">@{status.username}</code>
                )}
              </p>
              {status.connectedAt && (
                <p className="text-xs text-muted-foreground">
                  od {new Date(status.connectedAt).toLocaleString("pl-PL")}
                </p>
              )}
              {status.tokenExpiresAt && (
                <p className="text-xs text-muted-foreground">
                  Token wygasa {new Date(status.tokenExpiresAt).toLocaleString("pl-PL")} — tick
                  odświeża go automatycznie 15 min przed terminem.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Limit posta: {status.postLimit} znaków (dłuższe treści przycinamy przed wysyłką).
              </p>
              {status.lastError && (
                <p className="text-xs text-destructive">Ostatni błąd: {status.lastError}</p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => disconnectM.mutate()}
              disabled={disconnectM.isPending}
            >
              <Unplug className="mr-1 h-4 w-4" /> Rozłącz
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-muted-foreground">
              Konto X nie jest połączone — publikacja na X jest wyłączona.
            </p>
            {status.lastError && (
              <p className="text-xs text-destructive">Ostatni błąd: {status.lastError}</p>
            )}
            <Button size="sm" onClick={() => connectM.mutate()} disabled={connectM.isPending}>
              {connectM.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Twitter className="mr-1 h-4 w-4" />
              )}
              Połącz X
            </Button>

            {/* Diagnostyka pod błędy „invalid client" na ekranie zgody:
                client_id jest jawny (jedzie w URL-u zgody), więc podgląd
                niczego nie ujawnia, a od razu widać spację albo ucięty znak. */}
            <details className="pt-1">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Diagnostyka połączenia
              </summary>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <p>
                  client_id: <code className="rounded bg-muted px-1">{status.clientIdPreview}</code>{" "}
                  (długość {status.clientIdLength})
                </p>
                <p>
                  redirect_uri:{" "}
                  <code className="break-all rounded bg-muted px-1">{status.redirectUri}</code>
                </p>
                {status.clientIdHadWhitespace && (
                  <p className="text-destructive">
                    Sekret X_CLIENT_ID miał spację lub znak nowej linii na końcu — obcinamy go przed
                    wysyłką, ale popraw wartość w sekretach.
                  </p>
                )}
                <p>
                  Jeśli X odrzuca połączenie: sprawdź, czy Callback URI w konsoli jest identyczny co
                  do znaku (bez ukośnika na końcu) i czy typ aplikacji to{" "}
                  <b>Web App, Automated App or Bot</b> — <b>Native App</b> nie dostaje Client
                  Secret, więc wymiana kodu na token się nie uda.
                </p>
              </div>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
