import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Manualna odpowiedź operatora do rozmowy Messenger / Instagram Direct.
 * Wysyła wiadomość przez Meta Graph API i loguje ją w lead_communications
 * jako outbound (channel="messenger"), aby pojawiła się w skrzynce.
 */
export const sendMessengerReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      leadId: z.string().uuid(),
      body: z.string().min(1).max(1900),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const [{ data: isAdmin }, { data: isOperator }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "administrator" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "operator" }),
    ]);
    if (!isAdmin && !isOperator) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sendMetaMessage } = await import("./meta-send.server");
    const { logLeadCommunication } = await import("./lead-comms.server");

    const { data: lead, error: leadErr } = await supabaseAdmin
      .from("leads")
      .select("id, messenger_psid, instagram_igsid")
      .eq("id", data.leadId)
      .maybeSingle();
    if (leadErr) throw leadErr;
    if (!lead) throw new Error("Lead nie istnieje");

    const platform: "messenger" | "instagram" = lead.messenger_psid
      ? "messenger"
      : lead.instagram_igsid
      ? "instagram"
      : "messenger";
    const recipientId = lead.messenger_psid ?? lead.instagram_igsid;
    if (!recipientId) throw new Error("Ten lead nie ma zapisanego identyfikatora Messenger/Instagram.");

    const send = await sendMetaMessage({ recipientId, text: data.body, platform });

    await logLeadCommunication({
      leadId: data.leadId,
      channel: "messenger",
      direction: "outbound",
      content: data.body,
      externalId: send.messageId ?? null,
      metadata: {
        platform,
        sender_id: recipientId,
        sent_by: context.userId,
        source: "inbox_manual",
      },
      status: send.ok ? "sent" : "error",
      errorMessage: send.ok ? null : send.error,
    });

    if (!send.ok) throw new Error(send.error ?? "send_failed");
    return { ok: true, messageId: send.messageId };
  });

/**
 * Jednorazowe uzupełnienie historii wstecz:
 * 1) Imiona i nazwiska leadów Messenger/IG — najpierw z profilu Meta
 *    (Graph API po PSID/IGSID), a gdy Meta nie odpowie — z treści
 *    wiadomości przychodzących ("jestem…", "pozdrawiam Jan Kowalski").
 * 2) Załączniki — pliki zapisane w Storage (documents/leads/{leadId}/…),
 *    które nie są podpięte pod żadną wiadomość, dopina do najbliższej
 *    czasowo wiadomości przychodzącej leada.
 * Idempotentne — można uruchamiać wielokrotnie.
 */
export const backfillMessengerData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: isAdmin }, { data: isOperator }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "administrator" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "operator" }),
    ]);
    if (!isAdmin && !isOperator) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { fetchMetaUserProfile } = await import("./meta-profile.server");
    const { extractInboundFacts } = await import("./lead-enrichment.server");

    let namesFromMeta = 0;
    let namesFromText = 0;
    let attachmentsLinked = 0;
    let filesSkipped = 0;

    // ---------- 1) Imiona i nazwiska ----------
    const { data: unnamedLeads } = await supabaseAdmin
      .from("leads")
      .select("id, first_name, last_name, messenger_psid, instagram_igsid")
      .or("messenger_psid.not.is.null,instagram_igsid.not.is.null")
      .or("first_name.is.null,last_name.is.null")
      .limit(1000);

    for (const lead of unnamedLeads ?? []) {
      let firstName = lead.first_name as string | null;
      let lastName = lead.last_name as string | null;
      let source: "meta" | "text" | null = null;

      // a) Profil Meta
      try {
        const platform = lead.messenger_psid ? "messenger" as const : "instagram" as const;
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

      // b) Fallback — treść wiadomości przychodzących
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

      const patch: Record<string, string> = {};
      if (firstName && firstName !== lead.first_name) patch.first_name = firstName;
      if (lastName && lastName !== lead.last_name) patch.last_name = lastName;
      if (Object.keys(patch).length > 0) {
        await supabaseAdmin.from("leads").update(patch).eq("id", lead.id);
        if (source === "meta") namesFromMeta += 1;
        else namesFromText += 1;
      }
    }

    // ---------- 2) Załączniki ----------
    // Foldery leads/{leadId}/ w buckecie documents
    const { data: leadFolders } = await supabaseAdmin.storage.from("documents").list("leads", { limit: 1000 });

    for (const folder of leadFolders ?? []) {
      const leadId = folder.name;
      if (!leadId || folder.id) continue; // pliki (nie foldery) mają id

      const { data: files } = await supabaseAdmin.storage
        .from("documents")
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
        if (!best || best.diff > 24 * 3600 * 1000) { filesSkipped += 1; continue; }

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

    return { ok: true, namesFromMeta, namesFromText, attachmentsLinked, filesSkipped };
  });
