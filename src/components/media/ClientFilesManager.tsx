import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FileThumb } from "@/components/media/FileThumb";
import { CLIENT_FILES_LABEL } from "@/lib/storage-buckets";
import { uploadFile, deleteStoragePath } from "@/lib/uploads/unified-upload";
import { uploadSummaryLabel } from "@/lib/uploads/file-dedup";
import { IMAGE_EXT, signStoragePath } from "@/lib/property-photos";
import { toDisplayableImageUrl } from "@/lib/heic-preview";
import { Image as ImageIcon, Upload, Trash2, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Wspólna sekcja plików klienta z uploadem i kasowaniem — dla operatora /
// pośrednika / admina, w widoku wniosku i leada. Sama ładuje dane (zdjęcia z
// properties.photos + wpisy z documents dla danego wniosku), więc jest drop-in
// wszędzie. Upload idzie do bucketu `pliki-klienta` (prefiks property/<appId>/…).

type FileEntry = {
  key: string;
  name: string;
  path: string | null;
  externalUrl: string | null;
  source:
    | { kind: "photo"; propertyId: string; path: string }
    | { kind: "doc"; id: string; path: string | null };
};

export function ClientFilesManager({
  loanApplicationId,
  canManage = true,
  onChanged,
}: {
  loanApplicationId: string | null | undefined;
  canManage?: boolean;
  onChanged?: () => void;
}) {
  const [property, setProperty] = useState<{ id: string; photos: string[] } | null>(null);
  const [docs, setDocs] = useState<
    Array<{
      id: string;
      file_name: string | null;
      file_path: string | null;
      file_url: string | null;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    if (!loanApplicationId) {
      setProperty(null);
      setDocs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: props }, { data: d }] = await Promise.all([
      supabase
        .from("properties")
        .select("id, photos")
        .eq("loan_application_id", loanApplicationId)
        .order("created_at", { ascending: true })
        .limit(1),
      supabase
        .from("documents")
        .select("id, file_name, file_path, file_url")
        .eq("loan_application_id", loanApplicationId)
        .order("created_at", { ascending: false }),
    ]);
    const p = (props as any)?.[0] ?? null;
    setProperty(
      p
        ? { id: p.id as string, photos: Array.isArray(p.photos) ? (p.photos as string[]) : [] }
        : null,
    );
    setDocs((d as any) ?? []);
    setLoading(false);
  }, [loanApplicationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const files = useMemo<FileEntry[]>(() => {
    const seen = new Set<string>();
    const out: FileEntry[] = [];
    (property?.photos ?? []).forEach((path, i) => {
      if (!path || seen.has(path)) return;
      seen.add(path);
      const external = /^https?:\/\//i.test(path);
      out.push({
        key: `photo:${i}`,
        name: path.split("/").pop() ?? `zdjęcie-${i + 1}`,
        path: external ? null : path,
        externalUrl: external ? path : null,
        source: { kind: "photo", propertyId: property!.id, path },
      });
    });
    docs.forEach((d) => {
      const src = d.file_path ?? d.file_url;
      if (!src || seen.has(src)) return;
      seen.add(src);
      const external = /^https?:\/\//i.test(src);
      out.push({
        key: `doc:${d.id}`,
        name: d.file_name ?? src.split("/").pop() ?? "plik",
        path: external ? null : src,
        externalUrl: external ? src : null,
        source: { kind: "doc", id: d.id, path: d.file_path ?? null },
      });
    });
    return out;
  }, [property, docs]);

  const openFile = async (f: FileEntry) => {
    const url = f.externalUrl ?? (f.path ? await signStoragePath(f.path, 3600) : null);
    if (!url) {
      toast.error("Nie udało się otworzyć pliku");
      return;
    }
    if (IMAGE_EXT.test(f.name) || IMAGE_EXT.test(f.path ?? ""))
      setLightbox(await toDisplayableImageUrl(url, f.name));
    else window.open(url, "_blank", "noopener");
  };

  const addFiles = async (list: FileList | null) => {
    if (!list || !list.length || !loanApplicationId) return;
    setUploading(true);
    try {
      // Dedup po treści: uploadFile przy identycznej binarce zwraca istniejącą
      // ścieżkę (deduped) — jeśli ta ścieżka już jest widoczna wśród plików
      // wniosku, pomijamy ją zamiast dublować wpis na liście.
      const known = new Set<string>();
      (property?.photos ?? []).forEach((p) => known.add(p));
      docs.forEach((d) => {
        if (d.file_path) known.add(d.file_path);
        if (d.file_url) known.add(d.file_url);
      });
      const paths: string[] = [];
      let skipped = 0;
      for (const file of Array.from(list)) {
        const res = await uploadFile(file, {
          context: "property",
          applicationId: loanApplicationId,
        });
        if (res.deduped && known.has(res.path)) {
          skipped++;
          continue;
        }
        known.add(res.path);
        paths.push(res.path);
      }
      if (paths.length) {
        if (property?.id) {
          const { error } = await supabase
            .from("properties")
            .update({ photos: [...property.photos, ...paths] } as any)
            .eq("id", property.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("properties").insert({
            loan_application_id: loanApplicationId,
            property_type: "inna",
            photos: paths,
          } as any);
          if (error) throw error;
        }
      }
      if (skipped > 0) toast.info(uploadSummaryLabel(paths.length, skipped));
      else toast.success(uploadSummaryLabel(paths.length, 0));
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error("Nie udało się wgrać plików", { description: e?.message ?? String(e) });
    } finally {
      setUploading(false);
    }
  };

  const toggleSel = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const selectAll = () => setSelected(new Set(files.map((f) => f.key)));
  const clearSel = () => setSelected(new Set());

  // Kasowanie wielu naraz: zdjęcia jednym UPDATE properties, dokumenty jednym
  // DELETE .in(id), a bloki ze Storage best-effort równolegle.
  const removeSelected = async () => {
    const chosen = files.filter((f) => selected.has(f.key));
    if (!chosen.length) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Usunąć ${chosen.length} plik(ów)? Tej operacji nie można cofnąć.`)
    )
      return;
    setBulkBusy(true);
    try {
      const photoPaths = chosen
        .filter((f) => f.source.kind === "photo")
        .map((f) => (f.source as { path: string }).path);
      const docIds = chosen
        .filter((f) => f.source.kind === "doc")
        .map((f) => (f.source as { id: string }).id);
      if (photoPaths.length && property?.id) {
        const next = (property.photos ?? []).filter((p) => !photoPaths.includes(p));
        const { error } = await supabase
          .from("properties")
          .update({ photos: next } as any)
          .eq("id", property.id);
        if (error) throw error;
      }
      if (docIds.length) {
        const { error } = await supabase.from("documents").delete().in("id", docIds);
        if (error) throw error;
      }
      const storagePaths = chosen
        .map((f) => f.path)
        .filter((p): p is string => !!p && !/^https?:\/\//i.test(p));
      await Promise.all(storagePaths.map((p) => deleteStoragePath(p)));
      toast.success(`Usunięto ${chosen.length} plik(ów)`);
      clearSel();
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error("Nie udało się usunąć plików", { description: e?.message ?? String(e) });
    } finally {
      setBulkBusy(false);
    }
  };

  const removeFile = async (f: FileEntry) => {
    if (!canManage) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Usunąć plik „${f.name}”? Tej operacji nie można cofnąć.`)
    )
      return;
    setBusyKey(f.key);
    try {
      if (f.source.kind === "photo") {
        const next = (property?.photos ?? []).filter((p) => p !== f.source.path);
        const { error } = await supabase
          .from("properties")
          .update({ photos: next } as any)
          .eq("id", f.source.propertyId);
        if (error) throw error;
        if (f.path) await deleteStoragePath(f.path);
      } else {
        const { error } = await supabase.from("documents").delete().eq("id", f.source.id);
        if (error) throw error;
        if (f.source.path) await deleteStoragePath(f.source.path);
      }
      toast.success("Plik usunięty");
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error("Nie udało się usunąć pliku", { description: e?.message ?? String(e) });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ImageIcon className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-bold">{CLIENT_FILES_LABEL}</div>
            <div className="text-xs text-muted-foreground">
              Kliknij, aby powiększyć lub otworzyć{canManage ? " · najedź, aby usunąć" : ""}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage &&
            files.length > 0 &&
            (selected.size > 0 ? (
              <>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void removeSelected()}
                  disabled={bulkBusy}
                >
                  {bulkBusy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                  )}
                  Usuń zaznaczone ({selected.size})
                </Button>
                <Button variant="ghost" size="sm" onClick={clearSel} disabled={bulkBusy}>
                  Odznacz
                </Button>
              </>
            ) : (
              <Button variant="ghost" size="sm" onClick={selectAll}>
                Zaznacz wszystkie
              </Button>
            ))}
          {canManage && loanApplicationId && (
            <Button variant="outline" size="sm" asChild disabled={uploading}>
              <label className="cursor-pointer">
                <Upload className="mr-2 h-4 w-4" />
                {uploading ? "Wgrywanie…" : "Dodaj pliki"}
                <input
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    void addFiles(e.target.files);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
            </Button>
          )}
          <Badge variant="outline" className="text-sm">
            {files.length}
          </Badge>
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Ładowanie…</div>
      ) : files.length === 0 ? (
        <div className="rounded-xl border border-dashed py-14 text-center text-sm text-muted-foreground">
          {canManage && !loanApplicationId
            ? "Lead nie ma jeszcze wniosku — pliki dodasz po jego utworzeniu."
            : `Brak plików.${canManage && loanApplicationId ? " Użyj „Dodaj pliki”, aby wgrać pliki klienta." : ""}`}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {files.map((f) => (
            <div
              key={f.key}
              className={cn(
                "group relative rounded-lg",
                selected.has(f.key) && "ring-2 ring-primary ring-offset-1",
              )}
            >
              {canManage && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSel(f.key);
                  }}
                  title="Zaznacz"
                  className={cn(
                    "absolute left-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded border transition",
                    selected.has(f.key)
                      ? "border-primary bg-primary text-white"
                      : "border-white/70 bg-black/50 text-transparent opacity-0 group-hover:opacity-100",
                  )}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              )}
              {f.path ? (
                <FileThumb
                  path={f.path}
                  name={f.name}
                  aspect="video"
                  showName
                  onClick={() => void openFile(f)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => void openFile(f)}
                  className="group relative block aspect-video w-full overflow-hidden rounded-lg border bg-muted transition hover:shadow-lg"
                >
                  <img
                    src={f.externalUrl ?? ""}
                    alt={f.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </button>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void removeFile(f);
                  }}
                  disabled={busyKey === f.key}
                  title="Usuń plik"
                  className="absolute right-1.5 top-1.5 z-10 rounded-md bg-black/60 p-1.5 text-white opacity-0 transition hover:bg-red-600 focus:opacity-100 group-hover:opacity-100 disabled:opacity-100"
                >
                  {busyKey === f.key ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-4xl">
          {lightbox && (
            <img
              src={lightbox}
              alt="Podgląd"
              className="max-h-[80vh] w-full rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ClientFilesManager;
