// Normalizacja polskich numerów telefonów
export function normalizePolishPhone(raw: string | null | undefined): {
  normalized: string | null;
  valid: boolean;
} {
  if (!raw) return { normalized: null, valid: false };
  const digits = raw.replace(/[^\d+]/g, "");
  let n = digits;
  if (n.startsWith("00")) n = "+" + n.slice(2);
  if (!n.startsWith("+")) {
    // assume PL
    if (n.length === 9) n = "+48" + n;
    else if (n.length === 11 && n.startsWith("48")) n = "+" + n;
    else n = "+48" + n.replace(/^48/, "");
  }
  const valid = /^\+48\d{9}$/.test(n);
  return { normalized: valid ? n : n, valid };
}
