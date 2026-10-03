// Nawigacja panelu inwestora — czysta funkcja od flag konta, testowalna.
//
// Jedna nawigacja dla każdego inwestora — bez podziału na pakiety. Kolejność:
// abonament (pierwsza bramka — bez niego tylko zakup, płatności, profil,
// odstąpienie) → pipeline z akceptacją pakietu umów → moduł ofert
// (InvestorSubscriptionGate; twarda bramka: RLS i server functions).
import {
  Tag,
  ClipboardList,
  FileText,
  GraduationCap,
  Calculator,
  CreditCard,
  User,
  Gavel,
  ShieldCheck,
  Target,
  BarChart3,
  Undo2,
} from "lucide-react";
import type { NavGroup, NavItem } from "@/components/layout/panel-shell";

export interface InvestorNavFlags {
  isConsumer: boolean;
  /** Złożone albo przyjęte i ważne Zlecenie (`hasLiveOrder`). */
  hasLiveOrder: boolean;
}

/**
 * Pipeline inwestora (dane stron → rachunek → KYC → screening → pakiet umów →
 * Zlecenie). Gdy inwestor ma żywe Zlecenie, zakładka znika z menu (strona
 * zostaje dostępna z linków), a praca toczy się w „Moich zleceniach".
 */
export const ORDER_PIPELINE_ITEM: NavItem = {
  to: "/inwestor/umowy",
  label: "Złóż zlecenie",
  icon: Target,
};

const MAIN_ITEMS: NavItem[] = [
  ORDER_PIPELINE_ITEM,
  { to: "/inwestor/zlecenia", label: "Moje zlecenia", icon: ClipboardList },
  { to: "/inwestor/oferty", label: "Moje oferty", icon: Tag },
  // Pipeline analityczny (KW → właściciele → analiza KW → ryzyko) — ten
  // sam, którym posługuje się zespół Finance You — dla Projektów inwestora.
  { to: "/inwestor/analityka", label: "Analityka", icon: BarChart3 },
  // Jeden moduł dokumentów: agent umowy (silnik klauzul) + kreator
  // dokumentów DOCX (bez kategorii „Umowy" — umowy tylko z agenta).
  { to: "/inwestor/dokumenty", label: "Dokumenty i umowy", icon: FileText },
  { to: "/inwestor/windykacja", label: "Windykacja", icon: Gavel },
  { to: "/inwestor/aml", label: "AML", icon: ShieldCheck },
  { to: "/inwestor/szkolenia", label: "Akademia", icon: GraduationCap },
  { to: "/inwestor/kalkulator", label: "Kalkulator compliance", icon: Calculator },
  // Cennik abonamentu, stan dostępu oraz historia płatności i faktur.
  { to: "/inwestor/abonament", label: "Dostęp i płatności", icon: CreditCard },
  { to: "/inwestor/profil", label: "Profil", icon: User },
];

// Konsument ma stały link do odstąpienia od Umowy ramowej (Zał. 4).
const WITHDRAWAL_GROUP: NavGroup = {
  items: [{ to: "/inwestor/odstapienie", label: "Odstąpienie od umowy", icon: Undo2 }],
};

/** Grupy menu dla flag konta; bez flag (przed wczytaniem) — pełne menu. */
export function investorNavGroups(flags: Partial<InvestorNavFlags> | undefined): NavGroup[] {
  const items = flags?.hasLiveOrder
    ? MAIN_ITEMS.filter((i) => i !== ORDER_PIPELINE_ITEM)
    : MAIN_ITEMS;
  const groups: NavGroup[] = [{ items }];
  if (flags?.isConsumer) groups.push(WITHDRAWAL_GROUP);
  return groups;
}

/** Strona startowa panelu: z żywym Zleceniem — „Moje zlecenia", inaczej pipeline. */
export function investorHomePath(flags: Partial<InvestorNavFlags> | undefined): string {
  return flags?.hasLiveOrder ? "/inwestor/zlecenia" : ORDER_PIPELINE_ITEM.to;
}
