// Bramka compliance (brief 5.7 p.3–6) – pętla bez człowieka:
//   reguły twarde → recenzent LLM niezależny od autora → poprawki autora
//   (maks. 3 iteracje) → przepuszczenie albo odrzucenie (temat wraca do banku).
// Ten plik to czysta logika pętli; wywołania modeli i zapis do dziennika
// wstrzykuje compliance-gate.server.ts (testowalne bez sieci).
import {
  COMPLIANCE_RULES_VERSION,
  applyRequiredElements,
  evaluateCompliance,
  type RuleContext,
  type RuleHit,
} from "./compliance-rules";

export const MAX_GATE_ITERATIONS = 3;

export interface ReviewIssue {
  problem: string;
  fix: string;
}

export interface ReviewResult {
  verdict: "ok" | "fix" | "reject";
  /** 0 (bezpieczne) – 100 (wysokie ryzyko). */
  risk: number;
  issues: ReviewIssue[];
}

export interface GateDeps {
  /** Niezależny recenzent (inny model / osobny prompt niż autor). */
  review: (text: string, ctx: RuleContext) => Promise<ReviewResult>;
  /** Autor przepisuje tekst według uwag. */
  rewrite: (text: string, ctx: RuleContext, issues: ReviewIssue[]) => Promise<string>;
}

export interface GateIteration {
  n: number;
  text: string;
  blocks: RuleHit[];
  review: ReviewResult | null;
}

export interface GateResult {
  status: "passed" | "rewritten" | "rejected";
  text: string;
  rulesVersion: string;
  iterations: GateIteration[];
  reason?: string;
}

/** Próg ryzyka recenzenta, powyżej którego treść nie przechodzi nawet z „ok”. */
export const REVIEW_RISK_THRESHOLD = 40;

function hitsToIssues(blocks: RuleHit[]): ReviewIssue[] {
  return blocks.map((b) => ({
    problem: `${b.message}${b.match ? ` (fragment: „${b.match}”)` : ""}`,
    fix: "Przepisz fragment bez tej obietnicy/sformułowania, zachowując sens edukacyjny.",
  }));
}

export async function runGateLoop(
  input: { text: string; ctx: RuleContext },
  deps: GateDeps,
): Promise<GateResult> {
  const iterations: GateIteration[] = [];
  let text = input.text;
  for (let n = 1; n <= MAX_GATE_ITERATIONS + 1; n++) {
    const { blocks } = evaluateCompliance(text, input.ctx);
    // Reguły twarde najpierw – recenzenta wołamy dopiero dla tekstu bez blokad
    // (taniej i recenzent nie musi łapać tego, co łapie regex).
    let review: ReviewResult | null = null;
    if (!blocks.length) {
      try {
        review = await deps.review(text, input.ctx);
      } catch (e) {
        // Brak recenzenta = brak zgody. Nie publikujemy „na ślepo”.
        iterations.push({ n, text, blocks, review: null });
        return {
          status: "rejected",
          text,
          rulesVersion: COMPLIANCE_RULES_VERSION,
          iterations,
          reason: `Recenzent niedostępny: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    }
    iterations.push({ n, text, blocks, review });

    const reviewOk =
      review != null && review.verdict === "ok" && review.risk <= REVIEW_RISK_THRESHOLD;
    if (!blocks.length && reviewOk) {
      const finalText = applyRequiredElements(text, input.ctx);
      return {
        status: n === 1 && finalText === input.text ? "passed" : "rewritten",
        text: finalText,
        rulesVersion: COMPLIANCE_RULES_VERSION,
        iterations,
      };
    }
    if (review?.verdict === "reject") {
      return {
        status: "rejected",
        text,
        rulesVersion: COMPLIANCE_RULES_VERSION,
        iterations,
        reason: "Recenzent odrzucił temat jako nienaprawialny.",
      };
    }
    if (n > MAX_GATE_ITERATIONS) break;
    const issues = [...hitsToIssues(blocks), ...(review?.issues ?? [])];
    if (!issues.length) {
      issues.push({
        problem: `Ryzyko oceniono na ${review?.risk ?? "?"}/100.`,
        fix: "Złagodź obietnice, dodaj uczciwą linię o ryzyku.",
      });
    }
    text = await deps.rewrite(text, input.ctx, issues);
  }
  return {
    status: "rejected",
    text,
    rulesVersion: COMPLIANCE_RULES_VERSION,
    iterations,
    reason: `Nie przeszło po ${MAX_GATE_ITERATIONS} poprawkach – temat wraca do banku.`,
  };
}
