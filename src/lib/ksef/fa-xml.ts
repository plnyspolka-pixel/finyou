// Generator XML faktury w uproszczonym schemacie FA(2) KSeF.
// Uwaga: to reprezentatywny podzbiór schematu FA_VAT — przed produkcją zwaliduj
// względem oficjalnego XSD Ministerstwa Finansów dla wybranej wersji (FA(2)/FA(3)).

export type InvoiceItem = {
  name: string;
  quantity: number;
  unit?: string;
  unitNet: number;
  vatRate: string; // '23','8','5','0','zw'
};

export type FaEntity = {
  legal_name: string;
  nip?: string | null;
  address_street?: string | null;
  address_postal_code?: string | null;
  address_city?: string | null;
  address_country?: string | null;
};

export type FaInvoice = {
  invoice_number: string;
  issue_date: string; // YYYY-MM-DD
  sale_date?: string | null;
  currency: string;
  buyer_name?: string | null;
  buyer_nip?: string | null;
  buyer_street?: string | null;
  buyer_city?: string | null;
  buyer_postal_code?: string | null;
  buyer_country?: string | null;
  items: InvoiceItem[];
  net_amount: number;
  vat_amount: number;
  gross_amount: number;
  /** Podstawa zwolnienia z VAT (P_19A) — wymagana, gdy pozycja ma stawkę „zw”. */
  vat_exemption_basis?: string | null;
};

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function num(n: number): string {
  return (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
}

function vatRateValue(rate: string): { stawka: string; netToVat: (net: number) => number } {
  if (rate === "zw" || rate === "0")
    return { stawka: rate === "zw" ? "zw" : "0", netToVat: () => 0 };
  const pct = Number(rate) || 0;
  return { stawka: String(pct), netToVat: (net) => Math.round(net * pct) / 100 };
}

function hasExempt(invoice: FaInvoice): boolean {
  return invoice.items.some((it) => it.vatRate === "zw");
}

/**
 * Sumy netto/VAT w polach właściwych dla stawki (FA(2)):
 * 23/22 → P_13_1/P_14_1, 8/7 → P_13_2/P_14_2, 5 → P_13_3/P_14_3,
 * 0 → P_13_6_1, zw → P_13_7 (sprzedaż zwolniona, bez VAT).
 */
function totalsByRate(invoice: FaInvoice): string[] {
  const groups = new Map<string, { net: number; vat: number }>();
  for (const it of invoice.items) {
    const net = Math.round(it.quantity * it.unitNet * 100) / 100;
    const key =
      it.vatRate === "zw" ? "7" : it.vatRate === "0" ? "6_1"
      : ["23", "22"].includes(it.vatRate) ? "1"
      : ["8", "7"].includes(it.vatRate) ? "2"
      : it.vatRate === "5" ? "3" : "1";
    const g = groups.get(key) ?? { net: 0, vat: 0 };
    g.net += net;
    g.vat += vatRateValue(it.vatRate).netToVat(net);
    groups.set(key, g);
  }
  // Jedna stawka: bierzemy sumy z faktury (zgodne z zaokrągleniem na fakturze).
  if (groups.size === 1) {
    const [k] = [...groups.keys()];
    groups.set(k, { net: invoice.net_amount, vat: invoice.vat_amount });
  }
  const out: string[] = [];
  for (const k of ["1", "2", "3", "6_1", "7"]) {
    const g = groups.get(k);
    if (!g) continue;
    out.push(`    <P_13_${k}>${num(g.net)}</P_13_${k}>`);
    if (["1", "2", "3"].includes(k)) out.push(`    <P_14_${k}>${num(g.vat)}</P_14_${k}>`);
  }
  return out;
}

/** Buduje XML faktury FA(2). */
export function buildFaXml(invoice: FaInvoice, seller: FaEntity): string {
  const rows = invoice.items
    .map((it, i) => {
      const net = Math.round(it.quantity * it.unitNet * 100) / 100;
      const { stawka } = vatRateValue(it.vatRate);
      return [
        "      <FaWiersz>",
        `        <NrWierszaFa>${i + 1}</NrWierszaFa>`,
        `        <P_7>${esc(it.name)}</P_7>`,
        `        <P_8A>${esc(it.unit ?? "szt.")}</P_8A>`,
        `        <P_8B>${num(it.quantity)}</P_8B>`,
        `        <P_9A>${num(it.unitNet)}</P_9A>`,
        `        <P_11>${num(net)}</P_11>`,
        `        <P_12>${esc(stawka)}</P_12>`,
        "      </FaWiersz>",
      ].join("\n");
    })
    .join("\n");

  const today = invoice.issue_date;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">',
    "  <Naglowek>",
    '    <KodFormularza kodSystemowy="FA (2)" wersjaSchemy="1-0E">FA</KodFormularza>',
    "    <WariantFormularza>2</WariantFormularza>",
    `    <DataWytworzeniaFa>${esc(today)}T00:00:00Z</DataWytworzeniaFa>`,
    "  </Naglowek>",
    "  <Podmiot1>",
    "    <DaneIdentyfikacyjne>",
    `      <NIP>${esc(seller.nip ?? "")}</NIP>`,
    `      <Nazwa>${esc(seller.legal_name)}</Nazwa>`,
    "    </DaneIdentyfikacyjne>",
    "    <Adres>",
    `      <KodKraju>${esc(seller.address_country ?? "PL")}</KodKraju>`,
    `      <AdresL1>${esc(seller.address_street ?? "")}</AdresL1>`,
    `      <AdresL2>${esc(`${seller.address_postal_code ?? ""} ${seller.address_city ?? ""}`.trim())}</AdresL2>`,
    "    </Adres>",
    "  </Podmiot1>",
    "  <Podmiot2>",
    "    <DaneIdentyfikacyjne>",
    invoice.buyer_nip ? `      <NIP>${esc(invoice.buyer_nip)}</NIP>` : "      <BrakID>1</BrakID>",
    `      <Nazwa>${esc(invoice.buyer_name ?? "")}</Nazwa>`,
    "    </DaneIdentyfikacyjne>",
    "    <Adres>",
    `      <KodKraju>${esc(invoice.buyer_country ?? "PL")}</KodKraju>`,
    `      <AdresL1>${esc(invoice.buyer_street ?? "")}</AdresL1>`,
    `      <AdresL2>${esc(`${invoice.buyer_postal_code ?? ""} ${invoice.buyer_city ?? ""}`.trim())}</AdresL2>`,
    "    </Adres>",
    "  </Podmiot2>",
    "  <Fa>",
    `    <KodWaluty>${esc(invoice.currency)}</KodWaluty>`,
    `    <P_1>${esc(today)}</P_1>`,
    `    <P_2>${esc(invoice.invoice_number)}</P_2>`,
    invoice.sale_date ? `    <P_6>${esc(invoice.sale_date)}</P_6>` : "",
    ...totalsByRate(invoice),
    `    <P_15>${num(invoice.gross_amount)}</P_15>`,
    "    <Adnotacje>",
    "      <P_16>2</P_16><P_17>2</P_17><P_18>2</P_18><P_18A>2</P_18A>",
    hasExempt(invoice)
      ? `      <Zwolnienie><P_19>1</P_19><P_19A>${esc(invoice.vat_exemption_basis || "art. 113 ust. 1 ustawy o VAT")}</P_19A></Zwolnienie>`
      : "      <Zwolnienie><P_19N>1</P_19N></Zwolnienie>",
    "      <NoweSrodkiTransportu><P_22N>1</P_22N></NoweSrodkiTransportu>",
    "      <P_23>2</P_23>",
    "      <PMarzy><P_PMarzyN>1</P_PMarzyN></PMarzy>",
    "    </Adnotacje>",
    "    <RodzajFaktury>VAT</RodzajFaktury>",
    rows,
    "  </Fa>",
    "</Faktura>",
  ]
    .filter((l) => l !== "")
    .join("\n");
}
