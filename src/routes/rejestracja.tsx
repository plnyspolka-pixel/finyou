import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";

export const Route = createFileRoute("/rejestracja")({
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"klient" | "inwestor">("klient");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const redirectUrl = `${window.location.origin}/`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { first_name: firstName, last_name: lastName },
      },
    });
    if (error) {
      setLoading(false);
      toast.error("Rejestracja nie powiodła się", { description: error.message });
      return;
    }
    // Jeśli rola inna niż domyślna „klient", dopisz dodatkową rolę
    if (data.user && role === "inwestor") {
      await supabase.from("user_roles").insert({ user_id: data.user.id, role });
      // Utwórz wpis inwestora indywidualnego
      await supabase.from("investors").insert({
        user_id: data.user.id,
        investor_type: "indywidualny",
        first_name: firstName,
        last_name: lastName,
        email,
        subscription_status: "nieaktywny",
      });
    }
    setLoading(false);
    toast.success("Konto utworzone", { description: "Możesz się teraz zalogować." });
    navigate({ to: "/logowanie" });
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Załóż konto</CardTitle>
          <CardDescription>Wybierz, jako kto się rejestrujesz.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="fn">Imię</Label>
                <Input id="fn" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ln">Nazwisko</Label>
                <Input id="ln" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Hasło</Label>
              <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Typ konta</Label>
              <RadioGroup value={role} onValueChange={(v) => setRole(v as "klient" | "inwestor")} className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 rounded-md border border-input p-3 cursor-pointer">
                  <RadioGroupItem value="klient" id="r-klient" />
                  <span>Klient (pożyczkobiorca)</span>
                </label>
                <label className="flex items-center gap-2 rounded-md border border-input p-3 cursor-pointer">
                  <RadioGroupItem value="inwestor" id="r-inwestor" />
                  <span>Inwestor indywidualny</span>
                </label>
              </RadioGroup>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Tworzenie konta…" : "Załóż konto"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Masz już konto? <Link to="/logowanie" className="font-medium text-accent hover:underline">Zaloguj się</Link>
            </p>
            <p className="text-center text-xs text-muted-foreground">
              Konto administratora i operatora przydziela administrator po założeniu konta.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
