import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyLoanProgress, claimLoanApplication } from "@/lib/my-loan.functions";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { NextStepCard } from "@/components/client/NextStepCard";
import { ProgressChecklist } from "@/components/client/ProgressChecklist";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { loanStatusLabels } from "@/lib/labels";
import { FileText, User, Phone, Mail } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/klient/")({
  component: KlientDashboard,
});

const CLAIM_KEY = "pendingClaimToken";

function KlientDashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const fetchProgress = useServerFn(getMyLoanProgress);
  const runClaim = useServerFn(claimLoanApplication);

  // Auto-claim pending Meta lead (z SMS-a / wniosek.$token)
  useEffect(() => {
    if (!user) return;
    const token = typeof window !== "undefined" ? localStorage.getItem(CLAIM_KEY) : null;
    if (!token) return;
    void (async () => {
      try {
        const res = await runClaim({ data: { token } });
        if (res.ok && !res.alreadyClaimed) {
          toast.success("Połączyliśmy Twój wniosek z kontem");
        }
      } catch (e) {
        console.error("claim failed", e);
      } finally {
        localStorage.removeItem(CLAIM_KEY);
        void refetch();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const { data: progress, isLoading, refetch } = useQuery({
    queryKey: ["my-loan-progress", user?.id],
    queryFn: () => fetchProgress(),
    enabled: Boolean(user),
  });

  const { data: clientRow } = useQuery({
    queryKey: ["client-bank-status", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("clients")
        .select("bank_account, bank_account_verified_at, nip, company_name")
        .eq("user_id", user!.id).maybeSingle();
      return data;
    },
    enabled: Boolean(user),
  });

  if (authLoading || isLoading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <Skeleton className="h-56 w-full rounded-2xl" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!progress) {
    return (
      <Card className="max-w-2xl">
        <CardHeader><CardTitle>Witaj!</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Nie masz jeszcze profilu. Uzupełnij dane, żeby rozpocząć wniosek.
          </p>
          <Button onClick={() => navigate({ to: "/klient/profil" })}>Uzupełnij profil</Button>
        </CardContent>
      </Card>
    );
  }

  const statusLabel = loanStatusLabels[progress.step_label as keyof typeof loanStatusLabels] ?? progress.step_label;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Twój pulpit</h1>
          <p className="text-sm text-muted-foreground">Wszystko, czego potrzebujesz, w jednym miejscu.</p>
        </div>
        <Badge variant="secondary">{statusLabel}</Badge>
      </div>

      <NextStepCard progress={progress} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ProgressChecklist
            progress={progress}
            hasContact={progress.flags.hasContact}
            hasPropertyType={progress.flags.hasPropertyType}
            hasLoanTerms={progress.flags.hasLoanTerms}
            hasInvestorDescription={progress.flags.hasInvestorDescription}
            hasBankAccount={Boolean(clientRow?.bank_account_verified_at)}
            hasCompanyData={Boolean(clientRow?.nip && clientRow?.company_name)}
          />
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Skróty</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button asChild variant="outline" className="w-full justify-start">
                <Link to="/klient/wniosek"><FileText className="mr-2 h-4 w-4" /> Mój wniosek</Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start">
                <Link to="/klient/profil"><User className="mr-2 h-4 w-4" /> Profil</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pomoc</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">Masz pytania? Napisz lub zadzwoń:</p>
              <a className="flex items-center gap-2 hover:underline" href="tel:+48000000000"><Phone className="h-4 w-4" /> +48 000 000 000</a>
              <a className="flex items-center gap-2 hover:underline" href="mailto:kontakt@financeyou.pl"><Mail className="h-4 w-4" /> kontakt@financeyou.pl</a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
