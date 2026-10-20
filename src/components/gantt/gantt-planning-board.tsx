"use client";

import * as React from "react";
import { useState, useRef } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Calendar as CalendarIcon,
  Clock,
  User,
  Wrench,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Filter,
  Layers,
  ShieldCheck,
  PackageX,
  Sparkles,
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
  startHour: number; // 0 bis 23 (Tagesansicht)
  durationHours: number;
  hasStockConflict?: boolean; // Fehlendes Ersatzteil
  missingPartName?: string;
  colorHex?: string;
}

export interface ResourceGroup {
  id: string;
  name: string;
  qualification: string;
  avatarUrl?: string;
}

interface InteractiveGanttProps {
  resources: ResourceGroup[];
  initialTasks: GanttOrderTask[];
  onTaskUpdate?: (task: GanttOrderTask) => void;
}

export function InteractiveGanttPlanningBoard({
  resources,
  initialTasks,
  onTaskUpdate,
}: InteractiveGanttProps) {
  const [tasks, setTasks] = useState<GanttOrderTask[]>(initialTasks);
  const [groupBy, setGroupBy] = useState<"technician" | "qualification">("technician");
  const [viewScope, setViewScope] = useState<"day" | "week">("day");
  const [activeDate, setActiveDate] = useState<string>("Heute, 20. Oktober 2026");

  // Drag & Drop / Resize States
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [resizingTaskId, setResizingTaskId] = useState<string | null>(null);
  const [dragStartX, setDragStartX] = useState<number>(0);

  // Zeitstunden für die Tagesansicht (06:00 bis 20:00 Uhr)
  const timeSlots = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
  const totalSlots = timeSlots.length;

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData("text/plain", taskId);
    setDraggingTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropOnSlot = (e: React.DragEvent, techId: string, slotHour: number) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData("text/plain") || draggingTaskId;
    if (!taskId) return;

    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === taskId) {
          const updated = {
            ...t,
            technicianId: techId,
            technicianName: resources.find((r) => r.id === techId)?.name || t.technicianName,
            startHour: Math.max(6, Math.min(20 - t.durationHours, slotHour)),
          };
          if (onTaskUpdate) onTaskUpdate(updated);
          return updated;
        }
        return t;
      })
    );
    setDraggingTaskId(null);
  };

  // Verlängerung / Resize Handle
  const handleResizeStart = (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    setResizingTaskId(taskId);
    setDragStartX(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!resizingTaskId) return;
    const diff = e.clientX - dragStartX;
    if (Math.abs(diff) > 40) {
      // 40px entspricht ca. 1 Stunde
      const hoursDelta = diff > 0 ? 1 : -1;
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id === resizingTaskId) {
            const newDuration = Math.max(1, Math.min(8, t.durationHours + hoursDelta));
            return { ...t, durationHours: newDuration };
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

  return (
    <div className="space-y-4 select-none" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      {/* Top Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 pb-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-lg p-0.5">
            <Button
              variant={viewScope === "day" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewScope("day")}
              className="h-7 text-xs px-2.5"
            >
              Tagesansicht
            </Button>
            <Button
              variant={viewScope === "week" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewScope("week")}
              className="h-7 text-xs px-2.5"
            >
              Wochenansicht
            </Button>
          </div>

          <div className="flex items-center gap-1.5 border-l border-neutral-800 pl-3">
            <Button variant="ghost" size="icon" className="h-7 w-7 text-neutral-400">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-semibold text-neutral-200">{activeDate}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-neutral-400">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Gruppierung & Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400 flex items-center gap-1">
            <Filter className="h-3 w-3" /> Gruppierung:
          </span>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as any)}
            className="h-8 rounded border border-neutral-700 bg-neutral-900 px-2 text-xs text-neutral-200"
          >
            <option value="technician">Nach Servicetechniker</option>
            <option value="qualification">Nach Fachqualifikation</option>
          </select>
        </div>
      </div>

      {/* Gantt Planungsboard Container */}
      <Card className="border-neutral-800 bg-neutral-950 overflow-hidden shadow-2xl">
        <div className="grid grid-cols-12 border-b border-neutral-800 bg-neutral-900/90 text-xs font-semibold text-neutral-400">
          {/* Ressourcen Header (Links) */}
          <div className="col-span-3 p-3 border-r border-neutral-800 flex items-center gap-2 uppercase tracking-wider text-[11px]">
            <User className="h-3.5 w-3.5 text-blue-400" />
            Ressourcen & Qualifikation
          </div>

          {/* Zeitraster Header (Rechts) */}
          <div className="col-span-9 grid grid-cols-15 text-center divide-x divide-neutral-800">
            {timeSlots.map((h) => (
              <div key={h} className="py-2.5 text-[11px] font-mono text-neutral-400">
                {h.toString().padStart(2, "0")}:00
              </div>
            ))}
          </div>
        </div>

        {/* Ressourcen-Zeilen */}
        <div className="divide-y divide-neutral-800/80">
          {resources.map((res) => {
            const techTasks = tasks.filter((t) => t.technicianId === res.id);

            // Prüfe Überbuchung (Summe geplanter Stunden > 8h)
            const totalHours = techTasks.reduce((acc, curr) => acc + curr.durationHours, 0);
            const isOverbooked = totalHours > 8;

            return (
              <div
                key={res.id}
                className="grid grid-cols-12 min-h-[85px] hover:bg-neutral-900/30 transition-colors"
              >
                {/* Linke Spalte: Ressourcendetails */}
                <div className="col-span-3 p-3 border-r border-neutral-800 bg-neutral-900/40 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-white">{res.name}</span>
                      {isOverbooked && (
                        <Badge
                          variant="destructive"
                          className="text-[9px] py-0 px-1 flex items-center gap-0.5"
                        >
                          <AlertTriangle className="h-2.5 w-2.5" /> Überbucht ({totalHours}h)
                        </Badge>
                      )}
                    </div>
                    <span className="text-[10px] text-blue-400 font-mono block mt-0.5">
                      {res.qualification}
                    </span>
                  </div>

                  <div className="text-[10px] text-neutral-500 font-mono">
                    Auslastung: {Math.round((totalHours / 8) * 100)}% (max 8h/Schicht)
                  </div>
                </div>

                {/* Rechte Spalte: Interaktives Zeitraster & Task-Balken */}
                <div className="col-span-9 relative grid grid-cols-15 divide-x divide-neutral-900 bg-neutral-950">
                  {/* Drop-Zonen pro Slot */}
                  {timeSlots.map((hour) => (
                    <div
                      key={hour}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDropOnSlot(e, res.id, hour)}
                      className="h-full hover:bg-blue-950/20 transition-colors"
                    />
                  ))}

                  {/* Gerenderte Auftrags-Balken */}
                  {techTasks.map((task) => {
                    // Berechnung der relativen Position (06:00 = 0%)
                    const leftPercent = ((task.startHour - 6) / totalSlots) * 100;
                    const widthPercent = (task.durationHours / totalSlots) * 100;

                    const isEmergency = task.priority === "1_EMERGENCY";

                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, task.id)}
                        style={{
                          left: `${leftPercent}%`,
                          width: `${widthPercent}%`,
                          top: "10px",
                          bottom: "10px",
                        }}
                        className={`absolute rounded-lg border p-2 shadow-lg cursor-grab active:cursor-grabbing transition-shadow flex flex-col justify-between overflow-hidden ${
                          isEmergency
                            ? "bg-red-950/80 border-red-600 text-white"
                            : task.hasStockConflict
                            ? "bg-amber-950/80 border-amber-600 text-amber-100"
                            : "bg-blue-950/80 border-blue-600 text-blue-100"
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
                          <span>{task.equipmentName}</span>
                          <span>{task.durationHours}h</span>
                        </div>

                        {/* Resize Handle (Rechte Kante) */}
                        <div
                          onMouseDown={(e) => handleResizeStart(e, task.id)}
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
