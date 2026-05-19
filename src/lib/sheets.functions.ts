import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizePolishPhone } from "@/lib/phone";

// Synchronizacja leadów z Google Sheets przez connector gateway.
// `configuration.sheets` na `integration_settings` (name='google_sheets') zawiera tablicę:
// [{ id, label, spreadsheetId, range, columnMap: { phone, first_name, last_name, email, source } }]
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

    const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
    const lovableKey = process.env.LOVABLE_API_KEY;
    let rows: any[][] = [];
    try {
      const url = `https://connector-gateway.lovable.dev/google_sheets/v4/spreadsheets/${sheet.spreadsheetId}/values/${sheet.range || "Sheet1!A:Z"}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          ...(apiKey ? { "X-Connector-Api-Key": apiKey } : {}),
        },
      });
      const json: any = await res.json();
      rows = json.values || [];
    } catch (e: any) {
      await supabase.from("integration_settings").update({ last_error: String(e?.message || e), last_sync_at: new Date().toISOString() }).eq("id", integ.id);
      return { ok: false, error: "Gateway error: " + String(e?.message || e) };
    }

    if (rows.length === 0) return { ok: true, imported: 0, skipped: 0 };
    const header = rows[0].map((h: string) => String(h).trim().toLowerCase());
    const map = sheet.columnMap || {};
    const idx = (key: string) => header.indexOf((map[key] || key).toLowerCase());

    let imported = 0, skipped = 0;
    for (const row of rows.slice(1)) {
      const phoneRaw = String(row[idx("phone")] ?? "");
      const { normalized, valid } = normalizePolishPhone(phoneRaw);
      if (!normalized) { skipped++; continue; }
      const { data: existing } = await supabase.from("clients").select("id").eq("phone_normalized", normalized).maybeSingle();
      if (existing) { skipped++; continue; }
      const { error } = await supabase.from("clients").insert({
        first_name: String(row[idx("first_name")] ?? "") || "—",
        last_name: String(row[idx("last_name")] ?? "") || "—",
        email: String(row[idx("email")] ?? "") || null,
        phone: phoneRaw, phone_raw: phoneRaw, phone_normalized: normalized, phone_valid: valid,
        source: `google_sheets:${sheet.label || sheet.id}`,
        consent_rodo: false,
      });
      if (!error) imported++; else skipped++;
    }
    await supabase.from("integration_settings").update({
      last_sync_at: new Date().toISOString(), last_error: null, status: "polaczona",
    }).eq("id", integ.id);
    return { ok: true, imported, skipped };
  });
