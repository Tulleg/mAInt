"use client";

import * as React from "react";
import { useState, useTransition, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
  RowSelectionState,
} from "@tanstack/react-table";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  bulkUpdatePlanItemsAction,
  updatePlanItemInlineAction,
} from "@/actions/maintenance-plan-actions";
import {
  Layers,
  Clock,
  Shield,
  FileCheck,
  CheckCircle2,
  Calendar,
  Wrench,
  Search,
  Filter,
  CheckSquare,
  Square,
  Save,
  RotateCw,
} from "lucide-react";
import { toast } from "sonner";

export interface BatchPlanItemRow {
  id: string;
  positionNumber: number;
  title: string;
  planNumber: string;
  planName: string;
  cycleValue: number;
  cycleUnit: string;
  equipmentId: string | null;
  equipmentNumber: string | null;
  equipmentName: string | null;
  assignedRoleId: string | null;
  roleCode: string | null;
  roleName: string | null;
  inspectionTemplateId: string | null;
  templateCode: string | null;
  templateName: string | null;
  estimatedDurationMinutes: number;
}

interface BatchGridProps {
  initialItems: BatchPlanItemRow[];
  roles: Array<{ id: string; code: string; name: string }>;
  templates: Array<{ id: string; code: string; name: string }>;
  equipments: Array<{ id: string; equipmentNumber: string; name: string }>;
}

