// Analiza WSPÓŁWŁAŚCICIELI z działu II księgi wieczystej — silnik modułu
// (osobna karta wniosku, niezależna od oceny ryzyka).
// Dla każdej osoby fizycznej wpisanej w dziale II (identyfikowanej po PESEL
// z KW) sprawdzamy dwa rejestry:
//   1) CEIDG — czy osoba prowadzi działalność gospodarczą (JDG); gdy CEIDG
//      nie potwierdzi (także przy odmowie API) — wykaz podatników VAT MF,
//      po NIP klienta albo po NIP znalezionym w sieci i zweryfikowanym,
//   2) KRS — czy osobę da się znaleźć w KRS (zarząd/wspólnik/prokurent…),
//      z twardą weryfikacją odpisem po numerze PESEL.
// RODO: w zapisywanym wyniku PESEL występuje wyłącznie zamaskowany.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { compactKwNumber } from "@/lib/kw";
import { parsePesel } from "@/lib/risk-assessment/pesel";
import { proceedingStatusLabel } from "./court-proceeding-format";
import { parseOwners } from "@/lib/risk-assessment/kw-parse-core";
import { lookupCeidgActivity, emptyCeidg } from "@/lib/risk-assessment/ceidg-lookup.server";
import { findBusinessInVatWhiteList } from "@/lib/risk-assessment/vat-whitelist.server";
import type { CeidgActivity } from "@/lib/risk-assessment/types";
import { mergeKwOwners, maskPesel, personNamesOverlap } from "./core";
import { searchKrsForPerson, emptyKrsCheck } from "./krs-person-search.server";
import type { CoOwnersAnalysis, CoOwnerRegistryCheck } from "./types";
import {
  checkOwnerPublicIntelligence,
  extractCompanyOwnersFromKw,
  type OwnerIntelligenceInput,
} from "./owner-intelligence.server";
import type { OwnerIntelligenceReport } from "./owner-intelligence.types";
import { buildBusinessProfiles, type BusinessProfileSubject } from "./business-profile.server";
import type { BusinessProfile } from "./business-profile.types";

function emptyAnalysis(kwNumber: string | null, summary: string): CoOwnersAnalysis {
  return {
    available: false,
    kwNumber,
    generatedAt: new Date().toISOString(),
    totalOwnersInKw: 0,
    checked: [],
    warnings: [],
    summary,
    intelligence: null,
  };
}

/**
 * Działalność gospodarcza osoby: CEIDG, a gdy nie potwierdzi (brak wpisu,
 * odmowa API) — wykaz podatników VAT MF. Notatka CEIDG zostaje w wyniku.
 */
/** Wejście KRZ/MSiG dla pożyczkobiorcy z wniosku (null, gdy brak nazwiska). */
function clientIntelligenceInput(args: {
  primaryClientName?: string | null;
  primaryClientNip?: string | null;
  primaryClientPesel?: string | null;
}): OwnerIntelligenceInput | null {
  const name = (args.primaryClientName ?? "").trim().replace(/\s+/g, " ");
  if (name.split(" ").length < 2) return null;
  const pesel = args.primaryClientPesel && parsePesel(args.primaryClientPesel).valid
    ? args.primaryClientPesel
    : null;
  const nip = /^\d{10}$/.test((args.primaryClientNip ?? "").replace(/\D/g, ""))
    ? (args.primaryClientNip ?? "").replace(/\D/g, "")
    : null;
  const [firstName, ...rest] = name.split(" ");
  return { kind: "person", name, firstName, lastName: rest.join(" "), pesel, nip, role: "client" };
}

/**
 * Ostrzeżenia z wywiadu KRZ/MSiG: każde ogłoszenie sądowe jest sygnałem dla
 * operatora; brak pełnego sprawdzenia pożyczkobiorcy też (nie jest „czysto").
 */
