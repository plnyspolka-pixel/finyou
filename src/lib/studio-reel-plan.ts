// Plan wykończenia rolki dla silnika Remotion (services/remotion, kompozycja
// `StudioReel`). To ten sam wygląd co plik ASS z caption-style.ts — napisy,
// znaczek „AI", nakładki dynamiczne — tylko jako czyste dane: wszystko, co da
// się policzyć (cięcie kwestii, podświetlanie słów, czasy nakładek, geometria
// kart), liczymy TU, a kompozycja jedynie rysuje. Dzięki temu jedna logika
// (z testami) obsługuje oba silniki, a strona Remotion nie zna reguł Studia.
// Współrzędne w pikselach kadru 720×1280, czasy w sekundach; kompozycja
// skaluje je do faktycznej rozdzielczości mastera.

import { fixBrandInCues } from "./caption-brand";
import { motionWithCueTiming, type ReelMotion } from "./motion-catalog";
import { buildReelHook, type ReelHook, type StudioHook } from "./studio-hook";
import {
  framingSegments,
  type AvatarFrameInfo,
  type FramingScene,
  type ReelFraming,
} from "./studio-avatar-framing";
import {
  AI_BADGE,
  CUSTOM_CAPTION_STYLES,
  DEFAULT_ASS_DIMENSIONS,
  DYNAMIC_OVERLAY_LAYOUT,
  OVERLAY_BRAND,
  OVERLAY_CARD_LAYOUT,
  chunkCues,
  layoutLines,
  overlayCardGeometry,
  overlaysWithCueTiming,
  parseSubtitles,
  type AiBadgeSpec,
  type CaptionStyle,
  type CustomCaptionStyleId,
  type DynamicOverlays,
  type OverlayCard,
  type SrtCue,
} from "./caption-style";

export const REEL_PLAN_VERSION = 1;

export type ReelSpan = { text: string; color: string };

/** Jedno zdarzenie napisów: wiersze z fragmentami (podświetlone słowo ma inny kolor). */
export type ReelCaptionEvent = { start: number; end: number; lines: ReelSpan[][] };

export type ReelCaptionStyle = Pick<
  CaptionStyle,
  | "id"
  | "font"
  | "fontSize"
  | "bold"
  | "color"
  | "outlineColor"
  | "outline"
  | "shadow"
  | "box"
  | "placement"
  | "marginBottom"
  | "marginSide"
>;

export type ReelTag = {
  lines: string[];
  /** Od tej sekundy znacznik się pojawia (po hooku); brak = od 0. */
  start?: number;
  /** Od tej sekundy znacznik maleje i jedzie do góry… */
  shrinkFrom: number;
  /** …a od tej jest mały u góry do końca filmu. */
  holdUntil: number;
};

export type ReelHeadline = { lines: string[]; start: number; end: number };

export type ReelCardRow = {
  /** Lewa krawędź tekstu i środek wiersza w pionie. */
  x: number;
  y: number;
  start: number;
  icon: string | null;
  text: string;
  value: string | null;
};

export type ReelCard = {
  start: number;
  /** null = do końca filmu. */
  end: number | null;
  /** Zmniejszenie czcionki karty, by najdłuższy wiersz zmieścił się w kadrze (≤ 1). */
  scale: number;
  panel: { x: number; y: number; width: number; height: number } | null;
  title: { text: string; y: number } | null;
  rows: ReelCardRow[];
};

export type ReelPlan = {
  version: typeof REEL_PLAN_VERSION;
  base: { width: number; height: number };
  captions: { style: ReelCaptionStyle; events: ReelCaptionEvent[] } | null;
  badge: AiBadgeSpec | null;
  overlays: {
    brand: typeof OVERLAY_BRAND;
    layout: typeof DYNAMIC_OVERLAY_LAYOUT;
    cardLayout: { readonly [K in keyof typeof OVERLAY_CARD_LAYOUT]: number };
    tag: ReelTag | null;
    headline: ReelHeadline | null;
    cards: ReelCard[];
    /** Elementy z katalogu motion-catalog.ts (czasy z SRT); brak w starszych planach. */
    motion?: ReelMotion[];
  } | null;
  /** Hook wizualny 0–2,5 s (pełny kadr nad masterem); brak w starszych planach. */
  hook?: ReelHook | null;
  /** Kadrowanie ujęć poziomych awatarów do pełnego pionu; brak w starszych planach. */
  framing?: ReelFraming[];
};

/** Wejście kadrowania: plan scen zadania + wymiary zdjęć awatarów. */
export type ReelFramingInput = {
  scenes: FramingScene[] | null;
  leadAvatarId: string;
  infos: Record<string, AvatarFrameInfo | undefined>;
};

/**
 * Zdarzenia napisów jednej porcji: bez podświetlania — jedno; z
 * podświetlaniem — po jednym na słowo, czasy proporcjonalne do liczby liter
 * (jak `highlightedEvents` w caption-style.ts).
 */
