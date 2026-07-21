// GIIF Connector — komunikacja z SI*GIIF (API rest2018).
//
//  Środowisko testowe:  https://test.giif.mofnet.gov.pl/api/rest2018
//  Produkcja:           https://www.giif.mofnet.gov.pl/api/rest2018
//
// Dokumentacja REST API SI*GIIF jest PUBLICZNA: https://giif.mofnet.gov.pl/api/
//
// Zasady:
//  - mTLS przez GiifMtlsProvider (giif-mtls.server.ts): mock w testach
//    lokalnych, pojedynczy testowy certyfikat Finance You przez binding
//    Cloudflare GIIF_MTLS na środowisku testowym, a produkcyjnie wydzielona
//    usługa w UE z certyfikatem właściwym dla danej organizacji (jeden
//    binding nie obsłuży wielu inwestorów z osobnymi certyfikatami).
//  - Idempotency: każda wysyłka ma klucz idempotency w aml_submission_queue;
//    ponowienie NIGDY nie wysyła drugi raz — nagłówek Idempotency-Key
//    + obsługa 409 (duplikat = już dostarczone).
//  - Ponowienia: wykładniczy backoff (2^n * 30 s, maks. 8 prób); 503 i
//    timeouty planują kolejną próbę, błędy 4xx (poza 409/429) są trwałe.
//  - Tryb MOCK (GIIF_MOCK=true) symuluje odpowiedzi SI*GIIF — potwierdza
//    WYŁĄCZNIE lokalny przepływ aplikacji (status local_mock_verified);
//    nie testuje mTLS, zgodności endpointów, przyjęcia podpisu ani UPO.
//  - Ścieżki endpointów: przed testem live porównaj GIIF_PATHS z publiczną
//    dokumentacją. UWAGA: część ścieżek w dokumentacji zawiera literówkę
//    „instutucje" — NIE poprawiamy jej ani nie wybieramy wariantu na
//    podstawie założeń; właściwą ścieżkę potwierdza dopiero test na
//    środowisku testowym SI*GIIF (do tego czasu status giif_test_pending).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { amlAudit } from "@/lib/aml/audit.server";
import { getGiifMtlsProvider } from "@/lib/aml/giif-mtls.server";

export const GIIF_TEST_BASE = "https://test.giif.mofnet.gov.pl/api/rest2018";
export const GIIF_PROD_BASE = "https://www.giif.mofnet.gov.pl/api/rest2018";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- AML: dostęp do relacji/JSON dynamicznych
type Loose = { from: (t: string) => any };
const db = () => supabaseAdmin as unknown as Loose;

export function giifBaseUrl(environment: "test" | "production"): string {
  return environment === "production" ? GIIF_PROD_BASE : GIIF_TEST_BASE;
}

// Ścieżki wg publicznej dokumentacji https://giif.mofnet.gov.pl/api/ —
// do POTWIERDZENIA testem na środowisku testowym SI*GIIF (dokumentacja
// zawiera m.in. literówkę „instutucje" w części ścieżek; nie zgadujemy,
// który wariant jest właściwy). Wartości można nadpisać env GIIF_PATH_*.
export const GIIF_PATHS = {
  submit: process.env.GIIF_PATH_SUBMIT ?? "/zgloszenia",
  status: (id: string) =>
    (process.env.GIIF_PATH_STATUS ?? "/zgloszenia/{id}/status").replace(
      "{id}",
      encodeURIComponent(id),
    ),
  upo: (id: string) =>
    (process.env.GIIF_PATH_UPO ?? "/zgloszenia/{id}/upo").replace("{id}", encodeURIComponent(id)),
  register: process.env.GIIF_PATH_REGISTER ?? "/rejestracja",
  // Publiczna dokumentacja używa w tej gałęzi pisowni „instutucje".
  certificates: (institutionId: string) =>
    (process.env.GIIF_PATH_CERTIFICATES ?? "/instytucje/{institutionId}/certyfikaty").replace(
      "{institutionId}",
      encodeURIComponent(institutionId),
    ),
  certificate: (institutionId: string, requestId: string) =>
    (process.env.GIIF_PATH_CERTIFICATE ?? "/instytucje/{institutionId}/certyfikaty/{requestId}")
      .replace("{institutionId}", encodeURIComponent(institutionId))
      .replace("{requestId}", encodeURIComponent(requestId)),
  ping: process.env.GIIF_PATH_PING ?? "/ping",
} as const;

