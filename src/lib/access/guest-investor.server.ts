// Konto inwestora z danych płatności bez konta (checkout /abonament-inwestora).
//
// Wywoływane przez webhook Tpay PO potwierdzeniu wpłaty, a PRZED przyznaniem
// dostępu: zakłada (albo odnajduje po e-mailu) konto auth, nadaje rolę
// inwestora, zakłada rekord w investors i przypina konto do płatności.
// Idempotentne — ponowione powiadomienie Tpay niczego nie dubluje.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const db = supabaseAdmin as any;

/** „Jan Kowalski" → { first: "Jan", last: "Kowalski" }; dla firmy bez podziału. */
export function splitBuyerName(
  buyerType: string,
  name: string | null,
): { firstName: string | null; lastName: string | null } {
  const clean = (name ?? "").trim().replace(/\s+/g, " ");
  if (!clean || buyerType === "company") return { firstName: null, lastName: null };
  const idx = clean.indexOf(" ");
  if (idx < 0) return { firstName: clean, lastName: null };
  return { firstName: clean.slice(0, idx), lastName: clean.slice(idx + 1) };
}

/** Zwraca user_id właściciela płatności — zakłada konto inwestora, jeśli brak.
 *  Rzuca wyjątek, gdy konta nie da się założyć (webhook odpowie FALSE i Tpay
 *  ponowi powiadomienie — wpłata nie przepadnie). */
export async function ensureInvestorAccountForPayment(paymentId: string): Promise<string> {
  const { data: payment } = await db
    .from("access_payments")
    .select("id,user_id,audience,buyer_type,buyer_name,buyer_email")
    .eq("id", paymentId)
    .maybeSingle();
  if (!payment) throw new Error(`payment_not_found: ${paymentId}`);
  if (payment.user_id) return payment.user_id as string;
  if (payment.audience !== "investor") throw new Error("guest_checkout_not_investor");
  const email = String(payment.buyer_email ?? "")
    .trim()
    .toLowerCase();
  if (!email) throw new Error("guest_checkout_no_email");

  const { firstName, lastName } = splitBuyerName(payment.buyer_type, payment.buyer_name);
  const { ensureAuthUser } = await import("@/lib/auth-users.server");
  const ensured = await ensureAuthUser({
    email,
    userMetadata: {
      first_name: firstName,
      last_name: lastName,
      // handle_new_user: nowe konto od razu dostaje rolę inwestora.
      signup_role: "inwestor",
      source: "tpay_guest_checkout",
    },
  });
  if (!ensured.userId) {
    throw new Error(`guest_account_failed: ${ensured.error ?? "unknown"}`);
  }
  const userId = ensured.userId;

  // Istniejące konto (np. klienta) — dokładamy rolę i rekord inwestora.
  await db
    .from("user_roles")
    .upsert({ user_id: userId, role: "inwestor" }, { onConflict: "user_id,role" });
  const { data: inv } = await db.from("investors").select("id").eq("user_id", userId).maybeSingle();
  if (!inv) {
    await db.from("investors").insert({
      user_id: userId,
      email,
      first_name: firstName,
      last_name: lastName,
      investor_type: "indywidualny",
    });
  }

  // Guard w WHERE: równoległy webhook mógł już przypiąć konto.
  await db
    .from("access_payments")
    .update({ user_id: userId })
    .eq("id", paymentId)
    .is("user_id", null);
  const { data: after } = await db
    .from("access_payments")
    .select("user_id")
    .eq("id", paymentId)
    .maybeSingle();
  return (after?.user_id as string) ?? userId;
}

/** Jednorazowy link logowania do panelu inwestora (null, gdy się nie udało). */
export async function investorLoginLink(email: string, redirectTo: string): Promise<string | null> {
  try {
    const { data, error } = await db.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });
    if (error) return null;
    return (data?.properties?.action_link as string) ?? null;
  } catch {
    return null;
  }
}
