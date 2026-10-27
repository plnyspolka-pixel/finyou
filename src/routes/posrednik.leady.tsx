import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

// Pośrednicy nie dostają leadów Finance You — pracują na własnych klientach.
export const Route = createFileRoute("/posrednik/leady")({
  beforeLoad: () => {
    throw redirect({ to: "/posrednik/wnioski" });
  },
  component: () => <Outlet />,
});
