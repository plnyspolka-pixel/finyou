import { Navigate, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/posrednik/nowy-wniosek")({
  component: () => <Navigate to="/klient" replace />,
});
