# video-transcoder — kompresja wideo przed publikacją na AWS Lambda

Zastępuje zadanie `transcode` usługi `services/caption-burner` (darmowy Render,
0,1 vCPU — 3-minutowy film 1080p kodował się nawet pół godziny). Ten sam plan
kodowania (`../caption-burner/transcode-plan.mjs`, kopiowany do paczki), to
samo API, więc tor publikacji w Finance You (`src/lib/video-rendition*.ts`)
się nie zmienia — wybór silnika jest w `src/lib/video-transcoder.server.ts`.

## Jak działa

- **Function URL** (auth `NONE` + własny sekret Bearer): `POST /jobs`,
  `GET /jobs/:id`, `DELETE /jobs/:id`, `GET /health`.
- `POST /jobs` zapisuje stan w `s3://<bucket>/jobs/<id>.json` i wywołuje
  funkcję samą siebie asynchronicznie (`InvocationType: Event`, bez ponowień)
  — odpowiedź wraca od razu, kodowanie trwa w tle (limit Lambdy 15 min).
- Wynik idzie prosto na podpisany URL Supabase Storage (`upload_url`); gdy się
  nie uda — do `s3://<bucket>/results/`, a `GET /jobs/:id` daje `file_url`
  (podpisany link na 1 h). Reguła cyklu życia kasuje `jobs/` i `results/`
  po 2 dniach.
- FFmpeg: statyczna binarka x86_64 (johnvansickle.com, suma MD5 sprawdzana
  przy budowie) w `bin/`. Preset `medium` (lepsza jakość przy tym samym
  bitrate niż `ultrafast` na Renderze).

## Wdrożenie (region `eu-central-1`)

```bash
aws login --remote --region eu-central-1 --profile finyou   # jeśli sesja wygasła
bash services/video-transcoder/deploy.sh
```

Skrypt jest idempotentny: bucket `finyou-video-transcoder-<konto>`, rola
`finyou-video-transcoder-role` (S3 tylko `jobs/*` i `results/*`, wywołanie
samej siebie), funkcja `finyou-video-transcoder` (Node 22, 3008 MB, 15 min,
4 GB `/tmp`), Function URL, logi (14 dni). Ponowne uruchomienie aktualizuje kod
i zostawia ten sam sekret. Na końcu wypisuje sekrety dla Finance You:

```
VIDEO_TRANSCODER_URL=https://….lambda-url.eu-central-1.on.aws
VIDEO_TRANSCODER_SECRET=…
```

Po ich dodaniu nowe kompresje idą na AWS (MCP `heygen_status` →
`publish_compression.engine = aws-lambda`). Bez nich wszystko działa jak dawniej.

## Testy

```bash
node --test services/video-transcoder/core.test.mjs   # z prawdziwym FFmpegiem, gdy jest w PATH
```

## Limity

Konto ma limit 10 równoległych wywołań Lambdy (dzielony z Remotion) — tick
zleca najwyżej 4 kompresje naraz. Większa pamięć (szybciej) po podniesieniu
limitu: `MEMORY_MB=5120 bash deploy.sh`.
