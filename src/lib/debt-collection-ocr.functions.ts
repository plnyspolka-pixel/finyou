import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

function stripFences(s: string) {
  return s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

async function callGemini(systemPrompt: string, userText: string, dataUrl: string, mimeType: string, fileName?: string) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Brak konfiguracji AI.");
  const isPdf = mimeType === "application/pdf" || /\.pdf$/i.test(fileName ?? "");
  const isImage = mimeType.startsWith("image/");
  if (!isPdf && !isImage) throw new Error("Obsługujemy tylko PDF lub obrazy.");

  const userContent: unknown[] = [{ type: "text", text: userText }];
  if (isImage) userContent.push({ type: "image_url", image_url: { url: dataUrl } });
  else userContent.push({ type: "file", file: { filename: fileName ?? "document.pdf", file_data: dataUrl } });

  const resp = await fetch(AI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    }),
  });
  if (resp.status === 429) throw new Error("AI: limit zapytań — spróbuj za chwilę.");
  if (resp.status === 402) throw new Error("AI: wyczerpany limit kredytów.");
  if (!resp.ok) throw new Error(`AI: błąd ${resp.status}`);
  const json = await resp.json();
  const text: string = json?.choices?.[0]?.message?.content ?? "";
  try {
    return JSON.parse(stripFences(text));
  } catch {
    throw new Error("AI nie zwróciło poprawnego JSON-a.");
  }
}

// ── Wyciąganie pól z umowy pożyczki ─────────────────────────────────
export const extractDebtContract = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        caseId: z.string().uuid(),
        dataUrl: z.string().min(20).max(20_000_000),
        mimeType: z.string().min(3).max(100),
        fileName: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const system =
      "Jesteś asystentem OCR analizującym polskie umowy pożyczki. Odpowiadasz wyłącznie poprawnym JSON-em, bez komentarzy.";
    const user = `Wyodrębnij z umowy pożyczki dane do windykacji. Zwróć WYŁĄCZNIE JSON w formacie:
{
  "debtor_name": "imię i nazwisko lub nazwa firmy pożyczkobiorcy",
  "debtor_pesel": "PESEL lub NIP",
  "debtor_address": "pełny adres zamieszkania/siedziby",
  "debtor_email": "e-mail (jeśli jest)",
  "debtor_phone": "telefon w formacie +48XXXXXXXXX (jeśli jest)",
  "contract_number": "numer umowy",
  "principal_amount": liczba (kwota kapitału pożyczki w PLN, bez waluty),
  "payout_date": "YYYY-MM-DD (data wypłaty/zawarcia)",
  "due_date": "YYYY-MM-DD (termin spłaty / wymagalności)",
  "contractual_annual_rate": liczba (roczne odsetki kapitałowe w %),
  "penalty_annual_rate": liczba (roczne odsetki za opóźnienie w %),
  "fee_sms": liczba (zł), "fee_email": liczba (zł), "fee_phone": liczba (zł),
  "fee_letter_debtor": liczba (zł), "fee_letter_court": liczba (zł), "fee_letter_bailiff": liczba (zł)
}
Pola, których nie znajdziesz, pomiń (nie zwracaj nulli ani pustych stringów).`;

    const parsed = await callGemini(system, user, data.dataUrl, data.mimeType, data.fileName);

    // Budujemy patcha — tylko te pola, które AI faktycznie zwróciło i mają sens.
    const patch: Record<string, unknown> = {};
    const strFields = [
      "debtor_name",
      "debtor_pesel",
      "debtor_address",
      "debtor_email",
      "debtor_phone",
      "contract_number",
      "payout_date",
      "due_date",
    ];
    for (const k of strFields) {
      const v = parsed?.[k];
      if (typeof v === "string" && v.trim()) patch[k] = v.trim();
    }
    const numFields = [
      "principal_amount",
      "contractual_annual_rate",
      "penalty_annual_rate",
      "fee_sms",
      "fee_email",
      "fee_phone",
      "fee_letter_debtor",
      "fee_letter_court",
      "fee_letter_bailiff",
    ];
    for (const k of numFields) {
      const v = Number(parsed?.[k]);
      if (Number.isFinite(v) && v > 0) patch[k] = v;
    }

    if (Object.keys(patch).length === 0) {
      return { ok: false as const, updated: 0, fields: [] as string[] };
    }

    const db = context.supabase as unknown as { from: (t: string) => any };
    const { error } = await db.from("debt_collection_cases").update(patch).eq("id", data.caseId);
    if (error) throw new Error(error.message);
    return { ok: true as const, updated: Object.keys(patch).length, fields: Object.keys(patch) };
  });

// ── Wyciąganie wpłat z wyciągu bankowego ────────────────────────────
export const extractDebtPaymentsFromStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        caseId: z.string().uuid(),
        dataUrl: z.string().min(20).max(20_000_000),
        mimeType: z.string().min(3).max(100),
        fileName: z.string().max(200).optional(),
        debtorName: z.string().optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const system =
      "Jesteś asystentem OCR analizującym polskie wyciągi bankowe. Odpowiadasz wyłącznie poprawnym JSON-em, bez komentarzy.";
    const hint = data.debtorName
      ? `Uwzględnij TYLKO wpłaty PRZYCHODZĄCE od dłużnika: "${data.debtorName}" (lub od jego firmy). Pomiń wszelkie obciążenia, prowizje, przelewy wychodzące, opłaty bankowe.`
      : "Uwzględnij TYLKO wpłaty PRZYCHODZĄCE na rachunek (uznania). Pomiń obciążenia, prowizje, opłaty bankowe.";
    const user = `Z poniższego wyciągu bankowego wyciągnij listę WPŁAT od pożyczkobiorcy. ${hint}
Zwróć WYŁĄCZNIE JSON w formacie:
{"payments":[{"paid_on":"YYYY-MM-DD","amount": liczba (PLN, dodatnia), "note":"krótki opis/tytuł"}]}
Jeśli nie ma żadnej wpłaty, zwróć {"payments":[]}.`;

    const parsed = await callGemini(system, user, data.dataUrl, data.mimeType, data.fileName);
    const list = Array.isArray(parsed?.payments) ? parsed.payments : [];
    const rows: { case_id: string; paid_on: string; amount: number; note: string | null }[] = [];
    for (const p of list) {
      const date = typeof p?.paid_on === "string" ? p.paid_on.slice(0, 10) : null;
      const amt = Number(p?.amount);
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (!Number.isFinite(amt) || amt <= 0) continue;
      rows.push({
        case_id: data.caseId,
        paid_on: date,
        amount: amt,
        note: typeof p?.note === "string" && p.note.trim() ? p.note.trim().slice(0, 300) : null,
      });
    }

    if (rows.length === 0) return { ok: true as const, inserted: 0, payments: [] };

    const db = context.supabase as unknown as { from: (t: string) => any };
    const { data: inserted, error } = await db
      .from("debt_collection_payments")
      .insert(rows)
      .select("id, case_id, paid_on, amount, note, created_at");
    if (error) throw new Error(error.message);
    return { ok: true as const, inserted: inserted?.length ?? 0, payments: inserted ?? [] };
  });

// ── Toggle „brak wpłat od klienta" ───────────────────────────────────
export const setNoPaymentsDeclared = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ caseId: z.string().uuid(), value: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as { from: (t: string) => any };
    const { error } = await db
      .from("debt_collection_cases")
      .update({ no_payments_declared: data.value })
      .eq("id", data.caseId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
