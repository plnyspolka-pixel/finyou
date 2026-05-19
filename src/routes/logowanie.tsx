import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { useAuth, defaultPathForRoles } from "@/hooks/use-auth";

export const Route = createFileRoute("/logowanie")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { refreshRoles } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [googleRole, setGoogleRole] = useState<"klient" | "inwestor">("klient");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast.error("Nie udało się zalogować", { description: error.message });
      return;
    }
    toast.success("Zalogowano");
    const { data } = await supabase.auth.getUser();
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user!.id);
    await refreshRoles();
    const roles = (roleRows ?? []).map((r) => r.role) as (
      | "administrator"
      | "operator"
      | "klient"
      | "inwestor"
    )[];
    navigate({ to: defaultPathForRoles(roles) });
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Zaloguj się</CardTitle>
          <CardDescription>Wprowadź swoje dane, aby uzyskać dostęp do panelu.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Rola dla logowania Google</Label>
            <RadioGroup value={googleRole} onValueChange={(v) => setGoogleRole(v as "klient" | "inwestor")} className="grid grid-cols-2 gap-2">
              <label className="flex items-center gap-2 rounded-md border border-input p-3 cursor-pointer text-sm">
                <RadioGroupItem value="klient" id="google-r-klient" />
                <span>Klient</span>
              </label>
              <label className="flex items-center gap-2 rounded-md border border-input p-3 cursor-pointer text-sm">
                <RadioGroupItem value="inwestor" id="google-r-inwestor" />
                <span>Inwestor</span>
              </label>
            </RadioGroup>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={async () => {
              try { localStorage.setItem("pending_signup_role", googleRole); } catch {}
              const res = await lovable.auth.signInWithOAuth("google", {
                redirect_uri: `${window.location.origin}/`,
              });
              if (res.error) toast.error("Logowanie Google nie powiodło się", { description: res.error.message });
            }}
          >
            Kontynuuj z Google
          </Button>
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">lub e-mailem</span></div>
          </div>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Hasło</Label>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Logowanie…" : "Zaloguj się"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Nie masz konta? <Link to="/rejestracja" className="font-medium text-accent hover:underline">Zarejestruj się</Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
