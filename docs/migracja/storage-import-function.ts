// Funkcja Edge `migration-storage-import` (nowy projekt) — wdrażać tylko na czas kopii Storage,
// verify_jwt = false, potem zastąpić zaślepką 410. SECRET_HASH = sha256(import.secret).
const SECRET_HASH = "__SHA256_IMPORT_SECRET__";
const SOURCE_HOST = "jqvepxhulxdnbwbogkhe.supabase.co";
const BUCKETS = new Set(["ad-creatives","documents","lead-magnets","marketing-materials","pliki-klienta","training-videos","shorts-video","podpisy","aml-private","avatars","property-photos","screening-attachments","studio-media"]);
const VIDEO: Record<string,string> = {mp4:"video/mp4",mov:"video/quicktime",webm:"video/webm",m4v:"video/x-m4v"};

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}
const json = (b: unknown, status = 200) => Response.json(b, { status });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const secret = req.headers.get("x-import-secret") ?? "";
  if (!secret || (await sha256(secret)) !== SECRET_HASH) return json({ error: "unauthorized" }, 401);
  let body: { bucket?: string; name?: string; url?: string; mimetype?: string | null; size?: number | null };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const { bucket, name, url } = body;
  if (!bucket || !BUCKETS.has(bucket) || !name || !url) return json({ error: "bad input" }, 400);
  let src: URL;
  try { src = new URL(url); } catch { return json({ error: "bad url" }, 400); }
  if (src.protocol !== "https:" || src.host !== SOURCE_HOST) return json({ error: "bad host" }, 400);
  const base = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const res = await fetch(src);
  if (!res.ok || !res.body) return json({ error: `download ${res.status}` }, 502);
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  let ct = body.mimetype || res.headers.get("content-type") || "application/octet-stream";
  if (ct === "application/octet-stream" && VIDEO[ext]) ct = VIDEO[ext];
  const len = res.headers.get("content-length");
  const headers: Record<string,string> = { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": ct, "x-upsert": "true", "cache-control": "max-age=3600" };
  if (len) headers["Content-Length"] = len;
  const path = name.split("/").map(encodeURIComponent).join("/");
  const up = await fetch(`${base}/storage/v1/object/${bucket}/${path}`, { method: "POST", headers, body: res.body, // @ts-ignore deno
    duplex: "half" });
  const text = await up.text();
  if (!up.ok) return json({ error: `upload ${up.status}`, detail: text.slice(0, 300) }, 502);
  return json({ ok: true, bytes: len ? Number(len) : null, contentType: ct });
});
