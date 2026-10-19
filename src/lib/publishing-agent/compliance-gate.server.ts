/**
 * Bramka compliance — warstwa serwerowa: audyt decyzji, recenzent LLM
 * niezależny od autora i pętla naprawcza (brief 5.7 p. 3–6).
 *
 *  - `enforcePublicationGate` — wołane przez publikatory przed wysyłką;
 *    deterministyczne (bez LLM, bez kosztu), zapisuje audyt i dopisane elementy.
 *  - `runComplianceLoop` — dla treści pisanych przez agenta: reguły twarde +
 *    recenzent LLM (inny model i osobny prompt niż autor), maks. 3 iteracje
 *    przepisania; potem odrzucenie i powrót tematu do banku. Nic nie czeka
 *    na człowieka.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  checkHardRules,
  COMPLIANCE_RULES_VERSION,
  type ComplianceContext,
  type ComplianceViolation,
} from "./compliance-rules";
import { decidePublicationGate, type PublicationGateInput, type PublicationGateResult } from "./publication-gate";
import { logAgentAction } from "./agent-settings.server";

export const MAX_REWRITE_ITERATIONS = 3;

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function recordComplianceCheck(row: {
  contentKind: string;
  track: string | null;
  subjectType: string;
  subjectId?: string | null;
  stage: "authoring" | "pre_publish" | "post_publish";
  decision: "pass" | "fixed" | "rewrite" | "reject";
  iteration?: number;
  violations?: ComplianceViolation[];
  added?: string[];
  reviewer?: unknown;
  finalText: string;
}): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("ai_compliance_checks")
      .insert({
        rules_version: COMPLIANCE_RULES_VERSION,
        content_kind: row.contentKind,
        track: row.track,
        subject_type: row.subjectType,
        subject_id: row.subjectId ?? null,
        stage: row.stage,
        decision: row.decision,
        iteration: row.iteration ?? 1,
        violations: (row.violations ?? []) as never,
        added_elements: (row.added ?? []) as never,
        reviewer: (row.reviewer ?? null) as never,
        text_sha256: await sha256(row.finalText),
        final_text: row.finalText.slice(0, 20000),
      })
      .select("id")
      .single();
    if (error) return null;
    return data.id;
  } catch {
    return null; // audyt nie może wywalić publikacji (tabela przed migracją)
  }
}

export type QueueTable = "social_publish_queue" | "youtube_publish_queue";

/**
 * Bramka przed publikacją wpisu kolejki. Przy `reject` publikator NIE wysyła
 * i oznacza wpis `failed` z powodem (bez ponowień — treść trzeba poprawić).
 * Przy `fixed` zapisuje nowy opis w wierszu i zwraca go do wysyłki.
 */
export async function enforcePublicationGate(
  table: QueueTable,
  id: string,
  input: PublicationGateInput,
): Promise<PublicationGateResult> {
  const result = decidePublicationGate(input);
  const checkId = await recordComplianceCheck({
    contentKind: "caption",
    track: result.track,
    subjectType: table,
    subjectId: id,
    stage: "pre_publish",
    decision: result.decision,
    violations: result.violations,
    added: result.added,
    finalText: `${input.title}\n\n${result.body}`,
  });

  const bodyColumn = table === "youtube_publish_queue" ? "description" : "message";
  if (result.decision === "fixed") {
    await supabaseAdmin.from(table).update({ [bodyColumn]: result.body } as never).eq("id", id);
  }
  // Kolumny audytu w osobnym zapisie: przed migracją ich nie ma, a to nie
  // może zablokować publikacji.
  // (błąd zapisu ignorujemy świadomie).
  await supabaseAdmin
    .from(table)
    .update({
      compliance_check_id: checkId,
      compliance_rules_version: result.rulesVersion,
      ...(result.track && !input.track ? { audience_track: result.track } : {}),
    } as never)
    .eq("id", id);

  if (result.decision === "reject") {
    await logAgentAction({
      action: "compliance_block_publication",
      status: "blocked",
      summary: `${input.platform}: ${result.reason ?? "odrzucone"}`.slice(0, 1000),
      payload: { table, id, platform: input.platform, violations: result.violations },
    });
  }
  return result;
}

/** Komunikat do `last_error` przy odrzuceniu. */
export function gateRejectMessage(r: PublicationGateResult): string {
  return `${r.reason ?? "Bramka compliance odrzuciła treść."} Popraw treść i kliknij „Ponów”.`;
}

// ── Recenzent LLM i pętla naprawcza ─────────────────────────────────────

export interface ReviewerVerdict {
  approved: boolean;
  risk: "low" | "medium" | "high";
  issues: Array<{ problem: string; fix: string }>;
  model: string;
}

