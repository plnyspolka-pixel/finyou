import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import {
  buildAdSetPayload,
  buildCreativePayload,
  buildGeoLocations,
  sprawdzKampanie,
  przytnijPromien,
  PRESET_LUBLIN_100KM,
  PRESET_BUDUJE_SIE,
  type CelKampanii,
  type UmiejscowieniaTryb,
} from "./meta-ad-targeting";

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
    // Pominięte pola (np. brak daty startu) nie mogą polecieć jako "undefined".
    if (v === undefined) continue;
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

/** Zamienia identyfikator konta z naszej bazy na `act_<id>` z Meta. */
async function actIdFor(adAccountUuid: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("meta_ad_accounts")
    .select("meta_account_id")
    .eq("id", adAccountUuid)
    .maybeSingle();
  if (!data?.meta_account_id) throw new Error("Nie znaleziono konta reklamowego");
  return `act_${data.meta_account_id}`;
}

export const listAdPixels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ad_account_id: string }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const r = await metaGet(`/${await actIdFor(data.ad_account_id)}/adspixels`, {
      fields: "id,name,last_fired_time",
      limit: "50",
    });
    return {
      pixels: (r.data ?? []).map((p: Record<string, string>) => ({
        id: p.id,
        name: p.name,
        last_fired_time: p.last_fired_time ?? null,
      })),
    };
  });

export const createAdPixel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ ad_account_id: z.string().uuid(), name: z.string().min(1).max(120) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);
    const r = await metaPost(`/${await actIdFor(data.ad_account_id)}/adspixels`, {
      name: data.name,
    });
    return { id: r.id as string, name: data.name };
  });

/**
 * Podpowiedzi targetowania oparte o wyszukiwarkę Meta — kluczy miast ani ID
 * zainteresowań nie da się wpisać „z głowy", więc pobieramy je z Graph API.
 */
