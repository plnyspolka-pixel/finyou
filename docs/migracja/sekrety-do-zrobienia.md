# Sekrety: co zostało do zrobienia po Twojej stronie (stan 2026-11-03)

Klasyfikator uprawnień w sesji Claude blokuje: włączanie API i tworzenie sekretów/kont usługi w Google Cloud,
zmiany konfiguracji webhooków, odsłanianie istniejących tokenów oraz logowanie hasłem. Poniżej dokładnie to,
co trzeba kliknąć ręcznie. Po każdym kroku Claude kopiuje wartość ze schowka do pliku na pulpicie
(`wpisz-ze-schowka.ps1 NAZWA`) i dogrywa do Workera (`wgraj-klucze.sh`). Wartości nie wklejaj do czatu.

## Google Cloud (projekt „My Maps Project", alpine-zodiac-497718-f1, konto plnyspolka)

1. **YOUTUBE_CLIENT_SECRET** – Platforma uwierzytelniania → Klienty → „Klient internetowy 1" → sekcja
   „Tajne klucze klienta" → **Add secret** → skopiuj nowy klucz (pokazany raz). Client ID już wgrany.
2. **Włącz API**: Google Drive API, Google Docs API, Google Sheets API
   (Biblioteka → wyszukaj → Włącz). PageSpeed, YouTube, Search Console, Analytics Data już są włączone.
3. **GOOGLE_SERVICE_ACCOUNT_JSON** – IAM → Konta usługi → Utwórz konto usługi (np. `finyou-worker`)
   → bez ról projektu → Klucze → Dodaj klucz → JSON (pobierze się plik). Zapisz plik np. na pulpicie;
   Claude zamieni go na jedną linię w pliku sekretów. Potem udostępnij adres e-mail konta usługi:
   w Search Console (financeyou.pl, użytkownik z pełnym dostępem), w GA4 (administracja → dostęp do
   usługi, Przeglądający) i w Dysku dla folderu z szablonami dokumentów.

## AWS (Remotion)

4. **REMOTION_AWS_ACCESS_KEY_ID / REMOTION_AWS_SECRET_ACCESS_KEY** – IAM → użytkownik używany przez
   Remotion (albo nowy) → Poświadczenia bezpieczeństwa → Utwórz klucz dostępu → „Aplikacja poza AWS".
   Oba wartości skopiuj od razu (secret pokazany raz). REMOTION_FUNCTION_NAME i REMOTION_REGION są już
   w Workerze.

## Dostawcy z logowaniem hasłem (zaloguj się w Chrome, Claude utworzy/skopiuje klucz)

5. **Jina** (jina.ai → API key) – JINA_API_KEY.
6. **Didit** (business.didit.me) – DIDIT_API_KEY_NEW (kod czyta najpierw _NEW, potem DIDIT_API_KEY),
   DIDIT_WORKFLOW_ID_KYC już jest w Workerze; DIDIT_WORKFLOW_ID i _KYB tylko jeśli używasz osobnych workflow.
7. **Dilisense** (dilisense.com → konto → API key) – DILISENSE_API_KEY.
8. **Microsoft Clarity** (clarity.microsoft.com → projekt → Settings → Data Export → Generate new token)
   – CLARITY_API_TOKEN.
9. **TikTok for Developers** (developers.tiktok.com/apps) – TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET
   z aplikacji; Redirect URI w aplikacji TikTok: `https://financeyou.pl/api/tiktok/callback`
   (domyślna wartość w kodzie; jeśli ma być inna, ustaw też sekret TIKTOK_REDIRECT_URI).
10. **Tpay** (panel.tpay.com → Ustawienia → API) – TPAY_CLIENT_ID, TPAY_CLIENT_SECRET;
    TPAY_NOTIFICATION_SECRET (sekret powiadomień) jeśli używany. Tych nazw nie ma w pliku na pulpicie,
    Claude je dopisze.

## Tokeny generowane w portalach urzędowych (tylko Ty, z podpisem/profilem zaufanym)

11. **KSEF_TOKEN_FINANCE_YOU, KSEF_TOKEN_FUNDACJA_IM_PIECZAKA** – ksef.mf.gov.pl → Aplikacja Podatnika →
    kontekst podmiotu → Tokeny → Generuj (uprawnienia: wystawianie i odczyt faktur).
12. **GUS_BIR_API_KEY** – api.stat.gov.pl/Home/RegonApi → rejestracja → klucz przychodzi mailem.
    **GUS_BDL_API_KEY** – api.stat.gov.pl/Home/BdlApi → rejestracja → klucz mailem.
13. **CEIDG_JWT_TOKEN** – dane.biznes.gov.pl → konto → API → wygeneruj token JWT (ma datę ważności).
14. **EU_FSF_TOKEN** – webgate.ec.europa.eu/fsd/fsf → konto EU Login → „Show settings" → token do pliku XML.

## Dane, które znasz tylko Ty (wpisz ręcznie do pliku na pulpicie po znaku =)

15. **CMD_KW_USER, CMD_KW_PASSWORD** – dane dostępowe do usługi CMD KW (z umowy).
16. **EASYMKW_API_USER, EASYMKW_API_PASSWORD** – dane z umowy EasyMKW (brak panelu).
17. **OWNER_ALERT_PHONE** – numer telefonu właściciela do alertów SMS, format +48XXXXXXXXX.
18. **CAPTION_BURNER_URL, CAPTION_BURNER_SECRET** – adres usługi caption-burner (Render/Fly, patrz
    `services/caption-burner/README.md`) i sekret ustawiony w jej Environment. Jeśli usługa nie jest
    jeszcze wdrożona w nowym miejscu, zostaw puste; sekret generuje się przy wdrożeniu
    (`openssl rand -hex 24`) i wpisuje w obu miejscach.

## Po uzupełnieniu

```bash
bash scripts/migracja/wgraj-klucze.sh "$USERPROFILE/Desktop/sekrety-do-uzupelnienia.txt"
```

Skrypt pomija puste pozycje i nadpisuje tylko nazwy obecne w pliku.
