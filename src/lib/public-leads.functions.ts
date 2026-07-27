import { createServerFn } from "@tanstack/react-start";

export type RiskGrade = "A" | "B" | "C" | "D" | "E";

export type PublicLead = {
  id: string;
  created_at: string;
  property_type: string;
  city: string | null;
  loan_amount: number | null;
  period_months: number | null;
  ltv: number | null;
  is_new: boolean;
  first_name: string | null;
  kw_masked: string | null;
  score: number;
  grade: RiskGrade;
};

function gradeFromScore(score: number): RiskGrade {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "E";
}

// Deterministyczny „losowy" wynik 35–80 na podstawie id (gdy brak zapisanej oceny).
function fallbackScoreFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return 35 + (h % 46); // 35..80
}

// Zanonimizuj numer KW: zachowaj kod sądu (przed "/") i ostatnią cyfrę,
// resztę zamień na kropki. Np. "WA1M/00123456/7" -> "WA1M/••••••••/7".
function maskKw(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase();
  const m = s.match(/^([A-Z0-9]{2,6})\/([0-9]+)\/([0-9])$/);
  if (!m) {
    // Fallback: pokaż pierwsze 4 znaki + kropki
    const head = s.slice(0, 4);
    return head ? `${head}/••••••••/•` : null;
  }
  return `${m[1]}/${"•".repeat(m[2].length)}/${m[3]}`;
}

export const fetchPublicLeads = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY!;
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
          h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data, error } = await client
    .from("loan_applications")
    .select(
      "id, created_at, status, loan_amount, preferred_period_months, clients(first_name), properties(property_type, city, estimated_value, land_register_number)",
    )
    .in("status", [
      "szukamy_inwestora",
      "warunki_zaakceptowane",
      "dokumenty_przygotowanie_umowy",
      "notariusz",
      "zamkniete",
    ])
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) throw new Error(error.message);

  // Zaciągnij ostatnią zapisaną ocenę ryzyka per wniosek (jeśli istnieje).
  const appIds = (data ?? []).map((r: any) => r.id).filter(Boolean);
  const scoresByApp = new Map<string, { score: number; grade: RiskGrade }>();
  if (appIds.length > 0) {
    const { data: ras } = await client
      .from("investment_risk_assessments")
      .select("application_id, investment_score, risk_grade, updated_at")
      .in("application_id", appIds)
      .order("updated_at", { ascending: false });
    for (const row of (ras ?? []) as any[]) {
      if (scoresByApp.has(row.application_id)) continue;
      const s = row.investment_score != null ? Number(row.investment_score) : null;
      if (s == null || Number.isNaN(s)) continue;
      const g = (row.risk_grade as RiskGrade) || gradeFromScore(s);
      scoresByApp.set(row.application_id, { score: Math.round(s), grade: g });
    }
  }

  const now = Date.now();
  const rows: PublicLead[] = [];
  for (const r of (data ?? []) as any[]) {
    const props = Array.isArray(r.properties) ? r.properties[0] : r.properties;
    const pt = props?.property_type;
    if (!pt) continue;
    const amt = r.loan_amount != null ? Number(r.loan_amount) : null;
    if (amt == null || Number.isNaN(amt) || amt <= 0) continue;
    const val = props?.estimated_value != null ? Number(props.estimated_value) : null;
    const ltv = val && val > 0 ? Math.round((amt / val) * 100) : null;
    const period = r.preferred_period_months != null ? Number(r.preferred_period_months) : null;
    const ageDays = (now - new Date(r.created_at).getTime()) / 86400000;
    const clientRow = Array.isArray(r.clients) ? r.clients[0] : r.clients;
    const firstName = clientRow?.first_name ? String(clientRow.first_name).trim() : null;
    const stored = scoresByApp.get(r.id);
    const score = stored?.score ?? fallbackScoreFromId(r.id);
    const grade = stored?.grade ?? gradeFromScore(score);
    rows.push({
      id: r.id,
      created_at: r.created_at,
      property_type: String(pt),
      city: props?.city ?? null,
      loan_amount: amt,
      period_months: period,
      ltv,
      is_new: ageDays <= 3,
      first_name: firstName && firstName.length > 0 ? firstName : null,
      kw_masked: maskKw(props?.land_register_number),
      score,
      grade,
    });
    if (rows.length >= 30) break;
  }
  return rows;
});
