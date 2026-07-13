// Pobieranie profilu użytkownika z Meta Graph API po PSID (Messenger)
// lub IGSID (Instagram). Facebook udostępnia stronie imię i nazwisko
// rozmówcy, więc lead może być od razu podpisany danymi klienta.
const GRAPH = "https://graph.facebook.com/v21.0";

export type MetaUserProfile = {
  firstName: string | null;
  lastName: string | null;
};

export async function fetchMetaUserProfile(opts: {
  userId: string; // PSID (Messenger) lub IGSID (Instagram)
  platform: "messenger" | "instagram";
}): Promise<MetaUserProfile | null> {
  const token =
    (opts.platform === "instagram" ? process.env.META_IG_PAGE_ACCESS_TOKEN : undefined) ??
    process.env.META_PAGE_ACCESS_TOKEN ??
    process.env.META_ACCESS_TOKEN;
  if (!token) return null;

  // Messenger zwraca first_name/last_name; Instagram tylko pełne `name` + `username`.
  const fields = opts.platform === "instagram" ? "name,username" : "first_name,last_name";
  const res = await fetch(
    `${GRAPH}/${encodeURIComponent(opts.userId)}?fields=${fields}&access_token=${encodeURIComponent(token)}`,
  );
  const json: Record<string, unknown> = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.warn("[meta-profile] fetch failed", res.status, JSON.stringify(json).slice(0, 200));
    return null;
  }

  if (opts.platform === "instagram") {
    const full = String(json?.name ?? json?.username ?? "").trim();
    if (!full) return null;
    const parts = full.split(/\s+/);
    return { firstName: parts[0] ?? null, lastName: parts.slice(1).join(" ") || null };
  }

  const firstName = String(json?.first_name ?? "").trim() || null;
  const lastName = String(json?.last_name ?? "").trim() || null;
  if (!firstName && !lastName) return null;
  return { firstName, lastName };
}
