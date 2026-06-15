---
name: blog-audience-alternation
description: Rotacja typów artykułów autopilota bloga (borrower_news → investor_news → investor_review)
type: feature
---
Autopilot bloga (`src/lib/blog-autopilot.server.ts`) publikuje codziennie 1 artykuł w rotacji 3-elementowej:
1. `borrower_news` — newsowy dla pożyczkobiorcy (audience=borrower)
2. `investor_news` — newsowy dla inwestora (audience=investor)
3. `investor_review` — porównawczy przegląd inwestycyjny (audience=investor, 1100-1700 słów, tabela porównawcza klas aktywów)

Typ artykułu zapisywany w `raw_ai_output.post_kind`. Wybór następnego = patrz na ostatni `post_kind` i wybierz kolejny w rotacji.

Model: `google/gemini-2.5-pro` przez Lovable AI Gateway (tool calling).
Źródła danych: Perplexity Sonar (24h dla news, 30 dni dla review).
