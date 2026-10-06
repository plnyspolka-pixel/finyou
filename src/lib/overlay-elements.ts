// Katalog ELEMENTÓW EKRANOWYCH rolek Studia — czysta logika (typy, walidacja
// odpowiedzi AI, harmonogram na osi czasu). Rysuje je kompozycja Remotion
// (services/remotion/src/Elements.tsx); dawny silnik ASS (caption-burner)
// zna tylko karty (`cards`) i te elementy pomija.
//
// Zasada jak przy kartach: AI nie pisze treści od siebie — wybiera z katalogu
// komponent pasujący do tego, co lektor MÓWI (liczba → licznik, „bank vs my"
// → porównanie, kolejność → kroki, zakończenie → CTA…), a treść bierze
// z tekstu lektora. Każdy element ma `syncText` — dosłowny fragment mówiony,
// przy którym ma wejść; czas liczy overlaysWithCueTiming z SRT, element bez
// dopasowania wypada. Elementy i karty NIE nachodzą na siebie: wszystkie
// leżą w górnym pasie kadru, więc otwarty element kończy się chwilę przed
// następnym (scheduleOverlayItems).

import type { OverlayCard, SrtCue } from "./caption-style";

/** Wspólne pola elementu: czas i miejsce. */
export type OverlayElementBase = {
  /** Start (s); gdy jest `syncText`, liczy go overlaysWithCueTiming. */
  startSeconds: number;
  /** Koniec; null = do startu następnego elementu / końca filmu. */
  endSeconds?: number | null;
  /** Dosłowny mówiony fragment, przy którym element wchodzi (wymagany z AI). */
  syncText?: string | null;
  /** Mówiony fragment, po którym element znika. */
  endSyncText?: string | null;
  /** Górna krawędź jako ułamek wysokości kadru (domyślnie górny pas). */
  y?: number;
};

/** Duża liczba z podpisem (np. „60%" / „maks. LTV"), nabija się od zera. */
export type StatElement = OverlayElementBase & {
  kind: "stat";
  value: string;
  label: string;
  note?: string | null;
};

/** Dwie kolumny „Bank" vs „Finance You" — prawa (nasza) złota. */
export type CompareElement = OverlayElementBase & {
  kind: "compare";
  title?: string | null;
  left: { title: string; rows: string[] };
  right: { title: string; rows: string[] };
};

/** Numerowane kroki 1-2-3, odsłaniane po kolei. */
export type StepsElement = OverlayElementBase & {
  kind: "steps";
  title?: string | null;
  steps: string[];
};

/** Wyróżniony cytat / kluczowe zdanie z lektora. */
export type QuoteElement = OverlayElementBase & {
  kind: "quote";
  text: string;
  author?: string | null;
};

/** Wezwanie do działania na koniec rolki (pulsująca pigułka). */
export type CtaElement = OverlayElementBase & {
  kind: "cta";
  text: string;
  sub?: string | null;
};

/** Pieczątka — jedno-dwa słowa pod kątem („BEZ BIK"), wbija się z góry. */
export type StickerElement = OverlayElementBase & {
  kind: "sticker";
  text: string;
};

/** Poziome słupki 2-4 wartości (porównanie kosztów / czasu), najlepszy złoty. */
export type BarsElement = OverlayElementBase & {
  kind: "bars";
  title?: string | null;
  bars: { label: string; value: number; display?: string | null; highlight?: boolean }[];
};

/** Belka z imieniem i rolą mówiącego (pod twarzą, nad napisami). */
export type LowerThirdElement = OverlayElementBase & {
  kind: "lowerThird";
  name: string;
  role: string;
};

export type OverlayElement =
  | StatElement
  | CompareElement
  | StepsElement
  | QuoteElement
  | CtaElement
  | StickerElement
  | BarsElement
  | LowerThirdElement;

export type OverlayElementKind = OverlayElement["kind"];

export const OVERLAY_ELEMENT_KINDS: readonly OverlayElementKind[] = [
  "stat",
  "compare",
  "steps",
  "quote",
  "cta",
  "sticker",
  "bars",
  "lowerThird",
];

/** Ile elementów (kart + reszty) może mieć jedna rolka — więcej to chaos. */
export const MAX_OVERLAY_ITEMS = 4;

