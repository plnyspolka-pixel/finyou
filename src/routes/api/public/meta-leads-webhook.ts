import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { placeOutboundCallInternal, sendSmsInternal } from "@/lib/voicebot.functions";
import { sendResendEmail } from "@/lib/resend-send.server";

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

function splitName(full: string | null | undefined): { first: string; last: string } {
  const t = String(full ?? "").trim();
  if (!t) return { first: "Lead", last: "Meta" };
  const parts = t.split(/\s+/);
  const first = parts[0];
  const last = parts.slice(1).join(" ") || "—";
  return { first, last };
}

function normPhone(p: string): string {
  const s = String(p ?? "").replace(/\s|-/g, "");
  if (s.startsWith("+")) return s;
  const d = s.replace(/\D/g, "");
  if (d.length === 9) return `+48${d}`;
  if (d.length === 11 && d.startsWith("48")) return `+${d}`;
  return s.startsWith("+") ? s : `+${d}`;
}

function getOrigin(_request: Request): string {
  // Linki klienckie (return_link, SMS, maile) zawsze na główną domenę.
  // Ignorujemy PUBLIC_APP_ORIGIN — w przeszłości była ustawiona na app.financeyou.pl.
  void process.env.PUBLIC_APP_ORIGIN;
  return "https://financeyou.pl";
}

/**
 * Tworzy/aktualizuje klienta + wniosek dla leada z Meta, wysyła SMS z linkiem.
 * Zwraca id wniosku do podpięcia w meta_leads.lead_application_id.
 */
