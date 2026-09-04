// Pakiet umów inwestora (FY-LEGAL-2026-09-04) — Etap U1.
//
// Sekwencja z pliku 00 paczki prawnika: (1) konto i identyfikacja →
// (2) informacje przedumowne dla Konsumenta na trwałym nośniku →
// (3) Umowa ramowa v5 → (4) NDA v5 → (5) Umowa RODO v4 (Moduł A) →
// (7) Formularz Zlecenia (Zał. 7). Bez kompletu 1–5 formularz Zlecenia
// jest nieaktywny. Każda akceptacja: wersja + skrót SHA-256 dokumentu,
// konto, czas, metoda uwierzytelnienia, treść oświadczeń, IP i urządzenie
// (§ 4 ust. 2 Umowy ramowej; rekord wg Załącznika nr 5).
//
// Zasady konsumenckie (§ 15 ust. 7): ŻADNYCH domyślnie zaznaczonych pól —
// UI startuje ze wszystkimi checkboxami pustymi; egzekwujemy też serwerowo.
// Pakiet jest UŚPIONY (legal_documents.active=false) do przeglądu kancelarii.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const loose = (c: unknown) => c as any;

/** Kolejność akceptacji (sort_order z rejestru): ramowa → NDA → RODO. */
const ACCEPT_ORDER = ["umowa_ramowa", "nda", "rodo"] as const;

function requestMeta(): { ip: string | null; userAgent: string | null } {
  const request = getRequest();
  return {
    ip:
      request?.headers.get("cf-connecting-ip") ||
      request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      null,
    userAgent: request?.headers.get("user-agent") ?? null,
  };
}

