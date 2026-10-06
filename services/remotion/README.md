# remotion — render rolek Studia na AWS Lambda (Remotion Lambda)

Osobny projekt (własne `package.json`, npm) z kompozycjami Remotion i skryptami
do wdrożenia i renderowania na AWS Lambda. Zastępuje usługę FFmpeg na Renderze
w roli **silnika napisów**: napisy, znaczek „AI" i nakładki dynamiczne rolek
są tu komponentami React (`src/StudioReel.tsx`), a nie plikiem ASS.

## Co stoi na AWS (region `eu-central-1`)

`npm run lambda:deploy` zakłada / aktualizuje:

- funkcję Lambda `remotion-render-<wersja>-…` (render klatek, 2 GB RAM),
- bucket S3 `remotionlambda-eucentral1-…` (strona w `sites/finyou/`, wyniki
  w `renders/`, reguły wygasania — render zlecony z `deleteAfter: "1-day"`
  znika sam),
- grupę logów CloudWatch (retencja 14 dni),
- **gateway** `finyou-remotion-gateway` (`gateway.mjs`) z adresem Function
  URL — mała Lambda, przez którą backend Finance You zleca rendery i odbiera
  wynik. Chodzi na tej samej roli IAM `remotion-lambda-role`, co funkcja
  renderująca.

Skrypt na końcu drukuje `REMOTION_RENDER_URL` i `REMOTION_RENDER_SECRET` —
wpisz je w sekretach Finance You (Lovable → ustawienia → sekrety). Od tej
chwili Studio wysyła napisy na Remotion; usługa caption-burner zostaje
do kompresji przed publikacją (i jako zapas napisów, gdy Remotion nie jest
skonfigurowany). Szczegóły przełącznika: `src/lib/caption-burner.server.ts`
i `src/lib/remotion-render.server.ts` w aplikacji.

Nazwa funkcji zawiera wersję Remotion — po podbiciu `remotion`/`@remotion/*`
trzeba ponownie uruchomić `npm run lambda:deploy` (powstanie nowa funkcja,
starą można usunąć: `npx remotion lambda functions rmall`; gateway dostanie
nową nazwę w zmiennych środowiskowych).

## Użycie

```bash
cd services/remotion
npm install
aws login --remote --region eu-central-1 --profile finyou   # jeśli sesja wygasła
eval "$(aws configure export-credentials --profile finyou --format env)"

npm run studio                 # podgląd kompozycji lokalnie
npm run lambda:deploy          # funkcja + bucket + strona + gateway (idempotentne)
npm run lambda:render          # render HelloFinanceYou na Lambdzie
node render.mjs StudioReel @props.json   # render rolki z pliku z propsami
```

`render.mjs` wypisuje ścieżkę S3 wyniku, podpisany link (1 h) i szacowany koszt.

Po wdrożeniu sprawdź gateway: `curl https://<url>/health` (bez tokenu) oraz
w aplikacji `heygen_status` → `remotion_render`.

## Kompozycja `StudioReel`

Wejście (`inputProps`, buduje je `buildStudioReelInput` w aplikacji):

| Pole       | Znaczenie                                                                 |
| ---------- | ------------------------------------------------------------------------- |
| `videoUrl` | https do czystego mastera (HeyGen / bucket `studio-media`)                |
| `cues`     | kwestie SRT **już pocięte pod styl** (`chunkCues`); `[]` = bez napisów    |
| `style`    | preset z `CUSTOM_CAPTION_STYLES` (`src/lib/caption-style.ts`) albo `null` |
| `aiBadge`  | znaczek „AI" w prawym górnym rogu                                         |
| `overlays` | nakładki dynamiczne z czasami już dopasowanymi do SRT                     |

Długość i kadr kompozycja czyta z samego pliku (`calculateMetadata`,
mediabunny — nagłówki MP4 zakresami HTTP, bez dekodowania). Wszystkie
wymiary presetów są w pikselach kadru 720×1280 i skalują się do rozdzielczości
mastera. Czcionka Inter leży w `public/fonts` (OFL), więc render nie zależy od
Google Fonts.

Stałe wyglądu (kolory brandu, układ nakładek, znaczek) kompozycja importuje
wprost z `../../../src/lib/caption-style.ts` — jedno źródło prawdy dla
podglądu w panelu, ASS (caption-burner) i Remotion.

### Test lokalny

```bash
ffmpeg -f lavfi -i testsrc2=size=720x1280:rate=25 -f lavfi -i sine=frequency=440 \
  -t 8 -pix_fmt yuv420p -c:v libx264 -c:a aac out/in.mp4
# props.json: { "videoUrl": "http://127.0.0.1:8099/in.mp4", "cues": [...], "style": {...}, "aiBadge": true, "overlays": {...} }
npx remotion render StudioReel out/test.mp4 --props=out/props.json
```

Serwer plików musi obsługiwać nagłówek `Range` (python `http.server` nie
obsługuje). Chromium bez kodeka H.264 (np. z Playwrighta) renderuje poprawnie —
klatki wideo wyciąga kompozytor Remotion, nie przeglądarka.

## Gateway — API

Każde wywołanie poza `/health` wymaga `Authorization: Bearer <REMOTION_RENDER_SECRET>`.

| Metoda   | Ścieżka          | Co robi                                                                      |
| -------- | ---------------- | ---------------------------------------------------------------------------- |
| `GET`    | `/health`        | `{ ok, engine: "remotion", function, site, bucket, concurrency }`            |
| `POST`   | `/jobs`          | `{ video_url, cues, style, ai_badge, overlays, name }` → `202 { id }`        |
| `GET`    | `/jobs/:id`      | `{ status: queued\|processing\|done\|failed, error, progress, bytes, cost }` |
| `GET`    | `/jobs/:id/file` | `{ url, bytes }` — podpisany link S3 (1 h); `409`, gdy render trwa           |
| `DELETE` | `/jobs/:id`      | kasuje pliki renderu w S3                                                    |

## Koszty i limity

- Render rolki 60 s (720×1280, 30 kl./s) to ok. 0,01–0,02 $ (Lambda + S3);
  gateway i odpytywanie stanu — ułamki centa. `GET /jobs/:id` zwraca szacunek
  Remotion w polu `cost`, a kolejka Studia zapisuje go w `note`.
- Konto ma limit **10 równoległych wywołań Lambdy**. Gateway renderuje
  z `concurrency = 8` (REMOTION_CONCURRENCY): 1 Lambda orkiestrująca + 8
  renderujących. Więcej równoległych rolek naraz = kolejka po stronie
  Studia (tick co 10 min i tak zleca po kilka). Wyższy limit: Service Quotas →
  Lambda → Concurrent executions.
- Licencja Remotion: darmowa dla osób prywatnych i firm do 3 osób; większa
  firma potrzebuje licencji (plan „Automators" przy renderach na Lambdzie).
