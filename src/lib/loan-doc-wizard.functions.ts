// ════════════════════════════════════════════════════════════════════
// KREATOR UDZIELENIA POŻYCZKI (napędzany Gemini Pro) — operator w oknie czatu
// buduje wypełniony „komplet do udzielenia pożyczki".
//
// Operator wybiera FINANSUJĄCEGO (pożyczkodawcę):
//   • Finance You sp. z o.o. (domyślny, instytucjonalny), albo
//   • jednego z inwestorów prywatnych (z tabeli `investors`).
// Dane finansującego są wstrzykiwane w pola strony „Pożyczkodawca/Wierzyciel"
// AUTOMATYCZNIE. Rozmowa z Gemini Pro dokłada dane pożyczkobiorcy oraz warunki
// (kwoty, terminy, oprocentowanie) i mapuje je na pola wzoru.
//
// Wartości są POZYCYJNE (indeks wystąpienia → wartość) — spójne z generatorem
// `generateDocxFromTemplate` i podglądem (`previewSegments`).
// ════════════════════════════════════════════════════════════════════

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  normalizePlaceholders,
  xmlToPlainText,
  extractOrderedFields,
  companyValueForField,
  amountKind,
  type DocField,
  type CompanyBundle,
} from "@/lib/document-fields";
import { amountToWordsPLN } from "@/lib/amount-to-words-pl";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";
import { FY_CREDITOR } from "@/lib/windykacja-docfill";
import { buildCalcFieldValues } from "@/lib/loan-calc-fill";
import type { LoanCalcPayload } from "@/lib/loan-calc-pdf";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
// Kreator jawnie korzysta z Gemini Pro (mocniejszy model do wnioskowania z rozmowy).
const GEMINI_PRO = "google/gemini-2.5-pro";

// ─────────────────────────────────────────────────────────────────────
// Finansujący (pożyczkodawca)
// ─────────────────────────────────────────────────────────────────────

export type LenderKind = "finance_you" | "investor";

export interface LenderOption {
  /** "finance_you" albo UUID inwestora. */
  id: string;
  kind: LenderKind;
  label: string;
  sublabel: string;
}

interface ResolvedLender {
  id: string;
  kind: LenderKind;
  label: string;
  bundle: CompanyBundle & { pesel?: string };
  isIndividual: boolean;
}

/** Finance You jako finansujący — z jednego źródła prawdy (FY_CREDITOR). */
function financeYouLender(): ResolvedLender {
  const [repName, repRole] = FY_CREDITOR.representative.split(/\s*[–-]\s*/);
  return {
    id: "finance_you",
    kind: "finance_you",
    label: FY_CREDITOR.name,
    isIndividual: false,
    bundle: {
      name: FY_CREDITOR.name,
      legalForm: FY_CREDITOR.legalForm,
      krs: "0000635207",
      nip: "7010611803",
      regon: "365350668",
      addressFull: "ul. Nowogrodzka 31, 00-511 Warszawa",
      representativeName: (repName ?? "").trim() || undefined,
      representativeRole: (repRole ?? "").trim() || undefined,
    },
  };
}

type InvestorRow = {
  id: string;
  company_name: string | null;
  first_name: string | null;
  last_name: string | null;
  entity_type: string | null;
  investor_type: string | null;
  nip: string | null;
  regon: string | null;
  krs: string | null;
  legal_form: string | null;
  address: string | null;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  bank_account: string | null;
  pesel: string | null;
  email: string | null;
  phone: string | null;
  representative_first_name: string | null;
  representative_last_name: string | null;
  representative_role: string | null;
};

const INVESTOR_COLS =
  "id, company_name, first_name, last_name, entity_type, investor_type, nip, regon, krs, legal_form, address, street, postal_code, city, bank_account, pesel, email, phone, representative_first_name, representative_last_name, representative_role";

function fullName(first: string | null, last: string | null): string {
  return [first, last].filter(Boolean).join(" ").trim();
}

function investorToLender(inv: InvestorRow): ResolvedLender {
  const companyName = (inv.company_name ?? "").trim();
  const person = fullName(inv.first_name, inv.last_name);
  const isIndividual = !companyName && !inv.krs;

  const addressFull =
    (inv.address ?? "").trim() ||
    [inv.street, [inv.postal_code, inv.city].filter(Boolean).join(" ")]
      .map((s) => (s ?? "").trim())
      .filter(Boolean)
      .join(", ");

  const repName = fullName(inv.representative_first_name, inv.representative_last_name);

  return {
    id: inv.id,
    kind: "investor",
    label: companyName || person || "Inwestor",
    isIndividual,
    bundle: {
      name: companyName || person || undefined,
      nip: inv.nip || undefined,
      regon: inv.regon || undefined,
      krs: inv.krs || undefined,
      legalForm: inv.legal_form || undefined,
      addressFull: addressFull || undefined,
      phone: inv.phone || undefined,
      email: inv.email || undefined,
      bankAccount: inv.bank_account || undefined,
      representativeName: repName || undefined,
      representativeRole: inv.representative_role || undefined,
      pesel: inv.pesel || undefined,
    },
  };
}