function captionEvents(cue: SrtCue, style: CaptionStyle): ReelCaptionEvent[] {
  const lines = cue.text.split("\n").map((l) => l.split(" ").filter(Boolean));
  const plain = (color: string) => lines.map((ws) => [{ text: ws.join(" "), color }]);
  const words = lines.flatMap((ws, li) => ws.map((_, wi) => ({ li, wi })));
  if (!style.highlight || words.length <= 1 || cue.end <= cue.start) {
    return [{ start: cue.start, end: cue.end, lines: plain(style.color) }];
  }
  const weights = words.map(({ li, wi }) =>
    Math.max(1, lines[li][wi].replace(/[^\p{L}\p{N}]/gu, "").length),
  );
  const total = weights.reduce((a, b) => a + b, 0);
  const bounds = [cue.start];
  let acc = 0;
  for (let i = 0; i < words.length - 1; i++) {
    acc += weights[i];
    bounds.push(cue.start + ((cue.end - cue.start) * acc) / total);
  }
  bounds.push(cue.end);
  const highlight = style.highlight;
  return words.map((current, k) => ({
    start: bounds[k],
    end: bounds[k + 1],
    lines: lines.map((ws, li) => {
      // Sąsiednie słowa w tym samym kolorze sklejamy w jeden fragment.
      const spans: ReelSpan[] = [];
      ws.forEach((w, wi) => {
        const color = li === current.li && wi === current.wi ? highlight : style.color;
        const last = spans[spans.length - 1];
        if (last && last.color === color) last.text += ` ${w}`;
        else spans.push({ text: spans.length ? ` ${w}` : w, color });
      });
      // Spacja przed słowem należy do fragmentu — po zmianie koloru też.
      return spans;
    }),
  }));
}

const CARD_ICONS = { check: "✓", dot: "•" } as const;

/** Geometria karty — wierne odwzorowanie `overlayCardEvents` z caption-style.ts. */
function cardPlan(card: OverlayCard, dims = DEFAULT_ASS_DIMENSIONS): ReelCard | null {
  if (!card.rows.length) return null;
  const C = OVERLAY_CARD_LAYOUT;
  const panel = card.frame === "panel";
  const { scale, panelW, panelH, panelX, panelY } = overlayCardGeometry(card, dims);
  const start = Math.max(0, card.startSeconds);
  const end = card.endSeconds == null ? null : Math.max(card.endSeconds, start + 1);

  let contentTop = panelY + C.padding;
  let title: ReelCard["title"] = null;
  if (card.title) {
    title = { text: card.title, y: Math.round(contentTop + C.titleHeight / 2) };
    contentTop += C.titleHeight;
  }
  const rows = card.rows.map((row, i) => {
    const rowStart =
      row.startSeconds != null
        ? Math.max(row.startSeconds, start)
        : start + 0.25 + i * C.revealStagger;
    return {
      x: panelX + C.padding,
      y: Math.round(contentTop + i * C.rowHeight + C.rowHeight / 2),
      start: end == null ? rowStart : Math.min(rowStart, end),
      icon: row.icon ? CARD_ICONS[row.icon] : null,
      text: row.text,
      value: row.value ?? null,
    };
  });
  return {
    start,
    end,
    scale,
    panel: panel ? { x: panelX, y: panelY, width: panelW, height: panelH } : null,
    title,
    rows,
  };
}

function overlaysPlan(ov: DynamicOverlays, cues: SrtCue[]): NonNullable<ReelPlan["overlays"]> {
  const L = DYNAMIC_OVERLAY_LAYOUT;
  let tag: ReelTag | null = null;
  if (ov.tag) {
    const hold = ov.tagHoldSeconds ?? 1.2;
    tag = {
      lines: ov.tag.split("\n"),
      shrinkFrom: Math.min(ov.headlineStartSeconds ?? hold, hold),
      holdUntil: hold,
    };
  }
  let headline: ReelHeadline | null = null;
  if (ov.headline) {
    const start = ov.headlineStartSeconds ?? 0.8;
    headline = {
      lines: layoutLines(ov.headline, L.headlineMaxChars),
      start,
      end: Math.max(ov.headlineEndSeconds ?? 6, start + 1),
    };
  }
  const cards = (ov.cards ?? []).map((c) => cardPlan(c)).filter((c): c is ReelCard => c !== null);
  // Kompozycja bierze rozmiar czcionki kart z `cardLayout` (wspólny dla
  // wszystkich kart), więc dostaje najmniejszą skalę z planu — karta, która
  // by się nie zmieściła, nie wychodzi za kadr. Pozycje i plansze są już
  // policzone per karta; mniejszy tekst mieści się w każdej z nich.
  const scale = Math.min(1, ...cards.map((c) => c.scale));
  const C = OVERLAY_CARD_LAYOUT;
  return {
    brand: OVERLAY_BRAND,
    layout: DYNAMIC_OVERLAY_LAYOUT,
    cardLayout:
      scale < 1
        ? {
            ...C,
            fontSize: C.fontSize * scale,
            titleFontSize: C.titleFontSize * scale,
            titleSpacing: C.titleSpacing * scale,
          }
        : C,
    tag,
    headline,
    cards,
    motion: ov.motion?.length ? motionWithCueTiming(ov.motion, cues) : [],
  };
}

