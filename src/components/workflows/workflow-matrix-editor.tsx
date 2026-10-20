"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createOrderTypeAction,
  upsertWorkflowTransitionAction,
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
} from "lucide-react";

interface WorkflowMatrixEditorProps {
  tenantId: string;
  orderTypes: Array<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    sapOrderTypeCode: string | null;
    colorHex: string;
  }>;
  statuses: Array<{
    id: string;
    code: string;
    name: string;
    category: string;
    colorHex: string;
  }>;
  roles: Array<{
    id: string;
    code: string;
    name: string;
  }>;
  transitions: Array<{
    id: string;
    orderTypeId: string;
    fromStatusId: string;
    toStatusId: string;
    requiredRoleId: string | null;
    actionName: string;
    isActive: boolean;
    triggersSapSync: boolean;
    guardConditions: {
      requireChecklistCompleted?: boolean;
      requireRootCauseFilled?: boolean;
      requireActualDurationFilled?: boolean;
    };
  }>;
}

export function WorkflowMatrixEditor({
  tenantId,
  orderTypes,
  statuses,
  roles,
  transitions,
}: WorkflowMatrixEditorProps) {
  const [selectedOrderTypeId, setSelectedOrderTypeId] = useState<string>(
    orderTypes[0]?.id || ""
  );
  const [showCreateOrderType, setShowCreateOrderType] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const selectedOrderType = orderTypes.find((ot) => ot.id === selectedOrderTypeId);

  // Gefilterte Transitions für die gewählte Auftragsart
  const currentTransitions = transitions.filter(
    (t) => t.orderTypeId === selectedOrderTypeId && t.isActive
  );

  const getTransition = (fromId: string, toId: string) => {
    return currentTransitions.find(
      (t) => t.fromStatusId === fromId && t.toStatusId === toId
    );
  };

  const handleRoleChange = (
    fromStatusId: string,
    toStatusId: string,
    roleIdValue: string,
    actionLabel: string
  ) => {
    startTransition(async () => {
      const isEnabled = roleIdValue !== "DISABLED";
      const requiredRoleId =
        roleIdValue === "ANY" || roleIdValue === "DISABLED" ? null : roleIdValue;

      try {
        await upsertWorkflowTransitionAction({
          tenantId,
          orderTypeId: selectedOrderTypeId,
          fromStatusId,
          toStatusId,
          requiredRoleId,
          actionName: actionLabel,
          isEnabled,
          guardConditions: {
            requireChecklistCompleted: true, // Default Guard für Qualitätssicherung
          },
          triggersSapSync: true,
        });
        setStatusMessage("Workflow-Matrix erfolgreich aktualisiert.");
        setTimeout(() => setStatusMessage(null), 3000);
      } catch (err) {
        setStatusMessage(
          "Fehler beim Speichern: " +
            (err instanceof Error ? err.message : String(err))
        );
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Status Feedback */}
      {statusMessage && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-800/80 bg-emerald-950/80 px-4 py-2.5 text-sm text-emerald-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          {statusMessage}
        </div>
      )}

      {/* Auftragsarten Leiste */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          {orderTypes.map((ot) => {
            const isSelected = ot.id === selectedOrderTypeId;
            return (
              <button
                key={ot.id}
                onClick={() => setSelectedOrderTypeId(ot.id)}
                className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2 text-sm font-medium transition-all ${
                  isSelected
                    ? "border-blue-500 bg-blue-950/40 text-blue-100 shadow-sm"
                    : "border-neutral-800 bg-neutral-900/60 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: ot.colorHex }}
                />
                <span className="font-mono font-semibold">{ot.code}</span>
                <span>{ot.name}</span>
                {ot.sapOrderTypeCode && (
                  <Badge variant="outline" className="ml-1 text-[10px] uppercase">
                    SAP: {ot.sapOrderTypeCode}
                  </Badge>
                )}
              </button>
            );
          })}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowCreateOrderType(!showCreateOrderType)}
          className="gap-2 border-neutral-700 text-neutral-200 hover:bg-neutral-800"
        >
          <Plus className="h-4 w-4" />
          Neue Auftragsart anlegen
        </Button>
      </div>

      {/* Formular für neue Auftragsart */}
      {showCreateOrderType && (
        <Card className="border-blue-900/40 bg-neutral-900/90">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-blue-300">
              <Layers className="h-4 w-4" />
              Neue Auftragsart & Standard-Workflow anlegen
            </CardTitle>
            <CardDescription>
              Definiert eine neue Instandhaltungs-Kategorie (z. B. Gesetzliche Prüfung,
              Schmierdienst, Eil-Reparatur).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              action={async (formData) => {
                formData.append("tenantId", tenantId);
                startTransition(async () => {
                  await createOrderTypeAction(formData);
                  setShowCreateOrderType(false);
                  setStatusMessage("Auftragsart erfolgreich erstellt.");
                });
              }}
              className="grid grid-cols-1 md:grid-cols-4 gap-4"
            >
              <div>
                <Label htmlFor="code">Kürzel (Code) *</Label>
                <Input
                  id="code"
                  name="code"
                  placeholder="z.B. IH04"
                  required
                  className="mt-1 font-mono uppercase"
                />
              </div>
              <div>
                <Label htmlFor="name">Bezeichnung *</Label>
                <Input
                  id="name"
                  name="name"
                  placeholder="z.B. UVV-Sicherheitsprüfung"
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="sapOrderTypeCode">SAP AUART (optional)</Label>
                <Input
                  id="sapOrderTypeCode"
                  name="sapOrderTypeCode"
                  placeholder="z.B. PM03"
                  className="mt-1 font-mono uppercase"
                />
              </div>
              <div>
                <Label htmlFor="colorHex">Farbe (Hex-Code)</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    id="colorHex"
                    name="colorHex"
                    defaultValue="#3B82F6"
                    className="font-mono"
                  />
                  <Button type="submit" disabled={isPending} className="whitespace-nowrap">
                    {isPending ? "Speichern..." : "Anlegen"}
                  </Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Visuelle Transitions-Matrix */}
      <Card className="border-neutral-800 bg-neutral-950">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-base text-neutral-100">
                <ShieldCheck className="h-5 w-5 text-blue-400" />
                Workflow- & Berechtigungs-Matrix für:{" "}
                <span className="text-blue-400 font-mono">
                  {selectedOrderType?.code} - {selectedOrderType?.name}
                </span>
              </CardTitle>
              <CardDescription>
                Steuere granulär, welche Benutzerrolle welchen Statuswechsel durchführen darf
                und welche Prüfbedingungen (Guards) greifen.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-neutral-900 border-neutral-700 text-neutral-300">
                <Database className="h-3 w-3 mr-1 text-emerald-400" />
                Drizzle State-Machine
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-neutral-800">
            <table className="w-full text-left text-xs text-neutral-300">
              <thead className="bg-neutral-900/90 text-neutral-400 uppercase tracking-wider border-b border-neutral-800">
                <tr>
                  <th className="p-3 font-semibold min-w-[160px] border-r border-neutral-800">
                    Ausgangs-Status (Von)
                  </th>
                  {statuses.map((toStatus) => (
                    <th
                      key={toStatus.id}
                      className="p-3 font-semibold min-w-[200px] text-center border-r border-neutral-800 last:border-r-0"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: toStatus.colorHex }}
                        />
                        <span>{toStatus.name}</span>
                      </div>
                      <span className="text-[10px] text-neutral-500 font-mono lowercase block">
                        {toStatus.category}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800 bg-neutral-950">
                {statuses.map((fromStatus) => (
                  <tr key={fromStatus.id} className="hover:bg-neutral-900/40">
                    <td className="p-3 font-medium bg-neutral-900/60 border-r border-neutral-800 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: fromStatus.colorHex }}
                        />
                        <span className="font-semibold text-neutral-200">
                          {fromStatus.name}
                        </span>
                      </div>
                      <span className="text-[10px] text-neutral-500 font-mono block">
                        {fromStatus.code}
                      </span>
                    </td>

                    {statuses.map((toStatus) => {
                      const isSameStatus = fromStatus.id === toStatus.id;
                      const transition = getTransition(fromStatus.id, toStatus.id);
                      const isEnabled = !!transition;

                      if (isSameStatus) {
                        return (
                          <td
                            key={toStatus.id}
                            className="p-2 text-center bg-neutral-900/20 border-r border-neutral-800 last:border-r-0 text-neutral-600 font-mono text-[11px]"
                          >
                            —
                          </td>
                        );
                      }

                      return (
                        <td
                          key={toStatus.id}
                          className={`p-2.5 border-r border-neutral-800 last:border-r-0 transition-colors ${
                            isEnabled
                              ? "bg-blue-950/10"
                              : "bg-transparent text-neutral-500"
                          }`}
                        >
                          <div className="space-y-1.5">
                            {/* Rollenauswahl */}
                            <select
                              disabled={isPending}
                              value={
                                !isEnabled
                                  ? "DISABLED"
                                  : transition.requiredRoleId || "ANY"
                              }
                              onChange={(e) =>
                                handleRoleChange(
                                  fromStatus.id,
                                  toStatus.id,
                                  e.target.value,
                                  `${fromStatus.name} -> ${toStatus.name}`
                                )
                              }
                              className={`w-full rounded border px-2 py-1 text-xs transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                                isEnabled
                                  ? "border-blue-700/60 bg-neutral-900 text-neutral-100 font-medium"
                                  : "border-neutral-800 bg-neutral-950 text-neutral-500"
                              }`}
                            >
                              <option value="DISABLED">❌ Deaktiviert</option>
                              <option value="ANY">🌐 Jeder Mitarbeiter</option>
                              {roles.map((role) => (
                                <option key={role.id} value={role.id}>
                                  🔒 {role.name} ({role.code})
                                </option>
                              ))}
                            </select>

                            {/* Guard Condition Indikatoren */}
                            {isEnabled && (
                              <div className="flex flex-wrap items-center gap-1 pt-0.5">
                                {transition.guardConditions?.requireChecklistCompleted && (
                                  <span
                                    title="Prüfprotokoll muss vollständig ausgefüllt sein"
                                    className="inline-flex items-center gap-0.5 rounded bg-blue-900/40 px-1 py-0.5 text-[9px] text-blue-300 border border-blue-800/40"
                                  >
                                    <ShieldCheck className="h-2.5 w-2.5" />
                                    Checkliste
                                  </span>
                                )}
                                {transition.triggersSapSync && (
                                  <span
                                    title="Triggert SAP PM Synchronisation"
                                    className="inline-flex items-center gap-0.5 rounded bg-amber-900/40 px-1 py-0.5 text-[9px] text-amber-300 border border-amber-800/40"
                                  >
                                    <RefreshCw className="h-2.5 w-2.5" />
                                    SAP-Sync
                                  </span>
                                )}
                              </div>
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
    </div>
  );
}
