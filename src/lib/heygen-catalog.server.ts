// Katalog awatarów HeyGen pobierany na żywo z konta (zamiast sztywnej listy):
//   * /v2/avatar_group.list?include_public=false → grupy użytkownika ("moje"),
//   * /v2/avatar_group/{id}/avatars → looki w grupach,
//   * /v2/avatars → publiczne awatary + talking photos użytkownika.
// Wynik scalony i cache'owany w pamięci (TTL 5 min). Kind ('avatar' vs
// 'talking_photo') decyduje o kształcie payloadu przy generacji wideo.

const HEYGEN_BASE = "https://api.heygen.com";

export type HeygenKind = "avatar" | "talking_photo";

export type HeygenCatalogItem = {
  id: string;
  name: string;
  preview: string | null;
  kind: HeygenKind;
  mine: boolean;
  group?: string;
};

const apiKey = () => {
  const k = process.env.HEYGEN_API_KEY;
  if (!k) throw new Error("HEYGEN_API_KEY missing");
  return k;
};

async function heygenGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${HEYGEN_BASE}${path}`, {
    headers: { "X-Api-Key": apiKey(), Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HeyGen ${path}: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { data?: Record<string, unknown> };
  return json.data ?? {};
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

let cache: { at: number; items: HeygenCatalogItem[] } | null = null;
const CACHE_TTL_MS = 5 * 60_000;

export async function listHeygenCatalog(): Promise<HeygenCatalogItem[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.items;

  const items: HeygenCatalogItem[] = [];
  const seen = new Set<string>();
  const push = (item: HeygenCatalogItem) => {
    if (!item.id || seen.has(item.id)) return;
    seen.add(item.id);
    items.push(item);
  };

  // 1. Grupy użytkownika (digital twin, photo avatars) — to są "moje" awatary.
  try {
    const groupsData = await heygenGet("/v2/avatar_group.list?include_public=false");
    const groups = Array.isArray(groupsData.avatar_group_list)
      ? (groupsData.avatar_group_list as Record<string, unknown>[])
      : [];
    for (const g of groups.slice(0, 20)) {
      const groupId = str(g.id) ?? str(g.group_id);
      const groupName = str(g.name) ?? "Moja grupa";
      const groupType = (str(g.group_type) ?? "").toUpperCase();
      const kind: HeygenKind = groupType.includes("PHOTO") ? "talking_photo" : "avatar";
      if (!groupId) continue;
      try {
        const looksData = await heygenGet(
          `/v2/avatar_group/${encodeURIComponent(groupId)}/avatars`,
        );
        const looks = Array.isArray(looksData.avatar_list)
          ? (looksData.avatar_list as Record<string, unknown>[])
          : [];
        for (const a of looks) {
          push({
            id: str(a.id) ?? str(a.avatar_id) ?? "",
            name: str(a.name) ?? str(a.avatar_name) ?? groupName,
            preview: str(a.preview_image_url) ?? str(a.image_url) ?? str(a.preview_url),
            kind,
            mine: true,
            group: groupName,
          });
        }
      } catch {
        // Pojedyncza grupa bez looków nie blokuje reszty katalogu.
      }
    }
  } catch {
    // Brak dostępu do grup — polegamy na /v2/avatars poniżej.
  }

  // 2. Talking photos użytkownika + pełna lista awatarów (publiczne HeyGen —
  //    m.in. te "biurowe" — oraz własne instant avatary).
  try {
    const data = await heygenGet("/v2/avatars");
    const photos = Array.isArray(data.talking_photos)
      ? (data.talking_photos as Record<string, unknown>[])
      : [];
    for (const p of photos) {
      push({
        id: str(p.talking_photo_id) ?? "",
        name: str(p.talking_photo_name) ?? "Talking photo",
        preview: str(p.preview_image_url),
        kind: "talking_photo",
        mine: true,
      });
    }
    const avatars = Array.isArray(data.avatars) ? (data.avatars as Record<string, unknown>[]) : [];
    for (const a of avatars.slice(0, 600)) {
      push({
        id: str(a.avatar_id) ?? "",
        name: str(a.avatar_name) ?? "Awatar",
        preview: str(a.preview_image_url),
        kind: "avatar",
        mine: false,
      });
    }
  } catch {
    // Nawet bez /v2/avatars zwracamy to, co mamy z grup.
  }

  if (items.length) cache = { at: Date.now(), items };
  return items;
}

// Uwaga: kind służy wyłącznie do oznaczenia w UI ("foto"). Generacja wideo
// (API v3) używa dla wszystkich awatarów type 'avatar' z avatar_id —
// v3 nie zna typu 'talking_photo'.
