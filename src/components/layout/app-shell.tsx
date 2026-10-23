"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Wrench,
  CalendarRange,
  Layers,
  GitBranch,
  BarChart3,
  PlusCircle,
  Menu,
  X,
  FileCheck,
  ChevronRight,
  Shield,
  Clock,
  Sparkles,
  Calendar,
  Cpu,
  MapPin,
  Package,
  Settings,
  Database,
  ExternalLink,
  Users,
  Star,
  Plus,
  ChevronDown,
} from "lucide-react";
import {
  OfflineSyncStatusIndicator,
  SimulateOfflineToggle,
} from "@/components/layout/offline-sync-indicator";
import { Badge } from "@/components/ui/badge";
import { CurrentUserRbacInfo } from "@/lib/rbac";
import { useWorkspace } from "./workspace-context";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  matchPrefix?: string;
  category: "OPERATIV" | "WARTUNG" | "STAMMDATEN" | "SYSTEM";
}

export const ALL_NAV_ITEMS: NavItem[] = [
  // 1. Operativ
  {
    label: "Aufträge & Störungen",
    href: "/orders",
    icon: Wrench,
    matchPrefix: "/orders",
    category: "OPERATIV",
  },
  {
    label: "Gantt Planungsboard",
    href: "/planning",
    icon: CalendarRange,
    matchPrefix: "/planning",
    category: "OPERATIV",
  },
  {
    label: "Bediener-Terminal",
    href: "/operator",
    icon: Sparkles,
    matchPrefix: "/operator",
    category: "OPERATIV",
  },
  {
    label: "Techniker-Dashboard",
    href: "/technician",
    icon: Clock,
    matchPrefix: "/technician",
    category: "OPERATIV",
  },

  // 2. Wartung & Prüfungen
  {
    label: "Wartungs-Hub",
    href: "/maintenance",
    icon: Layers,
    matchPrefix: "/maintenance",
    category: "WARTUNG",
  },
  {
    label: "Wartungspläne (Batch)",
    href: "/maintenance-plans",
    icon: Calendar,
    matchPrefix: "/maintenance-plans",
    category: "WARTUNG",
  },
  {
    label: "Protokoll-Vorlagen",
    href: "/inspections",
    icon: FileCheck,
    matchPrefix: "/inspections",
    category: "WARTUNG",
  },

  // 3. Stammdaten & Lager
  {
    label: "Anlagen & Equipments",
    href: "/equipments",
    icon: Cpu,
    matchPrefix: "/equipments",
    category: "STAMMDATEN",
  },
  {
    label: "Technische Plätze",
    href: "/functional-locations",
    icon: MapPin,
    matchPrefix: "/functional-locations",
    category: "STAMMDATEN",
  },
  {
    label: "Ersatzteile & Lager",
    href: "/spare-parts",
    icon: Package,
    matchPrefix: "/spare-parts",
    category: "STAMMDATEN",
  },

  // 4. System & Leitstand
  {
    label: "KI-Leitstand (Analytics)",
    href: "/analytics",
    icon: BarChart3,
    matchPrefix: "/analytics",
    category: "SYSTEM",
  },
  {
    label: "Workflow-Matrix",
    href: "/workflows",
    icon: GitBranch,
    matchPrefix: "/workflows",
    category: "SYSTEM",
  },
  {
    label: "Benutzer & Rechte (RBAC)",
    href: "/admin/users",
    icon: Users,
    matchPrefix: "/admin/users",
    category: "SYSTEM",
  },
  {
    label: "Administration & SAP",
    href: "/admin",
    icon: Settings,
    matchPrefix: "/admin",
    category: "SYSTEM",
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [modulesCollapsed, setModulesCollapsed] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const {
    savedViews,
    activeViewId,
    selectView,
    clearActiveView,
    currentUser,
    switchRole,
    switchingRole,
    aiProviderInfo,
  } = useWorkspace();

  // RBAC Filter: Nur Benutzer mit canViewAiAnalytics sehen den KI-Leitstand
  const visibleNavItems = ALL_NAV_ITEMS.filter((item) => {
    if (item.href === "/analytics" && !currentUser.canViewAiAnalytics) {
      return false;
    }
    return true;
  });

  // Helper zum Ermitteln, ob ein Navigationselement aktiv ist
  const isItemActive = (item: NavItem) => {
    if (pathname === item.href) return true;
    if (!item.matchPrefix) return false;
    // /admin vs /admin/users: Untermenü hat Vorrang
    if (item.href === "/admin" && pathname.startsWith("/admin/users")) {
      return false;
    }
    return pathname.startsWith(item.matchPrefix);
  };

  // Helper zum Ermitteln des aktuellen Modul-Titels
  const currentNav = visibleNavItems.find((item) => isItemActive(item));

  const categories: Array<{ id: NavItem["category"]; label: string }> = [
    { id: "OPERATIV", label: "Disposition & Störungen" },
    { id: "WARTUNG", label: "Wartung & Checklisten" },
    { id: "STAMMDATEN", label: "Stammdaten & Lager" },
    { id: "SYSTEM", label: "Leitstand & Konfiguration" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col md:flex-row antialiased selection:bg-blue-100 selection:text-blue-900">
      {/* ========================================================================= */}
      {/* 1. DESKTOP SIDEBAR (md:flex)                                             */}
      {/* ========================================================================= */}
      <aside className="hidden md:flex flex-col w-[260px] bg-white border-r border-slate-200 shrink-0 sticky top-0 h-screen z-30 justify-between text-slate-800">
        {/* Brand / Logo Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-200 shrink-0">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="h-9 w-9 rounded-[10px] bg-blue-50 border border-blue-100 flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
              <span className="h-3 w-3 rounded-full bg-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-900 tracking-tight text-base">
                  MaintAI
                </span>
                <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                  PWA
                </span>
              </div>
              <span className="text-[11px] text-slate-500 block leading-none font-normal mt-0.5">
                Werk 01 - Rohbau
              </span>
            </div>
          </Link>
        </div>

        {/* Scrollable Area: MEINE FAVORITEN + MODULE */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {/* MEINE FAVORITEN SEKTION */}
          <div>
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400">
                MEINE FAVORITEN
              </span>
              <button
                type="button"
                onClick={() => clearActiveView()}
                title="Neuen Workspace öffnen"
                className="h-6 w-6 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-200 hover:text-slate-900 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-1">
              {savedViews.map((view) => {
                const isActive = activeViewId === view.id;
                return (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => selectView(view)}
                    className={`w-full flex items-center justify-between px-3 py-2 min-h-[40px] rounded-lg text-xs font-medium transition-all text-left group ${
                      isActive
                        ? "bg-blue-50 text-blue-700 border border-blue-200 font-medium shadow-xs"
                        : "text-slate-700 hover:text-slate-900 hover:bg-slate-50 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <Star
                        className={`h-3.5 w-3.5 shrink-0 transition-colors ${
                          isActive
                            ? "text-blue-600 fill-blue-600"
                            : "text-amber-500 fill-amber-500/30 group-hover:fill-amber-500"
                        }`}
                      />
                      <span className="truncate">{view.name}</span>
                    </div>
                    {(view.refreshInterval ?? 0) > 0 && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                        {view.refreshInterval}s
                      </span>
                    )}
                  </button>
                );
              })}

              {savedViews.length === 0 && (
                <div className="px-2 py-3 text-[11px] text-slate-500 italic text-center rounded-lg border border-dashed border-slate-200">
                  Keine Favoriten vorhanden.
                  <br />
                  <span className="text-[10px] text-slate-400">
                    Suchanfragen über ⭐ speichern
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* TRENNLINIE */}
          <div className="border-t border-slate-200 my-2" />

          {/* WEITERE MODULE & NAVIGATION */}
          <div>
            <button
              type="button"
              onClick={() => setModulesCollapsed(!modulesCollapsed)}
              className="w-full flex items-center justify-between px-2 py-2 min-h-[36px] text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 transition-colors"
            >
              <span>WEITERE MODULE</span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${
                  modulesCollapsed ? "-rotate-90" : "rotate-0"
                }`}
              />
            </button>

            {!modulesCollapsed && (
              <div className="space-y-4 mt-1">
                {categories.map((cat) => {
                  const catItems = visibleNavItems.filter((item) => item.category === cat.id);
                  if (catItems.length === 0) return null;

                  return (
                    <div key={cat.id} className="space-y-1">
                      <div className="px-2 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                        {cat.label}
                      </div>
                      {catItems.map((item) => {
                        const isActive = isItemActive(item);
                        const Icon = item.icon;

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center justify-between px-3 py-2 min-h-[40px] rounded-lg text-xs font-medium transition-all group ${
                              isActive
                                ? "bg-blue-50 text-blue-700 border border-blue-200 font-semibold shadow-xs"
                                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent"
                            }`}
                          >
                            <div className="flex items-center gap-2.5 truncate">
                              <Icon
                                className={`h-4 w-4 transition-colors ${
                                  isActive
                                    ? "text-blue-600"
                                    : "text-slate-400 group-hover:text-slate-600"
                                }`}
                              />
                              <span className="truncate">{item.label}</span>
                            </div>
                            {isActive && (
                              <div className="h-1.5 w-1.5 rounded-full bg-blue-600 shrink-0" />
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* GANZ UNTEN LINKS: ADMIN SETTINGS */}
        <div className="p-3 border-t border-slate-200 shrink-0 bg-white">
          <Link
            href="/admin/settings"
            className={`w-full flex items-center justify-between px-3 py-2.5 min-h-[44px] rounded-lg text-xs font-semibold transition-all shadow-xs ${
              pathname.startsWith("/admin")
                ? "bg-blue-50 text-blue-700 border border-blue-200 shadow-xs"
                : "text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-sm leading-none">⚙️</span>
              <span>Admin Settings</span>
            </div>
            {pathname.startsWith("/admin") && (
              <span className="h-2 w-2 rounded-full bg-blue-600" />
            )}
          </Link>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 2. MAIN VIEW AREA (Topbar + Content + Mobile Bottom-Nav)                  */}
      {/* ========================================================================= */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Topbar */}
        <header className="h-16 border-b border-slate-200 bg-white/95 backdrop-blur-md sticky top-0 z-20 px-4 md:px-8 flex items-center justify-between gap-4">
          {/* Title / Breadcrumb */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200"
              title="Menü öffnen"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="md:hidden flex items-center gap-2">
              <span className="font-bold text-slate-900 tracking-tight text-sm">
                MaintAI
              </span>
            </div>

            <div className="hidden md:flex items-center gap-2">
              <span className="text-base font-bold text-slate-900 tracking-tight">
                {pathname.startsWith("/admin") ? "Administration" : "Workspace"}
              </span>
              <span className="text-xs text-slate-400">
                {pathname === "/" && "/ Leitstand & Conversational Hub"}
                {pathname === "/analytics" && "/ Störungs-Auswertung Rohbau Halle 1 (Diagramm-Modus)"}
                {pathname.startsWith("/admin/settings") && "/ System-Administration & Grundkonfiguration (/admin/settings)"}
                {pathname !== "/" && pathname !== "/analytics" && !pathname.startsWith("/admin/settings") && (
                  <>/ {currentNav?.label || "Leitstand"}</>
                )}
              </span>
            </div>
          </div>

          {/* Topbar Actions: Online, SAP PM, Profil */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Status-Pill: Online */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold shadow-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Online</span>
            </div>

            {/* SAP-Pill: Verbunden */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-semibold shadow-xs">
              <span className="h-2 w-2 rounded-full bg-indigo-500" />
              <span className="hidden sm:inline">SAP PM: Verbunden</span>
              <span className="sm:hidden">SAP</span>
            </div>

            {/* Offline-Sync Dexie Indikator */}
            <div className="hidden xl:block">
              <OfflineSyncStatusIndicator />
            </div>

            {/* Profil Badge mit interaktivem Dropdown */}
            <div className="relative pl-1 sm:pl-2 border-l border-slate-200">
              <button
                type="button"
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className="flex items-center gap-2.5 px-3 py-1 min-h-[40px] rounded-full bg-slate-50 border border-slate-200 hover:bg-slate-100 transition-colors shadow-xs text-left"
                title="Profil und Rollen-Optionen anzeigen"
              >
                <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                  {currentUser.userName.split(" ").map((n) => n[0]).join("")}
                </div>
                <div className="hidden lg:block text-left leading-tight">
                  <p className="text-xs font-semibold text-slate-900 truncate max-w-[130px]">
                    {currentUser.userName}
                  </p>
                  <p className="text-[10px] text-slate-500 truncate max-w-[130px]">
                    {currentUser.roleName}
                  </p>
                </div>
                <ChevronDown className="h-3 w-3 text-slate-400 hidden sm:block" />
              </button>

              {/* Profil Dropdown */}
              {profileDropdownOpen && (
                <div className="absolute right-0 top-12 z-50 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-xl backdrop-blur-md space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <div>
                      <p className="text-xs font-bold text-slate-900">{currentUser.userName}</p>
                      <p className="text-[11px] text-slate-500">{currentUser.userEmail || "benutzer@fertigung.de"}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] border-blue-200 bg-blue-50 text-blue-700">
                      {currentUser.roleCode}
                    </Badge>
                  </div>

                  {/* RBAC Rolle testen */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-600 font-medium">
                      <span>Rolle testen (RBAC):</span>
                      {switchingRole && <span className="text-blue-600 animate-pulse text-[10px]">Wechsle...</span>}
                    </div>
                    <select
                      value={currentUser.roleCode}
                      onChange={(e) => {
                        switchRole(e.target.value);
                        setProfileDropdownOpen(false);
                      }}
                      disabled={switchingRole}
                      aria-label="Aktive Benutzerrolle auswählen"
                      className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-800 rounded-lg px-2.5 min-h-[40px] focus:outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="SHIFT_LEAD">Meister / Leitstand (KI erlaubt)</option>
                      <option value="MAINT_PLANNER">Instandhaltungsplaner (KI erlaubt)</option>
                      <option value="ADMIN">Administrator (KI erlaubt, Admin-Link)</option>
                      <option value="TECHNICIAN">Techniker (Kein KI-Zugriff)</option>
                      <option value="REPORTER">Bediener/Melder (Kein KI-Zugriff)</option>
                    </select>
                  </div>

                  <div className="pt-2 border-t border-slate-100">
                    <Link
                      href="/admin/settings"
                      onClick={() => setProfileDropdownOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors"
                    >
                      <span>⚙️ Admin Settings öffnen</span>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Dynamic Page Content */}
        <main className="flex-1 pb-24 md:pb-8 flex flex-col">
          {children}
        </main>

        {/* ========================================================================= */}
        {/* 3. MOBILE FULL MENU DRAWER                                                */}
        {/* ========================================================================= */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex">
            <div className="w-4/5 max-w-sm bg-white border-r border-slate-200 p-4 flex flex-col h-full shadow-2xl text-slate-800">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded bg-blue-50 border border-blue-200 flex items-center justify-center">
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                  </div>
                  <span className="font-bold text-slate-900 text-sm">MaintAI Menü</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded bg-slate-100 text-slate-500 hover:text-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 py-2">
                {/* FAVORITEN IM MOBILE DRAWER */}
                <div>
                  <div className="flex items-center justify-between px-2 mb-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      MEINE FAVORITEN
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        clearActiveView();
                        setMobileMenuOpen(false);
                      }}
                      title="Neuen Workspace öffnen"
                      className="p-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-1">
                    {savedViews.map((view) => (
                      <button
                        key={view.id}
                        type="button"
                        onClick={() => {
                          selectView(view);
                          setMobileMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 text-left"
                      >
                        <Star className="h-3.5 w-3.5 text-blue-600 fill-blue-600" />
                        <span className="truncate">{view.name}</span>
                      </button>
                    ))}
                    {savedViews.length === 0 && (
                      <div className="px-3 py-2 text-xs text-slate-400 italic">
                        Keine Favoriten gespeichert.
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-slate-200 my-2" />

                {/* ALLE MODULE */}
                {categories.map((cat) => {
                  const catItems = visibleNavItems.filter((item) => item.category === cat.id);

                  return (
                    <div key={cat.id} className="space-y-1">
                      <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {cat.label}
                      </div>
                      {catItems.map((item) => {
                        const isActive = isItemActive(item);
                        const Icon = item.icon;

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMobileMenuOpen(false)}
                            className={`flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-lg text-xs font-medium ${
                              isActive
                                ? "bg-blue-50 text-blue-700 font-semibold"
                                : "text-slate-600 hover:bg-slate-50"
                            }`}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            <span>{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  );
                })}

                {/* Mobile Admin Link */}
                <div className="pt-2 border-t border-slate-200">
                  <Link
                    href="/admin/settings"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200"
                  >
                    <Settings className="h-4 w-4 text-slate-500" />
                    <span>⚙️ Admin Settings</span>
                  </Link>
                </div>
              </div>
            </div>
            <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
          </div>
        )}

        {/* ========================================================================= */}
        {/* 4. MOBILE BOTTOM-NAV (md:hidden)                                          */}
        {/* ========================================================================= */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200 px-2 py-1.5 flex items-center justify-around shadow-lg safe-area-bottom">
          {/* Workspace */}
          <Link
            href="/"
            className={`flex flex-col items-center justify-center py-2 px-3 min-h-[44px] rounded-lg text-[10px] font-medium transition-colors ${
              pathname === "/"
                ? "text-blue-600 font-semibold"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Sparkles className="h-5 w-5 mb-0.5" />
            <span>Workspace</span>
          </Link>

          {/* Aufträge */}
          <Link
            href="/orders"
            className={`flex flex-col items-center justify-center py-2 px-3 min-h-[44px] rounded-lg text-[10px] font-medium transition-colors ${
              pathname.startsWith("/orders") && !pathname.includes("tab=create")
                ? "text-cyan-400 font-semibold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Wrench className="h-5 w-5 mb-0.5" />
            <span>Aufträge</span>
          </Link>

          {/* Planung */}
          <Link
            href="/planning"
            className={`flex flex-col items-center justify-center py-2 px-3 min-h-[44px] rounded-lg text-[10px] font-medium transition-colors ${
              pathname.startsWith("/planning")
                ? "text-cyan-400 font-semibold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <CalendarRange className="h-5 w-5 mb-0.5" />
            <span>Planung</span>
          </Link>

          {/* Wartung */}
          <Link
            href="/maintenance"
            className={`flex flex-col items-center justify-center py-2 px-3 min-h-[44px] rounded-lg text-[10px] font-medium transition-colors ${
              pathname.startsWith("/maintenance")
                ? "text-cyan-400 font-semibold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Layers className="h-5 w-5 mb-0.5" />
            <span>Wartung</span>
          </Link>

          {/* Alle Module / Menü */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="flex flex-col items-center justify-center py-2 px-3 min-h-[44px] rounded-lg text-[10px] font-medium text-slate-400 hover:text-slate-200"
          >
            <Menu className="h-5 w-5 mb-0.5" />
            <span>Menü</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
