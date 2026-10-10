// Katalog elementów dynamicznych rolki (silnik Remotion, kompozycja
// `StudioReel`). Jedno źródło prawdy dla trzech miejsc:
//  - projektanta AI (motion-designer.server.ts) — opis komponentów w prompcie
//    i schemat odpowiedzi,
//  - walidacji (`sanitizeMotionDesign`) — limity tekstu, liczby wierszy,
//    kotwice czasu w mówionym tekście, brak nakładania się elementów,
//  - kompozycji Remotion (services/remotion/src/motion) — typy propsów.
// Czyste dane i funkcje, bez I/O — testowane w motion-catalog.test.ts.
// Czasy w sekundach; strefy to pasy kadru 720×1280 (kompozycja skaluje).

import type { SrtCue } from "./caption-style";

export const MOTION_COMPONENTS = [
  "stat",
  "range",
  "threshold",
  "versus",
  "checklist",
  "steps",
  "keyword",
  "mythFact",
  "alert",
  "cta",
] as const;

export type MotionComponent = (typeof MOTION_COMPONENTS)[number];

/**
 * Strefy kadru. Mastery HeyGena to zwykle ujęcie 16:9 wpasowane w pion —
 * awatar zajmuje środkowy pas (ok. 34–66% wysokości), więc karty z treścią
 * idą nad nim (`top`), a krótkie, mocne akcenty mogą wejść na awatara
 * (`center`) na chwilę. Dół zostaje dla napisów.
 */
export const MOTION_ZONES = {
  top: { y: 0.145, height: 0.19 },
  center: { y: 0.4, height: 0.2 },
} as const;

export type MotionZone = keyof typeof MOTION_ZONES;

export type MotionProps = {
  stat: { kicker: string | null; value: string; caption: string | null };
  range: {
    title: string;
    from: number;
    to: number;
    unit: string;
    max: number;
    caption: string | null;
  };
  threshold: {
    title: string;
    value: number;
    unit: string;
    max: number;
    below: string;
    above: string;
  };
  versus: {
    title: string | null;
    left: { label: string; value: string };
    right: { label: string; value: string };
    winner: "left" | "right" | "none";
  };
  checklist: { title: string | null; items: string[] };
  steps: { title: string | null; items: string[] };
  keyword: { text: string; highlight: string | null };
  mythFact: { myth: string; fact: string };
  alert: { title: string; text: string };
  cta: { text: string; sub: string | null };
};

/** Element zaprojektowany przez AI — czasy jako kotwice w mówionym tekście. */
export type MotionDesignElement = {
  [C in MotionComponent]: {
    component: C;
    zone: MotionZone;
    /** Dosłowny fragment lektora (3–12 słów): element wchodzi, gdy lektor go zaczyna. */
    sync: string;
    /** Dosłowny fragment, po którym element znika; brak = do następnego elementu. */
    endSync: string | null;
    /** Fragmenty, przy których odsłaniają się kolejne pozycje (checklist / steps). */
    itemSync: (string | null)[] | null;
    props: MotionProps[C];
  };
}[MotionComponent];

/** Element w planie renderu — czasy policzone z SRT. */
export type ReelMotion = {
  [C in MotionComponent]: {
    component: C;
    zone: MotionZone;
    start: number;
    end: number;
    /** Starty kolejnych pozycji listy (checklist / steps), bezwzględne. */
    itemStarts: number[] | null;
    props: MotionProps[C];
  };
}[MotionComponent];

/** Limity tekstu (znaki) — wynikają z szerokości kadru 720 px i rozmiarów czcionek. */
export const MOTION_LIMITS = {
  title: 30,
  kicker: 30,
  caption: 44,
  statValue: 14,
  unit: 8,
  label: 24,
  versusLabel: 16,
  versusValue: 12,
  item: 30,
  stepItem: 24,
  keyword: 22,
  myth: 44,
  alertTitle: 22,
  alertText: 48,
  ctaText: 30,
  ctaSub: 36,
  maxItems: 4,
  minItems: 2,
  maxElements: 6,
  /** Minimalny i maksymalny czas widoczności elementu (s). */
  minDuration: 2.2,
  maxDuration: 8,
  /** `center` zasłania awatara — tylko krótko. */
  maxCenterDuration: 3.5,
} as const;

/**
 * Opis katalogu dla projektanta AI — po polsku, z zastosowaniem i limitami.
 * Zmiana komponentu = zmiana tutaj, w walidatorze i w services/remotion.
 */