function isMock(): boolean {
  return process.env.GIIF_MOCK === "true";
}

// ── Niskopoziomowe wywołanie (mTLS przez GiifMtlsProvider) ───────────
interface GiifHttpResult {
  status: number;
  body: string;
  json?: unknown;
}

async function giifFetch(
  environment: "test" | "production",
  organizationId: string,
  path: string,
  init: {
    method: string;
    body?: Uint8Array | string;
    headers?: Record<string, string>;
    idempotencyKey?: string;
  },
): Promise<GiifHttpResult> {
  const url = `${giifBaseUrl(environment)}${path}`;
  const headers: Record<string, string> = { Accept: "application/json", ...(init.headers ?? {}) };
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  const provider = getGiifMtlsProvider(environment);
  const res = await provider.fetchForOrganization(organizationId, {
    url,
    method: init.method,
    headers,
    body: init.body,
  });
  const body = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    /* odpowiedź nie-JSON (np. XML UPO) */
  }
  return { status: res.status, body, json };
}

// ── Wysyłka zgłoszenia ───────────────────────────────────────────────
export interface GiifSubmitResult {
  ok: boolean;
  submissionId?: string;
  httpStatus: number;
  retryable: boolean;
  duplicate: boolean;
  error?: string;
}

/**
 * Wysyła zaszyfrowany, podpisany pakiet zgłoszenia. Zwraca identyfikator
 * zgłoszenia nadany przez SI*GIIF. 409 = duplikat (idempotency zadziałało
 * po stronie GIIF) — traktujemy jako dostarczone. 503/timeout = do ponowienia.
 */
