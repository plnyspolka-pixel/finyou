// Twilio — SMS, połączenia, nagrania, numery, zużycie i saldo przez bramkę
// konektora Lovable. Wysyłka SMS z ochroną strażników jest w `send_sms`
// (writes-comms); tu dochodzi historia, nagrania i połączenia z komunikatem.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  SENDS,
  actorId,
  clampLimit,
  fail,
  handle,
  ok,
  oneOf,
  requireRolesAdmin,
  requireTeam,
  requireTeamAdmin,
  snippet,
} from "../_helpers";

const ADMIN_ONLY = ["administrator"] as const;
const READ = { readOnlyHint: true, idempotentHint: true, openWorldHint: true } as const;

export const twilioStatus = defineTool({
  name: "twilio_status",
  title: "Twilio status",
  description:
    "Stan integracji Twilio: czy klucze są skonfigurowane, saldo konta, numery przypisane do konta, domyślny nadawca SMS (z ustawień voicebota). Tylko administrator/operator.",
  inputSchema: {},
  annotations: READ,
  handler: (_i, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeam(ctx);
      const tw = await import("@/lib/twilio-api.server");
      const errors: string[] = [];
      const settings = await oneOf(
        s.from("voicebot_settings").select("sms_from, sms_enabled, sms_trigger").eq("id", 1),
        "voicebot_settings",
      ).catch((e) => {
        errors.push(`voicebot_settings: ${(e as Error).message}`);
        return null;
      });
      if (!tw.hasTwilioKeys()) {
        return ok({ configured: false, sms_from: settings?.sms_from ?? null, errors });
      }
      const [balance, numbers] = await Promise.all([
        tw.getBalance().catch((e) => {
          errors.push(`balance: ${(e as Error).message}`);
          return null;
        }),
        tw.listIncomingPhoneNumbers().catch((e) => {
          errors.push(`numbers: ${(e as Error).message}`);
          return [] as any[];
        }),
      ]);
      return ok({
        configured: true,
        balance: balance ? { balance: balance.balance, currency: balance.currency } : null,
        phone_numbers: numbers.map((n: any) => ({
          phone_number: n.phone_number,
          friendly_name: n.friendly_name,
          capabilities: n.capabilities,
        })),
        sms_from: settings?.sms_from ?? null,
        sms_enabled: settings?.sms_enabled ?? null,
        sms_trigger: settings?.sms_trigger ?? null,
        errors,
      });
    }),
});

export const listTwilioMessages = defineTool({
  name: "list_twilio_messages",
  title: "List Twilio SMS messages",
  description:
    "Historia SMS-ów z Twilio (wysłane i odebrane): nadawca, odbiorca, kierunek, status dostarczenia, treść, kod błędu, cena. Filtry: numer, zakres dat. Tylko administrator/operator.",
  inputSchema: {
    to: z.string().optional().describe("Numer odbiorcy w formacie E.164, np. +48600100200."),
    from: z.string().optional().describe("Numer nadawcy (E.164)."),
    since: z.string().optional().describe("Wysłane od (data, ISO 8601 lub YYYY-MM-DD)."),
    until: z.string().optional().describe("Wysłane do."),
    limit: z.number().int().min(1).max(100).optional(),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const tw = await import("@/lib/twilio-api.server");
      const rows = await tw.listMessages({
        to: a.to,
        from: a.from,
        sentAfter: a.since,
        sentBefore: a.until,
        pageSize: clampLimit(a.limit, 30, 100),
      });
      return ok({
        messages: rows.map((m: any) => ({
          sid: m.sid,
          from: m.from,
          to: m.to,
          direction: m.direction,
          status: m.status,
          body: snippet(m.body, 300),
          date_sent: m.date_sent,
          error_code: m.error_code,
          error_message: m.error_message,
          num_segments: m.num_segments,
          price: m.price,
          price_unit: m.price_unit,
        })),
      });
    }),
});