async function upsertClientAndApplication(opts: {
  email: string | null;
  phone: string | null;
  fullName: string | null;
  origin: string;
  formId?: string | null;
}): Promise<{ loanApplicationId: string | null; clientId: string | null; returnLink: string | null; firstName: string | null }> {
  let assignedUserId: string | null = null;
  if (opts.formId) {
    const { data: form } = await supabaseAdmin
      .from("meta_lead_forms").select("assigned_user_id").eq("meta_form_id", String(opts.formId)).maybeSingle();
    assignedUserId = (form as any)?.assigned_user_id ?? null;
  }
  const phoneNorm = opts.phone ? normPhone(opts.phone) : null;
  const { first, last } = splitName(opts.fullName);

  // 1) Klient — szukaj po telefonie lub mailu
  let clientId: string | null = null;
  if (phoneNorm || opts.email) {
    let q = supabaseAdmin.from("clients").select("id").limit(1);
    if (phoneNorm) q = q.eq("phone_normalized", phoneNorm);
    else if (opts.email) q = q.eq("email", opts.email);
    const { data: existing } = await q.maybeSingle();
    if (existing?.id) clientId = existing.id;
  }

  if (!clientId) {
    const { data: inserted, error } = await supabaseAdmin
      .from("clients")
      .insert({
        first_name: first,
        last_name: last,
        email: opts.email,
        phone: opts.phone,
        phone_raw: opts.phone,
        phone_normalized: phoneNorm,
        source: "meta_lead",
        consent_marketing: true,
        consent_phone: true,
        consent_sms: true,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      await supabaseAdmin.from("automation_events").insert({
        automation_type: "meta_lead_capture",
        status: "error",
        error_message: `client insert: ${error?.message ?? "no row"}`,
        sent_payload: { email: opts.email, phone: opts.phone },
      });
      return { loanApplicationId: null, clientId: null, returnLink: null, firstName: first };
    }
    clientId = inserted.id;
  } else {
    // Uzupełnij brakujące pola, ale nie nadpisuj istniejących danych
    await supabaseAdmin.from("clients").update({
      email: opts.email ?? undefined,
      phone: opts.phone ?? undefined,
      phone_normalized: phoneNorm ?? undefined,
    }).eq("id", clientId);
  }

  // 1b) Auto-create auth user + magic link (rola: klient) – tylko jeśli mamy email
  let magicLink: string | null = null;
  if (opts.email && clientId) {
    try {
      let authUserId: string | null = null;
      const { data: createRes, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: opts.email,
        email_confirm: true,
        user_metadata: { first_name: first, last_name: last, source: "meta_lead" },
      });
      if (createErr && !String(createErr.message ?? "").toLowerCase().includes("registered")) {
        console.error("[meta-leads-webhook] createUser error", createErr);
      }
      authUserId = createRes?.user?.id ?? null;
      if (!authUserId) {
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
        const found = list?.users?.find((u) => (u.email ?? "").toLowerCase() === opts.email!.toLowerCase());
        authUserId = found?.id ?? null;
      }
      if (authUserId) {
        await supabaseAdmin.from("clients").update({ user_id: authUserId }).eq("id", clientId);
        await supabaseAdmin.from("user_roles").upsert(
          { user_id: authUserId, role: "klient" as any },
          { onConflict: "user_id,role" },
        );
        const { data: linkRes } = await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email: opts.email,
          options: { redirectTo: `${opts.origin}/klient` },
        });
        magicLink = (linkRes?.properties as any)?.action_link ?? null;
      }
    } catch (e) {
      console.error("[meta-leads-webhook] auth-bootstrap error", e);
    }
  }

  // 2) Wniosek — szukaj istniejącego "nowy_lead" tego klienta, inaczej utwórz
  const { data: existingApp } = await supabaseAdmin
    .from("loan_applications")
    .select("id, return_link, return_link_token")
    .eq("client_id", clientId)
    .eq("source", "meta_lead")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let loanApplicationId = existingApp?.id ?? null;
  let returnLink: string | null = magicLink ?? `${opts.origin}/klient`;
  let returnToken = existingApp?.return_link_token ?? null;

  if (!existingApp) {
    returnToken = returnToken ?? crypto.randomUUID();
    const { data: newApp, error: appErr } = await supabaseAdmin
      .from("loan_applications")
      .insert({
        client_id: clientId,
        status: "w_trakcie_uzupelniania",
        source: "meta_ads",
        current_form_step: 1,
        return_link_token: returnToken,
        return_link: returnLink,
      })
      .select("id")
      .single();
    if (appErr || !newApp) {
      console.error("[meta-leads-webhook] loan_applications insert error", appErr);
      return { loanApplicationId: null, clientId, returnLink: null, firstName: first };
    }
    loanApplicationId = newApp.id;
  } else {
    await supabaseAdmin
      .from("loan_applications")
      .update({ return_link: returnLink })
      .eq("id", existingApp.id);
  }

  return { loanApplicationId, clientId, returnLink, firstName: first };
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
          const origin = getOrigin(request);
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

              // 1) Klient + wniosek + return link
              const capture = await upsertClientAndApplication({
                email,
                phone,
                fullName: name,
                origin,
              });

              // 2) Upsert meta_leads (z podpięciem do wniosku)
              const { data: inserted } = await supabaseAdmin.from("meta_leads").upsert({
                meta_lead_id: leadgenId,
                meta_form_id: v.form_id ?? details.form_id,
                meta_campaign_id: v.campaign_id ?? details.campaign_id,
                campaign_id: camp?.id ?? null,
                full_name: name,
                email,
                phone,
                field_data: details.field_data,
                received_at: details.created_time ?? new Date().toISOString(),
                lead_application_id: capture.loanApplicationId,
              }, { onConflict: "meta_lead_id" }).select("id").single();

              // Upsert zunifikowanego leada (panel admina widzi wszystko z jednego miejsca)
              try {
                const { upsertLeadFromSource } = await import("@/lib/lead-comms.server");
                await upsertLeadFromSource({
                  type: "pozyczkowy",
                  source: "meta_ads",
                  firstName: capture.firstName,
                  lastName: splitName(name).last,
                  email,
                  phoneRaw: phone,
                  phoneNormalized: phone ? normPhone(phone) : null,
                  metaLeadId: inserted?.id ?? null,
                  metaFormId: v.form_id ?? details.form_id,
                  metaCampaignId: v.campaign_id ?? details.campaign_id,
                  loanApplicationId: capture.loanApplicationId,
                  clientId: capture.clientId,
                  applicationData: { meta_field_data: details.field_data, return_link: capture.returnLink },
                });
              } catch (e) {
                console.error("[meta-leads-webhook] unified lead upsert", e);
              }

              // 3) SMS z linkiem do dokończenia wniosku
              if (phone && capture.returnLink) {
                const smsBody = `Cześć ${capture.firstName ?? ""}! Dziękujemy za zainteresowanie pożyczką. Dokończ wniosek tutaj: ${capture.returnLink} — Finance You`.replace(/\s+/g, " ").trim();
                await sendSmsInternal({
                  phone,
                  body: smsBody,
                  source: "meta_lead_return_link",
                }).catch((e) => console.error("[meta-leads-webhook] sms", e));
              }

              // 3b) E-mail z linkiem do dokończenia wniosku
              if (email && capture.returnLink) {
                const greeting = capture.firstName ? `Cześć ${capture.firstName}!` : "Cześć!";
                const text = `${greeting}\n\nDziękujemy za zainteresowanie pożyczką pod zastaw nieruchomości w Finance You.\n\nDokończ wniosek tutaj: ${capture.returnLink}\n\nZajmie Ci to ok. 3 minut. W razie pytań — zadzwonimy lub odpisz na tego maila.\n\nZespół Finance You`;
                const html = `<p>${greeting}</p><p>Dziękujemy za zainteresowanie pożyczką pod zastaw nieruchomości w <b>Finance You</b>.</p><p><a href="${capture.returnLink}" style="display:inline-block;padding:12px 20px;background:#0f3460;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Dokończ wniosek</a></p><p style="color:#666;font-size:13px">Zajmie Ci to ok. 3 minut. W razie pytań — zadzwonimy lub odpisz na tego maila.</p><p>Zespół Finance You</p>`;
                await sendResendEmail({
                  to: email,
                  subject: "Dokończ wniosek o pożyczkę — Finance You",
                  text,
                  html,
                  fromName: "Ania z Finance You",
                }).catch((e) => console.error("[meta-leads-webhook] email", e));
              }

              // 3c) Upsert formularza Meta (źródło prawdy dla przełączników w panelu Voicebot)
              const formId = v.form_id ?? details.form_id;
              if (formId) {
                let formName: string | null = null;
                try {
                  const fr = await fetch(`${GRAPH}/${formId}?access_token=${process.env.META_ACCESS_TOKEN}&fields=name`);
                  if (fr.ok) formName = (await fr.json())?.name ?? null;
                } catch { /* noop */ }
                await supabaseAdmin.from("meta_lead_forms").upsert({
                  meta_form_id: String(formId),
                  meta_page_id: v.page_id ?? entry.id ?? null,
                  form_name: formName,
                  last_lead_at: new Date().toISOString(),
                }, { onConflict: "meta_form_id", ignoreDuplicates: false });
              }


              // 4) Auto-trigger połączenia (jeśli włączone globalnie i dla tego formularza)
              const { data: settings } = await supabaseAdmin
                .from("voicebot_settings").select("call_trigger").eq("id", 1).maybeSingle();
              let formAllowsCall = true;
              if (formId) {
                const { data: form } = await supabaseAdmin
                  .from("meta_lead_forms").select("voicebot_enabled").eq("meta_form_id", String(formId)).maybeSingle();
                formAllowsCall = form?.voicebot_enabled !== false;
              }
              if (phone && settings && settings.call_trigger !== "manual" && formAllowsCall) {
                await placeOutboundCallInternal({
                  phone,
                  source: "meta_lead",
                  metaLeadId: inserted?.id ?? null,
                  clientId: capture.clientId,
                  loanApplicationId: capture.loanApplicationId,
                  firstName: capture.firstName,
                }).catch((e) => console.error("[meta-leads-webhook] call trigger", e));
              }

            }
          }
          return new Response("ok", { status: 200 });
        } catch (e: any) {
          console.error("[meta-leads-webhook]", e);
          try {
            await supabaseAdmin.from("automation_events").insert({
              automation_type: "meta_lead_capture",
              status: "error",
              error_message: e?.message ?? "exception",
            });
          } catch { /* noop */ }
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