export async function giifSubmit(
  environment: "test" | "production",
  organizationId: string,
  encryptedPayload: Uint8Array,
  idempotencyKey: string,
): Promise<GiifSubmitResult> {
  if (isMock()) {
    return {
      ok: true,
      submissionId: `MOCK-${idempotencyKey.slice(0, 12)}`,
      httpStatus: 200,
      retryable: false,
      duplicate: false,
    };
  }
  try {
    const res = await giifFetch(environment, organizationId, GIIF_PATHS.submit, {
      method: "POST",
      body: encryptedPayload,
      headers: { "Content-Type": "application/cms" },
      idempotencyKey,
    });
    if (res.status === 200 || res.status === 201 || res.status === 202) {
      const j = res.json as { id?: string; identyfikator?: string } | undefined;
      return {
        ok: true,
        submissionId: j?.id ?? j?.identyfikator ?? undefined,
        httpStatus: res.status,
        retryable: false,
        duplicate: false,
      };
    }
    if (res.status === 409) {
      // Duplikat — zgłoszenie z tym kluczem już istnieje po stronie GIIF.
      const j = res.json as { id?: string; identyfikator?: string } | undefined;
      return {
        ok: true,
        submissionId: j?.id ?? j?.identyfikator ?? undefined,
        httpStatus: 409,
        retryable: false,
        duplicate: true,
      };
    }
    const retryable = res.status === 503 || res.status === 429 || res.status >= 500;
    return {
      ok: false,
      httpStatus: res.status,
      retryable,
      duplicate: false,
      error: res.body.slice(0, 500),
    };
  } catch (e) {
    return {
      ok: false,
      httpStatus: 0,
      retryable: true,
      duplicate: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ── Status i UPO ─────────────────────────────────────────────────────
export interface GiifStatusResult {
  status: string; // np. 'przyjete','odrzucone','w_trakcie','X' (wymaga oczekiwania)
  raw?: unknown;
  error?: string;
}

export async function giifGetStatus(
  environment: "test" | "production",
  organizationId: string,
  submissionId: string,
): Promise<GiifStatusResult> {
  if (isMock()) return { status: "przyjete", raw: { mock: true } };
  try {
    const res = await giifFetch(environment, organizationId, GIIF_PATHS.status(submissionId), {
      method: "GET",
    });
    if (res.status !== 200)
      return { status: "error", error: `HTTP ${res.status}: ${res.body.slice(0, 200)}` };
    const j = res.json as { status?: string } | undefined;
    return { status: j?.status ?? "unknown", raw: res.json };
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : String(e) };
  }
}

export async function giifGetUpo(
  environment: "test" | "production",
  organizationId: string,
  submissionId: string,
): Promise<{ ok: boolean; upoXml?: string; error?: string }> {
  if (isMock()) {
    return {
      ok: true,
      upoXml: `<?xml version="1.0" encoding="UTF-8"?><UPO><Identyfikator>${submissionId}</Identyfikator><Data>${new Date().toISOString()}</Data><Mock>true</Mock></UPO>`,
    };
  }
  try {
    const res = await giifFetch(environment, organizationId, GIIF_PATHS.upo(submissionId), {
      method: "GET",
    });
    if (res.status !== 200)
      return { ok: false, error: `HTTP ${res.status}: ${res.body.slice(0, 200)}` };
    return { ok: true, upoXml: res.body };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Rejestracja instytucji i certyfikat komunikacyjny ────────────────
export async function giifRegisterInstitution(
  environment: "test" | "production",
  organizationId: string,
  registrationCms: Uint8Array, // podpisany kwalifikowanie dokument rejestracyjny
): Promise<{ ok: boolean; institutionId?: string; error?: string }> {
  if (isMock()) return { ok: true, institutionId: `MOCK-INST-${Date.now() % 100000}` };
  try {
    const res = await giifFetch(environment, organizationId, GIIF_PATHS.register, {
      method: "POST",
      body: registrationCms,
      headers: { "Content-Type": "application/cms" },
    });
    if (res.status === 200 || res.status === 201) {
      const j = res.json as { id?: string } | undefined;
      return { ok: true, institutionId: j?.id };
    }
    return { ok: false, error: `HTTP ${res.status}: ${res.body.slice(0, 300)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function giifSubmitCsr(
  environment: "test" | "production",
  organizationId: string,
  institutionId: string,
  csrPem: string,
): Promise<{ ok: boolean; requestId?: string; error?: string }> {
  if (isMock()) return { ok: true, requestId: `MOCK-CSR-${Date.now() % 100000}` };
  try {
    const res = await giifFetch(
      environment,
      organizationId,
      GIIF_PATHS.certificates(institutionId),
      {
        method: "POST",
        body: csrPem,
        headers: { "Content-Type": "application/pkcs10" },
      },
    );
    if (res.status === 200 || res.status === 201) {
      const j = res.json as { id?: string } | undefined;
      return { ok: true, requestId: j?.id };
    }
    return { ok: false, error: `HTTP ${res.status}: ${res.body.slice(0, 300)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function giifFetchCertificate(
  environment: "test" | "production",
  organizationId: string,
  institutionId: string,
  requestId: string,
): Promise<{ ok: boolean; certificatePem?: string; error?: string }> {
  if (isMock())
    return { ok: false, error: "MOCK: certyfikat wydaje operator GIIF — wgraj PEM ręcznie." };
  try {
    const res = await giifFetch(
      environment,
      organizationId,
      GIIF_PATHS.certificate(institutionId, requestId),
      {
        method: "GET",
      },
    );
    if (res.status === 200) return { ok: true, certificatePem: res.body };
    return { ok: false, error: `HTTP ${res.status}: ${res.body.slice(0, 300)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Test połączenia mTLS z SI*GIIF (ping). */
export async function giifTestMtls(
  environment: "test" | "production",
  organizationId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (isMock()) return { ok: true };
  try {
    const res = await giifFetch(environment, organizationId, GIIF_PATHS.ping, { method: "GET" });
    if (res.status === 200 || res.status === 204) return { ok: true };
    return { ok: false, error: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Kolejka wysyłek ──────────────────────────────────────────────────
const BASE_RETRY_MS = 30_000;

/**
 * Przetwarza zaległe pozycje kolejki wysyłek: pobiera zaszyfrowany pakiet
 * z prywatnego Storage, wysyła przez mTLS, obsługuje 409/503/timeout,
 * planuje ponowienia z wykładniczym backoffem. Bez podwójnej wysyłki —
 * klucz idempotency jest stały dla pozycji kolejki.
 */
export async function processSubmissionQueue(limit = 10): Promise<{ processed: number }> {
  const { data: due } = await db()
    .from("aml_submission_queue")
    .select("*")
    .in("state", ["pending", "retry_scheduled"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(limit);

  let processed = 0;
  for (const item of due ?? []) {
    processed++;
    await db()
      .from("aml_submission_queue")
      .update({ state: "in_flight", attempts: item.attempts + 1 })
      .eq("id", item.id);

    const { data: report } = await db()
      .from("aml_reports")
      .select("id, user_id, signed_storage_path, status")
      .eq("id", item.report_id)
      .maybeSingle();

    if (!report?.signed_storage_path) {
      await db()
        .from("aml_submission_queue")
        .update({ state: "failed", last_error: "Brak zaszyfrowanego pakietu do wysyłki" })
        .eq("id", item.id);
      continue;
    }

    const { data: settings } = await db()
      .from("aml_settings")
      .select("giif_environment")
      .eq("user_id", report.user_id)
      .maybeSingle();
    const environment = (settings?.giif_environment ?? "test") as "test" | "production";

    // Pakiet do wysyłki: zaszyfrowany plik <path>.enc obok podpisanego.
    const encPath = `${report.signed_storage_path}.enc`;
    const { data: file, error: dlError } = await supabaseAdmin.storage
      .from("aml-private")
      .download(encPath);
    if (dlError || !file) {
      await db()
        .from("aml_submission_queue")
        .update({ state: "failed", last_error: `Brak pliku ${encPath}` })
        .eq("id", item.id);
      continue;
    }
    const payload = new Uint8Array(await file.arrayBuffer());

    const result = await giifSubmit(environment, report.user_id, payload, item.idempotency_key);

    if (result.ok) {
      await db()
        .from("aml_submission_queue")
        .update({
          state: "delivered",
          delivered_at: new Date().toISOString(),
          last_http_status: result.httpStatus,
          last_error: result.duplicate ? "409: duplikat — zgłoszenie było już dostarczone" : null,
        })
        .eq("id", item.id);
      await db()
        .from("aml_reports")
        .update({
          status: "submitted",
          giif_submission_id: result.submissionId ?? null,
          submitted_at: new Date().toISOString(),
        })
        .eq("id", report.id);
      await amlAudit({
        userId: report.user_id,
        entityType: "submission",
        entityId: report.id,
        action: "giif_submitted",
        details: {
          submissionId: result.submissionId,
          duplicate: result.duplicate,
          httpStatus: result.httpStatus,
        },
      });
    } else if (result.retryable && item.attempts + 1 < item.max_attempts) {
      const delay = BASE_RETRY_MS * 2 ** item.attempts;
      await db()
        .from("aml_submission_queue")
        .update({
          state: "retry_scheduled",
          next_attempt_at: new Date(Date.now() + delay).toISOString(),
          last_error: result.error ?? null,
          last_http_status: result.httpStatus,
        })
        .eq("id", item.id);
    } else {
      await db()
        .from("aml_submission_queue")
        .update({
          state: "failed",
          last_error: result.error ?? `HTTP ${result.httpStatus}`,
          last_http_status: result.httpStatus,
        })
        .eq("id", item.id);
      await db().from("aml_reports").update({ status: "error" }).eq("id", report.id);
      await amlAudit({
        userId: report.user_id,
        entityType: "submission",
        entityId: report.id,
        action: "giif_submit_failed",
        details: { error: result.error, httpStatus: result.httpStatus },
      });
    }
  }
  return { processed };
}

/**
 * Odpytuje statusy wysłanych zgłoszeń i pobiera UPO dla przyjętych.
 * Status "X" (przetwarzanie po stronie GIIF) = czekamy dalej.
 */
export async function pollSubmittedReports(limit = 20): Promise<{ checked: number }> {
  const { data: reports } = await db()
    .from("aml_reports")
    .select("id, user_id, giif_submission_id, status")
    .in("status", ["submitted", "status_pending", "accepted"])
    .not("giif_submission_id", "is", null)
    .limit(limit);

  let checked = 0;
  for (const r of reports ?? []) {
    checked++;
    const { data: settings } = await db()
      .from("aml_settings")
      .select("giif_environment")
      .eq("user_id", r.user_id)
      .maybeSingle();
    const environment = (settings?.giif_environment ?? "test") as "test" | "production";

    const st = await giifGetStatus(environment, r.user_id, r.giif_submission_id);
    const now = new Date().toISOString();

    if (st.status === "error") {
      await db().from("aml_reports").update({ giif_status_checked_at: now }).eq("id", r.id);
      continue;
    }
    if (st.status === "X" || st.status === "w_trakcie" || st.status === "unknown") {
      await db()
        .from("aml_reports")
        .update({ status: "status_pending", giif_status: st.status, giif_status_checked_at: now })
        .eq("id", r.id);
      continue;
    }
    if (st.status === "odrzucone") {
      await db()
        .from("aml_reports")
        .update({
          status: "rejected",
          giif_status: st.status,
          giif_status_checked_at: now,
          giif_response: st.raw ?? null,
        })
        .eq("id", r.id);
      await amlAudit({
        userId: r.user_id,
        entityType: "report",
        entityId: r.id,
        action: "giif_rejected",
        details: { raw: st.raw as Record<string, unknown> },
      });
      continue;
    }
    if (st.status === "do_korekty") {
      await db()
        .from("aml_reports")
        .update({
          status: "correction_required",
          giif_status: st.status,
          giif_status_checked_at: now,
          giif_response: st.raw ?? null,
        })
        .eq("id", r.id);
      continue;
    }
    // Przyjęte → pobierz UPO.
    if (st.status === "przyjete" || st.status === "accepted") {
      const upo = await giifGetUpo(environment, r.user_id, r.giif_submission_id);
      if (upo.ok && upo.upoXml) {
        const upoPath = `${r.user_id}/reports/${r.id}/upo.xml`;
        await supabaseAdmin.storage
          .from("aml-private")
          .upload(upoPath, new Blob([upo.upoXml], { type: "application/xml" }), { upsert: true });
        await db()
          .from("aml_reports")
          .update({
            status: "upo_received",
            giif_status: st.status,
            giif_status_checked_at: now,
            upo_storage_path: upoPath,
            upo_received_at: now,
            giif_response: st.raw ?? null,
          })
          .eq("id", r.id);
        await amlAudit({
          userId: r.user_id,
          entityType: "report",
          entityId: r.id,
          action: "upo_received",
          details: {},
        });
        // Powiązana sprawa → status upo_received.
        const { data: rep } = await db()
          .from("aml_reports")
          .select("case_id")
          .eq("id", r.id)
          .maybeSingle();
        if (rep?.case_id) {
          await db().from("aml_cases").update({ status: "upo_received" }).eq("id", rep.case_id);
        }
      } else {
        await db()
          .from("aml_reports")
          .update({ status: "accepted", giif_status: st.status, giif_status_checked_at: now })
          .eq("id", r.id);
      }
    }
  }
  return { checked };
}
