"use server";

import { db } from "@/db";
import {
  maintenanceOrders,
  workflowStatuses,
  equipments,
  functionalLocations,
  users,
} from "@/db/schema";
import { eq, and, desc, inArray, or, ilike } from "drizzle-orm";
import { z } from "zod";
import {
  classifyCopilotIntent,
  ClassifyCopilotInputPayload,
  CopilotClassificationResult,
  QueryOrdersParams,
  ClarificationOption,
  CreateOrderParams,
  DraftOrderPayload,
  OrderDraftWidgetPayload,
  ChartViewWidgetPayload,
  TableViewWidgetPayload,
  CopilotInlineWidgetPayload,
} from "@/lib/ai/copilot";
import { executeAnalyticsPrompt, AnalyticsQueryOutput } from "@/lib/ai/analytics-agent";
import { analyzeFaultInput, FaultCopilotAnalysisResult } from "@/lib/ai/fault-copilot";
import { validateWithZod } from "./action-utils";

export type {
  OrderDraftWidgetPayload,
  ChartViewWidgetPayload,
  TableViewWidgetPayload,
  CopilotInlineWidgetPayload,
};

const classifyCopilotPayloadSchema = z
  .object({
    prompt: z.string(),
    tenantId: z.string().optional(),
    currentViewContext: z.record(z.any()).optional(),
    clarificationResponse: z.string().optional(),
    pendingDescription: z.string().optional(),
    conversationHistory: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string(),
        })
      )
      .optional(),
    chatHistory: z.array(z.any()).optional(),
    selectedOptionId: z.string().optional(),
    clarificationSelection: z
      .object({
        field: z.enum(["area", "equipment", "general"]),
        id: z.string(),
        value: z.string(),
      })
      .optional(),
    availableAreas: z.array(z.any()).optional(),
    availableEquipments: z.array(z.any()).optional(),
  })
  .passthrough();

export interface DashboardOrderResultItem {
  id: string;
  orderNumber: string;
  title: string;
  description: string;
  priority: "1_EMERGENCY" | "2_HIGH" | "3_MEDIUM" | "4_LOW";
  statusCode: string;
  statusName: string;
  equipmentName?: string | null;
  equipmentNumber?: string | null;
  functionalLocationCode?: string | null;
  areaId?: string | null;
  areaName?: string | null;
  assignedToName?: string | null;
  assignedToUserId?: string | null;
  downtimeMinutes?: number;
  plannedDurationMinutes: number;
  createdAt: string;
}

export interface SingleInputExecutionResult {
  success?: boolean;
  data?: any;
  error?: string;
  classification: CopilotClassificationResult;
  needsClarification?: boolean;
  clarificationQuestion?: string;
  clarificationOptions?: ClarificationOption[];
  extractedOrder?: CreateOrderParams;
  draftOrder?: DraftOrderPayload;
  ordersResult?: {
    totalFound: number;
    orders: DashboardOrderResultItem[];
  };
  analyticsResult?: AnalyticsQueryOutput;
  createOrderDraft?: {
    title: string;
    description: string;
    priority: "1_EMERGENCY" | "2_HIGH" | "3_MEDIUM" | "4_LOW";
    matchedEquipmentId?: string;
    equipmentId?: string;
    equipmentName?: string;
    functionalLocation?: string;
    suggestedDamageCode?: string;
    damageCode?: string;
    copilotAnalysis?: FaultCopilotAnalysisResult;
  };
  appliedViewConfig?: {
    refreshInterval?: number;
    displayDensity?: "compact" | "standard" | "detailed";
  };
  // Saubere Payload-Struktur für Inline-Widgets
  widget?: CopilotInlineWidgetPayload;
  type?: "order_draft" | "chart_view" | "table_view";
  // Direkte Felder für type: 'order_draft'
  title?: string;
  description?: string;
  priority?: "1_EMERGENCY" | "2_HIGH" | "3_MEDIUM" | "4_LOW";
  equipmentId?: string;
  equipmentName?: string;
  functionalLocation?: string;
  suggestedDamageCode?: string;
  // Direkte Felder für type: 'chart_view'
  chartType?: "bar" | "line" | "pie" | "kpi" | "table";
  chartConfig?: Record<string, any>;
  chartData?: any[];
  // Direkte Felder für type: 'table_view'
  orders?: DashboardOrderResultItem[];
  totalFound?: number;
}

