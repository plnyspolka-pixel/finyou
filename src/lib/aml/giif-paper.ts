// Zawiadomienie do GIIF w postaci papierowej — dokument HTML do wydruku
// (pełne polskie znaki; „Drukuj → Zapisz jako PDF" w przeglądarce).
//
// Status prawny (stan na 09.2026): ustawa AML (t.j. Dz.U. 2025 poz. 644)
// i rozporządzenie MF z 4.10.2018 (Dz.U. 2018 poz. 1946) przewidują
// przekazywanie informacji i zawiadomień do GIIF środkami komunikacji
// elektronicznej (SI*GIIF, kwalifikowany podpis / pieczęć). Papier NIE jest
// równoważnym kanałem — to ścieżka awaryjna (brak podpisu kwalifikowanego,
// niedostępność SI*GIIF), którą trzeba udokumentować i jak najszybciej
// uzupełnić zgłoszeniem elektronicznym. Informacji o transakcjach
// ponadprogowych (art. 72) papier nie realizuje.
import { TRANSACTION_TYPE_LABELS, type GiifReportPayload } from "@/lib/aml/aml-types";

export const GIIF_POSTAL_ADDRESS = [
  "Generalny Inspektor Informacji Finansowej",
  "Ministerstwo Finansów",
  "ul. Świętokrzyska 12",
  "00-916 Warszawa",
];

export const AML_ACT_CITATION =
  "ustawy z dnia 1 marca 2018 r. o przeciwdziałaniu praniu pieniędzy oraz finansowaniu terroryzmu (t.j. Dz.U. z 2025 r. poz. 644)";

const LEGAL_BASIS: Record<GiifReportPayload["reportType"], string> = {
  transakcja_ponadprogowa: "art. 72 ust. 1",
  okolicznosci_podejrzane: "art. 74 ust. 1",
  planowana_transakcja_podejrzana: "art. 86 ust. 1",
  transakcja_przeprowadzona: "art. 89",
};

const TITLES: Record<GiifReportPayload["reportType"], string> = {
  transakcja_ponadprogowa: "Informacja o transakcji ponadprogowej",
  okolicznosci_podejrzane:
    "Zawiadomienie o okolicznościach mogących wskazywać na podejrzenie popełnienia przestępstwa prania pieniędzy lub finansowania terroryzmu",
  planowana_transakcja_podejrzana:
    "Zawiadomienie o transakcji, co do której zachodzi uzasadnione podejrzenie związku z praniem pieniędzy lub finansowaniem terroryzmu",
  transakcja_przeprowadzona:
    "Zawiadomienie o przeprowadzonej transakcji, co do której zachodzi uzasadnione podejrzenie związku z praniem pieniędzy lub finansowaniem terroryzmu",
};