export const getTwilioMessage = defineTool({
  name: "get_twilio_message",
  title: "Get Twilio SMS message",
  description:
    "Pełne dane jednego SMS-a z Twilio po SID (status, treść, błędy, cena). Tylko administrator/operator.",
  inputSchema: { sid: z.string().min(10) },
  annotations: READ,
  handler: ({ sid }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const tw = await import("@/lib/twilio-api.server");
      return ok(await tw.getMessage(sid));
    }),
});

export const listTwilioCalls = defineTool({
  name: "list_twilio_calls",
  title: "List Twilio calls",
  description:
    "Połączenia w Twilio (przychodzące i wychodzące, w tym rozmowy voicebota): numery, kierunek, status, czas trwania, cena, kto odebrał. Filtry: numer, status, zakres dat. Tylko administrator/operator.",
  inputSchema: {
    to: z.string().optional(),
    from: z.string().optional(),
    status: z
      .enum([
        "queued",
        "ringing",
        "in-progress",
        "completed",
        "busy",
        "failed",
        "no-answer",
        "canceled",
      ])
      .optional(),
    since: z.string().optional().describe("Rozpoczęte od (ISO 8601 lub YYYY-MM-DD)."),
    until: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const tw = await import("@/lib/twilio-api.server");
      const rows = await tw.listCalls({
        to: a.to,
        from: a.from,
        status: a.status,
        startedAfter: a.since,
        startedBefore: a.until,
        pageSize: clampLimit(a.limit, 30, 100),
      });
      return ok({
        calls: rows.map((c: any) => ({
          sid: c.sid,
          from: c.from,
          to: c.to,
          direction: c.direction,
          status: c.status,
          duration_seconds: c.duration ? Number(c.duration) : null,
          start_time: c.start_time,
          end_time: c.end_time,
          answered_by: c.answered_by,
          price: c.price,
          price_unit: c.price_unit,
        })),
      });
    }),
});

export const getTwilioCall = defineTool({
  name: "get_twilio_call",
  title: "Get Twilio call",
  description: "Pełne dane jednego połączenia Twilio po SID. Tylko administrator/operator.",
  inputSchema: { sid: z.string().min(10) },
  annotations: READ,
  handler: ({ sid }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const tw = await import("@/lib/twilio-api.server");
      return ok(await tw.getCall(sid));
    }),
});

export const listTwilioRecordings = defineTool({
  name: "list_twilio_recordings",
  title: "List Twilio recordings",
  description:
    "Nagrania rozmów w Twilio (np. wiadomości głosowe zostawione na numerze firmy): SID, połączenie, długość, data. Plik daje `get_twilio_recording`. Tylko administrator/operator.",
  inputSchema: {
    call_sid: z.string().optional(),
    since: z.string().optional().describe("Utworzone od (ISO 8601 lub YYYY-MM-DD)."),
    limit: z.number().int().min(1).max(100).optional(),
  },
  annotations: READ,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const tw = await import("@/lib/twilio-api.server");
      const rows = await tw.listRecordings({
        callSid: a.call_sid,
        createdAfter: a.since,
        pageSize: clampLimit(a.limit, 30, 100),
      });
      return ok({
        recordings: rows.map((r: any) => ({
          sid: r.sid,
          call_sid: r.call_sid,
          duration_seconds: r.duration ? Number(r.duration) : null,
          date_created: r.date_created,
          status: r.status,
          channels: r.channels,
          source: r.source,
        })),
      });
    }),
});

export const getTwilioRecording = defineTool({
  name: "get_twilio_recording",
  title: "Get Twilio recording (audio link)",
  description:
    "Pobiera nagranie z Twilio i zwraca podpisany link do pliku MP3 (ważny godzinę). Tylko administrator/operator.",
  inputSchema: { sid: z.string().min(10) },
  annotations: READ,
  handler: ({ sid }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const tw = await import("@/lib/twilio-api.server");
      const { storeMedia } = await import("@/lib/media-storage.server");
      const audio = await tw.getRecordingAudio(sid);
      const stored = await storeMedia(audio.bytes, {
        contentType: audio.contentType,
        visibility: "private",
        prefix: "twilio-recordings",
        name: sid,
        ext: "mp3",
      });
      return ok({ sid, ...stored });
    }),
});

