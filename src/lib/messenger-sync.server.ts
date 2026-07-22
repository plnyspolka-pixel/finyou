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
import { downloadAndStore, attachStoredToClientDocuments } from "@/lib/inbound-attachments.server";
import { ocrLeadAttachmentsAndEnrich } from "@/lib/lead-doc-intel.server";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";

const GRAPH = "https://graph.facebook.com/v21.0";

// Bezpieczniki, żeby ręczny backfill nie odpytywał Meta w nieskończoność.
const MAX_CONVERSATIONS_PER_PAGE = 2000;
const MAX_MESSAGES_PER_CONVERSATION = 1000;
// Ile wiadomości z załącznikami pobrać w jednym przebiegu (idempotentne, wznawialne).
const MAX_ATTACHMENT_MESSAGES_PER_RUN = 200;
// Ile leadów maksymalnie poddać OCR w jednym przebiegu (OCR to płatne wywołania AI).
const MAX_OCR_LEADS_PER_RUN = 60;

export type AttachmentBackfillResult = {
  messagesProcessed: number;
  attachmentsDownloaded: number;
  ocrProcessed: number;
  kwFound: number;
  errors: string[];
};

export type MessengerSyncResult = {
  pages: number;
  conversationsSeen: number;
  messagesNew: number;
  leadsCreated: number;
  errors: string[];
  /** Diagnostyka webhooka per strona — czy panel dostaje nowe wiadomości na żywo. */
  webhook: Array<{ page: string; subscribed: boolean; fields: string[]; note: string | null }>;
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

/**
 * Sprawdza, czy strona jest zasubskrybowana do webhooka aplikacji i czy w polu
 * subskrypcji jest `messages`. To najczęstsza przyczyna „panel przestał
 * pokazywać nowe rozmowy, choć token jest ważny" — token do wysyłki działa,
 * ale strona nie wypycha już zdarzeń `messages` do naszego webhooka.
 */
async function checkPageWebhook(page: PageInfo): Promise<{ subscribed: boolean; fields: string[]; note: string | null }> {
  const ownAppId = process.env.META_APP_ID ?? null;
  try {
    const res = await fetch(
      `${GRAPH}/${page.id}/subscribed_apps?access_token=${encodeURIComponent(page.token)}`,
    );
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { subscribed: false, fields: [], note: json?.error?.message ?? `HTTP ${res.status}` };
    }
    const apps: any[] = json?.data ?? [];
    if (!apps.length) {
      return { subscribed: false, fields: [], note: "Żadna aplikacja nie jest zasubskrybowana do webhooka tej strony." };
    }

    const appNames = apps.map((a) => a?.name ?? a?.id ?? "?").join(", ");
    const fields = Array.from(new Set(apps.flatMap((a) => (Array.isArray(a?.subscribed_fields) ? a.subscribed_fields : []))));
    const hasMessages = fields.includes("messages");

    // Czy TA aplikacja (META_APP_ID) jest wśród subskrybentów? Jeśli wiadomościami
    // zajmuje się inna appka (np. bezpośrednia integracja ElevenLabs / ManyChat),
    // to ona odpowiada klientom, a nasz panel nigdy nie zapisuje tych rozmów.
    const thisAppSubscribed = ownAppId ? apps.some((a) => String(a?.id) === String(ownAppId)) : null;

    let note: string | null = null;
    if (!hasMessages) {
      note = `Subskrybenci: ${appNames}. Brak pola \`messages\` — nowe wiadomości nie docierają do panelu.`;
    } else if (thisAppSubscribed === false) {
      note = `Webhook \`messages\` obsługuje INNA aplikacja: ${appNames}. To ona odpowiada klientom — panel nie zapisuje tych rozmów. Podłącz webhook tej aplikacji (META_APP_ID=${ownAppId}) do strony.`;
    } else if (thisAppSubscribed === null) {
      note = `Subskrybenci webhooka: ${appNames}. (Nie mogę potwierdzić, czy to ta aplikacja — brak META_APP_ID.)`;
    }

    return {
      // "subscribed" = nasz panel dostanie wiadomości: pole messages + ta aplikacja (lub nieznane app id).
      subscribed: hasMessages && thisAppSubscribed !== false,
      fields,
      note,
    };
  } catch (e: any) {
    return { subscribed: false, fields: [], note: e?.message ?? "błąd sprawdzania subskrypcji" };
  }
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
  maxConversations: number,
): Promise<void> {
  const platformQs = platform === "instagram" ? "&platform=instagram" : "";
  let url: string | null =
    `${GRAPH}/${page.id}/conversations?fields=id,updated_time,participants,` +
    `messages.limit(50){id,message,from,created_time,attachments}` +
    `&limit=50${platformQs}&access_token=${encodeURIComponent(page.token)}`;

  let seen = 0;
  while (url && seen < maxConversations) {
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
            page_id: page.id,
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
  maxConversationsPerPage?: number;
}): Promise<MessengerSyncResult> {
  const maxConversations = opts?.maxConversationsPerPage ?? MAX_CONVERSATIONS_PER_PAGE;
  const result: MessengerSyncResult = {
    pages: 0,
    conversationsSeen: 0,
    messagesNew: 0,
    leadsCreated: 0,
    errors: [],
    webhook: [],
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
    // Diagnostyka: czy nowe wiadomości w ogóle dotrą do panelu na żywo.
    const hook = await checkPageWebhook(page);
    result.webhook.push({ page: page.name ?? page.id, ...hook });
    if (!hook.subscribed) {
      result.errors.push(`Webhook „${page.name ?? page.id}": ${hook.note ?? "brak subskrypcji `messages`"}`);
    }

    for (const platform of platforms) {
      try {
        await syncPageConversations(page, platform, known, result, maxConversations);
      } catch (e: any) {
        result.errors.push(`${platform} ${page.name ?? page.id}: ${e?.message ?? e}`);
      }
    }
  }

  return result;
}

