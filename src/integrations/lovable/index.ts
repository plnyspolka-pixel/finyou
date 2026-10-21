// Logowanie społecznościowe bez Lovable: Supabase Auth (`signInWithOAuth`) z własnymi
// klientami OAuth skonfigurowanymi w projekcie Supabase (Google, ewentualnie Apple).
// Nazwa eksportu `lovable` zachowana, żeby dotychczasowe importy działały bez zmian.

import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

type Provider = "google" | "apple" | "microsoft" | "lovable";

function mapProvider(p: Provider): "google" | "apple" | "azure" {
  if (p === "microsoft") return "azure";
  if (p === "lovable") return "google";
  return p;
}

export const lovable = {
  auth: {
    signInWithOAuth: async (provider: Provider, opts?: SignInOptions) => {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: mapProvider(provider),
        options: {
          redirectTo: opts?.redirect_uri,
          queryParams: opts?.extraParams,
        },
      });
      if (error) return { error };
      // Klient Supabase sam przekierowuje przeglądarkę na stronę dostawcy.
      return { redirected: true as const, url: data?.url ?? null };
    },
  },
};
