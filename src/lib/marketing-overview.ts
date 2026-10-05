// Czysta logika przeglądu marketingu (narzędzie MCP get_marketing_overview):
// agregaty kolejek publikacji bez zależności od bazy — testowalne osobno.
import type { StudioPlatform } from "./studio-platforms";

export type QueueRowLike = {
  id: string;
  platform: string;
  title: string | null;
  status: string;
  scheduled_at: string;
  published_at: string | null;
  last_error: string | null;
};

export type QueueSummary = {
  total: number;
  by_status: Record<string, number>;
  by_platform: Record<string, number>;
  /** Wpisy `pending` z terminem w przyszłości (albo do najbliższego ticka), najbliższe pierwsze. */
  upcoming: QueueRowLike[];
  /** Wpisy w toku (publishing / uploading / processing). */
  in_progress: QueueRowLike[];
  /** Nieudane — do ponowienia albo poprawy. */
  failed: QueueRowLike[];
  /** Ostatnio opublikowane, najnowsze pierwsze. */
  recently_published: QueueRowLike[];
};

const IN_PROGRESS = new Set(["publishing", "uploading", "processing"]);

export function summarizeQueue(rows: readonly QueueRowLike[], limit = 10): QueueSummary {
  const by_status: Record<string, number> = {};
  const by_platform: Record<string, number> = {};
  for (const r of rows) {
    by_status[r.status] = (by_status[r.status] ?? 0) + 1;
    by_platform[r.platform] = (by_platform[r.platform] ?? 0) + 1;
  }
  const asc = (a: QueueRowLike, b: QueueRowLike) => a.scheduled_at.localeCompare(b.scheduled_at);
  const upcoming = rows
    .filter((r) => r.status === "pending")
    .sort(asc)
    .slice(0, limit);
  const in_progress = rows.filter((r) => IN_PROGRESS.has(r.status)).sort(asc);
  const failed = rows
    .filter((r) => r.status === "failed")
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at))
    .slice(0, limit);
  const recently_published = rows
    .filter((r) => r.status === "published")
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))
    .slice(0, limit);
  return {
    total: rows.length,
    by_status,
    by_platform,
    upcoming,
    in_progress,
    failed,
    recently_published,
  };
}

/** Wiersz kolejki YouTube w kształcie wspólnym z social_publish_queue. */
export function youtubeRowToQueueRow(r: {
  id: string;
  title: string | null;
  status: string;
  scheduled_at: string;
  published_at: string | null;
  last_error: string | null;
}): QueueRowLike {
  return { ...r, platform: "youtube" satisfies StudioPlatform };
}

/** Które kanały są gotowe, a które wymagają konfiguracji — lista dla agenta. */
export function channelReadiness(status: {
  youtubeConnected: boolean;
  facebookConfigured: boolean;
  instagramConfigured: boolean;
  tiktokConfigured: boolean;
  tiktokConnected: boolean;
  xConfigured: boolean;
  xConnected: boolean;
  heygenConfigured: boolean;
  elevenlabsConfigured: boolean;
  aiConfigured: boolean;
  captionBurnerConfigured?: boolean;
}): { ready: string[]; missing: { channel: string; fix: string }[] } {
  const ready: string[] = [];
  const missing: { channel: string; fix: string }[] = [];
  const add = (ok: boolean, channel: string, fix: string) =>
    ok ? ready.push(channel) : missing.push({ channel, fix });
  add(status.youtubeConnected, "youtube", "Połącz kanał: panel → YouTube Shorts → Połącz.");
  add(status.facebookConfigured, "facebook", "Sekrety META_PAGE_ID i META_PAGE_ACCESS_TOKEN.");
  add(status.instagramConfigured, "instagram", "Sekret META_IG_USER_ID (konto IG Business).");
  add(
    status.tiktokConnected,
    "tiktok",
    status.tiktokConfigured
      ? "Połącz konto: panel → Studio publikacji → Połącz TikTok."
      : "Sekrety TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET, potem połączenie konta.",
  );
  add(
    status.xConnected,
    "x",
    status.xConfigured
      ? "Połącz konto: panel → Ustawienia → Połącz X."
      : "Sekrety X_CLIENT_ID / X_CLIENT_SECRET, potem połączenie konta.",
  );
  add(status.heygenConfigured, "heygen", "Sekret HEYGEN_API_KEY.");
  add(status.elevenlabsConfigured, "elevenlabs", "Sekret ELEVENLABS_API_KEY.");
  add(status.aiConfigured, "ai", "Sekret LOVABLE_API_KEY (scenariusze, opisy, grafiki).");
  if (status.captionBurnerConfigured !== undefined) {
    add(
      status.captionBurnerConfigured,
      "caption_burner",
      "Usługa FFmpeg (CAPTION_BURNER_URL / CAPTION_BURNER_SECRET) — bez niej rolki Studia z napisami nie wychodzą (zadania padają do ponowienia), a wideo idzie na platformy bez kompresji do profilu publikacji (ryzyko błędu „Plik za duży”).",
    );
  }
  return { ready, missing };
}
