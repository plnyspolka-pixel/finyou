// Prośba klienta o telefon na Messengerze / Instagramie — obsługa bez modelu.
//
// Agent tekstowy na „Proszę zadzwonić 501 845 505” odpowiadał powitaniem albo
// „nie mogę wykonywać połączeń”, a nikt z zespołu się nie dowiadywał. Teraz:
// status leada `wymaga_kontaktu` (wstrzymuje automatyczne przypomnienia),
// pilny push do zespołu i potwierdzenie z numerem — albo prośba o numer.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isCallRequest } from "@/lib/call-request";
import { isE2eId } from "@/lib/e2e-sandbox";
import { normalizePolishPhone } from "@/lib/phone";

export const ASK_PHONE_KIND = "call_request_ask_phone";
export const CALL_REQUEST_KIND = "call_request_saved";

const TERMINAL = new Set(["zamkniety", "odrzucony", "rezygnacja", "do_not_contact", "blacklist"]);

/** Numer w zapisie „501 845 505” (bez +48), do potwierdzenia klientowi. */
function displayPhone(normalized: string): string {
  const d = normalized.replace(/^\+48/, "");
  return d.length === 9 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : normalized;
}

function phoneFromText(text: string): string | null {
  const m = text.match(/(?:\+?48[\s-]?)?\d{3}[\s-]?\d{3}[\s-]?\d{3}/);
  if (!m) return null;
  const { normalized, valid } = normalizePolishPhone(m[0]);
  return valid ? normalized : null;
}

export type CallRequestOutcome =
  | { handled: false }
  | { handled: true; reply: string; kind: typeof ASK_PHONE_KIND | typeof CALL_REQUEST_KIND };

export async function handleCallRequest(opts: {
  leadId: string;
  text: string;
  senderId: string;
}): Promise<CallRequestOutcome> {
  const text = opts.text.trim();
  if (!text) return { handled: false };

  // Odpowiedź na naszą prośbę o numer liczy się jak prośba o telefon.
  const { data: lastOut } = await supabaseAdmin
    .from("lead_communications")
    .select("metadata")
    .eq("lead_id", opts.leadId)
    .eq("direction", "outbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const answeredAsk = (lastOut?.metadata as any)?.kind === ASK_PHONE_KIND;
  const phoneInText = phoneFromText(text);
  if (!isCallRequest(text) && !(answeredAsk && phoneInText)) return { handled: false };

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, status, first_name, last_name, type, phone_normalized, phone_raw, notes")
    .eq("id", opts.leadId)
    .maybeSingle();
  if (!lead) return { handled: false };

  const phone =
    phoneInText ?? lead.phone_normalized ?? normalizePolishPhone(lead.phone_raw).normalized;
  if (!phone) {
    return {
      handled: true,
      kind: ASK_PHONE_KIND,
      reply: "Chętnie porozmawiamy telefonicznie. Proszę podać numer, pod który możemy zadzwonić.",
    };
  }

  const patch: Record<string, unknown> = {};
  if (!lead.phone_normalized) {
    patch.phone_normalized = phone;
    patch.phone_raw = lead.phone_raw ?? displayPhone(phone);
  }
  if (!TERMINAL.has(String(lead.status ?? ""))) patch.status = "wymaga_kontaktu";
  const note = `[Messenger] Prośba o telefon: ${displayPhone(phone)}`;
  if (!String(lead.notes ?? "").includes(note)) {
    patch.notes = [lead.notes, note].filter(Boolean).join("\n");
  }
  if (Object.keys(patch).length > 0) {
    await supabaseAdmin
      .from("leads")
      .update(patch as any)
      .eq("id", lead.id);
  }

  // Rozmowa testowa nie budzi zespołu.
  if (!isE2eId(opts.senderId)) {
    try {
      const { sendOperatorPush } = await import("@/lib/operator-push.server");
      const who = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || "Klient";
      await sendOperatorPush({
        event: "lead:call_request",
        title: "Prośba o telefon",
        body: `${who}${lead.type === "inwestorski" ? " (inwestor)" : ""}: ${displayPhone(phone)}`,
        url: `/operator/leady/${lead.id}`,
        tag: `call-${lead.id}`,
        urgency: "high",
      });
    } catch (e) {
      console.error("[call-request] push error", e);
    }
  }

  return {
    handled: true,
    kind: CALL_REQUEST_KIND,
    reply: `Dziękuję, zapisałam prośbę o rozmowę telefoniczną pod numer ${displayPhone(phone)} i przekazałam ją zespołowi Finance You.`,
  };
}
