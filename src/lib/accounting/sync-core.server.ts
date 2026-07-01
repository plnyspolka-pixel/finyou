// Wspólny rdzeń synchronizacji Fakturowo + KSeF (2.0), wywoływany zarówno z
// createServerFn (UI "Synchronizuj teraz"), jak i z hooka cron /api/public/hooks/sync-accounting.
import { accountingDb } from "./db";
import { decryptSensitive } from "@/lib/affiliate/crypto";
import type { KsefEntity } from "@/lib/ksef/client";
import { openKsefSession, closeKsefSession, type KsefSession } from "@/lib/ksef/session";

type SyncResult = { entity: string; direction: "sales" | "purchase"; ok: boolean; count: number; message: string | null };

async function upsertSyncStatus(entityId: string, source: "fakturowo" | "ksef", direction: "sales" | "purchase", ok: boolean, message: string | null, count: number) {
  const now = new Date().toISOString();
  await accountingDb.from("accounting_sync_status").upsert(
    {
      entity_id: entityId,
      source,
      direction,
      last_run_at: now,
      last_success_at: ok ? now : null,
      last_error: ok ? null : message,
      documents_synced: count,
      updated_at: now,
    },
    { onConflict: "entity_id,source,direction" },
  );
}

// ---------------- FAKTUROWO ----------------

function form(params: Record<string, string | number | undefined | null>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") usp.append(k, String(v));
  return usp.toString();
}

