import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { uploadFile, deleteStoragePath } from "@/lib/uploads/unified-upload";
import { CLIENT_FILES_BUCKET } from "@/lib/storage-buckets";
import { InvestorProposalCalculator } from "@/components/client/InvestorProposalCalculator";
import { MediaPreviewDialog } from "@/components/admin/MediaPreviewDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  Image as ImageIcon,
  File as FileIcon,
  Save,
  BookText,
  Check,
  FolderOpen,
  Eye,
  Eye as EyeIcon,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Loader2,
  Lock as LockIcon,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { FancyShell } from "@/components/landing/fancy-shell";
import { ClientProfileSections } from "@/components/client/ClientProfileSections";
import { InvestorDescriptionCard } from "@/components/client/InvestorDescriptionCard";
import { NumberTicker } from "@/components/ui/number-ticker";
import { SinglePageApplicationForm } from "@/components/landing/single-page-application-form";
import { MissingInfoVoiceAgent } from "@/components/client/missing-info-voice-agent";
import { evaluateApplicationCore, missingLabels } from "@/lib/application-completeness";

import { toast } from "sonner";

export const Route = createFileRoute("/klient/")({
  component: KlientDashboard,
});

function KlientDashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const { data: clientRow, isLoading: clientLoading } = useQuery({
    queryKey: ["client-row", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select(
          "id, user_id, nip, company_name, first_name, last_name, email, phone, bank_account_verified_at, phone_verified_at, bik_report_uploaded_at",
        )
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: Boolean(user),
  });

  const { data: loanRow, refetch: refetchLoan } = useQuery({
    queryKey: ["client-loan", clientRow?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("loan_applications")
        .select("id, view_count, loan_amount")
        .eq("client_id", clientRow!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: Boolean(clientRow?.id),
  });

  // Liczymy każde otwarcie strony przez właściciela wniosku jako "wyświetlenie".
  useEffect(() => {
    if (!loanRow?.id) return;
    const key = `viewed:own:${loanRow.id}:${new Date().toISOString().slice(0, 13)}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    void (async () => {
      try {
        await supabase.rpc("increment_loan_view", { _loan_id: loanRow.id });
        void refetchLoan();
      } catch {
        /* ignore */
      }
    })();
  }, [loanRow?.id, refetchLoan]);

  const { data: propertyRow, refetch: refetchProperty } = useQuery({
    queryKey: ["client-property", loanRow?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("properties")
        .select("id, land_register_number, photos, loan_application_id, property_type, area_sqm")
        .eq("loan_application_id", loanRow!.id)
        .maybeSingle();
      return data;
    },
    enabled: Boolean(loanRow?.id),
    placeholderData: keepPreviousData,
  });

  const { data: documentsList } = useQuery({
    queryKey: ["client-documents", loanRow?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("documents")
        .select("id, file_name, file_path, file_url, document_type, created_at")
        .eq("loan_application_id", loanRow!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: Boolean(loanRow?.id),
  });

  const photoPaths: string[] = Array.isArray((propertyRow as any)?.photos)
    ? ((propertyRow as any).photos as string[])
    : [];
  const docCount = documentsList?.length ?? 0;
  const totalFiles = photoPaths.length + docCount;

  const [previewOpen, setPreviewOpen] = useState(false);
  const [thumbs, setThumbs] = useState<{ url: string; path: string }[]>([]);
  const [kw, setKw] = useState("");
  const [extraKws, setExtraKws] = useState<string[]>([]);
  const [savingKw, setSavingKw] = useState(false);
  const [kwTouched, setKwTouched] = useState(false);
  const [area, setArea] = useState<string>("");
  const [savingArea, setSavingArea] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [forceUnlock, setForceUnlock] = useState(false);
  const [markingComplete, setMarkingComplete] = useState(false);
  const [filesOpen, setFilesOpen] = useState<boolean | null>(null);
  const [kwOpen, setKwOpen] = useState<boolean | null>(null);
  const qc = useQueryClient();

  const markApplicationComplete = async () => {
    if (!loanRow?.id) {
      toast.error("Najpierw rozpocznij wniosek");
      return;
    }
    // Wniosek trafia do inwestorów tylko z kompletem podstawowych danych —
    // ta sama definicja co w panelu admina (application-completeness.ts).
    const core = evaluateApplicationCore({
      loan_amount: loanRow?.loan_amount ?? null,
      client: clientRow,
      properties: [
        { land_register_number: propertyRow?.land_register_number ?? null, photos: photoPaths },
      ],
      docCount,
    });
    if (!core.complete) {
      toast.error("Wniosek nie jest jeszcze kompletny", {
        description: `Uzupełnij: ${missingLabels(core.missing).join(", ")}.`,
      });
      return;
    }
    setMarkingComplete(true);
    try {
      const { error } = await supabase
        .from("loan_applications")
        .update({
          status: "szukamy_inwestora",
          available_to_investors: true,
          completeness_percent: 100,
        })
        .eq("id", loanRow.id);
      if (error) throw error;
      setForceUnlock(true);
      toast.success("Wniosek oznaczony jako kompletny — kalkulator odblokowany");
      void qc.invalidateQueries({ queryKey: ["client-loan", clientRow?.id] });
      // płynne przewinięcie do kalkulatora
      setTimeout(() => {
        document
          .getElementById("calc-anchor")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } catch (e: any) {
      toast.error(e?.message ?? "Nie udało się zaktualizować statusu");
    } finally {
      setMarkingComplete(false);
    }
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!user?.id || !loanRow?.id) {
      toast.error("Najpierw wypełnij wniosek");
      return;
    }
    setUploading(true);
    const t = toast.loading(`Wysyłam ${files.length} plik(ów)…`);
    try {
      const newPhotoPaths: string[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 20 * 1024 * 1024) {
          toast.error(`${file.name}: za duży (max 20 MB)`);
          continue;
        }
        const isImage = (file.type || "").startsWith("image/");
        try {
          if (isImage) {
            const res = await uploadFile(file, { context: "property", applicationId: loanRow.id });
            newPhotoPaths.push(res.path);
          } else {
            const res = await uploadFile(file, {
              context: "document",
              applicationId: loanRow.id,
              docType: "property_doc",
            });
            await supabase.from("documents").insert({
              loan_application_id: loanRow.id,
              document_type: "property_doc",
              file_name: file.name,
              file_path: res.path,
              uploaded_by: user.id,
            });
          }
        } catch (e: any) {
          toast.error(`${file.name}: ${e?.message ?? "błąd uploadu"}`);
        }
      }
      if (newPhotoPaths.length > 0) {
        if (propertyRow?.id) {
          const next = [...photoPaths, ...newPhotoPaths];
          await supabase.from("properties").update({ photos: next }).eq("id", propertyRow.id);
        } else {
          await supabase.from("properties").insert({
            loan_application_id: loanRow.id,
            photos: newPhotoPaths,
            property_type: "inna",
          });
        }
      }
      toast.success("Wgrano", { id: t });
      void refetchProperty();
      void qc.invalidateQueries({ queryKey: ["client-documents", loanRow.id] });
    } catch (e: any) {
      toast.error(e?.message ?? "Błąd", { id: t });
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    setKw(String((propertyRow as any)?.land_register_number ?? ""));
    const extras = (propertyRow as any)?.additional_land_register_numbers;
    setExtraKws(Array.isArray(extras) ? extras.map(String) : []);
    setKwTouched(false);
    const a = (propertyRow as any)?.area_sqm;
    setArea(a == null ? "" : String(a));
  }, [propertyRow?.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (photoPaths.length === 0) {
        setThumbs([]);
        return;
      }
      const slice = photoPaths.slice(0, 6);
      const { data } = await supabase.storage
        .from(CLIENT_FILES_BUCKET)
        .createSignedUrls(slice, 60 * 60);
      if (!cancelled && data) {
        setThumbs(
          data.map((d, i) => ({ url: d.signedUrl ?? "", path: slice[i] })).filter((t) => t.url),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [photoPaths.join("|")]);

  const deletePhoto = async (path: string) => {
    if (!propertyRow?.id) return;
    if (!confirm("Usunąć to zdjęcie? Tej operacji nie można cofnąć.")) return;
    try {
      await deleteStoragePath(path);
      const next = photoPaths.filter((p) => p !== path);
      const { error } = await supabase
        .from("properties")
        .update({ photos: next })
        .eq("id", propertyRow.id);
      if (error) throw error;
      toast.success("Zdjęcie usunięte");
      void refetchProperty();
    } catch (e: any) {
      toast.error(e?.message ?? "Nie udało się usunąć zdjęcia");
    }
  };

  const deleteDocument = async (doc: {
    id: string;
    file_path?: string | null;
    file_name?: string | null;
  }) => {
    if (!confirm(`Usunąć dokument „${doc.file_name ?? ""}"? Tej operacji nie można cofnąć.`))
      return;
    try {
      if (doc.file_path) {
        await deleteStoragePath(doc.file_path);
      }
      const { error } = await supabase.from("documents").delete().eq("id", doc.id);
      if (error) throw error;
      toast.success("Dokument usunięty");
      void qc.invalidateQueries({ queryKey: ["client-documents", loanRow?.id] });
    } catch (e: any) {
      toast.error(e?.message ?? "Nie udało się usunąć dokumentu");
    }
  };

  // Walidacja numeru KW: 4 znaki kodu sądu / 8 cyfr / 1 cyfra kontrolna
  // np. WA1M/00123456/7
  const validateKw = (raw: string): { ok: boolean; error: string | null; hint: string | null } => {
    const value = raw.trim().toUpperCase();
    if (!value) return { ok: false, error: "Wpisz numer księgi wieczystej.", hint: null };

    const parts = value.split("/");
    if (parts.length !== 3) {
      return {
        ok: false,
        error: "Numer KW musi mieć trzy części oddzielone ukośnikami „/”.",
        hint: "Przykład: WA1M/00123456/7",
      };
    }
    const [court, digits, control] = parts;

    if (court.length !== 4) {
      return {
        ok: false,
        error: `Kod sądu musi mieć dokładnie 4 znaki (wpisano ${court.length}).`,
        hint: "np. WA1M",
      };
    }
    if (!/^[A-Z0-9]{4}$/.test(court)) {
      return {
        ok: false,
        error: "Kod sądu może zawierać tylko litery i cyfry (bez polskich znaków).",
        hint: "np. WA1M, GD1G, KR2K",
      };
    }
    if (digits.length !== 8) {
      return {
        ok: false,
        error: `Numer księgi musi mieć dokładnie 8 cyfr (wpisano ${digits.length}).`,
        hint: "Uzupełnij zerami z przodu, np. 00123456",
      };
    }
    if (!/^\d{8}$/.test(digits)) {
      return { ok: false, error: "Numer księgi może zawierać tylko cyfry (0–9).", hint: null };
    }
    if (control.length !== 1) {
      return {
        ok: false,
        error: "Cyfra kontrolna musi być dokładnie jedna.",
        hint: "Ostatnia cyfra z odpisu KW (0–9).",
      };
    }
    if (!/^\d$/.test(control)) {
      return { ok: false, error: "Cyfra kontrolna musi być cyfrą (0–9).", hint: null };
    }
    return { ok: true, error: null, hint: null };
  };

  const kwValidation = validateKw(kw);
  const extraValidations = extraKws.map((v) => validateKw(v));
  const allKwValid = kwValidation.ok && extraValidations.every((v) => v.ok);
  const showKwError = kwTouched && !kwValidation.ok && kw.trim().length > 0;

  const saveKw = async () => {
    if (!propertyRow?.id) return;
    setKwTouched(true);
    if (!allKwValid) {
      toast.error(kwValidation.error ?? "Nieprawidłowy numer KW");
      return;
    }
    setSavingKw(true);
    try {
      const normalized = kw.trim().toUpperCase();
      const normalizedExtras = extraKws.map((v) => v.trim().toUpperCase()).filter(Boolean);
      const { error } = await supabase
        .from("properties")
        .update({
          land_register_number: normalized,
          additional_land_register_numbers: normalizedExtras,
        } as any)
        .eq("id", propertyRow.id);
      if (error) throw error;
      setKw(normalized);
      setExtraKws(normalizedExtras);
      toast.success(
        normalizedExtras.length > 0
          ? `Zapisano ${1 + normalizedExtras.length} numery KW`
          : "Numer KW zapisany poprawnie",
      );
      void refetchProperty();
    } catch (e: any) {
      toast.error(e?.message ?? "Nie udało się zapisać numeru KW");
    } finally {
      setSavingKw(false);
    }
  };

  const saveArea = async () => {
    if (!propertyRow?.id) return;
    const normalized = area.replace(",", ".").trim();
    const value = normalized === "" ? null : Number(normalized);
    if (value !== null && (!Number.isFinite(value) || value <= 0 || value > 100000)) {
      toast.error("Podaj poprawną powierzchnię w m² (np. 78,5)");
      return;
    }
    setSavingArea(true);
    try {
      const { error } = await supabase
        .from("properties")
        .update({ area_sqm: value })
        .eq("id", propertyRow.id);
      if (error) throw error;
      toast.success(value == null ? "Powierzchnia wyczyszczona" : "Powierzchnia zapisana");
      void refetchProperty();
    } catch (e: any) {
      toast.error(e?.message ?? "Nie udało się zapisać powierzchni");
    } finally {
      setSavingArea(false);
    }
  };

  if (authLoading || clientLoading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <Skeleton className="h-56 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!clientRow) {
    return (
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Witaj!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Nie masz jeszcze profilu. Uzupełnij dane, żeby rozpocząć wniosek.
          </p>
          <Button onClick={() => navigate({ to: "/klient/profil" })}>Uzupełnij profil</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {loanRow?.id && <MissingInfoVoiceAgent />}
      {!loanRow?.id && (
        <SinglePageApplicationForm
          prefilledContact={{
            firstName:
              (clientRow as any)?.first_name ?? (user?.user_metadata as any)?.first_name ?? "",
            lastName:
              (clientRow as any)?.last_name ?? (user?.user_metadata as any)?.last_name ?? "",
            phone: (clientRow as any)?.phone ?? "",
            email: (clientRow as any)?.email ?? user?.email ?? "",
          }}
        />
      )}

      {loanRow?.id &&
        (() => {
          const _noop = null;
          const propertyType = String((propertyRow as any)?.property_type ?? "") as
            | "mieszkanie"
            | "dom"
            | "grunt_rolny"
            | "dzialka_budowlana"
            | "lokal_uslugowy"
            | "inna"
            | "";

          const HINTS: Record<string, { title: string; items: string[] }> = {
            mieszkanie: {
              title: "Co przygotować przy mieszkaniu",
              items: ["Zdjęcia każdego pomieszczenia", "Zdjęcia budynku z zewnątrz"],
            },
            dom: {
              title: "Co przygotować przy domu",
              items: [
                "Zdjęcia całego budynku z zewnątrz",
                "Zdjęcia każdego pomieszczenia (bez piwnicy i strychu)",
                "Powierzchnia użytkowa",
              ],
            },
            grunt_rolny: {
              title: "Co przygotować przy gruncie rolnym",
              items: ["Wypis z rejestru gruntów"],
            },
            dzialka_budowlana: {
              title: "Co przygotować przy działce budowlanej",
              items: ["MPZP albo warunki zabudowy"],
            },
            lokal_uslugowy: {
              title: "Co przygotować przy lokalu użytkowym / usługowym",
              items: [
                "Zdjęcia każdego pomieszczenia",
                "Zdjęcia z zewnątrz",
                "Powierzchnia użytkowa (jeżeli lokal nie jest w bloku)",
              ],
            },
            inna: {
              title: "Co przygotować",
              items: [
                "Zdjęcia nieruchomości z różnych ujęć",
                "Dokumenty potwierdzające własność",
                "Wszystko, co pomoże inwestorowi ocenić wartość",
              ],
            },
          };
          const hint = propertyType ? HINTS[propertyType] : null;

          const lockReason = forceUnlock
            ? null
            : !loanRow?.id
              ? null
              : !kwValidation.ok
                ? "Aby odblokować kalkulator, wpisz numer księgi wieczystej (sekcja powyżej)."
                : null;

          const filesSlot = loanRow?.id ? (
            <div className="space-y-4">
              <div className="grid items-stretch gap-0 lg:grid-cols-2 lg:gap-0">
                {/* === Twoje pliki === */}
                <FancyShell motion={false} className="h-full" innerClassName="h-full flex flex-col">
                  {(() => {
                    const isComplete = totalFiles > 0;
                    const open = filesOpen ?? !isComplete;
                    return (
                      <div className="space-y-4">
                        <button
                          type="button"
                          onClick={() => setFilesOpen(!open)}
                          className="flex w-full items-center gap-2.5 text-left"
                        >
                          <span className="grid h-9 w-9 place-items-center rounded-full bg-white/20 ring-1 ring-white/30 backdrop-blur-sm">
                            <FolderOpen className="h-5 w-5" strokeWidth={2.5} />
                          </span>
                          <div className="min-w-0 flex-1 leading-tight drop-shadow-[0_1px_8px_oklch(0.15_0.05_265/0.8)]">
                            <div className="text-base font-bold uppercase tracking-[0.18em] sm:text-lg">
                              Twoje pliki
                            </div>
                            <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-white/65">
                              Zdjęcia, dokumenty, wyciągi — wszystko w jednym miejscu
                            </div>
                          </div>
                          {isComplete && (
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-500/30 ring-1 ring-emerald-300/50">
                              <Check className="h-3.5 w-3.5 text-emerald-100" strokeWidth={3} />
                            </span>
                          )}
                          <Badge className="border-white/30 bg-white/15 font-bold text-white backdrop-blur-sm">
                            {totalFiles}
                          </Badge>
                          {isComplete &&
                            (open ? (
                              <ChevronUp className="h-5 w-5 shrink-0 text-white/80" />
                            ) : (
                              <ChevronDown className="h-5 w-5 shrink-0 text-white/80" />
                            ))}
                        </button>
                        {open && (
                          <>
                            {thumbs.length > 0 && (
                              <div className="grid grid-cols-3 gap-2">
                                {thumbs.map((t, i) => (
                                  <div
                                    key={i}
                                    className="group relative aspect-square overflow-hidden rounded-xl border border-white/25 bg-white/10 ring-1 ring-white/10"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => setPreviewOpen(true)}
                                      className="absolute inset-0 transition hover:ring-2 hover:ring-white/60"
                                      aria-label="Podgląd zdjęcia"
                                    >
                                      <img
                                        src={t.url}
                                        alt=""
                                        loading="lazy"
                                        className="h-full w-full object-cover transition group-hover:scale-105"
                                      />
                                      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void deletePhoto(t.path);
                                      }}
                                      aria-label="Usuń zdjęcie"
                                      className="absolute right-1.5 top-1.5 z-10 grid h-8 w-8 place-items-center rounded-full bg-rose-500/95 text-white ring-1 ring-white/60 shadow-lg backdrop-blur-sm transition hover:bg-rose-600 active:scale-95"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {hint && (
                              <div className="rounded-2xl border border-white/25 bg-white/10 p-3 backdrop-blur-sm">
                                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-white/85">
                                  {hint.title}
                                </div>
                                <ul className="space-y-1 text-xs text-white/85">
                                  {hint.items.map((it, i) => (
                                    <li key={i} className="flex items-start gap-2">
                                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
                                      <span>{it}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {(propertyType === "dom" || propertyType === "lokal_uslugowy") && (
                              <div className="rounded-2xl border border-white/25 bg-white/10 p-3 backdrop-blur-sm">
                                <label
                                  htmlFor="area_sqm"
                                  className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-white/85"
                                >
                                  Powierzchnia użytkowa (m²)
                                </label>
                                <div className="flex gap-2">
                                  <div className="relative flex-1">
                                    <Input
                                      id="area_sqm"
                                      inputMode="decimal"
                                      value={area}
                                      onChange={(e) =>
                                        setArea(e.target.value.replace(/[^0-9.,]/g, ""))
                                      }
                                      placeholder="np. 78,5"
                                      className="h-11 rounded-xl border-2 border-white/30 bg-white/10 pr-12 text-base font-semibold tabular-nums text-white placeholder:text-white/40 shadow-inner backdrop-blur-sm focus-visible:border-white/70 focus-visible:ring-2 focus-visible:ring-white/40"
                                    />
                                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold uppercase tracking-wider text-white/70">
                                      m²
                                    </span>
                                  </div>
                                  <Button
                                    type="button"
                                    onClick={() => void saveArea()}
                                    disabled={savingArea || !propertyRow?.id}
                                    className="h-11 rounded-xl bg-white/15 px-4 text-xs font-bold uppercase tracking-[0.12em] text-white ring-1 ring-white/30 backdrop-blur-sm hover:bg-white/25 disabled:opacity-50"
                                  >
                                    {savingArea ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <>
                                        <Save className="mr-1.5 h-4 w-4" />
                                        Zapisz
                                      </>
                                    )}
                                  </Button>
                                </div>
                                {propertyType === "lokal_uslugowy" && (
                                  <p className="mt-1.5 text-[10px] text-white/65">
                                    Wymagana, jeżeli lokal nie znajduje się w bloku.
                                  </p>
                                )}
                              </div>
                            )}

                            <label className="block">
                              <input
                                type="file"
                                multiple
                                accept="image/*,application/pdf"
                                className="hidden"
                                onChange={(e) => {
                                  const fs = e.target.files;
                                  e.target.value = "";
                                  void uploadFiles(fs);
                                }}
                              />
                              <span
                                role="button"
                                tabIndex={0}
                                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-white/40 bg-white/10 px-4 py-4 text-sm font-bold uppercase tracking-[0.14em] text-white backdrop-blur-sm transition hover:border-white/70 hover:bg-white/20"
                              >
                                {uploading ? (
                                  <>
                                    <Loader2 className="h-5 w-5 animate-spin" /> Wysyłam…
                                  </>
                                ) : (
                                  <>
                                    <Upload className="h-5 w-5" /> Dograj zdjęcia / dokumenty
                                  </>
                                )}
                              </span>
                            </label>

                            {totalFiles === 0 ? (
                              <div className="rounded-2xl border border-dashed border-white/25 bg-white/5 px-4 py-4 text-center text-xs text-white/75">
                                Wybierz typ nieruchomości powyżej — podpowiemy, co dograć.
                              </div>
                            ) : (
                              <></>
                            )}
                            {totalFiles > 0 && (
                              <>
                                {docCount > 0 && (
                                  <ul className="space-y-1.5">
                                    {documentsList!.map((d) => (
                                      <li
                                        key={d.id}
                                        className="flex items-center gap-2.5 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm backdrop-blur-sm transition hover:bg-white/15"
                                      >
                                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/20 ring-1 ring-white/30">
                                          <FileText className="h-3.5 w-3.5" />
                                        </span>
                                        <span className="flex-1 truncate font-medium text-white">
                                          {d.file_name}
                                        </span>
                                        {d.document_type && (
                                          <Badge className="border-white/30 bg-white/10 text-[10px] font-medium uppercase tracking-wider text-white/90">
                                            {d.document_type}
                                          </Badge>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => void deleteDocument(d)}
                                          aria-label="Usuń dokument"
                                          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-rose-500/80 text-white ring-1 ring-white/30 transition hover:bg-rose-600"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                )}

                                <div className="flex items-center justify-between gap-3 pt-1">
                                  <div className="flex gap-3 text-[11px] text-white/75">
                                    <span className="inline-flex items-center gap-1">
                                      <ImageIcon className="h-3 w-3" /> {totalFiles} plików
                                    </span>
                                  </div>
                                  <Button
                                    size="sm"
                                    onClick={() => setPreviewOpen(true)}
                                    className="rounded-xl bg-white/20 font-semibold uppercase tracking-[0.12em] text-white ring-1 ring-white/30 backdrop-blur-sm hover:bg-white/30"
                                  >
                                    <Eye className="mr-1.5 h-4 w-4" /> Podgląd
                                  </Button>
                                </div>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()}
                </FancyShell>

                {/* === Numer KW === */}
                <FancyShell motion={false} className="h-full" innerClassName="h-full flex flex-col">
                  {(() => {
                    const isComplete = kwValidation.ok;
                    const open = kwOpen ?? !isComplete;
                    return (
                      <div className="space-y-4">
                        <button
                          type="button"
                          onClick={() => setKwOpen(!open)}
                          className="flex w-full items-center gap-2.5 text-left"
                        >
                          <span className="grid h-9 w-9 place-items-center rounded-full bg-white/20 ring-1 ring-white/30 backdrop-blur-sm">
                            <BookText className="h-5 w-5" strokeWidth={2.5} />
                          </span>
                          <div className="min-w-0 flex-1 leading-tight drop-shadow-[0_1px_8px_oklch(0.15_0.05_265/0.8)]">
                            <div className="text-base font-bold uppercase tracking-[0.18em] sm:text-lg">
                              Numer księgi wieczystej
                            </div>
                            <div className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-[0.12em] text-white/65">
                              {isComplete ? kw : "Wpisz numer KW swojej nieruchomości"}
                            </div>
                          </div>
                          {isComplete && (
                            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-500/30 ring-1 ring-emerald-300/50">
                              <Check className="h-3.5 w-3.5 text-emerald-100" strokeWidth={3} />
                            </span>
                          )}
                          {isComplete &&
                            (open ? (
                              <ChevronUp className="h-5 w-5 shrink-0 text-white/80" />
                            ) : (
                              <ChevronDown className="h-5 w-5 shrink-0 text-white/80" />
                            ))}
                        </button>
                        {open && (
                          <>
                            <div className="relative">
                              <Input
                                id="kw"
                                value={kw}
                                onChange={(e) => setKw(e.target.value.toUpperCase())}
                                onBlur={() => setKwTouched(true)}
                                placeholder="np. WA1M/00123456/7"
                                aria-invalid={showKwError || undefined}
                                aria-describedby="kw-help"
                                className={`h-14 rounded-2xl border-2 bg-white/10 pl-12 pr-12 text-lg font-bold tracking-wider tabular-nums text-white placeholder:text-white/40 shadow-inner backdrop-blur-sm focus-visible:ring-2 ${
                                  showKwError
                                    ? "border-rose-400/70 focus-visible:border-rose-300 focus-visible:ring-rose-300/40"
                                    : "border-white/30 focus-visible:border-white/70 focus-visible:ring-white/40"
                                }`}
                              />
                              <BookText
                                className={`pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 ${showKwError ? "text-rose-300" : "text-white/80"}`}
                              />
                              {kwValidation.ok && (
                                <span className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-white/25 ring-1 ring-white/40 shadow backdrop-blur-sm">
                                  <Check className="h-4 w-4" strokeWidth={3} />
                                </span>
                              )}
                              {showKwError && (
                                <span className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-rose-500/90 text-white shadow ring-1 ring-rose-300/60">
                                  <span className="text-sm font-black leading-none">!</span>
                                </span>
                              )}
                            </div>

                            {showKwError ? (
                              <div
                                id="kw-help"
                                role="alert"
                                className="rounded-xl border border-rose-300/40 bg-rose-500/15 px-3 py-2 text-xs text-rose-50 backdrop-blur-sm"
                              >
                                <p className="font-semibold">{kwValidation.error}</p>
                                {kwValidation.hint && (
                                  <p className="mt-0.5 text-rose-100/85">{kwValidation.hint}</p>
                                )}
                              </div>
                            ) : (
                              <p id="kw-help" className="text-[11px] text-white/70">
                                Format: 4 znaki sądu / 8 cyfr / cyfra kontrolna (np.{" "}
                                <span className="font-mono font-semibold text-white/90">
                                  WA1M/00123456/7
                                </span>
                                ).
                              </p>
                            )}

                            {extraKws.length > 0 && (
                              <div className="space-y-2">
                                {extraKws.map((val, idx) => {
                                  const v = extraValidations[idx];
                                  return (
                                    <div key={idx} className="relative">
                                      <Input
                                        value={val}
                                        onChange={(e) => {
                                          const next = [...extraKws];
                                          next[idx] = e.target.value.toUpperCase();
                                          setExtraKws(next);
                                        }}
                                        placeholder={`Dodatkowy KW #${idx + 2}`}
                                        className={`h-14 rounded-2xl border-2 bg-white/10 pl-12 pr-20 text-lg font-bold tracking-wider tabular-nums text-white placeholder:text-white/40 shadow-inner backdrop-blur-sm focus-visible:ring-2 ${
                                          !v.ok && val.trim().length > 0
                                            ? "border-rose-400/70 focus-visible:border-rose-300 focus-visible:ring-rose-300/40"
                                            : "border-white/30 focus-visible:border-white/70 focus-visible:ring-white/40"
                                        }`}
                                      />
                                      <BookText className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-white/80" />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setExtraKws(extraKws.filter((_, i) => i !== idx))
                                        }
                                        aria-label="Usuń numer KW"
                                        className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl bg-rose-500/80 text-white ring-1 ring-white/30 transition hover:bg-rose-600"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setExtraKws([...extraKws, ""])}
                              className="w-full rounded-2xl border-2 border-dashed border-white/30 bg-white/5 font-bold uppercase tracking-[0.12em] text-white hover:bg-white/15"
                            >
                              + Dodaj kolejny numer KW
                            </Button>

                            <Button
                              size="lg"
                              onClick={() => void saveKw()}
                              disabled={savingKw || !propertyRow?.id || !allKwValid}
                              className="w-full rounded-2xl bg-white/15 text-base font-bold uppercase tracking-[0.14em] text-white ring-1 ring-white/30 backdrop-blur-sm shadow-[0_10px_30px_-10px_oklch(0.15_0.05_265/0.7)] hover:bg-white/25 disabled:opacity-50"
                            >
                              <Save className="mr-2 h-5 w-5" />
                              {savingKw
                                ? "Zapisywanie..."
                                : extraKws.length > 0
                                  ? `Zapisz ${1 + extraKws.length} numery KW`
                                  : "Zapisz numer KW"}
                            </Button>
                          </>
                        )}
                      </div>
                    );
                  })()}
                </FancyShell>
              </div>
            </div>
          ) : null;

          return (
            <>
              <div id="calc-anchor" />
              <InvestorProposalCalculator lockReason={lockReason} filesSlot={filesSlot} />
            </>
          );
        })()}

      {/* === Weryfikacje — tafelki rozwijane (odblokowane po wgraniu plików i KW) === */}
      {totalFiles > 0 && kwValidation.ok ? (
        <VerificationTilesSection clientRow={clientRow as any} loanId={loanRow?.id ?? null} />
      ) : loanRow?.id ? (
        <div className="rounded-2xl border border-white/10 bg-slate-800/40 p-5 text-center opacity-60 grayscale">
          <div className="flex items-center justify-center gap-3 text-slate-300">
            <LockIcon className="h-5 w-5 text-slate-400" />
            <span className="text-sm font-bold uppercase tracking-[0.14em]">
              Dodaj zdjęcia/dokumenty i wpisz numer KW, aby odblokować pozostałe sekcje
            </span>
          </div>
        </div>
      ) : null}

      {loanRow?.id && (
        <MediaPreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          loanApplicationId={loanRow.id}
          photoPaths={photoPaths}
          title="Twoje zdjęcia i dokumenty"
        />
      )}
    </div>
  );
}

type TileKey = "description" | "phone" | "company" | "bank" | "bik" | "income";

export function VerificationTilesSection({
  clientRow,
  loanId,
}: {
  clientRow: any;
  loanId: string | null;
}) {
  const [step, setStep] = useState<number>(1);

  const { data: loanDesc } = useQuery({
    queryKey: ["client-loan-desc", loanId],
    queryFn: async () => {
      const { data } = await supabase
        .from("loan_applications")
        .select("investor_description")
        .eq("id", loanId!)
        .maybeSingle();
      return data?.investor_description ?? "";
    },
    enabled: Boolean(loanId),
  });

  const { data: docCounts } = useQuery({
    queryKey: ["client-doc-counts", loanId],
    queryFn: async () => {
      const { data } = await supabase
        .from("documents")
        .select("document_type")
        .eq("loan_application_id", loanId!);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((d: any) => {
        counts[d.document_type] = (counts[d.document_type] ?? 0) + 1;
      });
      return counts;
    },
    enabled: Boolean(loanId),
  });

  const incomeDone = (docCounts?.income_docs ?? 0) > 0;
  const companyDone = Boolean(clientRow?.nip && clientRow?.company_name);
  const bankDone = Boolean(clientRow?.bank_account_verified_at);
  const phoneDone = Boolean(clientRow?.phone_verified_at);
  const bikDone = Boolean(clientRow?.bik_report_uploaded_at);
  const descDone = String(loanDesc ?? "").trim().length >= 20;

  const steps: Array<{
    id: number;
    key: TileKey;
    label: string;
    sub: string;
    done: boolean;
    icon: React.ReactNode;
  }> = [
    {
      id: 1,
      key: "description",
      label: "Opis dla inwestora",
      sub: "2–5 zdań — wzbudza zaufanie",
      done: descDone,
      icon: <BookText className="h-5 w-5" />,
    },
    {
      id: 2,
      key: "phone",
      label: "Numer telefonu",
      sub: "Potwierdzenie kodem SMS",
      done: phoneDone,
      icon: <ShieldCheck className="h-5 w-5" />,
    },
    {
      id: 3,
      key: "company",
      label: "Dane firmy",
      sub: "NIP, REGON, KRS z GUS",
      done: companyDone,
      icon: <FileText className="h-5 w-5" />,
    },
    {
      id: 4,
      key: "bank",
      label: "Konto bankowe",
      sub: "Weryfikacja dokumentem",
      done: bankDone,
      icon: <ShieldCheck className="h-5 w-5" />,
    },
    {
      id: 5,
      key: "bik",
      label: "Raport BIK",
      sub: "Aktualny raport o sobie",
      done: bikDone,
      icon: <FileText className="h-5 w-5" />,
    },
    {
      id: 6,
      key: "income",
      label: "Dokumenty dochodowe",
      sub: "PIT, zaświadczenia, wyciągi",
      done: incomeDone,
      icon: <FileText className="h-5 w-5" />,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const discount = doneCount * 0.5;
  const totalSteps = steps.length;
  const goNext = () => setStep((s) => Math.min(totalSteps, s + 1));
  const goBack = () => setStep((s) => Math.max(1, s - 1));
  const current = steps.find((s) => s.id === step)!;

  return (
    <section className="space-y-4">
      {/* Fancy navy header + 6-step stepper */}
      <FancyShell variant="navy" motion={false}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 ring-1 ring-white/25 backdrop-blur-sm">
                <Sparkles className="h-5 w-5 text-white" strokeWidth={2.5} />
              </span>
              <div className="leading-tight">
                <div className="text-base font-black uppercase tracking-[0.16em] text-white sm:text-lg">
                  Zwiększ szanse na niższe koszty pożyczki
                </div>
                <div className="mt-1 text-xs text-white/75 sm:text-sm">
                  Każda weryfikacja pozwala Ci ubiegać się o niższe koszty w naszym kalkulatorze.
                  Ostateczne warunki ustala inwestor.
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-black tabular-nums text-emerald-300 drop-shadow-[0_2px_8px_rgba(16,185,129,0.45)]">
                {doneCount}/{totalSteps}
              </div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-white/65">
                weryfikacji ukończonych
              </div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.6)] transition-all duration-500"
              style={{ width: `${(doneCount / totalSteps) * 100}%` }}
            />
          </div>

          {/* Stepper — 6 kroków, jednolita wysokość i wyrównanie */}
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
            {steps.map((s) => {
              const active = step === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStep(s.id)}
                  className={`group relative flex h-full min-h-[112px] flex-col items-center justify-start gap-2 overflow-hidden rounded-2xl border p-3 text-center transition-all ${
                    active
                      ? "border-white/50 bg-white/15 shadow-[0_10px_30px_-12px_rgba(255,255,255,0.45)] ring-2 ring-white/40"
                      : s.done
                        ? "border-emerald-400/40 bg-emerald-500/10 hover:bg-emerald-500/15"
                        : "border-white/15 bg-white/[0.04] hover:border-white/30 hover:bg-white/[0.08]"
                  }`}
                >
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black ring-1 ${
                      s.done
                        ? "bg-emerald-500/30 text-emerald-200 ring-emerald-300/40"
                        : active
                          ? "bg-white text-slate-900 ring-white/60"
                          : "bg-white/10 text-white/80 ring-white/20"
                    }`}
                  >
                    {s.done ? <Check className="h-4 w-4" strokeWidth={3} /> : s.id}
                  </span>
                  <div className="flex w-full flex-1 flex-col items-center justify-center leading-tight">
                    <div className="line-clamp-2 text-[11px] font-black uppercase tracking-wider text-white">
                      {s.label}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-[10px] text-white/65">{s.sub}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </FancyShell>

      {/* Aktualny krok — fancy navy panel z gradientem na nagłówku */}
      <div key={step} className="animate-fade-in">
        <FancyShell variant="navy" motion={false} innerClassName="!p-0">
          {/* Fancy header paska kroku */}
          <div className="relative overflow-hidden rounded-t-[1.4rem] border-b border-white/10 bg-gradient-to-r from-white/[0.08] via-white/[0.04] to-transparent px-5 py-4">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.12),transparent_60%)]" />
            <div className="relative flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ring-1 ${
                    current.done
                      ? "bg-emerald-500/25 text-emerald-200 ring-emerald-300/40"
                      : "bg-white/10 text-white ring-white/25"
                  }`}
                >
                  {current.done ? <Check className="h-5 w-5" strokeWidth={3} /> : current.icon}
                </span>
                <div className="min-w-0 leading-tight">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/60">
                    Krok {current.id} z {totalSteps}
                  </div>
                  <div className="truncate text-base font-black uppercase tracking-wider text-white sm:text-lg">
                    {current.label}
                  </div>
                </div>
              </div>
              {current.done ? (
                <Badge className="shrink-0 border-emerald-400/40 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/25">
                  <Check className="mr-1 h-3 w-3" /> Zweryfikowane
                </Badge>
              ) : (
                <Badge className="shrink-0 border-amber-400/40 bg-amber-500/20 font-bold text-amber-200 hover:bg-amber-500/25">
                  Do uzupełnienia
                </Badge>
              )}
            </div>
          </div>

          {/* Content kroku — białe wnętrze na ciemnym shellu */}
          <div className="p-3 sm:p-4">
            <div className="rounded-2xl bg-white/95 p-4 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.5)] backdrop-blur-sm sm:p-5">
              {current.key === "description" ? (
                <InvestorDescriptionCard loanId={loanId} initialText={String(loanDesc ?? "")} />
              ) : (
                <ClientProfileSections
                  showPasswordCard={false}
                  includePersonal={false}
                  sections={[current.key]}
                />
              )}
            </div>

            {/* Nawigacja */}
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button
                variant="ghost"
                size="lg"
                onClick={goBack}
                disabled={step === 1}
                className="rounded-2xl font-bold uppercase tracking-wider text-white/85 hover:bg-white/10 hover:text-white disabled:opacity-40"
              >
                ← Wstecz
              </Button>
              <Button
                size="lg"
                onClick={goNext}
                disabled={step === totalSteps}
                className="rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 text-base font-black uppercase tracking-wider text-white shadow-[0_10px_30px_-10px_rgba(16,185,129,0.6)] hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-50"
              >
                {step === totalSteps ? "Gotowe ✓" : "Dalej →"}
              </Button>
            </div>
          </div>
        </FancyShell>
      </div>
    </section>
  );
}
