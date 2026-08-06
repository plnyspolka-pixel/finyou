import { createFileRoute } from "@tanstack/react-router";
import { SectionHub } from "@/components/admin/section-hub";

export const Route = createFileRoute("/admin/konfiguracja")({
  component: () => <SectionHub sectionId="ustawienia" />,
});
