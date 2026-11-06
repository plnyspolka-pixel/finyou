// Zapytanie do lokalnej kopii tablicy obwieszczeń KRZ (`krz_obwieszczenia`,
// zasilanej przez scripts/krz-tablica.ts). Nigdy nie rzuca — brak tabeli lub
// bazy to „unavailable”, a nie „brak postępowań”.
import type { OwnerIntelligenceHit } from "@/lib/coowners/owner-intelligence.types";
import {
  krzCoverageNote,
  matchKrzRows,
  normalizeName,
  type KrzLookupInput,
  type KrzRow,
} from "./lookup";

const COLUMNS =
  "id_zewnetrzny, numer_obwieszczenia, data_obwieszczenia, rodzaj_sprawy, kategoria, podkategoria, sygnatura, sad, podmiot_rodzaj, podmiot_nazwa, podmiot_krs, podmiot_nip, podmiot_miejscowosc, analiza";

export type KrzLookupResult = {
  status: "checked" | "unavailable";
  note: string;
  hits: OwnerIntelligenceHit[];
};

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export async function lookupKrzTable(input: KrzLookupInput): Promise<KrzLookupResult> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;

    const { data: cov, error: covErr } = await db
      .from("krz_obwieszczenia")
      .select("data_obwieszczenia")
      .order("data_obwieszczenia", { ascending: true })
      .limit(1);
    if (covErr)
      return {
        status: "unavailable",
        note: `KRZ (kopia lokalna): niedostępna (${String(covErr.message).slice(0, 80)}).`,
        hits: [],
      };
    if (!cov?.length) return { status: "unavailable", note: krzCoverageNote(null, 0), hits: [] };
    const [{ data: last }, { count }] = await Promise.all([
      db
        .from("krz_obwieszczenia")
        .select("data_obwieszczenia")
        .order("data_obwieszczenia", { ascending: false })
        .limit(1),
      db.from("krz_obwieszczenia").select("id_zewnetrzny", { count: "exact", head: true }),
    ]);
    const coverage = {
      from: cov[0].data_obwieszczenia,
      to: last?.[0]?.data_obwieszczenia ?? cov[0].data_obwieszczenia,
      rows: count ?? 0,
    };

    const filters: string[] = [];
    const nip = digits(input.nip);
    const krs = digits(input.krs);
    if (nip.length === 10) filters.push(`podmiot_nip.eq.${nip}`);
    if (krs.length === 10) filters.push(`podmiot_krs.eq.${krs}`);
    // Nazwa: ilike po pełnej nazwie; dokładność sprawdza matchKrzRows po normalizacji.
    const name = input.name
      .trim()
      .replace(/[%,()]/g, " ")
      .replace(/\s+/g, " ");
    if (name.length >= 5) {
      filters.push(`podmiot_nazwa.ilike.%${name}%`);
      const parts = name.split(" ");
      if (input.kind === "person" && parts.length === 2)
        filters.push(`podmiot_nazwa.ilike.%${parts[1]} ${parts[0]}%`);
    }
    if (!filters.length)
      return {
        status: "unavailable",
        note: "KRZ (kopia lokalna): brak identyfikatora ani nazwy do sprawdzenia.",
        hits: [],
      };

    const { data, error } = await db
      .from("krz_obwieszczenia")
      .select(COLUMNS)
      .or(filters.join(","))
      .limit(50);
    if (error)
      return {
        status: "unavailable",
        note: `KRZ (kopia lokalna): błąd zapytania (${String(error.message).slice(0, 80)}).`,
        hits: [],
      };
    const hits = matchKrzRows(input, (data ?? []) as KrzRow[]);
    return { status: "checked", note: krzCoverageNote(coverage, hits.length), hits };
  } catch (e) {
    return {
      status: "unavailable",
      note: `KRZ (kopia lokalna): niedostępna (${e instanceof Error ? e.message.slice(0, 80) : "błąd"}).`,
      hits: [],
    };
  }
}

export { normalizeName };
