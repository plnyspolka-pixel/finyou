// Stopa referencyjna NBP → odsetki maksymalne. Czysty moduł (bez I/O):
// agent wzrostu porównuje wynik z tabelą w contract-engine/fees.ts i przy
// rozjeździe prosi właściciela o aktualizację (zmiana stóp = zmiana prawdy,
// którą agenci mówią klientom).

/** Stopa referencyjna NBP → odsetki maksymalne = 2 × (ref + 3,5 p.p.). */
export function expectedMaxFromRef(ref: number): number {
  return Math.round(2 * (ref + 3.5) * 100) / 100;
}

export function parseNbpRefRate(xml: string): { ref: number; from: string } | null {
  const m = xml.match(/<pozycja[^>]*id="ref"[^>]*>/i);
  if (!m) return null;
  const rate = m[0].match(/oprocentowanie="([\d,.]+)"/i)?.[1];
  const from = m[0].match(/obowiazuje_od="([\d-]+)"/i)?.[1];
  if (!rate || !from) return null;
  return { ref: Number(rate.replace(",", ".")), from };
}
