# Prompt dla sesji z rozszerzeniem Chrome (krok 1: dwa tokeny)

Wklej poniższy tekst do nowego czatu Claude z włączonym rozszerzeniem Chrome
(aplikacja Claude Desktop albo claude.ai). Sesja chmurowa Claude Code nie widzi
przeglądarki użytkownika, dlatego tokeny trzeba założyć w tej sesji i wkleić je
z powrotem do sesji migracyjnej (gałąź `claude/dazzling-ritchie-qn9w8w`).

---

Masz dostęp do mojej przeglądarki. Załóż dwa tokeny API i podaj mi je na końcu
w jednej wiadomości. Nie zmieniaj nic poza tym.

1. Supabase — token osobisty (PAT)
   - Otwórz https://supabase.com/dashboard/account/tokens
   - „Generate new token”, nazwa: `finyou-migracja`, zakres domyślny.
   - Skopiuj wartość (zaczyna się od `sbp_`). Pokazywana jest tylko raz.

2. Cloudflare — token API do Workers
   - Otwórz https://dash.cloudflare.com/profile/api-tokens
   - „Create Token” → szablon „Edit Cloudflare Workers”.
   - W „Account Resources” wybierz moje konto; w „Zone Resources” wybierz
     „All zones” (albo strefę `financeyou.pl`, jeśli jest na liście).
   - „Continue to summary” → „Create Token” → skopiuj wartość.
   - Wróć na https://dash.cloudflare.com i skopiuj „Account ID”
     (prawa kolumna na stronie konta / w sekcji Workers & Pages → Overview).
   - Sprawdź w zakładce „Websites”, czy strefa `financeyou.pl` jest w Cloudflare.
     Jeśli nie, napisz, gdzie są serwery DNS domeny (u jakiego rejestratora).

Na końcu wypisz dokładnie:
```
SUPABASE_PAT=sbp_...
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_ACCOUNT_ID=...
STREFA_financeyou.pl: jest w Cloudflare / nie ma (DNS u: ...)
```
---

Po wklejeniu tych wartości do sesji migracyjnej reszta (wdrożenie Workera,
klucz service_role, konfiguracja Auth, sekrety funkcji Edge, sprzątanie historii
migracji) idzie automatycznie. Krok 2 (przepisanie sekretów z Lovable do
Workera i klient Google OAuth) dostanie osobny prompt po wdrożeniu Workera.