/** Czy dla danego rodzaju papier w ogóle ma sens (art. 72 — tylko elektronicznie). */
export function paperAllowedFor(reportType: GiifReportPayload["reportType"]): boolean {
  return reportType !== "transakcja_ponadprogowa";
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n: number, cur: string): string {
  return `${n.toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;
}

function row(label: string, value: unknown): string {
  if (value == null || value === "") return "";
  return `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`;
}

export function buildGiifPaperNoticeHtml(
  p: GiifReportPayload,
  meta: { reportId: string; version: number; reason: string; date: string },
): string {
  const inst = p.institution;
  const person = p.signerPerson ?? p.responsiblePerson;
  const place = inst.city || "";
  const basis = LEGAL_BASIS[p.reportType];

  const customer = p.customer
    ? `<h2>2. Podmiot zawiadomienia</h2>
<table>${row("Imię i nazwisko / nazwa", p.customer.name)}${row(
        "Rodzaj",
        p.customer.entityType === "firma" ? "podmiot niebędący osobą fizyczną" : "osoba fizyczna",
      )}${row("PESEL", p.customer.pesel)}${row("NIP", p.customer.nip)}${row(
        "Data urodzenia",
        p.customer.dob,
      )}${row("Adres", p.customer.address)}${row("Kraj zamieszkania / siedziby", p.customer.countryResidence)}${row(
        "Reprezentanci",
        (p.customer.representatives ?? [])
          .map((r) => r.name + (r.role ? ` (${r.role})` : ""))
          .join("; "),
      )}${row(
        "Beneficjenci rzeczywiści",
        (p.customer.beneficialOwners ?? [])
          .map((b) => b.name + (b.sharePct != null ? ` (${b.sharePct}%)` : ""))
          .join("; "),
      )}</table>`
    : `<h2>2. Podmiot zawiadomienia</h2><p class="blank">………………………………………………………………</p>`;

  const parties = p.parties.filter((s) => s.role !== "instytucja_obowiazana");
  const partiesHtml = parties.length
    ? `<h2>3. Strony</h2><table class="grid"><tr><th>Rola</th><th>Nazwa</th><th>Rachunek</th><th>Kraj</th></tr>${parties
        .map(
          (s) =>
            `<tr><td>${esc(s.role)}</td><td>${esc(s.name)}</td><td>${esc(s.account ?? "")}</td><td>${esc(s.country ?? "")}</td></tr>`,
        )
        .join("")}</table>`
    : "";

  const txHtml = p.transactions.length
    ? `<h2>4. Transakcje</h2><table class="grid"><tr><th>Data</th><th>Rodzaj</th><th>Kwota</th><th>Równowartość EUR (NBP)</th><th>Rachunki</th></tr>${p.transactions
        .map(
          (t) =>
            `<tr><td>${esc(t.date)}</td><td>${esc(TRANSACTION_TYPE_LABELS[t.type as keyof typeof TRANSACTION_TYPE_LABELS] ?? t.type)}${t.description ? `<br><small>${esc(t.description)}</small>` : ""}</td><td>${esc(
              money(t.amount, t.currency),
            )}</td><td>${
              t.eurEquivalent != null
                ? esc(
                    `${money(t.eurEquivalent, "EUR")} (kurs ${t.nbpRate ?? "-"}, tab. ${t.nbpTableNo ?? "-"})`,
                  )
                : ""
            }</td><td>${esc([t.senderAccount, t.receiverAccount].filter(Boolean).join(" → "))}</td></tr>`,
        )
        .join("")}</table>`
    : "";

  const contract =
    p.contract?.ref || p.contract?.date
      ? `<p><b>Umowa:</b> ${esc(p.contract.ref ?? "")}${p.contract.date ? ` z dnia ${esc(p.contract.date)}` : ""}${
          p.contract.amount != null
            ? `, kwota ${esc(money(p.contract.amount, p.contract.currency ?? "PLN"))}`
            : ""
        }</p>`
      : "";

  const attachments = (p.attachments ?? []).length
    ? `<h2>Załączniki</h2><ol>${(p.attachments ?? [])
        .map((a) => `<li>${esc(a.fileName)}</li>`)
        .join("")}</ol>`
    : "";

  return `<!doctype html>
<html lang="pl"><head><meta charset="utf-8">
<title>Zawiadomienie GIIF ${esc(meta.reportId.slice(0, 8))}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: "Times New Roman", Georgia, serif; font-size: 11.5pt; color: #000; background: #fff; max-width: 180mm; margin: 0 auto; line-height: 1.4; }
  .top { display: flex; justify-content: space-between; gap: 16px; }
  .addr { margin: 18px 0 18px auto; width: 75mm; }
  .conf { border: 2px solid #000; padding: 4px 8px; font-weight: bold; text-transform: uppercase; font-size: 10pt; display: inline-block; }
  h1 { font-size: 13pt; text-align: center; margin: 18px 0 4px; }
  .basis { text-align: center; font-size: 10.5pt; margin-bottom: 14px; }
  h2 { font-size: 11.5pt; margin: 14px 0 4px; border-bottom: 1px solid #000; }
  table { border-collapse: collapse; width: 100%; }
  th { text-align: left; font-weight: normal; color: #333; width: 42%; padding: 2px 6px 2px 0; vertical-align: top; }
  td { padding: 2px 0; vertical-align: top; }
  table.grid th, table.grid td { border: 1px solid #000; padding: 3px 5px; width: auto; font-size: 10pt; }
  .just { white-space: pre-wrap; border: 1px solid #000; padding: 6px 8px; min-height: 30mm; }
  .blank { color: #666; }
  .sign { margin-top: 28mm; display: flex; justify-content: flex-end; }
  .sign div { width: 80mm; text-align: center; border-top: 1px dotted #000; padding-top: 4px; font-size: 10pt; }
  .meta { margin-top: 12mm; font-size: 8.5pt; color: #444; }
  @media print { .noprint { display: none; } }
  .noprint { background: #fff8e1; border: 1px solid #e0b000; padding: 8px 10px; margin: 10px 0; font-family: system-ui, sans-serif; font-size: 10pt; }
</style></head><body>
<div class="noprint">Wydrukuj (Ctrl+P), podpisz własnoręcznie i wyślij listem poleconym za potwierdzeniem odbioru. Zachowaj kopię oraz dowód nadania i wgraj je w module AML.</div>
<div class="top">
  <div>${esc(inst.name)}<br>${esc(inst.address)}${inst.postalCode || inst.city ? `<br>${esc(`${inst.postalCode ?? ""} ${inst.city ?? ""}`.trim())}` : ""}<br>NIP: ${esc(inst.nip)}${inst.krs ? `, KRS: ${esc(inst.krs)}` : ""}${inst.regon ? `, REGON: ${esc(inst.regon)}` : ""}</div>
  <div>${esc(place)}${place ? ", " : ""}dnia ${esc(meta.date)}</div>
</div>
<div class="addr">${GIIF_POSTAL_ADDRESS.map(esc).join("<br>")}</div>
<span class="conf">Poufne — informacja objęta tajemnicą (art. 54 ustawy AML)</span>
<h1>${esc(TITLES[p.reportType])}</h1>
<div class="basis">na podstawie ${esc(basis)} ${esc(AML_ACT_CITATION)}</div>

<h2>1. Instytucja obowiązana i osoba do kontaktu</h2>
<table>${row("Nazwa", inst.name)}${row("NIP", inst.nip)}${row("Adres", [inst.address, inst.postalCode, inst.city].filter(Boolean).join(", "))}${row(
    "Osoba odpowiedzialna (art. 8 ustawy)",
    `${p.responsiblePerson.firstName} ${p.responsiblePerson.lastName}${p.responsiblePerson.jobTitle ? `, ${p.responsiblePerson.jobTitle}` : ""}`,
  )}${row("Telefon / e-mail", [p.responsiblePerson.phone, p.responsiblePerson.email].filter(Boolean).join(" / "))}</table>

${customer}
${partiesHtml}
${txHtml}
${contract}

<h2>5. Uzasadnienie (opis okoliczności)</h2>
<div class="just">${esc(p.justification ?? "")}</div>

<h2>6. Forma przekazania</h2>
<p>Zawiadomienie przekazuję w postaci papierowej, ponieważ nie było możliwe przekazanie go za pomocą środków komunikacji elektronicznej (SI*GIIF). Przyczyna: ${esc(meta.reason.replace(/\.+$/, ""))}.</p>
${attachments}

<div class="sign"><div>${esc(`${person.firstName} ${person.lastName}`)}${person.jobTitle ? `<br>${esc(person.jobTitle)}` : ""}<br>(podpis własnoręczny osoby uprawnionej)</div></div>

<div class="meta">Identyfikator zgłoszenia: ${esc(meta.reportId)} · wersja ${meta.version}</div>
</body></html>`;
}
