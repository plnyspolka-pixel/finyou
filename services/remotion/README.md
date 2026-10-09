# remotion — render wideo na AWS Lambda (Remotion Lambda)

Osobny projekt (własne `package.json`, npm) z kompozycjami Remotion i skryptami
do wdrożenia i renderowania na AWS Lambda.

## Co stoi na AWS (region `eu-central-1`)

`npm run lambda:deploy` zakłada / aktualizuje: funkcję Lambda
`remotion-render-<wersja>-…`, bucket S3 `remotionlambda-eucentral1-…`
(strona w `sites/finyou/`, wyniki w `renders/`) oraz grupę logów CloudWatch
(retencja 14 dni). Funkcja korzysta z roli IAM `remotion-lambda-role`
(polityka inline z `npx remotion lambda policies role`). Aktualne nazwy:
`npx remotion lambda functions ls` i `npx remotion lambda sites ls`.

Nazwa funkcji zawiera wersję Remotion — po podbiciu `remotion`/`@remotion/*`
trzeba ponownie uruchomić `npm run lambda:deploy` (powstanie nowa funkcja,
starą można usunąć: `npx remotion lambda functions rmall`).

## Użycie

```bash
cd services/remotion
npm install
aws login --remote --region eu-central-1 --profile finyou   # jeśli sesja wygasła
eval "$(aws configure export-credentials --profile finyou --format env)"

npm run studio                 # podgląd kompozycji lokalnie
npm run lambda:deploy          # funkcja + bucket + strona (idempotentne)
npm run lambda:render          # render HelloFinanceYou na Lambdzie
node render.mjs HelloFinanceYou '{"title":"Pożyczka","subtitle":"w 24 h"}'
```

`render.mjs` wypisuje ścieżkę S3 wyniku, podpisany link (1 h) i szacowany koszt.

## Limity

Konto ma limit **10 równoległych wywołań Lambdy**. Render dzieli film na
kawałki po `framesPerLambda` klatek (+1 wywołanie orkiestrujące), więc dłuższe
filmy przy obecnym limicie trzeba renderować z większym `framesPerLambda`
albo podnieść limit w Service Quotas (Lambda → Concurrent executions).

## Studio: kompozycja `StudioReel` (silnik `remotion`)

Gdy zadanie Studia ma `render_engine = "remotion"` (albo `auto` przy
`STUDIO_RENDER_ENGINE=remotion`), backend po renderze HeyGena nie woła
caption-burnera, tylko `renderMediaOnLambda` z kompozycją `StudioReel`
(`src/StudioReel.tsx`). Wejście: `videoUrl` (czysty master HeyGena) i `plan`
z `src/lib/studio-reel-plan.ts` w głównym projekcie — napisy, znaczek „AI”
i nakładki w kadrze 720×1280, przeskalowane do rozdzielczości mastera.
Długość i kadr kompozycja bierze z pliku (`calculateMetadata` +
`@remotion/media-parser`). Czcionka Inter jest w `public/fonts` (OFL), więc
render nie pobiera nic poza masterem.

Wdrożenie po zmianie kompozycji:

```bash
npm install
npm run lambda:deploy        # aktualizuje stronę `finyou` (StudioReel w środku)
```

Sekrety backendu (Cloudflare / Lovable): `REMOTION_AWS_ACCESS_KEY_ID`,
`REMOTION_AWS_SECRET_ACCESS_KEY` (użytkownik IAM z polityką
`npx remotion lambda policies user`), `REMOTION_FUNCTION_NAME`,
`REMOTION_SERVE_URL` (wypisuje je `lambda:deploy`), opcjonalnie
`REMOTION_REGION` i `REMOTION_FRAMES_PER_LAMBDA` (domyślnie 300).

Podgląd lokalny klatki z planem:

```bash
npx remotion still StudioReel out.png --props=props.json --frame=45
```

gdzie `props.json` to `{"videoUrl": "...", "plan": <wynik buildReelPlan>}`.
