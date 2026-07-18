// Własny moduł ekstrakcji treści KW ze screenów (OCR) — alternatywa dla CMD
// KW Engine. Operator wgrywa zrzuty ekranu (lub PDF) przeglądarki EKW, Gemini
// odczytuje treść działów, a wynik zapisujemy w kw_documents w DOKŁADNIE tej
// samej strukturze co pobranie z CMD (HTML per dział, status "ready").
// Dzięki temu parsery analizy ryzyka, parser adresu i podgląd treści KW
// działają bez żadnych zmian.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeKwNumber } from "@/lib/kw-fetch.server";
import { renderKwSections, type KwExtraction } from "@/lib/kw-render";

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-pro";
const STRUCTURE_MODEL = "openai/gpt-5.5";

const MAX_FILES = 12;
const MAX_FILE_B64 = 9_000_000; // ~6,5 MB pliku
const MAX_TOTAL_B64 = 40_000_000;

const SYSTEM_PROMPT =
  "Jesteś ekspertem OCR polskich ksiąg wieczystych (EKW). Przepisujesz treść DOSŁOWNIE — niczego nie zgadujesz " +
  "ani nie uzupełniasz. Pole, którego nie widać na obrazach, zwracasz jako null. Odpowiadasz WYŁĄCZNIE poprawnym JSON-em.";

const TRANSCRIBE_SYSTEM_PROMPT =
  "Jesteś ekspertem OCR polskich ksiąg wieczystych (EKW). Twoim jedynym zadaniem jest DOSŁOWNE przepisanie tekstu " +
  "widocznego na obrazach — bez interpretacji, bez zgadywania, bez pomijania. Zachowujesz układ sekcji i wersaliki.";

const TRANSCRIBE_USER_PROMPT = `Na obrazach są zrzuty ekranu treści księgi wieczystej z przeglądarki EKW (ekw.ms.gov.pl) — okładka i/lub działy I-O, I-Sp, II, III, IV, w dowolnej kolejności, także we fragmentach.

Przepisz DOSŁOWNIE cały widoczny tekst ze wszystkich obrazów. Zasady:
- Rozdziel sekcje nagłówkami typu "=== OKŁADKA ===", "=== DZIAŁ I-O ===", "=== DZIAŁ I-SP ===", "=== DZIAŁ II ===", "=== DZIAŁ III ===", "=== DZIAŁ IV ===" — tak jak wynika to z obrazów.
- Zachowaj tabele w formie tekstowej (rubryki / wartości linia po linii).
- Nie tłumacz, nie skracaj, nie zgaduj brakujących liter — nieczytelne fragmenty zaznacz jako [nieczytelne].
- Nie zwracaj JSON-a, nie dodawaj komentarzy — tylko surowa treść KW.`;

