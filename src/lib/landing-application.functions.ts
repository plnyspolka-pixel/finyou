import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PropertyTypeEnum = z.enum([
  "mieszkanie",
  "dom",
  "lokal_uslugowy",
  "dzialka_budowlana",
  "grunt_rolny",
  "inna",
]);

const PhotoSchema = z
  .object({
    dataUrl: z.string().min(20).max(15_000_000).optional(), // ~11MB base64 (opcjonalne, gdy podano storagePath)
    storagePath: z.string().min(1).max(500).optional(), // ścieżka w buckecie `pliki-klienta` (upload już wykonany)
    mimeType: z.string().max(120),
    fileName: z.string().max(200),
    bucket: z.string().max(60), // logiczny typ dokumentu
  })
  .refine((v) => !!v.dataUrl || !!v.storagePath, { message: "Wymagany dataUrl lub storagePath" });

const SubmitSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(6).max(30),
  loan_amount: z.number().min(20_000).max(2_000_000),
  preferred_period_months: z.number().int().min(3).max(72),
  property_type: PropertyTypeEnum,
  land_register_number: z.string().trim().max(60).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  annual_investor_rate: z.number().min(0).max(100).optional().nullable(),
  max_monthly_payment: z.number().min(0).max(1_000_000).optional().nullable(),
  photos: z.array(PhotoSchema).max(40).optional().default([]),
  source: z.string().max(120).optional().nullable(),
  // Zachowane dla zgodności wstecznej wywołań publicznych; ignorowane —
  // przypisanie pośrednika wykonuje wyłącznie uwierzytelniona funkcja
  // submitBrokerLoanApplication (autor nie może pochodzić z przeglądarki).
  assigned_operator_id: z.string().uuid().optional().nullable(),
});

type SubmitInput = z.infer<typeof SubmitSchema>;

export type SubmitApplicationResult =
  | { ok: true; id: string; token_hash: string | null; email: string }
  | { ok: false; code: "BROKER_OFFER_LIMIT" | "ERROR"; message?: string };

