// Widget głosowy „Agent Ania — uzupełnia braki" (ElevenLabs Conversational AI)
// w panelu klienta. Renderuje się TYLKO, gdy wniosek klienta ma niepusty brief
// braków (moduł Follow-up braków) — Ania dopytuje głosowo dokładnie o te punkty.
//
// Świadomie używamy embeddable widgetu z CDN (<elevenlabs-convai>), a nie
// @elevenlabs/react: build produkcyjny instaluje zależności bunem z bun.lock
// przypiętym do rejestru Lovable, więc nowa zależność npm rozjechałaby lockfile.
// Widget przyjmuje brief przez atrybut `dynamic-variables` — te same nazwy
// zmiennych co telefoniczny webhook elevenlabs-conversation-init, dzięki czemu
// jeden prompt agenta działa dla telefonu i dla widgetu.
import { createElement, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Mic } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getMyMissingInfoBrief } from "@/lib/missing-info-follow-up/missing-info-follow-up.functions";

export const MISSING_INFO_VOICE_AGENT_ID =
  (import.meta.env.VITE_ELEVENLABS_MISSING_INFO_AGENT_ID as string | undefined) ??
  "agent_6501kysgcj34ff5byqst6z4b9bfz";

const WIDGET_SCRIPT_ID = "elevenlabs-convai-widget-script";
const WIDGET_SCRIPT_SRC = "https://elevenlabs.io/convai-widget/index.js";

function ensureWidgetScript() {
  if (document.getElementById(WIDGET_SCRIPT_ID)) return;
  const script = document.createElement("script");
  script.id = WIDGET_SCRIPT_ID;
  script.src = WIDGET_SCRIPT_SRC;
  script.async = true;
  document.body.appendChild(script);
}

export function MissingInfoVoiceAgent() {
  const getBrief = useServerFn(getMyMissingInfoBrief);
  const { data } = useQuery({
    queryKey: ["my-missing-info-brief"],
    queryFn: () => getBrief(),
    staleTime: 60_000,
  });

  const items = data?.found ? data.items : [];

  const dynamicVariables = useMemo(() => {
    if (!data?.found || items.length === 0) return null;
    return JSON.stringify({
      first_name: data.firstName ?? "",
      loan_application_id: data.loanApplicationId,
      has_application: true,
      is_complete: false,
      missing_documents: items.map((i) => i.label).join(", "),
      missing_documents_count: items.length,
      missing_step: items[0]?.label ?? "",
      // Pełne pytania (po jednym w linii) — agent pyta dokładnie o te punkty.
      missing_questions: items.map((i) => `- ${i.question}`).join("\n"),
    });
  }, [data, items]);

  useEffect(() => {
    if (dynamicVariables) ensureWidgetScript();
  }, [dynamicVariables]);

  if (!dynamicVariables) return null;

  return (
    <Card className="border-emerald-200 bg-emerald-50/50">
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-600 text-white">
            <Mic className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Porozmawiaj z Anią — uzupełni z Tobą braki</p>
            <p className="text-sm text-muted-foreground">
              Kliknij dymek asystentki w rogu ekranu i powiedz, czego dotyczą Twoje odpowiedzi —
              Ania dopyta dokładnie o to, czego brakuje w Twoim wniosku.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {items.slice(0, 5).map((i) => (
                <Badge key={i.key} variant="outline" title={i.question}>
                  {i.label}
                </Badge>
              ))}
              {items.length > 5 && <Badge variant="secondary">+{items.length - 5} dalszych</Badge>}
            </div>
          </div>
        </div>
        {/* Custom element ElevenLabs — floating bubble; createElement, bo tag
            nie występuje w typach JSX Reacta. */}
        {createElement("elevenlabs-convai", {
          "agent-id": MISSING_INFO_VOICE_AGENT_ID,
          "dynamic-variables": dynamicVariables,
        })}
      </CardContent>
    </Card>
  );
}
