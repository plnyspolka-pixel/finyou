// Dystrybucja ofert do inwestorów instytucjonalnych — realna wysyłka e-mail.
//
// Z panelu admina wysyłamy temat pożyczkowy do WSZYSTKICH aktywnych inwestorów
// instytucjonalnych albo do zaznaczonych. Każdy mail:
//   - zawiera link do publicznej Karty oferty (/karta/<token>),
//   - wychodzi z Reply-To: oferta+<distribution_id>@<domena> (dedykowany alias),
//     dzięki czemu odpowiedź instytucji wraca inbound webhookiem prosto na
//     kartę wniosku (offer_distribution_messages) — patrz offer-replies.server.ts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SupabaseLike = { from: (t: string) => any };

async function assertAdminOrOperator(supabase: SupabaseLike, userId: string) {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const allowed = (roles ?? []).some(
    (r: { role: string }) => r.role === "administrator" || r.role === "operator",
  );
  if (!allowed) throw new Error("Brak uprawnień (wymagana rola administrator/operator).");
}

/** Aktywni inwestorzy instytucjonalni (odbiorcy dystrybucji). */
export const listInstitutionalInvestors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as SupabaseLike;
    await assertAdminOrOperator(supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("investors")
      .select("id, company_name, first_name, last_name, email, subscription_status")
      .eq("investor_type", "instytucjonalny")
      .eq("is_active", true)
      .order("company_name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/**
 * Wysyła ofertę e-mailem do inwestorów instytucjonalnych.
 * investorIds puste/nieprzekazane => wysyłka do WSZYSTKICH aktywnych instytucji.
 */
export const sendOfferDistribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        applicationId: z.string().uuid(),
        investorIds: z.array(z.string().uuid()).max(500).optional(),
        note: z.string().max(4000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SupabaseLike;
    await assertAdminOrOperator(supabase, context.userId);
    // Cała mechanika wysyłki żyje w rdzeniu współdzielonym z auto-dystrybucją.
    const { distributeOfferToInvestors } = await import("@/lib/offer-distribution-core.server");
    return distributeOfferToInvestors({
      applicationId: data.applicationId,
      investorIds: data.investorIds,
      note: data.note,
    });
  });

/**
 * Odpowiedź opiekuna tematu w wątku konkretnej dystrybucji.
 *
 * Mail leci do instytucji z Reply-To: oferta+<distribution_id>@<domena> i z
 * nagłówkami In-Reply-To/References ostatniej wiadomości wątku, dzięki czemu
 * kolejna odpowiedź instytucji wraca na tę samą kartę wniosku.
 */
export const replyToDistribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        distributionId: z.string().uuid(),
        subject: z.string().min(1).max(300),
        body: z.string().min(1).max(20000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SupabaseLike;
    await assertAdminOrOperator(supabase, context.userId);

    // Rdzeń w comms-agent.server.ts — tego samego używa asystent panelu.
    const { replyToOfferDistribution } = await import("@/lib/comms-agent.server");
    return await replyToOfferDistribution({
      distributionId: data.distributionId,
      subject: data.subject,
      body: data.body,
      actorUserId: context.userId,
    });
  });

/** Dystrybucje wniosku wraz z wątkami korespondencji (odpowiedzi instytucji). */
export const getDistributionThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ applicationId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as SupabaseLike;
    await assertAdminOrOperator(supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: distributions }, { data: messages }] = await Promise.all([
      supabaseAdmin
        .from("offer_distributions")
        .select(
          "id, distribution_status, sent_at, responded_at, response_summary, email_status, email_error, created_at, investor:investors(id, company_name, first_name, last_name, email)",
        )
        .eq("loan_application_id", data.applicationId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("offer_distribution_messages")
        .select(
          "id, distribution_id, direction, subject, content, from_email, to_email, attachments, created_at",
        )
        .eq("loan_application_id", data.applicationId)
        .order("created_at", { ascending: true }),
    ]);

    return {
      distributions: distributions ?? [],
      messages: messages ?? [],
    };
  });
