// E-maile transakcyjne systemu płatnego dostępu (Resend — istniejąca
// integracja Finance You z auto-brandingiem i suppression guardem).
import { sendResendEmail } from "@/lib/resend-send.server";
import { formatGroszPln, formatWarsawDate, type AccessAudience } from "./core";
import { resolveAppBaseUrl } from "./urls.server";
import {
  REGULAMIN_ABONAMENTU_VERSION,
  regulaminAbonamentuInwestora,
} from "@/lib/legal/regulamin-abonamentu";

/** Snapshot zgód zapisany przy płatności (access_payments.consents). */
export type PaymentConsentsSnapshot = {
  termsVersion?: string;
  digitalServiceConsent?: boolean;
  acceptedAt?: string;
};

/** Potwierdzenie na trwałym nośniku (§ 6 ust. 2 Regulaminu abonamentu v2):
 *  zgoda na natychmiastowe dostarczenie treści cyfrowych + pełny tekst
 *  Regulaminu. Tylko dla zakupu abonamentu inwestora według wersji v2. */
function abonamentConfirmationBlock(consents: PaymentConsentsSnapshot | null | undefined): string {
  if (consents?.termsVersion !== REGULAMIN_ABONAMENTU_VERSION || !consents.digitalServiceConsent)
    return "";
  const when = consents.acceptedAt ? formatWarsawDate(consents.acceptedAt, true) : "";
  return `

Potwierdzenie zawarcia umowy o Abonament (sprzedawca: Fundacja Krzewienia Edukacji Finansowej im. Pieczaka):
- zaakceptowałeś Regulamin abonamentu inwestora (${REGULAMIN_ABONAMENTU_VERSION})${when ? ` — ${when} (czas polski)` : ""};
- zażądałeś rozpoczęcia dostarczania szkolenia (treści cyfrowych) bezpośrednio po opłaceniu, przed upływem terminu do odstąpienia od umowy, i przyjąłeś do wiadomości, że tracisz w ten sposób prawo odstąpienia od umowy (art. 38 ust. 1 pkt 13 ustawy o prawach konsumenta).

Treść Regulaminu:

${regulaminAbonamentuInwestora()}`;
}

function panelPath(audience: AccessAudience): string {
  return audience === "investor" ? "/inwestor" : "/posrednik";
}

export async function sendPaymentConfirmedEmail(opts: {
  to: string;
  productLabel: string;
  amountGrosz: number;
  grantedUntil: string | Date;
  audience: AccessAudience;
  /** Zakup jednej okazji — bez okresu ważności, inna treść potwierdzenia. */
  kind?: "access" | "unlock";
  /** Snapshot zgód z płatności — dla abonamentu inwestora dołącza potwierdzenie. */
  consents?: PaymentConsentsSnapshot | null;
}): Promise<void> {
  const base = resolveAppBaseUrl();
  const until = formatWarsawDate(opts.grantedUntil, true);
  const isUnlock = opts.kind === "unlock";
  const subject = isUnlock
    ? "Płatność potwierdzona — Projekt odblokowany | Finance You"
    : "Płatność potwierdzona — dostęp aktywny | Finance You";
  const text = `Dzień dobry,

potwierdzamy zaksięgowanie płatności ${formatGroszPln(opts.amountGrosz)} ${opts.audience === "investor" ? "—" : "za pakiet:"} ${opts.productLabel}.

${
  isUnlock
    ? "Projekt został odblokowany — w panelu znajdziesz raport o inwestycji, harmonogram zaakceptowany przez pożyczkobiorcę oraz dane kontaktowe. Wyłączność obowiązuje zgodnie z regulaminem cyklu Zleceń."
    : `Twój pełny dostęp jest aktywny do: ${until} (czas polski).`
}

Panel: ${base}${isUnlock ? "/inwestor/umowy" : panelPath(opts.audience)}

Fakturę wyślemy osobnym e-mailem i znajdziesz ją w zakładce „Płatności i faktury".

Pozdrawiamy,
Zespół Finance You${
    !isUnlock && opts.audience === "investor" ? abonamentConfirmationBlock(opts.consents) : ""
  }`;
  await sendResendEmail({ to: opts.to, subject, text, category: "transactional" });
}

export async function sendInvoiceIssuedEmail(opts: {
  to: string;
  invoiceNumber: string | null;
  invoiceId: string;
  productLabel: string;
  amountGrosz: number;
  buyerType: "person" | "company";
}): Promise<void> {
  const base = resolveAppBaseUrl();
  const kind = opts.buyerType === "company" ? "Faktura VAT" : "Faktura imienna";
  const subject = `${kind} ${opts.invoiceNumber ?? ""} — Finance You`.replace(/\s+—/, " —");
  const text = `Dzień dobry,

wystawiliśmy ${opts.buyerType === "company" ? "fakturę VAT" : "fakturę imienną"} za zakup pakietu: ${opts.productLabel} (${formatGroszPln(opts.amountGrosz)}).

Numer faktury: ${opts.invoiceNumber ?? "(w przygotowaniu)"}
Podgląd i pobranie (po zalogowaniu): ${base}/faktura/${opts.invoiceId}

Faktura jest też dostępna w Twoim panelu w zakładce „Płatności i faktury".

Pozdrawiamy,
Zespół Finance You`;
  await sendResendEmail({ to: opts.to, subject, text, category: "transactional" });
}