async function submitApplicationCore(
  data: SubmitInput,
  broker?: { userId: string },
): Promise<SubmitApplicationResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { normalizePolishPhone } = await import("@/lib/phone");
  const { runPropertyCollateralAnalysisCore } =
    await import("@/lib/property-analysis/property-collateral-analysis.functions");

  const { normalized, valid } = normalizePolishPhone(data.phone);
  const source = data.source ?? (broker ? "posrednik_panel" : "landing_single_page");

  // Re-użyj istniejącego klienta po e-mailu zamiast tworzyć duplikat
  const { data: existingClient } = await supabaseAdmin
    .from("clients")
    .select("id, user_id")
    .eq("email", data.email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let client: { id: string };
  if (existingClient) {
    await supabaseAdmin
      .from("clients")
      .update({
        first_name: data.first_name,
        last_name: data.last_name,
        phone: normalized ?? data.phone,
        phone_raw: data.phone,
        phone_normalized: normalized,
        phone_valid: valid,
      })
      .eq("id", existingClient.id);
    client = { id: existingClient.id };
  } else {
    const { data: created, error: cErr } = await supabaseAdmin
      .from("clients")
      .insert({
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
        phone: normalized ?? data.phone,
        phone_raw: data.phone,
        phone_normalized: normalized,
        phone_valid: valid,
        consent_rodo: true,
        source,
      })
      .select("id")
      .single();
    if (cErr || !created) throw new Error(cErr?.message ?? "client insert failed");
    client = { id: created.id };
  }

  const { data: loan, error: lErr } = await (supabaseAdmin.from("loan_applications") as any)
    .insert({
      client_id: client.id,
      status: "nowy_lead",
      loan_amount: data.loan_amount,
      preferred_period_months: data.preferred_period_months,
      kw_status: data.land_register_number ? "znam" : "nie_znam",
      annual_investor_rate: data.annual_investor_rate ?? null,
      max_monthly_payment: data.max_monthly_payment ?? null,
      source,
      assigned_operator: broker?.userId ?? null,
      // Trwałe, niezmienne autorstwo oferty pośrednika (limit 5 na koncie
      // darmowym egzekwuje trigger enforce_broker_offer_limit w bazie).
      created_by_partner_user_id: broker?.userId ?? null,
    })
    .select("id")
    .single();
  if (lErr || !loan) {
    if (String(lErr?.message ?? "").includes("BROKER_OFFER_LIMIT")) {
      return {
        ok: false,
        code: "BROKER_OFFER_LIMIT",
        message:
          "W darmowym koncie możesz posiadać maksymalnie 5 ofert jednocześnie. Usuń jedną z istniejących ofert albo wykup pełny dostęp.",
      };
    }
    throw new Error(lErr?.message ?? "loan insert failed");
  }

  // === Auto-utworzenie konta klienta + magiczny link do auto-loginu ===
  let tokenHash: string | null = null;
  let tempPassword: string | null = null;
  try {
    // 1) Spróbuj utworzyć usera. Jeżeli już istnieje — pomiń tworzenie.
    const genPwd = () => {
      const bytes = new Uint8Array(12);
      crypto.getRandomValues(bytes);
      const base = Array.from(bytes, (b) => b.toString(36))
        .join("")
        .slice(0, 14);
      return `${base.charAt(0).toUpperCase()}${base.slice(1)}!9`;
    };
    tempPassword = genPwd();
    const { data: created, error: cuErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { first_name: data.first_name, last_name: data.last_name },
    });
    let userId: string | null = created?.user?.id ?? null;
    if (cuErr && !userId) {
      // user już istnieje — nie nadpisujemy hasła
      tempPassword = null;
    }
    // 2) Wygeneruj magiczny link (zalogowanie jednym kliknięciem)
    const { data: link } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: data.email,
    });
    if (!userId) userId = link?.user?.id ?? null;
    // 3) Połącz klienta z kontem auth
    if (userId) {
      await supabaseAdmin.from("clients").update({ user_id: userId }).eq("id", client.id);
    }
    // 4) Autologowanie tylko dla kont bez uprawnień admina
    let isAdmin = false;
    if (userId) {
      const { data: adminRow } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .in("role", ["administrator"])
        .maybeSingle();
      isAdmin = !!adminRow;
    }
    if (!isAdmin) {
      tokenHash = link?.properties?.hashed_token ?? null;
    }
  } catch (err) {
    console.error("[landing-application] auth user create/link failed", err);
  }

  const { data: property } = await supabaseAdmin
    .from("properties")
    .insert({
      loan_application_id: loan.id,
      property_type: data.property_type,
      land_register_number: data.land_register_number ?? null,
      city: data.city ?? null,
    })
    .select("id")
    .single();

  // Upload plików do bucketu pliki-klienta + rekordy w tabeli documents.
  for (const p of data.photos ?? []) {
    try {
      let path: string | null = null;
      let contentType = p.mimeType || "application/octet-stream";
      if (p.storagePath) {
        // Plik został już wgrany osobno (np. przez `uploadLandingAttachment`).
        path = p.storagePath;
      } else if (p.dataUrl) {
        const m = /^data:([^;]+);base64,(.*)$/.exec(p.dataUrl);
        if (!m) continue;
        const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
        const safeName = p.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
        path = `${loan.id}/${p.bucket}/${Date.now()}-${safeName}`;
        contentType = p.mimeType || m[1];
        const { error: upErr } = await supabaseAdmin.storage
          .from(CLIENT_FILES_BUCKET)
          .upload(path, bytes, { contentType, upsert: false });
        if (upErr) continue;
      }
      if (!path) continue;
      await supabaseAdmin.from("documents").insert({
        loan_application_id: loan.id,
        property_id: property?.id ?? null,
        document_type: p.bucket,
        file_name: p.fileName,
        file_path: path,
        visibility_level: "pelne",
        status: "received",
      });
    } catch (e) {
      console.error("[landing-application] photo upload failed", e);
    }
  }

  void runPropertyCollateralAnalysisCore(loan.id).catch((err) => {
    console.error("[landing-application] collateral analysis failed", err);
  });

  // Uwaga: wniosek z formularza NIE odpala natychmiastowego telefonu Ani.
  // Kontakt telefoniczny prowadzą sekwencje przypomnień; telefon „od razu po
  // wejściu leada" jest włączony wyłącznie dla leadów z Meta (patrz meta-leads-sync).

  // Powiadomienia mailowe (fire-and-forget)
  void (async () => {
    try {
      const { sendResendEmail } = await import("@/lib/resend-send.server");
      const { logLeadCommunication } = await import("@/lib/lead-comms.server");
      const fmtPLN = (n: number) =>
        new Intl.NumberFormat("pl-PL", {
          style: "currency",
          currency: "PLN",
          maximumFractionDigits: 0,
        }).format(n);
      const fullName = `${data.first_name} ${data.last_name}`.trim();
      const adminUrl = `https://app.financeyou.pl/admin/wnioski/${loan.id}`;
      const propertyLabel = data.property_type.replace(/_/g, " ");

      // 1) Potwierdzenie do klienta — ton ciepły, podkreśla przewagi
      const clientSubject = "Dziękujemy za wniosek — Finance You";
      const clientText = `Dzień dobry ${data.first_name},

Dziękujemy za przesłanie wniosku o pożyczkę pod zabezpieczenie nieruchomości w Finance You.

Podsumowanie:
• Kwota: ${fmtPLN(data.loan_amount)}
• Okres: ${data.preferred_period_months} mies.
• Zabezpieczenie: ${propertyLabel}

Twoje konto klienta zostało utworzone. Zaloguj się tutaj: https://app.financeyou.pl/klient
E-mail: ${data.email}
${tempPassword ? `Hasło tymczasowe: ${tempPassword} (zmień po pierwszym logowaniu)` : `Konto istniało już wcześniej — użyj swojego hasła lub opcji „Zapomniałem hasła".`}

Co dalej? Nasz zespół analizuje teraz Państwa zgłoszenie i nieruchomość. Skontaktujemy się w ciągu 24 godzin z indywidualną propozycją — pracujemy z wieloma inwestorami, dzięki czemu wybieramy dla Państwa najkorzystniejsze warunki i długi okres spłaty.

W razie pytań prosimy odpisać na ten e-mail lub zadzwonić.

Pozdrawiamy,
Zespół Finance You`;
      const clientHtml = `
          <p>Dzień dobry ${data.first_name},</p>
          <p>Dziękujemy za przesłanie wniosku o pożyczkę pod zabezpieczenie nieruchomości w <strong>Finance You</strong>.</p>
          <p><strong>Podsumowanie wniosku:</strong></p>
          <ul>
            <li>Kwota: <strong>${fmtPLN(data.loan_amount)}</strong></li>
            <li>Okres: <strong>${data.preferred_period_months} mies.</strong></li>
            <li>Zabezpieczenie: <strong>${propertyLabel}</strong></li>
          </ul>
          <p><strong>Twoje konto klienta zostało utworzone.</strong> Możesz zalogować się do panelu, gdzie zobaczysz status wniosku, dokumenty i wiadomości od nas.</p>
          <p><a href="https://app.financeyou.pl/klient" style="display:inline-block;padding:10px 18px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Otwórz panel klienta →</a></p>
          <p><strong>Dane do logowania:</strong></p>
          <ul>
            <li>E-mail: <strong>${data.email}</strong></li>
            ${tempPassword ? `<li>Hasło tymczasowe: <strong>${tempPassword}</strong> (zmień je po pierwszym logowaniu)</li>` : `<li>Konto istniało już wcześniej — użyj swojego hasła lub opcji „Zapomniałem hasła".</li>`}
          </ul>
          <p><strong>Co dalej?</strong> Nasz zespół analizuje teraz Państwa zgłoszenie i nieruchomość. Skontaktujemy się w ciągu 24 godzin z indywidualną propozycją — pracujemy z wieloma inwestorami, dzięki czemu wybieramy dla Państwa najkorzystniejsze warunki i długi okres spłaty.</p>
          <p>W razie pytań prosimy odpisać na ten e-mail lub zadzwonić.</p>
          <p>Pozdrawiamy,<br/>Zespół Finance You</p>
        `;
      const clientRes = await sendResendEmail({
        to: data.email,
        subject: clientSubject,
        text: clientText,
        html: clientHtml,
        replyTo: "kontakt@financeyou.pl",
        showReplyHint: true,
      });
      await logLeadCommunication({
        loanApplicationId: loan.id,
        clientId: client.id,
        email: data.email,
        phoneNormalized: normalized,
        channel: "email",
        direction: "outbound",
        status: clientRes.ok ? "sent" : "failed",
        subject: clientSubject,
        content: clientText,
        externalId: clientRes.id ?? null,
        errorMessage: clientRes.error ?? null,
        metadata: { kind: "landing_application_confirmation" },
      });

      // 2) Powiadomienie do zespołu z linkiem do panelu
      const teamTo = process.env.TEAM_NOTIFY_EMAIL ?? "kontakt@financeyou.pl";
      const teamSubject = `Nowy wniosek: ${fullName} — ${fmtPLN(data.loan_amount)} / ${data.preferred_period_months} mies.`;
      const teamText = `Nowy wniosek z landing page.

Klient: ${fullName}
E-mail: ${data.email}
Telefon: ${data.phone}
Kwota: ${fmtPLN(data.loan_amount)}
Okres: ${data.preferred_period_months} mies.
Zabezpieczenie: ${propertyLabel}
KW: ${data.land_register_number ?? "—"}
Załączniki: ${(data.photos ?? []).length}

Podgląd w panelu: ${adminUrl}`;
      const teamHtml = `
          <p><strong>Nowy wniosek z landing page.</strong></p>
          <ul>
            <li><strong>Klient:</strong> ${fullName}</li>
            <li><strong>E-mail:</strong> <a href="mailto:${data.email}">${data.email}</a></li>
            <li><strong>Telefon:</strong> ${data.phone}</li>
            <li><strong>Kwota:</strong> ${fmtPLN(data.loan_amount)}</li>
            <li><strong>Okres:</strong> ${data.preferred_period_months} mies.</li>
            <li><strong>Zabezpieczenie:</strong> ${propertyLabel}</li>
            <li><strong>KW:</strong> ${data.land_register_number ?? "—"}</li>
            <li><strong>Załączniki:</strong> ${(data.photos ?? []).length}</li>
          </ul>
          <p><a href="${adminUrl}" style="display:inline-block;padding:10px 18px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">Otwórz wniosek w panelu →</a></p>
          <p style="color:#475569;font-size:12px">${adminUrl}</p>
        `;
      await sendResendEmail({
        to: teamTo,
        subject: teamSubject,
        text: teamText,
        html: teamHtml,
        replyTo: data.email,
        noBranding: true,
      });
    } catch (err) {
      console.error("[landing-application] notification emails failed", err);
    }
  })();

  return { ok: true as const, id: loan.id, token_hash: tokenHash, email: data.email };
}

export const submitLandingLoanApplication = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SubmitSchema.parse(input))
  .handler(async ({ data }) => submitApplicationCore(data));

// Utworzenie oferty przez pośrednika — wymaga zalogowania. Autor (autorstwo
// niezmienne) i przypisany operator pochodzą z sesji, nigdy z przeglądarki.
export const submitBrokerLoanApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SubmitSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { assertBrokerOrStaff } = await import("@/lib/access/guards.server");
    await assertBrokerOrStaff(context.userId);
    return submitApplicationCore(
      { ...data, source: data.source ?? "posrednik_panel" },
      { userId: context.userId },
    );
  });

export type RecentLoanApplicationItem = {
  id: string;
  first_name: string;
  property_type: string | null;
  loan_amount: number;
  preferred_period_months: number;
  annual_investor_rate: number;
  investor_profit: number;
  city: string | null;
  created_at: string;
};

export const getRecentLoanApplications = createServerFn({ method: "GET" }).handler(
  async (): Promise<RecentLoanApplicationItem[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { computeLoanFigures } = await import("@/lib/loan-math");
    const { data } = await supabaseAdmin
      .from("loan_applications")
      .select(
        "id,loan_amount,preferred_period_months,created_at,annual_investor_rate,max_monthly_payment,clients!inner(first_name),properties(property_type,city)",
      )
      .gte("loan_amount", 20_000)
      .not("annual_investor_rate", "is", null)
      .order("created_at", { ascending: false })
      .limit(60);
    const rows = (data ?? []) as any[];
    const out: RecentLoanApplicationItem[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      const fn: string = (r.clients?.first_name ?? "").toString().trim();
      if (!fn) continue;
      const rate = Number(r.annual_investor_rate);
      if (!rate || !Number.isFinite(rate)) continue;
      const key = `${fn.toLowerCase()}-${r.loan_amount}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const amount = Number(r.loan_amount);
      const months = Number(r.preferred_period_months);
      const figures = computeLoanFigures({
        amount,
        annualRatePercent: rate,
        months,
        maxPayment: r.max_monthly_payment ? Number(r.max_monthly_payment) : undefined,
      });
      out.push({
        id: r.id,
        first_name: fn,
        property_type: r.properties?.[0]?.property_type ?? null,
        loan_amount: amount,
        preferred_period_months: months,
        annual_investor_rate: rate,
        investor_profit: Math.round(figures.investorCompensation),
        city: r.properties?.[0]?.city ?? null,
        created_at: r.created_at,
      });
      if (out.length >= 12) break;
    }
    return out;
  },
);