export const MOTION_CATALOG_PROMPT = `KATALOG KOMPONENTÓW (wyłącznie te; props dokładnie wg opisu):

1. stat — jedna liczba jako bohater kadru, animowane odliczanie do wartości.
   props: kicker (nad liczbą, ≤${MOTION_LIMITS.kicker} zn., może być null), value (np. "250 tys. zł", "8%", "24 h"; ≤${MOTION_LIMITS.statValue} zn.), caption (co ta liczba znaczy, pełna myśl, ≤${MOTION_LIMITS.caption} zn., może być null).
   Kiedy: lektor podaje jedną kluczową liczbę.

2. range — przedział na osi, np. „typowa sprawa: 100–300 tys. zł”. Pasek wypełnia się od "from" do "to" na skali 0…max.
   props: title (≤${MOTION_LIMITS.title}), from, to, max (liczby; max > to, zwykle ~1,5–2× to), unit (≤${MOTION_LIMITS.unit}, np. "tys. zł"), caption (≤${MOTION_LIMITS.caption} lub null).
   Kiedy: lektor podaje widełki.

3. threshold — próg dzielący oś na „poniżej” i „powyżej” (np. poniżej 100 tys. koszty zjadają zysk / powyżej ma sens).
   props: title (≤${MOTION_LIMITS.title}), value (liczba progu), unit (≤${MOTION_LIMITS.unit}), max (koniec skali, > value), below (co dzieje się poniżej, ≤${MOTION_LIMITS.label}), above (co powyżej, ≤${MOTION_LIMITS.label}).
   Kiedy: lektor mówi o granicy, minimum, „poniżej X nie warto”.

4. versus — porównanie dwóch opcji, zwycięzca podświetlony.
   props: title (≤${MOTION_LIMITS.title} lub null), left {label ≤${MOTION_LIMITS.versusLabel}, value ≤${MOTION_LIMITS.versusValue}}, right {to samo}, winner ("left" | "right" | "none").
   Kiedy: lektor zestawia dwie rzeczy („X zamiast Y”, „lepiej niż”).

5. checklist — 2–4 warunki/korzyści z ptaszkami, odsłaniane w rytmie lektora.
   props: title (≤${MOTION_LIMITS.title} lub null), items (2–4, każda ≤${MOTION_LIMITS.item} zn., pełna myśl).
   itemSync: dla każdej pozycji dosłowny fragment, przy którym ma wejść (albo null).

6. steps — 2–4 kroki procesu jako numerowana oś.
   props: title (≤${MOTION_LIMITS.title} lub null), items (2–4, każda ≤${MOTION_LIMITS.stepItem} zn.).
   itemSync: jak w checklist.

7. keyword — 1–4 słowa jako mocny akcent kinetyczny (np. „Nie 5 milionów”).
   props: text (≤${MOTION_LIMITS.keyword}), highlight (słowo/fraza z text w złocie, albo null).
   Kiedy: pointa, zaprzeczenie mitu, hook. Najlepiej zone "center", krótko.

8. mythFact — mit przekreślony, pod nim fakt.
   props: myth (≤${MOTION_LIMITS.myth}), fact (≤${MOTION_LIMITS.myth}).
   Kiedy: lektor obala przekonanie („Myślisz, że…? A jednak…”).

9. alert — ostrzeżenie/zastrzeżenie z ikoną.
   props: title (≤${MOTION_LIMITS.alertTitle}, np. "Uwaga"), text (≤${MOTION_LIMITS.alertText}, pełne zdanie).
   Kiedy: lektor mówi „jedno zastrzeżenie”, „uważaj”, ryzyko.

10. cta — wezwanie na końcu.
   props: text (≤${MOTION_LIMITS.ctaText}), sub (≤${MOTION_LIMITS.ctaSub} lub null).
   Kiedy: ostatnie zdanie lektora („Obserwuj…”).`;

// ── Walidacja ───────────────────────────────────────────────────────────────

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s && s.length <= max ? s : null;
};

const optStr = (v: unknown, max: number): string | null | undefined => {
  if (v == null || v === "") return null;
  return str(v, max) ?? undefined; // undefined = za długi → element odpada
};

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && v.trim() && Number.isFinite(Number(v.replace(",", ".")))
      ? Number(v.replace(",", "."))
      : null;

const items = (v: unknown, max: number): string[] | null => {
  if (!Array.isArray(v)) return null;
  const out = v.map((x) => str(x, max));
  if (out.some((x) => x === null)) return null;
  const ok = out as string[];
  return ok.length >= MOTION_LIMITS.minItems && ok.length <= MOTION_LIMITS.maxItems ? ok : null;
};

