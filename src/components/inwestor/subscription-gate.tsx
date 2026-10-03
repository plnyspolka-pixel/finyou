// Bramki panelu inwestora (warstwa UI). Kolejność (decyzja właściciela
// 2026-09-30): 1) abonament — pierwsza bramka panelu, 2) akceptacja pakietu
// umów (Umowa ramowa, NDA, RODO) w pipeline'ie, 3) moduł ofert. Twarde
// egzekwowanie jest w bazie (RLS: investor_has_full_access,
// investor_can_view_application → investor_legal_pack_complete) i w server
// functions — tu inwestor dostaje czytelną informację i przejście dalej
// zamiast pustych modułów.
import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileSignature, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAccessState } from "@/hooks/use-access";
import { getInvestorPipelineState } from "@/lib/investor-agreements/pipeline.functions";
import {
  SUBSCRIPTION_PAYMENT_SENTENCE,
  SUBSCRIPTION_PRICE_SENTENCE,
} from "@/lib/investor-plan/plans";

/** Moduły dostępne bez abonamentu: zakup, płatności, profil, odstąpienie. */
export const FREE_INVESTOR_PATHS = [
  "/inwestor/abonament",
  "/inwestor/platnosci",
  "/inwestor/profil",
  "/inwestor/odstapienie",
] as const;

/** Moduł ofert: otwiera go akceptacja pakietu umów (po opłaceniu abonamentu). */
export const INVESTOR_OFFERS_PATHS = [
  "/inwestor/oferty",
  "/inwestor/wniosek",
  "/inwestor/umowa",
] as const;

const PACKAGE_CODES = ["umowa_ramowa", "nda", "rodo"] as const;

const norm = (pathname: string) => pathname.replace(/\/+$/, "") || "/";
const matches = (p: string, list: readonly string[]) =>
  list.some((f) => p === f || p.startsWith(`${f}/`));

export function isFreeInvestorPath(pathname: string): boolean {
  return matches(norm(pathname), FREE_INVESTOR_PATHS);
}

export function isInvestorOffersPath(pathname: string): boolean {
  return matches(norm(pathname), INVESTOR_OFFERS_PATHS);
}

export function SubscriptionRequiredCard({ title }: { title?: string }) {
  return (
    <Card className="border-amber-300">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="h-4 w-4 text-amber-600" />
          {title ?? "Panel inwestora otwiera się po opłaceniu abonamentu"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Abonament kosztuje {SUBSCRIPTION_PRICE_SENTENCE}. {SUBSCRIPTION_PAYMENT_SENTENCE}
        </p>
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Opłacasz abonament.</li>
          <li>Uzupełniasz dane i akceptujesz Umowę ramową, NDA i umowę RODO.</li>
          <li>Akceptacja otwiera moduł ofert: Zlecenia, dopasowane Projekty i oferty.</li>
        </ol>
        <Button asChild>
          <Link to="/inwestor/abonament">Wykup abonament</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function PackageAcceptanceRequiredCard() {
  return (
    <Card className="border-sky-300">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSignature className="h-4 w-4 text-sky-600" />
          Moduł ofert otwiera się po akceptacji umów
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          Zaakceptuj Umowę ramową, NDA i umowę RODO w zakładce „Złóż zlecenie” — wtedy zobaczysz
          Projekty, wnioski i swoje oferty.
        </p>
        <Button asChild>
          <Link to="/inwestor/umowy">Przejdź do umów</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function OffersGate({ children }: { children: ReactNode }) {
  const fetchPipeline = useServerFn(getInvestorPipelineState);
  const q = useQuery({ queryKey: ["investor-pipeline"], queryFn: () => fetchPipeline() });
  if (q.isLoading) return <>{children}</>;
  const docs = q.data?.input.documents ?? [];
  const accepted = PACKAGE_CODES.every((code) => docs.find((d) => d.code === code)?.accepted);
  if (accepted || q.isError) return <>{children}</>;
  return (
    <div className="mx-auto max-w-2xl py-6">
      <PackageAcceptanceRequiredCard />
    </div>
  );
}

export function InvestorSubscriptionGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { loading, hasFullAccess, state } = useAccessState("investor");
  if (isFreeInvestorPath(pathname) || loading) return <>{children}</>;
  if (!hasFullAccess) {
    return (
      <div className="mx-auto max-w-2xl py-6">
        <SubscriptionRequiredCard />
      </div>
    );
  }
  if (!state?.isBypass && isInvestorOffersPath(pathname)) {
    return <OffersGate>{children}</OffersGate>;
  }
  return <>{children}</>;
}
