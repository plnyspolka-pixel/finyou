// Prezentacja profilu gospodarczego (UI i PDF) — bez zależności serwerowych.
import type {
  BusinessProfile,
  CeidgDetails,
  KrsCompanyProfile,
  VatRegistryInfo,
  WebsiteCheck,
} from "./business-profile.types";

type Row = [string, string];
const rows = (list: Array<[string, string | null | undefined | false]>): Row[] =>
  list.filter((r): r is Row => typeof r[1] === "string" && r[1].trim() !== "");

export function companyRows(c: KrsCompanyProfile): Row[] {
  const h = c.history;
  return rows([
    ["Forma prawna", c.legalForm],
    ["NIP / REGON", [c.nip, c.regon].filter(Boolean).join(" / ") || null],
    ["Rola sprawdzanej osoby", c.subjectRole],
    ["Rejestracja w KRS", c.registeredOn],
    ["Siedziba", c.seat],
    ["Kapitał zakładowy", c.capital],
    [
      "Przeważająca działalność (PKD)",
      c.mainPkd ? `${c.mainPkd}${c.pkdCount > 1 ? ` (+${c.pkdCount - 1} kodów)` : ""}` : null,
    ],
    ["Sposób reprezentacji", c.representationRule ? c.representationRule.slice(0, 300) : null],
    [
      "Wspólnicy",
      c.shareholders.length
        ? c.shareholders.map((s) => `${s.name}${s.shares ? ` — ${s.shares}` : ""}`).join("; ")
        : null,
    ],
    [
      "Beneficjenci rzeczywiści (CRBR)",
      c.beneficiaries.length
        ? c.beneficiaries
            .map((b) => `${b.name}${b.matchesSubject ? " (zgodny PESEL)" : ""}`)
            .join("; ")
        : c.crbrNote,
    ],
    [
      "Sprawozdania finansowe (wzmianki KRS)",
      c.filings.length
        ? c.filings.map((f) => `${f.period}${f.filedOn ? ` (złoż. ${f.filedOn})` : ""}`).join("; ")
        : "brak wzmianek o złożonych sprawozdaniach",
    ],
    ["Zaległe sprawozdanie", c.overdueFiling],
    ["Dział 4 (zaległości, wierzytelności)", c.dzial4.length ? c.dzial4.join("; ") : "brak wpisów"],
    [
      "Dział 6 (likwidacja, upadłość, restrukturyzacja)",
      c.dzial6.length ? c.dzial6.join("; ") : "brak wpisów",
    ],
    [
      "Historia zmian (odpis pełny)",
      h
        ? `${h.entriesTotal} wpisów, ${h.entriesLast24m} w ostatnich 24 mies. (ostatni ${h.lastEntryDate ?? "—"}); ` +
          `zmiany nazwy: ${h.nameChanges}, adresu: ${h.addressChanges}, kapitału: ${h.capitalChanges}; ` +
          `zmiany w organach (24 mies.): ${h.boardChangesLast24m}, zmiany wspólników (24 mies.): ${h.shareholderChangesLast24m}`
        : null,
    ],
    ["Strona WWW / e-mail (KRS)", [c.website, c.email].filter(Boolean).join(" · ") || null],
    ["Status", c.deleted ? "wykreślony z KRS" : null],
  ]);
}

export function vatRows(v: VatRegistryInfo): Row[] {
  return rows([
    ["Status VAT", v.statusVat],
    ["Rejestracja VAT", v.registeredOn],
    [
      "Wykreślenie z VAT",
      v.removedOn ? `${v.removedOn}${v.removalBasis ? ` — ${v.removalBasis}` : ""}` : null,
    ],
    [
      "Przywrócenie",
      v.restoredOn
        ? `${v.restoredOn}${v.restorationBasis ? ` — ${v.restorationBasis}` : ""}`
        : null,
    ],
    [
      "Odmowa rejestracji",
      v.deniedOn ? `${v.deniedOn}${v.denialBasis ? ` — ${v.denialBasis}` : ""}` : null,
    ],
    [
      "Rachunki bankowe w wykazie",
      `${v.bankAccounts}${v.hasVirtualAccounts ? " (w tym wirtualne)" : ""}`,
    ],
    ["Reprezentanci", v.representatives.join("; ") || null],
    ["Prokurenci", v.authorizedClerks.join("; ") || null],
    ["Wspólnicy", v.partners.join("; ") || null],
  ]);
}

export function ceidgRows(c: CeidgDetails): Row[] {
  return rows([
    ["Firma", c.name],
    ["NIP / REGON", [c.nip, c.regon].filter(Boolean).join(" / ") || null],
    ["Status", c.status],
    ["Rozpoczęcie", c.startDate],
    [
      "Zawieszenie / wznowienie",
      c.suspendedOn
        ? `${c.suspendedOn}${c.resumedOn ? ` → ${c.resumedOn}` : " (bez wznowienia)"}`
        : null,
    ],
    ["Zakończenie / wykreślenie", [c.endedOn, c.deletedOn].filter(Boolean).join(" / ") || null],
    ["Główne PKD", c.mainPkd],
    ["Pozostałe PKD", c.pkd.length > 1 ? `${c.pkd.length} kodów` : null],
    ["Wspólność majątkowa małżeńska", c.maritalCommunity],
    ["Miejsce działalności", c.businessCity],
    ["Adres do doręczeń elektronicznych", c.hasEDeliveryAddress ? "tak" : null],
    ["Spółki cywilne (NIP)", c.civilPartnershipNips.join(", ") || null],
    ["Strona WWW", c.website],
  ]);
}

export function websiteRows(w: WebsiteCheck): Row[] {
  return rows([
    ["Adres (wg rejestru)", `${w.url} — ${w.declaredIn}`],
    [
      "Dostępność",
      w.robotsAllowed
        ? w.reachable
          ? `działa (HTTP ${w.httpStatus}${w.https ? ", HTTPS" : ", bez HTTPS"})`
          : `nie działa${w.httpStatus ? ` (HTTP ${w.httpStatus})` : ""}`
        : "nie pobrano (robots.txt)",
    ],
    ["Tytuł strony", w.title],
    ["NIP / KRS na stronie", [...w.nipOnSite, ...w.krsOnSite].join(", ") || null],
    [
      "Zgodność z rejestrem",
      w.identifiersMatch == null ? null : w.identifiersMatch ? "zgodne" : "NIEZGODNE",
    ],
    [
      "Dokumenty finansowe na stronie",
      w.financialDocs.length ? w.financialDocs.map((d) => `${d.label}: ${d.url}`).join("; ") : null,
    ],
    ["Uwagi", w.note],
  ]);
}

export function profileHeadline(p: BusinessProfile): string {
  const alerts = p.flags.filter((f) => f.level === "alert").length;
  const warns = p.flags.filter((f) => f.level === "warning").length;
  return (
    `${p.role === "client" ? "Pożyczkobiorca" : p.kind === "company" ? "Podmiot" : "Właściciel"}: ${p.subject}` +
    (alerts || warns
      ? ` — sygnały: ${alerts} krytycznych, ${warns} ostrzeżeń`
      : " — brak sygnałów ostrzegawczych")
  );
}
