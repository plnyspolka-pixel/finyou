// kw-fetcher-worker — minimalny worker Playwright dla portalu EKW.
// Uruchamiać POZA Lovable. Patrz README.md.

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EKW_BASE_URL = process.env.EKW_BASE_URL || 'https://przegladarka-ekw.ms.gov.pl/eukw_prz/KsiegiWieczyste/wyszukiwanieKW';
const INTERVAL = Number(process.env.KW_WORKER_INTERVAL_SECONDS || 60) * 1000;
const RETRY_HOURS = Number(process.env.KW_RETRY_DELAY_HOURS || 24);
const HEADLESS = (process.env.HEADLESS ?? 'true') !== 'false';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Brak SUPABASE_URL lub SUPABASE_SERVICE_ROLE_KEY w .env');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SECTIONS = [
  { key: 'I-O',  label: 'Dział I-O',  expectedHeader: 'DZIAŁ I-O' },
  { key: 'I-Sp', label: 'Dział I-Sp', expectedHeader: 'DZIAŁ I-SP' },
  { key: 'II',   label: 'Dział II',   expectedHeader: 'DZIAŁ II' },
  { key: 'III',  label: 'Dział III',  expectedHeader: 'DZIAŁ III' },
  { key: 'IV',   label: 'Dział IV',   expectedHeader: 'DZIAŁ IV' },
];

function splitKw(kw) {
  const m = kw.trim().toUpperCase().match(/^([A-Z]{2}[0-9A-Z]{2})\/([0-9]{8})\/([0-9])$/);
  if (!m) return null;
  return { dept: m[1], number: m[2], check: m[3] };
}

async function claimJob() {
  const nowIso = new Date().toISOString();
  const { data } = await sb.from('kw_fetch_jobs')
    .select('*')
    .in('status', ['PENDING', 'RETRY_SCHEDULED', 'RATE_LIMITED', 'BLOCKED_BY_SECURITY'])
    .lte('next_attempt_at', nowIso)
    .lt('attempts', 'max_attempts')
    .order('next_attempt_at', { ascending: true })
    .limit(1);
  const job = (data || [])[0];
  if (!job) return null;
  if (job.attempts >= job.max_attempts) return null;
  const newAttempts = job.attempts + 1;
  const upd = await sb.from('kw_fetch_jobs').update({
    status: 'PROCESSING',
    attempts: newAttempts,
    last_attempt_at: nowIso,
  }).eq('id', job.id).eq('attempts', job.attempts).select().single();
  if (upd.error || !upd.data) return null;
  const attempt = await sb.from('kw_fetch_attempts').insert({
    job_id: job.id, application_id: job.application_id, kw_number: job.kw_number,
    attempt_number: newAttempts, status: 'PROCESSING', started_at: nowIso,
  }).select().single();
  return { job: upd.data, attemptId: attempt.data?.id };
}

async function finishAttempt(attemptId, status, errorMessage, failureReason) {
  if (!attemptId) return;
  await sb.from('kw_fetch_attempts').update({
    status, error_message: errorMessage ?? null, failure_reason: failureReason ?? null,
    finished_at: new Date().toISOString(),
  }).eq('id', attemptId);
}

async function scheduleRetryOrFail(job, reason, technicalError, blocked = false) {
  const nextStatus = blocked
    ? (job.attempts >= job.max_attempts ? 'REQUIRES_MANUAL_REVIEW' : 'BLOCKED_BY_SECURITY')
    : (job.attempts >= job.max_attempts ? 'FAILED_MAX_ATTEMPTS' : 'RETRY_SCHEDULED');
  await sb.from('kw_fetch_jobs').update({
    status: nextStatus,
    next_attempt_at: new Date(Date.now() + RETRY_HOURS * 3600 * 1000).toISOString(),
    failure_reason: reason,
    error_message: technicalError ?? null,
  }).eq('id', job.id);
  return nextStatus;
}

