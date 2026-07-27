import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const GRAPH = "https://graph.facebook.com/v21.0";

function getToken() {
  const t = process.env.META_ACCESS_TOKEN;
  if (!t) throw new Error("META_ACCESS_TOKEN nie jest ustawiony");
  return t;
}

async function assertStaff(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role);
  if (!roles.includes("administrator") && !roles.includes("operator"))
    throw new Error("Brak uprawnień");
}

async function metaGet(path: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ access_token: getToken(), ...params });
  const res = await fetch(`${GRAPH}${path}?${qs}`);
  if (!res.ok) throw new Error(`Meta GET ${res.status}: ${await res.text()}`);
  return res.json();
}
async function metaPost(path: string, body: Record<string, unknown>) {
  const params = new URLSearchParams();
  params.set("access_token", getToken());
  for (const [k, v] of Object.entries(body)) {
    params.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  const res = await fetch(`${GRAPH}${path}`, { method: "POST", body: params });
  if (!res.ok) throw new Error(`Meta POST ${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

export const listFbPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const r = await metaGet("/me/accounts", {
      fields: "id,name,access_token,category",
      limit: "100",
    });
    return {
      pages: (r.data ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        page_token: p.access_token,
      })),
    };
  });

export const searchTargeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { type: "adgeolocation" | "adinterest"; q: string }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const params: Record<string, string> = { type: data.type, q: data.q, limit: "20" };
    if (data.type === "adgeolocation") {
      params.location_types = JSON.stringify(["country", "region", "city"]);
    }
    const r = await metaGet("/search", params);
    return { results: r.data ?? [] };
  });

const draftSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  ad_account_id: z.string().uuid().nullable().optional(),
  page_id: z.string().max(100).nullable().optional(),
  page_name: z.string().max(200).nullable().optional(),
  daily_budget: z.number().min(5).max(100000),
  start_time: z.string().nullable().optional(),
  end_time: z.string().nullable().optional(),
  targeting: z.record(z.string(), z.unknown()),
  creative: z.record(z.string(), z.unknown()),
  lead_form: z.record(z.string(), z.unknown()),
});

export const saveAdDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => draftSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    if (data.id) {
      const { id, ...rest } = data;
      await supabaseAdmin
        .from("meta_ad_drafts")
        .update(rest as any)
        .eq("id", id!);
      return { id: id! };
    }
    const { data: row, error } = await supabaseAdmin
      .from("meta_ad_drafts")
      .insert({ ...data, created_by: context.userId } as any)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row!.id };
  });

export const listAdDrafts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.userId);
    const { data } = await supabaseAdmin
      .from("meta_ad_drafts")
      .select("*, meta_ad_accounts(name)")
      .order("created_at", { ascending: false })
      .limit(100);
    return { drafts: data ?? [] };
  });

export const getAdDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { data: draft } = await supabaseAdmin
      .from("meta_ad_drafts")
      .select("*")
      .eq("id", data.id)
      .single();
    return { draft };
  });

export const deleteAdDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    await supabaseAdmin.from("meta_ad_drafts").delete().eq("id", data.id);
    return { ok: true };
  });

export const publishAdDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const { data: draft } = await supabaseAdmin
      .from("meta_ad_drafts")
      .select("*, meta_ad_accounts(meta_account_id)")
      .eq("id", data.id)
      .single();
    if (!draft) throw new Error("Szkic nie istnieje");
    if (!draft.page_id) throw new Error("Wybierz stronę Facebook");
    const acc = (draft as any).meta_ad_accounts;
    if (!acc?.meta_account_id) throw new Error("Brak konta reklamowego");

    try {
      const actId = `act_${acc.meta_account_id}`;
      const creative = (draft.creative ?? {}) as any;
      const leadForm = (draft.lead_form ?? {}) as any;
      const targeting = (draft.targeting ?? {}) as any;

      // Auto-remarketing: utwórz / pobierz audiencje dla tego konta i podepnij include/exclude
      const { data: ts } = await supabaseAdmin
        .from("tracking_settings")
        .select("meta_audience_visitors_id, meta_audience_converters_id, meta_audiences_account_id")
        .eq("id", 1)
        .maybeSingle();

      let visitorsId = (ts as any)?.meta_audience_visitors_id as string | null;
      let convertersId = (ts as any)?.meta_audience_converters_id as string | null;
      const sameAccount = (ts as any)?.meta_audiences_account_id === acc.meta_account_id;

      if (!sameAccount || !visitorsId || !convertersId) {
        const visitors = await metaPost(`/${actId}/customaudiences`, {
          name: "FY — Odwiedzający /wniosek (30 dni)",
          subtype: "WEBSITE",
          description: "Auto: wszyscy odwiedzający strony wniosku w ostatnich 30 dniach",
          rule: JSON.stringify({
            inclusions: {
              operator: "or",
              rules: [
                {
                  event_sources: [
                    {
                      id: (
                        await supabaseAdmin
                          .from("tracking_settings")
                          .select("client_pixel_id")
                          .eq("id", 1)
                          .maybeSingle()
                      ).data?.client_pixel_id,
                      type: "pixel",
                    },
                  ],
                  retention_seconds: 30 * 86400,
                  filter: {
                    operator: "and",
                    filters: [{ field: "url", operator: "i_contains", value: "/wniosek" }],
                  },
                },
              ],
            },
          }),
        });
        const converters = await metaPost(`/${actId}/customaudiences`, {
          name: "FY — Wysłali wniosek (30 dni)",
          subtype: "WEBSITE",
          description: "Auto: ci, którzy ukończyli wniosek (SubmitApplication)",
          rule: JSON.stringify({
            inclusions: {
              operator: "or",
              rules: [
                {
                  event_sources: [
                    {
                      id: (
                        await supabaseAdmin
                          .from("tracking_settings")
                          .select("client_pixel_id")
                          .eq("id", 1)
                          .maybeSingle()
                      ).data?.client_pixel_id,
                      type: "pixel",
                    },
                  ],
                  retention_seconds: 30 * 86400,
                  filter: {
                    operator: "and",
                    filters: [{ field: "event", operator: "eq", value: "SubmitApplication" }],
                  },
                },
              ],
            },
          }),
        });
        visitorsId = visitors.id;
        convertersId = converters.id;
        await supabaseAdmin
          .from("tracking_settings")
          .update({
            meta_audience_visitors_id: visitorsId,
            meta_audience_converters_id: convertersId,
            meta_audiences_account_id: acc.meta_account_id,
          })
          .eq("id", 1);
      }

      // 1) Campaign
      const camp = await metaPost(`/${actId}/campaigns`, {
        name: draft.name,
        objective: "OUTCOME_LEADS",
        status: "PAUSED",
        special_ad_categories: "[]",
      });

      const useRemarketing = (targeting as any).remarketing !== false; // domyślnie włączone
      const customAudiences =
        useRemarketing && (targeting as any).remarketing_mode !== "exclude_only"
          ? [{ id: visitorsId }]
          : undefined;
      const excludedAudiences = useRemarketing ? [{ id: convertersId }] : undefined;

      // 2) AdSet
      const adset = await metaPost(`/${actId}/adsets`, {
        name: `${draft.name} - zestaw`,
        campaign_id: camp.id,
        daily_budget: Math.round(Number(draft.daily_budget) * 100),
        billing_event: "IMPRESSIONS",
        optimization_goal: "LEAD_GENERATION",
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        targeting: {
          geo_locations: targeting.geo_locations ?? { countries: ["PL"] },
          age_min: targeting.age_min ?? 18,
          age_max: targeting.age_max ?? 65,
          genders: targeting.genders,
          interests: targeting.interests,
          custom_audiences: customAudiences,
          excluded_custom_audiences: excludedAudiences,
          publisher_platforms: ["facebook", "instagram"],
        },
        status: "PAUSED",
        promoted_object: { page_id: draft.page_id },
        start_time: draft.start_time ?? undefined,
        end_time: draft.end_time ?? undefined,
      });

      // 3) Lead form
      const form = await metaPost(`/${draft.page_id}/leadgen_forms`, {
        name: leadForm.name ?? draft.name,
        questions: leadForm.questions ?? [
          { type: "EMAIL" },
          { type: "FULL_NAME" },
          { type: "PHONE" },
        ],
        privacy_policy: leadForm.privacy_policy ?? {
          url: "https://financeyou.pl/polityka-prywatnosci",
          link_text: "Polityka prywatności",
        },
        follow_up_action_url: leadForm.follow_up_action_url ?? "https://financeyou.pl/dziekujemy",
        locale: "pl_PL",
      });

      // 4) Ad creative
      const cr = await metaPost(`/${actId}/adcreatives`, {
        name: `${draft.name} - kreacja`,
        object_story_spec: {
          page_id: draft.page_id,
          link_data: {
            message: creative.primary_text ?? "",
            link: `https://www.facebook.com/${draft.page_id}`,
            name: creative.headline ?? draft.name,
            description: creative.description ?? "",
            picture: creative.image_url ?? undefined,
            call_to_action: {
              type: creative.cta_type ?? "SIGN_UP",
              value: { lead_gen_form_id: form.id },
            },
          },
        },
      });

      // 5) Ad
      const ad = await metaPost(`/${actId}/ads`, {
        name: `${draft.name} - reklama`,
        adset_id: adset.id,
        creative: { creative_id: cr.id },
        status: "PAUSED",
      });

      await supabaseAdmin
        .from("meta_ad_drafts")
        .update({
          status: "opublikowana",
          meta_campaign_id: camp.id,
          meta_adset_id: adset.id,
          meta_form_id: form.id,
          meta_creative_id: cr.id,
          meta_ad_id: ad.id,
          published_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", data.id);

      return { ok: true, ad_id: ad.id };
    } catch (e: any) {
      await supabaseAdmin
        .from("meta_ad_drafts")
        .update({ status: "blad", error_message: String(e.message).slice(0, 1000) })
        .eq("id", data.id);
      throw e;
    }
  });
