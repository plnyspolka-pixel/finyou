export const EKW_SEARCH_URL =
  "https://przegladarka-ekw.ms.gov.pl/eukw_prz/KsiegiWieczyste/wyszukiwanieKW";

export const EKW_SECTIONS = Object.freeze({
  dzial_1o: "Dział I-O",
  dzial_1s: "Dział I-Sp",
  dzial_2: "Dział II",
  dzial_3: "Dział III",
  dzial_4: "Dział IV",
});

export class EkwError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "EkwError";
    this.code = code;
  }
}

/** Accept only full, specific KW numbers (with or without slashes). */
export function parseKw(raw) {
  const compact = String(raw ?? "").trim().toUpperCase().replaceAll("/", "");
  const match = /^([A-Z0-9]{2}[0-9][A-Z0-9])([0-9]{8})([0-9])$/.exec(compact);
  if (!match) throw new EkwError("INVALID_KW", "Wymagany pełny numer KW: XXXX/00000000/0.");
  return { court: match[1], number: match[2], check: match[3], compact, formatted: match.slice(1).join("/") };
}

/** Do not confuse security blocks / CAPTCHA pages with an empty land register. */
export function isBlockedPage(text) {
  return /captcha|nie jestem robotem|i.m not a robot|access denied|requested url was rejected|support id:|incapsula|imperva/i.test(text);
}

async function requireUnblocked(page) {
  const text = (await page.locator("body").innerText().catch(() => "")).slice(0, 3000);
  const recaptcha = await page.locator('iframe[src*="recaptcha"], .g-recaptcha, iframe[src*="hcaptcha"]').count();
  if (recaptcha || isBlockedPage(text)) {
    throw new EkwError("HUMAN_VERIFICATION", "EKW wymaga interakcji człowieka lub blokuje sesję; nie omijamy zabezpieczeń.");
  }
}

/**
 * Preserve the original EKW table semantics so Finance You's existing
 * owners, address, mortgage and risk parsers keep working.
 * Remove active content, handlers and URLs before returning HTML to the app.
 */
async function safeTableHtml(page) {
  return page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll("table"));
    const relevant = tables.filter((table) => {
      const txt = (table.textContent || "").trim();
      return txt.length > 8 && (
        table.querySelector(".csTytul, .csDane, .csBDane") ||
        /wpis|rubryka|hipotek|właściciel|nieruchomoś|prawo|obszar/i.test(txt)
      );
    });
    return relevant.map((table) => {
      const copy = table.cloneNode(true);
      copy.querySelectorAll("script,style,iframe,object,embed,form,input,button,svg,link,meta").forEach((el) => el.remove());
      for (const element of [copy, ...copy.querySelectorAll("*")]) {
        for (const attr of [...element.attributes]) {
          const permitted =
            (attr.name === "class" && /^[\w \-]+$/.test(attr.value)) ||
            ((attr.name === "colspan" || attr.name === "rowspan") && /^[1-9][0-9]?$/.test(attr.value));
          if (!permitted) element.removeAttribute(attr.name);
        }
      }
      return copy.outerHTML;
    }).join("\n");
  });
}

async function clickInput(page, name, timeout = 8000) {
  const input = page.locator('input[name="' + name + '"]');
  await input.first().click({ timeout });
  await page.waitForLoadState("domcontentloaded", { timeout: 7000 }).catch(() => {});
  await requireUnblocked(page);
}

/**
 * One KW at a time. Browser automates public UI; it does not bypass
 * CAPTCHA, spoof identities, rotate IPs or reverse-engineer a private API.
 * Returns status only after all five tabs were actually read.
 */
