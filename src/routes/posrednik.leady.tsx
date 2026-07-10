import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/posrednik/leady")({
  component: () => <Outlet />,
});
