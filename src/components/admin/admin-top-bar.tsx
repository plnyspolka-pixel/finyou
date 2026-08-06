import { AdminSearchTrigger } from "@/components/admin/admin-search";

/**
 * Górny pasek panelu admina (desktop, md+). Na mobile wyszukiwarka żyje jako
 * lupa w headerze PanelShell (slot `mobileHeaderExtra`), więc tu nic nie dublujemy.
 */
export function AdminTopBar() {
  return (
    <div className="sticky top-0 z-40 hidden border-b bg-background/95 backdrop-blur md:flex md:items-center md:gap-3 md:px-6 md:py-2.5">
      <AdminSearchTrigger className="w-full max-w-md" />
    </div>
  );
}
