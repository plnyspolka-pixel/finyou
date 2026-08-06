import { createFileRoute } from "@tanstack/react-router";
import { SectionHub } from "@/components/admin/section-hub";

export const Route = createFileRoute("/admin/komunikacja")({
  component: () => <SectionHub sectionId="komunikacja" />,
});