export const listTwilioPhoneNumbers = defineTool({
  name: "list_twilio_phone_numbers",
  title: "List Twilio phone numbers",
  description:
    "Numery na koncie Twilio: numer, nazwa, możliwości (głos/SMS/MMS), webhooki głosu i SMS. Tylko administrator/operator.",
  inputSchema: {},
  annotations: READ,
  handler: (_i, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const tw = await import("@/lib/twilio-api.server");
      const rows = await tw.listIncomingPhoneNumbers();
      return ok({
        phone_numbers: rows.map((n: any) => ({
          sid: n.sid,
          phone_number: n.phone_number,
          friendly_name: n.friendly_name,
          capabilities: n.capabilities,
          voice_url: n.voice_url,
          sms_url: n.sms_url,
          status_callback: n.status_callback,
          date_created: n.date_created,
        })),
      });
    }),
});

export const getTwilioUsage = defineTool({
  name: "get_twilio_usage",
  title: "Get Twilio usage",
  description:
    "Zużycie i koszty Twilio w okresie po kategoriach (sms, sms-outbound, calls, calls-outbound, recordings…). Bez kategorii — wszystkie. Tylko administrator/operator.",
  inputSchema: {
    category: z
      .string()
      .optional()
      .describe(
        "np. sms, sms-outbound, sms-inbound, calls, calls-outbound, calls-inbound, recordings, totalprice",
      ),
    since: z.string().optional().describe("Od (YYYY-MM-DD)."),
    until: z.string().optional().describe("Do (YYYY-MM-DD)."),
  },
  annotations: READ,
  handler: ({ category, since, until }, ctx: ToolContext) =>
    handle(async () => {
      await requireTeam(ctx);
      const tw = await import("@/lib/twilio-api.server");
      const rows = await tw.getUsage({ category, startDate: since, endDate: until });
      return ok({
        usage: rows.map((u: any) => ({
          category: u.category,
          description: u.description,
          count: u.count,
          count_unit: u.count_unit,
          usage: u.usage,
          usage_unit: u.usage_unit,
          price: u.price,
          price_unit: u.price_unit,
          start_date: u.start_date,
          end_date: u.end_date,
        })),
      });
    }),
});

