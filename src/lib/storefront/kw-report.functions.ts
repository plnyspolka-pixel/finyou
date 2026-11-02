import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateKwNumber } from "@/lib/kw";
import { assertStoreKwAccess } from "./checkout.functions";
import { maskPeselInText } from "@/lib/kw-analysis/pesel-mask";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";

export const getPurchasedKwReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ kw: z.string().min(5).max(30) }).parse(input))
  .handler(async ({ context, data }) => {
    const kw = validateKwNumber(data.kw);
    if (!kw.ok) throw new Error(kw.message);
    await assertStoreKwAccess(context.userId, kw.compact);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const { data: cached } = await db.from("kw_land_register_analyses")
      .select("id,result_json,created_at").eq("created_by",context.userId)
      .eq("kw_number", kw.compact)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    let result: any = cached?.result_json ?? null;
    if (!result) {
      // Re-use the production KW ingestion pipeline. Never triggered before payment.
      const { fetchAndStoreKw } = await import("@/lib/kw-fetch.server");
      const fetched = await fetchAndStoreKw(kw.compact, { orderedBy: context.userId, pollMaxMs: 8000 });
      if (!fetched.ok || fetched.status !== "ready") {
        return { ready: false as const, status: fetched.status,
          message: fetched.error || "Pobieranie danych KW jest w toku. Wróć do raportu za chwilę." };
      }
      const { runKwLandRegisterAnalysisCore } = await import("@/lib/kw-analysis.functions");
      const analysis = await runKwLandRegisterAnalysisCore(supabaseAdmin, {
        kwNumber: kw.value, transactionType: "CASH_LOAN",
        requestedCashAmount: 0, newLoanExposure: 0,
        requestedMortgageSum: 0, declaredCollateralProviders: [],
      }, context.userId);
      if (!analysis.ok) return { ready: false as const, status: analysis.status, message: analysis.message };
      result = analysis.result;
    }

    // No transaction amounts were supplied. Explicitly label transaction-specific findings
    // as requiring an additional assessment; do not imply financing is approved.
    const lines = [
      "RAPORT ANALIZY KSIĘGI WIECZYSTEJ FINANCE YOU",
      "Księga: " + kw.value,
      "Data przygotowania: " + new Date().toLocaleString("pl-PL"),
      "Status wynikowy silnika: " + String(result.overallStatus ?? "NIEUSTALONY"),
      "Wersja reguł: " + String(result.rulesetVersion ?? "brak"),
      "Liczba aktywnych wzmianek: " + String(result.activeMentionCount ?? "brak danych"),
      "Liczba nierozstrzygniętych ustaleń: " + String(result.unresolvedFindingCount ?? "brak danych"),
      "",
      "WAŻNE: raport opiera się na stanie dostępnych danych KW. Nie stanowi operatu",
      "szacunkowego ani potwierdzenia możliwości udzielenia konkretnej pożyczki.",
      "Nie podano parametrów transakcji — ustalenia zależne od kwot, LTV, stron",
      "lub pierwszeństwa zabezpieczenia wymagają indywidualnego sprawdzenia.",
      "",
      "USTALENIA",
      ...((Array.isArray(result.findings) ? result.findings : []).slice(0, 120)
        .map((f: any, n: number) => [
          String(n + 1) + ". " + String(f.status ?? "") + " — " + String(f.title ?? f.ruleId ?? "Ustalenie"),
          String(f.explanation ?? f.description ?? f.summary ?? "").slice(0, 1200),
        ].join("\n"))),
      "",
      "W przypadku brakujących lub nieaktualnych danych konieczna jest ich",
      "weryfikacja w oficjalnych źródłach. Dokument wygenerowany na zamówienie.",
    ];
    const safeText = maskPeselInText(lines.join("\n"));
    const { pdfZTekstu } = await import("@/lib/legal/pdf-z-tekstu");
    const bytes = await pdfZTekstu({ contentText: safeText,
      title: "Raport księgi " + kw.value, version: "1.0" });
    const path = "generated/" + context.userId + "/kw-" + kw.compact + ".pdf";
    const { error: upErr } = await supabaseAdmin.storage.from(CLIENT_FILES_BUCKET)
      .upload(path, new Blob([bytes],{type:"application/pdf"}),
        { upsert: true, contentType: "application/pdf" });
    if (upErr) throw new Error("Nie udało się zapisać raportu PDF.");
    const { data: signed, error: signErr } = await supabaseAdmin.storage.from(CLIENT_FILES_BUCKET)
      .createSignedUrl(path, 600);
    if (signErr || !signed) throw new Error("Nie udało się udostępnić raportu PDF.");
    return { ready: true as const, kw: kw.value, url: signed.signedUrl, overallStatus: String(result.overallStatus ?? "") };
  });
