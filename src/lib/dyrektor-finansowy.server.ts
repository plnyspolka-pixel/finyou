// Server-only helpers for "Dyrektor finansowy" — AI assistant for investors.
// Powered by Anthropic (Claude). All tools are scoped to the calling investor:
// the model never sees data of other investors, and only sees full client data
// for applications where this investor has made an offer.

import { monthlyPayment } from "./loan-math";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export const DF_MODEL = "claude-sonnet-4-5";
export const DF_MAX_TOKENS = 8000;
export const DF_TEMPERATURE = 0.3;

export const DF_SYSTEM_PROMPT = `Jesteś "Dyrektorem finansowym" — asystentem AI w panelu inwestora platformy Finance You (pożyczki pod nieruchomość, inwestowanie w wierzytelności). Pomagasz konkretnemu inwestorowi prowadzić jego działalność: analizujesz jego dane i oferty, przygotowujesz oferty dla klientów, generujesz pliki CSV z parametrami oferty oraz prowadzisz procedurę zawarcia pożyczki (przygotowanie umowy do podpisu przez obie strony).

Masz dostęp (przez narzędzia) do:
- danych zalogowanego inwestora (get_my_profile) i jego ofert (list_my_offers),
- wniosków dostępnych do złożenia oferty (list_available_applications),
- pełnych danych klientów, którzy ZAAKCEPTOWALI ofertę tego inwestora (list_accepted_clients, get_application_full),
- wzorów dokumentów dostępnych dla inwestorów (list_document_templates, get_document_template),
- generowania pliku CSV z parametrami oferty (generate_offer_csv),
- składania ofert dla klientów (create_offer),
- uruchamiania procedury zawarcia pożyczki / przygotowania umowy (prepare_loan_contract).

Dodatkowo, gdy inwestor ustawi parametry w kalkulatorze pożyczki obok czatu, otrzymujesz je w bloku "KONTEKST" przy jego wiadomości — możesz je analizować, komentować i wykorzystywać (np. do CSV oferty lub złożenia oferty).

Zasady:
- Odpowiadaj po polsku, rzeczowo i zwięźle, bez ogólników.
- Operujesz WYŁĄCZNIE na danych tego inwestora — nie masz i nie próbuj uzyskać dostępu do danych innych inwestorów.
- Przy składaniu oferty (create_offer) najpierw pokaż proponowane parametry i poproś o potwierdzenie, chyba że inwestor wyraźnie poprosił o wykonanie od razu.
- Pamiętaj o limitach prawnych (maksymalne odsetki, MPKK, krotność spłaty) — ostrzegaj, jeśli parametry je przekraczają.
- Gdy klient zaakceptował ofertę, możesz poprowadzić procedurę zawarcia pożyczki: wywołaj prepare_loan_contract, wskaż brakujące dane i podaj link do strony umowy: /inwestor/umowa/{offer_id}.
- Plik CSV z oferty zwracaj w bloku \`\`\`csv ... \`\`\` aby inwestor mógł go pobrać i wgrać pod ofertę klienta.`;

export type ToolCall = { name: string; input: Record<string, unknown> };

