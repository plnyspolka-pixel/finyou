// ZAPIS — wysyłka wiadomości i pamięć asystenta. Każde z narzędzi „send_*”
// wysyła REALNĄ wiadomość do prawdziwej osoby: wolno ich użyć tylko wtedy,
// gdy użytkownik zobaczył treść i wyraźnie kazał wysłać. Idą przez tę samą
// logikę co skrzynka panelu (komunikacja trafia do historii leada).
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  DESTRUCTIVE,
  SENDS,
  WRITE,
  actorId,
  fail,
  handle,
  insertOne,
  ok,
  oneOf,
  requireRolesAdmin,
  requireTeamAdmin,
  updateOne,
} from "../_helpers";

const SEND_RULE =
  " To realna wiadomość do prawdziwej osoby — użyj TYLKO po tym, jak użytkownik zobaczył dokładną treść i wyraźnie kazał ją wysłać. Nie obiecuj warunków ani kwot, których nie ma w danych.";

export const sendEmail = defineTool({
  name: "send_email",
  title: "Send e-mail (inbox)",
  description:
    "Wysyła e-mail ze skrzynki Finance You do klienta, inwestora lub instytucji (nowy albo odpowiedź w wątku — podaj `reply_to_communication_id` z `read_inbox_thread`). Mail dostaje stopkę i trafia do historii korespondencji leada." +
    SEND_RULE,
  inputSchema: {
    to: z.string().describe("Adres odbiorcy (maks. 3, rozdzielone przecinkiem)."),
    subject: z.string().min(1).max(300),
    body: z.string().min(1).max(20000).describe("Treść (zwykły tekst, akapity)."),
    lead_id: z.string().uuid().optional().describe("Lead, do którego historii dopisać mail."),
    reply_to_communication_id: z
      .string()
      .uuid()
      .optional()
      .describe("Id wiadomości, na którą odpowiadamy (kontynuacja wątku)."),
  },
  annotations: SENDS,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const { sendEmailFromInbox } = await import("@/lib/comms-agent.server");
      const result = await sendEmailFromInbox({
        to: a.to,
        subject: a.subject,
        body: a.body,
        replyToCommunicationId: a.reply_to_communication_id ?? null,
        actorUserId: actorId(ctx),
        source: "mcp",
        leadId: a.lead_id ?? null,
      });
      return result.ok
        ? ok(result)
        : fail(`Wysyłka nie powiodła się: ${JSON.stringify(result.results)}`);
    }),
});

export const sendMessengerMessage = defineTool({
  name: "send_messenger_message",
  title: "Send Messenger / Instagram message",
  description:
    "Wysyła wiadomość do leada w Messengerze albo Instagram Direct (kanał wybiera się po tym, którym klient pisał)." +
    SEND_RULE,
  inputSchema: {
    lead_id: z.string().uuid(),
    body: z.string().min(1).max(2000),
  },
  annotations: SENDS,
  handler: ({ lead_id, body }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const { sendMessengerReplyToLead } = await import("@/lib/comms-agent.server");
      const result = await sendMessengerReplyToLead({
        leadId: lead_id,
        body,
        actorUserId: actorId(ctx),
        source: "mcp",
      });
      return result.ok ? ok(result) : fail("Wysyłka do Messengera nie powiodła się.");
    }),
});

export const sendChatReply = defineTool({
  name: "send_chat_reply",
  title: "Send chat reply",
  description:
    "Odpowiada leadowi w czacie na stronie (`chat`) albo w czacie inwestora (`chat_inwestor`)." +
    SEND_RULE,
  inputSchema: {
    lead_id: z.string().uuid(),
    body: z.string().min(1).max(4000),
    channel: z.enum(["chat", "chat_inwestor"]).default("chat"),
  },
  annotations: SENDS,
  handler: ({ lead_id, body, channel }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const { sendChatReplyToLead } = await import("@/lib/comms-agent.server");
      const result = await sendChatReplyToLead({
        leadId: lead_id,
        body,
        channel,
        actorUserId: actorId(ctx),
        source: "mcp",
      });
      return result.ok ? ok(result) : fail("Odpowiedź w czacie nie powiodła się.");
    }),
});

