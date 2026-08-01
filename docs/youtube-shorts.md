# YouTube Shorts — automatyczna publikacja

Moduł publikuje pionowe shorty (MP4, ≤3 min) na kanał YouTube przez
YouTube Data API v3. Panel: **/admin/youtube-shorts**.

## Architektura

| Element              | Plik                                                        |
| -------------------- | ----------------------------------------------------------- |
| Logika OAuth + upload| `src/lib/youtube-shorts.server.ts`                          |
| Server functions     | `src/lib/youtube-shorts.functions.ts`                       |
| Callback OAuth       | `src/routes/api/public/youtube-oauth-callback.ts`           |
| Cron tick            | `src/routes/api/public/hooks/youtube-shorts-tick.ts`        |
| Panel admina         | `src/routes/admin.youtube-shorts.tsx`                       |
| Migracja (tabele+cron)| `supabase/migrations/20260801120000_youtube_shorts.sql`    |

Tabele: `youtube_integration` (singleton z tokenami OAuth — dostęp tylko
service_role) i `youtube_publish_queue` (kolejka publikacji). Cron pg_cron
`youtube-shorts-tick` co 10 minut publikuje wymagalne wpisy (maks. 2 na
przebieg — `videos.insert` kosztuje 1600 z 10 000 dziennych jednostek quota,
czyli ok. 6 uploadów/dobę).

Short = zwykły upload `videos.insert`; YouTube klasyfikuje film jako Short
automatycznie po formacie (pion, ≤3 min). Moduł dokleja `#Shorts` do tytułu.

## Konfiguracja jednorazowa (ręczna — konto Google właściciela kanału)

1. [console.cloud.google.com](https://console.cloud.google.com) → nowy projekt
   (np. „FinanceYou Shorts").
2. **APIs & Services → Library** → włącz **YouTube Data API v3**.
3. **OAuth consent screen**: typ External, scopes `youtube.upload`
   i `youtube.readonly`, potem przełącz na **In production**
   (w trybie Testing refresh token wygasa po 7 dniach).
4. **Credentials → Create OAuth Client ID** (Web application), redirect URI:
   `https://financeyou.pl/api/public/youtube-oauth-callback`
   (nadpisywalne przez env `YOUTUBE_REDIRECT_URI`).
5. Sekrety środowiska (Lovable Cloud / Cloudflare):
   `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`.
6. W `/admin/youtube-shorts` kliknij **Połącz z YouTube** i zatwierdź zgodę na
   koncie właściciela kanału. Refresh token zapisuje się w bazie — połączenie
   jest trwałe (wygasa tylko przy cofnięciu zgody lub 6 miesiącach nieużywania).
7. **Audyt YouTube API** (żeby publiczne uploady nie były blokowane jako
   prywatne): wypełnij [formularz zgodności YouTube API](https://support.google.com/youtube/contact/yt_api_form).
   Do czasu zatwierdzenia bezpieczniej publikować jako `unlisted`/`private`
   i przełączać ręcznie, albo poczekać z publikacją.

## Użycie

Wpisy dodaje się w panelu: tytuł, opis, URL MP4 (można wybrać gotowe wideo
z modułu Awatar FAQ), widoczność i termin. Cron publikuje wpis po terminie;
„Publikuj teraz" wysyła od ręki. Błędny upload ponawia się do 3 razy
z odstępem 30 min, potem ląduje w statusie `failed` (przycisk „Ponów").

Uwaga na źródła HeyGen: ich `video_url` wygasają po pewnym czasie — dla wpisów
planowanych z dużym wyprzedzeniem lepiej wgrać plik do Supabase Storage
i podać trwały URL.

Ręczne wywołanie ticka:
`GET /api/public/hooks/youtube-shorts-tick?run=1` z nagłówkiem
`x-cron-secret: <CRON_SECRET>` (lub `apikey` z kluczem anon — jak pozostałe ticki).
