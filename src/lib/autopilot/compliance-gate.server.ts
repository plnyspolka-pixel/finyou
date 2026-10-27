// Bramka compliance – warstwa serwerowa: recenzent (Claude, gdy jest klucz;
// inaczej Gemini Pro z osobnym promptem), autor poprawek (Gemini Flash) i
// audyt każdej decyzji w ai_growth_action_log (module = compliance_gate).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { claudeJson, isClaudeConfigured } from "@/lib/claude-json.server";
import { AI_MODEL_FAST, AI_MODEL_PRO, lovableAiJson } from "@/lib/lovable-ai.server";
import { currentDateContextPl } from "./date-context";
import {
  runGateLoop,
  type GateDeps,
  type GateResult,
  type ReviewIssue,
  type ReviewResult,
} from "./compliance-gate";
import type { RuleContext } from "./compliance-rules";
import { COMPLIANCE_LOG_MODULE } from "./types";

const TRACK_PL = {
  pozyczkobiorca:
    "pożyczkobiorcy (pożyczki pod zastaw nieruchomości; cel gospodarczy weryfikowany przy wniosku — w rolkach go nie akcentujemy)",
  inwestor: "inwestorzy prywatni",
};

const REVIEWER_SYSTEM = `Jesteś niezależnym recenzentem zgodności treści marketingowych Finance You sp. z o.o. (platforma B2B finansowania pozabankowego pod zastaw nieruchomości oraz program dla prywatnych inwestorów). Nie jesteś autorem tekstu – oceniasz go krytycznie.
Oceń ryzyko (0–100) i zwróć konkretne poprawki. Sprawdź:
- wprowadzanie w błąd, obietnice zysku/zwrotu/finansowania, bagatelizowanie ryzyka wprost („bez ryzyka”, „bezpieczny/pewny zysk”, „kapitał chroni nieruchomość”), superlatywy bez pokrycia — brak zdania o ryzyku, koszcie albo możliwej stracie NIE jest bagatelizowaniem,
- sygnały ostrzegawcze KNF/ESMA wobec finfluencerów (zamknięte grupy, „sam inwestuję”, inwestowanie jako zabawa, presja czasu),
- ton wobec osób w trudnej sytuacji finansowej (bez straszenia i bez presji),
- zgodność z torem: pożyczkobiorca = pożyczka pod zastaw nieruchomości bez kierowania do konsumentów (nigdy „na dowolny cel”, „na wakacje”, „dla osób prywatnych”, kredyt konsumencki); w scenariuszach, tytułach i hookach rolek NIE wymagaj dopisywania „firma/przedsiębiorca/działalność” — decyzja właściciela: oferty nie akcentujemy jako „tylko dla firm” (te słowa najwyżej raz), warunki klient poznaje przy wniosku, a linię o celu gospodarczym ma stopka opisu; inwestor = szanse, fakty i mechanizm,
- awatar AI może edukować i odpowiadać na FAQ, nie składa ofert, nie podaje stóp zwrotu i nie wywiera presji.
Zatwierdzone mechanizmy (nie są naruszeniem): CTA „Skomentuj HASŁO, a wyślę Ci [bezpłatny materiał edukacyjny]” i „obserwuj profil” to lead magnet Finance You (bezpłatny PDF albo kalkulator za komentarz, zapis na listę dobrowolny przy pobraniu) — nie traktuj tego jak schematu finfluencerskiego ani ujawniania sytuacji widza; hook może nazywać sytuację widza („Bank odmówił?”), byle bez presji i straszenia; linia o ryzyku, linia o celu gospodarczym i oznaczenie AI są w stopce opisu, nie w scenariuszu.
ROLKI SĄ SPRZEDAŻOWE (decyzja właściciela 27.10.2026): scenariusz rolki przedstawia fakty, mechanizm i korzyść — bez zdań o ryzyku, koszcie („droższe niż bank”), możliwej stracie kapitału czy majątku, braku spłaty i egzekucji. Widz to wie; linia o ryzyku jest w stopce opisu publikacji. BRAK takiego zdania w scenariuszu, tytule czy hooku NIE jest naruszeniem i nie podnosi oceny ryzyka. NIGDY nie żądaj dopisania zdania o ryzyku, koszcie, stracie ani formułek („nie stanowi oferty/porady/rekomendacji”, „zwrot/wynik nie jest gwarantowany”, „wynik szacunkowy”, „materiał poglądowy”, „nie zastępuje analizy prawnej”, „decyzja zależy od finansującego”) — w żadnym rodzaju treści; tam, gdzie są wymagane, dokleja je automatycznie stopka. Jeśli scenariusz zawiera takie ostrzeżenia, możesz zalecić ich usunięcie.
ZATWIERDZONY JĘZYK MARKI (nie jest naruszeniem ani superlatywem): „zarabiaj tak, jak banki od stuleci”, porównanie mechanizmu do banku („jak bank”, „Bank vs Ty”, „działaj jak instytucja finansowa”), „zarabianie na nieruchomościach bez kupowania i remontowania”, formaty serii („Czy wiesz, że…”, „Nie mów / Powiedz”, „3 błędy”, „Mit vs fakt”, „Ile dostaniesz?”, „Bank odmówił?”, „Krok po kroku”) oraz nazwy lead magnetów z katalogu. Nie żądaj źródeł dla ogólnych tez edukacyjnych, nie oceniaj stylu, tonu promocyjnego, przykładów liczbowych LTV ani tego, co materiał „powinien” jeszcze zawierać.
Skala ryzyka: 0–30 = treść sprzedażowo-edukacyjna bez obietnic (bez zdania o ryzyku to nadal 0–30); 31–40 = drobne uwagi nieblokujące; powyżej 40 WYŁĄCZNIE przy realnym naruszeniu z listy (obietnica zysku/finansowania, konkretny % zwrotu, „bez ryzyka”, gwarancja, zamknięta grupa, „sam inwestuję”, presja czasu, kierowanie do konsumentów, cena).
Proporcjonalność: gdy nie ma naruszeń z listy, a ryzyko ≤ 40, zwróć verdict "ok" — uwagi stylistyczne i możliwe ulepszenia nie są powodem do "fix". "fix" tylko przy realnym problemie z listy (wtedy w "fix" wskaż, co USUNĄĆ albo przepisać neutralnie — nigdy co dopisać jako ostrzeżenie), "reject" gdy temat jest nie do uratowania.`;

const reviewSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    verdict: { type: "string", enum: ["ok", "fix", "reject"] },
    risk: { type: "integer" },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { problem: { type: "string" }, fix: { type: "string" } },
        required: ["problem", "fix"],
      },
    },
  },
  required: ["verdict", "risk", "issues"],
};

function reviewUserMsg(text: string, ctx: RuleContext): string {
  return `${currentDateContextPl()}
Rodzaj treści: ${ctx.kind}${ctx.platform ? `, platforma: ${ctx.platform}` : ""}.
Tor: ${ctx.track ? TRACK_PL[ctx.track] : "ogólny"}.

TREŚĆ DO OCENY:
"""
${text}
"""`;
}

function normalizeReview(r: Partial<ReviewResult> | null | undefined): ReviewResult {
  const verdict = r?.verdict === "ok" || r?.verdict === "reject" ? r.verdict : "fix";
  const risk = Math.max(0, Math.min(100, Math.round(Number(r?.risk ?? 100))));
  const issues = Array.isArray(r?.issues)
    ? r!.issues!.filter((i) => i && typeof i.problem === "string").slice(0, 10)
    : [];
  return { verdict, risk, issues };
}

export const llmGateDeps: GateDeps = {
  async review(text, ctx) {
    if (isClaudeConfigured()) {
      const r = await claudeJson<ReviewResult>({
        label: "compliance_review",
        system: REVIEWER_SYSTEM,
        content: [{ type: "text", text: reviewUserMsg(text, ctx) }],
        schema: reviewSchema,
        effort: "medium",
        maxTokens: 4000,
      });
      return normalizeReview(r);
    }
    // Bez klucza Anthropic: inny model niż autor (Pro vs Flash) i osobny prompt.
    const r = await lovableAiJson<ReviewResult>({
      model: AI_MODEL_PRO,
      system: `${REVIEWER_SYSTEM}\nZwróć wyłącznie JSON: {"verdict","risk","issues":[{"problem","fix"}]}.`,
      user: reviewUserMsg(text, ctx),
      temperature: 0,
    });
    return normalizeReview(r);
  },
  async rewrite(text, ctx, issues: ReviewIssue[]) {
    // Obietnicę się usuwa, a nie „równoważy” ostrzeżeniem — poprawki
    // dokładały zdania o ryzyku i stracie do rolek. Rolki są sprzedażowe, bez
    // zastrzeżeń (decyzja właściciela 27.10.2026); tam, gdzie linia o ryzyku
    // jest wymagana (opis, lead magnet, mail, reklama), dokleja ją stopka.
    const warningsRule =
      "Nie dopisuj żadnych zdań o ryzyku, koszcie, możliwej stracie ani formułek („nie stanowi oferty/porady”, „zwrot nie jest gwarantowany”, „wynik szacunkowy”, „materiał poglądowy”, „nie zastępuje analizy prawnej”), nawet jeśli uwaga o to prosi — elementy obowiązkowe dokleja automatycznie stopka. Jeśli tekst zawiera takie ostrzeżenia, usuń je.";
    const r = await lovableAiJson<{ text: string }>({
      model: AI_MODEL_FAST,
      system: `${currentDateContextPl()}
Jesteś autorem treści Finance You. Popraw tekst według uwag recenzenta zgodności, zachowując długość, styl (polski, hook w formie pytania, zadziornie, sprzedażowo, klient jest bohaterem) i sens. Nie dodawaj cen, stóp zwrotu ani obietnic.
Obietnicę lub superlatyw USUŃ albo przepisz neutralnie — nie równoważ ich kolejnym ostrzeżeniem. ${warningsRule}
Zwróć JSON {"text": "..."}.`,
      user: `Rodzaj: ${ctx.kind}; tor: ${ctx.track ?? "ogólny"}.
UWAGI:
${issues.map((i, n) => `${n + 1}. ${i.problem} → ${i.fix}`).join("\n")}

TEKST:
"""
${text}
"""`,
      temperature: 0.3,
    });
    const out = typeof r?.text === "string" ? r.text.trim() : "";
    if (!out) throw new Error("Autor poprawek zwrócił pusty tekst.");
    return out;
  },
};

