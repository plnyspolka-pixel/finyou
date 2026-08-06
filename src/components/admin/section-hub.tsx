import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useAdminBadges } from "@/hooks/use-admin-badges";
import { cn } from "@/lib/utils";
import {
  accentClasses,
  accountingAllowedPaths,
  adminSections,
  type AdminNavItem,
  type AdminSection,
} from "@/lib/admin-nav";

/**
 * Hub sekcji panelu admina: nagłówek z akcentem + siatka kafelków itemów.
 * Sekcje z podsekcjami (Marketing) grupują kafelki pod nagłówkami podsekcji.
 * Rola `ksiegowosc` widzi wyłącznie swoje ścieżki; hub bez dozwolonych itemów
 * pokazuje komunikat o braku dostępu.
 */
export function SectionHub({ sectionId }: { sectionId: string }) {
  const { roles } = useAuth();
  const section = adminSections.find((s) => s.id === sectionId);
  if (!section) return null;

  const isStaff = roles.includes("administrator") || roles.includes("operator");
  const accountingOnly = !isStaff && roles.includes("ksiegowosc");
  const allowed = (item: AdminNavItem) =>
    !accountingOnly || accountingAllowedPaths.includes(item.to);

  const items = section.items.filter(allowed);
  const subsections = (section.subsections ?? [])
    .map((sub) => ({ ...sub, items: sub.items.filter(allowed) }))
    .filter((sub) => sub.items.length > 0);

  const accent = accentClasses[section.accent];

  if (items.length === 0 && subsections.length === 0) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-muted-foreground">
        Brak dostępu do tej sekcji.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <span
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
            accent.iconBg,
          )}
        >
          <section.icon className={cn("h-6 w-6", accent.iconText)} />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{section.label}</h1>
          <p className="text-sm text-muted-foreground">{section.description}</p>
        </div>
      </div>

      {items.length > 0 && <TileGrid items={items} section={section} />}

      {subsections.map((sub) => (
        <div key={sub.label} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {sub.label}
          </h2>
          <TileGrid items={sub.items} section={section} />
        </div>
      ))}
    </div>
  );
}

function TileGrid({ items, section }: { items: AdminNavItem[]; section: AdminSection }) {
  const badges = useAdminBadges();
  const accent = accentClasses[section.accent];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const count = item.badgeKey ? badges[item.badgeKey] : undefined;
        return (
          <Link key={item.to} to={item.to} className="group block">
            <Card
              className={cn(
                "h-full border p-4 transition-all group-hover:-translate-y-0.5 group-hover:shadow-md",
                accent.cardHover,
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                    accent.iconBg,
                  )}
                >
                  <item.icon className={cn("h-5 w-5", accent.iconText)} />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-foreground">{item.label}</span>
                    {count !== undefined && count > 0 && (
                      <Badge variant="secondary" className="shrink-0">
                        {count}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </div>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
