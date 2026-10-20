"use client";

import * as React from "react";
import { useState, useMemo, useRef } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  User,
  Wrench,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Filter,
  PackageX,
  Inbox,
  Clock,
  Plus,
  Layers,
  Sparkles,
} from "lucide-react";

export interface GanttOrderTask {
  id: string;
  orderNumber: string;
  title: string;
  priority: "1_EMERGENCY" | "2_HIGH" | "3_MEDIUM" | "4_LOW";
  equipmentId: string;
  equipmentName: string;
  technicianId?: string | null; // NULL bedeutet: Im Auftragseingang (ungeplant)
  technicianName?: string | null;
  qualificationRequired?: string;
  startHour: number; // Für Tagesansicht: 6 bis 20
  durationHours: number;
  dayOfWeek?: number; // Für Wochenansicht: 0 = Mo bis 5 = Sa
  durationDays?: number; // Tage in Wochenansicht
  hasStockConflict?: boolean;
  missingPartName?: string;
}

export interface ResourceGroup {
  id: string;
  name: string;
  qualification: string;
}

interface InteractiveGanttProps {
  resources: ResourceGroup[];
  initialTasks: GanttOrderTask[];
  onTaskUpdate?: (task: GanttOrderTask) => void;
}

const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const WEEK_DAYS = [
  { dayIndex: 0, label: "Montag", date: "20. Okt" },
  { dayIndex: 1, label: "Dienstag", date: "21. Okt" },
  { dayIndex: 2, label: "Mittwoch", date: "22. Okt" },
  { dayIndex: 3, label: "Donnerstag", date: "23. Okt" },
  { dayIndex: 4, label: "Freitag", date: "24. Okt" },
  { dayIndex: 5, label: "Samstag", date: "25. Okt" },
];

