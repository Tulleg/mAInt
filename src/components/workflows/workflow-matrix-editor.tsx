"use client";

import * as React from "react";
import { useState, useTransition, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createOrderTypeAction,
  createOrderStatusAction,
  deleteOrderStatusAction,
  saveWorkflowMatrixAction,
} from "@/actions/workflow-actions";
import {
  Wrench,
  ShieldCheck,
  Plus,
  RefreshCw,
  ArrowRight,
  Lock,
  Layers,
  Settings,
  Database,
  CheckCircle2,
  AlertTriangle,
  Save,
  Trash2,
  X,
  FileCheck,
  Clock,
  FileCode,
  PenTool,
  Check,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";

export interface StatusItem {
  id: string;
  code: string;
  name: string;
  category: string;
  colorHex: string;
  sapSystemStatusCode?: string | null;
  isInitialStatus?: boolean;
  isTerminalStatus?: boolean;
  locksOrderEditing?: boolean;
  triggersSapCompletion?: boolean;
  sortOrder?: number;
}

export interface OrderTypeItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  sapOrderTypeCode: string | null;
  colorHex: string;
}

export interface RoleItem {
  id: string;
  code: string;
  name: string;
}

export interface TransitionItem {
  id?: string;
  orderTypeId: string;
  fromStatusId: string;
  toStatusId: string;
  requiredRoleId: string | null;
  actionName: string;
  isActive: boolean;
  triggersSapSync?: boolean;
  triggerSapSync?: boolean;
  requireChecklist?: boolean;
  requireTimeEntry?: boolean;
  requireRootCause?: boolean;
  requireSignature?: boolean;
  guardConditions?: {
    requireChecklistCompleted?: boolean;
    requireRootCauseFilled?: boolean;
    requireActualDurationFilled?: boolean;
    requireDigitalSignature?: boolean;
    requireDamageCode?: boolean;
  };
}

interface WorkflowMatrixEditorProps {
  tenantId: string;
  orderTypes: OrderTypeItem[];
  statuses: StatusItem[];
  roles: RoleItem[];
  transitions: TransitionItem[];
}

interface CellState {
  isEnabled: boolean;
  actionName: string;
  requiredRoleId: string; // "ALL", roleId, or role code
  requireChecklist: boolean;
  requireTimeEntry: boolean;
  requireRootCause: boolean;
  requireSignature: boolean;
  triggersSapSync: boolean;
}

