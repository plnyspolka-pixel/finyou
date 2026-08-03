// ════════════════════════════════════════════════════════════════════
// GENERATOR UMOWY POŻYCZKI ze wzoru DOCX (Handlebars) + asystent Gemini Pro
//
// Wzór `wzor-umowy.docx` jest zasilany danymi (pola/flagi/harmonogram), z pełnym
// zachowaniem formatowania Worda. Asystent AI pomaga budować umowę: zadaje
// pytania i uzupełnia pola oraz klauzule (flagi {{#if}}) na podstawie odpowiedzi.
// ════════════════════════════════════════════════════════════════════

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";
import { renderujXml, renderujTekst, GRUPY_POL, FLAGI, type WzorData } from "@/lib/umowa-hb/render";
import { WZOR_UMOWY_DOCX_B64 } from "@/lib/umowa-hb/wzor-docx.b64";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const GEMINI_PRO = "google/gemini-2.5-pro";

type ChatMsg = { role: "user" | "assistant"; content: string };

function normalizujDane(d: any): WzorData {
  return {
    pola: (d?.pola ?? {}) as Record<string, string>,
    flagi: (d?.flagi ?? {}) as Record<string, boolean>,
    raty: Array.isArray(d?.raty) ? d.raty : [],
  };
}

async function wczytajWzorXml(): Promise<{ zip: any; xml: string }> {
  // pizzip przyjmuje base64 wprost — bez ręcznego dekodowania.
  const { default: PizZip } = await import("pizzip");
  const zip = new PizZip(WZOR_UMOWY_DOCX_B64, { base64: true });
  const xml = zip.file("word/document.xml")?.asText() ?? "";
  return { zip, xml };
}

// ── Podgląd tekstowy ─────────────────────────────────────────────────
export const previewUmowaHb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { data: WzorData }) => d)
  .handler(async ({ data }) => {
    const { xml } = await wczytajWzorXml();
    const text = renderujTekst(xml, normalizujDane(data.data));
    return { text };
  });

// ── Generacja pliku .docx ────────────────────────────────────────────
export const generateUmowaHb = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { data: WzorData; nazwa?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { zip, xml } = await wczytajWzorXml();
    const rendered = renderujXml(xml, normalizujDane(data.data));
    zip.file("word/document.xml", rendered);
    const bytes: Uint8Array = zip.generate({ type: "uint8array", compression: "DEFLATE" });

    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const safe = (data.nazwa || "umowa-pozyczki").replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 60);
    const outPath = `generated/${userId}/${ts}_${safe}.docx`;

    const { error: upErr } = await supabase.storage.from(CLIENT_FILES_BUCKET).upload(
      outPath,
      new Blob([new Uint8Array(bytes)], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
      { upsert: false },
    );
    if (upErr) throw new Error(`Upload DOCX: ${upErr.message}`);

    try {
      await supabase.from("generated_documents").insert({
        template_name: "Umowa pożyczki (wzór DOCX)",
        form_data: (data.data ?? {}) as any,
        docx_path: outPath,
        file_size_bytes: bytes.length,
        created_by: userId,
      });
    } catch {
      /* rejestracja pomocnicza — pomijalna */
    }

    const { data: signed } = await supabase.storage
      .from(CLIENT_FILES_BUCKET)
      .createSignedUrl(outPath, 3600);
    return { docxPath: outPath, signedUrl: signed?.signedUrl ?? null };
  });

// ── Asystent Gemini Pro ──────────────────────────────────────────────
export interface HbAssistantResult {
  reply: string;
  pola: Record<string, string>;
  flagi: Record<string, boolean>;
  missing: string[];
}

export const umowaHbAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { messages: ChatMsg[]; data: WzorData }) => d)
  .handler(async ({ data }): Promise<HbAssistantResult> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY nie skonfigurowany");

    const dane = normalizujDane(data.data);
    const katalog = GRUPY_POL.map(
      (g) =>
        `${g.grupa}${g.flaga ? ` [tylko gdy flaga ${g.flaga}]` : ""}: ` +
        g.pola.map((p) => `${p.key} (${p.label})`).join(", "),
    ).join("\n");
    const flagi = FLAGI.map((f) => `${f.key} (${f.label})`).join(", ");

    const system =
      "Jesteś asystentem prawnym Finance You. Pomagasz zbudować UMOWĘ POŻYCZKI pieniężnej (B2B) " +
      "ze wzoru, zadając pytania i uzupełniając POLA oraz KLAUZULE (flagi) na podstawie odpowiedzi.\n\n" +
      "ZASADY:\n" +
      "1. Używaj WYŁĄCZNIE informacji podanych przez operatora. NIGDY nie wymyślaj PESEL, NIP, KRS, KW, " +
      "kwot ani dat — czego nie podano, zostaw puste i dopytaj.\n" +
      "2. Kwoty po polsku z „ zł” (np. „100 000,00 zł”); przy kwotach dużych uzupełnij też pole *_slownie. " +
      "Daty w formacie DD.MM.RRRR.\n" +
      "3. Flagi (klauzule opcjonalne) ustawiaj na podstawie sytuacji: " +
      flagi +
      ".\n" +
      "4. W `reply` odpisz zwięźle po polsku: potwierdź, co uzupełniłeś, i zadaj JEDNO najważniejsze pytanie " +
      "o brakujące dane. W `missing` wypisz kluczowe braki (klucze pól).\n\n" +
      "POLA WZORU:\n" +
      katalog +
      "\n\nZwróć WYŁĄCZNIE JSON:\n" +
      '{ "reply": "…", "pola": { "<klucz>": "<wartość>" }, "flagi": { "<flaga>": true }, "missing": ["<klucz>"] }';

    const stan =
      "AKTUALNE DANE (JSON):\n" +
      JSON.stringify({ pola: dane.pola, flagi: dane.flagi }, null, 0).slice(0, 6000);

    const history = (data.messages ?? []).filter((m) => m && m.content && m.content.trim());
    const messages = [
      { role: "system", content: system },
      { role: "user", content: stan },
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ];

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: GEMINI_PRO, messages, response_format: { type: "json_object" } }),
    });
    if (res.status === 429) throw new Error("Zbyt wiele zapytań do AI. Spróbuj za chwilę.");
    if (res.status === 402) throw new Error("Wyczerpany limit AI. Doładuj środki w Lovable Cloud.");
    if (!res.ok) throw new Error(`AI gateway: ${res.status} ${await res.text().catch(() => "")}`);

    const json: any = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }

    const pola: Record<string, string> = {};
    if (parsed.pola && typeof parsed.pola === "object") {
      for (const [k, v] of Object.entries(parsed.pola)) {
        if (v != null && String(v).trim()) pola[String(k)] = String(v).trim();
      }
    }
    const flagiOut: Record<string, boolean> = {};
    if (parsed.flagi && typeof parsed.flagi === "object") {
      for (const [k, v] of Object.entries(parsed.flagi)) flagiOut[String(k)] = v === true;
    }
    return {
      reply: typeof parsed.reply === "string" ? parsed.reply : "Zaktualizowałem dane umowy.",
      pola,
      flagi: flagiOut,
      missing: Array.isArray(parsed.missing) ? parsed.missing.map(String).slice(0, 10) : [],
    };
  });
