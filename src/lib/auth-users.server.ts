// Znajdowanie / zakładanie konta auth po adresie e-mail.
//
// Powód istnienia: `auth.admin.createUser()` dla istniejącego adresu NIE zawsze
// zwraca ładne „User already registered". Gdy trafi na unikalny indeks
// `users_email_partial_key`, GoTrue oddaje 500 `unexpected_failure` z treścią
// „duplicate key value violates unique constraint" (SQLSTATE 23505), a zaraz po
// nim „current transaction is aborted" (25P02). Kod, który rozpoznawał duplikat
// po słowie „registered", brał to za twardy błąd i przerywał — klient z już
// istniejącym kontem nie dostawał magic linka ani SMS-a z linkiem do logowania.
//
// Dlatego tutaj NIE zgadujemy z treści komunikatu: przy każdym niepowodzeniu
// `createUser` po prostu sprawdzamy, czy user o tym adresie już jest. Błąd
// zwracamy wyłącznie wtedy, gdy i utworzenie się nie udało, i nie znaleźliśmy
// istniejącego konta.

const PAGE_SIZE = 200;
const MAX_PAGES = 25; // 5000 kont — twardy bezpiecznik na pętlę

function normalize(email: string): string {
  return email.toLowerCase().trim();
}

/** ID konta auth o podanym adresie, albo null. Przechodzi przez wszystkie strony. */
export async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const target = normalize(email);
  if (!target) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    });
    if (error) return null;
    const users = data?.users ?? [];
    const hit = users.find((u) => normalize(u.email ?? "") === target);
    if (hit) return hit.id;
    if (users.length < PAGE_SIZE) break; // ostatnia strona
  }
  return null;
}

/**
 * Zwraca ID konta auth dla adresu — zakłada je, jeśli jeszcze nie istnieje.
 * `created` mówi, czy konto powstało w tym wywołaniu (np. czy hasło tymczasowe
 * jest w ogóle aktualne).
 */
export async function ensureAuthUser(params: {
  email: string;
  password?: string;
  userMetadata?: Record<string, unknown>;
}): Promise<{ userId: string | null; created: boolean; error?: string }> {
  const email = normalize(params.email);
  if (!email) return { userId: null, created: false, error: "no email" };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let createError: string | null = null;
  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      ...(params.password ? { password: params.password } : {}),
      ...(params.userMetadata ? { user_metadata: params.userMetadata } : {}),
    });
    if (data?.user?.id) return { userId: data.user.id, created: true };
    createError = error?.message ?? "createUser returned no user";
  } catch (e: any) {
    createError = e?.message ?? String(e);
  }

  // Nie ufamy treści błędu — sprawdzamy wprost, czy konto już jest.
  const existing = await findAuthUserIdByEmail(email);
  if (existing) return { userId: existing, created: false };

  return { userId: null, created: false, error: createError ?? "user not found" };
}
