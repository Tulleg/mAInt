"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Mic,
  MicOff,
  Send,
  Sparkles,
  Star,
  RefreshCw,
  Search,
  ExternalLink,
  Camera,
  AlertTriangle,
  CheckCircle2,
  Clock,
  X,
  ChevronDown,
  Loader2,
  Flame,
  Wrench,
  Check,
  Table as TableIcon,
  BarChart2,
  Wand2,
  Lightbulb,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { useInterval } from "@/hooks/use-interval";
import { toast } from "sonner";
import { useWorkspace } from "@/components/layout/workspace-context";
import { queryOrdersAction, OrderWithRelations, QueryOrdersFilters } from "@/actions/order-actions";
import { classifyCopilotInputAction } from "@/actions/copilot-actions";
import {
  CopilotChatMessage,
  ClarificationResult,
  CreateOrderParams,
  AnalyticsChartParams,
} from "@/lib/ai/copilot";
import { createSavedView } from "@/actions/saved-view-actions";
import { OrderDetailsModal } from "@/components/orders/order-details-modal";

export interface SingleInputWorkspaceProps {
  initialOrders?: OrderWithRelations[];
}

export function SingleInputWorkspace({ initialOrders = [] }: SingleInputWorkspaceProps) {
  const router = useRouter();
  const {
    activeView,
    activeViewId,
    workspaceResetToken,
    clearActiveView,
    addSavedView,
    currentUser,
    savedViews,
  } = useWorkspace();

  // Prompt / Input State
  const [isPending, startTransition] = useTransition();
  const [prompt, setPrompt] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Foto-Upload State
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<{
    file: File;
    name: string;
    previewUrl: string;
  } | null>(null);

  // Conversational State & Clarification Loop
  const [chatHistory, setChatHistory] = useState<CopilotChatMessage[]>([]);
  const [clarification, setClarification] = useState<ClarificationResult | null>(null);
  const [createOrderDraft, setCreateOrderDraft] = useState<CreateOrderParams | null>(null);
  const [analyticsDraft, setAnalyticsDraft] = useState<AnalyticsChartParams | null>(null);
  const [viewConfigSuccess, setViewConfigSuccess] = useState<string | null>(null);

  // Auftragsdaten & Filter
  const [orders, setOrders] = useState<OrderWithRelations[]>(initialOrders);
  const [currentFilters, setCurrentFilters] = useState<QueryOrdersFilters>({});
  const [tableSearchTerm, setTableSearchTerm] = useState("");

  // Ansichts-Optionen (Toolbar)
  const [refreshInterval, setRefreshInterval] = useState<number>(0); // 0 = Aus, 30, 60, 300
  const [displayDensity, setDisplayDensity] = useState<"compact" | "standard" | "detailed">("standard");
  const [viewMode, setViewMode] = useState<"table" | "chart">("table");
  const [chartType, setChartType] = useState<string>("bar");

  // Speech Recognition State
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Popover / Modal für "Zu Favoriten hinzufügen"
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [favoriteName, setFavoriteName] = useState("");
  const [favoriteIcon, setFavoriteIcon] = useState("star");
  const [isSavingFavorite, setIsSavingFavorite] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Detail- & Bearbeitungs-Modal für interaktiven Zeilenklick
  const [selectedOrderIdForModal, setSelectedOrderIdForModal] = useState<string | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  const handleRowClick = (orderId: string) => {
    setSelectedOrderIdForModal(orderId);
    setIsDetailsModalOpen(true);
  };

  // 1. Wenn ein Favorit in der linken Seitenleiste geklickt wurde:
  useEffect(() => {
    if (activeView) {
      setPrompt(activeView.name);
      setFavoriteName(activeView.name);
      setDisplayDensity((activeView.displayDensity as any) || "standard");
      setRefreshInterval(activeView.refreshInterval || 0);

      const filters: QueryOrdersFilters = (activeView.filterPayload as QueryOrdersFilters) || {};
      setCurrentFilters(filters);
      setHasSearched(true);

      // Daten für den Favoriten laden
      loadOrders(filters);
    }
  }, [activeView]);

  // 1b. Workspace-Zustand sauber zurücksetzen wenn [+] geklickt wurde
  useEffect(() => {
    if (workspaceResetToken > 0) {
      setPrompt("");
      setFavoriteName("");
      setDisplayDensity("standard");
      setRefreshInterval(0);
      setCurrentFilters({});
      setOrders(initialOrders);
      setHasSearched(false);
      setChatHistory([]);
      setClarification(null);
      setCreateOrderDraft(null);
      setAnalyticsDraft(null);
      setViewConfigSuccess(null);
      setErrorMessage(null);
      setSelectedPhoto(null);
      setTableSearchTerm("");
    }
  }, [workspaceResetToken, initialOrders]);

  // Funktion zum Abrufen der Aufträge mit Filtern (nicht-blockierend via useTransition)
  const loadOrders = useCallback((filters: QueryOrdersFilters, isBackgroundRefresh = false) => {
    if (isBackgroundRefresh) {
      setIsRefreshing(true);
    } else {
      setIsAnalyzing(true);
    }
    setErrorMessage(null);

    startTransition(async () => {
      try {
        const res = await queryOrdersAction(filters);
        if (res && Array.isArray(res)) {
          setOrders(res);
        }
      } catch (err: any) {
        console.error("Fehler beim Laden der Aufträge:", err);
        setErrorMessage(err?.message || "Fehler beim Laden der Auftragsdaten.");
      } finally {
        setIsAnalyzing(false);
        setIsRefreshing(false);
      }
    });
  }, []);

  // 2. Auto-Refresh Interval Polling
  useInterval(
    () => {
      if (hasSearched && refreshInterval > 0) {
        loadOrders(currentFilters, true);
      }
    },
    refreshInterval > 0 ? refreshInterval * 1000 : null
  );

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
      alert("Spracherkennung wird in diesem Browser leider nicht unterstützt. Bitte Freitext eingeben.");
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

  // 5. Absenden der Abfrage (Intent-Erkennung & QUERY_ORDERS Tabellenanzeige)
  const handleSubmitQuery = async (
    queryText?: string,
    optionId?: string,
    optionField?: "area" | "equipment" | "general"
  ) => {
    const textToSubmit = (queryText || prompt).trim();
    if (!textToSubmit && !selectedPhoto) return;

    setIsAnalyzing(true);
    setErrorMessage(null);
    setHasSearched(true);
    setFavoriteName(textToSubmit || "Foto-Anfrage");

    startTransition(async () => {
      try {
        const nextHistory: CopilotChatMessage[] = [
          ...chatHistory,
          {
            role: "user",
            content: textToSubmit || "[Foto hochgeladen]",
            clarificationSelection:
              optionId && optionField
                ? { id: optionId, value: textToSubmit, field: optionField }
                : undefined,
          },
        ];

        // Intent-Erkennung aufrufen
        const classification = await classifyCopilotInputAction({
          prompt: textToSubmit || "Aufträge analysieren",
          chatHistory: nextHistory,
          selectedOptionId: optionId,
          clarificationSelection:
            optionId && optionField
              ? { id: optionId, value: textToSubmit, field: optionField }
              : undefined,
        });

        // Clarification Loop prüfen
        if (classification.clarification.needed) {
          setClarification(classification.clarification);
          setChatHistory([
            ...nextHistory,
            {
              role: "assistant",
              content: classification.clarification.question || "Bitte präzisiere deine Anfrage.",
              intent: classification.intent,
            },
          ]);
          return;
        } else {
          setClarification(null);
          setChatHistory([
            ...nextHistory,
            {
              role: "assistant",
              content: classification.explanation,
              intent: classification.intent,
            },
          ]);
        }

        // Intents verzweigen
        if (classification.intent === "UPDATE_VIEW_CONFIG" && classification.updateViewConfig) {
          const u = classification.updateViewConfig;
          if (u.refreshInterval !== undefined) {
            setRefreshInterval(u.refreshInterval);
          }
          if (u.displayDensity) {
            setDisplayDensity(u.displayDensity);
          }
          setViewConfigSuccess(classification.explanation || "Ansichtseinstellungen aktualisiert.");
          setTimeout(() => setViewConfigSuccess(null), 4000);
        } else if (classification.intent === "CREATE_ORDER" && classification.createOrder) {
          setCreateOrderDraft(classification.createOrder);
        } else if (classification.intent === "ANALYTICS_CHART" && classification.analyticsChart) {
          setAnalyticsDraft(classification.analyticsChart);
        } else if (classification.intent === "QUERY_ORDERS" && classification.queryOrders) {
          const q = classification.queryOrders;
          const filters: QueryOrdersFilters = {
            areaId: q.areaId,
            statusList: q.statusList,
            priorityList: q.priorityList,
            search: q.searchQuery || (q.equipmentName ? q.equipmentName : undefined),
          };
          setCurrentFilters(filters);
          loadOrders(filters);
        } else {
          // Fallback: Direkte Volltextsuche über den Prompt
          const fallbackFilters: QueryOrdersFilters = {
            search: textToSubmit,
          };
          setCurrentFilters(fallbackFilters);
          loadOrders(fallbackFilters);
        }
      } catch (err: any) {
        console.warn("Intent-Erkennung Fallback, führe Volltextsuche aus:", err);
        const fallbackFilters: QueryOrdersFilters = { search: textToSubmit };
        setCurrentFilters(fallbackFilters);
        loadOrders(fallbackFilters);
      } finally {
        setIsAnalyzing(false);
      }
    });
  };

  // 6. Zu Favoriten hinzufügen (nicht-blockierend)
  const handleSaveFavorite = () => {
    if (!favoriteName.trim()) return;

    setIsSavingFavorite(true);
    startTransition(async () => {
      try {
        const created = await createSavedView({
          name: favoriteName.trim(),
          icon: favoriteIcon || "star",
          intent: "QUERY_ORDERS",
          filterPayload: currentFilters,
          refreshInterval,
          displayDensity,
        });

        if (created) {
          addSavedView(created);
          setSaveSuccessMessage(`Favorit "${favoriteName.trim()}" erfolgreich gespeichert!`);
          setTimeout(() => {
            setSaveSuccessMessage(null);
            setSaveModalOpen(false);
          }, 1500);
        }
      } catch (err: any) {
        console.error("Fehler beim Speichern des Favoriten:", err);
        alert(err.message || "Fehler beim Speichern des Favoriten.");
      } finally {
        setIsSavingFavorite(false);
      }
    });
  };

  // 7. Sofortfilterung der Tabellenzeilen im Speicher
  const filteredOrders = useMemo(() => {
    if (!tableSearchTerm.trim()) return orders;
    const term = tableSearchTerm.toLowerCase().trim();

    return orders.filter((o) => {
      const matchNumber = o.orderNumber?.toLowerCase().includes(term);
      const matchTitle = o.title?.toLowerCase().includes(term);
      const matchDesc = o.description?.toLowerCase().includes(term);
      const matchFloc = o.functionalLocation?.code?.toLowerCase().includes(term);
      const matchEq =
        o.equipment?.name?.toLowerCase().includes(term) ||
        o.equipment?.equipmentNumber?.toLowerCase().includes(term);
      const matchStatus =
        o.currentStatus?.name?.toLowerCase().includes(term) ||
        o.currentStatus?.code?.toLowerCase().includes(term);
      const matchPrio = o.priority?.toLowerCase().includes(term);

      return (
        matchNumber ||
        matchTitle ||
        matchDesc ||
        matchFloc ||
        matchEq ||
        matchStatus ||
        matchPrio
      );
    });
  }, [orders, tableSearchTerm]);

  // Diagramm-Auswertung: Prompt-to-Chart Daten (Dynamisch aus Tabellendaten / Halle 1 Störungen nach Gewerk & Priorität)
  const chartItems = useMemo(() => {
    if (filteredOrders.length > 0) {
      return filteredOrders.map((order, idx) => {
        const titleLower = (order.title || "").toLowerCase();
        const descLower = (order.description || "").toLowerCase();
        const eqLower = (order.equipment?.name || "").toLowerCase();
        const combined = `${titleLower} ${descLower} ${eqLower}`;

        let gewerk = "Mechanik";
        if (
          combined.includes("pneumatik") ||
          combined.includes("druck") ||
          combined.includes("ventil") ||
          combined.includes("zylinder")
        ) {
          gewerk = "Pneumatik";
        } else if (
          combined.includes("elektr") ||
          combined.includes("schalter") ||
          combined.includes("sensor") ||
          combined.includes("kabel") ||
          combined.includes("not-halt")
        ) {
          gewerk = "Elektrik";
        } else if (
          combined.includes("hydraulik") ||
          combined.includes("öl") ||
          combined.includes("pumpe")
        ) {
          gewerk = "Hydraulik";
        }

        const prio = String(order.priority || "").toUpperCase();
        let priorityLabel = "Prio 3 / Niedrig";
        let fill = "#93C5FD"; // Pastellblau
        let stroke = "#3B82F6";
        let value = 30 + ((idx * 17) % 35);
        let downtime = "20m Störung";

        if (prio.includes("1") || prio.includes("EMERGENCY") || prio.includes("NOTFALL")) {
          priorityLabel = "Prio 1 / Hoch";
          fill = "#FCA5A5"; // Pastellrot
          stroke = "#EF4444";
          value = 90 + ((idx * 7) % 10);
          downtime = "1h 45m Stillstand";
        } else if (prio.includes("2") || prio.includes("HIGH") || prio.includes("HOCH")) {
          priorityLabel = "Prio 2 / Mittel";
          fill = "#FCD34D"; // Pastellgelb
          stroke = "#F59E0B";
          value = 60 + ((idx * 11) % 25);
          downtime = "45m Stillstand";
        }

        const eqName = order.equipment?.name;
        const displayName = eqName || order.title || `Auftrag #${order.orderNumber}`;
        const subComponent =
          eqName && order.title !== eqName
            ? order.title
            : order.description || "Störungsbehebung";

        return {
          name: displayName,
          component: subComponent,
          gewerk,
          downtime,
          priorityLabel,
          value,
          fill,
          stroke,
        };
      });
    }

    return [
      {
        name: "KUKA Roboter KR210",
        component: "Achse 2 • Schleppfehler",
        gewerk: "Mechanik",
        downtime: "1h 45m Stillstand",
        priorityLabel: "Prio 1 / Hoch",
        value: 92,
        fill: "#FCA5A5", // Pastellrot
        stroke: "#EF4444",
      },
      {
        name: "Förderband B3",
        component: "Antriebsmotor • Riemenriss",
        gewerk: "Mechanik",
        downtime: "2h 10m Stillstand",
        priorityLabel: "Prio 1 / Hoch",
        value: 98,
        fill: "#FCA5A5", // Pastellrot
        stroke: "#EF4444",
      },
      {
        name: "Pneumatik Zelle 3",
        component: "Hauptventil • Druckverlust",
        gewerk: "Pneumatik",
        downtime: "45m Druckabfall",
        priorityLabel: "Prio 2 / Mittel",
        value: 58,
        fill: "#FCD34D", // Pastellgelb
        stroke: "#F59E0B",
      },
      {
        name: "Schutzgitter Roboter 4",
        component: "Endlagenschalter dejustiert",
        gewerk: "Elektrik",
        downtime: "20m Störung",
        priorityLabel: "Prio 3 / Niedrig",
        value: 30,
        fill: "#93C5FD", // Pastellblau
        stroke: "#3B82F6",
      },
    ];
  }, [filteredOrders]);

  // Helper für Prioritäts-Badges nach docs/design-rules.md:
  // - Prio 1 / Notfall: bg-rose-100 text-rose-700 border-rose-200 font-semibold px-2 py-0.5 rounded-md text-xs (Badge: "HOCH")
  // - Prio 2 / Mittel: bg-amber-100 text-amber-800 border-amber-200 font-medium px-2 py-0.5 rounded-md text-xs (Badge: "MITTEL")
  // - Prio 3 / Niedrig: bg-slate-100 text-slate-700 border-slate-200 px-2 py-0.5 rounded-md text-xs (Badge: "NIEDRIG")
  const renderPriorityBadge = (priority: string) => {
    switch (priority) {
      case "1_EMERGENCY":
      case "1":
      case "EMERGENCY":
        return (
          <span className="inline-flex items-center gap-1 border bg-rose-100 text-rose-700 border-rose-200 font-semibold px-2 py-0.5 rounded-md text-xs">
            <Flame className="h-3 w-3 text-rose-600 shrink-0" />
            <span>HOCH</span>
          </span>
        );
      case "2_HIGH":
      case "2":
      case "HIGH":
        return (
          <span className="inline-flex items-center gap-1 border bg-amber-100 text-amber-800 border-amber-200 font-medium px-2 py-0.5 rounded-md text-xs">
            <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
            <span>MITTEL</span>
          </span>
        );
      case "3_MEDIUM":
      case "3":
      case "MEDIUM":
      case "4_LOW":
      case "4":
      case "LOW":
      default:
        return (
          <span className="inline-flex items-center gap-1 border bg-slate-100 text-slate-700 border-slate-200 px-2 py-0.5 rounded-md text-xs">
            <span>NIEDRIG</span>
          </span>
        );
    }
  };

  // Helper für Status-Badges nach docs/design-rules.md:
  // - ERFASST / NEU: bg-sky-50 text-sky-700 border-sky-200
  // - IN_ARBEIT: bg-amber-50 text-amber-700 border-amber-200
  // - ABGESCHLOSSEN / TABG: bg-emerald-50 text-emerald-700 border-emerald-200
  const renderStatusBadge = (statusName?: string, statusCode?: string) => {
    const code = statusCode?.toUpperCase() || "";
    const name = statusName || code || "Offen";

    if (code === "IN_PROGRESS" || code === "IN_WORK" || code === "IN ARBEIT" || code === "IN_ARBEIT") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-medium bg-amber-50 text-amber-700 border-amber-200">
          <Clock className="h-3 w-3 text-amber-600 shrink-0" />
          <span>{name}</span>
        </span>
      );
    }
    if (
      code === "COMPLETED" ||
      code === "TECH_COMPLETED" ||
      code === "CLOSED" ||
      code === "TABG" ||
      code === "ABGESCHLOSSEN"
    ) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-medium bg-emerald-50 text-emerald-700 border-emerald-200">
          <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
          <span>{name}</span>
        </span>
      );
    }
    if (code === "CREATED" || code === "ERFASST" || code === "NEW" || code === "NEU") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-medium bg-sky-50 text-sky-700 border-sky-200">
          <span>{name}</span>
        </span>
      );
    }
    if (code === "RELEASED" || code === "FREIGEGEBEN") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-medium bg-indigo-50 text-indigo-700 border-indigo-200">
          <span>{name}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-medium bg-slate-100 text-slate-700 border-slate-200">
        <span>{name}</span>
      </span>
    );
  };

  // Helper für Herkunft-Badges (SAP vs Lokal) nach docs/design-rules.md:
  // - SAP: bg-indigo-50 text-indigo-700 border-indigo-200 font-medium text-xs
  // - Lokal: bg-slate-100 text-slate-600 border-slate-200 text-xs
  const renderOriginBadge = (sapOrderNr?: string | null) => {
    if (sapOrderNr) {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-mono bg-indigo-50 text-indigo-700 border-indigo-200 font-medium text-xs"
          title={`SAP PM Auftragsnummer: ${sapOrderNr}`}
        >
          SAP: {sapOrderNr}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-xs bg-slate-100 text-slate-600 border-slate-200">
        Lokal
      </span>
    );
  };

  // Schnellauswahl-Vorschläge für initialen Zustand
  const quickChips = [
    "Offene Störungen in Halle 1",
    "Notfälle & Prio 1",
    "Meine offenen Tasks",
    "Wartungsaufträge KW 43",
    "Antriebsüberlast Achse 2",
  ];

  const intervalText =
    refreshInterval === 30
      ? "30s"
      : refreshInterval === 60
      ? "1m"
      : refreshInterval === 300
      ? "5m"
      : "Aus";

  const headerPadding =
    displayDensity === "compact"
      ? "py-2 px-3"
      : displayDensity === "detailed"
      ? "py-5 px-6"
      : "py-3.5 px-4";

  return (
    <div className="flex-1 flex flex-col min-h-full">
      {/* Verstecktes Datei-Upload-Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handlePhotoSelect}
        accept="image/*"
        className="hidden"
        aria-label="Foto aufnehmen oder hochladen"
      />

      {/* ========================================================================= */}
      {/* FALL A: INITIALER ZUSTAND (GROSSES, ZENTRIERTES OMNI-EINGABEFELD)          */}
      {/* ========================================================================= */}
      {!hasSearched && !activeView && (
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 my-auto max-w-3xl mx-auto w-full">
          <div className="text-center mb-4 space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold mb-1 shadow-2xs">
              <span>⚡ Fokus-Workspace Rohbau</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Guten Morgen, Max
            </h1>
            <p className="text-slate-500 text-sm max-w-lg mx-auto">
              Bereit für deine Schicht in Werk 01 - Rohbau. Was liegt heute an?
            </p>
          </div>

          {/* Zentrales Omni-Eingabefeld im Light-Look */}
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

            {/* Foto Vorschau falls ausgewählt */}
            {selectedPhoto && (
              <div className="flex items-center gap-3 p-2 bg-slate-50 rounded-xl border border-slate-200 my-2">
                <img
                  src={selectedPhoto.previewUrl}
                  alt="Vorschau"
                  className="h-12 w-12 object-cover rounded-lg border border-slate-300"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-900 truncate">{selectedPhoto.name}</p>
                  <p className="text-[10px] text-slate-500">Foto angehängt</p>
                </div>
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                  title="Foto entfernen"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-slate-200 mt-2">
              <div className="flex items-center gap-2">
                {/* Mikrofon Button mit Mindestklickgröße min-h-[44px] */}
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`inline-flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[44px] rounded-xl text-xs font-semibold transition-all ${
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

                {/* Foto-Upload Button mit Mindestklickgröße min-h-[44px] */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 min-h-[44px] rounded-xl text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
                  title="Foto aufnehmen oder hochladen"
                >
                  <Camera className="h-4 w-4 text-slate-500" />
                  <span>Foto</span>
                </button>
              </div>

              {/* Senden Button mit Mindestklickgröße min-h-[44px] */}
              <button
                type="button"
                disabled={(!prompt.trim() && !selectedPhoto) || isAnalyzing}
                onClick={() => handleSubmitQuery()}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 min-h-[44px] rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold shadow-sm transition-all active:scale-95"
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

          {/* Schnellfilter / Chips der Frame 1 */}
          <div className="flex flex-wrap items-center justify-center gap-3 mt-4 max-w-2xl">
            <button
              type="button"
              onClick={() => {
                const query = "Akute Störung melden";
                setPrompt(query);
                handleSubmitQuery(query);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-200 text-xs font-semibold shadow-2xs transition-all"
            >
              <Flame className="h-4 w-4 text-rose-600 shrink-0" />
              <span>Akute Störung melden</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const query = "Auswertung / Chart erstellen";
                setPrompt(query);
                handleSubmitQuery(query);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-medium shadow-2xs transition-all"
            >
              <BarChart2 className="h-4 w-4 text-slate-600 shrink-0" />
              <span>Auswertung / Chart erstellen</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const query = "Equipment suchen";
                setPrompt(query);
                handleSubmitQuery(query);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-medium shadow-2xs transition-all"
            >
              <Search className="h-4 w-4 text-slate-600 shrink-0" />
              <span>Equipment suchen</span>
            </button>
          </div>

          {/* EmptyState-Card der Startseite (Frame 1) */}
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

          {/* Clarification Loop Rückfrage-Optionen im initialen State */}
          {clarification?.needed && (
            <div className="w-full mt-4 p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 shadow-sm space-y-3 animate-in fade-in">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <Sparkles className="h-4 w-4 text-amber-600 shrink-0" />
                <span>{clarification.question || "Bitte wähle eine Option zur Präzisierung:"}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {clarification.options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setPrompt(opt.label);
                      handleSubmitQuery(opt.label, opt.id, opt.field);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-lg bg-white hover:bg-amber-100 text-amber-900 text-xs font-semibold border border-amber-300 shadow-2xs transition-all active:scale-95"
                  >
                    <span>{opt.label}</span>
                    {opt.description && (
                      <span className="text-[10px] text-amber-700 font-normal">({opt.description})</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Störungserfassungs-Dialog Entwurf (CREATE_ORDER) im initialen State */}
          {createOrderDraft && (
            <div className="w-full mt-4 p-4 rounded-xl bg-white border border-slate-200 text-slate-900 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold">
                  <Wrench className="h-3 w-3" />
                  Störungserfassungs-Dialog
                </div>
                <h3 className="text-sm font-bold text-slate-900">{createOrderDraft.title}</h3>
                <p className="text-xs text-slate-500 line-clamp-1">{createOrderDraft.description}</p>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  {createOrderDraft.equipmentName && (
                    <span>
                      Anlage: <strong className="text-blue-700">{createOrderDraft.equipmentName}</strong>
                    </span>
                  )}
                  <span>
                    Prio: <strong className="text-amber-700">{createOrderDraft.priority}</strong>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href={`/orders/new?title=${encodeURIComponent(createOrderDraft.title)}&description=${encodeURIComponent(createOrderDraft.description)}&priority=${createOrderDraft.priority}${createOrderDraft.matchedEquipmentId ? `&equipmentId=${createOrderDraft.matchedEquipmentId}` : ""}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all"
                >
                  <span>Im Erfassungsdialog öffnen</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
                <button
                  type="button"
                  onClick={() => setCreateOrderDraft(null)}
                  className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600"
                  title="Schließen"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* FALL B: ERGEBNIS-ANSICHT (OMNI-FELD OBEN + TABELLE DIREKT DARUNTER)       */}
      {/* ========================================================================= */}
      {(hasSearched || activeView) && (
        <div className="flex-1 flex flex-col p-4 md:p-6 space-y-4 max-w-7xl mx-auto w-full">
          {/* 1. OMNI-EINGABEFELD IM LIGHT-LOOK */}
          <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-sm flex flex-col gap-2">
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Mikrofon Button */}
              <button
                type="button"
                onClick={toggleListening}
                className={`p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-xs font-semibold shrink-0 transition-all ${
                  isListening
                    ? "bg-rose-600 text-white animate-pulse"
                    : "bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200"
                }`}
                title={isListening ? "Sprachaufnahme stoppen" : "Spracheingabe starten"}
              >
                {isListening ? <MicOff className="h-4 w-4 text-white" /> : <Mic className="h-4 w-4 text-blue-600" />}
              </button>

              {/* Foto-Upload Button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 shrink-0 transition-colors"
                title="Foto aufnehmen oder hochladen"
              >
                <Camera className="h-4 w-4 text-slate-500" />
              </button>

              {/* Eingabefeld */}
              <div className="flex-1 relative">
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
                  placeholder="Neue Anfrage stellen..."
                  className="w-full bg-transparent text-slate-900 text-sm outline-none px-2 py-2 placeholder:text-slate-400"
                />
              </div>

              {/* Clear / Reset Button */}
              {prompt && (
                <button
                  type="button"
                  onClick={() => {
                    setPrompt("");
                    clearActiveView();
                    setHasSearched(false);
                    handleRemovePhoto();
                  }}
                  className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                  title="Suche zurücksetzen"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              {/* Senden Button */}
              <button
                type="button"
                disabled={(!prompt.trim() && !selectedPhoto) || isAnalyzing}
                onClick={() => handleSubmitQuery()}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[44px] rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold shadow-xs transition-all"
              >
                {isAnalyzing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <span>Senden</span>
                    <Send className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </div>

            {/* Foto Vorschau falls im Ergebnis-Modus angehängt */}
            {selectedPhoto && (
              <div className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg border border-slate-200 mt-1">
                <img
                  src={selectedPhoto.previewUrl}
                  alt="Vorschau"
                  className="h-10 w-10 object-cover rounded border border-slate-300"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-900 truncate">{selectedPhoto.name}</p>
                </div>
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="p-1 text-slate-400 hover:text-rose-600"
                  title="Foto entfernen"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* Bot Answer-Banner (Frame 2) */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <span className="text-lg">🤖</span>
              <span className="text-blue-900 font-medium text-xs sm:text-sm">
                MaintAI: Hier sind die Störungen für &apos;Halle 1&apos; visualisiert nach Priorität und Ausfallursache
              </span>
            </div>
            <span className="self-start sm:self-center px-2.5 py-1 rounded bg-blue-100 border border-blue-200 text-blue-700 font-bold text-[10px] tracking-wider shrink-0">
              PROMPT-TO-CHART
            </span>
          </div>

          {/* Fehlermeldung falls aufgetreten */}
          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Clarification Loop Rückfrage-Optionen in Ergebnis-Ansicht */}
          {clarification?.needed && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 shadow-sm space-y-3 animate-in fade-in">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <Sparkles className="h-4 w-4 text-amber-600 shrink-0" />
                <span>{clarification.question || "Bitte wähle eine Option zur Präzisierung:"}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {clarification.options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setPrompt(opt.label);
                      handleSubmitQuery(opt.label, opt.id, opt.field);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-lg bg-white hover:bg-amber-100 text-amber-900 text-xs font-semibold border border-amber-300 shadow-2xs transition-all active:scale-95"
                  >
                    <span>{opt.label}</span>
                    {opt.description && (
                      <span className="text-[10px] text-amber-700 font-normal">({opt.description})</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* View-Config Erfolgsmeldung */}
          {viewConfigSuccess && (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{viewConfigSuccess}</span>
            </div>
          )}

          {/* Störungserfassungs-Dialog Entwurf (CREATE_ORDER) */}
          {createOrderDraft && (
            <div className="p-4 rounded-xl bg-white border border-slate-200 text-slate-900 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold">
                  <Wrench className="h-3 w-3" />
                  Störungserfassungs-Dialog
                </div>
                <h3 className="text-sm font-bold text-slate-900">{createOrderDraft.title}</h3>
                <p className="text-xs text-slate-500 line-clamp-1">{createOrderDraft.description}</p>
                <div className="flex items-center gap-3 text-xs text-slate-500">
                  {createOrderDraft.equipmentName && (
                    <span>
                      Anlage: <strong className="text-blue-700">{createOrderDraft.equipmentName}</strong>
                    </span>
                  )}
                  <span>
                    Prio: <strong className="text-amber-700">{createOrderDraft.priority}</strong>
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href={`/orders/new?title=${encodeURIComponent(createOrderDraft.title)}&description=${encodeURIComponent(createOrderDraft.description)}&priority=${createOrderDraft.priority}${createOrderDraft.matchedEquipmentId ? `&equipmentId=${createOrderDraft.matchedEquipmentId}` : ""}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all"
                >
                  <span>Im Erfassungsdialog öffnen</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
                <button
                  type="button"
                  onClick={() => setCreateOrderDraft(null)}
                  className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600"
                  title="Schließen"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Analytics Chart Anfrage (ANALYTICS_CHART) */}
          {analyticsDraft && (
            <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 text-slate-900 shadow-sm flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-100 border border-blue-200 text-blue-800 text-xs font-semibold">
                  <Sparkles className="h-3 w-3 text-blue-600" />
                  Analytics Visualisierung: {analyticsDraft.chartType.toUpperCase()}
                </div>
                <h3 className="text-sm font-bold text-slate-900">{analyticsDraft.metric || "Kennzahlen-Auswertung"}</h3>
                <p className="text-xs text-slate-600">{analyticsDraft.analyticsPrompt}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  href={`/analytics?prompt=${encodeURIComponent(analyticsDraft.analyticsPrompt)}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all"
                >
                  <span>In Analytics öffnen</span>
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
                <button
                  type="button"
                  onClick={() => setAnalyticsDraft(null)}
                  className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600"
                  title="Schließen"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* 2. TABELLE / DIAGRAMM TOOLBAR UNTER DEM EINGABEFELD */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Linke Seite: View-Umschaltgruppe & KI-Aktions-Button */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {/* View-Umschaltgruppe */}
              <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white p-1 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] rounded-md text-xs font-semibold transition-all ${
                    viewMode === "table"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <TableIcon className="h-3.5 w-3.5" />
                  <span>Tabellen-Ansicht</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("chart")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] rounded-md text-xs font-semibold transition-all ${
                    viewMode === "chart"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                  }`}
                >
                  <BarChart2 className="h-3.5 w-3.5" />
                  <span>Diagramm-Ansicht</span>
                </button>
              </div>

              {/* Neuer KI-Aktions-Button: [✨ Diagramm aus Tabelle] */}
              <button
                type="button"
                onClick={() => {
                  setViewMode("chart");
                  toast.info(`Diagramm aus ${filteredOrders.length} Tabellen-Einträgen generiert`);
                }}
                className="inline-flex items-center gap-2 px-3.5 py-2 min-h-[44px] rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-all shadow-2xs"
              >
                <Wand2 className="h-4 w-4 text-blue-600" />
                <span>Diagramm aus Tabelle</span>
              </button>

              {isRefreshing && (
                <span className="flex items-center gap-1 text-[11px] text-blue-600 animate-pulse">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Aktualisiere...
                </span>
              )}
            </div>

            {/* Rechte Seite: Auto-Refresh, Dichte, Zu Favoriten hinzufügen, Suche / Diagrammtyp */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {/* Dropdown: Auto-Refresh (30s, 1m, 5m, Aus) */}
              <div className="flex items-center gap-2 text-xs text-slate-700 bg-white px-3 min-h-[44px] rounded-lg border border-slate-300 shadow-2xs">
                <RefreshCw className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                <span className="hidden sm:inline">Auto-Refresh:</span>
                <select
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(Number(e.target.value))}
                  aria-label="Auto-Refresh Intervall"
                  className="bg-transparent text-slate-900 text-xs font-medium cursor-pointer outline-none min-h-[44px]"
                >
                  <option value={30}>30s</option>
                  <option value={60}>1m</option>
                  <option value={300}>5m</option>
                  <option value={0}>Aus</option>
                </select>
              </div>

              {/* Dichte-Umschalter (Kompakt, Standard, Detailliert) */}
              {viewMode === "table" && (
                <div className="flex items-center gap-2 text-xs text-slate-700 bg-white px-3 min-h-[44px] rounded-lg border border-slate-300 shadow-2xs">
                  <span className="hidden sm:inline">Dichte:</span>
                  <select
                    value={displayDensity}
                    onChange={(e) => setDisplayDensity(e.target.value as any)}
                    aria-label="Ansichtsdichte auswählen"
                    className="bg-transparent text-slate-900 text-xs font-medium cursor-pointer outline-none min-h-[44px]"
                  >
                    <option value="compact">Kompakt</option>
                    <option value="standard">Standard</option>
                    <option value="detailed">Detailliert</option>
                  </select>
                </div>
              )}

              {/* Button: [⭐ Zu Favoriten hinzufügen] */}
              <button
                type="button"
                onClick={() => {
                  setFavoriteName(activeView?.name || prompt || "Meine Ansicht");
                  setSaveModalOpen(true);
                }}
                className="inline-flex items-center gap-2 px-3.5 py-2 min-h-[44px] rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold transition-colors shadow-2xs"
              >
                <Star className="h-4 w-4 text-amber-500 fill-amber-500 shrink-0" />
                <span className="hidden sm:inline">Zu Favoriten hinzufügen</span>
                <span className="sm:hidden">Favorit</span>
              </button>

              {/* Dropdown: "Diagrammtyp: Säulendiagramm v" (im Chart-Modus) */}
              {viewMode === "chart" && (
                <div className="flex items-center gap-2 text-xs text-slate-700 bg-white px-3 min-h-[44px] rounded-lg border border-slate-300 shadow-2xs">
                  <BarChart2 className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                  <span className="hidden sm:inline">Diagrammtyp:</span>
                  <select
                    value={chartType}
                    onChange={(e) => setChartType(e.target.value)}
                    aria-label="Diagrammtyp auswählen"
                    className="bg-transparent text-slate-900 text-xs font-medium cursor-pointer outline-none min-h-[44px]"
                  >
                    <option value="bar">Säulendiagramm</option>
                    <option value="horizontal">Balkendiagramm</option>
                    <option value="pie">Kreisdiagramm</option>
                  </select>
                </div>
              )}

              {/* In-Table Textsuche / Sofortfilter */}
              {viewMode === "table" && (
                <div className="relative min-w-[140px] sm:min-w-[180px]">
                  <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={tableSearchTerm}
                    onChange={(e) => setTableSearchTerm(e.target.value)}
                    placeholder="In Tabelle filtern..."
                    className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 min-h-[44px] text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-600 transition-colors shadow-2xs"
                  />
                </div>
              )}
            </div>
          </div>

          {/* 3. DYNAMISCHE ERGEBNIS-ANSICHT (TABELLE ODER CHART) */}
          {viewMode === "chart" ? (
            /* Recharts-Container auf weißer Card */
            <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm space-y-6">
              {/* Header: Titel & Subtitel & Legende */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                    Offene Störungen nach Gewerk & Priorität (Halle 1)
                  </h3>
                  <p className="text-xs text-slate-500">
                    4 offene Meldungen • 2x Mechanik, 1x Pneumatik, 1x Elektrik
                  </p>
                </div>
                {/* Legende */}
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    Prio 1 (Notfall / Hoch)
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    Prio 2 (Mittel)
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sky-50 border border-sky-200 text-sky-700 text-xs font-semibold">
                    <span className="h-2 w-2 rounded-full bg-sky-500" />
                    Prio 3 (Niedrig)
                  </span>
                </div>
              </div>

              {/* Recharts Bar-Chart mit freundlichen Pastellfarben */}
              <div className="h-96 w-full pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartItems} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis
                      dataKey="name"
                      stroke="#64748B"
                      fontSize={12}
                      tickLine={false}
                      axisLine={{ stroke: "#CBD5E1" }}
                    />
                    <YAxis
                      stroke="#64748B"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: "#CBD5E1" }}
                      domain={[0, 100]}
                      unit="%"
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg text-xs space-y-1">
                              <p className="font-bold text-slate-900">{data.name}</p>
                              <p className="text-slate-600">{data.component}</p>
                              <div className="flex items-center gap-2 pt-1">
                                <span className="font-semibold text-slate-700">Gewerk:</span>
                                <span>{data.gewerk}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-700">Priorität:</span>
                                <span>{data.priorityLabel}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-700">Stillstand:</span>
                                <span className="text-rose-600 font-bold">{data.downtime}</span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={70}>
                      {chartItems.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} stroke={entry.stroke} strokeWidth={1.5} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Unten: Zusammenfassungs-Badge der KI */}
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 shrink-0">
                    <Lightbulb className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                      KI-Erkenntnis
                    </h4>
                    <p className="text-sm font-medium text-emerald-950">
                      50% der Störungen betreffen Antriebsüberlastungen in Zelle 1. Dichtsatz KUKA im Lager verfügbar.
                    </p>
                  </div>
                </div>
                <Link
                  href="/spare-parts?search=KUKA+KR210"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[44px] rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0 transition-colors shadow-sm"
                >
                  <span>Ersatzteil prüfen</span>
                </Link>
              </div>
            </div>
          ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-4 flex-1 flex flex-col">
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className={headerPadding}>Nr.</th>
                    <th className={headerPadding}>Herkunft</th>
                    <th className={headerPadding}>Prio</th>
                    <th className={headerPadding}>Maßnahme / Titel</th>
                    <th className={headerPadding}>Technischer Platz / Equipment</th>
                    <th className={headerPadding}>Status</th>
                    {displayDensity === "detailed" && (
                      <>
                        <th className={headerPadding}>Zuständig</th>
                        <th className={headerPadding}>Planzeit</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrders.map((order) => {
                    const rowPadding =
                      displayDensity === "compact"
                        ? "py-2 px-3 text-xs"
                        : displayDensity === "detailed"
                        ? "py-5 px-6 text-sm"
                        : "py-3.5 px-4 text-sm";

                    const flocCode = order.functionalLocation?.code;
                    const eqName = order.equipment?.name;
                    const eqNr = order.equipment?.equipmentNumber;

                    let techPlace = "-";
                    if (flocCode && eqName) {
                      techPlace = `${flocCode} (${eqName})`;
                    } else if (flocCode) {
                      techPlace = flocCode;
                    } else if (eqName) {
                      techPlace = eqNr ? `${eqName} (${eqNr})` : eqName;
                    }

                    return (
                      <tr
                        key={order.id}
                        tabIndex={0}
                        onClick={() => handleRowClick(order.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleRowClick(order.id);
                          }
                        }}
                        className="cursor-pointer hover:bg-blue-50/50 transition-colors select-none focus:outline-none focus:bg-blue-50/80"
                        title="Auftragsdetails & Bearbeitung öffnen"
                      >
                        {/* Auftrags-Nr */}
                        <td className={`${rowPadding} font-mono font-bold text-blue-600 shrink-0`}>
                          {order.orderNumber}
                        </td>

                        {/* Herkunft-Badge (SAP vs Lokal nach docs/design-rules.md) */}
                        <td className={rowPadding}>
                          {renderOriginBadge(order.sapOrderNr)}
                        </td>

                        {/* Prio-Badge nach docs/design-rules.md */}
                        <td className={rowPadding}>
                          {renderPriorityBadge(order.priority)}
                        </td>

                        {/* Titel & Beschreibung */}
                        <td className={`${rowPadding} font-medium text-slate-900 max-w-xs sm:max-w-md`}>
                          <div className="truncate font-semibold">{order.title}</div>
                          {displayDensity === "detailed" && order.description && (
                            <div className="text-xs text-slate-500 truncate mt-0.5 font-normal">
                              {order.description}
                            </div>
                          )}
                        </td>

                        {/* Technischer Platz / Equipment */}
                        <td className={`${rowPadding} text-slate-600 font-mono text-xs max-w-[200px] truncate`}>
                          {techPlace}
                        </td>

                        {/* Status-Badge */}
                        <td className={rowPadding}>
                          {renderStatusBadge(order.currentStatus?.name, order.currentStatus?.code)}
                        </td>

                        {/* Zusätzliche Spalten bei Detail-Ansicht */}
                        {displayDensity === "detailed" && (
                          <>
                            <td className={`${rowPadding} text-slate-700 text-xs`}>
                              {order.assignedToUser
                                ? `${order.assignedToUser.firstName} ${order.assignedToUser.lastName}`
                                : <span className="text-slate-400 italic">Nicht zugeordnet</span>}
                            </td>
                            <td className={`${rowPadding} text-slate-500 text-xs font-mono`}>
                              {order.plannedDurationMinutes || 60} Min
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}

                  {filteredOrders.length === 0 && (
                    <tr>
                      <td
                        colSpan={displayDensity === "detailed" ? 8 : 6}
                        className="py-12 text-center text-slate-500"
                      >
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <Search className="h-6 w-6 text-slate-400" />
                          <p className="font-semibold text-sm text-slate-700">
                            Keine Aufträge gefunden
                          </p>
                          <p className="text-xs text-slate-400">
                            Passe deine Filterkriterien oder den Suchbegriff an.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Tabellen-Footer */}
            <div className="p-3 bg-slate-50/50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <span>Zeige {orders.length} Aufträge</span>
              <span>Auto-Refresh: {intervalText} • Letzter Sync: Gerade eben</span>
            </div>
          </div>
        )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. MODAL / DIALOG: "ZU FAVORITEN HINZUFÜGEN"                               */}
      {/* ========================================================================= */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
                <h3 className="font-bold text-slate-900 text-base">Ansicht zu Favoriten hinzufügen</h3>
              </div>
              <button
                type="button"
                onClick={() => setSaveModalOpen(false)}
                className="p-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {saveSuccessMessage ? (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-center font-medium text-sm flex items-center justify-center gap-2">
                <Check className="h-4 w-4 text-emerald-600" />
                <span>{saveSuccessMessage}</span>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Name des Favoriten */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Name des Favoriten
                  </label>
                  <input
                    type="text"
                    value={favoriteName}
                    onChange={(e) => setFavoriteName(e.target.value)}
                    placeholder="z. B. 'Störungen Halle 1'"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 min-h-[44px] text-sm text-slate-900 focus:outline-none focus:border-blue-600"
                    autoFocus
                  />
                </div>

                {/* Zusammenfassung der gespeicherten Einstellungen */}
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 text-xs text-slate-600 space-y-1">
                  <div className="flex justify-between">
                    <span>Auto-Refresh:</span>
                    <span className="text-slate-900 font-mono">{refreshInterval > 0 ? `${refreshInterval}s` : "Aus"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Dichte:</span>
                    <span className="text-slate-900 capitalize">{displayDensity}</span>
                  </div>
                  {currentFilters.areaId && (
                    <div className="flex justify-between">
                      <span>Bereichsfilter:</span>
                      <span className="text-slate-900 font-mono">{currentFilters.areaId}</span>
                    </div>
                  )}
                  {currentFilters.statusList && currentFilters.statusList.length > 0 && (
                    <div className="flex justify-between">
                      <span>Statusfilter:</span>
                      <span className="text-slate-900">{currentFilters.statusList.join(", ")}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setSaveModalOpen(false)}
                    className="px-4 py-2 min-h-[44px] rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    disabled={!favoriteName.trim() || isSavingFavorite}
                    onClick={handleSaveFavorite}
                    className="inline-flex items-center gap-2 px-5 py-2 min-h-[44px] rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold shadow-xs transition-all"
                  >
                    {isSavingFavorite ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Speichere...</span>
                      </>
                    ) : (
                      <>
                        <Star className="h-4 w-4 text-amber-300 fill-amber-300" />
                        <span>Favorit speichern</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detail- & Bearbeitungs-Modal für interaktiven Zeilenklick */}
      <OrderDetailsModal
        orderId={selectedOrderIdForModal}
        isOpen={isDetailsModalOpen}
        onClose={() => {
          setIsDetailsModalOpen(false);
          setSelectedOrderIdForModal(null);
        }}
        onOrderUpdated={() => loadOrders(currentFilters, true)}
      />
    </div>
  );
}
