/**
 * Decyzja bramki compliance dla wpisu w kolejce publikacji — czysta logika.
 *
 * Wołana przez KAŻDY publikator tuż przed wysyłką na platformę (Meta, TikTok,
 * X, YouTube), więc obejmuje panel, MCP, „Publikuj” przy materiale i automaty —
 * nie ma ścieżki ominięcia (brief 5.7). Reguły twarde blokują; brakujące
 * elementy obowiązkowe (oznaczenie AI, KRS, linia ryzyka) są dopisywane
 * deterministycznie do opisu.
 */
import {
  applyMandatoryElements,
  checkHardRules,
  COMPLIANCE_RULES_VERSION,
  inferTrack,
  type AudienceTrack,
  type ComplianceViolation,
  type MandatoryElement,
} from "./compliance-rules";

export interface PublicationGateInput {
  platform: string;
  title: string;
  /** Opis / podpis / treść posta (pole, które dopisujemy). */
  body: string;
  videoUrl?: string | null;
  imageUrl?: string | null;
  origin?: string | null;
  track?: string | null;
  /**
   * Czy dopisywać elementy obowiązkowe do opisu. TikTok bierze jako podpis
   * sam tytuł (150 znaków) — tam oznaczenie AI idzie flagą `is_aigc`.
   */
  appendMandatory?: boolean;
}

export interface PublicationGateResult {
  decision: "pass" | "fixed" | "reject";
  rulesVersion: string;
  track: AudienceTrack | null;
  aiGenerated: boolean;
  violations: ComplianceViolation[];
  added: MandatoryElement[];
  /** Nowa treść opisu przy `fixed`. */
  body: string;
  reason?: string;
}

/** Limity długości opisu na platformach, gdzie dopisek może się nie zmieścić. */
const BODY_LIMITS: Record<string, number> = {
  x: 280,
  tiktok: 2200,
  instagram_reels: 2200,
  youtube: 5000,
};

/**
 * Czy materiał pochodzi z produkcji AI. Wideo ze Studia leży w buckecie
 * `studio-media` (poza kopiami materiałów wgranych przez ludzi
 * `studio-media/marketing-materials/…`); wpisy agenta/Studia mają `origin`.
 */
export function isAiGeneratedMedia(
  input: Pick<PublicationGateInput, "videoUrl" | "imageUrl" | "origin">,
): boolean {
  if (input.origin === "agent" || input.origin === "studio") return true;
  const urls = [input.videoUrl, input.imageUrl].filter(Boolean) as string[];
  return urls.some(
    (u) => /\/studio-media\//.test(u) && !/\/studio-media\/marketing-materials\//.test(u),
  );
}

function normalizeTrack(t?: string | null): AudienceTrack | null {
  return t === "pozyczkobiorca" || t === "inwestor" ? t : null;
}

export function decidePublicationGate(input: PublicationGateInput): PublicationGateResult {
  const aiGenerated = isAiGeneratedMedia(input);
  const track = normalizeTrack(input.track) ?? inferTrack(`${input.title}\n${input.body}`);
  const isVideo = !!input.videoUrl;
  const base = {
    rulesVersion: COMPLIANCE_RULES_VERSION,
    track,
    aiGenerated,
  };

  const violations = [
    ...checkHardRules(input.title, { kind: isVideo ? "title" : "caption", track, aiGenerated }),
    ...checkHardRules(input.body, { kind: "caption", track, aiGenerated }),
  ];
  // Jedno naruszenie na regułę (tytuł i opis często powtarzają frazę).
  const unique = violations.filter(
    (v, i, arr) => arr.findIndex((x) => x.ruleId === v.ruleId) === i,
  );
  if (unique.length > 0) {
    return {
      ...base,
      decision: "reject",
      violations: unique,
      added: [],
      body: input.body,
      reason: `Bramka compliance (reguły ${COMPLIANCE_RULES_VERSION}): ${unique
        .map((v) => `${v.message} [„${v.match}”]`)
        .join("; ")}`,
    };
  }

  // Elementy obowiązkowe: oznaczenie AI dla materiałów AI, KRS i linia ryzyka
  // dla wideo (rolki o pieniądzach). Posty tekstowe/graficzne ludzi — tylko
  // reguły twarde.
  if ((!isVideo && !aiGenerated) || input.appendMandatory === false) {
    return { ...base, decision: "pass", violations: [], added: [], body: input.body };
  }
  const applied = applyMandatoryElements(
    input.body,
    { kind: "caption", track, aiGenerated, aboutMoney: true },
    { maxLength: BODY_LIMITS[input.platform] },
  );
  if (!applied) {
    return {
      ...base,
      decision: "reject",
      violations: [],
      added: [],
      body: input.body,
      reason: `Bramka compliance: opis za długi, by dopisać oznaczenie AI / KRS / ryzyko (limit ${BODY_LIMITS[input.platform]} znaków) — skróć treść.`,
    };
  }
  if (applied.added.length === 0) {
    return { ...base, decision: "pass", violations: [], added: [], body: input.body };
  }
  return { ...base, decision: "fixed", violations: [], added: applied.added, body: applied.text };
}
