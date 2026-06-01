import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { placeOutboundCallInternal } from "@/lib/voicebot.functions";

const GRAPH = "https://graph.facebook.com/v21.0";

async function fetchLeadDetails(leadgenId: string) {
  const token = process.env.META_ACCESS_TOKEN!;
  const res = await fetch(`${GRAPH}/${leadgenId}?access_token=${token}&fields=id,created_time,field_data,form_id,campaign_id,ad_id`);
  if (!res.ok) throw new Error(`Meta lead fetch failed: ${res.status}`);
  return res.json();
}

function extractField(fd: any[], names: string[]): string | null {
  if (!Array.isArray(fd)) return null;
  for (const f of fd) {
    const name = String(f.name ?? "").toLowerCase();
    if (names.some((n) => name.includes(n))) {
      return Array.isArray(f.values) ? f.values[0] : f.values;
    }
  }
  return null;
}

export const Route = createFileRoute("/api/public/meta-leads-webhook")({
  server: {
    handlers: {
      // Facebook webhook verification challenge
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const expected = process.env.META_WEBHOOK_VERIFY_TOKEN ?? process.env.META_APP_SECRET;
        if (mode === "subscribe" && token === expected && challenge) {
          return new Response(challenge, { status: 200 });
        }
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          for (const entry of body.entry ?? []) {
            for (const change of entry.changes ?? []) {
              if (change.field !== "leadgen") continue;
              const v = change.value;
              const leadgenId = v.leadgen_id;
              if (!leadgenId) continue;
              const details = await fetchLeadDetails(leadgenId);
              const fd = details.field_data ?? [];
              const email = extractField(fd, ["email"]);
              const phone = extractField(fd, ["phone", "telefon"]);
              const name = extractField(fd, ["name", "imię", "imie"]);

              const { data: camp } = await supabaseAdmin.from("meta_campaigns")
                .select("id").eq("meta_campaign_id", v.campaign_id ?? "").maybeSingle();

              await supabaseAdmin.from("meta_leads").upsert({
                meta_lead_id: leadgenId,
                meta_form_id: v.form_id ?? details.form_id,
                meta_campaign_id: v.campaign_id ?? details.campaign_id,
                campaign_id: camp?.id ?? null,
                full_name: name,
                email,
                phone,
                field_data: details.field_data,
                received_at: details.created_time ?? new Date().toISOString(),
              }, { onConflict: "meta_lead_id" });
            }
          }
          return new Response("ok", { status: 200 });
        } catch (e: any) {
          console.error("[meta-leads-webhook]", e);
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
