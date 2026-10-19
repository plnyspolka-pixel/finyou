# Zlecenie dla Claude Code: rozbudowa agenta publikującego w social mediach – w pełni automatyczna fabryka wideo, lead magnetów i kanału Finance You (pożyczkobiorcy + inwestorzy, 100% AI)

Od: Filip Bielak, Prezes Finance You sp. z o.o. (przygotowane z Claude, 19.10.2026)
Dla: Claude Code pracujący na kodzie platformy Finance You (React/Lovable + Supabase + Edge Functions, Studio publikacji, konektor MCP Finance You)

W folderze obok są cztery raporty z badań (`raporty/`). Ten dokument jest samowystarczalny, raporty są do pogłębienia.

---

## 1. Cel

Rozbudować istniejącego agenta publikującego w social mediach do systemu, który **bez udziału Filipa**:

1. **Planuje i produkuje** krótkie wideo w 100% przez AI (HeyGen + ElevenLabs) – nikt niczego nie nagrywa.
2. **Prowadzi kanał w dwie strony** – dla **pożyczkobiorców** (przedsiębiorcy potrzebujący finansowania pod zastaw nieruchomości) i dla **prywatnych inwestorów**.
3. **Sam tworzy lead magnety** w różnych formach (wideo, PDF, strona/narzędzie, np. kalkulator) i podpina je pod treści.
4. **Zamienia widzów w leady** – hasło w komentarzu → lead magnet → e-mail/CRM → wniosek (pożyczkobiorca) albo zakup oferty inwestorskiej (inwestor).
5. **Uczy się na danych** – metryki każdej publikacji, outliery, testy hooków, automatyczne korekty planu.
6. **Pilnuje compliance automatycznie** – nic nie czeka na człowieka; treść, która nie przejdzie kontroli, jest przepisywana albo odrzucana.

Optymalizujemy cały proces: koszt i czas produkcji, jakość pierwszych sekund, zasięg, konwersję, koszt leada i ryzyko.

## 2. Zasady nadrzędne

### 2.1 Pełna automatyzacja
- **Tryb `full_autopilot`** dla nowego modułu agenta. Żadnych kolejek akceptacji, żadnego czekania na Filipa – od pomysłu przez scenariusz, render, compliance, publikację, odpowiedzi na komentarze, lead magnety, maile po podbicia reklamowe w ustalonym budżecie.
- Filip dostaje **tylko informacje** (raport dzienny/tygodniowy, SMS przy alarmie) i ma **wyłącznik awaryjny** (pauza całego modułu jednym przełącznikiem w panelu / przez MCP).
- Agent nie zmienia sam swoich twardych reguł compliance ani limitów budżetu (są w kodzie/konfiguracji wersjonowanej, nie w promptach).

### 2.2 Odbiorcy (dwa tory)
- **Pożyczkobiorcy**: przedsiębiorcy, finansowanie wyłącznie na **cel gospodarczy** (platforma B2B – konsumenci wyłączeni). CTA: wniosek (`primary_cta_url` z obecnych ustawień: `https://app.financeyou.pl/embed/wniosek`) albo lead magnet dla pożyczkobiorcy.
- **Inwestorzy**: prywatni inwestorzy (mogą być osobami fizycznymi). Ton: szanse, nie straszenie; wolność finansowa, „zarabiaj tak, jak banki od stuleci”, zarabianie na nieruchomościach bez kupowania, budowania i remontowania. CTA: strona inwestora `https://financeyou.pl/dla-inwestora` albo lead magnet inwestorski.
- Oba tory: język polski, hooki w formie pytania, zadziorne, CTA z zachętą do obserwowania. Klient jest bohaterem przekazu, nie firma. Nie mówimy o „twardych blokadach” systemu – system pokazuje, co można zrobić, decyzja zostaje po stronie klienta.

### 2.3 Technika i marka
- **Rozbudowa, nie nowy system** – patrz sekcja 3a.
- **Studio publikacji to jedyna droga do wideo** (`create_studio_video_job`); napisy zawsze z naszego renderera (caption-burner / Remotion).
- **Awatary: HeyGen, głos i audio: ElevenLabs** (decyzja Filipa 19.10.2026). Bez innych dostawców awatarów.
- Marka: Finance You. Liczby dozwolone w komunikacji: ok. 15 lat na rynku finansowania pozabankowego, ok. 12 stałych partnerów finansowych, tysiące przeanalizowanych tematów, setki obsłużonych klientów, ponad 100 wypłaconych pożyczek. **Nigdy: łączna wartość kapitału, stopy zwrotu, oprocentowanie jako obietnica.**
- Priorytet systemu: poprawność, audytowalność, idempotencja, RLS – ponad skalowalność. Każda decyzja agenta logowana w `ai_growth_action_log`.

## 3. Stan obecny (sprawdzony 19.10.2026 przez MCP)

