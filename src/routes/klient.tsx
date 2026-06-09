import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { LogOut, User, FileText, LayoutDashboard, FolderOpen, Bell } from "lucide-react";

export const Route = createFileRoute("/klient")({
  component: KlientLayout,
});

const items = [
  { to: "/klient", label: "Pulpit", icon: LayoutDashboard, exact: true },
  { to: "/klient/wniosek", label: "Mój wniosek", icon: FileText, exact: false },
  { to: "/klient/dokumenty", label: "Dokumenty", icon: FolderOpen, exact: false },
  { to: "/klient/profil", label: "Profil", icon: User, exact: false },
  { to: "/klient/powiadomienia", label: "Powiadomienia", icon: Bell, exact: false },
];

function KlientLayout() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) void navigate({ to: "/logowanie" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return <div className="grid min-h-screen place-items-center text-muted-foreground">Ładowanie…</div>;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <ClientSidebar />
        <SidebarInset className="flex flex-1 flex-col">
          <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur">
            <SidebarTrigger />
            <span className="text-sm font-medium">Panel klienta</span>
          </header>
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function ClientSidebar() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { setOpenMobile, isMobile } = useSidebar();

  const close = () => { if (isMobile) setOpenMobile(false); };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-3">
        <div className="font-semibold text-sm group-data-[collapsible=icon]:hidden">Finance You</div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((it) => {
                const active = it.exact ? pathname === it.to : pathname.startsWith(it.to);
                return (
                  <SidebarMenuItem key={it.to}>
                    <SidebarMenuButton asChild isActive={active} tooltip={it.label}>
                      <Link to={it.to} onClick={close}>
                        <it.icon className="h-4 w-4" />
                        <span>{it.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={() => { void signOut(); void navigate({ to: "/" }); }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span className="group-data-[collapsible=icon]:hidden">Wyloguj</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
