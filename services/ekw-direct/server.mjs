import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { captureKw, EkwError } from "./capture.mjs";

const token = process.env.EKW_DIRECT_TOKEN;
if (!token || token.length < 24) {
  throw new Error("EKW_DIRECT_TOKEN must be set to a strong secret (24+ characters).");
}
const host = process.env.EKW_DIRECT_BIND || "127.0.0.1";
const port = Number(process.env.PORT || 8789);
const intervalMs = Math.max(10000, Number(process.env.EKW_MIN_INTERVAL_MS || 10000));
let inFlight = false;
let nextAllowedAt = 0;

function write(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(data));
}
function authorized(req) {
  const actual = Buffer.from(req.headers.authorization || "");
  const expected = Buffer.from("Bearer " + token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
async function readJson(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 2048) throw new EkwError("REQUEST_TOO_LARGE", "Zbyt duże żądanie.");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf-8")); }
  catch { throw new EkwError("BAD_JSON", "Niepoprawny JSON."); }
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/health" && req.method === "GET") {
    return write(res, 200, { status: "ok", busy: inFlight });
  }
  if (req.url !== "/v1/kw/content" || req.method !== "POST") {
    return write(res, 404, { ok: false, error: { code: "NOT_FOUND", message: "Not found" } });
  }
  if (!authorized(req)) {
    return write(res, 401, { ok: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
  }
  if (inFlight || Date.now() < nextAllowedAt) {
    return write(res, 429, { ok: false, error: { code: "RATE_LIMITED", message: "Trwa pobranie lub obowiązuje odstęp między pobraniami." } });
  }
  inFlight = true;
  try {
    const body = await readJson(req);
    if (!body || typeof body.kw !== "string") throw new EkwError("INVALID_KW", "Brak numeru księgi.");
    const sections = await captureKw(body.kw);
    write(res, 200, { ok: true, sections });
  } catch (error) {
    const code = error instanceof EkwError ? error.code : "BROWSER_ERROR";
    const message = error instanceof EkwError ? error.message : "Nie udało się pobrać EKW (błąd przeglądarki).";
    const status = code === "INVALID_KW" || code === "BAD_JSON" || code === "REQUEST_TOO_LARGE" ? 400 :
      code === "HUMAN_VERIFICATION" ? 409 : code === "NOT_FOUND_OR_CHANGED_UI" ? 422 : 502;
    write(res, status, { ok: false, error: { code, message } });
  } finally {
    inFlight = false;
    nextAllowedAt = Date.now() + intervalMs;
  }
});
server.listen(port, host, () => console.log("[ekw-direct] listening on " + host + ":" + port));
