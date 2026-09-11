// Widget głosowy „Ania — uzupełnia braki" w panelu klienta. Renderuje się
// TYLKO, gdy wniosek klienta ma niepusty brief braków (moduł Follow-up braków)
// — Ania dopytuje głosowo dokładnie o te punkty.
//
// Interfejs jest NASZ (VoiceCallWidget): po polsku, w kolorach Finance You,
// bez osadzonego widgetu ElevenLabs. Silnikiem rozmowy pozostaje agent
// ElevenLabs — te same nazwy zmiennych co telefoniczny webhook
// elevenlabs-conversation-init, dzięki czemu jeden prompt obsługuje telefon
// i rozmowę w panelu.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { VoiceCallWidget } from "@/components/landing/voice-call-widget";
import { getMyMissingInfoBrief } from "@/lib/missing-info-follow-up/missing-info-follow-up.functions";

export const MISSING_INFO_VOICE_AGENT_ID =
  (import.meta.env.VITE_ELEVENLABS_MISSING_INFO_AGENT_ID as string | undefined) ??
  "agent_6501kysgcj34ff5byqst6z4b9bfz";

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
    return {
      // Rozmowa w panelu to kanał głosowy na stronie: Ania mówi krótko, nie
      // przyjmie dokumentu głosem i kieruje do uzupełnienia wniosku tutaj.
      channel: "voice_web",
      channel_label: "rozmowa głosowa na stronie",
      first_name: data.firstName ?? "",
      loan_application_id: data.loanApplicationId,
      has_application: true,
      is_complete: false,
      missing_documents: items.map((i) => i.label).join(", "),
      missing_documents_count: items.length,
      missing_step: items[0]?.label ?? "",
      // Pełne pytania (po jednym w linii) — agent pyta dokładnie o te punkty.
      missing_questions: items.map((i) => `- ${i.question}`).join("\n"),
    } satisfies Record<string, string | number | boolean>;
  }, [data, items]);

  if (!dynamicVariables) return null;

  return (
    <VoiceCallWidget
      placement="inline"
      surface="missing_info"
      dynamicVariables={dynamicVariables}
      title="Ania"
      subtitle="uzupełni z Tobą braki we wniosku"
      intro="Kliknij i powiedz, czego dotyczą Twoje odpowiedzi — Ania dopyta dokładnie o to, czego brakuje w Twoim wniosku."
      applyTargetSelector={null}
      className="border-emerald-200"
    >
      <div className="flex flex-wrap gap-1.5">
        {items.slice(0, 5).map((i) => (
          <Badge key={i.key} variant="outline" title={i.question}>
            {i.label}
          </Badge>
        ))}
        {items.length > 5 && <Badge variant="secondary">+{items.length - 5} dalszych</Badge>}
      </div>
    </VoiceCallWidget>
  );
}