**Produkcja (Studio publikacji):**
- Pipeline: prompt/`question_id` (bank 250 pytań) → scenariusz AI → głos ElevenLabs „Głos Filipa” (`voice_id 9STbwZjpEbcYG88ZekIQ`, model `eleven_v4`) → awatary HeyGen Filipa (2 twarze na rolkę, rotacja z zestawu domyślnego) → ujęcie → przebitka B-roll → druga twarz → napisy caption-burner (styl `reels`) lub Remotion → znaczek „AI” → biblioteka materiałów → kolejka publikacji.
- Komponenty motion Remotion: stat, range, threshold, versus, checklist, steps, keyword, mythFact, alert, cta.
- Bank B-roll: grafiki dobierane po tagach, rotacja najdawniej użytych.
- 35 zadań w stanie `ready`, kilka gotowych rolek nieopublikowanych.

**Dystrybucja (30 dni):** 72 pozycje w kolejce: 53 opublikowane, 10 nieudanych, 8 anulowanych.
- TikTok: odrzucany – aplikacja bez audytu (`unaudited_client_can_only_post_to_private_accounts`; scenariusz audytu: `docs/tiktok-audyt-nagranie.md`).
- X: brak kredytów API (HTTP 402) i limit 67 MB (materiał 86 MB).
- Facebook Reels: `Endpoint /video-reels/v21.0/{id} doesn't exist` – do naprawy.
- Jedna pozycja FB Reels wisi w `publishing` od 6.10.

**Instagram (pomiar 18.10):** @filipbielakconsulting – 4 obserwujących, 15 rolek od 29.09 z medianą 5 wyświetleń (maks. 35), 0 polubień. Bio i link prowadzą do wniosku o pożyczkę, rolki mówiły do inwestorów. Publikacje nieregularne.

**Lejek:** 1 lead magnet („Wzór umowy pożyczki pod hipotekę dla inwestora”, hasła UMOWA/WZÓR) – nieopublikowany, bez pliku. Mechanizm „komentarz z hasłem → link” istnieje. Landing page'y: 0. Kampanie e-mail: brak aktywnych.

**Silnik wzrostu:** `automation_mode = manual_review`, budżet AI 50 zł/dzień, grupa docelowa „Przedsiębiorcy potrzebujący szybkiego finansowania”, CTA do wniosku. Silnik SEO codziennie publikuje artykuły z **błędnym rokiem 2024** w tytułach – do naprawy.

**Cennik inwestora:** obowiązuje to, co na stronie `https://financeyou.pl/dla-inwestora#cennik` (decyzja Filipa). Stan 19.10: Pakiet Podstawowy – bez opłat stałych, płatność za wziętą okazję (kwota na stronie niepodana); Pakiet PRO – 3 000 zł / 6 mies. + 5% od udzielonej pożyczki. W `access_products` aktywne są inne pozycje (abonament 30 dni 1 500 zł, 365 dni 7 000 zł; PRO 3 000 zł i „okazja” 1 500 zł wyłączone) – rozbieżność do ujednolicenia pod stronę (to jedna z niewielu rzeczy do zgłoszenia Filipowi, p. 8). W treściach wideo nie podajemy cen.

## 3a. To jest ROZBUDOWA istniejącego agenta publikującego

**Najpierw zinwentaryzuj kod, potem rozszerzaj.** Nie twórz równoległych tabel, kolejek, rendererów ani agentów, jeśli istniejące da się rozbudować.

