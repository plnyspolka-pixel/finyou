import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  Bell,
  BellOff,
  BellRing,
  FileText,
  HandCoins,
  Mail,
  MessageCircle,
  Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { sendTestPush } from "@/lib/push.functions";

export const Route = createFileRoute("/operator/powiadomienia")({
  component: OperatorPowiadomienia,
});

const EVENTS: { icon: typeof Bell; title: string; desc: string }[] = [
  {
    icon: Users,
    title: "Nowy lead",
    desc: "Ktoś zostawił kontakt (formularz, czat, Messenger, telefon) — link prowadzi do karty leada.",
  },
  {
    icon: FileText,
    title: "Nowy wniosek o pożyczkę",
    desc: "Złożony wniosek z landing page lub od pośrednika — link do szczegółów wniosku.",
  },
  {
    icon: MessageCircle,
    title: "Wiadomość przychodząca",
    desc: "Czat na stronie, Messenger, SMS lub telefon od klienta — link do odpowiedniej skrzynki.",
  },
  {
    icon: Mail,
    title: "E-mail od klienta lub inwestora",
    desc: "Nowa wiadomość w skrzynce, w tym odpowiedź inwestora na rozesłaną ofertę.",
  },
  {
    icon: HandCoins,
    title: "Opłacony dostęp",
    desc: "Zaksięgowana płatność za dostęp do platformy — link do finansów.",
  },
];

function OperatorPowiadomienia() {
  const push = usePushNotifications();
  const [testing, setTesting] = useState(false);

  const onToggle = async (on: boolean) => {
    if (on) {
      const ok = await push.enable();
      if (ok) {
        toast.success("Powiadomienia push włączone w tej przeglądarce");
      } else if (push.permission === "denied" || Notification.permission === "denied") {
        toast.error(
          "Przeglądarka blokuje powiadomienia dla tej strony. Odblokuj je w ustawieniach witryny (ikona kłódki przy adresie).",
        );
      } else {
        toast.error(push.error ?? "Nie udało się włączyć powiadomień");
      }
    } else {
      await push.disable();
      toast.success("Powiadomienia push wyłączone w tej przeglądarce");
    }
  };

  const onTest = async () => {
    setTesting(true);
    try {
      const res = await sendTestPush();
      if (res.sent > 0) {
        toast.success("Wysłano testowe powiadomienie — sprawdź róg ekranu");
      } else if (res.skipped === "no_subscriptions") {
        toast.error("Brak aktywnej subskrypcji — najpierw włącz powiadomienia");
      } else if (res.skipped === "no_vapid_keys") {
        toast.error("Serwer nie ma skonfigurowanych kluczy VAPID");
      } else {
        toast.error("Nie udało się dostarczyć powiadomienia");
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Powiadomienia push</h1>
        <p className="text-sm text-muted-foreground">
          Natychmiastowe powiadomienia o kluczowych zdarzeniach — z linkiem prosto do miejsca w
          systemie, w którym możesz je obsłużyć. Działają także przy zamkniętej karcie panelu.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {push.subscribed ? <BellRing className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            Ta przeglądarka
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Subskrypcja dotyczy tej przeglądarki na tym urządzeniu. Włącz ją osobno na każdym
            urządzeniu, na którym chcesz dostawać powiadomienia (np. komputer w biurze i telefon).
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {!push.supported && (
            <p className="text-sm text-destructive">
              Ta przeglądarka nie wspiera powiadomień push. Użyj aktualnego Chrome, Edge, Firefoksa
              lub Safari (na iOS wymagane jest dodanie strony do ekranu głównego).
            </p>
          )}
          {push.supported && !push.configured && !push.loading && (
            <p className="text-sm text-destructive">
              Powiadomienia push nie są jeszcze skonfigurowane na serwerze (brak kluczy VAPID).
              Skontaktuj się z administratorem — instrukcja: docs/powiadomienia-push-operatora.md.
            </p>
          )}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <span className="text-sm font-medium">
              {push.subscribed ? "Powiadomienia włączone" : "Powiadomienia wyłączone"}
            </span>
            <Switch
              checked={push.subscribed}
              disabled={push.loading || !push.supported || !push.configured}
              onCheckedChange={(v) => void onToggle(v)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!push.subscribed || testing}
              onClick={() => void onTest()}
            >
              <Bell className="mr-2 h-4 w-4" />
              {testing ? "Wysyłanie…" : "Wyślij powiadomienie testowe"}
            </Button>
          </div>
          {push.error && <p className="text-xs text-destructive">{push.error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">O czym powiadamiamy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {EVENTS.map((e) => (
            <div key={e.title} className="flex items-start gap-3 rounded-lg border p-3">
              <div className="mt-0.5 text-muted-foreground">
                <e.icon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">{e.title}</div>
                <div className="text-xs text-muted-foreground">{e.desc}</div>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Ożywiona rozmowa na jednym kanale nie zasypie Cię powiadomieniami — kolejne wiadomości
            tego samego leada są zbijane w jedno powiadomienie co kilka minut.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