export interface CopilotClassificationActionResult extends CopilotClassificationResult {
  success: boolean;
  data: CopilotClassificationResult;
  error?: string;
  needsClarification: boolean;
  clarificationQuestion?: string;
  clarificationOptions: ClarificationOption[];
  extractedOrder?: CreateOrderParams;
  draftOrder?: DraftOrderPayload;
  widget?: CopilotInlineWidgetPayload;
  type?: "order_draft" | "chart_view" | "table_view";
  title?: string;
  description?: string;
  priority?: "1_EMERGENCY" | "2_HIGH" | "3_MEDIUM" | "4_LOW";
  equipmentId?: string;
  equipmentName?: string;
  functionalLocation?: string;
  suggestedDamageCode?: string;
}

/**
 * Server Action: Führt die reine Intent-Erkennung für den Conversational Single-Input durch
 */
export async function classifyCopilotInputAction(
  payload: ClassifyCopilotInputPayload
): Promise<CopilotClassificationActionResult> {
  try {
    const validation = validateWithZod(classifyCopilotPayloadSchema, payload);
    const safePayload: ClassifyCopilotInputPayload = validation.success ? validation.data : payload;
    const result = await classifyCopilotIntent(safePayload);
    const needsClarification = Boolean(result.clarification?.needed || result.clarification?.needsClarification);
    const clarificationQuestion = result.clarification?.clarificationQuestion || result.clarification?.question;
    const clarificationOptions = result.clarification?.options || [];

    const actionResult = Object.assign(result, {
      success: true,
      data: result,
      needsClarification,
      clarificationQuestion,
      clarificationOptions,
      extractedOrder: result.createOrder,
      draftOrder: result.draftOrder,
      widget: result.widget,
      type: result.type,
    });

    if (result.widget?.type === "order_draft") {
      Object.assign(actionResult, {
        title: result.widget.title,
        description: result.widget.description,
        priority: result.widget.priority,
        equipmentId: result.widget.equipmentId,
        equipmentName: result.widget.equipmentName,
        functionalLocation: result.widget.functionalLocation,
        suggestedDamageCode: result.widget.suggestedDamageCode,
      });
    }

    return actionResult;
  } catch (err: any) {
    console.error("Fehler in classifyCopilotInputAction:", err);
    const fallback: CopilotClassificationResult = {
      intent: "QUERY_ORDERS",
      confidence: 0,
      clarification: { needed: false, needsClarification: false, options: [] },
      explanation: err?.message || "Klassifizierung fehlgeschlagen.",
      rawPrompt: payload.prompt || "",
    };
    return Object.assign(fallback, {
      success: false,
      data: fallback,
      needsClarification: false,
      clarificationQuestion: undefined,
      clarificationOptions: [],
      extractedOrder: undefined,
      draftOrder: undefined,
      error: err?.message || "Klassifizierung fehlgeschlagen.",
    });
  }
}

/**
 * Server Action: Führt den erkannten Intent direkt aus (Full Pipeline):
 * - QUERY_ORDERS: Holt passende Aufträge aus der DB mit Schnellfiltern
 * - ANALYTICS_CHART: Führt Prompt-to-SQL Analytics aus
 * - CREATE_ORDER: Bereitet Vorlage inkl. Duplikaterkennung & Wissensbasis-Vorschlägen vor
 * - UPDATE_VIEW_CONFIG: Gibt validierte Ansichtskonfiguration zurück
 */
