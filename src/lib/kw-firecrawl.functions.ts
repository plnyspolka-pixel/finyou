import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  isValidKwFormat,
  splitKw,
  parseKw,
  computeLegalRiskScore,
  buildInvestorSummary,
  KW_INCOMPLETE_WARNING,
  KW_SECTIONS,
} from "@/lib/kw";

const EKW_URL =
  "https://przegladarka-ekw.ms.gov.pl/eukw_prz/KsiegiWieczyste/wyszukiwanieKW";

async function requireStaff(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("administrator") && !roles.includes("operator")) {
    throw new Error("Brak uprawnień");
  }
}

type AnyObj = Record<string, any>;

function buildClickScript(labels: string[]) {
  return `(() => {
    const normalize = (value) => String(value || '')
      .toLocaleLowerCase('pl-PL')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ł/g, 'l');
    const labels = ${JSON.stringify(labels)}.map(normalize);
    const textOf = (el) => normalize([
      el.value,
      el.innerText,
      el.textContent,
      el.getAttribute('title'),
      el.getAttribute('aria-label')
    ].filter(Boolean).join(' '));
    const candidates = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a'));
    const target = candidates.find((el) => labels.some((label) => textOf(el).includes(label)));
    document.documentElement.setAttribute('data-kw-last-click', target ? textOf(target) : 'not-found');
    if (target) target.click();
  })();`;
}

function buildFillAndSearchScript(dept: string, num: string, check: string) {
  return `(() => {
    const setValue = (selector, value) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      el.focus();
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    const filled = {
      dept: setValue('input[id*="kodWydzialu"], input[name*="kodWydzialu"]', ${JSON.stringify(dept)}),
      number: setValue('input[id*="numerKsiegiWieczystej"], input[name*="numerKsiegiWieczystej"]', ${JSON.stringify(num)}),
      check: setValue('input[id*="cyfraKontrolna"], input[name*="cyfraKontrolna"]', ${JSON.stringify(check)})
    };
    document.documentElement.setAttribute('data-kw-filled', JSON.stringify(filled));
    const normalize = (value) => String(value || '')
      .toLocaleLowerCase('pl-PL')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ł/g, 'l');
    const textOf = (el) => normalize([el.value, el.innerText, el.textContent, el.getAttribute('title'), el.getAttribute('aria-label')].filter(Boolean).join(' '));
    const candidates = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"], a'));
    const target = candidates.find((el) => textOf(el).includes('wyszukaj'));
    document.documentElement.setAttribute('data-kw-search-click', target ? textOf(target) : 'not-found');
    if (target) target.click();
  })();`;
}

/** Build Firecrawl `scrape` action list that walks through EKW search → sections. */
function buildFirecrawlActions(dept: string, num: string, check: string) {
  return [
    { type: "wait", milliseconds: 8000 },
    { type: "executeJavascript", script: buildFillAndSearchScript(dept, num, check) },
    { type: "wait", milliseconds: 8000 },
    { type: "screenshot" },
    { type: "scrape" }, // result screen
    { type: "executeJavascript", script: buildClickScript(["Przeglądanie aktualnej treści KW", "Przegladanie aktualnej tresci KW"]) },
    { type: "wait", milliseconds: 5000 },
    { type: "screenshot" },
    { type: "scrape" },
    { type: "executeJavascript", script: buildClickScript(["Dział I-O", "Dzial I-O", "I-O"]) },
    { type: "wait", milliseconds: 3500 },
    { type: "screenshot" },
    { type: "scrape" },
    { type: "executeJavascript", script: buildClickScript(["Dział I-Sp", "Dzial I-Sp", "I-Sp"]) },
    { type: "wait", milliseconds: 3500 },
    { type: "screenshot" },
    { type: "scrape" },
    { type: "executeJavascript", script: buildClickScript(["Dział II", "Dzial II"]) },
    { type: "wait", milliseconds: 3500 },
    { type: "screenshot" },
    { type: "scrape" },
    { type: "executeJavascript", script: buildClickScript(["Dział III", "Dzial III"]) },
    { type: "wait", milliseconds: 3500 },
    { type: "screenshot" },
    { type: "scrape" },
    { type: "executeJavascript", script: buildClickScript(["Dział IV", "Dzial IV"]) },
    { type: "wait", milliseconds: 3500 },
    { type: "screenshot" },
    { type: "scrape" },
  ];
}


