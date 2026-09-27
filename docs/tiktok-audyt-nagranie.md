# TikTok — nagranie do audytu Content Posting API

Scenariusz nagrania ekranu do wniosku audytowego (Direct Post). Audytor sprawdza
nie to, _że_ publikacja działa, ale czy **ekran przed publikacją** spełnia
Content Sharing Guidelines. Każdy punkt poniżej odpowiada jednemu wymogowi —
jeśli czegoś nie widać na nagraniu, uznaje się to za brak.

## Przed nagraniem

1. Migracje wdrożone: `20260926120000_tiktok_content_posting.sql`
   i `20260926140000_tiktok_ustawienia_publikacji_tworcy.sql`.
2. **Aplikacja w TikTok for Developers ma dodane DWA produkty:**
   - **Login Kit** — z włączonym przełącznikiem **Configure for Web**. Bez tego
     endpoint `/v2/auth/authorize/` odrzuca żądanie komunikatem „popraw
     client_key", nawet gdy klucz jest w pełni poprawny. Content Posting API
     **nie wystarcza** do zalogowania — to osobny produkt.
   - **Content Posting API** — z opcją **Direct Post**.
3. Zakresy `user.info.basic` i `video.publish` włączone dla aplikacji,
   Redirect URI wpisany dokładnie jako `https://financeyou.pl/api/tiktok/callback`
   (również w konfiguracji Login Kit dla Web).
