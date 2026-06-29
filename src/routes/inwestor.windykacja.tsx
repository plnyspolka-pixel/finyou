import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/inwestor/windykacja")({
  component: WindykacjaLayout,
});

function WindykacjaLayout() {
  return <Outlet />;
}