| Obszar | Co już istnieje | Jak rozbudować |
|---|---|---|
| Agent i silnik wzrostu | `ai_growth_settings`, `ai_growth_action_log`, moduły `growth_agent`, `agent_owner` (SMS), `seo_content_engine`; tryby `off / manual_review / semi_auto / full_autopilot`, budżet AI | Nowy moduł wideo/kanału/lead magnetów w tym samym agencie i dzienniku; `full_autopilot`; **dwa profile odbiorców** (pożyczkobiorca, inwestor) z osobną grupą docelową, CTA i budżetem – obecne ustawienia stają się profilem „pożyczkobiorca”. |
| Produkcja | `studio_video_jobs`, `studio_settings`, `studio_default_avatars`, `studio_broll_assets`, `studio_images`, `video_pipeline`, `video_renditions`; caption-burner, Remotion; `create_studio_video_job`, `generate_studio_script`, `set_studio_motion`, `restyle_studio_job_captions` | Hook wizualny, etykieta AI, pętla, warianty wykonania hooka, koszt per rolka, optymalizacja HeyGen. |
| Bank treści | baza 250 pytań (`question_id`), `training_videos`, `avatar_faqs` | Bank do gruntownej przebudowy (5.1a) – automatycznie, na dwa tory. |
| Materiały | `marketing_materials` (klient / inwestor / pośrednik) | `material_audience` zgodnie z torem (`klient` dla pożyczkobiorców, `inwestor`). |
| Publikacja | `social_publish_queue`, `youtube_publish_queue`, `social_posts`, integracje YT/TikTok/X; `queue_social_publication`, `publish_studio_job`, `run_publish_tick` | Sloty per tor, natywne podpisy, opis-lejek, naprawy z Etapu 0. |
| Lejek | `lead_magnets`, `lead_magnet_triggers`, `lead_magnet_posts`, `lead_magnet_signups`; `short_links`, `campaign_clicks`, `lead_attributions`, `tracking_settings`; `leads`, `landing_leads`, `meta_leads` | Fabryka lead magnetów (5.4), hasło + UTM per publikacja, leady do CRM z atrybucją. |
| Narzędzia obliczeniowe | `calculate_loan_installment`, `calculate_ltv`, `calculate_repayment_schedule`, `get_location_score` | Silnik kalkulatorów-lead-magnetów oparty na tych funkcjach. |
| Dokumenty | `document_templates`, `generated_documents`, generator DOCX | Wzory umów jako lead magnety **tylko** z zatwierdzonych szablonów w systemie, nigdy pisane od zera przez AI. |
| E-mail | `email_campaigns`, `email_segments`, `email_subscribers`, `email_templates` | Sekwencje per tor i per lead magnet, newsletter z wideo – wysyłane automatycznie. |
| Landingi | `landing_pages`, `ai_landings`, `ai_landing_variants`, `ai_landing_optimizations` | Strony lead magnetów i narzędzi, link-hub w bio z podziałem na dwa tory, automatyczna optymalizacja wariantów. |
| Reklamy | `meta_campaigns`, `meta_ad_drafts`, `meta_capi_events`, `google_ad_drafts` | Automatyczne podbicia outlierów w limicie budżetu; kategoria specjalna reklam finansowych tam, gdzie wymagana. |
| Analityka | `ai_funnel_events`, `ai_funnel_insights`, insights IG/FB, YouTube API, GA4 | Metryki per publikacja i per lead magnet, outliery, pętla uczenia. |
| Konkurencja | `ai_competitors`, `ai_competitor_snapshots`, `scan_competitor` | Konta social + monitor inspiracji z linków. |
| Komentarze i DM | listy/odpowiedzi IG, FB, YT, Messenger | Obsługa haseł, odpowiedzi szablonowe, przekazanie leada do CRM. |

Na start zapisz mapę (co znalazłeś, co rozbudujesz, czego brakuje) w repo/dokumentacji i wyślij Filipowi jako informację – **nie czekaj na odpowiedź**, działaj dalej.

## 4. Wnioski z badań, na których opieramy system

Pełne dane w `raporty/`.

**Najlepsze kanały finansowe (YouTube API, 14 kanałów, 1107 filmów):**
- „Dwa silniki”: stały cotygodniowy odcinek (ten sam dzień i godzina) + taśma Shorts (Caleb Hammer: równo 3 dziennie o stałych godzinach).
- Shorts dorównują długim filmom tylko jako **osobny, nazwany format**; wycinki gadającej głowy mają 4–11% zasięgu długich filmów.
- Przy tej samej częstotliwości wygrywa **temat** (Minority Mindset: newsy makro podniosły medianę z ~50 tys. do 270 tys.).
- Mediana długości najlepszych Shorts: 50 s; 90% ≤ 60 s. Pętla na końcu: +143% wyświetleń; najlepsze 34–43 s.
- Opis = lejek (1. linia: lead magnet/oferta, UTM per film). Wszyscy zarabiają poza platformą; reklamy YT w PL ~3–4 zł / 1000 wyświetleń.

**Instagram (26 kont, 1480 postów):**
- Duże konta zagraniczne ~12 postów/tydz. (86% rolek); polskie ~6/tydz. (54% karuzel). Polski szczyt publikacji 16:00–17:00.
- „Skomentuj HASŁO” w ~44% podpisów; komentarze rosną typowo 2,6×, gdy hasło prowadzi do **konkretnego darmowego materiału**; efekt znika przy jednym słowie pod wszystkim.
- Stałe godziny publikacji (Hormozi): mediana 463 tys. vs 20 tys. poza slotami. IG optymalizuje pod udostępnienia.

**AI i awatary:**
- Brak dowodu na udany kanał finansowy w 100% z AI bez rozpoznawalnego formatu; masowe klony nie rosną.
- YouTube od 15.07.2025 demonetyzuje treści masowe i powtarzalne – każda rolka musi się istotnie różnić (rotacja wyglądu, B-rollu, formatów, struktur).
- Awatary w finansach działają w edukacji/FAQ; etykieta AI obniża autentyczność u ostrożnych odbiorców. W PL format „prezes mówi o pieniądzach” kojarzy się z deepfake'ami oszustów.

