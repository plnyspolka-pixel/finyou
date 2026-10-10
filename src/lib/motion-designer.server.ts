// Projektant elementów dynamicznych rolki (silnik Remotion). Claude dostaje
// scenariusz z czasami kwestii (SRT z ElevenLabs) i katalog komponentów
// z motion-catalog.ts, a oddaje listę elementów: który komponent, w której
// strefie, z jaką treścią i przy jakim DOSŁOWNYM fragmencie lektora ma
// wejść. Czasy liczymy potem sami z SRT (`motionWithCueTiming`) — model nie
// zgaduje sekund, a element bez dopasowania w mówionym tekście odpada.

import type { SrtCue } from "./caption-style";
import { STUDIO_CLAUDE_MODEL, claudeJson, isClaudeConfigured } from "./claude-json.server";
import {
  MOTION_CATALOG_PROMPT,
  MOTION_COMPONENTS,
  MOTION_LIMITS,
  sanitizeMotionDesign,
  type MotionDesignElement,
} from "./motion-catalog";

export const MOTION_DESIGNER_MODEL = STUDIO_CLAUDE_MODEL;
export const isMotionDesignerConfigured = isClaudeConfigured;

const SYSTEM = `Jesteś motion designerem krótkich pionowych rolek (Reels/Shorts) firmy Finance You — pożyczki pod zastaw nieruchomości i inwestowanie w takie pożyczki. Projektujesz elementy graficzne, które pojawiają się nad mówiącym awatarem i tłumaczą widzowi to, co właśnie słyszy.

Twoja praca jest oceniana po tym, czy widz z wyłączonym dźwiękiem zrozumie sens rolki z samych elementów. Element, który bez kontekstu nic nie mówi (np. samo „Poniżej 100 tys.” bez tego, co się dzieje poniżej), jest gorszy niż brak elementu.

ZASADY TREŚCI
- Każdy element to pełna, samodzielna myśl: liczba zawsze z tym, co znaczy; próg zawsze z konsekwencją po obu stronach; porównanie zawsze z tym, co porównujemy.
- Fakty i liczby WYŁĄCZNIE z tekstu lektora — niczego nie dopisuj, nie zaokrąglaj, nie zmieniaj jednostek. Możesz skracać i parafrazować, ale nie zmieniać sensu.
- Język polski, naturalny, bez clickbaitu i wykrzykników. Kwoty: „250 tys. zł”, „100–300 tys. zł”.
- Liczby słownie w scenariuszu („dwustoma pięćdziesięcioma tysiącami”) zapisuj cyframi („250 tys. zł”).

ZASADY KOMPOZYCJI
- Wybierz komponent, który najlepiej pokazuje strukturę informacji: widełki → range, granica opłacalności → threshold, dwie opcje → versus, obalany mit → mythFact, pojedyncza kluczowa liczba → stat, lista warunków → checklist, proces → steps, pointa → keyword, zastrzeżenie → alert, ostatnie zdanie z wezwaniem → cta.
- Rytm: ok. jeden element na 7–10 s nagrania, maksymalnie ${MOTION_LIMITS.maxElements}. Nie wszystko wymaga grafiki — zostaw oddech, szczególnie w pierwszych 2 s (hook mówi twarz).
- Strefa "top" (nad awatarem) dla kart z treścią; "center" (na awatarze) tylko dla krótkich akcentów keyword (do ~3 s).
- Elementy nie mogą się nakładać w czasie — każdy kolejny zaczyna się po poprzednim.

KOTWICE CZASU
- "sync": DOSŁOWNY, ciągły fragment tekstu lektora (3–10 słów, skopiowany znak w znak ze scenariusza), przy którym element ma wejść — zwykle początek zdania, którego dotyczy.
- "endSync": dosłowny fragment, po którym element ma zniknąć, albo pusty tekst (zniknie przed następnym).
- "itemSync": tylko dla checklist / steps — dla każdej pozycji dosłowny fragment, przy którym ma się odsłonić (albo pusty tekst); dla innych komponentów pusta lista.
- Pola opisane w katalogu jako „może być null” zostaw jako pusty tekst, gdy ich nie używasz.

${MOTION_CATALOG_PROMPT}

Gdy w tekście nie ma nic, co sensownie układa się w grafikę, zwróć pustą listę elementów.`;

