import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizePolishPhone } from "@/lib/phone";

const SHEETS_GW = "https://connector-gateway.lovable.dev/google_sheets/v4";
const DRIVE_GW = "https://connector-gateway.lovable.dev/google_drive/drive/v3";

function authHeaders(kind: "sheets" | "drive") {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const apiKey =
    kind === "sheets" ? process.env.GOOGLE_SHEETS_API_KEY : process.env.GOOGLE_DRIVE_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");
  if (!apiKey)
    throw new Error(
      `${kind === "sheets" ? "GOOGLE_SHEETS_API_KEY" : "GOOGLE_DRIVE_API_KEY"} not configured`,
    );
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": apiKey,
  };
}

// Lista arkuszy z Google Drive (mimeType = spreadsheet)
export const listDriveSpreadsheets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ search: z.string().max(200).optional() }).parse(input))
  .handler(async ({ data }) => {
    try {
      const q = [
        "mimeType='application/vnd.google-apps.spreadsheet'",
        "trashed=false",
        data.search ? `name contains '${String(data.search).replace(/'/g, "\\'")}'` : "",
      ]
        .filter(Boolean)
        .join(" and ");
      const url = `${DRIVE_GW}/files?q=${encodeURIComponent(q)}&pageSize=50&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime,owners(displayName,emailAddress),webViewLink)`;
      const res = await fetch(url, { headers: authHeaders("drive") });
      const json: any = await res.json();
      if (!res.ok)
        return { ok: false, error: json?.error?.message || `HTTP ${res.status}`, files: [] };
      return { ok: true, files: json.files || [] };
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e), files: [] };
    }
  });

// Metadane arkusza (lista zakładek / sheets)
export const getSpreadsheetMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ spreadsheetId: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    try {
      const url = `${SHEETS_GW}/spreadsheets/${data.spreadsheetId}?fields=properties.title,sheets(properties(sheetId,title,gridProperties))`;
      const res = await fetch(url, { headers: authHeaders("sheets") });
      const json: any = await res.json();
      if (!res.ok) return { ok: false, error: json?.error?.message || `HTTP ${res.status}` };
      return {
        ok: true,
        title: json?.properties?.title,
        sheets: (json.sheets || []).map((s: any) => s.properties),
      };
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

// Podgląd N pierwszych wierszy z arkusza
export const previewSheetRange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        spreadsheetId: z.string().min(1),
        range: z.string().min(1).max(200),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const url = `${SHEETS_GW}/spreadsheets/${data.spreadsheetId}/values/${data.range}`;
      const res = await fetch(url, { headers: authHeaders("sheets") });
      const json: any = await res.json();
      if (!res.ok)
        return {
          ok: false,
          error: json?.error?.message || `HTTP ${res.status}`,
          header: [],
          rows: [],
        };
      const values: any[][] = json.values || [];
      const header = values[0] || [];
      const rows = values.slice(1, 1 + (data.limit ?? 20));
      return { ok: true, header, rows, totalRows: Math.max(0, values.length - 1) };
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e), header: [], rows: [] };
    }
  });

// Synchronizacja leadów z Google Sheets
export const syncGoogleSheet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ sheetConfigId: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: integ } = await supabase
      .from("integration_settings")
      .select("*")
      .eq("integration_name", "google_sheets")
      .maybeSingle();
    if (!integ) return { ok: false, error: "Brak konfiguracji Google Sheets" };
    const sheets = (integ.configuration as any)?.sheets ?? [];
    const sheet = sheets.find((s: any) => s.id === data.sheetConfigId);
    if (!sheet) return { ok: false, error: "Nie znaleziono arkusza" };

    let rows: any[][] = [];
    try {
      const url = `${SHEETS_GW}/spreadsheets/${sheet.spreadsheetId}/values/${sheet.range || "Sheet1!A:Z"}`;
      const res = await fetch(url, { headers: authHeaders("sheets") });
      const json: any = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
      rows = json.values || [];
    } catch (e: any) {
      await supabase
        .from("integration_settings")
        .update({
          last_error: String(e?.message || e),
          last_sync_at: new Date().toISOString(),
          status: "blad",
        })
        .eq("id", integ.id);
      return { ok: false, error: "Gateway error: " + String(e?.message || e) };
    }

    if (rows.length === 0) {
      await supabase
        .from("integration_settings")
        .update({ last_sync_at: new Date().toISOString(), last_error: null, status: "polaczona" })
        .eq("id", integ.id);
      return { ok: true, imported: 0, skipped: 0 };
    }
    const header = rows[0].map((h: string) => String(h).trim().toLowerCase());
    const map = sheet.columnMap || {};
    const idx = (key: string) => header.indexOf(String(map[key] || key).toLowerCase());

    let imported = 0,
      skipped = 0;
    for (const row of rows.slice(1)) {
      const phoneRaw = String(row[idx("phone")] ?? "");
      const { normalized, valid } = normalizePolishPhone(phoneRaw);
      if (!normalized) {
        skipped++;
        continue;
      }
      const { data: existing } = await supabase
        .from("clients")
        .select("id")
        .eq("phone_normalized", normalized)
        .maybeSingle();
      if (existing) {
        skipped++;
        continue;
      }
      const { error } = await supabase.from("clients").insert({
        first_name: String(row[idx("first_name")] ?? "") || "—",
        last_name: String(row[idx("last_name")] ?? "") || "—",
        email: String(row[idx("email")] ?? "") || null,
        phone: phoneRaw,
        phone_raw: phoneRaw,
        phone_normalized: normalized,
        phone_valid: valid,
        source: `google_sheets:${sheet.label || sheet.id}`,
        consent_rodo: false,
      });
      if (!error) imported++;
      else skipped++;
    }
    await supabase
      .from("integration_settings")
      .update({
        last_sync_at: new Date().toISOString(),
        last_error: null,
        status: "polaczona",
      })
      .eq("id", integ.id);
    return { ok: true, imported, skipped };
  });
