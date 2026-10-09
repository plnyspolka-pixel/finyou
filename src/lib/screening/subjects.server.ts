// Synchronizacja podmiotów screeningu z danymi źródłowymi platformy:
// klient (osoba + firma), beneficjenci rzeczywiści z CRBR (cache), inwestor
// (osoba / podmiot + reprezentant), osoby powiązane wskazane w oświadczeniu PEP.
// Dane klientów zostają w naszej bazie — nic nie jest wysyłane na zewnątrz.
import { parsePesel } from "@/lib/risk-assessment/pesel";
import { normalizeCountry, parsePartialDate } from "./normalize";
import { screeningAudit, sdb, sha256Hex, stableJson } from "./db.server";

export type SubjectType =
  | "client"
  | "client_company"
  | "investor"
  | "investor_company"
  | "beneficial_owner"
  | "representative"
  | "related_person";

export interface SubjectRow {
  id: string;
  subject_type: SubjectType;
  kind: "person" | "entity";
  client_id: string | null;
  investor_id: string | null;
  parent_subject_id: string | null;
  source_key: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  birth_date: string | null;
  birth_year: number | null;
  nationality: string[];
  relation: string | null;
  subject_fingerprint: string;
  is_active: boolean;
}

interface SubjectInput {
  subject_type: SubjectType;
  kind: "person" | "entity";
  client_id?: string | null;
  investor_id?: string | null;
  parent_subject_id?: string | null;
  source_key: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name: string;
  birth_date?: string | null;
  nationality?: string[];
  relation?: string | null;
}

/** Odcisk danych wpływających na dopasowanie — zmiana unieważnia pamięć „fałszywych trafień”. */
export async function subjectFingerprint(
  s: Pick<SubjectInput, "full_name" | "birth_date" | "nationality">,
): Promise<string> {
  return sha256Hex(
    stableJson({
      n: s.full_name.trim().toLowerCase(),
      b: s.birth_date ?? null,
      c: [...(s.nationality ?? [])].sort(),
    }),
  );
}

async function upsertSubject(s: SubjectInput): Promise<SubjectRow> {
  const birth = parsePartialDate(s.birth_date);
  const nationality = [...new Set((s.nationality ?? []).filter(Boolean))];
  const fingerprint = await subjectFingerprint({ ...s, nationality });
  const { data, error } = await sdb
    .from("screening_subjects")
    .upsert(
      {
        subject_type: s.subject_type,
        kind: s.kind,
        client_id: s.client_id ?? null,
        investor_id: s.investor_id ?? null,
        parent_subject_id: s.parent_subject_id ?? null,
        source_key: s.source_key,
        first_name: s.first_name ?? null,
        last_name: s.last_name ?? null,
        full_name: s.full_name.trim(),
        birth_date: birth.date,
        birth_year: birth.year,
        nationality,
        relation: s.relation ?? null,
        subject_fingerprint: fingerprint,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "source_key" },
    )
    .select("*")
    .single();
  if (error) throw new Error(`screening_subjects: ${error.message}`);
  return data as SubjectRow;
}

/** Podmioty danego „rodzica” (np. BO klienta), których nie ma już w danych źródłowych → nieaktywne. */
async function deactivateMissing(
  filter: { column: "client_id" | "investor_id"; value: string },
  keep: string[],
  types: SubjectType[],
) {
  const { data } = await sdb
    .from("screening_subjects")
    .select("id, source_key")
    .eq(filter.column, filter.value)
    .in("subject_type", types)
    .eq("is_active", true);
  const stale = ((data ?? []) as Array<{ id: string; source_key: string }>).filter(
    (r) => !keep.includes(r.source_key),
  );
  for (const r of stale) {
    await sdb
      .from("screening_subjects")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", r.id);
    await screeningAudit({
      eventType: "subject.deactivated",
      entityType: "subject",
      entityId: r.id,
      subjectId: r.id,
      details: { source_key: r.source_key },
    });
  }
}

