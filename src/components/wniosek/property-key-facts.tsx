import { Badge } from "@/components/ui/badge";
import { Home, FileText, Image as ImageIcon, Hash } from "lucide-react";
import { formatPLN, propertyTypeLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";

type Props = {
  variant?: "inline" | "block";
  className?: string;
  amount?: number | null;
  propertyType?: string | null;
  kwNumber?: string | null;
  photoCount?: number;
  docCount?: number;
  periodMonths?: number | null;
};

export function PropertyKeyFacts({
  variant = "inline",
  className,
  amount,
  propertyType,
  kwNumber,
  photoCount = 0,
  docCount = 0,
  periodMonths,
}: Props) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 text-xs",
        variant === "block" && "gap-3",
        className,
      )}
    >
      {typeof amount === "number" && amount > 0 && (
        <span className="font-semibold tabular-nums">{formatPLN(amount)}</span>
      )}
      {propertyType && (
        <Badge variant="outline" className="gap-1">
          <Home className="h-3 w-3" />
          {propertyTypeLabels[propertyType] ?? propertyType}
        </Badge>
      )}
      {periodMonths && <span className="text-muted-foreground">{periodMonths} mies.</span>}
      {kwNumber && (
        <Badge variant="secondary" className="gap-1" title="Numer księgi wieczystej">
          <Hash className="h-3 w-3" />
          KW
        </Badge>
      )}
      {photoCount > 0 && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <ImageIcon className="h-3 w-3" /> {photoCount}
        </span>
      )}
      {docCount > 0 && (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <FileText className="h-3 w-3" /> {docCount}
        </span>
      )}
    </div>
  );
}
