# Webinar z awatarem na żywo — ocena planu i rekomendacja

Ocena koncepcji „Live Video Avatar do webinarów — warstwa wideo dla
istniejącego agenta ElevenLabs” (agent ElevenLabs → audio → MuseTalk 1.5 →
FFmpeg/RTMP/WebRTC → platforma webinarowa, GPU w chmurze na żądanie) w
kontekście tego, co już jest w repo.

## Streszczenie

- Kierunek (jeden agent, warstwy wymienne, GPU na żądanie) jest dobry.
- Plan pomija największy element pracy: **orkiestrator webinaru**
  (scenariusz, slajdy, kolejka pytań, maszyna stanów). Agent konwersacyjny sam
  nie poprowadzi 90 minut monologu.
- Plan pomija to, co już mamy: **cyfrowego bliźniaka Filipa w HeyGen** i
  gotowy pipeline renderowania. HeyGen Interactive Avatar daje MVP 1 w dni,
  MuseTalk na własnym GPU — w tygodnie.
- Rekomendacja: **hybryda** — część scenariuszowa wyrenderowana wcześniej,
  na żywo tylko Q&A; emisja przez YouTube Live osadzony na stronie; MuseTalk
  dopiero jako optymalizacja kosztu w MVP 3.

## Co już jest w repo

| Element                                   | Gdzie                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| Agenty ElevenLabs A1–A4                   | `src/lib/elevenlabs-agents.server.ts`, `docs/boty-elevenlabs.md`            |
| Reguły per kanał (jeden agent, różne zasady) | `src/lib/agent-channel-rules.ts`                                         |
| Klient WebSocket ConvAI (audio PCM16 out)  | `src/lib/voice-conversation.ts`, `components/landing/voice-call-widget.tsx` |
| Tura tekstowa agenta z serwera             | `src/lib/elevenlabs-text-turn.server.ts`                                    |
| Awatar Filipa (HeyGen) + głos ElevenLabs   | `src/lib/heygen-avatars.ts` (`FILIP_VOICE_ID`), `src/lib/heygen-api.server.ts` |
| Studio publikacji (render wideo z awatarem) | `docs/studio-publikacji.md`, `src/lib/studio-*.server.ts`                  |
| Integracja YouTube (publikacja, komentarze) | narzędzia `youtube_*` w MCP, `docs/youtube-shorts.md`                      |

Webinarów nie ma nigdzie — to nowy moduł.

## Co w planie jest trafne

- Reużycie agenta zamiast budowy drugiego — spójność odpowiedzi z resztą
  kanałów to realna przewaga.
- Podział na warstwy (agent → audio → lip-sync → kompozycja → stream) — każdą
  da się wymienić osobno.
- GPU uruchamiane tylko na czas webinaru i etapowanie MVP 1→3.

## Luki i ryzyka

### 1. Agent konwersacyjny ≠ prowadzący webinar

Agent ElevenLabs (ConvAI) działa turowo: mówi, gdy ktoś do niego mówi.
Webinar to w 80–90% monolog sterowany scenariuszem i slajdami. Plan ukrywa
największy element pracy — orkiestrator:

- maszyna stanów `PREZENTACJA(slajd, segment) → Q&A(pytanie) → powrót`,
- scenariusz per slajd (kto go pisze i kto zatwierdza — patrz pkt 3),
- kolejka pytań i decyzja, kiedy przerwać (na granicy segmentu, nie w środku),
- sterowanie slajdami.

To jest MVP 1, nie MVP 2. Bez tego „agent rozpoczyna prezentację i przechodzi
kolejne slajdy” nie istnieje.

Praktycznie: części scenariuszowe → zwykłe ElevenLabs TTS streaming głosem
Filipa (`FILIP_VOICE_ID`), Q&A → tura agenta. Oba dają audio; warstwa wideo
tego nie rozróżnia.

### 2. Który agent? A1 ma reguły nieprzystające do webinaru