/**
 * Plan rolki z tego samego wejścia co `submitCaptionBurn`: SRT (tekst
 * scenariusza + czasy ElevenLabs), styl napisów, znaczek, nakładki.
 * `srt` może być pusty, gdy wykańczamy rolkę bez napisów (sam znaczek /
 * nakładki); wtedy nakładki zostają z szacunkowymi czasami.
 */
export function buildReelPlan(input: {
  srt: string | null;
  styleId: CustomCaptionStyleId | null;
  aiBadge: boolean;
  overlays: DynamicOverlays | null;
  hook?: StudioHook | null;
  framing?: ReelFramingInput | null;
}): ReelPlan {
  const parsed = input.srt ? fixBrandInCues(parseSubtitles(input.srt)) : [];
  let captions: ReelPlan["captions"] = null;
  if (input.styleId) {
    const style = CUSTOM_CAPTION_STYLES[input.styleId];
    const cues = chunkCues(parsed, { maxChars: style.maxChars, maxLines: style.maxLines });
    if (!cues.length) {
      throw new Error("Plik SRT nie zawiera żadnej kwestii — nie ma czego wypalić.");
    }
    const events = cues
      .map((c) => (style.uppercase ? { ...c, text: c.text.toLocaleUpperCase("pl-PL") } : c))
      .flatMap((c) => captionEvents(c, style));
    const { id, font, fontSize, bold, color, outlineColor, outline, shadow, box, placement } =
      style;
    captions = {
      style: {
        id,
        font,
        fontSize,
        bold,
        color,
        outlineColor,
        outline,
        shadow,
        box,
        placement,
        marginBottom: style.marginBottom,
        marginSide: style.marginSide,
      },
      events,
    };
  }
  const overlays = input.overlays
    ? overlaysPlan(
        parsed.length ? overlaysWithCueTiming(input.overlays, parsed) : input.overlays,
        parsed,
      )
    : null;
  const badge = input.aiBadge ? AI_BADGE : null;
  const lastCue = parsed.length ? parsed[parsed.length - 1].end : undefined;
  const hook = buildReelHook(input.hook ?? null, lastCue != null ? lastCue + 0.6 : undefined);
  const framing = input.framing ? framingSegments({ ...input.framing, cues: parsed }) : [];
  if (!captions && !badge && !overlays && !hook && !framing.length) {
    throw new Error("Nie ma czego wypalić: brak napisów, znaczka AI i nakładek.");
  }
  const plan: ReelPlan = {
    version: REEL_PLAN_VERSION,
    base: { ...DEFAULT_ASS_DIMENSIONS },
    captions,
    badge,
    overlays,
    hook,
    framing,
  };
  return hook ? clearHookWindow(plan, hook.end) : plan;
}

/**
 * Hook ma kadr dla siebie: napisy lektora, znacznik, pytanie, karty
 * i elementy dynamiczne zaczynają się dopiero po nim. Element, któremu po
 * przesunięciu zostałoby za mało czasu, wypada. Znaczek AI zostaje — od
 * pierwszej klatki, także nad hookiem.
 */
export function clearHookWindow(plan: ReelPlan, hookEnd: number): ReelPlan {
  const MIN_LEFT = 1.2;
  const captions = plan.captions
    ? {
        ...plan.captions,
        events: plan.captions.events
          .filter((e) => e.end > hookEnd + 0.05)
          .map((e) => (e.start < hookEnd ? { ...e, start: hookEnd } : e)),
      }
    : null;
  const ov = plan.overlays;
  if (!ov) return { ...plan, captions };
  // Znacznik serii wchodzi tuż po hooku i ma tyle samo czasu co bez hooka.
  const tag = ov.tag
    ? {
        ...ov.tag,
        start: hookEnd,
        shrinkFrom: ov.tag.shrinkFrom + hookEnd,
        holdUntil: ov.tag.holdUntil + hookEnd,
      }
    : null;
  const headline =
    ov.headline && ov.headline.end - hookEnd >= MIN_LEFT
      ? { ...ov.headline, start: Math.max(ov.headline.start, hookEnd) }
      : null;
  const cards = ov.cards.flatMap((c) => {
    if (c.start >= hookEnd) return [c];
    if (c.end != null && c.end - hookEnd < MIN_LEFT) return [];
    return [
      {
        ...c,
        start: hookEnd,
        rows: c.rows.map((r) => ({ ...r, start: Math.max(r.start, hookEnd + 0.15) })),
      },
    ];
  });
  const motion = (ov.motion ?? []).flatMap((m) => {
    if (m.start >= hookEnd) return [m];
    if (m.end - hookEnd < MIN_LEFT) return [];
    return [
      {
        ...m,
        start: hookEnd,
        itemStarts: m.itemStarts ? m.itemStarts.map((x) => Math.max(x, hookEnd + 0.2)) : null,
      } as ReelMotion,
    ];
  });
  return { ...plan, captions, overlays: { ...ov, tag, headline, cards, motion } };
}
