// Typy wierszy modułu screeningu używane przez panel (bezpieczne dla klienta).
// Wartości JSON (snapshoty, rozbicie scoringu) są serializowalne.

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export interface ScreeningSubject {
  id: string;
  subject_type: string;
  kind: "person" | "entity";
  client_id: string | null;
  investor_id: string | null;
  parent_subject_id: string | null;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  birth_date: string | null;
  birth_year: number | null;
  nationality: string[];
  relation: string | null;
  subject_fingerprint: string;
  is_active: boolean;
  created_at: string;
}

export interface ScreeningSubjectStatus {
  subject_id: string;
  pep_status: string;
  sanctions_status: string;
  operations_hold: boolean;
  hold_reason: string | null;
  enhanced_monitoring: boolean;
  board_approval_required: boolean;
  board_approved_by: string | null;
  board_approved_at: string | null;
  board_approval_note: string | null;
  source_of_wealth: string | null;
  source_of_funds: string | null;
  sow_attachments: Array<{ path: string; name: string; mime?: string; uploaded_at?: string }>;
  last_screened_at: string | null;
  last_run_id: string | null;
}

export interface ScreeningCase {
  id: string;
  case_no: number;
  subject_id: string;
  subject_type: string;
  run_id: string | null;
  case_type: "pep" | "sanctions" | "declaration";
  priority: "normal" | "high" | "critical";
  status: string;
  hits: string[];
  max_score: number | null;
  assigned_to: string | null;
  decision: string | null;
  justification: string | null;
  decided_by: string | null;
  decided_at: string | null;
  application_hold: boolean;
  declaration_id: string | null;
  created_at: string;
}

export interface ScreeningHit {
  id: string;
  run_id: string;
  case_id: string | null;
  reference_type: "pep" | "sanction";
  reference_id: string;
  reference_snapshot: { [k: string]: Json };
  score: number;
  score_breakdown: { [k: string]: Json };
  band: string;
  status: string;
}

export interface ScreeningRun {
  id: string;
  subject_id: string;
  subject_type: string;
  trigger: string;
  scope: string;
  subject_snapshot: { [k: string]: Json };
  sources_versions: { [k: string]: string };
  settings_snapshot: { [k: string]: Json };
  started_at: string;
  finished_at: string | null;
  result: string | null;
  max_score: number | null;
  candidates_checked: number | null;
  error: string | null;
}

export interface PepDeclarationRow {
  id: string;
  subject_type: string;
  subject_id: string;
  answers: { [k: string]: Json };
  related_persons: Array<{
    relation: string;
    family_relation?: string | null;
    first_name: string;
    last_name: string;
    position: string;
  }>;
  any_yes: boolean;
  declaration_text_version: string;
  declaration_text: string;
  signed_at: string;
  ip: string | null;
  user_agent: string | null;
  channel: string | null;
}

export interface AuditRow {
  id: number;
  created_at: string;
  event_type: string;
  entity_type: string;
  entity_id: string | null;
  subject_id: string | null;
  actor_id: string | null;
  actor_kind: string;
  details: { [k: string]: Json };
  row_hash: string | null;
}

export interface ImportRow {
  id: string;
  source: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  record_count: number | null;
  upserted_count: number | null;
  deactivated_count: number | null;
  changed: boolean | null;
  error: string | null;
  file_checksum: string | null;
}

export interface CaseListItem extends ScreeningCase {
  subject: Pick<ScreeningSubject, "id" | "full_name" | "client_id" | "investor_id" | "kind"> | null;
}

export interface CoverageRow {
  code: string;
  position_name: string;
  category: string;
  scope: string;
  legal_basis: string | null;
  data_sources: string[];
  wikidata_ids: string[];
  wikidata_mode: string;
  gap_notes: string | null;
  is_active: boolean;
  persons: number;
  currentPersons: number;
  lastFetchedAt: string | null;
  sourcesLastImport: { [k: string]: string | null };
  coverage: "gap" | "source_empty" | "covered";
}

export const PEP_STATUS_LABELS: Record<string, string> = {
  unknown: "nie sprawdzono",
  none: "brak",
  pep: "PEP",
  former_pep: "były PEP",
  family_member: "członek rodziny PEP",
  close_associate: "bliski współpracownik PEP",
};

export const CASE_TYPE_LABELS: Record<string, string> = {
  pep: "PEP",
  sanctions: "Sankcje",
  declaration: "Oświadczenie",
};

export const PRIORITY_LABELS: Record<string, string> = {
  critical: "krytyczny",
  high: "wysoki",
  normal: "normalny",
};

export const DECISION_LABELS: Record<string, string> = {
  false_positive: "Fałszywe trafienie",
  confirmed_pep: "Potwierdzony PEP",
  confirmed_family_or_associate: "Potwierdzony członek rodziny / współpracownik",
  sanctions_hit: "Trafienie sankcyjne",
  no_pep_declaration_error: "Oświadczenie „tak” omyłkowe",
};

export const SUBJECT_TYPE_LABELS: Record<string, string> = {
  client: "klient",
  client_company: "firma klienta",
  investor: "inwestor",
  investor_company: "podmiot inwestora",
  beneficial_owner: "beneficjent rzeczywisty",
  representative: "reprezentant",
  related_person: "osoba wskazana w oświadczeniu",
};
