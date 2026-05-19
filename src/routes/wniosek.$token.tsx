import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/wniosek/$token")({
  component: WniosekReturn,
});

function WniosekReturn() {
  const { token } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    void (async () => {
      const { data } = await supabase.from("loan_applications").select("id, client:clients(user_id)").eq("return_link_token", token).maybeSingle();
      if (!data) { void navigate({ to: "/" }); return; }
      if (!user) { void navigate({ to: "/logowanie" }); return; }
      void navigate({ to: "/klient" });
    })();
  }, [token, user, loading, navigate]);
  return <div className="grid min-h-screen place-items-center text-muted-foreground">Przekierowywanie do wniosku…</div>;
}