export function WorkflowMatrixEditor({
  tenantId,
  orderTypes: initialOrderTypes,
  statuses: initialStatuses,
  roles,
  transitions: initialTransitions,
}: WorkflowMatrixEditorProps) {
  const [orderTypes, setOrderTypes] = useState<OrderTypeItem[]>(initialOrderTypes);
  const [statuses, setStatuses] = useState<StatusItem[]>(initialStatuses);
  const [selectedOrderTypeId, setSelectedOrderTypeId] = useState<string>(
    initialOrderTypes[0]?.id || ""
  );

  // Modals state
  const [showAddOrderType, setShowAddOrderType] = useState(false);
  const [showAddStatusModal, setShowAddStatusModal] = useState(false);

  // Transition / Save state
  const [isPending, startTransition] = useTransition();
  const [isSavingMatrix, setIsSavingMatrix] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // New Status Form State
  const [newStatusCode, setNewStatusCode] = useState("");
  const [newStatusName, setNewStatusName] = useState("");
  const [newStatusCategory, setNewStatusCategory] = useState("IN_PROGRESS");
  const [newStatusColor, setNewStatusColor] = useState("#3B82F6");
  const [newStatusSapCode, setNewStatusSapCode] = useState("");
  const [newStatusIsInitial, setNewStatusIsInitial] = useState(false);
  const [newStatusIsTerminal, setNewStatusIsTerminal] = useState(false);
  const [newStatusLocksEditing, setNewStatusLocksEditing] = useState(false);
  const [newStatusTriggersSap, setNewStatusTriggersSap] = useState(false);

  const selectedOrderType = orderTypes.find((ot) => ot.id === selectedOrderTypeId);

  // Initialize Matrix State per (fromStatusId -> toStatusId)
  const [matrixState, setMatrixState] = useState<Record<string, CellState>>(() => {
    const map: Record<string, CellState> = {};
    for (const t of initialTransitions) {
      if (t.orderTypeId === (initialOrderTypes[0]?.id || "") && t.isActive) {
        const key = `${t.fromStatusId}->${t.toStatusId}`;
        const guards = t.guardConditions || {};
        map[key] = {
          isEnabled: true,
          actionName: t.actionName || "Status wechseln",
          requiredRoleId: t.requiredRoleId || "ALL",
          requireChecklist: Boolean(t.requireChecklist || guards.requireChecklistCompleted),
          requireTimeEntry: Boolean(t.requireTimeEntry || guards.requireActualDurationFilled),
          requireRootCause: Boolean(t.requireRootCause || guards.requireRootCauseFilled || guards.requireDamageCode),
          requireSignature: Boolean(t.requireSignature || guards.requireDigitalSignature),
          triggersSapSync: Boolean(t.triggersSapSync || t.triggerSapSync),
        };
      }
    }
    return map;
  });

  // When order type changes, reload transitions for that type
  const handleSelectOrderType = (newOrderTypeId: string) => {
    setSelectedOrderTypeId(newOrderTypeId);
    setHasUnsavedChanges(false);

    const map: Record<string, CellState> = {};
    for (const t of initialTransitions) {
      if (t.orderTypeId === newOrderTypeId && t.isActive) {
        const key = `${t.fromStatusId}->${t.toStatusId}`;
        const guards = t.guardConditions || {};
        map[key] = {
          isEnabled: true,
          actionName: t.actionName || "Status wechseln",
          requiredRoleId: t.requiredRoleId || "ALL",
          requireChecklist: Boolean(t.requireChecklist || guards.requireChecklistCompleted),
          requireTimeEntry: Boolean(t.requireTimeEntry || guards.requireActualDurationFilled),
          requireRootCause: Boolean(t.requireRootCause || guards.requireRootCauseFilled || guards.requireDamageCode),
          requireSignature: Boolean(t.requireSignature || guards.requireDigitalSignature),
          triggersSapSync: Boolean(t.triggersSapSync || t.triggerSapSync),
        };
      }
    }
    setMatrixState(map);
  };

  const getCell = (fromId: string, toId: string): CellState => {
    const key = `${fromId}->${toId}`;
    return (
      matrixState[key] || {
        isEnabled: false,
        actionName: "",
        requiredRoleId: "ALL",
        requireChecklist: false,
        requireTimeEntry: false,
        requireRootCause: false,
        requireSignature: false,
        triggersSapSync: false,
      }
    );
  };

  const updateCell = (fromId: string, toId: string, updates: Partial<CellState>) => {
    const key = `${fromId}->${toId}`;
    setMatrixState((prev) => {
      const current = prev[key] || {
        isEnabled: false,
        actionName: "",
        requiredRoleId: "ALL",
        requireChecklist: false,
        requireTimeEntry: false,
        requireRootCause: false,
        requireSignature: false,
        triggersSapSync: false,
      };

      const nextCell: CellState = { ...current, ...updates };

      // Auto-populate default action name if turning on and name is empty
      if (updates.isEnabled && !nextCell.actionName) {
        const fromSt = statuses.find((s) => s.id === fromId);
        const toSt = statuses.find((s) => s.id === toId);
        nextCell.actionName = `${toSt?.name || "Status wechseln"}`;
      }

      return {
        ...prev,
        [key]: nextCell,
      };
    });
    setHasUnsavedChanges(true);
  };

  // Save the entire matrix to DB
  const handleSaveMatrix = async () => {
    if (!selectedOrderTypeId) {
      toast.error("Keine Auftragsart ausgewählt.");
      return;
    }

    setIsSavingMatrix(true);
    startTransition(async () => {
      try {
        const activeEntries = Object.entries(matrixState).filter(([_, cell]) => cell.isEnabled);

        const transitionsToSave = activeEntries.map(([key, cell]) => {
          const [fromStatusId, toStatusId] = key.split("->");
          return {
            fromStatusId,
            toStatusId,
            actionName: cell.actionName?.trim() || "Status wechseln",
            requiredRoleId: cell.requiredRoleId === "ALL" ? null : cell.requiredRoleId,
            requireChecklist: cell.requireChecklist,
            requireTimeEntry: cell.requireTimeEntry,
            requireRootCause: cell.requireRootCause,
            requireSignature: cell.requireSignature,
            triggerSapSync: cell.triggersSapSync,
            triggersSapSync: cell.triggersSapSync,
            guardConditions: {
              requireChecklistCompleted: cell.requireChecklist,
              requireActualDurationFilled: cell.requireTimeEntry,
              requireRootCauseFilled: cell.requireRootCause,
              requireDigitalSignature: cell.requireSignature,
              requireDamageCode: cell.requireRootCause,
            },
            isActive: true,
          };
        });

        const res = await saveWorkflowMatrixAction(selectedOrderTypeId, transitionsToSave, {
          tenantId,
        });

        if (res.success) {
          toast.success(
            `Workflow-Matrix für '${selectedOrderType?.code || "Auftragsart"}' (${transitionsToSave.length} Übergänge) erfolgreich gespeichert!`
          );
          setHasUnsavedChanges(false);
        } else {
          toast.error(`Fehler beim Speichern der Matrix: ${res.error}`);
        }
      } catch (err: any) {
        toast.error(`Speichern fehlgeschlagen: ${err?.message || String(err)}`);
      } finally {
        setIsSavingMatrix(false);
      }
    });
  };

  // Create new order status
  const handleCreateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStatusCode.trim() || !newStatusName.trim()) {
      toast.error("Bitte Kürzel und Name für das Stadium angeben.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await createOrderStatusAction({
          tenantId,
          code: newStatusCode.trim().toUpperCase(),
          name: newStatusName.trim(),
          category: newStatusCategory,
          colorHex: newStatusColor,
          sapSystemStatusCode: newStatusSapCode.trim().toUpperCase() || null,
          isInitialStatus: newStatusIsInitial,
          isTerminalStatus: newStatusIsTerminal,
          locksOrderEditing: newStatusLocksEditing,
          triggersSapCompletion: newStatusTriggersSap,
        });

        if (res.success && res.status) {
          setStatuses((prev) => [...prev, res.status]);
          toast.success(`Auftragsstadium '${res.status.name}' erfolgreich angelegt.`);
          setShowAddStatusModal(false);
          // Reset form
          setNewStatusCode("");
          setNewStatusName("");
          setNewStatusCategory("IN_PROGRESS");
          setNewStatusSapCode("");
          setNewStatusIsInitial(false);
          setNewStatusIsTerminal(false);
          setNewStatusLocksEditing(false);
          setNewStatusTriggersSap(false);
        } else {
          toast.error(res.error || "Fehler beim Anlegen des Auftragsstatus.");
        }
      } catch (err: any) {
        toast.error(err?.message || "Fehler beim Anlegen des Stadiums.");
      }
    });
  };

  // Delete status
  const handleDeleteStatus = async (statusId: string, statusName: string) => {
    if (!confirm(`Soll das Stadium '${statusName}' wirklich gelöscht werden?`)) return;

    startTransition(async () => {
      try {
        const res = await deleteOrderStatusAction(statusId);
        if (res.success) {
          setStatuses((prev) => prev.filter((s) => s.id !== statusId));
          toast.success(`Stadium '${statusName}' erfolgreich gelöscht.`);
        } else {
          toast.error(res.error || "Löschen fehlgeschlagen.");
        }
      } catch (err: any) {
        toast.error(err?.message || "Fehler beim Löschen.");
      }
    });
  };

  // Active transitions count for selected order type
  const activeTransitionsCount = useMemo(() => {
    return Object.values(matrixState).filter((c) => c.isEnabled).length;
  }, [matrixState]);

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. AUSWAHL DER AUFTRAGSART & ACTIONS                                      */}
      {/* ========================================================================= */}
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardContent className="p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                1. Auftragsart auswählen
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[280px]">
                  <select
                    value={selectedOrderTypeId}
                    onChange={(e) => handleSelectOrderType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 hover:border-slate-400 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer appearance-none pr-10"
                  >
                    {orderTypes.map((ot) => (
                      <option key={ot.id} value={ot.id}>
                        {ot.code} — {ot.name} {ot.sapOrderTypeCode ? `(SAP: ${ot.sapOrderTypeCode})` : ""}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3.5 top-3.5 h-4 w-4 text-slate-500 pointer-events-none" />
                </div>

                {selectedOrderType && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-xs font-mono">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: selectedOrderType.colorHex }}
                    />
                    <span className="font-bold text-slate-800">{selectedOrderType.code}</span>
                    {selectedOrderType.sapOrderTypeCode && (
                      <span className="text-slate-500">SAP: {selectedOrderType.sapOrderTypeCode}</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddOrderType(!showAddOrderType)}
                className="gap-2 border-slate-300 text-slate-700 hover:bg-slate-100 min-h-[40px]"
              >
                <Plus className="h-4 w-4 text-blue-600" />
                Neue Auftragsart
              </Button>

              <Button
                onClick={handleSaveMatrix}
                disabled={isSavingMatrix || isPending}
                className={`gap-2 min-h-[40px] px-5 font-semibold text-white transition-all shadow-sm ${
                  hasUnsavedChanges
                    ? "bg-blue-600 hover:bg-blue-700 ring-2 ring-blue-300 animate-pulse"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                <Save className="h-4 w-4" />
                {isSavingMatrix ? "Speichern..." : "Workflow-Matrix speichern"}
              </Button>
            </div>
          </div>

          {/* Formular für neue Auftragsart */}
          {showAddOrderType && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <Layers className="h-4 w-4 text-blue-600" />
                    Neue Auftragsart anlegen
                  </h4>
                  <button
                    onClick={() => setShowAddOrderType(false)}
                    className="text-slate-400 hover:text-slate-600 p-1"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <form
                  action={async (formData) => {
                    formData.append("tenantId", tenantId);
                    startTransition(async () => {
                      try {
                        const res = await createOrderTypeAction(formData);
                        if (res.success && res.data?.orderType) {
                          setOrderTypes((prev) => [...prev, res.data.orderType]);
                          setSelectedOrderTypeId(res.data.orderType.id);
                          setShowAddOrderType(false);
                          toast.success(`Auftragsart '${res.data.orderType.code}' erfolgreich angelegt.`);
                        } else {
                          toast.error(res.error || "Fehler beim Anlegen der Auftragsart.");
                        }
                      } catch (err: any) {
                        toast.error(err?.message || "Fehler beim Erstellen der Auftragsart.");
                      }
                    });
                  }}
                  className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs"
                >
                  <div>
                    <Label htmlFor="code" className="text-slate-700">Kürzel (z.B. IH03) *</Label>
                    <Input
                      id="code"
                      name="code"
                      placeholder="IH03"
                      required
                      className="mt-1 bg-white font-mono uppercase"
                    />
                  </div>
                  <div>
                    <Label htmlFor="name" className="text-slate-700">Bezeichnung *</Label>
                    <Input
                      id="name"
                      name="name"
                      placeholder="z.B. Gesetzliche Prüfung"
                      required
                      className="mt-1 bg-white"
                    />
                  </div>
                  <div>
                    <Label htmlFor="sapOrderTypeCode" className="text-slate-700">SAP AUART (optional)</Label>
                    <Input
                      id="sapOrderTypeCode"
                      name="sapOrderTypeCode"
                      placeholder="z.B. PM03"
                      className="mt-1 bg-white font-mono uppercase"
                    />
                  </div>
                  <div>
                    <Label htmlFor="colorHex" className="text-slate-700">Farbe (Hex-Code)</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        id="colorHex"
                        name="colorHex"
                        defaultValue="#10B981"
                        className="bg-white font-mono"
                      />
                      <Button type="submit" disabled={isPending} className="bg-blue-600 text-white">
                        Anlegen
                      </Button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ========================================================================= */}
      {/* 2. VERWALTUNG DER AUFTRAGSSTADIEN                                         */}
      {/* ========================================================================= */}
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardHeader className="pb-3 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Settings className="h-5 w-5 text-blue-600" />
                2. Verwaltung der Auftragsstadien
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 mt-0.5">
                Definiere Lebenszyklus-Stadien (Status) für Aufträge mit Farbkennzeichnung, Typ-Kategorie und System-Attributen.
              </CardDescription>
            </div>
            <Button
              onClick={() => setShowAddStatusModal(true)}
              size="sm"
              className="gap-2 bg-slate-900 hover:bg-slate-800 text-white min-h-[36px]"
            >
              <Plus className="h-4 w-4" />
              Neues Stadium hinzufügen
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {statuses.map((status) => {
              const categoryBadgeColor =
                status.category === "INITIAL" || status.category === "DRAFT"
                  ? "bg-slate-100 text-slate-700 border-slate-200"
                  : status.category === "OPEN"
                  ? "bg-blue-100 text-blue-800 border-blue-200"
                  : status.category === "IN_PROGRESS"
                  ? "bg-amber-100 text-amber-800 border-amber-200"
                  : status.category === "COMPLETED"
                  ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                  : "bg-purple-100 text-purple-800 border-purple-200";

              return (
                <div
                  key={status.id}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-white hover:shadow-sm transition-all relative group flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full shrink-0 shadow-xs"
                          style={{ backgroundColor: status.colorHex || "#64748B" }}
                        />
                        <span className="font-mono font-bold text-xs text-slate-900">
                          {status.code}
                        </span>
                      </div>
                      <Badge variant="outline" className={`text-[10px] uppercase font-semibold ${categoryBadgeColor}`}>
                        {status.category}
                      </Badge>
                    </div>

                    <h4 className="text-xs font-semibold text-slate-800 leading-tight">
                      {status.name}
                    </h4>

                    {/* Flags / Attribute */}
                    <div className="flex flex-wrap gap-1 text-[10px] text-slate-500 pt-1">
                      {status.isInitialStatus && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                          🏁 Initial
                        </span>
                      )}
                      {status.locksOrderEditing && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                          🔒 Gesperrt
                        </span>
                      )}
                      {status.triggersSapCompletion && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                          ⚡ SAP TABG
                        </span>
                      )}
                      {status.isTerminalStatus && (
                        <span className="px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
                          🛑 Terminal
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="font-mono">{status.sapSystemStatusCode ? `SAP: ${status.sapSystemStatusCode}` : "Lokal"}</span>
                    {!["CREATED", "RELEASED", "IN_WORK", "TECH_COMPLETED", "CLOSED"].includes(status.code) && (
                      <button
                        onClick={() => handleDeleteStatus(status.id, status.name)}
                        className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                        title="Stadium löschen"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ========================================================================= */}
      {/* 3. INTERAKTIVE WORKFLOW-MATRIX (KREUZTABELLE)                             */}
      {/* ========================================================================= */}
      <Card className="bg-white border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/50 pb-4 border-b border-slate-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-blue-600" />
                <CardTitle className="text-base font-bold text-slate-900">
                  3. Interaktive Workflow-Matrix (Kreuztabelle)
                </CardTitle>
                <Badge variant="outline" className="ml-2 bg-blue-50 text-blue-700 border-blue-200 text-xs">
                  {selectedOrderType?.code || "IH01"}
                </Badge>
                {hasUnsavedChanges && (
                  <Badge className="bg-amber-100 text-amber-800 border-amber-300 text-xs animate-pulse">
                    Ungespeicherte Änderungen
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs text-slate-500 mt-1">
                Zeilen: <strong>Ausgangs-Status (Von)</strong> ➔ Spalten: <strong>Ziel-Status (Nach)</strong>.
                Konfiguriere Status-Schalter, berechtigte Rollen und Guard-Bedingungen pro Übergang.
              </CardDescription>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-600">
                Aktive Übergänge: <strong className="text-blue-600 font-mono">{activeTransitionsCount}</strong>
              </span>
              <Button
                onClick={handleSaveMatrix}
                disabled={isSavingMatrix || isPending}
                size="sm"
                className="gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs"
              >
                <Save className="h-4 w-4" />
                {isSavingMatrix ? "Speichern..." : "Workflow-Matrix speichern"}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-3.5 sticky left-0 z-20 bg-slate-100 border-r border-slate-200 min-w-[200px]">
                    <div className="flex items-center justify-between">
                      <span>Ausgangs-Status (Von)</span>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                    </div>
                    <span className="text-[10px] text-slate-400 font-normal block mt-0.5">
                      Ziel-Status (Nach) ➔
                    </span>
                  </th>
                  {statuses.map((toSt) => (
                    <th
                      key={toSt.id}
                      className="p-3.5 text-center min-w-[320px] max-w-[360px] border-r border-slate-200 last:border-r-0"
                    >
                      <div className="flex items-center justify-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: toSt.colorHex }}
                        />
                        <span className="font-bold text-slate-900">{toSt.name}</span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-500 font-normal block mt-0.5">
                        {toSt.code} ({toSt.category})
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {statuses.map((fromSt) => (
                  <tr key={fromSt.id} className="hover:bg-slate-50/50 transition-colors">
                    {/* Sticky Row Header */}
                    <td className="p-3.5 sticky left-0 z-10 bg-slate-50 border-r border-slate-200 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: fromSt.colorHex }}
                        />
                        <div>
                          <p className="font-bold text-slate-900 text-xs">{fromSt.name}</p>
                          <span className="font-mono text-[10px] text-slate-500">{fromSt.code}</span>
                        </div>
                      </div>
                    </td>

                    {/* Column Cells */}
                    {statuses.map((toSt) => {
                      const isSame = fromSt.id === toSt.id;
                      const cell = getCell(fromSt.id, toSt.id);

                      // Self transition blocked
                      if (isSame) {
                        return (
                          <td
                            key={toSt.id}
                            className="p-3 text-center bg-slate-50/80 border-r border-slate-200 last:border-r-0 text-slate-400 font-mono text-[11px]"
                          >
                            <span className="text-slate-300 select-none">—</span>
                          </td>
                        );
                      }

                      return (
                        <td
                          key={toSt.id}
                          className={`p-3 border-r border-slate-200 last:border-r-0 align-top transition-colors ${
                            cell.isEnabled
                              ? "bg-blue-50/20 hover:bg-blue-50/40"
                              : "bg-white hover:bg-slate-50/60"
                          }`}
                        >
                          <div className="space-y-3">
                            {/* Status-Schalter: Aktiviert / Deaktiviert */}
                            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                              <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={cell.isEnabled}
                                  onChange={(e) =>
                                    updateCell(fromSt.id, toSt.id, {
                                      isEnabled: e.target.checked,
                                    })
                                  }
                                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                />
                                <span
                                  className={`text-xs font-bold ${
                                    cell.isEnabled ? "text-blue-700" : "text-slate-500"
                                  }`}
                                >
                                  {cell.isEnabled ? "Aktiviert" : "Deaktiviert"}
                                </span>
                              </label>

                              {cell.isEnabled && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                                  Aktiv
                                </span>
                              )}
                            </div>

                            {/* Wenn aktiv: Konfigurations-Controls */}
                            {cell.isEnabled ? (
                              <div className="space-y-2.5 animate-in fade-in duration-100">
                                {/* Aktionsname Input */}
                                <div>
                                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                                    Button-Aktionsname:
                                  </label>
                                  <Input
                                    value={cell.actionName}
                                    placeholder={`${toSt.name}`}
                                    onChange={(e) =>
                                      updateCell(fromSt.id, toSt.id, {
                                        actionName: e.target.value,
                                      })
                                    }
                                    className="h-8 text-xs bg-white border-slate-300 text-slate-900 focus:ring-blue-500"
                                  />
                                </div>

                                {/* Berechtigte Rolle Dropdown */}
                                <div>
                                  <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                                    Berechtigte Rolle:
                                  </label>
                                  <select
                                    value={cell.requiredRoleId}
                                    onChange={(e) =>
                                      updateCell(fromSt.id, toSt.id, {
                                        requiredRoleId: e.target.value,
                                      })
                                    }
                                    className="w-full h-8 rounded-lg bg-white border border-slate-300 px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  >
                                    <option value="ALL">🌐 Jeder (Alle Rollen)</option>
                                    <option value="TECHNICIAN">🔧 TECHNICIAN (Servicetechniker)</option>
                                    <option value="COORDINATOR">📋 COORDINATOR (Planer / Meister)</option>
                                    <option value="ADMIN">🔒 ADMIN (Administrator)</option>
                                    {roles
                                      .filter(
                                        (r) =>
                                          !["TECHNICIAN", "COORDINATOR", "ADMIN"].includes(
                                            r.code.toUpperCase()
                                          )
                                      )
                                      .map((role) => (
                                        <option key={role.id} value={role.id}>
                                          👤 {role.name} ({role.code})
                                        </option>
                                      ))}
                                  </select>
                                </div>

                                {/* Checkboxen für Guard-Bedingungen */}
                                <div className="pt-1.5 space-y-1.5 border-t border-slate-200">
                                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                                    Pflicht-Guards vor Wechsel:
                                  </span>

                                  {/* Guard 1: Prüfprotokoll / Checkliste */}
                                  <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-slate-700 hover:text-slate-900">
                                    <input
                                      type="checkbox"
                                      checked={cell.requireChecklist}
                                      onChange={(e) =>
                                        updateCell(fromSt.id, toSt.id, {
                                          requireChecklist: e.target.checked,
                                        })
                                      }
                                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <FileCheck className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                    <span>Prüfprotokoll / Checkliste Pflicht</span>
                                  </label>

                                  {/* Guard 2: Zeiterfassung */}
                                  <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-slate-700 hover:text-slate-900">
                                    <input
                                      type="checkbox"
                                      checked={cell.requireTimeEntry}
                                      onChange={(e) =>
                                        updateCell(fromSt.id, toSt.id, {
                                          requireTimeEntry: e.target.checked,
                                        })
                                      }
                                      className="h-3.5 w-3.5 rounded border-slate-300 text-amber-600 focus:ring-blue-500"
                                    />
                                    <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                    <span>Zeiterfassung Pflicht</span>
                                  </label>

                                  {/* Guard 3: Ursachen- & Schadenscode */}
                                  <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-slate-700 hover:text-slate-900">
                                    <input
                                      type="checkbox"
                                      checked={cell.requireRootCause}
                                      onChange={(e) =>
                                        updateCell(fromSt.id, toSt.id, {
                                          requireRootCause: e.target.checked,
                                        })
                                      }
                                      className="h-3.5 w-3.5 rounded border-slate-300 text-purple-600 focus:ring-blue-500"
                                    />
                                    <FileCode className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                                    <span>Ursachen- & Schadenscode Pflicht</span>
                                  </label>

                                  {/* Guard 4: Digitale Unterschrift */}
                                  <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-slate-700 hover:text-slate-900">
                                    <input
                                      type="checkbox"
                                      checked={cell.requireSignature}
                                      onChange={(e) =>
                                        updateCell(fromSt.id, toSt.id, {
                                          requireSignature: e.target.checked,
                                        })
                                      }
                                      className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-blue-500"
                                    />
                                    <PenTool className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                                    <span>Digitale Unterschrift Pflicht</span>
                                  </label>

                                  {/* Guard 5: SAP-Sync auslösen */}
                                  <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-slate-700 hover:text-slate-900">
                                    <input
                                      type="checkbox"
                                      checked={cell.triggersSapSync}
                                      onChange={(e) =>
                                        updateCell(fromSt.id, toSt.id, {
                                          triggersSapSync: e.target.checked,
                                        })
                                      }
                                      className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-blue-500"
                                    />
                                    <RefreshCw className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                    <span className="font-semibold text-emerald-800">
                                      SAP-Sync auslösen (z. B. TABG)
                                    </span>
                                  </label>
                                </div>
                              </div>
                            ) : (
                              <p className="text-[11px] text-slate-400 italic">
                                Übergang gesperrt. Klicke auf Aktivieren, um diesen Pfad freizugeben.
                              </p>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ========================================================================= */}
      {/* MODAL: NEUES STADIUM HINZUFÜGEN                                           */}
      {/* ========================================================================= */}
      {showAddStatusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Plus className="h-5 w-5 text-blue-600" />
                Neues Auftragsstadium anlegen
              </h3>
              <button
                onClick={() => setShowAddStatusModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStatus} className="space-y-4 pt-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="st-code" className="text-slate-700">Status-Kürzel *</Label>
                  <Input
                    id="st-code"
                    value={newStatusCode}
                    onChange={(e) => setNewStatusCode(e.target.value.toUpperCase())}
                    placeholder="z.B. QS_PRUEFUNG"
                    required
                    className="mt-1 font-mono uppercase bg-slate-50"
                  />
                </div>
                <div>
                  <Label htmlFor="st-name" className="text-slate-700">Bezeichnung / Name *</Label>
                  <Input
                    id="st-name"
                    value={newStatusName}
                    onChange={(e) => setNewStatusName(e.target.value)}
                    placeholder="z.B. Qualitätsprüfung"
                    required
                    className="mt-1 bg-slate-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="st-cat" className="text-slate-700">Kategorie *</Label>
                  <select
                    id="st-cat"
                    value={newStatusCategory}
                    onChange={(e) => setNewStatusCategory(e.target.value)}
                    className="w-full mt-1 h-9 rounded-lg border border-slate-300 bg-slate-50 px-3 text-xs text-slate-800"
                  >
                    <option value="DRAFT">DRAFT (Erfassung / Meldung)</option>
                    <option value="OPEN">OPEN (Freigegeben)</option>
                    <option value="IN_PROGRESS">IN_PROGRESS (In Bearbeitung)</option>
                    <option value="COMPLETED">COMPLETED (Technisch abgeschlossen)</option>
                    <option value="CLOSED">CLOSED (Kaufmännisch abgeschlossen)</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="st-color" className="text-slate-700">Farbe (Hex-Code)</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="color"
                      value={newStatusColor}
                      onChange={(e) => setNewStatusColor(e.target.value)}
                      className="h-9 w-9 rounded-lg border border-slate-300 p-1 cursor-pointer bg-white"
                    />
                    <Input
                      value={newStatusColor}
                      onChange={(e) => setNewStatusColor(e.target.value)}
                      className="h-9 font-mono bg-slate-50"
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="st-sap" className="text-slate-700">SAP Systemstatus-Code (optional)</Label>
                <Input
                  id="st-sap"
                  value={newStatusSapCode}
                  onChange={(e) => setNewStatusSapCode(e.target.value.toUpperCase())}
                  placeholder="z.B. EROF, FREI, INAR, TABG, ABGS"
                  className="mt-1 font-mono uppercase bg-slate-50"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">
                  System-Eigenschaften & Sperren:
                </span>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newStatusIsInitial}
                    onChange={(e) => setNewStatusIsInitial(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Initialer Startstatus für neu erfasste Aufträge</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newStatusLocksEditing}
                    onChange={(e) => setNewStatusLocksEditing(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Auftragsbearbeitung & Nachbuchung sperren</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newStatusTriggersSap}
                    onChange={(e) => setNewStatusTriggersSap(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Triggert technischen SAP-Abschluss (TABG BAPI)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newStatusIsTerminal}
                    onChange={(e) => setNewStatusIsTerminal(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Terminaler Endstatus (Workflow beendet)</span>
                </label>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-200">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddStatusModal(false)}
                  className="border-slate-300 text-slate-700"
                >
                  Abbrechen
                </Button>
                <Button type="submit" disabled={isPending} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold">
                  {isPending ? "Speichern..." : "Stadium anlegen"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