export const suggestTargeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { geo?: string; interests?: string }) => d)
  .handler(async ({ context, data }) => {
    await assertStaff(context.userId);

    const cities: Array<{ key: string; name: string; radius: number; region?: string }> = [];
    if (data.geo === PRESET_LUBLIN_100KM.id) {
      for (const wpis of PRESET_LUBLIN_100KM.miasta) {
        const r = await metaGet("/search", {
          type: "adgeolocation",
          location_types: JSON.stringify(["city"]),
          country_code: "PL",
          q: wpis.q,
          limit: "5",
          locale: "pl_PL",
        });
        const trafienie =
          (r.data ?? []).find(
            (c: { name?: string }) => c.name?.toLowerCase() === wpis.q.toLowerCase(),
          ) ?? (r.data ?? [])[0];
        if (trafienie?.key) {
          cities.push({
            key: trafienie.key,
            name: trafienie.name,
            region: trafienie.region,
            radius: przytnijPromien(wpis.radius),
          });
        }
      }
    }

    const interests: Array<{ id: string; name: string; audience_size?: number }> = [];
    if (data.interests === PRESET_BUDUJE_SIE.id) {
      for (const fraza of PRESET_BUDUJE_SIE.frazy) {
        const r = await metaGet("/search", {
          type: "adinterest",
          q: fraza,
          limit: "3",
          locale: "pl_PL",
        });
        for (const i of r.data ?? []) {
          if (i?.id && !interests.some((x) => x.id === i.id)) {
            interests.push({
              id: i.id,
              name: i.name,
              audience_size: i.audience_size_lower_bound ?? undefined,
            });
            break; // z każdej frazy bierzemy jedno najlepsze dopasowanie
          }
        }
      }
    }

    return { cities, interests, geo_locations: cities.length ? buildGeoLocations(cities) : null };
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

      // "formularz_fb" — leady zbiera formularz na Facebooku (kampanie FY).
      // "strona_www"  — reklama prowadzi na formularz na stronie, konwersje
      //                 liczy piksel (np. kampanie dla klientów zewnętrznych).
      const cel: CelKampanii = creative.cel === "strona_www" ? "strona_www" : "formularz_fb";
      const naStrone = cel === "strona_www";
      const landingUrl: string | null = creative.landing_url ?? null;
      const pixelId: string | null = creative.pixel_id ?? null;
      const optymalizacjaWww = creative.optymalizacja_www === "wejscia" ? "wejscia" : "konwersje";

      const bledy = sprawdzKampanie({
        cel,
        landingUrl,
        pixelId,
        pageId: draft.page_id,
        budzetDzienny: Number(draft.daily_budget),
      });
      if (bledy.length) throw new Error(bledy.join(" "));

      // Auto-remarketing: utwórz / pobierz audiencje dla tego konta i podepnij include/exclude
      const { data: ts } = await supabaseAdmin
        .from("tracking_settings")
        .select("meta_audience_visitors_id, meta_audience_converters_id, meta_audiences_account_id")
        .eq("id", 1)
        .maybeSingle();

      let visitorsId = (ts as any)?.meta_audience_visitors_id as string | null;
      let convertersId = (ts as any)?.meta_audience_converters_id as string | null;
      const sameAccount = (ts as any)?.meta_audiences_account_id === acc.meta_account_id;

      // Audiencje remarketingowe FY dotyczą tylko naszego ruchu — kampanii
      // klienta zewnętrznego nie podpinamy pod piksel Finance You.
      if (!naStrone && (!sameAccount || !visitorsId || !convertersId)) {
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
      // Optymalizacja pod wejścia na stronę żyje w celu "ruch"; leady (formularz
      // FB albo zdarzenie LEAD z piksela) — w celu "kontakty".
      const objective =
        naStrone && optymalizacjaWww === "wejscia" ? "OUTCOME_TRAFFIC" : "OUTCOME_LEADS";
      const camp = await metaPost(`/${actId}/campaigns`, {
        name: draft.name,
        objective,
        status: "PAUSED",
        special_ad_categories: "[]",
      });

      const useRemarketing = !naStrone && (targeting as any).remarketing !== false; // domyślnie włączone
      const customAudiences =
        useRemarketing && (targeting as any).remarketing_mode !== "exclude_only" && visitorsId
          ? [{ id: visitorsId }]
          : undefined;
      const excludedAudiences = useRemarketing && convertersId ? [{ id: convertersId }] : undefined;

      // 2) AdSet
      const adset = await metaPost(
        `/${actId}/adsets`,
        buildAdSetPayload({
          nazwa: draft.name,
          campaignId: camp.id,
          budzetDzienny: Number(draft.daily_budget),
          cel,
          pageId: draft.page_id,
          pixelId,
          optymalizacjaWww,
          startTime: draft.start_time,
          endTime: draft.end_time,
          targeting: {
            geo_locations: targeting.geo_locations,
            age_min: targeting.age_min,
            age_max: targeting.age_max,
            genders: targeting.genders,
            interests: targeting.interests,
            custom_audiences: customAudiences,
            excluded_custom_audiences: excludedAudiences,
            umiejscowienia: (targeting.umiejscowienia ?? "glowne") as UmiejscowieniaTryb,
            poszerzanie_grupy: targeting.poszerzanie_grupy === true,
          },
        }),
      );

      // 3) Lead form — tylko dla kampanii z formularzem na Facebooku
      const form = naStrone
        ? null
        : await metaPost(`/${draft.page_id}/leadgen_forms`, {
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
            follow_up_action_url:
              leadForm.follow_up_action_url ?? "https://financeyou.pl/dziekujemy",
            locale: "pl_PL",
          });

      // 4) Ad creative
      const cr = await metaPost(
        `/${actId}/adcreatives`,
        buildCreativePayload({
          nazwa: draft.name,
          pageId: draft.page_id,
          cel,
          landingUrl,
          leadFormId: form?.id ?? null,
          primaryText: creative.primary_text,
          headline: creative.headline,
          description: creative.description,
          imageUrl: creative.image_url,
          ctaType: creative.cta_type,
        }),
      );

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
          meta_form_id: form?.id ?? null,
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