**Rzemiosło rolki:**
- Hook = teza, nie zagadka (test: zatrzymaj po 1. zdaniu). „Hook stack”: szok → ból → rezultat. Wykonanie hooka (tempo, pauza, akcent) potrafi zmienić wynik o rzędy wielkości.
- Kontekst osobisty na starcie, stawka, wróg marki, seria numerowana, zamienniki zdań („Zaobserwuj, żeby zobaczyć część drugą”).
- Formaty: „Nie mów / Powiedz”, „zły / dobry / idealny”, „X vs Y”, ranking, mit vs fakt, „3 błędy”.
- Hooki wizualne pierwszej sekundy generowane wideo-AI: szuflada z umowami, kamera na półce z segregatorami, ujęcie z sufitu na akt notarialny, zamykany laptop z kalkulatorem, „magiczne pojawienie się”, opuszczana księga wieczysta, porównanie dwóch obrazów, kamienica w złotej godzinie.

**Prawo (do zakodowania w regułach, nie jako porada prawna):**
- AI Act art. 50: deepfake oznaczony najpóźniej przy pierwszym kontakcie – od 2.08.2026 (możliwe przesunięcie na 2.12.2026 – niepotwierdzone).
- KNF/ESMA o finfluencerach: „to nie jest porada” nie chroni; sygnały ostrzegawcze: superlatywy, zamknięte grupy, „sam inwestuję” jako wabik, inwestowanie jako zabawa.
- Pino v. Cardone Capital: masowa promocja w social mediach może rodzić odpowiedzialność za obietnice zwrotu. Fast Invest (KNF 2017): gwarancja odkupu udziałów w pożyczkach.

## 5. Docelowa architektura – moduły

### 5.1 Planer treści (dwa tory)
- **Profile odbiorców** w ustawieniach agenta: `pozyczkobiorca` i `inwestor` – grupa docelowa, ton, CTA, dozwolone tematy, zakazane frazy, sloty, udział w kadencji, budżet.
- **Podział kadencji między tory** ustala agent dynamicznie na podstawie wartości leada i kosztu leada w każdym torze (start: 50/50; zmiana maks. o 10 p.p. tygodniowo).
- **Serie i formaty** jako dane. Start:
  - Inwestor: „Czy wiesz, że…”, „Bank vs Ty” (versus), „3 błędy inwestora”, „Nie mów / Powiedz”, „Dzień X ze 100”, cotygodniowy „Audyt zabezpieczenia” (dłuższy odcinek cięty na Shorts).
  - Pożyczkobiorca: „Bank odmówił – co dalej?”, „Ile naprawdę możesz dostać pod nieruchomość (LTV)”, „3 błędy przy finansowaniu pod zastaw”, „Mit vs fakt o pożyczkach pozabankowych”, „Krok po kroku: od wniosku do wypłaty”, cotygodniowe „Studium przypadku” (zanonimizowane).
- **Bank pomysłów**: przebudowany bank pytań (5.1a) + newsy rynkowe (stopy NBP, inflacja, rynek nieruchomości, polityka kredytowa banków) + pytania z komentarzy i DM + inspiracje (5.6) + luki wykryte przez analitykę.
- **Scoring pomysłu** 0–100 (jasność tezy, liczba/kontrast, stawka, kontekst, wróg, potencjał udostępnienia, zgodność z torem i serią, ryzyko compliance). Do produkcji idą tylko pomysły powyżej progu.
- **Generator hooków**: 3–5 wariantów, wybór najlepszego automatycznie; drugi najlepszy idzie do testu A/B.

### 5.1a Przebudowa banku 250 pytań (automatycznie)
- Klasyfikacja każdego pytania do toru (pożyczkobiorca / inwestor / oba), deduplikacja, sprawdzenie aktualności prawa (bank weryfikowany 4.08.2026; agent porównuje z bieżącymi źródłami i oznacza do przepisania).
- Przepisanie na format rolki: hook-teza, konkretna liczba/kontrast, jedno wyjaśnienie bez żargonu, ryzyko jako beat „ale”, puenta zapętlająca, CTA z follow i hasłem.
- Przypisanie do serii, lead magnetu i komponentów motion.
- Stare wersje zostają w historii (wersjonowanie), nowe wchodzą do użytku automatycznie po przejściu compliance.
- Ciągłe uzupełnianie o nowe tematy z danych.

### 5.2 Produkcja w 100% AI (HeyGen + ElevenLabs)
- **Głos**: „Głos Filipa”, `eleven_v4`; 2–3 warianty wykonania hooka (tempo, pauza, akcent) do testów.
- **Twarz: HeyGen** z audio z ElevenLabs (lip-sync do naszej ścieżki – jedno źródło czasów dla napisów i wariantów).
  - Render tylko segmentów z awatarem w kadrze; reszta B-roll/motion. Cache wspólnych ujęć (np. stałe CTA). Brak ponownych renderów przy zmianie samych napisów/motion.
  - Rotacja wariantów wyglądu (strój, tło, kadr) – wymóg „materially varied”.
