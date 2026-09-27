// Studio publikacji — stały zestaw domyślnych awatarów.
//
// Zestaw ustawia przycisk w panelu (tabela `studio_default_avatars`), a czyta
// go każdy tor generacji: pojedyncze wideo, seria wsadowa i cron. Kolejność
// (`position`) to rotacja a-rolli — pierwszy awatar mówi hook, kolejni
// przejmują następne ujęcia („a-roll z innego awatara").

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function getDefaultAvatarIds(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("studio_default_avatars")
    .select("avatar_id")
    .order("position", { ascending: true });
  if (error) {
    // Brak zestawu nie może blokować generacji — rolka wyjdzie na jednej twarzy.
    console.warn(`[Studio] domyślne awatary: ${error.message}`);
    return [];
  }
  return (data ?? []).map((r) => r.avatar_id).filter(Boolean);
}

/**
 * Rotacja dla joba: to, co zapisano przy jobie, a gdy pusto — aktualny zestaw
 * domyślnych. Dzięki temu joby z kolejki (cron) też dostają pełną rotację.
 */
export async function resolveAvatarRotation(
  stored: string[] | null | undefined,
): Promise<string[]> {
  const fromJob = (stored ?? []).filter(Boolean);
  if (fromJob.length) return fromJob;
  return await getDefaultAvatarIds();
}
