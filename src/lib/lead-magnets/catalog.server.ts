// Katalog lead magnetów — warstwa serwerowa: render PDF w locie (trasa
// /pobierz-plik/<token>, podgląd w panelu) i provisioning rekordów
// `lead_magnets` z katalogu (MCP `provision_lead_magnet_catalog`, przycisk
// w panelu, tick autopilota w full_autopilot). Każdy materiał przechodzi
// kontrolę jakości: reguły twarde compliance (strona, PDF, mail) i próbny
// render PDF — z problemem nie jest publikowany.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { evaluateCompliance } from "@/lib/autopilot/compliance-rules";
import { logAutopilot } from "@/lib/autopilot/state.server";
import type { Track } from "@/lib/autopilot/types";
import {
  CATALOG_VERSION,
  LEAD_MAGNET_CATALOG,
  catalogBySlug,
  catalogMagnetRow,
  catalogPageText,
  catalogPdfText,
  type LeadMagnetBlueprint,
} from "./catalog";
import { leadMagnetUrl } from "./core";

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

/** Kontrola jakości materiału: compliance (strona, PDF, mail) + próbny render PDF. */
export async function checkCatalogMagnet(m: LeadMagnetBlueprint): Promise<string[]> {
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
  try {
    const { renderLeadMagnetPdf } = await import("./pdf");
    const bytes = await renderLeadMagnetPdf(m);
    if (bytes.byteLength < 2000) problems.push("pdf: plik jest podejrzanie mały");
  } catch (e) {
    problems.push(`pdf: ${e instanceof Error ? e.message : String(e)}`);
  }
  return problems;
}

export interface CatalogProvisionResult {
  slug: string;
  title: string;
  track: Track;
  keyword: string;
  action: string;
  published: boolean;
  problems: string[];
  url: string | null;
}

/**
 * Zakłada rekordy `lead_magnets` dla materiałów z katalogu (brakujące) i —
 * przy `publish` — publikuje te, które przeszły kontrolę jakości. Istniejący
 * rekord nie jest nadpisywany (zespół mógł poprawić copy w panelu), chyba że
 * `overwrite`. Nigdy nie cofa publikacji. PDF nie jest wgrywany do Storage:
 * powstaje w locie przy pobraniu (resolveLeadMagnetDownload).
 */
export async function ensureCatalogMagnets(opts: {
  publish: boolean;
  overwrite?: boolean;
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
    const problems = await checkCatalogMagnet(m);
    const publish = opts.publish && problems.length === 0;
    const base = { slug: m.slug, title: m.title, track: m.track, keyword: m.keyword, problems };
    const { data: existing } = await supabaseAdmin
      .from("lead_magnets")
      .select("id, published, file_path, file_url")
      .eq("slug", m.slug)
      .maybeSingle();

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
      });
      continue;
    }

    if (existing) {
      const published = publish || Boolean(existing.published);
      const row = catalogMagnetRow(m, published);
      const hasOwnFile = Boolean(existing.file_path || existing.file_url);
      const patch: Record<string, unknown> = opts.overwrite
        ? hasOwnFile
          ? {
              ...row,
              file_path: undefined,
              file_url: undefined,
              file_name: undefined,
              mime_type: undefined,
            }
          : row
        : {
            ...(published !== Boolean(existing.published) ? { published } : {}),
            ...(hasOwnFile ? {} : { file_name: m.file_name, mime_type: "application/pdf" }),
          };
      for (const k of Object.keys(patch)) if (patch[k] === undefined) delete patch[k];
      if (Object.keys(patch).length === 0) {
        out.push({
          ...base,
          action: "bez zmian",
          published,
          url: published ? leadMagnetUrl(m.slug) : null,
        });
        continue;
      }
      const { error } = await supabaseAdmin
        .from("lead_magnets")
        .update(patch as never)
        .eq("id", existing.id);
      out.push({
        ...base,
        action: error
          ? `błąd: ${error.message}`
          : opts.overwrite
            ? "zaktualizowano (treść z katalogu)"
            : published && !existing.published
              ? "opublikowano"
              : "uzupełniono",
        published: error ? Boolean(existing.published) : published,
        url: !error && published ? leadMagnetUrl(m.slug) : null,
      });
    } else {
      const { error } = await supabaseAdmin
        .from("lead_magnets")
        .insert({ ...catalogMagnetRow(m, publish), created_by: createdBy } as never);
      out.push({
        ...base,
        action: error
          ? `błąd: ${error.message}`
          : publish
            ? "utworzono i opublikowano"
            : "utworzono (szkic)",
        published: !error && publish,
        url: !error && publish ? leadMagnetUrl(m.slug) : null,
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
            `${o.slug} (${o.action}${o.problems.length ? `, problemy: ${o.problems.length}` : ""})`,
        )
        .join("; ")}`,
      payload: {
        version: CATALOG_VERSION,
        publish: opts.publish,
        overwrite: Boolean(opts.overwrite),
        results: out,
      },
      actor: opts.actor ?? null,
    }).catch(() => null);
  }
  return out;
}
