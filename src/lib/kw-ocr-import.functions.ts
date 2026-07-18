// Własny moduł ekstrakcji treści KW ze screenów (OCR) — alternatywa dla CMD
// KW Engine. Operator wgrywa zrzuty ekranu (lub PDF) przeglądarki EKW, Gemini
// robi DOSŁOWNĄ transkrypcję treści i zapisujemy ją bez pośredniego JSON-a
// w kw_documents (per dział, jako <pre>). Podgląd treści KW w UI działa
// bez zmian; parsery strukturalne (adres/analiza ryzyka) na takim wejściu
// nie działają — świadomy wybór, aby uniknąć fałszywej strukturyzacji.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizeKwNumber } from "@/lib/kw-fetch.server";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-pro";

const MAX_FILES = 12;
const MAX_FILE_B64 = 9_000_000;
const MAX_TOTAL_B64 = 40_000_000;

const TRANSCRIBE_SYSTEM_PROMPT =
  "Jesteś ekspertem OCR polskich ksiąg wieczystych (EKW). Twoim jedynym zadaniem jest DOSŁOWNE przepisanie tekstu " +
  "widocznego na obrazach — bez interpretacji, bez zgadywania, bez pomijania. Zachowujesz układ sekcji i wersaliki.";

const TRANSCRIBE_USER_PROMPT = `Na obrazach są zrzuty ekranu treści księgi wieczystej z przeglądarki EKW (ekw.ms.gov.pl) — okładka i/lub działy I-O, I-Sp, II, III, IV, w dowolnej kolejności, także we fragmentach.

Przepisz DOSŁOWNIE cały widoczny tekst ze wszystkich obrazów. Zasady:
- Rozdziel sekcje nagłówkami DOKŁADNIE w formacie: "=== OKŁADKA ===", "=== DZIAŁ I-O ===", "=== DZIAŁ I-SP ===", "=== DZIAŁ II ===", "=== DZIAŁ III ===", "=== DZIAŁ IV ===" — tak jak wynika to z obrazów.
- Zachowaj tabele w formie tekstowej (rubryki / wartości linia po linii).
- Nie tłumacz, nie skracaj, nie zgaduj brakujących liter — nieczytelne fragmenty zaznacz jako [nieczytelne].
- Nie zwracaj JSON-a, nie dodawaj komentarzy — tylko surowa treść KW.`;

const ImageSchema = z.object({
  dataUrl: z.string().min(50).max(MAX_FILE_B64),
  mimeType: z.string().min(3).max(100),
  fileName: z.string().max(200).optional(),
});

