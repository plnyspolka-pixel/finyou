-- Dosunięcie plików, które po migracji 20260715090000 (wspólny bucket
-- "pliki-klienta") nadal trafiały do starych bucketów "documents" /
-- "property-photos" — wgrywała je jeszcze wcześniejsza wersja serwera
-- (webhook Messengera działał na starym buildzie). Stare polityki RLS
-- zostały wtedy skasowane, więc tych plików nie dało się podpisać:
-- w panelu "Nie udało się otworzyć pliku" i szare kafelki zamiast miniatur.
-- Operacja idempotentna — identyczna logika jak w pierwotnej migracji.

UPDATE storage.objects o
SET bucket_id = 'pliki-klienta'
WHERE o.bucket_id IN ('documents', 'property-photos')
  AND NOT EXISTS (
    SELECT 1 FROM storage.objects t
    WHERE t.bucket_id = 'pliki-klienta' AND t.name = o.name
  );

-- Uzupełnienie rozszerzenia w documents.file_name — załączniki z Messengera
-- zapisywały nazwę bez ".jpg" (rozszerzenie było tylko w ścieżce), przez co
-- UI nie rozpoznawał obrazków i nie renderował miniatur.
UPDATE public.documents
SET file_name = file_name || substring(file_path from '\.[A-Za-z0-9]{2,5}$')
WHERE file_path ~ '\.[A-Za-z0-9]{2,5}$'
  AND file_name IS NOT NULL
  AND file_name !~ '\.[A-Za-z0-9]{2,5}$';

-- Stare buckety do kasacji, gdy już są puste.
DELETE FROM storage.buckets b
WHERE b.id IN ('documents', 'property-photos')
  AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = b.id);
