import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GRAPH = "https://graph.facebook.com/v21.0";

function normPhone(p: string): string {
  const s = String(p ?? "").replace(/\s|-/g, "");
  if (s.startsWith("+")) return s;
  const d = s.replace(/\D/g, "");
  if (d.length === 9) return `+48${d}`;
  if (d.length === 11 && d.startsWith("48")) return `+${d}`;
  return s.startsWith("+") ? s : `+${d}`;
}

function splitName(full: string | null | undefined): { first: string; last: string } {
  const t = String(full ?? "").trim();
  if (!t) return { first: "Lead", last: "Meta" };
  const parts = t.split(/\s+/);
  return { first: parts[0], last: parts.slice(1).join(" ") || "—" };
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

/**
 * Pobiera listę stron + formularzy z Meta i upsertuje do meta_lead_forms.
 * Następnie dla każdego formularza z voicebot_enabled=true ściąga nowe leady
 * (od last_lead_at lub ostatnich 7 dni) i przetwarza je tak samo jak webhook:
 * tworzy klienta + wniosek + link powrotu, zapisuje meta_leads, wysyła SMS/email
 * i — jeśli call_trigger != 'manual' — od razu zleca rozmowę Ani.
 */
export const syncAndPullMetaLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "administrator",
    });
    if (!isAdmin) throw new Error("Tylko administrator");

    const token = process.env.META_ACCESS_TOKEN;
    if (!token) throw new Error("META_ACCESS_TOKEN nie jest ustawiony");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { placeOutboundCallInternal, sendSmsInternal } = await import("@/lib/voicebot.functions");
    const { sendResendEmail } = await import("@/lib/resend-send.server");
    const { upsertLeadFromSource } = await import("@/lib/lead-comms.server");

    const origin = process.env.PUBLIC_APP_ORIGIN?.replace(/\/$/, "") ?? "https://app.financeyou.pl";
    const summary = { forms_discovered: 0, leads_fetched: 0, leads_new: 0, calls_queued: 0, errors: [] as string[] };

    // 1) Odkryj strony + formularze
    try {
      const pagesRes = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token&limit=100&access_token=${token}`);
      const pagesJson: any = await pagesRes.json();
      if (!pagesRes.ok) throw new Error(pagesJson?.error?.message ?? `pages ${pagesRes.status}`);
      const pages: any[] = pagesJson?.data ?? [];
      for (const page of pages) {
        const pageToken = page.access_token ?? token;
        const formsRes = await fetch(`${GRAPH}/${page.id}/leadgen_forms?fields=id,name,status&limit=100&access_token=${pageToken}`);
        const formsJson: any = await formsRes.json();
        if (!formsRes.ok) { summary.errors.push(`forms ${page.name}: ${formsJson?.error?.message}`); continue; }
        for (const form of (formsJson?.data ?? [])) {
          summary.forms_discovered += 1;
          await supabaseAdmin.from("meta_lead_forms").upsert({
            meta_form_id: String(form.id),
            meta_page_id: String(page.id),
            form_name: form.name ?? null,
            page_name: page.name ?? null,
            last_synced_at: new Date().toISOString(),
          }, { onConflict: "meta_form_id" });
        }
      }
    } catch (e: any) {
      summary.errors.push(`discover: ${e?.message ?? e}`);
    }

    // 2) Dla każdego włączonego formularza pociągnij nowe leady
    const { data: enabledForms } = await supabaseAdmin
      .from("meta_lead_forms")
      .select("*")
      .eq("voicebot_enabled", true);

    const { data: settings } = await supabaseAdmin
      .from("voicebot_settings").select("call_trigger").eq("id", 1).maybeSingle();
    const autoCall = settings && settings.call_trigger !== "manual";

    // tokeny per strona (token strony > globalny)
    const pageTokens: Record<string, string> = {};
    try {
      const pagesRes = await fetch(`${GRAPH}/me/accounts?fields=id,access_token&limit=100&access_token=${token}`);
      const pj: any = await pagesRes.json();
      for (const p of pj?.data ?? []) if (p.id && p.access_token) pageTokens[p.id] = p.access_token;
    } catch { /* noop */ }

    for (const form of enabledForms ?? []) {
      const formId = form.meta_form_id;
      const pageToken = (form.meta_page_id && pageTokens[form.meta_page_id]) || token;
      const sinceMs = form.last_lead_at
        ? new Date(form.last_lead_at).getTime()
        : Date.now() - 7 * 24 * 3600 * 1000;
      const sinceSec = Math.floor(sinceMs / 1000);
      const filter = encodeURIComponent(JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: sinceSec }]));
      let url: string | null = `${GRAPH}/${formId}/leads?fields=id,created_time,field_data,form_id,campaign_id,ad_id&limit=50&filtering=${filter}&access_token=${pageToken}`;
      let maxCreated = sinceMs;

      try {
        while (url) {
          const r = await fetch(url);
          const j: any = await r.json();
          if (!r.ok) throw new Error(j?.error?.message ?? `leads ${r.status}`);
          const leads: any[] = j?.data ?? [];
          summary.leads_fetched += leads.length;

          for (const lead of leads) {
            const leadgenId = String(lead.id);
            const created = lead.created_time ? new Date(lead.created_time).getTime() : Date.now();
            if (created > maxCreated) maxCreated = created;

            // Pomiń jeśli już mamy
            const { data: dup } = await supabaseAdmin.from("meta_leads")
              .select("id").eq("meta_lead_id", leadgenId).maybeSingle();
            if (dup) continue;

            summary.leads_new += 1;
            const fd = lead.field_data ?? [];
            const email = extractField(fd, ["email"]);
            const phone = extractField(fd, ["phone", "telefon"]);
            const name = extractField(fd, ["name", "imię", "imie"]);
            const phoneNorm = phone ? normPhone(phone) : null;
            const { first, last } = splitName(name);

            // klient
            let clientId: string | null = null;
            if (phoneNorm || email) {
              let q = supabaseAdmin.from("clients").select("id").limit(1);
              if (phoneNorm) q = q.eq("phone_normalized", phoneNorm);
              else if (email) q = q.eq("email", email!);
              const { data: existing } = await q.maybeSingle();
              if (existing?.id) clientId = existing.id;
            }
            if (!clientId) {
              const { data: ins } = await supabaseAdmin.from("clients").insert({
                first_name: first, last_name: last, email, phone, phone_raw: phone, phone_normalized: phoneNorm,
                source: "meta_lead", consent_marketing: true, consent_phone: true, consent_sms: true,
              }).select("id").single();
              clientId = ins?.id ?? null;
            }
            if (!clientId) continue;

            // wniosek + return link
            let loanApplicationId: string | null = null;
            let returnLink: string | null = null;
            const { data: existingApp } = await supabaseAdmin.from("loan_applications")
              .select("id, return_link, return_link_token")
              .eq("client_id", clientId).eq("source", "meta_lead")
              .order("created_at", { ascending: false }).limit(1).maybeSingle();
            if (existingApp?.id) {
              loanApplicationId = existingApp.id;
              returnLink = existingApp.return_link ?? null;
              if (!returnLink) {
                const tok = existingApp.return_link_token || crypto.randomUUID().replace(/-/g, "");
                returnLink = `${origin}/wniosek/${tok}`;
                await supabaseAdmin.from("loan_applications")
                  .update({ return_link_token: tok, return_link: returnLink })
                  .eq("id", loanApplicationId);
              }
            } else {
              const tok = crypto.randomUUID().replace(/-/g, "");
              returnLink = `${origin}/wniosek/${tok}`;
              const { data: app } = await supabaseAdmin.from("loan_applications").insert({
                client_id: clientId, status: "nowy_lead", source: "meta_lead",
                return_link_token: tok, return_link: returnLink, current_form_step: 1,
              }).select("id").single();
              loanApplicationId = app?.id ?? null;
            }

            // meta_leads
            const { data: inserted } = await supabaseAdmin.from("meta_leads").upsert({
              meta_lead_id: leadgenId,
              meta_form_id: lead.form_id ?? formId,
              meta_campaign_id: lead.campaign_id ?? null,
              full_name: name, email, phone, field_data: fd,
              received_at: lead.created_time ?? new Date().toISOString(),
              lead_application_id: loanApplicationId,
            }, { onConflict: "meta_lead_id" }).select("id").single();

            // unified lead
            try {
              await upsertLeadFromSource({
                type: "pozyczkowy", source: "meta_ads",
                firstName: first, lastName: last,
                email, phoneRaw: phone, phoneNormalized: phoneNorm,
                metaLeadId: inserted?.id ?? null,
                metaFormId: lead.form_id ?? formId,
                metaCampaignId: lead.campaign_id ?? null,
                loanApplicationId, clientId,
                applicationData: { meta_field_data: fd, return_link: returnLink },
              });
            } catch (e: any) { summary.errors.push(`unified ${leadgenId}: ${e?.message}`); }

            // SMS + email z linkiem powrotu
            if (phone && returnLink) {
              const sms = `Cześć ${first}! Dziękujemy za zainteresowanie pożyczką. Dokończ wniosek tutaj: ${returnLink} — Finance You`;
              await sendSmsInternal({ phone, body: sms, source: "meta_lead_return_link" }).catch(() => {});
            }
            if (email && returnLink) {
              const greet = `Cześć ${first}!`;
              const text = `${greet}\n\nDziękujemy za zainteresowanie pożyczką pod zastaw nieruchomości w Finance You.\n\nDokończ wniosek tutaj: ${returnLink}\n\nZajmie Ci to ok. 3 minut.\n\nZespół Finance You`;
              const html = `<p>${greet}</p><p>Dziękujemy za zainteresowanie pożyczką pod zastaw nieruchomości w <b>Finance You</b>.</p><p><a href="${returnLink}" style="display:inline-block;padding:12px 20px;background:#0f3460;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Dokończ wniosek</a></p><p>Zespół Finance You</p>`;
              await sendResendEmail({ to: email, subject: "Dokończ wniosek o pożyczkę — Finance You", text, html, fromName: "Ania z Finance You" }).catch(() => {});
            }

            // call Ani
            if (phone && autoCall) {
              await placeOutboundCallInternal({
                phone, source: "meta_lead",
                metaLeadId: inserted?.id ?? null,
                clientId, loanApplicationId, firstName: first,
              }).then(() => { summary.calls_queued += 1; }).catch((e) => summary.errors.push(`call ${leadgenId}: ${e?.message}`));
            }
          }

          url = j?.paging?.next ?? null;
        }

        // zapisz last_lead_at + licznik
        await supabaseAdmin.from("meta_lead_forms").update({
          last_lead_at: new Date(maxCreated).toISOString(),
          last_synced_at: new Date().toISOString(),
          total_leads_pulled: (form.total_leads_pulled ?? 0) + (summary.leads_new),
          last_error: null,
        }).eq("id", form.id);
      } catch (e: any) {
        summary.errors.push(`form ${formId}: ${e?.message ?? e}`);
        await supabaseAdmin.from("meta_lead_forms").update({
          last_error: String(e?.message ?? e),
          last_synced_at: new Date().toISOString(),
        }).eq("id", form.id);
      }
    }

    return summary;
  });
