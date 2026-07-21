---
name: blog-audience-alternation
description: Rotacja typów artykułów autopilota bloga (borrower_news → investor_news → legal_market_monitor → investor_review)
type: feature
---
Autopilot bloga (`src/lib/blog-autopilot.server.ts`) publikuje codziennie 1 artykuł w rotacji 4-elementowej:
1. `borrower_news` — newsowy dla pożyczkobiorcy (audience=borrower, 24h)
2. `investor_news` — newsowy dla inwestora (audience=investor, 24h)
3. `legal_market_monitor` — cotygodniowy przegląd prawno-rynkowy: legislacja PL, sądy/orzecznictwo (SN, TSUE), komornicy, notariat/adwokatura/radcowie, regulatorzy (KNF/UOKiK/NBP), rynek nieruchomości PL (GUS/AMRON/Otodom), świat→PL (FED/EBC/surowce z mechanizmem przełożenia). audience=borrower, 7 dni, 1000-1500 słów.
4. `investor_review` — porównawczy przegląd inwestycyjny (audience=investor, 30 dni, 1100-1700 słów, tabela porównawcza klas aktywów)

Typ artykułu zapisywany w `raw_ai_output.post_kind`. Wybór następnego = patrz na ostatni `post_kind` i wybierz kolejny w rotacji.

Model: Perplexity `sonar` (brief) + `sonar-pro` (writer, JSON schema).
