// Local EKW access diagnostic: uses installed, visible Chrome/Edge. NO KW numbers.
// No CAPTCHA circumvention, page export, personal data or persistent storage.
import { chromium } from "playwright";
import { EKW_SEARCH_URL, isBlockedPage } from "./capture.mjs";

const home = "https://ekw.ms.gov.pl/eukw_ogol/menu.do";
let browser;
let browserName = "";
for (const channel of ["chrome", "msedge"]) {
  try {
    browser = await chromium.launch({ channel, headless: false });
    browserName = channel;
    break;
  } catch (error) {
    console.error(`Browser ${channel} unavailable: ${error instanceof Error ? error.message.split("\n")[0] : "unknown"}`);
  }
}
if (!browser) {
  console.error("Install Google Chrome or Microsoft Edge and run again.");
  process.exit(1);
}

try {
  const context = await browser.newContext({ locale: "pl-PL" });
  const page = await context.newPage();
  const homeResponse = await page.goto(home, { waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => null);
  const searchResponse = await page.goto(EKW_SEARCH_URL, { waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => null);
  const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 2000);
  const result = {
    browser: browserName,
    headed: true,
    homeStatus: homeResponse?.status() ?? null,
    searchStatus: searchResponse?.status() ?? null,
    blocked: [403, 429].includes(searchResponse?.status()) || isBlockedPage(body),
    courtInput: await page.locator("#kodWydzialuInput").count() > 0,
    numberInput: await page.locator('input[name="numerKw"]').count() > 0,
    digitInput: await page.locator('input[name="cyfraKontrolna"]').count() > 0,
  };
  console.log("EKW_LOCAL_DIAGNOSTIC " + JSON.stringify(result));
  console.log("Do not enter personal data in this test window. It will close automatically.");
  await page.waitForTimeout(2500);
  if (result.blocked || !result.courtInput || !result.numberInput || !result.digitInput) {
    process.exitCode = 2;
  }
} finally {
  await browser.close();
}