async function processJob(browser, job) {
  const parts = splitKw(job.kw_number);
  if (!parts) {
    await sb.from('kw_fetch_jobs').update({
      status: 'FAILED_INVALID_NUMBER',
      failure_reason: 'Numer KW ma nieprawidłowy format',
    }).eq('id', job.id);
    return 'FAILED_INVALID_NUMBER';
  }

  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  try {
    await page.goto(EKW_BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wypełnij formularz wyszukiwania
    await page.fill('input[id*="kodWydzialu"], input[name*="kodWydzialu"]', parts.dept);
    await page.fill('input[id*="numerKsiegiWieczystej"], input[name*="numerKsiegiWieczystej"]', parts.number);
    await page.fill('input[id*="cyfraKontrolna"], input[name*="cyfraKontrolna"]', parts.check);

    // Klik "Wyszukaj księgę"
    await page.getByRole('button', { name: /wyszukaj księgę/i }).click({ timeout: 15000 });
    await page.waitForLoadState('domcontentloaded');

    const bodyText = (await page.locator('body').innerText()).toLowerCase();
    if (/captcha|bezpiecze[nń]stw|zablokow|chwilowo niedost/i.test(bodyText)) {
      return await scheduleRetryOrFail(job, 'Zabezpieczenie strony EKW uniemożliwiło automatyczne pobranie', null, true);
    }
    if (/nie znaleziono|brak ksi[eę]gi/i.test(bodyText)) {
      await sb.from('kw_fetch_jobs').update({
        status: 'FAILED_NOT_FOUND',
        failure_reason: 'Księga nie istnieje w portalu EKW',
      }).eq('id', job.id);
      return 'FAILED_NOT_FOUND';
    }

    const summary_html = await page.content();
    const summary_text = await page.locator('body').innerText();

    // Klik "Przeglądanie aktualnej treści KW"
    await page.getByRole('button', { name: /przegl[aą]danie aktualnej tre[sś]ci kw/i }).click({ timeout: 15000 });
    await page.waitForLoadState('domcontentloaded');

    const collected = {};
    const missing = [];

    for (const s of SECTIONS) {
      let ok = false;
      let lastErr = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await page.getByRole('button', { name: new RegExp(s.label.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i') }).click({ timeout: 10000 });
          await page.waitForTimeout(800);
          const txt = await page.locator('body').innerText();
          if (txt.toUpperCase().includes(s.expectedHeader)) {
            const html = await page.content();
            collected[s.key] = { raw_html: html, raw_text: txt };
            await sb.from('kw_section_sources').insert({
              job_id: job.id, application_id: job.application_id, kw_number: job.kw_number,
              section_key: s.key, section_label: s.label, raw_html: html, raw_text: txt,
              url: page.url(), success: true,
            });
            ok = true;
            break;
          }
          lastErr = `Nie znaleziono nagłówka ${s.expectedHeader}`;
        } catch (e) {
          lastErr = e?.message ?? String(e);
        }
      }
      if (!ok) {
        missing.push(s.key);
        await sb.from('kw_section_sources').insert({
          job_id: job.id, application_id: job.application_id, kw_number: job.kw_number,
          section_key: s.key, section_label: s.label, success: false, error_message: lastErr,
        });
      }
    }

    const partial = missing.length > 0;
    await sb.from('kw_fetch_jobs').update({
      status: partial ? (missing.includes('III') || missing.includes('IV') ? 'REQUIRES_MANUAL_REVIEW' : 'PARTIAL_SUCCESS') : 'SUCCESS',
      summary_raw_html: summary_html,
      summary_raw_text: summary_text,
      raw_html: Object.values(collected).map((c) => c.raw_html).join('\n<!--SECTION-->\n'),
      raw_text: Object.values(collected).map((c) => c.raw_text).join('\n--- SECTION ---\n'),
      missing_sections: missing,
      partial_success: partial,
      fetched_at: new Date().toISOString(),
      error_message: null,
      failure_reason: partial ? `Nie pobrano działów: ${missing.join(', ')}` : null,
    }).eq('id', job.id);

    return partial ? 'PARTIAL_SUCCESS' : 'SUCCESS';
  } catch (e) {
    const msg = e?.message ?? String(e);
    return await scheduleRetryOrFail(job, 'Błąd techniczny przy pobieraniu KW', msg, /captcha|recaptcha/i.test(msg));
  } finally {
    await ctx.close().catch(() => {});
  }
}

async function tick(browser) {
  const claimed = await claimJob();
  if (!claimed) return;
  console.log(`[kw-worker] processing job ${claimed.job.id} (${claimed.job.kw_number})`);
  let finalStatus = 'FAILED_MAX_ATTEMPTS';
  try {
    finalStatus = await processJob(browser, claimed.job);
  } catch (e) {
    console.error('[kw-worker] processJob threw', e);
    finalStatus = await scheduleRetryOrFail(claimed.job, 'Niespodziewany błąd workera', String(e?.message || e));
  } finally {
    await finishAttempt(claimed.attemptId, finalStatus,
      finalStatus.startsWith('FAILED') || finalStatus === 'BLOCKED_BY_SECURITY' ? 'see job error_message' : null, null);
    console.log(`[kw-worker] job ${claimed.job.id} -> ${finalStatus}`);
  }
}

async function main() {
  console.log('[kw-worker] starting');
  const browser = await chromium.launch({ headless: HEADLESS });
  process.on('SIGINT', async () => { await browser.close(); process.exit(0); });
  while (true) {
    try { await tick(browser); }
    catch (e) { console.error('[kw-worker] tick failed', e); }
    await new Promise((r) => setTimeout(r, INTERVAL));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