/** Map the Firecrawl scrape-action results onto our 6 expected snapshots. */
function extractSnapshots(resp: AnyObj) {
  const root = resp?.data ?? resp ?? {};
  const actions = root.actions ?? {};
  const scrapes: AnyObj[] = actions.scrapes ?? [];
  const screenshots: string[] = actions.screenshots ?? [];

  const order = ["search_result", "current_content", "I-O", "I-Sp", "II", "III", "IV"] as const;
  const out: Record<string, { html?: string; markdown?: string; url?: string; screenshot?: string | null }> = {};
  for (let i = 0; i < order.length; i++) {
    const snap = scrapes[i];
    if (!snap) continue;
    out[order[i]] = {
      html: snap.html ?? snap.rawHtml,
      markdown: snap.markdown,
      url: snap.url,
      screenshot: screenshots[i] ?? null,
    };
  }
  return out;
}

async function callFirecrawl(kw_number: string) {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY nie jest skonfigurowany");

  const parts = splitKw(kw_number);
  if (!parts) throw new Error("Nieprawidłowy numer KW");

  const actions = buildFirecrawlActions(parts.dept, parts.number, parts.check);
  const body = {
    url: EKW_URL,
    formats: ["markdown", "html", "screenshot"],
    onlyMainContent: false,
    waitFor: 5000,
    timeout: 180_000,
    proxy: "stealth",
    blockAds: true,
    actions,
  };


  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, request: body, response: json };
}

function firecrawlErrorMessage(result: Awaited<ReturnType<typeof callFirecrawl>>) {
  const response = result.response as AnyObj;
  const detail = Array.isArray(response?.details)
    ? response.details.map((d: AnyObj) => d?.message ?? d?.code).filter(Boolean).join("; ")
    : null;
  const parts = [response?.code, response?.error, detail].filter(Boolean);
  return parts.length ? parts.join(": ") : `HTTP ${result.status}`;
}

