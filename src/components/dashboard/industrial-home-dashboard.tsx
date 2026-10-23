"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Wrench,
  AlertTriangle,
  Flame,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  ExternalLink,
  Shield,
  Layers,
  User,
  Users,
  CalendarRange,
  Cpu,
  BarChart3,
  Check,
  Play,
  Settings,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { transitionOrderStatusAction } from "@/actions/order-actions";

export interface DashboardOrderSummary {
  id: string;
  orderNumber: string;
  title: string;
  description: string;
  priority: "1_EMERGENCY" | "2_HIGH" | "3_MEDIUM" | "4_LOW";
  statusCode: string;
  statusName: string;
  equipmentName?: string | null;
  equipmentNumber?: string | null;
  assignedToName?: string | null;
  assignedToUserId?: string | null;
  downtimeMinutes?: number;
  plannedDurationMinutes: number;
  createdAt: string;
}

interface IndustrialHomeDashboardProps {
  emergencies: DashboardOrderSummary[];
  pendingApprovals: DashboardOrderSummary[];
  technicianOrders: DashboardOrderSummary[];
  totalOrderCount: number;
  totalEquipmentCount: number;
}

export function IndustrialHomeDashboard({
  emergencies: initialEmergencies,
  pendingApprovals: initialApprovals,
  technicianOrders: initialTechnicianOrders,
  totalOrderCount,
  totalEquipmentCount,
}: IndustrialHomeDashboardProps) {
  const [activeRoleView, setActiveRoleView] = useState<"COORDINATOR" | "OPERATOR" | "TECHNICIAN" | "ADMIN">("COORDINATOR");
  const [approvals, setApprovals] = useState(initialApprovals);
  const [emergencies, setEmergencies] = useState(initialEmergencies);

  // Schnellfreigabe durch Koordinator
  const handleQuickApprove = async (orderId: string, orderNumber: string) => {
    try {
      const res = await transitionOrderStatusAction({
        orderId,
        targetStatusId: "stat-open",
        userId: "demo-user-meister",
        comment: "1-Click Freigabe über Leitstand-Dashboard",
      });

      if (res.success) {
        toast.success(`Auftrag ${orderNumber} freigegeben.`);
        setApprovals((prev) => prev.filter((o) => o.id !== orderId));
      } else {
        toast.error("Freigabe fehlgeschlagen: " + res.error);
      }
    } catch {
      toast.error("Freigabe fehlgeschlagen");
    }
  };

  const getPriorityBadge = (prio: string) => {
    switch (prio) {
      case "1_EMERGENCY":
        return (
          <Badge className="bg-rose-950/70 border-rose-700 text-rose-300 gap-1 font-semibold text-[10px]">
            <Flame className="h-3 w-3 text-rose-300" />
            Notfall
          </Badge>
        );
      case "2_HIGH":
        return (
          <Badge className="bg-amber-950/70 border-amber-700 text-amber-300 text-[10px]">
            Hoch
          </Badge>
        );
      default:
        return (
          <Badge className="bg-slate-800 border-slate-700 text-slate-300 text-[10px]">
            Mittel
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Industrial Banner mit Rollen-Auswahl */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-slate-900 to-slate-900 border border-slate-800 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge className="bg-cyan-600 text-white font-mono text-[10px]">
              Werk 1000 · Smart Factory Leitstand
            </Badge>
            <span className="text-xs text-slate-400">DIN 31051 & SAP PM</span>
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            Industrielle Instandhaltung & Dispatching
          </h1>
          <p className="text-xs text-slate-400 max-w-2xl">
            Zentraler Leitstand für operative Störungsbehebung, Ressourcen-Disposition, Freigaben und
            mobile Arbeitszeitrückmeldungen.
          </p>
        </div>

        {/* Rollenspezifischer View-Switcher / Redirect */}
        <div className="space-y-1 self-start md:self-auto">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Ansicht nach Rolle:
          </span>
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveRoleView("COORDINATOR")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeRoleView === "COORDINATOR"
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Koordinator
            </button>

            <Link
              href="/operator"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-all flex items-center gap-1"
            >
              <span>Bediener</span>
              <ExternalLink className="w-3 h-3 text-slate-500" />
            </Link>

            <Link
              href="/technician"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-all flex items-center gap-1"
            >
              <span>Techniker</span>
              <ExternalLink className="w-3 h-3 text-slate-500" />
            </Link>

            <Link
              href="/admin/users"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white transition-all flex items-center gap-1"
            >
              <span>Admin</span>
              <ExternalLink className="w-3 h-3 text-slate-500" />
            </Link>
          </div>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
        <Card className="p-4 bg-slate-900 border-slate-800">
          <span className="text-[11px] font-medium text-rose-400 uppercase tracking-wider flex items-center gap-1">
            <Flame className="h-3 w-3" /> Akute Notfälle (Prio 1)
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-rose-400 font-mono">
              {emergencies.filter((e) => e.priority === "1_EMERGENCY").length}
            </span>
            <span className="text-xs text-slate-400">akut</span>
          </div>
        </Card>

        <Card className="p-4 bg-slate-900 border-slate-800">
          <span className="text-[11px] font-medium text-amber-400 uppercase tracking-wider flex items-center gap-1">
            <Clock className="h-3 w-3" /> Offene Freigaben
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-300 font-mono">{approvals.length}</span>
            <span className="text-xs text-slate-400">Queue</span>
          </div>
        </Card>

        <Card className="p-4 bg-slate-900 border-slate-800">
          <span className="text-[11px] font-medium text-cyan-400 uppercase tracking-wider flex items-center gap-1">
            <Wrench className="h-3 w-3" /> Heutige Einsätze
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-cyan-300 font-mono">
              {initialTechnicianOrders.length}
            </span>
            <span className="text-xs text-slate-400">disponiert</span>
          </div>
        </Card>

        <Card className="p-4 bg-slate-900 border-slate-800">
          <span className="text-[11px] font-medium text-emerald-400 uppercase tracking-wider flex items-center gap-1">
            <Cpu className="h-3 w-3" /> Überwachte Equipments
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-400 font-mono">
              {totalEquipmentCount}
            </span>
            <span className="text-xs text-slate-400">Anlagen</span>
          </div>
        </Card>
      </div>

      {/* ========================================================================= */}
      {/* 4 HAUPT-KACHELN DES RELAUNCHES                                            */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ======================================================================= */}
        {/* KACHEL 1: AKUTE STÖRUNGSÜBERSICHT                                       */}
        {/* ======================================================================= */}
        <Card className="p-5 bg-slate-900 border-slate-800 flex flex-col justify-between shadow-xl">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-rose-950/80 border border-rose-700/80 flex items-center justify-center text-rose-400">
                  <Flame className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">
                    Akute Störungsübersicht & Stillstände
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Priorität 1 & 2 Störungen mit Auswirkung auf die Linie
                  </p>
                </div>
              </div>

              <Link
                href="/orders"
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                <span>Alle anzeigen</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {emergencies.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 space-y-1">
                <CheckCircle2 className="h-7 w-7 text-emerald-400 mx-auto mb-1" />
                <p className="font-semibold text-white">Keine akuten Havarien aktiv</p>
                <p className="text-[11px] text-slate-500">Alle Produktionslinien laufen im Normalbetrieb.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {emergencies.slice(0, 3).map((order) => (
                  <div
                    key={order.id}
                    className="p-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/orders/${order.id}`}
                          className="font-mono text-[11px] font-bold text-white px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 hover:border-blue-500"
                        >
                          {order.orderNumber}
                        </Link>
                        {getPriorityBadge(order.priority)}
                        {order.downtimeMinutes ? (
                          <span className="text-[10px] text-rose-400 font-semibold flex items-center gap-0.5">
                            <Flame className="h-3 w-3" /> {order.downtimeMinutes}m Stop
                          </span>
                        ) : null}
                      </div>

                      <Link
                        href={`/orders/${order.id}`}
                        className="text-xs font-semibold text-white hover:text-cyan-400 block truncate"
                      >
                        {order.title}
                      </Link>

                      <div className="flex items-center gap-3 text-[11px] text-slate-400">
                        {order.equipmentName && <span>⚙️ {order.equipmentName}</span>}
                        <span>Techniker: {order.assignedToName || "Nicht disponiert"}</span>
                      </div>
                    </div>

                    <Link
                      href={`/orders/${order.id}`}
                      className="self-end sm:self-center px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium"
                    >
                      Öffnen
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* ======================================================================= */}
        {/* KACHEL 2: SCHNELLSTART "STÖRUNG MELDEN"                                 */}
        {/* ======================================================================= */}
        <Card className="p-5 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/20 border-slate-800 flex flex-col justify-between shadow-xl">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-cyan-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">
                    Schnellstart "Störung melden"
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    KI-gestützte Spracheingabe oder manuelles Schnellformular
                  </p>
                </div>
              </div>

              <Badge className="bg-slate-900 text-cyan-300 border-slate-700 text-[10px]">
                Offline-Puffer
              </Badge>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Erfassen Sie Maschinenstillstände, Leckagen, Lagerschäden oder Sensorfehler in wenigen Sekunden.
              Die KI ergänzt automatisch SAP PM Schadenscodes und prüft historische Duplikate.
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <Link
                href="/orders/new"
                className="p-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-blue-500 hover:bg-slate-800/60 transition-all text-xs space-y-1 block group"
              >
                <div className="font-semibold text-white flex items-center gap-1.5 group-hover:text-cyan-400">
                  <span>🚨 Havarie melden</span>
                </div>
                <p className="text-[11px] text-slate-400">Stillstand Fertigungslinie</p>
              </Link>

              <Link
                href="/orders/new"
                className="p-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-blue-500 hover:bg-slate-800/60 transition-all text-xs space-y-1 block group"
              >
                <div className="font-semibold text-white flex items-center gap-1.5 group-hover:text-cyan-400">
                  <span>⚙️ Mechanik / Verschleiß</span>
                </div>
                <p className="text-[11px] text-slate-400">Pumpe, Motor, Förderband</p>
              </Link>
            </div>
          </div>

          <div className="pt-4">
            <Link
              href="/orders/new"
              className="w-full py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition-all active:scale-95"
            >
              <Sparkles className="h-4 w-4 text-cyan-200" />
              <span>Störungserfassung starten</span>
            </Link>
          </div>
        </Card>

        {/* ======================================================================= */}
        {/* KACHEL 3: OFFENE FREIGABEN FÜR KOORDINATOREN                            */}
        {/* ======================================================================= */}
        <Card className="p-5 bg-slate-900 border-slate-800 flex flex-col justify-between shadow-xl">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-amber-950/80 border border-amber-700/80 flex items-center justify-center text-amber-400">
                  <Shield className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">
                    Offene Freigaben für Koordinatoren
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Prüfung, Arbeitsfreigabe (FREI) & Disposition
                  </p>
                </div>
              </div>

              <Link
                href="/planning"
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                <span>Im Gantt öffnen</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {approvals.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 space-y-1">
                <CheckCircle2 className="h-7 w-7 text-emerald-400 mx-auto mb-1" />
                <p className="font-semibold text-white">Keine ausstehenden Freigaben</p>
                <p className="text-[11px] text-slate-500">Alle gemeldeten Maßnahmen sind freigegeben.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {approvals.slice(0, 3).map((order) => (
                  <div
                    key={order.id}
                    className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-400">{order.orderNumber}</span>
                        {getPriorityBadge(order.priority)}
                        <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-800/80">
                          Wartet auf Freigabe
                        </Badge>
                      </div>
                      <span className="text-xs font-semibold text-white block truncate">
                        {order.title}
                      </span>
                      <span className="text-[11px] text-slate-400 block truncate">
                        {order.equipmentName || "Allgemeine Störung"} · Geplant: {order.plannedDurationMinutes} Min.
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 self-end sm:self-center">
                      <Button
                        size="sm"
                        onClick={() => handleQuickApprove(order.id, order.orderNumber)}
                        className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white gap-1"
                      >
                        <Check className="h-3 w-3" />
                        <span>Freigeben</span>
                      </Button>

                      <Link
                        href={`/orders/${order.id}`}
                        className="h-7 px-2 rounded border border-slate-700 bg-slate-800 text-slate-300 hover:text-white text-xs inline-flex items-center"
                      >
                        Details
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* ======================================================================= */}
        {/* KACHEL 4: MEINE HEUTIGEN EINSÄTZE FÜR TECHNIKER                         */}
        {/* ======================================================================= */}
        <Card className="p-5 bg-slate-900 border-slate-800 flex flex-col justify-between shadow-xl">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-emerald-950/80 border border-emerald-700/80 flex items-center justify-center text-emerald-400">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">
                    Meine heutigen Einsätze für Techniker
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Disponierter Arbeitsvorrat & laufende Instandsetzungen
                  </p>
                </div>
              </div>

              <Link
                href="/technician"
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                <span>Zum Techniker-Terminal</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {initialTechnicianOrders.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 space-y-1">
                <Clock className="h-7 w-7 text-cyan-400 mx-auto mb-1" />
                <p className="font-semibold text-white">Keine aktiven Einsätze zugewiesen</p>
                <p className="text-[11px] text-slate-500">Wählen Sie neue Aufträge aus dem Team-Pool.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {initialTechnicianOrders.slice(0, 3).map((order) => (
                  <div
                    key={order.id}
                    className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                  >
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-400">{order.orderNumber}</span>
                        {getPriorityBadge(order.priority)}
                        <Badge variant="secondary" className="text-[10px]">
                          {order.statusName}
                        </Badge>
                      </div>
                      <span className="text-xs font-semibold text-white block truncate">
                        {order.title}
                      </span>
                      <span className="text-[11px] text-slate-400 block truncate">
                        {order.equipmentName || "Anlage"} · {order.plannedDurationMinutes} Min. geschätzt
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 self-end sm:self-center">
                      <Link
                        href="/technician"
                        className="h-7 px-2.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium inline-flex items-center gap-1"
                      >
                        <Play className="h-3 w-3 fill-current" />
                        <span>Arbeit starten</span>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Schnelle Modul-Kacheln für die Navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link
          href="/operator"
          className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-blue-500 hover:bg-slate-800/60 transition-all flex items-center justify-between group"
        >
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-white group-hover:text-cyan-400 block">
              Bediener-Terminal
            </span>
            <span className="text-[11px] text-slate-400 block">Eigene Meldungen</span>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-cyan-400" />
        </Link>

        <Link
          href="/technician"
          className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500 hover:bg-slate-800/60 transition-all flex items-center justify-between group"
        >
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-white group-hover:text-emerald-400 block">
              Techniker-Terminal
            </span>
            <span className="text-[11px] text-slate-400 block">Timer & Zeiterfassung</span>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-emerald-400" />
        </Link>

        <Link
          href="/equipments"
          className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-purple-500 hover:bg-slate-800/60 transition-all flex items-center justify-between group"
        >
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-white group-hover:text-purple-400 block">
              Anlagen-Baumstruktur
            </span>
            <span className="text-[11px] text-slate-400 block">DIN 31051 Hierarchie</span>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-purple-400" />
        </Link>

        <Link
          href="/admin/users"
          className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-amber-500 hover:bg-slate-800/60 transition-all flex items-center justify-between group"
        >
          <div className="space-y-0.5">
            <span className="text-xs font-bold text-white group-hover:text-amber-400 block">
              Benutzer & RBAC
            </span>
            <span className="text-[11px] text-slate-400 block">Active Directory & Rollen</span>
          </div>
          <ArrowRight className="h-4 w-4 text-slate-500 group-hover:text-amber-400" />
        </Link>
      </div>
    </div>
  );
}
