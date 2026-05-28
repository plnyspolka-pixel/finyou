import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  isValidKwFormat, isValidKwChecksum, parseKw, computeLegalRiskScore,
  buildInvestorSummary, KW_INCOMPLETE_WARNING, KW_SECTIONS,
} from "@/lib/kw";

async function requireStaff(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("administrator") && !roles.includes("operator")) {
    throw new Error("Brak uprawnień");
  }
}

/** Tworzy lub odświeża zadanie pobrania KW dla wniosku. */
export const ensureKwJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    application_id: z.string().uuid(),
    kw_number: z.string().min(1).max(40),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await requireStaff(supabase, userId);
    const kw = data.kw_number.trim().toUpperCase();

    if (!isValidKwFormat(kw)) {
      const { data: existing } = await supabase
        .from("kw_fetch_jobs").select("id").eq("application_id", data.application_id).maybeSingle();
      if (existing) {
        await supabase.from("kw_fetch_jobs").update({
          status: "FAILED_INVALID_NUMBER",
          kw_number: kw,
          failure_reason: "Numer KW ma nieprawidłowy format",
        }).eq("id", existing.id);
        return { ok: true, jobId: existing.id };
      }
      const ins = await supabase.from("kw_fetch_jobs").insert({
        application_id: data.application_id,
        kw_number: kw,
        status: "FAILED_INVALID_NUMBER",
        failure_reason: "Numer KW ma nieprawidłowy format",
      }).select("id").single();
      return { ok: true, jobId: ins.data?.id };
    }

    const { data: existing } = await supabase
      .from("kw_fetch_jobs").select("id, kw_number, status")
      .eq("application_id", data.application_id).maybeSingle();
    if (existing) {
      if (existing.kw_number !== kw) {
        await supabase.from("kw_fetch_jobs").update({
          kw_number: kw, status: "PENDING", attempts: 0,
          next_attempt_at: new Date().toISOString(),
          failure_reason: null, error_message: null,
        }).eq("id", existing.id);
      }
      return { ok: true, jobId: existing.id };
    }
    const ins = await supabase.from("kw_fetch_jobs").insert({
      application_id: data.application_id,
      kw_number: kw,
      status: "PENDING",
      next_attempt_at: new Date().toISOString(),
    }).select("id").single();
    return { ok: true, jobId: ins.data?.id };
  });

/** Operator: ponów próbę pobrania KW. */
export const retryKwJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ job_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await requireStaff(supabase, userId);
    const { error } = await supabase.from("kw_fetch_jobs").update({
      status: "PENDING",
      next_attempt_at: new Date().toISOString(),
      error_message: null,
    }).eq("id", data.job_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Operator: ręcznie wkleja HTML działów KW (fallback gdy worker nie pobierze). */
export const submitManualKwSections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({
    job_id: z.string().uuid(),
    summary_html: z.string().max(500_000).optional(),
    section_i_o: z.string().max(500_000).optional(),
    section_i_sp: z.string().max(500_000).optional(),
    section_ii: z.string().max(500_000).optional(),
    section_iii: z.string().max(500_000).optional(),
    section_iv: z.string().max(500_000).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await requireStaff(supabase, userId);

    const { data: job, error: jobErr } = await supabase
      .from("kw_fetch_jobs").select("*").eq("id", data.job_id).single();
    if (jobErr || !job) throw new Error("Zadanie nie istnieje");

    const sectionsMap: Record<string, string | undefined> = {
      "I-O": data.section_i_o, "I-Sp": data.section_i_sp,
      "II": data.section_ii, "III": data.section_iii, "IV": data.section_iv,
    };
    // Replace previous manual sources for this job
    await supabase.from("kw_section_sources").delete().eq("job_id", data.job_id);
    for (const s of KW_SECTIONS) {
      const html = sectionsMap[s.key];
      if (html && html.trim().length > 0) {
        await supabase.from("kw_section_sources").insert({
          job_id: data.job_id, application_id: job.application_id, kw_number: job.kw_number,
          section_key: s.key, section_label: s.label,
          raw_html: html, raw_text: null, success: true,
        });
      }
    }

    const parsed = parseKw(job.kw_number, {
      summary: data.summary_html ? { raw_html: data.summary_html } : null,
      sections: {
        "I-O": data.section_i_o ? { raw_html: data.section_i_o } : undefined,
        "I-Sp": data.section_i_sp ? { raw_html: data.section_i_sp } : undefined,
        "II": data.section_ii ? { raw_html: data.section_ii } : undefined,
        "III": data.section_iii ? { raw_html: data.section_iii } : undefined,
        "IV": data.section_iv ? { raw_html: data.section_iv } : undefined,
      },
    });
    const allOk = parsed.missing_sections.length === 0;
    const score = computeLegalRiskScore(parsed);
    const summary = buildInvestorSummary(parsed, score);
    const warning = parsed.missing_sections.length > 0 ? KW_INCOMPLETE_WARNING : null;

    await supabase.from("kw_fetch_jobs").update({
      status: allOk ? "SUCCESS" : "PARTIAL_SUCCESS",
      partial_success: !allOk,
      missing_sections: parsed.missing_sections,
      parsed_json: parsed,
      summary_raw_html: data.summary_html ?? null,
      fetched_at: new Date().toISOString(),
      error_message: null,
      failure_reason: allOk ? null : "Brak części działów przy wklejeniu ręcznym",
    }).eq("id", data.job_id);

    await supabase.from("kw_analysis").upsert({
      application_id: job.application_id,
      kw_number: job.kw_number,
      property_json: parsed.property,
      owners_json: parsed.owners,
      section_i_o_json: { raw: parsed.property?.section_i_o_raw ?? null },
      section_i_sp_json: { raw: parsed.property?.section_i_sp_raw ?? null },
      section_ii_json: { owners: parsed.owners },
      section_iii_json: parsed.section_iii,
      section_iv_json: parsed.section_iv,
      risk_flags: parsed.risk_flags,
      investor_summary: summary,
      legal_risk_score: score,
      analysis_warning: warning,
    }, { onConflict: "application_id" });

    return { ok: true, score, missing: parsed.missing_sections };
  });

/** Pobiera komplet danych KW dla wniosku (job + analiza + źródła). */
export const getKwBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ application_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await requireStaff(supabase, userId);
    const [job, analysis, attempts, sources] = await Promise.all([
      supabase.from("kw_fetch_jobs").select("*").eq("application_id", data.application_id).maybeSingle(),
      supabase.from("kw_analysis").select("*").eq("application_id", data.application_id).maybeSingle(),
      supabase.from("kw_fetch_attempts").select("*").eq("application_id", data.application_id).order("started_at", { ascending: false }).limit(20),
      supabase.from("kw_section_sources").select("id, section_key, section_label, success, error_message, fetched_at").eq("application_id", data.application_id).order("fetched_at", { ascending: false }),
    ]);
    return {
      job: job.data ?? null,
      analysis: analysis.data ?? null,
      attempts: attempts.data ?? [],
      sources: sources.data ?? [],
    };
  });

export const validateKwClient = { isValidKwFormat, isValidKwChecksum };
