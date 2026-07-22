// Automatyczne wydobywanie danych z plików leada (OCR operatów, odpisów KW,
// zdjęć dokumentów przysyłanych przez Messengera/IG/e-mail) oraz uzupełnianie
// imienia i nazwiska leada właścicielem z działu II księgi wieczystej.
// Wołane z webhooka Messengera (best-effort, bez zlecania pobrania KW) oraz
// z backfillu (cron follow-up-tick i przycisk "Uzupełnij historię" — tam
// wolno też zlecić płatne pobranie KW z CMD).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";
import { maybePromoteLeadToApplication } from "@/lib/lead-enrichment.server";
import { extractKwOwnerPersons } from "@/lib/risk-assessment/kw-parser.server";
import {
  decodeMaybeBase64,
  fetchAndStoreKw,
  hasCmdConfig,
  normalizeKwNumber,
} from "@/lib/kw-fetch.server";

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";
const MAX_FILES_PER_RUN = 3;
const MAX_FILE_BYTES = 12 * 1024 * 1024;

// Tolerujemy separator także pomiędzy cyfrą wydziału a literą wydziału
// zamiejscowego ("KS1/J 00009044/5" ≡ "KS1J/00009044/5").
const KW_RE = /\b[A-Z]{2}\d[\s/\\.-]?[A-Z0-9][\s/\\.-]{0,3}\d{7,8}[\s/\\.-]{0,3}\d\b/g;


const OCR_SYSTEM_PROMPT =
  "Jesteś ekspertem OCR polskich dokumentów nieruchomościowych (operaty szacunkowe, odpisy KW, wypisy z rejestru gruntów, umowy). Odpowiadasz wyłącznie poprawnym JSON-em.";

const OCR_USER_PROMPT = `Odczytaj dokument i wyodrębnij dane. Interesują nas przede wszystkim: numery ksiąg wieczystych (format AA1A/00000000/0), imiona i nazwiska właścicieli nieruchomości, wartość z operatu, miejscowość.

ODPOWIEDŹ — wyłącznie poprawny JSON:
{
  "docKind": "operat|kw|wypis_rejestr_gruntow|umowa|zaswiadczenie|zdjecie_nieruchomosci|inne",
  "kwNumbers": ["AA1A/00000000/0", ...],
  "ownerNames": ["Imię Nazwisko", ...],
  "appraisedValuePln": <liczba lub null>,
  "city": "... lub null"
}
Imiona i nazwiska podawaj w kolejności "Imię Nazwisko". Jeśli czegoś nie ma w dokumencie, daj pustą listę / null.`;

export type LeadOcrResult = {
  processed: number;
  kwFound: number;
  nameFilled: boolean;
};

type OcrAttachment = { path: string; name?: string | null; mime?: string | null };

function isOcrCandidate(a: OcrAttachment): boolean {
  const n = `${a.name ?? a.path}`.toLowerCase();
  const m = (a.mime ?? "").toLowerCase();
  if (m.startsWith("image/") || m.includes("pdf")) return true;
  return /\.(jpe?g|png|webp|heic|heif|pdf)$/.test(n);
}

// EKW i operaty często zapisują nazwiska CAPS-em ("JAN KOWALSKI") — do bazy
// trafiają w formie "Jan Kowalski".
function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

function normalizeKwMatches(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.toUpperCase().matchAll(KW_RE)) {
    const compact = m[0].replace(/[^A-Z0-9]/g, "");
    const norm = normalizeKwNumber(compact);
    if (norm) out.add(`${norm.slice(0, 4)}/${norm.slice(4, 12)}/${norm.slice(12)}`);
  }
  return [...out];
}

