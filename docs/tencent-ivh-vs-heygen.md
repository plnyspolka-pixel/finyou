# Tencent Cloud AI Digital Human (IVH) jako alternatywa dla HeyGen

Analiza z 2026-09-26. Punkt wyjścia: <https://xiaowei.tencentcloud.com/ivh/>
(konsola aPaaS „智能小微” / AI Digital Human).

> **Ograniczenie tej analizy.** Polityka sieciowa środowiska blokuje wyjście na
> `xiaowei.tencentcloud.com`, `www.tencentcloud.com` i `staticintl.cloudcachetci.com`,
> więc **nie udało się przeczytać oficjalnej dokumentacji API ani cennika**.
> Część o Tencencie opiera się na wyszukiwarce i materiałach prasowych — jest
> oznaczona jako *niepotwierdzone* tam, gdzie decyzja od tego zależy.
> Sekcje o Finance You są weryfikowane w kodzie i na żywym koncie.

## 1. Jak HeyGen jest dziś używany w Finance You

Fakty z repozytorium i z konta (`heygen_status`, 2026-09-26):

| Element | Stan |
| --- | --- |
| Rola HeyGen w pipelinie | **tylko render lip-sync z dostarczonego audio** |
| Głos | ElevenLabs (`eleven_multilingual_v2`, głos `9STbwZjpEbcYG88ZekIQ`) |
| Awatar domyślny | „Finance (Filip — digital twin)”, typ **talking photo** (fotoawatar) |
| Ścieżka renderu | ElevenLabs TTS → `POST /v3/assets` (upload mp3) → `POST /v3/videos` → polling |
| Napisy | `caption: { file_format: "srt", style }` z drabiną degradacji (`burned` → `sidecar` → `off`) |
| Kolejka i publikacja | `studio_video_jobs` → YouTube / IG / FB (cron `social-publish-tick`) |
| Wolumen | 9 zadań Studia (wszystkie `ready`), 12 Awatar FAQ (1 z wideo) |
| Pozostałe kredyty | 5536 jednostek API ≈ **92 min** wideo |

Punkty styku z API HeyGen w kodzie — tylko **trzy pliki** trzymają adres bazowy:

| Plik | Co robi |
| --- | --- |
| `src/lib/heygen-api.server.ts` (601 linii) | generyczny klient: konto, awatary, głosy, filmy, assety, stock, szablony, tłumaczenia |
| `src/lib/avatar-faq.server.ts` (254) | produkcyjna ścieżka renderu: TTS → asset → `/v3/videos` → polling |
| `src/lib/heygen-catalog.server.ts` (125) | katalog awatarów/głosów dla panelu |

Reszta (28 plików z odwołaniem do HeyGen) korzysta z tych trzech albo trzyma
samo `heygen_video_id` — w bazie to **jedna kolumna w jednej tabeli**
(`studio_video_jobs.heygen_video_id`).

**Wniosek konstrukcyjny:** wymienialny komponent jest wąski — „weź mp3 + awatara,
oddaj mp4 + SRT”. Język wypowiedzi to sprawa ElevenLabs, nie renderera. To dobra
wiadomość dla każdej alternatywy: nie potrzebujemy od niej polskiego TTS.

## 2. Czym jest Tencent Cloud AI Digital Human (IVH)

- Multimodalny system awatarów: synteza wideo z awatarem („broadcasting”) oraz
  **interakcja głosowa w czasie rzeczywistym** („interactive”).
- Sprzedawany jako **trzy osobne pozycje**: *Image Procurement* (zakup/utworzenie
  wizerunku — **obowiązkowy**), *Broadcasting Service*, *Interactive Service*.
  Żadna z nich kupiona samodzielnie nie daje działającego rozwiązania —
  wymagany jest zakup łączony.
- Wejściem broadcastu może być **tekst albo audio**; deklarowane jest też
  generowanie z jednego zdjęcia + audio.
- API aPaaS wymaga trójki `appkey` + `accesstoken` + `virtualmankey`
  przypisanej do projektu awatara (inny model niż jeden `X-Api-Key` HeyGena).
- Klon wizerunku z nagrań w ~24 h; w Chinach wersja spersonalizowana schodziła
  cenowo do ~1000 RMB (ok. 145 USD w doniesieniach z 2023).
- Po integracji z DeepSeek (V3/R1) awatar interaktywny działa bez kodu.
- Europa: Tencent Cloud ma trzy strefy dostępności w Niemczech (nowa strefa
  we Frankfurcie otwarta dla klientów w Q2 2026), zgodność z C5 i GDPR
  audytowana m.in. przez CISPE. **Czy IVH jest dostępny w regionie EU — niepotwierdzone.**

