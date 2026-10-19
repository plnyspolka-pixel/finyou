# Pakiet inwestora FY-LEGAL-1.0

Wersja 1.0 z 19 października 2026 r. — bez wersji historycznych.

- `*.txt` — treść (`legal_documents.content_text`), którą akceptuje Inwestor,
- `*.docx` — kanoniczne pliki (trwały nośnik, załącznik e-mail),
- `CONTENT.sha256` — SHA-256 treści = `legal_documents.sha256` (akceptacja: code:version:sha256),
- `MANIFEST.sha256` — SHA-256 plików .docx (`sha256sum -c MANIFEST.sha256`).

Zmiana dokumentu: popraw `.txt` i `.docx`, potem `npx tsx scripts/legal/build-dokumenty.ts`
(przepisze skróty i migrację `20261019120000_dokumenty_prawne_1_0`).
