import { createFileRoute } from "@tanstack/react-router";
import { SectionHub } from "@/components/admin/section-hub";

export const Route = createFileRoute("/admin/inwestycje")({
  component: () => <SectionHub sectionId="inwestorzy" />,
});
