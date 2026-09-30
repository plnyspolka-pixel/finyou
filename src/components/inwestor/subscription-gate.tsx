// Bramka abonamentu inwestora w panelu (warstwa UI). Twarde egzekwowanie jest
// w bazie (RLS przez investor_has_full_access) i w server functions — tu
// inwestor bez aktywnego abonamentu dostaje czytelną informację i przejście
// do zakupu zamiast pustych modułów.
import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAccessState } from "@/hooks/use-access";
import {
  SUBSCRIPTION_PAYMENT_SENTENCE,
  SUBSCRIPTION_PRICE_SENTENCE,
} from "@/lib/investor-plan/plans";

/**
 * Moduły dostępne bez abonamentu: pipeline (dane, KYC, umowy — tam też
 * Zlecenie z własną bramką), zakup abonamentu, płatności, profil, odstąpienie.
 */
export const FREE_INVESTOR_PATHS = [
  "/inwestor/umowy",
  "/inwestor/abonament",
  "/inwestor/platnosci",
  "/inwestor/profil",
  "/inwestor/odstapienie",
] as const;

export function isFreeInvestorPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return p === "/inwestor" || FREE_INVESTOR_PATHS.some((f) => p === f || p.startsWith(`${f}/`));
}

export function SubscriptionRequiredCard({ title }: { title?: string }) {
  return (
    <Card className="border-amber-300">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="h-4 w-4 text-amber-600" />
          {title ?? "Ten moduł jest dostępny w abonamencie inwestora"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Abonament kosztuje {SUBSCRIPTION_PRICE_SENTENCE}. {SUBSCRIPTION_PAYMENT_SENTENCE}
        </p>
        <Button asChild>
          <Link to="/inwestor/abonament">Wykup abonament</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function InvestorSubscriptionGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { loading, hasFullAccess } = useAccessState("investor");
  if (isFreeInvestorPath(pathname) || loading || hasFullAccess) return <>{children}</>;
  return (
    <div className="mx-auto max-w-2xl py-6">
      <SubscriptionRequiredCard />
    </div>
  );
}
