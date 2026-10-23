"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Wrench,
  Search,
  Filter,
  Clock,
  AlertTriangle,
  CheckCircle2,
  PlusCircle,
  Sparkles,
  RefreshCw,
  FileText,
  ChevronRight,
  Database,
  Wifi,
  WifiOff,
  User,
  ArrowRight,
  Layers,
  Flame,
  Check,
  Send,
  X,
  Play,
  CheckCheck,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreateOrderForm, EquipmentOption } from "@/components/orders/create-order-form";
import { localDb, LocalMaintenanceOrder } from "@/lib/offline/indexed-db";
import { syncManager, SyncState } from "@/lib/offline/sync-manager";
import {
  completeOrderAction,
  transitionOrderStatusAction,
} from "@/actions/order-actions";

export interface OrderItemView {
  id: string;
  orderNumber: string;
  title: string;
  description: string;
  priority: "1_EMERGENCY" | "2_HIGH" | "3_MEDIUM" | "4_LOW";
  currentStatusId: string;
  statusCode?: string;
  statusName?: string;
  equipmentId?: string | null;
  equipmentName?: string | null;
  equipmentNumber?: string | null;
  assignedToUserId?: string | null;
  assignedToName?: string | null;
  scheduledStartAt?: string | null;
  actualDurationMinutes?: number | null;
  resolutionSummary?: string | null;
  causeCode?: string | null;
  syncStatus: "SYNCED" | "CREATED_OFFLINE" | "UPDATED_OFFLINE";
  updatedAt: string;
}

interface OrdersDashboardProps {
  tenantId: string;
  serverOrders: OrderItemView[];
  equipments: EquipmentOption[];
  defaultUserId?: string;
}

