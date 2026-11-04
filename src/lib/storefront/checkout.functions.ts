import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateKwNumber, compactKwNumber } from "@/lib/kw";
import { getStoreLegal, storeLegalSha, type StoreLegalCode } from "./legal";
import {
  ACADEMY_COURSE_PRICE_PLN,
  ACADEMY_MODULE_PRICE_PLN,
  MANAGEMENT_CART_ID,
  MANAGEMENT_ITEM_PREFIX,
  MANAGEMENT_MODULE_DAYS,
  MANAGEMENT_MODULE_PRICE_PLN,
  academyModuleById,
  academyModuleForLesson,
} from "./products";

const db = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
const UUID = z.string().uuid();
const cartSchema = z.array(z.object({
  kind: z.enum(["lesson", "document", "course", "kw"]),
  id: z.string().min(1).max(100),
})).min(1).max(50);

type Item = { kind: "lesson" | "document" | "course" | "kw"; id: string; title: string; amount_grosz: number };
type Buyer = { name: string; email: string };

async function priceItems(raw: z.infer<typeof cartSchema>): Promise<Item[]> {
  const admin = await db();
  const keys = new Set<string>();
  const items: Item[] = [];
  for (const i of raw) {
    let id = i.id;
    let title = "";
    let price = 0;
    if (i.kind === "course") {
      const mod = academyModuleById(id);
      if (id === "academy") {
        price = ACADEMY_COURSE_PRICE_PLN * 100;
        title = "Pełna Akademia Inwestora";
      } else if (mod) {
        price = ACADEMY_MODULE_PRICE_PLN * 100;
        title = `Akademia Inwestora — Moduł ${mod.number}: ${mod.title}`;
      } else if (id === MANAGEMENT_CART_ID) {
        // Każda tura 30 dni to osobne uprawnienie (unikalny item_id) — okres
        // liczy managementActiveUntil z paid_at opłaconych zamówień.
        if (items.some((x) => x.id.startsWith(MANAGEMENT_ITEM_PREFIX))) continue;
        id = MANAGEMENT_ITEM_PREFIX + crypto.randomUUID();
        price = MANAGEMENT_MODULE_PRICE_PLN * 100;
        title = `Centrum Zarządzania (dokumenty, CRM, e-podpis, compliance) — ${MANAGEMENT_MODULE_DAYS} dni`;
      } else {
        throw new Error("Nieznany pakiet.");
      }
    } else if (i.kind === "kw") {
      const kw = validateKwNumber(id);
      if (!kw.ok) throw new Error(kw.message);
      id = kw.compact;
      title = "Raport księgi wieczystej " + kw.value;
      price = 9900;
    } else if (i.kind === "lesson") {
      if (!UUID.safeParse(id).success) throw new Error("Nieprawidłowy identyfikator lekcji.");
      const { data, error } = await admin.from("training_videos")
        .select("title,sort_order,is_published,free_lesson")
        .eq("id", id).maybeSingle();
      if (error || !data?.is_published) throw new Error("Lekcja nie jest dostępna.");
      if (data.free_lesson) throw new Error("Ta lekcja jest bezpłatna.");
      title = data.title;
      price = 14900;
    } else {
      // Wycofano wyłącznie NOWE transakcje per dokument; historyczne
      // uprawnienia i pobrania działają w pozostałych funkcjach.
      throw new Error("Pojedyncze dokumenty nie są już sprzedawane. Przejdź do generatora dokumentów.");

    }
    const key = i.kind + ":" + id;
    if (keys.has(key)) continue;
    keys.add(key);
    items.push({ kind: i.kind, id, title, amount_grosz: price });
  }
  const hasAcademy = items.some((i) => i.kind === "course" && i.id === "academy");
  if (hasAcademy && items.some((i) => i.kind === "course" && academyModuleById(i.id))) {
    throw new Error("Wybierz pakiet Akademii albo pojedyncze moduły, nie oba warianty.");
  }
  if (hasAcademy && items.some((i) => i.kind === "lesson")) {
    throw new Error("Wybierz pakiet Akademii albo pojedyncze lekcje, nie oba warianty.");
  }
  if (!items.length) throw new Error("Koszyk jest pusty.");
  return items;
}

