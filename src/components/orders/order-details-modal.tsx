"use client";

import React, { useState, useEffect, useCallback, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  X,
  ExternalLink,
  Clock,
  Play,
  Square,
  Pause,
  CheckCircle2,
  Package,
  User,
  Wrench,
  AlertTriangle,
  Calendar,
  MapPin,
  Layers,
  Cpu,
  Trash2,
  Save,
  Upload,
  Image as ImageIcon,
  FileText,
  ShieldCheck,
  CheckCheck,
  Sparkles,
  RefreshCw,
  HardHat,
  ClipboardList,
  Flame,
  Info,
} from "lucide-react";
import { useWorkspace } from "@/components/layout/workspace-context";
import { OrderWorkflowActions } from "@/components/orders/order-workflow-actions";
import {
  getOrderDetailsAction,
  updateMaintenanceOrderDetailsAction,
  deleteMaintenanceOrderAction,
  startWorkOrderAction,
  pauseOrderAction,
  completeOrderAction,
  releaseOrderAction,
  closeOrderCommercialAction,
  bookSparePartAction,
  startWorkTimer,
  stopWorkTimer,
  logManualWorkTime,
  getTechniciansAction,
  getAvailableSparePartsAction,
  getOrderTypesAction,
  OrderWithDetails,
} from "@/actions/order-actions";

export interface OrderDetailsModalProps {
  orderId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onOrderUpdated?: () => void;
}

type RbacViewRole = "OPERATOR" | "TECHNICIAN" | "COORDINATOR" | "ADMIN";

