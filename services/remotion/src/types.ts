// Dane wejściowe kompozycji — ten sam model, który Studio już produkuje
// (DynamicOverlays po synchronizacji z SRT, pocięte kwestie napisów), tylko
// zserializowany do JSON. Kształty trzymamy tu osobno, żeby paczka nie
// zależała od kodu aplikacji (Remotion bundluje ją do S3).

export type CardRow = {
  icon?: "check" | "dot" | null;
  text: string;
  value?: string | null;
  /** Start wiersza (s) wyliczony z SRT; bez niego wiersze wchodzą po kolei. */
  startSeconds?: number | null;
};

export type Card = {
  title?: string | null;
  rows: CardRow[];
  startSeconds: number;
  /** null = do końca filmu. */
  endSeconds?: number | null;
};

export type Overlays = {
  tag?: string | null;
  tagHoldSeconds?: number;
  headline?: string | null;
  headlineStartSeconds?: number;
  headlineEndSeconds?: number;
  cards?: Card[];
};

export type Caption = { start: number; end: number; text: string };

export type CaptionLook = {
  fontSize: number;
  /** Odstęp dolnej krawędzi napisów od dołu kadru (px przy 1280). */
  marginBottom: number;
  uppercase: boolean;
};

export type ReelProps = {
  /** Czysty master (bez napisów) — publiczny URL, np. HeyGen albo Storage. */
  videoUrl: string;
  /** Długość w sekundach; brak = odczyt z samego wideo. */
  durationSeconds?: number | null;
  overlays: Overlays;
  captions: Caption[];
  caption: CaptionLook;
  aiBadge: boolean;
};