export function MaintenancePlanBatchGrid({
  initialItems,
  roles,
  templates,
  equipments,
}: BatchGridProps) {
  const [data, setData] = useState<BatchPlanItemRow[]>(initialItems);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState("");
  const [isPending, startTransition] = useTransition();
  const [bannerMessage, setBannerMessage] = useState<string | null>(null);

  // Bulk Edit States
  const [bulkInterval, setBulkInterval] = useState<string>("");
  const [bulkIntervalUnit, setBulkIntervalUnit] = useState<
    "DAYS" | "WEEKS" | "MONTHS" | "OPERATING_HOURS"
  >("DAYS");
  const [bulkRoleId, setBulkRoleId] = useState<string>("");
  const [bulkTemplateId, setBulkTemplateId] = useState<string>("");
  const [bulkEquipmentId, setBulkEquipmentId] = useState<string>("");

  const selectedCount = Object.keys(rowSelection).length;

  // Inline Editing Handler (mit optimistischer State-Aktualisierung)
  const handleInlineChange = async (
    rowId: string,
    field: "title" | "estimatedDurationMinutes" | "assignedRoleId" | "inspectionTemplateId" | "equipmentId",
    value: any
  ) => {
    // 1. Optimistic UI
    setData((old) =>
      old.map((row) => {
        if (row.id === rowId) {
          const updated = { ...row, [field]: value };
          if (field === "assignedRoleId") {
            const r = roles.find((role) => role.id === value);
            updated.roleName = r?.name || null;
            updated.roleCode = r?.code || null;
          }
          if (field === "inspectionTemplateId") {
            const t = templates.find((tpl) => tpl.id === value);
            updated.templateName = t?.name || null;
            updated.templateCode = t?.code || null;
          }
          if (field === "equipmentId") {
            const eq = equipments.find((e) => e.id === value);
            updated.equipmentName = eq?.name || null;
            updated.equipmentNumber = eq?.equipmentNumber || null;
          }
          return updated;
        }
        return row;
      })
    );

    // 2. Server Action
    startTransition(async () => {
      try {
        const res = await updatePlanItemInlineAction(rowId, field, value);
        if (res && (res as any).success === false) {
          toast.error((res as any).message || "Fehler beim Speichern der Änderung.");
        } else {
          toast.success("Änderung erfolgreich gespeichert.");
        }
      } catch (err: any) {
        const errorMsg = err?.message || String(err);
        setBannerMessage("Fehler beim Speichern: " + errorMsg);
        toast.error("Fehler beim Speichern: " + errorMsg);
      }
    });
  };

  // Bulk Apply Handler
  const handleApplyBulkAction = () => {
    const selectedIndices = Object.keys(rowSelection).map(Number);
    const selectedItemIds = selectedIndices.map((idx) => data[idx]?.id).filter(Boolean);

    if (selectedItemIds.length === 0) return;

    startTransition(async () => {
      try {
        const updates: any = {};
        if (bulkRoleId) updates.assignedRoleId = bulkRoleId;
        if (bulkTemplateId) updates.inspectionTemplateId = bulkTemplateId;
        if (bulkEquipmentId) updates.equipmentId = bulkEquipmentId;

        const cycleUpdate =
          bulkInterval && parseInt(bulkInterval) > 0
            ? {
                cycleValue: parseInt(bulkInterval),
                cycleUnit: bulkIntervalUnit,
              }
            : undefined;

        const res = await bulkUpdatePlanItemsAction({
          itemIds: selectedItemIds,
          updates,
          cycleUpdate,
        });

        if (res && res.success === false) {
          toast.error(res.message || "Fehler beim Ausführen des Batch-Updates.");
          return;
        }

        // Lokalen State synchronisieren
        setData((old) =>
          old.map((row, idx) => {
            if (rowSelection[idx]) {
              const updated = { ...row };
              if (bulkRoleId) {
                const r = roles.find((role) => role.id === bulkRoleId);
                updated.assignedRoleId = bulkRoleId;
                updated.roleName = r?.name || null;
                updated.roleCode = r?.code || null;
              }
              if (bulkTemplateId) {
                const t = templates.find((tpl) => tpl.id === bulkTemplateId);
                updated.inspectionTemplateId = bulkTemplateId;
                updated.templateName = t?.name || null;
                updated.templateCode = t?.code || null;
              }
              if (bulkEquipmentId) {
                const eq = equipments.find((e) => e.id === bulkEquipmentId);
                updated.equipmentId = bulkEquipmentId;
                updated.equipmentName = eq?.name || null;
                updated.equipmentNumber = eq?.equipmentNumber || null;
              }
              if (cycleUpdate) {
                updated.cycleValue = cycleUpdate.cycleValue;
                updated.cycleUnit = cycleUpdate.cycleUnit;
              }
              return updated;
            }
            return row;
          })
        );

        const successNotice =
          res?.message ||
          `Erfolgreich ${selectedItemIds.length} Positionen im Batch aktualisiert!`;
        toast.success(successNotice);
        setBannerMessage(successNotice);
        setRowSelection({});
        // Reset bulk fields
        setBulkInterval("");
        setBulkRoleId("");
        setBulkTemplateId("");
        setBulkEquipmentId("");
        setTimeout(() => setBannerMessage(null), 4000);
      } catch (err: any) {
        const errorMsg = err?.message || String(err);
        setBannerMessage("Fehler beim Ausführen der Bulk-Aktion: " + errorMsg);
        toast.error("Batch-Update fehlgeschlagen: " + errorMsg);
      }
    });
  };

  // TanStack Table Spaltendefinitionen
  const columns = useMemo<ColumnDef<BatchPlanItemRow>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <button
            type="button"
            onClick={table.getToggleAllRowsSelectedHandler()}
            className="flex items-center justify-center min-h-[44px] min-w-[44px] p-2 text-slate-400 hover:text-white"
          >
            {table.getIsAllRowsSelected() ? (
              <CheckSquare className="h-4 w-4 text-cyan-500" />
            ) : table.getIsSomeRowsSelected() ? (
              <CheckSquare className="h-4 w-4 text-cyan-400 opacity-60" />
            ) : (
              <Square className="h-4 w-4" />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <button
            type="button"
            onClick={row.getToggleSelectedHandler()}
            className="flex items-center justify-center min-h-[44px] min-w-[44px] p-2 text-slate-400 hover:text-white"
          >
            {row.getIsSelected() ? (
              <CheckSquare className="h-4 w-4 text-cyan-500" />
            ) : (
              <Square className="h-4 w-4" />
            )}
          </button>
        ),
        size: 35,
      },
      {
        accessorKey: "positionNumber",
        header: "Pos.",
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-slate-400">#{getValue() as number}</span>
        ),
        size: 50,
      },
      {
        accessorKey: "title",
        header: "Wartungsposition & Aufgabe",
        cell: ({ row, getValue }) => (
          <div className="space-y-0.5">
            <input
              type="text"
              defaultValue={getValue() as string}
              onBlur={(e) => {
                if (e.target.value !== getValue()) {
                  handleInlineChange(row.original.id, "title", e.target.value);
                }
              }}
              className="bg-transparent border-0 border-b border-transparent hover:border-slate-700 focus:border-cyan-500 text-xs font-medium text-slate-100 px-1 py-0.5 w-full focus:outline-none rounded"
            />
            <span className="text-[10px] text-slate-500 font-mono block px-1">
              {row.original.planNumber} ({row.original.planName})
            </span>
          </div>
        ),
      },
      {
        id: "cycle",
        header: "Zyklus / Intervall",
        cell: ({ row }) => (
          <Badge variant="outline" className="font-mono text-[11px] border-slate-700">
            <Calendar className="h-3 w-3 mr-1 text-cyan-400" />
            {row.original.cycleValue} {row.original.cycleUnit}
          </Badge>
        ),
        size: 130,
      },
      {
        accessorKey: "equipmentId",
        header: "Equipment-Zuordnung",
        cell: ({ row }) => (
          <select
            value={row.original.equipmentId || ""}
            onChange={(e) =>
              handleInlineChange(row.original.id, "equipmentId", e.target.value || null)
            }
            className="w-full text-xs bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="">-- Keine Zuordnung --</option>
            {equipments.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {eq.equipmentNumber} ({eq.name})
              </option>
            ))}
          </select>
        ),
      },
      {
        accessorKey: "assignedRoleId",
        header: "Zuständige Techniker-Rolle",
        cell: ({ row }) => (
          <select
            value={row.original.assignedRoleId || ""}
            onChange={(e) =>
              handleInlineChange(row.original.id, "assignedRoleId", e.target.value || null)
            }
            className="w-full text-xs bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="">-- Alle Techniker --</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.code})
              </option>
            ))}
          </select>
        ),
      },
      {
        accessorKey: "inspectionTemplateId",
        header: "Verknüpftes Protokoll",
        cell: ({ row }) => (
          <select
            value={row.original.inspectionTemplateId || ""}
            onChange={(e) =>
              handleInlineChange(row.original.id, "inspectionTemplateId", e.target.value || null)
            }
            className="w-full text-xs bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="">-- Kein Protokoll --</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.code})
              </option>
            ))}
          </select>
        ),
      },
      {
        accessorKey: "estimatedDurationMinutes",
        header: "Dauer (Min)",
        cell: ({ row, getValue }) => (
          <div className="flex items-center gap-1">
            <input
              type="number"
              defaultValue={getValue() as number}
              onBlur={(e) => {
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val !== getValue()) {
                  handleInlineChange(row.original.id, "estimatedDurationMinutes", val);
                }
              }}
              className="w-16 bg-transparent border-b border-transparent hover:border-slate-700 focus:border-cyan-500 text-xs font-mono text-right text-slate-200 px-1 py-0.5 focus:outline-none"
            />
            <span className="text-[10px] text-slate-500">min</span>
          </div>
        ),
        size: 90,
      },
    ],
    [roles, templates, equipments, data]
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      rowSelection,
      globalFilter,
    },
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 15,
      },
    },
  });

  return (
    <div className="space-y-4">
      {/* Banner Feedback */}
      {bannerMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-800 bg-emerald-950/80 px-4 py-2.5 text-xs text-emerald-200 shadow-md">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          {bannerMessage}
        </div>
      )}

      {/* STICKY BULK-ACTION-BAR BEI MEHRFACHAUSWAHL */}
      {selectedCount > 0 && (
        <div className="sticky top-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-600/80 bg-slate-900/95 p-3.5 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-600 text-xs font-bold text-white shadow">
              {selectedCount}
            </span>
            <div>
              <span className="text-xs font-semibold text-white block">
                {selectedCount} Position{selectedCount > 1 ? "en" : ""} ausgewählt
              </span>
              <span className="text-[10px] text-blue-300">
                Bulk-Modifikationen werden simultan auf alle markierten Datensätze angewendet
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Neues Intervall */}
            <div className="flex items-center gap-1">
              <Input
                type="number"
                placeholder="Intervall (z.B. 90)"
                value={bulkInterval}
                onChange={(e) => setBulkInterval(e.target.value)}
                className="h-8 w-28 text-xs font-mono"
              />
              <select
                value={bulkIntervalUnit}
                onChange={(e) => setBulkIntervalUnit(e.target.value as any)}
                className="h-8 rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-200"
              >
                <option value="DAYS">Tage</option>
                <option value="WEEKS">Wochen</option>
                <option value="MONTHS">Monate</option>
                <option value="OPERATING_HOURS">Betriebsstunden</option>
              </select>
            </div>

            {/* Rolle zuweisen */}
            <select
              value={bulkRoleId}
              onChange={(e) => setBulkRoleId(e.target.value)}
              className="h-8 rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-200 max-w-[150px]"
            >
              <option value="">Techniker-Rolle...</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>

            {/* Protokoll-Vorlage */}
            <select
              value={bulkTemplateId}
              onChange={(e) => setBulkTemplateId(e.target.value)}
              className="h-8 rounded border border-slate-700 bg-slate-900 px-2 text-xs text-slate-200 max-w-[160px]"
            >
              <option value="">Protokoll-Vorlage...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>

            <Button
              size="sm"
              onClick={handleApplyBulkAction}
              disabled={isPending}
              className="h-8 bg-cyan-600 hover:bg-blue-700 text-white text-xs gap-1.5"
            >
              <Save className="h-3.5 w-3.5" />
              {isPending ? "Wende an..." : "Alle aktualisieren"}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRowSelection({})}
              className="h-8 text-xs text-slate-400 hover:text-white"
            >
              Abbrechen
            </Button>
          </div>
        </div>
      )}

      {/* Suche & Tabellen-Filter */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <Input
            placeholder="Wartungspositionen oder Pläne filtern..."
            value={globalFilter ?? ""}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Gesamt: {data.length} Positionen</span>
          <span>•</span>
          <span>
            Seite {table.getState().pagination.pageIndex + 1} von {table.getPageCount() || 1}
          </span>
        </div>
      </div>

      {/* TanStack Data Grid */}
      <Card className="border-slate-800 bg-slate-950 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider border-b border-slate-800">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      style={{ width: header.getSize() }}
                      className="p-3 font-semibold border-r border-slate-800 last:border-r-0"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-800/80 bg-slate-950">
              {table.getRowModel().rows.length > 0 ? (
                table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`hover:bg-slate-900/60 transition-colors ${
                      row.getIsSelected() ? "bg-cyan-950/20" : ""
                    }`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="p-2.5 border-r border-slate-800/60 last:border-r-0"
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length} className="text-center py-8 text-slate-500">
                    Keine passenden Wartungspositionen gefunden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex items-center justify-between p-3 border-t border-slate-800 bg-slate-900/60 text-xs">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="h-11 min-h-[44px] px-3.5 text-xs"
            >
              Zurück
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="h-11 min-h-[44px] px-3.5 text-xs"
            >
              Weiter
            </Button>
          </div>

          <span className="text-slate-500">
            Zeige {table.getState().pagination.pageIndex * 15 + 1} -{" "}
            {Math.min((table.getState().pagination.pageIndex + 1) * 15, data.length)} von{" "}
            {data.length} Einträgen
          </span>
        </div>
      </Card>
    </div>
  );
}
