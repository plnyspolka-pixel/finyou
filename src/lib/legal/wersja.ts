/** „1” → „1.0” — numer wersji consent_documents w interfejsie (bez node:crypto, także w przeglądarce). */
export function wersjaDokumentu(v: number | string): string {
  const s = String(v);
  return /^\d+$/.test(s) ? `${s}.0` : s;
}
