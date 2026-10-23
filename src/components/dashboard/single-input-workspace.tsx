"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Mic,
  MicOff,
  Send,
  Camera,
  AlertTriangle,
  CheckCircle2,
  Clock,
  X,
  Loader2,
  Flame,
  Wrench,
  Check,
  Table as TableIcon,
  BarChart2,
  Lightbulb,
  Cpu,
  Trash2,
  ExternalLink,
  Search,
  Sparkles,
  Star,
  RefreshCw,
  Maximize2,
  Calendar,
  Download,
  ChevronDown,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell,
} from "recharts";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { useWorkspace } from "@/components/layout/workspace-context";
import { createSavedView } from "@/actions/saved-view-actions";
import { useInterval } from "@/hooks/use-interval";
import {
  exportChartToPng,
  exportChartToPdf,
  exportTableToCsv,
  exportTableToExcel,
} from "@/lib/export-utils";
import {
  queryOrdersAction,
  OrderWithRelations,
  QueryOrdersFilters,
  createMaintenanceOrderAction,
} from "@/actions/order-actions";
import {
  classifyCopilotInputAction,
  executeSingleInputCopilotAction,
} from "@/actions/copilot-actions";
import {
  CopilotChatMessage,
  ClarificationOption,
  OrderPriority,
  FALLBACK_EQUIPMENTS,
  ChartViewWidgetPayload,
} from "@/lib/ai/copilot";
import { OrderDetailsModal } from "@/components/orders/order-details-modal";
import { DAMAGE_CODE_CATALOG } from "@/components/orders/create-order-form";

// ============================================================================
// 1. CHAT DATENMODELL & TYPEN
// ============================================================================

export type ChatMessageType =
  | "text"
  | "clarification"
  | "order_draft"
  | "order_created"
  | "table_view"
  | "chart_view";

export type ChatMessage = {
  id: string;
  sender: "user" | "assistant";
  timestamp: Date;
  text?: string;
  type: ChatMessageType;
  payload?: any;
};

export interface SingleInputWorkspaceProps {
  initialOrders?: OrderWithRelations[];
  initialEquipments?: Array<{
    id: string;
    name: string;
    equipmentNumber: string;
    criticality?: string;
    description?: string;
  }>;
  tenantId?: string;
}

// Fallback & Standard Equipments
const DEFAULT_WORKSPACE_EQUIPMENTS = [
  { id: "eq-kuka-kr210", name: "KUKA KR-210", equipmentNumber: "FL-H1-01", description: "Rohbau Zelle 1" },
  { id: "eq-kuka-kr16", name: "KUKA KR-16", equipmentNumber: "FL-H1-04", description: "Montage Zelle 4" },
  { id: "eq-10001001", name: "KUKA KR 210 R2700", equipmentNumber: "EQ-10001001", description: "Rohbau Zelle 3" },
  { id: "eq-10001002", name: "Siemens Simotics S-1FK7", equipmentNumber: "EQ-10001002", description: "Antrieb Achse 2" },
  { id: "eq-10001003", name: "Grundfos CR 45-3 Pumpe", equipmentNumber: "EQ-10001003", description: "Kühlwasser Pumpe P-102" },
  { id: "eq-10001004", name: "Atlas Copco GA 37 VSD+", equipmentNumber: "EQ-10001004", description: "Druckluftkompressor" },
  { id: "eq-10001005", name: "Kreiselpumpe KSB Etanorm", equipmentNumber: "EQ-10001005", description: "Kühlschmierstoff-Kreislauf" },
];

// Ergänzter Schadenscode-Katalog inklusive MECH_TEMP
const DAMAGE_CODE_OPTIONS = [
  { code: "MECH_TEMP", label: "MECH_TEMP - Thermische Überlastung / Heißlauf" },
  { code: "MECH_LAGER", label: "MECH_LAGER - Wälzlager- / Gleitlagerschaden" },
  { code: "MECH_VERSCHLEISS", label: "MECH_VERSCHLEISS - Mechanischer Verschleiß / Spiel" },
  { code: "MECH_BRUCH", label: "MECH_BRUCH - Wellen- / Gestängebruch" },
  { code: "MECH_LECKAGE", label: "MECH_LECKAGE - Dichtungsversagen / Schmiermittelleck" },
  { code: "MECH_BLOCKADE", label: "MECH_BLOCKADE - Fremdkörperkollision / Blockade" },
  { code: "ELEC_OVERLOAD", label: "ELEC_OVERLOAD - Thermische Überlastung Elektrik" },
  { code: "ELEC_MOTOR", label: "ELEC_MOTOR - Wicklungsschluss / Motor defekt" },
  { code: "ELEC_FU", label: "ELEC_FU - Frequenzumrichter / Bus-Störung" },
  { code: "SENSOR_INIT", label: "SENSOR_INIT - Näherungsschalter dejustiert" },
  { code: "SENSOR_TEMP", label: "SENSOR_TEMP - PT100 / Thermoelement defekt" },
  { code: "HYDR_PRESSURE", label: "HYDR_PRESSURE - Druckabfall / Kavitation" },
  { code: "HYDR_LECK", label: "HYDR_LECK - Schlauchleckage / O-Ring defekt" },
  { code: "PNEU_VALVE", label: "PNEU_VALVE - Ventilinsel / Schieber klemmt" },
];

// Standard-Ausfalldaten für Halle 1 (Chart-Darstellung)
const HALLE_1_DOWNTIME_DATA = [
  {
    name: "KUKA KR-210",
    component: "Rohbau Zelle 1 • Antriebsmotor Achse 2",
    hours: 4.5,
    count: 3,
    priorityLabel: "Prio 1 / Hoch",
    fill: "#FCA5A5",
    stroke: "#EF4444",
  },
  {
    name: "KUKA KR-16",
    component: "Montage Zelle 4 • Greiferschnittstelle",
    hours: 2.8,
    count: 2,
    priorityLabel: "Prio 2 / Mittel",
    fill: "#FCD34D",
    stroke: "#F59E0B",
  },
  {
    name: "Schweißzange SZ-01",
    component: "Rohbau Zelle 1 • Elektrodenverschleiß",
    hours: 1.5,
    count: 1,
    priorityLabel: "Prio 3 / Niedrig",
    fill: "#93C5FD",
    stroke: "#3B82F6",
  },
  {
    name: "Rollenförderer RF-03",
    component: "Fördertechnik Halle 1 • Bandspanner",
    hours: 1.2,
    count: 1,
    priorityLabel: "Prio 3 / Niedrig",
    fill: "#86EFAC",
    stroke: "#22C55E",
  },
  {
    name: "Hubtisch HT-02",
    component: "Halle 1 Pufferplatz • Hydraulikzylinder",
    hours: 0.8,
    count: 1,
    priorityLabel: "Prio 4 / Niedrig",
    fill: "#CBD5E1",
    stroke: "#64748B",
  },
];

const DEFAULT_CHART_COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
  "#F97316",
];

function formatTime(date: Date | string | number): string {
  try {
    const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
    return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "10:14";
  }
}

// ============================================================================
// 2. HAUPTKOMPONENTE SINGLE INPUT WORKSPACE (CHAT)
// ============================================================================

