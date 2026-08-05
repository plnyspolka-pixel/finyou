import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "administrator"
  | "operator"
  | "klient"
  | "inwestor"
  | "ksiegowosc"
  | "posrednik";

interface AuthState {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

// ── Preview bypass ─────────────────────────────────────────────────────────
// Na preview (id-preview--*.lovable.app) OAuth Google/Apple bywa blokowany
// w iframie edytora. Żeby dało się przeklikać cały serwis bez logowania,
// udajemy zalogowanego użytkownika ze WSZYSTKIMI rolami. To NIE działa
// end-to-end (zapytania do bazy dalej respektują RLS), ale odblokowuje
// nawigację po panelach do celów podglądowych.
export const PREVIEW_BYPASS_KEY = "fy_preview_bypass";
export function isPreviewHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h.startsWith("id-preview--") || h.endsWith(".lovableproject.com") || h === "localhost";
}
export function isPreviewBypassActive(): boolean {
  if (!isPreviewHost()) return false;
  try {
    return window.localStorage.getItem(PREVIEW_BYPASS_KEY) === "1";
  } catch {
    return false;
  }
}
export function setPreviewBypass(on: boolean) {
  try {
    if (on) window.localStorage.setItem(PREVIEW_BYPASS_KEY, "1");
    else window.localStorage.removeItem(PREVIEW_BYPASS_KEY);
  } catch {}
  if (typeof window !== "undefined") window.location.reload();
}

const FAKE_USER = {
  id: "00000000-0000-0000-0000-000000000000",
  email: "preview@financeyou.local",
  app_metadata: {},
  user_metadata: { full_name: "Podgląd (bez logowania)" },
  aud: "authenticated",
  created_at: new Date().toISOString(),
} as unknown as User;
const ALL_ROLES: AppRole[] = [
  "administrator",
  "operator",
  "klient",
  "inwestor",
  "ksiegowosc",
  "posrednik",
];

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
        typeof window !== "undefined"
          ? window.localStorage.getItem("pending_role_selection")
          : null;
      if (!pending) return;
      const needsFix =
        (pending === "inwestor" && !next.includes("inwestor") && !next.includes("administrator")) ||
        (pending === "posrednik" &&
          !next.includes("posrednik") &&
          !next.includes("operator") &&
          !next.includes("administrator")) ||
        (pending === "klient" && next.length > 0 && !next.includes("klient"));
      const path = typeof window !== "undefined" ? window.location.pathname : "";
      if (
        needsFix &&
        typeof window !== "undefined" &&
        !path.startsWith("/wybor-roli") &&
        !path.startsWith("/embed")
      ) {
        window.location.assign("/wybor-roli");
      } else if (!needsFix) {
        window.localStorage.removeItem("pending_role_selection");
      }
    } catch {}
  };

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      // Po świeżym zalogowaniu role dociągają się asynchronicznie z bazy. Dopóki ich nie znamy,
      // trzymamy `loading = true`, żeby strażnicy paneli nie uznali użytkownika za „bez roli"
      // i nie wyrzucili go (np. z /admin do /klient), zanim role zdążą się wczytać.
      if (event === "SIGNED_IN") setLoading(true);
      // Defer to avoid deadlock in onAuthStateChange
      setTimeout(() => {
        void loadRoles(newSession?.user?.id).finally(() => {
          if (event === "SIGNED_IN") setLoading(false);
        });
      }, 0);
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      void loadRoles(s?.user?.id).finally(() => setLoading(false));
    });

    return () => subscription.unsubscribe();
  }, []);

  const bypass = isPreviewBypassActive();
  const value: AuthState = {
    user: bypass ? FAKE_USER : user,
    session: bypass ? ({ user: FAKE_USER } as unknown as Session) : session,
    roles: bypass ? ALL_ROLES : roles,
    loading: bypass ? false : loading,
    signOut: async () => {
      if (bypass) {
        setPreviewBypass(false);
        return;
      }
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
  if (roles.includes("administrator")) return "/admin";
  if (roles.includes("operator")) return "/operator/leady";
  if (roles.includes("ksiegowosc")) return "/admin/ksiegowosc";
  if (roles.includes("posrednik")) return "/posrednik";
  if (roles.includes("inwestor")) return "/inwestor";
  return "/klient";
}

// ── Panele przypisane do ról ───────────────────────────────────────────────
export type RolePanel = { role: AppRole; path: string; title: string; desc: string };

export const ROLE_PANELS: RolePanel[] = [
  {
    role: "administrator",
    path: "/admin",
    title: "Administrator",
    desc: "Pełne zarządzanie platformą, wnioskami i użytkownikami.",
  },
  {
    role: "operator",
    path: "/operator/leady",
    title: "Operator",
    desc: "Leady, wnioski i codzienna obsługa klientów.",
  },
  {
    role: "ksiegowosc",
    path: "/admin/ksiegowosc",
    title: "Księgowość",
    desc: "Faktury, dokumenty i rozliczenia.",
  },
  {
    role: "posrednik",
    path: "/posrednik",
    title: "Pośrednik",
    desc: "Panel partnera — przekazane wnioski i prowizje.",
  },
  {
    role: "inwestor",
    path: "/inwestor",
    title: "Inwestor",
    desc: "Oferty inwestycyjne i portfel pożyczek.",
  },
  {
    role: "klient",
    path: "/klient",
    title: "Klient",
    desc: "Status wniosku, dokumenty i propozycje finansowania.",
  },
];

export function panelsForRoles(roles: AppRole[]): RolePanel[] {
  return ROLE_PANELS.filter((p) => roles.includes(p.role));
}

// Ścieżka tuż po zalogowaniu: jedna rola → od razu jej panel; kilka ról →
// ekran wyboru panelu (za każdym logowaniem); brak roli → wybór typu konta.
export function postLoginPathForRoles(roles: AppRole[]): string {
  const panels = panelsForRoles(roles);
  if (panels.length === 0) return "/wybor-roli";
  if (panels.length === 1) return panels[0].path;
  return "/wybor-panelu";
}
