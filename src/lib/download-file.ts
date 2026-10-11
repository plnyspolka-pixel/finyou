// Pobranie pliku w przeglądarce (Blob → <a download>) — jedno miejsce zamiast
// kopii w każdym widoku. Tylko po stronie klienta.

/** Zapisuje Blob jako plik o podanej nazwie. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Część przeglądarek startuje pobieranie asynchronicznie — adres zwalniamy chwilę później.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Bajty → plik (np. PDF zbudowany w przeglądarce). */
export function downloadBytes(bytes: Uint8Array, filename: string, mime = "application/pdf"): void {
  downloadBlob(new Blob([bytes as BlobPart], { type: mime }), filename);
}

/** Plik zwrócony przez server function jako base64 (np. eksport PDF). */
export function downloadBase64File(
  filename: string,
  base64: string,
  mime = "application/pdf",
): void {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  downloadBytes(bytes, filename, mime);
}
