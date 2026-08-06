import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Liczniki dla `badgeKey` z `admin-nav.ts` (sidebar, huby, zakładki).
 * Tylko tanie zapytania `count/head` — bez pobierania wierszy. Brak klucza
 * w wyniku = brak badge'a (wartości 0 też pomijamy).
 */
export function useAdminBadges(): Record<string, number> {
  const { data } = useQuery({
    queryKey: ["admin-nav-badges"],
    queryFn: async () => {
      const badges: Record<string, number> = {};

      // Nowe wnioski: świeże leady, jeszcze nieobsłużone i niezarchiwizowane.
      try {
        const { count } = await supabase
          .from("loan_applications")
          .select("id", { count: "exact", head: true })
          .eq("status", "nowy_lead")
          .is("archived_at", null);
        if (count) badges.noweWnioski = count;
      } catch {
        // Brak dostępu (RLS) — bez badge'a.
      }

      // TODO: `nieprzeczytaneMaile` i `nieprzeczytaneDM` — tabela
      // `lead_communications` nie ma flagi przeczytania (brak kolumny w schemacie),
      // więc nie da się policzyć nieprzeczytanych bez zmiany schematu. Po dodaniu
      // kolumny (np. `read_at`) dodać tu analogiczne zapytania count/head
      // dla channel = "email" oraz channel in ("messenger", "instagram").

      return badges;
    },
    refetchInterval: 60_000,
    staleTime: 55_000,
  });
  return data ?? {};
}
