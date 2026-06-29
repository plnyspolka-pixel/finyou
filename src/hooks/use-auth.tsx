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
    setRoles(((data ?? []) as { role: AppRole }[]).map((r) => r.role));
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