/** Katalog dla AI i dokumentacji: kiedy który komponent pasuje. */
export const OVERLAY_ELEMENT_CATALOG: ReadonlyArray<{
  kind: OverlayElementKind | "card";
  when: string;
  shape: string;
}> = [
  {
    kind: "card",
    when: "wyliczenie, warunki, checklista 2-4 punktów (opcjonalnie z wartością)",
    shape:
      '{"kind":"card","title":"DO 24 ZNAKÓW","rows":[{"icon":"check|dot","text":"do 26 znaków","value":"do 10 znaków"}],"sync":"..."}',
  },
  {
    kind: "stat",
    when: "JEDNA mocna liczba, kwota albo procent, którą lektor podkreśla",
    shape:
      '{"kind":"stat","value":"60%","label":"do 20 znaków","note":"do 28 znaków (opcjonalnie)","sync":"..."}',
  },
  {
    kind: "compare",
    when: "lektor zestawia dwie opcje (bank vs my, przed vs po, zwykła vs nasza)",
    shape:
      '{"kind":"compare","title":"do 20 znaków","left":{"title":"do 12","rows":["do 18 znaków"]},"right":{"title":"do 12","rows":["do 18 znaków"]},"sync":"..."}',
  },
  {
    kind: "steps",
    when: "proces w kolejności: najpierw, potem, na końcu (2-4 kroki)",
    shape: '{"kind":"steps","title":"do 20 znaków","steps":["do 22 znaków"],"sync":"..."}',
  },
  {
    kind: "quote",
    when: "jedno zdanie-klucz, które warto zobaczyć w całości (teza, obietnica)",
    shape: '{"kind":"quote","text":"do 70 znaków, dosłownie z lektora","sync":"..."}',
  },
  {
    kind: "cta",
    when: "zakończenie z wezwaniem do działania (zadzwoń, napisz, sprawdź) — TYLKO na końcu",
    shape: '{"kind":"cta","text":"do 24 znaków","sub":"do 30 znaków (opcjonalnie)","sync":"..."}',
  },
  {
    kind: "sticker",
    when: "hasło-pieczątka z 1-2 słów, które lektor rzuca z naciskiem (bez BIK, w 24 h)",
    shape: '{"kind":"sticker","text":"do 14 znaków","sync":"..."}',
  },
  {
    kind: "bars",
    when: "2-4 liczby tego samego rodzaju do porównania (koszt, czas, procent)",
    shape:
      '{"kind":"bars","title":"do 20 znaków","bars":[{"label":"do 14","value":12,"display":"12%","highlight":true}],"sync":"..."}',
  },
];

// ── Walidacja odpowiedzi AI ─────────────────────────────────────────────────

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "";
const strOrNull = (v: unknown, max: number): string | null => str(v, max) || null;
const strList = (v: unknown, max: number, limit: number): string[] =>
  (Array.isArray(v) ? v : [])
    .map((x) => str(x, max))
    .filter(Boolean)
    .slice(0, limit);

/**
 * Przyjmuje z odpowiedzi AI tylko elementy z `sync` (bez niego nie ma jak
 * trafić w czas) i z kompletem pól; przycina teksty do rozmiarów komponentów.
 * `startSeconds` to szacunek bez znaczenia — i tak liczy go
 * overlaysWithCueTiming, a element bez dopasowania w SRT wypada.
 */
export function sanitizeOverlayElements(raw: unknown): OverlayElement[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: OverlayElement[] = [];
  for (const entry of list) {
    if (out.length >= MAX_OVERLAY_ITEMS) break;
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const sync = str(e.sync, 160);
    if (!sync || sync.split(/\s+/).length < 3) continue;
    const base: OverlayElementBase = {
      startSeconds: 6 + out.length * 6,
      endSeconds: null,
      syncText: sync,
      endSyncText: strOrNull(e.endSync, 160),
    };
    const el = elementFrom(e, base);
    if (el) out.push(el);
  }
  return out;
}

