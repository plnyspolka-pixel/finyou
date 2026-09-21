// Jeden pipeline inwestora — czysta logika kolejności kroków i ich stanu.
// Bez I/O: ta sama funkcja liczy stan dla UI (kolorowy stepper) i dla bramek
// serwerowych, więc panel nigdy nie pokaże kroku, którego serwer nie przepuści.
//
// Kolejność (wymuszona sekwencyjnie):
//   1. Dane pożyczkodawcy (osoba fizyczna / JDG / spółka + wyszukiwarka NIP/KRS)
//   2. Rachunek bankowy do spłaty pożyczki (NRB/IBAN, obowiązkowy)
//   3. Weryfikacja tożsamości — KYC Didit
//   4. Screening list sankcyjnych i PEP (Dilisense — nie Didit)
//   5. Doręczenie pakietu na trwałym nośniku
//   6. Ramowa umowa pośrednictwa
//   7. NDA i zakaz obchodzenia
//   8. Umowa powierzenia danych (RODO)
//   9. Zlecenie poszukiwania okazji

export type PipelineStepKey =
  | "dane_pozyczkodawcy"
  | "rachunek_splaty"
  | "kyc"
  | "screening"
  | "doreczenie"
  | "umowa_ramowa"
  | "nda"
  | "rodo"
  | "zlecenie";

/** Stan pojedynczego kroku. `uwaga` = krok wymaga reakcji człowieka. */
export type PipelineStepState = "zrobione" | "biezacy" | "zablokowany" | "uwaga";

export type KycStatus =
  | "not_started"
  | "pending"
  | "approved"
  | "manual_review"
  | "rejected"
  | "expired";

export type ScreeningResult =
  | "clear"
  | "possible_match"
  | "manual_review"
  | "confirmed_sanctions_match"
  | "pep_review_required";

export interface PipelineInput {
  /** Komplet danych pożyczkodawcy (strona umowy) zapisany i zweryfikowany. */
  lenderDataCompleted: boolean;
  /** Rachunek do spłaty pożyczki zapisany i poprawny (NRB/IBAN). */
  repaymentAccountConfirmed: boolean;
  kycStatus: KycStatus;
  screeningResult: ScreeningResult | null;
  /** Pakiet doręczony e-mailem na trwałym nośniku. */
  delivered: boolean;
  isConsumer: boolean;
  /** Dokumenty pakietu w kolejności akceptacji (tylko aktywne). */
  documents: { code: string; accepted: boolean }[];
  /** Czy pakiet prawny jest aktywny (po przeglądzie kancelarii). */
  packActive: boolean;
  /** Liczba złożonych Zleceń. */
  ordersCount: number;
}

export interface PipelineStep {
  key: PipelineStepKey;
  index: number;
  title: string;
  subtitle: string;
  state: PipelineStepState;
  /** Powód zablokowania / wymaganej uwagi — pokazywany wprost w panelu. */
  hint: string | null;
  /** Kolor akcentu kroku (fancy stepper) — odcień HSL bazowy. */
  hue: number;
}

const STEP_META: Record<PipelineStepKey, { title: string; subtitle: string; hue: number }> = {
  dane_pozyczkodawcy: {
    title: "Dane pożyczkodawcy",
    subtitle:
      "Osoba fizyczna, JDG albo spółka. Dla firm pobieramy dane z GUS/KRS po NIP, REGON lub KRS.",
    hue: 262,
  },
  rachunek_splaty: {
    title: "Rachunek do spłaty pożyczki",
    subtitle: "Obowiązkowy numer NRB/IBAN, na który pożyczkobiorca będzie spłacał pożyczkę.",
    hue: 217,
  },
  kyc: {
    title: "Weryfikacja tożsamości (KYC)",
    subtitle: "Zdalne potwierdzenie tożsamości przez Didit — dokument i selfie.",
    hue: 190,
  },
  screening: {
    title: "Screening list sankcyjnych",
    subtitle: "Sankcje, PEP i listy ostrzegawcze (Dilisense) — uruchamiany automatycznie po KYC.",
    hue: 160,
  },
  doreczenie: {
    title: "Doręczenie pakietu",
    subtitle: "Komplet dokumentów na trwałym nośniku (e-mail z plikami DOCX).",
    hue: 130,
  },
  umowa_ramowa: {
    title: "Ramowa umowa pośrednictwa",
    subtitle: "Dane stron wypełnia system; akceptacja w formie dokumentowej ze śladem audytowym.",
    hue: 86,
  },
  nda: {
    title: "NDA i zakaz obchodzenia",
    subtitle: "Ochrona danych klientów i relacji handlowych.",
    hue: 48,
  },
  rodo: {
    title: "Umowa powierzenia danych (RODO)",
    subtitle: "Zasady przetwarzania danych osobowych pożyczkobiorców.",
    hue: 28,
  },
  zlecenie: {
    title: "Zlecenie poszukiwania okazji",
    subtitle: "Kwota ± 15%, maksymalny okres, minimalny zysk roczny i termin ważności.",
    hue: 8,
  },
};

const DOC_STEPS: { code: string; key: PipelineStepKey }[] = [
  { code: "umowa_ramowa", key: "umowa_ramowa" },
  { code: "nda", key: "nda" },
  { code: "rodo", key: "rodo" },
];