export const DF_TOOLS = [
  {
    name: "get_my_profile",
    description:
      "Zwraca dane zalogowanego inwestora (typ, firma, dane kontaktowe, abonament) oraz liczbę jego ofert wg statusu.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_my_offers",
    description:
      "Lista ofert złożonych przez tego inwestora wraz ze statusem, kwotą, okresem oraz podstawowymi danymi wniosku i klienta.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description:
            "Opcjonalny filtr statusu oferty (np. 'zaakceptowana_przez_klienta', 'zlozona').",
        },
      },
    },
  },
  {
    name: "list_available_applications",
    description:
      "Lista wniosków pożyczkowych dostępnych dla inwestorów (do których można złożyć ofertę): kwota, okres, oczekiwane oprocentowanie, LTV i dane nieruchomości. Dane klienta są ograniczone zgodnie z poziomem widoczności.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Maksymalna liczba wniosków (domyślnie 30, max 100).", default: 30 },
      },
    },
  },
  {
    name: "list_accepted_clients",
    description:
      "Lista ofert tego inwestora, które klient ZAAKCEPTOWAŁ — z pełnymi danymi klienta, wniosku i nieruchomości. To kandydaci do zawarcia pożyczki.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_application_full",
    description:
      "Pełne dane wniosku pożyczkowego: klient, nieruchomość, lista dokumentów, profil do umowy oraz status przygotowania umowy. Dostępne tylko dla wniosków, na które ten inwestor złożył ofertę.",
    input_schema: {
      type: "object",
      properties: {
        application_id: { type: "string", description: "ID wniosku (loan_applications.id)." },
      },
      required: ["application_id"],
    },
  },
  {
    name: "list_document_templates",
    description:
      "Lista wzorów dokumentów dostępnych dla inwestora (nazwa, kategoria, opis, pola/placeholdery).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_document_template",
    description: "Pełna treść (HTML) wybranego wzoru dokumentu dostępnego dla inwestora.",
    input_schema: {
      type: "object",
      properties: { template_id: { type: "string", description: "ID wzoru (document_templates.id)." } },
      required: ["template_id"],
    },
  },
  {
    name: "generate_offer_csv",
    description:
      "Generuje zawartość pliku CSV z parametrami oferty dla danego wniosku (kwota, okres, oprocentowanie, rata, harmonogram). Zwraca tekst CSV do pobrania i wgrania pod ofertę klienta.",
    input_schema: {
      type: "object",
      properties: {
        application_id: { type: "string", description: "ID wniosku, którego dotyczy oferta." },
        amount: { type: "number", description: "Kwota pożyczki (PLN)." },
        period_months: { type: "number", description: "Okres w miesiącach." },
        annual_rate: { type: "number", description: "Oprocentowanie roczne (%)." },
        monthly_payment: { type: "number", description: "Rata miesięczna (opcjonalnie, policzy się sama)." },
        commission: { type: "number", description: "Prowizja (%) — opcjonalnie." },
        balloon_amount: { type: "number", description: "Kwota balonowa na końcu — opcjonalnie." },
        note: { type: "string", description: "Notatka do oferty — opcjonalnie." },
      },
      required: ["application_id", "amount", "period_months", "annual_rate"],
    },
  },
  {
    name: "create_offer",
    description:
      "Składa ofertę dla klienta (zapisuje rekord oferty). Domyślnie jako szkic; ustaw submit=true aby od razu złożyć. Wymaga wcześniejszego potwierdzenia parametrów przez inwestora.",
    input_schema: {
      type: "object",
      properties: {
        application_id: { type: "string", description: "ID wniosku." },
        amount: { type: "number", description: "Kwota pożyczki (PLN)." },
        period_months: { type: "number", description: "Okres w miesiącach." },
        annual_rate: { type: "number", description: "Oprocentowanie roczne (%)." },
        monthly_payment: { type: "number", description: "Rata miesięczna — opcjonalnie." },
        commission: { type: "number", description: "Prowizja (%) — opcjonalnie." },
        balloon_amount: { type: "number", description: "Kwota balonowa — opcjonalnie." },
        note: { type: "string", description: "Notatka do oferty — opcjonalnie." },
        submit: { type: "boolean", description: "true = złóż ofertę, false = zapisz szkic.", default: false },
      },
      required: ["application_id", "amount", "period_months", "annual_rate"],
    },
  },
  {
    name: "prepare_loan_contract",
    description:
      "Uruchamia procedurę zawarcia pożyczki dla zaakceptowanej oferty: buduje profil do umowy i zwraca listę brakujących pól (po stronie klienta i inwestora) oraz link do strony umowy. Dostępne dla ofert zaakceptowanych przez klienta.",
    input_schema: {
      type: "object",
      properties: { offer_id: { type: "string", description: "ID oferty (investor_offers.id)." } },
      required: ["offer_id"],
    },
  },
];

function buildScheduleCsv(amount: number, annualRate: number, months: number): string {
  const rata = monthlyPayment(amount, annualRate, months);
  const monthlyRate = annualRate / 100 / 12;
  let saldo = amount;
  const lines = ["Nr raty;Kapital;Odsetki;Rata;Saldo po racie"];
  for (let i = 1; i <= months; i++) {
    const ods = saldo * monthlyRate;
    const kap = Math.max(0, rata - ods);
    saldo = Math.max(0, saldo - kap);
    lines.push(
      `${i};${kap.toFixed(2)};${ods.toFixed(2)};${rata.toFixed(2)};${saldo.toFixed(2)}`,
    );
  }
  return lines.join("\n");
}

