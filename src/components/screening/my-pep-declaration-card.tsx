// Karta oświadczenia PEP w panelu klienta / inwestora. Pokazuje datę
// ostatniego oświadczenia i pozwala złożyć nowe (np. po zmianie okoliczności).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PepDeclarationSection, type PepDeclarationDraft } from "./pep-declaration-section";
import { declarationError, emptyDeclaration } from "@/lib/screening/declaration";
import {
  getMyPepDeclaration,
  submitMyPepDeclaration,
} from "@/lib/screening/my-declaration.functions";

export function MyPepDeclarationCard({
  audience,
  onlyIfMissing = false,
  embedded = false,
}: {
  audience: "client" | "investor";
  onlyIfMissing?: boolean;
  embedded?: boolean;
}) {
  const qc = useQueryClient();
  const getFn = useServerFn(getMyPepDeclaration);
  const submitFn = useServerFn(submitMyPepDeclaration);
  const [draft, setDraft] = useState<PepDeclarationDraft>(emptyDeclaration);
  const [editing, setEditing] = useState(false);
  const q = useQuery({
    queryKey: ["my-pep-declaration", audience],
    queryFn: () => getFn({ data: { audience } }),
  });
  const mut = useMutation({
    mutationFn: () => submitFn({ data: { audience, declaration: draft as never } }),
    onSuccess: () => {
      toast.success("Oświadczenie PEP zapisane.");
      setEditing(false);
      setDraft(emptyDeclaration());
      void qc.invalidateQueries({ queryKey: ["my-pep-declaration", audience] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (q.isLoading || !q.data?.hasSubject) return null;
  const latest = q.data.latest;
  if (onlyIfMissing && latest) return null;

  const body = (
    <div className="space-y-3">
      {latest && !editing ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Oświadczenie złożone {new Date(latest.signed_at).toLocaleString("pl-PL")}
          </p>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Zmieniły się okoliczności — złóż nowe
          </Button>
        </div>
      ) : (
        <>
          {!latest && (
            <p className="flex items-center gap-2 text-sm text-amber-700">
              <ShieldAlert className="h-4 w-4" /> Wymagane oświadczenie o statusie PEP.
            </p>
          )}
          <PepDeclarationSection value={draft} onChange={setDraft} />
          <Button
            onClick={() => {
              const err = declarationError(draft);
              if (err) return toast.error(err);
              mut.mutate();
            }}
            disabled={mut.isPending}
          >
            {mut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Złóż oświadczenie
          </Button>
        </>
      )}
    </div>
  );

  if (embedded) return body;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Oświadczenie o statusie PEP</CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
