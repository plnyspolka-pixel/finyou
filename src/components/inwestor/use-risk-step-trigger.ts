// Ocena ryzyka od razu po krokach 1–3 — Analityka, analiza KW spoza
// Finance You i raport Projektu w „Moich zleceniach". Gdy wczytane dane
// pokazują trwający przebieg z rozstrzygniętymi krokami 1–3 i wolnym krokiem
// 4, panel raz (na przebieg i stan zajęcia, w obrębie montażu) zleca ocenę
// serwerowi — liczy się ona w tym żądaniu, zwykle do minuty. Serwer pilnuje
// zajęcia, więc druga karta albo cron nie policzą jej drugi raz; cron tick
// (co 5 min) zostaje siatką bezpieczeństwa.
import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  riskStepPhase,
  shouldRequestRiskStep,
  type StepsLike,
} from "@/lib/analysis-pipeline/step-timing";
import { runMyRiskStep, type RiskStepTarget } from "@/lib/investor-analytics/risk-step.functions";

/** Krótka notka, gdy ocena się liczy. */
export const RISK_STEP_COMPUTING_TEXT = "Liczymy ocenę ryzyka i wycenę — zwykle do minuty.";

/** Czas dla inwestora — spójny z obietnicą „ocena ryzyka i wycena w 15 minut". */
export const RISK_STEP_ETA_TEXT =
  "ocena ryzyka i wycena w ciągu ok. 15 minut od uruchomienia analizy (pobranie księgi wieczystej zwykle trwa kilka minut)";

export function useRiskStepTrigger({
  target,
  run,
  onSettled,
}: {
  target: RiskStepTarget;
  /** Przebieg z wczytanych danych: `key` rozróżnia przebiegi (id albo start). */
  run: { key: string; status: string; steps: StepsLike } | null;
  /** Odśwież szczegóły (i listę) — wynik albo cudze zajęcie są już w bazie. */
  onSettled: () => void;
}): { computing: boolean } {
  const runFn = useServerFn(runMyRiskStep);
  const attempted = useRef(new Set<string>());
  const { mutate, isPending } = useMutation({
    mutationFn: (t: RiskStepTarget) => runFn({ data: t }),
    onSettled: () => onSettled(),
  });

  const eligible = run ? shouldRequestRiskStep(run.status, run.steps) : false;
  // Nowe zajęcie (np. porzucone przez inne żądanie i znów wolne) = nowa próba.
  const attemptKey = run ? `${run.key}:${run.steps?.risk?.claimed_at ?? ""}` : null;

  useEffect(() => {
    if (!eligible || !attemptKey || isPending || attempted.current.has(attemptKey)) return;
    attempted.current.add(attemptKey);
    mutate(target);
  }, [eligible, attemptKey, isPending, mutate, target]);

  const computing =
    isPending || (run?.status === "running" && riskStepPhase(run.steps) === "running");
  return { computing };
}