export function intelligenceWarnings(report: OwnerIntelligenceReport | null | undefined): string[] {
  if (!report) return ["KRZ/MSiG: wywiad nie został wykonany (błąd) — sprawdź pożyczkobiorcę ręcznie w KRZ i MSiG."];
  const out: string[] = [];
  for (const s of report.subjects) {
    const who = s.role === "client" ? `Pożyczkobiorca ${s.name}` : s.name;
    for (const h of s.hits.filter((x) => x.category === "court_notice")) {
      out.push(
        `${who}: ${h.title}${h.caseSignature ? ` (sygn. ${h.caseSignature})` : ""}${h.publicationDate ? `, ${h.publicationDate}` : ""} — ` +
          (h.match === "identifier"
            ? `zgodny identyfikator (PESEL/NIP/KRS).${h.proceeding ? ` Postępowanie: ${proceedingStatusLabel[h.proceeding.status]} — ${h.proceeding.statusNote}` : ""}`
            : "zgodność tylko po nazwisku — zweryfikuj tożsamość."),
      );
    }
    if (s.role === "client" && s.courtStatus !== "checked")
      out.push(
        s.courtNote.startsWith("Oficjalny MSiG")
          ? `${who}: sprawdzono w oficjalnym MSiG; KRZ (krz.ms.gov.pl) wymaga ręcznego sprawdzenia przed decyzją.`
          : `${who}: KRZ/MSiG niesprawdzone (${s.courtNote.split(" | ")[0]}) — przed decyzją sprawdź ręcznie w MSiG i KRZ (krz.ms.gov.pl).`,
      );
  }
  if (!report.subjects.some((s) => s.role === "client"))
    out.push("KRZ/MSiG: pożyczkobiorca nie został sprawdzony (brak imienia i nazwiska klienta we wniosku).");
  return out;
}

async function lookupBusiness(args: {
  firstName: string | null;
  lastName: string | null;
  nip: string | null;
  city: string | null;
  voivodeship: string | null;
}): Promise<CeidgActivity> {
  const ceidg = await lookupCeidgActivity(args).catch((e: any) =>
    emptyCeidg(`Błąd sprawdzenia CEIDG: ${e?.message ?? "nieznany"}.`),
  );
  if (ceidg.isEntrepreneur) return ceidg;
  const vat = await findBusinessInVatWhiteList(args).catch(() => null);
  if (vat) {
    return ceidg.available ? vat : { ...vat, note: `${vat.note} (CEIDG niedostępne.)` };
  }
  if (!ceidg.available) {
    return {
      ...ceidg,
      note: `${ceidg.note} Wykaz podatników VAT: nie znaleziono działalności${args.nip ? ` dla NIP ${args.nip}` : " (brak NIP klienta)"}.`,
    };
  }
  return ceidg;
}

/** Ostrzeżenia z profilu gospodarczego (sygnały alert/warning). */
export function businessProfileWarnings(profiles: BusinessProfile[]): string[] {
  return profiles.flatMap((p) =>
    p.flags
      .filter((f) => f.level !== "info")
      .map((f) => `${p.role === "client" ? "Pożyczkobiorca" : "Profil gospodarczy"} — ${f.source}: ${f.text}`),
  );
}