// Schemat odpowiedzi — structured outputs (bez ograniczeń długości: te
// pilnuje walidator; nieobsługiwane słowa kluczowe API i tak by odrzuciło).
// Pole opcjonalne = tekst, pusty znaczy „brak” (walidator czyta "" jak null).
// Bez unii string|null: API kompiluje schemat z limitem 16 parametrów z
// unią / anyOf — z nullable wyszło 28 i całe zapytanie dostawało HTTP 400.
const nullableString = { type: "string", description: "pusty tekst = brak" };
const PROPS_SCHEMA: Record<string, Record<string, unknown>> = {
  stat: { kicker: nullableString, value: { type: "string" }, caption: nullableString },
  range: {
    title: { type: "string" },
    from: { type: "number" },
    to: { type: "number" },
    max: { type: "number" },
    unit: { type: "string" },
    caption: nullableString,
  },
  threshold: {
    title: { type: "string" },
    value: { type: "number" },
    max: { type: "number" },
    unit: { type: "string" },
    below: { type: "string" },
    above: { type: "string" },
  },
  versus: {
    title: nullableString,
    left: side(),
    right: side(),
    winner: { type: "string", enum: ["left", "right", "none"] },
  },
  checklist: { title: nullableString, items: { type: "array", items: { type: "string" } } },
  steps: { title: nullableString, items: { type: "array", items: { type: "string" } } },
  keyword: { text: { type: "string" }, highlight: nullableString },
  mythFact: { myth: { type: "string" }, fact: { type: "string" } },
  alert: { title: { type: "string" }, text: { type: "string" } },
  cta: { text: { type: "string" }, sub: nullableString },
};

function side() {
  return {
    type: "object",
    properties: { label: { type: "string" }, value: { type: "string" } },
    required: ["label", "value"],
    additionalProperties: false,
  };
}

const ELEMENT_SCHEMAS = MOTION_COMPONENTS.map((component) => ({
  type: "object",
  properties: {
    component: { type: "string", const: component },
    zone: { type: "string", enum: ["top", "center"] },
    sync: { type: "string" },
    endSync: nullableString,
    itemSync: {
      type: "array",
      items: nullableString,
      description: "tylko checklist/steps; dla innych pusta lista",
    },
    props: {
      type: "object",
      properties: PROPS_SCHEMA[component],
      required: Object.keys(PROPS_SCHEMA[component]),
      additionalProperties: false,
    },
  },
  required: ["component", "zone", "sync", "endSync", "itemSync", "props"],
  additionalProperties: false,
}));

export const OUTPUT_SCHEMA = {
  type: "object",
  properties: { elements: { type: "array", items: { anyOf: ELEMENT_SCHEMAS } } },
  required: ["elements"],
  additionalProperties: false,
};

const formatSrtTime = (s: number) => `${s.toFixed(1)}s`;

/**
 * Projekt elementów dynamicznych dla scenariusza z czasami kwestii.
 * Rzuca przy błędzie API / odmowie / pustej odpowiedzi — wołający spada
 * wtedy na zwykłe karty (generateOverlayCards).
 */
export async function designMotion(args: {
  script: string;
  cues: SrtCue[];
  topic?: string | null;
}): Promise<MotionDesignElement[]> {
  if (!args.cues.length) throw new Error("Brak kwestii SRT — projektant potrzebuje czasów.");

  const duration = args.cues[args.cues.length - 1].end;
  const timeline = args.cues
    .map(
      (c) => `[${formatSrtTime(c.start)} → ${formatSrtTime(c.end)}] ${c.text.replace(/\n/g, " ")}`,
    )
    .join("\n");
  const user = [
    args.topic ? `Temat rolki: ${args.topic}` : null,
    `Długość nagrania: ${duration.toFixed(1)} s.`,
    `Scenariusz (dokładny tekst lektora):\n${args.script.trim()}`,
    `Oś czasu kwestii:\n${timeline}`,
    "Zaprojektuj elementy dynamiczne.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const parsed = await claudeJson<{ elements?: unknown }>({
    system: SYSTEM,
    content: [{ type: "text", text: user }],
    schema: OUTPUT_SCHEMA,
    effort: "high",
    label: "Projektant",
  });
  return sanitizeMotionDesign(parsed.elements);
}
