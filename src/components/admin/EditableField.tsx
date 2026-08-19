import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

type FieldType = "text" | "number" | "email" | "tel" | "select" | "bool" | "array";

interface Props {
  label: string;
  value: unknown;
  table: string;
  rowId: string;
  column: string;
  type?: FieldType;
  options?: { value: string; label: string }[];
  display?: (v: unknown) => React.ReactNode;
  onSaved?: () => void;
}

export function EditableField({
  label,
  value,
  table,
  rowId,
  column,
  type = "text",
  options,
  display,
  onSaved,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(
    value == null ? "" : Array.isArray(value) ? value.join(", ") : String(value),
  );
  const [saving, setSaving] = useState(false);

  const shown = display
    ? display(value)
    : Array.isArray(value)
      ? value.length > 0
        ? value.join(", ")
        : "—"
      : value == null || value === ""
        ? "—"
        : String(value);

  const save = async () => {
    setSaving(true);
    let payload: unknown = draft;
    if (type === "number") payload = draft === "" ? null : Number(draft);
    else if (type === "bool") payload = draft === "true";
    else if (type === "array")
      payload = draft
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    else if (draft === "") payload = null;
    const { error } = await supabase
      .from(table as any)
      .update({ [column]: payload } as any)
      .eq("id", rowId);
    setSaving(false);
    if (error) {
      toast.error("Błąd zapisu", { description: error.message });
      return;
    }
    toast.success("Zapisano");
    setEditing(false);
    onSaved?.();
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2 group">
        <span className="text-muted-foreground">{label}:</span>
        <span className="flex-1">{shown}</span>
        <button
          type="button"
          onClick={() => {
            setDraft(value == null ? "" : Array.isArray(value) ? value.join(", ") : String(value));
            setEditing(true);
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          aria-label={`Edytuj ${label}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      {type === "select" && options ? (
        <Select value={draft} onValueChange={setDraft}>
          <SelectTrigger className="h-8 flex-1">
            <SelectValue placeholder="Wybierz…" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : type === "bool" ? (
        <Select value={draft === "true" ? "true" : "false"} onValueChange={setDraft}>
          <SelectTrigger className="h-8 w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Tak</SelectItem>
            <SelectItem value="false">Nie</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <Input
          autoFocus
          className="h-8 flex-1"
          type={
            type === "number"
              ? "number"
              : type === "email"
                ? "email"
                : type === "tel"
                  ? "tel"
                  : "text"
          }
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") setEditing(false);
          }}
        />
      )}
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        disabled={saving}
        onClick={() => void save()}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      </Button>
      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditing(false)}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
