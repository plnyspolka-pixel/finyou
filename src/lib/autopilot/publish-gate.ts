// Kontrola końcowa tuż przed wysyłką z kolejek publikacji (Meta, TikTok, X,
// YouTube) – czysta decyzja, bez I/O (testy: publish-gate.test.ts).
//
// Bramka w `enqueuePublication` i w auto-publikacji Studia sprawdza treść
// w chwili wstawienia do kolejki. Ta warstwa domyka resztę ścieżek: wpisy
// dodane wcześniej (np. podpisy z 29.09 z „bezpiecznym zwrotem”), wpisy
// zmienione po wstawieniu, ponowienia i bezpośrednie zapisy do tabel.
// Brief 5.7: „nie ma ścieżki ominięcia”.
import { applyRequiredElements, evaluateCompliance, type RuleHit } from "./compliance-rules";
import { PUBLISH_PLATFORMS, type PublishPlatform, type Track } from "./types";

export type FinalGateItem = {
  platform: string;
  title: string | null;
  message: string | null;
  track: string | null;
};

export type FinalGateDecision =
  | { action: "publish"; message: string; changed: boolean }
  | { action: "block"; blocks: RuleHit[]; reason: string };

/** Platformy, na których opis nie mieści stopki (X: 280 znaków). */
const NO_FOOTER: readonly string[] = ["x"];

function asTrack(t: string | null): Track | null {
  return t === "pozyczkobiorca" || t === "inwestor" ? t : null;
}

function asPlatform(p: string): PublishPlatform | null {
  return (PUBLISH_PLATFORMS as readonly string[]).includes(p) ? (p as PublishPlatform) : null;
}

export function describeBlocks(blocks: RuleHit[]): string {
  return blocks.map((b) => `${b.message}${b.match ? ` [„${b.match}”]` : ""}`).join(" ");
}

export function decideFinalGate(item: FinalGateItem, rulesVersion: string): FinalGateDecision {
  const title = (item.title ?? "").trim();
  const message = item.message ?? "";
  const ctx = {
    kind: "description" as const,
    track: asTrack(item.track),
    platform: asPlatform(item.platform),
  };
  const { blocks } = evaluateCompliance(`${title}\n${message}`, ctx);
  if (blocks.length) {
    return {
      action: "block",
      blocks,
      reason: `Bramka compliance przed publikacją (${rulesVersion}): ${describeBlocks(blocks)}`,
    };
  }
  // Elementy obowiązkowe (oznaczenie AI, nadawca, linia ryzyka) — także dla
  // wpisów ręcznych; idempotentne, więc ponowienie niczego nie dubluje.
  if (NO_FOOTER.includes(item.platform) || !message.trim()) {
    return { action: "publish", message, changed: false };
  }
  const withFooter = applyRequiredElements(message, ctx);
  return { action: "publish", message: withFooter, changed: withFooter !== message };
}