/** Adres do pobrania załącznika Meta (obraz / plik / wideo). */
function attachmentDownloadUrl(a: any): string | null {
  return a?.image_data?.url ?? a?.file_url ?? a?.video_data?.url ?? a?.image_data?.preview_url ?? null;
}

/**
 * Dociąga pliki załączników dla wiadomości zsynchronizowanych z Graph API
 * (source="graph_sync"), które mają flagę has_attachments, ale nie mają jeszcze
 * pobranych plików (attachments IS NULL). Dla każdej takiej wiadomości pobiera
 * z Meta listę załączników po id wiadomości, ściąga pliki do Storage, podpina
 * je do dokumentów klienta i uruchamia OCR (numery KW, właściciel, wartość).
 *
 * Ograniczone i wznawialne: przetwarza do MAX_ATTACHMENT_MESSAGES_PER_RUN
 * wiadomości na przebieg; kolejne kliknięcie „Uzupełnij historię" kontynuuje.
 * Idempotentne — raz pobrane pliki nie są ściągane ponownie.
 */
export async function backfillGraphSyncAttachments(opts?: {
  maxMessages?: number;
}): Promise<AttachmentBackfillResult> {
  const result: AttachmentBackfillResult = {
    messagesProcessed: 0,
    attachmentsDownloaded: 0,
    ocrProcessed: 0,
    kwFound: 0,
    errors: [],
  };

  const rootToken =
    process.env.META_ACCESS_TOKEN ??
    process.env.META_PAGE_ACCESS_TOKEN ??
    process.env.META_IG_PAGE_ACCESS_TOKEN;
  if (!rootToken) {
    result.errors.push("Brak tokenu Meta — nie mogę pobrać załączników.");
    return result;
  }

  const pages = await discoverPages(rootToken);
  const tokenById = new Map<string, string>(pages.map((p) => [p.id, p.token]));
  const allTokens = Array.from(new Set(pages.map((p) => p.token)));
  if (!allTokens.length) {
    result.errors.push("Nie udało się odkryć żadnej strony (token/uprawnienia).");
    return result;
  }

  const max = opts?.maxMessages ?? MAX_ATTACHMENT_MESSAGES_PER_RUN;
  const { data: rows, error } = await supabaseAdmin
    .from("lead_communications")
    .select("id, lead_id, external_id, metadata")
    .eq("channel", "messenger")
    .is("attachments", null)
    .eq("metadata->>source", "graph_sync")
    .eq("metadata->>has_attachments", "true")
    .not("external_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(max);
  if (error) {
    result.errors.push(`select: ${error.message}`);
    return result;
  }

  const leadsWithNewDocs = new Set<string>();

  for (const row of rows ?? []) {
    result.messagesProcessed += 1;
    const meta = (row.metadata ?? {}) as Record<string, any>;
    const leadId = row.lead_id as string | null;
    const mid = row.external_id as string | null;
    if (!leadId || !mid) continue;

    const pageId = meta.page_id ? String(meta.page_id) : null;
    const tokens = pageId && tokenById.has(pageId) ? [tokenById.get(pageId)!] : allTokens;

    // Pobierz listę załączników po id wiadomości (spróbuj tokenem właściwej strony,
    // a gdy nie znamy strony — kolejnymi tokenami, aż któryś zwróci dane).
    let atts: any[] | null = null;
    for (const tk of tokens) {
      try {
        const r = await fetch(
          `${GRAPH}/${encodeURIComponent(mid)}?fields=attachments{id,mime_type,name,size,image_data,file_url,video_data}&access_token=${encodeURIComponent(tk)}`,
        );
        const j: any = await r.json().catch(() => ({}));
        if (r.ok) {
          atts = j?.attachments?.data ?? [];
          break;
        }
      } catch (e: any) {
        result.errors.push(`fetch ${mid}: ${e?.message ?? e}`);
      }
    }
    if (!atts || !atts.length) continue;

    const stored: any[] = [];
    for (const a of atts) {
      const url = attachmentDownloadUrl(a);
      if (!url) continue;
      const s = await downloadAndStore({
        leadId,
        url,
        filename: a?.name ?? undefined,
        mime: a?.mime_type ?? undefined,
      });
      if (s) stored.push({ ...s, source_type: "graph_sync" });
    }
    if (!stored.length) continue;

    const { error: updErr } = await supabaseAdmin
      .from("lead_communications")
      .update({ attachments: stored as any })
      .eq("id", row.id);
    if (updErr) {
      result.errors.push(`update ${row.id}: ${updErr.message}`);
      continue;
    }
    result.attachmentsDownloaded += stored.length;
    try {
      await attachStoredToClientDocuments({ leadId, stored, sourceLabel: "messenger" });
    } catch (e: any) {
      result.errors.push(`docs ${leadId}: ${e?.message ?? e}`);
    }
    leadsWithNewDocs.add(leadId);
  }

  // OCR świeżo pobranych dokumentów — po jednym przebiegu na leada (dedup ocr_paths).
  let ocrLeads = 0;
  for (const leadId of leadsWithNewDocs) {
    if (ocrLeads >= MAX_OCR_LEADS_PER_RUN) break;
    ocrLeads += 1;
    try {
      const r = await ocrLeadAttachmentsAndEnrich({ leadId });
      result.ocrProcessed += r.processed;
      result.kwFound += r.kwFound;
    } catch (e: any) {
      result.errors.push(`ocr ${leadId}: ${e?.message ?? e}`);
    }
  }

  return result;
}

// Znacznik ostatniego automatycznego syncu (throttling w cronie).
const SYNC_MARKER_PATH = "system/messenger-conversation-sync-last.txt";

async function lastScheduledSyncAt(): Promise<number> {
  try {
    const { data } = await supabaseAdmin.storage.from(CLIENT_FILES_BUCKET).download(SYNC_MARKER_PATH);
    if (!data) return 0;
    const t = Date.parse((await data.text()).trim());
    return Number.isFinite(t) ? t : 0;
  } catch {
    return 0;
  }
}

async function markScheduledSync(): Promise<void> {
  await supabaseAdmin.storage
    .from(CLIENT_FILES_BUCKET)
    .upload(SYNC_MARKER_PATH, new TextEncoder().encode(new Date().toISOString()), {
      contentType: "text/plain",
      upsert: true,
    });
}

/**
 * Wariant dla crona (follow-up-tick co 15 min): dociąga nowe/zmienione rozmowy
 * i załączniki z Meta, ale nie częściej niż raz na godzinę (throttle po
 * znaczniku w Storage). Skanuje tylko najświeższe wątki — dedup po id
 * wiadomości ogarnia resztę. Best-effort; błędy nie mogą wywrócić ticka.
 */
export async function runScheduledMessengerSync(opts?: {
  minIntervalMs?: number;
}): Promise<{ ran: boolean; messagesNew?: number; attachmentsDownloaded?: number; ocrProcessed?: number }> {
  const minInterval = opts?.minIntervalMs ?? 3600_000; // 1h
  const last = await lastScheduledSyncAt();
  if (Date.now() - last < minInterval) return { ran: false };

  const sync = await syncMessengerConversations({ platform: "both", maxConversationsPerPage: 150 });
  const atts = await backfillGraphSyncAttachments({ maxMessages: 100 });
  await markScheduledSync().catch(() => {});
  return {
    ran: true,
    messagesNew: sync.messagesNew,
    attachmentsDownloaded: atts.attachmentsDownloaded,
    ocrProcessed: atts.ocrProcessed,
  };
}