const USER_PROMPT = `Poniżej masz DOSŁOWNĄ transkrypcję treści księgi wieczystej (może obejmować okładkę i działy I-O, I-Sp, II, III, IV — w dowolnej kolejności, także we fragmentach). Twoim zadaniem jest wyłącznie uporządkować te dane w JSON — niczego nie dopisuj i nie zgaduj. Zwróć JEDEN JSON:

{
  "kwNumber": "numer KW w formacie AA1A/00000000/0 lub null",
  "sadRejonowy": "... lub null",
  "typKsiegi": "... lub null",
  "dzial1o": {
    "wojewodztwo": "...", "powiat": "...", "gmina": "...", "miejscowosc": "...",
    "ulica": "... lub null", "numerBudynku": "... lub null", "numerLokalu": "... lub null",
    "przeznaczenie": "... lub null", "obszar": "np. 45,5000 M2 albo 0,0450 HA — dosłownie, lub null",
    "kondygnacja": <liczba lub null>, "liczbaKondygnacji": <liczba lub null>,
    "dzialki": [{"numer": "...", "obreb": "...", "polozenie": "...", "sposobKorzystania": "np. R IVa"}],
    "inne": ["inne istotne informacje z działu I-O"]
  },
  "dzial1sp": {"wpisy": ["treść wpisów działu I-Sp"]},
  "dzial2": {"wlasciciele": [
    {"imiePierwsze": "...", "imieDrugie": "... lub null", "nazwisko": "...", "imieOjca": "... lub null", "imieMatki": "... lub null", "pesel": "11 cyfr lub null", "udzial": "np. 1/1 lub null"},
    {"nazwa": "nazwa osoby prawnej/instytucji", "siedziba": "...", "regon": "...", "udzial": "..."}
  ]},
  "dzial3": {"brakWpisu": <true gdy dział pusty>, "wpisy": [{"rodzaj": "np. OSTRZEŻENIE / SŁUŻEBNOŚĆ / ROSZCZENIE", "tresc": "pełna treść wpisu"}]},
  "dzial4": {"brakWpisu": <true gdy dział pusty>, "hipoteki": [{"numer": "...", "rodzaj": "np. HIPOTEKA UMOWNA", "sumaKwota": <liczba, np. 300000.00>, "walutaSumy": "ZŁ/EUR/CHF/USD", "wierzyciel": "nazwa wierzyciela hipotecznego", "tresc": "pełna treść wpisu"}]},
  "uwagi": ["zastrzeżenia OCR: nieczytelne fragmenty, ucięte sekcje itp."]
}

ZASADY:
- Cały dział nieobecny w transkrypcji → null (NIE {"brakWpisu": true} — to oznacza dział widoczny i pusty).
- "brakWpisu": true tylko, gdy w transkrypcji wyraźnie widać pusty dział (np. "BRAK WPISU").
- Kwoty hipotek jako liczby (300000.00), waluta osobno.
- Nazwiska i nazwy przepisuj dokładnie tak jak w transkrypcji.

=== TRANSKRYPCJA ===
{{TRANSCRIPT}}`;


const ImageSchema = z.object({
  dataUrl: z.string().min(50).max(MAX_FILE_B64),
  mimeType: z.string().min(3).max(100),
  fileName: z.string().max(200).optional(),
});

function tryParseJson(s: string): KwExtraction | null {
  if (!s) return null;
  // Strip ```json fences if present.
  let text = s.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(text) as KwExtraction;
  } catch {}
  // Fallback: grab widest {...} block.
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last <= first) return null;
  try {
    return JSON.parse(text.slice(first, last + 1)) as KwExtraction;
  } catch {
    return null;
  }
}

async function assertAdmin(userId: string) {
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const allowed = (roles ?? []).some((r) => r.role === "administrator");
  if (!allowed) throw new Error("Brak uprawnień (wymagana rola administrator).");
}

