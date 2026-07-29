// Sprawdzenie działalności gospodarczej właścicieli nieruchomości (dział II KW)
// w CEIDG — osobna zakładka wniosku, niezależna od pipeline'u oceny ryzyka.
// Wynik jest cache'owany per numer KW (7 dni) w tabeli kw_owners_business_check.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { normalizeKwNumber } from "@/lib/kw-fetch.server";
import { extractKwOwnerPersons } from "@/lib/risk-assessment/kw-parser.server";
import { lookupCeidgActivity, emptyCeidg } from "@/lib/risk-assessment/ceidg-lookup.server";
import type {
  OwnerBusinessCheckOwner,
  OwnerBusinessCheckPayload,
} from "@/lib/owner-business-check.types";

type SupabaseLike = { from: (table: string) => any };

// Tabela cache nie występuje w wygenerowanych typach Supabase (utworzona przez
// agenta Lovable bezpośrednio w bazie) — dostęp przez istniejący w repo wzorzec.
const db = supabaseAdmin as any;

async function assertAdminOrOperator(supabase: SupabaseLike, userId: string) {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const allowed = (roles ?? []).some(
    (r: { role: string }) => r.role === "administrator" || r.role === "operator",
  );
  if (!allowed) throw new Error("Brak uprawnień (wymagana rola administrator/operator).");
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function isFresh(checkedAt: string | null | undefined): boolean {
  if (!checkedAt) return false;
  return Date.now() - new Date(checkedAt).getTime() < 7 * 24 * 60 * 60 * 1000;
}

// Cache mógł zostać zapisany przez wcześniejszą wersję modułu (właściciel miał
// klucz `ceidg` zamiast `activity`) — normalizujemy do bieżącego kształtu.
// Nienaprawialny wpis zwraca null, co wymusza świeże sprawdzenie.
function normalizeCachedPayload(raw: unknown): OwnerBusinessCheckPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, any>;
  if (!Array.isArray(p.owners)) return null;

  const owners: OwnerBusinessCheckOwner[] = [];
  for (const o of p.owners) {
    if (!o || typeof o !== "object") return null;
    const activity = o.activity ?? o.ceidg;
    if (!activity || typeof activity.isEntrepreneur !== "boolean") return null;
    owners.push({
      fullName: o.fullName ?? `${o.firstName ?? ""} ${o.lastName ?? ""}`.trim(),
      firstName: o.firstName ?? null,
      lastName: o.lastName ?? null,
      activity,
    });
  }

  return {
    applicationId: typeof p.applicationId === "string" ? p.applicationId : "",
    kwNumber: p.kwNumber ?? null,
    checkedAt: p.checkedAt ?? "",
    cacheUntil: p.cacheUntil ?? null,
    stale: false,
    owners,
    notes: Array.isArray(p.notes) ? p.notes : [],
    limitations: Array.isArray(p.limitations) ? p.limitations : [],
  };
}

function withCacheState(
  payload: OwnerBusinessCheckPayload,
  checkedAt: string,
): OwnerBusinessCheckPayload {
  const cacheUntil = addDays(checkedAt, 7);
  return {
    ...payload,
    checkedAt,
    cacheUntil,
    stale: !isFresh(checkedAt),
  };
}

async function getApplicationContext(applicationId: string) {
  const [{ data: app }, { data: props }] = await Promise.all([
    supabaseAdmin
      .from("loan_applications")
      .select("id, client_id")
      .eq("id", applicationId)
      .maybeSingle(),
    supabaseAdmin
      .from("properties")
      .select("land_register_number, city, voivodeship")
      .eq("loan_application_id", applicationId)
      .limit(1),
  ]);

  if (!app) throw new Error("Wniosek nie znaleziony.");

  const property = props?.[0] ?? null;
  const kwNumber = normalizeKwNumber(property?.land_register_number ?? "");
  return { app, property, kwNumber };
}

