import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { placeOutboundCallInternal } from "@/lib/voicebot.functions";
import { handleMetaMessagingBody } from "@/lib/meta-messaging.server";

function verifyMetaSig(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const GRAPH = "https://graph.facebook.com/v21.0";

async function fetchLeadDetails(leadgenId: string) {
  const token = process.env.META_ACCESS_TOKEN!;
  const res = await fetch(
    `${GRAPH}/${leadgenId}?access_token=${token}&fields=id,created_time,field_data,form_id,campaign_id,ad_id`,
  );
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

// Wyłuskuje polski numer telefonu: najpierw z pól „phone/telefon/…", a jeśli tam
// go nie ma (częsty przypadek: numer wkleił się w pole imienia/nazwiska),
// przeszukuje WSZYSTKIE wartości formularza + nazwę wzorcem 9 cyfr (opcjonalnie +48).
// Negatywne lookbehind/lookahead pilnują dokładnie 9 cyfr (żeby nie złapać PESEL).
function extractPhone(fd: any[], nameFallback?: string | null): string | null {
  const direct = extractField(fd, ["phone", "telefon", "tel", "mobile", "komórk", "komork"]);
  const digits = (p: string | null) => (p ? p.replace(/\D/g, "") : "");
  if (digits(direct).length >= 9) return direct;
  const hay = [
    ...(Array.isArray(fd)
      ? fd.map((f) => (Array.isArray(f?.values) ? f.values.join(" ") : String(f?.values ?? "")))
      : []),
    String(nameFallback ?? ""),
  ].join("  ");
  const m = hay.match(/(?<!\d)(?:\+?48[\s-]?)?(\d{3}[\s-]?\d{3}[\s-]?\d{3})(?!\d)/);
  return m ? m[0] : direct;
}

// Usuwa z nazwy wklejony numer telefonu (np. „Gadek691586905" → „Gadek").
function cleanName(full: string | null | undefined): string | null {
  const t = String(full ?? "")
    .replace(/(?:\+?48[\s-]?)?\d[\d\s-]{7,}\d/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return t || (full ?? null);
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
}): Promise<{
  loanApplicationId: string | null;
  clientId: string | null;
  returnLink: string | null;
  firstName: string | null;
}> {
  let assignedUserId: string | null = null;
  let assignedRole: "klient" | "operator" | "inwestor" = "klient";
  if (opts.formId) {
    const { data: form } = await supabaseAdmin
      .from("meta_lead_forms")
      .select("assigned_user_id, assigned_role")
      .eq("meta_form_id", String(opts.formId))
      .maybeSingle();
    assignedUserId = (form as any)?.assigned_user_id ?? null;
    assignedRole = ((form as any)?.assigned_role ?? "klient") as typeof assignedRole;
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
        assigned_user_id: assignedUserId,
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
    await supabaseAdmin
      .from("clients")
      .update({
        email: opts.email ?? undefined,
        phone: opts.phone ?? undefined,
        phone_normalized: phoneNorm ?? undefined,
      })
      .eq("id", clientId);
    if (assignedUserId) {
      await supabaseAdmin
        .from("clients")
        .update({ assigned_user_id: assignedUserId })
        .eq("id", clientId)
        .is("assigned_user_id", null);
    }
  }

  // 1b) Auto-create auth user + magic link – w roli przypisanej do formularza
  let magicLink: string | null = null;
  if (opts.email && clientId) {
    try {
      const { ensureKlientAccountAndMagicLink } = await import("@/lib/client-magic-link.server");
      const r = await ensureKlientAccountAndMagicLink(opts.email, {
        firstName: first,
        lastName: last,
        source: "meta_lead",
        role: assignedRole,
      });
      if (r.userId) {
        await supabaseAdmin.from("clients").update({ user_id: r.userId }).eq("id", clientId);
      }
      magicLink = r.magicLink;
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
  const returnLink: string | null = magicLink ?? `${opts.origin}/klient`;
  let returnToken = existingApp?.return_link_token ?? null;

  if (!existingApp) {
    returnToken = returnToken ?? crypto.randomUUID();
    const { data: newApp, error: appErr } = await supabaseAdmin
      .from("loan_applications")
      .insert({
        client_id: clientId,
        status: "kompletowanie_danych",
        source: "meta_ads",
        current_form_step: 1,
        return_link_token: returnToken,
        return_link: returnLink,
        assigned_operator: assignedUserId,
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
          const raw = await request.text();
          const sig = request.headers.get("x-hub-signature-256");
          const appSecret = process.env.META_APP_SECRET;
          if (!appSecret) {
            return new Response("Server misconfigured", { status: 500 });
          }
          if (!verifyMetaSig(raw, sig, appSecret)) {
            console.warn("[meta-leads-webhook] invalid X-Hub-Signature-256");
            return new Response("Forbidden", { status: 403 });
          }
          let body: any;
          try {
            body = JSON.parse(raw);
          } catch {
            return new Response("Bad JSON", { status: 400 });
          }

          // Facebook dostarcza WSZYSTKIE zdarzenia (leadgen, wiadomości Messenger/IG,
          // komentarze) na jeden skonfigurowany URL webhooka. Obsłuż tu również
          // wiadomości i komentarze, aby bot działał niezależnie od tego, który
          // z endpointów Meta jest ustawiony w konfiguracji aplikacji Facebook.
          await handleMetaMessagingBody(body).catch((e) =>
            console.error("[meta-leads-webhook] messaging dispatch", e),
          );

          for (const entry of body.entry ?? []) {
            for (const change of entry.changes ?? []) {
              if (change.field !== "leadgen") continue;
              const v = change.value;
              const leadgenId = v.leadgen_id;
              if (!leadgenId) continue;
              const details = await fetchLeadDetails(leadgenId);
              const fd = details.field_data ?? [];
              const email = extractField(fd, ["email"]);
              const rawName = extractField(fd, ["name", "imię", "imie"]);
              const phone = extractPhone(fd, rawName);
              const name = cleanName(rawName);

              const { data: camp } = await supabaseAdmin
                .from("meta_campaigns")
                .select("id")
                .eq("meta_campaign_id", v.campaign_id ?? "")
                .maybeSingle();

              // 1) Klient + wniosek + return link
              const capture = await upsertClientAndApplication({
                email,
                phone,
                fullName: name,
                origin,
                formId: v.form_id ?? details.form_id ?? null,
              });

              // 2) Upsert meta_leads (z podpięciem do wniosku)
              const { data: inserted } = await supabaseAdmin
                .from("meta_leads")
                .upsert(
                  {
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
                  },
                  { onConflict: "meta_lead_id" },
                )
                .select("id")
                .single();

              // Upsert zunifikowanego leada (panel admina widzi wszystko z jednego miejsca)
              let unifiedLeadId: string | null = null;
              try {
                const { upsertLeadFromSource } = await import("@/lib/lead-comms.server");
                unifiedLeadId = await upsertLeadFromSource({
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
                  applicationData: {
                    meta_field_data: details.field_data,
                    return_link: capture.returnLink,
                  },
                });
              } catch (e) {
                console.error("[meta-leads-webhook] unified lead upsert", e);
              }

              // TRIGGER NURTURE — cała sekwencja Ani (mail/SMS/call, 365 dni) startuje
              // OD RAZU po wejściu leada, a nie po rozpoczęciu wniosku. Kotwicą (dzień 1)
              // jest moment wpadnięcia leada. Idempotentne (unikalne lead_id,channel,step_index),
              // więc równoległy pull-sync nie tworzy duplikatów.
              // UWAGA: webhook to główna (real-time) ścieżka wejścia leada — pull-sync pomija
              // leady już obecne w meta_leads (dedup), dlatego harmonogram MUSI ruszyć tutaj.
              if (unifiedLeadId) {
                try {
                  const { scheduleFollowUpsForLead } = await import("@/lib/follow-up-plan.server");
                  await scheduleFollowUpsForLead(unifiedLeadId);
                } catch (e) {
                  console.error("[meta-leads-webhook] schedule follow-ups", e);
                }
              }

              const formId = v.form_id ?? details.form_id;

              // 3) TELEFON Ani OD RAZU — jako PIERWSZA akcja po utworzeniu leada, żeby żaden
              //    późniejszy krok (SMS/mail/upsert formularza) nie mógł go zablokować wyjątkiem.
              //    placeOutboundCallInternal sam pilnuje godzin (8–22) i throttle 24h.
              //    Gdy telefon jest pomijany — logujemy DLACZEGO do automation_events (diagnostyka).
              try {
                const { data: settings } = await supabaseAdmin
                  .from("voicebot_settings")
                  .select("call_trigger")
                  .eq("id", 1)
                  .maybeSingle();
                let formAllowsCall = true;
                if (formId) {
                  const { data: form } = await supabaseAdmin
                    .from("meta_lead_forms")
                    .select("voicebot_enabled")
                    .eq("meta_form_id", String(formId))
                    .maybeSingle();
                  formAllowsCall = form?.voicebot_enabled !== false;
                }
                const canCall =
                  !!phone && !!settings && settings.call_trigger !== "manual" && formAllowsCall;
                if (canCall) {
                  await placeOutboundCallInternal({
                    phone: phone!,
                    source: "meta_lead",
                    metaLeadId: inserted?.id ?? null,
                    clientId: capture.clientId,
                    loanApplicationId: capture.loanApplicationId,
                    firstName: capture.firstName,
                  }).catch((e) => console.error("[meta-leads-webhook] call trigger", e));
                } else {
                  await supabaseAdmin
                    .from("automation_events")
                    .insert({
                      automation_type: "meta_lead_capture",
                      status: "skipped",
                      error_message: `call skipped — phone=${!!phone} call_trigger=${settings?.call_trigger ?? "brak_ustawień"} form_voicebot_enabled=${formAllowsCall}`,
                      sent_payload: { leadgenId, formId: formId ?? null, phone },
                    })
                    .then(
                      () => {},
                      () => {},
                    );
                }
              } catch (e) {
                console.error("[meta-leads-webhook] call block error", e);
              }

              // 4) SMS + e-mail powitalny idą już PRZEZ sekwencję follow-up (krok 1 mail/SMS,
              //    zaplanowany wyżej przez scheduleFollowUpsForLead z kotwicą na dzień wejścia leada).
              //    Nie wysyłamy tu drugiego, ad-hoc SMS-a/maila — inaczej klient dostałby
              //    dwie prawie identyczne wiadomości w ciągu minuty. Tak samo robi pull-sync.

              // 4c) Upsert formularza Meta (źródło prawdy dla przełączników w panelu Voicebot)
              if (formId) {
                try {
                  let formName: string | null = null;
                  try {
                    const fr = await fetch(
                      `${GRAPH}/${formId}?access_token=${process.env.META_ACCESS_TOKEN}&fields=name`,
                    );
                    if (fr.ok) formName = (await fr.json())?.name ?? null;
                  } catch {
                    /* noop */
                  }
                  await supabaseAdmin.from("meta_lead_forms").upsert(
                    {
                      meta_form_id: String(formId),
                      meta_page_id: v.page_id ?? entry.id ?? null,
                      form_name: formName,
                      last_lead_at: new Date().toISOString(),
                    },
                    { onConflict: "meta_form_id", ignoreDuplicates: false },
                  );
                } catch (e) {
                  console.error("[meta-leads-webhook] form upsert", e);
                }
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
          } catch {
            /* noop */
          }
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
