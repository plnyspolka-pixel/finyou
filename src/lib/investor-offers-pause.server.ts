// Wstrzymanie ofert dotyczy WYŁĄCZNIE inwestorów zewnętrznych. Finance You jako
// inwestor (rola samofinansująca albo profil inwestora z danymi Finance You)
// działa jak dotąd: widzi Projekty, rezerwuje, składa oferty.
import { INVESTOR_OFFERS_PAUSED, INVESTOR_OFFERS_PAUSED_MESSAGE } from "./investor-offers-pause";

/** Czy dla tego użytkownika-inwestora oferty są wstrzymane (false dla Finance You). */
export async function investorOffersPausedFor(userId: string | null | undefined): Promise<boolean> {
  if (!INVESTOR_OFFERS_PAUSED) return false;
  if (!userId) return true;
  const { isFinanceYouInvestorUser } =
    await import("@/lib/investor-agreements/finance-you-investor.server");
  return !(await isFinanceYouInvestorUser(userId).catch(() => false));
}

export async function assertInvestorOffersOpenFor(
  userId: string | null | undefined,
): Promise<void> {
  if (await investorOffersPausedFor(userId)) throw new Error(INVESTOR_OFFERS_PAUSED_MESSAGE);
}

/** Właściciel Zlecenia (po id) — dla akcji admina na cudzym Zleceniu/Dopasowaniu. */
export async function assertOrderOffersOpen(db: any, orderId: string): Promise<void> {
  if (!INVESTOR_OFFERS_PAUSED) return;
  const { data } = await db
    .from("investor_orders")
    .select("user_id")
    .eq("id", orderId)
    .maybeSingle();
  await assertInvestorOffersOpenFor(data?.user_id ?? null);
}