export const sendSms = defineTool({
  name: "send_sms",
  title: "Send SMS",
  description:
    "Wysyła SMS (Twilio) na numer albo do leada (numer z rekordu). Podlega strażnikom (wypis „dość to dość”, blokady kontaktu) i trafia do historii komunikacji." +
    SEND_RULE,
  inputSchema: {
    phone: z.string().min(9).max(20).optional(),
    lead_id: z.string().uuid().optional(),
    body: z.string().min(1).max(480),
  },
  annotations: SENDS,
  handler: ({ phone, lead_id, body }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      let target = phone ?? "";
      if (!target && lead_id) {
        const lead = await oneOf(
          s.from("leads").select("phone_normalized, phone_raw").eq("id", lead_id),
          "leads",
        );
        if (!lead) return fail("Nie znaleziono leada.");
        target = lead.phone_normalized ?? lead.phone_raw ?? "";
      }
      if (!target) return fail("Podaj phone albo lead_id z numerem.");
      const { sendSmsInternal, normalizePhoneForVoicebot } =
        await import("@/lib/voicebot.functions");
      const result = await sendSmsInternal({
        phone: normalizePhoneForVoicebot(target),
        body,
        source: "panel_manual",
        metadata: { via: "mcp", actor: actorId(ctx), lead_id: lead_id ?? null },
      });
      return result.ok
        ? ok(result)
        : fail(result.error ?? result.reason ?? "SMS nie został wysłany.");
    }),
});

export const replyInstitutionThread = defineTool({
  name: "reply_institution_thread",
  title: "Reply to institution (offer thread)",
  description:
    "Odpowiada instytucji finansującej w wątku dystrybucji oferty (`distribution_id` z `list_institution_threads`); mail idzie z adresu wątku oferty, żeby odpowiedź instytucji wróciła do systemu." +
    SEND_RULE,
  inputSchema: {
    distribution_id: z.string().uuid(),
    subject: z.string().min(1).max(300),
    body: z.string().min(1).max(20000),
  },
  annotations: SENDS,
  handler: ({ distribution_id, subject, body }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeamAdmin(ctx);
      const { replyToOfferDistribution } = await import("@/lib/comms-agent.server");
      const result = await replyToOfferDistribution({
        distributionId: distribution_id,
        subject,
        body,
        actorUserId: actorId(ctx),
      });
      return result.ok ? ok(result) : fail("Odpowiedź do instytucji nie powiodła się.");
    }),
});

export const rememberAdminMemory = defineTool({
  name: "remember_admin_memory",
  title: "Remember (shared assistant memory)",
  description:
    "Zapisuje ustalenie do pamięci długotrwałej współdzielonej z asystentem panelu (/admin): tytuł, treść, rodzaj, przypięcie. Istniejący tytuł = aktualizacja treści. Tylko administrator.",
  inputSchema: {
    title: z.string().min(2).max(200),
    content: z.string().min(1).max(8000),
    kind: z.string().max(40).default("note").describe("np. note, fact, preference, rule"),
    pinned: z.boolean().default(false),
  },
  annotations: WRITE,
  handler: ({ title, content, kind, pinned }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRolesAdmin(ctx, ["administrator"]);
      const existing = await oneOf(
        s.from("ai_admin_memory").select("id").eq("title", title.trim()).eq("archived", false),
        "ai_admin_memory",
      );
      if (existing) {
        const row = await updateOne(
          s,
          "ai_admin_memory",
          existing.id,
          { content, kind, pinned, updated_at: new Date().toISOString() },
          "id, title, kind, pinned, updated_at",
        );
        return ok({ ok: true, updated: true, memory: row });
      }
      const row = await insertOne(
        s,
        "ai_admin_memory",
        { title: title.trim(), content, kind, pinned, weight: 1, created_by: actorId(ctx) },
        "id, title, kind, pinned, created_at",
      );
      return ok({ ok: true, updated: false, memory: row });
    }),
});

export const archiveAdminMemory = defineTool({
  name: "archive_admin_memory",
  title: "Forget (archive memory entry)",
  description:
    "Archiwizuje wpis pamięci asystenta po id (przestaje być wstrzykiwany do promptu). Tylko administrator.",
  inputSchema: { id: z.string().uuid() },
  annotations: DESTRUCTIVE,
  handler: ({ id }, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireRolesAdmin(ctx, ["administrator"]);
      const row = await updateOne(
        s,
        "ai_admin_memory",
        id,
        { archived: true },
        "id, title, archived",
      );
      return ok({ ok: true, memory: row });
    }),
});

export const writesCommsTools = [
  sendEmail,
  sendMessengerMessage,
  sendChatReply,
  sendSms,
  replyInstitutionThread,
  rememberAdminMemory,
  archiveAdminMemory,
];