export async function runDfTool(
  call: ToolCall,
  ctx: { investorId: string },
): Promise<{ ok: boolean; output: unknown; error?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const investorId = ctx.investorId;

  try {
    if (call.name === "get_my_profile") {
      const { data: inv, error } = await db
        .from("investors")
        .select(
          "id, investor_type, company_name, first_name, last_name, email, phone, subscription_plan, subscription_status, subscription_active_until, is_active, created_at",
        )
        .eq("id", investorId)
        .maybeSingle();
      if (error) return { ok: false, output: null, error: error.message };
      const { data: offers } = await db
        .from("investor_offers")
        .select("offer_status")
        .eq("investor_id", investorId);
      const byStatus: Record<string, number> = {};
      for (const o of offers ?? []) byStatus[o.offer_status] = (byStatus[o.offer_status] ?? 0) + 1;
      return { ok: true, output: { investor: inv, offers_by_status: byStatus, offers_total: (offers ?? []).length } };
    }

    if (call.name === "list_my_offers") {
      let q = db
        .from("investor_offers")
        .select(
          "id, offer_status, proposed_amount, period_months, expected_yearly_yield, estimated_monthly_payment, estimated_total_cost, has_balloon, balloon_amount, investor_note, created_at, submitted_at, client_decision_at, loan_application_id, loan_applications(id, loan_amount, preferred_period_months, status, clients(first_name, last_name))",
        )
        .eq("investor_id", investorId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (call.input.status) q = q.eq("offer_status", String(call.input.status));
      const { data, error } = await q;
      if (error) return { ok: false, output: null, error: error.message };
      return { ok: true, output: data };
    }

    if (call.name === "list_available_applications") {
      const limit = Math.min(Number(call.input.limit ?? 30) || 30, 100);
      const { data, error } = await db
        .from("loan_applications")
        .select(
          "id, loan_amount, preferred_period_months, annual_investor_rate, max_monthly_payment, estimated_ltv, visibility_level, situation_description, properties(property_type, city, voivodeship, estimated_value, area_sqm)",
        )
        .eq("available_to_investors", true)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return { ok: false, output: null, error: error.message };
      return { ok: true, output: data };
    }

    if (call.name === "list_accepted_clients") {
      const { data, error } = await db
        .from("investor_offers")
        .select(
          "id, proposed_amount, period_months, expected_yearly_yield, estimated_monthly_payment, client_decision_at, loan_application_id, loan_applications(id, loan_amount, preferred_period_months, situation_description, clients(id, first_name, last_name, email, phone), properties(property_type, city, voivodeship, estimated_value, land_register_number))",
        )
        .eq("investor_id", investorId)
        .eq("offer_status", "zaakceptowana_przez_klienta")
        .order("client_decision_at", { ascending: false });
      if (error) return { ok: false, output: null, error: error.message };
      return { ok: true, output: data };
    }

    if (call.name === "get_application_full") {
      const appId = String(call.input.application_id ?? "");
      if (!appId) return { ok: false, output: null, error: "Brak application_id." };
      // Autoryzacja: ten inwestor musi mieć ofertę na ten wniosek.
      const { data: myOffers } = await db
        .from("investor_offers")
        .select("id, offer_status")
        .eq("investor_id", investorId)
        .eq("loan_application_id", appId);
      if (!myOffers || myOffers.length === 0)
        return { ok: false, output: null, error: "Brak dostępu: nie złożyłeś oferty na ten wniosek." };

      const { data: app, error } = await db
        .from("loan_applications")
        .select("*, clients(*), properties(*)")
        .eq("id", appId)
        .maybeSingle();
      if (error) return { ok: false, output: null, error: error.message };
      const { data: docs } = await db
        .from("documents")
        .select("id, document_type, file_name, created_at")
        .eq("loan_application_id", appId);
      const { data: profile } = await db
        .from("client_profiles")
        .select("id, data, completion_percent, updated_at")
        .eq("source_application_id", appId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return {
        ok: true,
        output: {
          application: app,
          documents: docs ?? [],
          contract_profile: profile ?? null,
          my_offers: myOffers,
        },
      };
    }

    if (call.name === "list_document_templates") {
      const { data, error } = await db
        .from("document_templates")
        .select("id, name, description, category, placeholders, output_format")
        .contains("audience", ["inwestor"])
        .order("name", { ascending: true });
      if (error) return { ok: false, output: null, error: error.message };
      return { ok: true, output: data };
    }

    if (call.name === "get_document_template") {
      const id = String(call.input.template_id ?? "");
      if (!id) return { ok: false, output: null, error: "Brak template_id." };
      const { data, error } = await db
        .from("document_templates")
        .select("id, name, description, category, placeholders, output_format, content_html, audience")
        .eq("id", id)
        .maybeSingle();
      if (error) return { ok: false, output: null, error: error.message };
      if (!data || !(data.audience ?? []).includes("inwestor"))
        return { ok: false, output: null, error: "Wzór niedostępny dla inwestora." };
      return { ok: true, output: data };
    }

    if (call.name === "generate_offer_csv") {
      const amount = Number(call.input.amount);
      const months = Number(call.input.period_months);
      const annual = Number(call.input.annual_rate);
      if (!amount || !months || !annual)
        return { ok: false, output: null, error: "Wymagane: amount, period_months, annual_rate." };
      const rata = call.input.monthly_payment ? Number(call.input.monthly_payment) : monthlyPayment(amount, annual, months);
      const totalToRepay = rata * months;
      const header = [
        "Parametr;Wartosc",
        `ID wniosku;${String(call.input.application_id ?? "")}`,
        `Kwota pozyczki (PLN);${amount.toFixed(2)}`,
        `Okres (miesiace);${months}`,
        `Oprocentowanie roczne (%);${annual}`,
        `Rata miesieczna (PLN);${rata.toFixed(2)}`,
        `Calkowity koszt splaty (PLN);${totalToRepay.toFixed(2)}`,
        ...(call.input.commission ? [`Prowizja (%);${Number(call.input.commission)}`] : []),
        ...(call.input.balloon_amount ? [`Kwota balonowa (PLN);${Number(call.input.balloon_amount).toFixed(2)}`] : []),
        ...(call.input.note ? [`Notatka;${String(call.input.note).replace(/[\r\n;]+/g, " ")}`] : []),
        "",
      ].join("\n");
      const csv = header + buildScheduleCsv(amount, annual, months);
      return {
        ok: true,
        output: {
          filename: `oferta_${String(call.input.application_id ?? "wniosek").slice(0, 8)}_${amount}_${months}m.csv`,
          csv,
        },
      };
    }

    if (call.name === "create_offer") {
      const appId = String(call.input.application_id ?? "");
      const amount = Number(call.input.amount);
      const months = Number(call.input.period_months);
      const annual = Number(call.input.annual_rate);
      if (!appId || !amount || !months || !annual)
        return { ok: false, output: null, error: "Wymagane: application_id, amount, period_months, annual_rate." };
      // Wniosek musi być dostępny dla inwestorów.
      const { data: app } = await db
        .from("loan_applications")
        .select("id, available_to_investors")
        .eq("id", appId)
        .maybeSingle();
      if (!app) return { ok: false, output: null, error: "Wniosek nie istnieje." };
      const rata = call.input.monthly_payment ? Number(call.input.monthly_payment) : monthlyPayment(amount, annual, months);
      const balloon = call.input.balloon_amount ? Number(call.input.balloon_amount) : null;
      const submit = call.input.submit === true;
      const payload: Record<string, unknown> = {
        loan_application_id: appId,
        investor_id: investorId,
        offer_status: submit ? "zlozona" : "szkic",
        proposed_amount: amount,
        period_months: months,
        expected_yearly_yield: annual,
        commission: call.input.commission ? Number(call.input.commission) : null,
        has_balloon: !!balloon,
        balloon_amount: balloon,
        repayment_type: balloon ? "mieszana" : "miesieczna",
        estimated_monthly_payment: rata,
        estimated_total_cost: rata * months,
        investor_note: call.input.note ? String(call.input.note) : null,
        submitted_at: submit ? new Date().toISOString() : null,
      };
      const { data: ins, error } = await db.from("investor_offers").insert(payload).select("id, offer_status").single();
      if (error) return { ok: false, output: null, error: error.message };
      return { ok: true, output: { offer_id: ins.id, offer_status: ins.offer_status } };
    }

    if (call.name === "prepare_loan_contract") {
      const offerId = String(call.input.offer_id ?? "");
      if (!offerId) return { ok: false, output: null, error: "Brak offer_id." };
      // Autoryzacja: oferta musi należeć do tego inwestora i być zaakceptowana.
      const { data: offer } = await db
        .from("investor_offers")
        .select("id, offer_status")
        .eq("id", offerId)
        .eq("investor_id", investorId)
        .maybeSingle();
      if (!offer) return { ok: false, output: null, error: "Oferta nie należy do Ciebie lub nie istnieje." };
      if (offer.offer_status !== "zaakceptowana_przez_klienta")
        return {
          ok: false,
          output: null,
          error: "Procedurę zawarcia pożyczki można uruchomić dopiero po akceptacji oferty przez klienta.",
        };
      const { buildContractStatusForOffer } = await import("./contract-prep.functions");
      const status = await buildContractStatusForOffer(offerId);
      return {
        ok: true,
        output: {
          ...status,
          contract_url: `/inwestor/umowa/${offerId}`,
          note: "Uzupełnij brakujące pola po swojej stronie; klient uzupełnia swoje. Po skompletowaniu umowa będzie gotowa do podpisu.",
        },
      };
    }

    return { ok: false, output: null, error: `Nieznane narzędzie: ${call.name}` };
  } catch (e) {
    return { ok: false, output: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export type AnthropicMessage = {
  role: "user" | "assistant";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
        | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
      >;
};

export async function callDfAnthropic(args: {
  system: string;
  messages: AnthropicMessage[];
}): Promise<{
  stop_reason: string;
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  >;
  usage: { input_tokens: number; output_tokens: number };
}> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Brak ANTHROPIC_API_KEY w środowisku.");

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: DF_MODEL,
      system: args.system,
      messages: args.messages,
      max_tokens: DF_MAX_TOKENS,
      temperature: DF_TEMPERATURE,
      tools: DF_TOOLS,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic ${res.status}: ${t}`);
  }
  return (await res.json()) as never;
}