function elementFrom(e: Record<string, unknown>, base: OverlayElementBase): OverlayElement | null {
  switch (e.kind) {
    case "stat": {
      const value = str(e.value, 12);
      const label = str(e.label, 20);
      if (!value || !label) return null;
      return { ...base, kind: "stat", value, label, note: strOrNull(e.note, 28) };
    }
    case "compare": {
      const side = (v: unknown) => {
        const o = (typeof v === "object" && v !== null ? v : {}) as Record<string, unknown>;
        return { title: str(o.title, 12), rows: strList(o.rows, 18, 4) };
      };
      const left = side(e.left);
      const right = side(e.right);
      if (!left.title || !right.title || !left.rows.length || !right.rows.length) return null;
      return { ...base, kind: "compare", title: strOrNull(e.title, 20), left, right };
    }
    case "steps": {
      const steps = strList(e.steps, 22, 4);
      if (steps.length < 2) return null;
      return { ...base, kind: "steps", title: strOrNull(e.title, 20), steps };
    }
    case "quote": {
      const text = str(e.text, 70);
      if (text.split(/\s+/).length < 3) return null;
      return { ...base, kind: "quote", text, author: strOrNull(e.author, 24) };
    }
    case "cta": {
      const text = str(e.text, 24);
      if (!text) return null;
      return { ...base, kind: "cta", text, sub: strOrNull(e.sub, 30) };
    }
    case "sticker": {
      const text = str(e.text, 14);
      if (!text) return null;
      return { ...base, kind: "sticker", text };
    }
    case "bars": {
      const bars = (Array.isArray(e.bars) ? e.bars : [])
        .filter((b): b is Record<string, unknown> => typeof b === "object" && b !== null)
        .map((b) => ({
          label: str(b.label, 14),
          value: Number(b.value),
          display: strOrNull(b.display, 10),
          highlight: b.highlight === true,
        }))
        .filter((b) => b.label && Number.isFinite(b.value) && b.value >= 0)
        .slice(0, 4);
      if (bars.length < 2 || !bars.some((b) => b.value > 0)) return null;
      return { ...base, kind: "bars", title: strOrNull(e.title, 20), bars };
    }
    case "lowerThird": {
      const name = str(e.name, 24);
      const role = str(e.role, 32);
      if (!name || !role) return null;
      return { ...base, kind: "lowerThird", name, role };
    }
    default:
      return null;
  }
}

// ── Harmonogram ─────────────────────────────────────────────────────────────

export type SpokenRangeFn = (cues: SrtCue[], text: string) => { start: number; end: number } | null;

type Timed = { startSeconds: number; endSeconds?: number | null };

/**
 * Jedna oś czasu dla kart i elementów górnego pasa: posortowane po starcie,
 * otwarty wpis (endSeconds null) kończy się 0,3 s przed startem następnego
 * (minimum 2 s na ekranie), ostatni zostaje do końca filmu. Belka
 * `lowerThird` leży niżej i nie bierze udziału w kolejce.
 */
export function scheduleOverlayItems<T extends Timed>(
  items: T[],
  shares: (item: T) => boolean = () => true,
): T[] {
  const queue = items.filter(shares).sort((a, b) => a.startSeconds - b.startSeconds);
  const closed = new Map<T, number | null | undefined>();
  queue.forEach((item, i) => {
    const next = queue[i + 1];
    if (item.endSeconds != null || !next) {
      closed.set(item, item.endSeconds);
      return;
    }
    closed.set(item, Math.max(next.startSeconds - 0.3, item.startSeconds + 2));
  });
  return items.map((item) => (closed.has(item) ? { ...item, endSeconds: closed.get(item) } : item));
}

/**
 * Czasy elementów z SRT: start = kwestia, w której pada `syncText`
 * (bez dopasowania element WYPADA), koniec = kwestia z `endSyncText` + 0,3 s
 * albo z harmonogramu. CTA bez końca zostaje do końca filmu.
 */
export function syncOverlayElements(
  elements: OverlayElement[],
  cues: SrtCue[],
  spokenRange: SpokenRangeFn,
): OverlayElement[] {
  return elements.flatMap((el) => {
    const endRange = el.endSyncText ? spokenRange(cues, el.endSyncText) : null;
    const endSeconds = endRange ? endRange.end + 0.3 : (el.endSeconds ?? null);
    if (!el.syncText) return [{ ...el, endSeconds }];
    const range = spokenRange(cues, el.syncText);
    return range ? [{ ...el, endSeconds, startSeconds: range.start }] : [];
  });
}

/** Karty i elementy razem na jednej osi — wynik rozdzielony z powrotem. */
export function scheduleCardsAndElements(
  cards: OverlayCard[],
  elements: OverlayElement[],
): { cards: OverlayCard[]; elements: OverlayElement[] } {
  type Item = {
    card?: OverlayCard;
    element?: OverlayElement;
    startSeconds: number;
    endSeconds?: number | null;
  };
  const items: Item[] = [
    ...cards.map((card) => ({
      card,
      startSeconds: card.startSeconds,
      endSeconds: card.endSeconds,
    })),
    ...elements.map((element) => ({
      element,
      startSeconds: element.startSeconds,
      endSeconds: element.endSeconds,
    })),
  ];
  const scheduled = scheduleOverlayItems(items, (it) => it.element?.kind !== "lowerThird");
  return {
    cards: scheduled
      .filter((it) => it.card)
      .map((it) => ({ ...it.card!, endSeconds: it.endSeconds }))
      .sort((a, b) => a.startSeconds - b.startSeconds),
    elements: scheduled
      .filter((it) => it.element)
      .map((it) => ({ ...it.element!, endSeconds: it.endSeconds }) as OverlayElement)
      .sort((a, b) => a.startSeconds - b.startSeconds),
  };
}
