import { createFileRoute } from "@tanstack/react-router";
import { EngineUmowaGenerator } from "@/components/engine-umowa/EngineUmowaGenerator";

export const Route = createFileRoute("/admin/generator-umowy")({
  component: () => <EngineUmowaGenerator />,
});
