# Kopia Storage — 2026-10-21

Wstępna kopia (T−1) wykonana: stary Storage → `vkzndnaoxhdxrxlpntcb` przez manifest starej aplikacji
i funkcję Edge nowego projektu (`storage-copy-manifest.py` + `storage-import-function.ts`).

| Bucket | Stara baza (obiekty) | Nowy projekt | Uwagi |
|---|---|---|---|
| ad-creatives | 2 | 2 | wcześniej |
| documents | 1 | 1 | |
| lead-magnets | 5 | 5 | |
| marketing-materials | 353 | 354 | +1 nowy plik od inwentarza |
| pliki-klienta | 2073 | 1965 | **108 wpisów bez pliku w starym Storage (`NoSuchKey`)** — nie do odzyskania stąd |
| podpisy | 15 | 15 | |
| shorts-video | 1 | 1 | |
| studio-media | 562 | 566 | uzupełnione 9 brakujących (publiczne URL) |
| training-videos | 35 | 35 | mimetype filmów poprawiony (0 × octet-stream .mp4) |

Pliki > 100 MB przeszły bez zmiany limitów (buckety z filmami mają `file_size_limit = null`).

Po kopii: funkcja `migration-storage-import` zastąpiona zaślepką 410 (verify_jwt), token eksportu
wygaszony (`expires_at = now()`).

## Delta w oknie serwisowym (T0, krok 3)

1. Nowy token: `python3 -c "import secrets;print(secrets.token_urlsafe(32))" > ~/.finyou-migracja/export.token`,
   skrót SHA-256 → `insert into public.migration_export_tokens(token_hash, expires_at) values ('<hash>', now()+interval '4 hours')` [STARA].
2. Nowy `import.secret`, jego SHA-256 w `storage-import-function.ts`, wdrożenie funkcji z `verify_jwt = false`.
3. `MIGRACJA_DIR=~/.finyou-migracja python3 docs/migracja/storage-copy-manifest.py documents,lead-magnets,marketing-materials,pliki-klienta,training-videos,shorts-video,podpisy`
   (pomija skopiowane wg state.json — przy nowym katalogu wgra wszystko ponownie z upsertem).
4. studio-media / ad-creatives: porównanie publicznych URL (HEAD) i dokopiowanie brakujących.
5. Zaślepka 410 i wygaszenie tokenu.

108 wpisów-sierot w `pliki-klienta` (lista poza repo — nazwy zawierają dane klientów) psuje się już
dziś na produkcji; decyzja właściciela: zostawić, czy usunąć wpisy/odwołania w `documents` itd.
