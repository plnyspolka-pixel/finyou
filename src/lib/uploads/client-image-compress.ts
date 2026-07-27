// Klient-side kompresja obrazów przed wysyłką do serwera.
// Zdjęcia z telefonu potrafią mieć 5-8MB — po kompresji spadają do ~300-800KB,
// dzięki czemu jeden upload przez `uploadLandingAttachment` jest szybki
// i mieści się w limicie 15MB base64 nawet na słabym łączu.

const MAX_DIM = 2000;
const JPEG_QUALITY = 0.82;

export async function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

/** Jeśli plik to obraz > MAX_DIM lub > 1.5MB, przeskaluj i skompresuj do JPEG. */
export async function compressImageIfNeeded(
  file: File,
): Promise<{ blob: Blob; mimeType: string; fileName: string }> {
  const mime = file.type || "application/octet-stream";
  if (!mime.startsWith("image/") || mime === "image/gif") {
    return { blob: file, mimeType: mime, fileName: file.name };
  }
  if (file.size < 1.5 * 1024 * 1024) {
    return { blob: file, mimeType: mime, fileName: file.name };
  }
  try {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("image load failed"));
        i.src = url;
      });
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const scale = Math.min(1, MAX_DIM / Math.max(w, h));
      const targetW = Math.round(w * scale);
      const targetH = Math.round(h * scale);
      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return { blob: file, mimeType: mime, fileName: file.name };
      ctx.drawImage(img, 0, 0, targetW, targetH);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY),
      );
      if (!blob) return { blob: file, mimeType: mime, fileName: file.name };
      const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
      return { blob, mimeType: "image/jpeg", fileName: newName };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return { blob: file, mimeType: mime, fileName: file.name };
  }
}
