// Zawieszone publikacje rolek Meta (FB Reels, IG Reels) — czysta logika.
//
// Wpis w `publishing` zostaje, gdy przebieg ticka zostanie przerwany w trakcie
// wysyłki (28–30.10.2026: trzy z czterech FB Reels). Wcześniej po 60 min
// przechodził w `failed` i czekał na ręczne „Ponów”, bo nie było wiadomo, czy
// Meta zdążyła opublikować. Teraz pytamy Metę o stan i decydujemy sami:
//   * opublikowane → domykamy wpis jako `published` (bez duplikatu),
//   * w toku → czekamy dalej,
//   * nie wyszło → wpis wraca do kolejki (z limitem prób).
// Posty FB (facebook_post) nie mają identyfikatora sprzed publikacji — zostają
// przy dawnym zachowaniu (`failed` + ręczna decyzja).

/** Po tylu minutach w `publishing` rolkę uznajemy za zawieszoną i sprawdzamy w Mecie. */
export const STALLED_REEL_CLAIM_MIN = 30;

export type ReelPublishState = "published" | "in_progress" | "not_published";

type Phase = { status?: unknown; publish_status?: unknown } | undefined;

/**
 * Stan wideo FB z odpowiedzi `GET /{video-id}?fields=status`.
 * `published` tylko przy jednoznacznym potwierdzeniu; każda faza w toku
 * (wysyłanie, przetwarzanie, publikacja) = czekamy; reszta = nie wyszło.
 */
export function classifyFacebookReelStatus(json: unknown): ReelPublishState {
  const st = ((json ?? {}) as { status?: Record<string, unknown> }).status ?? {};
  const publishing = st.publishing_phase as Phase;
  if (publishing?.publish_status === "published" || publishing?.status === "complete") {
    return "published";
  }
  const phases = [st.uploading_phase, st.processing_phase, publishing] as Phase[];
  if (phases.some((p) => p?.status === "in_progress")) return "in_progress";
  if (st.video_status === "processing" || st.video_status === "upload_complete") {
    return "in_progress";
  }
  return "not_published";
}

export type StalledReelDecision =
  /** Meta potwierdza publikację — domknij wpis jako opublikowany. */
  | { action: "published"; externalId: string }
  /** Meta jeszcze pracuje — sprawdź ponownie później. */
  | { action: "wait" }
  /** Kontener IG gotowy albo w toku — dokończy go zwykła ścieżka `processing`. */
  | { action: "processing" }
  /** Nic nie wyszło — wpis wraca do kolejki (albo `failed` po limicie prób). */
  | { action: "requeue"; reason: string };

/**
 * Decyzja dla zawieszonej rolki. `remote` to stan z Meta: dla FB wynik
 * classifyFacebookReelStatus, dla IG `status_code` kontenera; null = nie było
 * czego pytać (przebieg padł przed utworzeniem wideo / kontenera).
 */
export function decideStalledReel(input: {
  platform: "facebook_reels" | "instagram_reels";
  externalId: string | null;
  remote: string | null;
}): StalledReelDecision {
  const { platform, externalId, remote } = input;
  if (!externalId || remote == null) {
    return {
      action: "requeue",
      reason:
        platform === "facebook_reels"
          ? "przebieg przerwany przed wysłaniem wideo do Facebooka"
          : "przebieg przerwany przed utworzeniem kontenera Instagrama",
    };
  }
  if (platform === "facebook_reels") {
    if (remote === "published") return { action: "published", externalId };
    if (remote === "in_progress") return { action: "wait" };
    return { action: "requeue", reason: "Facebook potwierdził, że rolka nie została opublikowana" };
  }
  if (remote === "PUBLISHED") return { action: "published", externalId };
  if (remote === "FINISHED" || remote === "IN_PROGRESS") return { action: "processing" };
  return { action: "requeue", reason: `kontener Instagrama w stanie ${remote || "nieznanym"}` };
}
