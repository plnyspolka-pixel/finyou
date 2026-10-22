// Katalog lead magnetów — warstwa serwerowa: provisioning rekordów
// `lead_magnets` z katalogu razem z plikami PDF w Storage (MCP
// `provision_lead_magnet_catalog`, przycisk w panelu, tick autopilota w
// full_autopilot) oraz render PDF w locie — awaryjnie, gdy rekord nie ma
// jeszcze pliku (trasa /pobierz-plik/<token>, podgląd w panelu). Każdy
// materiał przechodzi kontrolę jakości: reguły twarde compliance (strona, PDF,
// mail) i próbny render — z problemem nie jest publikowany ani wgrywany.
//
// Plik w Storage: bucket `lead-magnets`, ścieżka `catalogFilePath` (slug +
// CATALOG_VERSION + nazwa). Wersja w ścieżce sprawia, że po zmianie treści
// (commit + podbicie wersji) następny provisioning widzi „nieaktualny” plik,
// składa nowy i usuwa stary. `refreshFiles` wymusza ponowny skład bez zmiany
// wersji (np. po zmianie biblioteki klauzul we wzorze umowy). Własny plik albo
// adres wgrany przez zespół w panelu nigdy nie jest ruszany.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkHardRules, evaluateCompliance } from "@/lib/autopilot/compliance-rules";
import { logAutopilot } from "@/lib/autopilot/state.server";
import type { Track } from "@/lib/autopilot/types";
import {
  CATALOG_VERSION,
  LEAD_MAGNET_CATALOG,
  catalogBySlug,
  catalogFilePath,
  catalogMagnetRow,
  catalogPageText,
  catalogPdfText,
  isCatalogFilePath,
  type LeadMagnetBlueprint,
} from "./catalog";
import { LEAD_MAGNETS_BUCKET, leadMagnetUrl } from "./core";

export async function renderCatalogPdf(
  slug: string,
): Promise<{ bytes: Uint8Array; fileName: string } | null> {
  const m = catalogBySlug(slug);
  if (!m) return null;
  const { renderLeadMagnetPdf } = await import("./pdf");
  return { bytes: await renderLeadMagnetPdf(m), fileName: m.file_name };
}

/** Base64 bez Buffera (działa też w Workerach) — do podglądu w panelu. */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/**
 * Kontrola jakości materiału: compliance (strona, PDF, mail) + próbny render
 * PDF. Zwraca też bajty PDF (gdy render się udał), żeby provisioning nie
 * składał pliku drugi raz przed wgraniem do Storage.
 */
