import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMetaAppId } from "@/lib/meta-app-id.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Facebook, CheckCircle2, Loader2, RefreshCw, ShieldOff } from "lucide-react";
import { toast } from "sonner";

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

export const Route = createFileRoute("/admin/facebook-connect")({
  component: FacebookConnectPage,
  head: () => ({
    meta: [
      { title: "Connect Facebook Page — Finance You" },
      {
        name: "description",
        content: "Connect the Facebook Page that powers our Messenger integration.",
      },
    ],
  }),
});

type FbPage = {
  id: string;
  name: string;
  category?: string;
  access_token?: string;
  tasks?: string[];
};

const KNOWN_TARGET_PAGE_ID = "661893307005604";

function mergePages(base: FbPage[], extra?: FbPage | null) {
  if (!extra) return base;
  if (base.some((page) => page.id === extra.id)) return base;
  return [extra, ...base];
}

function loadSdk(appId: string) {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined") return resolve();
    if (window.FB) return resolve();
    window.fbAsyncInit = () => {
      window.FB.init({ appId, cookie: true, xfbml: false, version: "v21.0" });
      resolve();
    };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/en_US/sdk.js";
    s.async = true;
    s.defer = true;
    s.crossOrigin = "anonymous";
    document.body.appendChild(s);
  });
}

function FacebookConnectPage() {
  const fetchAppId = useServerFn(getMetaAppId);
  const { data: appIdData } = useQuery({ queryKey: ["meta-app-id"], queryFn: () => fetchAppId() });
  const APP_ID = appIdData?.appId ?? undefined;
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [pages, setPages] = useState<FbPage[] | null>(null);
  const [selected, setSelected] = useState<FbPage | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [directLookupMessage, setDirectLookupMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!APP_ID) return;
    loadSdk(APP_ID).then(() => setReady(true));
  }, [APP_ID]);

  const connect = () => {
    if (!window.FB) return;
    setBusy(true);
    setSelected(null);
    setPages(null);
    setDirectLookupMessage(null);
    window.FB.login(
      (resp: any) => {
        if (!resp.authResponse) {
          setBusy(false);
          toast.error("Anulowano logowanie do Facebooka");
          return;
        }
        window.FB.api(
          "/me/accounts",
          { fields: "id,name,category,tasks,access_token", limit: 100 },
          (r: any) => {
            if (!r || r.error) {
              setBusy(false);
              toast.error(r?.error?.message ?? "Błąd Graph API");
              return;
            }

            const returnedPages = r.data ?? [];
            window.FB.api(
              `/${KNOWN_TARGET_PAGE_ID}`,
              { fields: "id,name,category,access_token" },
              (direct: any) => {
                setBusy(false);
                if (direct && !direct.error) {
                  setPages(mergePages(returnedPages, direct));
                  if (!returnedPages.some((page: FbPage) => page.id === direct.id)) {
                    setDirectLookupMessage(
                      `Facebook nie zwrócił tej strony w standardowej liście, ale bezpośredni dostęp po ID zadziałał: ${direct.name}.`,
                    );
                  }
                  return;
                }

                setPages(returnedPages);
                setDirectLookupMessage(
                  direct?.error?.message
                    ? `Bezpośrednie sprawdzenie strony Filip Bielak Consulting po ID nie zadziałało: ${direct.error.message}`
                    : null,
                );
              },
            );
          },
        );
      },
      {
        scope: "pages_show_list,pages_messaging,pages_manage_metadata",
        return_scopes: true,
        auth_type: "reauthorize",
      },
    );
  };

  const resetFacebookAuthorization = () => {
    if (!window.FB) return;
    setResetBusy(true);
    window.FB.api("/me/permissions", "delete", (r: any) => {
      setResetBusy(false);
      if (!r || r.error || r.success === false) {
        toast.error(r?.error?.message ?? "Nie udało się zresetować uprawnień Facebooka");
        return;
      }
      setPages(null);
      setSelected(null);
      setTestResult(null);
      setDirectLookupMessage(null);
      toast.success("Uprawnienia zresetowane. Połącz ponownie i wybierz właściwą stronę.");
    });
  };

  const pickPage = (p: FbPage) => {
    setSelected(p);
    toast.success(`Page connected successfully: ${p.name}`);
  };

  const testMessenger = () => {
    if (!selected) return;
    // Read-only test: fetch page info via Graph to prove the connection works.
    window.FB.api(`/${selected.id}`, { fields: "id,name,fan_count,link" }, (r: any) => {
      if (!r || r.error) {
        setTestResult(`❌ ${r?.error?.message ?? "Unknown error"}`);
        return;
      }
      setTestResult(
        `✅ Messenger integration ready for "${r.name}" (id: ${r.id}). Link: ${r.link ?? "n/a"}`,
      );
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Facebook className="h-6 w-6" /> Connect Facebook Page
        </h1>
        <p className="text-sm text-muted-foreground">
          Link the Facebook Page that our Messenger / Facebook Page integration will use to send and
          receive messages on your behalf.
        </p>
      </div>

      {!APP_ID && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm">
            Brak <code>VITE_META_APP_ID</code>. Dodaj Facebook App ID w sekretach projektu, żeby
            uruchomić OAuth.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>1. Sign in with Facebook</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            We request <code>pages_show_list</code> so we can display the list of Pages you manage,
            plus <code>pages_messaging</code> so the selected Page can be wired into our Messenger
            integration.
          </p>
          <Button onClick={connect} disabled={!ready || busy || !APP_ID} size="lg">
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Facebook className="mr-2 h-4 w-4" />
            )}
            Connect Facebook Page
          </Button>
          <Button
            onClick={resetFacebookAuthorization}
            disabled={!ready || resetBusy || !APP_ID}
            variant="outline"
            size="lg"
            className="ml-2"
          >
            {resetBusy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ShieldOff className="mr-2 h-4 w-4" />
            )}
            Reset Facebook permissions
          </Button>
        </CardContent>
      </Card>

      {pages && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>2. Select the Page to connect</CardTitle>
            <Button size="sm" variant="ghost" onClick={connect}>
              <RefreshCw className="mr-1 h-3 w-3" /> Refresh
            </Button>
          </CardHeader>
          <CardContent>
            <div className="mb-4 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
              If the Page you want is missing here, Facebook did not return it to the app. Reset
              permissions, connect again, then choose access to all current and future Pages or
              explicitly select the target Page.
            </div>
            {directLookupMessage && (
              <div className="mb-4 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                {directLookupMessage}
              </div>
            )}
            {pages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No Pages found on this Facebook account.
              </p>
            ) : (
              <ul className="divide-y">
                {pages.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2">
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        id: {p.id} {p.category ? `· ${p.category}` : ""}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={selected?.id === p.id ? "default" : "outline"}
                      onClick={() => pickPage(p)}
                    >
                      {selected?.id === p.id ? (
                        <>
                          <CheckCircle2 className="mr-1 h-4 w-4" /> Connected
                        </>
                      ) : (
                        "Connect this Page"
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {selected && (
        <Card className="border-emerald-500/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" /> Page connected successfully
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">
              <Badge variant="secondary">{selected.name}</Badge>{" "}
              <span className="text-muted-foreground">is now linked to Finance You.</span>
            </div>
            <div>
              <div className="mb-1 text-sm font-medium">
                3. Quick test — Messenger / Facebook Page integration
              </div>
              <Button size="sm" onClick={testMessenger}>
                Run integration test
              </Button>
              {testResult && (
                <pre className="mt-3 whitespace-pre-wrap rounded bg-muted p-3 text-xs">
                  {testResult}
                </pre>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
