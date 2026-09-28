# caption-burner — wypalanie napisów w rolkach Studia

Mikrousługa FFmpeg + libass, która bierze **czysty master z HeyGena** i **gotowy
plik ASS** (styl napisów liczy kod Finance You w `src/lib/caption-style.ts`)
i oddaje MP4 z napisami wypalonymi w obrazie. Jeden plik (`server.mjs`),
zero zależności npm, Node 22+.

Dlaczego osobna usługa: HeyGen v3 przyjmuje w `caption.style` wyłącznie
`"default"` (rozmiar, czcionka i pozycja napisów nie są sterowalne), a backend
Finance You działa na Cloudflare Workers, gdzie nie ma FFmpega. To jedyne
miejsce w całym systemie, które faktycznie przetwarza obraz.

## Uruchomienie

### Fly.io (zalecane — jedna komenda, region Warszawa)

```sh
cd services/caption-burner
fly launch --copy-config --no-deploy        # przyjmij fly.toml z tego katalogu
fly secrets set CAPTION_BURNER_SECRET="$(openssl rand -hex 24)"
fly deploy
fly status                                   # adres: https://<app>.fly.dev
```

`fly.toml` trzyma **jedną maszynę, która się nie usypia** (`auto_stop_machines =
"off"`): zadania żyją w pamięci usługi, a wypalanie 60-sekundowej rolki trwa
kilkanaście sekund — usypianie w trakcie zepsułoby przebieg. Koszt maszyny
`shared-cpu-2x` / 1 GB to kilka dolarów miesięcznie.

### Docker (Railway, Render, VPS…)

```sh
docker build -t caption-burner services/caption-burner
docker run -d -p 8080:8080 -e CAPTION_BURNER_SECRET=… caption-burner
curl -s http://localhost:8080/health
```

Obraz instaluje `ffmpeg`, `fontconfig` i czcionki **Inter**, DejaVu
i Liberation. Presety w `caption-style.ts` używają Inter (Bold); libass
podstawi DejaVu Sans, gdyby Inter brakowało.

### Po stronie Finance You

Sekrety środowiska aplikacji (Lovable → ustawienia → sekrety):

| Sekret                  | Wartość                                     |
| ----------------------- | ------------------------------------------- |
| `CAPTION_BURNER_URL`    | np. `https://finyou-caption-burner.fly.dev` |
| `CAPTION_BURNER_SECRET` | ten sam ciąg, który dostała usługa          |

Bez tych sekretów Studio działa jak dotąd (napisy HeyGena); panel pokazuje
wtedy tylko styl „HeyGen (domyślne)”.

## API

Każde wywołanie poza `/health` wymaga nagłówka
`Authorization: Bearer <CAPTION_BURNER_SECRET>`.

| Metoda   | Ścieżka          | Co robi                                                             |
| -------- | ---------------- | ------------------------------------------------------------------- |
| `GET`    | `/health`        | `{ ok, ffmpeg, jobs: { queued, processing, done, failed } }`        |
| `POST`   | `/jobs`          | `{ video_url, ass, name? }` → `202 { id, status }`                  |
| `GET`    | `/jobs/:id`      | `{ id, status: queued\|processing\|done\|failed, error, bytes, … }` |
| `GET`    | `/jobs/:id/file` | gotowy MP4 (tylko `done`; `409` w innym stanie)                     |
| `DELETE` | `/jobs/:id`      | usuwa pliki zadania (`409`, gdy właśnie się przetwarza)             |

`video_url` musi być adresem **https** na publicznym hoście (HeyGen, bucket
`studio-media`); `ass` — pełny plik ASS z sekcją `[Events]`, do 1 MB.
Wynik to H.264 (`libx264`, `-preset veryfast`, `-crf 20`, `yuv420p`,
`+faststart`); audio kopiowane 1:1, a gdy MP4 nie przyjmie ścieżki bez
przekodowania — AAC 160 kb/s.

## Zmienne środowiskowe

| Zmienna                        | Domyślnie             | Znaczenie                                        |
| ------------------------------ | --------------------- | ------------------------------------------------ |
| `CAPTION_BURNER_SECRET`        | — (wymagane)          | sekret Bearer                                    |
| `PORT`                         | `8080`                |                                                  |
| `MAX_CONCURRENCY`              | `1`                   | ile FFmpegów naraz (1 na maszynę 1–2 vCPU)       |
| `MAX_INPUT_MB`                 | `300`                 | limit pobieranego wideo                          |
| `JOB_TTL_MINUTES`              | `360`                 | po ilu minutach od zakończenia sprzątamy zadanie |
| `DOWNLOAD_TIMEOUT_SECONDS`     | `300`                 |                                                  |
| `FFMPEG_TIMEOUT_SECONDS`       | `1200`                |                                                  |
| `FFMPEG_PRESET` / `FFMPEG_CRF` | `veryfast` / `20`     | jakość vs czas                                   |
| `CAPTION_FONTS_DIR`            | —                     | dodatkowy katalog czcionek dla libass            |
| `CAPTION_WORK_DIR`             | `/tmp/caption-burner` | katalog roboczy                                  |
| `ALLOW_PRIVATE_URLS`           | `0`                   | `1` tylko do testów lokalnych (http, localhost)  |

## Test lokalny

```sh
CAPTION_BURNER_SECRET=test ALLOW_PRIVATE_URLS=1 node services/caption-burner/server.mjs
# w drugim terminalu: wygeneruj ASS z SRT presetem "reels"
bun -e 'import { srtToAss } from "./src/lib/caption-style"; console.log(srtToAss(await Bun.file("plik.srt").text(), "reels"))' > napisy.ass
curl -H "Authorization: Bearer test" -H "content-type: application/json" \
  -d "$(jq -n --arg u http://127.0.0.1:8099/in.mp4 --rawfile a napisy.ass '{video_url:$u, ass:$a}')" \
  http://localhost:8080/jobs
```

Tak wygląda przebieg, którym zweryfikowano usługę (8-sekundowy klip 720×1280,
cztery presety, ~1,5 s na preset, audio skopiowane, kadry sprawdzone wizualnie).
