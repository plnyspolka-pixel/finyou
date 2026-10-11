// Ocena ryzyka od razu po krokach 1–3 — Analityka, analiza KW spoza
// Finance You i raport Projektu w „Moich zleceniach". Gdy wczytane dane
// pokazują trwający przebieg z rozstrzygniętymi krokami 1–3 i wolnym krokiem
// 4, panel raz (na przebieg i stan zajęcia, w obrębie montażu) zleca ocenę
// serwerowi — liczy się ona w tym żądaniu, zwykle do minuty. Serwer pilnuje
// zajęcia, więc druga karta albo cron nie policzą jej drugi raz; cron tick
// (co 5 min) zostaje siatką bezpieczeństwa. Próba bez wyniku (błąd sieci,
// „jeszcze nie gotowe" z wyścigu) wraca po RETRY_AFTER_MS.
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  riskStepOverdue,
  riskStepPhase,
  shouldRequestRiskStep,
  type StepsLike,
} from "@/lib/analysis-pipeline/step-timing";
import { runMyRiskStep, type RiskStepTarget } from "@/lib/investor-analytics/risk-step.functions";

/** Krótka notka, gdy ocena się liczy. */
export const RISK_STEP_COMPUTING_TEXT = "Liczymy ocenę ryzyka i wycenę — zwykle do minuty.";

/** To samo w krótkim statusie obok przycisku (jak „raport w przygotowaniu"). */
export const RISK_STEP_COMPUTING_LABEL = "liczymy ocenę ryzyka i wycenę (zwykle do minuty)";

/** Czas dla inwestora — spójny z obietnicą „ocena ryzyka i wycena w 15 minut". */
export const RISK_STEP_ETA_TEXT =
  "ocena ryzyka i wycena w ciągu ok. 15 minut od uruchomienia analizy (pobranie księgi wieczystej zwykle trwa kilka minut)";

/** Po 15 minutach, gdy księga z EKW wciąż się pobiera — zamiast nieaktualnej obietnicy. */
export const RISK_STEP_KW_SLOW_TEXT =
  "Pobieranie księgi z EKW trwa dłużej niż zwykle — ocenę ryzyka i wycenę policzymy zaraz po jej pobraniu.";

/** Po 15 minutach, gdy księga jest, a ocena ryzyka jeszcze nie. */
export const RISK_STEP_LATE_TEXT =
  "Analiza trwa dłużej niż zwykle — ocena ryzyka i wycena pojawią się tu, gdy tylko będą gotowe.";

/** Ponowna próba po zleceniu bez wyniku (błąd, wyścig) — najwcześniej po tylu ms. */
const RETRY_AFTER_MS = 30_000;
/** Zegar panelu przy trwającym przebiegu: wiek zajęcia i obietnicy 15 minut. */
const CLOCK_MS = 15_000;

/** Bieżący czas odświeżany co `everyMs` (null = zegar stoi). */
function useNow(everyMs: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (everyMs == null) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

export function useRiskStepTrigger({
  target,
  run,
  onSettled,
}: {
  target: RiskStepTarget;
  /**
   * Przebieg z wczytanych danych: `key` rozróżnia przebiegi (id albo start),
   * `startedAt` — od kiedy liczymy obietnicę 15 minut.
   */
  run: { key: string; status: string; steps: StepsLike; startedAt: string | null } | null;
  /** Odśwież szczegóły (i listę) — wynik albo cudze zajęcie są już w bazie. */
  onSettled: () => void;
}): {
  /** Ocena się liczy (to żądanie albo cudze, świeże zajęcie). */
  computing: boolean;
  /** Notka zamiast domyślnego tekstu z terminem (liczymy / trwa dłużej) albo null. */
  note: string | null;
} {
  const runFn = useServerFn(runMyRiskStep);
  // Klucz próby → do kiedy nie ponawiamy (Infinity = rozstrzygnięta albo w toku).
  const blockedUntil = useRef(new Map<string, number>());
  const retryLater = (key: string) => blockedUntil.current.set(key, Date.now() + RETRY_AFTER_MS);
  const { mutate, isPending } = useMutation({
    mutationFn: (v: { target: RiskStepTarget; key: string }) => runFn({ data: v.target }),
    onSuccess: (r, v) => {
      if (r.status !== "done" && r.status !== "error") retryLater(v.key);
    },
    onError: (_e, v) => retryLater(v.key),
    onSettled: () => onSettled(),
  });

  // Dane z 30/20-sekundowego odpytywania bywają identyczne (bez re-renderu) —
  // zegar pilnuje, by porzucone zajęcie i minięty termin były widoczne.
  const live = run?.status === "running" ? run : null;
  const now = useNow(live ? CLOCK_MS : null);

  const eligible = run ? shouldRequestRiskStep(run.status, run.steps, now) : false;
  // Nowe zajęcie (np. porzucone przez inne żądanie i znów wolne) = nowa próba.
  const attemptKey = run ? `${run.key}:${run.steps?.risk?.claimed_at ?? ""}` : null;

  useEffect(() => {
    if (!eligible || !attemptKey || isPending) return;
    if ((blockedUntil.current.get(attemptKey) ?? 0) > now) return;
    blockedUntil.current.set(attemptKey, Infinity);
    mutate({ target, key: attemptKey });
  }, [eligible, attemptKey, isPending, mutate, target, now]);

  const computing = isPending || (live != null && riskStepPhase(live.steps, now) === "running");
  const overdue = live ? riskStepOverdue(live.startedAt, live.steps, now) : null;
  const note = computing
    ? RISK_STEP_COMPUTING_TEXT
    : overdue === "kw"
      ? RISK_STEP_KW_SLOW_TEXT
      : overdue === "late"
        ? RISK_STEP_LATE_TEXT
        : null;
  return { computing, note };
}
