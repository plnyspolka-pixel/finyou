---
name: Ton i treść maili do klienta (pożyczkobiorcy)
description: Zasady pisania maili follow-up do klienta — klient MUSI rozumieć wszystko + zawsze podkreślać przewagi konkurencyjne Finance You.
type: feature
---

## Zasady treści maili do klienta (borrower)

Mail do klienta NIGDY nie może sugerować, że klient "nie musi czegoś rozumieć", "nie musi mieć wszystkiego", "zostaw to nam". Klient MUSI rozumieć każdy krok — to nasz fundament zaufania.

### Zawsze podkreślaj nasze przewagi konkurencyjne:
1. **Długi okres spłaty** — realna, niska rata.
2. **Korzystne warunki dla klienta** — pełna transparentność kosztów, brak ukrytych opłat.
3. **Indywidualne podejście** — każdy wniosek analizujemy ręcznie, opiekun odpowiada na każde pytanie.
4. **Wybór z wielu inwestorów** — klient nie jest przypisany do jednego inwestora, my zbieramy oferty i wybieramy razem z nim najkorzystniejszą.

### Czego unikać:
- "nie musisz tego rozumieć" / "zostaw to ekspertom" / "my się tym zajmiemy za Ciebie"
- bagatelizowania pytań klienta
- ukrywania kosztów lub odsyłania do rozmowy zamiast pokazania liczb

### Pliki, których to dotyczy:
- `src/lib/follow-up-plan.server.ts` — `EMAIL_TEMPLATES` (30 maili sekwencji)
- `src/lib/loan-reminder-emails.server.ts`
- `src/lib/email-templates/*.tsx`
