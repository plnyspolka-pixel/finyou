#!/usr/bin/env node
/**
 * KRZ Portal Publiczny — jednorazowa próba techniczna.
 *
 * Cel: zweryfikować, czy publiczna wyszukiwarka KRZ jest dostępna przez
 * zwykłą przeglądarkę i czy można pobrać jawne wyniki po numerze KRS.
 *
 * NIE jest usługą produkcyjną, NIE używa proxy, stealth ani CAPTCHA bypass.
 * NIE odpytuje PESEL i nie zapisuje cookies, sesji ani surowych odpowiedzi.
 *
 * Uruchomienie (lokalnie, po instalacji Playwright + Chromium):
 *   bunx playwright install chromium
 *   node scripts/krz-public-probe.mjs --krs 0000304735
 *   node scripts/krz-public-probe.mjs --inspect
 *
 * Zwraca JSON ze stanem próby. Brak możliwości odczytu != brak postępowań.
 */

const BASE = "https://krz.ms.gov.pl/";
const SEARCH_URL =
  "https://krz.ms.gov.pl/#!/application/KRZPortalPUB/1.9/KrzRejPubGui.WyszukiwaniePodmiotow?params=JTdCJTdE&itemId=item-2&seq=0";
const DEFAULT_KRS = "0000304735"; // publiczny numer KRS Getin Noble Bank S.A.
const MAX_TEXT = 9000;

function argumentsOf(argv) {
  const pos = argv.indexOf("--krs");
  const krs = pos >= 0 ? argv[pos + 1] : DEFAULT_KRS;
  if (!/^\d{10}$/.test(krs)) throw new Error("Numer KRS musi mieć 10 cyfr.");
  return { krs, inspect: argv.includes("--inspect") };
}

function output(payload, code = 0) {
  process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
  process.exitCode = code;
}

