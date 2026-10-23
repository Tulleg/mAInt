"use client";

import * as React from "react";
import { useState, useMemo, useEffect, useTransition, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  ExternalLink,
  X,
  Calendar,
  CalendarDays,
  Sparkles,
  Clock,
  CalendarPlus,
} from "lucide-react";
import { toast } from "sonner";

export interface GanttOrderTask {
  id: string;
  orderNumber: string;
  title: string;
  description?: string;
  priority: "1_EMERGENCY" | "2_HIGH" | "3_MEDIUM" | "4_LOW";
  orderType?: string; // z.B. "IH01" (Störung), "IH02" (Wartung), "IH03" (Kalibrierung)
  orderTypeCode?: string; // z.B. "FAULT", "MAINTENANCE", "CALIBRATION", "INSPECTION"
  equipmentId: string;
  equipmentNumber?: string;
  equipmentName: string;
  functionalLocationCode?: string;
  technicianId?: string | null;
  assignedUserId?: string | null;
  technicianName?: string | null;
  qualificationRequired?: string;
  executionDate: string; // Lokales ISO-Datum z.B. "2026-10-20"
  startMinutes: number; // 0 bis 1440
  durationMinutes: number; // Mindestens 15 Minuten
  durationDays?: number; // Für Wochen-/Monatsansicht
  scheduledStartDate?: string; // ISO-Timestamp
  scheduledEndDate?: string; // ISO-Timestamp
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
  onTaskUpdate?: (task: any) => Promise<any> | void;
}

const SLOT_WIDTH_DAY = 50; // 50px pro Stunde in der Tagesansicht (24h = 1200px)
const SLOT_WIDTH_WEEK = 140; // 140px pro Tag
const SLOT_WIDTH_MONTH = 40; // 40px pro Tag
const SNAP_MINUTES_DAY = 15; // 15-Minuten Raster-Snap in der Tagesansicht

const DAY_HOURS = Array.from({ length: 24 }, (_, i) => i); // 0 .. 23

