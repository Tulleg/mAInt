"use client";

import * as React from "react";
import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
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
  Clock,
  Sparkles,
  CalendarDays,
} from "lucide-react";

export interface GanttOrderTask {
  id: string;
  orderNumber: string;
  title: string;
  priority: "1_EMERGENCY" | "2_HIGH" | "3_MEDIUM" | "4_LOW";
  equipmentId: string;
  equipmentName: string;
  technicianId: string;
  technicianName: string;
  qualificationRequired?: string;
  startHour: number; // Für Tagesansicht: 6 bis 20
  durationHours: number;
  dayOfWeek?: number; // Für Wochenansicht: 0 = Mo, 1 = Di, 2 = Mi, 3 = Do, 4 = Fr
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
  { dayIndex: 0, label: "Montag", short: "Mo", date: "20. Okt" },
  { dayIndex: 1, label: "Dienstag", short: "Di", date: "21. Okt" },
  { dayIndex: 2, label: "Mittwoch", short: "Mi", date: "22. Okt" },
  { dayIndex: 3, label: "Donnerstag", short: "Do", date: "23. Okt" },
  { dayIndex: 4, label: "Freitag", short: "Fr", date: "24. Okt" },
  { dayIndex: 5, label: "Samstag", short: "Sa", date: "25. Okt" },
];