export function OrderDetailsModal({
  orderId,
  isOpen,
  onClose,
  onOrderUpdated,
}: OrderDetailsModalProps) {
  const router = useRouter();
  const { currentUser } = useWorkspace();
  const [isPending, startModalTransition] = useTransition();

  // Order Details State
  const [isLoading, setIsLoading] = useState(false);
  const [order, setOrder] = useState<OrderWithDetails | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Dynamic Options (Technicians, Spare Parts, Order Types)
  const [technicians, setTechnicians] = useState<Array<{ id: string; firstName: string; lastName: string; email: string; personnelNr: string | null }>>([]);
  const [sparePartsList, setSparePartsList] = useState<Array<{ id: string; internalPartNumber: string; name: string; unitOfMeasure: string; stockQuantity: string }>>([]);
  const [orderTypesList, setOrderTypesList] = useState<Array<{ id: string; code: string; name: string; colorHex: string }>>([]);

  // RBAC active tab
  const getMappedRole = (code: string): RbacViewRole => {
    const upper = (code || "").toUpperCase();
    if (upper === "ADMIN") return "ADMIN";
    if (["COORDINATOR", "MAINT_PLANNER", "SHIFT_LEAD", "PLANNER"].includes(upper)) return "COORDINATOR";
    if (["TECHNICIAN", "INSTANDHALTER"].includes(upper)) return "TECHNICIAN";
    return "OPERATOR";
  };

  const [activeRoleView, setActiveRoleView] = useState<RbacViewRole>(() =>
    getMappedRole(currentUser?.roleCode || "COORDINATOR")
  );

  // Editable Form Fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [symptomDescription, setSymptomDescription] = useState("");
  const [priority, setPriority] = useState<"1_EMERGENCY" | "2_HIGH" | "3_MEDIUM" | "4_LOW">("3_MEDIUM");
  const [orderTypeId, setOrderTypeId] = useState<string>("");
  const [assignedToUserId, setAssignedToUserId] = useState<string>("");
  const [plannedDurationMinutes, setPlannedDurationMinutes] = useState<number>(60);

  // Operator Photo Upload state
  const [uploadedPhotos, setUploadedPhotos] = useState<Array<{ name: string; url: string; size: string }>>([]);

  // Technician Time Tracking State
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [manualTimeMinutes, setManualTimeMinutes] = useState<number>(30);
  const [manualTimeDesc, setManualTimeDesc] = useState("");

  // Technician Spare Parts State
  const [selectedSparePartId, setSelectedSparePartId] = useState("");
  const [sparePartQty, setSparePartQty] = useState<number>(1);
  const [sparePartNote, setSparePartNote] = useState("");

  // Pause Reason Dialog / State
  const [showPausePrompt, setShowPausePrompt] = useState(false);
  const [pauseReason, setPauseReason] = useState("");

  // Complete Order TABG prompt state
  const [showCompletePrompt, setShowCompletePrompt] = useState(false);
  const [completeComment, setCompleteComment] = useState("");

  // Delete Confirmation State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Synchronize initial mapped role when currentUser changes
  useEffect(() => {
    if (currentUser?.roleCode) {
      setActiveRoleView(getMappedRole(currentUser.roleCode));
    }
  }, [currentUser?.roleCode]);

  // Load Order Details & Reference Catalogs
  const fetchOrderDetails = useCallback(async (id: string) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [orderRes, techRes, partsRes, typesRes] = await Promise.all([
        getOrderDetailsAction(id),
        getTechniciansAction(),
        getAvailableSparePartsAction(),
        getOrderTypesAction(),
      ]);

      if (orderRes.success && orderRes.order) {
        const ord = orderRes.order;
        setOrder(ord);
        setTitle(ord.title || "");
        setDescription(ord.description || "");
        setSymptomDescription(ord.symptomDescription || "");
        setPriority(ord.priority as any || "3_MEDIUM");
        setOrderTypeId(ord.orderTypeId || "");
        setAssignedToUserId(ord.assignedToUserId || "");
        setPlannedDurationMinutes(ord.plannedDurationMinutes || 60);

        // Check active timer
        const activeTimer = ord.timeEntries?.find((t: any) => !t.endedAt);
        if (activeTimer) {
          setIsTimerRunning(true);
          const startMs = activeTimer.startedAt ? new Date(activeTimer.startedAt).getTime() : Date.now();
          const elapsedSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
          setTimerSeconds(elapsedSec);
        } else {
          setIsTimerRunning(false);
          setTimerSeconds(0);
        }
      } else {
        setErrorMessage(orderRes.error || "Auftragsdetails konnten nicht geladen werden.");
      }

      if (techRes.success && techRes.users) {
        setTechnicians(techRes.users as any);
      }
      if (partsRes.success && partsRes.parts) {
        setSparePartsList(partsRes.parts as any);
      }
      if (typesRes.success && typesRes.orderTypes) {
        setOrderTypesList(typesRes.orderTypes as any);
      }
    } catch (err: any) {
      console.error("Fehler beim Laden der Auftragsdetails im Modal:", err);
      setErrorMessage(err?.message || "Unerwarteter Fehler beim Abrufen der Details.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && orderId) {
      fetchOrderDetails(orderId);
    } else {
      setOrder(null);
      setErrorMessage(null);
      setShowDeleteConfirm(false);
      setShowPausePrompt(false);
      setShowCompletePrompt(false);
      setUploadedPhotos([]);
    }
  }, [isOpen, orderId, fetchOrderDetails]);

  // Live timer interval ticker
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning]);

  // Escape key closes modal & lock background scroll
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen || !orderId) return null;

  // Format Helper
  const formatTimerClock = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "-";
    try {
      const d = new Date(date);
      return d.toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return String(date);
    }
  };

  // Render Priority Badge per docs/design-rules.md
  const renderPriorityBadge = (prio: string | undefined) => {
    switch (prio) {
      case "1_EMERGENCY":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-700 border border-rose-200">
            <Flame className="w-3.5 h-3.5 text-rose-600" />
            Prio 1 (Notfall)
          </span>
        );
      case "2_HIGH":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            Prio 2 (Hoch)
          </span>
        );
      case "3_MEDIUM":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
            Prio 3 (Mittel)
          </span>
        );
      case "4_LOW":
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
            Prio 4 (Niedrig)
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
            {prio || "Normal"}
          </span>
        );
    }
  };

  // Render Origin Badge per docs/design-rules.md
  const renderOriginBadge = (sapOrderNr: string | null | undefined) => {
    if (sapOrderNr) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-100 text-indigo-700 border border-indigo-200">
          SAP PM: {sapOrderNr}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
        Lokal (MaintAI)
      </span>
    );
  };

  // Render Status Badge
  const renderStatusBadge = (name?: string, code?: string) => {
    const c = (code || "").toUpperCase();
    if (c === "IN_PROGRESS" || c === "IN_ARBEIT" || c === "IN_WORK") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          {name || "In Arbeit"}
        </span>
      );
    }
    if (c === "COMPLETED" || c === "TABG" || c === "CLOSED" || c === "ABGS") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          {name || "Abgeschlossen"}
        </span>
      );
    }
    if (c === "ON_HOLD" || c === "PAUSED" || c === "PAUSIERT") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-700 border border-slate-300">
          <Pause className="w-3 h-3 text-slate-600" />
          {name || "Pausiert"}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-800 border border-sky-200">
        {name || "Erfasst"}
      </span>
    );
  };

  // --- ACTIONS ---

  // Save changes (Coordinator, Admin, Operator)
  const handleSaveChanges = async () => {
    if (!order) return;
    startModalTransition(async () => {
      try {
        const payload: any = {
          orderId: order.id,
          userId: currentUser?.userId,
        };

        if (activeRoleView === "OPERATOR") {
          payload.symptomDescription = symptomDescription;
        } else if (activeRoleView === "COORDINATOR") {
          payload.assignedToUserId = assignedToUserId;
          payload.plannedDurationMinutes = plannedDurationMinutes;
          payload.symptomDescription = symptomDescription;
        } else if (activeRoleView === "ADMIN") {
          payload.title = title;
          payload.description = description;
          payload.symptomDescription = symptomDescription;
          payload.priority = priority;
          payload.orderTypeId = orderTypeId;
          payload.assignedToUserId = assignedToUserId;
          payload.plannedDurationMinutes = plannedDurationMinutes;
        }

        const res = await updateMaintenanceOrderDetailsAction(payload);
        if (res.success) {
          toast.success("Änderungen erfolgreich gespeichert!");
          await fetchOrderDetails(order.id);
          if (onOrderUpdated) onOrderUpdated();
        } else {
          toast.error(res.error || "Fehler beim Speichern der Änderungen.");
        }
      } catch (err: any) {
        toast.error(err?.message || "Unerwarteter Serverfehler beim Speichern.");
      }
    });
  };

  // Delete Order (Admin)
  const handleDeleteOrder = async () => {
    if (!order) return;
    startModalTransition(async () => {
      try {
        const res = await deleteMaintenanceOrderAction(order.id, currentUser?.userId);
        if (res.success) {
          toast.success(res.message || "Auftrag erfolgreich gelöscht.");
          onClose();
          if (onOrderUpdated) onOrderUpdated();
        } else {
          toast.error(res.error || "Fehler beim Löschen des Auftrags.");
        }
      } catch (err: any) {
        toast.error(err?.message || "Fehler beim Löschen.");
      }
    });
  };

  // Status Action: In Arbeit setzen (Technician)
  const handleStartWork = async () => {
    if (!order) return;
    startModalTransition(async () => {
      try {
        const res = await startWorkOrderAction(
          order.id,
          currentUser?.userId || "user-tech-1",
          "Arbeitsbeginn über Schnellbearbeitungs-Modal"
        );
        if (res.success) {
          toast.success("Auftrag erfolgreich in Arbeit gesetzt!");
          await fetchOrderDetails(order.id);
          if (onOrderUpdated) onOrderUpdated();
        } else {
          toast.error(res.error || "Statuswechsel fehlgeschlagen.");
        }
      } catch (err: any) {
        toast.error(err?.message || "Fehler beim Starten der Arbeit.");
      }
    });
  };

  // Status Action: Pausieren (Technician)
  const handlePauseWork = async () => {
    if (!order) return;
    if (!pauseReason.trim()) {
      toast.error("Bitte geben Sie einen Grund für das Pausieren an.");
      return;
    }
    startModalTransition(async () => {
      try {
        const res = await pauseOrderAction(
          order.id,
          pauseReason.trim(),
          currentUser?.userId || "user-tech-1"
        );
        if (res.success) {
          toast.info("Auftrag pausiert.");
          setShowPausePrompt(false);
          setPauseReason("");
          await fetchOrderDetails(order.id);
          if (onOrderUpdated) onOrderUpdated();
        } else {
          toast.error(res.error || "Pausieren fehlgeschlagen.");
        }
      } catch (err: any) {
        toast.error(err?.message || "Fehler beim Pausieren.");
      }
    });
  };

  // Status Action: Technisch abschließen TABG (Technician)
  const handleCompleteOrder = async () => {
    if (!order) return;
    startModalTransition(async () => {
      try {
        const res = await completeOrderAction({
          orderId: order.id,
          userId: currentUser?.userId || "user-tech-1",
          comment: completeComment.trim() || "Technischer Abschluss (TABG) im Detail-Modal",
          actualDurationMinutes: order.actualDurationMinutes || 60,
        });
        if (res.success) {
          toast.success("Auftrag erfolgreich technisch abgeschlossen (TABG)!");
          setShowCompletePrompt(false);
          setCompleteComment("");
          await fetchOrderDetails(order.id);
          if (onOrderUpdated) onOrderUpdated();
        } else {
          toast.error(res.error || res.message || "Abschluss fehlgeschlagen.");
        }
      } catch (err: any) {
        toast.error(err?.message || "Fehler beim technischen Abschluss.");
      }
    });
  };

  // Status Action: Freigabe erteilen (Coordinator)
  const handleReleaseOrder = async () => {
    if (!order) return;
    startModalTransition(async () => {
      try {
        const res = await releaseOrderAction(
          order.id,
          currentUser?.userId || "user-coord-1",
          "Freigabe erteilt über Detail-Modal"
        );
        if (res.success) {
          toast.success("Auftrag erfolgreich freigegeben!");
          await fetchOrderDetails(order.id);
          if (onOrderUpdated) onOrderUpdated();
        } else {
          toast.error(res.error || "Freigabe fehlgeschlagen.");
        }
      } catch (err: any) {
        toast.error(err?.message || "Fehler bei Auftragsfreigabe.");
      }
    });
  };

  // Status Action: Kaufmännisch abschließen ABGS (Coordinator)
  const handleCommercialClose = async () => {
    if (!order) return;
    startModalTransition(async () => {
      try {
        const res = await closeOrderCommercialAction(
          order.id,
          currentUser?.userId || "user-coord-1",
          "Kaufmännischer Abschluss (ABGS) über Detail-Modal"
        );
        if (res.success) {
          toast.success("Auftrag kaufmännisch abgeschlossen (ABGS)!");
          await fetchOrderDetails(order.id);
          if (onOrderUpdated) onOrderUpdated();
        } else {
          toast.error((res as any).error || (res as any).message || "Kaufmännischer Abschluss fehlgeschlagen.");
        }
      } catch (err: any) {
        toast.error(err?.message || "Fehler beim kaufmännischen Abschluss.");
      }
    });
  };

  // Timer Toggle (Technician)
  const handleToggleTimer = async () => {
    if (!order) return;
    startModalTransition(async () => {
      try {
        if (!isTimerRunning) {
          const res = await startWorkTimer(order.id, currentUser?.userId || "user-tech-1");
          if (res.success) {
            setIsTimerRunning(true);
            setTimerSeconds(0);
            toast.success("Live-Timer gestartet!");
            await fetchOrderDetails(order.id);
            if (onOrderUpdated) onOrderUpdated();
          } else {
            toast.error(res.error || "Fehler beim Starten des Timers.");
          }
        } else {
          const res = await stopWorkTimer(order.id, "Timer im Detail-Modal gestoppt", currentUser?.userId);
          if (res.success) {
            setIsTimerRunning(false);
            setTimerSeconds(0);
            toast.success(`Timer gestoppt. ${res.durationMinutes || 0} Minuten verbucht.`);
            await fetchOrderDetails(order.id);
            if (onOrderUpdated) onOrderUpdated();
          } else {
            toast.error(res.error || "Fehler beim Stoppen des Timers.");
          }
        }
      } catch (err: any) {
        toast.error(err?.message || "Fehler bei der Zeiterfassung.");
      }
    });
  };

  // Manual Time Booking (Technician)
  const handleLogManualTime = async () => {
    if (!order) return;
    if (manualTimeMinutes <= 0) {
      toast.error("Bitte eine Dauer größer 0 Minuten angeben.");
      return;
    }
    startModalTransition(async () => {
      try {
        const res = await logManualWorkTime({
          orderId: order.id,
          durationMinutes: manualTimeMinutes,
          userId: currentUser?.userId || "user-tech-1",
          workDescription: manualTimeDesc.trim() || "Manuelle Zeiterfassung im Modal",
        });
        if (res.success) {
          toast.success(`${manualTimeMinutes} Minuten verbucht!`);
          setManualTimeDesc("");
          setManualTimeMinutes(30);
          await fetchOrderDetails(order.id);
          if (onOrderUpdated) onOrderUpdated();
        } else {
          toast.error(res.error || "Fehler bei der manuellen Zeiterfassung.");
        }
      } catch (err: any) {
        toast.error(err?.message || "Fehler beim Buchen der Arbeitszeit.");
      }
    });
  };

  // Book Spare Part (Technician)
  const handleBookSparePart = async () => {
    if (!order) return;
    if (!selectedSparePartId) {
      toast.error("Bitte wählen Sie ein Ersatzteil aus.");
      return;
    }
    if (sparePartQty <= 0) {
      toast.error("Bitte eine Menge größer 0 angeben.");
      return;
    }
    startModalTransition(async () => {
      try {
        const res = await bookSparePartAction({
          orderId: order.id,
          sparePartId: selectedSparePartId,
          quantity: sparePartQty,
          userId: currentUser?.userId || "user-tech-1",
        });
        if (res.success) {
          toast.success("Ersatzteil erfolgreich gebucht!");
          setSelectedSparePartId("");
          setSparePartQty(1);
          setSparePartNote("");
          await fetchOrderDetails(order.id);
          if (onOrderUpdated) onOrderUpdated();
        } else {
          toast.error(res.message || "Fehler bei der Ersatzteilbuchung.");
        }
      } catch (err: any) {
        toast.error(err?.message || "Fehler beim Buchen des Ersatzteils.");
      }
    });
  };

  // Local File Upload Simulation for Operator
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const newPhoto = {
      name: file.name,
      url: URL.createObjectURL(file),
      size: `${(file.size / 1024).toFixed(1)} KB`,
    };
    setUploadedPhotos((prev) => [...prev, newPhoto]);
    toast.success(`Foto "${file.name}" angehängt.`);
  };

  const handleRemovePhoto = (index: number) => {
    setUploadedPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-details-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-4xl max-h-[92vh] bg-white rounded-2xl border border-slate-200 shadow-2xl flex flex-col overflow-hidden text-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ================================================================= */}
        {/* 1. KOPFZEILE                                                      */}
        {/* ================================================================= */}
        <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Auftrags-Nr.</span>
              <span id="order-details-title" className="font-mono font-bold text-lg text-blue-600">
                {order?.orderNumber || (isLoading ? "Lade..." : orderId)}
              </span>
            </div>

            {order && (
              <>
                {renderPriorityBadge(priority)}
                {renderOriginBadge(order.sapOrderNr)}
                {renderStatusBadge(order.currentStatus?.name, order.currentStatus?.code)}
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="inline-flex items-center justify-center h-10 w-10 min-h-[44px] min-w-[44px] rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ================================================================= */}
        {/* MODAL BODY (SCROLLBAR)                                            */}
        {/* ================================================================= */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
          {isLoading && !order ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-500">
              <RefreshCw className="w-7 h-7 animate-spin text-blue-600" />
              <p className="text-sm font-medium">Lade vollständige Auftragsdetails...</p>
            </div>
          ) : errorMessage && !order ? (
            <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm">
              <div className="flex items-center gap-2 font-semibold mb-1">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
                Fehler beim Laden
              </div>
              <p>{errorMessage}</p>
            </div>
          ) : order ? (
            <>
              {/* ------------------------------------------------------------- */}
              {/* 2. STAMMDATEN CARD                                            */}
              {/* ------------------------------------------------------------- */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" />
                    Stammdaten der Maßnahme
                  </h3>
                  <span className="text-xs text-slate-400">
                    ID: <span className="font-mono text-[11px]">{order.id}</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Titel */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Titel / Maßnahme
                    </label>
                    {activeRoleView === "ADMIN" ? (
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Auftragstitel eingeben..."
                      />
                    ) : (
                      <p className="text-sm font-semibold text-slate-900 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                        {order.title}
                      </p>
                    )}
                  </div>

                  {/* Fehlerbeschreibung */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Fehlerbeschreibung
                    </label>
                    {activeRoleView === "ADMIN" ? (
                      <textarea
                        rows={2}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Detaillierte Fehlerbeschreibung..."
                      />
                    ) : (
                      <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200 whitespace-pre-wrap leading-relaxed">
                        {order.description || "Keine Fehlerbeschreibung hinterlegt."}
                      </p>
                    )}
                  </div>

                  {/* Technischer Platz */}
                  <div>
                    <span className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" /> Technischer Platz
                    </span>
                    <div className="text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200 font-mono text-slate-800 truncate">
                      {order.functionalLocation
                        ? `${order.functionalLocation.code} - ${order.functionalLocation.name}`
                        : "Nicht zugewiesen"}
                    </div>
                  </div>

                  {/* Equipment */}
                  <div>
                    <span className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-slate-400" /> Equipment
                    </span>
                    <div className="text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-slate-800 truncate">
                      {order.equipment
                        ? `${order.equipment.name} (${order.equipment.equipmentNumber || "Ohne Nr."})`
                        : "Kein Equipment"}
                    </div>
                  </div>

                  {/* Baugruppe */}
                  <div>
                    <span className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-slate-400" /> Baugruppe
                    </span>
                    <div className="text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-slate-800">
                      {order.assembly
                        ? `${order.assembly.name} (${order.assembly.code})`
                        : "Gesamtanlage / Keine Baugruppe"}
                    </div>
                  </div>

                  {/* Gemeldeter Zeitpunkt */}
                  <div>
                    <span className="block text-xs font-semibold text-slate-600 mb-1 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" /> Gemeldeter Zeitpunkt
                    </span>
                    <div className="text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-slate-800 flex items-center justify-between">
                      <span>{formatDate(order.createdAt)}</span>
                      <span className="text-[11px] text-slate-500 font-sans">
                        von {order.reportedByUser ? `${order.reportedByUser.firstName} ${order.reportedByUser.lastName}` : "Melder"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* 3. ROLLENBASIERTE BEARBEITUNG (RBAC TABS & FORM)               */}
              {/* ------------------------------------------------------------- */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                {/* RBAC Header Bar with Role Switcher */}
                <div className="bg-slate-100/70 border-b border-slate-200 px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-blue-600" />
                      Rollenbasierte Bearbeitung (RBAC)
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Systemrolle: <strong className="text-slate-700">{currentUser?.roleName || currentUser?.roleCode}</strong> • Wähle eine Perspektive zur Bearbeitung:
                    </p>
                  </div>

                  {/* Tabs */}
                  <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-xs self-start sm:self-auto overflow-x-auto">
                    <button
                      type="button"
                      onClick={() => setActiveRoleView("OPERATOR")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                        activeRoleView === "OPERATOR"
                          ? "bg-blue-600 text-white shadow-xs"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                      }`}
                    >
                      Bediener
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveRoleView("TECHNICIAN")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                        activeRoleView === "TECHNICIAN"
                          ? "bg-blue-600 text-white shadow-xs"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                      }`}
                    >
                      Servicetechniker
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveRoleView("COORDINATOR")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                        activeRoleView === "COORDINATOR"
                          ? "bg-blue-600 text-white shadow-xs"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                      }`}
                    >
                      Koordinator
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveRoleView("ADMIN")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                        activeRoleView === "ADMIN"
                          ? "bg-blue-600 text-white shadow-xs"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                      }`}
                    >
                      Administrator
                    </button>
                  </div>
                </div>

                <div className="p-5">
                  {/* ========================================================= */}
                  {/* ROLE A: MASCHINENBEDIENER (OPERATOR)                      */}
                  {/* ========================================================= */}
                  {activeRoleView === "OPERATOR" && (
                    <div className="space-y-4 animate-in fade-in duration-150">
                      <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-sky-900 text-xs flex items-start gap-2.5">
                        <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                        <div>
                          <strong>Maschinenbediener-Sicht (Lesend mit Symptomerfassung):</strong>
                          <p className="text-sky-800 text-[11px] mt-0.5">
                            Sie können beobachtete Auffälligkeiten (z.B. Vibrationen, Gerüche, Geräusche) präzisieren sowie Schadensfotos für die Werkstatt anhängen.
                          </p>
                        </div>
                      </div>

                      {/* Symptom Comment Textarea */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-blue-600" />
                          Symptom-Kommentar & Beobachtungen vor Ort
                        </label>
                        <textarea
                          rows={3}
                          value={symptomDescription}
                          onChange={(e) => setSymptomDescription(e.target.value)}
                          placeholder="z.B. Ungewöhnliches Klackern im Bereich des Antriebs bei Lastwechsel, leichter Schmierölaustritt am Gehäuse..."
                          className="w-full bg-white border border-slate-300 rounded-xl p-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
                        />
                      </div>

                      {/* Schadensfotos & Upload */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                            Schadensfotos / Anhänge
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {uploadedPhotos.length} Foto(s) angehängt
                          </span>
                        </label>

                        <div className="flex flex-wrap gap-3 items-center">
                          {/* File Input Label Button */}
                          <label className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer transition-colors shadow-xs">
                            <Upload className="w-4 h-4 text-blue-600" />
                            <span>Foto / Datei hinzufügen</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handlePhotoSelect}
                              className="sr-only"
                            />
                          </label>

                          {/* Previews */}
                          {uploadedPhotos.map((photo, idx) => (
                            <div
                              key={idx}
                              className="relative flex items-center gap-2 p-2 rounded-xl border border-slate-200 bg-white shadow-xs group"
                            >
                              <img
                                src={photo.url}
                                alt={photo.name}
                                className="w-10 h-10 object-cover rounded-lg border border-slate-100"
                              />
                              <div className="text-[11px] max-w-[120px] truncate">
                                <p className="font-semibold text-slate-800 truncate">{photo.name}</p>
                                <span className="text-slate-400 text-[10px]">{photo.size}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemovePhoto(idx)}
                                aria-label="Foto entfernen"
                                className="p-1 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors ml-1"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ========================================================= */}
                  {/* ROLE B: SERVICETECHNIKER (TECHNICIAN)                     */}
                  {/* ========================================================= */}
                  {activeRoleView === "TECHNICIAN" && (
                    <div className="space-y-6 animate-in fade-in duration-150">
                      {/* 1. Statusaktionen (Dynamische Workflow-Engine) */}
                      <div>
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                          <Wrench className="w-3.5 h-3.5 text-blue-600" />
                          1. Status-Aktionen & Arbeitsfluss
                        </h4>

                        <OrderWorkflowActions
                          orderId={order.id}
                          userRole="TECHNICIAN"
                          userId={currentUser?.userId || "user-tech-1"}
                          onTransitionSuccess={() => {
                            fetchOrderDetails(order.id);
                            onOrderUpdated?.();
                          }}
                        />
                      </div>

                      {/* 2. Zeiterfassung */}
                      <div className="border-t border-slate-100 pt-4">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-blue-600" />
                          2. Zeiterfassung (Live-Timer & Ist-Zeiten)
                        </h4>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {/* Live Timer Box */}
                          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                            <div>
                              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                                Live-Arbeitszeit-Timer
                              </span>
                              <div className="text-2xl font-mono font-bold text-slate-900 mt-1 flex items-center gap-2">
                                {formatTimerClock(timerSeconds)}
                                {isTimerRunning && (
                                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                                )}
                              </div>
                            </div>

                            <button
                              type="button"
                              disabled={isPending}
                              onClick={handleToggleTimer}
                              className={`inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer ${
                                isTimerRunning
                                  ? "bg-rose-600 hover:bg-rose-700 text-white"
                                  : "bg-blue-600 hover:bg-blue-700 text-white"
                              }`}
                            >
                              {isTimerRunning ? (
                                <>
                                  <Square className="w-4 h-4 fill-white" />
                                  <span>Timer stoppen</span>
                                </>
                              ) : (
                                <>
                                  <Play className="w-4 h-4" />
                                  <span>Timer starten</span>
                                </>
                              )}
                            </button>
                          </div>

                          {/* Manuelle Nacherfassung */}
                          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                              Ist-Zeit manuell nacherfassen
                            </span>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                min={1}
                                max={1440}
                                value={manualTimeMinutes}
                                onChange={(e) => setManualTimeMinutes(Number(e.target.value))}
                                className="w-24 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-mono text-center"
                                placeholder="Minuten"
                              />
                              <input
                                type="text"
                                value={manualTimeDesc}
                                onChange={(e) => setManualTimeDesc(e.target.value)}
                                className="flex-1 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                                placeholder="Tätigkeit beschreiben..."
                              />
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={handleLogManualTime}
                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-medium shrink-0 cursor-pointer"
                              >
                                + Buchen
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Zeiteinträge Liste */}
                        {order.timeEntries && order.timeEntries.length > 0 && (
                          <div className="mt-3">
                            <span className="text-[11px] font-semibold text-slate-500 block mb-1.5">
                              Gebuchte Zeiteinträge ({order.timeEntries.length}):
                            </span>
                            <div className="max-h-28 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg bg-white">
                              {order.timeEntries.map((te: any) => (
                                <div
                                  key={te.id}
                                  className="p-2 text-xs flex items-center justify-between text-slate-700"
                                >
                                  <div>
                                    <span className="font-semibold text-slate-900 mr-2">
                                      {te.durationMinutes} Min.
                                    </span>
                                    <span className="text-slate-500 text-[11px]">
                                      {te.workDescription || "Arbeitseinsatz"}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    {formatDate(te.startedAt)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 3. Materialbuchung */}
                      <div className="border-t border-slate-100 pt-4">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-blue-600" />
                          3. Materialbuchung & Ersatzteile
                        </h4>

                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {/* Spare Part Select */}
                            <div className="sm:col-span-2">
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                Ersatzteil aus Katalog / Lager
                              </label>
                              <select
                                value={selectedSparePartId}
                                onChange={(e) => setSelectedSparePartId(e.target.value)}
                                className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                              >
                                <option value="">-- Ersatzteil auswählen --</option>
                                {sparePartsList.map((part) => (
                                  <option key={part.id} value={part.id}>
                                    {part.internalPartNumber} - {part.name} (Lager: {part.stockQuantity} {part.unitOfMeasure})
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Qty & Button */}
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                Menge
                              </label>
                              <div className="flex gap-2">
                                <input
                                  type="number"
                                  min={1}
                                  value={sparePartQty}
                                  onChange={(e) => setSparePartQty(Number(e.target.value))}
                                  className="w-16 bg-white border border-slate-300 rounded-lg px-2 py-2 text-xs text-center font-mono text-slate-800"
                                />
                                <button
                                  type="button"
                                  disabled={isPending || !selectedSparePartId}
                                  onClick={handleBookSparePart}
                                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
                                >
                                  <Package className="w-3.5 h-3.5" />
                                  <span>Buchen</span>
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Bisher gebuchte Ersatzteile */}
                          {order.sparePartBookings && order.sparePartBookings.length > 0 && (
                            <div className="pt-2 border-t border-slate-200">
                              <span className="text-[11px] font-semibold text-slate-500 block mb-1">
                                Bisher auf Auftrag gebucht ({order.sparePartBookings.length}):
                              </span>
                              <div className="divide-y divide-slate-100 bg-white rounded-lg border border-slate-200 overflow-hidden text-xs">
                                {order.sparePartBookings.map((b: any) => (
                                  <div
                                    key={b.id}
                                    className="p-2 flex items-center justify-between text-slate-700"
                                  >
                                    <div>
                                      <span className="font-semibold text-slate-900 mr-2">
                                        {b.quantity}x
                                      </span>
                                      <span>{b.sparePart?.name || b.sparePart?.internalPartNumber || "Ersatzteil"}</span>
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-mono">
                                      {formatDate(b.bookedAt)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ========================================================= */}
                  {/* ROLE C: INSTANDHALTUNGS-KOORDINATOR (COORDINATOR)         */}
                  {/* ========================================================= */}
                  {activeRoleView === "COORDINATOR" && (
                    <div className="space-y-5 animate-in fade-in duration-150">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Techniker zuweisen / umplanen */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-blue-600" />
                            Techniker zuweisen / umplanen
                          </label>
                          <select
                            value={assignedToUserId}
                            onChange={(e) => setAssignedToUserId(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">-- Nicht zugeordnet (Team-Pool) --</option>
                            {technicians.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.lastName}, {t.firstName} ({t.personnelNr || t.email})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Geplante Dauer anpassen */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-blue-600" />
                            Geplante Dauer (Minuten)
                          </label>
                          <input
                            type="number"
                            min={15}
                            step={15}
                            value={plannedDurationMinutes}
                            onChange={(e) => setPlannedDurationMinutes(Number(e.target.value))}
                            className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      {/* Status-Freigabe & Kaufmännischer Abschluss (Dynamische Workflow-Engine) */}
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                          Workflow-Freigabe & Abnahme (Dynamische Workflow-Engine)
                        </span>
                        <OrderWorkflowActions
                          orderId={order.id}
                          userRole="COORDINATOR"
                          userId={currentUser?.userId || "user-coord-1"}
                          onTransitionSuccess={() => {
                            fetchOrderDetails(order.id);
                            onOrderUpdated?.();
                          }}
                        />
                        <p className="text-[11px] text-slate-500">
                          Hinweis: Die Freigabe ermöglicht Technikern den Start. Vor technischem Abschluss (TABG) müssen alle Guards (Zeiterfassung, Prüfprotokoll) erfüllt sein.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ========================================================= */}
                  {/* ROLE D: ADMINISTRATOR (ADMIN)                             */}
                  {/* ========================================================= */}
                  {activeRoleView === "ADMIN" && (
                    <div className="space-y-5 animate-in fade-in duration-150">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Auftragsart */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Auftragsart
                          </label>
                          <select
                            value={orderTypeId}
                            onChange={(e) => setOrderTypeId(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">-- Keine Auftragsart --</option>
                            {orderTypesList.map((ot) => (
                              <option key={ot.id} value={ot.id}>
                                {ot.code} - {ot.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Priorität */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Priorität
                          </label>
                          <select
                            value={priority}
                            onChange={(e) => setPriority(e.target.value as any)}
                            className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="1_EMERGENCY">Prio 1 (Notfall / Stillstand)</option>
                            <option value="2_HIGH">Prio 2 (Hoch)</option>
                            <option value="3_MEDIUM">Prio 3 (Mittel)</option>
                            <option value="4_LOW">Prio 4 (Niedrig)</option>
                          </select>
                        </div>

                        {/* Techniker Zuweisung */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Zugewiesener Techniker
                          </label>
                          <select
                            value={assignedToUserId}
                            onChange={(e) => setAssignedToUserId(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">-- Nicht zugeordnet --</option>
                            {technicians.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.lastName}, {t.firstName} ({t.personnelNr || t.email})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Planzeit */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">
                            Planzeit (Minuten)
                          </label>
                          <input
                            type="number"
                            min={10}
                            value={plannedDurationMinutes}
                            onChange={(e) => setPlannedDurationMinutes(Number(e.target.value))}
                            className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2.5 text-xs text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      {/* Statusaktionen für Administrator (Dynamische Workflow-Engine) */}
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                        <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
                          Workflow-Statusübergänge (Administrator)
                        </span>
                        <OrderWorkflowActions
                          orderId={order.id}
                          userRole="ADMIN"
                          userId={currentUser?.userId || "user-admin-1"}
                          onTransitionSuccess={() => {
                            fetchOrderDetails(order.id);
                            onOrderUpdated?.();
                          }}
                        />
                      </div>

                      {/* Gefahrenzone: Auftrag löschen */}
                      <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-xs font-bold text-rose-800 block">
                              Gefahrenbereich (Administrator)
                            </span>
                            <span className="text-[11px] text-rose-600">
                              Löscht diesen Instandhaltungsauftrag dauerhaft mitsamt Historie und Zeitbuchungen.
                            </span>
                          </div>

                          {!showDeleteConfirm ? (
                            <button
                              type="button"
                              onClick={() => setShowDeleteConfirm(true)}
                              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-xs transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Auftrag löschen</span>
                            </button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setShowDeleteConfirm(false)}
                                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-200 rounded-lg"
                              >
                                Abbrechen
                              </button>
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={handleDeleteOrder}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-bold bg-rose-700 hover:bg-rose-800 text-white shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Unwiderruflich löschen</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* ================================================================= */}
        {/* 4. FUßZEILE DES MODALS                                            */}
        {/* ================================================================= */}
        <div className="px-6 py-4 bg-white border-t border-slate-200 flex items-center justify-between gap-4 shrink-0">
          {/* Link Vollbild-Ansicht */}
          {order ? (
            <Link
              href={`/orders/${order.id}`}
              onClick={onClose}
              className="inline-flex items-center gap-2 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline min-h-[44px] px-2"
            >
              <span>Vollbild-Ansicht öffnen</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          ) : (
            <div />
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Abbrechen
            </button>

            <button
              type="button"
              disabled={isPending || !order}
              onClick={handleSaveChanges}
              className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              {isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Speichern...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Änderungen speichern</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