- **Hook wizualny i B-roll**: modele wideo/obrazu ElevenLabs (ElevenCreative) – biblioteka generowana i odświeżana automatycznie, zapis do banku B-roll z tagami per tor; limit powtórzeń.
- **ElevenLabs Recast**: tylko ilustracyjne sceny B-roll, oznaczone jako AI; nigdy postać mówiąca o pieniądzach.
- **Muzyka i SFX**: bank z ElevenLabs, przypisany do serii.
- **Remotion**: segment hooka wizualnego 0–1,5 s, etykieta „Treść wygenerowana przez AI” w 1. sekundzie + znaczek przez całość, pętla, komponenty motion sterowane planem, linia ryzyka (`alert`) w treściach o pieniądzach.
- Długość 30–45 s (20–60); kompresja pod limity platform (X 67 MB, FB 60 MB).
- Koszt na publikację (TTS, HeyGen, wideo-AI, LLM) w panelu.
- **Kontrola jakości automatyczna**: po renderze transkrypcja Scribe i porównanie ze scenariuszem (zgodność słów, brak przekłamań liczb), detekcja pustych/czarnych klatek, zgodność długości i rozmiaru, obecność etykiety AI. Błąd → ponowienie lub odrzucenie, bez człowieka.

### 5.3 Dystrybucja
- Naprawy z Etapu 0 (FB Reels, wiszące publikacje, TikTok audit, X, SEO 2024).
- **Kadencja startowa**: 5–7 rolek/tydz. na tor w stałych slotach (IG/FB 16:00–17:00, YouTube stała godzina, sloty torów rozdzielone), 1 dłuższy odcinek/tydz. na tor; bez „zrywów”. Agent sam koryguje sloty na podstawie danych (zmiany stopniowe).
- **Konta (decyzja Filipa 19.10.2026): jedno konto na platformę dla obu torów** – bez rozdzielania kont. Dwa tory jako odrębne serie (playlisty YT, wyróżnione relacje IG, rozpoznawalny znacznik serii w 1. sekundzie) + **link-hub w bio** z wyborem „Potrzebuję finansowania” / „Chcę inwestować” (strona generowana i aktualizowana przez system pod stałym adresem). Instagram: obecne konto @filipbielakconsulting. Nazwa, bio i zdjęcie profilowe na IG nie dają się zmienić przez Graph API – przygotuj gotowy tekst i grafikę jako jednorazowe zadanie dla Filipa; sam link w bio wskazuje na link-hub, którego treść system zmienia automatycznie.
- **Natywne podpisy per platforma i tor**; opis-lejek: linia 1 – „Skomentuj HASŁO, a wyślę Ci [materiał]” / link UTM per publikacja; linia 2 – narzędzie; linia 3 – kim jesteśmy (KRS, lata na rynku); zastrzeżenie o ryzyku; oznaczenie AI.
- **Podbicia płatne**: outliery automatycznie promowane przez Meta Ads w miesięcznym limicie per tor; reklamy finansowe w odpowiedniej kategorii specjalnej, targetowanie toru pożyczkobiorców na przedsiębiorców (nie konsumentów).

### 5.4 Fabryka lead magnetów (agent tworzy sam)
Agent sam wykrywa potrzebę, projektuje, tworzy, publikuje, mierzy i wycofuje lead magnety. Każdy ma stronę `/pobierz/<slug>` z zapisem e-mail (zgody RODO z istniejącego mechanizmu), hasła w `lead_magnet_triggers`, powiązanie z publikacjami i sekwencję e-mail.

**Cel nadrzędny lead magnetu: zapis na listę mailingową** (decyzja Filipa). Każdy lead magnet, każda strona i każde narzędzie jest projektowane i optymalizowane pod współczynnik zapisu (opt-in rate), a dopiero dalej pod wniosek/zakup:
- Dostęp do pełnej treści **po zapisie** (strona `/pobierz/<slug>`: obietnica + podgląd → formularz → dostęp i mail z materiałem). Przy narzędziach: część wyniku widoczna od razu, pełny wynik/raport PDF z obliczeniami wysyłany mailem.
- Formularz minimalny: e-mail (+ opcjonalnie imię); tor (pożyczkobiorca/inwestor) i źródło (publikacja, hasło, UTM) zapisywane automatycznie. Zgody RODO z istniejącego mechanizmu; potwierdzenie zapisu (double opt-in) tam, gdzie wymaga tego polityka mailingowa systemu.
- Natychmiastowy mail powitalny z materiałem + automatyczna sekwencja per tor i per lead magnet (`email_segments`, `email_campaigns`).
- Testy A/B nagłówka, obietnicy i podglądu na stronach lead magnetów; zwycięzca automatycznie.
- Podstawowa metryka lead magnetu: zapisy na listę / odsłony strony oraz zapisy na 1 000 wyświetleń publikacji.

