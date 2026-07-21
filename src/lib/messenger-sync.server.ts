// Pull istniejących rozmów Messenger / Instagram Direct z Meta Graph API do
// lead_communications. Webhook (meta-messaging.server) loguje TYLKO nowe
// wiadomości przychodzące w czasie rzeczywistym — rozmowy sprzed podłączenia
// webhooka albo takie, których ostatnia wiadomość przyszła zanim aplikacja
// zaczęła nasłuchiwać, nigdy nie trafiały do skrzynki. Ta funkcja odzyskuje je
// wstecz: przechodzi po wątkach strony (/{page}/conversations), zakłada/łączy
// leada po PSID/IGSID i dopisuje brakujące wiadomości (dedup po external_id
// = message id). Idempotentne — ponowne uruchomienie nie duplikuje wiadomości.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { upsertLeadFromSource } from "@/lib/lead-comms.server";

const GRAPH = "https://graph.facebook.com/v21.0";

// Bezpieczniki, żeby ręczny backfill nie odpytywał Meta w nieskończoność.
const MAX_CONVERSATIONS_PER_PAGE = 2000;
const MAX_MESSAGES_PER_CONVERSATION = 1000;

export type MessengerSyncResult = {
  pages: number;
  conversationsSeen: number;
  messagesNew: number;
  leadsCreated: number;
  errors: string[];
};

type PageInfo = { id: string; name: string | null; token: string };

/**
 * Odkrywa strony i ich tokeny. Preferuje /me/accounts (token użytkownika
 * zwraca wszystkie strony wraz z tokenami stron). Gdy skonfigurowany jest już
 * bezpośrednio token strony (bez uprawnień do /me/accounts) — fallback do /me,
 * które dla Page tokena zwraca id i nazwę strony.
 */
async function discoverPages(rootToken: string): Promise<PageInfo[]> {
  try {
    const res = await fetch(
      `${GRAPH}/me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(rootToken)}`,
    );
    const json: any = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(json?.data) && json.data.length) {
      return json.data.map((p: any) => ({
        id: String(p.id),
        name: p.name ?? null,
        token: p.access_token ?? rootToken,
      }));
    }
  } catch {
    /* noop — spróbuj fallbacku */
  }
  try {
    const res = await fetch(`${GRAPH}/me?fields=id,name&access_token=${encodeURIComponent(rootToken)}`);
    const json: any = await res.json().catch(() => ({}));
    if (res.ok && json?.id) return [{ id: String(json.id), name: json.name ?? null, token: rootToken }];
  } catch {
    /* noop */
  }
  return [];
}

/** Zbiór wszystkich znanych external_id kanału messenger (dedup wiadomości). */
async function loadKnownMessageIds(): Promise<Set<string>> {
  const known = new Set<string>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin
      .from("lead_communications")
      .select("external_id")
      .eq("channel", "messenger")
      .not("external_id", "is", null)
      .range(from, from + pageSize - 1);
    if (error || !data?.length) break;
    for (const r of data) if (r.external_id) known.add(r.external_id);
    if (data.length < pageSize) break;
  }
  return known;
}

function splitName(full: string | null | undefined): { first: string | null; last: string | null } {
  const t = String(full ?? "").trim();
  if (!t) return { first: null, last: null };
  const parts = t.split(/\s+/);
  return { first: parts[0] ?? null, last: parts.slice(1).join(" ") || null };
}

/**
 * Znajduje leada po PSID/IGSID, a gdy go nie ma — próbuje scalić z istniejącym
 * leadem o tym samym imieniu i nazwisku (np. lead z reklamy bez PSID), zanim
 * utworzy nowego. Zwraca też, czy powstał nowy rekord.
 */
async function findOrCreateLead(opts: {
  senderId: string;
  platform: "messenger" | "instagram";
  name: string | null;
}): Promise<{ leadId: string | null; created: boolean }> {
  const col = opts.platform === "messenger" ? "messenger_psid" : "instagram_igsid";

  const { data: existing } = await supabaseAdmin.from("leads").select("id").eq(col, opts.senderId).maybeSingle();
  if (existing?.id) return { leadId: existing.id, created: false };

  const { first, last } = splitName(opts.name);
  if (first && last) {
    const { data: match } = await supabaseAdmin
      .from("leads")
      .select("id")
      .is(col, null)
      .ilike("first_name", first)
      .ilike("last_name", last)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (match?.id) {
      await supabaseAdmin.from("leads").update({ [col]: opts.senderId } as any).eq("id", match.id);
      return { leadId: match.id, created: false };
    }
  }

  const leadId = await upsertLeadFromSource({
    source: opts.platform === "messenger" ? "messenger" : "instagram",
    firstName: first,
    lastName: last,
    applicationData: { [col]: opts.senderId },
  });
  if (leadId) {
    await supabaseAdmin.from("leads").update({ [col]: opts.senderId } as any).eq("id", leadId);
  }
  return { leadId, created: !!leadId };
}

