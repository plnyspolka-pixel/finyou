import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout zamkniętego modułu projektów inwestycyjnych (pod panelem inwestora).
// Dostępność danych egzekwują server functions + RLS — routing to tylko
// pierwsza, kosmetyczna warstwa.
export const Route = createFileRoute("/inwestor/projekty")({
  component: () => <Outlet />,
});