function tryParseJson(s: string): any | null {
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

type OcrOneOutcome =
  | {
      status: "ok";
      kwNumbers: string[];
      ownerNames: string[];
      appraisedValuePln: number | null;
      city: string | null;
    }
  // skip = trwale nie do przetworzenia (brak pliku, za duży) — oznacz jako done;
  // retry = błąd przejściowy (sieć, 429/5xx gatewaya) — spróbujemy w backfillu.
  | { status: "skip" }
  | { status: "retry" };

async function ocrOneAttachment(att: OcrAttachment, apiKey: string): Promise<OcrOneOutcome> {
  const { data: signed, error } = await supabaseAdmin.storage
    .from(CLIENT_FILES_BUCKET)
    .createSignedUrl(att.path, 300);
  if (error || !signed?.signedUrl) return { status: "skip" };

  const res = await fetch(signed.signedUrl);
  if (!res.ok) return { status: "skip" };
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength === 0 || buf.byteLength > MAX_FILE_BYTES) return { status: "skip" };
  const ct = res.headers.get("content-type") ?? att.mime ?? "";
  const isPdf = ct.includes("pdf") || /\.pdf$/i.test(att.name ?? att.path);
  const mime = ct || (isPdf ? "application/pdf" : "image/jpeg");
  const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;

  const userContent: unknown[] = [{ type: "text", text: OCR_USER_PROMPT }];
  if (isPdf) {
    userContent.push({
      type: "file",
      file: { filename: att.name ?? "document.pdf", file_data: dataUrl },
    });
  } else {
    userContent.push({ type: "image_url", image_url: { url: dataUrl } });
  }

  const resp = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: OCR_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      temperature: 0,
    }),
  });
  if (resp.status === 429 || resp.status === 402 || resp.status >= 500) return { status: "retry" };
  if (!resp.ok) return { status: "skip" };
  const json: any = await resp.json();
  const content: string = json?.choices?.[0]?.message?.content ?? "";
  const parsed = tryParseJson(content);

  const kwNumbers = new Set<string>(normalizeKwMatches(content));
  const ownerNames: string[] = [];
  let appraisedValuePln: number | null = null;
  let city: string | null = null;
  if (parsed) {
    for (const k of Array.isArray(parsed.kwNumbers) ? parsed.kwNumbers : []) {
      for (const n of normalizeKwMatches(String(k))) kwNumbers.add(n);
    }
    for (const o of Array.isArray(parsed.ownerNames) ? parsed.ownerNames : []) {
      const name = String(o).trim();
      if (name.length >= 5 && name.length <= 60 && name.includes(" ")) ownerNames.push(name);
    }
    if (typeof parsed.appraisedValuePln === "number" && parsed.appraisedValuePln > 0) {
      appraisedValuePln = parsed.appraisedValuePln;
    }
    if (typeof parsed.city === "string" && parsed.city.trim()) city = parsed.city.trim();
  }
  return { status: "ok", kwNumbers: [...kwNumbers], ownerNames, appraisedValuePln, city };
}

/**
 * OCR-uje załączniki leada i uzupełnia leada wydobytymi danymi (numery KW,
 * imię/nazwisko właściciela, wartość nieruchomości, miasto). Przetworzone
 * ścieżki zapamiętuje w application_data.ocr_paths, żeby nie płacić za ten
 * sam plik dwa razy. Bez podanych attachments bierze nieprzetworzone
 * załączniki inbound z lead_communications.
 */
export async function ocrLeadAttachmentsAndEnrich(opts: {
  leadId: string;
  attachments?: OcrAttachment[];
}): Promise<LeadOcrResult> {
  const none: LeadOcrResult = { processed: 0, kwFound: 0, nameFilled: false };
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return none;

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, first_name, last_name, application_data")
    .eq("id", opts.leadId)
    .maybeSingle();
  if (!lead) return none;
  const appData = { ...((lead.application_data as Record<string, any>) ?? {}) };
  const donePaths = new Set<string>(Array.isArray(appData.ocr_paths) ? appData.ocr_paths : []);

  const candidates: OcrAttachment[] = [...(opts.attachments ?? [])];
  if (candidates.length === 0) {
    const { data: comms } = await supabaseAdmin
      .from("lead_communications")
      .select("attachments")
      .eq("lead_id", opts.leadId)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(50);
    for (const c of comms ?? []) {
      for (const a of (Array.isArray(c.attachments) ? c.attachments : []) as any[]) {
        if (a?.path) candidates.push({ path: a.path, name: a.name ?? null, mime: a.mime ?? null });
      }
    }
  }
  const toProcess = candidates
    .filter((a) => a.path && !donePaths.has(a.path) && isOcrCandidate(a))
    .slice(0, MAX_FILES_PER_RUN);
  if (toProcess.length === 0) return none;

  const kwNumbers = new Set<string>();
  const ownerNames: string[] = [];
  let appraisedValuePln: number | null = null;
  let city: string | null = null;
  let processed = 0;

  for (const att of toProcess) {
    try {
      const r = await ocrOneAttachment(att, apiKey);
      if (r.status === "retry") continue; // bez znacznika — ponowi backfill
      donePaths.add(att.path);
      if (r.status !== "ok") continue;
      processed += 1;
      for (const k of r.kwNumbers) kwNumbers.add(k);
      ownerNames.push(...r.ownerNames);
      if (r.appraisedValuePln && !appraisedValuePln) appraisedValuePln = r.appraisedValuePln;
      if (r.city && !city) city = r.city;
    } catch (e) {
      console.warn("[lead-ocr] attachment error", att.path, e);
    }
  }

  // Zapis do leada — tylko brakujące pola, jak w enrichLeadFromInbound.
  const existingKw: string[] = Array.isArray(appData.kw_numbers) ? [...appData.kw_numbers] : [];
  let kwAdded = 0;
  for (const k of kwNumbers) {
    if (!existingKw.includes(k)) {
      existingKw.push(k);
      kwAdded += 1;
    }
  }
  if (kwAdded > 0) appData.kw_numbers = existingKw;
  if (appraisedValuePln && !appData.property_value) appData.property_value = appraisedValuePln;
  if (city && !appData.city) appData.city = city;
  appData.ocr_paths = [...donePaths];
  appData.ocr_at = new Date().toISOString();

  const namePatch: Record<string, string> = {};
  let nameFilled = false;
  if ((!lead.first_name || !lead.last_name) && ownerNames.length > 0) {
    const parts = ownerNames[0].split(/\s+/).filter(Boolean);
    if (parts.length >= 2 && parts.length <= 3) {
      if (!lead.first_name) namePatch.first_name = titleCase(parts[0]);
      if (!lead.last_name) namePatch.last_name = titleCase(parts.slice(1).join(" "));
      nameFilled = Object.keys(namePatch).length > 0;
    }
  }

  await supabaseAdmin
    .from("leads")
    .update({ ...namePatch, application_data: appData as any })
    .eq("id", opts.leadId);

  // Komplet KW + kwota + załącznik mógł się właśnie domknąć.
  if (kwAdded > 0 || appraisedValuePln) {
    try {
      await maybePromoteLeadToApplication(opts.leadId);
    } catch (e) {
      console.warn("[lead-ocr] promote error", e);
    }
  }

  return { processed, kwFound: kwAdded, nameFilled };
}

