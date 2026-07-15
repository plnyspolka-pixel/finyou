// Wspólny typ referencji załącznika wychodzącego (klient ↔ serwer).
// Klient przekazuje tylko referencję (ścieżka w Storage lub URL) — serwer
// pobiera plik i dołącza go do maila jako prawdziwy załącznik (base64 w Resend).
export type OutboundAttachmentRef = {
  name: string;
  /** Klucz w Supabase Storage (np. attachments/…, documents/…, property/…). */
  path?: string | null;
  /** Preferowany bucket; gdy brak, serwer próbuje znanych bucketów po kolei. */
  bucket?: string | null;
  /** Pełny URL http(s) — alternatywa dla path. */
  url?: string | null;
  mime?: string | null;
  size?: number | null;
};
