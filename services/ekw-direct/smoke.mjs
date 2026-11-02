// Probe public search form only: no KW number, no personal data.
import { chromium } from "playwright";
import { EKW_SEARCH_URL, isBlockedPage } from "./capture.mjs";

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ locale: "pl-PL" });
  const homePage = await context.newPage();
  const homeResponse = await homePage.goto("https://ekw.ms.gov.pl/eukw_ogol/menu.do", { waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => null);
  let homeLinkStatus = null;
  if (homeResponse?.ok()) {
    const link = homePage.getByRole("link", { name: /Przeglądanie księgi wieczystej/i });
    if (await link.count()) {
      const navigated = await Promise.all([
        homePage.waitForResponse((r) => r.url().includes("przegladarka-ekw.ms.gov.pl"), { timeout: 8000 }).catch(() => null),
        link.first().click().catch(() => null),
      ]);
      homeLinkStatus = navigated[0]?.status() ?? null;
    }
  }
  const page = await context.newPage();
  const response = await page.goto(EKW_SEARCH_URL, { waitUntil: "domcontentloaded", timeout: 25000 });
  const content = await page.locator("body").innerText().catch(() => "");
  const probe = {
    httpStatus: response?.status() ?? null,
    homeStatus: homeResponse?.status() ?? null,
    linkedSearchStatus: homeLinkStatus,
    blocked: response?.status() === 403 || response?.status() === 429 || isBlockedPage(content) || (await page.locator('iframe[src*="recaptcha"], .g-recaptcha').count()) > 0,
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
