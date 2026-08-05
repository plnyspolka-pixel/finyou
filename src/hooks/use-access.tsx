// Hook stanu płatnego dostępu (inwestor/pośrednik) dla warstwy UI.
// To tylko wygoda interfejsu — twarde egzekwowanie jest w server functions
// i RLS; ukrycie elementów w React nigdy nie jest jedyną barierą.
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { getMyAccessState, type AccessStateResult } from "@/lib/access/state.functions";
import type { AccessAudience } from "@/lib/access/core";

export function useAccessState(audience: AccessAudience) {
  const { user } = useAuth();
  const stateFn = useServerFn(getMyAccessState);
  const [state, setState] = useState<AccessStateResult | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // Brak użytkownika to stan rozstrzygnięty, nie „wieczne ładowanie" — inaczej
    // `loading` zostaje true, a panele domyślnie renderują nawigację płatną.
    if (!user) {
      setState(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setState(await stateFn({ data: { audience } }));
    } catch {
      setState(null);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, audience]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasFullAccess = Boolean(state?.hasPaidAccess || state?.isBypass || state?.hasModuleAccess);
  return { state, loading, refresh, hasFullAccess };
}