export function OrdersDashboard({
  tenantId,
  serverOrders,
  equipments,
  defaultUserId = "user-demo-meister",
}: OrdersDashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "create" ? "create" : "list";

  const [activeTab, setActiveTab] = useState<"list" | "create">(initialTab);
  const [orders, setOrders] = useState<OrderItemView[]>(serverOrders);
  const [isPending, startTransition] = useTransition();

  // Filter- & Such-State
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");

  // Sync State
  const [syncState, setSyncState] = useState<SyncState>({
    isOnline: true,
    isSimulatedOffline: false,
    isSyncing: false,
    pendingMutationsCount: 0,
    lastSyncAt: null,
    lastSyncError: null,
  });

  // Rückmeldungs-Modal / Drawer State
  const [selectedOrderForFeedback, setSelectedOrderForFeedback] = useState<OrderItemView | null>(null);
  const [feedbackDuration, setFeedbackDuration] = useState<number>(45);
  const [feedbackCauseCode, setFeedbackCauseCode] = useState<string>("MECH_VERSCHLEISS");
  const [feedbackCauseDesc, setFeedbackCauseDesc] = useState<string>("");
  const [feedbackResolution, setFeedbackResolution] = useState<string>("");
  const [feedbackCompleted, setFeedbackCompleted] = useState<boolean>(true);
  const [feedbackSuccessMsg, setFeedbackSuccessMsg] = useState<string | null>(null);

  // Sync Manager Listener & Dexie-Cache-Zusammenführung
  useEffect(() => {
    if (!syncManager) return;
    const unsubscribe = syncManager.subscribe((state) => {
      setSyncState(state);
    });
    return () => unsubscribe();
  }, []);

  // Lokale Dexie Orders laden und mit Server-Daten mergen (Offline-First)
  const refreshLocalOrders = async () => {
    if (!localDb) return;
    try {
      const offlineOrders = await localDb.orders.toArray();
      if (offlineOrders && offlineOrders.length > 0) {
        setOrders((prev) => {
          const map = new Map<string, OrderItemView>();
          // 1. Initiale Server Orders
          prev.forEach((o) => map.set(o.id, o));
          // 2. Offline Orders überschreiben bzw. ergänzen
          offlineOrders.forEach((off) => {
            map.set(off.id, {
              id: off.id,
              orderNumber: off.orderNumber,
              title: off.title,
              description: off.description,
              priority: off.priority,
              currentStatusId: off.currentStatusId,
              statusCode: off.statusCode || "OFFLINE_DRAFT",
              statusName: off.statusName || (off.syncStatus === "CREATED_OFFLINE" ? "Offline erfasst" : "Aktualisiert"),
              equipmentId: off.equipmentId,
              equipmentName: off.equipmentName,
              equipmentNumber: off.equipmentNumber,
              assignedToUserId: off.assignedToUserId,
              assignedToName: off.assignedToUserId ? "Hans Meier" : undefined,
              scheduledStartAt: off.scheduledStartAt,
              actualDurationMinutes: off.actualDurationMinutes,
              resolutionSummary: off.description,
              syncStatus: off.syncStatus,
              updatedAt: off.updatedAt,
            });
          });
          return Array.from(map.values());
        });
      }
    } catch (e) {
      console.warn("Laden lokaler Dexie-Aufträge fehlgeschlagen:", e);
    }
  };

  useEffect(() => {
    refreshLocalOrders();
  }, [syncState.pendingMutationsCount]);

  // Gefilterte Aufträge
  const filteredOrders = orders.filter((order) => {
    // 1. Textsuche
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchNum = order.orderNumber.toLowerCase().includes(q);
      const matchTitle = order.title.toLowerCase().includes(q);
      const matchEq = (order.equipmentName || "").toLowerCase().includes(q);
      if (!matchNum && !matchTitle && !matchEq) return false;
    }

    // 2. Status-Filter
    if (statusFilter !== "ALL") {
      if (statusFilter === "OFFLINE" && order.syncStatus === "SYNCED") return false;
      if (statusFilter === "OPEN" && order.statusCode === "CLOSED") return false;
      if (statusFilter === "CLOSED" && order.statusCode !== "CLOSED" && order.statusCode !== "TECH_COMPLETED") return false;
    }

    // 3. Prio-Filter
    if (priorityFilter !== "ALL" && order.priority !== priorityFilter) {
      return false;
    }

    return true;
  });

  // Statistik-Zähler
  const stats = {
    total: orders.length,
    emergency: orders.filter((o) => o.priority === "1_EMERGENCY").length,
    offlineBuffered: orders.filter((o) => o.syncStatus !== "SYNCED").length,
    open: orders.filter((o) => o.statusCode !== "CLOSED" && o.statusCode !== "TECH_COMPLETED").length,
  };

  // Rückmeldung absenden (Offline-First via Dexie oder Server-Action)
  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForFeedback) return;

    const orderId = selectedOrderForFeedback.id;
    const isOffline = !syncState.isOnline;

    startTransition(async () => {
      // 1. OFFLINE ODER SIMULIERT: Dexie Update + Outbox Mutation
      if (isOffline) {
        try {
          if (localDb) {
            // Lokale Order aktualisieren
            const existing = await localDb.orders.get(orderId);
            if (existing) {
              await localDb.orders.update(orderId, {
                actualDurationMinutes: feedbackDuration,
                syncStatus: "UPDATED_OFFLINE",
                updatedAt: new Date().toISOString(),
                statusName: feedbackCompleted ? "Technisch abgeschlossen (Offline)" : "Rückmeldung erfasst",
                statusCode: feedbackCompleted ? "TECH_COMPLETED" : existing.statusCode,
              });
            }

            // In Outbox einreihen
            await syncManager.enqueueMutation({
              tenantId,
              userId: defaultUserId,
              entityType: "TIME_CONFIRMATION",
              action: "UPDATE",
              targetEntityId: orderId,
              payload: {
                actualDurationMinutes: feedbackDuration,
                actualEndAt: new Date().toISOString(),
                causeCode: feedbackCauseCode,
                rootCauseDescription: feedbackCauseDesc,
                resolutionSummary: feedbackResolution,
                currentStatusId: feedbackCompleted ? "stat-tech-completed" : undefined,
              },
            });
          }

          // UI optimistisch aktualisieren
          setOrders((prev) =>
            prev.map((o) =>
              o.id === orderId
                ? {
                    ...o,
                    actualDurationMinutes: feedbackDuration,
                    resolutionSummary: feedbackResolution,
                    causeCode: feedbackCauseCode,
                    syncStatus: "UPDATED_OFFLINE",
                    statusName: feedbackCompleted ? "Technisch abgeschlossen (Offline)" : o.statusName,
                    statusCode: feedbackCompleted ? "TECH_COMPLETED" : o.statusCode,
                  }
                : o
            )
          );

          setFeedbackSuccessMsg("Rückmeldung im lokalen Dexie-Puffer gespeichert (Offline).");
          setTimeout(() => {
            setSelectedOrderForFeedback(null);
            setFeedbackSuccessMsg(null);
          }, 1500);
          return;
        } catch (err: any) {
          console.error("Fehler beim lokalen Puffern der Rückmeldung:", err);
        }
      }

      // 2. ONLINE-MODUS: Server Action completeOrderAction
      try {
        const res = await completeOrderAction({
          orderId,
          userId: defaultUserId,
          actualDurationMinutes: feedbackDuration,
          actualEndAt: new Date().toISOString(),
          causeCode: feedbackCauseCode,
          rootCauseDescription: feedbackCauseDesc,
          resolutionSummary: feedbackResolution,
          comment: `Rückmeldung: ${feedbackResolution}`,
        });

        if (res.success) {
          // Auch in Dexie spiegeln
          if (localDb) {
            await localDb.orders.update(orderId, {
              actualDurationMinutes: feedbackDuration,
              syncStatus: "SYNCED",
              updatedAt: new Date().toISOString(),
              statusCode: "TECH_COMPLETED",
              statusName: "Technisch abgeschlossen",
            }).catch(() => {});
          }

          setOrders((prev) =>
            prev.map((o) =>
              o.id === orderId
                ? {
                    ...o,
                    actualDurationMinutes: feedbackDuration,
                    resolutionSummary: feedbackResolution,
                    causeCode: feedbackCauseCode,
                    syncStatus: "SYNCED",
                    statusCode: "TECH_COMPLETED",
                    statusName: "Technisch abgeschlossen",
                  }
                : o
            )
          );

          setFeedbackSuccessMsg("Rückmeldung & technischer Abschluss erfolgreich gespeichert!");
          toast.success("Rückmeldung & technischer Abschluss erfolgreich gespeichert!");
          setTimeout(() => {
            setSelectedOrderForFeedback(null);
            setFeedbackSuccessMsg(null);
          }, 1500);
        } else {
          toast.error(res.message || "Fehler beim technischen Abschluss.");
        }
      } catch (err: any) {
        // Fallback ins lokale Offline-Puffern
        console.warn("Online-Rückmeldung fehlgeschlagen, speichere in Offline-Puffer:", err);
        if (localDb && syncManager) {
          await syncManager.enqueueMutation({
            tenantId,
            userId: defaultUserId,
            entityType: "TIME_CONFIRMATION",
            action: "UPDATE",
            targetEntityId: orderId,
            payload: {
              actualDurationMinutes: feedbackDuration,
              causeCode: feedbackCauseCode,
              rootCauseDescription: feedbackCauseDesc,
              resolutionSummary: feedbackResolution,
            },
          });
        }
        setFeedbackSuccessMsg("Online-Verbindung fehlgeschlagen. In Dexie Outbox gepuffert.");
        toast.info("Offline-Modus: Rückmeldung im Dexie-Puffer gesichert.");
        setTimeout(() => {
          setSelectedOrderForFeedback(null);
          setFeedbackSuccessMsg(null);
        }, 1500);
      }
    });
  };

  // Statuswechsel im Workflow mit Server Action & Toast Feedback
  const handleTransitionOrderStatus = async (
    order: OrderItemView,
    targetStatusId: string,
    targetStatusCode: string,
    targetStatusName: string
  ) => {
    const prevOrder = { ...order };

    // Optimistische UI-Aktualisierung
    setOrders((prev) =>
      prev.map((o) =>
        o.id === order.id
          ? {
              ...o,
              currentStatusId: targetStatusId,
              statusCode: targetStatusCode,
              statusName: targetStatusName,
              updatedAt: new Date().toISOString(),
            }
          : o
      )
    );

    startTransition(async () => {
      try {
        const res = await transitionOrderStatusAction({
          orderId: order.id,
          targetStatusId,
          userId: defaultUserId,
          comment: `Statuswechsel zu ${targetStatusName} über Leitstand`,
        });

        if (res.success) {
          toast.success(
            `Auftrag ${order.orderNumber}: Status erfolgreich auf "${targetStatusName}" gesetzt.`
          );
        } else {
          // Rollback bei Verstoß gegen Workflow-Guards
          setOrders((prev) => prev.map((o) => (o.id === order.id ? prevOrder : o)));
          toast.error(
            res.error || `Statuswechsel auf "${targetStatusName}" im Workflow nicht zulässig.`
          );
        }
      } catch (err: any) {
        // Rollback
        setOrders((prev) => prev.map((o) => (o.id === order.id ? prevOrder : o)));
        toast.error(
          err?.message || `Serverfehler beim Wechsel zu "${targetStatusName}".`
        );
      }
    });
  };

  const getPriorityBadge = (prio: string) => {
    switch (prio) {
      case "1_EMERGENCY":
        return (
          <Badge className="bg-rose-950/70 border-rose-700 text-rose-300 gap-1 font-semibold">
            <Flame className="h-3 w-3 text-rose-300" />
            Notfall
          </Badge>
        );
      case "2_HIGH":
        return (
          <Badge className="bg-amber-950/70 border-amber-700 text-amber-300 font-medium">
            Hoch
          </Badge>
        );
      case "3_MEDIUM":
        return (
          <Badge className="bg-slate-800 border-slate-700 text-slate-300 font-medium">
            Mittel
          </Badge>
        );
      default:
        return (
          <Badge className="bg-slate-800 border-slate-700 text-slate-300 font-medium">
            Niedrig
          </Badge>
        );
    }
  };

  const getStatusBadge = (statusCode?: string, statusName?: string) => {
    const code = statusCode?.toUpperCase() || "";
    const name = statusName || statusCode || "Offen";
    if (code === "IN_PROGRESS" || code === "IN_WORK" || code === "IN ARBEIT" || code === "WORKING") {
      return (
        <Badge className="bg-amber-950/60 border-amber-700 text-amber-300 gap-1 text-[11px] font-semibold">
          <Clock className="h-3 w-3 text-amber-300" />
          {name}
        </Badge>
      );
    }
    if (code === "COMPLETED" || code === "TECH_COMPLETED" || code === "CLOSED" || code === "TABG") {
      return (
        <Badge className="bg-emerald-950/60 border-emerald-700 text-emerald-300 gap-1 text-[11px] font-semibold">
          <CheckCircle2 className="h-3 w-3 text-emerald-300" />
          {name}
        </Badge>
      );
    }
    return (
      <Badge className="bg-blue-950/60 border-blue-700 text-blue-300 text-[11px] font-medium">
        {name}
      </Badge>
    );
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header Bereich mit Navigation & Modus-Umschaltung */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Wrench className="h-7 w-7 text-cyan-500" />
            Instandhaltungsaufträge & Störungsmanagement
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Zentrale Erfassung, Rückmeldung von Arbeitszeiten & Schadensbildern sowie
            Offline-Synchronisation mit SAP PM.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab("list")}
            className={`flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg text-xs font-semibold transition-all ${
              activeTab === "list"
                ? "bg-cyan-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Auftragsliste ({orders.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("create")}
            className={`flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg text-xs font-semibold transition-all ${
              activeTab === "create"
                ? "bg-cyan-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-cyan-200" />
            <span>+ Neue Störung erfassen</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: AUFTRAGSLISTE & RÜCKMELDUNGEN                                      */}
      {/* ========================================================================= */}
      {activeTab === "list" && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Kennzahlen / Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
            <Card className="p-4 bg-slate-900 border-slate-800">
              <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">
                Offene Störungen
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-white font-mono">{stats.open}</span>
                <span className="text-xs text-slate-400">Positionen</span>
              </div>
            </Card>

            <Card className="p-4 bg-slate-900 border-slate-800">
              <span className="text-[11px] font-medium text-rose-400 block uppercase tracking-wider flex items-center gap-1">
                <Flame className="h-3 w-3" /> Notfälle (Prio 1)
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-rose-400 font-mono">{stats.emergency}</span>
                <span className="text-xs text-slate-400">akut</span>
              </div>
            </Card>

            <Card className="p-4 bg-slate-900 border-slate-800">
              <span className="text-[11px] font-medium text-amber-400 block uppercase tracking-wider flex items-center gap-1">
                <Database className="h-3 w-3" /> Im Offline-Puffer
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-amber-300 font-mono">{stats.offlineBuffered}</span>
                <span className="text-xs text-slate-400">ausstehend</span>
              </div>
            </Card>

            <Card className="p-4 bg-slate-900 border-slate-800">
              <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">
                Gesamtbestand
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-200 font-mono">{stats.total}</span>
                <span className="text-xs text-slate-400">Aufträge</span>
              </div>
            </Card>
          </div>

          {/* Filter- & Suchleiste */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            {/* Suchfeld */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Suche nach Auftrags-Nr., Text oder Anlage (z.B. Pumpe P-101)..."
                className="pl-9 h-9 text-xs bg-slate-950 border-slate-800 focus:border-cyan-500"
              />
            </div>

            {/* Filter Pills mit Mindesthöhe min-h-[44px] */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-11 min-h-[44px] px-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-xs focus:outline-none focus:border-cyan-500"
              >
                <option value="ALL">Status: Alle</option>
                <option value="OPEN">Status: Offen / In Arbeit</option>
                <option value="CLOSED">Status: Abgeschlossen</option>
                <option value="OFFLINE">Status: Nur Offline-Puffer</option>
              </select>

              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="h-11 min-h-[44px] px-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 text-xs focus:outline-none focus:border-cyan-500"
              >
                <option value="ALL">Priorität: Alle</option>
                <option value="1_EMERGENCY">Prio 1: Notfall</option>
                <option value="2_HIGH">Prio 2: Hoch</option>
                <option value="3_MEDIUM">Prio 3: Mittel</option>
                <option value="4_LOW">Prio 4: Niedrig</option>
              </select>

              <Button
                variant="outline"
                size="sm"
                onClick={refreshLocalOrders}
                className="h-9 px-2.5 border-slate-800 text-slate-400 hover:text-white"
                title="Aktualisieren"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Auftrags-Tabelle / Karten-Grid */}
          {filteredOrders.length === 0 ? (
            <Card className="p-12 text-center bg-slate-900 border-slate-800 space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
                <Search className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-white">Keine Aufträge gefunden</p>
              <p className="text-xs text-slate-400">
                Passe die Suchkriterien an oder erfasse eine neue Störungsmeldung.
              </p>
              <Button
                size="sm"
                onClick={() => setActiveTab("create")}
                className="bg-cyan-600 hover:bg-cyan-500 text-xs mt-2"
              >
                + Neue Störung melden
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {filteredOrders.map((order) => {
                const isOfflineBuffered = order.syncStatus !== "SYNCED";

                return (
                  <Card
                    key={order.id}
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (!target.closest("button") && !target.closest("select") && !target.closest("a")) {
                        router.push(`/orders/${order.id}`);
                      }
                    }}
                    className={`p-4 md:p-5 bg-slate-900 border transition-all hover:border-slate-700 cursor-pointer ${
                      isOfflineBuffered
                        ? "border-amber-700/60 bg-amber-950/10"
                        : "border-slate-800"
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      {/* Linke Seite: Details & Titel */}
                      <div className="space-y-2 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/orders/${order.id}`}
                            className="font-mono text-xs font-bold text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700 hover:border-cyan-500 hover:text-cyan-400 transition-colors"
                          >
                            {order.orderNumber}
                          </Link>
                          {getPriorityBadge(order.priority)}

                          {isOfflineBuffered ? (
                            <Badge className="bg-slate-800/80 border-slate-600 text-slate-300 gap-1 text-[11px]">
                              <WifiOff className="h-3 w-3 text-amber-400" />
                              Offline-Puffer (Wartet auf Sync)
                            </Badge>
                          ) : (
                            <Badge className="bg-indigo-950/60 border-indigo-700 text-indigo-300 text-[11px]">
                              <Wifi className="h-3 w-3 text-indigo-300 mr-1" />
                              SAP synchronisiert
                            </Badge>
                          )}

                          {getStatusBadge(order.statusCode, order.statusName)}
                        </div>

                        <div>
                          <Link
                            href={`/orders/${order.id}`}
                            className="text-base font-semibold text-white tracking-tight leading-snug hover:text-cyan-400 transition-colors block"
                          >
                            {order.title}
                          </Link>
                          <p className="text-xs text-slate-400 line-clamp-2 mt-0.5">
                            {order.description}
                          </p>
                        </div>

                        {/* Metadaten: Equipment & Techniker */}
                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1">
                          {order.equipmentName && (
                            <div className="flex items-center gap-1.5 text-slate-300">
                              <Wrench className="h-3.5 w-3.5 text-cyan-400" />
                              <span>{order.equipmentName}</span>
                              {order.equipmentNumber && (
                                <span className="font-mono text-[10px] text-slate-400">
                                  ({order.equipmentNumber})
                                </span>
                              )}
                            </div>
                          )}

                          <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-slate-400" />
                            <span>{order.assignedToName || "Nicht disponiert"}</span>
                          </div>

                          {order.actualDurationMinutes && (
                            <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                              <Clock className="h-3.5 w-3.5" />
                              <span>{order.actualDurationMinutes} Min. rückgemeldet</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Rechte Seite: Aktions-Buttons & Workflow-Statuswechsel */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0 self-end md:self-center">
                        {/* Quick-Action: In Arbeit */}
                        {order.statusCode === "OPEN" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              handleTransitionOrderStatus(
                                order,
                                "stat-in-work",
                                "IN_WORK",
                                "In Arbeit"
                              )
                            }
                            className="h-11 min-h-[44px] px-3 text-xs border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-200 hover:text-white gap-1"
                            title="Workflow: In Bearbeitung nehmen"
                          >
                            <Play className="h-3 w-3 text-emerald-400 fill-emerald-400" />
                            <span>In Arbeit</span>
                          </Button>
                        )}

                        {/* Workflow Status Direkt-Umschalter */}
                        <select
                          value={order.statusCode || "OPEN"}
                          onChange={(e) => {
                            const newCode = e.target.value;
                            const statusMap: Record<string, { id: string; name: string }> = {
                              OPEN: { id: "stat-open", name: "Freigegeben" },
                              IN_WORK: { id: "stat-in-work", name: "In Arbeit" },
                              TECH_COMPLETED: {
                                id: "stat-tech-completed",
                                name: "Technisch abgeschlossen",
                              },
                              CLOSED: { id: "stat-closed", name: "Abgeschlossen" },
                            };
                            const target = statusMap[newCode];
                            if (target && target.id !== order.currentStatusId) {
                              handleTransitionOrderStatus(order, target.id, newCode, target.name);
                            }
                          }}
                          className="h-11 min-h-[44px] rounded-md bg-slate-950 border border-slate-800 text-[11px] text-slate-300 px-2 hover:border-slate-700 cursor-pointer focus:outline-none focus:ring-1 focus:ring-cyan-500"
                          title="Workflow-Status wechseln"
                        >
                          <option value="OPEN">Offen / Freigegeben</option>
                          <option value="IN_WORK">In Arbeit</option>
                          <option value="TECH_COMPLETED">Technisch abgeschlossen</option>
                          <option value="CLOSED">Abgeschlossen</option>
                        </select>

                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => {
                            setSelectedOrderForFeedback(order);
                            setFeedbackDuration(order.actualDurationMinutes || 45);
                            setFeedbackResolution(order.resolutionSummary || "");
                          }}
                          className="h-11 min-h-[44px] px-3.5 text-xs bg-cyan-600 hover:bg-cyan-500 text-white gap-1.5 shadow-sm"
                        >
                          <Clock className="h-3.5 w-3.5 text-cyan-200" />
                          <span>Rückmelden</span>
                        </Button>

                        <Link
                          href={`/orders/${order.id}`}
                          className="h-11 min-h-[44px] px-3.5 rounded-md border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white inline-flex items-center gap-1 text-xs font-medium transition-colors"
                          title="Auftragsdetails & Historie öffnen"
                        >
                          <ExternalLink className="h-3 w-3 text-slate-400" />
                          <span>Details</span>
                        </Link>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: NEUE STÖRUNG ERFASSEN (EMBEDDED)                                   */}
      {/* ========================================================================= */}
      {activeTab === "create" && (
        <div className="animate-in fade-in duration-150">
          <CreateOrderForm
            tenantId={tenantId}
            equipments={equipments}
            defaultUserId={defaultUserId}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* RÜCKMELDUNGS-MODAL (OFFLINE-FÄHIG)                                        */}
      {/* ========================================================================= */}
      {selectedOrderForFeedback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between border-b border-slate-800 pb-3">
              <div>
                <span className="text-[11px] font-mono text-cyan-400 font-semibold uppercase tracking-wider block">
                  Rückmeldung erfassen · {selectedOrderForFeedback.orderNumber}
                </span>
                <h3 className="text-base font-bold text-white mt-0.5">
                  {selectedOrderForFeedback.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderForFeedback(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {feedbackSuccessMsg ? (
              <div className="py-8 text-center space-y-2">
                <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto animate-bounce" />
                <p className="text-sm font-semibold text-white">{feedbackSuccessMsg}</p>
              </div>
            ) : (
              <form onSubmit={handleSubmitFeedback} className="space-y-4 text-xs">
                {/* Tatsächliche Arbeitszeit */}
                <div className="space-y-1.5">
                  <Label className="text-slate-300">Geleistete Arbeitszeit (Minuten):</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={5}
                      step={5}
                      value={feedbackDuration}
                      onChange={(e) => setFeedbackDuration(parseInt(e.target.value) || 0)}
                      required
                      className="bg-slate-950 border-slate-800 text-white font-mono"
                    />
                    <span className="text-slate-400 text-xs shrink-0">
                      ≈ {(feedbackDuration / 60).toFixed(1)} Std.
                    </span>
                  </div>
                </div>

                {/* Schadensursache Code */}
                <div className="space-y-1.5">
                  <Label className="text-slate-300">Schadensursache (Katalog):</Label>
                  <select
                    value={feedbackCauseCode}
                    onChange={(e) => setFeedbackCauseCode(e.target.value)}
                    className="w-full h-11 min-h-[44px] rounded-lg px-3 bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none focus:border-cyan-500"
                  >
                    <option value="MECH_VERSCHLEISS">Mechanischer Verschleiß / Reibung</option>
                    <option value="DICHTUNG_DEFEKT">Dichtungsschaden / Leckage</option>
                    <option value="ELEKTRISCH">Elektrischer Defekt / Sensorik</option>
                    <option value="SCHMIERMANGEL">Schmiermittelmangel / Trockenlauf</option>
                    <option value="MATERIALFEHLER">Materialermüdung / Bruch</option>
                    <option value="FEHLBEDIENUNG">Bedienfehler / Überlast</option>
                  </select>
                </div>

                {/* Detaillierte Ursachenbeschreibung */}
                <div className="space-y-1.5">
                  <Label className="text-slate-300">Befund / Ursache im Detail:</Label>
                  <Input
                    value={feedbackCauseDesc}
                    onChange={(e) => setFeedbackCauseDesc(e.target.value)}
                    placeholder="z.B. Gleitring durch Fremdkörper im Fördermedium beschädigt"
                    className="bg-slate-950 border-slate-800 text-white text-xs"
                  />
                </div>

                {/* Durchgeführte Reparaturmaßnahme */}
                <div className="space-y-1.5">
                  <Label className="text-slate-300">Durchgeführte Instandsetzungsmaßnahme:</Label>
                  <textarea
                    rows={3}
                    value={feedbackResolution}
                    onChange={(e) => setFeedbackResolution(e.target.value)}
                    required
                    placeholder="z.B. Gleitringdichtung EagleBurgmann ausgetauscht, Pumpenkammer gereinigt, 15 Min Probelauf ohne Druckabfall abgeschlossen."
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Technischer Abschluss Checkbox */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="techCompleted"
                    checked={feedbackCompleted}
                    onChange={(e) => setFeedbackCompleted(e.target.checked)}
                    className="rounded bg-slate-950 border-slate-800 text-blue-600 focus:ring-cyan-500"
                  />
                  <label htmlFor="techCompleted" className="text-slate-300 font-medium cursor-pointer">
                    Auftrag technisch abschließen (Status TABG an SAP melden)
                  </label>
                </div>

                {/* Offline-Hinweis */}
                {!syncState.isOnline && (
                  <div className="rounded-lg bg-amber-950/50 border border-amber-800/80 p-2.5 flex items-center gap-2 text-amber-300 text-[11px]">
                    <WifiOff className="h-4 w-4 shrink-0 text-amber-400" />
                    <span>
                      Offline-Modus aktiv: Rückmeldung wird lokal im Dexie Outbox-Puffer gesichert und automatisch synchronisiert, sobald wieder Verbindung besteht.
                    </span>
                  </div>
                )}

                <div className="border-t border-slate-800 pt-4 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelectedOrderForFeedback(null)}
                    className="border-slate-700 text-xs min-h-[44px] h-11 px-4"
                  >
                    Abbrechen
                  </Button>

                  <Button
                    type="submit"
                    disabled={isPending}
                    className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs min-h-[44px] h-11 px-4 gap-1.5"
                  >
                    {isPending ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    <span>Rückmeldung buchen</span>
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
