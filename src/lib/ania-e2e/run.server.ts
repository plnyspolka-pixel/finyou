// Test end-to-end Ani na produkcji (MCP `run_ania_e2e`).
//
// Każdy scenariusz idzie przez TEN SAM kod co prawdziwa wiadomość z Facebooka
// (`handleMessagingEvent` / `handleFeedChange`): lead, wzbogacenie, prośba
// o telefon, wybór agenta, tura w prawdziwym ElevenLabs. Różni się tylko
// nadawcą `e2e-…`, przez co nic nie wychodzi do klientów (patrz e2e-sandbox).
// Po teście leady, wiadomości i ślady narzędzi są usuwane.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { A0_TEXT_AGENT_ID, A2P_TEXT_AGENT_ID } from "@/lib/ania-lead-context";
import { clearE2eOutbound, e2eOutboundFor, E2E_PREFIX, E2E_THREAD_PREFIX } from "@/lib/e2e-sandbox";
import { type CheckResult, coversTranscript, textChecks } from "./checks";
import { FORM, investorFormText, SCENARIOS, type Scenario, type StepExpect } from "./scenarios";

const AGENT_IDS: Record<"A2P" | "A0", string> = { A2P: A2P_TEXT_AGENT_ID, A0: A0_TEXT_AGENT_ID };
const AGENT_NAMES: Record<string, string> = {
  [A2P_TEXT_AGENT_ID]: "A2P (inwestor)",
  [A0_TEXT_AGENT_ID]: "A0 (recepcja)",
};
/** Odstęp między wiadomościami klienta — strażnik pętli bot-bot liczy szybkie odpowiedzi. */
const STEP_GAP_MS = 6_000;

export type StepReport = {
  client: string;
  bot: string | null;
  source: string | null;
  agent: string | null;
  elConversationId: string | null;
  elTools: string[];
  checks: CheckResult[];
};

export type ScenarioReport = {
  id: string;
  title: string;
  pass: boolean;
  steps: StepReport[];
  error?: string;
};

