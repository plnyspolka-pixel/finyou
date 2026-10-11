// Blok zasad zarządzany KODEM wewnątrz promptów agentów.
//
// Problem: prompt bazowy edytuje człowiek w /admin/text-agent, a liczby
// i zasady (prowizja, odsetki maksymalne, rozpoznanie potrzeb, uczciwość) mają
// jedno źródło prawdy w kodzie. Kopia w panelu prędzej czy później się rozjedzie
// (tak powstało „7%" przy umowach liczących 5%).
//
// Rozwiązanie: blok między znacznikami [[SYSTEM:BEGIN…]] / [[SYSTEM:END]]
// jest zawsze wycinany z promptu bazowego i doklejany na nowo, świeżo
// wyliczony z kodu. Można go wkleić do panelu (działa od razu, także na
// wersji aplikacji sprzed wdrożenia), a po wdrożeniu kod i tak go podmieni.
// Znaczniki to podwójne nawiasy KWADRATOWE — klamry {{…}} ElevenLabs traktuje
// jako zmienne dynamiczne.
import {
  AGENT_TOOLS_GUIDE,
  HONESTY_RULES,
  INVESTOR_DISCOVERY_RULES,
  INVESTOR_TOOLS_GUIDE,
  NEEDS_DISCOVERY_RULES,
} from "@/lib/agent-channel-rules";
import { buildLiveFactsBlock } from "./live-facts";

export const MANAGED_BEGIN =
  "[[SYSTEM:BEGIN — blok generowany z kodu Finance You, nie edytuj ręcznie]]";
export const MANAGED_END = "[[SYSTEM:END]]";

const MANAGED_RE = /\n*\[\[SYSTEM:BEGIN[^\]]*\]\][\s\S]*?\[\[SYSTEM:END\]\]\n*/g;

export type PromptSurface = "intake" | "investor_info" | "investor_panel";

export function stripManagedBlocks(prompt: string): string {
  return String(prompt ?? "")
    .replace(MANAGED_RE, "\n")
    .trimEnd();
}

/** Zasady + fakty dla powierzchni (bez znaczników). */
export function managedRules(surface: PromptSurface, date: Date | string = new Date()): string {
  if (surface === "intake") {
    return (
      HONESTY_RULES +
      buildLiveFactsBlock("klient", date) +
      NEEDS_DISCOVERY_RULES +
      AGENT_TOOLS_GUIDE
    );
  }
  return (
    HONESTY_RULES +
    buildLiveFactsBlock("inwestor", date) +
    INVESTOR_DISCOVERY_RULES +
    INVESTOR_TOOLS_GUIDE
  );
}

/** Ten sam blok w znacznikach — do wklejenia w prompt w panelu. */
export function managedBlockForPanel(
  surface: PromptSurface,
  date: Date | string = new Date(),
): string {
  return `\n\n${MANAGED_BEGIN}${managedRules(surface, date)}\n${MANAGED_END}`;
}
