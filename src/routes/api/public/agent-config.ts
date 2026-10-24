// Publiczna konfiguracja widgetów botów: który agent ElevenLabs obsługuje
// daną powierzchnię (chat na stronie / strona inwestora / panel inwestora).
// Zwraca wyłącznie agent_id (i tak widoczny w osadzonym widgecie) — brak id
// oznacza, że powierzchnia działa jeszcze na starym silniku tekstowym.
import { createFileRoute } from "@tanstack/react-router";
import { ANIA_RECEPTION_AGENT_ID } from "@/lib/ania-reception";

const SURFACES = new Set(["reception", "intake", "investor_info", "investor_panel"]);

export const Route = createFileRoute("/api/public/agent-config")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const surface = url.searchParams.get("surface") ?? "";
        if (!SURFACES.has(surface)) {
          return Response.json({ agentId: null }, { status: 400 });
        }
        try {
          const { getAgentIdForSurface } = await import("@/lib/elevenlabs-agents.server");
          const agentId = surface === "investor_panel"
            ? await getAgentIdForSurface("investor_panel")
            : ANIA_RECEPTION_AGENT_ID;
          return Response.json(
            { agentId },
            { headers: { "Cache-Control": "public, max-age=300" } },
          );
        } catch (e: any) {
          console.error("[agent-config] error", e?.message);
          return Response.json({ agentId: null });
        }
      },
    },
  },
});