4. Sekrety ustawione: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`. Klucz ma
   kształt `aw` + 14 znaków (16 łącznie), np. `aw7nk86b7czitwc9` — jeśli Twój
   wygląda inaczej, prawdopodobnie wkleiłeś Client secret albo App ID.
   Podgląd klucza i wysyłanego Redirect URI pokazuje „Diagnostyka połączenia"
   w karcie TikTok w panelu.
5. **Jeśli nagrywasz na sandboxie** (typowa droga przed audytem):
   - Sandbox ma **własne** `client_key` i `client_secret` — inne niż produkcyjne.
     Wgraj je do sekretów na czas nagrywania.
   - W sandboxie dodaj konto TikTok, którym będziesz się logować, do listy
     **Target Users**. Bez tego ekran zgody kończy się błędem
     `non_sandbox_target` — klucz jest wtedy poprawny, odrzucane jest konto.
     TikTok wymaga potwierdzenia, że konto należy do Ciebie.
   - W sandboxie `creator_info` zwykle zwraca wyłącznie `SELF_ONLY`, więc lista
     prywatności na ekranie publikacji będzie jednopozycyjna. To poprawne
     zachowanie, nie błąd — panel pokazuje dokładnie to, na co pozwala konto.
   - **Po zatwierdzeniu audytu wróć do kluczy produkcyjnych.** Zostawione
     sekrety sandboxowe oznaczają, że publikacja nigdy nie trafi do prawdziwych
     odbiorców.
6. Gotowy pionowy MP4 (9:16) w buckecie `studio-media` — **nie** URL z HeyGen,
   te wygasają.
7. Konto TikTok, na które publikujesz, wylogowane w przeglądarce (nagranie ma
   pokazać pełne logowanie i zgodę).
8. Nagrywaj **całe okno przeglądarki z widocznym paskiem adresu** — audytor
   chce widzieć domenę i przejście na `tiktok.com`. Bez cięć w środku flow.
9. Język panelu: polski jest OK, ale jeśli wniosek składasz po angielsku,
   dopisz w opisie wniosku tłumaczenie etykiet (albo nagraj z krótkim
   komentarzem lektorskim / napisami po angielsku).

## Scenariusz — po kolei

### 1. Połączenie konta (OAuth)

1. Wejdź na `/admin/studio-publikacji`, zakładka **Publikacja**.
2. Pokaż kartę **TikTok** ze stanem „nie jest połączone".
3. Klik **Połącz TikTok** → pasek adresu przechodzi na `www.tiktok.com`.
4. Zaloguj się i pokaż **ekran zgody TikToka z listą zakresów**
   (`user.info.basic`, `video.publish`). Zatrzymaj się na nim ~2 s — to dowód,
   że nie obchodzisz zgody.
5. Zaakceptuj → powrót na panel, karta pokazuje zieloną kropkę, `open_id`
   i datę wygaśnięcia tokena.

### 2. Ekran publikacji — sedno audytu

6. Zaznacz checkbox **TikTok** na liście platform.
7. Wklej tytuł i URL pliku MP4.
8. Gdy pojawi się sekcja **Ustawienia posta na TikToku**, pokaż po kolei —
   najlepiej z chwilą zatrzymania na każdym:

   | Co pokazać                                                          | Wymóg, który to spełnia                                            |
   | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
   | Nick konta w nagłówku sekcji                                        | publikacja na wskazane, uwierzytelnione konto                      |
   | Rozwinięta lista **„Kto może zobaczyć ten film?"** z opcjami        | prywatność wybiera twórca, opcje z `creator_info`, brak hardkodu   |
   | To, że startowo jest **„— wybierz —"**                              | brak domyślnej prywatności (szczególnie brak domyślnie publicznej) |
   | Przełączniki **Komentarze / Duet / Stitch**                         | widoczne ustawienia interakcji                                     |
   | Wyszarzony przełącznik z dopiskiem „wyłączone w ustawieniach konta" | ograniczenia konta respektowane (jeśli Twoje konto coś blokuje)    |
   | **Ujawnij treść komercyjną** — domyślnie wyłączone                  | disclosure off by default                                          |
   | Po włączeniu: **Twoja marka** i **Treść brandowana**                | wymagane checkboxy                                                 |
   | Etykieta „Film zostanie oznaczony jako: …"                          | twórca wie, jak TikTok oznaczy film                                |
   | Napis **„Publikując, akceptujesz Music Usage Confirmation"**        | deklaracja zgody tuż przed przyciskiem publikacji                  |

9. **Pokaż blokadę.** Zostaw prywatność na „— wybierz —" i najedź na przycisk
   publikacji — jest nieaktywny. Dopiero po wybraniu prywatności staje się
   klikalny. To najmocniejszy dowód, że nie hardkodujecie prywatności.
10. Opcjonalnie pokaż drugą blokadę: włącz **Treść brandowana**, wybierz
    prywatność „Tylko ja" → opcja jest niedostępna / pojawia się komunikat.
    (Reguła TikToka: treść brandowana nie może być prywatna.)

### 3. Publikacja i efekt

11. Wybierz prywatność, ustaw przełączniki, klik **Dodaj do kolejki publikacji**.
12. Pokaż wpis w **Kolejce publikacji** z badge'ami TikToka: `TikTok: start` →
    `wysyłanie chunków…` → `przetwarzanie…`.
13. Klik **Publikuj teraz**, żeby nie czekać na cron, i pokaż przejście do
    `TikTok: opublikowano`.
14. Przejdź do aplikacji/strony TikTok na tym koncie i pokaż opublikowany film.

> **Uwaga o prywatności przed audytem:** klient bez audytu ma wymuszone
> `SELF_ONLY` — film wyjdzie prywatny i to normalne. Jeśli lista prywatności
> pokazuje tylko „Tylko ja", powiedz o tym w opisie wniosku; audytor to zna.
> Nie próbuj tego obchodzić.

## Czego NIE robić na nagraniu

- Nie wycinaj ekranu zgody TikToka ani logowania.
- Nie pokazuj konsoli deweloperskiej z tokenami, nie pokazuj sekretów.
- Nie nagrywaj wersji, w której prywatność jest wybrana z góry i twórca jej nie
  widzi — to dokładnie powód odrzucenia wniosku.
- Nie publikuj filmu z wypalonym logo innej platformy ani watermarkiem.
  Render Studia wypala **tylko napisy**, więc jest OK.

## Skąd te wymogi

TikTok Content Sharing Guidelines, m.in.: _„Developers should not hardcode one
privacy setting… your export screen must reflect those values"_ oraz wymóg
deklaracji przed przyciskiem publikacji: _„By posting, you agree to TikTok's
Music Usage Confirmation"_. Implementacja: `src/lib/tiktok-upload.ts`
(walidacja), `src/components/admin/tiktok-post-options-fields.tsx` (ekran),
`src/lib/tiktok.server.ts` (publikacja wyborami twórcy).