/** Propsy komponentu po walidacji; null = element odpada (lepiej brak niż śmieć). */
export function sanitizeMotionProps<C extends MotionComponent>(
  component: C,
  raw: unknown,
): MotionProps[C] | null {
  const p = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const L = MOTION_LIMITS;
  const out = ((): MotionProps[MotionComponent] | null => {
    switch (component) {
      case "stat": {
        const value = str(p.value, L.statValue);
        const kicker = optStr(p.kicker, L.kicker);
        const caption = optStr(p.caption, L.caption);
        if (!value || kicker === undefined || caption === undefined) return null;
        return { value, kicker, caption };
      }
      case "range": {
        const title = str(p.title, L.title);
        const unit = str(p.unit, L.unit) ?? "";
        const caption = optStr(p.caption, L.caption);
        const from = num(p.from);
        const to = num(p.to);
        let max = num(p.max);
        if (!title || caption === undefined || from == null || to == null) return null;
        if (from < 0 || to <= from) return null;
        if (max == null || max <= to) max = to * 1.5;
        return { title, from, to, max, unit, caption };
      }
      case "threshold": {
        const title = str(p.title, L.title);
        const unit = str(p.unit, L.unit) ?? "";
        const below = str(p.below, L.label);
        const above = str(p.above, L.label);
        const value = num(p.value);
        let max = num(p.max);
        if (!title || !below || !above || value == null || value <= 0) return null;
        if (max == null || max <= value) max = value * 2.5;
        return { title, value, max, unit, below, above };
      }
      case "versus": {
        const side = (s: unknown) => {
          const o = (typeof s === "object" && s !== null ? s : {}) as Record<string, unknown>;
          const label = str(o.label, L.versusLabel);
          const value = str(o.value, L.versusValue);
          return label && value ? { label, value } : null;
        };
        const left = side(p.left);
        const right = side(p.right);
        const title = optStr(p.title, L.title);
        const winner = p.winner === "left" || p.winner === "right" ? p.winner : "none";
        if (!left || !right || title === undefined) return null;
        return { title, left, right, winner };
      }
      case "checklist":
      case "steps": {
        const list = items(p.items, component === "steps" ? L.stepItem : L.item);
        const title = optStr(p.title, L.title);
        if (!list || title === undefined) return null;
        return { title, items: list };
      }
      case "keyword": {
        const text = str(p.text, L.keyword);
        if (!text) return null;
        const h = typeof p.highlight === "string" ? p.highlight.trim() : "";
        // Podświetlenie musi być fragmentem tekstu — inaczej je pomijamy.
        const highlight =
          h && text.toLocaleLowerCase("pl-PL").includes(h.toLocaleLowerCase("pl-PL")) ? h : null;
        return { text, highlight };
      }
      case "mythFact": {
        const myth = str(p.myth, L.myth);
        const fact = str(p.fact, L.myth);
        return myth && fact ? { myth, fact } : null;
      }
      case "alert": {
        const title = str(p.title, L.alertTitle);
        const text = str(p.text, L.alertText);
        return title && text ? { title, text } : null;
      }
      case "cta": {
        const text = str(p.text, L.ctaText);
        const sub = optStr(p.sub, L.ctaSub);
        return text && sub !== undefined ? { text, sub } : null;
      }
    }
    return null;
  })();
  return out as MotionProps[C] | null;
}

/** Odczyt odpowiedzi projektanta — struktura, bez czasów (te liczy `motionWithCueTiming`). */
export function sanitizeMotionDesign(raw: unknown): MotionDesignElement[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: MotionDesignElement[] = [];
  for (const entry of list) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const component = MOTION_COMPONENTS.find((c) => c === e.component);
    if (!component) continue;
    const sync = typeof e.sync === "string" ? e.sync.trim() : "";
    if (sync.split(/\s+/).filter(Boolean).length < 2) continue;
    // Projektant AI oddaje propsy jako tekst JSON (`props_json` — płaski schemat
    // odpowiedzi); robot przez MCP podaje obiekt `props`.
    let rawProps: unknown = e.props;
    if (rawProps == null && typeof e.props_json === "string") {
      try {
        rawProps = JSON.parse(e.props_json);
      } catch {
        continue;
      }
    }
    const props = sanitizeMotionProps(component, rawProps);
    if (!props) continue;
    const zone: MotionZone = e.zone === "center" ? "center" : "top";
    const endSync = typeof e.endSync === "string" && e.endSync.trim() ? e.endSync.trim() : null;
    const itemSync =
      (component === "checklist" || component === "steps") && Array.isArray(e.itemSync)
        ? e.itemSync.map((s) => (typeof s === "string" && s.trim() ? s.trim() : null))
        : null;
    out.push({ component, zone, sync, endSync, itemSync, props } as MotionDesignElement);
  }
  return out;
}

