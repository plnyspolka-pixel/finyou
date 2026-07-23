import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, Users, FileText, FolderOpen, PhoneCall, Briefcase, Send, Tag, Plug, Settings, LogOut, ShieldCheck, Mic, GraduationCap, Code2, Wand2, Receipt, BookOpen, Facebook, Mail, Search, Sparkles, Link2, TrendingDown, Eye, Bot, FileCheck, Menu, FileSignature, Image as ImageIcon, Network, Coins, Share2, Wallet, Building2 } from "lucide-react";

import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { useState } from "react";
import { PanelShell } from "@/components/layout/panel-shell";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

type Item = { to: string; label: string; icon: any; exact?: boolean };
type Group = { label?: string; items: Item[] };

const groups: Group[] = [
  { items: [{ to: "/admin", label: "Pulpit", icon: LayoutDashboard, exact: true }] },
  {
    label: "Klienci pożyczkowi",
    items: [
      { to: "/admin/klienci", label: "Klienci (leady + przypomnienia)", icon: Users },
      { to: "/admin/skrzynka", label: "Skrzynka mailowa", icon: Mail },
      { to: "/admin/messenger", label: "Messenger / Instagram DM", icon: Mail },
      { to: "/admin/wnioski-niekompletne", label: "Wnioski (wszystkie)", icon: FileText },
      { to: "/admin/kw", label: "Księgi wieczyste", icon: BookOpen },
      { to: "/admin/kreator-pozyczki", label: "Kreator pożyczki", icon: Wand2 },
      { to: "/admin/kreator-dokumentow", label: "Kreator dokumentów B2B", icon: FileSignature },
      { to: "/admin/voicebot", label: "Voicebot", icon: Mic },
      { to: "/admin/avatar-faq", label: "Awatar FAQ (Filip)", icon: Bot },
      { to: "/admin/text-agent", label: "Agent DM (Messenger/IG/email)", icon: Bot },
    ],
  },
  {
    label: "Inwestorzy",
    items: [
      { to: "/admin/inwestorzy", label: "Lista inwestorów", icon: Briefcase },
      { to: "/admin/projekty", label: "Projekty inwestycyjne", icon: FolderOpen },
      { to: "/admin/oferty", label: "Oferty", icon: Tag },
      { to: "/admin/dystrybucja", label: "Dystrybucja ofert", icon: Send },
      { to: "/admin/szkolenia", label: "Szkolenia", icon: GraduationCap },
    ],
  },
  {
    label: "Program pośredników",
    items: [
      { to: "/admin/program-posrednikow", label: "Pulpit programu", icon: Network, exact: true },
      { to: "/admin/program-posrednikow/partnerzy", label: "Partnerzy", icon: Users },
      { to: "/admin/program-posrednikow/struktura", label: "Struktura partnerska", icon: Share2 },
      { to: "/admin/program-posrednikow/zdarzenia", label: "Zdarzenia prowizyjne", icon: Send },
      { to: "/admin/program-posrednikow/prowizje", label: "Prowizje", icon: Coins },
      { to: "/admin/program-posrednikow/wyplaty", label: "Paczki wypłat", icon: Wallet },
      { to: "/admin/program-posrednikow/rozliczenia", label: "Rozliczenia B2B / nierejestrowana", icon: FileCheck },
      { to: "/admin/program-posrednikow/ustawienia", label: "Stawki, limity, reguły", icon: Settings },
    ],
  },
  {
    label: "Księgowość",
    items: [
      { to: "/admin/platnosci-dostep", label: "Płatności za dostęp", icon: Wallet },
      { to: "/admin/ksiegowosc", label: "Pulpit księgowości", icon: Receipt, exact: true },
      { to: "/admin/ksiegowosc/faktury", label: "Faktury sprzedaży", icon: FileText },
      { to: "/admin/ksiegowosc/podmioty", label: "Podmioty gospodarcze", icon: Building2 },
    ],
  },
  {
    label: "Marketing",
    items: [
      { to: "/admin/marketing/tracking", label: "Tracking UTM", icon: Link2 },
      { to: "/admin/clarity", label: "Clarity (UX & analiza AI)", icon: Eye },
      { to: "/admin/marketing/email", label: "Email Marketing", icon: Mail },
      { to: "/admin/marketing/landing", label: "Landing Pages", icon: FileText },
      { to: "/admin/marketing/social", label: "Social Media AI", icon: Sparkles },
      { to: "/admin/ai-growth-engine", label: "AI Growth Engine", icon: Sparkles },
      { to: "/admin/ai-seo", label: "AI SEO Content", icon: FileText },
      { to: "/admin/ai-outreach", label: "AI Outreach", icon: Send },
      { to: "/admin/ai-linkbuilding", label: "AI Link Building", icon: Link2 },
      { to: "/admin/ai-serp", label: "SERP Tracker", icon: Search },
      { to: "/admin/ai-funnel", label: "Funnel Analyzer", icon: TrendingDown },
      { to: "/admin/ai-competitors", label: "Competitor Watch", icon: Eye },
      { to: "/admin/mailing", label: "Mailing", icon: Mail },
      { to: "/admin/meta", label: "Meta Ads", icon: Facebook },
      { to: "/admin/fb-ads/kreator", label: "Kreator FB Ads", icon: Facebook },
      { to: "/admin/google-ads/kreator", label: "Kreator Google Ads", icon: Search },
      { to: "/admin/pixele", label: "Pixele FB", icon: Facebook },
      { to: "/admin/materialy", label: "Materiały marketingowe", icon: ImageIcon },
    ],
  },
  {
    label: "Konfiguracja",
    items: [
      
      { to: "/admin/embed", label: "Wniosek do osadzenia", icon: Code2 },
      { to: "/admin/integracje", label: "Integracje", icon: Plug },
      { to: "/admin/role", label: "Role użytkowników", icon: ShieldCheck },
      { to: "/admin/operatorzy", label: "Operatorzy wewnętrzni", icon: ShieldCheck },
      { to: "/admin/zgody", label: "Treści zgód", icon: FileCheck },
      { to: "/admin/ustawienia", label: "Ustawienia", icon: Settings },
    ],
  },
];

// Widok dla samej księgowości: tylko moduł księgowości + rozliczenia programu.
const accountingGroups: Group[] = [
  { items: [{ to: "/admin/ksiegowosc", label: "Pulpit księgowości", icon: Receipt, exact: true }] },
  {
    label: "Księgowość",
    items: [
      { to: "/admin/ksiegowosc/faktury", label: "Faktury sprzedaży", icon: FileText },
      { to: "/admin/ksiegowosc/podmioty", label: "Podmioty gospodarcze", icon: Building2 },
      { to: "/admin/program-posrednikow/rozliczenia", label: "Rozliczenia B2B / nierejestrowana", icon: FileCheck },
    ],
  },
];

function AdminLayout() {
  const { roles } = useAuth();
  const isStaff = roles.includes("administrator") || roles.includes("operator");
  const isAccountant = roles.includes("ksiegowosc");
  return (
    <PanelShell
      title={isStaff ? "Panel administratora" : "Panel księgowości"}
      allow={["administrator", "ksiegowosc"]}
      groups={isStaff ? groups : isAccountant ? accountingGroups : groups}
      
    />
  );
}
