// Dwa przyciski otwierające ten sam podgląd klienta: pliki (zdjęcia
// nieruchomości + dokumenty wniosku) i historia komunikacji. Używane wszędzie
// tam, gdzie operator podejmuje decyzję o wniosku — lista wniosków,
// auto-dystrybucja, pytania instytucji — żeby nie trzeba było przeskakiwać na
// kartę wniosku.
import { useState } from "react";
import { Eye, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MediaPreviewDialog, type MediaDialogTab } from "@/components/admin/MediaPreviewDialog";

export function ClientFilesButton({
  loanApplicationId,
  clientId,
  photoPaths = [],
  title,
  size = "icon",
}: {
  loanApplicationId: string;
  clientId?: string | null;
  photoPaths?: string[];
  /** Nazwa w nagłówku okna — zwykle imię i nazwisko klienta. */
  title?: string;
  /** "icon" — dwie ikony (ciasne wiersze); "text" — przyciski z opisem. */
  size?: "icon" | "text";
}) {
  const [tab, setTab] = useState<MediaDialogTab | null>(null);

  const trigger = (target: MediaDialogTab, label: string, Icon: typeof Eye) => (
    <Button
      size="sm"
      variant="ghost"
      className={size === "icon" ? "h-8 w-8 p-0" : "h-8 px-2 text-xs"}
      onClick={() => setTab(target)}
      title={label}
    >
      <Icon className="h-3.5 w-3.5" />
      {size === "text" && <span className="ml-1.5">{label}</span>}
    </Button>
  );

  return (
    <>
      {trigger("pliki", "Pliki klienta", Eye)}
      {trigger("komunikacja", "Komunikacja z klientem", MessageCircle)}
      {tab && (
        <MediaPreviewDialog
          key={tab}
          open
          onOpenChange={(v) => !v && setTab(null)}
          loanApplicationId={loanApplicationId}
          photoPaths={photoPaths}
          title={title ? `Podgląd — ${title}` : undefined}
          clientId={clientId}
          showCommunication
          defaultTab={tab}
        />
      )}
    </>
  );
}