function parseFakturowoList(raw: string): { ok: boolean; documents: Record<string, string>[]; error?: string } {
  const lines = raw.split(/\r?\n/).map((l) => l.trim());
  if (lines[0] !== "1") return { ok: false, documents: [], error: raw.slice(0, 400) };
  const docs: Record<string, string>[] = [];
  let current: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    if (!line) continue;
    if (line === "---") { if (Object.keys(current).length) docs.push(current); current = {}; continue; }
    const eq = line.indexOf("=");
    if (eq > 0) current[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  if (Object.keys(current).length) docs.push(current);
  return { ok: true, documents: docs };
}

const toNum = (v: string | undefined) => (v ? Number(String(v).replace(/\s/g, "").replace(",", ".")) || 0 : 0);
const toDate = (v: string | undefined) => (v ? /^(\d{4})-(\d{2})-(\d{2})/.exec(v)?.[0] ?? null : null);

async function fetchFakturowoList(apiId: string, direction: "sales" | "purchase", monthsBack: number) {
  const from = new Date(); from.setMonth(from.getMonth() - monthsBack);
  const body = form({
    api_id: apiId, api_zadanie: 6,
    dokument_rodzaj: direction === "sales" ? 0 : 1,
    dokument_data_wystawienia_od: from.toISOString().slice(0, 10),
    dokument_data_wystawienia_do: new Date().toISOString().slice(0, 10),
  });
  const res = await fetch("https://www.fakturowo.pl/api", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  return parseFakturowoList(await res.text());
}

async function syncFakturowoOne(entity: any, direction: "sales" | "purchase"): Promise<{ ok: boolean; count: number; message: string | null }> {
  const apiId = decryptSensitive(entity.fakturowo_api_id_encrypted) ?? process.env.FAKTUROWO_API_ID;
  if (!apiId) return { ok: false, count: 0, message: "Brak konfiguracji Fakturowo." };
  const listed = await fetchFakturowoList(apiId, direction, 24);
  if (!listed.ok) return { ok: false, count: 0, message: `Fakturowo: ${listed.error}` };
  let inserted = 0;
  for (const d of listed.documents) {
    const externalId = d["dokument_id"] ?? d["id"] ?? d["dokument_numer"];
    if (!externalId) continue;
    const gross = toNum(d["dokument_wartosc_brutto"] ?? d["produkt_wartosc_brutto"]);
    const net = toNum(d["dokument_wartosc_netto"] ?? d["produkt_wartosc_netto"]);
    const vat = Math.round((gross - net) * 100) / 100;
    const row = {
      entity_id: entity.id, direction, source: "fakturowo" as const,
      external_id: String(externalId), invoice_number: d["dokument_numer"] ?? null,
      issue_date: toDate(d["dokument_data_wystawienia"]),
      sale_date: toDate(d["dokument_data_sprzedazy"]) ?? toDate(d["dokument_data_wystawienia"]),
      due_date: toDate(d["dokument_data_platnosci"]),
      counterparty_name: (direction === "sales" ? d["nabywca_nazwa"] : d["sprzedawca_nazwa"]) ?? null,
      counterparty_nip: (direction === "sales" ? d["nabywca_nip"] : d["sprzedawca_nip"]) ?? null,
      counterparty_address: [
        direction === "sales" ? d["nabywca_ulica"] : d["sprzedawca_ulica"],
        direction === "sales" ? d["nabywca_kod"] : d["sprzedawca_kod"],
        direction === "sales" ? d["nabywca_miasto"] : d["sprzedawca_miasto"],
      ].filter(Boolean).join(", ") || null,
      currency: d["dokument_waluta"] || "PLN",
      net_amount: net, vat_amount: vat >= 0 ? vat : 0, gross_amount: gross,
      vat_rate: d["produkt_stawka_vat"] ?? null, pdf_url: d["dokument_pdf"] ?? null,
      raw_payload: d as Record<string, unknown>,
    };
    const { error } = await accountingDb.from("accounting_documents").upsert(row, { onConflict: "entity_id,source,direction,external_id" });
    if (!error) inserted += 1;
  }
  return { ok: true, count: inserted, message: null };
}

// ---------------- KSeF ----------------

type KsefSession = { baseUrl: string; environment: KsefEnvironment; sessionToken: string; nip: string };

async function openSession(entity: KsefEntity): Promise<KsefSession> {
  const envToken = pickEnvTokenFor(entity);
  const environment: KsefEnvironment = entity.ksef_environment && entity.ksef_environment !== "disabled" ? entity.ksef_environment : envToken ? "prod" : "disabled";
  if (environment === "disabled") throw new Error("KSeF wyłączony dla podmiotu.");
  const token = decryptSensitive(entity.ksef_token_encrypted) ?? envToken;
  if (!token) throw new Error("Brak tokenu KSeF.");
  const nip = entity.ksef_nip ?? "";
  if (!nip) throw new Error("Brak NIP podmiotu.");
  const base = ksefBaseUrl(environment);
  if (!base) throw new Error("Nieznane środowisko KSeF.");
  const mfPublicKey = process.env.KSEF_MF_PUBLIC_KEY;
  if (!mfPublicKey) throw new Error("Brak sekretu KSEF_MF_PUBLIC_KEY — nie można otworzyć sesji KSeF.");

  const chRes = await fetch(`${base}/api/online/Session/AuthorisationChallenge`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ contextIdentifier: { type: "onip", identifier: nip } }),
  });
  if (!chRes.ok) throw new Error(`AuthorisationChallenge ${chRes.status}`);
  const ch = (await chRes.json()) as { challenge: string; timestamp: string };
  const encrypted = publicEncrypt(
    { key: mfPublicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(`${token}|${Date.parse(ch.timestamp)}`, "utf8"),
  ).toString("base64");
  const initXml = `<?xml version="1.0" encoding="UTF-8"?><ns3:InitSessionTokenRequest xmlns:ns3="http://ksef.mf.gov.pl/schema/gtw/svc/online/auth/request/2021/10/01/0001"><ns3:Context><Challenge>${ch.challenge}</Challenge><Identifier xsi:type="ns2:SubjectIdentifierByCompanyType" xmlns:ns2="http://ksef.mf.gov.pl/schema/gtw/svc/types/2021/10/01/0001" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Identifier>${nip}</Identifier></Identifier><DocumentType><Service>KSeF</Service><FormCode><SystemCode>FA (2)</SystemCode><SchemaVersion>1-0E</SchemaVersion><TargetNamespace>http://crd.gov.pl/wzor/2023/06/29/12648/</TargetNamespace><Value>FA</Value></FormCode></DocumentType><Token>${encrypted}</Token></ns3:Context></ns3:InitSessionTokenRequest>`;
  const initRes = await fetch(`${base}/api/online/Session/InitToken`, { method: "POST", headers: { "Content-Type": "application/octet-stream", Accept: "application/json" }, body: initXml });
  if (!initRes.ok) throw new Error(`InitToken ${initRes.status}`);
  const session = (await initRes.json()) as { sessionToken?: { token: string } };
  if (!session.sessionToken?.token) throw new Error("Brak sessionToken.");
  return { baseUrl: base, environment, sessionToken: session.sessionToken.token, nip };
}

async function closeSession(s: KsefSession) {
  try { await fetch(`${s.baseUrl}/api/online/Session/Terminate`, { method: "GET", headers: { SessionToken: s.sessionToken, Accept: "application/json" } }); } catch {}
}

