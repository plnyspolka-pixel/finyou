// Adres nieruchomości z Działu I-O księgi wieczystej — hook kliencki.
// Sama logika parsowania (czysta, współdzielona z serwerową analizą ryzyka)
// mieszka w kw-address-core.ts.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeKwNumber } from "@/lib/kw";
import { parseKwAddress, type KwAddress } from "@/lib/kw-address-core";

export { parseKwAddress };
export type { KwAddress };

/** Hook: dla numeru KW ciągnie parsed adres z cache kw_documents (dzial_1o). */
export function useKwAddress(kwNumber?: string | null): KwAddress | null {
  const [addr, setAddr] = useState<KwAddress | null>(null);
  useEffect(() => {
    if (!kwNumber) {
      setAddr(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const normalized = normalizeKwNumber(kwNumber);
      if (!normalized) return;
      const { data } = await supabase
        .from("kw_documents")
        .select("dzial_1o")
        .eq("kw_number", normalized)
        .maybeSingle();
      if (cancelled) return;
      setAddr(data?.dzial_1o ? parseKwAddress(data.dzial_1o) : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [kwNumber]);
  return addr;
}
