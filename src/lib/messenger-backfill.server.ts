// Uzupełnianie historii Messenger/IG wstecz:
// 1) imiona i nazwiska leadów — najpierw profil Meta (Graph API po
//    PSID/IGSID), a gdy Meta nie odpowie — ekstrakcja z treści wiadomości
//    przychodzących ("jestem…", "pozdrawiam Jan Kowalski");
// 2) osierocone pliki ze Storage (documents/leads/{leadId}/…) dopinane do
//    najbliższej czasowo wiadomości przychodzącej leada.
// Wywoływane automatycznie z follow-up-tick (pg_cron) oraz ręcznie
// przyciskiem "Uzupełnij historię" w skrzynce. Idempotentne.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchMetaUserProfile } from "@/lib/meta-profile.server";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";
import { extractInboundFacts, enrichLeadFromInbound } from "@/lib/lead-enrichment.server";
import { ocrLeadAttachmentsAndEnrich, fillLeadNameFromKw } from "@/lib/lead-doc-intel.server";

// Znacznik jednorazowej migracji załączników (bucket documents).
const ATTACH_MARKER_PATH = "system/messenger-attachments-backfill-v1.done";
// Ponawiaj próbę pobrania nazwiska dla leada najwcześniej po dobie.
const NAME_RETRY_MS = 24 * 3600_000;

export type NameBackfillResult = {
  namesFromMeta: number;
  namesFromText: number;
  namesFromOcr: number;
  namesFromKw: number;
};
export type AttachmentBackfillResult = { attachmentsLinked: number; filesSkipped: number };

/**
 * Uzupełnia brakujące imiona/nazwiska leadów z PSID/IGSID.
 * Przy force=false pomija leady, dla których próbowano w ciągu ostatniej
 * doby (znacznik application_data.name_backfill_at), żeby nie odpytywać
 * Meta w kółko o profile, których nie da się pobrać.
 */
export async function backfillLeadNames(opts?: { force?: boolean }): Promise<NameBackfillResult> {
  const force = opts?.force ?? false;
  let namesFromMeta = 0;
  let namesFromText = 0;
  let namesFromOcr = 0;
  let namesFromKw = 0;

  const { data: unnamedLeads } = await supabaseAdmin
    .from("leads")
    .select("id, first_name, last_name, messenger_psid, instagram_igsid, application_data")
    .or("messenger_psid.not.is.null,instagram_igsid.not.is.null")
    .or("first_name.is.null,last_name.is.null")
    .limit(1000);

  const now = Date.now();
  for (const lead of unnamedLeads ?? []) {
    const throttleData = (lead.application_data as Record<string, any>) ?? {};
    if (!force && throttleData.name_backfill_at) {
      const last = Date.parse(throttleData.name_backfill_at);
      if (Number.isFinite(last) && now - last < NAME_RETRY_MS) continue;
    }

    let firstName = lead.first_name as string | null;
    let lastName = lead.last_name as string | null;
    let source: "meta" | "ocr" | "text" | null = null;

    // a) Profil Meta
    try {
      const platform = lead.messenger_psid ? ("messenger" as const) : ("instagram" as const);
      const userId = lead.messenger_psid ?? lead.instagram_igsid;
      if (userId) {
        const profile = await fetchMetaUserProfile({ userId, platform });
        if (profile) {
          if (profile.firstName && !firstName) { firstName = profile.firstName; source = "meta"; }
          if (profile.lastName && !lastName) { lastName = profile.lastName; source = "meta"; }
        }
      }
    } catch (e) {
      console.warn("[backfill] meta profile error", lead.id, e);
    }

    // b) OCR załączników — wyciąga imię/nazwisko właściciela z dokumentów
    //    (operat, odpis KW) oraz numery KW; zapisuje bezpośrednio do leada.
    if (!firstName || !lastName) {
      try {
        const ocr = await ocrLeadAttachmentsAndEnrich({ leadId: lead.id });
        if (ocr.nameFilled) { source = source ?? "ocr"; namesFromOcr += 1; }
      } catch (e) {
        console.warn("[backfill] attachment ocr error", lead.id, e);
      }
    }

    // c) Właściciel z działu II KW — z cache kw_documents, a w razie braku
    //    treści zleca pobranie z CMD KW Engine.
    try {
      const kwFilled = await fillLeadNameFromKw({ leadId: lead.id, allowOrder: true });
      if (kwFilled) namesFromKw += 1;
    } catch (e) {
      console.warn("[backfill] kw name error", lead.id, e);
    }

    // Kroki b/c piszą do leada same (imię/nazwisko, kw_numbers, znaczniki OCR)
    // — odśwież stan, żeby finalny zapis znacznika ich nie nadpisał.
    const { data: freshLead } = await supabaseAdmin
      .from("leads")
      .select("first_name, last_name, application_data")
      .eq("id", lead.id)
      .maybeSingle();
    if (freshLead?.first_name) firstName = firstName ?? freshLead.first_name;
    if (freshLead?.last_name) lastName = lastName ?? freshLead.last_name;
    const appData = { ...(((freshLead?.application_data ?? lead.application_data) as Record<string, any>) ?? {}) };

    // d) Fallback — treść wiadomości przychodzących
    if (!firstName || !lastName) {
      const { data: inbound } = await supabaseAdmin
        .from("lead_communications")
        .select("content")
        .eq("lead_id", lead.id)
        .eq("direction", "inbound")
        .order("created_at", { ascending: true })
        .limit(100);
      for (const msg of inbound ?? []) {
        const facts = extractInboundFacts(msg.content);
        if (facts.firstName && !firstName) { firstName = facts.firstName; source = source ?? "text"; }
        if (facts.lastName && !lastName) { lastName = facts.lastName; source = source ?? "text"; }
        if (firstName && lastName) break;
      }
    }

    appData.name_backfill_at = new Date(now).toISOString();
    const patch: Record<string, any> = { application_data: appData };
    if (firstName && firstName !== (freshLead?.first_name ?? lead.first_name)) patch.first_name = firstName;
    if (lastName && lastName !== (freshLead?.last_name ?? lead.last_name)) patch.last_name = lastName;
    await supabaseAdmin.from("leads").update(patch as any).eq("id", lead.id);
    if (patch.first_name || patch.last_name) {
      if (source === "meta") namesFromMeta += 1;
      else if (source === "text") namesFromText += 1;
    }
  }

  return { namesFromMeta, namesFromText, namesFromOcr, namesFromKw };
}

