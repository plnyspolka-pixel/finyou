// Bramka compliance przy TWORZENIU treści (brief 5.7 p. 1–6): reguły twarde →
// niezależny recenzent LLM → pętla naprawcza autora (maks. 3 iteracje) →
// elementy obowiązkowe → audyt. Nic nie czeka na człowieka: treść, która
// nie przejdzie, jest odrzucana, a temat wraca do banku z adnotacją.
//
// Recenzent jest NIEZALEŻNY od autora: inny model (AI_MODEL_PRO, autor
// domyślnie AI_MODEL_FAST) i osobny prompt, który nie widzi briefu autora.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AI_MODEL_FAST, AI_MODEL_PRO, lovableAiJson } from "@/lib/lovable-ai.server";
import {
  COMPLIANCE_RULES_VERSION,
  HARD_RULES,
  RISK_LINE,
  applyMandatoryElements,
  checkHardRules,
  type ContentKind,
  type HardViolation,
  type TrackOrBoth,
} from "./compliance-rules";
import { COMPLIANCE_MODULE, logAutopilotAction } from "./state.server";

export const MAX_COMPLIANCE_ITERATIONS = 3;

export type ReviewerIssue = { issue: string; fix: string; severity: "block" | "minor" };
export type ReviewerVerdict = { verdict: "pass" | "fix"; issues: ReviewerIssue[] };

export type GateResult =
  | { status: "passed"; text: string; iterations: number; checkId: string | null; added: string[] }
  | {
      status: "rejected";
      text: string;
      iterations: number;
      checkId: string | null;
      reason: string;
    };

export type Rewriter = (text: string, feedback: string[]) => Promise<string>;

const TRACK_LABEL: Record<TrackOrBoth, string> = {
  pozyczkobiorca: "pożyczkobiorcy — wyłącznie przedsiębiorcy, cel gospodarczy (B2B)",
  inwestor: "prywatni inwestorzy (mogą być osobami fizycznymi)",
  oba: "pożyczkobiorcy-przedsiębiorcy i prywatni inwestorzy",
};

/** Niezależny recenzent ryzyka (brief 5.7 p. 3). */
export async function reviewWithLlm(
  text: string,
  ctx: { track: TrackOrBoth; kind: ContentKind },
): Promise<ReviewerVerdict> {
  const rules = HARD_RULES.map((r) => `- ${r.reason}`).join("\n");
  const res = await lovableAiJson<Partial<ReviewerVerdict>>({
    model: AI_MODEL_PRO,
    temperature: 0,
    system:
      "Jesteś niezależnym recenzentem zgodności treści marketingowych firmy finansowej w Polsce (pożyczki pod zastaw nieruchomości). " +
      "Nie jesteś autorem i nie bronisz tekstu. Oceniasz ryzyko: wprowadzanie w błąd, obietnice zysku lub finansowania, bagatelizowanie ryzyka, " +
      "presja na osoby w trudnej sytuacji, sygnały ostrzegawcze KNF/ESMA wobec finfluencerów (superlatywy, zamknięte grupy, „sam inwestuję” jako wabik, " +
      "inwestowanie jako zabawa), kierowanie oferty pożyczkowej do konsumentów, ceny w wideo, dane osobowe, zgodność z torem odbiorcy. " +
      "Odpowiadasz wyłącznie JSON-em.",
    user: `TOR: ${TRACK_LABEL[ctx.track]}
RODZAJ TREŚCI: ${ctx.kind}

REGUŁY FIRMY (twarde, już sprawdzone automatem — zgłaszaj tylko, jeśli są naruszone innymi słowami):
${rules}

TREŚĆ DO OCENY:
"""
${text.slice(0, 12000)}
"""

Zwróć JSON: {"verdict":"pass"|"fix","issues":[{"issue":"<co jest nie tak, cytat>","fix":"<konkretna poprawka>","severity":"block"|"minor"}]}.
"pass" tylko, gdy nie ma żadnego problemu o wadze "block". Uwagi "minor" nie blokują.`,
  });
  const issues = Array.isArray(res?.issues)
    ? res.issues
        .filter((i): i is ReviewerIssue => !!i && typeof i.issue === "string")
        .map((i) => ({
          issue: i.issue,
          fix: typeof i.fix === "string" ? i.fix : "",
          severity: i.severity === "minor" ? ("minor" as const) : ("block" as const),
        }))
    : [];
  const blocking = issues.some((i) => i.severity === "block");
  return { verdict: res?.verdict === "pass" && !blocking ? "pass" : "fix", issues };
}

/** Domyślny autor poprawek: przepisuje tekst według uwag, zachowując format. */
export function defaultRewriter(ctx: { track: TrackOrBoth; kind: ContentKind }): Rewriter {
  return async (text, feedback) => {
    const tracks = ctx.track === "oba" ? (["inwestor", "pozyczkobiorca"] as const) : [ctx.track];
    const res = await lovableAiJson<{ text?: string }>({
      model: AI_MODEL_FAST,
      temperature: 0.3,
      system:
        "Jesteś copywriterem Finance You. Przepisujesz treść po polsku tak, żeby usunąć wskazane problemy zgodności, " +
        "zachowując sens, długość (±15%), format, hook w formie pytania-tezy i CTA. Bez obietnic zysku, bez procentów zwrotu, " +
        'bez cen, bez superlatywów, bez presji czasu. Zwracasz JSON {"text": "..."}.',
      user: `TOR: ${TRACK_LABEL[ctx.track]}; RODZAJ: ${ctx.kind}
Gdy treść dotyczy pieniędzy, ma zawierać zdanie o ryzyku w duchu: ${tracks.map((t) => RISK_LINE[t]).join(" / ")}

UWAGI DO POPRAWIENIA:
${feedback.map((f) => `- ${f}`).join("\n")}

TREŚĆ:
"""
${text}
"""`,
    });
    const out = String(res?.text ?? "").trim();
    if (!out) throw new Error("Autor poprawek zwrócił pusty tekst.");
    return out;
  };
}