export const twilioPlaceCall = defineTool({
  name: "twilio_place_call",
  title: "Place a Twilio call with a spoken message",
  description:
    "Dzwoni z numeru firmy i odczytuje komunikat po polsku (syntezator Twilio), albo odtwarza TwiML z podanego adresu. To realny telefon do prawdziwej osoby — użyj TYLKO po tym, jak użytkownik zobaczył treść komunikatu i wyraźnie kazał zadzwonić. Rozmowę z botem Anią zleca `place_voice_call` (ElevenLabs). Tylko administrator/operator.",
  inputSchema: {
    to: z.string().min(9).optional().describe("Numer E.164, np. +48600100200."),
    lead_id: z.string().uuid().optional().describe("Alternatywnie lead — numer z rekordu."),
    message: z.string().min(2).max(1500).optional().describe("Komunikat do odczytania (pl-PL)."),
    twiml_url: z.string().url().optional().describe("Alternatywnie adres TwiML."),
    from: z
      .string()
      .optional()
      .describe("Numer nadawcy; domyślnie nadawca SMS z ustawień voicebota."),
    record: z.boolean().default(false).describe("Nagrywać rozmowę."),
  },
  annotations: SENDS,
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      const s = await requireTeamAdmin(ctx);
      if (!a.message && !a.twiml_url) return fail("Podaj message albo twiml_url.");
      let to = a.to ?? "";
      if (!to && a.lead_id) {
        const lead = await oneOf(
          s.from("leads").select("phone_normalized, phone_raw").eq("id", a.lead_id),
          "leads",
        );
        if (!lead) return fail("Nie znaleziono leada.");
        to = lead.phone_normalized ?? lead.phone_raw ?? "";
      }
      const { normalizePhoneForVoicebot } = await import("@/lib/voicebot.functions");
      const normalized = normalizePhoneForVoicebot(to);
      if (!normalized || normalized.replace(/\D/g, "").length < 9)
        return fail("Brak poprawnego numeru.");
      let from = a.from;
      if (!from) {
        const settings = await oneOf(
          s.from("voicebot_settings").select("sms_from").eq("id", 1),
          "voicebot_settings",
        );
        from = settings?.sms_from ?? undefined;
      }
      if (!from)
        return fail(
          "Brak numeru nadawcy (podaj from albo ustaw sms_from w ustawieniach voicebota).",
        );
      const tw = await import("@/lib/twilio-api.server");
      const call = await tw.placeCall({
        to: normalized,
        from,
        twiml: a.message ? tw.sayTwiml(a.message) : undefined,
        url: a.twiml_url,
        record: a.record,
      });
      await s.from("automation_events").insert({
        automation_type: "twilio_call_mcp",
        status: "sent",
        sent_payload: {
          to: normalized,
          from,
          message: a.message ?? null,
          twiml_url: a.twiml_url ?? null,
          actor: actorId(ctx),
          lead_id: a.lead_id ?? null,
        },
        response_payload: { sid: call?.sid, status: call?.status },
      });
      return ok({ ok: true, sid: call?.sid, status: call?.status, to: normalized, from });
    }),
});

export const twilioApiRequest = defineTool({
  name: "twilio_api_request",
  title: "Twilio API request (generic)",
  description:
    "Dowolne wywołanie REST Twilio względem konta (np. `Messages.json`, `Calls/CA….json`, `Usage/Records/LastMonth.json`, `IncomingPhoneNumbers.json`), GET/POST/DELETE z parametrami zapytania lub formularza. Odpowiedzi binarne trafiają do Storage jako podpisany link. Klucze zostają na serwerze. Tylko administrator.",
  inputSchema: {
    method: z.enum(["GET", "POST", "DELETE"]).default("GET"),
    path: z.string().min(3).max(300).describe("Ścieżka zasobu względem konta, np. Messages.json."),
    query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
    form: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional()
      .describe("Pola formularza dla POST."),
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
  },
  handler: (a, ctx: ToolContext) =>
    handle(async () => {
      await requireRolesAdmin(ctx, ADMIN_ONLY);
      const tw = await import("@/lib/twilio-api.server");
      const r = await tw.twilioRequest(a.path, { method: a.method, query: a.query, form: a.form });
      if (r.bytes) {
        const { storeMedia } = await import("@/lib/media-storage.server");
        const stored = await storeMedia(r.bytes, {
          contentType: r.contentType || "application/octet-stream",
          visibility: "private",
          prefix: "twilio-api",
          name: a.path.replace(/[^a-z0-9]+/gi, "-"),
        });
        return ok({ status: r.status, file: stored });
      }
      const text = r.json !== undefined ? JSON.stringify(r.json) : (r.text ?? "");
      return ok({
        status: r.status,
        content_type: r.contentType,
        body: text.length > 20000 ? `${text.slice(0, 20000)}… (ucięte)` : (r.json ?? r.text),
      });
    }),
});

export const twilioTools = [
  twilioStatus,
  listTwilioMessages,
  getTwilioMessage,
  listTwilioCalls,
  getTwilioCall,
  listTwilioRecordings,
  getTwilioRecording,
  listTwilioPhoneNumbers,
  getTwilioUsage,
  twilioPlaceCall,
  twilioApiRequest,
];
