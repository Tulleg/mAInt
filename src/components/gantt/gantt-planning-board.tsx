"use client";

import * as React from "react";
import { useState, useMemo } from "react";
import Link from "next/link";
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
  ExternalLink,
  X,
  Calendar,
  Layers,
  CalendarDays,
  Sparkles,
} from "lucide-react";

export interface GanttOrderTask {
  id: string;
  orderNumber: string;
  title: string;
  description?: string;
  priority: "1_EMERGENCY" | "2_HIGH" | "3_MEDIUM" | "4_LOW";
  equipmentId: string;
  equipmentNumber?: string;
  equipmentName: string;
  functionalLocationCode?: string;
  technicianId?: string | null;
  technicianName?: string | null;
  qualificationRequired?: string;
  executionDate: string; // ISO Datum z.B. "2026-10-20"
  startMinutes: number; // 360 (06:00) bis 1260 (21:00)
  durationMinutes: number; // Mindestens 15 Minuten
  durationDays?: number; // Für Wochen-/Monatsansicht
  hasStockConflict?: boolean;
  missingPartName?: string;
  sapOrderNr?: string;
  damageCode?: string;
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

const START_OF_DAY_MINUTES = 6 * 60; // 06:00 = 360 Min
const END_OF_DAY_MINUTES = 21 * 60; // 21:00 = 1260 Min
const TOTAL_DAY_MINUTES = END_OF_DAY_MINUTES - START_OF_DAY_MINUTES; // 900 Min = 15 Std
const STEP_MINUTES = 15; // 15-Minuten Rasterung

const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]; // 15 Stunden-Spalten

function formatMinutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function formatDateToIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function InteractiveGanttPlanningBoard({
  resources,
  initialTasks,
  onTaskUpdate,
}: InteractiveGanttProps) {
  // Zentraler Kalender-Anker: Startet bei heute (20. Okt 2026)
  const [currentAnchorDate, setCurrentAnchorDate] = useState<Date>(new Date(2026, 9, 20));
  const [viewScope, setViewScope] = useState<"day" | "week" | "month">("day");
  const [groupBy, setGroupBy] = useState<"technician" | "qualification">("technician");

  // Initialisierung der Aufträge mit echtem ISO-Ausführungsdatum
  const [tasks, setTasks] = useState<GanttOrderTask[]>(() => {
    return initialTasks.map((t, idx) => {
      const isUnplanned = idx >= 3;
      const startMin = (t as any).startHour ? (t as any).startHour * 60 : t.startMinutes || (7 * 60 + (idx % 4) * 45);
      const durMin = (t as any).durationHours ? (t as any).durationHours * 60 : t.durationMinutes || 90;
      
      // Verteile die Tasks auf die Woche um den 20. Okt 2026
      const taskDate = new Date(2026, 9, 20);
      taskDate.setDate(taskDate.getDate() + (idx % 4));

      return {
        ...t,
        executionDate: t.executionDate || formatDateToIso(taskDate),
        description: t.description || "Reguläre Instandhaltungsmaßnahme gemäß Prüfvorschrift.",
        equipmentNumber: t.equipmentNumber || "EQ-10042",
        functionalLocationCode: t.functionalLocationCode || "W1-HALLE2-LINIE4",
        technicianId: isUnplanned ? null : t.technicianId || resources[idx % resources.length]?.id,
        technicianName: isUnplanned ? null : t.technicianName || resources[idx % resources.length]?.name,
        startMinutes: startMin,
        durationMinutes: durMin,
        durationDays: t.durationDays ?? (idx === 0 ? 2 : 1),
      };
    });
  });

  // Detail Modal / Popup State
  const [selectedTaskForDetails, setSelectedTaskForDetails] = useState<GanttOrderTask | null>(null);
  const datePickerInputRef = React.useRef<HTMLInputElement | null>(null);

  // Dragging & Resizing States
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOffsetMinutes, setDragOffsetMinutes] = useState<number>(0);
  const [resizingTask, setResizingTask] = useState<{
    id: string;
    initialX: number;
    initialVal: number;
  } | null>(null);

  // 1. DYNAMISCHE KALENDER-BERECHNUNG FÜR TAG, WOCHE UND MONAT
  const timelineColumns = useMemo(() => {
    if (viewScope === "day") {
      // 15 Stunden Spalten für den gewählten Tag
      const dayIso = formatDateToIso(currentAnchorDate);
      return HOURS.map((h) => ({
        key: `hour-${h}`,
        label: `${h.toString().padStart(2, "0")}:00`,
        subLabel: "",
        dateIso: dayIso,
        hour: h,
      }));
    }

    if (viewScope === "week") {
      // 7 Wochentage ausgehend vom Montag der aktuellen Woche
      const startOfWeek = new Date(currentAnchorDate);
      const dayOfWeek = (startOfWeek.getDay() + 6) % 7; // 0 = Montag
      startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);

      const dayNames = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
      return Array.from({ length: 7 }).map((_, i) => {
        const colDate = new Date(startOfWeek);
        colDate.setDate(colDate.getDate() + i);
        return {
          key: `week-${formatDateToIso(colDate)}`,
          label: dayNames[i],
          subLabel: colDate.toLocaleDateString("de-DE", { day: "2-digit", month: "short" }),
          dateIso: formatDateToIso(colDate),
        };
      });
    }

    // Monatsansicht: Alle Tage des aktuellen Monats (z.B. 31 Tage im Oktober)
    const year = currentAnchorDate.getFullYear();
    const month = currentAnchorDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    return Array.from({ length: daysInMonth }).map((_, i) => {
      const colDate = new Date(year, month, i + 1);
      const isWeekend = colDate.getDay() === 0 || colDate.getDay() === 6;
      return {
        key: `month-${formatDateToIso(colDate)}`,
        label: `${i + 1}`,
        subLabel: colDate.toLocaleDateString("de-DE", { weekday: "narrow" }),
        dateIso: formatDateToIso(colDate),
        isWeekend,
      };
    });
  }, [viewScope, currentAnchorDate]);

  // Kalendernavigation vor / zurück
  const navigateTimeline = (direction: -1 | 1) => {
    const next = new Date(currentAnchorDate);
    if (viewScope === "day") {
      next.setDate(next.getDate() + direction);
    } else if (viewScope === "week") {
      next.setDate(next.getDate() + direction * 7);
    } else if (viewScope === "month") {
      next.setMonth(next.getMonth() + direction);
    }
    setCurrentAnchorDate(next);
  };

  const jumpToToday = () => {
    setCurrentAnchorDate(new Date(2026, 9, 20));
  };

  // Anzeige-Text im Kalender-Header
  const timelineHeaderTitle = useMemo(() => {
    if (viewScope === "day") {
      return currentAnchorDate.toLocaleDateString("de-DE", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    }
    if (viewScope === "week") {
      const firstDay = timelineColumns[0]?.subLabel || "";
      const lastDay = timelineColumns[6]?.subLabel || "";
      return `Woche ${firstDay} – ${lastDay} ${currentAnchorDate.getFullYear()}`;
    }
    return currentAnchorDate.toLocaleDateString("de-DE", {
      month: "long",
      year: "numeric",
    });
  }, [viewScope, currentAnchorDate, timelineColumns]);

  // Filterung: Welche Tasks sind in der aktuellen Ansicht sichtbar?
  // Berücksichtigt auch mehrtägige Maßnahmen (z.B. 10 Tage, 20 Tage),
  // die vor oder während des Zeitraums gestartet sind und hineinragen!
  const visibleTasksMap = useMemo(() => {
    if (timelineColumns.length === 0) return new Map<string, GanttOrderTask[]>();

    const firstColIso = timelineColumns[0].dateIso;
    const lastColIso = timelineColumns[timelineColumns.length - 1].dateIso;
    const firstColTime = new Date(firstColIso).getTime();
    const lastColTime = new Date(lastColIso).getTime() + 24 * 60 * 60 * 1000 - 1; // Bis Ende des letzten Tages

    const map = new Map<string, GanttOrderTask[]>();

    tasks.forEach((t) => {
      if (!t.technicianId) return; // Ungeplante bleiben im Eingang

      if (viewScope === "day") {
        // Tagesansicht: Exakter Tag
        if (t.executionDate === firstColIso) {
          const list = map.get(t.technicianId) || [];
          list.push(t);
          map.set(t.technicianId, list);
        }
      } else {
        // Wochen- und Monatsansicht: Berechne Start und Ende der Maßnahme in Millisekunden
        const taskStartTime = new Date(t.executionDate).getTime();
        const taskDurationDays = t.durationDays || 1;
        const taskEndTime = taskStartTime + taskDurationDays * 24 * 60 * 60 * 1000 - 1;

        // Liegt die Maßnahme ganz oder teilweise im sichtbaren Zeitraum?
        const isOverlapping = taskStartTime <= lastColTime && taskEndTime >= firstColTime;

        if (isOverlapping) {
          const list = map.get(t.technicianId) || [];
          list.push(t);
          map.set(t.technicianId, list);
        }
      }
    });

    return map;
  }, [tasks, timelineColumns, viewScope]);

  const unplannedTasks = useMemo(() => tasks.filter((t) => !t.technicianId), [tasks]);

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

  // Drag & Drop
  const handleDragStart = (e: React.DragEvent, task: GanttOrderTask) => {
    if (resizingTask) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", task.id);
    e.dataTransfer.effectAllowed = "move";
    setDraggingTaskId(task.id);

    const cardRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clickXInCard = e.clientX - cardRect.left;
    const cardWidth = cardRect.width || 1;
    const clickRatio = Math.max(0, Math.min(1, clickXInCard / cardWidth));
    const offsetMin = Math.round((clickRatio * task.durationMinutes) / STEP_MINUTES) * STEP_MINUTES;
    setDragOffsetMinutes(offsetMin);
  };

  const handleDragEnd = () => {
    setDraggingTaskId(null);
    setDragOffsetMinutes(0);
  };

  // Drop auf Zeitachse
  const handleDropOnGanttRow = (techId: string, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!draggingTaskId) return;

    const rowRect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rowRect.left;
    const clickPercent = Math.max(0, Math.min(1, clickX / rowRect.width));

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === draggingTaskId) {
          const tech = resources.find((r) => r.id === techId);
          let updated: GanttOrderTask;

          if (viewScope === "day") {
            const mouseMinute = START_OF_DAY_MINUTES + clickPercent * TOTAL_DAY_MINUTES;
            const desiredStart = mouseMinute - dragOffsetMinutes;
            const snappedMinute = Math.round(desiredStart / STEP_MINUTES) * STEP_MINUTES;
            const maxStart = END_OF_DAY_MINUTES - t.durationMinutes;
            const safeStart = Math.max(START_OF_DAY_MINUTES, Math.min(maxStart, snappedMinute));

            updated = {
              ...t,
              technicianId: techId,
              technicianName: tech?.name || "Zugewiesen",
              executionDate: formatDateToIso(currentAnchorDate), // Tag der Tagesansicht übernehmen
              startMinutes: safeStart,
            };
          } else {
            // Wochen- oder Monatsansicht: Berechne die Spalte (Tag)
            const colIndex = Math.min(
              timelineColumns.length - 1,
              Math.floor(clickPercent * timelineColumns.length)
            );
            const targetCol = timelineColumns[colIndex];

            updated = {
              ...t,
              technicianId: techId,
              technicianName: tech?.name || "Zugewiesen",
              executionDate: targetCol?.dateIso || t.executionDate,
              durationDays: t.durationDays || 1,
            };
          }

          if (onTaskUpdate) onTaskUpdate(updated);
          return updated;
        }
        return t;
      })
    );
    setDraggingTaskId(null);
    setDragOffsetMinutes(0);
  };

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

  // Resize Handhabung
  const handleResizeMouseDown = (e: React.MouseEvent, task: GanttOrderTask) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingTask({
      id: task.id,
      initialX: e.clientX,
      initialVal: viewScope === "day" ? task.durationMinutes : task.durationDays || 1,
    });
  };

  const handleGlobalMouseMove = (e: React.MouseEvent) => {
    if (!resizingTask) return;
    const diff = e.clientX - resizingTask.initialX;

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === resizingTask.id) {
          if (viewScope === "day") {
            const deltaSteps = Math.round(diff / 15);
            const deltaMinutes = deltaSteps * STEP_MINUTES;
            const newMinutes = Math.max(15, Math.min(480, resizingTask.initialVal + deltaMinutes));
            return { ...t, durationMinutes: newMinutes };
          } else {
            // Wochen- oder Monatsansicht: Schrittweite entspricht der Breite eines Tages (1 Tag = Spaltenbreite)
            // 7 Tage in der Woche -> ca. 100px; 31 Tage im Monat -> ca. 25-35px
            const totalCols = timelineColumns.length || 7;
            // Wir berechnen die Spaltenbreite dynamisch
            const stepPx = viewScope === "week" ? 90 : 28;
            const deltaDays = Math.round(diff / stepPx);
            // Eine Störung / Revision kann bis zu 60 Tage lang sein!
            const newDays = Math.max(1, Math.min(60, resizingTask.initialVal + deltaDays));
            return { ...t, durationDays: newDays };
          }
        }
        return t;
      })
    );
  };

  const handleGlobalMouseUp = () => {
    if (resizingTask) setResizingTask(null);
  };

  return (
    <div
      className="space-y-6 select-none"
      onMouseMove={handleGlobalMouseMove}
      onMouseUp={handleGlobalMouseUp}
    >
      {/* TOP CONTROLS & KALENDER-NAVIGATION */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 pb-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Umschalter Tag / Woche / Monat */}
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
            <button
              type="button"
              onClick={() => setViewScope("month")}
              className={`h-7 px-3 text-xs font-medium rounded-md transition-all ${
                viewScope === "month"
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Monatsansicht
            </button>
          </div>

          {/* Kalender Vor / Zurück Schalter mit Echtdatum & Date-Picker */}
          <div className="flex items-center gap-2 border-l border-neutral-800 pl-3">
            <Button
              variant="outline"
              size="sm"
              onClick={jumpToToday}
              className="h-7 text-xs border-neutral-700 bg-neutral-900 text-neutral-200"
            >
              Heute
            </Button>
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigateTimeline(-1)}
                className="h-7 w-7 text-neutral-400 hover:text-white"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              {/* Klickbare Datumsanzeige mit explizitem showPicker() Aufruf */}
              <div className="relative flex items-center">
                <button
                  type="button"
                  title="Klicken, um den Kalender zu öffnen"
                  onClick={() => {
                    const el = datePickerInputRef.current;
                    if (el) {
                      if (typeof el.showPicker === "function") {
                        el.showPicker();
                      } else {
                        el.focus();
                        el.click();
                      }
                    }
                  }}
                  className="flex items-center justify-center gap-1.5 px-3 py-1 rounded-md border border-neutral-700 bg-neutral-900 hover:border-blue-500 hover:bg-neutral-800 transition-all text-xs font-bold text-white min-w-[220px] font-mono group cursor-pointer shadow-sm"
                >
                  <CalendarDays className="h-4 w-4 text-blue-400 group-hover:scale-110 transition-transform shrink-0" />
                  <span className="truncate">{timelineHeaderTitle}</span>
                </button>

                <input
                  ref={datePickerInputRef}
                  type="date"
                  value={formatDateToIso(currentAnchorDate)}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) return;
                    const [y, m, d] = val.split("-").map(Number);
                    setCurrentAnchorDate(new Date(y, m - 1, d));
                  }}
                  className="sr-only"
                />
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigateTimeline(1)}
                className="h-7 w-7 text-neutral-400 hover:text-white"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Gruppierung & Neue Störung anlegen */}
        <div className="flex items-center gap-3">
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

          <Link href="/orders/new">
            <Button
              size="sm"
              className="h-8 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm"
            >
              <Sparkles className="h-3.5 w-3.5 text-blue-200" />
              + Neue Störung melden
            </Button>
          </Link>
        </div>
      </div>

      {/* HAUPTTEIL: GANTT PLANUNGSBOARD */}
      <Card className="border-neutral-800 bg-neutral-950 overflow-hidden shadow-2xl">
        <div className="flex flex-col w-full">
          {/* Kopfzeile (Links: Ressourcen, Rechts: Dynamische Zeitachse) */}
          <div className="flex border-b border-neutral-800 bg-neutral-900/90 text-xs font-semibold text-neutral-400">
            <div className="w-72 shrink-0 p-3 border-r border-neutral-800 flex items-center gap-2 uppercase tracking-wider text-[11px]">
              <User className="h-3.5 w-3.5 text-blue-400" />
              Ressource & Qualifikation
            </div>

            {/* Dynamisches Zeitraster */}
            <div className="flex-1 flex divide-x divide-neutral-800 overflow-hidden">
              {timelineColumns.map((col) => (
                <div
                  key={col.key}
                  className={`flex-1 py-2 text-center text-xs ${
                    (col as any).isWeekend ? "bg-neutral-900/90 text-neutral-500" : "bg-neutral-900/50 text-neutral-300"
                  }`}
                >
                  <span className="font-semibold block font-mono text-[11px]">{col.label}</span>
                  {col.subLabel && (
                    <span className="text-[10px] text-neutral-500 font-mono block">
                      {col.subLabel}
                    </span>
                  )}
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
                  const techTasks = visibleTasksMap.get(res.id) || [];
                  const totalMinutes = techTasks.reduce((acc, curr) => acc + curr.durationMinutes, 0);
                  const isOverbooked =
                    viewScope === "day" ? totalMinutes > 8 * 60 : techTasks.length > 5;

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
                            ? `Geplant: ${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m / 8h`
                            : `${techTasks.length} Aufträge im Zeitraum`}
                        </div>
                      </div>

                      {/* Rechte Spalte: Zeitraster mit Drop-Zone */}
                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDropOnGanttRow(res.id, e)}
                        className="flex-1 relative flex divide-x divide-neutral-900 bg-neutral-950"
                      >
                        {/* Spalten-Hintergrund */}
                        {timelineColumns.map((col, i) => (
                          <div
                            key={i}
                            className={`flex-1 h-full pointer-events-none ${
                              (col as any).isWeekend ? "bg-neutral-950/80" : ""
                            }`}
                          />
                        ))}

                        {/* Auftrags-Balken */}
                        {techTasks.map((task) => {
                          let leftPercent = 0;
                          let widthPercent = 0;

                          if (viewScope === "day") {
                            const offsetMinutes = Math.max(0, task.startMinutes - START_OF_DAY_MINUTES);
                            leftPercent = (offsetMinutes / TOTAL_DAY_MINUTES) * 100;
                            widthPercent = (task.durationMinutes / TOTAL_DAY_MINUTES) * 100;
                          } else {
                            // Wochen- oder Monatsansicht: Exaktes Einrasten auf die Spalten
                            const firstColIso = timelineColumns[0]?.dateIso || "";
                            const firstColTime = new Date(firstColIso).getTime();
                            const taskStartTime = new Date(task.executionDate).getTime();
                            const oneDayMs = 24 * 60 * 60 * 1000;

                            // Berechne relative Tage ab Start der Ansicht
                            const dayOffset = Math.round((taskStartTime - firstColTime) / oneDayMs);
                            const totalDays = timelineColumns.length;

                            // Start kann auch vor dem sichtbaren Fenster liegen (Clipping)
                            const visibleStartDay = Math.max(0, dayOffset);
                            const taskDurationDays = task.durationDays || 1;
                            // Wie viele Tage ragen in den sichtbaren Bereich?
                            const visibleDaysSpan = Math.max(
                              1,
                              Math.min(totalDays - visibleStartDay, taskDurationDays - (visibleStartDay - dayOffset))
                            );

                            leftPercent = (visibleStartDay / totalDays) * 100;
                            widthPercent = (visibleDaysSpan / totalDays) * 100;
                          }

                          widthPercent = Math.min(widthPercent, 100 - leftPercent);
                          const isEmergency = task.priority === "1_EMERGENCY";

                          return (
                            <div
                              key={task.id}
                              draggable={!resizingTask}
                              onDragStart={(e) => handleDragStart(e, task)}
                              onDragEnd={handleDragEnd}
                              onClick={() => setSelectedTaskForDetails(task)}
                              style={{
                                left: `${leftPercent}%`,
                                width: `calc(${widthPercent}% - 4px)`,
                                top: "8px",
                                bottom: "8px",
                              }}
                              className={`absolute rounded-lg border p-2 shadow-lg cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-blue-400 transition-all flex flex-col justify-between overflow-hidden z-10 ${
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
                                <div className="flex items-center gap-1">
                                  {task.hasStockConflict && (
                                    <span
                                      title={`Materialengpass: ${task.missingPartName}`}
                                      className="text-amber-400 shrink-0"
                                    >
                                      <PackageX className="h-3 w-3" />
                                    </span>
                                  )}
                                  <ExternalLink className="h-3 w-3 text-neutral-400 hover:text-white" />
                                </div>
                              </div>

                              <span className="text-[11px] font-semibold truncate leading-tight pointer-events-none">
                                {task.title}
                              </span>

                              <div className="flex items-center justify-between text-[9px] text-neutral-300 font-mono pointer-events-none">
                                <span className="truncate max-w-[110px]">{task.equipmentName}</span>
                                <span className="shrink-0 font-bold bg-black/40 px-1 py-0.5 rounded">
                                  {viewScope === "day"
                                    ? `${formatMinutesToTime(task.startMinutes)} (${task.durationMinutes}m)`
                                    : task.executionDate.slice(5)}
                                </span>
                              </div>

                              {/* Resize Handle */}
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

      {/* DISPO-POOL: AUFTRAGSEINGANG */}
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
                Klicke auf eine Karte für die Detailsicht oder ziehe sie nach oben in das Raster.
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
                    draggable={!resizingTask}
                    onDragStart={(e) => handleDragStart(e, task)}
                    onDragEnd={handleDragEnd}
                    onClick={() => setSelectedTaskForDetails(task)}
                    className={`p-3 rounded-lg border shadow cursor-pointer hover:border-blue-400 transition-all ${
                      isEmergency
                        ? "bg-red-950/40 border-red-800/80 text-red-200"
                        : task.hasStockConflict
                        ? "bg-amber-950/40 border-amber-800/80 text-amber-200"
                        : "bg-neutral-950 border-neutral-800 text-neutral-200"
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono mb-1 pointer-events-none">
                      <span className="font-bold text-white">{task.orderNumber}</span>
                      <Badge
                        variant={isEmergency ? "destructive" : "secondary"}
                        className="text-[9px] py-0 px-1"
                      >
                        {isEmergency ? "Notfall" : `${task.durationMinutes}m`}
                      </Badge>
                    </div>

                    <h4 className="text-xs font-semibold truncate text-white mb-1 pointer-events-none">
                      {task.title}
                    </h4>

                    <div className="flex items-center justify-between text-[10px] text-neutral-400 pt-1 border-t border-neutral-800/60 pointer-events-none">
                      <span className="truncate max-w-[130px]">{task.equipmentName}</span>
                      <span className="text-blue-400 font-medium font-mono">{task.executionDate}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* POPUP / MODAL: DETAILANSICHT MIT ECHTEM DATUMS-PICKER */}
      {selectedTaskForDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-neutral-800 bg-neutral-950">
              <div className="flex items-center gap-2.5">
                <Wrench className="h-5 w-5 text-blue-400" />
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    {selectedTaskForDetails.orderNumber}
                    <Badge
                      variant={
                        selectedTaskForDetails.priority === "1_EMERGENCY"
                          ? "destructive"
                          : "default"
                      }
                      className="text-[10px]"
                    >
                      {selectedTaskForDetails.priority}
                    </Badge>
                  </h3>
                  <span className="text-xs text-neutral-400">{selectedTaskForDetails.title}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedTaskForDetails(null)}
                className="h-8 w-8 text-neutral-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-5 text-xs text-neutral-300 overflow-y-auto max-h-[70vh]">
              {selectedTaskForDetails.hasStockConflict && (
                <div className="p-3 rounded-lg border border-amber-800/80 bg-amber-950/40 text-amber-200 flex items-start gap-2.5">
                  <PackageX className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">SAP MM Materialengpass:</span>
                    <span>
                      Das für die Reparatur benötigte Ersatzteil (
                      <strong>{selectedTaskForDetails.missingPartName}</strong>) weist keinen
                      verfügbaren Lagerbestand auf. Bitte Beschaffung prüfen oder Termin verschieben.
                    </span>
                  </div>
                </div>
              )}

              {/* Stammdaten Grid */}
              <div className="grid grid-cols-2 gap-4 bg-neutral-950 p-4 rounded-lg border border-neutral-800">
                <div>
                  <span className="text-neutral-500 block text-[10px] uppercase font-bold">
                    Equipment / Anlage
                  </span>
                  <span className="font-semibold text-white block mt-0.5">
                    {selectedTaskForDetails.equipmentName}
                  </span>
                  <span className="text-[10px] text-neutral-400 font-mono">
                    {selectedTaskForDetails.equipmentNumber}
                  </span>
                </div>

                <div>
                  <span className="text-neutral-500 block text-[10px] uppercase font-bold">
                    Technischer Platz (FLoc)
                  </span>
                  <span className="font-semibold text-white block mt-0.5">
                    {selectedTaskForDetails.functionalLocationCode}
                  </span>
                </div>

                <div>
                  <span className="text-neutral-500 block text-[10px] uppercase font-bold">
                    Zuständiger Monteur
                  </span>
                  <select
                    value={selectedTaskForDetails.technicianId || "UNASSIGNED"}
                    onChange={(e) => {
                      const newTechId = e.target.value === "UNASSIGNED" ? null : e.target.value;
                      const tech = resources.find((r) => r.id === newTechId);
                      const updated = {
                        ...selectedTaskForDetails,
                        technicianId: newTechId,
                        technicianName: tech ? tech.name : null,
                      };
                      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
                      setSelectedTaskForDetails(updated);
                      if (onTaskUpdate) onTaskUpdate(updated);
                    }}
                    className="w-full mt-1 rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="UNASSIGNED">❌ Nicht zugeordnet (Auftragseingang)</option>
                    {resources.map((r) => (
                      <option key={r.id} value={r.id}>
                        👤 {r.name} ({r.qualification})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="text-neutral-500 block text-[10px] uppercase font-bold">
                    Priorität
                  </span>
                  <span className="font-semibold text-white block mt-1 font-mono">
                    {selectedTaskForDetails.priority}
                  </span>
                </div>
              </div>

              {/* DATUM- & ZEITPLANUNG: AUSFÜHRUNGSDATUM, START, ENDE, DAUER */}
              <div className="bg-neutral-950 p-4 rounded-lg border border-neutral-800 space-y-3">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-blue-400" />
                  Terminierung & Ausführungszeitpunkt
                </span>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {/* Ausführungsdatum Date-Picker */}
                  <div>
                    <label className="text-[11px] font-medium text-neutral-400 block mb-1">
                      Ausführungsdatum:
                    </label>
                    <input
                      type="date"
                      value={selectedTaskForDetails.executionDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        const updated = {
                          ...selectedTaskForDetails,
                          executionDate: val,
                        };
                        setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
                        setSelectedTaskForDetails(updated);
                        if (onTaskUpdate) onTaskUpdate(updated);
                      }}
                      className="w-full rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {/* Startzeit Time-Picker */}
                  <div>
                    <label className="text-[11px] font-medium text-neutral-400 block mb-1">
                      Startzeit (hh:mm):
                    </label>
                    <input
                      type="time"
                      value={formatMinutesToTime(selectedTaskForDetails.startMinutes)}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        const [hoursStr, minsStr] = val.split(":");
                        const totalMins = parseInt(hoursStr) * 60 + parseInt(minsStr);
                        const updated = {
                          ...selectedTaskForDetails,
                          startMinutes: totalMins,
                        };
                        setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
                        setSelectedTaskForDetails(updated);
                        if (onTaskUpdate) onTaskUpdate(updated);
                      }}
                      className="w-full rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {/* Endzeit Time-Picker */}
                  <div>
                    <label className="text-[11px] font-medium text-neutral-400 block mb-1">
                      Endzeit (hh:mm):
                    </label>
                    <input
                      type="time"
                      value={formatMinutesToTime(
                        selectedTaskForDetails.startMinutes + selectedTaskForDetails.durationMinutes
                      )}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        const [hoursStr, minsStr] = val.split(":");
                        const endMins = parseInt(hoursStr) * 60 + parseInt(minsStr);
                        const newDuration = Math.max(15, endMins - selectedTaskForDetails.startMinutes);
                        const updated = {
                          ...selectedTaskForDetails,
                          durationMinutes: newDuration,
                        };
                        setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
                        setSelectedTaskForDetails(updated);
                        if (onTaskUpdate) onTaskUpdate(updated);
                      }}
                      className="w-full rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {/* Dauer in Minuten & Tage */}
                  <div>
                    <label className="text-[11px] font-medium text-neutral-400 block mb-1">
                      Dauer ({viewScope === "day" ? "Minuten" : "Tage"}):
                    </label>
                    <div className="flex items-center gap-1.5">
                      {viewScope === "day" ? (
                        <input
                          type="number"
                          step={15}
                          min={15}
                          max={480}
                          value={selectedTaskForDetails.durationMinutes}
                          onChange={(e) => {
                            const mins = Math.max(15, parseInt(e.target.value) || 15);
                            const updated = {
                              ...selectedTaskForDetails,
                              durationMinutes: mins,
                            };
                            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
                            setSelectedTaskForDetails(updated);
                            if (onTaskUpdate) onTaskUpdate(updated);
                          }}
                          className="w-full rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      ) : (
                        <input
                          type="number"
                          step={1}
                          min={1}
                          max={90}
                          value={selectedTaskForDetails.durationDays || 1}
                          onChange={(e) => {
                            const days = Math.max(1, Math.min(90, parseInt(e.target.value) || 1));
                            const updated = {
                              ...selectedTaskForDetails,
                              durationDays: days,
                            };
                            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
                            setSelectedTaskForDetails(updated);
                            if (onTaskUpdate) onTaskUpdate(updated);
                          }}
                          className="w-full rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      )}
                      <span className="text-[11px] text-neutral-400 font-mono">
                        {viewScope === "day" ? "min" : "Tage"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Presets */}
                <div className="pt-2 flex flex-wrap items-center gap-1.5 border-t border-neutral-800/80">
                  <span className="text-[10px] text-neutral-500 uppercase font-semibold mr-1">
                    Schnellwahl:
                  </span>
                  {viewScope === "day"
                    ? [15, 30, 45, 60, 90, 120, 180, 240].map((mins) => (
                        <button
                          key={mins}
                          onClick={() => {
                            const updated = {
                              ...selectedTaskForDetails,
                              durationMinutes: mins,
                            };
                            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
                            setSelectedTaskForDetails(updated);
                            if (onTaskUpdate) onTaskUpdate(updated);
                          }}
                          className={`px-2 py-0.5 rounded border text-[10px] font-mono transition-colors ${
                            selectedTaskForDetails.durationMinutes === mins
                              ? "bg-blue-600 border-blue-500 text-white font-bold"
                              : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white"
                          }`}
                        >
                          {mins}m
                        </button>
                      ))
                    : [1, 2, 3, 5, 7, 10, 14, 21, 30].map((days) => (
                        <button
                          key={days}
                          onClick={() => {
                            const updated = {
                              ...selectedTaskForDetails,
                              durationDays: days,
                            };
                            setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
                            setSelectedTaskForDetails(updated);
                            if (onTaskUpdate) onTaskUpdate(updated);
                          }}
                          className={`px-2 py-0.5 rounded border text-[10px] font-mono transition-colors ${
                            (selectedTaskForDetails.durationDays || 1) === days
                              ? "bg-blue-600 border-blue-500 text-white font-bold"
                              : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white"
                          }`}
                        >
                          {days} Tage
                        </button>
                      ))}
                </div>
              </div>

              {/* Beschreibung */}
              <div>
                <label className="text-xs font-semibold text-neutral-400 block mb-1">
                  Arbeitsanweisung & Symptombeschreibung:
                </label>
                <div className="bg-neutral-950 p-3 rounded border border-neutral-800 text-neutral-200 leading-relaxed font-sans">
                  {selectedTaskForDetails.description}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between p-4 border-t border-neutral-800 bg-neutral-950">
              <span className="text-[11px] text-neutral-500 font-mono">
                Datum: {selectedTaskForDetails.executionDate} • Start: {formatMinutesToTime(selectedTaskForDetails.startMinutes)} Uhr
              </span>
              <Button
                onClick={() => setSelectedTaskForDetails(null)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-4"
              >
                Schließen
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