function violationFeedback(v: HardViolation[]): string[] {
  return v.map((x) => `${x.reason}${x.match ? ` Fragment: „${x.match}”.` : ""}`);
}

/**
 * Pełna bramka. `rewrite` — autor poprawek (domyślnie LLM); dla treści, której
 * nie da się przepisać (gotowe wideo), podaj `rewrite: null` — wtedy pierwsze
 * naruszenie kończy się odrzuceniem.
 */
export async function runComplianceGate(opts: {
  text: string;
  kind: ContentKind;
  track: TrackOrBoth;
  refTable?: string;
  refId?: string;
  rewrite?: Rewriter | null;
  /** Recenzent LLM (domyślnie włączony). Wyłączenie tylko w testach / bez klucza AI. */
  useReviewer?: boolean;
  compact?: boolean;
}): Promise<GateResult> {
  const ctx = { track: opts.track, kind: opts.kind };
  const rewrite = opts.rewrite === undefined ? defaultRewriter(ctx) : opts.rewrite;
  const useReviewer = opts.useReviewer ?? !!process.env.LOVABLE_API_KEY;
  const reviewerLog: { iteration: number; verdict: ReviewerVerdict }[] = [];
  const hardLog: { iteration: number; violations: HardViolation[] }[] = [];

  let text = opts.text;
  let iteration = 0;
  let lastReason = "";
  while (iteration <= MAX_COMPLIANCE_ITERATIONS) {
    const hard = checkHardRules(text, ctx);
    let feedback: string[] = [];
    if (hard.length) {
      hardLog.push({ iteration, violations: hard });
      feedback = violationFeedback(hard);
      lastReason = `reguły twarde: ${hard.map((h) => h.ruleId).join(", ")}`;
    } else if (useReviewer) {
      let verdict: ReviewerVerdict;
      try {
        verdict = await reviewWithLlm(text, ctx);
      } catch (e) {
        // Recenzent niedostępny = nie publikujemy (fail closed).
        lastReason = `recenzent niedostępny: ${e instanceof Error ? e.message : String(e)}`;
        break;
      }
      reviewerLog.push({ iteration, verdict });
      if (verdict.verdict === "fix") {
        feedback = verdict.issues
          .filter((i) => i.severity === "block")
          .map((i) => `${i.issue} → ${i.fix}`);
        lastReason = `recenzent: ${feedback.join("; ").slice(0, 300)}`;
      }
    }
    if (!feedback.length) {
      const mandatory = applyMandatoryElements(text, { ...ctx, compact: opts.compact });
      const checkId = await audit(opts, "passed", iteration, hardLog, reviewerLog, mandatory);
      return {
        status: "passed",
        text: mandatory.text,
        iterations: iteration,
        checkId,
        added: mandatory.added,
      };
    }
    if (!rewrite || iteration === MAX_COMPLIANCE_ITERATIONS) break;
    iteration += 1;
    try {
      text = await rewrite(text, feedback);
    } catch (e) {
      lastReason = `przepisanie nieudane: ${e instanceof Error ? e.message : String(e)}`;
      break;
    }
  }

  const checkId = await audit(
    opts,
    rewrite ? "rejected" : "blocked",
    iteration,
    hardLog,
    reviewerLog,
    {
      text,
      added: [],
    },
  );
  await logAutopilotAction({
    module: COMPLIANCE_MODULE,
    action: "content_rejected",
    status: "blocked",
    summary: `${opts.kind} (${opts.track}) odrzucone po ${iteration} iteracjach — ${lastReason}`,
    payload: { ref_table: opts.refTable ?? null, ref_id: opts.refId ?? null, check_id: checkId },
  });
  return { status: "rejected", text, iterations: iteration, checkId, reason: lastReason };
}

async function audit(
  opts: { text: string; kind: ContentKind; track: TrackOrBoth; refTable?: string; refId?: string },
  result: "passed" | "rejected" | "blocked",
  iterations: number,
  hard: unknown[],
  reviewer: unknown[],
  final: { text: string; added: string[] },
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("ai_compliance_checks")
    .insert({
      content_kind: opts.kind,
      track: opts.track,
      ref_table: opts.refTable ?? null,
      ref_id: opts.refId ?? null,
      rules_version: COMPLIANCE_RULES_VERSION,
      result,
      iterations,
      hard_violations: hard as never,
      reviewer: reviewer as never,
      mandatory_added: final.added,
      original_text: opts.text.slice(0, 20000),
      final_text: final.text.slice(0, 20000),
    })
    .select("id")
    .single();
  if (error) {
    console.warn(`[compliance] audit: ${error.message}`);
    return null;
  }
  return data.id;
}
