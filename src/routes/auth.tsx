import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/auth")({
  component: AuthAliasPage,
});

function AuthAliasPage() {
  return <Navigate to="/logowanie" replace />;
}