/** Start a Firecrawl fetch for the given KW number (admin/kw test mode). */
export const startFirecrawlKwFetch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        kw_number: z.string().min(1).max(40),
        application_id: z.string().uuid().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await requireStaff(supabase, userId);
    const kw = data.kw_number.trim().toUpperCase();

    if (!isValidKwFormat(kw)) {
      const ins = await supabase
        .from("kw_fetch_jobs")
        .insert({
          application_id: data.application_id ?? null,
          kw_number: kw,
          fetch_provider: "firecrawl",
          status: "FAILED_INVALID_NUMBER",
          failure_reason: "Numer KW ma nieprawidłowy format",
          created_by: userId,
        })
        .select("id")
        .single();
      return { ok: false, jobId: ins.data?.id, status: "FAILED_INVALID_NUMBER" };
    }

    const jobIns = await supabase
      .from("kw_fetch_jobs")
      .insert({
        application_id: data.application_id ?? null,
        kw_number: kw,
        fetch_provider: "firecrawl",
        status: "PROCESSING",
        attempts: 1,
        last_attempt_at: new Date().toISOString(),
        created_by: userId,
      })
      .select("id")
      .single();
    if (jobIns.error || !jobIns.data) throw new Error(jobIns.error?.message ?? "Nie udało się utworzyć zadania");
    const jobId = jobIns.data.id;

    const attemptIns = await supabase
      .from("kw_fetch_attempts")
      .insert({
        job_id: jobId,
        application_id: data.application_id ?? null,
        kw_number: kw,
        fetch_provider: "firecrawl",
        attempt_number: 1,
        status: "PROCESSING",
      })
      .select("id")
      .single();
    const attemptId = attemptIns.data?.id;

    let fcResult: Awaited<ReturnType<typeof callFirecrawl>>;
    try {
      fcResult = await callFirecrawl(kw);
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      await supabase
        .from("kw_fetch_attempts")
        .update({
          status: "FIRECRAWL_ERROR",
          error_message: msg,
          finished_at: new Date().toISOString(),
        })
        .eq("id", attemptId);
      await supabase
        .from("kw_fetch_jobs")
        .update({
          status: "FIRECRAWL_ERROR",
          error_message: msg,
          fetched_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      return { ok: false, jobId, status: "FIRECRAWL_ERROR", error: msg };
    }

    const snaps = extractSnapshots(fcResult.response);
    const summarySnap = snaps["search_result"];

    // Persist all section snapshots
    const sectionRows: AnyObj[] = [];
    const sectionMap: Record<string, { html?: string; markdown?: string }> = {};
    for (const s of KW_SECTIONS) {
      const snap = snaps[s.key];
      const success = !!(snap && (snap.html || snap.markdown));
      sectionMap[s.key] = { html: snap?.html, markdown: snap?.markdown };
      sectionRows.push({
        job_id: jobId,
        application_id: data.application_id ?? null,
        kw_number: kw,
        section_key: s.key,
        section_label: s.label,
        raw_html: snap?.html ?? null,
        raw_text: null,
        markdown: snap?.markdown ?? null,
        screenshot_url: snap?.screenshot ?? null,
        url: snap?.url ?? null,
        success,
        error_message: success ? null : "Brak treści w odpowiedzi Firecrawl",
      });
    }
    // include search-result snapshot as its own row
    if (summarySnap) {
      sectionRows.unshift({
        job_id: jobId,
        application_id: data.application_id ?? null,
        kw_number: kw,
        section_key: "SEARCH_RESULT",
        section_label: "Ekran wyniku wyszukiwania",
        raw_html: summarySnap.html ?? null,
        raw_text: null,
        markdown: summarySnap.markdown ?? null,
        screenshot_url: summarySnap.screenshot ?? null,
        url: summarySnap.url ?? null,
        success: !!(summarySnap.html || summarySnap.markdown),
        error_message: null,
      });
    }
    if (sectionRows.length) await supabase.from("kw_section_sources").insert(sectionRows);

    // Run parser on whatever we got
    const parsed = parseKw(kw, {
      summary: summarySnap ? { raw_html: summarySnap.html, raw_text: summarySnap.markdown } : null,
      sections: {
        "I-O": sectionMap["I-O"] ? { raw_html: sectionMap["I-O"].html, raw_text: sectionMap["I-O"].markdown } : undefined,
        "I-Sp": sectionMap["I-Sp"] ? { raw_html: sectionMap["I-Sp"].html, raw_text: sectionMap["I-Sp"].markdown } : undefined,
        II: sectionMap["II"] ? { raw_html: sectionMap["II"].html, raw_text: sectionMap["II"].markdown } : undefined,
        III: sectionMap["III"] ? { raw_html: sectionMap["III"].html, raw_text: sectionMap["III"].markdown } : undefined,
        IV: sectionMap["IV"] ? { raw_html: sectionMap["IV"].html, raw_text: sectionMap["IV"].markdown } : undefined,
      },
    });

    const allOk = parsed.missing_sections.length === 0 && !!summarySnap;
    const anyOk = sectionRows.some((r) => r.success);
    const fcOk = fcResult.ok;
    const fcError = fcOk ? null : firecrawlErrorMessage(fcResult);
    let status: string;
    if (!fcOk) status = "FIRECRAWL_ERROR";
    else if (allOk) status = "SUCCESS";
    else if (anyOk) status = "PARTIAL_SUCCESS";
    else status = "FAILED_NOT_FOUND";

    const score = computeLegalRiskScore(parsed);
    const investorSummary = buildInvestorSummary(parsed, score);
    const warning = parsed.missing_sections.length > 0 ? KW_INCOMPLETE_WARNING : null;

    await supabase
      .from("kw_fetch_attempts")
      .update({
        status,
        firecrawl_request: fcResult.request,
        firecrawl_response: fcResult.response,
        error_message: fcError,
        finished_at: new Date().toISOString(),
      })
      .eq("id", attemptId);

    await supabase
      .from("kw_fetch_jobs")
      .update({
        status,
        partial_success: status === "PARTIAL_SUCCESS",
        missing_sections: parsed.missing_sections,
        parsed_json: parsed,
        summary_raw_html: summarySnap?.html ?? null,
        summary_raw_text: summarySnap?.markdown ?? null,
        fetched_at: new Date().toISOString(),
        error_message: fcError,
        failure_reason:
          status === "FAILED_NOT_FOUND"
            ? "Brak treści w odpowiedzi"
            : status === "PARTIAL_SUCCESS"
              ? "Część działów nie została pobrana"
              : null,
      })
      .eq("id", jobId);

    await supabase.from("kw_analysis").insert({
      job_id: jobId,
      application_id: data.application_id ?? null,
      kw_number: kw,
      property_json: parsed.property,
      owners_json: parsed.owners,
      section_i_o_json: { raw: parsed.property?.section_i_o_raw ?? null },
      section_i_sp_json: { raw: parsed.property?.section_i_sp_raw ?? null },
      section_ii_json: { owners: parsed.owners },
      section_iii_json: parsed.section_iii,
      section_iv_json: parsed.section_iv,
      risk_flags: parsed.risk_flags,
      investor_summary: investorSummary,
      legal_risk_score: score,
      analysis_warning: warning,
    });

    return { ok: true, jobId, status, score, missing: parsed.missing_sections };
  });

