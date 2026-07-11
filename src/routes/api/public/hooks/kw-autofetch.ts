// Cron tick (co 10 min): AUTOMATYCZNE zaciąganie treści ksiąg wieczystych.
//
// 1) PROMOCJA KOMPLETNOŚCI (runtime'owa wersja reguły z migracji
//    20260709210000, która była tylko jednorazowym backfillem):
//    numer KW + (zdjęcia nieruchomości ALBO dokumenty) => wniosek jest
//    „skompletowany" → status `szukamy_inwestora`, dostępny dla inwestorów,
//    completeness 100%.
//
// 2) POBRANIE TREŚCI KW: dla każdego skompletowanego wniosku (status od
//    `szukamy_inwestora` w górę lub oznaczony jako dostępny dla inwestorów)
//    zaciągamy treść WSZYSTKICH jego ksiąg (główna + dodatkowe, wszystkie
//    nieruchomości), których jeszcze nie mamy w cache `kw_documents`.
//    Tryb asynchroniczny: tick zleca pobranie w CMD i wraca; gotowy HTML
//    odbiera kolejny tick (bez blokowania crona na pollingu).
//
// Koszty pod kontrolą: max KW_FETCH_LIMIT zleceń na tick; statusów
// `not_found`/`error` nie ponawiamy automatycznie (od tego jest ręczny
// przycisk „Odśwież" w panelu).
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireCronAuth } from "@/lib/cron-auth.server";

const KW_FETCH_LIMIT = 3;
const COMPLETED_STATUSES = [
  "szukamy_inwestora",
  "warunki_zaakceptowane",
  "dokumenty_przygotowanie_umowy",
  "notariusz",
];

async function promoteCompletedApplications(): Promise<number> {
  // Kandydaci: aktywne wnioski przed skompletowaniem, z KW na nieruchomości.
  const { data: candidates } = await supabaseAdmin
    .from("loan_applications")
    .select(`
      id, status,
      properties:properties(id, land_register_number, photos)
    `)
    .in("status", ["nowy_lead", "brak_kontaktu", "kontakt", "kompletowanie_danych"])
    .limit(300);

  const withKw = (candidates ?? []).filter((la: any) =>
    (la.properties ?? []).some(
      (p: any) => p.land_register_number && String(p.land_register_number).trim() !== "",
    ),
  );
  if (withKw.length === 0) return 0;

  // Zdjęcia albo dokumenty = komplet.
  const ids = withKw.map((la: any) => la.id);
  const { data: docs } = await supabaseAdmin
    .from("documents")
    .select("loan_application_id")
    .in("loan_application_id", ids);
  const hasDocs = new Set((docs ?? []).map((d: any) => d.loan_application_id));

  const toPromote = withKw
    .filter((la: any) =>
      hasDocs.has(la.id) ||
      (la.properties ?? []).some((p: any) => Array.isArray(p.photos) && p.photos.length > 0),
    )
    .map((la: any) => la.id);
  if (toPromote.length === 0) return 0;

  await supabaseAdmin
    .from("loan_applications")
    .update({
      status: "szukamy_inwestora",
      available_to_investors: true,
      completeness_percent: 100,
      updated_at: new Date().toISOString(),
    })
    .in("id", toPromote);
  return toPromote.length;
}

export const Route = createFileRoute("/api/public/hooks/kw-autofetch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = await requireCronAuth(request);
        if (unauth) return unauth;
        try {
          const { resolveKwsForApplication, fetchKwByNumberCore, kwEngineConfigured } =
            await import("@/lib/kw-content.functions");
          const { kwToCompact } = await import("@/lib/kw-number");

          const promoted = await promoteCompletedApplications();

          if (!kwEngineConfigured()) {
            return Response.json({ ok: true, promoted, skipped: "kw_engine_not_configured" });
          }

          // Skompletowane wnioski (najnowsze najpierw — świeże sprawy priorytetowo).
          const { data: completed } = await supabaseAdmin
            .from("loan_applications")
            .select("id, status, available_to_investors")
            .or(`status.in.(${COMPLETED_STATUSES.join(",")}),available_to_investors.eq.true`)
            .order("updated_at", { ascending: false })
            .limit(200);

          let ordered = 0;
          const results: Array<{ loanId: string; kw: string; status: string }> = [];
          for (const la of completed ?? []) {
            if (ordered >= KW_FETCH_LIMIT) break;
            const kws = await resolveKwsForApplication(la.id);
            if (kws.length === 0) continue;
            // Które księgi już mamy (ready/processing/not_found/error)?
            const keys = kws.flatMap((k) => [k, kwToCompact(k)!]);
            const { data: existing } = await supabaseAdmin
              .from("kw_documents")
              .select("kw_number, status")
              .in("kw_number", keys);
            const known = new Set(
              (existing ?? [])
                // `processing` starsze niż 24h traktujemy jak brak (retry w rdzeniu)
                .filter((r: any) => r.status !== "processing")
                .map((r: any) => r.kw_number),
            );
            const knownCompact = new Set([...known].map((k) => k.replace(/\//g, "")));
            for (const kw of kws) {
              if (ordered >= KW_FETCH_LIMIT) break;
              if (known.has(kw) || knownCompact.has(kw.replace(/\//g, ""))) continue;
              const r = await fetchKwByNumberCore(kw, { poll: false });
              results.push({ loanId: la.id, kw, status: r.status });
              ordered++;
            }
          }

          return Response.json({ ok: true, promoted, ordered, results });
        } catch (e: any) {
          console.error("[kw-autofetch] tick error", e?.message);
          return Response.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
        }
      },
    },
  },
});