/**
 * Dopina osierocone pliki ze Storage do najbliższej czasowo (do 24h)
 * wiadomości przychodzącej leada. Pomija miniatury PDF i pliki już
 * podpięte pod jakąkolwiek wiadomość.
 */
export async function backfillOrphanAttachments(): Promise<AttachmentBackfillResult> {
  let attachmentsLinked = 0;
  let filesSkipped = 0;

  const { data: leadFolders } = await supabaseAdmin.storage.from(CLIENT_FILES_BUCKET).list("leads", { limit: 1000 });

  for (const folder of leadFolders ?? []) {
    const leadId = folder.name;
    if (!leadId || folder.id) continue; // pliki (nie foldery) mają id

    const { data: files } = await supabaseAdmin.storage
      .from(CLIENT_FILES_BUCKET)
      .list(`leads/${leadId}`, { limit: 1000 });
    if (!files?.length) continue;

    const { data: comms } = await supabaseAdmin
      .from("lead_communications")
      .select("id, created_at, direction, attachments")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true });
    if (!comms?.length) continue;

    // Ścieżki już podpięte pod wiadomości
    const referenced = new Set<string>();
    for (const c of comms) {
      for (const a of (Array.isArray(c.attachments) ? c.attachments : []) as any[]) {
        if (a?.path) referenced.add(a.path);
      }
    }

    const inbound = comms.filter((c) => c.direction === "inbound");
    const toAppend = new Map<string, any[]>(); // commId -> nowe załączniki

    for (const f of files) {
      if (!f.id || !f.name) continue; // pomiń podfoldery
      if (f.name.endsWith(".thumb.png")) continue; // miniatury PDF
      const path = `leads/${leadId}/${f.name}`;
      if (referenced.has(path)) continue;

      // Nazwa pliku zaczyna się od Date.now() z chwili odebrania wiadomości
      const tsMatch = f.name.match(/^(\d{13})-/);
      const fileTs = tsMatch ? Number(tsMatch[1]) : (f.created_at ? Date.parse(f.created_at) : NaN);
      if (!Number.isFinite(fileTs)) { filesSkipped += 1; continue; }

      // Najbliższa czasowo wiadomość przychodząca (max 24h różnicy)
      let best: { id: string; diff: number } | null = null;
      for (const c of inbound) {
        const diff = Math.abs(Date.parse(c.created_at) - fileTs);
        if (!best || diff < best.diff) best = { id: c.id, diff };
      }
      if (!best || best.diff > 24 * 3600_000) { filesSkipped += 1; continue; }

      const list = toAppend.get(best.id) ?? [];
      list.push({
        name: f.name.replace(/^\d{13}-/, ""),
        mime: (f.metadata as any)?.mimetype ?? null,
        size: (f.metadata as any)?.size ?? null,
        path,
        source_type: "backfill",
      });
      toAppend.set(best.id, list);
    }

    for (const [commId, newAtts] of toAppend) {
      const comm = comms.find((c) => c.id === commId);
      const existing = Array.isArray(comm?.attachments) ? (comm!.attachments as any[]) : [];
      const { error } = await supabaseAdmin
        .from("lead_communications")
        .update({ attachments: [...existing, ...newAtts] as any })
        .eq("id", commId);
      if (!error) attachmentsLinked += newAtts.length;
    }
  }

  return { attachmentsLinked, filesSkipped };
}

async function attachmentsBackfillDone(): Promise<boolean> {
  const { data } = await supabaseAdmin.storage.from(CLIENT_FILES_BUCKET).list("system", { limit: 100 });
  const markerName = ATTACH_MARKER_PATH.split("/").pop()!;
  return (data ?? []).some((f) => f.name === markerName);
}

export async function markAttachmentsBackfillDone(): Promise<void> {
  await supabaseAdmin.storage
    .from(CLIENT_FILES_BUCKET)
    .upload(ATTACH_MARKER_PATH, new TextEncoder().encode(new Date().toISOString()), {
      contentType: "text/plain",
      upsert: true,
    });
}

/**
 * Wariant dla crona (follow-up-tick): nazwiska z throttlingiem per lead,
 * załączniki jako jednorazowa migracja (znacznik w Storage).
 * Błędy nie mogą wywrócić ticka — łapane u wołającego.
 */
export async function runScheduledMessengerBackfill(): Promise<
  NameBackfillResult & Partial<AttachmentBackfillResult> & { attachmentsRun: boolean }
> {
  const names = await backfillLeadNames({ force: false });
  if (await attachmentsBackfillDone()) {
    return { ...names, attachmentsRun: false };
  }
  const atts = await backfillOrphanAttachments();
  await markAttachmentsBackfillDone();
  return { ...names, ...atts, attachmentsRun: true };
}
