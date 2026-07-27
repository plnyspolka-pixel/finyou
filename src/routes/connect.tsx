import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/connect")({
  head: () => ({
    meta: [
      { title: "Podłącz Finance You do asystenta AI" },
      {
        name: "description",
        content:
          "Instrukcja krok po kroku: jak podłączyć Finance You do ChatGPT lub Claude jako konektor MCP.",
      },
    ],
  }),
  component: ConnectPage,
});

function ConnectPage() {
  const [mcpUrl, setMcpUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMcpUrl(new URL("/mcp", window.location.origin).toString());
  }, []);

  async function copyUrl() {
    if (!mcpUrl) return;
    await navigator.clipboard.writeText(mcpUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Podłącz Finance You do swojego asystenta AI
          </h1>
          <p className="text-muted-foreground">
            Po podłączeniu Twój asystent (ChatGPT lub Claude) może w Twoim imieniu pracować z
            leadami, wnioskami, ofertami inwestorów i wiadomościami Finance You. Widzi tylko to, do
            czego Ty masz uprawnienia.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Adres serwera MCP</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <code className="flex-1 select-all rounded-md border border-input bg-muted px-3 py-2 text-sm break-all">
                {mcpUrl || "…"}
              </code>
              <Button onClick={copyUrl} disabled={!mcpUrl} className="sm:w-auto">
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" /> Skopiowano
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" /> Kopiuj adres
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Ten adres podajesz asystentowi. Logujesz się swoim kontem Finance You — asystent
              działa dokładnie z Twoimi uprawnieniami.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">ChatGPT</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-foreground">
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Otwórz{" "}
                <a
                  href="https://chatgpt.com/#settings/Connectors/Advanced"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary underline"
                >
                  ustawienia konektorów ChatGPT
                  <ExternalLink className="h-3 w-3" />
                </a>{" "}
                i włącz <strong>Developer mode</strong> (zapoznaj się z ostrzeżeniem, które tam
                zobaczysz).
              </li>
              <li>
                W oknie czatu kliknij <strong>„+”</strong> w polu wiadomości i włącz tam{" "}
                <strong>Developer mode</strong>.
              </li>
              <li>
                Wybierz <strong>„Add sources”</strong>, a następnie <strong>„Connect more”</strong>.
              </li>
              <li>
                Nadaj konektorowi nazwę (np. <em>Finance You</em>) i wklej skopiowany wyżej adres
                serwera MCP.
              </li>
              <li>Zaloguj się swoim kontem Finance You i zatwierdź dostęp.</li>
              <li>Poproś ChatGPT, żeby skorzystał z Finance You.</li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Claude</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-foreground">
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Otwórz{" "}
                <a
                  href="https://claude.ai/customize/connectors?modal=add-custom-connector"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary underline"
                >
                  formularz dodawania konektora w Claude
                  <ExternalLink className="h-3 w-3" />
                </a>
                .
              </li>
              <li>
                Nadaj konektorowi nazwę (np. <em>Finance You</em>) i wklej skopiowany wyżej adres
                serwera MCP.
              </li>
              <li>Zaloguj się swoim kontem Finance You i zatwierdź dostęp.</li>
              <li>Włącz konektor w oknie czatu i poproś Claude, żeby skorzystał z Finance You.</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
