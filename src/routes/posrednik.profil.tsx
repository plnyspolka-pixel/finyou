import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2, Save, User as UserIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { FancyPageHeader } from "@/components/layout/fancy-page-header";
import { FancyShell } from "@/components/landing/fancy-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/posrednik/profil")({
  component: BrokerProfile,
});

type ProfileForm = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  avatar_url: string | null;
};

const EMPTY: ProfileForm = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  avatar_url: null,
};

export function BrokerProfile() {
  const { user, loading: authLoading } = useAuth();
  const [form, setForm] = useState<ProfileForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("first_name,last_name,email,phone,avatar_url")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        toast.error("Nie udało się wczytać profilu");
      } else if (data) {
        setForm({
          first_name: data.first_name ?? "",
          last_name: data.last_name ?? "",
          email: data.email ?? user.email ?? "",
          phone: data.phone ?? "",
          avatar_url: (data as any).avatar_url ?? null,
        });
      } else {
        setForm({ ...EMPTY, email: user.email ?? "" });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Generuj signed URL dla podglądu awatara (bucket 'avatars' jest prywatny)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!form.avatar_url) {
        setAvatarPreview(null);
        return;
      }
      const { data } = await supabase.storage
        .from("avatars")
        .createSignedUrl(form.avatar_url, 3600);
      if (!cancelled) setAvatarPreview(data?.signedUrl ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [form.avatar_url]);

  const handleUpload = async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Wybierz plik graficzny");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Zdjęcie nie może przekraczać 5 MB");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("avatars").upload(path, file, {
      upsert: true,
      contentType: file.type,
    });
    setUploading(false);
    if (error) {
      toast.error("Nie udało się wgrać zdjęcia");
      return;
    }
    // Usuń stare zdjęcie (best-effort)
    if (form.avatar_url && form.avatar_url !== path) {
      supabase.storage
        .from("avatars")
        .remove([form.avatar_url])
        .catch(() => {});
    }
    setForm((f) => ({ ...f, avatar_url: path }));
    // Zapisz od razu ścieżkę w profilu
    await supabase.from("profiles").update({ avatar_url: path }).eq("user_id", user.id);
    toast.success("Zdjęcie zaktualizowane");
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        first_name: form.first_name.trim() || null,
        last_name: form.last_name.trim() || null,
        phone: form.phone.trim() || null,
      })
      .eq("user_id", user.id);
    setSaving(false);
    if (error) {
      toast.error("Nie udało się zapisać zmian");
    } else {
      toast.success("Profil zapisany");
    }
  };

  const initials =
    `${(form.first_name || "").charAt(0)}${(form.last_name || "").charAt(0)}`.toUpperCase() || "FY";

  return (
    <div className="space-y-4 max-w-3xl">
      <FancyPageHeader
        eyebrow="Twój profil"
        title="Profil pośrednika"
        subtitle="Zdjęcie, dane kontaktowe i krótki opis, który widzą klienci."
      />

      <FancyShell motion={false} innerClassName="!p-4 md:!p-6">
        {authLoading || loading ? (
          <div className="space-y-4">
            <Skeleton className="h-28 w-28 rounded-full bg-white/10" />
            <Skeleton className="h-10 w-full bg-white/10" />
            <Skeleton className="h-10 w-full bg-white/10" />
            <Skeleton className="h-24 w-full bg-white/10" />
          </div>
        ) : (
          <div className="space-y-6 text-white">
            {/* Awatar */}
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-5">
              <div className="relative">
                <div className="grid h-28 w-28 place-items-center overflow-hidden rounded-full border border-white/20 bg-white/10 shadow-lg shadow-primary/20">
                  {avatarPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarPreview}
                      alt="Twoje zdjęcie"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-2xl font-bold text-white/80">
                      {initials || <UserIcon className="h-8 w-8" />}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  aria-label="Zmień zdjęcie"
                  className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full border border-white/25 bg-primary text-white shadow-md transition hover:scale-105 disabled:opacity-60"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                    e.target.value = "";
                  }}
                />
              </div>
              <div className="text-center sm:text-left">
                <p className="text-sm font-semibold text-white">
                  {form.first_name || form.last_name
                    ? `${form.first_name} ${form.last_name}`.trim()
                    : "Twoje imię i nazwisko"}
                </p>
                <p className="text-xs text-white/60">Pośrednik Finance You</p>
                <p className="mt-1 text-xs text-white/50">PNG lub JPG, max 5 MB.</p>
              </div>
            </div>

            {/* Dane */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Imię"
                value={form.first_name}
                onChange={(v) => setForm({ ...form, first_name: v })}
              />
              <Field
                label="Nazwisko"
                value={form.last_name}
                onChange={(v) => setForm({ ...form, last_name: v })}
              />
              <Field label="E-mail" value={form.email} onChange={() => {}} disabled />
              <Field
                label="Telefon"
                placeholder="+48 500 000 000"
                value={form.phone}
                onChange={(v) => setForm({ ...form, phone: v })}
              />
            </div>

            <div className="flex justify-end">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-white text-slate-900 hover:bg-white/90"
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Zapisz zmiany
              </Button>
            </div>
          </div>
        )}
      </FancyShell>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wider text-white/70">
        {label}
      </Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="border-white/15 bg-white/10 text-white placeholder:text-white/40 focus-visible:ring-white/30 disabled:opacity-60"
      />
    </div>
  );
}