async function assertAdmin(userId: string) {
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const allowed = (roles ?? []).some((r) => r.role === "administrator");
  if (!allowed) throw new Error("Brak uprawnień (wymagana rola administrator).");
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrapSection(title: string, body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";
  return `<div class="kw-ocr-section"><h3>${escapeHtml(title)}</h3><pre style="white-space:pre-wrap;font-family:ui-monospace,monospace;font-size:12px;line-height:1.5">${escapeHtml(trimmed)}</pre></div>`;
}

/** Rozbija transkrypcję na sekcje po nagłówkach `=== ... ===`. */
function splitTranscript(transcript: string): {
  okladka: string | null;
  dzial_1o: string | null;
  dzial_1s: string | null;
  dzial_2: string | null;
  dzial_3: string | null;
  dzial_4: string | null;
} {
  const buckets: Record<string, string[]> = {
    okladka: [],
    dzial_1o: [],
    dzial_1s: [],
    dzial_2: [],
    dzial_3: [],
    dzial_4: [],
  };
  let current: keyof typeof buckets | null = null;
  const headerRe = /^===\s*(.+?)\s*===\s*$/i;
  for (const line of transcript.split(/\r?\n/)) {
    const m = line.match(headerRe);
    if (m) {
      const h = m[1].toUpperCase().replace(/\s+/g, " ");
      if (h.includes("OKŁAD") || h.includes("OKLAD")) current = "okladka";
      else if (h.includes("I-O") || h.includes("I O")) current = "dzial_1o";
      else if (h.includes("I-SP") || h.includes("I SP")) current = "dzial_1s";
      else if (/DZIA[ŁL]\s*II\b|=\s*II\s*=/.test(h) || h.endsWith(" II")) current = "dzial_2";
      else if (/DZIA[ŁL]\s*III\b|=\s*III\s*=/.test(h) || h.endsWith(" III")) current = "dzial_3";
      else if (/DZIA[ŁL]\s*IV\b|=\s*IV\s*=/.test(h) || h.endsWith(" IV")) current = "dzial_4";
      else current = null;
      continue;
    }
    if (current) buckets[current].push(line);
  }
  const anyContent = Object.values(buckets).some((b) => b.join("").trim().length > 0);
  if (!anyContent) {
    // Brak nagłówków — wrzuć wszystko do okładki, żeby operator miał podgląd.
    buckets.okladka = [transcript];
  }
  const pick = (k: keyof typeof buckets) => {
    const s = buckets[k].join("\n").trim();
    return s ? wrapSection(k === "okladka" ? "OKŁADKA" : k.replace("dzial_", "Dział ").toUpperCase(), s) : null;
  };
  return {
    okladka: pick("okladka") || wrapSection("OKŁADKA", "(brak treści okładki na screenach)"),
    dzial_1o: pick("dzial_1o"),
    dzial_1s: pick("dzial_1s"),
    dzial_2: pick("dzial_2"),
    dzial_3: pick("dzial_3"),
    dzial_4: pick("dzial_4"),
  };
}

function extractKwNumberFromText(t: string): string | null {
  const m = t.match(/\b([A-Z]{2}\d[A-Z])\s*\/?\s*(\d{8})\s*\/?\s*(\d)\b/i);
  if (!m) return null;
  return normalizeKwNumber(`${m[1]}/${m[2]}/${m[3]}`);
}

export const importKwFromScreenshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        loanApplicationId: z.string().uuid().optional(),
        kwNumber: z.string().max(20).optional(),
        images: z.array(ImageSchema).min(1).max(MAX_FILES),
        force: z.boolean().optional(),
        dryRun: z.boolean().optional(),
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
      console.log("KW OCR transcribe result", { model, len: content.length, finish: j?.choices?.[0]?.finish_reason });
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

    if (data.dryRun) {
      return {
        ok: true as const,
        dryRun: true as const,
        debug: {
          transcript,
          imagesMeta: data.images.map((i) => ({
            fileName: i.fileName ?? null,
            mimeType: i.mimeType,
            sizeBytes: i.dataUrl.length,
          })),
        },
      };
    }

    const warnings: string[] = [];
    let kw = data.kwNumber ? normalizeKwNumber(data.kwNumber) : null;
    const ocrKw = extractKwNumberFromText(transcript);
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

    const sections = splitTranscript(transcript);

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

    if (propertyId) {
      const { data: prop } = await supabaseAdmin.from("properties").select("land_register_number").eq("id", propertyId).maybeSingle();
      if (prop && !prop.land_register_number) {
        await supabaseAdmin.from("properties").update({ land_register_number: kw }).eq("id", propertyId);
        warnings.push("Numer KW z importu zapisano na nieruchomości wniosku.");
      }
    }

    return {
      ok: true as const,
      needsForce: false as const,
      kwNumber: kw,
      imported: {
        okladka: !!sections.okladka,
        dzial_1o: !!sections.dzial_1o,
        dzial_1s: !!sections.dzial_1s,
        dzial_2: !!sections.dzial_2,
        dzial_3: !!sections.dzial_3,
        dzial_4: !!sections.dzial_4,
      },
      warnings,
      debug: data.includeDebug ? { transcript } : undefined,
    };
  });