/** Zbiera wszystkie wiadomości wątku, podążając za paginacją messages.paging.next. */
async function fetchAllMessages(firstPage: any, token: string): Promise<any[]> {
  const out: any[] = Array.isArray(firstPage?.data) ? [...firstPage.data] : [];
  let next: string | null = firstPage?.paging?.next ?? null;
  while (next && out.length < MAX_MESSAGES_PER_CONVERSATION) {
    const r = await fetch(next);
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || !Array.isArray(j?.data)) break;
    out.push(...j.data);
    next = j?.paging?.next ?? null;
  }
  return out.slice(0, MAX_MESSAGES_PER_CONVERSATION);
}

async function syncPageConversations(
  page: PageInfo,
  platform: "messenger" | "instagram",
  known: Set<string>,
  result: MessengerSyncResult,
): Promise<void> {
  const platformQs = platform === "instagram" ? "&platform=instagram" : "";
  let url: string | null =
    `${GRAPH}/${page.id}/conversations?fields=id,updated_time,participants,` +
    `messages.limit(50){id,message,from,created_time,attachments}` +
    `&limit=50${platformQs}&access_token=${encodeURIComponent(page.token)}`;

  let seen = 0;
  while (url && seen < MAX_CONVERSATIONS_PER_PAGE) {
    const res = await fetch(url);
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      result.errors.push(`${platform} ${page.name ?? page.id}: ${json?.error?.message ?? res.status}`);
      return;
    }
    const conversations: any[] = json?.data ?? [];
    for (const conv of conversations) {
      seen += 1;
      result.conversationsSeen += 1;

      // Uczestnik będący klientem — ten, którego id != id strony.
      const participants: any[] = conv?.participants?.data ?? [];
      const user = participants.find((p) => p?.id && String(p.id) !== page.id);
      const userId = user ? String(user.id) : null;
      if (!userId) continue;

      const { leadId, created } = await findOrCreateLead({ senderId: userId, platform, name: user?.name ?? null });
      if (!leadId) continue;
      if (created) result.leadsCreated += 1;

      const messages = await fetchAllMessages(conv?.messages ?? {}, page.token);
      const rows: any[] = [];
      for (const m of messages) {
        const mid = m?.id ? String(m.id) : null;
        if (!mid || known.has(mid)) continue;
        known.add(mid);

        const fromId = m?.from?.id ? String(m.from.id) : null;
        const inbound = fromId !== page.id;
        const hasAttachments = Array.isArray(m?.attachments?.data) && m.attachments.data.length > 0;
        const text = (m?.message ?? "").trim();
        if (!text && !hasAttachments) continue;

        rows.push({
          lead_id: leadId,
          channel: "messenger",
          direction: inbound ? "inbound" : "outbound",
          content: text || "[załącznik]",
          external_id: mid,
          thread_external_id: conv?.id ?? null,
          created_at: m?.created_time ?? undefined,
          status: inbound ? "received" : "sent",
          metadata: {
            platform,
            sender_id: userId,
            source: "graph_sync",
            conversation_id: conv?.id ?? null,
            from_id: fromId,
            has_attachments: hasAttachments,
          },
        });
      }

      if (rows.length) {
        const { error } = await supabaseAdmin.from("lead_communications").insert(rows as any);
        if (error) result.errors.push(`insert ${leadId}: ${error.message}`);
        else result.messagesNew += rows.length;
      }
    }

    url = json?.paging?.next ?? null;
  }
}

/**
 * Odzyskuje historię rozmów Messenger (i opcjonalnie Instagram Direct) z Meta.
 * Bezpieczne do wielokrotnego uruchamiania — dedup po id wiadomości.
 */
export async function syncMessengerConversations(opts?: {
  platform?: "messenger" | "instagram" | "both";
}): Promise<MessengerSyncResult> {
  const result: MessengerSyncResult = {
    pages: 0,
    conversationsSeen: 0,
    messagesNew: 0,
    leadsCreated: 0,
    errors: [],
  };

  const rootToken =
    process.env.META_ACCESS_TOKEN ??
    process.env.META_PAGE_ACCESS_TOKEN ??
    process.env.META_IG_PAGE_ACCESS_TOKEN;
  if (!rootToken) {
    result.errors.push("Brak tokenu Meta (META_ACCESS_TOKEN / META_PAGE_ACCESS_TOKEN).");
    return result;
  }

  const pages = await discoverPages(rootToken);
  result.pages = pages.length;
  if (!pages.length) {
    result.errors.push("Nie udało się odkryć żadnej strony (sprawdź token i uprawnienia).");
    return result;
  }

  const known = await loadKnownMessageIds();
  const wanted = opts?.platform ?? "messenger";
  const platforms: ("messenger" | "instagram")[] =
    wanted === "both" ? ["messenger", "instagram"] : [wanted];

  for (const page of pages) {
    for (const platform of platforms) {
      try {
        await syncPageConversations(page, platform, known, result);
      } catch (e: any) {
        result.errors.push(`${platform} ${page.name ?? page.id}: ${e?.message ?? e}`);
      }
    }
  }

  return result;
}
