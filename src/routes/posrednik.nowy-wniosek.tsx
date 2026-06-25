import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/posrednik/nowy-wniosek")({
  component: () => <Navigate to="/wniosek-formularz" replace />,
});