/** Reads legal text for display, not an acceptance action. */
export const getStoreLegalTexts = createServerFn({ method: "GET" }).handler(async () => {
  const terms = getStoreLegal("store_terms"), dpa = getStoreLegal("store_dpa");
  return {
    terms: { ...terms, sha256: await storeLegalSha("store_terms") },
    dpa: { ...dpa, sha256: await storeLegalSha("store_dpa") },
  };
});

async function recordAcceptance(admin: any, userId: string, code: StoreLegalCode, statements: Record<string, boolean>) {
  const document = getStoreLegal(code);
  const sha256 = await storeLegalSha(code);
  const request = getRequest();
  // Only trusted proxy forwarded address; do not record potentially malformed untrusted x-forwarded-for in inet.
  const ip = request?.headers.get("cf-connecting-ip") || null;
  const ua = request?.headers.get("user-agent")?.slice(0, 400) || null;
  const { error } = await admin.from("store_legal_acceptances").upsert({
    user_id: userId, document_code: document.code,
    document_version: document.version,
    document_sha256: sha256,
    document_text: document.text,
    statements, auth_method: "authenticated_session", ip,
    user_agent: ua,
  }, { onConflict: "user_id,document_code,document_sha256", ignoreDuplicates: true });
  if (error) throw new Error("Nie udało się zapisać akceptacji umowy: " + error.message);
}

export const acceptStoreDpa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ accepted: z.literal(true) }).parse(i))
  .handler(async ({ context }) => {
    await recordAcceptance(await db(), context.userId, "store_dpa", { accepted: true });
    return { ok: true };
  });

export const createStoreCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    cart: cartSchema,
    buyerName: z.string().trim().min(3).max(200),
    terms: z.literal(true),
    immediate: z.literal(true),
    withdrawalAcknowledgement: z.literal(true),
    dpa: z.boolean().default(false),
    kwPurpose: z.boolean().default(false),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await db();
    const { data: auth, error: authErr } = await admin.auth.admin.getUserById(context.userId);
    const email = String(auth?.user?.email ?? "").trim();
    if (authErr || !email || !auth?.user?.email_confirmed_at) {
      throw new Error("Do zakupu wymagany jest zweryfikowany adres e-mail konta.");
    }
    const items = await priceItems(data.cart);
    if (items.some((i) => i.id.startsWith(MANAGEMENT_ITEM_PREFIX))) {
      const { getUserRoles, isInternalStaff } = await import("@/lib/access/guards.server");
      const roles = await getUserRoles(context.userId);
      if (!roles.includes("inwestor") && !(await isInternalStaff(context.userId))) {
        throw new Error("Centrum Zarządzania działa w panelu inwestora — zaloguj się na konto inwestora albo załóż je przed zakupem.");
      }
    }
    const needsDpa = items.some(i => i.kind === "document");
    if (items.some(i => i.kind === "kw") && !data.kwPurpose) {
      throw new Error("Potwierdź uprawniony cel analizy numeru KW.");
    }
    if (needsDpa && !data.dpa) throw new Error("Przed kupnem generatora zaakceptuj umowę powierzenia danych.");
    await recordAcceptance(admin, context.userId, "store_terms", {
      accepted: true, immediate: true, withdrawalAcknowledgement: true,
      kwPurpose: items.some(i => i.kind === "kw") ? data.kwPurpose : false,
    });
    if (needsDpa) await recordAcceptance(admin, context.userId, "store_dpa", { accepted: true });
    const total = items.reduce((n, i) => n + i.amount_grosz, 0);
    const legalSnapshots = [{
      code: "store_terms",
      version: getStoreLegal("store_terms").version,
      sha256: await storeLegalSha("store_terms"),
    }, ...(needsDpa ? [{
      code: "store_dpa", version: getStoreLegal("store_dpa").version,
      sha256: await storeLegalSha("store_dpa"),
    }] : [])];
    const buyer: Buyer = { name: data.buyerName, email };
    const { data: order, error } = await admin.from("store_orders")
      .insert({
        user_id: context.userId, status: "created",
        items: items.map(i => ({ ...i })),
        amount_grosz: total, currency: "PLN",
        buyer, legal_snapshots: legalSnapshots,
        immediate_digital_delivery: true,
      }).select("id").single();
    if (error || !order?.id) throw new Error("Nie udało się zapisać zamówienia.");
    const { resolveAppBaseUrl } = await import("@/lib/access/urls.server");
    const { createTpayTransaction } = await import("@/lib/tpay.server");
    const base = resolveAppBaseUrl();
    try {
      const tx = await createTpayTransaction({
        amount: total / 100,
        description: "Finance You — produkty cyfrowe",
        email, name: data.buyerName, crc: "STORE:" + order.id,
        notifyUrl: base + "/api/public/payments/tpay-webhook",
        successUrl: base + "/sklep/moje-zakupy?tpay=success",
        errorUrl: base + "/sklep/moje-zakupy?tpay=error",
      });
      const { error: updateErr } = await admin.from("store_orders")
        .update({ provider_transaction_id: tx.transactionId, status: "pending" })
        .eq("id", order.id).eq("status", "created");
      if (updateErr) throw updateErr;
      return { ok: true as const, orderId: String(order.id), paymentUrl: tx.transactionPaymentUrl };
    } catch (err) {
      await admin.from("store_orders").update({ status: "failed" })
        .eq("id", order.id).eq("status", "created");
      throw new Error("Nie udało się uruchomić płatności Tpay. Zamówienie nie zostało opłacone.");
    }
  });

