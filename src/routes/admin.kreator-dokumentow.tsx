import { createFileRoute } from "@tanstack/react-router";
import { DocumentCreatorPage } from "@/components/document-creator/DocumentCreatorPage";

export const Route = createFileRoute("/admin/kreator-dokumentow")({
  component: DocumentCreatorPage,
});