async function myInvestorRow(supabaseAdmin: any, userId: string) {
  const { data } = await supabaseAdmin
    .from("investors")
    .select(
      "id, user_id, first_name, last_name, company_name, email, phone, pesel, nip, krs, regon, address, street, city, postal_code, legal_form, representative_first_name, representative_last_name, representative_role, entity_variant, is_consumer",
    )
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

/** Stan pakietu dla zalogowanego inwestora — jedno źródło dla kreatora. */
export const getMyLegalPackState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: docs }, { data: acceptances }, { data: deliveries }, { data: orders }, investor] =
      await Promise.all([
        loose(supabaseAdmin)
          .from("legal_documents")
          .select("code, package_id, version, title, sort_order, sha256, active, docx_filename")
          .order("sort_order"),
        loose(supabaseAdmin)
          .from("investor_agreement_acceptances")
          .select("document_code, version, sha256, accepted_at")
          .eq("user_id", userId),
        loose(supabaseAdmin)
          .from("legal_deliveries")
          .select("id, document_codes, email, message_id, purpose, delivered_at")
          .eq("user_id", userId)
          .order("delivered_at", { ascending: false })
          .limit(5),
        loose(supabaseAdmin)
          .from("investor_orders")
          .select(
            "id, order_seq, amount_pln, max_period_months, min_annual_yield, validity_days, status, consumer_choice, submitted_at, decided_at, expires_at, rejection_reason",
          )
          .eq("user_id", userId)
          .order("submitted_at", { ascending: false })
          .limit(20),
        myInvestorRow(supabaseAdmin, userId),
      ]);

    const activeDocs = (docs ?? []).filter((d: any) => d.active);
    const acceptedSet = new Set(
      (acceptances ?? []).map((a: any) => `${a.document_code}:${a.version}:${a.sha256}`),
    );
    const docsState = (docs ?? []).map((d: any) => ({
      ...d,
      accepted: acceptedSet.has(`${d.code}:${d.version}:${d.sha256}`),
      accepted_at:
        (acceptances ?? []).find(
          (a: any) => a.document_code === d.code && a.version === d.version,
        )?.accepted_at ?? null,
    }));

    // Weryfikacja Didit samego inwestora (komparycja z danymi potwierdzonymi).
    const { extractDiditPersonalData } = await import("@/lib/didit.server");
    const { data: didit } = await loose(supabaseAdmin)
      .from("didit_verifications")
      .select("status, decision, decided_at, verification_url")
      .eq("vendor_data", `investor:${userId}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const packActive = activeDocs.length > 0;
    const packComplete =
      packActive && activeDocs.every((d: any) => acceptedSet.has(`${d.code}:${d.version}:${d.sha256}`));
    const hasDelivery = (deliveries ?? []).length > 0;

    // Leniwe wygaszanie: przyjęte zlecenia po terminie ważności.
    const now = Date.now();
    const staleIds = (orders ?? [])
      .filter((o: any) => o.status === "przyjete" && o.expires_at && new Date(o.expires_at).getTime() < now)
      .map((o: any) => o.id);
    if (staleIds.length > 0) {
      await loose(supabaseAdmin)
        .from("investor_orders")
        .update({ status: "wygasle" })
        .in("id", staleIds);
    }

    return {
      packActive,
      packComplete,
      investor,
      documents: docsState,
      deliveries: deliveries ?? [],
      hasDelivery,
      orders: (orders ?? []).map((o: any) =>
        staleIds.includes(o.id) ? { ...o, status: "wygasle" } : o,
      ),
      didit: didit
        ? {
            status: didit.status as string,
            url: didit.verification_url as string | null,
            personal: didit.status === "Approved" ? extractDiditPersonalData(didit.decision) : null,
          }
        : null,
    };
  });

/** Pełna treść dokumentu do kreatora (przewijana przed akceptacją). */
export const getLegalDocumentText = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().min(1).max(40) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: doc, error } = await loose(supabaseAdmin)
      .from("legal_documents")
      .select("code, title, version, package_id, sha256, content_text")
      .eq("code", data.code)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("Nie znaleziono dokumentu");
    return doc;
  });

/** Krok 1: identyfikacja — wariant strony i status Konsumenta. */
export const saveLegalIdentification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        entityVariant: z.enum(["osoba_fizyczna", "jdg", "osoba_prawna"]),
        isConsumer: z.boolean(),
      })
      .refine((v) => !(v.entityVariant === "osoba_prawna" && v.isConsumer), {
        message: "Osoba prawna nie może być Konsumentem",
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const investor = await myInvestorRow(supabaseAdmin, userId);
    if (!investor) throw new Error("Brak profilu inwestora — uzupełnij profil.");
    const { error } = await loose(supabaseAdmin)
      .from("investors")
      .update({ entity_variant: data.entityVariant, is_consumer: data.isConsumer })
      .eq("id", investor.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Krok 2: doręczenie pakietu na trwałym nośniku (e-mail z kanonicznymi
 * plikami DOCX). Dla Konsumenta obowiązkowe PRZED akceptacją Umowy ramowej
 * (§ 15 ust. 1); dla pozostałych — kopia dokumentów.
 */
export const deliverLegalPack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const investor = await myInvestorRow(supabaseAdmin, userId);
    const email = investor?.email;
    if (!email) throw new Error("Brak adresu e-mail na profilu inwestora.");

    const { data: docs, error } = await loose(supabaseAdmin)
      .from("legal_documents")
      .select("code, title, version, docx_base64, docx_filename")
      .eq("active", true)
      .order("sort_order");
    if (error) throw new Error(error.message);
    if (!docs?.length) throw new Error("Pakiet dokumentów nie jest jeszcze aktywny.");

    const { sendResendEmail } = await import("@/lib/resend-send.server");
    const text = [
      "Dzień dobry,",
      "",
      "w załączeniu przekazujemy na trwałym nośniku pakiet dokumentów Finance You:",
      ...docs.map((d: any) => `- ${d.title} (${d.version})`),
      "",
      "Umowa ramowa zawiera informację przedumowną dla Konsumenta (Załącznik nr 3),",
      "wzór oświadczenia o odstąpieniu (Załącznik nr 4) oraz Formularz Zlecenia (Załącznik nr 7).",
      "Akceptacji dokonasz w panelu inwestora: /inwestor/umowy.",
      "",
      "Zespół Finance You",
    ].join("\n");

    const sent = await sendResendEmail({
      to: email,
      subject: "Finance You — pakiet dokumentów inwestora (trwały nośnik)",
      text,
      attachments: docs.map((d: any) => ({
        filename: d.docx_filename,
        content: d.docx_base64,
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      })),
    });
    if (!sent.ok) throw new Error(sent.error ?? "Nie udało się wysłać pakietu.");

    const { error: insErr } = await loose(supabaseAdmin).from("legal_deliveries").insert({
      user_id: userId,
      document_codes: docs.map((d: any) => d.code),
      email,
      message_id: sent.id ?? null,
      purpose: "informacja_przedumowna",
    });
    if (insErr) throw new Error(insErr.message);
    return { ok: true, messageId: sent.id ?? null, email };
  });

/** Kroki 3–5: akceptacja dokumentu w formie dokumentowej. */
export const acceptLegalDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        code: z.enum(["umowa_ramowa", "nda", "rodo"]),
        // Checkbox potwierdzenia przeczytania — UI startuje z FALSE (§ 15 ust. 7).
        confirmed: z.literal(true),
        statements: z.record(z.string(), z.boolean()).default({}),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const investor = await myInvestorRow(supabaseAdmin, userId);
    if (!investor?.entity_variant || investor.is_consumer == null) {
      throw new Error("Najpierw uzupełnij krok identyfikacji (wariant strony i status Konsumenta).");
    }

    const { data: doc } = await loose(supabaseAdmin)
      .from("legal_documents")
      .select("code, title, version, sha256, active, sort_order")
      .eq("code", data.code)
      .maybeSingle();
    if (!doc?.active) throw new Error("Dokument nie jest aktywny.");

    // Sekwencja: wcześniejsze dokumenty pakietu muszą być już zaakceptowane.
    const idx = ACCEPT_ORDER.indexOf(data.code);
    if (idx > 0) {
      const { data: prevDocs } = await loose(supabaseAdmin)
        .from("legal_documents")
        .select("code, version, sha256")
        .in("code", ACCEPT_ORDER.slice(0, idx) as unknown as string[])
        .eq("active", true);
      for (const prev of prevDocs ?? []) {
        const { data: prevAcc } = await loose(supabaseAdmin)
          .from("investor_agreement_acceptances")
          .select("id")
          .eq("user_id", userId)
          .eq("document_code", prev.code)
          .eq("version", prev.version)
          .maybeSingle();
        if (!prevAcc) throw new Error("Dokumenty akceptuje się w kolejności: Umowa ramowa → NDA → RODO.");
      }
    }

    // Konsument: informacje przedumowne doręczone PRZED akceptacją Umowy ramowej.
    let deliveryMessageId: string | null = null;
    if (data.code === "umowa_ramowa" && investor.is_consumer) {
      const { data: delivery } = await loose(supabaseAdmin)
        .from("legal_deliveries")
        .select("message_id, delivered_at")
        .eq("user_id", userId)
        .order("delivered_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!delivery) {
        throw new Error(
          "Jako Konsument musisz najpierw otrzymać informacje przedumowne na trwałym nośniku (krok „Wyślij pakiet na e-mail”).",
        );
      }
      deliveryMessageId = delivery.message_id ?? null;
    }

    // Snapshot danych komparycji + dane potwierdzone Didit (jeśli są).
    const { extractDiditPersonalData } = await import("@/lib/didit.server");
    const { data: didit } = await loose(supabaseAdmin)
      .from("didit_verifications")
      .select("session_id, status, decision")
      .eq("vendor_data", `investor:${userId}`)
      .eq("status", "Approved")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { ip, userAgent } = requestMeta();
    const snapshot = {
      investor: {
        first_name: investor.first_name,
        last_name: investor.last_name,
        company_name: investor.company_name,
        email: investor.email,
        phone: investor.phone,
        pesel: investor.pesel,
        nip: investor.nip,
        krs: investor.krs,
        regon: investor.regon,
        address: investor.address ?? investor.street,
        city: investor.city,
        postal_code: investor.postal_code,
        representative: [investor.representative_first_name, investor.representative_last_name]
          .filter(Boolean)
          .join(" "),
        entity_variant: investor.entity_variant,
        is_consumer: investor.is_consumer,
      },
      didit: didit ? extractDiditPersonalData(didit.decision) : null,
    };

    const { error: insErr } = await loose(supabaseAdmin)
      .from("investor_agreement_acceptances")
      .insert({
        user_id: userId,
        document_code: doc.code,
        version: doc.version,
        sha256: doc.sha256,
        entity_variant: investor.entity_variant,
        is_consumer: investor.is_consumer,
        personal_data_snapshot: snapshot,
        statements: data.statements,
        auth_method: "konto_imienne",
        ip,
        user_agent: userAgent,
        delivery_message_id: deliveryMessageId,
        didit_session_id: didit?.session_id ?? null,
      });
    if (insErr) {
      if (String(insErr.message).includes("duplicate")) return { ok: true, already: true };
      throw new Error(insErr.message);
    }

    // Potwierdzenie na trwałym nośniku (kopia protokołu skróconego).
    if (investor.email) {
      try {
        const { sendResendEmail } = await import("@/lib/resend-send.server");
        await sendResendEmail({
          to: investor.email,
          subject: `Potwierdzenie akceptacji: ${doc.title} (${doc.version})`,
          text:
            `Potwierdzamy akceptację dokumentu w formie dokumentowej.\n\n` +
            `Dokument: ${doc.title}\nWersja: ${doc.version}\nSHA-256: ${doc.sha256}\n` +
            `Data i czas (UTC): ${new Date().toISOString()}\nMetoda uwierzytelnienia: konto imienne\n\n` +
            `Pełny protokół akceptacji jest dostępny w systemie Finance You.`,
        });
      } catch (e) {
        console.error("[legal-pack] confirmation email failed", e);
      }
    }
    return { ok: true };
  });

const ORDER_STATEMENTS = [
  "zlecenie_na_podstawie_umowy",
  "samodzielna_weryfikacja_przedsiebiorcy_i_celu",
  "projekty_tylko_w_wykonaniu_zlecenia",
] as const;

/** Krok 7: Formularz Zlecenia (Załącznik nr 7). */
export const submitInvestorOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        amountPln: z.number().positive().max(100_000_000),
        maxPeriodMonths: z.number().int().min(1).max(360),
        minAnnualYield: z.number().min(0).max(100),
        validityDays: z.union([z.literal(30), z.literal(60), z.literal(90)]),
        statements: z.object({
          zlecenie_na_podstawie_umowy: z.literal(true),
          samodzielna_weryfikacja_przedsiebiorcy_i_celu: z.literal(true),
          projekty_tylko_w_wykonaniu_zlecenia: z.literal(true),
        }),
        consumerChoice: z
          .enum(["nie_dotyczy", "start_po_14_dniach", "zadanie_startu_przed_14"])
          .default("nie_dotyczy"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Bramka: komplet kroków 1–5.
    const { data: complete } = await loose(supabaseAdmin).rpc("investor_legal_pack_complete", {
      _user_id: userId,
    });
    if (!complete) {
      throw new Error("Formularz Zlecenia jest nieaktywny — najpierw zaakceptuj komplet dokumentów pakietu.");
    }

    const investor = await myInvestorRow(supabaseAdmin, userId);
    if (investor?.is_consumer && data.consumerChoice === "nie_dotyczy") {
      throw new Error(
        "Jako Konsument wybierz: rozpoczęcie po 14 dniach albo żądanie rozpoczęcia przed upływem terminu odstąpienia.",
      );
    }

    const { ip, userAgent } = requestMeta();
    const { data: inserted, error } = await loose(supabaseAdmin)
      .from("investor_orders")
      .insert({
        user_id: userId,
        amount_pln: data.amountPln,
        max_period_months: data.maxPeriodMonths,
        min_annual_yield: data.minAnnualYield,
        validity_days: data.validityDays,
        statements: { ...data.statements, ip, user_agent: userAgent },
        consumer_choice: investor?.is_consumer ? data.consumerChoice : "nie_dotyczy",
      })
      .select("id, order_seq")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, orderId: inserted.id, orderNo: `FY-Z-${inserted.order_seq}` };
  });

/** Cofnięcie własnego Zlecenia (status „cofnięte"). */
export const withdrawInvestorOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await loose(supabaseAdmin)
      .from("investor_orders")
      .update({ status: "cofniete" })
      .eq("id", data.orderId)
      .eq("user_id", context.userId)
      .in("status", ["zlozone", "przyjete"]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Panel administratora ────────────────────────────────────────────────────

async function assertAdmin(supabase: any, userId: string) {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const ok = (roles ?? []).some((r: { role: string }) => r.role === "administrator");
  if (!ok) throw new Error("Brak uprawnień (wymagana rola administrator).");
}

export const getLegalPackAdminState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: docs }, { data: acceptances }, { data: orders }] = await Promise.all([
      loose(supabaseAdmin)
        .from("legal_documents")
        .select("code, package_id, version, title, sort_order, sha256, active, updated_at")
        .order("sort_order"),
      loose(supabaseAdmin)
        .from("investor_agreement_acceptances")
        .select(
          "id, user_id, document_code, version, sha256, entity_variant, is_consumer, accepted_at, ip, auth_method, personal_data_snapshot",
        )
        .order("accepted_at", { ascending: false })
        .limit(200),
      loose(supabaseAdmin)
        .from("investor_orders")
        .select(
          "id, order_seq, user_id, amount_pln, max_period_months, min_annual_yield, validity_days, status, consumer_choice, submitted_at, decided_at, expires_at, rejection_reason",
        )
        .order("submitted_at", { ascending: false })
        .limit(100),
    ]);
    return { documents: docs ?? [], acceptances: acceptances ?? [], orders: orders ?? [] };
  });

/** Aktywacja/uśpienie pakietu po przeglądzie kancelarii. */
export const setLegalPackActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await loose(supabaseAdmin)
      .from("legal_documents")
      .update({ active: data.active, updated_at: new Date().toISOString() })
      .in("code", ACCEPT_ORDER as unknown as string[]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Decyzja o Zleceniu: przyjęcie (limit 3 przyjętych) albo odmowa (SLA 2 dni rob.). */
export const decideInvestorOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        orderId: z.string().uuid(),
        decision: z.enum(["przyjmij", "odmow"]),
        reason: z.string().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order } = await loose(supabaseAdmin)
      .from("investor_orders")
      .select("id, user_id, status, validity_days")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) throw new Error("Nie znaleziono Zlecenia");
    if (order.status !== "zlozone") throw new Error(`Zlecenie ma status ${order.status}`);

    if (data.decision === "przyjmij") {
      // § 5 ust. 1: nie więcej niż trzy przyjęte Zlecenia jednocześnie.
      const { count } = await loose(supabaseAdmin)
        .from("investor_orders")
        .select("id", { count: "exact", head: true })
        .eq("user_id", order.user_id)
        .eq("status", "przyjete");
      if ((count ?? 0) >= 3) {
        throw new Error("Inwestor ma już trzy przyjęte Zlecenia (limit z § 5 ust. 1 Umowy).");
      }
      const now = new Date();
      const expires = new Date(now.getTime() + order.validity_days * 24 * 3600 * 1000);
      const { error } = await loose(supabaseAdmin)
        .from("investor_orders")
        .update({
          status: "przyjete",
          decided_at: now.toISOString(),
          decided_by: context.userId,
          expires_at: expires.toISOString(),
        })
        .eq("id", order.id)
        .eq("status", "zlozone");
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    const { error } = await loose(supabaseAdmin)
      .from("investor_orders")
      .update({
        status: "odmowa",
        decided_at: new Date().toISOString(),
        decided_by: context.userId,
        rejection_reason: data.reason ?? null,
      })
      .eq("id", order.id)
      .eq("status", "zlozone");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