export type E2eReport = {
  runId: string;
  startedAt: string;
  durationSec: number;
  pass: boolean;
  passed: number;
  failed: number;
  judge: "claude" | "brak klucza ANTHROPIC_API_KEY — ocena trafności pominięta";
  scenarios: ScenarioReport[];
  cleanup?: { leads: number; errors: string[] } | "pominięte (keep_data)";
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function judgeReply(
  criterion: string,
  history: Array<{ who: "klient" | "Ania"; text: string }>,
  reply: string,
): Promise<CheckResult> {
  const { claudeJson, isClaudeConfigured } = await import("@/lib/claude-json.server");
  if (!isClaudeConfigured()) {
    return { name: "trafność (model oceniający)", pass: true, detail: "pominięto — brak klucza" };
  }
  try {
    const out = await claudeJson<{ pass: boolean; reason: string }>({
      label: "ania_e2e_judge",
      effort: "low",
      maxTokens: 400,
      system:
        "Oceniasz jedną odpowiedź Ani — asystentki Finance You (pożyczki pod zastaw nieruchomości, inwestorzy) — na Messengerze. " +
        "Oceniaj surowo, wyłącznie według podanego kryterium. Uzasadnienie: jedno zdanie po polsku.",
      content: [
        {
          type: "text",
          text:
            `KRYTERIUM: ${criterion}\n\nROZMOWA:\n` +
            history.map((h) => `${h.who}: ${h.text}`).join("\n") +
            `\n\nODPOWIEDŹ ANI DO OCENY:\n${reply}`,
        },
      ],
      schema: {
        type: "object",
        additionalProperties: false,
        properties: { pass: { type: "boolean" }, reason: { type: "string" } },
        required: ["pass", "reason"],
      },
    });
    return { name: "trafność (model oceniający)", pass: out.pass, detail: out.reason };
  } catch (e) {
    return {
      name: "trafność (model oceniający)",
      pass: false,
      detail: `ocena nieudana: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/** Stan rozmowy w ElevenLabs: czy nie zerwana i czy odpowiedź jest cała. */
async function elevenLabsChecks(conversationId: string, reply: string): Promise<CheckResult[]> {
  const { getConversation } = await import("@/lib/elevenlabs-api.server");
  let conv: any = null;
  // Transkrypt dochodzi z opóźnieniem — kilka prób.
  for (let i = 0; i < 4; i++) {
    try {
      conv = await getConversation(conversationId);
    } catch {
      conv = null;
    }
    // Transkrypt jest gotowy, gdy rozmowa się zakończyła (done / failed).
    if (conv && conv.status !== "processing" && conv.status !== "in-progress") break;
    await sleep(2_500);
  }
  if (!conv) return [{ name: "rozmowa w ElevenLabs", pass: false, detail: "nie udało się pobrać" }];
  const termination = String(conv?.metadata?.termination_reason ?? "");
  const broken = conv.status === "failed" || /missing|error|invalid/i.test(termination);
  const checks: CheckResult[] = [
    {
      name: "rozmowa w ElevenLabs nie zerwana",
      pass: !broken,
      detail: broken ? `status ${conv.status}: ${termination}` : undefined,
    },
  ];
  const cover = coversTranscript(reply, conv.transcript ?? []);
  checks.push({
    name: "cała wypowiedź agenta dotarła",
    pass: cover.pass,
    detail: cover.pass ? undefined : `brakuje: ${cover.missing.join(" | ")}`,
  });
  return checks;
}

async function createTestLead(psid: string, runId: string, firstName?: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("leads")
    .insert({
      type: "pozyczkowy",
      source: "messenger",
      first_name: firstName ?? null,
      messenger_psid: psid,
      application_data: { messenger_psid: psid, e2e_run: runId },
    } as any)
    .select("id")
    .single();
  if (error || !data) throw new Error(`lead testowy: ${error?.message ?? "brak id"}`);
  return data.id;
}

async function lastOutbound(leadId: string, after: string) {
  const { data } = await supabaseAdmin
    .from("lead_communications")
    .select("content, metadata, created_at")
    .eq("lead_id", leadId)
    .eq("direction", "outbound")
    .gt("created_at", after)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { content: string | null; metadata: any } | null;
}

async function runDm(
  sc: Extract<Scenario, { kind: "dm" }>,
  runId: string,
  index: number,
): Promise<ScenarioReport> {
  const psid = `${E2E_PREFIX}${runId}-${index}`;
  const phone = `100 200 ${String(310 + index)}`;
  const email = `e2e+${runId}-${index}@example.invalid`;
  const leadId = await createTestLead(psid, runId, sc.firstName);
  const { handleMessagingEvent } = await import("@/lib/meta-messaging.server");
  const steps: StepReport[] = [];
  const history: Array<{ who: "klient" | "Ania"; text: string }> = [];

  for (let i = 0; i < sc.steps.length; i++) {
    const step = sc.steps[i];
    if (i > 0) await sleep(STEP_GAP_MS);
    const text =
      step.text === FORM ? investorFormText(sc.firstName ?? "Jan", phone, email) : step.text;
    const before = new Date(Date.now() - 1_000).toISOString();
    const sentBefore = e2eOutboundFor(psid).length;
    await handleMessagingEvent(
      { sender: { id: psid }, message: { mid: `${psid}-m${i}`, text } },
      "messenger",
    );
    const sent = e2eOutboundFor(psid).slice(sentBefore);
    const bot = sent.length ? sent.map((m) => m.text).join("\n") : null;
    const log = await lastOutbound(leadId, before);
    const meta = log?.metadata ?? {};
    const { data: lead } = await supabaseAdmin
      .from("leads")
      .select("type, status")
      .eq("id", leadId)
      .maybeSingle();

    const report: StepReport = {
      client: text,
      bot,
      source: meta.kind ?? (meta.engine ? `agent:${meta.engine}` : null),
      agent: null,
      elConversationId: meta.el_conversation_id ?? null,
      elTools: (meta.el_tools ?? []).map((t: any) => t.name),
      checks: await stepChecks(step.expect, {
        bot,
        meta,
        lead,
        history: [...history, { who: "klient", text }],
      }),
    };
    if (report.elConversationId) {
      const { getConversation } = await import("@/lib/elevenlabs-api.server");
      try {
        const conv: any = await getConversation(report.elConversationId);
        report.agent = AGENT_NAMES[conv?.agent_id] ?? conv?.agent_id ?? null;
        if (step.expect.agent) {
          report.checks.push({
            name: `prowadzi ${step.expect.agent}`,
            pass: conv?.agent_id === AGENT_IDS[step.expect.agent],
            detail: `odpowiedział ${report.agent ?? "nieznany agent"}`,
          });
        }
      } catch {
        /* sprawdzenie stanu rozmowy niżej zgłosi błąd */
      }
    }
    steps.push(report);
    history.push({ who: "klient", text });
    if (bot) history.push({ who: "Ania", text: bot });
  }
  return {
    id: sc.id,
    title: sc.title,
    pass: steps.every((s) => s.checks.every((c) => c.pass)),
    steps,
  };
}

async function stepChecks(
  expect: StepExpect,
  ctx: {
    bot: string | null;
    meta: any;
    lead: { type: string | null; status: string | null } | null;
    history: Array<{ who: "klient" | "Ania"; text: string }>;
  },
): Promise<CheckResult[]> {
  const { bot, meta, lead } = ctx;
  const checks: CheckResult[] = [];
  if (!expect.reply) {
    checks.push({ name: "bot milczy", pass: !bot, detail: bot ?? undefined });
    return checks;
  }
  checks.push({ name: "bot odpisał", pass: Boolean(bot) });
  if (!bot) return checks;
  checks.push(...textChecks(bot));

  if (expect.source === "agent") {
    checks.push({
      name: "odpowiedział agent ElevenLabs (nie silnik zapasowy)",
      pass: meta.engine === "elevenlabs",
      detail:
        meta.engine === "elevenlabs"
          ? undefined
          : `silnik: ${meta.engine ?? "?"}; błąd: ${meta.el_error ?? "—"}`,
    });
    if (meta.el_conversation_id)
      checks.push(...(await elevenLabsChecks(meta.el_conversation_id, bot)));
    else if (meta.el_error) {
      checks.push({ name: "rozmowa w ElevenLabs nie zerwana", pass: false, detail: meta.el_error });
    }
  } else if (expect.source) {
    checks.push({
      name:
        expect.source === "call_request_saved"
          ? "prośba o telefon zapisana"
          : "bot poprosił o numer",
      pass: meta.kind === expect.source,
      detail: `obsługa: ${meta.kind ?? meta.engine ?? "?"}`,
    });
  }
  if (expect.leadType) {
    checks.push({
      name: `lead ${expect.leadType}`,
      pass: lead?.type === expect.leadType,
      detail: `typ: ${lead?.type ?? "?"}`,
    });
  }
  if (expect.leadStatus) {
    checks.push({
      name: `status ${expect.leadStatus}`,
      pass: lead?.status === expect.leadStatus,
      detail: `status: ${lead?.status ?? "?"}`,
    });
  }
  for (const s of expect.mustInclude ?? []) {
    checks.push({ name: `zawiera „${s}”`, pass: bot.includes(s) });
  }
  if (expect.judge) checks.push(await judgeReply(expect.judge, ctx.history, bot));
  return checks;
}

async function runComment(
  sc: Extract<Scenario, { kind: "comment" }>,
  runId: string,
  index: number,
): Promise<ScenarioReport> {
  const psid = `${E2E_PREFIX}${runId}-${index}`;
  const commentId = `${E2E_PREFIX}${runId}-c${index}`;
  const leadId = await createTestLead(psid, runId);
  const { handleFeedChange } = await import("@/lib/meta-messaging.server");
  const before = new Date(Date.now() - 1_000).toISOString();
  await handleFeedChange(
    {
      item: "comment",
      verb: "add",
      comment_id: commentId,
      post_id: `${E2E_PREFIX}${runId}-post`,
      from: { id: psid, name: sc.authorName },
      message: sc.text,
    },
    "e2e-page",
  );
  const sent = e2eOutboundFor(commentId);
  const pub = sent.find((m) => m.kind === "comment_public")?.text ?? null;
  const priv = sent.find((m) => m.kind === "comment_private")?.text ?? null;
  const checks: CheckResult[] = [
    {
      name: sc.expect.publicReply
        ? "odpowiedź publiczna pod komentarzem"
        : "brak odpowiedzi publicznej",
      pass: Boolean(pub) === sc.expect.publicReply,
      detail: pub ?? undefined,
    },
    {
      name: sc.expect.privateReply ? "wiadomość prywatna" : "brak wiadomości prywatnej",
      pass: Boolean(priv) === sc.expect.privateReply,
    },
  ];
  if (pub) checks.push(...textChecks(pub).map((c) => ({ ...c, name: `publiczna: ${c.name}` })));
  let elConversationId: string | null = null;
  let elTools: string[] = [];
  if (priv) {
    checks.push(...textChecks(priv));
    const log = await lastOutbound(leadId, before);
    const meta = log?.metadata ?? {};
    elConversationId = meta.el_conversation_id ?? null;
    elTools = (meta.el_tools ?? []).map((t: any) => t.name);
    checks.push({
      name: "odpowiedział agent ElevenLabs (nie silnik zapasowy)",
      pass: meta.engine === "elevenlabs",
      detail:
        meta.engine === "elevenlabs"
          ? undefined
          : `silnik: ${meta.engine ?? "?"}; błąd: ${meta.el_error ?? "—"}`,
    });
    if (elConversationId) checks.push(...(await elevenLabsChecks(elConversationId, priv)));
    if (sc.expect.judge) {
      checks.push(await judgeReply(sc.expect.judge, [{ who: "klient", text: sc.text }], priv));
    }
  }
  return {
    id: sc.id,
    title: sc.title,
    pass: checks.every((c) => c.pass),
    steps: [
      {
        client: `[komentarz] ${sc.text}`,
        bot:
          [pub && `[publicznie] ${pub}`, priv && `[prywatnie] ${priv}`]
            .filter(Boolean)
            .join("\n") || null,
        source: priv ? "agent" : null,
        agent: null,
        elConversationId,
        elTools,
        checks,
      },
    ],
  };
}

/** Usuwa wszystko, co zostawił test (tylko leady z PSID `e2e-…`). */
export async function cleanupE2e(runId?: string): Promise<{ leads: number; errors: string[] }> {
  const psidLike = `${E2E_PREFIX}${runId ? `${runId}-` : ""}%`;
  const errors: string[] = [];
  const note = (what: string, error: { message: string } | null) => {
    if (error) errors.push(`${what}: ${error.message}`);
  };
  const { data: leads, error } = await supabaseAdmin
    .from("leads")
    .select("id")
    .like("messenger_psid", psidLike);
  note("leady", error);
  const ids = (leads ?? []).map((l) => l.id);
  for (const id of ids) {
    note(
      "ślady narzędzi",
      (
        await supabaseAdmin
          .from("automation_events")
          .delete()
          .eq("automation_type", "e2e_tool_call")
          .eq("sent_payload->>thread_key", `${E2E_THREAD_PREFIX}${id}`)
      ).error,
    );
    note(
      "wiadomości",
      (await supabaseAdmin.from("lead_communications").delete().eq("lead_id", id)).error,
    );
    note(`lead ${id}`, (await supabaseAdmin.from("leads").delete().eq("id", id)).error);
  }
  note(
    "wyciszenia",
    (await supabaseAdmin.from("comms_suppressions").delete().like("identifier", psidLike)).error,
  );
  clearE2eOutbound(runId ? `${E2E_PREFIX}${runId}` : E2E_PREFIX);
  return { leads: ids.length, errors };
}

export async function runAniaE2e(
  opts: { only?: string[]; keepData?: boolean } = {},
): Promise<E2eReport> {
  const started = Date.now();
  const runId = Math.random().toString(36).slice(2, 8);
  const selected = SCENARIOS.filter((s) => !opts.only?.length || opts.only.includes(s.id));
  const { isClaudeConfigured } = await import("@/lib/claude-json.server");
  let scenarios: ScenarioReport[] = [];
  let cleanup: E2eReport["cleanup"] = "pominięte (keep_data)";
  try {
    // Scenariusze są od siebie niezależne (osobne leady) — równolegle.
    scenarios = await Promise.all(
      selected.map(async (sc, i): Promise<ScenarioReport> => {
        try {
          return sc.kind === "dm" ? await runDm(sc, runId, i) : await runComment(sc, runId, i);
        } catch (e) {
          return {
            id: sc.id,
            title: sc.title,
            pass: false,
            steps: [],
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }),
    );
  } finally {
    if (!opts.keepData) {
      cleanup = await cleanupE2e(runId).catch((e) => ({ leads: 0, errors: [String(e)] }));
    }
  }
  const passed = scenarios.filter((s) => s.pass).length;
  return {
    runId,
    startedAt: new Date(started).toISOString(),
    durationSec: Math.round((Date.now() - started) / 1000),
    pass: passed === scenarios.length,
    passed,
    failed: scenarios.length - passed,
    judge: isClaudeConfigured()
      ? "claude"
      : "brak klucza ANTHROPIC_API_KEY — ocena trafności pominięta",
    scenarios,
    cleanup,
  };
}