A1 intake ma twarde zasady: jedno pytanie na wiadomość, rapport, kierowanie
na wniosek, zmienna `{{channel}}`. Na webinarze publicznym trzeba innego
zestawu reguł:

- odpowiedź do sali, nie do jednej osoby,
- zakaz zbierania danych osobowych na wizji (uczestnik wpisze PESEL na
  czacie — agent ma to zignorować i przekierować do wniosku),
- brak obietnic warunków pożyczki, oprocentowania, decyzji,
- „nie wiem → zapraszam do wniosku / kontaktu”.

Minimum: nowy kanał `webinar` w `agent-channel-rules.ts` + osobne ID agenta
(A5) dla izolacji kosztów i transkryptów. „Nie tworzymy drugiego agenta” jest
prawdziwe co do bazy wiedzy, nie co do konfiguracji.

### 3. Halucynacje na żywo, publicznie, z nagraniem

Q&A o pożyczkach pozabankowych na wizji to ryzyko prawno-reputacyjne (UOKiK,
RRSO, warunki). W czacie 1:1 błąd jest cichy; na webinarze zostaje w
nagraniu. Potrzeba:

- restrykcyjnego promptu Q&A (lista tematów zakazanych, obowiązkowe
  zastrzeżenia),
- filtra pytań przed agentem: spam, off-topic, prompt injection z czatu,
  dane osobowe,
- klasyfikatora „odpowiedz / odeślij do wniosku / pomiń”,
- scenariusza zatwierdzonego przez człowieka przed emisją.

### 4. MuseTalk — jakość i materiał referencyjny to nie drobiazg

MuseTalk animuje tylko usta na tle wideo referencyjnego. Na 90 minut trzeba
zapętlonego klipu Filipa (1–3 min, cisza, naturalny ruch głowy, bezszwowa
pętla) — bez tego awatar „zamiera” w pauzach albo widać cięcie pętli. Brak
gestów, brak zmiany kadru. Czas rzeczywisty na RTX 4090 jest osiągalny, ale
pierwszy tydzień pójdzie na dostrojenie jakości, nie na integrację.

### 5. Pominięta alternatywa: HeyGen Interactive Avatar

Mamy już cyfrowego bliźniaka Filipa w HeyGen i cały pipeline. HeyGen
Streaming/Interactive Avatar daje WebRTC, lip-sync i głos ElevenLabs bez
własnego GPU, Dockera, MuseTalk i pętli referencyjnej.

Drożej za minutę (rząd wielkości kilkanaście–kilkadziesiąt USD za webinar),
ale różnica to kilka dni vs kilka tygodni do działającego MVP 1. Do
sprawdzenia przed decyzją:

- cennik i limit długości sesji interaktywnej na naszym planie,
- czy bliźniak wideo Filipa wymaga osobnej wersji „interactive avatar”.

MuseTalk ma sens jako obniżenie kosztu minuty w MVP 3, gdy webinary będą
częste.

### 6. Najbezpieczniejszy wariant: hybryda pre-render + live Q&A

Istniejący pipeline HeyGen potrafi renderować wideo Filipa. Część
scenariuszową (80–90% webinaru) można wyrenderować wcześniej — zero ryzyka
na żywo, korekta przed emisją — a na żywo obsługiwać tylko Q&A. To eliminuje
większość ryzyk z pkt 3–4 i daje plan B: jeśli warstwa live padnie, leci
nagranie, a odpowiedzi idą tekstem na czacie.

### 7. „Platforma webinarowa” — dwie różne ścieżki

| Ścieżka                                                          | Plusy                                              | Minusy                                                   |
| ---------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| RTMP → YouTube Live (unlisted) osadzony na stronie + własne Q&A  | najprostsze, integracja YouTube już jest, nagranie za darmo | opóźnienie 5–30 s                                 |
| WebRTC/LiveKit własny                                            | niskie opóźnienie, pełna kontrola                  | player, czat, autoryzacja, SFU na N widzów do zbudowania |

Rekomendacja: RTMP/YouTube w MVP 1. „Wirtualna kamera” do Zooma na
headlessowym GPU — skreślić, kruche.

