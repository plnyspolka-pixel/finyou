// Tekst z PDF-a po stronie przeglądarki (pdfjs-dist) — materiał wgrany w
// panelu lead magnetów zamienia się w brief dla AI, które wypełnia stronę.
// Ten sam pakiet i to samo podpięcie workera co miniatury w uploads/.

/** Ile pierwszych stron czytamy — dalej zwykle są załączniki i podpisy. */
const DEFAULT_MAX_PAGES = 8;

/**
 * Tekst z pierwszych stron PDF-a. `null`, gdy pliku nie da się odczytać albo
 * nie ma w nim warstwy tekstowej (skan) — wtedy pola wypełnia człowiek.
 */
export async function extractPdfText(
  file: Blob,
  opts: { maxPages?: number } = {},
): Promise<string | null> {
  try {
    const pdfjs: typeof import("pdfjs-dist") = await import("pdfjs-dist");
    const workerMod = (await import(
      /* @vite-ignore */ "pdfjs-dist/build/pdf.worker.min.mjs?url"
    )) as { default: string };
    pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;

    const buf = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
    const pages = Math.min(pdf.numPages, opts.maxPages ?? DEFAULT_MAX_PAGES);
    const out: string[] = [];
    for (let i = 1; i <= pages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let line = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        line += item.str;
        // `hasEOL` kończy wiersz w układzie strony.
        if ("hasEOL" in item && item.hasEOL) {
          out.push(line);
          line = "";
        }
      }
      if (line) out.push(line);
    }
    const text = out.join("\n").trim();
    return text.length >= 200 ? text : null;
  } catch (e) {
    console.warn("[lead-magnets] odczyt tekstu PDF nie powiódł się:", e);
    return null;
  }
}
