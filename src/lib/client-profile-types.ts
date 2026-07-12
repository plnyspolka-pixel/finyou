// Centralny model danych profilu klienta pożyczkowego B2B.
// Jeden obiekt karmi wszystkie zakładki.

export type BorrowerType =
  | "JDG"
  | "sp_zoo"
  | "sp_cywilna"
  | "sp_jawna"
  | "sp_komandytowa"
  | "sp_akcyjna"
  | "psa"
  | "inny";

export const borrowerTypeLabels: Record<BorrowerType, string> = {
  JDG: "JDG / osoba fizyczna prowadząca działalność",
  sp_zoo: "Spółka z o.o.",
  sp_cywilna: "Spółka cywilna",
  sp_jawna: "Spółka jawna",
  sp_komandytowa: "Spółka komandytowa",
  sp_akcyjna: "Spółka akcyjna",
  psa: "Prosta spółka akcyjna",
  inny: "Inny przedsiębiorca",
};

export type IdDocumentType = "dowod" | "paszport" | "prawo_jazdy" | "inny";
export const idDocumentTypeLabels: Record<IdDocumentType, string> = {
  dowod: "Dowód osobisty",
  paszport: "Paszport",
  prawo_jazdy: "Prawo jazdy",
  inny: "Inny",
};

export type FieldSource = "CEIDG" | "GUS" | "GUS_REGON" | "KRS" | "KRS_PRS" | "Ręcznie" | "Wniosek";

export interface IdDocument {
  type?: IdDocumentType;
  number?: string;
  description?: string; // gdy type = inny
}

export interface BorrowerData {
  // wspólne
  companyName?: string;
  nip?: string;
  regon?: string;
  krs?: string;
  legalForm?: string;
  registryRecordId?: string;
  businessStatus?: string;
  businessStartDate?: string;
  mainPkdCode?: string;
  mainPkdName?: string;
  pkdList?: Array<{ kod?: string; nazwa?: string }>;

  // JDG / osoba fizyczna
  firstName?: string;
  lastName?: string;
  pesel?: string;
  businessAddress?: string;
  correspondenceAddress?: string;
  maritalPropertyCommunity?: string;

  // spółka
  registeredAddress?: string;
  representationDescription?: string;
  shareCapital?: string;

  // kontakt
  phone?: string;
  email?: string;
  website?: string;
  eDeliveryAddress?: string;

  // tożsamość
  idDocument?: IdDocument;

  // cel pożyczki
  loanPurpose?: string;
}

export interface RepresentativeData {
  firstName?: string;
  lastName?: string;
  role?: string; // prezes / członek zarządu / prokurent / wspólnik
  pesel?: string;
  idDocument?: IdDocument;
}

export type PropertyType =
  | "mieszkanie"
  | "dom"
  | "lokal_uslugowy"
  | "dzialka_budowlana"
  | "grunt_rolny"
  | "inna";

export const propertyTypeLabels: Record<PropertyType, string> = {
  mieszkanie: "Mieszkanie",
  dom: "Dom",
  lokal_uslugowy: "Lokal usługowy",
  dzialka_budowlana: "Działka budowlana",
  grunt_rolny: "Grunt rolny",
  inna: "Inna",
};

export interface PropertyOwner {
  isBorrower: boolean;
  firstName?: string;
  lastName?: string;
  pesel?: string;
  address?: string;
  idDocument?: IdDocument;
}

export interface PropertyData {
  type?: PropertyType;
  landRegisterNumber?: string;
  address?: string;
  city?: string;
  voivodeship?: string;
  estimatedValue?: number;
  owner?: PropertyOwner;
  hasExistingMortgage?: boolean;
  existingDebtAmount?: number;
  description?: string;
}

export type UploadedFileCategory =
  | "zdjecie_zewnetrzne"
  | "zdjecie_wewnetrzne"
  | "zdjecie_dokumentu"
  | "kw"
  | "mpzp"
  | "wypis_z_rejestru_gruntow"
  | "inne";

export const fileCategoryLabels: Record<UploadedFileCategory, string> = {
  zdjecie_zewnetrzne: "Zdjęcie z zewnątrz",
  zdjecie_wewnetrzne: "Zdjęcie wnętrza",
  zdjecie_dokumentu: "Zdjęcie dokumentu",
  kw: "Księga wieczysta",
  mpzp: "MPZP / warunki zabudowy",
  wypis_z_rejestru_gruntow: "Wypis z rejestru gruntów",
  inne: "Inne",
};

export interface UploadedFile {
  id: string;
  category: UploadedFileCategory;
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
  source: "client_application" | "operator_upload";
}

export interface InvestorData {
  fullName?: string;
  companyName?: string;
  nip?: string;
  address?: string;
  phone?: string;
  email?: string;
  bankAccount?: string;
  representativeName?: string;
}

export type InvestorReturnType = "amount" | "percent";

export interface OfferData {
  netAmountToClient?: number;
  creditedCommission?: number;
  maxMonthlyPaymentByClient?: number;
  loanTermMonths?: number;
  investorMonthlyReturnType?: InvestorReturnType;
  investorMonthlyReturnAmount?: number;
  investorMonthlyReturnPercent?: number;
  annualInterestPercent?: number;
  payoutDate?: string; // YYYY-MM-DD
  agreementDate?: string; // YYYY-MM-DD
}

export interface ScheduleRow {
  index: number | "Balon";
  date: string;
  paymentAmount: number;
  capital: number;
  interest: number;
  remainingCapital: number;
}

export interface ScheduleData {
  rows: ScheduleRow[];
  nominalLoanAmount: number;
  /** Oczekiwane wynagrodzenie inwestora — informacyjnie (benchmark negocjacyjny);
   *  umowa nie przewiduje opłaty za ryzyko, wynagrodzenie = odsetki + prowizja. */
  expectedMonthlyInvestorReturn: number;
  monthlyInterestAmount: number;
  balloonPayment: number;
  totalClientObligation: number;
  totalInvestorProfit: number;
  annualizedInvestorProfitAmount: number;
  annualizedInvestorProfitPercent: number;
  warnings: string[];
  infos: string[];
}

export interface NbpBenchmark {
  verificationDate?: string;
  nbpReferenceRate?: number; // %
  statutoryInterestAnnual?: number; // wyliczane
  statutoryInterestMonthlyEquivalent?: number; // wyliczane
}

export interface SecurityData {
  mortgageAmount?: number;
  art777Amount?: number;
  art777ClauseDeadline?: string;
  guarantorName?: string;
  guarantorPesel?: string;
  guarantorIdDocument?: IdDocument;
  notes?: string;
}

export interface ClientProfile {
  id?: string;
  sourceApplicationId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  borrowerType: BorrowerType;
  borrowerData: BorrowerData;
  representativeData?: RepresentativeData;
  propertyData: PropertyData;
  uploadedPhotos: UploadedFile[];
  uploadedDocuments: UploadedFile[];
  investorData: InvestorData;
  offerData: OfferData;
  scheduleData?: ScheduleData;
  securityData: SecurityData;
  nbpBenchmark?: NbpBenchmark;
  fieldSources?: Record<string, FieldSource>; // ścieżka pola -> źródło
}

export function emptyProfile(): ClientProfile {
  return {
    borrowerType: "JDG",
    borrowerData: {},
    propertyData: {},
    uploadedPhotos: [],
    uploadedDocuments: [],
    investorData: {},
    offerData: { investorMonthlyReturnType: "amount" },
    securityData: {},
    fieldSources: {},
  };
}