function peselBirth(pesel: string | null | undefined): string | null {
  const p = parsePesel(pesel ?? "");
  return p.valid ? p.birthDate : null;
}

const isPersonName = (first?: string | null, last?: string | null) =>
  !!(first?.trim() && last?.trim());

/** Klient + jego firma + beneficjenci rzeczywiści (CRBR z cache) + osoby z oświadczeń. */
export async function syncClientSubjects(clientId: string): Promise<SubjectRow[]> {
  const { data: c, error } = await sdb
    .from("clients")
    .select("id, first_name, last_name, pesel, company_name, nip, country")
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!c) return [];
  const out: SubjectRow[] = [];
  const country = normalizeCountry(c.country);
  let person: SubjectRow | null = null;
  if (isPersonName(c.first_name, c.last_name)) {
    person = await upsertSubject({
      subject_type: "client",
      kind: "person",
      client_id: c.id,
      source_key: `client:${c.id}`,
      first_name: c.first_name,
      last_name: c.last_name,
      full_name: `${c.first_name} ${c.last_name}`,
      birth_date: peselBirth(c.pesel),
      // PESEL nadawany jest obywatelom i rezydentom PL — jako słaby sygnał kraju.
      nationality: country ? [country] : c.pesel ? ["PL"] : [],
    });
    out.push(person);
  }
  const keep: string[] = [];
  if (c.company_name?.trim()) {
    const company = await upsertSubject({
      subject_type: "client_company",
      kind: "entity",
      client_id: c.id,
      source_key: `client_company:${c.id}`,
      full_name: c.company_name,
      nationality: country ? [country] : [],
    });
    keep.push(company.source_key);
    out.push(company);
  }
  const nip = (c.nip ?? "").replace(/\D/g, "");
  if (nip.length === 10) {
    const { data: crbr } = await sdb
      .from("crbr_cache")
      .select("beneficjenci")
      .eq("nip", nip)
      .maybeSingle();
    for (const b of (crbr?.beneficjenci ?? []) as Array<{
      firstName?: string;
      lastName?: string;
      pesel?: string | null;
      dateOfBirth?: string | null;
      citizenships?: string[];
    }>) {
      if (!isPersonName(b.firstName, b.lastName)) continue;
      const key = `bo:${c.id}:${(b.pesel || `${b.firstName}|${b.lastName}|${b.dateOfBirth ?? ""}`).toLowerCase()}`;
      const bo = await upsertSubject({
        subject_type: "beneficial_owner",
        kind: "person",
        client_id: c.id,
        parent_subject_id: person?.id ?? null,
        source_key: key,
        first_name: b.firstName,
        last_name: b.lastName,
        full_name: `${b.firstName} ${b.lastName}`,
        birth_date: peselBirth(b.pesel) ?? b.dateOfBirth ?? null,
        nationality: (b.citizenships ?? []).map((x) => normalizeCountry(x) ?? "").filter(Boolean),
        relation: "beneficial_owner",
      });
      keep.push(bo.source_key);
      out.push(bo);
    }
  }
  await deactivateMissing({ column: "client_id", value: c.id }, keep, [
    "client_company",
    "beneficial_owner",
  ]);
  out.push(
    ...(await syncRelatedFromLatestDeclaration("client", c.id, person, { client_id: c.id })),
  );
  return out;
}