## 3. Porównanie względem tego, czego pipeline naprawdę potrzebuje

| Wymaganie Finance You | HeyGen (stan faktyczny) | Tencent IVH |
| --- | --- | --- |
| Render z **własnego mp3** (ElevenLabs) | działa produkcyjnie | deklarowane („text or audio”), *niepotwierdzone w API* |
| **Fotoawatar** (talking photo, obecny Filip) | tak — cały obecny zestaw to talking photos | deklarowane „one photo + audio”, ale produkt bazuje na *Image Procurement*; *ryzyko, że wizerunek trzeba kupić/nagrać od nowa* |
| Pion 9:16 (Shorts/Reels) | tak | *niepotwierdzone* |
| **Napisy SRT / wypalone** | tak, z drabiną degradacji | *niepotwierdzone* — w razie braku trzeba dołożyć własne (Whisper/`speech_to_text` + wypalanie) |
| Polski | nieistotne dla renderu (audio z ElevenLabs); lip-sync na polskiej fonetyce działa | lip-sync sterowany audio powinien być językowo neutralny, ale **brak potwierdzenia polskiego** w warstwie TTS i w materiałach |
| Jeden klucz w sekretach | `HEYGEN_API_KEY` | trójka kluczy per projekt awatara + podpisywanie żądań |
| Katalog awatarów/głosów przez API | tak (`/v2/avatars`, `/v2/voices`) | *niepotwierdzone* |
| Tłumaczenie wideo, stock, szablony | tak (używane w `heygen-api.server.ts`) | brak odpowiednika w materiałach |
| **Awatar interaktywny (rozmowa na żywo)** | HeyGen ma Interactive Avatar, **nie używamy go** | **mocna strona Tencenta** — to rdzeń produktu |

## 4. Koszty — dlaczego to nie jest argument

HeyGen (cenniki publiczne, 2026): Avatar III ≈ 1 USD/min (1080p), Avatar IV/V
do ~3–5 USD/min; enterprise rozlicza kredyty po 0,50 USD, Avatar V przez API
to 0,05 USD/s = 3 USD/min.

Przy obecnym wolumenie Finance You (9 zadań Studia, 12 FAQ, zapas 92 min na
koncie) miesięczny koszt renderu to **rząd kilkudziesięciu dolarów**. Nawet
100 % oszczędności na rendererze nie zwraca kosztu migracji. Koszt stałby się
argumentem dopiero przy kilkuset minutach miesięcznie (np. gdyby ruszyła
codzienna produkcja Shortów z bazy 250 pytań) — i wtedy trzeba mieć realny
cennik IVH, którego tu nie zweryfikowałem.

## 5. Ryzyka migracji

1. **Wizerunek Filipa trzeba by odtworzyć.** Obecny awatar to fotoawatar HeyGen;
   u Tencenta *Image Procurement* jest osobnym, obowiązkowym produktem. To nowa
   sesja nagraniowa albo zakup, plus akceptacja wizerunku przez dostawcę.
2. **Onboarding i rozliczenia.** Konto Tencent Cloud International, weryfikacja
   podmiotu, faktury spoza UE (odwrotne obciążenie), część konsoli i dokumentacji
   po chińsku. Dla jednoosobowego zespołu to realny narzut.
3. **RODO i wizerunek osoby fizycznej.** Klon twarzy realnej osoby to dane
   biometryczne w rozumieniu art. 9 RODO. Przetwarzanie u dostawcy z grupy
   chińskiej wymaga oceny transferu (rozdz. V RODO) nawet przy hostingu we
   Frankfurcie — i jest to pytanie do prawnika, nie do integracji. Dla platformy
   pożyczkowo-inwestycyjnej, która i tak robi KYC/AML, to nietrywialny koszt
   compliance’owy.
4. **Utrata funkcji, których już używamy** — tłumaczenia wideo, stock, szablony,
   napisy z drabiną degradacji. Każdą trzeba by zastąpić własnym kodem.
5. **Brak dowodu na polski.** Nawet jeśli render jest sterowany audio, nie ma
   potwierdzenia jakości synchronizacji ust na polskiej fonetyce ani polskiego
   UI/wsparcia.

## 6. Co Tencent oferuje, czego dziś nie mamy

Jedyna funkcja warta osobnego rozważenia to **awatar interaktywny w czasie
rzeczywistym**: gadająca głowa Filipa na landingu, podpięta pod LLM, prowadząca
rozmowę zamiast czytać scenariusz. To spina się z tym, co już jest w platformie
(voicebot Ania na ElevenLabs, agent tekstowy, `ask_voice_agent`).

Ale: to **nowa funkcja produktowa, nie zamiennik HeyGena**. I HeyGen ma własne
Interactive Avatar / streaming API, którego jeszcze nie używamy — czyli tę samą
hipotezę można przetestować bez zmiany dostawcy i bez drugiego onboardingu.

