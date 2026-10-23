"use client";

import React, { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import {
  Wrench,
  Play,
  Pause,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Flame,
  User,
  ArrowRight,
  ExternalLink,
  PlusCircle,
  FileText,
  ShieldAlert,
  Package,
  Layers,
  Sparkles,
  Inbox,
  Check,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { completeOrderAction } from "@/actions/order-actions";

export interface TechnicianOrder {
  id: string;
  orderNumber: string;
  title: string;
  description: string;
  priority: "1_EMERGENCY" | "2_HIGH" | "3_MEDIUM" | "4_LOW";
  statusName: string;
  statusCode: string;
  currentStatusId: string;
  equipmentName?: string | null;
  equipmentNumber?: string | null;
  plannedDurationMinutes: number;
  actualDurationMinutes?: number | null;
  assignedToUserId?: string | null;
  assignedToName?: string | null;
  downtimeMinutes?: number;
  scheduledStartAt?: string | null;
}

interface TechnicianDashboardViewProps {
  orders: TechnicianOrder[];
  currentUserId: string;
  currentUserName: string;
}

export function TechnicianDashboardView({
  orders: initialOrders,
  currentUserId,
  currentUserName,
}: TechnicianDashboardViewProps) {
  const [orders, setOrders] = useState<TechnicianOrder[]>(initialOrders);
  const [isPending, startTransition] = useTransition();

  // Aktiver Timer State (orderId -> { startTime: number, elapsedMinutes: number, isRunning: boolean })
  const [timerState, setTimerState] = useState<{
    orderId: string | null;
    elapsedSeconds: number;
    isRunning: boolean;
  }>({
    orderId: null,
    elapsedSeconds: 0,
    isRunning: false,
  });

  // Intervall für Timer-Lauf mit garantiert sauberem Unmount-Cleanup
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    if (timerState.isRunning && timerState.orderId) {
      intervalId = setInterval(() => {
        setTimerState((prev) => ({
          ...prev,
          elapsedSeconds: prev.elapsedSeconds + 1,
        }));
      }, 1000);
    }
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [timerState.isRunning, timerState.orderId]);

  // Dialog State für Abschluss & Zeiterfassung
  const [completionOrder, setCompletionOrder] = useState<TechnicianOrder | null>(null);
  const [completionDuration, setCompletionDuration] = useState<number>(45);
  const [completionDowntime, setCompletionDowntime] = useState<number>(0);
  const [completionCauseCode, setCompletionCauseCode] = useState<string>("MECH_VERSCHLEISS");
  const [completionCauseDesc, setCompletionCauseDesc] = useState<string>("");
  const [completionResolution, setCompletionResolution] = useState<string>("");

  // Dialog State für Eskalation
  const [escalationOrder, setEscalationOrder] = useState<TechnicianOrder | null>(null);
  const [escalationLevel, setEscalationLevel] = useState<"LEVEL_2" | "LEVEL_3">("LEVEL_2");
  const [escalationReason, setEscalationReason] = useState<string>("");

  // Aufteilung: Meine Aufträge vs. Team-Pool
  const myOrders = orders.filter((o) => o.assignedToUserId === currentUserId);
  const teamPoolOrders = orders.filter((o) => !o.assignedToUserId || o.assignedToUserId !== currentUserId);

  // Timer starten / fortsetzen
  const handleStartWork = (order: TechnicianOrder) => {
    startTransition(async () => {
      // Falls Auftrag noch im Team-Pool war, mir zuweisen
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id
            ? { ...o, statusCode: "IN_WORK", statusName: "In Arbeit", assignedToUserId: currentUserId, assignedToName: currentUserName }
            : o
        )
      );

      // Startzeitpunkt & Timer
      setTimerState({
        orderId: order.id,
        elapsedSeconds: 0,
        isRunning: true,
      });

      toast.success(`Einsatz für ${order.orderNumber} gestartet (Timer aktiv)`);
    });
  };

  // Timer pausieren
  const handlePauseWork = (order: TechnicianOrder) => {
    setTimerState((prev) => ({
      ...prev,
      isRunning: false,
    }));
    const minutes = Math.ceil(timerState.elapsedSeconds / 60);
    toast.info(`Einsatz pausiert. Bisherige Arbeitszeit: ${minutes} Min.`);
  };

  // Abschluss-Dialog öffnen
  const handleOpenCompleteDialog = (order: TechnicianOrder) => {
    const elapsedMinutes =
      timerState.orderId === order.id && timerState.elapsedSeconds > 0
        ? Math.max(15, Math.ceil(timerState.elapsedSeconds / 60))
        : order.plannedDurationMinutes || 45;

    setCompletionOrder(order);
    setCompletionDuration(elapsedMinutes);
    setCompletionDowntime(order.downtimeMinutes || 0);
    setCompletionCauseCode("MECH_VERSCHLEISS");
    setCompletionCauseDesc("");
    setCompletionResolution("Verschleißteil demontiert, gereinigt, Neuteil eingebaut und Probelauf durchgeführt.");
  };

  // Auftrag verbindlich abschließen
  const handleSubmitCompletion = () => {
    if (!completionOrder) return;

    startTransition(async () => {
      const res = await completeOrderAction({
        orderId: completionOrder.id,
        userId: currentUserId,
        actualDurationMinutes: completionDuration,
        downtimeMinutes: completionDowntime,
        causeCode: completionCauseCode,
        rootCauseDescription: completionCauseDesc,
        resolutionSummary: completionResolution,
        comment: `Technischer Abschluss durch ${currentUserName}: ${completionDuration} Min. rückgemeldet.`,
      });

      if (res.success) {
        toast.success(`Auftrag ${completionOrder.orderNumber} erfolgreich abgeschlossen (TABG)`);
        setOrders((prev) =>
          prev.map((o) =>
            o.id === completionOrder.id
              ? {
                  ...o,
                  statusCode: "TECH_COMPLETED",
                  statusName: "Technisch abgeschlossen",
                  actualDurationMinutes: completionDuration,
                }
              : o
          )
        );
        if (timerState.orderId === completionOrder.id) {
          setTimerState({ orderId: null, elapsedSeconds: 0, isRunning: false });
        }
        setCompletionOrder(null);
      } else {
        toast.error("Abschluss fehlgeschlagen: " + (res.message || "Unbekannter Fehler"));
      }
    });
  };

  // Eskalation durchführen
  const handleSubmitEscalation = () => {
    if (!escalationOrder) return;

    startTransition(async () => {
      const levelLabel = escalationLevel === "LEVEL_2" ? "Level 2 (Instandhaltungs-Meister / Fachspezialist)" : "Level 3 (Hersteller-Hotline / Engineering)";
      toast.warning(`Auftrag ${escalationOrder.orderNumber} eskaliert an ${levelLabel}`);
      setOrders((prev) =>
        prev.map((o) =>
          o.id === escalationOrder.id
            ? { ...o, statusName: `Eskaliert (${escalationLevel})` }
            : o
        )
      );
      setEscalationOrder(null);
    });
  };

  const formatTimerDisplay = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
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
            Mittel / Normal
          </Badge>
        );
    }
  };

  const getStatusBadge = (statusCode?: string, statusName?: string) => {
    const code = statusCode?.toUpperCase() || "";
    const name = statusName || statusCode || "Offen";
    if (code === "IN_PROGRESS" || code === "IN_WORK" || code === "IN ARBEIT" || code === "WORKING") {
      return (
        <Badge className="bg-amber-950/60 border-amber-700 text-amber-300 gap-1 text-[10px] font-semibold">
          <Clock className="h-3 w-3 text-amber-300" />
          {name}
        </Badge>
      );
    }
    if (code === "COMPLETED" || code === "TECH_COMPLETED" || code === "CLOSED" || code === "TABG") {
      return (
        <Badge className="bg-emerald-950/60 border-emerald-700 text-emerald-300 gap-1 text-[10px] font-semibold">
          <CheckCircle2 className="h-3 w-3 text-emerald-300" />
          {name}
        </Badge>
      );
    }
    return (
      <Badge className="bg-blue-950/60 border-blue-700 text-blue-300 text-[10px]">
        {name}
      </Badge>
    );
  };

  return (
    <div className="space-y-8">
      {/* Aktiver Live-Timer Banner falls Auftrag läuft */}
      {timerState.orderId && (
        <Card className="p-4 bg-cyan-950/40 border border-cyan-600/70 shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-cyan-600 flex items-center justify-center text-white font-mono font-bold text-sm shadow-md animate-pulse">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white text-sm">
                  Aktiver Reparatureinsatz läuft
                </span>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-cyan-900/60 border border-cyan-700 text-cyan-200">
                  {orders.find((o) => o.id === timerState.orderId)?.orderNumber}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                {orders.find((o) => o.id === timerState.orderId)?.title}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto">
            <div className="font-mono text-2xl font-bold text-cyan-400">
              {formatTimerDisplay(timerState.elapsedSeconds)}
            </div>

            {timerState.isRunning ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePauseWork(orders.find((o) => o.id === timerState.orderId)!)}
                className="h-11 min-h-[44px] px-3.5 border-slate-700 text-slate-200 hover:text-white gap-1"
              >
                <Pause className="h-3.5 w-3.5 text-amber-400" />
                <span>Pausieren</span>
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => setTimerState((prev) => ({ ...prev, isRunning: true }))}
                className="h-11 min-h-[44px] px-3.5 bg-cyan-600 hover:bg-cyan-500 text-white gap-1"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>Weiter</span>
              </Button>
            )}

            <Button
              size="sm"
              onClick={() => handleOpenCompleteDialog(orders.find((o) => o.id === timerState.orderId)!)}
              className="h-11 min-h-[44px] px-3.5 bg-emerald-600 hover:bg-emerald-500 text-white gap-1"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Abschließen</span>
            </Button>
          </div>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* SEKTION 1: MEINE ZUGEWIESENEN MASSNAHMEN                                 */}
      {/* ========================================================================= */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-cyan-400" />
            <h2 className="text-base font-bold text-white">
              Meine zugewiesenen Maßnahmen ({myOrders.length})
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            Angemeldet als: <strong className="text-white">{currentUserName}</strong>
          </span>
        </div>

        {myOrders.length === 0 ? (
          <Card className="p-8 text-center bg-slate-900 border-slate-800 text-slate-400 text-xs">
            Aktuell sind Ihnen keine Aufträge fest zugeordnet. Wählen Sie einen Auftrag aus dem Team-Pool unten.
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {myOrders.map((order) => {
              const isCurrentOrderRunning = timerState.orderId === order.id && timerState.isRunning;

              return (
                <Card
                  key={order.id}
                  className={`p-4 bg-slate-900 border transition-all ${
                    isCurrentOrderRunning
                      ? "border-cyan-600 bg-cyan-950/20 shadow-md"
                      : "border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Auftragsinfo */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/orders/${order.id}`}
                          className="font-mono text-xs font-bold text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700 hover:border-blue-500"
                        >
                          {order.orderNumber}
                        </Link>
                        {getPriorityBadge(order.priority)}
                        {getStatusBadge(order.statusCode, order.statusName)}
                        {isCurrentOrderRunning && (
                          <Badge className="bg-cyan-600 text-white text-[10px] animate-pulse">
                            ⏱️ Timer läuft
                          </Badge>
                        )}
                      </div>

                      <Link
                        href={`/orders/${order.id}`}
                        className="text-sm font-semibold text-white hover:text-cyan-400 block tracking-tight"
                      >
                        {order.title}
                      </Link>

                      <p className="text-xs text-slate-400 line-clamp-2">
                        {order.description}
                      </p>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1">
                        {order.equipmentName && (
                          <span className="text-slate-300">
                            ⚙️ {order.equipmentName} ({order.equipmentNumber})
                          </span>
                        )}
                        <span>Geplant: {order.plannedDurationMinutes} Min.</span>
                        {order.actualDurationMinutes && (
                          <span className="text-emerald-400 font-medium">
                            ✓ {order.actualDurationMinutes} Min. erfasst
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Techniker Aktions-Buttons */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0 self-end lg:self-center">
                      {!isCurrentOrderRunning ? (
                        <Button
                          size="sm"
                          onClick={() => handleStartWork(order)}
                          className="h-11 min-h-[44px] px-3.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5"
                        >
                          <Play className="h-3 w-3 fill-current" />
                          <span>Arbeit starten</span>
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handlePauseWork(order)}
                          className="h-11 min-h-[44px] px-3.5 text-xs border-amber-700 text-amber-300 hover:bg-amber-950/40 gap-1.5"
                        >
                          <Pause className="h-3 w-3" />
                          <span>Pausieren</span>
                        </Button>
                      )}

                      <Button
                        size="sm"
                        onClick={() => handleOpenCompleteDialog(order)}
                        className="h-11 min-h-[44px] px-3.5 text-xs bg-cyan-600 hover:bg-cyan-500 text-white gap-1.5"
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Arbeit abschließen</span>
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEscalationOrder(order);
                          setEscalationLevel("LEVEL_2");
                          setEscalationReason("");
                        }}
                        className="h-11 min-h-[44px] px-3 text-xs border-red-900/60 text-rose-400 hover:bg-rose-950/40 gap-1"
                        title="Einsatz eskalieren"
                      >
                        <ShieldAlert className="h-3.5 w-3.5" />
                        <span>Eskalieren</span>
                      </Button>

                      <Link
                        href={`/orders/${order.id}`}
                        className="h-11 min-h-[44px] px-3 rounded-md border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white inline-flex items-center text-xs"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SEKTION 2: TEAM-POOL / NICHT ZUGEWIESENE AUFTRÄGE                         */}
      {/* ========================================================================= */}
      <div className="space-y-4 pt-4 border-t border-slate-800">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Inbox className="h-5 w-5 text-amber-400" />
            <h2 className="text-base font-bold text-white">
              Team-Pool & Nicht zugewiesene Aufträge ({teamPoolOrders.length})
            </h2>
          </div>
          <span className="text-xs text-slate-400">
            Offener Arbeitsvorrat für die Schicht
          </span>
        </div>

        {teamPoolOrders.length === 0 ? (
          <Card className="p-6 text-center bg-slate-900 border-slate-800 text-slate-400 text-xs">
            Der Team-Pool ist leer – keine unbesetzten Aufträge.
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {teamPoolOrders.map((order) => (
              <Card
                key={order.id}
                className="p-4 bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition-all"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-white px-2 py-0.5 rounded bg-slate-800 border border-slate-700">
                        {order.orderNumber}
                      </span>
                      {getPriorityBadge(order.priority)}
                      <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-800/80">
                        Team-Pool (Frei)
                      </Badge>
                    </div>

                    <Link
                      href={`/orders/${order.id}`}
                      className="text-sm font-semibold text-white hover:text-cyan-400 block tracking-tight"
                    >
                      {order.title}
                    </Link>

                    <p className="text-xs text-slate-400 line-clamp-1">
                      {order.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pt-0.5">
                      {order.equipmentName && <span>⚙️ {order.equipmentName}</span>}
                      <span>Geschätzte Dauer: {order.plannedDurationMinutes} Min.</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => handleStartWork(order)}
                      className="h-11 min-h-[44px] px-3.5 text-xs bg-cyan-600 hover:bg-cyan-500 text-white gap-1.5"
                    >
                      <Play className="h-3 w-3 fill-current" />
                      <span>Übernehmen & starten</span>
                    </Button>

                    <Link
                      href={`/orders/${order.id}`}
                      className="h-11 min-h-[44px] px-3.5 rounded-md border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs inline-flex items-center"
                    >
                      Details
                    </Link>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* ZEITERFASSUNGS- & DOKUMENTATIONS-DIALOG                                   */}
      {/* ========================================================================= */}
      {completionOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  Rückmeldung & Technischer Abschluss (TABG)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Auftrag: <strong className="text-white">{completionOrder.orderNumber}</strong> · {completionOrder.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCompletionOrder(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Zeiterfassung */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-slate-300">Tatsächliche Arbeitszeit (Minuten) *</Label>
                  <Input
                    type="number"
                    value={completionDuration}
                    onChange={(e) => setCompletionDuration(parseInt(e.target.value) || 0)}
                    className="bg-slate-950 border-slate-800 text-white font-mono"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-slate-300">Maschinenstillstand (Minuten)</Label>
                  <Input
                    type="number"
                    value={completionDowntime}
                    onChange={(e) => setCompletionDowntime(parseInt(e.target.value) || 0)}
                    className="bg-slate-950 border-slate-800 text-white font-mono"
                  />
                </div>
              </div>

              {/* Schadensursache */}
              <div className="space-y-1.5">
                <Label className="text-slate-300">Schadensursache (SAP Katalog URGRP/URCOD)</Label>
                <select
                  value={completionCauseCode}
                  onChange={(e) => setCompletionCauseCode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-md p-2 text-white focus:outline-none"
                >
                  <option value="MECH_VERSCHLEISS">MECH_VERSCHLEISS - Normaler Verschleiß / Laufleistung</option>
                  <option value="MECH_SCHMIERMANGEL">MECH_SCHMIERMANGEL - Schmiermittelmangel / Trockenlauf</option>
                  <option value="ELEC_BAUTEIL">ELEC_BAUTEIL - Elektronik- / Halbleiterdefekt</option>
                  <option value="HYDR_DICHTUNG">HYDR_DICHTUNG - Dichtungsversagen / O-Ring geplatzt</option>
                  <option value="BEDIENFEHLER">BEDIENFEHLER - Fehlbedienung / Falsches Programm</option>
                  <option value="FREMDKOERPER">FREMDKOERPER - Fremdkörperkollision / Blockade</option>
                </select>
              </div>

              {/* Detailursache */}
              <div className="space-y-1.5">
                <Label className="text-slate-300">Detaillierte Fehlerursache (Root Cause Analysis)</Label>
                <Input
                  value={completionCauseDesc}
                  onChange={(e) => setCompletionCauseDesc(e.target.value)}
                  placeholder="z.B. Wellendichtring durch Metallspäne beschädigt..."
                  className="bg-slate-950 border-slate-800 text-white"
                />
              </div>

              {/* Durchgeführte Maßnahme */}
              <div className="space-y-1.5">
                <Label className="text-slate-300">Durchgeführte Reparaturmaßnahme / Lösung *</Label>
                <textarea
                  value={completionResolution}
                  onChange={(e) => setCompletionResolution(e.target.value)}
                  placeholder="Was wurde repariert, gereinigt oder getauscht?"
                  rows={3}
                  className="w-full p-2.5 rounded-md bg-slate-950 border border-slate-800 text-white focus:outline-none resize-none"
                  required
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCompletionOrder(null)}
                className="border-slate-700 text-slate-300"
              >
                Abbrechen
              </Button>
              <Button
                size="sm"
                onClick={handleSubmitCompletion}
                disabled={isPending || !completionResolution.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5"
              >
                <Check className="h-4 w-4" />
                <span>Rückmeldung buchen & abschließen</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ESKALATIONS-DIALOG                                                        */}
      {/* ========================================================================= */}
      {escalationOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-xl border border-rose-800/80 bg-slate-900 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-rose-400 flex items-center gap-2">
                <ShieldAlert className="h-5 w-5" />
                Eskalation nach Level 2 / Level 3
              </h3>
              <button
                type="button"
                onClick={() => setEscalationOrder(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <Label className="text-slate-300">Eskalations-Ebene:</Label>
                <select
                  value={escalationLevel}
                  onChange={(e) => setEscalationLevel(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-md p-2 text-white focus:outline-none"
                >
                  <option value="LEVEL_2">Level 2: Instandhaltungs-Meister / Spezialist</option>
                  <option value="LEVEL_3">Level 3: Maschinenhersteller Service / Engineering</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-slate-300">Begründung & Hindernis:</Label>
                <textarea
                  value={escalationReason}
                  onChange={(e) => setEscalationReason(e.target.value)}
                  placeholder="Warum kann die Störung vor Ort nicht gelöst werden? (z.B. Spezialwerkzeug fehlt, Steuerungscode gesperrt...)"
                  rows={3}
                  className="w-full p-2.5 rounded-md bg-slate-950 border border-slate-800 text-white focus:outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEscalationOrder(null)}
                className="border-slate-700 text-slate-300"
              >
                Abbrechen
              </Button>
              <Button
                size="sm"
                onClick={handleSubmitEscalation}
                className="bg-rose-600 hover:bg-rose-500 text-white"
              >
                Eskalation übermitteln
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