/** Kroki blokujące dalszy ciąg, które wymagają decyzji człowieka. */
const ATTENTION_SCREENING: ScreeningResult[] = [
  "possible_match",
  "manual_review",
  "confirmed_sanctions_match",
  "pep_review_required",
];

export interface PipelineView {
  steps: PipelineStep[];
  /** Klucz pierwszego kroku do wykonania (null = pipeline zamknięty). */
  currentStep: PipelineStepKey | null;
  /** 0–100: odsetek ukończonych kroków. */
  progress: number;
  /** Czy można złożyć Zlecenie (wszystkie wcześniejsze kroki zrobione). */
  canSubmitOrder: boolean;
  /** Kroki wymagające reakcji (odrzucone KYC, trafienie sankcyjne itp.). */
  attention: PipelineStepKey[];
}

function kycDone(status: KycStatus): boolean {
  return status === "approved";
}

function screeningDone(result: ScreeningResult | null): boolean {
  return result === "clear";
}

export function computeInvestorPipeline(input: PipelineInput): PipelineView {
  const accepted = new Map(input.documents.map((d) => [d.code, d.accepted]));

  const raw: { key: PipelineStepKey; done: boolean; attention: string | null }[] = [
    {
      key: "dane_pozyczkodawcy",
      done: input.lenderDataCompleted,
      attention: null,
    },
    {
      key: "rachunek_splaty",
      done: input.repaymentAccountConfirmed,
      attention: null,
    },
    {
      key: "kyc",
      done: kycDone(input.kycStatus),
      attention:
        input.kycStatus === "rejected"
          ? "Weryfikacja tożsamości zakończona negatywnie — skontaktuj się z Finance You."
          : input.kycStatus === "manual_review"
            ? "Weryfikacja skierowana do ręcznej analizy — czekamy na decyzję."
            : input.kycStatus === "expired"
              ? "Sesja weryfikacji wygasła — uruchom ją ponownie."
              : null,
    },
    {
      key: "screening",
      done: screeningDone(input.screeningResult),
      attention:
        input.screeningResult && ATTENTION_SCREENING.includes(input.screeningResult)
          ? input.screeningResult === "confirmed_sanctions_match"
            ? "Potwierdzone trafienie sankcyjne — dalsze kroki są zablokowane."
            : "Trafienie wymaga analizy compliance Finance You."
          : null,
    },
    {
      key: "doreczenie",
      done: input.delivered,
      attention: null,
    },
    ...DOC_STEPS.map((d) => ({
      key: d.key,
      done: accepted.get(d.code) === true,
      attention: null as string | null,
    })),
    {
      key: "zlecenie",
      done: input.ordersCount > 0,
      attention: null,
    },
  ];

  const steps: PipelineStep[] = [];
  let currentAssigned = false;
  let currentStep: PipelineStepKey | null = null;
  const attention: PipelineStepKey[] = [];

  raw.forEach((r, i) => {
    const meta = STEP_META[r.key];
    let state: PipelineStepState;
    let hint: string | null = null;

    if (r.attention) {
      state = "uwaga";
      hint = r.attention;
      attention.push(r.key);
      currentAssigned = true;
    } else if (r.done) {
      state = "zrobione";
    } else if (!currentAssigned) {
      state = "biezacy";
      currentAssigned = true;
      currentStep = r.key;
    } else {
      state = "zablokowany";
      hint = "Najpierw ukończ wcześniejsze kroki.";
    }

    // Pakiet uśpiony do przeglądu kancelarii — kroki dokumentowe i Zlecenie
    // są niedostępne bez względu na resztę pipeline'u.
    const isLegalStep =
      r.key === "doreczenie" || r.key === "zlecenie" || DOC_STEPS.some((d) => d.key === r.key);
    if (!input.packActive && isLegalStep && state !== "zrobione") {
      state = "zablokowany";
      hint = "Pakiet dokumentów czeka na aktywację po przeglądzie kancelarii.";
      if (currentStep === r.key) currentStep = null;
    }

    // Konsument: informacje przedumowne muszą być doręczone PRZED umową ramową.
    if (r.key === "umowa_ramowa" && input.isConsumer && !input.delivered && state !== "zrobione") {
      state = "zablokowany";
      hint = "Jako Konsument musisz najpierw otrzymać pakiet na trwałym nośniku.";
      if (currentStep === r.key) currentStep = null;
    }

    steps.push({
      key: r.key,
      index: i + 1,
      title: meta.title,
      subtitle: meta.subtitle,
      state,
      hint,
      hue: meta.hue,
    });
  });

  const doneCount = steps.filter((s) => s.state === "zrobione").length;
  const beforeOrder = steps.slice(0, steps.length - 1);

  return {
    steps,
    currentStep,
    progress: Math.round((doneCount / steps.length) * 100),
    canSubmitOrder: input.packActive && beforeOrder.every((s) => s.state === "zrobione"),
    attention,
  };
}

/** Bramka serwerowa: rzuca czytelnym błędem, gdy pipeline nie jest domknięty. */
export function assertPipelineReadyForOrder(input: PipelineInput): void {
  const view = computeInvestorPipeline(input);
  if (view.canSubmitOrder) return;
  const blocking = view.steps.find((s) => s.state !== "zrobione");
  throw new Error(
    blocking
      ? `Zlecenie jest nieaktywne — dokończ krok ${blocking.index}: ${blocking.title}.`
      : "Zlecenie jest nieaktywne — dokończ pipeline inwestora.",
  );
}
