// Wspólna logika rozwiązywania zdjęć nieruchomości.
//
// `properties.photos` to tablica KLUCZY w Storage (a nie gotowych URL-i) i bywa
// niejednorodna:
//   - obok prawdziwych zdjęć są też skany dokumentów (ownership_deed, KW, akty)
//     oraz pliki nie-obrazkowe (PDF), których NIE wolno renderować jako <img>,
//   - część rekordów (seed / import) to gotowe zewnętrzne URL-e http(s).
//
// Wszystkie pliki klienta leżą w JEDNYM prywatnym buckecie `pliki-klienta`,
// więc ścieżki trzeba podpisać (signed URL). Poniższe helpery filtrują do
// faktycznych zdjęć i podpisują je.

import { supabase } from "@/integrations/supabase/client";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";

export const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|heic|bmp)$/i;

/** Buckety, w których mogą leżeć zdjęcia nieruchomości (kolejność = priorytet).
 *  Legacy "documents"/"property-photos" — pliki wgrane przez starszą wersję
 *  serwera po migracji na wspólny bucket lądowały jeszcze w starych bucketach;
 *  bez fallbacku podpisywanie kończyło się "Nie udało się otworzyć pliku". */
const PHOTO_BUCKETS = [CLIENT_FILES_BUCKET, "documents", "property-photos"] as const;

/** Typy dokumentów z tabeli `documents`, które są faktycznie zdjęciami nieruchomości. */
export const PROPERTY_PHOTO_TYPES = new Set([
  "zdjecie_nieruchomosci",
  "zdjecia_nieruchomosci",
  "zdjecia_pomieszczen",
  "zdjecia_bryly",
  "zdjecia_lokalu",
  "property_photos",
  "property_photo",
  "klient_upload",
]);

const isExternalUrl = (path: string) => /^https?:\/\//i.test(path);

/** Czy ścieżka to pokazywalne zdjęcie nieruchomości (obrazek, nie skan dokumentu)? */
export function isShowablePropertyPhoto(path: string): boolean {
  return (
    IMAGE_EXT.test(path) &&
    !/\/(ownership_deed|kw|documents?|dokumenty|akt|ksiega|księga)\//i.test(path)
  );
}

/** Czy wiersz z tabeli `documents` to faktyczne zdjęcie nieruchomości (a nie np. akt notarialny)? */
export function isPropertyPhotoDocument(doc: {
  file_path?: string | null;
  file_name?: string | null;
  document_type?: string | null;
}): boolean {
  const filePath = String(doc?.file_path ?? "");
  const fileName = String(doc?.file_name ?? filePath);
  const docType = String(doc?.document_type ?? "");
  return Boolean(filePath) && IMAGE_EXT.test(fileName) && PROPERTY_PHOTO_TYPES.has(docType);
}

/** Podpisuje pojedynczą ścieżkę Storage, próbując po kolei bucketów.
 *  Zewnętrzny URL zwraca bez zmian; brak dopasowania → null. */
export async function signStoragePath(path: string, expiresIn = 3600): Promise<string | null> {
  if (!path) return null;
  if (isExternalUrl(path)) return path;
  for (const bucket of PHOTO_BUCKETS) {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (data?.signedUrl) return data.signedUrl;
  }
  return null;
}

/** Podpisuje WSZYSTKIE ścieżki (bez filtra „pokazywalne"), próbując po kolei
 *  bucketów — zwraca mapę ścieżka→URL. Do podglądu załączników, gdzie chcemy
 *  pokazać też skany dokumentów/akty, a pliki bywają w starych bucketach.
 *  Zewnętrzne URL-e przechodzą bez zmian. */
export async function signStoragePathsMap(
  paths: string[] | null | undefined,
  expiresIn = 3600,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let remaining: string[] = [];
  for (const p of (paths ?? []).filter(Boolean)) {
    if (isExternalUrl(p)) map.set(p, p);
    else remaining.push(p);
  }
  for (const bucket of PHOTO_BUCKETS) {
    if (remaining.length === 0) break;
    const { data } = await supabase.storage.from(bucket).createSignedUrls(remaining, expiresIn);
    (data ?? []).forEach(
      (s: { path?: string | null; signedUrl?: string | null; error?: unknown }) => {
        if (s?.path && s?.signedUrl && !s.error) map.set(s.path, s.signedUrl);
      },
    );
    remaining = remaining.filter((p) => !map.has(p));
  }
  return map;
}

/** Filtruje ścieżki do faktycznych zdjęć i podpisuje je (obie buckety, batch).
 *  Zachowuje kolejność wejściową, pomija zdjęcia, których nie udało się rozwiązać. */
export async function resolveShowablePhotoUrls(
  paths: string[] | null | undefined,
  expiresIn = 3600,
): Promise<string[]> {
  const showable = (paths ?? []).filter(Boolean).filter(isShowablePropertyPhoto);
  if (showable.length === 0) return [];

  const urlByPath = new Map<string, string>();
  let remaining = showable.filter((p) => !isExternalUrl(p));
  for (const bucket of PHOTO_BUCKETS) {
    if (remaining.length === 0) break;
    const { data } = await supabase.storage.from(bucket).createSignedUrls(remaining, expiresIn);
    (data ?? []).forEach(
      (s: { path?: string | null; signedUrl?: string | null; error?: unknown }) => {
        if (s?.path && s?.signedUrl && !s.error) urlByPath.set(s.path, s.signedUrl);
      },
    );
    remaining = remaining.filter((p) => !urlByPath.has(p));
  }

  return showable
    .map((p) => (isExternalUrl(p) ? p : urlByPath.get(p)))
    .filter((u): u is string => !!u);
}