export function SingleInputWorkspace({
  initialOrders = [],
  initialEquipments = [],
  tenantId = "demo-tenant-1000",
}: SingleInputWorkspaceProps) {
  const router = useRouter();
  const { activeView, workspaceResetToken, clearActiveView, addSavedView, currentUser } = useWorkspace();

  const firstName = useMemo(() => {
    if (currentUser?.userName) {
      return currentUser.userName.split(" ")[0];
    }
    return "Max";
  }, [currentUser?.userName]);

  // Chat-Verlauf State: Initial leer für Begrüßungs-Screen (Stufe 1)
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isChatActive, setIsChatActive] = useState<boolean>(false);
  const [prompt, setPrompt] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Favoriten- & Intervall-Modal State
  const [isFavoriteModalOpen, setIsFavoriteModalOpen] = useState(false);
  const [selectedChartForFavorite, setSelectedChartForFavorite] = useState<ChatMessage | null>(null);
  const [favoriteName, setFavoriteName] = useState("");
  const [favoriteInterval, setFavoriteInterval] = useState<number>(0);
  const [isSavingFavorite, setIsSavingFavorite] = useState(false);
  const isSavingFromExistingChartRef = useRef(false);

  // Auto-Refresh & Live Indikator
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  // Zoom- & Vollbild-Modal State
  const [isZoomModalOpen, setIsZoomModalOpen] = useState(false);
  const [selectedChartForZoomId, setSelectedChartForZoomId] = useState<string | null>(null);

  const selectedChartForZoom = useMemo(() => {
    if (!selectedChartForZoomId) return null;
    return messages.find((m) => m.id === selectedChartForZoomId) || null;
  }, [messages, selectedChartForZoomId]);

  const handleOpenZoomModal = (msg: ChatMessage) => {
    setSelectedChartForZoomId(msg.id);
    setIsZoomModalOpen(true);
  };

  const handleCloseZoomModal = () => {
    setIsZoomModalOpen(false);
    setSelectedChartForZoomId(null);
  };

  // Referenzen auf Chart-Container für PNG/PDF-Export
  const chartContainerRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Öffnet das Favoriten- & Intervall-Modal
  const handleOpenFavoriteModal = (msg: ChatMessage) => {
    setSelectedChartForFavorite(msg);
    const title = msg.payload?.title || "Ausfallstunden nach Anlage (Halle 1)";
    setFavoriteName(title);
    setFavoriteInterval(msg.payload?.refreshInterval ?? activeView?.refreshInterval ?? 0);
    setIsFavoriteModalOpen(true);
  };

  // Speichert den Favoriten und synchronisiert mit dem WorkspaceContext
  const handleSaveFavorite = async () => {
    if (!favoriteName.trim()) {
      toast.error("Bitte gib einen Namen für den Favoriten ein.");
      return;
    }

    setIsSavingFavorite(true);
    try {
      isSavingFromExistingChartRef.current = true;
      const targetPayload = selectedChartForFavorite?.payload || {};

      const saved = await createSavedView({
        name: favoriteName.trim(),
        intent: "ANALYTICS_CHART",
        refreshInterval: favoriteInterval,
        filterPayload: {
          title: favoriteName.trim(),
          chartData: targetPayload.chartData || HALLE_1_DOWNTIME_DATA,
          viewMode: "chart",
        },
        userId: currentUser?.userId,
        icon: "star",
      });

      const newView = saved.view || saved;

      // Im WorkspaceContext hinzufügen (aktualisiert sofort "MEINE FAVORITEN" in der Sidebar)
      addSavedView(newView);

      // Bestehende Chart-Nachricht im Chat synchronisieren
      if (selectedChartForFavorite) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === selectedChartForFavorite.id
              ? {
                  ...m,
                  payload: {
                    ...m.payload,
                    title: newView.name,
                    savedViewId: newView.id,
                    refreshInterval: newView.refreshInterval ?? 0,
                  },
                }
              : m
          )
        );
      }

      toast.success(`'${newView.name}' zu Favoriten hinzugefügt!`);
      setIsFavoriteModalOpen(false);
      setSelectedChartForFavorite(null);
    } catch (err: any) {
      console.error("Fehler beim Speichern des Favoriten:", err);
      toast.error(err?.message || "Fehler beim Speichern des Favoriten.");
    } finally {
      setIsSavingFavorite(false);
    }
  };

  // Live-Auto-Refresh Hook: Triggert Aktualisierung im eingestellten Sekundentakt
  const isFavoriteActive = Boolean(
    activeView &&
      activeView.intent === "ANALYTICS_CHART" &&
      (activeView.refreshInterval ?? 0) > 0
  );
  const activeIntervalSec = activeView?.refreshInterval ?? 0;

  const handleRefreshActiveChart = useCallback(() => {
    setIsRefreshing(true);
    setLastRefreshedAt(new Date());

    setMessages((prev) =>
      prev.map((m) => {
        if (m.type !== "chart_view") return m;
        const currentData = m.payload?.chartData || HALLE_1_DOWNTIME_DATA;
        const updatedData = currentData.map((item: any) => {
          const delta = Math.random() * 0.4 - 0.2;
          const hours = Math.max(0.2, Number((item.hours + delta).toFixed(1)));
          return {
            ...item,
            hours,
          };
        });

        return {
          ...m,
          payload: {
            ...m.payload,
            chartData: updatedData,
            lastRefreshedAt: new Date(),
          },
        };
      })
    );

    setTimeout(() => {
      setIsRefreshing(false);
    }, 700);
  }, []);

  useInterval(
    handleRefreshActiveChart,
    isFavoriteActive && activeIntervalSec > 0 ? activeIntervalSec * 1000 : null
  );

  // Foto-Upload State
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<{
    file: File;
    name: string;
    previewUrl: string;
  } | null>(null);

  // Spracherkennung State
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Scroll to bottom Anchor
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatScrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Order Details Modal
  const [selectedOrderIdForModal, setSelectedOrderIdForModal] = useState<string | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  // Verfügbare Equipments
  const availableEquipmentsList = useMemo(() => {
    if (initialEquipments && initialEquipments.length > 0) {
      // Wenn KUKA KR-210 und KUKA KR-16 noch nicht drin sind, ergänzen wir sie für reibungslose Demo
      const hasKr210 = initialEquipments.some((e) => e.name.includes("KR-210") || e.name.includes("KR 210"));
      if (!hasKr210) {
        return [...DEFAULT_WORKSPACE_EQUIPMENTS, ...initialEquipments];
      }
      return initialEquipments;
    }
    return DEFAULT_WORKSPACE_EQUIPMENTS;
  }, [initialEquipments]);

  // Automatischer Scroll zum Ende des Chatverlaufs
  const scrollToBottom = useCallback((smooth = true) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        behavior: smooth ? "smooth" : "auto",
        block: "end",
      });
    }
  }, []);

  useEffect(() => {
    scrollToBottom(true);
  }, [messages, isAnalyzing, scrollToBottom]);

  // Chatverlauf komplett leeren (Reset auf Begrüßungs-Screen)
  const handleClearChat = useCallback(() => {
    setMessages([]);
    setIsChatActive(false);
    setPrompt("");
    setSelectedPhoto(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    clearActiveView();
    toast.info("Verlauf geleert");
  }, [clearActiveView]);

  // Workspace-Reset Token überwachen (z. B. bei Klick auf das Logo "MaintAI")
  useEffect(() => {
    if (workspaceResetToken > 0) {
      setMessages([]);
      setIsChatActive(false);
      setPrompt("");
      setSelectedPhoto(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }, [workspaceResetToken]);

  // Sidebar-Favorit Klick synchronisieren
  useEffect(() => {
    if (activeView) {
      // Wenn gerade erst aus bestehendem Chart gespeichert wurde, nicht erneut als Nachricht anfügen
      if (isSavingFromExistingChartRef.current) {
        isSavingFromExistingChartRef.current = false;
        return;
      }

      setIsChatActive(true);
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        sender: "user",
        timestamp: new Date(),
        text: `Öffne Ansicht: ${activeView.name}`,
        type: "text",
      };

      if (activeView.intent === "ANALYTICS_CHART") {
        const payloadData = (activeView.filterPayload as any) || {};
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          sender: "assistant",
          timestamp: new Date(),
          text: `Hier ist die Diagrammansicht '${activeView.name}':`,
          type: "chart_view",
          payload: {
            chartData: payloadData.chartData || HALLE_1_DOWNTIME_DATA,
            orders: initialOrders,
            viewMode: "chart",
            title: activeView.name,
            savedViewId: activeView.id,
            refreshInterval: activeView.refreshInterval ?? 0,
          },
        };
        setMessages((prev) => [...prev, userMsg, assistantMsg]);
        return;
      }

      const filters: QueryOrdersFilters = (activeView.filterPayload as QueryOrdersFilters) || {};

      setIsAnalyzing(true);
      startTransition(async () => {
        try {
          const loaded = await queryOrdersAction(filters);
          const assistantMsg: ChatMessage = {
            id: crypto.randomUUID(),
            sender: "assistant",
            timestamp: new Date(),
            text: `Hier ist die Ansicht '${activeView.name}':`,
            type: "table_view",
            payload: {
              orders: loaded && loaded.length > 0 ? loaded : initialOrders,
              filters,
              title: activeView.name,
              viewMode: "table",
            },
          };
          setMessages((prev) => [...prev, userMsg, assistantMsg]);
        } catch {
          const assistantMsg: ChatMessage = {
            id: crypto.randomUUID(),
            sender: "assistant",
            timestamp: new Date(),
            text: `Hier ist die Ansicht '${activeView.name}':`,
            type: "table_view",
            payload: {
              orders: initialOrders,
              filters,
              title: activeView.name,
              viewMode: "table",
            },
          };
          setMessages((prev) => [...prev, userMsg, assistantMsg]);
        } finally {
          setIsAnalyzing(false);
        }
      });
    }
  }, [activeView, initialOrders]);

  // 3. Spracheingabe (Web Speech API)
  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error("Spracherkennung wird in diesem Browser leider nicht unterstützt.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "de-DE";
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setPrompt((prev) => (prev ? `${prev} ${transcript}` : transcript));
      };

      recognition.onerror = (event: any) => {
        console.warn("Speech recognition error:", event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error("Speech recognition startup error:", err);
      setIsListening(false);
    }
  };

  // 4. Foto-Upload Handler
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const previewUrl = URL.createObjectURL(file);
      setSelectedPhoto({ file, name: file.name, previewUrl });
    }
  };

  const handleRemovePhoto = () => {
    if (selectedPhoto?.previewUrl) {
      URL.revokeObjectURL(selectedPhoto.previewUrl);
    }
    setSelectedPhoto(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // 5. Absenden einer Anfrage (Eingabe / Chip-Klick / Klärung)
  const handleSubmitQuery = async (
    queryText?: string,
    optionId?: string,
    optionField?: "area" | "equipment" | "general"
  ) => {
    const textToSubmit = (queryText || prompt).trim();
    if (!textToSubmit && !selectedPhoto) return;

    // Wechsel in die Chat-Sicht (Stufe 2)
    setIsChatActive(true);

    const isSelection = Boolean(optionId);
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      sender: "user",
      timestamp: new Date(),
      text: isSelection ? `[Auswahl: ${textToSubmit}]` : textToSubmit || "[Foto hochgeladen]",
      type: "text",
      payload: {
        isSelection,
        optionId,
        optionField,
        photoUrl: selectedPhoto?.previewUrl,
      },
    };

    setMessages((prev) => [...prev, userMsg]);
    setPrompt("");
    setSelectedPhoto(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setIsAnalyzing(true);

    startTransition(async () => {
      try {
        // Chat-Historie für Intent-Erkennung aufbereiten
        const copilotHistory: CopilotChatMessage[] = messages
          .filter((m) => m.type === "text" || m.type === "clarification")
          .map((m) => ({
            role: m.sender === "user" ? ("user" as const) : ("assistant" as const),
            content: m.text || "",
            clarificationSelection: m.payload?.optionId
              ? {
                  id: m.payload.optionId,
                  value: m.text?.replace(/^\[Auswahl:\s*/, "").replace(/\]$/, "") || "",
                  field: m.payload.optionField || "equipment",
                }
              : undefined,
          }));

        copilotHistory.push({
          role: "user",
          content: textToSubmit,
          clarificationSelection:
            optionId && optionField
              ? { id: optionId, value: textToSubmit, field: optionField }
              : undefined,
        });

        // Intent-Klassifizierung
        const classification = await classifyCopilotInputAction({
          tenantId,
          prompt: textToSubmit,
          chatHistory: copilotHistory,
          selectedOptionId: optionId,
          clarificationSelection:
            optionId && optionField
              ? { id: optionId, value: textToSubmit, field: optionField }
              : undefined,
          availableEquipments: availableEquipmentsList.map((e) => ({
            id: e.id,
            name: e.name,
            equipmentNumber: e.equipmentNumber,
            description: (e as any).description,
          })),
        });

        const needsClarification = Boolean(
          classification.needsClarification || classification.clarification?.needed
        );

        // Fall 1: Rückfrage / Clarification Loop
        if (needsClarification) {
          const question =
            classification.clarificationQuestion ||
            classification.clarification?.question ||
            "Welcher Roboter ist betroffen? Bitte wähle das Equipment aus:";

          let options: ClarificationOption[] =
            classification.clarificationOptions ||
            classification.clarification?.options ||
            [];

          if (!options || options.length === 0) {
            options = [
              {
                id: "eq-kuka-kr210",
                label: "KUKA KR-210 (Rohbau Zelle 1)",
                value: "KUKA KR-210",
                field: "equipment",
                description: "Rohbau Zelle 1",
              },
              {
                id: "eq-kuka-kr16",
                label: "KUKA KR-16 (Montage Zelle 4)",
                value: "KUKA KR-16",
                field: "equipment",
                description: "Montage Zelle 4",
              },
            ];
          }

          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              sender: "assistant",
              timestamp: new Date(),
              text: question,
              type: "clarification",
              payload: { options },
            },
          ]);
          return;
        }

        const lowerPrompt = textToSubmit.toLowerCase();

        // Fall 3: Diagramm-Ansicht (ANALYTICS_CHART oder "als Diagramm" / Auswertung)
        const isChartQuery =
          classification.intent === "ANALYTICS_CHART" ||
          (optionField === "general" && !needsClarification) ||
          lowerPrompt.includes("diagramm") ||
          lowerPrompt.includes("chart") ||
          lowerPrompt.includes("ausfallzeit") ||
          lowerPrompt.includes("auswertung") ||
          lowerPrompt.includes("balken") ||
          lowerPrompt.includes("grafik") ||
          lowerPrompt.includes("kpi") ||
          lowerPrompt.includes("mttr") ||
          lowerPrompt.includes("mtbf");

        if (isChartQuery) {
          const copilotRes = await executeSingleInputCopilotAction({
            prompt: textToSubmit,
            tenantId,
            chatHistory: copilotHistory,
          });

          if (copilotRes.needsClarification) {
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                sender: "assistant",
                timestamp: new Date(),
                text:
                  copilotRes.clarificationQuestion ||
                  "Bitte wähle eine Option zur Auswertung:",
                type: "clarification",
                payload: {
                  options: copilotRes.clarificationOptions || [],
                },
              },
            ]);
            return;
          }

          const widget = (copilotRes.widget?.type === "chart_view"
            ? (copilotRes.widget as ChartViewWidgetPayload)
            : null) || {
            type: "chart_view" as const,
            title: copilotRes.title || copilotRes.analyticsResult?.title,
            chartType: (copilotRes.chartType || copilotRes.analyticsResult?.chartType || "bar") as any,
            chartData: copilotRes.chartData || copilotRes.analyticsResult?.data || [],
            data: copilotRes.chartData || copilotRes.analyticsResult?.data || [],
            xAxisKey: copilotRes.analyticsResult?.xAxisKey,
            series: copilotRes.analyticsResult?.series,
            summary: copilotRes.analyticsResult?.summaryInsight || copilotRes.classification?.explanation,
            rawSql: copilotRes.analyticsResult?.rawSqlUsed,
            config: {},
          };

          const rawData = widget.data || (widget as any).chartData || [];
          const xAxisKey = widget.xAxisKey || Object.keys(rawData[0] || {})[0] || "name";
          const series = widget.series || [{ key: "value", label: "Wert", color: "#3B82F6" }];

          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              sender: "assistant",
              timestamp: new Date(),
              text: widget.title
                ? `Hier ist die Auswertung '${widget.title}':`
                : "Hier ist die gewünschte Auswertung:",
              type: "chart_view",
              payload: {
                title: widget.title,
                chartType: widget.chartType || "bar",
                chartData: rawData,
                xAxisKey,
                series,
                summaryInsight: widget.summary,
                rawSqlUsed: widget.rawSql,
                viewMode: "chart",
              },
            },
          ]);
          return;
        }

        // Fall 2: Störungsentwurf (CREATE_ORDER)
        const isCreateOrder =
          classification.intent === "CREATE_ORDER" ||
          (Boolean(optionId) && !needsClarification && optionField === "equipment") ||
          lowerPrompt.includes("überhitz") ||
          lowerPrompt.includes("störung melden") ||
          lowerPrompt.includes("stillstand");

        if (isCreateOrder) {
          const draft = classification.createOrder || classification.draftOrder;
          const matchedEqId =
            draft?.equipmentId ||
            draft?.matchedEquipmentId ||
            optionId ||
            "eq-kuka-kr210";

          const foundEq = availableEquipmentsList.find((e) => e.id === matchedEqId);
          const eqName = draft?.equipmentName || foundEq?.name || "KUKA KR-210";
          const eqLoc = (foundEq as any)?.description || "Rohbau Zelle 1";
          const eqNumber = foundEq?.equipmentNumber || "FL-H1-01";

          let title = `Überhitzung ${eqName} (${eqLoc})`;
          if (draft?.title && !draft.title.startsWith("Störung")) {
            title = draft.title.replace(/\[|\]/g, "");
          }

          let description =
            "Roboter ist überhitzt, Antriebsmotor Achse 2 heiß";
          if (draft?.description && draft.description !== textToSubmit) {
            description = draft.description;
          } else if (textToSubmit.includes("überhitz")) {
            description = "Roboter ist überhitzt, Antriebsmotor Achse 2 heiß";
          }

          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              sender: "assistant",
              timestamp: new Date(),
              text: "Ich habe einen Störungsentwurf vorbereitet. Bitte prüfe und passe die Details an:",
              type: "order_draft",
              payload: {
                title,
                description,
                priority: (draft?.priority || "2_HIGH") as OrderPriority,
                equipmentId: matchedEqId,
                equipmentName: `${eqName} (${eqNumber})`,
                equipmentNumber: eqNumber,
                damageCode: "MECH_TEMP",
              },
            },
          ]);
          return;
        }

        // Fall 4: Tabellen-Abfrage (QUERY_ORDERS)
        if (
          classification.intent === "QUERY_ORDERS" ||
          lowerPrompt.includes("auftrag") ||
          lowerPrompt.includes("störungen") ||
          lowerPrompt.includes("liste") ||
          lowerPrompt.includes("halle 1") ||
          lowerPrompt.includes("equipment") ||
          lowerPrompt.includes("such")
        ) {
          const q = classification.queryOrders;
          const filters: QueryOrdersFilters = {
            areaId: q?.areaId,
            statusList: q?.statusList,
            priorityList: q?.priorityList,
            search: q?.searchQuery || q?.equipmentName || textToSubmit,
          };

          const loaded = await queryOrdersAction(filters);

          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              sender: "assistant",
              timestamp: new Date(),
              text:
                classification.explanation ||
                `Hier ist die Übersicht der Aufträge für deine Abfrage '${textToSubmit}':`,
              type: "table_view",
              payload: {
                orders: loaded && loaded.length > 0 ? loaded : initialOrders,
                filters,
                viewMode: "table",
                title: "Aufträge & Störungsmeldungen",
              },
            },
          ]);
          return;
        }

        // Standard-Antwort
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            sender: "assistant",
            timestamp: new Date(),
            text:
              classification.explanation ||
              `Ich habe deine Eingabe '${textToSubmit}' verarbeitet. Wie kann ich dir weiterhelfen?`,
            type: "text",
          },
        ]);
      } catch (err: any) {
        console.error("Fehler in handleSubmitQuery:", err);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            sender: "assistant",
            timestamp: new Date(),
            text: `Fehler bei der Verarbeitung: ${err?.message || "Unbekannter Fehler"}. Bitte versuche es erneut.`,
            type: "text",
          },
        ]);
      } finally {
        setIsAnalyzing(false);
      }
    });
  };

  // Klick auf ein Klärungs-Equipment
  const handleClarificationChipClick = (opt: ClarificationOption) => {
    handleSubmitQuery(opt.label, opt.id, opt.field);
  };

  // Verbindliches Anlegen des Störungsauftrags aus dem Entwurf
  const handleCommitOrderDraft = async (
    draft: {
      title: string;
      description: string;
      priority: OrderPriority;
      equipmentId?: string;
      equipmentName?: string;
      damageCode?: string;
    },
    messageId: string
  ) => {
    if (!draft.title.trim()) {
      toast.error("Bitte gib einen Titel für die Störung an.");
      return;
    }

    try {
      const res = await createMaintenanceOrderAction({
        tenantId: tenantId || "demo-tenant-1000",
        orderTypeId: "IH01",
        title: draft.title.trim(),
        description: draft.description.trim() || draft.title.trim(),
        symptomDescription: draft.description.trim() || draft.title.trim(),
        priority: draft.priority,
        equipmentId: draft.equipmentId || null,
        damageCode: draft.damageCode || null,
        reportedByUserId: currentUser?.userId || "user-demo-meister",
        plannedDurationMinutes: 60,
      });

      if (res && res.success && res.order) {
        toast.success(`Störung ${res.order.orderNumber} verbindlich angelegt!`);

        // Ersetze oder füge Erfolgsnachricht hinzu
        const createdMsg: ChatMessage = {
          id: crypto.randomUUID(),
          sender: "assistant",
          timestamp: new Date(),
          text: `Störung ${res.order.orderNumber} wurde verbindlich im System angelegt!`,
          type: "order_created",
          payload: {
            id: res.order.id,
            orderNumber: res.order.orderNumber,
            title: res.order.title,
            description: draft.description,
            priority: draft.priority,
            equipmentName: draft.equipmentName,
            damageCode: draft.damageCode,
            sapNotificationNr: res.sapNotificationNr,
          },
        };

        setMessages((prev) => [...prev, createdMsg]);
      } else {
        toast.error(res?.error || "Fehler beim Anlegen der Störung.");
      }
    } catch (err: any) {
      console.error("Fehler beim Erstellen:", err);
      toast.error(err?.message || "Fehler beim Anlegen der Störung.");
    }
  };

  // Störungsentwurf abbrechen
  const handleCancelDraft = (messageId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              type: "text",
              text: "Störungsentwurf wurde abgebrochen.",
              payload: null,
            }
          : m
      )
    );
    toast.info("Störungsentwurf abgebrochen.");
  };

  // Umschalten zwischen Diagramm- und Tabellenansicht in einer Nachricht
  const handleToggleMessageView = (messageId: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        if (m.type === "chart_view") {
          return {
            ...m,
            type: "table_view",
            payload: { ...m.payload, viewMode: "table" },
          };
        }
        if (m.type === "table_view") {
          return {
            ...m,
            type: "chart_view",
            payload: { ...m.payload, viewMode: "chart" },
          };
        }
        return m;
      })
    );
  };

  // Zeilenklick in der Auftragstabelle -> OrderDetailsModal
  const handleRowClick = (orderId: string) => {
    setSelectedOrderIdForModal(orderId);
    setIsDetailsModalOpen(true);
  };

  const showWelcomeScreen = !isChatActive || messages.length === 0;

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)] overflow-hidden bg-slate-50">
      {/* Verstecktes Datei-Upload-Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handlePhotoSelect}
        accept="image/*"
        className="hidden"
        aria-label="Foto aufnehmen oder hochladen"
      />

      {showWelcomeScreen ? (
        /* ========================================================================= */
        /* STUFE 1: VOLLSTÄNDIGER BEGRÜSSUNGS-SCREEN (HERO)                          */
        /* ========================================================================= */
        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center p-4 sm:p-8 my-auto max-w-4xl mx-auto w-full animate-in fade-in duration-300">
          {/* Badge & Begrüßung */}
          <div className="text-center mb-5 space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold mb-1 shadow-2xs">
              <span>⚡ Fokus-Workspace Rohbau</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Guten Morgen, {firstName}
            </h1>
            <p className="text-slate-500 text-sm max-w-lg mx-auto">
              Bereit für deine Schicht in Werk 01 - Rohbau. Was liegt heute an?
            </p>
          </div>

          {/* Zentrales großes Omni-Eingabefeld */}
          <div className="w-full bg-white border border-slate-200 rounded-2xl p-4 shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmitQuery();
                }
              }}
              rows={3}
              placeholder="Was liegt an? Sprechen oder schreiben... (z. B. Welche offenen Störungen in Halle 1 stehen an?)"
              className="w-full bg-transparent text-slate-900 text-sm sm:text-base placeholder:text-slate-400 resize-none outline-none px-1 py-1"
            />

            {/* Foto-Vorschau falls angehängt */}
            {selectedPhoto && (
              <div className="flex items-center gap-3 p-2 bg-slate-50 rounded-xl border border-slate-200 my-2">
                <img
                  src={selectedPhoto.previewUrl}
                  alt="Angehängtes Foto"
                  className="h-12 w-12 object-cover rounded-lg border border-slate-300"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-900 truncate">{selectedPhoto.name}</p>
                  <p className="text-[10px] text-slate-500">Foto bereit zum Senden</p>
                </div>
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                  title="Foto entfernen"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-slate-200 mt-2">
              <div className="flex items-center gap-2">
                {/* Mikrofon Button */}
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`inline-flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[44px] rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isListening
                      ? "bg-rose-600 text-white animate-pulse"
                      : "bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200"
                  }`}
                  title={isListening ? "Sprachaufnahme beenden" : "Spracheingabe starten"}
                >
                  {isListening ? (
                    <>
                      <MicOff className="h-4 w-4 text-white" />
                      <span>Höre zu...</span>
                    </>
                  ) : (
                    <>
                      <Mic className="h-4 w-4 text-blue-600" />
                      <span>Sprechen</span>
                    </>
                  )}
                </button>

                {/* Foto-Upload Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[44px] rounded-xl text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
                  title="Foto aufnehmen oder hochladen"
                >
                  <Camera className="h-4 w-4 text-slate-500" />
                  <span>Foto</span>
                </button>
              </div>

              {/* Senden Button */}
              <button
                type="button"
                disabled={(!prompt.trim() && !selectedPhoto) || isAnalyzing}
                onClick={() => handleSubmitQuery()}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold shadow-xs transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Analysiere...</span>
                  </>
                ) : (
                  <>
                    <span>Senden</span>
                    <Send className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 3 Aktions-Chips direkt darunter */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-4 max-w-3xl w-full">
            {/* [🚨 Akute Störung melden] -> Triggert Intent CREATE_ORDER / öffnet Störungs-Erfassung */}
            <button
              type="button"
              onClick={() => {
                const q = "Akute Störung melden";
                setPrompt(q);
                handleSubmitQuery(q);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-white hover:bg-rose-50 text-rose-800 border border-rose-200 text-xs sm:text-sm font-semibold shadow-2xs hover:border-rose-300 transition-all cursor-pointer active:scale-95"
            >
              <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
              <span>Akute Störung melden</span>
            </button>

            {/* [📊 Auswertung / Chart erstellen] -> Setzt Prompt-Vorschlag */}
            <button
              type="button"
              onClick={() => {
                const q = "Auswertung / Chart erstellen";
                setPrompt(q);
                handleSubmitQuery(q);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs sm:text-sm font-medium shadow-2xs hover:border-slate-400 transition-all cursor-pointer active:scale-95"
            >
              <BarChart2 className="h-4 w-4 text-slate-600 shrink-0" />
              <span>Auswertung / Chart erstellen</span>
            </button>

            {/* [🔍 Equipment suchen] -> Setzt Fokus auf Suche */}
            <button
              type="button"
              onClick={() => {
                const q = "Equipment suchen";
                setPrompt(q);
                handleSubmitQuery(q);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs sm:text-sm font-medium shadow-2xs hover:border-slate-400 transition-all cursor-pointer active:scale-95"
            >
              <Search className="h-4 w-4 text-slate-600 shrink-0" />
              <span>Equipment suchen</span>
            </button>
          </div>

          {/* Infokarte darunter */}
          <div className="w-full bg-white border border-slate-200 rounded-2xl p-6 shadow-xs mt-6 flex items-start gap-4 text-left">
            <div className="h-12 w-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-slate-900 font-bold text-sm">
                Bereit für deine Schicht — Freitext, Sprache oder Schnellfilter
              </h3>
              <p className="text-slate-600 text-xs leading-relaxed">
                Sprich direkt ins Mikrofon oder wähle links eine deiner angepinnten Favoriten-Sichten.
              </p>
              <p className="text-slate-400 text-xs leading-relaxed">
                Passende Tabellen, Störungsdialoge und KPI-Visualisierungen werden dynamisch eingeblendet.
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* STUFE 2: CHAT-SICHT (VERLAUF & DOCKED STICKY BOTTOM BAR)                   */
        /* ========================================================================= */
        <>
          {/* Kopfzeile der Chat-Sicht */}
          <header className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 bg-white border-b border-slate-200 z-10 shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center font-bold text-lg shadow-2xs">
                🤖
              </div>
              <div>
                <h1 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <span>Workspace / Conversational Assistant</span>
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Online
                  </span>
                </h1>
                <p className="text-[11px] text-slate-500">
                  MaintAI Copilot für Werk 01 Rohbau &amp; SAP PM
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClearChat}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-600 hover:text-slate-900 text-xs font-medium transition-all shadow-2xs cursor-pointer"
                title="Verlauf leeren"
              >
                <Trash2 className="h-3.5 w-3.5 text-slate-400" />
                <span className="hidden sm:inline">Verlauf leeren</span>
              </button>
            </div>
          </header>

      {/* ========================================================================= */}
      {/* SCROLLBARER CHATBEREICH: flex-1 overflow-y-auto space-y-4 px-4             */}
      {/* ========================================================================= */}
      <div
        ref={chatScrollContainerRef}
        className="flex-1 overflow-y-auto space-y-4 py-4 sm:py-6 max-w-7xl 2xl:max-w-[1600px] mx-auto w-full px-4 sm:px-6 lg:px-8"
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.sender === "user" ? "items-end" : "items-start"
            } space-y-1.5 animate-in fade-in duration-200`}
          >
            {/* Sender-Header */}
            <div
              className={`flex items-center gap-1.5 text-xs text-slate-500 ${
                msg.sender === "user" ? "flex-row-reverse" : "flex-row"
              }`}
            >
              <span className="text-sm">{msg.sender === "user" ? "👤" : "🤖"}</span>
              <span className="font-semibold text-slate-700">
                {msg.sender === "user" ? currentUser?.userName || "Benutzer" : "MaintAI"}
              </span>
              <span className="text-[11px] text-slate-400">({formatTime(msg.timestamp)})</span>
            </div>

            {/* Nachricht: Benutzer (Text / Auswahl) */}
            {msg.sender === "user" ? (
              <div className="max-w-2xl xl:max-w-3xl text-right">
                {msg.text?.startsWith("[Auswahl:") || msg.payload?.isSelection ? (
                  <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 text-xs sm:text-sm font-semibold shadow-2xs">
                    <span>🤖</span>
                    <span>{msg.text}</span>
                  </div>
                ) : (
                  <div className="inline-block bg-blue-600 text-white rounded-2xl rounded-tr-none px-4 py-2.5 text-sm sm:text-base leading-relaxed shadow-2xs text-left">
                    {msg.text}
                  </div>
                )}

                {msg.payload?.photoUrl && (
                  <div className="mt-2 flex justify-end">
                    <img
                      src={msg.payload.photoUrl}
                      alt="Angehängtes Foto"
                      className="h-24 w-24 object-cover rounded-xl border border-slate-300 shadow-xs"
                    />
                  </div>
                )}
              </div>
            ) : (
              /* Nachricht: Assistent (Text, Clarification, Draft, Order Created, Chart, Table) */
              <div className="max-w-5xl xl:max-w-6xl 2xl:max-w-7xl w-full space-y-3">
                {/* Textabschnitt */}
                {msg.text && (
                  <div className="text-slate-800 text-sm sm:text-base leading-relaxed bg-white border border-slate-200 rounded-2xl rounded-tl-none p-3.5 shadow-2xs">
                    {msg.text}

                    {/* Vorgeschlagene Prompts bei initialer Begrüßung */}
                    {msg.payload?.suggestedPrompts && (
                      <div className="flex flex-wrap gap-2 pt-3 mt-2 border-t border-slate-100">
                        {msg.payload.suggestedPrompts.map((p: string) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => handleSubmitQuery(p)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 text-slate-700 border border-slate-200 text-xs font-medium transition-all shadow-2xs cursor-pointer"
                          >
                            <Sparkles className="h-3 w-3 text-blue-500" />
                            <span>{p}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 1. CLARIFICATION OPTIONS (KUKA KR-210, KUKA KR-16) */}
                {msg.type === "clarification" && msg.payload?.options && (
                  <div className="flex flex-wrap gap-2.5 pt-1">
                    {msg.payload.options.map((opt: ClarificationOption) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleClarificationChipClick(opt)}
                        className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-white hover:bg-blue-50 text-blue-950 font-semibold border border-blue-200 shadow-2xs hover:border-blue-400 transition-all text-xs sm:text-sm cursor-pointer active:scale-95 text-left"
                      >
                        <span>🤖</span>
                        <span>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* 2. STÖRUNGSENTWURF-KARTE (⚠️ STÖRUNGSENTWURF) */}
                {msg.type === "order_draft" && msg.payload && (
                  <OrderDraftCard
                    messageId={msg.id}
                    payload={msg.payload}
                    availableEquipments={availableEquipmentsList}
                    onCommit={(draft) => handleCommitOrderDraft(draft, msg.id)}
                    onCancel={() => handleCancelDraft(msg.id)}
                  />
                )}

                {/* 3. ERFOLGSKARTE NACH ANLEGEN */}
                {msg.type === "order_created" && msg.payload && (
                  <div className="border border-emerald-300 bg-emerald-50/90 p-4 sm:p-5 rounded-2xl shadow-sm space-y-3 animate-in fade-in text-slate-900">
                    <div className="flex items-start sm:items-center justify-between gap-3 pb-3 border-b border-emerald-200">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="h-5 w-5" />
                        </div>
                        <div>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-300">
                            ✅ Störung verbindlich angelegt
                          </span>
                          <h3 className="text-sm font-bold text-slate-900 mt-1">
                            {msg.payload.title}
                          </h3>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-500">Auftrags-Nr.</div>
                        <div className="text-sm font-mono font-extrabold text-blue-700">
                          {msg.payload.orderNumber}
                        </div>
                        {msg.payload.sapNotificationNr && (
                          <div className="text-[11px] font-mono text-emerald-700">
                            SAP: {msg.payload.sapNotificationNr}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-xs text-slate-600 space-y-1">
                      <p>
                        <strong>Beschreibung:</strong> {msg.payload.description || "Störungsbehebung"}
                      </p>
                      <p className="text-slate-500">
                        Der Auftrag ist im System verbucht und für die Schichtleitung disponierbar.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-emerald-200/60">
                      <button
                        type="button"
                        onClick={() => handleRowClick(msg.payload.id)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>Auftragsdetails &amp; Bearbeitung öffnen</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 4. DIAGRAMM-ANSICHT (DYNAMISCHES RECHARTS-RENDERING) */}
                {msg.type === "chart_view" && (() => {
                  const chartData: any[] = msg.payload?.chartData || [];
                  const xAxisKey: string = msg.payload?.xAxisKey || Object.keys(chartData[0] || {})[0] || "name";
                  const series: Array<{ key: string; label: string; color?: string }> =
                    msg.payload?.series && msg.payload.series.length > 0
                      ? msg.payload.series
                      : chartData.length > 0 && typeof chartData[0].hours === "number"
                      ? [{ key: "hours", label: "Ausfallzeit (h)", color: "#3B82F6" }]
                      : [{ key: "value", label: "Wert", color: "#3B82F6" }];
                  const chartType: "bar" | "line" | "pie" = msg.payload?.chartType || "bar";
                  const summaryInsight = msg.payload?.summaryInsight || msg.payload?.summary;
                  const chartTitle = msg.payload?.title || "Auswertung";

                  return (
                    <div className="bg-white border border-slate-200 p-4 sm:p-5 rounded-2xl shadow-sm space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <BarChart2 className="h-5 w-5 text-blue-600 shrink-0" />
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-bold text-slate-900 text-sm">
                                {chartTitle}
                              </h3>
                              {/* Unaufdringlicher Refresh-Indikator */}
                              {(msg.payload?.refreshInterval ?? (activeView?.id === msg.payload?.savedViewId ? activeView?.refreshInterval : 0) ?? 0) > 0 && (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[10px] text-slate-600 shadow-2xs">
                                  <span
                                    className={`h-1.5 w-1.5 rounded-full ${
                                      isRefreshing ? "bg-blue-600 animate-ping" : "bg-emerald-500 animate-pulse"
                                    }`}
                                  />
                                  <span className="font-mono font-semibold">
                                    {msg.payload?.refreshInterval ?? activeView?.refreshInterval}s
                                  </span>
                                  {isRefreshing ? (
                                    <span className="text-blue-600 font-semibold flex items-center gap-0.5">
                                      <RefreshCw className="h-2.5 w-2.5 animate-spin" />
                                      <span>Aktualisiert...</span>
                                    </span>
                                  ) : lastRefreshedAt ? (
                                    <span className="text-slate-400">
                                      {formatTime(lastRefreshedAt)}
                                    </span>
                                  ) : null}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">
                              {chartType === "pie"
                                ? "Verteilung nach Kategorien visualisiert"
                                : chartType === "line"
                                ? "Zeitlicher Verlauf visualisiert"
                                : "Kennzahlen visualisiert"}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleToggleMessageView(msg.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all shadow-2xs cursor-pointer"
                          >
                            <TableIcon className="h-3.5 w-3.5 text-slate-500" />
                            <span>📋 Als Tabelle</span>
                          </button>
                          <ChartExportDropdown
                            getSvgElement={() => {
                              const container = chartContainerRefs.current.get(msg.id);
                              return container?.querySelector("svg") || null;
                            }}
                            title={chartTitle}
                            size="sm"
                          />
                          <button
                            type="button"
                            onClick={() => handleOpenFavoriteModal(msg)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] rounded-lg border border-slate-300 bg-white hover:bg-amber-50 hover:border-amber-300 hover:text-amber-800 text-slate-700 text-xs font-semibold transition-all shadow-2xs cursor-pointer"
                            title="Diagramm zu Favoriten hinzufügen"
                          >
                            <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500/20" />
                            <span>⭐ Zu Favoriten</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenZoomModal(msg)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all shadow-2xs cursor-pointer"
                            title="Diagramm vergrößern"
                          >
                            <Maximize2 className="h-3.5 w-3.5 text-slate-500" />
                            <span>⛶ Vergrößern</span>
                          </button>
                        </div>
                      </div>

                      {/* Recharts Diagramm (Bar, Line oder Pie) */}
                      <div
                        ref={(el) => {
                          if (el) {
                            chartContainerRefs.current.set(msg.id, el);
                          } else {
                            chartContainerRefs.current.delete(msg.id);
                          }
                        }}
                        className="h-64 sm:h-72 w-full pt-2"
                      >
                        <ResponsiveContainer width="100%" height="100%">
                          {chartType === "line" ? (
                            <LineChart data={chartData} margin={{ top: 15, right: 20, left: 0, bottom: 20 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                              <XAxis
                                dataKey={xAxisKey}
                                stroke="#64748B"
                                fontSize={11}
                                tickLine={false}
                                axisLine={{ stroke: "#CBD5E1" }}
                              />
                              <YAxis
                                stroke="#64748B"
                                fontSize={11}
                                tickLine={false}
                                axisLine={{ stroke: "#CBD5E1" }}
                              />
                              <Tooltip
                                content={({ active, payload, label }) => {
                                  if (active && payload && payload.length) {
                                    const dataItem = payload[0].payload;
                                    const xVal = label ?? dataItem[xAxisKey] ?? "";
                                    return (
                                      <div className="bg-white p-3 border border-slate-200 rounded-xl shadow-lg text-xs space-y-1.5 min-w-[180px]">
                                        <p className="font-bold text-slate-900 border-b border-slate-100 pb-1">{String(xVal)}</p>
                                        {dataItem.component && (
                                          <p className="text-slate-500 text-[11px]">{dataItem.component}</p>
                                        )}
                                        <div className="space-y-1 pt-0.5">
                                          {payload.map((entry: any, i: number) => {
                                            const seriesDef = series.find((s) => s.key === entry.dataKey);
                                            const labelName = entry.name || seriesDef?.label || entry.dataKey;
                                            const color = entry.color || seriesDef?.color || DEFAULT_CHART_COLORS[i % DEFAULT_CHART_COLORS.length];
                                            const val = entry.value;
                                            const formattedVal = typeof val === "number" ? val.toLocaleString("de-DE") : val;
                                            return (
                                              <div key={`tip-line-${i}`} className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-1.5 truncate">
                                                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                                  <span className="text-slate-600 truncate">{labelName}:</span>
                                                </div>
                                                <span className="font-bold text-slate-900 shrink-0">{formattedVal}</span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  }
                                  return null;
                                }}
                              />
                              {series.length > 1 && <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />}
                              {series.map((s, idx) => (
                                <Line
                                  key={s.key}
                                  type="monotone"
                                  dataKey={s.key}
                                  name={s.label}
                                  stroke={s.color || DEFAULT_CHART_COLORS[idx % DEFAULT_CHART_COLORS.length]}
                                  strokeWidth={2.5}
                                  dot={{ r: 4 }}
                                />
                              ))}
                            </LineChart>
                          ) : chartType === "pie" ? (
                            <PieChart>
                              <Tooltip
                                content={({ active, payload }) => {
                                  if (active && payload && payload.length) {
                                    const entry = payload[0];
                                    const name = entry.name ?? entry.payload?.[xAxisKey] ?? "";
                                    const val = entry.value;
                                    const formattedVal = typeof val === "number" ? val.toLocaleString("de-DE") : val;
                                    return (
                                      <div className="bg-white p-3 border border-slate-200 rounded-xl shadow-lg text-xs space-y-1 min-w-[150px]">
                                        <p className="font-bold text-slate-900 border-b border-slate-100 pb-1">{String(name)}</p>
                                        <div className="flex items-center justify-between gap-3 pt-0.5">
                                          <span className="text-slate-600">{series[0]?.label || "Wert"}:</span>
                                          <span className="font-bold text-slate-900">{formattedVal}</span>
                                        </div>
                                      </div>
                                    );
                                  }
                                  return null;
                                }}
                              />
                              <Legend wrapperStyle={{ fontSize: "12px" }} />
                              <Pie
                                data={chartData}
                                dataKey={series[0]?.key || Object.keys(chartData[0] || {})[1] || "value"}
                                nameKey={xAxisKey}
                                cx="50%"
                                cy="50%"
                                outerRadius={90}
                                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                              >
                                {chartData.map((_, index) => (
                                  <Cell
                                    key={`pie-cell-${index}`}
                                    fill={DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length]}
                                  />
                                ))}
                              </Pie>
                            </PieChart>
                          ) : (
                            <BarChart
                              data={chartData}
                              margin={{ top: 15, right: 20, left: 0, bottom: 20 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                              <XAxis
                                dataKey={xAxisKey}
                                stroke="#64748B"
                                fontSize={11}
                                tickLine={false}
                                axisLine={{ stroke: "#CBD5E1" }}
                              />
                              <YAxis
                                stroke="#64748B"
                                fontSize={11}
                                tickLine={false}
                                axisLine={{ stroke: "#CBD5E1" }}
                              />
                              <Tooltip
                                content={({ active, payload, label }) => {
                                  if (active && payload && payload.length) {
                                    const dataItem = payload[0].payload;
                                    const xVal = label ?? dataItem[xAxisKey] ?? "";
                                    return (
                                      <div className="bg-white p-3 border border-slate-200 rounded-xl shadow-lg text-xs space-y-1.5 min-w-[180px]">
                                        <p className="font-bold text-slate-900 border-b border-slate-100 pb-1">{String(xVal)}</p>
                                        {dataItem.component && (
                                          <p className="text-slate-500 text-[11px]">{dataItem.component}</p>
                                        )}
                                        <div className="space-y-1 pt-0.5">
                                          {payload.map((entry: any, i: number) => {
                                            const seriesDef = series.find((s) => s.key === entry.dataKey);
                                            const labelName = entry.name || seriesDef?.label || entry.dataKey;
                                            const color = entry.color || seriesDef?.color || DEFAULT_CHART_COLORS[i % DEFAULT_CHART_COLORS.length];
                                            const val = entry.value;
                                            const formattedVal = typeof val === "number" ? val.toLocaleString("de-DE") : val;
                                            return (
                                              <div key={`tip-bar-${i}`} className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-1.5 truncate">
                                                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                                  <span className="text-slate-600 truncate">{labelName}:</span>
                                                </div>
                                                <span className="font-bold text-slate-900 shrink-0">{formattedVal}</span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  }
                                  return null;
                                }}
                              />
                              {series.length > 1 && <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />}
                              {series.map((s, idx) => (
                                <Bar
                                  key={s.key}
                                  dataKey={s.key}
                                  name={s.label}
                                  fill={s.color || DEFAULT_CHART_COLORS[idx % DEFAULT_CHART_COLORS.length]}
                                  radius={[6, 6, 0, 0]}
                                  maxBarSize={55}
                                >
                                  {series.length === 1 &&
                                    chartData.map((entry: any, index: number) => (
                                      <Cell
                                        key={`bar-cell-${index}`}
                                        fill={entry.fill || s.color || DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length]}
                                        stroke={entry.stroke || undefined}
                                        strokeWidth={entry.stroke ? 1.5 : 0}
                                      />
                                    ))}
                                </Bar>
                              ))}
                            </BarChart>
                          )}
                        </ResponsiveContainer>
                      </div>

                      {/* KI-Erkenntnis Pill (nur anzeigen, wenn eine Erkenntnis vorhanden ist) */}
                      {summaryInsight && (
                        <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 flex items-center gap-2.5 text-xs">
                          <Lightbulb className="h-4 w-4 text-blue-600 shrink-0" />
                          <span>
                            <strong>KI-Erkenntnis:</strong> {summaryInsight}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* 5. TABELLEN-ANSICHT (TABLE VIEW) */}
                {msg.type === "table_view" && (
                  <TableViewMessageCard
                    messageId={msg.id}
                    payload={msg.payload}
                    initialOrders={initialOrders}
                    onToggleView={() => handleToggleMessageView(msg.id)}
                    onRowClick={handleRowClick}
                  />
                )}
              </div>
            )}
          </div>
        ))}

        {/* Ladeindikator wenn der Copilot analysiert */}
        {isAnalyzing && (
          <div className="flex items-center gap-2 text-slate-500 text-xs py-2 animate-in fade-in">
            <span className="text-sm">🤖</span>
            <span className="font-medium text-slate-700">MaintAI denkt nach...</span>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
          </div>
        )}

        <div ref={messagesEndRef} className="h-1" />
      </div>

      {/* ========================================================================= */}
      {/* UNTEN FIXIERTE EINGABELEISTE: STICKY BOTTOM                               */}
      {/* ========================================================================= */}
      <div className="shrink-0 sticky bottom-0 bg-white/95 backdrop-blur-md border-t border-slate-200 py-3 sm:py-4 px-4 sm:px-6 lg:px-8 z-20 shadow-lg">
        <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto w-full space-y-2">
          {/* Foto-Vorschau falls angehängt */}
          {selectedPhoto && (
            <div className="flex items-center gap-3 p-2 bg-slate-50 rounded-xl border border-slate-200">
              <img
                src={selectedPhoto.previewUrl}
                alt="Foto Vorschau"
                className="h-10 w-10 object-cover rounded-lg border border-slate-300"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-900 truncate">{selectedPhoto.name}</p>
                <p className="text-[10px] text-slate-500">Foto bereit zum Senden</p>
              </div>
              <button
                type="button"
                onClick={handleRemovePhoto}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600"
                title="Foto entfernen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Eingabeleiste mit Mikrofon, Input und Senden */}
          <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-2xl p-1.5 shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
            {/* Mikrofon Button [ 🎙️ ] */}
            <button
              type="button"
              onClick={toggleListening}
              className={`p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-xs font-semibold shrink-0 transition-all cursor-pointer ${
                isListening
                  ? "bg-rose-600 text-white animate-pulse"
                  : "bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200"
              }`}
              title={isListening ? "Sprachaufnahme stoppen" : "Spracheingabe starten"}
            >
              {isListening ? <MicOff className="h-4 w-4 text-white" /> : <Mic className="h-4 w-4 text-blue-600" />}
            </button>

            {/* Foto Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 shrink-0 transition-colors cursor-pointer"
              title="Foto aufnehmen oder hochladen"
            >
              <Camera className="h-4 w-4 text-slate-500" />
            </button>

            {/* Texteingabe */}
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSubmitQuery();
                }
              }}
              placeholder="Was liegt an? Störung melden, Daten abfragen... (Enter zum Senden)"
              className="flex-1 bg-transparent text-slate-900 text-xs sm:text-sm outline-none px-2 py-2 placeholder:text-slate-400"
            />

            {/* Senden Button [ Senden ↵ ] */}
            <button
              type="button"
              disabled={(!prompt.trim() && !selectedPhoto) || isAnalyzing}
              onClick={() => handleSubmitQuery()}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs sm:text-sm font-semibold shadow-xs transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="hidden sm:inline">Analysiere...</span>
                </>
              ) : (
                <>
                  <span>Senden</span>
                  <span>↵</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  )}

      {/* Detail- & Bearbeitungs-Modal bei Klick auf einen Auftrag */}
      <OrderDetailsModal
        orderId={selectedOrderIdForModal}
        isOpen={isDetailsModalOpen}
        onClose={() => {
          setIsDetailsModalOpen(false);
          setSelectedOrderIdForModal(null);
        }}
        onOrderUpdated={() => {
          // Keine Aktion nötig, Modal aktualisiert State
        }}
      />

      {/* Favoriten- & Intervall-Modal */}
      {isFavoriteModalOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200"
          onClick={() => setIsFavoriteModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-5 sm:p-6 space-y-5 animate-in zoom-in-95 duration-150 text-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Kopfzeile */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-2xs">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-500" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Zu Favoriten hinzufügen
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Diagramm als Schnellansicht mit Auto-Refresh speichern
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFavoriteModalOpen(false)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                aria-label="Schließen"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Formular-Felder */}
            <div className="space-y-4">
              {/* Eingabefeld: Name des Favoriten */}
              <div>
                <label
                  htmlFor="fav-name-input"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Name des Favoriten:
                </label>
                <input
                  id="fav-name-input"
                  type="text"
                  value={favoriteName}
                  onChange={(e) => setFavoriteName(e.target.value)}
                  placeholder="Ausfallstunden nach Anlage (Halle 1)"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 min-h-[42px] text-xs sm:text-sm font-medium text-slate-900 outline-none focus:border-blue-600 focus:bg-white shadow-2xs transition-all"
                  autoFocus
                />
              </div>

              {/* Dropdown / Radio-Gruppe: Aktualisierungsintervall */}
              <div className="space-y-2">
                <label
                  htmlFor="fav-interval-select"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Aktualisierungsintervall:
                </label>

                {/* Dropdown-Auswahl */}
                <select
                  id="fav-interval-select"
                  value={favoriteInterval}
                  onChange={(e) => setFavoriteInterval(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 min-h-[42px] text-xs sm:text-sm font-medium text-slate-900 outline-none focus:border-blue-600 focus:bg-white shadow-2xs cursor-pointer"
                >
                  <option value={0}>Manuell (Aus / 0s)</option>
                  <option value={30}>30 Sekunden (30s)</option>
                  <option value={60}>1 Minute (60s)</option>
                  <option value={300}>5 Minuten (300s)</option>
                </select>

                {/* Radio-Gruppe / Schnellwahl-Optionen */}
                <div
                  className="grid grid-cols-2 gap-2 pt-1"
                  role="radiogroup"
                  aria-label="Aktualisierungsintervall"
                >
                  {[
                    { value: 0, label: "Manuell (Aus / 0s)", badge: "0s" },
                    { value: 30, label: "30 Sekunden (30s)", badge: "30s" },
                    { value: 60, label: "1 Minute (60s)", badge: "60s" },
                    { value: 300, label: "5 Minuten (300s)", badge: "300s" },
                  ].map((opt) => {
                    const isSelected = favoriteInterval === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        onClick={() => setFavoriteInterval(opt.value)}
                        className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-medium text-left transition-all cursor-pointer ${
                          isSelected
                            ? "bg-blue-50 border-blue-500 text-blue-900 font-semibold shadow-2xs ring-1 ring-blue-500"
                            : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-3.5 w-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                              isSelected
                                ? "border-blue-600 bg-blue-600"
                                : "border-slate-300 bg-white"
                            }`}
                          >
                            {isSelected && (
                              <span className="h-1.5 w-1.5 rounded-full bg-white" />
                            )}
                          </span>
                          <span className="truncate">{opt.label}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Fußzeile mit [Abbrechen] und [⭐ Favorit speichern] */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsFavoriteModalOpen(false)}
                className="px-4 py-2 min-h-[40px] rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold transition-all shadow-2xs cursor-pointer"
              >
                Abbrechen
              </button>
              <button
                type="button"
                disabled={isSavingFavorite || !favoriteName.trim()}
                onClick={handleSaveFavorite}
                className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer active:scale-95"
              >
                {isSavingFavorite ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Speichern...</span>
                  </>
                ) : (
                  <>
                    <Star className="h-4 w-4 fill-amber-300 text-amber-300" />
                    <span>⭐ Favorit speichern</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Vollbild- / Zoom-Modal für Diagramme */}
      <ChartZoomModal
        isOpen={isZoomModalOpen && Boolean(selectedChartForZoom)}
        chartMessage={selectedChartForZoom}
        onClose={handleCloseZoomModal}
        onFavoriteClick={(msg) => handleOpenFavoriteModal(msg)}
        onTableViewClick={(msgId) => handleToggleMessageView(msgId)}
      />
    </div>
  );
}

// ============================================================================
// 2. VOLLBILD- / ZOOM-MODAL FÜR DIAGRAMME (CHART ZOOM MODAL)
// ============================================================================

const TIMEFRAME_OPTIONS = [
  {
    id: "7d",
    label: "Letzte 7 Tage",
    factor: 0.35,
    insight:
      "KUKA KR-210 hatte 2 akute Störungen in den letzten 7 Tagen (1.6 Std Stillstand).",
  },
  {
    id: "30d",
    label: "Letzte 30 Tage",
    factor: 1.0,
    insight:
      "KUKA KR-210 verursacht 42% der Ausfallzeiten in Halle 1. Dichtungssatz & Ersatzantrieb sind im Lager vorrätig.",
  },
  {
    id: "month",
    label: "Aktueller Monat",
    factor: 0.8,
    insight:
      "Im laufenden Monat bisher 8.6 Std Gesamtausfallzeit in Halle 1 registriert. Tendenz stabil.",
  },
  {
    id: "all",
    label: "Gesamt",
    factor: 2.2,
    insight:
      "Langzeitanalyse: Antriebsmotor Achse 2 ist die primäre Ursache für ungeplante Stillstände in Halle 1.",
  },
];

// ============================================================================
// EXPORT DROPDOWNS (DIAGRAMM & TABELLE)
// ============================================================================

interface ChartExportDropdownProps {
  getSvgElement: () => SVGElement | null;
  title: string;
  size?: "sm" | "md";
}

function ChartExportDropdown({ getSvgElement, title, size = "sm" }: ChartExportDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleExportPng = async () => {
    setIsOpen(false);
    const svg = getSvgElement();
    if (!svg) {
      toast.error("Diagramm-Element konnte nicht für den Export erfasst werden.");
      return;
    }
    try {
      setIsExporting(true);
      const cleanTitle = (title || "diagramm").toLowerCase().replace(/[^a-z0-9äöüß_-]/gi, "_");
      const filename = `${cleanTitle}_${new Date().toISOString().slice(0, 10)}`;
      await exportChartToPng(svg, filename);
      toast.success("Diagramm als PNG heruntergeladen");
    } catch (err: any) {
      console.error("PNG-Export fehlgeschlagen:", err);
      toast.error("Fehler beim Exportieren des Diagramms als PNG.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    setIsOpen(false);
    const svg = getSvgElement();
    if (!svg) {
      toast.error("Diagramm-Element konnte nicht für den Export erfasst werden.");
      return;
    }
    try {
      setIsExporting(true);
      const cleanTitle = (title || "diagramm").toLowerCase().replace(/[^a-z0-9äöüß_-]/gi, "_");
      const filename = `${cleanTitle}_${new Date().toISOString().slice(0, 10)}`;
      await exportChartToPdf(svg, filename, title);
      toast.success("Diagramm als PDF heruntergeladen");
    } catch (err: any) {
      console.error("PDF-Export fehlgeschlagen:", err);
      toast.error("Fehler beim Exportieren des Diagramms als PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  const isMd = size === "md";

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        type="button"
        disabled={isExporting}
        onClick={() => setIsOpen((prev) => !prev)}
        className={
          isMd
            ? "inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold transition-all shadow-2xs cursor-pointer active:scale-95 disabled:opacity-50"
            : "inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-all shadow-2xs cursor-pointer disabled:opacity-50"
        }
        title="Diagramm exportieren (PNG, PDF)"
      >
        {isExporting ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
        ) : (
          <Download className="h-3.5 w-3.5 text-slate-500" />
        )}
        <span>📥 Exportieren</span>
        <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-52 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
            Diagramm Export
          </div>
          <button
            type="button"
            onClick={handleExportPng}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-blue-50/70 hover:text-blue-700 text-left transition-colors cursor-pointer"
          >
            <ImageIcon className="h-4 w-4 text-blue-600 shrink-0" />
            <span>🖼️ Als PNG exportieren</span>
          </button>
          <button
            type="button"
            onClick={handleExportPdf}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-rose-50/70 hover:text-rose-700 text-left transition-colors cursor-pointer"
          >
            <FileText className="h-4 w-4 text-rose-600 shrink-0" />
            <span>📄 Als PDF exportieren</span>
          </button>
        </div>
      )}
    </div>
  );
}

interface TableExportDropdownProps {
  orders: OrderWithRelations[];
  title?: string;
}

function TableExportDropdown({ orders, title }: TableExportDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleExportExcel = () => {
    setIsOpen(false);
    if (!orders || orders.length === 0) {
      toast.error("Keine Auftragsdaten zum Exportieren vorhanden.");
      return;
    }
    try {
      const cleanTitle = (title || "auftragsuebersicht").toLowerCase().replace(/[^a-z0-9äöüß_-]/gi, "_");
      const filename = `${cleanTitle}_${new Date().toISOString().slice(0, 10)}`;
      exportTableToExcel(orders, filename);
      toast.success("Tabelle als Excel (.xlsx) exportiert");
    } catch (err: any) {
      console.error("Excel-Export fehlgeschlagen:", err);
      toast.error("Fehler beim Exportieren nach Excel.");
    }
  };

  const handleExportCsv = () => {
    setIsOpen(false);
    if (!orders || orders.length === 0) {
      toast.error("Keine Auftragsdaten zum Exportieren vorhanden.");
      return;
    }
    try {
      const cleanTitle = (title || "auftragsuebersicht").toLowerCase().replace(/[^a-z0-9äöüß_-]/gi, "_");
      const filename = `${cleanTitle}_${new Date().toISOString().slice(0, 10)}`;
      exportTableToCsv(orders, filename);
      toast.success("Tabelle als CSV (.csv) exportiert");
    } catch (err: any) {
      console.error("CSV-Export fehlgeschlagen:", err);
      toast.error("Fehler beim Exportieren nach CSV.");
    }
  };

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs cursor-pointer"
        title="Tabelle exportieren (Excel, CSV)"
      >
        <Download className="h-3.5 w-3.5 text-slate-500" />
        <span>📥 Exportieren</span>
        <ChevronDown className={`h-3 w-3 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-56 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
            Tabellen Export ({orders.length} Zeilen)
          </div>
          <button
            type="button"
            onClick={handleExportExcel}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-emerald-50/70 hover:text-emerald-700 text-left transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>📊 Als Excel (.xlsx) exportieren</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-blue-50/70 hover:text-blue-700 text-left transition-colors cursor-pointer"
          >
            <FileText className="h-4 w-4 text-blue-600 shrink-0" />
            <span>📑 Als CSV (.csv) exportieren</span>
          </button>
        </div>
      )}
    </div>
  );
}

interface ChartZoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  chartMessage: ChatMessage | null;
  onFavoriteClick: (msg: ChatMessage) => void;
  onTableViewClick: (messageId: string) => void;
}

function ChartZoomModal({
  isOpen,
  onClose,
  chartMessage,
  onFavoriteClick,
  onTableViewClick,
}: ChartZoomModalProps) {
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>("30d");
  const zoomChartRef = useRef<HTMLDivElement>(null);

  // Schließen per ESC-Taste
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const activeTimeframeOption = useMemo(() => {
    return TIMEFRAME_OPTIONS.find((t) => t.id === selectedTimeframe) || TIMEFRAME_OPTIONS[1];
  }, [selectedTimeframe]);

  const chartData: any[] = useMemo(() => {
    return chartMessage?.payload?.chartData || [];
  }, [chartMessage]);

  const xAxisKey = chartMessage?.payload?.xAxisKey || Object.keys(chartData[0] || {})[0] || "name";

  const series: Array<{ key: string; label: string; color?: string }> = useMemo(() => {
    if (chartMessage?.payload?.series && chartMessage.payload.series.length > 0) {
      return chartMessage.payload.series;
    }
    if (chartData.length > 0 && typeof chartData[0].hours === "number") {
      return [{ key: "hours", label: "Ausfallzeit (h)", color: "#3B82F6" }];
    }
    return [{ key: "value", label: "Wert", color: "#3B82F6" }];
  }, [chartMessage, chartData]);

  const chartType: "bar" | "line" | "pie" = chartMessage?.payload?.chartType || "bar";
  const summaryInsight = chartMessage?.payload?.summaryInsight || chartMessage?.payload?.summary;

  const displayedData = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    if (activeTimeframeOption.factor === 1.0) return chartData;

    return chartData.map((item: any) => {
      const scaled = { ...item };
      series.forEach((s) => {
        if (typeof scaled[s.key] === "number") {
          scaled[s.key] = Number((scaled[s.key] * activeTimeframeOption.factor).toFixed(1));
        }
      });
      if (typeof scaled.hours === "number") {
        scaled.hours = Math.max(0.2, Number((scaled.hours * activeTimeframeOption.factor).toFixed(1)));
      }
      if (typeof scaled.count === "number") {
        scaled.count = Math.max(1, Math.round(scaled.count * activeTimeframeOption.factor));
      }
      return scaled;
    });
  }, [chartData, activeTimeframeOption, series]);

  if (!isOpen || !chartMessage) return null;

  const chartTitle = chartMessage.payload?.title || "Kennzahlen-Analyse";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl xl:max-w-6xl max-h-[92vh] flex flex-col bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 text-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: Titel, Equipment-Untertitel, Aktionsgruppe */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:px-6 sm:py-5 border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-2xs shrink-0">
              <BarChart2 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  {chartTitle}
                </h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[11px] font-medium text-slate-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Vollbild-Analyse
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500">
                {chartType === "pie"
                  ? "Verteilung nach Kategorien visualisiert"
                  : chartType === "line"
                  ? "Zeitlicher Verlauf visualisiert"
                  : "Kennzahlen und Werte visualisiert"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => onFavoriteClick(chartMessage)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-amber-50 hover:border-amber-300 hover:text-amber-800 text-slate-700 text-xs sm:text-sm font-semibold transition-all shadow-2xs cursor-pointer active:scale-95"
              title="Diagramm zu Favoriten hinzufügen"
            >
              <Star className="h-4 w-4 text-amber-500 fill-amber-500/20" />
              <span>⭐ Zu Favoriten</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onTableViewClick(chartMessage.id);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold transition-all shadow-2xs cursor-pointer active:scale-95"
              title="Als Tabelle anzeigen"
            >
              <TableIcon className="h-4 w-4 text-slate-500" />
              <span>📋 Als Tabelle</span>
            </button>
            <ChartExportDropdown
              getSvgElement={() => zoomChartRef.current?.querySelector("svg") || null}
              title={chartTitle}
              size="md"
            />
            <button
              type="button"
              onClick={onClose}
              className="h-11 w-11 min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
              aria-label="Schließen"
              title="Schließen (ESC)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body: Großes Recharts-Diagramm mit dynamischer Höhe */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/60 flex flex-col justify-center">
          <div
            ref={zoomChartRef}
            className="h-[60vh] sm:h-[65vh] w-full bg-white border border-slate-200 rounded-2xl p-4 sm:p-6 shadow-xs flex flex-col"
          >
            <ResponsiveContainer width="100%" height="100%">
              {chartType === "line" ? (
                <LineChart data={displayedData} margin={{ top: 25, right: 30, left: 10, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis
                    dataKey={xAxisKey}
                    stroke="#64748B"
                    fontSize={12}
                    tickLine={false}
                    axisLine={{ stroke: "#CBD5E1" }}
                    tick={{ fill: "#334155", fontWeight: 600 }}
                  />
                  <YAxis
                    stroke="#64748B"
                    fontSize={12}
                    tickLine={false}
                    axisLine={{ stroke: "#CBD5E1" }}
                    tick={{ fill: "#64748B" }}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const dataItem = payload[0].payload;
                        const xVal = label ?? dataItem[xAxisKey] ?? "";
                        return (
                          <div className="bg-white p-4 border border-slate-200 rounded-2xl shadow-xl text-xs space-y-2.5 min-w-[220px]">
                            <p className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-1.5">{String(xVal)}</p>
                            {dataItem.component && (
                              <p className="text-slate-500 text-xs">{dataItem.component}</p>
                            )}
                            <div className="space-y-1.5 pt-1">
                              {payload.map((entry: any, i: number) => {
                                const seriesDef = series.find((s) => s.key === entry.dataKey);
                                const labelName = entry.name || seriesDef?.label || entry.dataKey;
                                const color = entry.color || seriesDef?.color || DEFAULT_CHART_COLORS[i % DEFAULT_CHART_COLORS.length];
                                const val = entry.value;
                                const formattedVal = typeof val === "number" ? val.toLocaleString("de-DE") : val;
                                return (
                                  <div key={`zoom-line-${i}`} className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-2 truncate">
                                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                      <span className="text-slate-600 truncate">{labelName}:</span>
                                    </div>
                                    <span className="font-bold text-slate-900 shrink-0">{formattedVal}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  {series.length > 1 && <Legend wrapperStyle={{ fontSize: "13px", paddingTop: "12px" }} />}
                  {series.map((s, idx) => (
                    <Line
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      name={s.label}
                      stroke={s.color || DEFAULT_CHART_COLORS[idx % DEFAULT_CHART_COLORS.length]}
                      strokeWidth={3}
                      dot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              ) : chartType === "pie" ? (
                <PieChart>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const entry = payload[0];
                        const name = entry.name ?? entry.payload?.[xAxisKey] ?? "";
                        const val = entry.value;
                        const formattedVal = typeof val === "number" ? val.toLocaleString("de-DE") : val;
                        return (
                          <div className="bg-white p-4 border border-slate-200 rounded-2xl shadow-xl text-xs space-y-2 min-w-[200px]">
                            <p className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-1.5">{String(name)}</p>
                            <div className="flex items-center justify-between gap-4 pt-1">
                              <span className="text-slate-600">{series[0]?.label || "Wert"}:</span>
                              <span className="font-bold text-slate-900">{formattedVal}</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "13px" }} />
                  <Pie
                    data={displayedData}
                    dataKey={series[0]?.key || Object.keys(displayedData[0] || {})[1] || "value"}
                    nameKey={xAxisKey}
                    cx="50%"
                    cy="50%"
                    outerRadius={140}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  >
                    {displayedData.map((_, index) => (
                      <Cell
                        key={`zoom-pie-${index}`}
                        fill={DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                </PieChart>
              ) : (
                <BarChart
                  data={displayedData}
                  margin={{ top: 25, right: 30, left: 10, bottom: 40 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis
                    dataKey={xAxisKey}
                    stroke="#64748B"
                    fontSize={12}
                    tickLine={false}
                    axisLine={{ stroke: "#CBD5E1" }}
                    tick={{ fill: "#334155", fontWeight: 600 }}
                  />
                  <YAxis
                    stroke="#64748B"
                    fontSize={12}
                    tickLine={false}
                    axisLine={{ stroke: "#CBD5E1" }}
                    tick={{ fill: "#64748B" }}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const dataItem = payload[0].payload;
                        const xVal = label ?? dataItem[xAxisKey] ?? "";
                        return (
                          <div className="bg-white p-4 border border-slate-200 rounded-2xl shadow-xl text-xs space-y-2.5 min-w-[220px]">
                            <p className="font-bold text-slate-900 text-sm border-b border-slate-100 pb-1.5">{String(xVal)}</p>
                            {dataItem.component && (
                              <p className="text-slate-500 text-xs">{dataItem.component}</p>
                            )}
                            <div className="space-y-1.5 pt-1">
                              {payload.map((entry: any, i: number) => {
                                const seriesDef = series.find((s) => s.key === entry.dataKey);
                                const labelName = entry.name || seriesDef?.label || entry.dataKey;
                                const color = entry.color || seriesDef?.color || DEFAULT_CHART_COLORS[i % DEFAULT_CHART_COLORS.length];
                                const val = entry.value;
                                const formattedVal = typeof val === "number" ? val.toLocaleString("de-DE") : val;
                                return (
                                  <div key={`zoom-bar-${i}`} className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-2 truncate">
                                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                      <span className="text-slate-600 truncate">{labelName}:</span>
                                    </div>
                                    <span className="font-bold text-slate-900 shrink-0">{formattedVal}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  {series.length > 1 && <Legend wrapperStyle={{ fontSize: "13px", paddingTop: "12px" }} />}
                  {series.map((s, idx) => (
                    <Bar
                      key={s.key}
                      dataKey={s.key}
                      name={s.label}
                      fill={s.color || DEFAULT_CHART_COLORS[idx % DEFAULT_CHART_COLORS.length]}
                      radius={[8, 8, 0, 0]}
                      maxBarSize={70}
                    >
                      {series.length === 1 &&
                        displayedData.map((entry: any, index: number) => (
                          <Cell
                            key={`zoom-cell-${index}`}
                            fill={entry.fill || s.color || DEFAULT_CHART_COLORS[index % DEFAULT_CHART_COLORS.length]}
                            stroke={entry.stroke || undefined}
                            strokeWidth={entry.stroke ? 1.5 : 0}
                          />
                        ))}
                    </Bar>
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Footer: Relevante KI-Erkenntnis & Schnellfilter für Zeiträume */}
        <div className="p-4 sm:px-6 sm:py-4 bg-white border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 shrink-0">
          {/* KI-Erkenntnis Pill (nur anzeigen, wenn eine Erkenntnis vorhanden ist) */}
          {(summaryInsight || activeTimeframeOption.insight) ? (
            <div className="flex-1 p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 flex items-center gap-2.5 text-xs sm:text-sm">
              <Lightbulb className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 shrink-0" />
              <span>
                <strong>KI-Erkenntnis:</strong> {summaryInsight || activeTimeframeOption.insight}
              </span>
            </div>
          ) : <div className="flex-1" />}

          {/* Schnellfilter für Zeiträume */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl shrink-0 self-start md:self-center border border-slate-200">
            <span className="text-[11px] font-semibold text-slate-500 px-2 hidden sm:inline flex items-center gap-1">
              <Calendar className="h-3 w-3 text-slate-400" />
              <span>Zeitraum:</span>
            </span>
            {TIMEFRAME_OPTIONS.map((opt) => {
              const isSelected = selectedTimeframe === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedTimeframe(opt.id)}
                  className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    isSelected
                      ? "bg-white text-blue-700 shadow-xs border border-slate-200"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// 3. EDITIERBARE STÖRUNGSENTWURF-KARTE
// ============================================================================

interface OrderDraftCardProps {
  messageId: string;
  payload: {
    title: string;
    description: string;
    priority: OrderPriority;
    equipmentId?: string;
    equipmentName?: string;
    equipmentNumber?: string;
    damageCode?: string;
  };
  availableEquipments: Array<{ id: string; name: string; equipmentNumber: string; description?: string }>;
  onCommit: (draft: {
    title: string;
    description: string;
    priority: OrderPriority;
    equipmentId?: string;
    equipmentName?: string;
    damageCode?: string;
  }) => void;
  onCancel: () => void;
}

function OrderDraftCard({
  payload,
  availableEquipments,
  onCommit,
  onCancel,
}: OrderDraftCardProps) {
  const [draftTitle, setDraftTitle] = useState(payload.title || "Überhitzung Roboter");
  const [draftDescription, setDraftDescription] = useState(payload.description || "");
  const [draftPriority, setDraftPriority] = useState<OrderPriority>(payload.priority || "2_HIGH");
  const [draftEquipmentId, setDraftEquipmentId] = useState(payload.equipmentId || "");
  const [draftEquipmentName, setDraftEquipmentName] = useState(payload.equipmentName || "KUKA KR-210");
  const [draftDamageCode, setDraftDamageCode] = useState(payload.damageCode || "MECH_TEMP");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCommit = async () => {
    setIsSubmitting(true);
    try {
      await onCommit({
        title: draftTitle,
        description: draftDescription,
        priority: draftPriority,
        equipmentId: draftEquipmentId,
        equipmentName: draftEquipmentName,
        damageCode: draftDamageCode,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-blue-200 bg-white p-4 sm:p-5 rounded-2xl shadow-sm space-y-4 text-slate-900 animate-in fade-in">
      {/* Kopfzeile: ⚠️ STÖRUNGSENTWURF & Prioritäts-Dropdown */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold shadow-2xs">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
            <span>⚠️ STÖRUNGSENTWURF</span>
          </span>
          <span className="text-xs text-slate-400 hidden sm:inline">•</span>
          <span className="text-xs text-slate-500 hidden sm:inline">
            Bitte prüfe und passe die Details an
          </span>
        </div>

        {/* Priorität: [2_HIGH (Hoch) v] */}
        <div className="flex items-center gap-2">
          <label htmlFor="card-priority" className="text-xs font-semibold text-slate-700 shrink-0">
            Priorität:
          </label>
          <select
            id="card-priority"
            value={draftPriority}
            onChange={(e) => setDraftPriority(e.target.value as OrderPriority)}
            className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 min-h-[38px] text-xs font-semibold text-slate-900 outline-none focus:border-blue-600 shadow-2xs cursor-pointer"
          >
            <option value="1_EMERGENCY">🚨 1_EMERGENCY (Notfall / Stillstand)</option>
            <option value="2_HIGH">⚠️ 2_HIGH (Hoch)</option>
            <option value="3_MEDIUM">🟡 3_MEDIUM (Mittel)</option>
            <option value="4_LOW">⚪ 4_LOW (Niedrig)</option>
          </select>
        </div>
      </div>

      {/* Formular-Felder */}
      <div className="space-y-3.5 text-xs sm:text-sm">
        {/* Titel-Feld */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Titel:
          </label>
          <input
            type="text"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder="Überhitzung KUKA KR-210 (Rohbau Zelle 1)"
            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 min-h-[40px] text-xs sm:text-sm font-semibold text-slate-900 outline-none focus:border-blue-600 focus:bg-white transition-all shadow-2xs"
          />
        </div>

        {/* Equipment & Schadenscode nebeneinander */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Equipment */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Equipment:
            </label>
            <select
              value={draftEquipmentId}
              onChange={(e) => {
                const eqId = e.target.value;
                setDraftEquipmentId(eqId);
                const found = availableEquipments.find((eq) => eq.id === eqId);
                if (found) {
                  setDraftEquipmentName(found.name);
                }
              }}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 min-h-[40px] text-xs text-slate-900 outline-none focus:border-blue-600 focus:bg-white shadow-2xs cursor-pointer"
            >
              <option value="">Equipment wählen...</option>
              {availableEquipments.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.name} ({eq.equipmentNumber})
                </option>
              ))}
            </select>
          </div>

          {/* Schadenscode */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Schadenscode:
            </label>
            <select
              value={draftDamageCode}
              onChange={(e) => setDraftDamageCode(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 min-h-[40px] text-xs font-mono text-slate-900 outline-none focus:border-blue-600 focus:bg-white shadow-2xs cursor-pointer"
            >
              {DAMAGE_CODE_OPTIONS.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Beschreibung */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Beschreibung:
          </label>
          <textarea
            rows={2}
            value={draftDescription}
            onChange={(e) => setDraftDescription(e.target.value)}
            placeholder="Roboter ist überhitzt, Antriebsmotor Achse 2 heiß"
            className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs sm:text-sm text-slate-900 outline-none focus:border-blue-600 focus:bg-white shadow-2xs resize-none"
          />
        </div>
      </div>

      {/* Aktionsleiste: [✅ Störung verbindlich anlegen] [📝 Im Vollformular öffnen] [Abbrechen] */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-3 border-t border-slate-100">
        <div className="flex flex-wrap items-center gap-2">
          {/* Primär: [✅ Störung verbindlich anlegen] */}
          <button
            type="button"
            disabled={isSubmitting || !draftTitle.trim()}
            onClick={handleCommit}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer active:scale-95"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Lege Störung an...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                <span>✅ Störung verbindlich anlegen</span>
              </>
            )}
          </button>

          {/* Sekundär: [📝 Im Vollformular öffnen] */}
          <Link
            href={`/orders/new?title=${encodeURIComponent(draftTitle)}&description=${encodeURIComponent(draftDescription)}&priority=${draftPriority}${draftEquipmentId ? `&equipmentId=${draftEquipmentId}` : ""}${draftDamageCode ? `&damageCode=${draftDamageCode}` : ""}`}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-all"
          >
            <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
            <span>📝 Im Vollformular öffnen</span>
          </Link>
        </div>

        {/* Abbrechen */}
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center justify-center px-3 py-2 min-h-[40px] rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 text-xs font-medium transition-colors cursor-pointer"
        >
          Abbrechen
        </button>
      </div>
    </Card>
  );
}

// ============================================================================
// 4. TABELLEN-NACHRICHT-KARTE (TABLE VIEW)
// ============================================================================

interface TableViewMessageCardProps {
  messageId: string;
  payload: {
    orders?: OrderWithRelations[];
    filters?: QueryOrdersFilters;
    title?: string;
    chartData?: any[];
    series?: Array<{ key: string; label: string; color?: string }>;
    xAxisKey?: string;
    [key: string]: any;
  };
  initialOrders: OrderWithRelations[];
  onToggleView: () => void;
  onRowClick: (orderId: string) => void;
}

function TableViewMessageCard({
  payload,
  initialOrders,
  onToggleView,
  onRowClick,
}: TableViewMessageCardProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const isChartDataTable = Boolean(
    payload?.chartData &&
      Array.isArray(payload.chartData) &&
      payload.chartData.length > 0 &&
      (!payload?.orders || payload.orders.length === 0)
  );

  const orders = payload?.orders && payload.orders.length > 0 ? payload.orders : initialOrders;

  const filteredOrders = useMemo(() => {
    if (!searchTerm.trim()) return orders;
    const term = searchTerm.toLowerCase().trim();
    return orders.filter(
      (o: any) =>
        o.orderNumber?.toLowerCase().includes(term) ||
        o.title?.toLowerCase().includes(term) ||
        o.equipment?.name?.toLowerCase().includes(term) ||
        o.functionalLocation?.code?.toLowerCase().includes(term)
    );
  }, [orders, searchTerm]);

  const filteredChartData = useMemo(() => {
    if (!isChartDataTable) return [];
    const data: any[] = payload.chartData || [];
    if (!searchTerm.trim()) return data;
    const term = searchTerm.toLowerCase().trim();
    return data.filter((row: any) =>
      Object.values(row).some((val) =>
        String(val ?? "").toLowerCase().includes(term)
      )
    );
  }, [isChartDataTable, payload?.chartData, searchTerm]);

  if (isChartDataTable) {
    const dataList = payload.chartData || [];
    const rawKeys = Object.keys(dataList[0] || {});
    const columns = rawKeys.filter((k) => k !== "fill" && k !== "stroke");

    return (
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden space-y-3 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">
              {payload?.title || "Daten-Tabelle"}
            </h3>
            <p className="text-xs text-slate-500">
              {filteredChartData.length} Datensätze gefunden
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* In-Tabelle Suche */}
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filtern..."
                className="bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-2.5 py-1 min-h-[36px] text-xs text-slate-900 outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>

            {/* Umschalten auf Diagramm */}
            <button
              type="button"
              onClick={onToggleView}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs cursor-pointer"
            >
              <BarChart2 className="h-3.5 w-3.5 text-slate-500" />
              <span>📊 Als Diagramm</span>
            </button>
          </div>
        </div>

        {/* Tabelle */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
              <tr>
                {columns.map((col) => {
                  const s = payload?.series?.find((item: any) => item.key === col);
                  const label = s?.label || col;
                  return (
                    <th key={col} className="py-2.5 px-3">
                      {label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredChartData.map((row: any, idx: number) => (
                <tr key={`chart-row-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                  {columns.map((col) => {
                    const val = row[col];
                    const formatted = typeof val === "number" ? val.toLocaleString("de-DE") : String(val ?? "-");
                    return (
                      <td key={col} className="py-2.5 px-3 font-medium text-slate-900">
                        {formatted}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {filteredChartData.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="py-6 text-center text-slate-400">
                    Keine Datensätze gefunden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden space-y-3 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <h3 className="font-bold text-slate-900 text-sm">
            {payload?.title || "Auftragsübersicht"}
          </h3>
          <p className="text-xs text-slate-500">
            {filteredOrders.length} Aufträge gefunden
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* In-Tabelle Suche */}
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtern..."
              className="bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-2.5 py-1 min-h-[36px] text-xs text-slate-900 outline-none focus:border-blue-600 focus:bg-white"
            />
          </div>

          {/* Export Dropdown (Excel & CSV) */}
          <TableExportDropdown orders={filteredOrders} title={payload?.title} />

          {/* Umschalten auf Diagramm */}
          <button
            type="button"
            onClick={onToggleView}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs cursor-pointer"
          >
            <BarChart2 className="h-3.5 w-3.5 text-slate-500" />
            <span>📊 Als Diagramm</span>
          </button>
        </div>
      </div>

      {/* Tabelle */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
            <tr>
              <th className="py-2.5 px-3">Nr.</th>
              <th className="py-2.5 px-3">Prio</th>
              <th className="py-2.5 px-3">Maßnahme / Titel</th>
              <th className="py-2.5 px-3">Equipment</th>
              <th className="py-2.5 px-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredOrders.slice(0, 10).map((order: any) => {
              const isEmergency = order.priority === "1_EMERGENCY";
              const isHigh = order.priority === "2_HIGH";

              return (
                <tr
                  key={order.id}
                  onClick={() => onRowClick(order.id)}
                  className="hover:bg-blue-50/60 cursor-pointer transition-colors"
                  title="Auftragsdetails öffnen"
                >
                  <td className="py-2.5 px-3 font-mono font-bold text-blue-600">
                    {order.orderNumber}
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${
                        isEmergency
                          ? "bg-rose-100 text-rose-800 border-rose-200"
                          : isHigh
                          ? "bg-amber-100 text-amber-800 border-amber-200"
                          : "bg-slate-100 text-slate-700 border-slate-200"
                      }`}
                    >
                      {isEmergency ? "🚨 HOCH" : isHigh ? "⚠️ MITTEL" : "NIEDRIG"}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-medium text-slate-900 max-w-xs truncate">
                    {order.title}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px] truncate max-w-[150px]">
                    {order.equipment?.name || order.functionalLocation?.code || "-"}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                      {order.currentStatus?.name || "Offen"}
                    </span>
                  </td>
                </tr>
              );
            })}

            {filteredOrders.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-400">
                  Keine passenden Aufträge gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