/** Lista finansujących do wyboru: Finance You + aktywni inwestorzy. */
export const listLoanLenders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<LenderOption[]> => {
    const fy = financeYouLender();
    const financeYou: LenderOption = {
      id: fy.id,
      kind: fy.kind,
      label: fy.label,
      sublabel: "Pożyczkodawca instytucjonalny (spółka)",
    };

    const { data } = await supabaseAdmin
      .from("investors")
      .select("id, company_name, first_name, last_name, investor_type, entity_type, city, nip")
      .eq("is_active", true)
      .order("company_name", { ascending: true })
      .limit(1000);

    const investors: LenderOption[] = (data ?? []).map((inv: any) => {
      const name =
        (inv.company_name ?? "").trim() || fullName(inv.first_name, inv.last_name) || "Inwestor";
      const bits = [
        inv.investor_type === "instytucjonalny" ? "inwestor instytucjonalny" : "inwestor prywatny",
        inv.city ? String(inv.city).trim() : "",
        inv.nip ? `NIP ${inv.nip}` : "",
      ].filter(Boolean);
      return {
        id: inv.id,
        kind: "investor" as const,
        label: name,
        sublabel: bits.join(" · "),
      };
    });

    return [financeYou, ...investors];
  });

async function resolveLender(lenderId: string): Promise<ResolvedLender> {
  if (!lenderId || lenderId === "finance_you") return financeYouLender();
  const { data, error } = await supabaseAdmin
    .from("investors")
    .select(INVESTOR_COLS)
    .eq("id", lenderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Nie znaleziono wybranego inwestora.");
  return investorToLender(data as InvestorRow);
}

/**
 * Finansującym jest zalogowany inwestor — dane pobierane z JEGO profilu
 * (investors.user_id = bieżący użytkownik). Używane w wersji kreatora dla
 * inwestora, gdzie nie ma wyboru z listy: pożyczkodawcą jest zawsze on sam.
 */
async function resolveCurrentInvestorLender(userId: string): Promise<ResolvedLender> {
  const { data, error } = await supabaseAdmin
    .from("investors")
    .select(INVESTOR_COLS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data)
    throw new Error(
      "Twoje konto nie jest powiązane z profilem inwestora — uzupełnij dane w zakładce Profil.",
    );
  return investorToLender(data as InvestorRow);
}

// ─────────────────────────────────────────────────────────────────────
// Wzór: pobranie treści i pól
// ─────────────────────────────────────────────────────────────────────

async function loadTemplateText(
  supabase: { from: any; storage: any },
  templateId: string,
): Promise<{ name: string; text: string }> {
  const { data: tpl, error } = await supabase
    .from("document_templates")
    .select("name, template_file_path")
    .eq("id", templateId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!tpl?.template_file_path) throw new Error("Wzór nie ma przypisanego pliku.");

  // Wzory historycznie leżą w buckecie „documents"; nowe wgrywki lecą do
  // zunifikowanego „pliki-klienta". Próbujemy najpierw nowego, potem starego.
  let file: Blob | null = null;
  let dlErr: { message: string } | null = null;
  for (const bucket of [CLIENT_FILES_BUCKET, "documents"]) {
    const res = await supabase.storage.from(bucket).download(tpl.template_file_path);
    if (!res.error && res.data) {
      file = res.data as Blob;
      dlErr = null;
      break;
    }
    dlErr = res.error ?? { message: "brak pliku" };
  }
  if (!file) throw new Error(`Pobranie wzoru: ${dlErr?.message ?? "brak pliku"}`);

  const arrayBuf = await file.arrayBuffer();
  const { default: PizZip } = await import("pizzip");
  const zip = new PizZip(arrayBuf);
  const rawXml = zip.file("word/document.xml")?.asText() ?? "";
  const text = xmlToPlainText(normalizePlaceholders(rawXml));
  return { name: tpl.name as string, text };
}

// ─────────────────────────────────────────────────────────────────────
// Wypełnianie pól strony finansującego + „kwota słownie"
// ─────────────────────────────────────────────────────────────────────

/** Pola strony „Pożyczkodawca/Wierzyciel" wypełnia sam finansujący. */
function seedLenderValues(fields: DocField[], lender: ResolvedLender): Record<string, string> {
  const values: Record<string, string> = {};
  for (const f of fields) {
    if (f.groupKey !== "pozyczkodawca") continue;
    let v = companyValueForField(f, lender.bundle);
    if (!v && lender.bundle.pesel) {
      if (f.semantic === "pesel") v = lender.bundle.pesel;
      else if (f.semantic === "idLine" && lender.isIndividual && /pesel/i.test(f.key))
        v = `PESEL ${lender.bundle.pesel}`;
    }
    if (v) values[f.id] = v;
  }
  return values;
}

function parseAmountPL(s: string | undefined | null): number {
  if (!s) return NaN;
  let x = String(s).replace(/\s/g, "");
  if (x.includes(",")) x = x.replace(/\./g, "").replace(",", ".");
  return parseFloat(x);
}

/**
 * Uzupełnia pola „kwota słownie" z najbliższej wartości cyfrowej (ta sama
 * heurystyka co w formularzu Kreatora dokumentów) — niezależnie od modelu AI.
 */
function fillAmountWords(fields: DocField[], values: Record<string, string>): void {
  const amounts = fields.filter((f) => f.semantic === "amount");
  for (const w of fields) {
    if (w.semantic !== "amountWords") continue;
    if ((values[w.id] ?? "").trim()) continue;
    const wk = amountKind(w.key);
    let best: DocField | null = null;
    let bestScore = Infinity;
    for (const a of amounts) {
      const score =
        Math.abs(a.occ - w.occ) + (amountKind(a.key) === wk ? 0 : 0.4) + (a.occ < w.occ ? 0 : 0.1);
      if (score < bestScore) {
        bestScore = score;
        best = a;
      }
    }
    if (best) {
      const amt = parseAmountPL(values[best.id]);
      if (isFinite(amt) && amt > 0) values[w.id] = amountToWordsPLN(amt);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// Krok kreatora (Gemini Pro)
// ─────────────────────────────────────────────────────────────────────

export interface WizardChatResult {
  reply: string;
  /** indeks wystąpienia (string) → wartość */
  values: Record<string, string>;
  missing: string[];
  done: boolean;
  lenderName: string;
  templateName: string;
}

type ChatMsg = { role: "user" | "assistant"; content: string };

function greeting(lender: ResolvedLender, templateName: string): string {
  return (
    `Cześć! Pomogę wypełnić **${templateName}**. Finansującym jest **${lender.label}** ` +
    `— jego dane wpisałem już po stronie pożyczkodawcy.\n\n` +
    `Opisz teraz pożyczkobiorcę i warunki, np.:\n` +
    `• dane pożyczkobiorcy (imię i nazwisko lub firma, adres, PESEL/NIP),\n` +
    `• kwota pożyczki, okres, oprocentowanie, data wypłaty,\n` +
    `• zabezpieczenie (nr KW nieruchomości) — jeśli dotyczy.\n\n` +
    `Możesz podać wszystko naraz albo po kawałku. Uzupełnię pola wzoru w miarę rozmowy.`
  );
}

export const runLoanDocWizard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      templateId: string;
      lenderId?: string;
      messages: ChatMsg[];
      /** Kalkulacja z kalkulatora — dane finansowe uzupełniane DETERMINISTYCZNIE (bez AI). */
      calc?: LoanCalcPayload | null;
      /**
       * true = pożyczkodawcą jest zalogowany inwestor (dane z jego profilu);
       * pole `lenderId` jest wtedy ignorowane. Wersja kreatora dla inwestora.
       */
      useSelfAsLender?: boolean;
    }) => d,
  )
  .handler(async ({ data, context }): Promise<WizardChatResult> => {
    const { supabase } = context;
    const [{ name: templateName, text }, lender] = await Promise.all([
      loadTemplateText(supabase, data.templateId),
      data.useSelfAsLender
        ? resolveCurrentInvestorLender(context.userId)
        : resolveLender(data.lenderId ?? ""),
    ]);

    const fields = extractOrderedFields(text);
    const seed = seedLenderValues(fields, lender);

    const history = (data.messages ?? []).filter((m) => m && m.content && m.content.trim());

    // Bez rozmowy — dane finansującego + (opcjonalnie) kalkulacja + powitanie (bez AI).
    if (history.length === 0) {
      const values = { ...(data.calc ? buildCalcFieldValues(fields, data.calc) : {}), ...seed };
      fillAmountWords(fields, values);
      return {
        reply: greeting(lender, templateName),
        values,
        missing: ["dane pożyczkobiorcy", "kwota i okres pożyczki", "data umowy"],
        done: false,
        lenderName: lender.label,
        templateName,
      };
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY nie skonfigurowany");

    // Pola do wypełnienia przez rozmowę — bez strony finansującego (tę wypełnia
    // sam finansujący) i bez czystych instrukcji/opcji (te operator ustawia ręcznie).
    const fillable = fields
      .filter((f) => f.groupKey !== "pozyczkodawca")
      .filter((f) => f.semantic !== "instruction")
      .map((f) => ({
        id: f.id,
        label: f.label,
        key: f.key,
        typ: f.semantic,
        sekcja: f.groupLabel,
        ...(f.options ? { opcje: f.options } : {}),
      }));

    const lenderFacts = Object.entries(lender.bundle)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ");

    const system =
      "Jesteś asystentem operatora pożyczkowego Finance You. Prowadzisz w oknie czatu KREATOR " +
      "wypełniania dokumentu „komplet do udzielenia pożyczki” (po polsku). Twoje zadanie: na podstawie " +
      "rozmowy zebrać dane POŻYCZKOBIORCY oraz warunki pożyczki i przypisać je do pól wzoru po ich `id`.\n\n" +
      `FINANSUJĄCY (pożyczkodawca) jest już wybrany: ${lender.label}. Jego dane są wstawione automatycznie — ` +
      "NIE pytaj o nie i NIE wypełniaj pól pożyczkodawcy.\n" +
      (lenderFacts ? `Dane finansującego (kontekst): ${lenderFacts}.\n` : "") +
      "\nZASADY:\n" +
      "1. Używaj WYŁĄCZNIE informacji podanych przez operatora. NIGDY nie wymyślaj PESEL, NIP, KRS, numerów KW, " +
      "kwot ani dat. Jeśli czegoś nie podano — pomiń to pole (zostaw puste).\n" +
      "2. Kwoty formatuj po polsku z dwoma miejscami: „50 000,00”. Daty w formacie DD.MM.RRRR.\n" +
      "3. Dopasowuj pola po znaczeniu (`typ`, `label`, `sekcja`, `key`). Do jednego pola wpisz jedną wartość.\n" +
      "4. Pola „kwota słownie” możesz pominąć — system wyliczy je z kwoty cyfrowej.\n" +
      "5. W `reply` odpisz zwięźle i ciepło po polsku: potwierdź, co uzupełniłeś, i zapytaj o JEDNĄ najważniejszą " +
      "brakującą rzecz. Gdy komplet danych krytycznych (pożyczkobiorca, kwota, okres, data) jest gotowy — ustaw `done`: true.\n\n" +
      "Zwróć WYŁĄCZNIE JSON:\n" +
      '{ "reply": "…", "values": { "<id>": "<wartość>" }, "missing": ["…"], "done": false }';

    const fieldsBlock =
      "POLA WZORU DO WYPEŁNIENIA (JSON):\n" +
      JSON.stringify(fillable) +
      "\n\nFragment treści wzoru (dla kontekstu):\n" +
      text.slice(0, 6000);

    const messages = [
      { role: "system", content: system },
      { role: "user", content: fieldsBlock },
      ...history.map((m) => ({ role: m.role, content: m.content })),
    ];

    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: GEMINI_PRO,
        messages,
        response_format: { type: "json_object" },
      }),
    });

    if (res.status === 429) throw new Error("Zbyt wiele zapytań do AI. Spróbuj za chwilę.");
    if (res.status === 402) throw new Error("Wyczerpany limit AI. Doładuj środki w Lovable Cloud.");
    if (!res.ok) throw new Error(`AI gateway: ${res.status} ${await res.text().catch(() => "")}`);

    const json: any = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "{}";

    let parsed: any = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      // Miękki fallback — wytnij ewentualne ```json … ```
      const m = content.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }

    // Zbuduj końcową mapę wartości: AI (pożyczkobiorca + warunki) + finansujący.
    const values: Record<string, string> = {};
    const validIds = new Set(fields.map((f) => f.id));
    if (parsed.values && typeof parsed.values === "object") {
      for (const [id, val] of Object.entries(parsed.values)) {
        if (validIds.has(String(id)) && val != null && String(val).trim()) {
          values[String(id)] = String(val).trim();
        }
      }
    }
    // Dane finansowe z kalkulatora (deterministyczne) mają pierwszeństwo przed AI,
    // a dane finansującego przed wszystkim — chronią tożsamość pożyczkodawcy.
    if (data.calc) Object.assign(values, buildCalcFieldValues(fields, data.calc));
    Object.assign(values, seed);
    fillAmountWords(fields, values);

    return {
      reply: typeof parsed.reply === "string" ? parsed.reply : "Zaktualizowałem pola wzoru.",
      values,
      missing: Array.isArray(parsed.missing) ? parsed.missing.map(String).slice(0, 8) : [],
      done: parsed.done === true,
      lenderName: lender.label,
      templateName,
    };
  });
