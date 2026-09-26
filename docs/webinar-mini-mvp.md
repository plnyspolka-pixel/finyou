# Mini-webinar z live awatarem (MuseTalk) — uwagi do planu v2 i projekt techniczny

Uwagi do dokumentu „MVP: mini-webinar Finance You z autonomicznym live
avatarem” (gotowe filmy + istniejący agent ElevenLabs + MuseTalk 1.5 +
compositor + jeden player, bez HeyGen). Decyzja o MuseTalk jest przyjęta —
poniżej tylko to, co trzeba doprecyzować, żeby MVP 0/1 dało się zbudować
bez niespodzianek.

Poprzednia ocena (v1): `docs/webinar-awatar-live.md`.

## Co v2 poprawia

- Orkiestrator jest rdzeniem, nie dodatkiem.
- 10–15 min z gotowych filmów zamiast 90 min scenariusza — ryzyko na żywo
  spada do intro + Q&A.
- Q&A z czatu tekstowego (bez STT uczestników).
- MVP 0 = jeden film, jedno pytanie — właściwy pierwszy krok.

## Decyzja, której w planie brakuje: emisja wspólna czy sesja per widz?

„Finalny UX: użytkownik otwiera stronę, widzi player, avatar robi intro…”
czyta się jak **sesja na żądanie per widz**. To znaczy: jeden MuseTalk na
jednego widza. Na jednym GPU obsłużymy 1–2 równoległe sesje, nie 50.

Do wyboru:

| Wariant                         | Jak działa                                                         | GPU                              | Q&A                                       |
| ------------------------------- | ------------------------------------------------------------------ | -------------------------------- | ----------------------------------------- |
| **A. Emisja wspólna (broadcast)** | webinar o stałej godzinie, wszyscy widzą ten sam stream           | 1 GPU na cały webinar            | wspólna kolejka, wszyscy słyszą odpowiedzi |
| B. Sesja per widz               | każdy otwiera stronę kiedy chce, dostaje własny stream             | 1 GPU-slot na widza              | prywatne, jak rozmowa 1:1                 |

Rekomendacja: **A na MVP 0/1** (to jest webinar), z limitem jednego
widza na MVP 0 do testów. Wariant B to inny produkt („obejrzyj i zapytaj”)
— jeśli o niego chodzi, trzeba to powiedzieć wprost, bo zmienia
architekturę (kolejka do GPU, sesje, limity) i koszt (GPU × liczba widzów).

## Gdzie żyje orkiestrator

`finyou` działa na Cloudflare Workers (`wrangler.jsonc`) — nie ma tam
długo żyjących procesów, timerów ani pipe'ów do FFmpeg. Podział:

```text
finyou (Workers + Supabase)                GPU box (jeden kontener)
─────────────────────────────              ────────────────────────────
strona /webinar/:id z playerem   ◄──────── stream (WHIP/WebRTC)
formularz pytania → tabela        ────────► orkiestrator (polling/Realtime)
webinar_questions                           ├─ maszyna stanów
panel admina: start/stop,                   ├─ ElevenLabs ConvAI (WS, audio out)
kolejka pytań, pomiń/zatwierdź              ├─ MuseTalk 1.5
tabela webinar_sessions (stan)              ├─ dekoder MP4 (filmy)
                                            └─ frame bus → FFmpeg → WHIP
```

Stan sesji (który film, ile pytań, status GPU) w Supabase — GPU box jest
jednorazowy i może paść; strona i panel czytają stan z bazy.

## Compositor — „przełączanie source'a backendowo” w FFmpeg nie istnieje

FFmpeg nie umie na żywo podmieniać wejścia. Opcje:

1. **Frame bus (rekomendacja):** jeden proces Python trzyma jeden FFmpeg
   z wejściem `rawvideo` + `s16le` przez pipe. Źródła to generatory
   klatek+audio: dekoder MP4 (PyAV), MuseTalk (już emituje klatki),
   plansza „za chwilę”. Przełączenie = orkiestrator zmienia, z którego
   generatora bierze klatki; fade to blend dwóch klatek przez 6–12 klatek.
   Encoder nigdy nie widzi zmiany. MuseTalk jest w Pythonie, więc to jest
   naturalne.
2. GStreamer `input-selector` — działa, ale debugowanie pipeline'ów
   GStreamer z MuseTalk to osobny tydzień.
3. OBS headless z websocket API — najszybciej do PoC, najgorzej do
   automatyzacji.

Parametry z planu (1080p30, H.264, AAC 48 kHz) OK; MuseTalk renderuje
twarz w niskiej rozdzielczości i wkleja w klatkę referencyjną — referencja
w 1080p, żeby całość nie wyglądała na upscalowaną.

## Transport: nie budować SFU

Plan mówi „WebRTC jako główny transport” — słusznie co do opóźnienia, ale
własny SFU (LiveKit self-hosted, mediasoup) to osobny projekt. Skoro stack
jest na Cloudflare: **Cloudflare Stream Live** — GPU box wysyła WHIP,
player na stronie odbiera WHEP (opóźnienie < 1 s), a HLS i nagranie są w
pakiecie. Alternatywa: LiveKit Cloud. Własny SFU tylko, jeśli koszt per
minuta widza okaże się problemem — nie na MVP.

## Awatar w czasie filmów

