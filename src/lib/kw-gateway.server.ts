// Jedno wejście do pobierania treści KW. Domyślnie idzie nową bramką EasyMKW
// (limit 3000 kredytów, 2 kredyty za księgę); stary CMD KW Engine zostaje tylko
// jako awaryjny fallback, gdy nie ma konfiguracji EasyMKW.
import { fetchAndStoreKw, type KwFetchOutcome } from "@/lib/kw-fetch.server";
import { hasEasyMkwConfig } from "@/lib/easymkw.server";

export async function fetchAndStoreKwAuto(
  kw: string,
  opts?: { orderedBy?: string | null; force?: boolean; pollMaxMs?: number },
): Promise<KwFetchOutcome> {
  if (hasEasyMkwConfig()) {
    const { fetchAndStoreKwEasyMkw } = await import("@/lib/kw-easymkw.server");
    return await fetchAndStoreKwEasyMkw(kw, opts);
  }
  return await fetchAndStoreKw(kw, opts);
}
