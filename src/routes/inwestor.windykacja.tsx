import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/inwestor/windykacja")({
  component: () => <Outlet />,
});