async function queryRefs(s: KsefSession, subjectType: "subject1" | "subject2", monthsBack: number): Promise<string[]> {
  const from = new Date(); from.setMonth(from.getMonth() - monthsBack);
  const refs: string[] = []; let pageOffset = 0; const pageSize = 100;
  for (let page = 0; page < 50; page++) {
    const res = await fetch(`${s.baseUrl}/api/online/Query/Invoice/Sync?PageSize=${pageSize}&PageOffset=${pageOffset}`, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", SessionToken: s.sessionToken },
      body: JSON.stringify({ queryCriteria: { subjectType, type: "range", acquisitionTimestampThresholdFrom: from.toISOString(), acquisitionTimestampThresholdTo: new Date().toISOString() } }),
    });
    if (!res.ok) throw new Error(`Query ${res.status}`);
    const json = (await res.json()) as { invoiceHeaderList?: Array<{ ksefReferenceNumber?: string }> };
    const list = json.invoiceHeaderList ?? [];
    for (const it of list) if (it.ksefReferenceNumber) refs.push(it.ksefReferenceNumber);
    if (list.length < pageSize) break;
    pageOffset += pageSize;
  }
  return refs;
}

async function fetchXml(s: KsefSession, ref: string): Promise<string | null> {
  const res = await fetch(`${s.baseUrl}/api/online/Invoice/Get/${encodeURIComponent(ref)}`, { method: "GET", headers: { SessionToken: s.sessionToken, Accept: "application/octet-stream" } });
  return res.ok ? await res.text() : null;
}

function pickTag(xml: string, tag: string) { return new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i").exec(xml)?.[1]?.trim() ?? null; }
const xmlNum = (s: string | null) => (s ? Number(String(s).replace(",", ".")) || 0 : 0);

async function syncKsefOne(entity: any, direction: "sales" | "purchase"): Promise<{ ok: boolean; count: number; message: string | null }> {
  let s: KsefSession | null = null;
  try {
    s = await openSession(entity as KsefEntity);
    const refs = await queryRefs(s, direction === "sales" ? "subject1" : "subject2", 24);
    let saved = 0;
    for (const ref of refs) {
      const xml = await fetchXml(s, ref);
      if (!xml) continue;
      const row = {
        entity_id: entity.id, direction, source: "ksef" as const, external_id: ref,
        invoice_number: pickTag(xml, "P_2"), issue_date: pickTag(xml, "P_1"), sale_date: pickTag(xml, "P_6"),
        counterparty_name: pickTag(xml, "Nazwa") ?? pickTag(xml, "PelnaNazwa"),
        counterparty_nip: pickTag(xml, "NIP"), currency: "PLN",
        net_amount: xmlNum(pickTag(xml, "P_13_1") ?? pickTag(xml, "P_13")),
        vat_amount: xmlNum(pickTag(xml, "P_14_1") ?? pickTag(xml, "P_14")),
        gross_amount: xmlNum(pickTag(xml, "P_15")),
        xml_content: xml, ksef_reference_number: ref, ksef_status: "accepted",
      };
      const { error } = await accountingDb.from("accounting_documents").upsert(row, { onConflict: "entity_id,source,direction,external_id" });
      if (!error) saved += 1;
    }
    return { ok: true, count: saved, message: null };
  } catch (e) {
    return { ok: false, count: 0, message: (e as Error).message };
  } finally {
    if (s) await closeSession(s);
  }
}

// ---------------- Orkiestrator ----------------

export async function syncAllAccounting(): Promise<{ results: SyncResult[] }> {
  const { data: entities } = await accountingDb.from("accounting_entities").select("*").eq("active", true).order("created_at", { ascending: true });
  const results: SyncResult[] = [];
  let fakturowoFallbackUsed = false;
  for (const e of ((entities ?? []) as any[])) {
    const hasOwnFakturowo = Boolean(e.fakturowo_api_id_encrypted);
    const canDoFakturowo = hasOwnFakturowo || (!fakturowoFallbackUsed && Boolean(process.env.FAKTUROWO_API_ID));
    for (const dir of ["sales", "purchase"] as const) {
      if (canDoFakturowo) {
        const rFak = await syncFakturowoOne(e, dir);
        await upsertSyncStatus(e.id, "fakturowo", dir, rFak.ok, rFak.message, rFak.count);
        results.push({ entity: e.name, direction: dir, ...rFak });
      }
      const rKsef = await syncKsefOne(e, dir);
      await upsertSyncStatus(e.id, "ksef", dir, rKsef.ok, rKsef.message, rKsef.count);
      results.push({ entity: e.name, direction: dir, ...rKsef });
    }
    if (canDoFakturowo && !hasOwnFakturowo) fakturowoFallbackUsed = true;
  }
  return { results };
}