function visibleText(s) {
  return String(s || "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function codeFor(error) {
  const m = String(error ?? "").match(/\b(403|429|503)\b/);
  return m ? Number(m[1]) : null;
}

async function run() {
  const { krs, inspect } = argumentsOf(process.argv.slice(2));
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return output({
      status: "missing_dependency",
      message: 'Zainstaluj lokalnie Playwright: "bun add -d playwright" oraz "bunx playwright install chromium".',
    }, 2);
  }

  const browser = await chromium.launch({
    headless: true,
    // Brak flag usuwających cechy automatyzacji / maskujących klienta.
  });

  let status = "unavailable";
  const network = [];
  let lastHttpStatus = null;
  try {
    const context = await browser.newContext({
      locale: "pl-PL",
      timezoneId: "Europe/Warsaw",
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(12000);

    page.on("response", response => {
      try {
        const u = new URL(response.url());
        if (u.hostname === "krz.ms.gov.pl" || u.hostname.endsWith(".apps.ocp.prod.ms.gov.pl")) {
          if (response.status() >= 400) lastHttpStatus = response.status();
          // Tylko ścieżka — bez query stringu, POST body ani tokenów/sesji.
          const key = response.request().method() + " " + u.origin + u.pathname;
          if (!network.some(n => n.endpoint === key)) {
            network.push({ endpoint: key, httpStatus: response.status() });
          }
        }
      } catch {
        // Nietypowy adres zasobu pomijamy.
      }
    });

    const navigation = await page.goto(SEARCH_URL, {
      waitUntil: "domcontentloaded",
      timeout: 25000,
    }).catch(e => {
      throw new Error("Nawigacja: " + String(e?.message ?? e));
    });

    if (navigation && navigation.status() >= 400) {
      return output({
        status: "blocked",
        httpStatus: navigation.status(),
        message: "Portal zwrócił odmowę dostępu; nie omijamy zabezpieczeń.",
        endpoints: network,
      }, 1);
    }

    await page.waitForTimeout(3500);
    const scopes = [page, ...page.frames().filter(f => f !== page.mainFrame())];
    const getBody = async scope =>
      visibleText(await scope.locator("body").innerText({ timeout: 4000 }).catch(() => ""));

    const bodies = await Promise.all(scopes.map(getBody));
    const body = bodies.join("\n").slice(0, 15000);
    if (/captcha|access denied|odmowa dostępu|weryfikacja przeglądarki|too many requests/i.test(body)) {
      return output({
        status: "blocked",
        message: "Portal wyświetlił mechanizm ochrony dostępu. Przerwano bez obejścia.",
        httpStatus: lastHttpStatus,
        endpoints: network,
      }, 1);
    }
    if (!/wyszukiwanie podmiot|podmiot niebędący|osoba fizyczna|KRZ|krajowy rejestr/i.test(body)) {
      return output({
        status: "not_rendered",
        message: "Nie udało się wyrenderować formularza wyszukiwania.",
        httpStatus: lastHttpStatus,
        frameCount: scopes.length,
        endpoints: network,
      }, 1);
    }

    if (inspect) {
      const fields = [];
      for (const scope of scopes) {
        const entries = await scope.locator("input").evaluateAll(nodes =>
          nodes.slice(0, 30).map(n => ({
            id: n.id || null,
            name: n.name || null,
            placeholder: n.getAttribute("placeholder"),
            type: n.getAttribute("type"),
          }))
        ).catch(() => []);
        if (entries.length) fields.push(...entries);
      }
      return output({
        status: "form_observed",
        message: "Wykryto publiczną stronę; do weryfikacji dostępne są pola i ścieżki.",
        fields,
        endpoints: network,
        // Nie drukujemy HTML ani danych identyfikujących podmioty trzecie.
      });
    }

    // Używamy publicznego przykładowego KRS, nie danych osoby prywatnej.
    let didFill = false;
    for (const scope of scopes) {
      const tab = scope.getByRole("tab", { name: /podmiot niebędący osobą fizyczną/i });
      if (await tab.count().catch(() => 0)) {
        await tab.first().click().catch(() => {});
      }
      const candidates = [
        scope.getByLabel(/numer KRS|^KRS$/i),
        scope.getByPlaceholder(/KRS/i),
        scope.locator('input[name*="krs" i]'),
        scope.locator('input[id*="krs" i]'),
      ];
      for (const field of candidates) {
        if (await field.count().catch(() => 0)) {
          const first = field.first();
          if (await first.isVisible().catch(() => false)) {
            await first.fill(krs);
            didFill = true;
            break;
          }
        }
      }
      if (didFill) {
        const search = scope.getByRole("button", { name: /^wyszukaj$/i });
        if (!await search.count().catch(() => 0)) break;
        await search.last().click();
        status = "search_sent";
        break;
      }
    }

    if (!didFill) {
      return output({
        status: "form_unrecognized",
        message: "Załadowano portal, ale nie odnaleziono pola KRS — potrzebna inspekcja interfejsu.",
        endpoints: network,
      }, 1);
    }

    await page.waitForTimeout(3500);
    const after = visibleText((await Promise.all(scopes.map(getBody))).join("\n")).slice(0, MAX_TEXT);
    if (/captcha|access denied|odmowa dostępu|too many requests/i.test(after)) {
      return output({
        status: "blocked",
        message: "Wyszukiwanie zatrzymane przez ochronę portalu.",
        endpoints: network,
      }, 1);
    }
    if (/brak wyników|nie znaleziono/i.test(after)) {
      status = "response_no_results";
    } else if (/postępowani|teczk|sygnatur|uczestnik/i.test(after)) {
      status = "results_observed";
    } else {
      status = "response_unrecognized";
    }
    return output({
      status,
      lookup: { kind: "public_krs_example", krs },
      message: "To pojedynczy test wyszukiwarki, nie pełny ani zweryfikowany raport o dłużniku.",
      // Zostawiamy krótki fragment, aby ustalić strukturę wyników.
      preview: after.slice(0, 3500),
      endpoints: network,
    }, status === "results_observed" || status === "response_no_results" ? 0 : 1);
  } catch (e) {
    return output({
      status: "unavailable",
      message: String(e?.message ?? e).slice(0, 450),
      httpStatus: codeFor(e) ?? lastHttpStatus,
      endpoints: network,
    }, 1);
  } finally {
    await browser.close();
  }
}

await run();
