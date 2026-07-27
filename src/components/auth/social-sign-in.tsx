import { useState } from "react";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

type Props = {
  redirectUri?: string;
  className?: string;
  labelPrefix?: string; // "Zaloguj się" | "Kontynuuj"
  variant?: "light" | "dark";
};

export function SocialSignIn({
  redirectUri,
  className,
  labelPrefix = "Kontynuuj",
  variant = "light",
}: Props) {
  const [busy, setBusy] = useState<"google" | "apple" | null>(null);

  const signIn = async (provider: "google" | "apple") => {
    setBusy(provider);
    try {
      const uri =
        redirectUri ?? (typeof window !== "undefined" ? window.location.origin : undefined);
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: uri,
      });
      if ("redirected" in result && result.redirected) return;
      if ("error" in result && result.error) {
        toast.error("Nie udało się zalogować", {
          description:
            typeof result.error === "object" && result.error && "message" in result.error
              ? (result.error as { message?: string }).message
              : String(result.error),
        });
      }
    } catch (e: any) {
      toast.error("Błąd logowania", { description: e?.message ?? String(e) });
    } finally {
      setBusy(null);
    }
  };

  const btnBase =
    variant === "dark"
      ? "border-white/20 bg-white/10 text-white backdrop-blur hover:bg-white/20"
      : "border-border bg-white text-foreground hover:bg-muted";

  return (
    <div className={className}>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          className={`h-11 gap-2 ${btnBase}`}
          onClick={() => signIn("google")}
          disabled={!!busy}
        >
          {busy === "google" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
          <span className="text-sm font-medium">{labelPrefix} z Google</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          className={`h-11 gap-2 ${btnBase}`}
          onClick={() => signIn("apple")}
          disabled={!!busy}
        >
          {busy === "apple" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <AppleIcon dark={variant === "dark"} />
          )}
          <span className="text-sm font-medium">{labelPrefix} z Apple</span>
        </Button>
      </div>
    </div>
  );
}

export function AuthDivider({
  label = "lub",
  variant = "light",
}: {
  label?: string;
  variant?: "light" | "dark";
}) {
  const lineCls = variant === "dark" ? "bg-white/20" : "bg-border";
  const textCls = variant === "dark" ? "text-white/60" : "text-muted-foreground";
  return (
    <div className="flex items-center gap-3 py-1">
      <div className={`h-px flex-1 ${lineCls}`} />
      <span className={`text-xs uppercase tracking-wider ${textCls}`}>{label}</span>
      <div className={`h-px flex-1 ${lineCls}`} />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.4 34.9 26.8 36 24 36c-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.6 39.7 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.6l6.3 5.3C41.3 35.7 44 30.3 44 24c0-1.2-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}

function AppleIcon({ dark }: { dark?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={dark ? "#ffffff" : "#000000"} aria-hidden>
      <path d="M16.365 1.43c0 1.14-.42 2.22-1.11 3.02-.75.88-1.98 1.56-3.18 1.47-.15-1.11.44-2.28 1.11-3.02.79-.88 2.13-1.55 3.18-1.47zM20.5 17.36c-.55 1.29-.82 1.87-1.53 3.01-.99 1.6-2.39 3.59-4.12 3.6-1.54.02-1.93-1-4.02-1-2.09.01-2.52 1.02-4.06 1-1.73-.01-3.05-1.81-4.04-3.4C.34 16.9-.13 11.2 2.72 8.24 4.05 6.86 5.94 6 7.75 6c1.79 0 2.91 1 4.39 1 1.43 0 2.3-1 4.37-1 1.55 0 3.2.84 4.37 2.3-3.85 2.11-3.23 7.63-.38 9.06z" />
    </svg>
  );
}
