import { useRouterState } from "@tanstack/react-router";

/**
 * Zwraca prefiks aktualnego panelu roli (np. "/operator", "/posrednik", "/admin").
 * Dzięki temu współdzielone komponenty (posrednik.*) mogą nawigować bez
 * wyrzucania użytkownika z jego roli.
 */
export function usePanelBase(): "/operator" | "/posrednik" | "/admin" {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname.startsWith("/operator")) return "/operator";
  if (pathname.startsWith("/admin")) return "/admin";
  return "/posrednik";
}
