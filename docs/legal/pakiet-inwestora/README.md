# Pakiet inwestora FY-LEGAL-2.0

Wersja 2.0 z 21 października 2026 r. Zastępuje FY-LEGAL-1.0 z 19 października 2026 r.:
Prowizja od Pożyczkobiorcy 7% Kwoty Udzielonej (wcześniej 5%), nie mniej niż 5 000 zł, bez VAT.
NDA i umowa RODO różnią się od 1.0 tylko oznaczeniem wersji. Treść 1.0 jest w historii repozytorium.

- `*.txt` — treść (`legal_documents.content_text`), którą akceptuje Inwestor,
- `*.docx` — kanoniczne pliki (trwały nośnik, załącznik e-mail),
- `CONTENT.sha256` — SHA-256 treści = `legal_documents.sha256` (akceptacja: code:version:sha256),
- `MANIFEST.sha256` — SHA-256 plików .docx (`sha256sum -c MANIFEST.sha256`).

Zmiana dokumentu: popraw `.txt` i `.docx`, potem `npx tsx scripts/legal/build-dokumenty.ts`
(przepisze skróty i `src/lib/legal/dokumenty-1-0.dane.ts`). Do bazy wgrywa narzędzie
administratora `publish_legal_documents` — dodaje nową wersję i niczego nie usuwa: akceptacje
poprzednich wersji zostają, a inwestor akceptuje nową wersję przy następnym wejściu do panelu.
