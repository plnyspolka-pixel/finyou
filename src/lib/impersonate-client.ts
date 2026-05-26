import { supabase } from "@/integrations/supabase/client";
import { impersonateUser } from "./impersonation.functions";
import { toast } from "sonner";

export async function loginAsUser(email: string | null | undefined) {
  if (!email) {
    toast.error("Ten użytkownik nie ma adresu e-mail");
    return;
  }
  const ok = window.confirm(
    `Zostaniesz wylogowany z konta administratora i zalogowany jako ${email}. Kontynuować?`,
  );
  if (!ok) return;
  try {
    const res = await impersonateUser({ data: { email } });
    await supabase.auth.signOut();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: res.token_hash,
      type: "magiclink",
    });
    if (error) throw error;
    toast.success(`Zalogowano jako ${email}`);
    window.location.href = res.redirect;
  } catch (e) {
    toast.error("Nie udało się zalogować jako użytkownik", {
      description: e instanceof Error ? e.message : String(e),
    });
  }
}