async function loadOwnersFromKw(kwNumber: string | null, clientId: string | null) {
  if (kwNumber) {
    const { data: kw } = await supabaseAdmin
      .from("kw_documents")
      .select("status, dzial_2")
      .eq("kw_number", kwNumber)
      .maybeSingle();
    if (kw?.status === "ready") {
      const owners = extractKwOwnerPersons(kw.dzial_2).map((o) => ({
        firstName: o.firstName,
        lastName: o.lastName,
        fullName: `${o.firstName} ${o.lastName}`.trim(),
      }));
      if (owners.length > 0) return owners;
    }
  }

  if (!clientId) return [];
  const { data: client } = await supabaseAdmin
    .from("clients")
    .select("first_name, last_name")
    .eq("id", clientId)
    .maybeSingle();
  const firstName = client?.first_name ?? null;
  const lastName = client?.last_name ?? null;
  if (!firstName || !lastName) return [];
  return [{ firstName, lastName, fullName: `${firstName} ${lastName}`.trim() }];
}

export async function readOwnerBusinessCheckForApplication(args: {
  supabase: SupabaseLike;
  userId: string;
  applicationId: string;
}): Promise<OwnerBusinessCheckPayload | null> {
  await assertAdminOrOperator(args.supabase, args.userId);
  const { kwNumber } = await getApplicationContext(args.applicationId);
  if (!kwNumber) return null;

  const { data: cached } = await db
    .from("kw_owners_business_check")
    .select("checked_at, payload")
    .eq("kw_number", kwNumber)
    .maybeSingle();

  if (!cached?.payload) return null;
  const normalized = normalizeCachedPayload(cached.payload);
  if (!normalized) return null;
  return withCacheState(normalized, cached.checked_at);
}

export async function refreshOwnerBusinessCheckForApplication(args: {
  supabase: SupabaseLike;
  userId: string;
  applicationId: string;
}): Promise<OwnerBusinessCheckPayload> {
  await assertAdminOrOperator(args.supabase, args.userId);
  const { app, property, kwNumber } = await getApplicationContext(args.applicationId);
  const checkedAt = new Date().toISOString();
  const notes: string[] = [];
  const limitations = [
    "Publiczne API CEIDG/CRBR/KRS nie pozwala sprawdzać osoby fizycznej po PESEL. Sprawdzenie jest wykonywane po imieniu i nazwisku właściciela z KW, więc wynik wymaga ręcznej weryfikacji przy niskiej pewności dopasowania.",
  ];

  if (!kwNumber) {
    notes.push("Brak poprawnego numeru KW — nie można pobrać właścicieli z działu II.");
    return {
      applicationId: args.applicationId,
      kwNumber: null,
      checkedAt,
      cacheUntil: null,
      stale: false,
      owners: [],
      notes,
      limitations,
    };
  }

  const ownerNames = await loadOwnersFromKw(
    kwNumber,
    (app as { client_id?: string | null }).client_id ?? null,
  );
  if (ownerNames.length === 0) {
    notes.push(
      "Nie rozpoznano właścicieli w dziale II KW — odśwież treść KW albo zweryfikuj ręcznie.",
    );
  }

  const owners: OwnerBusinessCheckOwner[] = await Promise.all(
    ownerNames.map(async (owner) => ({
      fullName: owner.fullName,
      firstName: owner.firstName,
      lastName: owner.lastName,
      activity: await lookupCeidgActivity({
        firstName: owner.firstName,
        lastName: owner.lastName,
        nip: null,
        city: property?.city ?? null,
        voivodeship: property?.voivodeship ?? null,
      }).catch((e: unknown) =>
        emptyCeidg(e instanceof Error ? e.message : "Błąd sprawdzenia CEIDG.", "name"),
      ),
    })),
  );

  const payload: OwnerBusinessCheckPayload = {
    applicationId: args.applicationId,
    kwNumber,
    checkedAt,
    cacheUntil: addDays(checkedAt, 7),
    stale: false,
    owners,
    notes,
    limitations,
  };

  await db.from("kw_owners_business_check").upsert(
    {
      kw_number: kwNumber,
      payload: payload as unknown as Json,
      checked_at: checkedAt,
      updated_at: checkedAt,
    },
    { onConflict: "kw_number" },
  );

  return payload;
}
