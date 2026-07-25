// Odbieranie i przypisywanie wiadomości e-mail OD inwestorów.
//
// Gdy inwestor (zwłaszcza instytucjonalny) odpowiada na maila dystrybucyjnego,
// jego wiadomość NIE może trafić do świata leadów/klientów ani wywołać bota
// onboardingowego. Zamiast tego:
//   1) rozpoznajemy nadawcę po `investors.email`,
//   2) dopasowujemy odpowiedź do wniosku/dystrybucji (po nagłówkach wątku, a w
//      razie potrzeby po najnowszej dystrybucji do tego inwestora),
//   3) zapisujemy wiadomość w `lead_communications` z powiązaniem w metadata,
//   4) aktualizujemy `offer_distributions` (status „odpowiedź otrzymana").
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function admin(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export type InvestorRef = {
  id: string;
  company_name: string | null;
  first_name: string | null;
  last_name: string | null;
  investor_type: string;
};

export type InvestorReplyAttachment = {
  name: string;
  mime?: string | null;
  size?: number | null;
  path?: string | null;
  url?: string | null;
};

/** Zwraca inwestora dopasowanego po adresie e-mail (case-insensitive), albo null. */
export async function findInvestorByEmail(email: string): Promise<InvestorRef | null> {
  const clean = (email ?? "").trim().toLowerCase();
  if (!clean) return null;
  const { data } = await admin()
    .from("investors")
    .select("id, company_name, first_name, last_name, investor_type, email")
    .ilike("email", clean)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: (data as any).id,
    company_name: (data as any).company_name ?? null,
    first_name: (data as any).first_name ?? null,
    last_name: (data as any).last_name ?? null,
    investor_type: (data as any).investor_type,
  };
}

/** Normalizuje identyfikatory Message-Id z nagłówków In-Reply-To / References. */
function extractThreadIds(...raw: (string | null | undefined)[]): string[] {
  const ids = new Set<string>();
  for (const r of raw) {
    if (!r) continue;
    // Nagłówki mogą zawierać wiele id w nawiasach <...>, oddzielonych spacjami.
    const matches = String(r).match(/<[^>]+>|[^\s,<>]+/g) ?? [];
    for (const m of matches) {
      const v = m.replace(/^<|>$/g, "").trim();
      if (v) {
        ids.add(v);
        ids.add(`<${v}>`);
      }
    }
  }
  return Array.from(ids);
}

type MatchResult = { loanApplicationId: string | null; offerDistributionId: string | null };

/**
 * Dopasowuje odpowiedź inwestora do wniosku/dystrybucji:
 *   a) po nagłówkach wątku → wychodząca dystrybucja z tym `external_id`,
 *   b) w razie braku → najnowsza dystrybucja wysłana do tego inwestora.
 */
async function matchDistribution(investorId: string, threadIds: string[]): Promise<MatchResult> {
  const s = admin();

  if (threadIds.length) {
    const { data: outbound } = await s
      .from("lead_communications")
      .select("metadata, external_id, thread_external_id")
      .in("external_id", threadIds)
      .eq("channel", "email")
      .eq("direction", "outbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const meta = ((outbound as any)?.metadata ?? {}) as Record<string, any>;
    if (meta.loan_application_id) {
      return {
        loanApplicationId: meta.loan_application_id ?? null,
        offerDistributionId: meta.offer_distribution_id ?? null,
      };
    }
  }

  // Fallback: najnowsza dystrybucja do tego inwestora.
  const { data: dist } = await s
    .from("offer_distributions")
    .select("id, loan_application_id, sent_at, created_at")
    .eq("investor_id", investorId)
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (dist) {
    return {
      loanApplicationId: (dist as any).loan_application_id ?? null,
      offerDistributionId: (dist as any).id ?? null,
    };
  }
  return { loanApplicationId: null, offerDistributionId: null };
}

/**
 * Zapisuje odpowiedź inwestora i przypisuje ją do wniosku/dystrybucji.
 * Zwraca powiązania oraz id utworzonego wpisu komunikacji.
 */
export async function recordInvestorReply(opts: {
  investor: InvestorRef;
  fromEmail: string;
  fromName?: string | null;
  subject: string;
  content: string;
  html?: string | null;
  messageId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  emailId?: string | null;
  attachments?: InvestorReplyAttachment[];
}): Promise<{ loanApplicationId: string | null; offerDistributionId: string | null; communicationId: string | null }> {
  const s = admin();
  const threadIds = extractThreadIds(opts.inReplyTo, opts.references);
  const match = await matchDistribution(opts.investor.id, threadIds);

  const attachments = opts.attachments ?? [];
  const { data: inserted, error: insErr } = await (s.from("lead_communications") as any)
    .insert({
      lead_id: null,
      email: opts.fromEmail,
      channel: "email",
      direction: "inbound",
      status: "received",
      subject: opts.subject,
      content: opts.content,
      external_id: opts.messageId ?? null,
      thread_external_id: opts.inReplyTo ?? opts.messageId ?? null,
      metadata: {
        kind: "investor_reply",
        investor_id: opts.investor.id,
        loan_application_id: match.loanApplicationId,
        offer_distribution_id: match.offerDistributionId,
        from_name: opts.fromName ?? null,
        in_reply_to: opts.inReplyTo ?? null,
        references: opts.references ?? null,
        email_id: opts.emailId ?? null,
        html: opts.html ?? null,
        provider: "resend",
      },
      attachments,
    })
    .select("id")
    .maybeSingle();
  if (insErr) console.error("[investor-inbound] insert comm error", insErr);
  const communicationId = (inserted as any)?.id ?? null;

  // Podepnij załączniki inwestora pod dokumenty wniosku (jeśli mamy wniosek).
  if (match.loanApplicationId && attachments.length) {
    try {
      const rows = attachments
        .filter((a) => a.path)
        .map((a) => ({
          loan_application_id: match.loanApplicationId,
          document_type: "attachment_investor_reply",
          file_name: a.name,
          file_path: a.path,
          file_url: a.path,
          status: "received",
          visibility_level: "pelne" as const,
        }));
      if (rows.length) await (s.from("documents") as any).insert(rows);
    } catch (e) {
      console.error("[investor-inbound] attach docs error", e);
    }
  }

  // Zaktualizuj dystrybucję: odpowiedź otrzymana (bez cofania dalszych statusów).
  if (match.offerDistributionId) {
    try {
      const { data: cur } = await s
        .from("offer_distributions")
        .select("distribution_status, responded_at")
        .eq("id", match.offerDistributionId)
        .maybeSingle();
      const status = String((cur as any)?.distribution_status ?? "");
      const advanced = ["oferta_otrzymana", "zamkniete", "odrzucone"];
      const snippet = (opts.content ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
      const patch: Record<string, any> = {
        responded_at: (cur as any)?.responded_at ?? new Date().toISOString(),
        response_summary: [opts.subject, snippet].filter(Boolean).join(" — ").slice(0, 500),
      };
      if (!advanced.includes(status)) patch.distribution_status = "odpowiedz_otrzymana";
      await (s.from("offer_distributions") as any).update(patch).eq("id", match.offerDistributionId);
    } catch (e) {
      console.error("[investor-inbound] update distribution error", e);
    }
  }

  return {
    loanApplicationId: match.loanApplicationId,
    offerDistributionId: match.offerDistributionId,
    communicationId,
  };
}
