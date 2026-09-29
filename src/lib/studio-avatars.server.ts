// Studio publikacji — stały zestaw domyślnych awatarów.
//
// Zestaw ustawia przycisk w panelu (tabela `studio_default_avatars`), a czyta
// go każdy tor generacji: pojedyncze wideo, seria wsadowa, cron i narzędzia
// MCP. Kolejność (`position`) to rotacja a-rolli — pierwszy awatar mówi hook,
// kolejni przejmują następne ujęcia („a-roll z innego awatara").

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { HeygenCatalogItem } from "./heygen-catalog.server";

export type StudioDefaultAvatar = {
  avatar_id: string;
  name: string;
  preview: string | null;
  kind: "avatar" | "talking_photo";
  /** Miejsce w rotacji (rosnąco); pierwszy prowadzi rolkę. */
  position: number;
};

/** Cały zestaw w kolejności rotacji — dokładnie to, co zapisał panel. */
export async function listDefaultAvatars(): Promise<StudioDefaultAvatar[]> {
  const { data, error } = await supabaseAdmin
    .from("studio_default_avatars")
    .select("avatar_id, name, preview, kind, position")
    .order("position", { ascending: true });
  if (error) {
    // Brak zestawu nie może blokować generacji — rolka wyjdzie na jednej twarzy.
    console.warn(`[Studio] domyślne awatary: ${error.message}`);
    return [];
  }
  return (data ?? [])
    .filter((r) => Boolean(r.avatar_id))
    .map((r) => ({
      avatar_id: r.avatar_id,
      name: r.name ?? "",
      preview: r.preview ?? null,
      kind: r.kind === "talking_photo" ? "talking_photo" : "avatar",
      position: r.position ?? 0,
    }));
}

export async function getDefaultAvatarIds(): Promise<string[]> {
  return (await listDefaultAvatars()).map((a) => a.avatar_id);
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

export type CatalogAvatarWithDefault = HeygenCatalogItem & {
  /** Czy należy do zestawu domyślnych z panelu. */
  is_default: boolean;
  /** Miejsce w rotacji od 1 (1 = prowadzi rolkę, mówi hook); null poza zestawem. */
  default_position: number | null;
};

/**
 * Nakłada zestaw domyślnych na katalog HeyGen: oznacza awatary z zestawu
 * i wystawia je na początek listy w kolejności rotacji (reszta w kolejności
 * katalogu). Awatar z zestawu, którego katalog akurat nie zwrócił (awaria
 * API, publiczny spoza limitu), wchodzi z danych zapisanych w panelu — zestaw
 * ma być widoczny zawsze, żeby nikt nie zgadywał domyślnych po nazwie.
 */
export function markDefaultAvatars(
  catalog: HeygenCatalogItem[],
  defaults: StudioDefaultAvatar[],
): CatalogAvatarWithDefault[] {
  const rank = new Map<string, number>();
  for (const d of defaults) {
    if (d.avatar_id && !rank.has(d.avatar_id)) rank.set(d.avatar_id, rank.size + 1);
  }
  const seen = new Set(catalog.map((c) => c.id));
  const fromPanel: HeygenCatalogItem[] = [];
  for (const d of defaults) {
    if (!rank.has(d.avatar_id) || seen.has(d.avatar_id)) continue;
    seen.add(d.avatar_id);
    fromPanel.push({
      id: d.avatar_id,
      name: d.name || d.avatar_id,
      preview: d.preview,
      kind: d.kind,
      mine: true,
    });
  }
  const marked = [...catalog, ...fromPanel].map((item) => {
    const pos = rank.get(item.id) ?? null;
    return { ...item, is_default: pos != null, default_position: pos };
  });
  const chosen = marked
    .filter((i) => i.default_position != null)
    .sort((a, b) => (a.default_position ?? 0) - (b.default_position ?? 0));
  return [...chosen, ...marked.filter((i) => i.default_position == null)];
}