**Branding – każdy materiał ma być obrandowany i starannie złożony** (decyzja Filipa):
- Jeden **system marki Finance You** jako źródło prawdy dla wszystkich generatorów (PDF, strony, narzędzia, miniatury, grafiki w wideo, maile): logo, kolory, typografia, siatka, styl ikon i zdjęć. Pobierz go z istniejących zasobów strony/aplikacji (financeyou.pl, panel); jeśli brakuje definicji – wcześniejsze materiały marki używały ciemnego brązu i złota oraz krojów Fraunces + Inter. Zapisz system jako tokeny (np. `brand.json`) używane przez wszystkie szablony.
- Zestaw **profesjonalnie zaprojektowanych szablonów** (projektowanych raz, wypełnianych przez agenta): PDF (okładka, spis treści, nagłówki, ramki „ważne”, tabele, strona końcowa z CTA i danymi firmy), strona lead magnetu, strona narzędzia, mail, karuzela/miniatura. Agent nie składa layoutu od zera – wypełnia szablony treścią.
- Każdy materiał zawiera: logo, dane firmy (Finance You sp. z o.o., KRS 0000635207, kontakt), datę/wersję, zastrzeżenie o ryzyku i informację o treści przygotowanej z użyciem AI tam, gdzie dotyczy.
- **Automatyczna kontrola wizualna** przed publikacją: render podglądu (zrzuty stron PDF i stron www w mobile i desktop) → ocena modelem z widzeniem (zgodność z marką, czytelność, brak ucięć/nakładania się, kontrast, poprawne polskie znaki, działające linki i formuły) → poprawka lub odrzucenie, bez człowieka.

**Formy:**
1. **PDF** – przewodnik, checklista, raport, „ściąga” (np. „Jak czytać księgę wieczystą”, „10 błędów inwestora”, „Dokumenty do wniosku o finansowanie pod zastaw”). Treść LLM → szablon graficzny marki → render PDF; wersjonowanie.
2. **Narzędzie / strona interaktywna** – kalkulatory i porównywarki: LTV i bufor bezpieczeństwa, rata i harmonogram, „ile mogę uzyskać pod moją nieruchomość”, „lokata vs pożyczka pod hipotekę” (bez obietnicy zysku, z założeniami jawnie pokazanymi), potencjał lokalizacji. **Budowane z konfiguracji (JSON: pola, walidacja, formuły z biblioteki zweryfikowanych funkcji systemu – `calculate_ltv`, `calculate_loan_installment`, `calculate_repayment_schedule`, `get_location_score`)**, renderowane przez jeden wspólny komponent. Agent nie generuje i nie wdraża dowolnego kodu w runtime.
3. **Wideo** – mini-kurs (seria 3–5 krótkich odcinków ze Studia, dostęp po zapisie), dłuższy odcinek wyjaśniający.
4. **Kurs e-mail** – 5–7 dni, generowany i wysyłany automatycznie.
5. **Wzory dokumentów** – wyłącznie z zatwierdzonych szablonów w `document_templates` (np. wzór umowy pożyczki dla inwestora); AI nie pisze tekstów prawnych od zera.

**Pętla:**
- Wykrywanie luk: tematy z wysokim zaangażowaniem bez lead magnetu, częste pytania w komentarzach/DM, słowa kluczowe SEO z ruchem, outliery.
- Spec → generacja → compliance (5.7) → kontrola jakości (linki, formuły na przypadkach testowych, poprawność PDF) → publikacja → podpięcie do rolek i opisu.
- Metryki: przede wszystkim **zapisy na listę** (opt-in rate, zapisy na 1 000 wyświetleń), dalej pobrania, użycia narzędzia, otwarcia maili i dalsza konwersja (wniosek / zakup). Słabe lead magnety agent poprawia (wariant A/B) albo wycofuje; mocne – promuje częściej.
- Start (agent tworzy sam, niżej przykładowy zestaw): inwestor – UMOWA (istniejący rekord + szablon), LTV, KSIĘGA, BŁĘDY, START; pożyczkobiorca – ILE (kalkulator kwoty pod nieruchomość), RATA, DOKUMENTY, ODMOWA („bank odmówił – 5 kroków”), PROCES.

### 5.5 Analityka i pętla uczenia
- Codzienny import metryk każdej publikacji (IG Graph: plays/reach/saves/shares/comments/follows; YouTube Analytics: views, średni czas, % obejrzenia, subskrypcje; FB) i każdego lead magnetu.
- Na publikację: tor, seria, format, hook (tekst + wariant wykonania), hook wizualny, długość, slot, hasło, lead magnet, komponenty motion, koszt.
- Outliery (≥ 3× mediany konta i toru) → automatyczna kontynuacja (część 2, ten sam format z nowym tematem) i ewentualne podbicie.
- Testy A/B hooków i wykonań, decyzja po 72 h, zwycięzca staje się domyślnym wzorcem.
- Raport dzienny (krótki) i tygodniowy (pełny) do Filipa – informacyjnie: wyniki per tor, leady, koszt na lead, co agent zmienił i dlaczego.
- Punkt odniesienia: własna mediana per tor.

