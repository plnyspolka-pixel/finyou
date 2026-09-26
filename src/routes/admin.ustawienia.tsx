import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { TiktokConnectionCard } from "@/components/admin/tiktok-connection-card";

export const Route = createFileRoute("/admin/ustawienia")({
  component: UstawieniaPage,
});

function UstawieniaPage() {
  const { user, roles } = useAuth();
  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Ustawienia</h1>
      <Card>
        <CardHeader>
          <CardTitle>Konto</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <div>
            <span className="text-muted-foreground">E-mail:</span> {user?.email}
          </div>
          <div>
            <span className="text-muted-foreground">ID:</span>{" "}
            <code className="text-xs">{user?.id}</code>
          </div>
          <div>
            <span className="text-muted-foreground">Role:</span> {roles.join(", ") || "—"}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Moduły systemowe</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <div>
            Dystrybucja do inwestorów: <b className="text-foreground">E-mail (Karta oferty)</b>
          </div>
          <div>Integracje: zarządzaj w sekcji „Integracje”.</div>
          <div>
            YouTube: połącz kanał w{" "}
            <Link className="underline" to="/admin/youtube-shorts">
              YouTube Shorts
            </Link>
            . Facebook i Instagram jadą na sekretach środowiska (META_*).
          </div>
        </CardContent>
      </Card>

      {/* TikTok wymaga OAuth per konto, więc ma własną kartę tutaj. Ten sam
          komponent renderuje się w Studiu publikacji — jeden stan, dwa
          miejsca, bez rozjazdu. */}
      <TiktokConnectionCard />
    </div>
  );
}
