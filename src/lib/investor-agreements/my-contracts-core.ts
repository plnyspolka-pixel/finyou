// „Moje umowy" inwestora — czyste reguły (bez I/O, testowane jednostkowo).
// Umowa = komplet wygenerowany silnikiem umów do wniosku albo koperta
// e-podpisu wysłana przez inwestora do tego wniosku.

/** Slug kompletu umowy pożyczki w generated_documents (contract-engine). */
export const LOAN_CONTRACT_SLUG = "silnik-umow-komplet";

export type ContractStage =
  /** Wszyscy podpisali. */
  | "podpisane"
  /** Czeka na podpis inwestora (on jest jeszcze niepodpisanym sygnatariuszem). */
  | "czeka_na_mnie"
  /** Inwestor podpisał / nie podpisuje — czekamy na klienta (pozostałe strony). */
  | "czeka_na_klienta"
  /** Wygenerowana, ale nie ma aktywnej wysyłki (brak koperty, szkic, wygasła, odrzucona). */
  | "do_wyslania";

export interface StageSigner {
  user_id?: string | null;
  email: string;
  status: string;
}

export interface StageEnvelope {
  status: string;
  signers: StageSigner[];
}

export function isMeSigner(s: StageSigner, userId: string, myEmail: string | null): boolean {
  if (s.user_id && s.user_id === userId) return true;
  return Boolean(myEmail) && s.email.toLowerCase() === (myEmail as string).toLowerCase();
}

/** Etap umowy z ostatniej (nieanulowanej) koperty; bez koperty — do wysłania. */
export function contractStage(
  envelope: StageEnvelope | null,
  userId: string,
  myEmail: string | null,
): ContractStage {
  if (!envelope) return "do_wyslania";
  if (envelope.status === "zakonczona") return "podpisane";
  if (envelope.status !== "wyslana") return "do_wyslania";
  const mineUnsigned = envelope.signers.some(
    (s) => isMeSigner(s, userId, myEmail) && s.status !== "podpisany",
  );
  return mineUnsigned ? "czeka_na_mnie" : "czeka_na_klienta";
}

/** Koperty, które liczą się jako „umowa w obiegu" (anulowana = nie było umowy). */
export function isLiveEnvelope(status: string): boolean {
  return status !== "anulowana";
}
