// Jednorazowa sonda dostępności RDF (Repozytorium Dokumentów Finansowych, MS)
// z sieci runnera CI. Tylko odczyt, jawny User-Agent, kilka zapytań, bez obchodzenia
// ochrony: jeśli portal zwraca stronę Incapsula — raportujemy i kończymy.
const UA = "FinanceYou-KYC/1.0 (+https://financeyou.pl)";
const BASE = "https://rdf-przegladarka.ms.gov.pl";
const KRS = process.env.PROBE_KRS || "0000753937"; // publiczna spółka z testu MSiG
const out = (label, res, body) =>
  console.log(`\n=== ${label}: HTTP ${res?.status ?? "ERR"} ${res?.headers?.get("content-type") ?? ""}\n${String(body ?? "").slice(0, 1500)}`);
const blocked = (t) => /incapsula|_Incapsula_Resource|captcha/i.test(t);

async function get(url, accept = "text/html,application/json") {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "pl-PL" } });
    return { res, text: await res.text() };
  } catch (e) { return { res: null, text: String(e) }; }
}
async function post(url, body) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "User-Agent": UA, Accept: "application/json", "Content-Type": "application/json", "Accept-Language": "pl-PL" },
      body: JSON.stringify(body),
    });
    return { res, text: await res.text() };
  } catch (e) { return { res: null, text: String(e) }; }
}

const ip = await get("https://api.ipify.org?format=json", "application/json");
console.log("Runner egress:", ip.text);

const home = await get(`${BASE}/`);
out("RDF strona główna", home.res, home.text);
if (blocked(home.text)) console.log(">>> Strona główna: Incapsula (blokada).");

// Odkrycie endpointów z bundla frontendu (jeśli strona jest dostępna).
const endpoints = new Set();
if (!blocked(home.text)) {
  const scripts = [...home.text.matchAll(/src="([^"]+\.js)"/g)].map((m) => new URL(m[1], BASE + "/").href);
  for (const s of scripts.slice(0, 8)) {
    const js = await get(s, "*/*");
    for (const m of js.text.matchAll(/["'`](\/?services\/[A-Za-z0-9/_-]+)["'`]/g)) endpoints.add(m[1]);
    for (const m of js.text.matchAll(/["'`]([a-z-]+\/(?:wyszukiwanie|podmiot|dokumenty|tresc|pobierz)[A-Za-z0-9/_-]*)["'`]/g)) endpoints.add(m[1]);
  }
  console.log("\n=== Endpointy z bundla:\n" + [...endpoints].join("\n"));
}

// Kandydaci API (publicznie opisywane ścieżki przeglądarki RDF).
const api = `${BASE}/services/rdf/przegladarka-dokumentow-finansowych`;
const search = await post(`${api}/wyszukiwanie`, {
  metadaneStronicowania: { numerStrony: 0, rozmiarStrony: 10, metadaneSortowania: [{ atrybut: "id", kierunek: "MALEJACO" }] },
  numerKRS: KRS,
});
out("POST wyszukiwanie", search.res, search.text);
const podmiot = await post(`${api}/podmiot`, { podmiot: { numerKRS: KRS } });
out("POST podmiot", podmiot.res, podmiot.text);

let docs = [];
try { const j = JSON.parse(search.text); docs = j?.content ?? j?.dokumenty ?? j?.lista ?? []; } catch {}
if (Array.isArray(docs) && docs.length) {
  const id = docs[0]?.id ?? docs[0]?.identyfikator;
  console.log("\nPierwszy dokument:", JSON.stringify(docs[0]).slice(0, 800));
  for (const path of [`dokumenty/${id}`, `dokumenty/tresc-dokumentu/${id}`, `dokumenty/pobierz/${id}`]) {
    const d = await get(`${api}/${path}`, "*/*");
    out(`GET ${path}`, d.res, d.text);
  }
}

// Kontrola: biała lista VAT (produkcja używa jej przez proxy) z tej samej sieci.
const wl = await get(`https://wl-api.mf.gov.pl/api/search/krs/${KRS}?date=${new Date().toISOString().slice(0, 10)}`, "application/json");
out("Biała lista VAT (kontrola)", wl.res, wl.text);

console.log("\n=== PODSUMOWANIE", JSON.stringify({
  home: home.res?.status, homeBlocked: blocked(home.text),
  search: search.res?.status, searchBlocked: blocked(search.text),
  podmiot: podmiot.res?.status, documents: Array.isArray(docs) ? docs.length : 0,
  whiteList: wl.res?.status,
}));
