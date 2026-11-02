/**
 * Experimental EKW provider adapter: independent of CMD and EasyMKW.
 * Config: APIFY_API_TOKEN. This module never logs/stores names, PESEL, or KW contents.
 * Actor is community-maintained. NEVER claim legal due diligence readiness until
 * an end-to-end comparison with official EKW is completed.
 */
export const ACTOR_ID = "regdata~ekw-ksiegi-wieczyste-scraper";
export const REQUIRED = Object.freeze([
  ["dzialIO", "I-O"], ["dzialISp", "I-Sp"], ["dzialII", "II"],
  ["dzialIII", "III"], ["dzialIV", "IV"],
]);

export class ProviderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
  }
}
export function normalizedKw(s) {
  const compact = String(s || "").toUpperCase().replaceAll("/", "").replaceAll(" ", "");
  if (!/^[A-Z0-9]{4}[0-9]{9}$/.test(compact)) throw new ProviderError("INVALID_KW", "Podaj pełny, prawidłowy numer KW");
  return compact.slice(0, 4) + "/" + compact.slice(4, 12) + "/" + compact.slice(12);
}

function populated(value) {
  if (typeof value === "string") return value.trim().length > 0 && value.trim() !== "...";
  if (Array.isArray(value)) return value.some(populated);
  if (value && typeof value === "object") return Object.values(value).some(populated);
  return false;
}

/** Returns no names/PESEL/text. Distinguishes explicit BRAK WPISÓW from missing data. */
export function assessExtract(record, expectedKw) {
  if (!record || typeof record !== "object" || record.success !== true) {
    throw new ProviderError("NO_SUCCESS", "Brak potwierdzonego wyniku EKW");
  }
  if (normalizedKw(record.kwNumber) !== normalizedKw(expectedKw)) {
    throw new ProviderError("MISMATCH", "Dostawca zwrócił inną księgę");
  }
  if (record.viewType !== "aktualna") {
    throw new ProviderError("NOT_CURRENT", "Nie otrzymano aktualnego widoku EKW");
  }
  const statuses = [];
  for (const [key, label] of REQUIRED) {
    const section = record[key];
    if (!section || typeof section !== "object" || section.available === false) {
      throw new ProviderError("MISSING_SECTION", "Brak potwierdzonego działu " + label);
    }
    const explicitEmpty = section.empty === true && /brak\s+wpis[oó]w?/i.test(String(section.rawText ?? ""));
    const hasPayload = populated(section.entries) || populated(section.rawHtml) || populated(section.rawText);
    if (!explicitEmpty && !hasPayload) {
      throw new ProviderError("AMBIGUOUS_SECTION", "Nie można odróżnić pustego działu " + label + " od błędu parsowania");
    }
    if (section.empty === true && hasPayload && !explicitEmpty) {
      throw new ProviderError("CONTRADICTORY_SECTION", "Dział " + label + " oznaczono jako pusty bez dowodu");
    }
    statuses.push({ section: label, status: explicitEmpty ? "officially_empty" : "content_received",
      rawHtmlPresent: typeof section.rawHtml === "string" && section.rawHtml.length > 20 });
  }
  // Actor examples do not establish that mentions are preserved.
  // This is deliberately conservative: completeness of sections != complete legal verification.
  return {
    fiveSectionsPresent: true,
    sections: statuses,
    mentionsVerified: false,
    readyForLegalAnalysis: false,
  };
}

/** One paid query max; no retry on timeout (remote job may continue and still be billed). */
export async function queryApify(kw, {token, fetchImpl=fetch, timeoutMs=115000, maxChargeUsd=0.10}={}) {
  if (!token) throw new ProviderError("MISSING_TOKEN", "Brak APIFY_API_TOKEN");
  const formatted=normalizedKw(kw);
  const url = new URL("https://api.apify.com/v2/acts/" + ACTOR_ID + "/run-sync-get-dataset-items");
  url.searchParams.set("timeout","110");
  url.searchParams.set("maxItems","1");
  url.searchParams.set("maxTotalChargeUsd",String(maxChargeUsd));
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  let response;
  try {
    response=await fetchImpl(url.toString(), {
      method:"POST",
      headers:{"Authorization":"Bearer " + token,"Content-Type":"application/json","Accept":"application/json"},
      body:JSON.stringify({kwNumbers:[formatted],viewType:"aktualna",sections:["IO","ISp","II","III","IV"],includeRawHtml:true}),
      signal:controller.signal,
    });
  } finally {clearTimeout(timer)}
  if (!response.ok) throw new ProviderError("HTTP_"+response.status,
    "Apify zwrócił HTTP "+response.status+". Nie ponawiaj w ciemno: poprzedni job mógł zostać uruchomiony.");
  const payload=await response.json();
  if (!Array.isArray(payload) || payload.length!==1) {
    throw new ProviderError("EMPTY_OR_MULTIPLE", "Dostawca nie zwrócił dokładnie jednego wyniku. Sprawdź status zadania w Apify.");
  }
  const assessment=assessExtract(payload[0],formatted);
  return {assessment, raw:payload[0]};
}
