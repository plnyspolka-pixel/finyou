# X (dawniej Twitter) — publikacja z panelu

Moduł dokłada X do Studia publikacji obok Facebooka, Instagrama, TikToka
i YouTube'a. Architektura jest ta sama co przy TikToku: OAuth 2.0 raz w panelu,
tokeny w bazie, publikacja z istniejącego ticka co 10 minut.

## Co trzeba ustawić raz

### 1. Aplikacja w X Developer Console

W ustawieniach aplikacji (`User authentication settings`):

| Pole                        | Wartość                                                             |
| --------------------------- | ------------------------------------------------------------------- |
| Type of App                 | **Web App, Automated App or Bot** (klient poufny)                   |
| App permissions             | **Read and write** (Direct message tylko, jeśli naprawdę potrzebne) |
| Callback URI / Redirect URL | `https://financeyou.pl/api/x/callback`                              |
| Website URL                 | `https://financeyou.pl`                                             |
| Terms of Service            | `https://financeyou.pl/regulamin`                                   |
| Privacy Policy              | `https://financeyou.pl/polityka-prywatnosci`                        |

**Native App nie zadziała** — publiczny klient nie dostaje Client Secret,
a wymiana kodu na token idzie u nas po stronie serwera.

### 2. Sekrety środowiska

| Sekret             | Obowiązkowy | Opis                                             |
| ------------------ | ----------- | ------------------------------------------------ |
| `X_CLIENT_ID`      | tak         | Client ID z zakładki „Keys and tokens"           |
| `X_CLIENT_SECRET`  | tak         | Client Secret stamtąd samego                     |
| `X_REDIRECT_URI`   | nie         | Domyślnie `https://financeyou.pl/api/x/callback` |
| `X_POST_MAX_CHARS` | nie         | Limit znaków dla konta z X Premium (280–25 000)  |

Prefiks `TWITTER_*` działa jako alias dla każdego z nich — konsola X-a bywa
opisywana starą nazwą i sekrety trafiają pod oba klucze.

### 3. Połączenie konta

Panel → **Ustawienia** (albo **Studio publikacji**) → karta „X" → **Połącz X**.
Przycisk woła admin-only server fn, ta wydaje jednorazowy `state` i PKCE
`code_verifier`, a `/api/x/auth` przepuszcza redirect tylko z ważnym `state`
— bez tego obcy mógłby przejść flow na swoim koncie i podmienić firmową
integrację na własną.

Zakresy: `tweet.read`, `tweet.write`, `users.read`, `media.write`,
`offline.access`. Bez `media.write` upload materiału wraca 403 mimo poprawnego
tokena; bez `offline.access` X nie wyda refresh tokena i integracja padnie po
dwóch godzinach.

## Jak działa publikacja

Wpisy trafiają do wspólnej kolejki `social_publish_queue` z `platform='x'` —
z panelu (Studio publikacji → „Dodaj do kolejki"), z auto-publikacji gotowego
wideo albo przez narzędzie MCP `queue_social_publication`.

Tick `/api/public/hooks/social-publish-tick` (pg_cron co 10 min) w każdym
przebiegu:

1. odświeża `access_token`, jeśli zostało mniej niż 15 minut ważności
   (token X-a żyje 2 h, a `refresh_token` jest **rotowany** — zapisujemy nowy,
   bo poprzedni przestaje działać natychmiast);
2. domyka wpisy z wgranym materiałem (polling przetwarzania po stronie X-a);
3. publikuje **jeden** nowy wpis (darmowy pułap X-a to 500 postów/miesiąc).

Post czysto tekstowy idzie jednym strzałem. Z materiałem: upload chunkowany
(`initialize` → `append` → `finalize`), potem polling `STATUS` — grafiki są
gotowe od razu, wideo X transkoduje asynchronicznie, więc wpis może przeczekać
kilka ticków w stanie `processing` (jak kontener IG albo `publish_id` TikToka).

`x_media_id` zapisujemy **przed** publikacją: gdyby worker padł w środku,
kolejny tick domyka wpis pollingiem, zamiast wgrywać plik drugi raz.

## Treść posta

Limit to 280 znaków liczonych tak, jak liczy je X: **każdy link waży 23 znaki**
(niezależnie od długości — X i tak skraca do t.co), a znaki spoza alfabetów
łacińskich, w tym emoji, liczą się **podwójnie**. Dłuższą treść przycinamy
przed wysyłką, bo X odrzuca za długi post błędem, zamiast go skrócić.
Przycinanie leci na granicy słowa i nigdy nie rozcina linku w połowie — link
wypada w całości albo zostaje w całości.

Logika jest czysta i otestowana: `src/lib/x-post.ts` + `src/lib/x-post.test.ts`.

Materiał: wideo ma pierwszeństwo przed grafiką (X nie pozwala ich łączyć),
grafiki do 5 MB, wideo do 64 MB — limit X-a jest wyższy, ale plik buforujemy
w pamięci workera (128 MB), tak samo jak przy TikToku. Dlatego wideo przechodzi
najpierw przez **kompresję do profilu publikacji** (MP4 H.264/AAC ≤ 1080p
≤ 60 MB — sekcja „Kompresja wideo przed publikacją" w
`docs/studio-publikacji.md`): X nie przyjmuje MOV/HEVC z telefonu, a plik
ponad 64 MB nie przeszedłby przez worker.

## Gdzie co jest

| Element                                      | Plik                                                       |
| -------------------------------------------- | ---------------------------------------------------------- |
| Logika czysta (tekst, chunki, typ materiału) | `src/lib/x-post.ts`                                        |
| OAuth, tokeny, upload, publikacja, tick      | `src/lib/x.server.ts`                                      |
| Server functions panelu                      | `src/lib/x.functions.ts`                                   |
| Karta połączenia                             | `src/components/admin/x-connection-card.tsx`               |
| Start OAuth / callback                       | `src/routes/api/x/auth.ts`, `src/routes/api/x/callback.ts` |
| Migracja (tabela + kolumny kolejki)          | `supabase/migrations/20260926160000_x_publikacja.sql`      |

## Diagnostyka

Karta „X" ma sekcję **Diagnostyka połączenia**: podgląd `client_id` (jawny —
jedzie w URL-u zgody), użyty `redirect_uri` i ostrzeżenie, gdy sekret miał
spację albo znak nowej linii na końcu.

Najczęstsze przyczyny odrzucenia połączenia:

- **Callback URI różni się choćby ukośnikiem** — X porównuje co do znaku.
- **Type of App = Native App** — brak Client Secret, wymiana kodu się nie uda.
- **Brak `media.write`** — post tekstowy przechodzi, a z grafiką wraca 403.
  Po dodaniu zakresu trzeba połączyć konto **ponownie** — stary token nie
  zyskuje uprawnień wstecz.

### Wpis wiszący w „Publikowanie…"

Wpisy **z materiałem** zawieszone w tym stanie tick odbija do kolejki po
30 minutach — brak `x_media_id` dowodzi, że upload się nie zaczął, więc nic nie
poszło na profil.

Wpisów **czysto tekstowych** celowo nie odbijamy automatycznie: nie mają
uploadu, więc nie da się odróżnić „post nie poszedł" od „post poszedł, a worker
padł przed zapisem statusu" — wznowienie opublikowałoby go drugi raz. Taki wpis
zostaje widoczny w kolejce; sprawdź profil i albo usuń wpis, albo kliknij
**Ponów**.