/** List most recent KW fetch jobs (admin/kw). */
export const listKwJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ limit: z.number().min(1).max(100).optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await requireStaff(supabase, userId);
    const { data: jobs } = await supabase
      .from("kw_fetch_jobs")
      .select("id, kw_number, status, attempts, missing_sections, fetched_at, created_at, fetch_provider, error_message")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 30);
    return { jobs: jobs ?? [] };
  });

/** Full details for a single job (admin/kw). */
export const getKwJobDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ job_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await requireStaff(supabase, userId);
    const [job, attempts, sources, analysis] = await Promise.all([
      supabase.from("kw_fetch_jobs").select("*").eq("id", data.job_id).maybeSingle(),
      supabase
        .from("kw_fetch_attempts")
        .select("id, attempt_number, status, error_message, started_at, finished_at, firecrawl_request, firecrawl_response")
        .eq("job_id", data.job_id)
        .order("attempt_number", { ascending: false }),
      supabase
        .from("kw_section_sources")
        .select("id, section_key, section_label, success, error_message, raw_html, markdown, screenshot_url, url, fetched_at")
        .eq("job_id", data.job_id)
        .order("fetched_at", { ascending: true }),
      supabase
        .from("kw_analysis")
        .select("*")
        .eq("job_id", data.job_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    return {
      job: job.data ?? null,
      attempts: attempts.data ?? [],
      sources: sources.data ?? [],
      analysis: analysis.data ?? null,
    };
  });

/** Re-run parser + scoring using already-saved section sources. */
export const rerunKwParser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ job_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await requireStaff(supabase, userId);

    const { data: job, error: je } = await supabase.from("kw_fetch_jobs").select("*").eq("id", data.job_id).single();
    if (je || !job) throw new Error("Zadanie nie istnieje");
    const { data: sources } = await supabase
      .from("kw_section_sources")
      .select("section_key, raw_html, markdown")
      .eq("job_id", data.job_id);

    const map: Record<string, { html?: string; markdown?: string }> = {};
    let summary: { html?: string; markdown?: string } | null = null;
    for (const r of sources ?? []) {
      if (r.section_key === "SEARCH_RESULT") summary = { html: r.raw_html ?? undefined, markdown: r.markdown ?? undefined };
      else map[r.section_key] = { html: r.raw_html ?? undefined, markdown: r.markdown ?? undefined };
    }

    const parsed = parseKw(job.kw_number, {
      summary: summary ? { raw_html: summary.html, raw_text: summary.markdown } : null,
      sections: {
        "I-O": map["I-O"] ? { raw_html: map["I-O"].html, raw_text: map["I-O"].markdown } : undefined,
        "I-Sp": map["I-Sp"] ? { raw_html: map["I-Sp"].html, raw_text: map["I-Sp"].markdown } : undefined,
        II: map["II"] ? { raw_html: map["II"].html, raw_text: map["II"].markdown } : undefined,
        III: map["III"] ? { raw_html: map["III"].html, raw_text: map["III"].markdown } : undefined,
        IV: map["IV"] ? { raw_html: map["IV"].html, raw_text: map["IV"].markdown } : undefined,
      },
    });
    const score = computeLegalRiskScore(parsed);
    const investorSummary = buildInvestorSummary(parsed, score);
    const warning = parsed.missing_sections.length > 0 ? KW_INCOMPLETE_WARNING : null;

    await supabase
      .from("kw_fetch_jobs")
      .update({ parsed_json: parsed, missing_sections: parsed.missing_sections })
      .eq("id", data.job_id);

    await supabase.from("kw_analysis").insert({
      job_id: data.job_id,
      application_id: job.application_id ?? null,
      kw_number: job.kw_number,
      property_json: parsed.property,
      owners_json: parsed.owners,
      section_i_o_json: { raw: parsed.property?.section_i_o_raw ?? null },
      section_i_sp_json: { raw: parsed.property?.section_i_sp_raw ?? null },
      section_ii_json: { owners: parsed.owners },
      section_iii_json: parsed.section_iii,
      section_iv_json: parsed.section_iv,
      risk_flags: parsed.risk_flags,
      investor_summary: investorSummary,
      legal_risk_score: score,
      analysis_warning: warning,
    });

    return { ok: true, score, missing: parsed.missing_sections };
  });