export async function executeSingleInputCopilotAction(
  payload: ClassifyCopilotInputPayload
): Promise<SingleInputExecutionResult> {
  try {
    const validation = validateWithZod(classifyCopilotPayloadSchema, payload);
    const safePayload: ClassifyCopilotInputPayload = validation.success ? validation.data : payload;
    const classification = await classifyCopilotIntent(safePayload);
    const tenantId = safePayload.tenantId || "demo-tenant-1000";

    const result: SingleInputExecutionResult = {
      success: true,
      classification,
      needsClarification: Boolean(classification.clarification?.needed),
      clarificationQuestion: classification.clarification?.question,
      clarificationOptions: classification.clarification?.options || [],
      extractedOrder: classification.createOrder,
    };

    // Falls Klärungsbedarf besteht, noch keine Ausführung anstoßen, sondern Optionen an Frontend reichen
    if (classification.clarification.needed) {
      result.data = { ...result };
      return result;
    }

  // 1. QUERY_ORDERS ausführen
  if (classification.intent === "QUERY_ORDERS" && classification.queryOrders) {
    const qParams = classification.queryOrders;
    try {
      const conditions: any[] = [];

      if (tenantId) {
        conditions.push(eq(maintenanceOrders.tenantId, tenantId));
      }

      // Bereichs-Filter (areaId)
      if (qParams.areaId) {
        try {
          const flocsInArea = await db.query.functionalLocations.findMany({
            where: and(
              eq(functionalLocations.tenantId, tenantId),
              eq(functionalLocations.areaId, qParams.areaId)
            ),
            columns: { id: true },
          });
          const flocIds = flocsInArea.map((f) => f.id);
          if (flocIds.length > 0) {
            conditions.push(inArray(maintenanceOrders.functionalLocationId, flocIds));
          }
        } catch (e) {
          // ignore or fallback
        }
      }

      // Prioritätsfilter
      if (qParams.priorityList && qParams.priorityList.length > 0) {
        conditions.push(inArray(maintenanceOrders.priority, qParams.priorityList));
      }

      // Equipment-Filter
      if (qParams.equipmentId) {
        conditions.push(eq(maintenanceOrders.equipmentId, qParams.equipmentId));
      }

      const query = await db.query.maintenanceOrders.findMany({
        where: conditions.length > 0 ? and(...conditions) : undefined,
        with: {
          currentStatus: true,
          equipment: true,
          functionalLocation: {
            with: {
              area: true,
            },
          },
          assignedToUser: true,
        },
        orderBy: [desc(maintenanceOrders.createdAt)],
        limit: 50,
      });

      let mappedOrders: DashboardOrderResultItem[] = query.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        title: o.title,
        description: o.description,
        priority: o.priority,
        statusCode: o.currentStatus?.code || "OPEN",
        statusName: o.currentStatus?.name || "Offen",
        equipmentName: o.equipment?.name,
        equipmentNumber: o.equipment?.equipmentNumber,
        functionalLocationCode: o.functionalLocation?.code,
        areaId: o.functionalLocation?.areaId,
        areaName: o.functionalLocation?.area?.name,
        assignedToName: o.assignedToUser ? `${o.assignedToUser.firstName} ${o.assignedToUser.lastName}` : null,
        assignedToUserId: o.assignedToUserId,
        downtimeMinutes: o.downtimeMinutes ?? 0,
        plannedDurationMinutes: o.plannedDurationMinutes || 60,
        createdAt: o.createdAt.toISOString(),
      }));

      // Status-Filterung im Speicher (falls Status-Liste gefiltert)
      if (qParams.statusList && qParams.statusList.length > 0) {
        const statuses = qParams.statusList.map((s) => s.toUpperCase());
        const hasOpenFilter = statuses.includes("ERFASST") || statuses.includes("OFFEN") || statuses.includes("IN_ARBEIT");

        if (hasOpenFilter) {
          mappedOrders = mappedOrders.filter(
            (o) => o.statusCode !== "TECH_COMPLETED" && o.statusCode !== "CLOSED"
          );
        }
      }

      result.ordersResult = {
        totalFound: mappedOrders.length,
        orders: mappedOrders,
      };

      const tableViewWidget: TableViewWidgetPayload = {
        type: "table_view",
        orders: mappedOrders,
        totalFound: mappedOrders.length,
        filters: qParams,
      };
      result.widget = tableViewWidget;
      result.type = "table_view";
      result.orders = mappedOrders;
      result.totalFound = mappedOrders.length;
    } catch (err) {
      console.warn("[Copilot Action] DB-Abfrage fehlgeschlagen, liefere Demodaten:", err);
      const fallbackOrders: DashboardOrderResultItem[] = [
        {
          id: "mo-demo-1092",
          orderNumber: "#1092",
          title: "Antriebsüberlast Achse 2",
          description: "Roboterzelle meldet intermittierende Überlast bei Taktzeitspitze",
          priority: "2_HIGH",
          statusCode: "IN_WORK",
          statusName: "In Arbeit",
          equipmentName: "KUKA KR210 R2700",
          equipmentNumber: "EQ-10001001",
          functionalLocationCode: "FL-H1-01",
          assignedToName: "Max Meister",
          plannedDurationMinutes: 120,
          createdAt: new Date().toISOString(),
        },
        {
          id: "mo-demo-1093",
          orderNumber: "#1093",
          title: "Druckverlust Primärkreislauf",
          description: "Kreiselpumpe P-101 zeigt Druckabfall von 4.2 auf 1.8 bar",
          priority: "1_EMERGENCY",
          statusCode: "CREATED",
          statusName: "Erfasst",
          equipmentName: "Kreiselpumpe KSB Etanorm",
          equipmentNumber: "EQ-10001005",
          functionalLocationCode: "FL-H1-02",
          assignedToName: null,
          plannedDurationMinutes: 60,
          createdAt: new Date().toISOString(),
        },
      ];

      result.ordersResult = {
        totalFound: fallbackOrders.length,
        orders: fallbackOrders,
      };
      const tableViewWidget: TableViewWidgetPayload = {
        type: "table_view",
        orders: fallbackOrders,
        totalFound: fallbackOrders.length,
        filters: qParams,
      };
      result.widget = tableViewWidget;
      result.type = "table_view";
      result.orders = fallbackOrders;
      result.totalFound = fallbackOrders.length;
    }
  }

  // 2. CREATE_ORDER Entwurf vorbereiten
  if (classification.intent === "CREATE_ORDER" && (classification.createOrder || classification.draftOrder)) {
    const cOrder = classification.createOrder;
    const draft = classification.draftOrder;
    const eqId = draft?.equipmentId || cOrder?.matchedEquipmentId || cOrder?.equipmentId;
    const eqName = draft?.equipmentName || cOrder?.equipmentName;
    const title = draft?.title || cOrder?.title || "Störungsmeldung";
    const description = draft?.description || cOrder?.description || "";
    const priority = draft?.priority || cOrder?.priority || "2_HIGH";
    const suggestedDamageCode = draft?.suggestedDamageCode || cOrder?.suggestedDamageCode || cOrder?.damageCode || "MECH_TEMP";
    const functionalLocation =
      draft?.functionalLocation ||
      (classification.widget?.type === "order_draft" ? classification.widget.functionalLocation : "") ||
      "";

    let copilotAnalysis: FaultCopilotAnalysisResult | undefined;
    if (eqId) {
      try {
        copilotAnalysis = await analyzeFaultInput({
          tenantId,
          equipmentId: eqId,
          userInputText: description || title,
        });
      } catch (e) {
        // Analyse optional
      }
    }

    const structuredDraft: DraftOrderPayload = {
      title,
      description,
      priority,
      equipmentId: eqId || "",
      equipmentName: eqName || "",
      functionalLocation,
      suggestedDamageCode,
    };

    const orderDraftWidget: OrderDraftWidgetPayload = {
      type: "order_draft",
      title,
      description,
      priority,
      equipmentId: eqId || "",
      equipmentName: eqName || "",
      functionalLocation,
      suggestedDamageCode,
    };

    result.draftOrder = structuredDraft;
    result.widget = orderDraftWidget;
    result.type = "order_draft";
    result.title = title;
    result.description = description;
    result.priority = priority;
    result.equipmentId = eqId || "";
    result.equipmentName = eqName || "";
    result.functionalLocation = functionalLocation;
    result.suggestedDamageCode = suggestedDamageCode;
    result.createOrderDraft = {
      title,
      description,
      priority,
      matchedEquipmentId: eqId,
      equipmentId: eqId,
      equipmentName: eqName,
      functionalLocation,
      suggestedDamageCode,
      damageCode: suggestedDamageCode,
      copilotAnalysis,
    };
  }

  // 3. UPDATE_VIEW_CONFIG anwenden
  if (classification.intent === "UPDATE_VIEW_CONFIG" && classification.updateViewConfig) {
    result.appliedViewConfig = {
      refreshInterval: classification.updateViewConfig.refreshInterval,
      displayDensity: classification.updateViewConfig.displayDensity,
    };
  }

  // 4. ANALYTICS_CHART ausführen
  if (classification.intent === "ANALYTICS_CHART") {
    try {
      const userPrompt =
        classification.analyticsChart?.analyticsPrompt ||
        safePayload.prompt ||
        "";

      const rawHistory = safePayload.chatHistory || safePayload.conversationHistory || [];
      const chatHistory = rawHistory
        .filter((m: any) => m && (m.role === "user" || m.role === "assistant"))
        .map((m: any) => ({
          role: m.role as "user" | "assistant",
          content: typeof m.content === "string" ? m.content : typeof m.text === "string" ? m.text : "",
        }));

      const analyticsResult = await executeAnalyticsPrompt({
        tenantId,
        userPrompt,
        chatHistory,
      });
      result.analyticsResult = analyticsResult;

      // Behandle den Fall status === "NEEDS_CLARIFICATION"
      if (analyticsResult?.status === "NEEDS_CLARIFICATION") {
        const clarificationQuestion =
          analyticsResult.clarificationQuestion ||
          "Bitte spezifizieren Sie Ihre Anfrage für das Diagramm:";

        const clarificationOptions: ClarificationOption[] = (
          analyticsResult.suggestedClarifications || []
        ).map((item, idx) => ({
          id: `clarification-opt-${idx + 1}`,
          label: item,
          value: item,
          field: "general" as const,
        }));

        result.needsClarification = true;
        result.clarificationQuestion = clarificationQuestion;
        result.clarificationOptions = clarificationOptions;

        result.classification.clarification = {
          needed: true,
          needsClarification: true,
          question: clarificationQuestion,
          clarificationQuestion,
          options: clarificationOptions,
          field: "general",
        };
        result.classification.needsClarification = true;
        result.classification.clarificationQuestion = clarificationQuestion;
        result.classification.clarificationOptions = clarificationOptions;

        result.data = { ...result };
        return result;
      }

      // Bei Erfolg (status === "SUCCESS" bzw. Standard-Ergebnis):
      const validChartTypes = ["bar", "line", "pie", "table"] as const;
      type ValidChartType = (typeof validChartTypes)[number];
      const chartType: ValidChartType = validChartTypes.includes(
        analyticsResult?.chartType as ValidChartType
      )
        ? (analyticsResult.chartType as ValidChartType)
        : (validChartTypes.includes(classification.analyticsChart?.chartType as ValidChartType)
            ? (classification.analyticsChart?.chartType as ValidChartType)
            : "bar");

      const title =
        analyticsResult?.title ||
        classification.analyticsChart?.analyticsPrompt ||
        "Kennzahlen-Analyse";

      const chartData =
        analyticsResult?.data && Array.isArray(analyticsResult.data)
          ? analyticsResult.data
          : [];

      const xAxisKey = analyticsResult?.xAxisKey || "name";

      const validColors = [
        "#3B82F6",
        "#10B981",
        "#F59E0B",
        "#EF4444",
        "#8B5CF6",
        "#EC4899",
        "#14B8A6",
        "#F97316",
      ];

      let series: Array<{ key: string; label: string; color: string }> = [];
      if (
        analyticsResult?.series &&
        Array.isArray(analyticsResult.series) &&
        analyticsResult.series.length > 0
      ) {
        series = analyticsResult.series.map((s, idx) => ({
          key: s.key || `value_${idx}`,
          label: s.label || s.key || "Wert",
          color: s.color || validColors[idx % validColors.length],
        }));
      }

      if (series.length === 0) {
        series = [
          {
            key: "value",
            label: classification.analyticsChart?.metric || "Wert",
            color: "#3B82F6",
          },
        ];
      }

      const summary = analyticsResult?.summaryInsight || classification.explanation || "";
      const rawSql = analyticsResult?.rawSqlUsed;

      const chartViewWidget: ChartViewWidgetPayload = {
        type: "chart_view",
        title,
        chartType,
        chartData,
        data: chartData,
        xAxisKey,
        series,
        config: {
          chartType,
          xAxisKey,
          series,
          responsive: true,
          margin: { top: 12, right: 24, left: 0, bottom: 24 },
          grid: { strokeDasharray: "3 3", stroke: "#e2e8f0" },
          tooltip: {
            contentStyle: {
              backgroundColor: "#ffffff",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
            },
          },
          legend: { verticalAlign: "top", height: 36 },
          colors: validColors,
        },
        summary,
        rawSql,
      };

      result.widget = chartViewWidget;
      result.type = "chart_view";
      result.title = title;
      result.chartType = chartType;
      result.chartConfig = chartViewWidget.config;
      result.chartData = chartData;
    } catch (err: any) {
      console.warn(
        "[Copilot Action] Analytics Ausführung fehlgeschlagen, liefere sichere Fallback-Struktur:",
        err
      );
      const fallbackChartType = "bar";
      const fallbackData = [
        { name: "KUKA KR 210", downtimeMinutes: 240, ordersCount: 4 },
        { name: "Pumpe P-102", downtimeMinutes: 180, ordersCount: 2 },
        { name: "Simotics Motor", downtimeMinutes: 90, ordersCount: 1 },
      ];
      const fallbackSeries = [
        { key: "downtimeMinutes", label: "Stillstand (Minuten)", color: "#EF4444" },
        { key: "ordersCount", label: "Anzahl Störungen", color: "#3B82F6" },
      ];
      const fallbackTitle =
        classification.analyticsChart?.analyticsPrompt ||
        safePayload.prompt ||
        "Kennzahlen-Analyse";
      const fallbackSummary =
        "Hinweis: Live-Datenbank nicht erreichbar. Es werden Referenzdaten zur Visualisierung angezeigt.";

      const chartViewWidget: ChartViewWidgetPayload = {
        type: "chart_view",
        title: fallbackTitle,
        chartType: fallbackChartType,
        chartData: fallbackData,
        data: fallbackData,
        xAxisKey: "name",
        series: fallbackSeries,
        config: {
          chartType: fallbackChartType,
          xAxisKey: "name",
          series: fallbackSeries,
          responsive: true,
          margin: { top: 12, right: 24, left: 0, bottom: 24 },
          grid: { strokeDasharray: "3 3", stroke: "#e2e8f0" },
          tooltip: {
            contentStyle: {
              backgroundColor: "#ffffff",
              borderRadius: "8px",
              border: "1px solid #e2e8f0",
            },
          },
          legend: { verticalAlign: "top", height: 36 },
          colors: ["#3B82F6", "#EF4444", "#10B981"],
        },
        summary: fallbackSummary,
        rawSql: "",
      };

      result.widget = chartViewWidget;
      result.type = "chart_view";
      result.title = fallbackTitle;
      result.chartType = fallbackChartType;
      result.chartConfig = chartViewWidget.config;
      result.chartData = fallbackData;
    }
  }

  result.data = { ...result };
  return result;
} catch (err: any) {
  console.error("Fehler in executeSingleInputCopilotAction:", err);
  const fallbackClassification: CopilotClassificationResult = {
    intent: "QUERY_ORDERS",
    confidence: 0,
    clarification: { needed: false, needsClarification: false, options: [] },
    explanation: err?.message || "Fehler bei der Aktionsausführung.",
    rawPrompt: payload?.prompt || "",
  };
  const fallbackResult: SingleInputExecutionResult = {
    success: false,
    error: err?.message || "Fehler bei der Aktionsausführung.",
    classification: fallbackClassification,
    needsClarification: false,
    clarificationOptions: [],
    ordersResult: {
      totalFound: 0,
      orders: [],
    },
  };
  fallbackResult.data = { ...fallbackResult };
  return fallbackResult;
}
}


