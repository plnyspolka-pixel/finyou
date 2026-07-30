// Klientowy helper: dowozi treść KW do stanu "ready" bez ingerencji użytkownika.
// Wielokrotnie wywołuje serwerowe `fetchKwForApplication` (każde wywołanie
// pollingu trwa ~45 s), aż status w cache osiągnie "ready" (lub error/not_found).

import { fetchKwForApplication, getKwForApplication } from "@/lib/kw-content.functions";

type EnsureOpts = {
  /** Maks. czas w ms (domyślnie 6 minut). */
  timeoutMs?: number;
  /** Odstęp między odpytywaniami statusu (domyślnie 3 s). */
  pollMs?: number;
  /** Wywoływane po każdej zmianie statusu (do UI). */
  onStatus?: (status: "processing" | "ready" | "error" | "not_found" | "unknown") => void;
};

export type EnsureResult =
  | { ok: true; kwNumber: string | null }
  | { ok: false; status: "error" | "not_found" | "timeout" | "no_kw"; message: string };

export async function ensureKwReady(
  applicationId: string,
  opts: EnsureOpts = {},
): Promise<EnsureResult> {
  const timeoutMs = opts.timeoutMs ?? 6 * 60 * 1000;
  const pollMs = opts.pollMs ?? 3000;
  const started = Date.now();

  // Szybki sprawdzian cache — jeśli już ready, kończymy od razu.
  try {
    const cur = await getKwForApplication({ data: { loanApplicationId: applicationId } });
    if (!cur.hasKw) return { ok: false, status: "no_kw", message: "Wniosek nie ma numeru KW." };
    if ((cur.document as any)?.status === "ready") {
      opts.onStatus?.("ready");
      return { ok: true, kwNumber: null };
    }
  } catch {
    /* ignore, spróbujemy zlecić poniżej */
  }

  let lastKwNumber: string | null = null;
  // Główna pętla: zlecamy pobranie (każde wywołanie pollingu ~45 s), potem
  // odpytujemy status w cache. Ponawiamy, dopóki nie osiągniemy stanu terminalnego.
  while (Date.now() - started < timeoutMs) {
    try {
      const r = await fetchKwForApplication({
        data: { loanApplicationId: applicationId, force: false },
      });
      lastKwNumber = (r as any)?.kwNumber ?? lastKwNumber;
      if ((r as any)?.status === "ready") {
        opts.onStatus?.("ready");
        return { ok: true, kwNumber: lastKwNumber };
      }
      opts.onStatus?.("processing");
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (/nie odnaleziona|not.?found|nieznaleziona/i.test(msg)) {
        opts.onStatus?.("not_found");
        return { ok: false, status: "not_found", message: msg };
      }
      // inny błąd — spróbujmy sprawdzić cache, może w międzyczasie ready.
    }

    // Poll cache co pollMs, aż pojawi się terminalny status lub minie 45 s.
    const cycleUntil = Date.now() + 45_000;
    while (Date.now() < cycleUntil && Date.now() - started < timeoutMs) {
      await new Promise((res) => setTimeout(res, pollMs));
      try {
        const cur = await getKwForApplication({ data: { loanApplicationId: applicationId } });
        const st = (cur as any)?.document?.status as string | undefined;
        if (st === "ready") {
          opts.onStatus?.("ready");
          return { ok: true, kwNumber: lastKwNumber };
        }
        if (st === "not_found") {
          opts.onStatus?.("not_found");
          return {
            ok: false,
            status: "not_found",
            message: "Księga wieczysta nie została odnaleziona w EKW.",
          };
        }
        if (st === "error") {
          opts.onStatus?.("error");
          return {
            ok: false,
            status: "error",
            message: (cur as any)?.document?.last_error ?? "Błąd pobierania KW.",
          };
        }
        opts.onStatus?.(st === "processing" ? "processing" : "unknown");
      } catch {
        /* ignore, spróbujemy w kolejnej iteracji */
      }
    }
  }

  return {
    ok: false,
    status: "timeout",
    message: "Przekroczono czas oczekiwania na pobranie treści KW.",
  };
}