// ── Czasy z SRT ─────────────────────────────────────────────────────────────

const normalizeWords = (text: string): string[] =>
  text
    .toLocaleLowerCase("pl-PL")
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);

type TimedWord = { word: string; start: number; end: number };

/**
 * Słowa SRT z czasami: w obrębie kwestii czas dzielimy proporcjonalnie do
 * liczby liter (jak podświetlanie słów w napisach) — dokładniej niż sam
 * początek kwestii, gdy kwestia jest długa.
 */
function timedWords(cues: SrtCue[]): TimedWord[] {
  const out: TimedWord[] = [];
  for (const cue of cues) {
    const ws = normalizeWords(cue.text);
    const total = ws.reduce((a, w) => a + Math.max(1, w.length), 0);
    let acc = 0;
    for (const w of ws) {
      const s = cue.start + ((cue.end - cue.start) * acc) / total;
      acc += Math.max(1, w.length);
      out.push({ word: w, start: s, end: cue.start + ((cue.end - cue.start) * acc) / total });
    }
  }
  return out;
}

/** Ciągłe dopasowanie fragmentu w słowach SRT (od `from`); null bez pełnego dopasowania. */
function findSpoken(
  words: TimedWord[],
  text: string,
  from = 0,
): { start: number; end: number; index: number } | null {
  const target = normalizeWords(text);
  if (!target.length) return null;
  outer: for (let i = from; i + target.length <= words.length; i++) {
    for (let j = 0; j < target.length; j++) {
      if (words[i + j].word !== target[j]) continue outer;
    }
    return { start: words[i].start, end: words[i + target.length - 1].end, index: i };
  }
  return null;
}

/**
 * Projekt AI → elementy planu z czasami. Element, którego `sync` nie ma
 * w SRT, WYPADA (scenariusz mógł się zmienić). Elementy nie nachodzą na
 * siebie: koniec = `endSync`, inaczej start następnego (z odstępem), w
 * granicach min/max czasu; `center` krócej. Kolejność wg startu, limit liczby.
 */
export function motionWithCueTiming(design: MotionDesignElement[], cues: SrtCue[]): ReelMotion[] {
  const words = timedWords(cues);
  if (!words.length) return [];
  const videoEnd = words[words.length - 1].end + 0.6;
  const L = MOTION_LIMITS;

  const placed = design
    .map((el) => {
      const at = findSpoken(words, el.sync);
      if (!at) return null;
      const endAt = el.endSync ? findSpoken(words, el.endSync, at.index) : null;
      let itemStarts: number[] | null = null;
      if ((el.component === "checklist" || el.component === "steps") && "items" in el.props) {
        const n = el.props.items.length;
        let cursor = at.index;
        let prev = at.start;
        itemStarts = Array.from({ length: n }, (_, i) => {
          const s = el.itemSync?.[i];
          const hit = s ? findSpoken(words, s, cursor) : null;
          if (hit) {
            cursor = hit.index;
            prev = Math.max(prev, hit.start);
          } else {
            prev = i === 0 ? at.start + 0.2 : prev + 0.55;
          }
          return prev;
        });
      }
      return { el, start: at.start, endHint: endAt ? endAt.end + 0.3 : null, itemStarts };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.start - b.start);

  const out: ReelMotion[] = [];
  for (let i = 0; i < placed.length && out.length < L.maxElements; i++) {
    const { el, start, endHint, itemStarts } = placed[i];
    const prev = out[out.length - 1];
    // Za blisko poprzedniego — poprzedni musiałby zniknąć zanim ktoś go przeczyta.
    if (prev && start < prev.start + L.minDuration) continue;
    const maxDur = el.zone === "center" ? L.maxCenterDuration : L.maxDuration;
    const lastItem = itemStarts ? itemStarts[itemStarts.length - 1] + 1.6 : 0;
    const natural = Math.max(start + L.minDuration, lastItem, endHint ?? start + 4.5);
    const end = Math.min(natural, start + Math.max(maxDur, lastItem - start), videoEnd);
    if (end - start < 1.2) continue;
    if (prev && prev.end > start - 0.15) prev.end = start - 0.15;
    out.push({
      component: el.component,
      zone: el.zone,
      start,
      end,
      itemStarts,
      props: el.props,
    } as ReelMotion);
  }
  return out;
}
