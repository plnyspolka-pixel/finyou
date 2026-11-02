#!/usr/bin/env node
// Diagnostics: one Google search in Chromium, no CAPTCHA or access-control bypass.
const { chromium } = await import("playwright");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ locale: "pl-PL", timezoneId: "Europe/Warsaw" });
  const query = '"Marcin Gerbatowski" "GRz-nu"';
  const url = "https://www.google.com/search?" + new URLSearchParams({ q: query, hl: "pl", num: "10" });
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForTimeout(1800);
  const data = await page.evaluate(() => ({
    title: document.title,
    text: document.body?.innerText?.slice(0, 2800),
    links: [...document.querySelectorAll("a")].filter(a => a.querySelector("h3")).slice(0, 12).map(a => ({
      title: a.querySelector("h3")?.textContent?.trim() ?? "",
      url: a.href,
      snippet: a.parentElement?.parentElement?.innerText?.slice(0, 450) ?? "",
    })),
  }));
  console.log(JSON.stringify({ status: response?.status(), url: page.url(), ...data }, null, 2));
  if (!response?.ok()) process.exitCode = 1;
} finally {
  await browser.close();
}
