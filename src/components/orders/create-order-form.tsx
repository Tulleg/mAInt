"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Wrench,
  HelpCircle,
  ArrowRight,
  Send,
  RefreshCw,
  FileText,
  Flame,
  Volume2,
  Calendar,
  Layers,
  ChevronRight,
  ShieldCheck,
  Check,
  Mic,
  Search,
  Factory,
  MapPin,
  Cpu,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  parseFaultPromptAction,
  analyzeFaultCopilotAction,
  createMaintenanceOrderAction,
  CreateMaintenanceOrderInput,
} from "@/actions/order-actions";
import { ParsedFaultDraft } from "@/lib/ai/fault-parser";
import { FaultCopilotAnalysisResult } from "@/lib/ai/fault-copilot";
import { localDb } from "@/lib/offline/indexed-db";
import { syncManager } from "@/lib/offline/sync-manager";
import { toast } from "sonner";

export interface EquipmentOption {
  id: string;
  name: string;
  equipmentNumber: string;
  criticality?: string;
  plantSection?: string;
  functionalLocationName?: string;
  functionalLocationCode?: string;
}

export const ORDER_TYPES = [
  { code: "IH01", name: "IH01 - Störungsbehebung (Ungeplant / Notfall)", icon: "🚨" },
  { code: "IH02", name: "IH02 - Vorbeugende Instandhaltung / Wartung", icon: "🛠️" },
  { code: "IH03", name: "IH03 - Gesetzliche Prüfung / Kalibrierung", icon: "📋" },
  { code: "IH04", name: "IH04 - Technische Modifikation / Umbau", icon: "⚙️" },
];

export const DAMAGE_CODE_CATALOG = [
  {
    category: "Mechanik & Lagerung (MECH)",
    codes: [
      { code: "MECH_LAGER", label: "MECH_LAGER - Wälzlager- / Gleitlagerschaden" },
      { code: "MECH_VERSCHLEISS", label: "MECH_VERSCHLEISS - Mechanischer Verschleiß / Spiel" },
      { code: "MECH_BRUCH", label: "MECH_BRUCH - Wellen- / Gestängebruch" },
      { code: "MECH_LECKAGE", label: "MECH_LECKAGE - Dichtungsversagen / Schmiermittelleck" },
      { code: "MECH_BLOCKADE", label: "MECH_BLOCKADE - Fremdkörperkollision / Blockade" },
    ],
  },
  {
    category: "Elektrik & Antrieb (ELEC)",
    codes: [
      { code: "ELEC_MOTOR", label: "ELEC_MOTOR - Wicklungsschluss / Motor defekt" },
      { code: "ELEC_OVERLOAD", label: "ELEC_OVERLOAD - Thermische Überlastung" },
      { code: "ELEC_FU", label: "ELEC_FU - Frequenzumrichter / Bus-Störung" },
      { code: "ELEC_CABLE", label: "ELEC_CABLE - Kabelbruch / Schleppkettendefekt" },
      { code: "ELEC_POWER", label: "ELEC_POWER - Netzspannungseinbruch / Phasenausfall" },
    ],
  },
  {
    category: "Sensorik & Automatisierung (SENSOR)",
    codes: [
      { code: "SENSOR_INIT", label: "SENSOR_INIT - Näherungsschalter dejustiert" },
      { code: "SENSOR_DRIFT", label: "SENSOR_DRIFT - Messwertdrift / Kalibrierabweichung" },
      { code: "SENSOR_OPTIC", label: "SENSOR_OPTIC - Lichtschranke verschmutzt" },
      { code: "SENSOR_TEMP", label: "SENSOR_TEMP - PT100 / Thermoelement defekt" },
    ],
  },
  {
    category: "Fluidtechnik: Hydraulik & Pneumatik (HYDR/PNEU)",
    codes: [
      { code: "HYDR_PRESSURE", label: "HYDR_PRESSURE - Druckabfall / Kavitation" },
      { code: "HYDR_LECK", label: "HYDR_LECK - Schlauchleckage / O-Ring defekt" },
      { code: "PNEU_VALVE", label: "PNEU_VALVE - Ventilinsel / Schieber klemmt" },
      { code: "PNEU_CYLINDER", label: "PNEU_CYLINDER - Zylinder Endlagendämpfung defekt" },
      { code: "PNEU_FILTER", label: "PNEU_FILTER - Druckluftfilter verstopft" },
    ],
  },
];

interface CreateOrderFormProps {
  tenantId: string;
  equipments: EquipmentOption[];
  defaultUserId?: string;
}

