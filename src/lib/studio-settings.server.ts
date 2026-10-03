// Studio publikacji — ustawienia globalne (tabela `studio_settings`, klucz →
// wartość). Dziś jedno: model ElevenLabs lektora. Czyta je każdy tor
// generacji (panel, seria wsadowa, cron, MCP); zapisuje panel i MCP.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { DEFAULT_TTS_MODEL_ID, parseTtsModelId, type TtsModelId } from "./studio-tts-models";

export const STUDIO_SETTING_TTS_MODEL = "tts_model_id";

export async function getStudioSetting(key: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("studio_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) {
    // Brak tabeli / chwilowy błąd nie może zatrzymać generacji — wraca domyślne.
    console.warn(`[Studio] ustawienie ${key}: ${error.message}`);
    return null;
  }
  return data?.value ?? null;
}

export async function setStudioSetting(
  key: string,
  value: string,
  updatedBy?: string | null,
): Promise<void> {
  const { error } = await supabaseAdmin.from("studio_settings").upsert(
    {
      key,
      value,
      updated_by: updatedBy ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) throw new Error(`studio_settings: ${error.message}`);
}

/** Model lektora dla całego Studia; bez zapisu — najlepszy (`DEFAULT_TTS_MODEL_ID`). */
export async function getStudioTtsModelId(): Promise<TtsModelId> {
  return parseTtsModelId(await getStudioSetting(STUDIO_SETTING_TTS_MODEL), DEFAULT_TTS_MODEL_ID);
}

export async function setStudioTtsModelId(
  modelId: TtsModelId,
  updatedBy?: string | null,
): Promise<void> {
  await setStudioSetting(STUDIO_SETTING_TTS_MODEL, modelId, updatedBy);
}

/**
 * Model dla konkretnego zadania: nadpisanie z joba, a gdy go nie ma —
 * ustawienie Studia.
 */
export async function resolveJobTtsModelId(jobModel: unknown): Promise<TtsModelId> {
  return parseTtsModelId(jobModel, await getStudioTtsModelId());
}
