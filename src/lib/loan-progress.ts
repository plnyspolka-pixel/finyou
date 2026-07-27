// Czysta logika postępu wniosku — bez zależności serwerowych, używana
// zarówno w UI admina, jak i po stronie serwera (cron + przypomnienia).

import {
  REQUIREMENTS_BY_TYPE,
  PROPERTY_TYPE_LABELS,
  classifyDocument,
  type DocRequirement,
} from "./property-documents";

export const STEP_LABELS: Record<number, string> = {
  1: "Dane kontaktowe",
  2: "Wybór zabezpieczenia",
  3: "Dane nieruchomości",
  4: "Dokumenty",
  5: "Wniosek kompletny",
};

export interface ProgressInput {
  loan: {
    id: string;
    current_form_step: number | null;
    status: string;
    loan_amount: number | null;
    preferred_period_months: number | null;
  };
  client: {
    first_name?: string | null;
    last_name?: string | null;
    phone_normalized?: string | null;
    email?: string | null;
  } | null;
  property: {
    property_type?: string | null;
    city?: string | null;
    voivodeship?: string | null;
    land_register_number?: string | null;
    area_sqm?: number | null;
    photos?: string[] | null;
    mpzp_info?: string | null;
    land_registry_extract?: string | null;
  } | null;
  documents: Array<{
    id: string;
    document_type?: string | null;
    file_name?: string | null;
  }>;
}

export interface ProgressResult {
  current_step: number;
  step_label: string;
  property_type: string | null;
  property_type_label: string | null;
  property_city: string | null;
  loan_amount: number | null;
  required_documents: DocRequirement[];
  uploaded_documents: string[]; // ludzkie etykiety
  missing_documents: string[]; // ludzkie etykiety
  missing_documents_kinds: string[];
  is_complete: boolean;
  completion_percent: number;
}

export function computeLoanProgress(input: ProgressInput): ProgressResult {
  const ptype = input.property?.property_type ?? null;
  const requirements = ptype ? (REQUIREMENTS_BY_TYPE[ptype] ?? []) : [];

  // Co już mamy w bazie:
  const have = new Set<string>();
  if (input.property?.land_register_number) have.add("kw_number");
  if (input.property?.mpzp_info) have.add("mpzp");
  if (input.property?.land_registry_extract) have.add("land_registry");
  if ((input.property?.area_sqm ?? 0) > 0) have.add("usable_area");

  const photosCount = input.property?.photos?.length ?? 0;
  const interiorPhotos = (input.property?.photos ?? []).filter((p) =>
    /wewn|interior|pokoj|kuch|salon|lazi|łazi/i.test(p),
  ).length;
  const exteriorPhotos = (input.property?.photos ?? []).filter((p) =>
    /zewn|exterior|elewacj|front|fasad/i.test(p),
  ).length;

  // Klasyfikacja po dokumentach
  for (const d of input.documents) {
    const k = classifyDocument(d);
    if (k) have.add(k);
  }

  // Heurystyka dla zdjęć: jeśli mamy >=2 zdjęcia w property.photos i klient nie
  // nazywał ich konkretnie, uznajemy że co najmniej jedno z zewnątrz i jedno wewnątrz
  // — chyba że wymóg dotyczy obu, wtedy bierzemy dokładne dopasowanie.
  if (photosCount >= 2 && interiorPhotos === 0 && exteriorPhotos === 0) {
    have.add("photos_exterior");
    have.add("photos_interior");
  } else {
    if (exteriorPhotos > 0) have.add("photos_exterior");
    if (interiorPhotos > 0) have.add("photos_interior");
  }

  const missing = requirements.filter((r) => !have.has(r.kind));
  const uploaded = requirements.filter((r) => have.has(r.kind));

  const requiresCount = requirements.length || 1;
  const completedCount = uploaded.length;
  const docsPercent = Math.round((completedCount / requiresCount) * 100);

  // current_step liczymy z form_step, ale walidujemy progress
  let step = input.loan.current_form_step ?? 1;
  if (step < 1) step = 1;
  if (step > 5) step = 5;
  const stepLabel = STEP_LABELS[step] ?? "Wniosek";

  const isComplete = step >= 5 && missing.length === 0 && input.loan.status === "wniosek_kompletny";

  // Procent globalny: kroki 1-3 = 60%, dokumenty = 40%
  const stepPercent = Math.min(step, 4) * 15; // 1=15, 2=30, 3=45, 4=60
  const overallPercent = Math.min(
    100,
    Math.max(stepPercent, stepPercent + Math.round((docsPercent / 100) * 40)),
  );

  return {
    current_step: step,
    step_label: stepLabel,
    property_type: ptype,
    property_type_label: ptype ? (PROPERTY_TYPE_LABELS[ptype] ?? ptype) : null,
    property_city: input.property?.city ?? null,
    loan_amount: input.loan.loan_amount ?? null,
    required_documents: requirements,
    uploaded_documents: uploaded.map((r) => r.label),
    missing_documents: missing.map((r) => r.label),
    missing_documents_kinds: missing.map((r) => r.kind),
    is_complete: isComplete,
    completion_percent: overallPercent,
  };
}

/** Etykieta brakującego kroku — przyjazna dla agenta głosowego. */
export function describeMissingStep(p: ProgressResult): string {
  if (p.is_complete) return "Wniosek kompletny";
  if (p.current_step <= 2) return "Wybór zabezpieczenia i dane kontaktowe";
  if (p.current_step === 3) return "Dane nieruchomości";
  if (p.missing_documents.length > 0)
    return "Brakujące dokumenty: " + p.missing_documents.join(", ");
  return STEP_LABELS[p.current_step] ?? "Wniosek";
}

/** Zmienne dla agenta ElevenLabs (płaski obiekt string). */
export function buildElevenLabsVariables(
  p: ProgressResult,
  client: ProgressInput["client"],
): Record<string, string> {
  return {
    first_name: client?.first_name ?? "",
    last_name: client?.last_name ?? "",
    phone: client?.phone_normalized ?? "",
    email: client?.email ?? "",
    current_step: String(p.current_step),
    step_label: p.step_label,
    missing_step: describeMissingStep(p),
    property_type: p.property_type ?? "",
    property_type_label: p.property_type_label ?? "",
    property_city: p.property_city ?? "",
    loan_amount: p.loan_amount != null ? String(p.loan_amount) : "",
    uploaded_documents: p.uploaded_documents.join("; "),
    missing_documents: p.missing_documents.join("; "),
    missing_documents_count: String(p.missing_documents.length),
    completion_percent: String(p.completion_percent),
    is_complete: p.is_complete ? "true" : "false",
  };
}
