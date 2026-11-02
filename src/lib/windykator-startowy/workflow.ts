/** Wstępny, niesamowykonujący harmonogram odrębnej bezpłatnej usługi (90 dni).
 * Żadna funkcja w tym module nie wysyła wiadomości ani nie wykonuje telefonu.
 * Reguły prawne, źródła danych i dostarczenie muszą być zatwierdzone osobno.
 */
export type CollectionStatus =
  | "awaiting_activation" | "active" | "payment_reported" | "disputed"
  | "human_review" | "settled" | "expired";
export type PlannedAction = "email" | "sms" | "voice" | "pre_court_notice" | "epu_package";
export interface CollectionSnapshot {
  status: CollectionStatus;
  elapsedDays: number;
  creditorAuthorized: boolean;
  debtorContactVerified: boolean;
  creditorBalanceConfirmedAt: string | null;
  hasPendingPaymentPromise: boolean;
  contactOptOut: boolean;
  completedStageDays: number[];
  today: string;
}
export type NextStep =
  | { ok: true; action: PlannedAction; stageDay: number; needsHumanApproval: boolean }
  | { ok: false; reason: string };

export const FREE_COLLECTION_STAGES: ReadonlyArray<{day:number;action:PlannedAction}> = [
  {day:0,action:"email"},{day:7,action:"sms"},{day:14,action:"voice"},
  {day:21,action:"email"},{day:45,action:"voice"},
  {day:60,action:"pre_court_notice"},{day:90,action:"epu_package"}
] as const;

/** Nie podejmuj kontaktu przy sporze, deklaracji wpłaty lub nieaktualnym saldzie.
 * Potwierdzenie wierzyciela nie zastępuje oceny prawnej zasadności roszczenia.
 */
export function nextCollectionStep(s:CollectionSnapshot):NextStep {
  if(s.status!=="active")return {ok:false,reason:"Nieaktywna lub wstrzymana sprawa."};
  if(!s.creditorAuthorized)return {ok:false,reason:"Brak zweryfikowanego uprawnienia wierzyciela."};
  if(!s.debtorContactVerified)return {ok:false,reason:"Brak weryfikacji kanału kontaktu do właściwej osoby."};
  if(s.contactOptOut)return {ok:false,reason:"Zastrzeżenie dotyczące kontaktu wymaga kontroli kanałów."};
  if(s.hasPendingPaymentPromise)return {ok:false,reason:"Oczekiwanie na uzgodnioną wpłatę."};
  if(!s.creditorBalanceConfirmedAt)return {ok:false,reason:"Brak aktualnego potwierdzenia salda od wierzyciela."};
  const balanceAge=(Date.parse(s.today+"T12:00:00Z")-Date.parse(s.creditorBalanceConfirmedAt))/86400000;
  if(!Number.isFinite(balanceAge)||balanceAge<0||balanceAge>2)
    return {ok:false,reason:"Saldo niepotwierdzone w ostatnich 48 godzinach."};
  const stages=FREE_COLLECTION_STAGES.filter(x=>x.day<=s.elapsedDays);
  const remaining=stages.filter(x=>!s.completedStageDays.includes(x.day));
  if(!remaining.length)return {ok:false,reason:"Brak kolejnej zaplanowanej czynności."};
  const stage=remaining[0];
  // Nawet przy pełnej weryfikacji działania wychodzące wymagają osobnego
  // zatwierdzenia prawa i polityki komunikacji dla danego kanału.
  return {ok:true,action:stage.action,stageDay:stage.day,needsHumanApproval:true};
}
