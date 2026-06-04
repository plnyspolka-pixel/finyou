---
name: magic-ui
description: Aktywuje się gdy user użyje komendy /magic w prompcie. Buduje UI używając komponentów z 21st.dev Magic API zamiast pisać od zera. Używaj zawsze gdy w prompcie pojawi się "/magic".
---

# Magic UI (21st.dev)

## Kiedy uruchomić

Aktywuj ten skill **zawsze** gdy w prompcie użytkownika pojawi się token `/magic`.
Token może być na początku, w środku lub na końcu wiadomości.

Przykłady promptów które aktywują skill:
- `/magic zrób hero section dla landing page`
- `dodaj pricing table /magic`
- `/magic nowy navbar z dropdown`

## Workflow

Gdy wykryjesz `/magic` w prompcie:

1. **Usuń token `/magic`** z treści requestu — reszta to opis komponentu do zbudowania.
2. **Wywołaj 21st.dev Magic API** żeby pobrać sugerowane komponenty (search + inspiration):

```bash
curl -s -X POST "https://api.21st.dev/api/search" \
  -H "Authorization: Bearer $TWENTYFIRST_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"search":"<opis komponentu>","page":1,"per_page":5}'
```

3. **Wybierz najlepiej pasujący komponent** z wyników (pole `code`, `tailwind_config`, `globals_css`).
4. **Zaadaptuj kod do projektu**:
   - Konwertuj do TypeScript (TSX) jeśli trzeba.
   - Użyj **semantic design tokens** z `src/styles.css` (nie hardcoduj kolorów typu `bg-white`, `text-black`).
   - Zachowaj zgodność z istniejącym design systemem (oklch tokens, shadcn variants).
   - Użyj istniejących komponentów shadcn (`@/components/ui/*`) zamiast duplikować.
   - Ikony: **Phosphor** (`@phosphor-icons/react`) lub `lucide-react` (już w projekcie).
5. **Zapisz komponent** w odpowiednim miejscu (`src/components/...`) i podłącz tam gdzie user chce.
6. **W odpowiedzi** wymień nazwę użytego komponentu z 21st.dev (autor + nazwa) jako credit.

## Klucz API

`TWENTYFIRST_API_KEY` jest dostępny jako env var na serwerze (Lovable Cloud secret).
W kodzie skill-a używaj go tylko w `code--exec` curl calls — **nigdy** nie umieszczaj w kodzie frontendowym ani server functions tej aplikacji (to jest klucz developerski używany przy budowie, nie runtime apki).

## Fallback

Jeśli API zwróci błąd (401/429/5xx) lub brak pasujących wyników:
1. Powiedz userowi krótko że Magic API nie odpowiada.
2. Zbuduj komponent ręcznie używając skill-a `ui-ux-pro-max` jako alternatywy.

## Rules

- **Nie modyfikuj** plików auto-generowanych (`src/integrations/supabase/*`, `routeTree.gen.ts`).
- **Zawsze** dostosuj kolory do design system projektu (oklch tokens).
- **Nigdy** nie używaj emoji jako ikon — zawsze SVG (Phosphor/Lucide).
- Po zbudowaniu komponentu wspomnij w odpowiedzi: "Użyłem skilla magic-ui (21st.dev: <nazwa komponentu>)".
