import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { claimLoanApplication } from "@/lib/my-loan.functions";
import { toast } from "sonner";
import { mergeFunnelState } from "@/lib/wniosek-funnel";

export const Route = createFileRoute("/wniosek/$token")({
  component: WniosekReturn,
});

const CLAIM_KEY = "pendingClaimToken";

function WniosekReturn() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const runClaim = useServerFn(claimLoanApplication);

  useEffect(() => {
    void (async () => {
      // 1) Zaczynamy od pobrania danych leada — tylko po to, by uzupełnić prefill formularza
      const { data: lead } = await supabase
        .from("loan_applications")
        .select("id, return_link_token, client:clients(id, first_name, last_name, email, phone)")
        .eq("return_link_token", token)
        .maybeSingle();

      if (lead) {
        const client = (lead as any).client ?? null;
        mergeFunnelState({
          loanApplicationId: (lead as any).id,
          firstName: client?.first_name ?? "",
          lastName: client?.last_name ?? "",
          email: client?.email ?? "",
          phone: client?.phone ?? "",
        });
      }

      // 2) Sprawdzamy sesję — jeśli klient już zalogowany, claim odbywa się natychmiast
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        try {
          const res = await runClaim({ data: { token } });
          if (res.ok && !res.alreadyClaimed) toast.success("Połączyliśmy Twój wniosek z kontem");
        } catch (e) {
          console.error(e);
        }
        void navigate({ to: "/klient" });
        return;
      }

      // 3) Nie zalogowany — zapamiętujemy token do claim po zalogowaniu/rejestracji
      try {
        localStorage.setItem(CLAIM_KEY, token);
      } catch {
        /* noop */
      }
      void navigate({ to: "/klient" });
    })();
  }, [token, navigate, runClaim]);

  return (
    <div className="grid min-h-screen place-items-center text-muted-foreground">
      Przekierowywanie do wniosku…
    </div>
  );
}
