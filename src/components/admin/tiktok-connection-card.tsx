// Karta połączenia konta TikTok (OAuth) — odpowiednik karty kanału
// w /admin/youtube-shorts. Meta jedzie na sekretach środowiska, więc własnej
// karty nie potrzebuje.
//
// Komponent jest samowystarczalny (własne zapytanie o status i mutacje), bo
// renderuje się w DWÓCH miejscach: w /admin/ustawienia (tam użytkownik jej
// szuka) i w /admin/studio-publikacji (tam się publikuje). Jedno źródło
// prawdy — klucz zapytania `tiktok-status` jest wspólny, więc po połączeniu
// albo rozłączeniu obie strony odświeżają się same.
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Music2, Unplug } from "lucide-react";
import { toast } from "sonner";
import {
  getTiktokIntegrationStatus,
  startTiktokConnect,
  disconnectTiktokAccount,
} from "@/lib/tiktok.functions";

export function TiktokConnectionCard() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getTiktokIntegrationStatus);
  const connectFn = useServerFn(startTiktokConnect);
  const disconnectFn = useServerFn(disconnectTiktokAccount);

  const { data: status, isLoading } = useQuery({
    queryKey: ["tiktok-status"],
    queryFn: () => statusFn(),
  });

  // Powrót z OAuth TikToka (/api/tiktok/callback dokleja ?tt=…). Obsługa jest
  // tutaj, żeby zadziałała niezależnie od tego, z której strony ruszył flow.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tt = params.get("tt");
    if (!tt) return;
    if (tt === "connected") {
      toast.success("Konto TikTok połączone!");
      qc.invalidateQueries({ queryKey: ["tiktok-status"] });
      qc.invalidateQueries({ queryKey: ["studio-status"] });
    }
    if (tt === "error") {
      toast.error(`Połączenie z TikTokiem nieudane: ${params.get("reason") ?? "nieznany błąd"}`);
    }
    window.history.replaceState({}, "", window.location.pathname);
  }, [qc]);

  const connectM = useMutation({
    mutationFn: () => connectFn(),
    // `url` to /api/tiktok/auth?state=… — ten endpoint robi redirect na TikToka.
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const disconnectM = useMutation({
    mutationFn: () => disconnectFn(),
    onSuccess: () => {
      toast.success("Odłączono konto TikTok");
      qc.invalidateQueries({ queryKey: ["tiktok-status"] });
      qc.invalidateQueries({ queryKey: ["studio-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Music2 className="h-5 w-5" /> TikTok
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : !status?.envConfigured ? (
          <div className="space-y-2">
            <p className="font-medium text-destructive">
              Brak konfiguracji — ustaw sekrety TIKTOK_CLIENT_KEY i TIKTOK_CLIENT_SECRET.
            </p>
            <p className="text-muted-foreground">
              W TikTok for Developers włącz produkt <b>Content Posting API</b> (Direct Post), dodaj
              zakresy <code>user.info.basic</code> i <code>video.publish</code>, a jako Redirect URI
              wpisz <code className="break-all rounded bg-muted px-1">{status?.redirectUri}</code>.
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
                {status.openId && (
                  <code className="rounded bg-muted px-1 text-xs">{status.openId}</code>
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
                  odświeża go automatycznie 2 h przed terminem.
                </p>
              )}
              {status.refreshTokenExpiresAt && (
                <p className="text-xs text-muted-foreground">
                  Ponowne logowanie wymagane do{" "}
                  {new Date(status.refreshTokenExpiresAt).toLocaleDateString("pl-PL")}.
                </p>
              )}
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
              Konto TikTok nie jest połączone — publikacja na TikToka jest wyłączona.
            </p>
            {status.lastError && (
              <p className="text-xs text-destructive">Ostatni błąd: {status.lastError}</p>
            )}
            <Button size="sm" onClick={() => connectM.mutate()} disabled={connectM.isPending}>
              {connectM.isPending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Music2 className="mr-1 h-4 w-4" />
              )}
              Połącz TikTok
            </Button>

            {/* Diagnostyka pod błąd „popraw client_key" na ekranie TikToka:
                klucz jest jawny (jedzie w URL-u zgody), więc podgląd niczego
                nie ujawnia, a od razu widać spację albo ucięty znak. */}
            <details className="pt-1">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Diagnostyka połączenia
              </summary>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <p>
                  client_key:{" "}
                  <code className="rounded bg-muted px-1">{status.clientKeyPreview}</code> (długość{" "}
                  {status.clientKeyLength})
                </p>
                <p>
                  redirect_uri:{" "}
                  <code className="break-all rounded bg-muted px-1">{status.redirectUri}</code>
                </p>
                {status.clientKeyHadWhitespace && (
                  <p className="text-destructive">
                    Sekret TIKTOK_CLIENT_KEY miał spację lub znak nowej linii na końcu — obcinamy go
                    przed wysyłką, ale popraw wartość w sekretach.
                  </p>
                )}
                <p>
                  Jeśli TikTok odrzuca client_key: sprawdź, czy wartość pochodzi z pola{" "}
                  <b>Client key</b> (nie Client secret ani App ID) i czy aplikacja ma dodany produkt{" "}
                  <b>Login Kit</b> — sam Content Posting API nie wystarcza do logowania.
                </p>
              </div>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