export function InteractiveGanttPlanningBoard({
  resources,
  initialTasks,
  onTaskUpdate,
}: InteractiveGanttProps) {
  // Demo: Ein Teil der Aufträge ist zugewiesen, ein Teil liegt im ungeplanten "Auftragseingang"
  const [tasks, setTasks] = useState<GanttOrderTask[]>(() => {
    return initialTasks.map((t, idx) => {
      // Mindestens 2 Aufträge in den unzugewiesenen Eingang legen
      const isUnplanned = idx >= 3;
      return {
        ...t,
        technicianId: isUnplanned ? null : t.technicianId || resources[idx % resources.length]?.id,
        technicianName: isUnplanned
          ? null
          : t.technicianName || resources[idx % resources.length]?.name,
        dayOfWeek: t.dayOfWeek ?? (idx % 5),
        durationDays: t.durationDays ?? 1,
      };
    });
  });

  const [viewScope, setViewScope] = useState<"day" | "week">("day");
  const [groupBy, setGroupBy] = useState<"technician" | "qualification">("technician");
  const [currentWeekOffset, setCurrentWeekOffset] = useState<number>(0);

  // Dragging & Resizing States
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [resizingTask, setResizingTask] = useState<{
    id: string;
    initialX: number;
    initialVal: number;
  } | null>(null);

  // Ungeplante Aufträge im Eingang
  const unplannedTasks = useMemo(() => {
    return tasks.filter((t) => !t.technicianId);
  }, [tasks]);

  // Ressourcen-Gruppierung
  const groupedResources = useMemo(() => {
    if (groupBy === "qualification") {
      const qualMap = new Map<string, ResourceGroup[]>();
      resources.forEach((r) => {
        const primaryQual = r.qualification.split(",")[0]?.trim() || "Allgemein";
        const list = qualMap.get(primaryQual) || [];
        list.push(r);
        qualMap.set(primaryQual, list);
      });
      return Array.from(qualMap.entries()).map(([qual, members]) => ({
        groupId: `qual-${qual}`,
        groupTitle: qual,
        members,
      }));
    }
    return [
      {
        groupId: "all-techs",
        groupTitle: "Servicetechniker-Einsatzplan",
        members: resources,
      },
    ];
  }, [resources, groupBy]);

  // HTML5 Drag & Drop
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    // Wenn gerade ein Resize aktiv ist, DnD blockieren
    if (resizingTask) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingTaskId(taskId);
  };

  const handleDragEnd = () => {
    setDraggingTaskId(null);
  };

  // Drop in eine Zeile/Zeitslot des Gantt-Charts
  const handleDropOnGanttRow = (techId: string, slotIndex: number) => {
    if (!draggingTaskId) return;

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === draggingTaskId) {
          const tech = resources.find((r) => r.id === techId);
          let updated: GanttOrderTask;
          if (viewScope === "day") {
            const newStartHour = HOURS[slotIndex] ?? 7;
            updated = {
              ...t,
              technicianId: techId,
              technicianName: tech?.name || "Zugewiesen",
              startHour: Math.max(6, Math.min(20 - t.durationHours, newStartHour)),
            };
          } else {
            updated = {
              ...t,
              technicianId: techId,
              technicianName: tech?.name || "Zugewiesen",
              dayOfWeek: slotIndex,
            };
          }
          if (onTaskUpdate) onTaskUpdate(updated);
          return updated;
        }
        return t;
      })
    );
    setDraggingTaskId(null);
  };

  // Drop zurück in den Auftragseingang (Disponierung aufheben)
  const handleDropOnInbox = (e: React.DragEvent) => {
    e.preventDefault();
    if (!draggingTaskId) return;

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === draggingTaskId) {
          const updated: GanttOrderTask = {
            ...t,
            technicianId: null,
            technicianName: null,
          };
          if (onTaskUpdate) onTaskUpdate(updated);
          return updated;
        }
        return t;
      })
    );
    setDraggingTaskId(null);
  };

  // Maus-Resize Handhabung (Absolut entkoppelt vom DnD)
  const handleResizeMouseDown = (e: React.MouseEvent, task: GanttOrderTask) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingTask({
      id: task.id,
      initialX: e.clientX,
      initialVal: viewScope === "day" ? task.durationHours : task.durationDays || 1,
    });
  };

  const handleGlobalMouseMove = (e: React.MouseEvent) => {
    if (!resizingTask) return;
    const diff = e.clientX - resizingTask.initialX;
    const stepSizePx = viewScope === "day" ? 50 : 120; // Pixel pro Einheit
    const deltaUnits = Math.round(diff / stepSizePx);

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === resizingTask.id) {
          if (viewScope === "day") {
            const newVal = Math.max(1, Math.min(8, resizingTask.initialVal + deltaUnits));
            return { ...t, durationHours: newVal };
          } else {
            const newVal = Math.max(1, Math.min(5, resizingTask.initialVal + deltaUnits));
            return { ...t, durationDays: newVal };
          }
        }
        return t;
      })
    );
  };

  const handleGlobalMouseUp = () => {
    if (resizingTask) {
      setResizingTask(null);
    }
  };

  const currentColumnsCount = viewScope === "day" ? HOURS.length : WEEK_DAYS.length;

  return (
    <div
      className="space-y-6 select-none"
      onMouseMove={handleGlobalMouseMove}
      onMouseUp={handleGlobalMouseUp}
    >
      {/* Top Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 pb-3">
        <div className="flex items-center gap-3">
          {/* Umschalter Tag / Woche */}
          <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setViewScope("day")}
              className={`h-7 px-3 text-xs font-medium rounded-md transition-all ${
                viewScope === "day"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Tagesansicht
            </button>
            <button
              type="button"
              onClick={() => setViewScope("week")}
              className={`h-7 px-3 text-xs font-medium rounded-md transition-all ${
                viewScope === "week"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Wochenansicht
            </button>
          </div>

          {/* Kalender Navigation */}
          <div className="flex items-center gap-1.5 border-l border-neutral-800 pl-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentWeekOffset((prev) => prev - 1)}
              className="h-7 w-7 text-neutral-400 hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-semibold text-neutral-200 min-w-[160px] text-center">
              {viewScope === "day"
                ? currentWeekOffset === 0
                  ? "Heute, 20. Oktober 2026"
                  : `Tag ${currentWeekOffset > 0 ? `+${currentWeekOffset}` : currentWeekOffset}`
                : currentWeekOffset === 0
                ? "KW 43 (20. Okt – 25. Okt)"
                : `Woche ${currentWeekOffset > 0 ? `+${currentWeekOffset}` : currentWeekOffset}`}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentWeekOffset((prev) => prev + 1)}
              className="h-7 w-7 text-neutral-400 hover:text-white"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Gruppierung nach Techniker oder Qualifikation */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400 flex items-center gap-1">
            <Filter className="h-3 w-3" /> Gruppierung:
          </span>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as any)}
            className="h-8 rounded border border-neutral-700 bg-neutral-900 px-2.5 text-xs text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="technician">Nach Servicetechniker</option>
            <option value="qualification">Nach Fachqualifikation</option>
          </select>
        </div>
      </div>

      {/* HAUPTTEIL: GANTT PLANUNGSBOARD */}
      <Card className="border-neutral-800 bg-neutral-950 overflow-hidden shadow-2xl">
        <div className="flex flex-col w-full">
          {/* Kopfzeile (Links: Ressourcen, Rechts: Zeitachse) */}
          <div className="flex border-b border-neutral-800 bg-neutral-900/90 text-xs font-semibold text-neutral-400">
            {/* Ressourcen Header */}
            <div className="w-72 shrink-0 p-3 border-r border-neutral-800 flex items-center gap-2 uppercase tracking-wider text-[11px]">
              <User className="h-3.5 w-3.5 text-blue-400" />
              Ressource & Qualifikation
            </div>

            {/* Zeitraster Header */}
            <div className="flex-1 flex divide-x divide-neutral-800 overflow-hidden">
              {viewScope === "day"
                ? HOURS.map((h) => (
                    <div
                      key={h}
                      className="flex-1 py-2.5 text-center text-[11px] font-mono text-neutral-400 bg-neutral-900/50"
                    >
                      {h.toString().padStart(2, "0")}:00
                    </div>
                  ))
                : WEEK_DAYS.map((d) => (
                    <div
                      key={d.dayIndex}
                      className="flex-1 py-2 text-center text-xs text-neutral-300 bg-neutral-900/50"
                    >
                      <span className="font-semibold block">{d.label}</span>
                      <span className="text-[10px] text-neutral-500 font-mono">{d.date}</span>
                    </div>
                  ))}
            </div>
          </div>

          {/* Ressourcen-Zeilen & Task-Balken */}
          <div className="divide-y divide-neutral-800/80">
            {groupedResources.map((group) => (
              <React.Fragment key={group.groupId}>
                {groupBy === "qualification" && (
                  <div className="bg-neutral-900/80 px-4 py-1.5 text-xs font-semibold text-blue-300 border-b border-neutral-800 flex items-center gap-2">
                    <Wrench className="h-3.5 w-3.5" />
                    Fachbereich: {group.groupTitle} ({group.members.length} Monteure)
                  </div>
                )}

                {group.members.map((res) => {
                  const techTasks = tasks.filter((t) => t.technicianId === res.id);
                  const totalHours = techTasks.reduce((acc, curr) => acc + curr.durationHours, 0);
                  const isOverbooked =
                    viewScope === "day" ? totalHours > 8 : techTasks.length > 4;

                  return (
                    <div
                      key={res.id}
                      className="flex min-h-[95px] hover:bg-neutral-900/30 transition-colors"
                    >
                      {/* Linke Spalte: Ressource */}
                      <div className="w-72 shrink-0 p-3 border-r border-neutral-800 bg-neutral-900/30 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-xs text-white truncate">
                              {res.name}
                            </span>
                            {isOverbooked && (
                              <Badge
                                variant="destructive"
                                className="text-[9px] py-0 px-1 shrink-0 flex items-center gap-0.5"
                              >
                                <AlertTriangle className="h-2.5 w-2.5" /> Überbucht
                              </Badge>
                            )}
                          </div>
                          <span className="text-[10px] text-blue-400 font-mono block mt-0.5 truncate">
                            {res.qualification}
                          </span>
                        </div>

                        <div className="text-[10px] text-neutral-500 font-mono">
                          {viewScope === "day"
                            ? `Geplant: ${totalHours}h / 8h`
                            : `${techTasks.length} Aufträge eingeplant`}
                        </div>
                      </div>

                      {/* Rechte Spalte: Zeitraster */}
                      <div className="flex-1 relative flex divide-x divide-neutral-900 bg-neutral-950">
                        {/* Drop-Zonen */}
                        {Array.from({ length: currentColumnsCount }).map((_, slotIdx) => (
                          <div
                            key={slotIdx}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => handleDropOnGanttRow(res.id, slotIdx)}
                            className="flex-1 h-full hover:bg-blue-950/20 transition-colors"
                          />
                        ))}

                        {/* Auftrags-Balken */}
                        {techTasks.map((task) => {
                          let leftPercent = 0;
                          let widthPercent = 0;

                          if (viewScope === "day") {
                            const startOffset = Math.max(0, task.startHour - 6);
                            leftPercent = (startOffset / HOURS.length) * 100;
                            widthPercent = (task.durationHours / HOURS.length) * 100;
                          } else {
                            const dayIndex = task.dayOfWeek ?? 0;
                            const daysSpan = task.durationDays ?? 1;
                            leftPercent = (dayIndex / WEEK_DAYS.length) * 100;
                            widthPercent = (daysSpan / WEEK_DAYS.length) * 100;
                          }

                          widthPercent = Math.min(widthPercent, 100 - leftPercent);
                          const isEmergency = task.priority === "1_EMERGENCY";

                          return (
                            <div
                              key={task.id}
                              draggable={!resizingTask}
                              onDragStart={(e) => handleDragStart(e, task.id)}
                              onDragEnd={handleDragEnd}
                              style={{
                                left: `${leftPercent}%`,
                                width: `calc(${widthPercent}% - 4px)`,
                                top: "8px",
                                bottom: "8px",
                              }}
                              className={`absolute rounded-lg border p-2 shadow-lg cursor-grab active:cursor-grabbing transition-shadow flex flex-col justify-between overflow-hidden z-10 ${
                                isEmergency
                                  ? "bg-red-950/90 border-red-600 text-white"
                                  : task.hasStockConflict
                                  ? "bg-amber-950/90 border-amber-500 text-amber-100"
                                  : "bg-blue-950/90 border-blue-600 text-blue-100"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1 pointer-events-none">
                                <span className="font-mono font-bold text-[10px] truncate">
                                  {task.orderNumber}
                                </span>
                                {task.hasStockConflict && (
                                  <span
                                    title={`Materialengpass: ${task.missingPartName}`}
                                    className="text-amber-400 shrink-0"
                                  >
                                    <PackageX className="h-3 w-3" />
                                  </span>
                                )}
                              </div>

                              <span className="text-[11px] font-semibold truncate leading-tight pointer-events-none">
                                {task.title}
                              </span>

                              <div className="flex items-center justify-between text-[9px] text-neutral-400 font-mono pointer-events-none">
                                <span className="truncate max-w-[120px]">{task.equipmentName}</span>
                                <span className="shrink-0 font-bold text-neutral-300">
                                  {viewScope === "day"
                                    ? `${task.durationHours}h`
                                    : `${task.durationDays || 1}d`}
                                </span>
                              </div>

                              {/* Entkoppeltes Resize Handle */}
                              <div
                                onMouseDown={(e) => handleResizeMouseDown(e, task)}
                                title="Ziehen zum Verlängern/Verkürzen der Dauer"
                                className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-white/40 active:bg-blue-400 transition-colors z-20 flex items-center justify-center"
                              >
                                <div className="h-4 w-0.5 bg-neutral-400/60 rounded" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </Card>

      {/* UNTERER BEREICH: AUFTRAGSEINGANG / UNGEPLANTE MASSNAHMEN (DISPO-POOL) */}
      <Card
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDropOnInbox}
        className="border-neutral-800 bg-neutral-900 shadow-xl border-dashed"
      >
        <CardHeader className="py-3 px-4 border-b border-neutral-800 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-amber-400" />
            <div>
              <CardTitle className="text-sm text-white flex items-center gap-2">
                Auftragseingang & Ungeplante Maßnahmen
                <Badge variant="outline" className="text-xs font-mono text-amber-400 border-amber-700/60">
                  {unplannedTasks.length} offen
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs text-neutral-400">
                Ziehe Aufträge per Drag-&-Drop nach oben in den Kalender, um sie einem Monteur zuzuweisen. (Oder ziehe geplante Aufträge hierher zurück, um die Zuweisung aufzuheben).
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4">
          {unplannedTasks.length === 0 ? (
            <div className="text-center py-6 text-xs text-neutral-500 border border-neutral-800/80 rounded-lg bg-neutral-950/50">
              Alle vorliegenden Instandhaltungsmaßnahmen sind aktuell disponiert!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {unplannedTasks.map((task) => {
                const isEmergency = task.priority === "1_EMERGENCY";
                return (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onDragEnd={handleDragEnd}
                    className={`p-3 rounded-lg border shadow cursor-grab active:cursor-grabbing hover:border-neutral-500 transition-all ${
                      isEmergency
                        ? "bg-red-950/40 border-red-800/80 text-red-200"
                        : task.hasStockConflict
                        ? "bg-amber-950/40 border-amber-800/80 text-amber-200"
                        : "bg-neutral-950 border-neutral-800 text-neutral-200"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                      <span className="font-bold text-white">{task.orderNumber}</span>
                      <Badge
                        variant={isEmergency ? "destructive" : "secondary"}
                        className="text-[9px] py-0 px-1"
                      >
                        {isEmergency ? "Notfall" : `${task.durationHours}h Aufwand`}
                      </Badge>
                    </div>

                    <h4 className="text-xs font-semibold truncate text-white mb-1">
                      {task.title}
                    </h4>

                    <div className="flex items-center justify-between text-[10px] text-neutral-400 pt-1 border-t border-neutral-800/60">
                      <span className="truncate max-w-[140px]">{task.equipmentName}</span>
                      <span className="text-blue-400 font-medium">Ziehen →</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
