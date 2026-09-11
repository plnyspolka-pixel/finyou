// Start rozmowy głosowej z Anią z poziomu strony — endpoint wydaje podpisany
// URL sesji ElevenLabs dla JEDNEJ z naszych powierzchni. Klucz API nigdy nie
// trafia do przeglądarki, a przeglądarka nie może wskazać dowolnego agenta:
// akceptujemy wyłącznie nazwy powierzchni z listy poniżej.
//
// Dzięki temu widget głosowy na stronie jest NASZ (własny interfejs po polsku,
// bez brandingu ElevenLabs) — ElevenLabs zostaje tylko jako silnik rozmowy.
import { createFileRoute } from "@tanstack/react-router";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

/** Powierzchnie głosowe dostępne publicznie. */
type VoiceSurface = "intake" | "missing_info";

/** Agent „Ania — uzupełnia braki" w panelu klienta (ten sam co widget braków). */
const MISSING_INFO_AGENT_ID =
  process.env.ELEVENLABS_MISSING_INFO_AGENT_ID ??
  process.env.VITE_ELEVENLABS_MISSING_INFO_AGENT_ID ??
  "agent_6501kysgcj34ff5byqst6z4b9bfz";

// Prosty limiter w pamięci procesu: rozmowa głosowa kosztuje, więc jeden adres
// IP nie może otwierać sesji bez końca. Limit celowo luźny — klient potrafi
// rozłączyć się i zadzwonić ponownie kilka razy.
const RATE_LIMIT_MAX = 12;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const fresh = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  fresh.push(now);
  hits.set(ip, fresh);
  // Higiena mapy — bez tego rośnie w nieskończoność przy ruchu botów.
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= RATE_LIMIT_WINDOW_MS)) hits.delete(key);
    }
  }
  return fresh.length > RATE_LIMIT_MAX;
}

function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

async function resolveAgentId(surface: VoiceSurface): Promise<string | null> {
  if (surface === "missing_info") return MISSING_INFO_AGENT_ID || null;
  const { getAgentIdForSurface } = await import("@/lib/elevenlabs-agents.server");
  return getAgentIdForSurface("intake");
}

export const Route = createFileRoute("/api/public/voice-session")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),

      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as { surface?: string };
          const surface: VoiceSurface =
            body?.surface === "missing_info" ? "missing_info" : "intake";

          if (rateLimited(clientIp(request))) {
            return new Response(
              JSON.stringify({ ok: false, error: "Za dużo prób. Spróbuj za chwilę." }),
              { status: 429, headers: corsHeaders },
            );
          }

          const apiKey = process.env.ELEVENLABS_API_KEY;
          const agentId = await resolveAgentId(surface);
          if (!apiKey || !agentId) {
            return new Response(JSON.stringify({ ok: false, error: "voice_unavailable" }), {
              status: 503,
              headers: corsHeaders,
            });
          }

          const { getSignedUrl } = await import("@/lib/elevenlabs-text-turn.server");
          const signedUrl = await getSignedUrl(agentId, apiKey);
          if (!signedUrl) {
            return new Response(JSON.stringify({ ok: false, error: "voice_unavailable" }), {
              status: 503,
              headers: corsHeaders,
            });
          }

          return new Response(JSON.stringify({ ok: true, signedUrl }), {
            status: 200,
            headers: corsHeaders,
          });
        } catch (e) {
          console.error("[voice-session] error", e);
          return new Response(JSON.stringify({ ok: false, error: "voice_unavailable" }), {
            status: 500,
            headers: corsHeaders,
          });
        }
      },
    },
  },
});