export const importKwFromScreenshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        loanApplicationId: z.string().uuid().optional(),
        /** Numer KW podany ręcznie — nadpisuje odczyt OCR z okładki. */
        kwNumber: z.string().max(20).optional(),
        images: z.array(ImageSchema).min(1).max(MAX_FILES),
        /** Pozwala nadpisać treść KW pobraną wcześniej (np. z CMD). */
        force: z.boolean().optional(),
        /** Tryb debug — nie zapisuje do bazy, zwraca transkrypcję i surowy JSON z modelu. */
        dryRun: z.boolean().optional(),
        /** Dołącz transkrypcję i surowy JSON do odpowiedzi (także przy zapisie). */
        includeDebug: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Brak konfiguracji AI (LOVABLE_API_KEY).");

    const totalSize = data.images.reduce((acc, i) => acc + i.dataUrl.length, 0);
    if (totalSize > MAX_TOTAL_B64) throw new Error("Łączny rozmiar plików przekracza limit — wgraj mniej/mniejsze screeny.");

    // 1a) Transkrypcja — surowy OCR wszystkich obrazów (bez struktury).
    const transcribeContent: unknown[] = [{ type: "text", text: TRANSCRIBE_USER_PROMPT }];
    for (const img of data.images) {
      if (img.mimeType === "application/pdf" || /\.pdf$/i.test(img.fileName ?? "")) {
        transcribeContent.push({ type: "file", file: { filename: img.fileName ?? "kw.pdf", file_data: img.dataUrl } });
      } else if (img.mimeType.startsWith("image/")) {
        transcribeContent.push({ type: "image_url", image_url: { url: img.dataUrl } });
      } else {
        throw new Error(`Nieobsługiwany typ pliku: ${img.mimeType} (dozwolone: obrazy i PDF).`);
      }
    }

    async function runTranscribe(model: string) {
      const r = await fetch(AI_GATEWAY, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: TRANSCRIBE_SYSTEM_PROMPT },
            { role: "user", content: transcribeContent },
          ],
          max_tokens: 8000,
        }),
      });
      if (r.status === 429) throw new Error("Limit zapytań AI chwilowo wyczerpany — spróbuj za chwilę.");
      if (r.status === 402) throw new Error("Wyczerpany budżet AI (Lovable) — doładuj konto.");
      if (!r.ok) {
        const body = await r.text().catch(() => "");
        console.error("KW OCR transcribe HTTP error", { model, status: r.status, body: body.slice(0, 500) });
        throw new Error(`Błąd OCR — transkrypcja (HTTP ${r.status}): ${body.slice(0, 200)}`);
      }
      const j: any = await r.json();
      const content: string = (j?.choices?.[0]?.message?.content ?? "").trim();
      const finish = j?.choices?.[0]?.finish_reason;
      console.log("KW OCR transcribe result", { model, len: content.length, finish });
      return content;
    }

    let transcript = await runTranscribe(MODEL);
    if (!transcript || transcript.length < 40) {
      console.warn("KW OCR: pusta transkrypcja z", MODEL, "— fallback na openai/gpt-5.5");
      transcript = await runTranscribe("openai/gpt-5.5");
    }
    if (!transcript || transcript.length < 40) {
      throw new Error("OCR nie odczytał tekstu ze screenów — sprawdź, czy obrazy są czytelne.");
    }


    // 1b) Strukturyzacja — mapowanie transkrypcji do JSON-a KW.
    const resp = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: STRUCTURE_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: USER_PROMPT.replace("{{TRANSCRIPT}}", transcript) },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (resp.status === 429) throw new Error("Limit zapytań AI chwilowo wyczerpany — spróbuj za chwilę.");
    if (resp.status === 402) throw new Error("Wyczerpany budżet AI (Lovable) — doładuj konto.");
    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      console.error("KW OCR structuring HTTP error", { status: resp.status, body: errBody.slice(0, 800), model: STRUCTURE_MODEL });
      throw new Error(`Błąd OCR — strukturyzacja (HTTP ${resp.status}): ${errBody.slice(0, 200)}`);
    }

    const json: any = await resp.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "";
    const extraction = tryParseJson(content);

    // Debug/dry-run: zwróć transkrypcję i surowy JSON, nie zapisuj do bazy.
    if (data.dryRun) {
      return {
        ok: true as const,
        dryRun: true as const,
        debug: {
          transcript,
          rawJson: content,
          parsed: extraction ?? null,
          imagesMeta: data.images.map((i) => ({
            fileName: i.fileName ?? null,
            mimeType: i.mimeType,
            sizeBytes: i.dataUrl.length,
          })),
        },
      };
    }

    if (!extraction) {
      console.error("KW OCR: nie sparsowano odpowiedzi modelu", {
        model: MODEL,
        preview: content.slice(0, 500),
        transcriptPreview: transcript.slice(0, 500),
      });
      throw new Error("OCR nie zwrócił poprawnej struktury danych — spróbuj z wyraźniejszymi screenami.");
    }
    const rawStructuredJson = content;


    // 2) Numer KW: ręczny > OCR > numer z nieruchomości wniosku.
    const warnings: string[] = [];
    let kw = data.kwNumber ? normalizeKwNumber(data.kwNumber) : null;
    const ocrKw = extraction.kwNumber ? normalizeKwNumber(extraction.kwNumber) : null;
    if (!kw) kw = ocrKw;
    else if (ocrKw && ocrKw !== kw) {
      warnings.push(`Numer KW odczytany ze screenów (${ocrKw}) różni się od podanego (${kw}) — zapisano pod podanym numerem.`);
    }
    let propertyId: string | null = null;
    if (data.loanApplicationId) {
      const { data: prop } = await supabaseAdmin
        .from("properties")
        .select("id, land_register_number")
        .eq("loan_application_id", data.loanApplicationId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      propertyId = prop?.id ?? null;
      const propKw = prop?.land_register_number ? normalizeKwNumber(prop.land_register_number) : null;
      if (!kw) kw = propKw;
      else if (propKw && propKw !== kw) {
        warnings.push(`Numer KW z importu (${kw}) różni się od numeru na nieruchomości wniosku (${propKw}).`);
      }
    }
    if (!kw) {
      throw new Error("Nie udało się ustalić numeru KW (nieczytelny na screenach) — podaj numer ręcznie.");
    }

    // 3) Render sekcji w formacie kw_documents (identycznym jak z CMD).
    const sections = renderKwSections(extraction, { importedAt: new Date().toLocaleString("pl-PL") });
    warnings.push(...sections.warnings);
    if (!sections.dzial_1o && !sections.dzial_2 && !sections.dzial_3 && !sections.dzial_4) {
      throw new Error("Na screenach nie rozpoznano żadnego działu KW — upewnij się, że to treść księgi z EKW.");
    }

    // 4) Zapis — nie nadpisujemy po cichu treści pobranej wcześniej (np. z EKW).
    const { data: existing } = await supabaseAdmin
      .from("kw_documents")
      .select("status")
      .eq("kw_number", kw)
      .maybeSingle();
    if (existing?.status === "ready" && !data.force) {
      return {
        ok: false as const,
        needsForce: true as const,
        kwNumber: kw,
        message: "Treść tej KW jest już zapisana. Wgraj ponownie z opcją nadpisania, jeśli chcesz ją zastąpić danymi z OCR.",
      };
    }
    const { error: upsertError } = await supabaseAdmin.from("kw_documents").upsert(
      {
        kw_number: kw,
        status: "ready",
        okladka: sections.okladka,
        dzial_1o: sections.dzial_1o,
        dzial_1s: sections.dzial_1s,
        dzial_2: sections.dzial_2,
        dzial_3: sections.dzial_3,
        dzial_4: sections.dzial_4,
        fetched_at: new Date().toISOString(),
        ordered_at: new Date().toISOString(),
        ordered_by: context.userId,
        last_error: null,
      },
      { onConflict: "kw_number" },
    );
    if (upsertError) throw new Error(`Nie udało się zapisać treści KW: ${upsertError.message}`);

    // 5) Uzupełnij numer KW na nieruchomości wniosku, jeśli go brakowało.
    if (propertyId) {
      const { data: prop } = await supabaseAdmin.from("properties").select("land_register_number").eq("id", propertyId).maybeSingle();
      if (prop && !prop.land_register_number) {
        await supabaseAdmin.from("properties").update({ land_register_number: kw }).eq("id", propertyId);
        warnings.push("Numer KW z importu zapisano na nieruchomości wniosku.");
      }
    }

    // 6) Podgląd przez te same parsery, które konsumują treść z CMD —
    //    natychmiastowa walidacja, że import „czyta się" poprawnie.
    const { analyzeKwLegal } = await import("@/lib/risk-assessment/kw-parser.server");
    const kwLegal = await analyzeKwLegal({ kwNumber: kw });

    return {
      ok: true as const,
      needsForce: false as const,
      kwNumber: kw,
      imported: {
        okladka: true,
        dzial_1o: !!sections.dzial_1o,
        dzial_1s: !!sections.dzial_1s,
        dzial_2: !!sections.dzial_2,
        dzial_3: !!sections.dzial_3,
        dzial_4: !!sections.dzial_4,
      },
      warnings,
      summary: kwLegal.summary,
      owners: kwLegal.owners,
      mortgages: kwLegal.mortgages.length,
      totalMortgageAmountPln: kwLegal.totalMortgageAmountPln,
      address: kwLegal.address?.fullAddress ?? null,
      debug: data.includeDebug ? { transcript, rawJson: rawStructuredJson } : undefined,
    };
  });
