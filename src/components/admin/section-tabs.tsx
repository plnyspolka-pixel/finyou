import { useEffect, useRef } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useAdminBadges } from "@/hooks/use-admin-badges";
import { cn } from "@/lib/utils";
import {
  accentClasses,
  accountingAllowedPaths,
  findSectionByPath,
  isHubPath,
  type AdminNavItem,
} from "@/lib/admin-nav";

/**
 * Poziome zakładki sekcji — montowane raz w layoucie admina, renderują się
 * wyłącznie na podstronach sekcji (nie na /admin ani na hubach). Marketing ma
 * dwa rzędy: podsekcje + itemy aktywnej podsekcji. Rola `ksiegowosc` widzi
 * tylko swoje ścieżki.
 */
export function SectionTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { roles } = useAuth();
  const badges = useAdminBadges();

  const section = findSectionByPath(pathname);
  if (!section || section.id === "pulpit" || isHubPath(pathname)) return null;

  const isStaff = roles.includes("administrator") || roles.includes("operator");
  const accountingOnly = !isStaff && roles.includes("ksiegowosc");
  const allowed = (item: AdminNavItem) =>
    !accountingOnly || accountingAllowedPaths.includes(item.to);

  const accent = accentClasses[section.accent];
  const itemActive = (item: AdminNavItem) =>
    item.exact ? pathname === item.to : pathname.startsWith(item.to);

  const backTab = (
    <Link
      to={section.hubPath}
      aria-label={`Wróć do huba: ${section.label}`}
      className="flex shrink-0 items-center gap-2 border-r py-2 pl-1 pr-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      <section.icon className={cn("h-4 w-4", accent.iconText)} />
      <span className="hidden sm:inline">{section.label}</span>
    </Link>
  );

  if (section.subsections && section.subsections.length > 0) {
    const subsections = section.subsections
      .map((sub) => ({ ...sub, items: sub.items.filter(allowed) }))
      .filter((sub) => sub.items.length > 0);
    const activeSub =
      subsections.find((sub) => sub.items.some(itemActive)) ?? subsections[0];
    if (!activeSub) return null;
    return (
      <div className="border-b bg-background">
        <TabRow>
          {backTab}
          {subsections.map((sub) => (
            <TabLink
              key={sub.label}
              to={sub.items[0].to}
              label={sub.label}
              active={sub.label === activeSub.label}
              accentBar={accent.bar}
            />
          ))}
        </TabRow>
        <TabRow className="border-t border-dashed">
          {activeSub.items.map((item) => (
            <TabLink
              key={item.to}
              to={item.to}
              label={item.label}
              icon={item.icon}
              active={itemActive(item)}
              accentBar={accent.bar}
              badge={item.badgeKey ? badges[item.badgeKey] : undefined}
            />
          ))}
        </TabRow>
      </div>
    );
  }

  const items = section.items.filter(allowed);
  if (items.length === 0) return null;

  return (
    <div className="border-b bg-background">
      <TabRow>
        {backTab}
        {items.map((item) => (
          <TabLink
            key={item.to}
            to={item.to}
            label={item.label}
            icon={item.icon}
            active={itemActive(item)}
            accentBar={accent.bar}
            badge={item.badgeKey ? badges[item.badgeKey] : undefined}
          />
        ))}
      </TabRow>
    </div>
  );
}

function TabRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}

function TabLink({
  to,
  label,
  icon: Icon,
  active,
  accentBar,
  badge,
}: {
  to: string;
  label: string;
  icon?: LucideIcon;
  active: boolean;
  accentBar: string;
  badge?: number;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [active]);
  return (
    <Link
      ref={ref}
      to={to}
      aria-label={label}
      className={cn(
        "relative flex shrink-0 items-center gap-2 px-3 py-2 text-sm transition-colors",
        active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      <span className={Icon ? "hidden sm:inline" : undefined}>{label}</span>
      {badge !== undefined && badge > 0 && (
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
          {badge}
        </Badge>
      )}
      {active && (
        <span
          aria-hidden
          className={cn("absolute inset-x-2 bottom-0 h-0.5 rounded-full", accentBar)}
        />
      )}
    </Link>
  );
}
