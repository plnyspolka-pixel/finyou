# Unifikacja plików i miniatury wszędzie

## Cel
1. Każdy nowy upload (zdjęcia, dokumenty, załączniki) trafia do jednego bucketu `property-photos`.
2. Stare pliki z bucketów `documents`, `marketing-materials`, `avatars`, `training-videos`, `ad-creatives` fizycznie przenoszę do `property-photos` i aktualizuję ścieżki w bazie.
3. Wszędzie, gdzie pokazujemy plik, widać miniaturę:
   - obrazy → miniatura z signed URL,
   - PDF → obrazek pierwszej strony (wygenerowany przy uploadzie po stronie klienta),
   - DOCX/XLSX/inne → miniatura placeholder (ikona typu + nazwa) jako fallback.

## Zakres zmian

### 1. Bucket i uprawnienia
- Nowa polityka RLS na `storage.objects` dla `property-photos`: read/write dla `authenticated` po `owner = auth.uid()` + read dla właściciela wniosku/leada powiązanego z plikiem (utrzymuję obecny model, poszerzam o typy plików wcześniej trafiające do `documents`).
- `service_role` pełny dostęp dla server functions.

### 2. Warstwa uploadu — jeden helper
Nowy moduł `src/lib/uploads/unified-upload.ts`:
- `uploadFile(file, { context: 'property' | 'document' | 'attachment' | 'avatar' | 'marketing', ownerId, refId })` → zwraca `{ path, url, thumbnailPath?, mimeType, size }`.
- Klucze mają prefiks kontekstu: `property/<applicationId>/…`, `documents/<applicationId>/…`, `attachments/<messageId>/…`, `avatars/<userId>/…`, `marketing/<materialId>/…` — wszystko w jednym bucket'cie.
- Jeśli plik to `application/pdf`, po stronie klienta używam `pdfjs-dist` (już w projekcie via viewer) do wyrenderowania pierwszej strony do PNG 400×560, upload jako `<oryginalny_klucz>.thumb.png`.
- Jeśli plik to obraz — miniaturę generujemy on-demand przez signed URL (mniejszy transform nie jest potrzebny, użyjemy `object-cover` w UI).

### 3. Podmiana wywołań
Refactoruję wszystkie miejsca robiące `supabase.storage.from('documents' | 'marketing-materials' | 'avatars' | 'ad-creatives').upload(...)` na `uploadFile(...)`. Miejsca do zmiany (ok. 15):
- `src/components/landing/single-page-application-form.tsx`
- `src/components/wniosek/*` (upload dokumentów, zdjęć)
- `src/routes/klient.profil.tsx` (avatar)
- `src/routes/posrednik.profil.tsx` (avatar + zdjęcie)
- `src/components/inbox/compose-email.tsx` (załączniki)
- `src/routes/admin.marketing.tsx` (materiały)
- `src/components/document-creator/*`
- panele operatora, LeadDetailView (upload dokumentów z rozmowy)

### 4. Migracja starych plików
Skrypt `scripts/migrate-storage-to-property-photos.ts` odpalany raz jako server function (`migrateStorageToPropertyPhotos`, gated adminem):
- Iteruje po każdym starym buckecie (`documents`, `marketing-materials`, `avatars`, `ad-creatives`, `training-videos`).
- Pobiera obiekty batchami (`list` po 1000), przenosi do `property-photos/<legacy>/<oldPath>` przez `copy` + `remove`.
- Aktualizuje ścieżki w tabelach: `documents.storage_path`, `kw_documents.storage_path`, `marketing_materials.file_path`, `profiles.avatar_url`, `training_videos.video_url`, `meta_ad_drafts.creative_url`, `lead_communications.attachments` (jsonb → replace stringów bucketu), `property_document_extractions`, `investors.avatar_url`.
- Loguje w nowej tabeli `storage_migration_log(id, source_bucket, source_path, target_path, table_updated, ok, error, created_at)`.
- Idempotentny (skip jeśli `target` istnieje).
- Dla każdego przeniesionego PDFa wpycha do kolejki generowania miniatur (patrz niżej).

### 5. Miniatury PDF dla legacy plików
- Miniatury dla nowych uploadów robi klient przy uploadzie.
- Miniatury dla starych PDFów: server function `renderPdfThumbnail(path)` używająca `pdfjs-dist` w Workerze + `@napi-rs/canvas` **nie działa w Worker runtime** → renderujemy lazy po stronie klienta przy pierwszym otwarciu listy, wynik uploadowany do bucketu jako `<path>.thumb.png` i zapisany w kolumnie `documents.thumbnail_path`. UI pokazuje spinner do czasu wygenerowania.

### 6. Wspólny komponent miniatury
`src/components/media/FileThumb.tsx`:
- Wejście: `{ path, mimeType, name, size, thumbnailPath? }`.
- Obraz → `<img src={signedUrl(path)}>`, `object-cover`, aspect 4:3.
- PDF z `thumbnailPath` → obrazek z miniaturki + badge „PDF" + liczba stron (opcjonalnie).
- PDF bez miniaturki → render przez `pdfjs-dist` w tle + upload wyniku.
- Inne → ikona typu (Word/Excel/audio/video/generic) + nazwa + rozmiar.
- Klik → otwiera podgląd (obecny `MediaPreviewDialog`).

Podmieniam obecne `InboundAttachmentsThumbs`, listy dokumentów we wniosku, w LeadDetailView, w skrzynce e‑mail — wszystkie używają `FileThumb`.

### 7. Backfill miniatur (lazy)
Tabela `documents` dostaje kolumnę `thumbnail_path text`. Endpoint `saveThumbnail({ path, thumbnailPath })` (auth, sprawdza własność) pozwala klientowi zapisać miniaturę wygenerowaną w tle.

## Techniczne notatki
- `pdfjs-dist` w projekcie już jest (używany przy podglądzie); worker `.js` serwowany z `/pdfjs/`.
- Migracja starych plików dzieje się jednorazowo — wywołam ją z panelu `/admin/ksiegowosc` przyciskiem „Migruj storage do property-photos", z paskiem postępu i logiem.
- Zmiany w bazie idą jednym migration SQL (kolumna `thumbnail_path`, tabela `storage_migration_log`, aktualizacja polityk RLS bucketu).
- Zmiana bucketu w bazie danych to update stringów — bez zmiany typów tabel.

## Ryzyka
- Migracja plików o rozmiarze GB (training-videos) — robimy jako background job, batchami po 50, retry przy błędach.
- Publiczny bucket `ad-creatives` → w `property-photos` (prywatnym) trzeba wystawiać signed URL wszędzie gdzie kreacja Meta była wcześniej publicznym linkiem (kilka miejsc, zmapuję w trakcie).
- Klient generujący miniatury PDF → wymaga załadowania `pdfjs` (~300 KB). Ładuję lazy tylko przy pierwszym renderze.

## Kolejność
1. Migracja SQL (kolumna + tabela + polityki).
2. `unified-upload.ts` + `FileThumb.tsx`.
3. Podmiana call-sites (jedna sesja PR).
4. Endpoint `saveThumbnail`.
5. Server function `migrateStorageToPropertyPhotos` + UI w adminie.
6. Uruchomienie migracji + weryfikacja.

Po akceptacji ruszam z pkt 1–4 w jednym ciągu; pkt 5–6 osobno bo wymagają odpalenia przez Ciebie z panelu admina.