/** Pożyczkobiorca spoza działu II KW — CEIDG/wykaz VAT i KRS do profilu gospodarczego. */
async function clientBusinessSubject(
  client: OwnerIntelligenceInput,
  args: { city?: string | null; voivodeship?: string | null },
): Promise<BusinessProfileSubject> {
  const pesel = client.pesel ? parsePesel(client.pesel) : null;
  const [ceidg, krs] = await Promise.all([
    lookupBusiness({
      firstName: client.firstName ?? null,
      lastName: client.lastName ?? null,
      nip: client.nip ?? null,
      city: args.city ?? null,
      voivodeship: args.voivodeship ?? null,
    }),
    searchKrsForPerson({
      firstName: client.firstName ?? null,
      lastName: client.lastName ?? null,
      pesel: pesel?.valid ? client.pesel! : null,
      birthYear: pesel?.birthDate ? Number(pesel.birthDate.slice(0, 4)) : null,
      city: args.city ?? null,
      voivodeship: args.voivodeship ?? null,
    }).catch(() => emptyKrsCheck("KRS niedostępny.")),
  ]);
  return {
    subject: client.name,
    role: "client",
    kind: "person",
    pesel: pesel?.valid ? client.pesel : null,
    nip: client.nip ?? (ceidg.matchConfidence !== "low" ? ceidg.company?.nip : null) ?? null,
    krs: krs.hits.map((h) => ({ krs: h.krs, role: h.role })),
  };
}

