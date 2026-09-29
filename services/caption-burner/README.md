# caption-burner — wypalanie napisów w rolkach Studia

Mikrousługa FFmpeg + libass, która bierze **czysty master z HeyGena** i **gotowy
plik ASS** (styl napisów liczy kod Finance You w `src/lib/caption-style.ts`)
i oddaje MP4 z napisami wypalonymi w obrazie. Jeden plik (`server.mjs`),
zero zależności npm, Node 22+.

Tą samą drogą Studio kładzie na każdą rolkę **znaczek „AI"** w prawym górnym
rogu: to zwykłe zdarzenia w pliku ASS (rysunek `\p1` + napis), dopisywane do
napisów albo wysyłane jako ASS z samym znaczkiem (wideo z napisami HeyGena
lub bez napisów). Usługa nie rozróżnia tych przypadków i nie wymaga zmian.

Dlaczego osobna usługa: HeyGen v3 przyjmuje w `caption.style` wyłącznie
`"default"` (rozmiar, czcionka i pozycja napisów nie są sterowalne), a backend
Finance You działa na Cloudflare Workers, gdzie nie ma FFmpega. To jedyne
miejsce w całym systemie, które faktycznie przetwarza obraz.

## Uruchomienie

Usługa jest zwykłym kontenerem Dockera, więc stanie wszędzie, gdzie da się
uruchomić kontener. Zadania zapisuje na dysku (`job.json`), więc **może być
usypiana i budzona** — przerwane wypalanie wznawia po starcie, a klient
w Finance You czeka do 120 s na wybudzenie przy zleceniu. Dzięki temu działa
na darmowych planach.

### Za darmo: Render.com (Blueprint, bez własnego serwera)

1. Konto na [render.com](https://render.com) (plan free; wg Render bez karty).
2. **New → Blueprint → wybierz repo `finyou`** — Render czyta `render.yaml`
   z katalogu głównego repo i sam zbuduje obraz z `services/caption-burner`.
3. Po wdrożeniu: adres usługi to `https://finyou-caption-burner.onrender.com`
   (nazwa może dostać przyrostek), a sekret znajdziesz w zakładce
   **Environment → CAPTION_BURNER_SECRET** (Render wygenerował go sam).
4. Oba wpisz w sekretach Finance You (tabela niżej).

Ograniczenia planu free: 0,1 vCPU (rolka 60 s wypala się w 1–3 min zamiast
kilkunastu sekund — `FFMPEG_PRESET=ultrafast` jest już w blueprintcie),
usypianie po 15 min bez ruchu (pierwsze zlecenie czeka ok. minutę na
wybudzenie), 750 godzin pracy miesięcznie — przy kilku rolkach dziennie
usługa i tak śpi większość czasu.

### Za darmo: Koyeb

Analogicznie (New Service → GitHub → repo `finyou`, Dockerfile
`services/caption-burner/Dockerfile`, instancja _Free_, zmienna
`CAPTION_BURNER_SECRET`). Koyeb od 2026 r. wymaga podania karty także na
planie darmowym; instancja usypia po godzinie bez ruchu.

### Za darmo: własny komputer + Cloudflare Tunnel

Gdy masz komputer włączony w godzinach pracy:

```sh
docker build -t caption-burner services/caption-burner
docker run -d --restart unless-stopped -p 8080:8080 \
  -e CAPTION_BURNER_SECRET=… -v caption-jobs:/tmp/caption-burner caption-burner
cloudflared tunnel --url http://localhost:8080     # darmowy tunel → adres https
```

`cloudflared` (Cloudflare Tunnel) daje publiczny adres https bez otwierania
portów. Szybki tunel (`--url`) ma losowy adres `*.trycloudflare.com`, który
zmienia się po restarcie — na stałe załóż tunel nazwany na własnej domenie
(też za darmo). W Finance You ustaw `CAPTION_BURN_TIMEOUT_MINUTES=720`, żeby
rolki wygenerowane przy wyłączonym komputerze poczekały na jego włączenie,
zamiast po 45 min schodzić na napisy HeyGena.

### Prawie za darmo: Fly.io z usypianiem

```sh
cd services/caption-burner
fly launch --copy-config --no-deploy        # przyjmij fly.toml z tego katalogu
fly secrets set CAPTION_BURNER_SECRET="$(openssl rand -hex 24)"
fly deploy
fly status                                   # adres: https://<app>.fly.dev
```

`fly.toml` usypia maszynę bez ruchu i budzi ją przy pierwszym zapytaniu
(ok. sekunda) — płacisz za sekundy pracy, czyli grosze miesięcznie; Fly wymaga
karty. Maszyna stale włączona (`auto_stop_machines = "off"`,
`min_machines_running = 1`, `shared-cpu-2x` / 1 GB) to kilka dolarów
miesięcznie i najkrótszy czas wypalania.

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

| Sekret                         | Wartość                                          |
| ------------------------------ | ------------------------------------------------ |
| `CAPTION_BURNER_URL`           | np. `https://finyou-caption-burner.onrender.com` |
| `CAPTION_BURNER_SECRET`        | ten sam ciąg, który dostała usługa               |
| `CAPTION_BURN_TIMEOUT_MINUTES` | opcjonalnie; ile czekać na wynik (domyślnie 45)  |

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