function formatMinutesToTime(totalMinutes: number): string {
  const safe = Math.max(0, Math.min(24 * 60, Math.round(totalMinutes)));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/**
 * Zeitzonen-sichere Formatierung eines Date-Objekts als YYYY-MM-DD (lokale Zeit).
 */
function formatDateToIso(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Zeitzonen-sicheres Parsen eines YYYY-MM-DD Strings in ein lokales Date-Objekt (00:00:00).
 */
function parseIsoDateLocal(dateIso: string): Date {
  if (!dateIso) return new Date(2026, 9, 20);
  const [y, m, d] = dateIso.slice(0, 10).split("-").map(Number);
  return new Date(y || 2026, (m || 10) - 1, d || 20, 0, 0, 0, 0);
}

/**
 * Berechnet scheduledStartDate und scheduledEndDate anhand von executionDate, startMinutes und durationMinutes.
 */
function computeScheduledDates(
  executionDateIso: string,
  startMinutes: number,
  durationMinutes: number
): { scheduledStartDate: string; scheduledEndDate: string } {
  const startObj = parseIsoDateLocal(executionDateIso);
  startObj.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
  const endObj = new Date(startObj.getTime() + durationMinutes * 60 * 1000);
  return {
    scheduledStartDate: startObj.toISOString(),
    scheduledEndDate: endObj.toISOString(),
  };
}

interface ActiveDragSession {
  taskId: string;
  initialTechId: string | null;
  initialStartMinutes: number;
  initialExecutionDate: string;
  initialDurationMinutes: number;
  initialDurationDays: number;
  startX: number;
  startY: number;
  currentTechId: string | null;
  hasMoved: boolean;
}

interface ActiveResizeSession {
  taskId: string;
  initialDurationMinutes: number;
  initialDurationDays: number;
  startX: number;
  hasMoved: boolean;
}

export function InteractiveGanttPlanningBoard({
  resources,
  initialTasks,
  onTaskUpdate,
}: InteractiveGanttProps) {
  const router = useRouter();
  // Zentraler Kalender-Anker: Startet am 20. Okt 2026
  const [currentAnchorDate, setCurrentAnchorDate] = useState<Date>(() => new Date(2026, 9, 20));
  const [viewScope, setViewScope] = useState<"day" | "week" | "month">("day");
  const [groupBy, setGroupBy] = useState<"technician" | "qualification">("technician");

  // 1. Offene & Geplante Aufträge im lokalen State halten
  const [tasks, setTasks] = useState<GanttOrderTask[]>(initialTasks);
  const tasksRef = useRef<GanttOrderTask[]>(initialTasks);

  // Refs für aktives Dragging/Resizing (verhindert Stale-Closures bei schnellen Mausbewegungen)
  const dragSessionRef = useRef<ActiveDragSession | null>(null);
  const resizeSessionRef = useRef<ActiveResizeSession | null>(null);

  const [activeDragTaskId, setActiveDragTaskId] = useState<string | null>(null);
  const [activeResizeTaskId, setActiveResizeTaskId] = useState<string | null>(null);
  const [hoveredTechId, setHoveredTechId] = useState<string | null>(null);
  const [draggingInboxTaskId, setDraggingInboxTaskId] = useState<string | null>(null);
  const [hoveredTooltipTask, setHoveredTooltipTask] = useState<{
    task: GanttOrderTask;
    techName: string;
    x: number;
    y: number;
  } | null>(null);

  // Kontrollierte Synchronisation, wenn sich initialTasks von außen ändern (während kein Drag aktiv ist)
  useEffect(() => {
    if (!dragSessionRef.current && !resizeSessionRef.current) {
      setTasks(initialTasks);
      tasksRef.current = initialTasks;
    }
  }, [initialTasks]);

  // 2. Optimistisches Drag-&-Drop & Entkoppeltes Server-Update via useTransition
  const [isPending, startTransition] = useTransition();

  const handleTaskDropOrMove = (updatedTask: GanttOrderTask, successNotice?: string) => {
    // 1. Lokalen UI-State sofort optimistisch aktualisieren
    setTasks((prev) => {
      const next = prev.map((t) => (t.id === updatedTask.id ? { ...t, ...updatedTask } : t));
      tasksRef.current = next;
      return next;
    });

    // 2. Server Action asynchron im Hintergrund über startTransition ausführen
    if (onTaskUpdate) {
      startTransition(async () => {
        try {
          const res = await onTaskUpdate(updatedTask);
          if (res && (res as any).success === false) {
            toast.error((res as any).message || "Fehler beim Aktualisieren des Auftrags.");
          } else {
            toast.success(
              (res as any)?.message ||
                successNotice ||
                `Auftrag ${updatedTask.orderNumber} erfolgreich disponiert.`
            );
          }
        } catch (err: any) {
          toast.error(err?.message || "Fehler beim Aktualisieren des Auftrags auf dem Server.");
        }
      });
    }
  };

  // Detail Modal / Popup State & Scroll Ref
  const [selectedTaskForDetails, setSelectedTaskForDetails] = useState<GanttOrderTask | null>(null);
  const datePickerInputRef = useRef<HTMLInputElement | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-Scroll zum regulären Arbeitsbeginn (06:00 Uhr) beim Wechsel in die Tagesansicht
  useEffect(() => {
    if (viewScope === "day" && timelineScrollRef.current) {
      timelineScrollRef.current.scrollLeft = 6 * SLOT_WIDTH_DAY;
    }
  }, [viewScope]);

  // 1. DYNAMISCHE KALENDER-BERECHNUNG FÜR TAG, WOCHE UND MONAT
  const timelineColumns = useMemo(() => {
    if (viewScope === "day") {
      const dayIso = formatDateToIso(currentAnchorDate);
      return DAY_HOURS.map((h) => ({
        key: `hour-${h}`,
        label: `${h.toString().padStart(2, "0")}:00`,
        subLabel: "",
        dateIso: dayIso,
        hour: h,
        width: SLOT_WIDTH_DAY,
      }));
    }

    if (viewScope === "week") {
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
          width: SLOT_WIDTH_WEEK,
        };
      });
    }

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
        width: SLOT_WIDTH_MONTH,
      };
    });
  }, [viewScope, currentAnchorDate]);

  const totalTimelineWidth = useMemo(() => {
    if (viewScope === "day") return 24 * SLOT_WIDTH_DAY; // 1200px
    if (viewScope === "week") return 7 * SLOT_WIDTH_WEEK; // 980px
    return timelineColumns.length * SLOT_WIDTH_MONTH;
  }, [viewScope, timelineColumns]);

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
  const visibleTasksMap = useMemo(() => {
    if (timelineColumns.length === 0) return new Map<string, GanttOrderTask[]>();

    const firstColIso = timelineColumns[0].dateIso;
    const lastColIso = timelineColumns[timelineColumns.length - 1].dateIso;
    const firstColTime = parseIsoDateLocal(firstColIso).getTime();
    const lastColTime = parseIsoDateLocal(lastColIso).getTime() + 24 * 60 * 60 * 1000 - 1;

    const map = new Map<string, GanttOrderTask[]>();

    tasks.forEach((t) => {
      const techId = t.technicianId ?? t.assignedUserId;
      if (!techId) return; // Ungeplante bleiben im Auftragseingang

      if (viewScope === "day") {
        if (t.executionDate === firstColIso) {
          const list = map.get(techId) || [];
          list.push(t);
          map.set(techId, list);
        }
      } else {
        const taskStartTime = parseIsoDateLocal(t.executionDate).getTime();
        const taskDurationDays = t.durationDays || 1;
        const taskEndTime = taskStartTime + taskDurationDays * 24 * 60 * 60 * 1000 - 1;

        const isOverlapping = taskStartTime <= lastColTime && taskEndTime >= firstColTime;
        if (isOverlapping) {
          const list = map.get(techId) || [];
          list.push(t);
          map.set(techId, list);
        }
      }
    });

    return map;
  }, [tasks, timelineColumns, viewScope]);

  const unplannedTasks = useMemo(
    () => tasks.filter((t) => !(t.technicianId ?? t.assignedUserId)),
    [tasks]
  );

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

  // Window Event Listener für flüssiges Drag & Drop und Resizing aller Aufträge auf der Zeitachse
  useEffect(() => {
    if (!activeDragTaskId && !activeResizeTaskId) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      const dragSession = dragSessionRef.current;
      const resizeSession = resizeSessionRef.current;

      if (dragSession) {
        const deltaX = e.clientX - dragSession.startX;
        const deltaY = e.clientY - dragSession.startY;

        if (!dragSession.hasMoved && Math.abs(deltaX) < 3 && Math.abs(deltaY) < 3) {
          return;
        }

        dragSession.hasMoved = true;

        // Ermittle Techniker-Zeile oder Inbox-Dropzone unter dem Mauszeiger
        const elUnderCursor = document.elementFromPoint(e.clientX, e.clientY);
        const rowEl = elUnderCursor?.closest("[data-tech-id]");
        const foundTechId = rowEl?.getAttribute("data-tech-id") || dragSession.currentTechId;

        dragSession.currentTechId = foundTechId;
        setHoveredTechId(foundTechId);

        const tech = resources.find((r) => r.id === foundTechId);

        if (viewScope === "day") {
          // 3. Präzises Verschieben in der Tagesansicht:
          // Pixel-zu-Zeit-Umrechnung mit 15-Minuten Raster-Snap
          const pixelsPerHour = SLOT_WIDTH_DAY;
          const deltaHours = deltaX / pixelsPerHour;
          const deltaMinutesRaw = deltaHours * 60;
          const snappedDeltaMinutes =
            Math.round(deltaMinutesRaw / SNAP_MINUTES_DAY) * SNAP_MINUTES_DAY;

          const newStartMinutes = Math.max(
            0,
            Math.min(
              24 * 60 - dragSession.initialDurationMinutes,
              dragSession.initialStartMinutes + snappedDeltaMinutes
            )
          );

          const { scheduledStartDate, scheduledEndDate } = computeScheduledDates(
            dragSession.initialExecutionDate,
            newStartMinutes,
            dragSession.initialDurationMinutes
          );

          // Lokalen UI-State sofort flüssig aktualisieren
          setTasks((prev) => {
            const next = prev.map((t) =>
              t.id === dragSession.taskId
                ? {
                    ...t,
                    startMinutes: newStartMinutes,
                    scheduledStartDate,
                    scheduledEndDate,
                    technicianId: foundTechId,
                    assignedUserId: foundTechId,
                    technicianName: tech?.name || t.technicianName,
                  }
                : t
            );
            tasksRef.current = next;
            return next;
          });
        } else {
          // Wochen- oder Monatsansicht: Ganztägiges Einrasten
          const pixelsPerDay = viewScope === "week" ? SLOT_WIDTH_WEEK : SLOT_WIDTH_MONTH;
          const daysMoved = Math.round(deltaX / pixelsPerDay);

          const targetDate = parseIsoDateLocal(dragSession.initialExecutionDate);
          targetDate.setDate(targetDate.getDate() + daysMoved);
          const newDateIso = formatDateToIso(targetDate);

          const { scheduledStartDate, scheduledEndDate } = computeScheduledDates(
            newDateIso,
            dragSession.initialStartMinutes,
            dragSession.initialDurationMinutes
          );

          setTasks((prev) => {
            const next = prev.map((t) =>
              t.id === dragSession.taskId
                ? {
                    ...t,
                    executionDate: newDateIso,
                    scheduledStartDate,
                    scheduledEndDate,
                    technicianId: foundTechId,
                    assignedUserId: foundTechId,
                    technicianName: tech?.name || t.technicianName,
                  }
                : t
            );
            tasksRef.current = next;
            return next;
          });
        }
      } else if (resizeSession) {
        const deltaX = e.clientX - resizeSession.startX;
        if (!resizeSession.hasMoved && Math.abs(deltaX) < 3) {
          return;
        }
        resizeSession.hasMoved = true;

        if (viewScope === "day") {
          const pixelsPerHour = SLOT_WIDTH_DAY;
          const deltaHours = deltaX / pixelsPerHour;
          const deltaMinutesRaw = deltaHours * 60;
          const snappedDeltaMinutes =
            Math.round(deltaMinutesRaw / SNAP_MINUTES_DAY) * SNAP_MINUTES_DAY;
          const newDuration = Math.max(
            15,
            Math.min(24 * 60, resizeSession.initialDurationMinutes + snappedDeltaMinutes)
          );

          setTasks((prev) => {
            const next = prev.map((t) => {
              if (t.id !== resizeSession.taskId) return t;
              const { scheduledStartDate, scheduledEndDate } = computeScheduledDates(
                t.executionDate,
                t.startMinutes,
                newDuration
              );
              return {
                ...t,
                durationMinutes: newDuration,
                scheduledStartDate,
                scheduledEndDate,
              };
            });
            tasksRef.current = next;
            return next;
          });
        } else {
          const pixelsPerDay = viewScope === "week" ? SLOT_WIDTH_WEEK : SLOT_WIDTH_MONTH;
          const daysMoved = Math.round(deltaX / pixelsPerDay);
          const newDays = Math.max(
            1,
            Math.min(60, resizeSession.initialDurationDays + daysMoved)
          );

          setTasks((prev) => {
            const next = prev.map((t) =>
              t.id === resizeSession.taskId ? { ...t, durationDays: newDays } : t
            );
            tasksRef.current = next;
            return next;
          });
        }
      }
    };

    const handleWindowMouseUp = (e: MouseEvent) => {
      const dragSession = dragSessionRef.current;
      const resizeSession = resizeSessionRef.current;

      if (dragSession) {
        dragSessionRef.current = null;
        setActiveDragTaskId(null);
        setHoveredTechId(null);

        if (dragSession.hasMoved) {
          // Prüfe, ob der Balken zurück in den Auftragseingang gezogen wurde
          const elUnderCursor = document.elementFromPoint(e.clientX, e.clientY);
          const droppedOnInbox = Boolean(elUnderCursor?.closest("[data-inbox-dropzone='true']"));

          let updatedTask = tasksRef.current.find((t) => t.id === dragSession.taskId);
          if (updatedTask && droppedOnInbox) {
            updatedTask = {
              ...updatedTask,
              technicianId: null,
              assignedUserId: null,
              technicianName: null,
            };
            setTasks((prev) => {
              const next = prev.map((t) => (t.id === updatedTask!.id ? updatedTask! : t));
              tasksRef.current = next;
              return next;
            });
          }

          // 4. Entkoppeltes Server-Update erst beim Loslassen via startTransition
          if (updatedTask && onTaskUpdate) {
            const finalTask = updatedTask;
            startTransition(async () => {
              try {
                const res = await onTaskUpdate(finalTask);
                if (res && (res as any).success === false) {
                  toast.error((res as any).message || "Fehler beim Verschieben des Auftrags.");
                } else {
                  toast.success(
                    (res as any)?.message ||
                      (droppedOnInbox
                        ? `Auftrag ${finalTask.orderNumber} zurück in den Pool gelegt.`
                        : `Auftrag ${finalTask.orderNumber} erfolgreich neu disponiert.`)
                  );
                }
              } catch (err: any) {
                toast.error(err?.message || "Serverfehler beim Verschieben des Auftrags.");
              }
            });
          }
        } else {
          // Klick ohne Ziehen -> Detail-Modal öffnen
          const clickedTask = tasksRef.current.find((t) => t.id === dragSession.taskId);
          if (clickedTask) {
            setSelectedTaskForDetails(clickedTask);
          }
        }
      }

      if (resizeSession) {
        resizeSessionRef.current = null;
        setActiveResizeTaskId(null);

        if (resizeSession.hasMoved) {
          const updatedTask = tasksRef.current.find((t) => t.id === resizeSession.taskId);
          if (updatedTask && onTaskUpdate) {
            const finalTask = updatedTask;
            startTransition(async () => {
              try {
                const res = await onTaskUpdate(finalTask);
                if (res && (res as any).success === false) {
                  toast.error((res as any).message || "Fehler beim Anpassen der Dauer.");
                } else {
                  toast.success(
                    (res as any)?.message ||
                      `Dauer für Auftrag ${finalTask.orderNumber} auf ${finalTask.durationMinutes} Min angepasst.`
                  );
                }
              } catch (err: any) {
                toast.error(err?.message || "Serverfehler beim Anpassen der Dauer.");
              }
            });
          }
        }
      }
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [activeDragTaskId, activeResizeTaskId, viewScope, resources, onTaskUpdate]);

  // 1. Vollständiges Drag-&-Drop für ALLE Auftragsarten (keine Sperre!)
  const handleTaskMouseDown = (e: React.MouseEvent, task: GanttOrderTask) => {
    if ((e.target as HTMLElement).closest(".resize-handle")) return;
    if (e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    const techId = task.technicianId ?? task.assignedUserId ?? null;
    dragSessionRef.current = {
      taskId: task.id,
      initialTechId: techId,
      initialStartMinutes: task.startMinutes,
      initialExecutionDate: task.executionDate,
      initialDurationMinutes: task.durationMinutes || 60,
      initialDurationDays: task.durationDays || 1,
      startX: e.clientX,
      startY: e.clientY,
      currentTechId: techId,
      hasMoved: false,
    };
    setActiveDragTaskId(task.id);
  };

  const handleResizeMouseDown = (e: React.MouseEvent, task: GanttOrderTask) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    resizeSessionRef.current = {
      taskId: task.id,
      initialDurationMinutes: task.durationMinutes || 60,
      initialDurationDays: task.durationDays || 1,
      startX: e.clientX,
      hasMoved: false,
    };
    setActiveResizeTaskId(task.id);
  };

  // 2. Drag & Drop aus dem Eingangspool (Ungeplante Aufträge) auf die Zeitachse
  const handleDropFromInboxOnGanttRow = (
    techId: string,
    e: React.DragEvent<HTMLDivElement>,
    isTimelineTrack: boolean
  ) => {
    e.preventDefault();
    setHoveredTechId(null);

    const taskId = e.dataTransfer.getData("text/plain") || draggingInboxTaskId;
    if (!taskId) return;

    const currentTask = tasksRef.current.find((t) => t.id === taskId);
    if (!currentTask) return;

    const tech = resources.find((r) => r.id === techId);
    const durationMins = currentTask.durationMinutes || 60;
    let updated: GanttOrderTask;

    if (viewScope === "day") {
      let safeStartMinutes = currentTask.startMinutes || 8 * 60;

      if (isTimelineTrack) {
        const trackRect = e.currentTarget.getBoundingClientRect();
        // e.currentTarget ist der gescrollte Track selbst -> e.clientX - trackRect.left ist bereits die exakte X-Position!
        const clickX = Math.max(0, e.clientX - trackRect.left);
        const pixelsPerHour = SLOT_WIDTH_DAY;
        const deltaHours = clickX / pixelsPerHour;
        const rawMinutes = deltaHours * 60;
        const snappedMinutes = Math.round(rawMinutes / SNAP_MINUTES_DAY) * SNAP_MINUTES_DAY;
        safeStartMinutes = Math.max(0, Math.min(24 * 60 - durationMins, snappedMinutes));
      }

      const targetDateIso = formatDateToIso(currentAnchorDate);
      const { scheduledStartDate, scheduledEndDate } = computeScheduledDates(
        targetDateIso,
        safeStartMinutes,
        durationMins
      );

      updated = {
        ...currentTask,
        technicianId: techId,
        assignedUserId: techId,
        technicianName: tech?.name || "Zugewiesen",
        executionDate: targetDateIso,
        startMinutes: safeStartMinutes,
        durationMinutes: durationMins,
        scheduledStartDate,
        scheduledEndDate,
      };
    } else {
      let targetDateIso = formatDateToIso(currentAnchorDate);

      if (isTimelineTrack && timelineColumns.length > 0) {
        const trackRect = e.currentTarget.getBoundingClientRect();
        const clickX = Math.max(0, e.clientX - trackRect.left);
        const pixelsPerDay = viewScope === "week" ? SLOT_WIDTH_WEEK : SLOT_WIDTH_MONTH;
        const colIndex = Math.min(
          timelineColumns.length - 1,
          Math.max(0, Math.floor(clickX / pixelsPerDay))
        );
        targetDateIso = timelineColumns[colIndex]?.dateIso || targetDateIso;
      }

      const { scheduledStartDate, scheduledEndDate } = computeScheduledDates(
        targetDateIso,
        currentTask.startMinutes || 8 * 60,
        durationMins
      );

      updated = {
        ...currentTask,
        technicianId: techId,
        assignedUserId: techId,
        technicianName: tech?.name || "Zugewiesen",
        executionDate: targetDateIso,
        durationDays: currentTask.durationDays || 1,
        scheduledStartDate,
        scheduledEndDate,
      };
    }

    const successMsg = `Auftrag ${updated.orderNumber} erfolgreich an ${tech?.name || "Techniker"} disponiert.`;
    handleTaskDropOrMove(updated, successMsg);
    setDraggingInboxTaskId(null);
  };

  // Drop zurück in den Auftragseingang (Disposition aufheben)
  const handleDropOnInbox = (e: React.DragEvent) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain") || draggingInboxTaskId;
    if (!taskId) return;

    const currentTask = tasksRef.current.find((t) => t.id === taskId);
    if (!currentTask) return;

    const updated: GanttOrderTask = {
      ...currentTask,
      technicianId: null,
      assignedUserId: null,
      technicianName: null,
    };

    const successMsg = `Auftrag ${updated.orderNumber} zurück in den Eingangspool verschoben.`;
    handleTaskDropOrMove(updated, successMsg);
    setDraggingInboxTaskId(null);
  };

  return (
    <div className="space-y-6">
      {/* TOP CONTROLS & KALENDER-NAVIGATION */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Umschalter Tag / Woche / Monat */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setViewScope("day")}
              className={`h-7 px-3 text-xs font-medium rounded-md transition-all ${
                viewScope === "day"
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Tagesansicht
            </button>
            <button
              type="button"
              onClick={() => setViewScope("week")}
              className={`h-7 px-3 text-xs font-medium rounded-md transition-all ${
                viewScope === "week"
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Wochenansicht
            </button>
            <button
              type="button"
              onClick={() => setViewScope("month")}
              className={`h-7 px-3 text-xs font-medium rounded-md transition-all ${
                viewScope === "month"
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Monatsansicht
            </button>
          </div>

          {/* Kalender Vor / Zurück Schalter mit Echtdatum & Date-Picker */}
          <div className="flex items-center gap-2 border-l border-slate-800 pl-3">
            <Button
              variant="outline"
              size="sm"
              onClick={jumpToToday}
              className="h-11 min-h-[44px] px-3 text-xs border-slate-700 bg-slate-900 text-slate-200"
            >
              Heute
            </Button>
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigateTimeline(-1)}
                className="h-11 w-11 min-h-[44px] min-w-[44px] text-slate-400 hover:text-white"
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
                  className="flex items-center justify-center gap-1.5 px-3 py-1 min-h-[44px] rounded-md border border-slate-700 bg-slate-900 hover:border-cyan-500 hover:bg-slate-800 transition-all text-xs font-bold text-white min-w-[220px] font-mono group cursor-pointer shadow-sm"
                >
                  <CalendarDays className="h-4 w-4 text-cyan-400 group-hover:scale-110 transition-transform shrink-0" />
                  <span className="truncate">{timelineHeaderTitle}</span>
                </button>

                <input
                  ref={datePickerInputRef}
                  type="date"
                  value={formatDateToIso(currentAnchorDate)}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) return;
                    setCurrentAnchorDate(parseIsoDateLocal(val));
                  }}
                  className="sr-only"
                />
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigateTimeline(1)}
                className="h-11 w-11 min-h-[44px] min-w-[44px] text-slate-400 hover:text-white"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Gruppierung & Neue Störung anlegen */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Filter className="h-3 w-3" /> Gruppierung:
            </span>
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as any)}
              className="h-11 min-h-[44px] rounded border border-slate-700 bg-slate-900 px-2.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              <option value="technician">Nach Servicetechniker</option>
              <option value="qualification">Nach Fachqualifikation</option>
            </select>
          </div>

          <Link href="/orders/new">
            <Button
              size="sm"
              className="h-11 min-h-[44px] px-4 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm"
            >
              <Sparkles className="h-3.5 w-3.5 text-cyan-200" />
              + Neue Störung melden
            </Button>
          </Link>
        </div>
      </div>

      {/* HAUPTTEIL: GANTT PLANUNGSBOARD */}
      <Card className="border-slate-800 bg-slate-950 overflow-hidden shadow-2xl select-none">
        <div ref={timelineScrollRef} className="overflow-x-auto w-full">
          <div className="flex flex-col w-max min-w-full">
            {/* Kopfzeile (Links: Ressourcen, Rechts: Dynamische Zeitachse) */}
            <div className="flex border-b border-slate-800 bg-slate-900/90 text-xs font-semibold text-slate-400">
              <div className="w-72 min-w-[288px] shrink-0 p-3 border-r border-slate-800 flex items-center gap-2 uppercase tracking-wider text-[11px] sticky left-0 z-30 bg-slate-900 shadow-sm">
                <User className="h-3.5 w-3.5 text-cyan-400" />
                Ressource & Qualifikation
              </div>

              {/* Dynamisches Zeitraster */}
              <div
                style={{ width: `${totalTimelineWidth}px`, minWidth: `${totalTimelineWidth}px` }}
                className="flex shrink-0 divide-x divide-slate-800"
              >
                {timelineColumns.map((col) => (
                  <div
                    key={col.key}
                    style={{ width: `${col.width}px`, minWidth: `${col.width}px` }}
                    className={`shrink-0 py-2 text-center text-xs border-r border-slate-800/80 ${
                      (col as any).isWeekend
                        ? "bg-slate-900/90 text-slate-500"
                        : "bg-slate-900/50 text-slate-300"
                    }`}
                  >
                    <span className="font-semibold block font-mono text-[11px]">{col.label}</span>
                    {col.subLabel && (
                      <span className="text-[10px] text-slate-500 font-mono block">
                        {col.subLabel}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Ressourcen-Zeilen & Task-Balken */}
            <div className="divide-y divide-slate-800/80">
              {groupedResources.map((group) => (
                <React.Fragment key={group.groupId}>
                  {groupBy === "qualification" && (
                    <div className="bg-slate-900/80 px-4 py-1.5 text-xs font-semibold text-cyan-300 border-b border-slate-800 flex items-center gap-2 sticky left-0 z-20">
                      <Wrench className="h-3.5 w-3.5" />
                      Fachbereich: {group.groupTitle} ({group.members.length} Monteure)
                    </div>
                  )}

                  {group.members.map((res) => {
                    const techTasks = visibleTasksMap.get(res.id) || [];
                    const totalMinutes = techTasks.reduce(
                      (acc, curr) => acc + curr.durationMinutes,
                      0
                    );
                    const isOverbooked =
                      viewScope === "day" ? totalMinutes > 8 * 60 : techTasks.length > 5;
                    const isRowHovered = hoveredTechId === res.id;

                    return (
                      <div
                        key={res.id}
                        data-tech-id={res.id}
                        className={`flex min-h-[95px] hover:bg-slate-900/30 transition-colors ${
                          isRowHovered ? "bg-cyan-950/20 ring-1 ring-blue-500/40" : ""
                        }`}
                      >
                        {/* Linke Spalte: Ressource (Sticky, akzeptiert ebenfalls Drops aus dem Eingangspool) */}
                        <div
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            if (hoveredTechId !== res.id) setHoveredTechId(res.id);
                          }}
                          onDragLeave={() => {
                            if (hoveredTechId === res.id) setHoveredTechId(null);
                          }}
                          onDrop={(e) => handleDropFromInboxOnGanttRow(res.id, e, false)}
                          className="w-72 min-w-[288px] shrink-0 p-3 border-r border-slate-800 bg-slate-900/90 backdrop-blur sticky left-0 z-20 flex flex-col justify-between shadow-sm"
                        >
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
                            <span className="text-[10px] text-cyan-400 font-mono block mt-0.5 truncate">
                              {res.qualification}
                            </span>
                          </div>

                          <div className="text-[10px] text-slate-500 font-mono">
                            {viewScope === "day"
                              ? `Geplant: ${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m / 8h`
                              : `${techTasks.length} Aufträge im Zeitraum`}
                          </div>
                        </div>

                        {/* Rechte Spalte: Zeitraster mit Drop-Zone */}
                        <div
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            if (hoveredTechId !== res.id) setHoveredTechId(res.id);
                          }}
                          onDragLeave={(e) => {
                            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                            if (hoveredTechId === res.id) setHoveredTechId(null);
                          }}
                          onDrop={(e) => handleDropFromInboxOnGanttRow(res.id, e, true)}
                          style={{
                            width: `${totalTimelineWidth}px`,
                            minWidth: `${totalTimelineWidth}px`,
                          }}
                          className={`relative flex h-[95px] shrink-0 divide-x divide-slate-900 bg-slate-950 transition-colors ${
                            isRowHovered ? "bg-cyan-950/20" : ""
                          }`}
                        >
                          {/* Drop-Highlight Bereich beim Ziehen von Aufträgen */}
                          {isRowHovered && (
                            <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center bg-cyan-600/15 border-2 border-dashed border-blue-400 rounded-md backdrop-blur-[1px] shadow-[inset_0_0_20px_rgba(59,130,246,0.25)]">
                              <div className="flex items-center gap-2 bg-slate-950/95 text-cyan-200 border border-cyan-500/70 shadow-2xl px-4 py-2 rounded-lg text-xs font-semibold animate-pulse">
                                <CalendarPlus className="h-4 w-4 text-cyan-400 shrink-0" />
                                <span>Auftrag hier auf Zeitachse ablegen · Zuweisung an {res.name}</span>
                              </div>
                            </div>
                          )}

                          {/* Spalten-Hintergrund */}
                          {timelineColumns.map((col, i) => (
                            <div
                              key={i}
                              style={{ width: `${col.width}px`, minWidth: `${col.width}px` }}
                              className={`shrink-0 h-full pointer-events-none border-r border-slate-900/60 ${
                                (col as any).isWeekend ? "bg-slate-950/80" : ""
                              }`}
                            />
                          ))}

                          {/* Auftrags-Balken (ALLE Aufträge sind frei verschiebbar & skalierbar) */}
                          {techTasks.map((task) => {
                            let leftPx = 0;
                            let widthPx = 0;

                            if (viewScope === "day") {
                              leftPx = (task.startMinutes / 60) * SLOT_WIDTH_DAY;
                              widthPx = Math.max(
                                25,
                                (task.durationMinutes / 60) * SLOT_WIDTH_DAY
                              );
                            } else {
                              const firstColIso = timelineColumns[0]?.dateIso || "";
                              const firstColTime = parseIsoDateLocal(firstColIso).getTime();
                              const taskStartTime = parseIsoDateLocal(task.executionDate).getTime();
                              const oneDayMs = 24 * 60 * 60 * 1000;
                              const dayOffset = Math.round(
                                (taskStartTime - firstColTime) / oneDayMs
                              );
                              const visibleStartDay = Math.max(0, dayOffset);
                              const taskDurationDays = task.durationDays || 1;
                              const totalDays = timelineColumns.length;
                              const visibleDaysSpan = Math.max(
                                1,
                                Math.min(
                                  totalDays - visibleStartDay,
                                  taskDurationDays - (visibleStartDay - dayOffset)
                                )
                              );
                              const pixelsPerDay =
                                viewScope === "week" ? SLOT_WIDTH_WEEK : SLOT_WIDTH_MONTH;
                              leftPx = visibleStartDay * pixelsPerDay;
                              widthPx = Math.max(30, visibleDaysSpan * pixelsPerDay);
                            }

                            const isEmergency = task.priority === "1_EMERGENCY";
                            const isDraggingThis = activeDragTaskId === task.id;
                            const techDisplayName = task.technicianName || res.name || "Nicht zugewiesen";

                            const startTimeDisplay =
                              viewScope === "day"
                                ? `${formatMinutesToTime(task.startMinutes)} Uhr`
                                : task.scheduledStartDate
                                ? new Date(task.scheduledStartDate).toLocaleDateString("de-DE", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : `${task.executionDate} ${formatMinutesToTime(task.startMinutes)} Uhr`;

                            const endTimeDisplay =
                              viewScope === "day"
                                ? `${formatMinutesToTime(task.startMinutes + task.durationMinutes)} Uhr`
                                : task.scheduledEndDate
                                ? new Date(task.scheduledEndDate).toLocaleDateString("de-DE", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : `${task.executionDate} ${formatMinutesToTime(task.startMinutes + task.durationMinutes)} Uhr`;

                            return (
                              <div
                                key={task.id}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/orders/${task.id}`);
                                }}
                                onMouseDown={(e) => {
                                  setHoveredTooltipTask(null);
                                  handleTaskMouseDown(e, task);
                                }}
                                onMouseEnter={(e) => {
                                  if (dragSessionRef.current || resizeSessionRef.current) return;
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  setHoveredTooltipTask({
                                    task,
                                    techName: techDisplayName,
                                    x: rect.left + rect.width / 2,
                                    y: rect.top,
                                  });
                                }}
                                onMouseLeave={() => {
                                  setHoveredTooltipTask(null);
                                }}
                                title={`Auftrag: ${task.orderNumber}\nTechniker: ${techDisplayName}\nStart: ${startTimeDisplay}\nEnde: ${endTimeDisplay}\nDauer: ${task.durationMinutes} Min`}
                                style={{
                                  left: `${leftPx}px`,
                                  width: `${Math.max(20, widthPx - 4)}px`,
                                  top: "8px",
                                  bottom: "8px",
                                }}
                                className={`absolute rounded-lg border p-2 shadow-lg transition-shadow flex flex-col justify-between overflow-hidden select-none z-10 cursor-grab active:cursor-grabbing hover:ring-2 hover:ring-blue-400 ${
                                  isDraggingThis
                                    ? "ring-2 ring-blue-400 opacity-95 shadow-2xl z-30 scale-[1.01]"
                                    : ""
                                } ${
                                  isEmergency
                                    ? "bg-rose-950/90 border-red-600 text-white"
                                    : task.hasStockConflict
                                    ? "bg-amber-950/90 border-amber-500 text-amber-100"
                                    : "bg-cyan-950/90 border-cyan-600 text-blue-100"
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1 pointer-events-none">
                                  <span className="font-mono font-bold text-[10px] truncate">
                                    {task.orderNumber}
                                  </span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {task.hasStockConflict && (
                                      <span
                                        title={`Materialengpass: ${task.missingPartName}`}
                                        className="text-amber-400 shrink-0"
                                      >
                                        <PackageX className="h-3 w-3" />
                                      </span>
                                    )}
                                    <ExternalLink className="h-3 w-3 text-slate-400 hover:text-white" />
                                  </div>
                                </div>

                                <span className="text-[11px] font-semibold truncate leading-tight pointer-events-none">
                                  {task.title}
                                </span>

                                <div className="flex items-center justify-between text-[9px] text-slate-300 font-mono pointer-events-none">
                                  <span className="truncate max-w-[110px]">
                                    {task.equipmentName}
                                  </span>
                                  <span className="shrink-0 font-bold bg-black/40 px-1 py-0.5 rounded">
                                    {viewScope === "day"
                                      ? `${formatMinutesToTime(task.startMinutes)} (${task.durationMinutes}m)`
                                      : task.executionDate.slice(5)}
                                  </span>
                                </div>

                                {/* Resize Handle für alle Aufträge */}
                                <div
                                  onMouseDown={(e) => handleResizeMouseDown(e, task)}
                                  title="Ziehen zum Verlängern/Verkürzen der Dauer"
                                  className="resize-handle absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-white/40 active:bg-blue-400 transition-colors z-20 flex items-center justify-center"
                                >
                                  <div className="h-4 w-0.5 bg-slate-400/60 rounded" />
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
        </div>
      </Card>

      {/* DISPO-POOL: AUFTRAGSEINGANG (Ungeplante Aufträge) */}
      <Card
        data-inbox-dropzone="true"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={handleDropOnInbox}
        className="border-slate-800 bg-slate-900 shadow-xl border-dashed"
      >
        <CardHeader className="py-3 px-4 border-b border-slate-800 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-amber-400" />
            <div>
              <CardTitle className="text-sm text-white flex items-center gap-2">
                Auftragseingang & Ungeplante Maßnahmen
                <Badge
                  variant="outline"
                  className="text-xs font-mono text-amber-400 border-amber-700/60"
                >
                  {unplannedTasks.length} offen
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Klicke auf eine Karte für die Detailsicht oder ziehe sie per Drag-&-Drop nach oben
                auf einen Techniker und Zeitslot.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-4">
          {unplannedTasks.length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-500 border border-slate-800/80 rounded-lg bg-slate-950/50">
              Alle vorliegenden Instandhaltungsmaßnahmen sind aktuell disponiert!
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {unplannedTasks.map((task) => {
                const isEmergency = task.priority === "1_EMERGENCY";
                return (
                  <div
                    key={task.id}
                    draggable={true}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", task.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggingInboxTaskId(task.id);
                    }}
                    onDragEnd={() => {
                      setDraggingInboxTaskId(null);
                      setHoveredTechId(null);
                    }}
                    onClick={() => setSelectedTaskForDetails(task)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      router.push(`/orders/${task.id}`);
                    }}
                    className={`p-3 rounded-lg border shadow cursor-grab active:cursor-grabbing hover:border-blue-400 transition-all ${
                      isEmergency
                        ? "bg-rose-950/40 border-red-800/80 text-red-200"
                        : task.hasStockConflict
                        ? "bg-amber-950/40 border-amber-800/80 text-amber-200"
                        : "bg-slate-950 border-slate-800 text-slate-200"
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

                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800/60 pointer-events-none">
                      <span className="truncate max-w-[130px]">{task.equipmentName}</span>
                      <span className="text-cyan-400 font-medium font-mono">
                        {task.executionDate}
                      </span>
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
          <div className="w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950">
              <div className="flex items-center gap-2.5">
                <Wrench className="h-5 w-5 text-cyan-400" />
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Link
                      href={`/orders/${selectedTaskForDetails.id}`}
                      className="hover:text-cyan-400 hover:underline flex items-center gap-1.5 transition-colors"
                      title="Auftragsdetails & Historie öffnen"
                    >
                      <span>{selectedTaskForDetails.orderNumber}</span>
                      <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                    </Link>
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
                  <span className="text-xs text-slate-400">{selectedTaskForDetails.title}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedTaskForDetails(null)}
                className="h-8 w-8 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-5 text-xs text-slate-300 overflow-y-auto max-h-[70vh]">
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
              <div className="grid grid-cols-2 gap-4 bg-slate-950 p-4 rounded-lg border border-slate-800">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">
                    Equipment / Anlage
                  </span>
                  <span className="font-semibold text-white block mt-0.5">
                    {selectedTaskForDetails.equipmentName}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {selectedTaskForDetails.equipmentNumber}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">
                    Technischer Platz (FLoc)
                  </span>
                  <span className="font-semibold text-white block mt-0.5">
                    {selectedTaskForDetails.functionalLocationCode}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">
                    Zuständiger Monteur
                  </span>
                  <select
                    value={
                      selectedTaskForDetails.technicianId ??
                      selectedTaskForDetails.assignedUserId ??
                      "UNASSIGNED"
                    }
                    onChange={(e) => {
                      const newTechId = e.target.value === "UNASSIGNED" ? null : e.target.value;
                      const tech = resources.find((r) => r.id === newTechId);
                      const updated: GanttOrderTask = {
                        ...selectedTaskForDetails,
                        technicianId: newTechId,
                        assignedUserId: newTechId,
                        technicianName: tech ? tech.name : null,
                      };
                      setSelectedTaskForDetails(updated);
                      handleTaskDropOrMove(updated);
                    }}
                    className="w-full mt-1 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
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
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">
                    Priorität
                  </span>
                  <span className="font-semibold text-white block mt-1 font-mono">
                    {selectedTaskForDetails.priority}
                  </span>
                </div>
              </div>

              {/* DATUM- & ZEITPLANUNG: AUSFÜHRUNGSDATUM, START, ENDE, DAUER */}
              <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-3">
                <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-cyan-400" />
                  Terminierung & Ausführungszeitpunkt
                </span>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {/* Ausführungsdatum Date-Picker */}
                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">
                      Ausführungsdatum:
                    </label>
                    <input
                      type="date"
                      value={selectedTaskForDetails.executionDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        const { scheduledStartDate, scheduledEndDate } = computeScheduledDates(
                          val,
                          selectedTaskForDetails.startMinutes,
                          selectedTaskForDetails.durationMinutes
                        );
                        const updated: GanttOrderTask = {
                          ...selectedTaskForDetails,
                          executionDate: val,
                          scheduledStartDate,
                          scheduledEndDate,
                        };
                        setSelectedTaskForDetails(updated);
                        handleTaskDropOrMove(updated);
                      }}
                      className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>

                  {/* Startzeit Time-Picker */}
                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">
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
                        const { scheduledStartDate, scheduledEndDate } = computeScheduledDates(
                          selectedTaskForDetails.executionDate,
                          totalMins,
                          selectedTaskForDetails.durationMinutes
                        );
                        const updated: GanttOrderTask = {
                          ...selectedTaskForDetails,
                          startMinutes: totalMins,
                          scheduledStartDate,
                          scheduledEndDate,
                        };
                        setSelectedTaskForDetails(updated);
                        handleTaskDropOrMove(updated);
                      }}
                      className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>

                  {/* Endzeit Time-Picker */}
                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">
                      Endzeit (hh:mm):
                    </label>
                    <input
                      type="time"
                      value={formatMinutesToTime(
                        selectedTaskForDetails.startMinutes +
                          selectedTaskForDetails.durationMinutes
                      )}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        const [hoursStr, minsStr] = val.split(":");
                        const endMins = parseInt(hoursStr) * 60 + parseInt(minsStr);
                        const newDuration = Math.max(
                          15,
                          endMins - selectedTaskForDetails.startMinutes
                        );
                        const { scheduledStartDate, scheduledEndDate } = computeScheduledDates(
                          selectedTaskForDetails.executionDate,
                          selectedTaskForDetails.startMinutes,
                          newDuration
                        );
                        const updated: GanttOrderTask = {
                          ...selectedTaskForDetails,
                          durationMinutes: newDuration,
                          scheduledStartDate,
                          scheduledEndDate,
                        };
                        setSelectedTaskForDetails(updated);
                        handleTaskDropOrMove(updated);
                      }}
                      className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>

                  {/* Dauer in Minuten & Tage */}
                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">
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
                            const { scheduledStartDate, scheduledEndDate } = computeScheduledDates(
                              selectedTaskForDetails.executionDate,
                              selectedTaskForDetails.startMinutes,
                              mins
                            );
                            const updated: GanttOrderTask = {
                              ...selectedTaskForDetails,
                              durationMinutes: mins,
                              scheduledStartDate,
                              scheduledEndDate,
                            };
                            setSelectedTaskForDetails(updated);
                            handleTaskDropOrMove(updated);
                          }}
                          className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
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
                            const updated: GanttOrderTask = {
                              ...selectedTaskForDetails,
                              durationDays: days,
                            };
                            setSelectedTaskForDetails(updated);
                            handleTaskDropOrMove(updated);
                          }}
                          className="w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        />
                      )}
                      <span className="text-[11px] text-slate-400 font-mono">
                        {viewScope === "day" ? "min" : "Tage"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Presets */}
                <div className="pt-2 flex flex-wrap items-center gap-1.5 border-t border-slate-800/80">
                  <span className="text-[10px] text-slate-500 uppercase font-semibold mr-1">
                    Schnellwahl:
                  </span>
                  {viewScope === "day"
                    ? [15, 30, 45, 60, 90, 120, 180, 240].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => {
                            const { scheduledStartDate, scheduledEndDate } = computeScheduledDates(
                              selectedTaskForDetails.executionDate,
                              selectedTaskForDetails.startMinutes,
                              mins
                            );
                            const updated: GanttOrderTask = {
                              ...selectedTaskForDetails,
                              durationMinutes: mins,
                              scheduledStartDate,
                              scheduledEndDate,
                            };
                            setSelectedTaskForDetails(updated);
                            handleTaskDropOrMove(updated);
                          }}
                          className={`px-2 py-0.5 rounded border text-[10px] font-mono transition-colors ${
                            selectedTaskForDetails.durationMinutes === mins
                              ? "bg-cyan-600 border-cyan-500 text-white font-bold"
                              : "border-slate-800 bg-slate-900 text-slate-400 hover:text-white"
                          }`}
                        >
                          {mins}m
                        </button>
                      ))
                    : [1, 2, 3, 5, 7, 10, 14, 21, 30].map((days) => (
                        <button
                          key={days}
                          type="button"
                          onClick={() => {
                            const updated: GanttOrderTask = {
                              ...selectedTaskForDetails,
                              durationDays: days,
                            };
                            setSelectedTaskForDetails(updated);
                            handleTaskDropOrMove(updated);
                          }}
                          className={`px-2 py-0.5 rounded border text-[10px] font-mono transition-colors ${
                            (selectedTaskForDetails.durationDays || 1) === days
                              ? "bg-cyan-600 border-cyan-500 text-white font-bold"
                              : "border-slate-800 bg-slate-900 text-slate-400 hover:text-white"
                          }`}
                        >
                          {days} Tage
                        </button>
                      ))}
                </div>
              </div>

              {/* Beschreibung */}
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">
                  Arbeitsanweisung & Symptombeschreibung:
                </label>
                <div className="bg-slate-950 p-3 rounded border border-slate-800 text-slate-200 leading-relaxed font-sans">
                  {selectedTaskForDetails.description}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between p-4 border-t border-slate-800 bg-slate-950">
              <span className="text-[11px] text-slate-500 font-mono">
                Datum: {selectedTaskForDetails.executionDate} • Start:{" "}
                {formatMinutesToTime(selectedTaskForDetails.startMinutes)} Uhr
              </span>
              <div className="flex items-center gap-2">
                <Link
                  href={`/orders/${selectedTaskForDetails.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>Auftrag öffnen</span>
                </Link>
                <Button
                  onClick={() => setSelectedTaskForDetails(null)}
                  className="bg-cyan-600 hover:bg-blue-700 text-white text-xs px-4"
                >
                  Schließen
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Floating Readability Tooltip für Auftragsbalken */}
      {hoveredTooltipTask && !activeDragTaskId && !activeResizeTaskId && (
        <div
          style={{
            left: `${Math.max(
              160,
              Math.min(
                typeof window !== "undefined" ? window.innerWidth - 160 : 600,
                hoveredTooltipTask.x
              )
            )}px`,
            top: `${Math.max(10, hoveredTooltipTask.y - 10)}px`,
            transform: "translate(-50%, -100%)",
          }}
          className="fixed z-50 pointer-events-none w-72 rounded-xl border border-slate-700 bg-slate-900/95 p-3 text-xs text-slate-200 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 space-y-2"
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-bold text-white text-xs bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                {hoveredTooltipTask.task.orderNumber}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {hoveredTooltipTask.task.orderType || "IH01"}
              </span>
            </div>
            <Badge
              variant={
                hoveredTooltipTask.task.priority === "1_EMERGENCY" ? "destructive" : "secondary"
              }
              className="text-[10px] py-0 px-1.5"
            >
              {hoveredTooltipTask.task.priority === "1_EMERGENCY" ? "Notfall" : "Priorität"}
            </Badge>
          </div>

          <div className="font-semibold text-white line-clamp-2 leading-snug">
            {hoveredTooltipTask.task.title}
          </div>

          <div className="space-y-1.5 text-[11px] text-slate-300">
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
              <span className="text-slate-400">Techniker:</span>
              <span className="font-medium text-white truncate">{hoveredTooltipTask.techName}</span>
            </div>

            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span className="text-slate-400">Startzeit:</span>
              <span className="font-mono text-emerald-300 font-medium">
                {viewScope === "day"
                  ? `${formatMinutesToTime(hoveredTooltipTask.task.startMinutes)} Uhr`
                  : hoveredTooltipTask.task.scheduledStartDate
                  ? new Date(hoveredTooltipTask.task.scheduledStartDate).toLocaleDateString("de-DE", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : `${hoveredTooltipTask.task.executionDate} ${formatMinutesToTime(
                      hoveredTooltipTask.task.startMinutes
                    )} Uhr`}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span className="text-slate-400">Endzeit:</span>
              <span className="font-mono text-amber-300 font-medium">
                {viewScope === "day"
                  ? `${formatMinutesToTime(
                      hoveredTooltipTask.task.startMinutes + hoveredTooltipTask.task.durationMinutes
                    )} Uhr`
                  : hoveredTooltipTask.task.scheduledEndDate
                  ? new Date(hoveredTooltipTask.task.scheduledEndDate).toLocaleDateString("de-DE", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : `${hoveredTooltipTask.task.executionDate} ${formatMinutesToTime(
                      hoveredTooltipTask.task.startMinutes + hoveredTooltipTask.task.durationMinutes
                    )} Uhr`}
              </span>
              <span className="text-[10px] text-slate-400">
                ({hoveredTooltipTask.task.durationMinutes} Min)
              </span>
            </div>

            {hoveredTooltipTask.task.equipmentName && (
              <div className="flex items-center gap-2 pt-1 border-t border-slate-800 text-[10px] text-slate-400 truncate">
                <Wrench className="h-3 w-3 text-slate-400 shrink-0" />
                <span className="truncate">{hoveredTooltipTask.task.equipmentName}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