const REVIEWER_SYSTEM = `Jesteś niezależnym recenzentem zgodności komunikacji finansowej (Polska, KNF/ESMA, AI Act art. 50). Nie jesteś autorem tekstu i nie piszesz go od nowa — oceniasz ryzyko i zwracasz konkretne poprawki.
Marka: Finance You sp. z o.o. (KRS 0000635207) — platforma B2B kojarząca przedsiębiorców potrzebujących finansowania pod zastaw nieruchomości (wyłącznie cel gospodarczy) z prywatnymi inwestorami.
Odrzuć (approved=false), gdy tekst: wprowadza w błąd; obiecuje zysk, stopę zwrotu, oprocentowanie lub bezpieczeństwo kapitału; bagatelizuje ryzyko; wywiera presję na osoby w trudnej sytuacji; kieruje finansowanie do konsumentów; zaprasza do zamkniętych grup; przedstawia instytucje jako rekomendację; podaje ceny w wideo; ujawnia dane osób; awatar AI składa ofertę lub mówi o stopach zwrotu; tekst nie pasuje do toru odbiorcy.
Dopuszczalne: edukacja o mechanizmach (LTV, hipoteka, księga wieczysta, egzekucja), motyw szansy z wyraźnym beatem ryzyka, pytania-hooki, CTA do obserwowania i do darmowego materiału.`;

export async function reviewWithLlm(text: string, ctx: ComplianceContext): Promise<ReviewerVerdict | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return null;
  // Inny model niż autor (domyślnie autorzy jadą na gemini-2.5-flash).
  const model = process.env.AGENT_COMPLIANCE_REVIEW_MODEL || "google/gemini-2.5-pro";
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: REVIEWER_SYSTEM },
          {
            role: "user",
            content: `Rodzaj treści: ${ctx.kind}. Tor: ${ctx.track ?? "nieokreślony"}. Treść AI (awatar): ${ctx.aiGenerated ? "tak" : "nie"}.\n\nTEKST:\n${text}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "verdict",
              parameters: {
                type: "object",
                properties: {
                  approved: { type: "boolean" },
                  risk: { type: "string", enum: ["low", "medium", "high"] },
                  issues: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { problem: { type: "string" }, fix: { type: "string" } },
                      required: ["problem", "fix"],
                    },
                  },
                },
                required: ["approved", "risk", "issues"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "verdict" } },
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
    };
    const args = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return null;
    const v = JSON.parse(args) as Omit<ReviewerVerdict, "model">;
    return { approved: !!v.approved && v.risk !== "high", risk: v.risk, issues: v.issues ?? [], model };
  } catch {
    return null;
  }
}

export interface LoopResult {
  ok: boolean;
  text: string;
  iterations: number;
  violations: ComplianceViolation[];
  reviewer: ReviewerVerdict | null;
  reason?: string;
}

/**
 * Pętla naprawcza dla treści autorstwa agenta. `rewrite` dostaje tekst
 * i listę uwag; zwraca nową wersję. Recenzent niedostępny (brak klucza,
 * błąd) = decydują same reguły twarde — fail-closed tylko na regułach.
 */
export async function runComplianceLoop(opts: {
  text: string;
  ctx: ComplianceContext;
  subjectType: string;
  subjectId?: string | null;
  rewrite: (text: string, feedback: string[]) => Promise<string>;
  useReviewer?: boolean;
}): Promise<LoopResult> {
  let text = opts.text;
  let lastViolations: ComplianceViolation[] = [];
  let lastReview: ReviewerVerdict | null = null;
  for (let i = 1; i <= MAX_REWRITE_ITERATIONS; i++) {
    lastViolations = checkHardRules(text, opts.ctx);
    lastReview = lastViolations.length === 0 && opts.useReviewer !== false ? await reviewWithLlm(text, opts.ctx) : null;
    const passed = lastViolations.length === 0 && (lastReview == null || lastReview.approved);
    const feedback = [
      ...lastViolations.map((v) => `${v.message} Fragment: „${v.match}”. ${v.fix}`),
      ...(lastReview?.approved === false ? lastReview.issues.map((x) => `${x.problem} → ${x.fix}`) : []),
    ];
    const last = i === MAX_REWRITE_ITERATIONS;
    await recordComplianceCheck({
      contentKind: opts.ctx.kind,
      track: opts.ctx.track ?? null,
      subjectType: opts.subjectType,
      subjectId: opts.subjectId,
      stage: "authoring",
      decision: passed ? "pass" : last ? "reject" : "rewrite",
      iteration: i,
      violations: lastViolations,
      reviewer: lastReview,
      finalText: text,
    });
    if (passed) return { ok: true, text, iterations: i, violations: [], reviewer: lastReview };
    if (last) break;
    text = await opts.rewrite(text, feedback);
  }
  return {
    ok: false,
    text,
    iterations: MAX_REWRITE_ITERATIONS,
    violations: lastViolations,
    reviewer: lastReview,
    reason: "Treść nie przeszła bramki po 3 iteracjach — odrzucona, temat wraca do banku.",
  };
}
