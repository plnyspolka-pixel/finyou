import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/labels";

export const Route = createFileRoute("/klient/dokumenty")({
  component: KlientDokumenty,
});

function KlientDokumenty() {
  const { user } = useAuth();
  const [loanId, setLoanId] = useState<string | null>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!user) return;
    const { data: c } = await supabase.from("clients").select("id").eq("user_id", user.id).maybeSingle();
    if (!c) return;
    const { data: l } = await supabase.from("loan_applications").select("id").eq("client_id", c.id).order("created_at", { ascending: false }).maybeSingle();
    if (!l) return;
    setLoanId(l.id);
    const { data: ds } = await supabase.from("documents").select("*").eq("loan_application_id", l.id).order("created_at", { ascending: false });
    setDocs(ds ?? []);
  };
  useEffect(() => { void load(); }, [user]);

  const upload = async (file: File) => {
    if (!loanId || !user) { toast.error("Najpierw utwórz wniosek"); return; }
    setUploading(true);
    const path = `${user.id}/${loanId}/${Date.now()}-${file.name}`;
    const { error: ue } = await supabase.storage.from("documents").upload(path, file);
    if (ue) { toast.error(ue.message); setUploading(false); return; }
    await supabase.from("documents").insert({ loan_application_id: loanId, file_name: file.name, file_path: path, document_type: "klient_upload", uploaded_by: user.id });
    setUploading(false); toast.success("Dodano"); void load();
  };

  const openDoc = async (d: any) => {
    if (!d.file_path) return;
    const { data } = await supabase.storage.from("documents").createSignedUrl(d.file_path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Dokumenty</h1>
      {!loanId ? <p className="text-sm text-muted-foreground">Najpierw rozpocznij wniosek.</p> :
        <>
          <Card><CardHeader><CardTitle>Dodaj plik</CardTitle></CardHeader>
            <CardContent><div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <Input ref={fileRef} type="file" />
              <Button disabled={uploading} onClick={() => { const f = fileRef.current?.files?.[0]; if (f) void upload(f); if (fileRef.current) fileRef.current.value = ""; }}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Wyślij"}
              </Button>
            </div></CardContent>
          </Card>
          <Card><CardHeader><CardTitle>Twoje dokumenty ({docs.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {docs.length === 0 ? <p className="text-sm text-muted-foreground">Brak.</p> : docs.map((d) => (
                <div key={d.id} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
                  <div><div className="font-medium">{d.file_name}</div><div className="text-xs text-muted-foreground">{formatDate(d.created_at)}</div></div>
                  <Button variant="ghost" size="sm" onClick={() => void openDoc(d)}>Otwórz</Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </>}
    </div>
  );
}
