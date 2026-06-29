import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "administrator" | "operator" | "klient" | "inwestor" | "ksiegowosc";

interface AuthState {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRoles = async (uid: string | undefined) => {
    if (!uid) {
      setRoles([]);
      return;
    }
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    const next = ((data ?? []) as { role: AppRole }[]).map((r) => r.role);
    setRoles(next);

    // Auto-fix: jeśli użytkownik wybrał inną rolę przed zalogowaniem (np. wszedł na /inwestor
    // → /logowanie?role=inwestor i zalogował się przez Google/magic link bez ustawienia roli
    // przy rejestracji), przekieruj go do wyboru roli, gdzie nadamy właściwą rolę.
    try {
      const pending =
        typeof window !== "undefined" ? window.localStorage.getItem("pending_role_selection") : null;
      if (!pending) return;
      const needsFix =
        (pending === "inwestor" && !next.includes("inwestor") && !next.includes("administrator")) ||
        (pending === "posrednik" && !next.includes("operator") && !next.includes("administrator")) ||
        (pending === "klient" && next.length > 0 && !next.includes("klient"));
      if (needsFix && typeof window !== "undefined" && !window.location.pathname.startsWith("/wybor-roli")) {
        window.location.assign("/wybor-roli");
      } else if (!needsFix) {
        window.localStorage.removeItem("pending_role_selection");
      }
    } catch {}
  };


  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      // Defer to avoid deadlock in onAuthStateChange
      setTimeout(() => {
        void loadRoles(newSession?.user?.id);
      }, 0);
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      void loadRoles(s?.user?.id).finally(() => setLoading(false));
    });

    return () => subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    user,
    session,
    roles,
    loading,
    signOut: async () => {
      await supabase.auth.signOut();
    },
    refreshRoles: async () => loadRoles(user?.id),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function defaultPathForRoles(roles: AppRole[]): string {
  if (roles.includes("administrator") || roles.includes("operator")) return "/admin";
  if (roles.includes("ksiegowosc")) return "/admin/ksiegowosc";
  if (roles.includes("inwestor")) return "/inwestor";
  return "/klient";
}