/** Inwestor (osoba / podmiot) + reprezentant + osoby z oświadczeń. */
export async function syncInvestorSubjects(investorId: string): Promise<SubjectRow[]> {
  const { data: inv, error } = await sdb
    .from("investors")
    .select(
      "id, first_name, last_name, company_name, pesel, country, entity_type, representative_first_name, representative_last_name, representative_role",
    )
    .eq("id", investorId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!inv) return [];
  const out: SubjectRow[] = [];
  const country = normalizeCountry(inv.country);
  let person: SubjectRow | null = null;
  if (isPersonName(inv.first_name, inv.last_name)) {
    person = await upsertSubject({
      subject_type: "investor",
      kind: "person",
      investor_id: inv.id,
      source_key: `investor:${inv.id}`,
      first_name: inv.first_name,
      last_name: inv.last_name,
      full_name: `${inv.first_name} ${inv.last_name}`,
      birth_date: peselBirth(inv.pesel),
      nationality: country ? [country] : inv.pesel ? ["PL"] : [],
    });
    out.push(person);
  }
  const keep: string[] = [];
  if (inv.company_name?.trim()) {
    const company = await upsertSubject({
      subject_type: "investor_company",
      kind: "entity",
      investor_id: inv.id,
      source_key: `investor_company:${inv.id}`,
      full_name: inv.company_name,
      nationality: country ? [country] : [],
    });
    keep.push(company.source_key);
    out.push(company);
    if (isPersonName(inv.representative_first_name, inv.representative_last_name)) {
      const rep = await upsertSubject({
        subject_type: "representative",
        kind: "person",
        investor_id: inv.id,
        parent_subject_id: company.id,
        source_key: `representative:${inv.id}`,
        first_name: inv.representative_first_name,
        last_name: inv.representative_last_name,
        full_name: `${inv.representative_first_name} ${inv.representative_last_name}`,
        relation: inv.representative_role ?? "reprezentant",
      });
      keep.push(rep.source_key);
      out.push(rep);
      person ??= rep;
    }
  }
  await deactivateMissing({ column: "investor_id", value: inv.id }, keep, [
    "investor_company",
    "representative",
  ]);
  out.push(
    ...(await syncRelatedFromLatestDeclaration("investor", inv.id, person, {
      investor_id: inv.id,
    })),
  );
  return out;
}

/** Osoby powiązane z najnowszego oświadczenia — też przechodzą screening. */
async function syncRelatedFromLatestDeclaration(
  subjectType: "client" | "investor",
  subjectId: string,
  declarant: SubjectRow | null,
  link: { client_id?: string; investor_id?: string },
): Promise<SubjectRow[]> {
  const { data: decl } = await sdb
    .from("pep_declarations")
    .select("id, related_persons")
    .eq("subject_type", subjectType)
    .eq("subject_id", subjectId)
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const out: SubjectRow[] = [];
  const keep: string[] = [];
  for (const [i, p] of (
    (decl?.related_persons ?? []) as Array<{
      relation: "family" | "associate";
      family_relation?: string | null;
      first_name: string;
      last_name: string;
      position: string;
    }>
  ).entries()) {
    const s = await upsertSubject({
      subject_type: "related_person",
      kind: "person",
      ...link,
      parent_subject_id: declarant?.id ?? null,
      source_key: `related:${decl!.id}:${i}`,
      first_name: p.first_name,
      last_name: p.last_name,
      full_name: `${p.first_name} ${p.last_name}`,
      relation: p.relation === "family" ? `family:${p.family_relation ?? ""}` : "associate",
    });
    keep.push(s.source_key);
    out.push(s);
  }
  const column = link.client_id ? "client_id" : "investor_id";
  await deactivateMissing({ column, value: (link.client_id ?? link.investor_id)! }, keep, [
    "related_person",
  ]);
  return out;
}

/** Podmiot „właściciel” oświadczenia (klient / inwestor) — do powiązania sprawy deklaracyjnej. */
export async function declarantSubject(
  subjectType: "client" | "investor",
  subjectId: string,
): Promise<SubjectRow | null> {
  const column = subjectType === "client" ? "client_id" : "investor_id";
  const { data } = await sdb
    .from("screening_subjects")
    .select("*")
    .eq(column, subjectId)
    .in(
      "subject_type",
      subjectType === "client"
        ? ["client", "client_company"]
        : ["investor", "representative", "investor_company"],
    )
    .eq("is_active", true)
    .order("subject_type", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as SubjectRow) ?? null;
}