### 5.6 Monitor inspiracji i konkurencji
- Wklejony link (FB/IG/YT/TikTok) lub zapisana rolka → pobranie podpisu, statystyk, transkrypcji (FB/IG: URL MP4 z HTML strony → ElevenLabs Scribe; YouTube: napisy) → analiza LLM (hook, wzorzec, struktura, format, CTA, outlier u twórcy, co przenieść, do którego toru) → baza „Inspiracje” → automatycznie do banku pomysłów.
- Śledzenie kont co tydzień (IG Business Discovery, YouTube Data API). Start: Codie Sanchez, Mark Tilbury, Graham Stephan (@gpstephan), Humphrey Yang, Ramit Sethi, Hormozi, Marcin Iwuć (@marcin_iwuc_fbo), Kuba Midel, M2 Investments, TMS Productions, Viewcci + polskie konta pożyczek/finansowania firm wykryte przez agenta.

### 5.7 Compliance w pełni automatyczne
Każda treść (scenariusz, napisy, tytuł, opis, odpowiedź na komentarz, mail, lead magnet, strona, reklama) przechodzi przez bramkę przed publikacją. Nie ma ścieżki ominięcia.

1. **Reguły twarde (deterministyczne, w kodzie, wersjonowane)** – blokują i wymuszają przepisanie:
   - wspólne: „gwarant*”, „bez ryzyka”, „pewny/bezpieczny zysk”, „minimalne ryzyko”, „stabilne zyski”, konkretne % zwrotu lub oprocentowania jako obietnica, „podwój”, superlatywy bez pokrycia, zaproszenia do zamkniętych grup/klubów w treściach awatara, logotypy i nazwy instytucji (KNF, banki) jako rekomendacja, „to nie jest porada” jako jedyne zastrzeżenie, ceny w wideo, dane osobowe/identyfikujące klientów;
   - tor pożyczkobiorcy: kierowanie do konsumentów (cel inny niż gospodarczy), „dla każdego”, „bez sprawdzania”, „100% decyzji pozytywnych”, „bez BIK/bez zdolności” jako obietnica, presja czasu wobec osób w trudnej sytuacji, koszt/oprocentowanie jako hasło;
   - tor inwestora: obietnice zwrotu, gwarancja odkupu, „drukarka do pieniędzy” bez zdania równoważącego ryzyko, „sam też inwestuję” jako wabik.
2. **Elementy obowiązkowe**: etykieta AI w 1. sekundzie i znaczek przez całość, oznaczenie AI w opisie i flagi platform (YouTube altered/synthetic, Meta AI info, TikTok AIGC), linia ryzyka w treściach o pieniądzach, identyfikacja nadawcy (Finance You, KRS) w opisie, oznaczenie autopromocji tam, gdzie wymagane.
3. **Recenzent LLM niezależny od autora** (inny model / osobny prompt) ocenia ryzyko (wprowadzanie w błąd, obietnice, ton wobec osób w trudnej sytuacji, zgodność z torem) i zwraca konkretne poprawki.
4. **Pętla naprawcza**: autor przepisuje według uwag (maks. 3 iteracje); jeśli nadal nie przechodzi – treść jest odrzucana, temat wraca do banku z adnotacją, agent bierze kolejny. **Nic nie czeka na człowieka.**
5. **Po publikacji**: monitoring komentarzy i sygnałów platform (ostrzeżenia, usunięcia, ograniczenia zasięgu, fala negatywnych komentarzy) → automatyczne ukrycie/usunięcie publikacji, pauza serii i SMS do Filipa.
6. **Audyt**: log każdej decyzji compliance (wersja reguł, wynik, uwagi, finalny tekst) – pełna audytowalność.
7. Awatar Filipa: edukacja/FAQ, bez ofert, pilności i stóp zwrotu.
8. Zmiana reguł twardych tylko przez commit w repo (nie przez agenta).

### 5.8 Bezpieczniki autopilota
- Limity: dzienny budżet AI, kredyty HeyGen, budżet reklam per tor i miesiąc, maks. liczba publikacji na dobę na konto, maks. liczba maili na odbiorcę.
- Wyłącznik awaryjny (panel + MCP) i automatyczna pauza przy anomaliach (błędy publikacji z rzędu, skok kosztów, ostrzeżenia platform, spadek jakości kontroli).
- Idempotencja publikacji (bez duplikatów), retry z backoffem, obsługa wygasających tokenów (Meta, YouTube, TikTok) z alertem.
- SMS do Filipa (moduł `agent_owner`) tylko przy alarmach i do raportu.