„Podczas gotowych filmów generacja avatara nie musi pracować” — ale
model musi zostać załadowany i ciepły, inaczej powrót po filmie to
kilkusekundowa dziura. W czasie filmu MuseTalk nie renderuje, ale proces
żyje; 2 s przed końcem filmu zaczyna generować klatki „idle”.

## Materiał referencyjny — mniej, ale dobrze

MuseTalk animuje usta na tle **jednego** wideo referencyjnego; gesty z
listy w planie (wskazywanie, mocniejsza gestykulacja) nie będą powiązane z
mową — to tylko tło. Osiem sekwencji to nadmiar na MVP. Wystarczą dwie:

- **idle/słuchanie** — 60–90 s, lekki ruch głowy, mruganie, bezszwowa pętla
  (początek i koniec w tej samej pozie),
- **mówienie** — 60–90 s, spokojna gestykulacja, ta sama poza na
  początku i końcu.

Wymagania: stały kadr (statyw), stałe światło, półpostać, usta widoczne i
zamknięte w spoczynku, bez rąk przy twarzy, 1080p, 25/30 fps. Przełączanie
idle↔mówienie na granicy zdań. „Wskazywanie na prezentację” zostaje na
MVP 2 (slajdy).

## Q&A — co dopisać do MVP 1

- **Tryb agenta:** `elevenlabs-text-turn.server.ts` używa ConvAI w trybie
  text-only. Do webinaru potrzebna sesja WS z **tekstem na wejściu i audio na
  wyjściu** (jedna rozmowa na cały blok Q&A — agent pamięta poprzednie
  pytania; `channel=webinar` w dynamic variables).
- **Kanał `webinar`** w `src/lib/agent-channel-rules.ts`: odpowiedź do sali,
  najpierw powtórzenie pytania („Pytanie od Marka: …”), 3–5 zdań, zero
  zbierania danych, zero obietnic warunków, „nie wiem → wniosek/kontakt”.
  Osobne ID agenta (A5) — izolacja transkryptów i kosztów.
- **Minimalny filtr przed agentem** (nie „później”): regex na PESEL/telefon/
  e-mail w pytaniu → odrzuć z komunikatem na czacie; limit 1 pytanie/min/
  widz; długość ≤ 300 znaków. Klasyfikator off-topic dopiero w MVP 2.
- **Timeouty:** brak pytań przez 90 s → agent zachęca; 3 min → outro. Pytanie
  w trakcie filmu → kolejka, odpowiedź w bloku Q&A (MVP 1 nie przerywa
  filmu — zgodnie z planem).
- **Budżet opóźnienia** (pytanie → widz słyszy odpowiedź): filtr < 0,1 s,
  agent do pierwszego audio 1–2 s, MuseTalk bufor ~0,5 s, encoder + WebRTC
  < 1 s. Cel: **< 5 s**. Jeśli PoC pokaże > 8 s, problem jest po stronie
  MuseTalk (za mały batch/za duży bufor), nie transportu.

## GPU on-demand — realia

- Obraz z MuseTalk + modele (Whisper, VAE, UNet, DWPose) to ~10 GB; bez
  persistent volume każdy start to kilka minut pobierania. RunPod network
  volume albo własny obraz w registry z modelami w środku.
- Warm-up: start poda → modele w VRAM → test-klatka → „gotowy”: 3–8 min.
  Start **15 min przed** webinarem, nie „przed startem”.
- MVP 0: pod trzymany ręcznie. Automatyczny start/stop (API RunPod z
  panelu admina) w MVP 1, po tym jak ręczny przebieg zadziała 3 razy.
- L40S vs 4090: 4090 wystarcza; L40S tylko jeśli provider nie ma 4090 w UE.
  Scaleway ma L40S/L4 — L4 może być za wolny na 1080p30 real-time.

## Koszty (uzupełnienie)

Mini-webinar 15 min: GPU ~30 min z warm-upem (~1–2 USD), ElevenLabs
kilka minut mowy (< 1 USD), Cloudflare Stream per minuta widza (grosze przy
kilkudziesięciu widzach). **Kilka–kilkanaście złotych za mini-webinar** —
zgodnie z planem. Koszt to development, nie runtime.

## MVP 0 — definicja „działa”

1. Pod z MuseTalk gra klip idle Filipa do Cloudflare Stream, strona
   `/webinar/test` pokazuje go w playerze.
2. Orkiestrator: intro z tekstu (TTS) → film 1 (MP4 z Supabase Storage) →
   powrót do awatara; przejścia bez czarnej klatki i bez zacięcia audio.
3. Pytanie z formularza → agent (audio) → awatar odpowiada; zmierzone
   opóźnienie i zapisane w logu.
4. Nagranie z Cloudflare Stream do oceny jakości lip-syncu.

Jeśli pkt 3 daje < 5 s i lip-sync jest akceptowalny na nagraniu — MVP 1.
Jeśli nie — najpierw strojenie MuseTalk, bez rozbudowy orkiestratora.

## Co zostaje z v1 bez zmian

Reguły dla agenta na wizji (pkt 2–3 poprzedniej oceny), RODO przy
rejestracji, plan B (jeśli GPU padnie: strona gra filmy z Storage, pytania
odpowiada agent tekstem na czacie — wszystko to już jest w repo).