export function CreateOrderForm({
  tenantId,
  equipments,
  defaultUserId = "user-demo-meister",
}: CreateOrderFormProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"ai_prompt" | "manual">("ai_prompt");
  const [isPending, startTransition] = useTransition();

  const [availableEquipments, setAvailableEquipments] = useState<EquipmentOption[]>(equipments);

  // Synchronisation mit IndexedDB & Background Sync Engine
  useEffect(() => {
    if (typeof window !== "undefined" && localDb) {
      if (equipments && equipments.length > 0) {
        setAvailableEquipments(equipments);
        localDb.equipments
          .bulkPut(
            equipments.map((e) => ({
              id: e.id,
              tenantId,
              equipmentNumber: e.equipmentNumber,
              name: e.name,
              criticality: (e.criticality as any) || "B",
              status: "ACTIVE",
            }))
          )
          .catch(() => {});
      } else {
        localDb.equipments.toArray().then((cached) => {
          if (cached && cached.length > 0) {
            setAvailableEquipments(cached);
          }
        });
      }

      if (syncManager && syncManager.isOnline) {
        syncManager.pullServerData(tenantId);
      }
    }
  }, [equipments, tenantId]);

  // --- State KI Prompt Mode ---
  const [promptText, setPromptText] = useState("");
  const [parsedDraft, setParsedDraft] = useState<ParsedFaultDraft | null>(null);
  const [answeredQuestions, setAnsweredQuestions] = useState<Record<string, string>>({});

  // --- State Manuelles Formular ---
  const [orderTypeId, setOrderTypeId] = useState<string>("IH01");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string>("");
  const [equipmentSearchQuery, setEquipmentSearchQuery] = useState("");
  const [isTreeExpanded, setIsTreeExpanded] = useState(false);
  const [priority, setPriority] = useState<"1_EMERGENCY" | "2_HIGH" | "3_MEDIUM" | "4_LOW">("3_MEDIUM");
  const [damageCode, setDamageCode] = useState<string>("MECH_LAGER");
  const [plannedDurationMinutes, setPlannedDurationMinutes] = useState<number>(60);
  const [scheduledStartAt, setScheduledStartAt] = useState<string>("");
  const [downtimeMinutes, setDowntimeMinutes] = useState<number>(0);
  const [isDowntime, setIsDowntime] = useState<boolean>(false);

  // --- State Copilot RAG ---
  const [copilotResult, setCopilotResult] = useState<FaultCopilotAnalysisResult | null>(null);
  const [copilotLoading, setCopilotLoading] = useState(false);

  // --- Success Modal/Notification ---
  const [createdOrderResult, setCreatedOrderResult] = useState<{
    id: string;
    orderNumber: string;
    title: string;
    sapNotificationNr?: string;
    isOfflineFallback?: boolean;
  } | null>(null);

  // Beispiel-Prompts zum Schnellstarten
  const samplePrompts = [
    {
      label: "🚨 Havarie & Stillstand",
      text: "Kreiselpumpe KSB in Halle 2 verliert massiv Druck, Motorblock ist glühend heiß und raucht. Fertigungslinie 2 steht seit 10 Minuten still!",
    },
    {
      label: "⚙️ Getriebe- & Lagerschaden",
      text: "Antriebsmotor Siemens 45kW macht mahlende Scharrgeräusche bei Teillast. Schwingungen spürbar erhöht, bitte zeitnah prüfen.",
    },
    {
      label: "🔌 Schaltschrank-Überhitzung",
      text: "Hauptverteiler Lüfterausfall, Schaltschrank-Thermowarnung 65 Grad erreicht. Klemmenleiste überprüfen.",
    },
  ];

  // 1. KI-Prompt parsen
  const handleAnalyzePrompt = () => {
    if (!promptText.trim()) return;

    startTransition(async () => {
      try {
        const result = await parseFaultPromptAction({
          tenantId,
          prompt: promptText,
          availableEquipments: equipments.map((e) => ({
            id: e.id,
            name: e.name,
            equipmentNumber: e.equipmentNumber,
          })),
        });

        setParsedDraft(result);
        setAnsweredQuestions({});

        // Synchronisiere auch Felder mit dem manuellen Formular
        setTitle(result.title);
        setDescription(result.description);
        if (result.matchedEquipmentId) {
          setSelectedEquipmentId(result.matchedEquipmentId);
        }
        setPriority(result.priority);
        setPlannedDurationMinutes(result.plannedDurationMinutes || 60);
        if (result.damageCode) {
          setDamageCode(result.damageCode);
        }
      } catch (err) {
        console.error("Fehler bei Prompt-Analyse:", err);
      }
    });
  };

  // Beantwortung einer Rückfrage durch die KI
  const handleAnswerQuestion = (fieldKey: string, answerText: string, updates: Partial<ParsedFaultDraft>) => {
    setAnsweredQuestions((prev) => ({ ...prev, [fieldKey]: answerText }));
    if (!parsedDraft) return;

    const updated = { ...parsedDraft, ...updates };
    setParsedDraft(updated);

    if (updates.title) setTitle(updates.title);
    if (updates.description) setDescription(updates.description);
    if (updates.matchedEquipmentId) setSelectedEquipmentId(updates.matchedEquipmentId);
    if (updates.priority) setPriority(updates.priority);
    if (updates.plannedDurationMinutes) setPlannedDurationMinutes(updates.plannedDurationMinutes);
  };

  // 2. Copilot Duplikat- und Lösungssuche (nicht-blockierend via useTransition)
  const handleRunCopilot = (customText?: string | React.MouseEvent) => {
    const textToAnalyze =
      (typeof customText === "string" ? customText : undefined) ||
      description ||
      title ||
      promptText;
    if (!textToAnalyze.trim()) return;

    setCopilotLoading(true);
    startTransition(async () => {
      try {
        const res = await analyzeFaultCopilotAction({
          tenantId,
          userInputText: textToAnalyze,
          equipmentId: selectedEquipmentId || undefined,
        });
        setCopilotResult(res);
      } catch (err) {
        console.warn("Copilot Analyse fehlgeschlagen:", err);
      } finally {
        setCopilotLoading(false);
      }
    });
  };

  // Live Debounced Copilot Analysis (Reagiert automatisch beim Tippen)
  React.useEffect(() => {
    const activeText = activeTab === "ai_prompt" ? promptText : `${title} ${description}`;
    if (!activeText || activeText.trim().length < 8) return;

    const timer = setTimeout(() => {
      handleRunCopilot(activeText);
    }, 650);

    return () => clearTimeout(timer);
  }, [promptText, title, description, selectedEquipmentId, activeTab]);

  // Übernahme eines Lösungsvorschlags in den aktuellen Auftrag
  const handleApplySolution = (sol: FaultCopilotAnalysisResult["suggestedSolutions"][0]) => {
    const partsText = sol.recommendedSpareParts?.length
      ? "\nBenötigte Ersatzteile: " + sol.recommendedSpareParts.map((p) => `${p.quantity}x ${p.name} (${p.partNumber})`).join(", ")
      : "";
    const solutionText = `[Historische Altmaßnahme ${sol.sourceOrderNumber}]\nUrsache: ${sol.cause}\nLösungsanweisung: ${sol.solution}${partsText}`;

    if (activeTab === "ai_prompt" && parsedDraft) {
      setParsedDraft({
        ...parsedDraft,
        description: parsedDraft.description ? `${parsedDraft.description}\n\n${solutionText}` : solutionText,
      });
    }

    setDescription((prev) => (prev ? `${prev}\n\n${solutionText}` : solutionText));
    if (!title && sol.title) {
      setTitle(sol.title);
    }
  };

  // Übernahme des KI-Dokumentations-Entwurfs
  const handleApplyDocumentationDraft = (draft: FaultCopilotAnalysisResult["documentationDraft"]) => {
    if (draft.refinedTitle) setTitle(draft.refinedTitle);
    if (draft.technicalDescription) setDescription(draft.technicalDescription);
    if (draft.recommendedPriority) setPriority(draft.recommendedPriority);
    if (draft.likelyDamageGroup) setDamageCode(draft.likelyDamageGroup);

    if (activeTab === "ai_prompt" && parsedDraft) {
      setParsedDraft({
        ...parsedDraft,
        title: draft.refinedTitle || parsedDraft.title,
        description: draft.technicalDescription || parsedDraft.description,
        priority: draft.recommendedPriority || parsedDraft.priority,
        damageCode: draft.likelyDamageGroup || parsedDraft.damageCode,
      });
    }
  };

  // In manuelles Formular übernehmen
  const handleTransferToManual = () => {
    if (parsedDraft) {
      setTitle(parsedDraft.title);
      setDescription(parsedDraft.description);
      if (parsedDraft.matchedEquipmentId) {
        setSelectedEquipmentId(parsedDraft.matchedEquipmentId);
      }
      setPriority(parsedDraft.priority);
      setPlannedDurationMinutes(parsedDraft.plannedDurationMinutes || 60);
      if (parsedDraft.damageCode) {
        setDamageCode(parsedDraft.damageCode);
      }
    }
    setActiveTab("manual");
  };

  // 3. Auftrag anlegen
  const handleSubmitOrder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const orderTitle = activeTab === "ai_prompt" && parsedDraft ? parsedDraft.title : title;
    const orderDesc = activeTab === "ai_prompt" && parsedDraft ? parsedDraft.description : description;
    const orderEquip = activeTab === "ai_prompt" && parsedDraft ? (parsedDraft.matchedEquipmentId || selectedEquipmentId) : selectedEquipmentId;
    const orderPrio = activeTab === "ai_prompt" && parsedDraft ? parsedDraft.priority : priority;
    const orderDuration = activeTab === "ai_prompt" && parsedDraft ? (parsedDraft.plannedDurationMinutes || 60) : plannedDurationMinutes;

    if (!orderTitle.trim()) {
      toast.error("Bitte geben Sie einen Störungstitel ein.");
      return;
    }

    if (!orderTypeId) {
      toast.error("Bitte wählen Sie verbindlich eine Auftragsart aus (z.B. IH01 Störungsbehebung).");
      return;
    }

    const payload: CreateMaintenanceOrderInput = {
      tenantId,
      title: orderTitle,
      description: orderDesc || orderTitle,
      orderTypeId: orderTypeId || "IH01",
      priority: orderPrio,
      equipmentId: orderEquip || null,
      damageCode: damageCode || null,
      plannedDurationMinutes: orderDuration,
      scheduledStartAt: scheduledStartAt ? new Date(scheduledStartAt).toISOString() : null,
      downtimeMinutes: isDowntime ? (downtimeMinutes || 30) : 0,
      reportedByUserId: defaultUserId,
    };

    const isOffline = typeof window !== "undefined" && syncManager ? !syncManager.isOnline : false;

    startTransition(async () => {
      // 1. OFFLINE-FALL: Direkt in Dexie IndexedDB speichern & in Dexie Outbox einreihen
      if (isOffline) {
        try {
          const offlineId = typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `off-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
          const orderNumber = `MO-OFF-${Math.floor(10000 + Math.random() * 90000)}`;
          const matchedEq = equipments.find((e) => e.id === orderEquip);

          if (localDb) {
            await localDb.orders.put({
              id: offlineId,
              tenantId,
              orderNumber,
              orderTypeId: "type-pm01",
              orderTypeCode: "PM01",
              currentStatusId: "stat-open",
              statusCode: "CREATED",
              statusName: "Erfasst (Offline)",
              priority: orderPrio,
              title: orderTitle,
              description: orderDesc,
              equipmentId: orderEquip || null,
              equipmentName: matchedEq ? matchedEq.name : null,
              equipmentNumber: matchedEq ? matchedEq.equipmentNumber : null,
              scheduledStartAt: payload.scheduledStartAt,
              actualDurationMinutes: null,
              syncStatus: "CREATED_OFFLINE",
              updatedAt: new Date().toISOString(),
            });

            await syncManager.enqueueMutation({
              tenantId,
              userId: defaultUserId,
              entityType: "ORDER",
              action: "CREATE",
              targetEntityId: offlineId,
              payload: {
                ...payload,
                orderNumber,
              },
            });
          }

          setCreatedOrderResult({
            id: offlineId,
            orderNumber,
            title: orderTitle,
            sapNotificationNr: "SAP-OFFLINE-PUFFER",
            isOfflineFallback: true,
          });
          toast.info(`Offline: Auftrag ${orderNumber} im lokalen Puffer gespeichert.`);
          return;
        } catch (offlineErr: any) {
          console.error("Fehler beim lokalen Dexie Offline-Puffern:", offlineErr);
        }
      }

      // 2. ONLINE-FALL: Server Action aufrufen
      try {
        const res = await createMaintenanceOrderAction(payload);
        if (res.success) {
          // Auch in lokale Dexie IndexedDB spiegeln für Offline-Verfügbarkeit
          if (typeof window !== "undefined" && localDb) {
            try {
              const matchedEq = equipments.find((e) => e.id === orderEquip);
              await localDb.orders.put({
                id: res.order.id,
                tenantId,
                orderNumber: res.order.orderNumber,
                orderTypeId: "type-pm01",
                orderTypeCode: "PM01",
                currentStatusId: "stat-open",
                statusCode: "CREATED",
                statusName: "Erfasst",
                priority: orderPrio,
                title: orderTitle,
                description: orderDesc,
                equipmentId: orderEquip || null,
                equipmentName: matchedEq ? matchedEq.name : null,
                equipmentNumber: matchedEq ? matchedEq.equipmentNumber : null,
                scheduledStartAt: payload.scheduledStartAt,
                actualDurationMinutes: null,
                syncStatus: res.isOfflineFallback ? "CREATED_OFFLINE" : "SYNCED",
                updatedAt: new Date().toISOString(),
              });
            } catch (dbErr) {
              console.warn("Dexie local cache warn:", dbErr);
            }
          }

          setCreatedOrderResult({
            id: res.order.id,
            orderNumber: res.order.orderNumber,
            title: res.order.title,
            sapNotificationNr: res.sapNotificationNr,
            isOfflineFallback: res.isOfflineFallback,
          });
          toast.success(`Auftrag ${res.order.orderNumber} erfolgreich erstellt!`);
        } else {
          toast.error("Auftrag konnte nicht erstellt werden.");
        }
      } catch (err: any) {
        // Resilienter Fallback: Wenn Online-Aufruf fehlschlägt, in Outbox puffern
        console.warn("Server action failed, buffering in Dexie Outbox:", err);
        toast.warning("Server-Fehler: Auftrag wurde im Offline-Puffer gesichert.");
        const offlineId = typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `off-${Date.now()}`;
        const orderNumber = `MO-OFF-${Math.floor(10000 + Math.random() * 90000)}`;
        const matchedEq = equipments.find((e) => e.id === orderEquip);

        if (localDb && syncManager) {
          await localDb.orders.put({
            id: offlineId,
            tenantId,
            orderNumber,
            orderTypeId: "type-pm01",
            orderTypeCode: "PM01",
            currentStatusId: "stat-open",
            statusCode: "CREATED",
            statusName: "Erfasst (Offline)",
            priority: orderPrio,
            title: orderTitle,
            description: orderDesc,
            equipmentId: orderEquip || null,
            equipmentName: matchedEq ? matchedEq.name : null,
            equipmentNumber: matchedEq ? matchedEq.equipmentNumber : null,
            scheduledStartAt: payload.scheduledStartAt,
            syncStatus: "CREATED_OFFLINE",
            updatedAt: new Date().toISOString(),
          });

          await syncManager.enqueueMutation({
            tenantId,
            userId: defaultUserId,
            entityType: "ORDER",
            action: "CREATE",
            targetEntityId: offlineId,
            payload: {
              ...payload,
              orderNumber,
            },
          });
        }

        setCreatedOrderResult({
          id: offlineId,
          orderNumber,
          title: orderTitle,
          sapNotificationNr: "SAP-OFFLINE-PUFFER",
          isOfflineFallback: true,
        });
      }
    });
  };

  // Erfolgs-Ansicht
  if (createdOrderResult) {
    return (
      <Card className="max-w-3xl mx-auto p-8 bg-slate-900 border-slate-800 text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="w-16 h-16 rounded-full bg-emerald-950/80 border border-emerald-500/50 text-emerald-400 mx-auto flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        <div className="space-y-2">
          <Badge variant="success" className="px-3 py-1 text-sm font-semibold">
            {createdOrderResult.isOfflineFallback ? "Offline im Puffer angelegt" : "Erfolgreich im Leitstand erfasst"}
          </Badge>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            Störungsauftrag {createdOrderResult.orderNumber} angelegt
          </h2>
          <p className="text-slate-400 max-w-lg mx-auto text-sm">
            „{createdOrderResult.title}“ wurde angelegt und für die Disposition im Planungsboard bereitgestellt.
          </p>
        </div>

        <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 max-w-md mx-auto text-left text-xs space-y-2">
          <div className="flex justify-between items-center text-slate-400">
            <span>Auftragsnummer:</span>
            <span className="font-mono text-white font-medium">{createdOrderResult.orderNumber}</span>
          </div>
          {createdOrderResult.sapNotificationNr && (
            <div className="flex justify-between items-center text-slate-400">
              <span>SAP PM Meldungs-Nr.:</span>
              <span className="font-mono text-cyan-400 font-medium">{createdOrderResult.sapNotificationNr}</span>
            </div>
          )}
          <div className="flex justify-between items-center text-slate-400">
            <span>Status:</span>
            <Badge variant="secondary">OFFEN (Neu gemeldet)</Badge>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
          <Button
            variant="default"
            className="w-full sm:w-auto bg-cyan-600 hover:bg-cyan-500 flex items-center gap-2"
            onClick={() => router.push("/orders")}
          >
            <FileText className="w-4 h-4" />
            Zur Auftragsliste
          </Button>

          <Button
            variant="outline"
            className="w-full sm:w-auto flex items-center gap-2 border-slate-700"
            onClick={() => router.push("/planning")}
          >
            <Calendar className="w-4 h-4" />
            Zum Planungsboard
          </Button>

          <Button
            variant="ghost"
            className="w-full sm:w-auto text-slate-400 hover:text-white"
            onClick={() => {
              setCreatedOrderResult(null);
              setParsedDraft(null);
              setPromptText("");
              setTitle("");
              setDescription("");
            }}
          >
            Weitere Störung erfassen
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Modus-Umschalter Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab("ai_prompt")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === "ai_prompt"
                ? "bg-cyan-600 text-white shadow"
                : "text-slate-400 hover:text-white hover:bg-slate-800/60"
            }`}
          >
            <Sparkles className="w-4 h-4 text-cyan-300" />
            🤖 KI-Prompt-Modus
            <Badge variant="secondary" className="ml-1 text-[10px] bg-cyan-950/80 text-cyan-300 border-none">
              Empfohlen
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("manual")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === "manual"
                ? "bg-slate-800 text-white shadow"
                : "text-slate-400 hover:text-white hover:bg-slate-800/60"
            }`}
          >
            <FileText className="w-4 h-4 text-slate-300" />
            📝 Manuelles Formular
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Offline-First & SAP PM Sync aktiv</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. KI-PROMPT MODUS                                                        */}
      {/* ========================================================================= */}
      {activeTab === "ai_prompt" && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Eingabebereich für Prompt */}
          <Card className="p-6 bg-slate-900 border-slate-800 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-cyan-400" />
                  Störungsmeldung in natürlicher Sprache eingeben
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Beschreibe das Problem wie im Funkspruch oder Diktiermikrofon. Die KI strukturiert den Auftrag und fragt bei fehlenden Angaben nach.
                </p>
              </div>
              <Badge variant="outline" className="border-cyan-800 text-cyan-400 text-xs">
                Sprach- & Freitext-Assistent
              </Badge>
            </div>

            {/* Prompt Textarea */}
            <div className="relative">
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="z.B. Kreiselpumpe KSB in Halle 2 verliert massiv Druck, Motorblock ist heiß und vibriert. Linie steht still!"
                className="w-full h-32 px-4 py-3 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none font-sans"
              />
              <div className="absolute right-3 bottom-3 flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-slate-400 hover:text-slate-200 h-8 px-2 text-xs flex items-center gap-1.5"
                  title="Spracheingabe / Diktierfunktion (simuliert)"
                  onClick={() => {
                    setPromptText("Hydraulikaggregat der Presse P-04 verliert Öl am Hochdruckschlauch, Druckanzeige pulsiert stark.");
                  }}
                >
                  <Mic className="w-3.5 h-3.5 text-cyan-400" />
                  Diktieren
                </Button>
              </div>
            </div>

            {/* Vorlagen / Quick-Pills */}
            <div className="space-y-2">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                Beispiel-Störungen zum Testen:
              </span>
              <div className="flex flex-wrap gap-2">
                {samplePrompts.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPromptText(s.text)}
                    className="text-xs bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/80 text-slate-300 px-3 py-1.5 rounded-md transition-all text-left flex items-center gap-1.5"
                  >
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Live-Copilot Status & Dubletten-Hinweis im Prompt-Modus */}
            {copilotLoading && (
              <div className="flex items-center gap-2 text-xs text-cyan-400 bg-cyan-950/20 border border-cyan-900/40 p-2.5 rounded-lg animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Copilot prüft live historische Seed-Altmaßnahmen (pgvector) & offene Aufträge...</span>
              </div>
            )}

            {copilotResult?.duplicateWarning?.isDuplicateDetected && (
              <div className="p-3 bg-amber-950/40 border border-amber-800/80 rounded-lg space-y-1.5 text-amber-200 text-xs">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <span>Mögliches Störungsduplikat erkannt!</span>
                  {copilotResult.duplicateWarning.existingOrderNumber && (
                    <Badge variant="warning" className="text-[10px] ml-auto">
                      Offen: {copilotResult.duplicateWarning.existingOrderNumber}
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-slate-300">
                  {copilotResult.duplicateWarning.explanation}
                </p>
              </div>
            )}

            {/* Live gefundene historische Lösungen aus 30 Seed-Altmaßnahmen */}
            {copilotResult?.suggestedSolutions && copilotResult.suggestedSolutions.length > 0 && (
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    Live-Lösungsvorschläge aus Seed-Altmaßnahmen (pgvector):
                  </span>
                  <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-400">
                    {copilotResult.suggestedSolutions.length} Treffer
                  </Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
                  {copilotResult.suggestedSolutions.slice(0, 2).map((sol, idx) => (
                    <div key={idx} className="p-2.5 bg-slate-900/80 border border-slate-800 rounded space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-cyan-300 truncate max-w-[200px]">{sol.title}</span>
                        <span className="text-[10px] text-emerald-400 font-mono">{sol.confidencePercent}% Match</span>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-2">
                        <strong className="text-slate-300">Lösung:</strong> {sol.solution}
                      </p>
                      {sol.recommendedSpareParts?.length > 0 && (
                        <p className="text-[10px] text-slate-500 truncate">
                          Teile: {sol.recommendedSpareParts.map((p) => `${p.quantity}x ${p.name}`).join(", ")}
                        </p>
                      )}
                      <div className="pt-1 flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleApplySolution(sol)}
                          className="h-6 text-[10px] px-2 text-cyan-400 hover:text-cyan-300 hover:bg-slate-800"
                        >
                          Als Maßnahme übernehmen
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Live gefundener Dokumentations-Entwurf (DIN / Schadenscode) */}
            {copilotResult?.documentationDraft && (
              <div className="p-3.5 bg-slate-950 border border-cyan-900/50 rounded-lg space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-cyan-400" />
                    Normgerechter Dokumentations-Vorschlag (DIN / Schadenscode):
                  </span>
                  <Badge
                    variant={copilotResult.documentationDraft.recommendedPriority === "1_EMERGENCY" ? "destructive" : "secondary"}
                    className="text-[10px]"
                  >
                    Prio: {copilotResult.documentationDraft.recommendedPriority}
                  </Badge>
                </div>

                <div className="bg-slate-900/90 p-2.5 rounded border border-slate-800 space-y-1.5">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Titel-Entwurf:</span>
                    <p className="text-white font-medium">{copilotResult.documentationDraft.refinedTitle}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Technische Beschreibung:</span>
                    <p className="text-slate-300 text-[11px]">{copilotResult.documentationDraft.technicalDescription}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-400">
                    <span>
                      Schadensgruppe: <strong className="text-slate-200">{copilotResult.documentationDraft.likelyDamageGroup}</strong>
                    </span>
                    <span>
                      Checklisten-Hinweis: <strong className="text-cyan-300">{copilotResult.documentationDraft.initialChecklistHint}</strong>
                    </span>
                  </div>
                </div>

                <div className="pt-1 flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleApplyDocumentationDraft(copilotResult.documentationDraft)}
                    className="h-6 text-[10px] px-2.5 border-cyan-800/80 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/60 flex items-center gap-1"
                  >
                    <Check className="w-3 h-3 text-cyan-400" />
                    Dokumentations-Entwurf übernehmen
                  </Button>
                </div>
              </div>
            )}

            {/* Aktions-Button */}
            <div className="pt-2 flex justify-end">
              <Button
                type="button"
                onClick={handleAnalyzePrompt}
                disabled={!promptText.trim() || isPending}
                className="bg-cyan-600 hover:bg-cyan-500 text-white font-medium flex items-center gap-2 px-5 py-2.5"
              >
                {isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Analysiere Störung mit KI...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Prompt analysieren & Störung aufbereiten
                  </>
                )}
              </Button>
            </div>
          </Card>

          {/* ========================================================================= */}
          {/* ERGEBNIS DER KI-ANALYSE & INTERAKTIVE RÜCKFRAGEN                          */}
          {/* ========================================================================= */}
          {parsedDraft && (
            <div className="space-y-6 animate-in slide-in-from-bottom-3 duration-200">
              {/* KI-Kommentar */}
              <div className="p-4 bg-cyan-950/40 border border-cyan-800/60 rounded-lg flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-cyan-200">KI-Ergebnis & Analyse</p>
                  <p className="text-slate-300">{parsedDraft.aiCommentary}</p>
                </div>
              </div>

              {/* INTERAKTIVE RÜCKFRAGEN FÜR FEHLENDE FELDER */}
              {parsedDraft.missingFields && parsedDraft.missingFields.length > 0 && (
                <Card className="p-5 bg-amber-950/30 border border-amber-800/60 space-y-4">
                  <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
                    <HelpCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                    <span>Rückfragen der KI für vollständige Erfassung:</span>
                  </div>

                  <div className="space-y-3">
                    {parsedDraft.missingFields.map((mf, idx) => {
                      const isAnswered = Boolean(answeredQuestions[mf.fieldName]);

                      return (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg border text-xs space-y-2 transition-all ${
                            isAnswered
                              ? "bg-slate-900/60 border-slate-800 opacity-80"
                              : "bg-slate-950/80 border-amber-900/50"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-amber-200 flex items-center gap-1.5">
                              {isAnswered && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                              {mf.question}
                            </span>
                            {isAnswered && (
                              <Badge variant="success" className="text-[10px]">
                                Beantwortet: {answeredQuestions[mf.fieldName]}
                              </Badge>
                            )}
                          </div>

                          {!isAnswered && (
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              {/* Spezifische Schnellantwort-Buttons je nach Feld */}
                              {mf.fieldName === "equipment" && (
                                <>
                                  {availableEquipments.slice(0, 4).map((eq) => (
                                    <button
                                      key={eq.id}
                                      type="button"
                                      onClick={() =>
                                        handleAnswerQuestion("equipment", eq.name, {
                                          matchedEquipmentId: eq.id,
                                        })
                                      }
                                      className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded text-slate-200 transition-colors"
                                    >
                                      {eq.name} ({eq.equipmentNumber})
                                    </button>
                                  ))}
                                </>
                              )}

                              {mf.fieldName === "priority" && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleAnswerQuestion("priority", "1_EMERGENCY (Havarie)", {
                                        priority: "1_EMERGENCY",
                                      })
                                    }
                                    className="px-2.5 py-1 bg-rose-950/70 hover:bg-red-900/80 border border-rose-800 text-red-200 rounded"
                                  >
                                    🚨 Sofort / Havarie (Stillstand)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleAnswerQuestion("priority", "2_HIGH (Dringend)", {
                                        priority: "2_HIGH",
                                      })
                                    }
                                    className="px-2.5 py-1 bg-amber-950/70 hover:bg-amber-900/80 border border-amber-800 text-amber-200 rounded"
                                  >
                                    ⚠️ Innerhalb 4 Stunden
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleAnswerQuestion("priority", "3_MEDIUM (Normal)", {
                                        priority: "3_MEDIUM",
                                      })
                                    }
                                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded"
                                  >
                                    🕒 Normal (nächste Schicht)
                                  </button>
                                </>
                              )}

                              {mf.fieldName === "downtime" && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsDowntime(true);
                                      setDowntimeMinutes(60);
                                      handleAnswerQuestion("downtime", "Ja, Linie steht still", {});
                                    }}
                                    className="px-2.5 py-1 bg-rose-950/70 hover:bg-red-900/80 border border-rose-800 text-red-200 rounded"
                                  >
                                    Ja, Linie steht still
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsDowntime(false);
                                      setDowntimeMinutes(0);
                                      handleAnswerQuestion("downtime", "Nein, gedrosselter Betrieb", {});
                                    }}
                                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded"
                                  >
                                    Nein, gedrosselter Weiterbetrieb
                                  </button>
                                </>
                              )}

                              {mf.fieldName === "symptoms" && (
                                <div className="flex items-center gap-2 w-full">
                                  <Input
                                    placeholder="Zusätzliche Symptome ergänzen..."
                                    className="h-7 text-xs bg-slate-900 border-slate-700 text-white"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        const val = (e.target as HTMLInputElement).value;
                                        if (val) {
                                          handleAnswerQuestion("symptoms", val, {
                                            description: `${parsedDraft.description}\n\nZusätzliche Beobachtungen: ${val}`,
                                          });
                                        }
                                      }
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {/* STRUKTURIERTER ENTWURF */}
              <Card className="p-6 bg-slate-900 border-slate-800 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400" />
                    Generierter Störungsauftrag
                  </h3>

                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        parsedDraft.priority === "1_EMERGENCY"
                          ? "destructive"
                          : parsedDraft.priority === "2_HIGH"
                          ? "warning"
                          : "secondary"
                      }
                    >
                      Prio: {parsedDraft.priority}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1">Auftragstitel:</label>
                    <input
                      type="text"
                      value={parsedDraft.title}
                      onChange={(e) => {
                        const val = e.target.value;
                        setParsedDraft({ ...parsedDraft, title: val });
                        setTitle(val);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-white font-medium focus:ring-1 focus:ring-cyan-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Zugeordnetes Equipment:</label>
                    <select
                      value={parsedDraft.matchedEquipmentId || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setParsedDraft({ ...parsedDraft, matchedEquipmentId: val });
                        setSelectedEquipmentId(val);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-white focus:ring-1 focus:ring-cyan-500 outline-none"
                    >
                      <option value="">-- Kein Equipment zugeordnet --</option>
                      {availableEquipments.map((eq) => (
                        <option key={eq.id} value={eq.id}>
                          {eq.name} ({eq.equipmentNumber})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-slate-400 block mb-1">Technische Beschreibung & Symptome:</label>
                    <textarea
                      value={parsedDraft.description}
                      onChange={(e) => {
                        const val = e.target.value;
                        setParsedDraft({ ...parsedDraft, description: val });
                        setDescription(val);
                      }}
                      className="w-full h-24 bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white focus:ring-1 focus:ring-cyan-500 outline-none resize-none font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Geplante Dauer (Minuten):</label>
                    <input
                      type="number"
                      value={parsedDraft.plannedDurationMinutes || 60}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 60;
                        setParsedDraft({ ...parsedDraft, plannedDurationMinutes: val });
                        setPlannedDurationMinutes(val);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-white focus:ring-1 focus:ring-cyan-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Schadenscode (SAP FEGRP/FECOD):</label>
                    <input
                      type="text"
                      value={parsedDraft.damageCode || "MECH_LAGER"}
                      onChange={(e) => {
                        const val = e.target.value;
                        setParsedDraft({ ...parsedDraft, damageCode: val });
                        setDamageCode(val);
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-white focus:ring-1 focus:ring-cyan-500 outline-none uppercase font-mono"
                    />
                  </div>
                </div>

                {/* Footer Aktions-Buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-800">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleTransferToManual}
                    className="text-slate-400 hover:text-white flex items-center gap-1.5 text-xs"
                  >
                    Im manuellen Formular anpassen
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>

                  <Button
                    type="button"
                    onClick={() => handleSubmitOrder()}
                    disabled={isPending}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-2 px-6"
                  >
                    {isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Erstelle Störungsauftrag...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Störungsauftrag jetzt anlegen
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. MANUELLES FORMULAR MIT ECHTZEIT-COPILOT                                */}
      {/* ========================================================================= */}
      {activeTab === "manual" && (
        <form onSubmit={handleSubmitOrder} className="space-y-6 animate-in fade-in duration-150">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Linke Spalte: Haupt-Formularfelder (2 Cols) */}
            <div className="lg:col-span-2 space-y-5">
              <Card className="p-6 bg-slate-900 border-slate-800 space-y-4">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-cyan-400" />
                  Stammdaten der Störung
                </h3>

                {/* Titel */}
                <div className="space-y-1.5">
                  <Label htmlFor="order-title" className="text-xs text-slate-300">
                    Störungstitel / Kurztext *
                  </Label>
                  <Input
                    id="order-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="z.B. Lagerschaden Antriebsmotor M-102"
                    required
                    className="bg-slate-950 border-slate-800 text-white text-sm"
                  />
                </div>

                {/* Auftragsart & Priorität */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-300">Auftragsart *</Label>
                    <select
                      value={orderTypeId}
                      onChange={(e) => setOrderTypeId(e.target.value)}
                      required
                      className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 font-medium"
                    >
                      {ORDER_TYPES.map((ot) => (
                        <option key={ot.code} value={ot.code}>
                          {ot.icon} {ot.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-300">Priorität</Label>
                    <select
                      value={priority}
                      onChange={(e) =>
                        setPriority(e.target.value as "1_EMERGENCY" | "2_HIGH" | "3_MEDIUM" | "4_LOW")
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 font-medium"
                    >
                      <option value="1_EMERGENCY">🚨 1_EMERGENCY (Stillstand / Havarie)</option>
                      <option value="2_HIGH">⚠️ 2_HIGH (Dringend)</option>
                      <option value="3_MEDIUM">🕒 3_MEDIUM (Normal)</option>
                      <option value="4_LOW">☕ 4_LOW (Gering / Geplant)</option>
                    </select>
                  </div>
                </div>

                {/* Kombinierte Equipment-Schnellsuche + Ausklappbarer Hierarchie-Baum */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-slate-300">Betroffene Anlage / Equipment</Label>
                    <button
                      type="button"
                      onClick={() => setIsTreeExpanded(!isTreeExpanded)}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>{isTreeExpanded ? "Baum zuklappen" : "Hierarchie-Baum ausklappen"}</span>
                    </button>
                  </div>

                  {selectedEquipmentId ? (
                    <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-600/80 flex items-center justify-between animate-in fade-in">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                        <div className="truncate">
                          <span className="font-semibold text-xs text-white block truncate">
                            {availableEquipments.find((e) => e.id === selectedEquipmentId)?.name || "Ausgewähltes Equipment"}
                          </span>
                          <span className="font-mono text-[10px] text-cyan-300">
                            {availableEquipments.find((e) => e.id === selectedEquipmentId)?.equipmentNumber}
                          </span>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedEquipmentId("")}
                        className="h-7 text-xs text-slate-400 hover:text-white"
                      >
                        Ändern / Entfernen
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                        <Input
                          value={equipmentSearchQuery}
                          onChange={(e) => setEquipmentSearchQuery(e.target.value)}
                          placeholder="Schnellsuche (z.B. Pumpe, Siemens, EQ-10042)..."
                          className="pl-8 h-8 text-xs bg-slate-950 border-slate-800 text-white"
                        />
                      </div>

                      {(isTreeExpanded || equipmentSearchQuery.trim()) && (
                        <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 max-h-56 overflow-y-auto space-y-1 animate-in fade-in">
                          {availableEquipments
                            .filter((eq) => {
                              const q = equipmentSearchQuery.toLowerCase();
                              return (
                                !q ||
                                eq.name.toLowerCase().includes(q) ||
                                eq.equipmentNumber.toLowerCase().includes(q) ||
                                (eq.plantSection && eq.plantSection.toLowerCase().includes(q))
                              );
                            })
                            .map((eq) => (
                              <div
                                key={eq.id}
                                onClick={() => {
                                  setSelectedEquipmentId(eq.id);
                                  setEquipmentSearchQuery("");
                                  setIsTreeExpanded(false);
                                }}
                                className="flex items-center justify-between p-2 rounded hover:bg-slate-900 cursor-pointer text-xs border border-transparent hover:border-slate-700 transition-colors"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <Cpu className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                  <span className="font-medium text-white truncate">{eq.name}</span>
                                  <span className="font-mono text-[10px] text-slate-400 shrink-0">
                                    ({eq.equipmentNumber})
                                  </span>
                                </div>
                                {eq.plantSection && (
                                  <Badge variant="outline" className="text-[9px] border-slate-800 text-slate-400 shrink-0">
                                    {eq.plantSection}
                                  </Badge>
                                )}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Beschreibung */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-slate-300">Ausführliche Störungsbeschreibung & Symptome</Label>
                    <button
                      type="button"
                      onClick={handleRunCopilot}
                      className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      KI-Duplikat- & Lösungscheck
                    </button>
                  </div>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Was genau ist passiert? Welche Geräusche, Leckagen oder Fehlermeldungen auf der HMI liegen vor?"
                    rows={4}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none font-sans"
                  />
                </div>

                {/* Schadenscode-Katalog, Geplante Dauer & Geplanter Start */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-300">Schadenscode (Katalog) *</Label>
                    <select
                      value={damageCode}
                      onChange={(e) => setDamageCode(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-md px-3 py-2 text-white text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      {DAMAGE_CODE_CATALOG.map((cat) => (
                        <optgroup key={cat.category} label={cat.category}>
                          {cat.codes.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-300">Geplante Dauer (Minuten) *</Label>
                    <Input
                      type="number"
                      value={plannedDurationMinutes}
                      onChange={(e) => setPlannedDurationMinutes(parseInt(e.target.value) || 60)}
                      className="bg-slate-950 border-slate-800 text-white text-sm font-mono"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-300">Geplanter Start (optional)</Label>
                    <Input
                      type="datetime-local"
                      value={scheduledStartAt}
                      onChange={(e) => setScheduledStartAt(e.target.value)}
                      className="bg-slate-950 border-slate-800 text-white text-xs"
                    />
                  </div>
                </div>

                {/* Produktionsstillstand Toggle */}
                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flame className={`w-4 h-4 ${isDowntime ? "text-rose-400" : "text-slate-500"}`} />
                    <span className="text-xs text-slate-200 font-medium">Verursacht die Störung einen Produktionsstillstand?</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isDowntime}
                        onChange={(e) => setIsDowntime(e.target.checked)}
                        className="rounded border-slate-700 text-blue-600 focus:ring-cyan-500"
                      />
                      <span>Ja, Stillstand</span>
                    </label>
                    {isDowntime && (
                      <Input
                        type="number"
                        placeholder="Minuten"
                        value={downtimeMinutes}
                        onChange={(e) => setDowntimeMinutes(parseInt(e.target.value) || 0)}
                        className="w-20 h-7 text-xs bg-slate-900 border-slate-700 text-white"
                      />
                    )}
                  </div>
                </div>
              </Card>

              {/* Absende-Button */}
              <div className="flex justify-end gap-3">
                <Button
                  type="submit"
                  disabled={isPending || !title.trim()}
                  className="min-h-[44px] bg-cyan-600 hover:bg-cyan-500 text-white font-medium flex items-center gap-2 px-6 py-2.5 shadow-md shadow-cyan-600/20"
                >
                  {isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Speichere Störungsauftrag...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Störungsauftrag verbindlich anlegen
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Rechte Spalte: KI-Copilot Sidebar (RAG, Duplikate & Ersatzteile) */}
            <div className="space-y-4">
              <Card className="p-5 bg-slate-900 border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    MaintAI Copilot
                  </h4>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleRunCopilot}
                    disabled={copilotLoading || (!title && !description)}
                    className="text-xs h-11 min-h-[44px] px-3 border-slate-700"
                  >
                    {copilotLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : "Analysieren"}
                  </Button>
                </div>

                {!copilotResult && !copilotLoading && (
                  <p className="text-xs text-slate-400">
                    Fülle Titel oder Beschreibung aus und klicke auf „Analysieren“, um Duplikate und historische Reparatur-Lösungen aus der Wissensbasis abzurufen.
                  </p>
                )}

                {copilotLoading && (
                  <div className="p-4 text-center text-xs text-slate-400 space-y-2">
                    <RefreshCw className="w-5 h-5 animate-spin text-cyan-400 mx-auto" />
                    <p>Prüfe historische Störungsdatenbank & Vektor-Embeddings...</p>
                  </div>
                )}

                {copilotResult && (
                  <div className="space-y-4 text-xs animate-in fade-in">
                    {/* Duplikat-Warnung */}
                    {copilotResult.duplicateWarning?.isDuplicateDetected && (
                      <div className="p-3 bg-amber-950/40 border border-amber-800/80 rounded-lg space-y-1.5 text-amber-200">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                          <span>Mögliches Störungsduplikat!</span>
                        </div>
                        <p className="text-[11px] text-slate-300">
                          {copilotResult.duplicateWarning.explanation}
                        </p>
                        {copilotResult.duplicateWarning.existingOrderNumber && (
                          <Badge variant="warning" className="text-[10px]">
                            Offener Auftrag: {copilotResult.duplicateWarning.existingOrderNumber}
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* Lösungsvorschläge & Ersatzteile */}
                    {copilotResult.suggestedSolutions && copilotResult.suggestedSolutions.length > 0 && (
                      <div className="space-y-2">
                        <span className="font-semibold text-slate-200 block">
                          Ähnliche behobene Fälle & Ersatzteile:
                        </span>
                        {copilotResult.suggestedSolutions.map((sol, sIdx) => (
                          <div
                            key={sIdx}
                            className="p-3 bg-slate-950 border border-slate-800 rounded-md space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-cyan-300">{sol.title}</span>
                              <span className="text-[10px] text-emerald-400 font-mono">
                                {sol.confidencePercent}% Match
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400">
                              <strong className="text-slate-300">Ursache:</strong> {sol.cause}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              <strong className="text-slate-300">Lösung:</strong> {sol.solution}
                            </p>

                            {sol.recommendedSpareParts && sol.recommendedSpareParts.length > 0 && (
                              <div className="pt-1 border-t border-slate-800">
                                <span className="text-[10px] text-slate-400 block mb-1">
                                  Benötigte Ersatzteile:
                                </span>
                                <div className="space-y-1">
                                  {sol.recommendedSpareParts.map((sp, spIdx) => (
                                    <div
                                      key={spIdx}
                                      className="flex items-center justify-between text-[11px] bg-slate-900 px-2 py-0.5 rounded text-slate-300"
                                    >
                                      <span>{sp.name}</span>
                                      <span className="text-slate-500 font-mono">
                                        {sp.quantity}x ({sp.partNumber})
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="pt-2 flex justify-end">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleApplySolution(sol)}
                                className="h-6 text-[10px] px-2.5 border-cyan-800/80 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/60 flex items-center gap-1"
                              >
                                <Check className="w-3 h-3 text-cyan-400" />
                                Als Maßnahme & Teile übernehmen
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Dokumentations-Vorschlag (DIN / Schadenscode) */}
                    {copilotResult.documentationDraft && (
                      <div className="p-3 bg-slate-950 border border-cyan-900/40 rounded-md space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-cyan-300 flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-cyan-400" />
                            Dokumentations-Vorschlag:
                          </span>
                          <Badge
                            variant={copilotResult.documentationDraft.recommendedPriority === "1_EMERGENCY" ? "destructive" : "secondary"}
                            className="text-[10px]"
                          >
                            Prio: {copilotResult.documentationDraft.recommendedPriority}
                          </Badge>
                        </div>

                        <div className="bg-slate-900 p-2 rounded text-[11px] space-y-1 text-slate-300">
                          <p><strong className="text-white">Titel:</strong> {copilotResult.documentationDraft.refinedTitle}</p>
                          <p className="text-slate-400 line-clamp-2">{copilotResult.documentationDraft.technicalDescription}</p>
                          <p className="text-[10px] text-slate-500">
                            Schaden: {copilotResult.documentationDraft.likelyDamageGroup} • Hinweis: {copilotResult.documentationDraft.initialChecklistHint}
                          </p>
                        </div>

                        <div className="pt-1 flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleApplyDocumentationDraft(copilotResult.documentationDraft)}
                            className="h-6 text-[10px] px-2.5 border-cyan-800/80 bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/60 flex items-center gap-1"
                          >
                            <Check className="w-3 h-3 text-cyan-400" />
                            Vorschlag übernehmen
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
