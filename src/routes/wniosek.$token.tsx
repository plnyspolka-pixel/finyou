import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/wniosek/$token")({
  component: WniosekReturn,
});

const PREFILL_KEY = "wniosek_prefill_v1";

function WniosekReturn() {
  const { token } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    void (async () => {
      const { data } = await supabase
        .from("loan_applications")
        .select("id, status, return_link_token, client:clients(id, user_id, first_name, last_name, email, phone)")
        .eq("return_link_token", token)
        .maybeSingle();

      if (!data) {
        void navigate({ to: "/wniosek-start" });
        return;
      }

      const client = (data as any).client ?? null;
      const prefill = {
        loanApplicationId: (data as any).id,
        firstName: client?.first_name ?? "",
        lastName: client?.last_name ?? "",
        email: client?.email ?? "",
        phone: client?.phone ?? "",
      };
      try {
        sessionStorage.setItem(PREFILL_KEY, JSON.stringify(prefill));
      } catch {
        /* noop */
      }

      if (!user) {
        void navigate({ to: "/wniosek-start" });
        return;
      }
      void navigate({ to: "/klient" });
    })();
  }, [token, user, loading, navigate]);

  return <div className="grid min-h-screen place-items-center text-muted-foreground">Przekierowywanie do wniosku…</div>;
}
