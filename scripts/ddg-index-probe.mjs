#!/usr/bin/env node
/**
 * Bounded read-only probe of DuckDuckGo HTML, which is a clearly labeled
 * fallback if Google is unavailable. Does not query private-person names.
 */
const q = '"Marcin Gerbatowski" "GRz-nu"';
const url = "https://html.duckduckgo.com/html/?" + new URLSearchParams({ q, kl: "pl-pl" });
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 15000);
try {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36",
      "Accept-Language": "pl-PL,pl;q=0.9",
    },
    signal: controller.signal,
  });
  const html = (await response.text()).slice(0, 750000);
  const hits = [...html.matchAll(/class="[^"]*result__a[^"]*"/g)].length;
  const blocked = /captcha|unusual traffic|too many requests|bot detection/i.test(html);
  console.log(JSON.stringify({
    status: response.status, pageBytes: html.length,
    resultAnchorCount: hits, blocked,
    signatureMention: html.includes("GD1G/GRz-nu/125/2025"),
    note: "Generic query only; names and personal details are not logged.",
  }, null, 2));
  if (!response.ok || blocked || !hits) process.exitCode = 1;
} catch (e) {
  console.error(String(e?.message ?? e));
  process.exitCode = 2;
} finally {
  clearTimeout(timer);
}