export const getMyStorePurchases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await db();
    const [o, e, dpa] = await Promise.all([
      admin.from("store_orders").select("id,status,amount_grosz,created_at,items")
        .eq("user_id", context.userId).order("created_at", { ascending: false }).limit(50),
      admin.from("store_entitlements").select("item_kind,item_id,created_at")
        .eq("user_id", context.userId).order("created_at", { ascending: false }).limit(500),
      admin.from("store_legal_acceptances").select("id")
        .eq("user_id",context.userId).eq("document_code","store_dpa")
        .eq("document_sha256",await storeLegalSha("store_dpa")).limit(1),
    ]);
    if (o.error || e.error || dpa.error) throw new Error("Nie można odczytać zakupów.");
    const { isInternalStaff } = await import("@/lib/access/guards.server");
    const { managementModuleActiveUntilFor } = await import("./management.server");
    const managementUntil = await managementModuleActiveUntilFor(context.userId);
    return {
      orders: o.data ?? [], entitlements: e.data ?? [],
      dpaAccepted: Boolean(dpa.data?.length) || await isInternalStaff(context.userId),
      managementActiveUntil: managementUntil ? managementUntil.toISOString() : null,
    };
  });

async function assertEntitled(admin: any, userId: string, kind: "lesson"|"document"|"kw", itemId: string) {
  const match = await admin.from("store_entitlements").select("id")
    .eq("user_id", userId).eq("item_kind", kind).eq("item_id", itemId).maybeSingle();
  if (match.data) return;
  if (kind === "lesson") {
    const course = await admin.from("store_entitlements").select("id")
      .eq("user_id", userId).eq("item_kind", "course").eq("item_id", "academy").maybeSingle();
    if (course.data) return;
    // Moduł Akademii obejmuje lekcje z zakresu numerów (ta sama kolejność co katalog).
    const { data: list } = await admin.from("training_videos").select("id")
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    const index = ((list ?? []) as { id: string }[]).findIndex((l) => l.id === itemId);
    const mod = index >= 0 ? academyModuleForLesson(index + 1) : null;
    if (mod) {
      const owned = await admin.from("store_entitlements").select("id")
        .eq("user_id", userId).eq("item_kind", "course").eq("item_id", mod.id).maybeSingle();
      if (owned.data) return;
    }
  }
  const { isInternalStaff, investorHasFullAccess } = await import("@/lib/access/guards.server");
  if (await isInternalStaff(userId) || (kind !== "kw" && await investorHasFullAccess(userId))) return;
  throw new Error("Brak opłaconego dostępu do tego produktu.");
}