/**
 * Uzupełnia brakujące imię/nazwisko leada właścicielem z działu II KW.
 * allowOrder=false (webhook): korzysta wyłącznie z cache kw_documents.
 * allowOrder=true (backfill/cron): przy braku treści zleca płatne pobranie
 * z CMD KW Engine (order → poll ~45 s → zapis do cache).
 */
export async function fillLeadNameFromKw(opts: {
  leadId: string;
  allowOrder: boolean;
}): Promise<boolean> {
  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, first_name, last_name, application_data")
    .eq("id", opts.leadId)
    .maybeSingle();
  if (!lead) return false;
  if (lead.first_name && lead.last_name) return false;

  const appData = { ...((lead.application_data as Record<string, any>) ?? {}) };
  const kwNumbers: string[] = Array.isArray(appData.kw_numbers) ? appData.kw_numbers : [];
  if (kwNumbers.length === 0) return false;

  for (const raw of kwNumbers.slice(0, 2)) {
    const kw = normalizeKwNumber(raw);
    if (!kw) continue;

    let { data: doc } = await supabaseAdmin
      .from("kw_documents")
      .select("status, dzial_2")
      .eq("kw_number", kw)
      .maybeSingle();

    if (
      doc?.status !== "ready" &&
      opts.allowOrder &&
      hasCmdConfig() &&
      doc?.status !== "not_found"
    ) {
      const out = await fetchAndStoreKw(kw);
      if (out.status === "ready") {
        ({ data: doc } = await supabaseAdmin
          .from("kw_documents")
          .select("status, dzial_2")
          .eq("kw_number", kw)
          .maybeSingle());
      } else if (!out.ok && out.status !== "processing") {
        console.warn("[lead-kw] fetch failed", kw, out.error);
      }
    }
    if (doc?.status !== "ready") continue;

    const persons = extractKwOwnerPersons(decodeMaybeBase64(doc.dzial_2));
    if (persons.length === 0) continue;

    const patch: Record<string, any> = {};
    if (!lead.first_name) patch.first_name = titleCase(persons[0].firstName);
    if (!lead.last_name) patch.last_name = titleCase(persons[0].lastName);
    // Wszyscy rozpoznani właściciele — do wglądu w panelu i dla bota.
    appData.kw_owners = persons.map((p) => `${titleCase(p.firstName)} ${titleCase(p.lastName)}`);
    patch.application_data = appData;
    await supabaseAdmin
      .from("leads")
      .update(patch as any)
      .eq("id", opts.leadId);
    return Object.keys(patch).length > 1;
  }
  return false;
}