## 7. Self-host — HunyuanVideo-Avatar odpada w UE

**Sprawdzone 2026-09-26: HunyuanVideo-Avatar jest dla nas nieużywalny.**

Repozytorium `Tencent-Hunyuan/HunyuanVideo-Avatar` jest objęte **Tencent Hunyuan
Community License Agreement**, która zaczyna się od zdania:

> „THIS LICENSE AGREEMENT DOES NOT APPLY IN THE EUROPEAN UNION, UNITED KINGDOM
> AND SOUTH KOREA”

Definicja „Territory” wprost wyłącza obszar Unii Europejskiej. Finance You jest
podmiotem polskim, więc **nie ma licencji na ten model** — ani komercyjnej, ani
żadnej innej. To nie jest kwestia warunku do spełnienia (jak limit 100 mln MAU
z sekcji 4 czy wymóg pliku Notice); poza terytorium licencja po prostu nie
obowiązuje. Temat zamknięty.

Przy okazji korekta wcześniejszej notatki: **24 GB VRAM** to oficjalne minimum
(704×768, 129 klatek, „very slow”), rekomendowane 96 GB, testowane na 8 GPU.
Próg ~10 GB dotyczy zewnętrznego portu Wan2GP z TeaCache, nie oficjalnego repo.

## 7a. Self-host w wariancie licencyjnie czystym

Sedno oszczędności nie leży tam, gdzie je początkowo umieściłem. Generowanie
wideo **ze zdjęcia** modelem dyfuzyjnym (Hallo2, HunyuanVideo-Avatar) jest
powolne — minuty GPU na sekundę materiału — więc koszt zbliża się do ceny
HeyGena i oszczędność znika. Tanieje dopiero **lip-sync na gotowym nagraniu**:
jedna sesja zdjęciowa z Filipem daje pętlę bazową, którą potem dowolnie długo
re-synchronizujemy z audio ElevenLabs.

| Model | Licencja | Tryb | Wymagania | Uwagi |
| --- | --- | --- | --- | --- |
| **LatentSync 1.6** (ByteDance) | Apache-2.0 | wideo + audio → wideo z poprawionymi ustami | 8 GB VRAM (v1.5), 18 GB (v1.6) | 512×512, dyfuzja w przestrzeni latentnej; najlepszy stosunek jakość/koszt |
| **MuseTalk** (TMElyralab) | MIT, wagi bez ograniczeń komercyjnych | jw., **czas rzeczywisty** | 30 fps+ na V100; działa nawet na 4 GB | obszar twarzy 256×256 — miękkie przy pionie 1080p |
| **Hallo2** (Fudan) | MIT | **zdjęcie** + audio → wideo | testowane na A100, Ubuntu + CUDA 11.8 | do 4K i długich nagrań, ale wolne; ICLR 2025 |

Rząd wielkości kosztu GPU (RunPod, wrzesień 2026: L40S 48 GB ≈ 0,79 USD/h,
A100 80 GB ≈ 1,39 USD/h, serverless A100 ≈ 2,72 USD/h). Przy lip-syncu na
gotowym nagraniu minuta materiału to **grosze**, przy generowaniu ze zdjęcia —
**porównywalnie z HeyGenem** (1–3 USD/min). To jest szacunek, nie pomiar:
faktyczny czas renderu trzeba zmierzyć na własnym klipie.

Dwie rzeczy do rozstrzygnięcia przed takim wdrożeniem:

1. **Skąd pętla bazowa Filipa.** Najczyściej: nagranie kamerą. Użycie renderu
   z HeyGena jako materiału wejściowego dla innego modelu może naruszać jego
   regulamin — do sprawdzenia w ToS, nie zakładać.
2. **RODO zostaje z nami.** Self-host akurat tu pomaga: biometria nie opuszcza
   naszej infrastruktury, co jest łatwiejsze do obronienia niż transfer do
   dostawcy spoza UE.

## 8. Rekomendacja

**Zostać przy HeyGenie.** Tencent IVH nie rozwiązuje żadnego problemu, który
dziś mamy: koszt jest nieistotny przy naszym wolumenie, jakość renderu nam
wystarcza, a migracja kosztuje odtworzenie wizerunku Filipa, nowy onboarding
i ocenę RODO dla danych biometrycznych u dostawcy spoza UE.

Kolejność działań, gdyby temat wrócił:

1. **Najpierw wolumen, potem dostawca.** Dopóki produkcja to kilkanaście filmów,
   renderer jest najtańszą pozycją w budżecie.
