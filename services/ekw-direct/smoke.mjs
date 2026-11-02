// Probe public search form only: no KW number, no personal data.
import { chromium } from "playwright";
import { EKW_SEARCH_URL, isBlockedPage } from "./capture.mjs";

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ locale: "pl-PL" });
  const page = await context.newPage();
  const response = await page.goto(EKW_SEARCH_URL, { waitUntil: "domcontentloaded", timeout: 25000 });
  const content = await page.locator("body").innerText().catch(() => "");
  const probe = {
    httpStatus: response?.status() ?? null,
    blocked: isBlockedPage(content) || (await page.locator('iframe[src*="recaptcha"], .g-recaptcha').count()) > 0,
    courtInput: (await page.locator("#kodWydzialuInput").count()) > 0,
    numberInput: (await page.locator('input[name="numerKw"]').count()) > 0,
    digitInput: (await page.locator('input[name="cyfraKontrolna"]').count()) > 0,
    searchButton: (await page.locator('input[name="wyszukaj"]').count()) > 0,
  };
  console.log(JSON.stringify(probe));
  if (probe.blocked || !probe.courtInput || !probe.numberInput || !probe.digitInput || !probe.searchButton) {
    process.exitCode = 2;
  }
} finally {
  await browser.close();
}