export async function checkCatalogMagnet(
  m: LeadMagnetBlueprint,
): Promise<{ problems: string[]; pdf: Uint8Array | null }> {
  const problems: string[] = [];
  const checks = [
    ["strona", evaluateCompliance(catalogPageText(m), { kind: "lead_magnet", track: m.track })],
    ["pdf", evaluateCompliance(catalogPdfText(m), { kind: "lead_magnet", track: m.track })],
    ["mail", evaluateCompliance(m.email_body, { kind: "email", track: m.track })],
  ] as const;
  for (const [label, r] of checks) {
    for (const b of r.blocks) {
      problems.push(`compliance (${label}): ${b.code}${b.match ? ` „${b.match}”` : ""}`);
    }
    // Strona ma tylko nagłówki — stopkę niesie PDF i mail.
    if (label !== "strona")
      for (const q of r.requires) problems.push(`compliance (${label}): ${q.code}`);
  }
  if (m.custom_pdf === "wzor-umowy") {
    // Treść umowy to tekst prawny z biblioteki klauzul — nie podlega regułom
    // marketingowym, ale nie może nieść danych osobowych ani numerów ksiąg.
    const { wzorUmowyTekst } = await import("./wzor-umowy");
    const osobowe = new Set(["pesel", "numer_kw", "telefon", "email"]);
    try {
      for (const h of checkHardRules(wzorUmowyTekst(), { kind: "lead_magnet", track: m.track })) {
        if (osobowe.has(h.code)) problems.push(`umowa: ${h.code}${h.match ? ` „${h.match}”` : ""}`);
      }
    } catch (e) {
      problems.push(`umowa: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  let pdf: Uint8Array | null = null;
  try {
    const { renderLeadMagnetPdf } = await import("./pdf");
    pdf = await renderLeadMagnetPdf(m);
    if (pdf.byteLength < 2000) {
      problems.push("pdf: plik jest podejrzanie mały");
      pdf = null;
    }
  } catch (e) {
    problems.push(`pdf: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { problems, pdf };
}

/** Stan pliku materiału w Storage po provisioningu (albo w `dry_run`). */
export type CatalogFileState =
  /** Plik pod bieżącą ścieżką (wersją) — nic do zrobienia. */
  | "aktualny"
  /** Właśnie wgrany: rekord nie miał pliku albo miał plik ze starej wersji. */
  | "wgrany"
  /** `refreshFiles`: złożony ponownie i nadpisany pod tą samą ścieżką. */
  | "odświeżony"
  /** Zespół wgrał własny plik albo podał adres — provisioning go nie rusza. */
  | "własny"
  /** Plik ze starej wersji katalogu (dry run albo materiał z problemami — nie podmieniamy). */
  | "nieaktualny"
  /** Bez pliku — pobranie składa PDF w locie, do czasu wgrania. */
  | "brak"
  /** Wgranie nie wyszło — szczegóły w `problems` (pobranie działa w locie). */
  | "błąd";

export interface CatalogProvisionResult {
  slug: string;
  title: string;
  track: Track;
  keyword: string;
  action: string;
  published: boolean;
  problems: string[];
  url: string | null;
  file: CatalogFileState;
  file_path: string | null;
}

async function uploadCatalogPdf(path: string, bytes: Uint8Array): Promise<string | null> {
  const { error } = await supabaseAdmin.storage
    .from(LEAD_MAGNETS_BUCKET)
    .upload(path, bytes, { contentType: "application/pdf", upsert: true });
  return error ? error.message : null;
}

/**
 * Zakłada rekordy `lead_magnets` dla materiałów z katalogu (brakujące), wgrywa
 * ich PDF-y do Storage (brakujące albo z poprzedniej wersji; `refreshFiles` —
 * wszystkie) i — przy `publish` — publikuje te, które przeszły kontrolę
 * jakości. Istniejący rekord nie jest nadpisywany (zespół mógł poprawić copy
 * w panelu), chyba że `overwrite`; własny plik / adres zespołu zostaje zawsze.
 * Nigdy nie cofa publikacji. Materiał z problemami nie dostaje nowego pliku.
 */
export async function ensureCatalogMagnets(opts: {
  publish: boolean;
  overwrite?: boolean;
  refreshFiles?: boolean;
  slugs?: string[] | null;
  actor?: string | null;
  dryRun?: boolean;
}): Promise<CatalogProvisionResult[]> {
  const wanted = opts.slugs?.length ? new Set(opts.slugs) : null;
  const list = LEAD_MAGNET_CATALOG.filter((m) => !wanted || wanted.has(m.slug));
  const out: CatalogProvisionResult[] = [];

  let createdBy: string | null = opts.actor ?? null;
  if (!createdBy && !opts.dryRun) {
    const { data: admin } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "administrator")
      .limit(1)
      .maybeSingle();
    createdBy = (admin as { user_id?: string } | null)?.user_id ?? null;
  }

  for (const m of list) {
    const { problems, pdf } = await checkCatalogMagnet(m);
    const publish = opts.publish && problems.length === 0;
    const expectedPath = catalogFilePath(m);
    const base = { slug: m.slug, title: m.title, track: m.track, keyword: m.keyword, problems };
    const { data: existing } = await supabaseAdmin
      .from("lead_magnets")
      .select("id, published, file_path, file_url, file_name")
      .eq("slug", m.slug)
      .maybeSingle();

    const previousPath = existing?.file_path ?? null;
    const ownFile = Boolean(
      existing && (existing.file_url || (previousPath && !isCatalogFilePath(previousPath))),
    );
    const current = previousPath === expectedPath;
    let file: CatalogFileState = ownFile
      ? "własny"
      : current
        ? "aktualny"
        : previousPath
          ? "nieaktualny"
          : "brak";

    if (opts.dryRun) {
      out.push({
        ...base,
        action: existing
          ? existing.published
            ? "istnieje (opublikowany)"
            : "istnieje (szkic)"
          : "brak",
        published: Boolean(existing?.published),
        url: existing?.published ? leadMagnetUrl(m.slug) : null,
        file,
        file_path: previousPath,
      });
      continue;
    }

    // Plik: brak / stara wersja / wymuszone odświeżenie → skład z kontroli
    // jakości idzie do Storage. Materiał z problemami zostaje przy starym pliku.
    let uploaded: { path: string; size: number } | null = null;
    if (!ownFile && pdf && problems.length === 0 && (!current || opts.refreshFiles)) {
      const err = await uploadCatalogPdf(expectedPath, pdf);
      if (err) {
        problems.push(`storage: ${err}`);
        file = "błąd";
      } else {
        uploaded = { path: expectedPath, size: pdf.byteLength };
        file = current ? "odświeżony" : "wgrany";
      }
    }

    if (existing) {
      const published = publish || Boolean(existing.published);
      const {
        file_path: rowPath,
        file_url: _url,
        file_name: rowName,
        file_size: rowSize,
        mime_type: rowMime,
        ...copy
      } = catalogMagnetRow(m, published, uploaded);
      const patch: Record<string, unknown> = opts.overwrite
        ? { ...copy }
        : published !== Boolean(existing.published)
          ? { published }
          : {};
      if (uploaded) {
        Object.assign(patch, {
          file_path: rowPath,
          file_url: null,
          file_name: rowName,
          file_size: rowSize,
          mime_type: rowMime,
        });
      } else if (!ownFile && !previousPath && existing.file_name !== rowName) {
        // Bez pliku pobranie składa PDF w locie — nazwa pliku z katalogu.
        Object.assign(patch, { file_name: rowName, mime_type: rowMime });
      }
      if (Object.keys(patch).length === 0) {
        out.push({
          ...base,
          action: "bez zmian",
          published,
          url: published ? leadMagnetUrl(m.slug) : null,
          file,
          file_path: previousPath,
        });
        continue;
      }
      const { error } = await supabaseAdmin
        .from("lead_magnets")
        .update(patch as never)
        .eq("id", existing.id);
      if (!error && uploaded && previousPath && previousPath !== uploaded.path) {
        // Stary plik katalogu nie jest już nikomu potrzebny — linki idą przez token.
        await supabaseAdmin.storage
          .from(LEAD_MAGNETS_BUCKET)
          .remove([previousPath])
          .catch(() => null);
      }
      out.push({
        ...base,
        action: error
          ? `błąd: ${error.message}`
          : opts.overwrite
            ? "zaktualizowano (treść z katalogu)"
            : published && !existing.published
              ? "opublikowano"
              : uploaded
                ? file === "odświeżony"
                  ? "odświeżono PDF"
                  : "wgrano PDF"
                : "uzupełniono",
        published: error ? Boolean(existing.published) : published,
        url: !error && published ? leadMagnetUrl(m.slug) : null,
        file: error ? (current ? "aktualny" : "nieaktualny") : file,
        file_path: error ? previousPath : (uploaded?.path ?? previousPath),
      });
    } else {
      const { error } = await supabaseAdmin
        .from("lead_magnets")
        .insert({ ...catalogMagnetRow(m, publish, uploaded), created_by: createdBy } as never);
      out.push({
        ...base,
        action: error
          ? `błąd: ${error.message}`
          : publish
            ? "utworzono i opublikowano"
            : "utworzono (szkic)",
        published: !error && publish,
        url: !error && publish ? leadMagnetUrl(m.slug) : null,
        file: error ? "brak" : file,
        file_path: error ? null : (uploaded?.path ?? null),
      });
    }
  }

  if (!opts.dryRun) {
    await logAutopilot({
      action: "catalog_magnets",
      status: out.some((o) => o.action.startsWith("błąd") || o.problems.length) ? "warning" : "ok",
      summary: `Katalog lead magnetów ${CATALOG_VERSION}: ${out
        .map(
          (o) =>
            `${o.slug} (${o.action}, plik: ${o.file}${o.problems.length ? `, problemy: ${o.problems.length}` : ""})`,
        )
        .join("; ")}`,
      payload: {
        version: CATALOG_VERSION,
        publish: opts.publish,
        overwrite: Boolean(opts.overwrite),
        refreshFiles: Boolean(opts.refreshFiles),
        results: out,
      },
      actor: opts.actor ?? null,
    }).catch(() => null);
  }
  return out;
}
