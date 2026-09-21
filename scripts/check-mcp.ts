#!/usr/bin/env bun
/**
 * Weryfikacja produkcyjnego serwera MCP Finance You — bez logowania.
 *
 *   bun run scripts/check-mcp.ts                  # sprawdza https://financeyou.pl
 *   bun run scripts/check-mcp.ts https://inny.host
 *
 * Sprawdza po kolei to, co Claude.ai / ChatGPT robią przy dodawaniu konektora:
 *  1. /.well-known/oauth-protected-resource — metadane zasobu (adres serwera
 *     autoryzacji),
 *  2. metadane serwera autoryzacji (Supabase Auth OAuth Server) — muszą mieć
 *     authorization_endpoint, token_endpoint i registration_endpoint
 *     (dynamiczna rejestracja klienta, bez niej Claude.ai i ChatGPT nie
 *     zarejestrują się same),
 *  3. POST /mcp bez tokenu — oczekiwane 401 z nagłówkiem WWW-Authenticate
 *     wskazującym metadane zasobu (tak klient dowiaduje się, gdzie się logować).
 *
 * Kod wyjścia: 0 = wszystko przeszło, 1 = coś nie gra (szczegóły w wyniku).
 */

type Check = { name: string; ok: boolean; detail: string; hint?: string };

const base = (process.argv[2] ?? "https://financeyou.pl").replace(/\/+$/, "");
const checks: Check[] = [];

function push(c: Check) {
  checks.push(c);
  const mark = c.ok ? "✅" : "❌";
  console.log(`${mark} ${c.name}\n   ${c.detail}${!c.ok && c.hint ? `\n   → ${c.hint}` : ""}`);
}

async function getJson(url: string): Promise<{ status: number; json: any; text: string }> {
  const res = await fetch(url, { headers: { accept: "application/json" }, redirect: "manual" });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* nie-JSON */
  }
  return { status: res.status, json, text };
}

async function main() {
  console.log(`Sprawdzam serwer MCP: ${base}\n`);

  // 1. Protected resource metadata
  let authServers: string[] = [];
  try {
    const r = await getJson(`${base}/.well-known/oauth-protected-resource`);
    const ok = r.status === 200 && r.json && Array.isArray(r.json.authorization_servers);
    authServers = ok ? r.json.authorization_servers : [];
    push({
      name: "Metadane zasobu (/.well-known/oauth-protected-resource)",
      ok,
      detail: ok
        ? `resource=${r.json.resource} · authorization_servers=${authServers.join(", ")}`
        : `HTTP ${r.status}: ${r.text.slice(0, 160).replace(/\s+/g, " ")}`,
      hint: "Endpoint generuje @lovable.dev/mcp-js. Jeśli wraca HTML/404 — na produkcji nie ma wdrożonej wersji z MCP (opublikuj aplikację).",
    });
  } catch (e) {
    push({
      name: "Metadane zasobu (/.well-known/oauth-protected-resource)",
      ok: false,
      detail: (e as Error).message,
      hint: "Host nieosiągalny albo TLS. Sprawdź adres.",
    });
  }

  // 2. Authorization server metadata (RFC 8414 — dwie możliwe lokalizacje)
  for (const issuer of authServers) {
    const u = new URL(issuer);
    const candidates = [
      `${issuer.replace(/\/+$/, "")}/.well-known/oauth-authorization-server`,
      `${u.origin}/.well-known/oauth-authorization-server${u.pathname.replace(/\/+$/, "")}`,
    ];
    let found: { url: string; json: any } | null = null;
    const attempts: string[] = [];
    for (const c of candidates) {
      try {
        const r = await getJson(c);
        attempts.push(`${c} → HTTP ${r.status}`);
        if (r.status === 200 && r.json?.authorization_endpoint) {
          found = { url: c, json: r.json };
          break;
        }
      } catch (e) {
        attempts.push(`${c} → ${(e as Error).message}`);
      }
    }
    const j = found?.json;
    const hasDcr = !!j?.registration_endpoint;
    push({
      name: `Serwer autoryzacji (${issuer})`,
      ok: !!found && hasDcr,
      detail: found
        ? `authorization_endpoint=${j.authorization_endpoint} · token_endpoint=${j.token_endpoint} · registration_endpoint=${j.registration_endpoint ?? "BRAK"}`
        : attempts.join(" | "),
      hint: !found
        ? "W panelu bazy (Authentication → OAuth Server) włącz „OAuth Server” i ustaw Authorization/Consent URL na https://financeyou.pl/.lovable/oauth/consent."
        : "Brak registration_endpoint: włącz dynamiczną rejestrację klientów (Dynamic Client Registration) w ustawieniach OAuth Server.",
    });
  }

  // 3. /mcp bez tokenu → 401 + WWW-Authenticate
  try {
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "check-mcp", version: "1" },
        },
      }),
      redirect: "manual",
    });
    const www = res.headers.get("www-authenticate") ?? "";
    const ok = res.status === 401 && /resource_metadata=/.test(www);
    push({
      name: "POST /mcp bez tokenu",
      ok,
      detail: `HTTP ${res.status} · WWW-Authenticate: ${www || "(brak)"}`,
      hint: "Oczekiwane 401 z resource_metadata. 200/HTML = trasa /mcp nie jest obsługiwana przez serwer (stara wersja wdrożenia).",
    });
  } catch (e) {
    push({ name: "POST /mcp bez tokenu", ok: false, detail: (e as Error).message });
  }

  // 4. Strona zgody
  try {
    const res = await fetch(`${base}/.lovable/oauth/consent?authorization_id=test`, {
      redirect: "manual",
    });
    const ok = res.status === 200 || (res.status >= 300 && res.status < 400);
    push({
      name: "Strona zgody (/.lovable/oauth/consent)",
      ok,
      detail: `HTTP ${res.status}${res.headers.get("location") ? ` → ${res.headers.get("location")}` : ""}`,
      hint: "Strona zgody musi się otwierać (przekierowanie do logowania jest OK).",
    });
  } catch (e) {
    push({
      name: "Strona zgody (/.lovable/oauth/consent)",
      ok: false,
      detail: (e as Error).message,
    });
  }

  const failed = checks.filter((c) => !c.ok).length;
  console.log(
    `\n${failed === 0 ? "Wszystko gra — dodaj konektor" : `${failed} problem(y)`}: ${base}/mcp`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
