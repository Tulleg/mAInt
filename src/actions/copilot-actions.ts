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
} from "@/lib/ai/copilot";
import { executeAnalyticsPrompt, AnalyticsQueryOutput } from "@/lib/ai/analytics-agent";
import { analyzeFaultInput, FaultCopilotAnalysisResult } from "@/lib/ai/fault-copilot";
import { validateWithZod } from "./action-utils";

const classifyCopilotPayloadSchema = z.object({
  prompt: z.string(),
  tenantId: z.string().optional(),
  currentViewContext: z.record(z.any()).optional(),
  clarificationResponse: z.string().optional(),
});

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
    equipmentName?: string;
    copilotAnalysis?: FaultCopilotAnalysisResult;
  };
  appliedViewConfig?: {
    refreshInterval?: number;
    displayDensity?: "compact" | "standard" | "detailed";
  };
}

/**
 * Server Action: Führt die reine Intent-Erkennung für den Conversational Single-Input durch
 */
export async function classifyCopilotInputAction(
  payload: ClassifyCopilotInputPayload
): Promise<CopilotClassificationResult & { success: boolean; data: CopilotClassificationResult; error?: string }> {
  try {
    const validation = validateWithZod(classifyCopilotPayloadSchema, payload);
    const safePayload: ClassifyCopilotInputPayload = validation.success ? validation.data : payload;
    const result = await classifyCopilotIntent(safePayload);
    return Object.assign(result, {
      success: true,
      data: result,
    });
  } catch (err: any) {
    console.error("Fehler in classifyCopilotInputAction:", err);
    const fallback: CopilotClassificationResult = {
      intent: "QUERY_ORDERS",
      confidence: 0,
      clarification: { needed: false, options: [] },
      explanation: err?.message || "Klassifizierung fehlgeschlagen.",
      rawPrompt: payload.prompt || "",
    };
    return Object.assign(fallback, {
      success: false,
      data: fallback,
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
    } catch (err) {
      console.warn("[Copilot Action] DB-Abfrage fehlgeschlagen, liefere Demodaten:", err);
      result.ordersResult = {
        totalFound: 2,
        orders: [
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
        ],
      };
    }
  }

  // 2. CREATE_ORDER Entwurf vorbereiten
  if (classification.intent === "CREATE_ORDER" && classification.createOrder) {
    const cOrder = classification.createOrder;
    let copilotAnalysis: FaultCopilotAnalysisResult | undefined;

    try {
      copilotAnalysis = await analyzeFaultInput({
        tenantId,
        equipmentId: cOrder.matchedEquipmentId,
        userInputText: cOrder.description || cOrder.title,
      });
    } catch (e) {
      // Analyse optional
    }

    result.createOrderDraft = {
      title: cOrder.title,
      description: cOrder.description,
      priority: cOrder.priority,
      matchedEquipmentId: cOrder.matchedEquipmentId,
      equipmentName: cOrder.equipmentName,
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
  if (classification.intent === "ANALYTICS_CHART" && classification.analyticsChart) {
    try {
      const analyticsResult = await executeAnalyticsPrompt({
        tenantId,
        userPrompt: classification.analyticsChart.analyticsPrompt,
      });
      result.analyticsResult = analyticsResult;
    } catch (err) {
      console.warn("[Copilot Action] Analytics Ausführung fehlgeschlagen:", err);
    }
  }

  result.data = { ...result };
  return result;
} catch (err: any) {
  console.error("Fehler in executeSingleInputCopilotAction:", err);
  const fallbackClassification: CopilotClassificationResult = {
    intent: "QUERY_ORDERS",
    confidence: 0,
    clarification: { needed: false, options: [] },
    explanation: err?.message || "Fehler bei der Aktionsausführung.",
    rawPrompt: payload.prompt || "",
  };
  return {
    success: false,
    error: err?.message || "Fehler bei der Aktionsausführung.",
    data: null,
    classification: fallbackClassification,
  };
}
}


