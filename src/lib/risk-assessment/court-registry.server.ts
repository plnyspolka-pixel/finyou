// KRZ / MSiG w ocenie ryzyka: pożyczkobiorca z wniosku i właściciele z działu
// II KW. Źródło: wywiad owner-intelligence zapisany w coowner_registry_checks
// (krok 2 pipeline'u). Gdy go brak, jest nieaktualny albo nie obejmuje
// pożyczkobiorcy — uruchamiamy sprawdzenie teraz i zapisujemy wynik.
import { summarizeCourtRegistry } from "./court-registry";
import type { CourtRegistryCheck } from "./types";
import type { OwnerIntelligenceReport } from "@/lib/coowners/owner-intelligence.types";

type SupabaseLike = { from: (t: string) => any };

/** Wynik z kroku 2 pipeline'u uznajemy za aktualny przez dobę. */
const REUSE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function checkCourtRegistry(
  db: SupabaseLike,
  args: {
    applicationId: string | null;
    clientId: string | null;
    kwNumber: string | null;
    city: string | null;
    voivodeship: string | null;
  },
): Promise<CourtRegistryCheck> {
  if (!args.applicationId) {
    return summarizeCourtRegistry(null, {
      noClientReason:
        "Temat spoza Finance You — brak pożyczkobiorcy w systemie; KRZ/MSiG właścicieli: zob. sprawdzenie właścicieli KW.",
    });
  }

  const { data: saved } = await db
    .from("coowner_registry_checks")
    .select("result_json")
    .eq("application_id", args.applicationId)
    .maybeSingle();
  const savedReport = (saved?.result_json?.intelligence ?? null) as OwnerIntelligenceReport | null;
  const fresh =
    savedReport &&
    savedReport.subjects?.some((s) => s.role === "client") &&
    Date.now() - Date.parse(savedReport.checkedAt) < REUSE_MAX_AGE_MS;
  if (fresh) return summarizeCourtRegistry(savedReport);

  let primaryClientName: string | null = null;
  let primaryClientNip: string | null = null;
  let primaryClientPesel: string | null = null;
  if (args.clientId) {
    const { data: c } = await db
      .from("clients")
      .select("first_name, last_name, nip, pesel")
      .eq("id", args.clientId)
      .maybeSingle();
    primaryClientName = [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim() || null;
    primaryClientNip = c?.nip ?? null;
    primaryClientPesel = c?.pesel ?? null;
  }
  const { data: app } = await db
    .from("loan_applications")
    .select("nip")
    .eq("id", args.applicationId)
    .maybeSingle();
  primaryClientNip = primaryClientNip || app?.nip || null;

  const { analyzeCoOwners } = await import("@/lib/coowners/analyze.server");
  const co = await analyzeCoOwners({
    kwNumber: args.kwNumber,
    primaryClientName,
    primaryClientNip,
    primaryClientPesel,
    city: args.city,
    voivodeship: args.voivodeship,
  });
  const { error } = await db.from("coowner_registry_checks").upsert(
    {
      application_id: args.applicationId,
      kw_number: co.kwNumber,
      result_json: co,
      warnings: co.warnings,
      created_by: null,
    },
    { onConflict: "application_id" },
  );
  if (error) console.error("[risk-assessment] coowner check save failed:", error.message);
  return summarizeCourtRegistry(co.intelligence ?? null);
}
