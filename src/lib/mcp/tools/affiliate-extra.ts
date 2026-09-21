// Program pośredników: karta partnera, paczki wypłat.
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { fail, handle, ok, oneOf, personLabel, requireUser, rowsOf, section } from "../_helpers";
import { defineListTool, text } from "../_list-tool";

const PARTNER_SAFE =
  "id, first_name, last_name, company_name, email, phone, referral_code, referral_slug, status, settlement_type, sponsor_partner_id, approved_at, terms_accepted_at, terms_version, vat_payer, website_url, source_description, user_id, created_at, updated_at";

export const getAffiliatePartner = defineTool({
  name: "get_affiliate_partner",
  title: "Get affiliate partner",
  description:
    "Karta partnera programu pośredników: dane, kod polecający, status, sponsor, liczba partnerów w strukturze pod nim, prowizje zsumowane po statusie oraz ostatnie prowizje. Bez danych bankowych i PESEL. Partner widzi siebie (RLS), zespół — każdego.",
  inputSchema: { id: z.string().uuid() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ id }, ctx: ToolContext) =>
    handle(async () => {
      const s = requireUser(ctx);
      const partner = await oneOf(
        s.from("affiliate_partners").select(PARTNER_SAFE).eq("id", id),
        "affiliate_partners",
      );
      if (!partner) return fail("Nie znaleziono partnera (albo brak uprawnień).");
      const errors: string[] = [];
      const [commissions, downline] = await Promise.all([
        section(errors, "affiliate_commissions", () =>
          rowsOf<{ status: string; gross_amount: number; currency: string; network_level: number }>(
            s
              .from("affiliate_commissions")
              .select(
                "id, status, gross_amount, currency, network_level, basis_type, basis_amount, commission_rate, payable_at, paid_at, tax_year, tax_quarter, created_at",
              )
              .eq("partner_id", id)
              .order("created_at", { ascending: false })
              .limit(500),
            "affiliate_commissions",
          ),
        ),
        section(errors, "affiliate_partners", () =>
          rowsOf(
            s
              .from("affiliate_partners")
              .select("id, first_name, last_name, company_name, status, created_at")
              .eq("sponsor_partner_id", id)
              .limit(200),
            "affiliate_partners",
          ),
        ),
      ]);
      const rows = commissions ?? [];
      const byStatus: Record<string, { count: number; gross_amount: number }> = {};
      for (const c of rows) {
        byStatus[c.status] ??= { count: 0, gross_amount: 0 };
        byStatus[c.status].count += 1;
        byStatus[c.status].gross_amount += Number(c.gross_amount ?? 0);
      }
      return ok({
        partner: { ...partner, who: personLabel(partner) },
        downline_count: (downline ?? []).length,
        downline: (downline ?? []).slice(0, 50),
        commissions: { total: rows.length, by_status: byStatus, recent: rows.slice(0, 20) },
        errors,
      });
    }),
});

export const listAffiliatePayoutBatches = defineListTool({
  name: "list_affiliate_payout_batches",
  title: "List affiliate payout batches",
  description:
    "Paczki wypłat prowizji partnerom: nazwa, status, liczba wypłat, suma, zatwierdzenie i wypłata. Tylko administrator.",
  table: "affiliate_payout_batches",
  columns:
    "id, name, status, currency, payout_count, total_amount, approved_at, approved_by, paid_at, paid_by, created_by, created_at",
  resultKey: "batches",
  access: ["administrator"],
  filters: {
    status: text("status", "Status paczki."),
  },
});

export const affiliateExtraTools = [getAffiliatePartner, listAffiliatePayoutBatches];