export function InteractiveGanttPlanningBoard({
  resources,
  initialTasks,
  onTaskUpdate,
}: InteractiveGanttProps) {
  const [tasks, setTasks] = useState<GanttOrderTask[]>(
    initialTasks.map((t, idx) => ({
      ...t,
      dayOfWeek: t.dayOfWeek ?? (idx % 5),
      durationDays: t.durationDays ?? (idx === 0 ? 2 : 1),
    }))
  );
  const [viewScope, setViewScope] = useState<"day" | "week">("day");
  const [groupBy, setGroupBy] = useState<"technician" | "qualification">("technician");
  const [currentWeekOffset, setCurrentWeekOffset] = useState<number>(0);

  // Drag & Drop / Resize States
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [resizingTaskId, setResizingTaskId] = useState<string | null>(null);
  const [dragStartX, setDragStartX] = useState<number>(0);

  // Filter / Gruppierungslogik
  const groupedResources = useMemo(() => {
    if (groupBy === "qualification") {
      // Nach Qualifikation bündeln
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
    // Nach Techniker
    return [
      {
        groupId: "all-techs",
        groupTitle: "Servicetechniker-Einsatzplan",
        members: resources,
      },
    ];
  }, [resources, groupBy]);

  // Drag Handler
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData("text/plain", taskId);
    setDraggingTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropOnTimeSlot = (techId: string, slotIndex: number) => {
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
              technicianName: tech?.name || t.technicianName,
              startHour: Math.max(6, Math.min(20 - t.durationHours, newStartHour)),
            };
          } else {
            updated = {
              ...t,
              technicianId: techId,
              technicianName: tech?.name || t.technicianName,
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

  // Resize Handler
  const handleResizeStart = (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    setResizingTaskId(taskId);
    setDragStartX(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!resizingTaskId) return;
    const diff = e.clientX - dragStartX;
    const stepThreshold = viewScope === "day" ? 45 : 120;

    if (Math.abs(diff) > stepThreshold) {
      const delta = diff > 0 ? 1 : -1;
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id === resizingTaskId) {
            if (viewScope === "day") {
              const newDuration = Math.max(1, Math.min(8, t.durationHours + delta));
              return { ...t, durationHours: newDuration };
            } else {
              const newDays = Math.max(1, Math.min(5, (t.durationDays || 1) + delta));
              return { ...t, durationDays: newDays };
            }
          }
          return t;
        })
      );
      setDragStartX(e.clientX);
    }
  };

  const handleMouseUp = () => {
    setResizingTaskId(null);
  };

  const currentColumnsCount = viewScope === "day" ? HOURS.length : WEEK_DAYS.length;

  return (
    <div
      className="space-y-4 select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Top Filter & Steuerung */}
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

          {/* Datum / Kalender Navigation */}
          <div className="flex items-center gap-1.5 border-l border-neutral-800 pl-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCurrentWeekOffset((prev) => prev - 1)}
              className="h-7 w-7 text-neutral-400 hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-semibold text-neutral-200 min-w-[150px] text-center">
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

      {/* Gantt Planungsboard Container */}
      <Card className="border-neutral-800 bg-neutral-950 overflow-hidden shadow-2xl">
        <div className="flex flex-col w-full">
          {/* Kopfzeile (Links: Ressourcen, Rechts: Zeitachse) */}
          <div className="flex border-b border-neutral-800 bg-neutral-900/90 text-xs font-semibold text-neutral-400">
            {/* Ressourcen Header (Feste Breite) */}
            <div className="w-72 shrink-0 p-3 border-r border-neutral-800 flex items-center gap-2 uppercase tracking-wider text-[11px]">
              <User className="h-3.5 w-3.5 text-blue-400" />
              Ressource & Qualifikation
            </div>

            {/* Zeitraster Header (Flexibel & garantiert nebeneinander) */}
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
                {/* Qualifikations-Trennleiste bei Gruppierung */}
                {groupBy === "qualification" && (
                  <div className="bg-neutral-900/80 px-4 py-1.5 text-xs font-semibold text-blue-300 border-b border-neutral-800 flex items-center gap-2">
                    <Wrench className="h-3.5 w-3.5" />
                    Fachbereich: {group.groupTitle} ({group.members.length} Monteure)
                  </div>
                )}

                {group.members.map((res) => {
                  const techTasks = tasks.filter((t) => t.technicianId === res.id);

                  // Berechne Überbuchung (Tagesansicht: >8h, Wochenansicht: >5 Tage)
                  const totalHours = techTasks.reduce((acc, curr) => acc + curr.durationHours, 0);
                  const isOverbooked =
                    viewScope === "day" ? totalHours > 8 : techTasks.length > 4;

                  return (
                    <div
                      key={res.id}
                      className="flex min-h-[90px] hover:bg-neutral-900/30 transition-colors"
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
                            : `${techTasks.length} Aufträge zugewiesen`}
                        </div>
                      </div>

                      {/* Rechte Spalte: Zeitraster (Horizontal nebeneinander!) */}
                      <div className="flex-1 relative flex divide-x divide-neutral-900 bg-neutral-950">
                        {/* Drop-Zonen */}
                        {Array.from({ length: currentColumnsCount }).map((_, slotIdx) => (
                          <div
                            key={slotIdx}
                            onDragOver={handleDragOver}
                            onDrop={() => handleDropOnTimeSlot(res.id, slotIdx)}
                            className="flex-1 h-full hover:bg-blue-950/20 transition-colors"
                          />
                        ))}

                        {/* Auftrags-Balken absolut über dem horizontalen Raster positioniert */}
                        {techTasks.map((task) => {
                          let leftPercent = 0;
                          let widthPercent = 0;

                          if (viewScope === "day") {
                            // Berechnung auf Basis der 15 Stunden (6-20 Uhr)
                            const startOffset = Math.max(0, task.startHour - 6);
                            leftPercent = (startOffset / HOURS.length) * 100;
                            widthPercent = (task.durationHours / HOURS.length) * 100;
                          } else {
                            // Berechnung auf Basis der 6 Wochentage
                            const dayIndex = task.dayOfWeek ?? 0;
                            const daysSpan = task.durationDays ?? 1;
                            leftPercent = (dayIndex / WEEK_DAYS.length) * 100;
                            widthPercent = (daysSpan / WEEK_DAYS.length) * 100;
                          }

                          // Absicherung gegen Überlauf
                          widthPercent = Math.min(widthPercent, 100 - leftPercent);

                          const isEmergency = task.priority === "1_EMERGENCY";

                          return (
                            <div
                              key={task.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, task.id)}
                              style={{
                                left: `${leftPercent}%`,
                                width: `calc(${widthPercent}% - 4px)`,
                                top: "8px",
                                bottom: "8px",
                              }}
                              className={`absolute rounded-lg border p-2 shadow-lg cursor-grab active:cursor-grabbing transition-all flex flex-col justify-between overflow-hidden z-10 ${
                                isEmergency
                                  ? "bg-red-950/90 border-red-600 text-white"
                                  : task.hasStockConflict
                                  ? "bg-amber-950/90 border-amber-500 text-amber-100"
                                  : "bg-blue-950/90 border-blue-600 text-blue-100"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
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

                              <span className="text-[11px] font-semibold truncate leading-tight">
                                {task.title}
                              </span>

                              <div className="flex items-center justify-between text-[9px] text-neutral-400 font-mono">
                                <span className="truncate max-w-[120px]">{task.equipmentName}</span>
                                <span className="shrink-0 font-bold text-neutral-300">
                                  {viewScope === "day"
                                    ? `${task.durationHours}h`
                                    : `${task.durationDays || 1}d`}
                                </span>
                              </div>

                              {/* Resize Handle an der rechten Kante */}
                              <div
                                onMouseDown={(e) => handleResizeStart(e, task.id)}
                                title="Ziehen zum Verlängern der Einsatzdauer"
                                className="absolute right-0 top-0 bottom-0 w-2.5 cursor-ew-resize hover:bg-white/40 transition-colors"
                              />
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
    </div>
  );
}
