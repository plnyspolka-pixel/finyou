// Pełna logika pull-a leadów z Meta (Graph API) – wywoływana z:
// - createServerFn (admin "Sync Meta leads" w panelu)
// - cron hooka /api/public/hooks/meta-leads-pull (co minutę)
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

export async function runMetaLeadsSync(): Promise<{
  forms_discovered: number;
  leads_fetched: number;
  leads_new: number;
  calls_queued: number;
  errors: string[];
}> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN nie jest ustawiony");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { placeOutboundCallInternal, sendSmsInternal } = await import("@/lib/voicebot.functions");
  const { sendResendEmail } = await import("@/lib/resend-send.server");
  const { upsertLeadFromSource } = await import("@/lib/lead-comms.server");

  // Wszystkie linki klienckie (SMS / mail / return_link) idą TYLKO na główną domenę.
  // NIE używamy process.env.PUBLIC_APP_ORIGIN — w przeszłości była ustawiona na
  // https://app.financeyou.pl i klienci dostawali błędny link.
  void process.env.PUBLIC_APP_ORIGIN;
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

  // 2) Pociągnij leady ze WSZYSTKICH wykrytych formularzy
  const { data: enabledForms } = await supabaseAdmin.from("meta_lead_forms").select("*");

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
    // Cofnij się głębiej dla formularzy bez historii pullowania.
    const fallbackDays = (form.total_leads_pulled ?? 0) === 0 ? 30 : 7;
    const sinceMs = form.last_lead_at && (form.total_leads_pulled ?? 0) > 0
      ? new Date(form.last_lead_at).getTime()
      : Date.now() - fallbackDays * 24 * 3600 * 1000;
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
              source: "meta_lead", consent_rodo: true, consent_email: true, consent_marketing: true, consent_phone: true, consent_sms: true, consents_accepted_at: new Date().toISOString(),
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
            returnLink = "https://financeyou.pl";
            const tok = existingApp.return_link_token || crypto.randomUUID().replace(/-/g, "");
            await supabaseAdmin.from("loan_applications")
              .update({ return_link_token: tok, return_link: returnLink })
              .eq("id", loanApplicationId);
          } else {
            const tok = crypto.randomUUID().replace(/-/g, "");
            returnLink = "https://financeyou.pl";
            const { data: app } = await supabaseAdmin.from("loan_applications").insert({
              client_id: clientId, status: "nowy_lead", source: "meta_lead",
              return_link_token: tok, return_link: returnLink, current_form_step: 1,
            }).select("id").single();
            loanApplicationId = app?.id ?? null;
          }

          const { data: inserted } = await supabaseAdmin.from("meta_leads").upsert({
            meta_lead_id: leadgenId,
            meta_form_id: lead.form_id ?? formId,
            meta_campaign_id: lead.campaign_id ?? null,
            full_name: name, email, phone, field_data: fd,
            received_at: lead.created_time ?? new Date().toISOString(),
            lead_application_id: loanApplicationId,
          }, { onConflict: "meta_lead_id" }).select("id").single();

          try {
            const unifiedLeadId = await upsertLeadFromSource({
              type: "pozyczkowy", source: "meta_ads",
              firstName: first, lastName: last,
              email, phoneRaw: phone, phoneNormalized: phoneNorm,
              metaLeadId: inserted?.id ?? null,
              metaFormId: lead.form_id ?? formId,
              metaCampaignId: lead.campaign_id ?? null,
              loanApplicationId, clientId,
              applicationData: { meta_field_data: fd, return_link: returnLink },
            });
            // Meta Lead Forms wymagają zgody w formularzu — mapujemy do kolumn consent_*
            if (unifiedLeadId) {
              await supabaseAdmin.from("leads").update({
                consent_rodo: true,
                consent_email: true,
                consent_marketing: true,
                consent_phone: true,
                consent_sms: true,
              }).eq("id", unifiedLeadId);
            }
          } catch (e: any) { summary.errors.push(`unified ${leadgenId}: ${e?.message}`); }

          // Nie wysyłamy już natychmiastowego SMS-a / maila ad-hoc.
          // Cała sekwencja kontaktu (30 dni, mail/SMS/call) idzie przez follow-up plan,
          // żeby tempo i godziny były pod kontrolą i logowalne w lead_follow_up_schedule.
          try {
            const { scheduleFollowUpsForLead } = await import("@/lib/follow-up-plan.server");
            // unifiedLeadId zostało stworzone wyżej w bloku upsertLeadFromSource — pobierzmy je
            const { data: unified } = await supabaseAdmin
              .from("leads").select("id").eq("meta_lead_id", inserted?.id ?? "").maybeSingle();
            if (unified?.id) await scheduleFollowUpsForLead(unified.id);
          } catch (e: any) {
            summary.errors.push(`schedule follow-ups ${leadgenId}: ${e?.message}`);
          }

          if (phone && autoCall && form.voicebot_enabled) {
            await placeOutboundCallInternal({
              phone, source: "meta_lead",
              metaLeadId: inserted?.id ?? null,
              clientId, loanApplicationId, firstName: first,
            }).then(() => { summary.calls_queued += 1; }).catch((e) => summary.errors.push(`call ${leadgenId}: ${e?.message}`));
          }
        }

        url = j?.paging?.next ?? null;
      }

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
}