export async function captureKw(rawKw, options = {}) {
  const kw = parseKw(rawKw);
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: options.headless !== false });
  const context = await browser.newContext({ locale: "pl-PL", acceptDownloads: false });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  try {
    // Official entry path: do not assume deep-linking to the search form is supported.
    // Open the public landing page and use its "Przeglądanie księgi wieczystej" link.
    // The destination may open in a new tab, so keep the selected active viewer page.
    const landing = await page.goto("https://ekw.ms.gov.pl/eukw_ogol/menu.do", {
      waitUntil: "domcontentloaded", timeout: 25000,
    });
    if (!landing?.ok()) {
      throw new EkwError("EKW_HOME_UNAVAILABLE",
        "Nie udało się otworzyć strony głównej EKW (HTTP " + (landing?.status() ?? "brak odpowiedzi") + ").");
    }
    const officialLink = page.getByRole("link", { name: /Przeglądanie księgi wieczystej/i });
    if (!(await officialLink.count())) {
      throw new EkwError("EKW_UI_CHANGED", "Nie znaleziono oficjalnego odnośnika do przeglądarki EKW.");
    }
    const opened = page.waitForEvent("popup", { timeout: 3000 }).catch(() => null);
    await officialLink.first().click();
    const popup = await opened;
    const viewer = popup ?? page;
    await viewer.waitForLoadState("domcontentloaded", { timeout: 12000 }).catch(() => {});
    const viewerUrl = viewer.url();
    if (!viewerUrl.startsWith("https://przegladarka-ekw.ms.gov.pl/eukw_prz/")) {
      throw new EkwError("EKW_UNEXPECTED_REDIRECT", "Oficjalny link przekierował poza przeglądarkę EKW.");
    }
    const viewerContent = (await viewer.locator("body").innerText().catch(() => "")).slice(0, 4000);
    const securityFrame = await viewer.locator('iframe[src*="_Incapsula_Resource"], iframe[src*="captcha"], iframe[src*="incident"]').count();
    const hasAccessDenied = isBlockedPage(viewerContent) ||
      /access denied|error 15|request was blocked by our security service/i.test(viewerContent) ||
      securityFrame > 0;
    if (hasAccessDenied || !(await viewer.locator("#kodWydzialuInput").count())) {
      throw new EkwError("EKW_ACCESS_BLOCKED",
        "Oficjalna przeglądarka EKW nie udostępniła formularza numeru KW. " +
        "Blokada WAF lub zmiana interfejsu; brak automatycznego ponawiania.");
    }
    // Further interactions use the page returned from the official navigation.
    const kwPage = viewer;
    await requireUnblocked(kwPage);
    await kwPage.locator("#kodWydzialuInput").fill(kw.court);
    await kwPage.locator('input[name="numerKw"]').fill(kw.number);
    await kwPage.locator('input[name="cyfraKontrolna"]').fill(kw.check);
    await clickInput(kwPage, "wyszukaj");

    const resultButton = kwPage.locator('input[name="przyciskWydrukZwykly"]');
    if (!(await resultButton.count())) {
      throw new EkwError("NOT_FOUND_OR_CHANGED_UI", "EKW nie zwróciło przycisku aktualnej treści; sprawdź numer lub układ portalu.");
    }
    await clickInput(kwPage, "przyciskWydrukZwykly");

    const result = {
      kw_number: kw.compact,
      source: "ekw.ms.gov.pl",
      source_url: EKW_SEARCH_URL,
      fetched_at: new Date().toISOString(),
      okladka: '<table><tr><td class="csTytul">Numer księgi wieczystej</td><td class="csDane">' + kw.formatted + '</td></tr></table>',
    };
    for (const [field, tab] of Object.entries(EKW_SECTIONS)) {
      const button = kwPage.locator('input[value="' + tab + '"]');
      if (!(await button.count())) {
        throw new EkwError("CHANGED_UI", "Nie znaleziono zakładki " + tab + " w EKW.");
      }
      await button.first().click();
      await kwPage.waitForLoadState("domcontentloaded", { timeout: 7000 }).catch(() => {});
      await requireUnblocked(kwPage);
      const html = await safeTableHtml(kwPage);
      if (!html || html.length < 20) {
        throw new EkwError("EMPTY_SECTION", "Nie odczytano działu " + tab + "; treść nie zostanie uznana za kompletną.");
      }
      result[field] = html;
    }
    // Timestamp describes the completion of the last successful source read,
    // not the beginning of navigation through the portal.
    result.fetched_at = new Date().toISOString();
    return result;
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}