### 8. Kompozycja slajdy + awatar + branding

Zamiast składać w FFmpeg: headless Chromium renderuje stronę HTML ze
slajdami i oknem awatara w stylu Finance You, orkiestrator zmienia slajd
przez WebSocket, FFmpeg przechwytuje ekran → RTMP. Branding z istniejącego
design systemu, układ (slajdy + mały awatar w rogu, powiększany w wybranych
momentach) to zwykły CSS.

### 9. Opóźnienie Q&A i niezawodność

Pytanie z czatu → agent → audio → lip-sync → RTMP → widz: 10–40 s. Agent musi
to werbalnie obsłużyć („mamy pytanie od Anny…”), a pytania odpowiadać na
granicach segmentów. Jeden GPU bez redundancji + zimny start (pull obrazu,
ładowanie modeli: 3–10 min) — potrzebny warm-up 15 min przed, health-check i
plan B z pkt 6.

### 10. RODO

Czytanie imion uczestników na wizji i nagranie Q&A wymagają informacji przy
rejestracji na webinar; pytania z czatu nie powinny trafiać do agenta z
danymi kontaktowymi.

## Koszty — korekta

| Pozycja                      | W planie        | Realnie                                                         |
| ---------------------------- | --------------- | --------------------------------------------------------------- |
| GPU RTX 4090                 | 0,7–0,8 USD/h   | to ceny spot/community; on-demand „secure” 1,5–2+ USD/h + persistent volume na modele |
| ElevenLabs                   | pominięte       | ~90 min mowy przez ConvAI ≈ 7–9 USD; TTS-only taniej (per znak) |
| Razem za webinar 90 min      | 5–10 PLN        | ~15–40 PLN                                                      |
| Development MVP 1 (MuseTalk) | „reszta kodem”  | 2–4 tygodnie jednej osoby razem z materiałem referencyjnym      |
| Development PoC (HeyGen)     | —               | 1–2 dni                                                         |

Koszt zmienny nie jest problemem. Prawdziwy koszt to czas developmentu i
ryzyko jakości na żywo.

## Rekomendacja

1. **Krok 0 (1–2 dni):** PoC HeyGen Interactive Avatar z Filipem — tekst ze
   scenariusza + odpowiedź agenta → awatar → RTMP na YouTube unlisted.
   Decyzja o silniku po obejrzeniu wyniku i sprawdzeniu limitów planu.
2. **Niezależnie od silnika** zbudować w repo orkiestrator (scenariusz,
   slajdy, kolejka pytań, maszyna stanów) z interfejsem
   `speak(text | audio)` / `setSlide(n)`. To część trwała; silnik awatara
   jest wymienny.
3. Kanał `webinar` w `agent-channel-rules.ts` + osobny agent A5 z
   restrykcyjnym promptem Q&A i filtrem pytań.
4. **MVP 1 = hybryda:** scenariusz pre-renderowany istniejącym pipeline'em
   HeyGen, Q&A na żywo, emisja przez YouTube Live osadzony na stronie
   finyou z własnym formularzem pytań.
5. MuseTalk dopiero w MVP 3 jako obniżenie kosztu minuty — jeśli liczba
   webinarów to uzasadni.

## Etapy po korekcie

| Etap  | Zakres                                                                                                   |
| ----- | -------------------------------------------------------------------------------------------------------- |
| PoC   | HeyGen Interactive + głos Filipa + jedno pytanie z czatu → stream testowy na YouTube unlisted             |
| MVP 1 | orkiestrator, scenariusz pre-renderowany, live Q&A, kanał `webinar`, strona webinaru z osadzonym streamem i Q&A |
| MVP 2 | harmonogram, automatyczny start/stop, panel admina (kolejka pytań, ręczne pominięcie), statystyki, nagranie |
| MVP 3 | pełne live (bez pre-renderu), MuseTalk na własnym GPU jako opcja tańsza, wiele awatarów/głosów           |
