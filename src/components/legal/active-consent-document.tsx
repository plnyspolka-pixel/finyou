/**
 * Publiczna strona dokumentu z consent_documents (aktywna wersja):
 * /regulamin (terms) i /polityka-prywatnosci (privacy). Jeżeli dokumentu
 * nie da się pobrać, strona pokazuje dotychczasową treść statyczną.
 */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";

export interface ActiveConsentDoc {
  content: string;
  version: number;
  title: string;
}

export async function loadActiveConsentDoc(
  kind: "terms" | "privacy",
): Promise<ActiveConsentDoc | null> {
  try {
    const { data } = await supabase
      .from("consent_documents")
      .select("content, version, title")
      .eq("kind", kind)
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ? (data as ActiveConsentDoc) : null;
  } catch {
    return null;
  }
}

export function ActiveConsentDocumentPage({
  doc,
  heading,
  fallback,
}: {
  doc: ActiveConsentDoc | null;
  heading: string;
  fallback: ReactNode;
}) {
  if (!doc) return <>{fallback}</>;
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-12 md:px-6 md:py-16">
        <Link to="/" className="text-sm text-accent hover:underline">
          ← Wróć do strony głównej
        </Link>
        <p className="mt-6 text-sm text-muted-foreground">
          {heading} — wersja {doc.version}
        </p>
        <article className="fy-article mt-4">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.content}</ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
