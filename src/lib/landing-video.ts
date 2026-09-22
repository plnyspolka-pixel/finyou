// Film „Twoja droga do prywatnego finansowania nieruchomości" na landingu
// /dla-inwestora. Stałe wspólne dla klienta i serwera: id filmu w HeyGen oraz
// stałe miejsce kopii w naszym Storage (publiczny bucket `studio-media`), żeby
// landing znał adres pliku bez bazy. Kopię z HeyGen robi
// `syncLandingInvestorVideo` (src/lib/landing-video.server.ts) — z panelu
// /admin/materialy albo narzędziem MCP `sync_landing_investor_video`.

export const LANDING_INVESTOR_VIDEO = {
  title: "Finance You — Twoja droga do prywatnego finansowania nieruchomości",
  heygenVideoId: "1328c421db424e46a03158ef7faa5afc",
  bucket: "studio-media",
  videoPath: "landing/dla-inwestora/twoja-droga-do-prywatnego-finansowania-nieruchomosci.mp4",
  posterPath: "landing/dla-inwestora/twoja-droga-do-prywatnego-finansowania-nieruchomosci.jpg",
} as const;

/** Zapasowy odtwarzacz HeyGen — używany tylko, dopóki kopii nie ma w Storage. */
export const LANDING_INVESTOR_VIDEO_HEYGEN_EMBED_URL = `https://app.heygen.com/embeds/${LANDING_INVESTOR_VIDEO.heygenVideoId}`;

export type LandingVideoInfo = {
  /** Publiczny adres pliku mp4 w naszym Storage. */
  videoUrl: string;
  /** Plakat (miniatura z HeyGen) albo null, gdy nie został skopiowany. */
  posterUrl: string | null;
};
