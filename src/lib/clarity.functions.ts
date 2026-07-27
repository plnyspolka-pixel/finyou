import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Clarity Data Export API
// Docs: https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-data-export-api
// Limit: do 10 wywołań / dzień / projekt. numOfDays: 1-3.
const CLARITY_ENDPOINT = "https://www.clarity.ms/export-data/api/v1-project-live-insights";

const DIMENSIONS = [
  "Browser",
  "Device",
  "OS",
  "Country",
  "Source",
  "Medium",
  "Campaign",
  "Channel",
  "URL",
] as const;

type Dim = (typeof DIMENSIONS)[number];

async function clarityCall(token: string, numOfDays: 1 | 2 | 3, dims: Dim[]): Promise<any> {
  const params = new URLSearchParams();
  params.set("numOfDays", String(numOfDays));
  dims.slice(0, 3).forEach((d, i) => params.set(`dimension${i + 1}`, d));
  const res = await fetch(`${CLARITY_ENDPOINT}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Clarity API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

export const fetchClarityMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        numOfDays: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(3),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const token = process.env.CLARITY_API_TOKEN;
    if (!token) throw new Error("CLARITY_API_TOKEN nie skonfigurowany");

    // Trzy zapytania pokrywające najważniejsze wymiary
    // (każde zapytanie liczy się do limitu 10/dzień).
    const [byUrl, byDeviceSource, byCountryBrowser] = await Promise.all([
      clarityCall(token, data.numOfDays, ["URL", "Device", "Source"]),
      clarityCall(token, data.numOfDays, ["Device", "Source", "Medium"]),
      clarityCall(token, data.numOfDays, ["Country", "Browser", "OS"]),
    ]);

    return {
      fetchedAt: new Date().toISOString(),
      numOfDays: data.numOfDays,
      byUrl,
      byDeviceSource,
      byCountryBrowser,
    };
  });

export const analyzeClarityMetrics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        metrics: z.any(),
        question: z.string().max(2000).optional().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY nie skonfigurowany");

    const system =
      "Jesteś analitykiem UX i konwersji. Analizujesz metryki Microsoft Clarity " +
      "dla strony Finance You (pożyczki pod zastaw + inwestowanie). " +
      "Odpowiadaj po polsku. Bądź konkretny: wskaż TOP 5 problemów UX/konwersji, " +
      "co dokładnie naprawić i gdzie (URL/strona), priorytety (P0/P1/P2). " +
      "Używaj liczb z danych. Bez ogólników. Format: krótkie sekcje + listy.";

    const userMsg = `Dane Clarity (JSON):\n\`\`\`json\n${JSON.stringify(data.metrics).slice(
      0,
      60000,
    )}\n\`\`\`\n\nPytanie/zadanie: ${
      data.question || "Przeanalizuj dane i podaj TOP 5 problemów UX + rekomendacje napraw."
    }`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMsg },
        ],
      }),
    });
    if (res.status === 429) throw new Error("Limit AI. Spróbuj za chwilę.");
    if (res.status === 402) throw new Error("Wyczerpany limit AI.");
    if (!res.ok) throw new Error(`AI gateway: ${res.status}`);
    const json: any = await res.json();
    return { text: (json?.choices?.[0]?.message?.content ?? "").trim() };
  });