export async function analyzeCoOwners(args: {
  kwNumber: string | null;
  /** Imię i nazwisko klienta wniosku — do oznaczenia jego wiersza. */
  primaryClientName?: string | null;
  /** NIP klienta wniosku (kartoteka / wniosek) — sprawdzany przy jego wierszu. */
  primaryClientNip?: string | null;
  /** PESEL klienta wniosku (kartoteka) — identyfikator do KRZ/MSiG. */
  primaryClientPesel?: string | null;
  city?: string | null;
  voivodeship?: string | null;
}): Promise<CoOwnersAnalysis> {
  // kw_documents.kw_number przechowuje formę kompaktową (13 znaków).
  const kw =
    compactKwNumber(args.kwNumber) ?? (args.kwNumber ?? "").replace(/\s|\//g, "").toUpperCase();
  // Pożyczkobiorca jest sprawdzany w KRZ/MSiG ZAWSZE — także gdy nie figuruje
  // w dziale II KW (inna pisownia nazwiska, nieruchomość osoby trzeciej) i gdy
  // treść KW jest niedostępna.
  const clientInput = clientIntelligenceInput(args);
  const clientOnly = async (kwNumber: string | null, summary: string) => ({
    ...emptyAnalysis(kwNumber, summary),
    ...(clientInput
      ? await (async () => {
          const [intelligence, businessProfiles] = await Promise.all([
            checkOwnerPublicIntelligence([clientInput]).catch(() => null),
            clientBusinessSubject(clientInput, args)
              .then((s) => buildBusinessProfiles([s]))
              .catch(() => [] as BusinessProfile[]),
          ]);
          return {
            intelligence,
            businessProfiles,
            warnings: [...intelligenceWarnings(intelligence), ...businessProfileWarnings(businessProfiles)],
          };
        })()
      : {}),
  });
  if (!kw) return clientOnly(null, "Brak numeru KW — nie przeanalizowano współwłaścicieli.");

  const { data: row } = await supabaseAdmin
    .from("kw_documents")
    .select("status, dzial_2")
    .eq("kw_number", kw)
    .maybeSingle();
  // Zapisany dział II analizujemy nawet przy statusie błędu odświeżenia —
  // raz pobrana treść pozostaje dostępna.
  if (!row || (row.status !== "ready" && !row.dzial_2)) {
    return clientOnly(
      kw,
      "Treść działu II KW niedostępna — pobierz księgę wieczystą i uruchom sprawdzenie ponownie.",
    );
  }

  const totalOwnersInKw = parseOwners(row.dzial_2).length;
  const owners = mergeKwOwners(row.dzial_2);
  // Osoby prawne też są właścicielami; dotychczasowa analiza CEIDG/KRS
  // dotyczyła tylko osób fizycznych. Wywiad obejmuje oba typy podmiotów.
  const companies = extractCompanyOwnersFromKw(row.dzial_2);
  const ownerInputs: OwnerIntelligenceInput[] = owners.map((o) => {
    const isClient = personNamesOverlap(args.primaryClientName, o.fullName);
    return {
      kind: "person" as const,
      name: o.fullName,
      firstName: o.firstName,
      lastName: o.lastName,
      pesel: parsePesel(o.pesel).valid ? o.pesel : isClient ? (clientInput?.pesel ?? null) : null,
      nip: isClient ? args.primaryClientNip : null,
      role: isClient ? ("client" as const) : ("owner" as const),
    };
  });
  const clientAmongOwners = ownerInputs.some((o) => o.role === "client");
  const intelligencePromise = checkOwnerPublicIntelligence([
    ...ownerInputs,
    ...companies,
    ...(clientInput && !clientAmongOwners ? [clientInput] : []),
  ]).catch((e: unknown) => {
    console.error("[coowners] owner intelligence failed", e instanceof Error ? e.message : "unknown");
    return null;
  });
  const companySubjects: BusinessProfileSubject[] = companies.map((c) => ({
    subject: c.name,
    role: "owner",
    kind: "company",
    nip: c.nip ?? null,
    krs: c.krs ? [{ krs: c.krs, role: "właściciel nieruchomości (dział II KW)" }] : [],
  }));
  const clientSubjectPromise: Promise<BusinessProfileSubject | null> =
    clientInput && !clientAmongOwners
      ? clientBusinessSubject(clientInput, args).catch(() => null)
      : Promise.resolve(null);
  if (owners.length === 0) {
    const clientSubject = await clientSubjectPromise;
    const [intelligence, businessProfiles] = await Promise.all([
      intelligencePromise,
      buildBusinessProfiles([...(clientSubject ? [clientSubject] : []), ...companySubjects]).catch(() => [] as BusinessProfile[]),
    ]);
    return {
      available: true,
      kwNumber: kw,
      generatedAt: new Date().toISOString(),
      totalOwnersInKw,
      checked: [],
      warnings: [...intelligenceWarnings(intelligence), ...businessProfileWarnings(businessProfiles)],
      businessProfiles,
      summary: companies.length
        ? `Dział II KW: zidentyfikowano ${companies.length} podmiotów prawnych do sprawdzenia w rejestrach.`
        : "W dziale II KW nie rozpoznano właścicieli do sprawdzenia.",
      intelligence,
    };
  }

  const checked: CoOwnerRegistryCheck[] = await Promise.all(
    owners.map(async (o): Promise<CoOwnerRegistryCheck> => {
      const pesel = parsePesel(o.pesel);
      const notes: string[] = [];
      if (o.pesel && !pesel.valid) {
        notes.push(`PESEL z działu II KW nie przechodzi walidacji (${pesel.error ?? "błąd"}).`);
      }
      if (!o.pesel) {
        notes.push(
          "Brak numeru PESEL przy tej osobie w dziale II KW — sprawdzenie wyłącznie po imieniu i nazwisku.",
        );
      }

      const isPrimary = personNamesOverlap(args.primaryClientName, o.fullName);
      const nip = isPrimary ? (args.primaryClientNip ?? null) : null;
      const [ceidg, krs] = await Promise.all([
        lookupBusiness({
          firstName: o.firstName,
          lastName: o.lastName,
          nip,
          city: args.city ?? null,
          voivodeship: args.voivodeship ?? null,
        }),
        searchKrsForPerson({
          firstName: o.firstName,
          lastName: o.lastName,
          pesel: pesel.valid ? o.pesel : null,
          birthYear: pesel.birthDate ? Number(pesel.birthDate.slice(0, 4)) : null,
          city: args.city ?? null,
          voivodeship: args.voivodeship ?? null,
        }).catch((e: any) => emptyKrsCheck(`Błąd sprawdzenia KRS: ${e?.message ?? "nieznany"}.`)),
      ]);

      return {
        fullName: o.fullName,
        share: o.share,
        coOwnershipType: o.coOwnershipType,
        peselMasked: maskPesel(o.pesel),
        peselValid: pesel.valid,
        birthDate: pesel.birthDate,
        age: pesel.age,
        sex: pesel.sex,
        isPrimaryClient: isPrimary,
        ceidg,
        krs,
        notes,
      };
    }),
  );

  // Ostrzeżenia zbiorcze — twarde sygnały dla operatora.
  const warnings: string[] = [];
  for (const c of checked) {
    const who = c.fullName ?? "współwłaściciel";
    for (const h of c.krs.hits) {
      if (h.flags.bankruptcy)
        warnings.push(
          `Współwłaściciel ${who}: podmiot ${h.companyName} (KRS ${h.krs}) w upadłości.`,
        );
      else if (h.flags.liquidation)
        warnings.push(
          `Współwłaściciel ${who}: podmiot ${h.companyName} (KRS ${h.krs}) w likwidacji.`,
        );
      else if (h.flags.restructuring)
        warnings.push(
          `Współwłaściciel ${who}: podmiot ${h.companyName} (KRS ${h.krs}) w restrukturyzacji.`,
        );
    }
    if (c.ceidg.status === "zawieszony")
      warnings.push(`Współwłaściciel ${who}: działalność w CEIDG zawieszona.`);
  }
  // Brak potwierdzonej działalności — pożyczka dla przedsiębiorcy wymaga
  // ustalenia NIP. Dotyczy klienta wniosku (albo wszystkich, gdy go nie
  // rozpoznano w dziale II).
  const anyPrimary = checked.some((c) => c.isPrimaryClient);
  for (const c of checked) {
    if (c.ceidg.isEntrepreneur || (anyPrimary && !c.isPrimaryClient)) continue;
    warnings.push(
      `${c.fullName ?? "Właściciel"}: nie potwierdzono działalności gospodarczej (CEIDG, wykaz podatników VAT). ` +
        "Inwestor musi zażądać NIP i sprawdzić go w CEIDG — bez potwierdzonego NIP nie zawierać umowy.",
    );
  }

  const withDg = checked.filter((c) => c.ceidg.isEntrepreneur).length;
  const inKrs = checked.filter((c) => c.krs.found).length;
  const summary =
    `Dział II KW: ${totalOwnersInKw} podmiotów, sprawdzono ${checked.length} osób fizycznych. ` +
    `Działalność gospodarcza (CEIDG): ${withDg ? `${withDg} os.` : "nie stwierdzono"}. ` +
    `Obecność w KRS: ${inKrs ? `${inKrs} os.` : "nie stwierdzono"}.`;

  const personSubjects: BusinessProfileSubject[] = checked.map((c, i) => {
    const o = owners[i];
    const pesel = parsePesel(o.pesel).valid ? o.pesel : null;
    const confirmedNip = c.ceidg.isEntrepreneur || c.ceidg.matchConfidence === "high" ? c.ceidg.company?.nip : null;
    return {
      subject: c.fullName ?? "Właściciel",
      role: c.isPrimaryClient ? "client" : "owner",
      kind: "person",
      pesel: pesel ?? (c.isPrimaryClient ? (clientInput?.pesel ?? null) : null),
      nip: confirmedNip ?? (c.isPrimaryClient ? (args.primaryClientNip ?? null) : null),
      krs: c.krs.hits.map((h) => ({ krs: h.krs, role: h.role })),
    };
  });
  const clientSubject = await clientSubjectPromise;
  const [intelligence, businessProfiles] = await Promise.all([
    intelligencePromise,
    buildBusinessProfiles([...(clientSubject ? [clientSubject] : []), ...personSubjects, ...companySubjects]).catch(
      () => [] as BusinessProfile[],
    ),
  ]);
  warnings.push(...intelligenceWarnings(intelligence), ...businessProfileWarnings(businessProfiles));

  return {
    available: true,
    kwNumber: kw,
    generatedAt: new Date().toISOString(),
    totalOwnersInKw,
    checked,
    warnings,
    summary,
    intelligence,
    businessProfiles,
  };
}