2. **Awatar interaktywny** — jeśli to jest właściwa potrzeba, przetestować
   najpierw Interactive Avatar w HeyGenie (klucz już mamy), a Tencenta traktować
   jako drugą ofertę do porównania.
3. **Duży wolumen** — nie HunyuanVideo-Avatar (licencja nie obejmuje UE),
   tylko **LatentSync 1.6 na własnym GPU** jako lip-sync na nagranej pętli
   Filipa. To realniejsza oszczędność niż zmiana SaaS-u na SaaS — ale wymaga
   sesji nagraniowej i kolejki renderującej po naszej stronie.

## 9. Gdyby jednak — jak wyglądałaby integracja

Koszt techniczny jest umiarkowany, bo seam jest wąski:

1. Wyciągnąć interfejs `AvatarRenderer` (`renderFromAudio`, `getVideo`,
   `listAvatars`, `listVoices`) z `heygen-api.server.ts` i `avatar-faq.server.ts`.
2. Dodać `src/lib/tencent-ivh.server.ts` z podpisywaniem żądań aPaaS
   (`appkey`/`accesstoken`/`virtualmankey`) i mapowaniem statusów na obecne
   (`queued` / `rendering` / `ready` / `failed`).
3. Dodać kolumnę `provider` do `studio_video_jobs` i uogólnić `heygen_video_id`
   na `provider_video_id` (jedna migracja, jedna tabela).
4. Zastąpić napisy, jeśli IVH ich nie zwraca: `speech_to_text` → SRT → wypalanie
   w `video-pipeline/render.server.ts`.
5. Przełącznik dostawcy per zadanie, żeby dało się porównać oba rendery na tym
   samym scenariuszu.

Realnie 2–3 dni pracy **po** tym, jak istnieje działający awatar i konto —
a to właśnie jest najdroższa część.

## 10. Do zweryfikowania (wymaga odblokowania sieci albo ręcznego sprawdzenia)

- [ ] Czy broadcast API przyjmuje własny plik audio (mp3/wav) i w jakim limicie długości?
- [ ] Czy dostępny jest fotoawatar z jednego zdjęcia bez pełnego *Image Procurement*?
- [ ] Format wyjścia: rozdzielczość, 9:16, alfa/greenscreen, napisy.
- [ ] Cennik międzynarodowy za minutę broadcastu i za wizerunek.
- [ ] Region przetwarzania (czy IVH stoi we Frankfurcie) + DPA i SCC.
- [ ] Limity współbieżności i czas renderu 60-sekundowego shorta.
- [x] ~~Licencja komercyjna HunyuanVideo-Avatar~~ — Tencent Hunyuan Community License **nie obowiązuje w UE**, model odpada.
- [ ] Zmierzony czas renderu LatentSync 1.6 na 60-sekundowym shorcie (L40S).
- [ ] Czy ToS HeyGena dopuszcza użycie renderu jako wejścia do innego modelu.

## Źródła

- [Tencent Cloud AI Digital Human (produkt)](https://www.tencentcloud.com/products/ivh)
- [Purchase Guide (PDF)](https://staticintl.cloudcachetci.com/doc/pdf/product/pdf/1211_60661_en.pdf) · [Pricing Guide](https://www.tencentcloud.com/document/product/1211/60662) · [Interactive Service (PDF)](https://staticintl.cloudcachetci.com/doc/pdf/product/pdf/1211_79736_en.pdf) · [FAQ (PDF)](https://staticintl.cloudcachetci.com/doc/pdf/product/pdf/1211_56565_en.pdf)
- [Tencent Cloud — nowa strefa dostępności w Europie](https://www.tencentcloud.com/dynamic/news-details/100987)
- [Digital human za 145 USD (PetaPixel)](https://petapixel.com/2023/05/01/chinese-company-lets-you-make-a-deepfake-digital-human-for-145/)
- [Integracja z DeepSeek (AIbase)](https://www.aibase.com/news/15662)
- [HunyuanVideo-Avatar — GitHub](https://github.com/Tencent-Hunyuan/HunyuanVideo-Avatar) · [tekst licencji](https://raw.githubusercontent.com/Tencent-Hunyuan/HunyuanVideo-Avatar/main/LICENSE) · [arXiv 2505.20156](https://arxiv.org/pdf/2505.20156)
- [LatentSync](https://github.com/bytedance/LatentSync) · [MuseTalk](https://github.com/TMElyralab/MuseTalk) · [Hallo2](https://github.com/fudan-generative-vision/hallo2)
- [Runpod — cennik GPU](https://www.runpod.io/pricing)
- [HeyGen API Pricing (help center)](https://help.heygen.com/en/articles/10060327-heygen-api-pricing-explained) · [Enterprise Pricing](https://developers.heygen.com/docs/enterprise-pricing)