/**
 * Pełna bramka z audytem. `ref` wiąże decyzję z obiektem (np. studio job,
 * wpis kolejki, lead magnet) – trafia do payloadu dziennika.
 */
export async function runComplianceGate(
  input: { text: string; ctx: RuleContext; ref?: Record<string, unknown> },
  deps: GateDeps = llmGateDeps,
): Promise<GateResult & { logId: string | null }> {
  const result = await runGateLoop({ text: input.text, ctx: input.ctx }, deps);
  const last = result.iterations[result.iterations.length - 1];
  const { data } = await supabaseAdmin
    .from("ai_growth_action_log")
    .insert({
      module: COMPLIANCE_LOG_MODULE,
      action: `gate_${input.ctx.kind}`,
      status: result.status === "rejected" ? "blocked" : "ok",
      summary: `[${result.status}] ${input.ctx.kind}${input.ctx.track ? `/${input.ctx.track}` : ""} – ${result.iterations.length} iter.${result.reason ? ` – ${result.reason}` : ""}`,
      payload: {
        rules_version: result.rulesVersion,
        ctx: input.ctx,
        ref: input.ref ?? null,
        status: result.status,
        reason: result.reason ?? null,
        original_text: input.text,
        final_text: result.text,
        iterations: result.iterations.map((it) => ({
          n: it.n,
          blocks: it.blocks.map((b) => ({ code: b.code, match: b.match ?? null })),
          review: it.review,
        })),
        last_risk: last?.review?.risk ?? null,
      } as never,
    })
    .select("id")
    .single();
  return { ...result, logId: data?.id ?? null };
}