export const getPurchasedLessonUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: UUID }).parse(i))
  .handler(async ({ data, context }) => {
    const admin = await db();
    const { data: lesson } = await admin.from("training_videos")
      .select("id,title,file_path,external_url,free_lesson,is_published")
      .eq("id", data.id).maybeSingle();
    if (!lesson?.is_published) throw new Error("Lekcja nie jest dostępna.");
    if (!lesson.free_lesson) await assertEntitled(admin,context.userId,"lesson",data.id);
    if (lesson.external_url) return { title: lesson.title, url: lesson.external_url, external: true };
    if (!lesson.file_path) throw new Error("Brak pliku lekcji.");
    const { data: signed, error } = await admin.storage.from("training-videos")
      .createSignedUrl(lesson.file_path, 600);
    if (error || !signed) throw new Error("Nie udało się udostępnić filmu.");
    return { title: lesson.title, url: signed.signedUrl, external: false };
  });

export const getPurchasedDocumentTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: UUID }).parse(i))
  .handler(async ({ data, context }) => {
    const admin = await db();
    await assertEntitled(admin,context.userId,"document",data.id);
    const { data: accepted } = await admin.from("store_legal_acceptances").select("id")
      .eq("user_id", context.userId).eq("document_code","store_dpa")
      .eq("document_sha256",await storeLegalSha("store_dpa")).maybeSingle();
    if (!accepted) throw new Error("Zanim wygenerujesz dokument, zaakceptuj umowę powierzenia.");
    const { data: tpl } = await admin.from("document_templates")
      .select("id,name,placeholders").eq("id",data.id).maybeSingle();
    if (!tpl) throw new Error("Dokument jest niedostępny.");
    return tpl as { id: string; name: string; placeholders: string[] };
  });

export async function assertStoreDocumentGeneration(userId: string, templateId: string) {
  const { isInternalStaff } = await import("@/lib/access/guards.server");
  if (await isInternalStaff(userId)) return;
  const admin = await db();
  await assertEntitled(admin,userId,"document",templateId);
  const { data: accepted } = await admin.from("store_legal_acceptances").select("id")
    .eq("user_id", userId).eq("document_code","store_dpa")
    .eq("document_sha256",await storeLegalSha("store_dpa")).maybeSingle();
  if (!accepted) throw new Error("Wymagana jest aktualna umowa powierzenia danych.");
}

/** User-scoped check for a specific paid KW. No public report access. */
export async function assertStoreKwAccess(userId: string, compact: string) {
  await assertEntitled(await db(), userId, "kw", compact);
}

/** Art.28 document-processing agreement, independent of billing entitlement. */
export async function assertCurrentStoreDpaAccepted(userId: string) {
  const { isInternalStaff } = await import("@/lib/access/guards.server");
  if (await isInternalStaff(userId)) return; // Company staff processes for the controller, not as an external principal.
  const admin = await db();
  const { data, error } = await admin.from("store_legal_acceptances")
    .select("id").eq("user_id", userId)
    .eq("document_code", "store_dpa")
    .eq("document_sha256", await storeLegalSha("store_dpa")).maybeSingle();
  if (error || !data) throw new Error("Przed przetwarzaniem danych w kreatorze zaakceptuj aktualną umowę powierzenia danych.");
}
