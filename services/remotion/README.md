# Remotion — render rolek Studia (React zamiast ASS/libass)

Kompozycja `Reel` (720×1280, 30 fps): czysty master z HeyGena + napisy +
nakładki dynamiczne (znacznik kategorii, tytuł, karty) + znaczek „AI", w szacie
„dark-glow navy+gold" strony (Montserrat, złoto, niebieska poświata).

Dane wejściowe to ten sam model co w ścieżce ASS (`DynamicOverlays` po
`overlaysWithCueTiming`, pocięte kwestie SRT) — logikę treści i czasu ma
aplikacja (`src/lib/caption-style.ts`, `shorts-series.ts`), tu jest tylko wygląd.

## Render na AWS Lambda

Jednorazowo w AWS (polityki: `bunx remotion lambda policies user|role`):
użytkownik IAM z polityką „user" i klucz dostępu, rola `remotion-lambda-role`
z polityką „role". Klucze w env: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AWS_REGION` (domyślnie `eu-central-1`).

```bash
bun install
node scripts/deploy.mjs                       # funkcja + bucket + strona → deploy-output.json
bun scripts/make-props.ts --video <master.mp4> --srt <napisy.srt> --episode 1
node scripts/render.mjs props.json            # → URL MP4, czas, koszt
```

Lokalnie (Chromium): `bunx remotion render src/index.ts Reel out/reel.mp4 --props=props.json`,
podgląd: `bunx remotion studio src/index.ts`.

Licencja: Remotion jest darmowy dla osób i firm do 3 osób; powyżej wymagana
licencja firmowa (remotion.pro).
