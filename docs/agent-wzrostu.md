# Agent wzrostu — social media, który sam się uczy

Kod: `src/lib/growth-agent/` (logika) i `src/lib/agent-toolkit/` (wspólne
fakty, bezpieczniki, prośby o narzędzia). Stan i dziennik: tabela
`ai_growth_action_log` — bez nowych migracji.

## Cel

Budować publiczność Finance You na Facebooku i Instagramie: edukować,
informować, czasem lekko bawić. Pisać do obu grup — inwestorów
i przedsiębiorców szukających finansowania. Nigdy nie mówić nieprawdy;
prawdę pokazywać w sposób korzystny dla odbiorcy.

## Cykl pracy

Agent nie ma własnego crona. Dokleja się do ticka Studia publikacji
(`/api/public/hooks/social-publish-tick`, co 10 minut), a każdy tick robi
tylko to, co jest wymagalne:

| Faza      | Kiedy                                     | Co robi                                                                                           |
| --------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `publish` | zawsze                                    | FB: odczytuje wynik z `social_publish_queue`. IG: publikuje post ze zdjęciem o zaplanowanej porze |
| `measure` | 48 h po publikacji                        | metryki z Meta → wynik względem mediany konta → nagroda dla bandyty                               |
| `warm`    | raz                                       | ciepły start z dotychczasowych postów profilu                                                     |
| `create`  | brak posta na najbliższą dobę             | plan → treść → strażnik prawdy (1 próba naprawy) → grafika → kolejka                              |
| `engage`  | co godzinę                                | odpowiedzi na komentarze IG i YouTube (FB obsługuje istniejący webhook)                           |
| `improve` | raz w tygodniu albo po 3 nowych pomiarach | wnioski do playbooka, pomysły na rozwój, kontrola stopy NBP względem odsetek maksymalnych         |

Dzierżawa (`growth_lease`, 8 min) pilnuje, żeby dwa równoległe ticki nie
utworzyły dwóch postów.

## Jak się uczy

- **Bandyta Thompsona** osobno dla odbiorcy, filaru treści, haczyka i pory
  (`strategy.ts`). Przy kilkudziesięciu obserwujących model faktoryzowany
  uczy się szybciej niż pełne kombinacje.
- **Ograniczenia twarde** (nie podlegają uczeniu): rozrywka najwyżej co piąty
  post, „dowód” tylko z faktów systemu, zmiana odbiorcy po 3 postach do tej
  samej grupy, pytanie z bazy nie wraca przez 60 dni.
- **Pory**: 07:40, 12:10, 19:05 (czas Warszawy). 15:00 zostaje dla codziennej
  rolki.
- **Playbook**: do 12 wniosków z refleksji, dołączanych do każdego briefu.
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
„bezpiecznie lokować”, „stabilny zwrot”, „bez weryfikacji”, stawki miesięczne,
prowizję inną niż w `fees.ts`, LTV ponad 60%, oprocentowanie ponad odsetki
maksymalne, abonament inny niż w `plans.ts`, cudze dane kontaktowe.
Zaprzeczenie („nie obiecujemy zysku”) nie blokuje. Posty dla inwestorów
dostają zastrzeżenie o ryzyku.

Liczby model dostaje wyłącznie z bloku faktów (`agent-toolkit/live-facts.ts`),
który czyta `fees.ts` i `plans.ts`. Zmiana cennika w kodzie = zmiana w postach
bez ruszania promptów.

## Prośby o narzędzia i SMS do właściciela

`request_agent_capability` (MCP) i narzędzie `request_capability` agentów
klasyfikują prośbę (`capabilities.ts`):

- darmowe i wykonalne kodem → przyznane od razu,
- płatne albo wymagające człowieka → SMS do właściciela (889 888 700) z
  darmowymi alternatywami.

Hamulce SMS: ta sama sprawa najwyżej raz na 7 dni, najwyżej 2 SMS-y na dobę,
jedna wiadomość zbiorcza.

## Sterowanie (konektor MCP)

| Narzędzie                  | Do czego                                                            |
| -------------------------- | ------------------------------------------------------------------- |
| `growth_agent_status`      | stan, ostatnie posty, wyniki, koszt 24 h                            |
| `growth_agent_settings`    | włącz/wyłącz, tryb `auto`/`draft`, posty na dobę, platformy, budżet |
| `growth_agent_run`         | ręczny przebieg, także na sucho                                     |
| `growth_agent_decide`      | zatwierdź albo anuluj szkic (tryb `draft`)                          |
| `growth_agent_check_text`  | przepuść dowolny tekst przez strażnika prawdy                       |
| `request_agent_capability` | zgłoś brakujące narzędzie                                           |
| `list_agent_insights`      | wnioski agentów z rozmów i postów                                   |

Endpoint ręczny: `POST /api/public/hooks/growth-agent-tick` (sekret crona),
`?force=create,engage,improve` wymusza fazy, `?dry=1` liczy bez zapisów.

## Ustawienia domyślne

Włączony, tryb `auto`, 1 post na dobę, Facebook i Instagram, odpowiedzi na
komentarze (do 5 na przebieg), budżet 5 zł na dobę na modele i grafiki.

Wyłączenie: `growth_agent_settings` z `enabled: false` albo tryb `draft`,
żeby każdy post czekał na akceptację.