export async function sendExpiryReminderEmail(opts: {
  to: string;
  audience: AccessAudience;
  daysLeft: number;
  activeUntil: string | Date;
}): Promise<void> {
  const base = resolveAppBaseUrl();
  const until = formatWarsawDate(opts.activeUntil, true);
  const dni = opts.daysLeft === 1 ? "1 dzień" : `${opts.daysLeft} dni`;
  const subject = `Twój pełny dostęp wygasa za ${dni} — Finance You`;
  const renewPath = opts.audience === "investor" ? "/inwestor/abonament" : "/posrednik/abonament";
  const text = `Dzień dobry,

Twój pełny dostęp do platformy Finance You wygasa ${until} (za ${dni}).

Aby zachować ciągłość dostępu, przedłuż ${opts.audience === "investor" ? "abonament" : "pakiet"} tutaj: ${base}${renewPath}

Po przedłużeniu nowy okres doliczymy do końca bieżącego — nic nie przepada.

Pozdrawiamy,
Zespół Finance You`;
  await sendResendEmail({ to: opts.to, subject, text, category: "transactional" });
}

export async function sendAccessExpiredEmail(opts: {
  to: string;
  audience: AccessAudience;
}): Promise<void> {
  const base = resolveAppBaseUrl();
  const renewPath = opts.audience === "investor" ? "/inwestor/abonament" : "/posrednik/abonament";
  const subject = "Twój pełny dostęp wygasł — Finance You";
  const text =
    opts.audience === "investor"
      ? `Dzień dobry,

Twój abonament inwestora wygasł. Nowe Zlecenia i moduły panelu (Projekty, dokumenty, analizy, czat, windykacja, AML, Akademia) są wstrzymane do czasu opłacenia kolejnego okresu.

Twoje dane i dokumenty pozostają bezpiecznie zapisane, a obowiązki z Umowy ramowej (poufność, zabezpieczenie prowizji klienta, okres ochronny) obowiązują nadal. Dostęp odzyskasz natychmiast po opłaceniu kolejnego okresu — 1 500 zł za 30 dni albo 7 000 zł za 365 dni: ${base}${renewPath}

Pozdrawiamy,
Zespół Finance You`
      : `Dzień dobry,

Twój płatny pakiet pośrednika wygasł, a konto wróciło do wersji darmowej.

W darmowej wersji nadal możesz: prowadzić do 5 własnych ofert, korzystać z bazy inwestorów i dystrybuować swoje oferty. Funkcje premium (leady Finance You, komunikacja, Akademia, program partnerski) odzyskasz po przedłużeniu pakietu: ${base}${renewPath}

Pozdrawiamy,
Zespół Finance You`;
  await sendResendEmail({ to: opts.to, subject, text, category: "transactional" });
}

export async function sendManualAccessChangeEmail(opts: {
  to: string;
  audience: AccessAudience;
  activeUntil: string | Date | null;
  revoked: boolean;
}): Promise<void> {
  const base = resolveAppBaseUrl();
  const subject = opts.revoked
    ? "Zmiana dostępu do platformy — Finance You"
    : "Twój dostęp został przedłużony — Finance You";
  const text = opts.revoked
    ? `Dzień dobry,

administrator zaktualizował Twój dostęp do platformy Finance You — pełny dostęp został zakończony. W razie pytań odpisz na tę wiadomość.

Pozdrawiamy,
Zespół Finance You`
    : `Dzień dobry,

administrator przedłużył Twój pełny dostęp do platformy Finance You do: ${formatWarsawDate(opts.activeUntil, true)} (czas polski).

Panel: ${base}${panelPath(opts.audience)}

Pozdrawiamy,
Zespół Finance You`;
  await sendResendEmail({ to: opts.to, subject, text, category: "transactional" });
}

export async function sendPaymentIssueEmail(opts: { to: string; reason: string }): Promise<void> {
  const subject = "Problem z płatnością — Finance You";
  const text = `Dzień dobry,

podczas przetwarzania Twojej płatności wystąpił problem wymagający wyjaśnienia (${opts.reason}).

Skontaktujemy się z Tobą, a w razie pytań możesz odpisać na tę wiadomość lub napisać na kontakt@financeyou.pl.

Pozdrawiamy,
Zespół Finance You`;
  await sendResendEmail({ to: opts.to, subject, text, category: "transactional" });
}