## 6. Kolejność prac (bez punktów akceptacji – po każdym etapie raport informacyjny)

- **Etap −1 – inwentaryzacja**: mapa istniejącego agenta (3a), zapis w repo.
- **Etap 0 – naprawy**: FB Reels, wiszące publikacje, rok 2024 w SEO, kompresja pod limity, TikTok (dokończyć audyt), X (wyłączyć kanał do czasu decyzji o kredytach), publikacja gotowych rolek z `ready` po przejściu nowej bramki compliance.
- **Etap 1 – fundament**: profile dwóch torów w ustawieniach agenta, `full_autopilot` modułu, bezpieczniki (5.8), bramka compliance (5.7), log decyzji.
- **Etap 2 – dane**: metryki per publikacja i lead magnet, mediany, outliery, raporty.
- **Etap 3 – fabryka lead magnetów**: system marki i szablony (PDF, strona, narzędzie, mail), kontrola wizualna, strony z zapisem na listę i sekwencje powitalne, PDF, silnik kalkulatorów z konfiguracji, mini-kursy wideo, kursy e-mail, strony `/pobierz`, link-hub w bio, sekwencje.
- **Etap 4 – produkcja**: optymalizacja HeyGen + ElevenLabs, hooki wizualne i B-roll z wideo-AI, muzyka/SFX, Remotion (hook, etykieta AI, pętla, linia ryzyka), kontrola jakości po renderze.
- **Etap 5 – planer**: przebudowa banku pytań na dwa tory, serie, scoring, generator hooków, testy A/B, dynamiczny podział kadencji.
- **Etap 6 – silnik nr 1**: cotygodniowe dłuższe odcinki per tor cięte na Shorts.
- **Etap 7 – monitor inspiracji** i śledzenie kont.
- **Etap 8 – podbicia płatne** w limitach.

## 7. KPI (90 dni; start: IG 4 obserwujących, mediana 5 wyświetleń)

- Regularność: ≥ 5 rolek/tydz. na tor + 1 dłuższy odcinek na tor; 0 „zrywów”.
- Mediana wyświetleń per tor na IG i YT rośnie tydzień do tygodnia; cel ≥ 1 000 po 90 dniach (z podbiciami).
- Share rate i obserwacje na 1 000 wyświetleń per seria.
- Leady: każdy tor z aktywnymi lead magnetami; koszt na lead, konwersja na wniosek (pożyczkobiorcy) i na zakup (inwestorzy) mierzone.
- Lead magnety: ≥ 10 aktywnych po 90 dniach, w tym ≥ 3 narzędzia interaktywne; najsłabsze automatycznie wymieniane; 100% obrandowanych z szablonów i po kontroli wizualnej.
- **Lista mailingowa (główna miara lejka)**: przyrost zapisów tydzień do tygodnia per tor, opt-in rate stron lead magnetów, zapisy na 1 000 wyświetleń.
- Koszt produkcji rolki raportowany; spadek kosztu HeyGen na rolkę.
- Compliance: 100% treści przez bramkę i z etykietą AI; 0 publikacji z pominięciem bramki; czas reakcji na sygnał platformy < 1 h.
- Zero ingerencji Filipa wymaganej do działania (poza p. 8).

## 8. Jednorazowe wejścia od Filipa (zgłoś na starcie, nie blokuj pracy – używaj wartości domyślnych)

1. Pełny dostęp do ElevenLabs z wideo/obrazem/muzyką (klucz API lub pełny konektor MCP `https://api.elevenlabs.io/v1/mcp`). Do czasu dostępu: B-roll z obecnego banku.
2. Limity budżetu (domyślnie do czasu odpowiedzi: AI 50 zł/dzień jak dziś; reklamy 0 zł – podbicia wyłączone).
3. Kwota opłaty za okazję w Pakiecie Podstawowym i ujednolicenie `access_products` ze stroną (do tego czasu w treściach nie ma cen).
4. Decyzja o X (domyślnie kanał wyłączony) i dokończenie audytu TikTok (nagranie wg `docs/tiktok-audyt-nagranie.md`).
5. Jednorazowy przegląd prawny zestawu reguł z 5.7 (reguły działają od razu; przegląd może je zaostrzyć).

## 9. Materiały źródłowe w paczce (`raporty/`)

- `Warsztat rolek od najlepszych.md` – metody najlepszych twórców; biblioteka hooków, szkielet rolki, compliance.
- `Kanały finansowe i AI od kuchni.md` – co faktycznie robią najlepsze kanały (dane z API), polski rynek, kanały AI, awatary, przepisy.
- `Instagram finansowy w liczbach.md` – pomiar 26 kont IG, lejki „skomentuj HASŁO”, punkt odniesienia Finance You.
- `Rozbiór zapisanych rolek.md` – transkrypcje i wnioski z 38 inspiracji (ElevenLabs Recast, hooki wizualne, TMS).
