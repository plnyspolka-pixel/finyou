# Agent wzrostu — codzienne rolki na wszystkich platformach

Kod: `src/lib/growth-agent/` (logika) i `src/lib/agent-toolkit/` (wspólne
fakty, bezpieczniki, prośby o narzędzia). Stan i dziennik: tabela
`ai_growth_action_log` — bez nowych migracji.

## Cel

Codziennie publikować rolkę na wszystkich dostępnych platformach
(Instagram Reels, Facebook Reels, YouTube Shorts, a TikTok i X, gdy są
odblokowane). Budować publiczność Finance You: edukować, informować, czasem
lekko bawić. Pisać do obu grup — inwestorów i przedsiębiorców szukających
finansowania. Nigdy nie mówić nieprawdy; prawdę pokazywać w sposób korzystny
dla odbiorcy. Posty tekstowe (Facebook, Instagram) są dodatkiem.

## Codzienna rolka

`reel.server.ts` (I/O) i `reel-plan.ts` (czysta logika, testy).

1. **Plan** — bandyta rolek wybiera odbiorcę, filar, haczyk i porę
   (12:30, 17:00 albo 20:30 czasu Warszawy). Pora musi być co najmniej
   2,5 h przed nami (render i napisy), a rolka na dany dzień powstaje
   najwcześniej o 6:00.
2. **Scenariusz** — 70–120 słów (25–45 s) plus tytuł, jeden opis na wszystkie
   platformy i krótka wersja na X. Liczby wyłącznie z bloku faktów.
3. **Strażnik prawdy** — scenariusz, opis, tytuł i wersja na X. Jedna próba
   naprawy; potem blokada (wpis w dzienniku, bez renderu).
4. **Zlecenie w Studiu** — wpis w `studio_video_jobs`; dalej robi to tick
   Studia: lektor ElevenLabs, awatary HeyGen z zestawu domyślnych, przebitki,
   napisy. Nieudany render jest ponawiany raz.
5. **Publikacja** — gotowe wideo idzie przez `enqueuePublication` na wszystkie
   dostępne platformy o zaplanowanej porze.
6. **Pomiar po 48 h** — wyświetlenia i interakcje z Instagrama, Facebooka
   i YouTube; wynik rolki liczy zaangażowanie i zasięg (przy małym profilu
   interakcji jest mało, a zasięg też mówi, co działa).

### Dostosowanie do zmian

- **Rolka dodana ręcznie** (albo przez inny proces) na dany dzień = dzień
  pokryty, agent nie dubluje. Gdy ręczna rolka pojawi się, zanim agent
  opublikuje swoją, agent przesuwa swoją na następny wolny dzień.
- **Platforma, która trwale odrzuca posty** (audyt TikToka, brak kredytów X,
  wygasły token) jest wstrzymana na 7 dni, potem agent próbuje znowu. Sukces
  po błędzie odblokowuje ją od razu.
- **TikTok** wymaga ustawień posta wybranych przez człowieka (prywatność,
  komentarze, oznaczenia) — bez nich agent go pomija. Właściciel ustawia je raz:
  `growth_agent_settings` z `tiktok_privacy`.
- **Silnik napisów**: gdy domyślna usługa wypalania napisów nie odpowiada,
  a Remotion Lambda jest gotowy, rolka idzie przez Remotion.
- **Kredyty HeyGen** sprawdzane przed zleceniem; przy braku agent prosi
  właściciela (SMS) i podaje darmowe alternatywy.
- **Limit prób**: najwyżej dzienna liczba rolek + 2 próby na dzień, żeby
  zablokowany scenariusz albo nieudany render nie generowały kosztów co
  10 minut.
- **Publikacja zawieszona** (wpis „w toku” 6 h po terminie) — agent przestaje
  na nią czekać, ale jej nie ponawia (Meta mogła ją już opublikować).

## Cykl pracy

Agent nie ma własnego crona. Dokleja się do ticka Studia publikacji
(`/api/public/hooks/social-publish-tick`, co 10 minut), a każdy tick robi
tylko to, co jest wymagalne:

| Faza      | Kiedy                                     | Co robi                                                                                    |
| --------- | ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| `publish` | zawsze                                    | posty: wynik FB z kolejki, publikacja IG ze zdjęciem o porze                               |
| `reel`    | zawsze (gdy `reels_per_day` > 0)          | domknięcie rozpoczętych rolek (render → kolejka → wynik), nowa rolka, gdy dzień jej nie ma |
| `measure` | 48 h po publikacji                        | metryki → wynik względem mediany (osobno rolki i posty) → nagroda dla bandyty              |
| `warm`    | raz                                       | ciepły start z dotychczasowych postów i rolek profilu                                      |
| `create`  | brak posta na najbliższą dobę             | post tekstowy: plan → treść → strażnik → grafika → kolejka                                 |
| `engage`  | co godzinę                                | odpowiedzi na komentarze IG i YouTube (FB obsługuje istniejący webhook)                    |
| `improve` | raz w tygodniu albo po 3 nowych pomiarach | wnioski do playbooka, pomysły na rozwój, kontrola stopy NBP względem odsetek maksymalnych  |

