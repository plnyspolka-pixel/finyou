/**
 * Różnica tekstu dokumentu (linia po linii, LCS) — do porównania ręcznie
 * poprawionej wersji kompletu z wersją z silnika (pkt 8 zlecenia).
 */

export interface LiniaDiffu {
  /** "+" dodana w nowej wersji, "-" usunięta, " " bez zmian (kontekst). */
  typ: "+" | "-" | " ";
  /** Numer linii w starej (dla "-"/" ") albo nowej wersji (dla "+"). */
  nr: number;
  tekst: string;
}

export interface DiffTekstu {
  dodane: number;
  usuniete: number;
  /** Zmienione linie z jedną linią kontekstu (bez długich bloków bez zmian). */
  linie: LiniaDiffu[];
  /** true, gdy lista `linie` została obcięta do limitu. */
  obciety: boolean;
}

export function diffTekstu(stary: string, nowy: string, limit = 400): DiffTekstu {
  const a = stary.split("\n");
  const b = nowy.split("\n");
  const n = a.length;
  const m = b.length;
  // Tablica LCS od końca (Uint16 wystarcza dla dokumentów do 65 tys. linii).
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);

  const wszystkie: LiniaDiffu[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      wszystkie.push({ typ: " ", nr: i + 1, tekst: a[i] });
      i++;
      j++;
    } else if (i < n && (j >= m || dp[i + 1][j] >= dp[i][j + 1])) {
      wszystkie.push({ typ: "-", nr: i + 1, tekst: a[i] });
      i++;
    } else {
      wszystkie.push({ typ: "+", nr: j + 1, tekst: b[j] });
      j++;
    }
  }
  const zmiana = wszystkie.map((l) => l.typ !== " ");
  const linie = wszystkie.filter(
    (l, k) => l.typ !== " " || zmiana[k - 1] === true || zmiana[k + 1] === true,
  );
  return {
    dodane: wszystkie.filter((l) => l.typ === "+").length,
    usuniete: wszystkie.filter((l) => l.typ === "-").length,
    linie: linie.slice(0, limit),
    obciety: linie.length > limit,
  };
}
