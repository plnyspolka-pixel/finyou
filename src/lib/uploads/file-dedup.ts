// Deduplikacja plików klienta po TREŚCI (SHA-256), a nie po ścieżce.
//
// Ścieżki w buckecie `pliki-klienta` zawierają stempel czasowy + losowy sufiks,
// więc ta sama binarka wgrana dwa razy zawsze dostaje inną ścieżkę i dedup po
// ścieżce (collectClientFileRefs itp.) jej nie łapie. Hash treści identyfikuje
// plik niezależnie od nazwy i kanału (formularz, panel, mail, Messenger).
//
// Plik działa i w przeglądarce, i na serwerze (WebCrypto), bez importów
// Supabase — czyste funkcje są testowalne jednostkowo, a integracja z bazą
// (rejestr `client_file_hashes`) mieszka w unified-upload.ts oraz
// inbound-attachments.server.ts.

/** SHA-256 treści pliku jako lowercase hex. Best-effort — null, gdy WebCrypto
 *  niedostępne lub odczyt się nie powiedzie; dedup nigdy nie blokuje uploadu. */
export async function sha256Hex(data: ArrayBuffer | Uint8Array | Blob): Promise<string | null> {
  try {
    let buf: ArrayBuffer;
    if (data instanceof Blob) {
      buf = await data.arrayBuffer();
    } else if (data instanceof Uint8Array) {
      buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    } else {
      buf = data;
    }
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return null;
    const digest = await subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

/** Rozdziela partię plików na świeże i duplikaty: względem już znanych hashy
 *  ORAZ wewnątrz samej partii (ten sam plik dwa razy w jednym mailu/formularzu).
 *  Pliki bez hasha (null/undefined) zawsze przechodzą jako świeże. */
export function partitionByContentHash<T extends { contentHash?: string | null }>(
  items: T[],
  knownHashes: Iterable<string>,
): { fresh: T[]; duplicates: T[] } {
  const seen = new Set(knownHashes);
  const fresh: T[] = [];
  const duplicates: T[] = [];
  for (const item of items) {
    const h = item.contentHash ?? null;
    if (h && seen.has(h)) {
      duplicates.push(item);
      continue;
    }
    if (h) seen.add(h);
    fresh.push(item);
  }
  return { fresh, duplicates };
}

/** Komunikat do UI po wgraniu partii z pominiętymi duplikatami. */
export function uploadSummaryLabel(added: number, skippedDuplicates: number): string {
  if (added === 0 && skippedDuplicates > 0)
    return `Pominięto ${skippedDuplicates} duplikat(ów) — te pliki już są w systemie`;
  if (skippedDuplicates > 0)
    return `Dodano ${added} plik(ów), pominięto ${skippedDuplicates} duplikat(ów)`;
  return `Dodano ${added} plik(ów)`;
}