Dzierżawa (`growth_lease`, 8 min) pilnuje, żeby dwa równoległe ticki nie
zrobiły dwa razy tego samego. Wpis „run” w dzienniku powstaje tylko wtedy,
gdy któraś faza faktycznie coś zrobiła.

## Jak się uczy

- **Bandyta Thompsona** osobno dla odbiorcy, filaru treści, haczyka i pory
  (`strategy.ts`), z osobnymi tabelami dla rolek i postów.
- **Ograniczenia twarde** (nie podlegają uczeniu): rozrywka najwyżej co piąty
  raz, „dowód” tylko z faktów systemu, zmiana odbiorcy po 3 razach do tej
  samej grupy, pytanie z bazy nie wraca przez 60 dni.
- **Pory**: rolki 12:30, 17:00, 20:30; posty 07:40, 12:10, 19:05.
- **Playbook**: do 12 wniosków z refleksji, dołączanych do każdego briefu.
  Refleksja widzi rodzaj treści i stawia rolki na pierwszym miejscu.
- **Źródła danych**: agent może sam dodać publiczne źródło z dozwolonej domeny
  (np. NBP, GUS). Inne domeny czekają w dzienniku na zgodę właściciela,
  bez SMS-a.

Samodoskonalenie kodem ma granicę: agent w produkcji nie zmienia własnego
kodu. Zmienia parametry (bandyta), instrukcje (playbook), konfigurację (źródła)
i zgłasza propozycje zmian w kodzie do dziennika (`action = proposal`), które
wdraża człowiek albo sesja programistyczna.

## Strażnik prawdy

`truth-guard.ts` sprawdza każdy tekst przed publikacją i każdą odpowiedź na
komentarz. Blokuje m.in.: gwarancję zysku albo finansowania, „bez ryzyka”,
„bezpiecznie lokować”, „stabilny zwrot”, „bez weryfikacji”, statystyki rynku
bez źródła („większość spraw…”, „X% inwestorów…”), stawki miesięczne,
prowizję inną niż w `fees.ts`, LTV ponad 60%, oprocentowanie ponad odsetki
maksymalne, abonament inny niż w `plans.ts`, cudze dane kontaktowe.
Zaprzeczenie („nie obiecujemy zysku”) nie blokuje. Opisy dla inwestorów
dostają zastrzeżenie o ryzyku; lektor rolki go nie czyta.

Liczby model dostaje wyłącznie z bloku faktów (`agent-toolkit/live-facts.ts`),
który czyta `fees.ts` i `plans.ts`. Zmiana cennika w kodzie = zmiana w rolkach
i postach bez ruszania promptów.

## Prośby o narzędzia i SMS do właściciela

`request_agent_capability` (MCP) i narzędzie `request_capability` agentów
klasyfikują prośbę (`capabilities.ts`):

- darmowe i wykonalne kodem → przyznane od razu,
- płatne albo wymagające człowieka (kredyty HeyGen, kredyty X, audyt TikToka,
  saldo Twilio) → SMS do właściciela (889 888 700) z darmowymi alternatywami.

Hamulce SMS: ta sama sprawa najwyżej raz na 7 dni, najwyżej 2 SMS-y na dobę,
jedna wiadomość zbiorcza.

## Sterowanie (konektor MCP)

| Narzędzie                  | Do czego                                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `growth_agent_status`      | stan, rolki i posty z etapem, platformy dostępne teraz (i pominięte z powodem), wyniki, koszt   |
| `growth_agent_settings`    | włącz/wyłącz, `auto`/`draft`, rolki na dobę, platformy rolek, ustawienia TikToka, posty, budżet |
| `growth_agent_run`         | ręczny przebieg (`force: ["reel"]` — nowa rolka), także na sucho                                |
| `growth_agent_decide`      | zatwierdź albo anuluj szkic, rolkę w produkcji albo zaplanowaną publikację                      |
| `growth_agent_check_text`  | przepuść dowolny tekst przez strażnika prawdy                                                   |
| `request_agent_capability` | zgłoś brakujące narzędzie                                                                       |
| `list_agent_insights`      | wnioski agentów z rozmów i postów                                                               |

Endpoint ręczny: `POST /api/public/hooks/growth-agent-tick` (sekret crona),
`?force=reel,create,engage,improve` wymusza fazy, `?dry=1` liczy bez zapisów,
bez renderu i bez publikacji.

## Ustawienia domyślne

Włączony, tryb `auto`, 1 rolka dziennie na wszystkie dostępne platformy,
1 post tekstowy dziennie (Facebook i Instagram), odpowiedzi na komentarze
(do 5 na przebieg), budżet 5 zł na dobę na modele i grafiki. Render rolek
rozlicza HeyGen (kredyty sprawdzane przed zleceniem).

Wyłączenie: `growth_agent_settings` z `enabled: false`; tryb `draft` — każda
rolka i post czeka na akceptację (`growth_agent_decide`), a render rusza
dopiero po zatwierdzeniu.
