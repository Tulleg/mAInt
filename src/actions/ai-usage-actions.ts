"use server";

import { eq, and, gte, lte, desc } from "drizzle-orm";
import { db } from "@/db";
import { aiUsageLogs, tenants } from "@/db/schema";
import { actionSuccess, actionError, validateWithZod, ActionResult } from "./action-utils";
import {
  calculateModelCostEur,
  logAiUsageInputSchema,
  type AiUsageSummary,
  type TaskTypeSummary,
  type ProviderUsageSummary,
  type ModelUsageSummary,
  type GetAiUsageSummaryOptions,
  type LogAiUsageInput,
  type ModelTariff,
} from "@/lib/ai/tariffs";

export type {
  AiUsageSummary,
  TaskTypeSummary,
  ProviderUsageSummary,
  ModelUsageSummary,
  GetAiUsageSummaryOptions,
  LogAiUsageInput,
  ModelTariff,
};

/**
 * Server Action: getAiUsageSummaryAction()
 * Aggregiert die Daten des aktuellen Monats für den angemeldeten Mandanten:
 * - Gesamte Tokens (Prompt vs. Completion)
 * - Gesamtkosten (€) basierend auf hinterlegten Modell-Tarifen
 * - Durchschnittliche Latenz (ms)
 * - Aufteilung nach Task-Typ (Routing vs. Analytics vs. RAG)
 */
export async function getAiUsageSummaryAction(
  tenantIdOrOptions?: string | GetAiUsageSummaryOptions
): Promise<ActionResult<AiUsageSummary, { summary?: AiUsageSummary }>> {
  try {
    let requestedTenantId: string | undefined;
    let requestedYear: number | undefined;
    let requestedMonth: number | undefined;

    if (typeof tenantIdOrOptions === "string") {
      requestedTenantId = tenantIdOrOptions.trim();
    } else if (tenantIdOrOptions && typeof tenantIdOrOptions === "object") {
      requestedTenantId = tenantIdOrOptions.tenantId?.trim();
      requestedYear = tenantIdOrOptions.year;
      requestedMonth = tenantIdOrOptions.month;
    }

    // 1. Mandanten auflösen
    let tenantId = requestedTenantId;
    if (!tenantId) {
      try {
        const { cookies } = await import("next/headers");
        const cookieStore = await cookies();
        const cookieTenant = cookieStore.get("maintai_tenant_id")?.value;
        if (cookieTenant) {
          tenantId = cookieTenant;
        }
      } catch (_) {
        // Außerhalb des Next.js Request-Lifecycles (z. B. Unit-Tests)
      }
    }

    if (!tenantId) {
      const firstTenant = await db.query.tenants.findFirst();
      tenantId = firstTenant?.id;
    }

    if (!tenantId) {
      return actionError("Kein Mandant gefunden.");
    }

    // 2. Zeitraum des aktuellen Monats berechnen
    const now = new Date();
    const year = requestedYear ?? now.getFullYear();
    let monthIndex = now.getMonth(); // 0-basiert: 0 = Jan, 9 = Okt

    if (requestedMonth !== undefined) {
      monthIndex = requestedMonth >= 1 && requestedMonth <= 12 ? requestedMonth - 1 : requestedMonth;
    }

    const startOfMonth = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));

    const monthNames = [
      "Januar", "Februar", "März", "April", "Mai", "Juni",
      "Juli", "August", "September", "Oktober", "November", "Dezember"
    ];
    const monthName = `${monthNames[monthIndex]} ${year}`;

    // 3. Daten für den Zeitraum abfragen
    const logs = await db
      .select()
      .from(aiUsageLogs)
      .where(
        and(
          eq(aiUsageLogs.tenantId, tenantId),
          gte(aiUsageLogs.createdAt, startOfMonth),
          lte(aiUsageLogs.createdAt, endOfMonth)
        )
      )
      .orderBy(desc(aiUsageLogs.createdAt));

    // 4. Aggregation initialisieren
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;
    let totalLatencyMs = 0;
    let totalCostEur = 0;

    const taskTypeMap: Record<string, TaskTypeSummary> = {
      ROUTING: {
        taskType: "ROUTING",
        callCount: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        totalCostEur: 0,
        averageLatencyMs: 0,
      },
      ANALYTICS: {
        taskType: "ANALYTICS",
        callCount: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        totalCostEur: 0,
        averageLatencyMs: 0,
      },
      RAG_SYNTHESIS: {
        taskType: "RAG_SYNTHESIS",
        callCount: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        totalCostEur: 0,
        averageLatencyMs: 0,
      },
    };

    const taskTypeLatencySum: Record<string, number> = {
      ROUTING: 0,
      ANALYTICS: 0,
      RAG_SYNTHESIS: 0,
    };

    const providerMap: Record<string, { callCount: number; totalTokens: number; totalCostEur: number; latencySum: number }> = {};
    const modelMap: Record<string, { provider: string; callCount: number; promptTokens: number; completionTokens: number; totalTokens: number; totalCostEur: number; latencySum: number }> = {};

    // 5. Daten aggregieren
    for (const log of logs) {
      const pTokens = log.promptTokens || 0;
      const cTokens = log.completionTokens || 0;
      const tTokens = log.totalTokens || (pTokens + cTokens);
      const lat = log.latencyMs || 0;

      // Kosten berechnen: Falls in DB hinterlegt (> 0), nutzen; andernfalls anhand Modell-Tarif kalkulieren
      let cost = Number(log.estimatedCostEur);
      if (isNaN(cost) || cost <= 0) {
        cost = calculateModelCostEur(log.model, pTokens, cTokens, log.provider);
      }

      totalPromptTokens += pTokens;
      totalCompletionTokens += cTokens;
      totalTokens += tTokens;
      totalLatencyMs += lat;
      totalCostEur += cost;

      // Normalisierung des Task-Typs
      const rawType = (log.taskType || "ROUTING").toUpperCase().trim();
      const normType =
        rawType === "ROUTING" || rawType === "ANALYTICS" || rawType === "RAG_SYNTHESIS"
          ? rawType
          : rawType.includes("ANALYTIC") || rawType.includes("SQL")
          ? "ANALYTICS"
          : rawType.includes("RAG") || rawType.includes("SYNTHESIS") || rawType.includes("FAULT")
          ? "RAG_SYNTHESIS"
          : "ROUTING";

      if (!taskTypeMap[normType]) {
        taskTypeMap[normType] = {
          taskType: normType,
          callCount: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          totalCostEur: 0,
          averageLatencyMs: 0,
        };
        taskTypeLatencySum[normType] = 0;
      }

      const tGroup = taskTypeMap[normType];
      tGroup.callCount += 1;
      tGroup.promptTokens += pTokens;
      tGroup.completionTokens += cTokens;
      tGroup.totalTokens += tTokens;
      tGroup.totalCostEur = Number((tGroup.totalCostEur + cost).toFixed(6));
      taskTypeLatencySum[normType] += lat;

      // Provider-Aufschlüsselung
      const prov = (log.provider || "gemini").toLowerCase();
      if (!providerMap[prov]) {
        providerMap[prov] = { callCount: 0, totalTokens: 0, totalCostEur: 0, latencySum: 0 };
      }
      providerMap[prov].callCount += 1;
      providerMap[prov].totalTokens += tTokens;
      providerMap[prov].totalCostEur = Number((providerMap[prov].totalCostEur + cost).toFixed(6));
      providerMap[prov].latencySum += lat;

      // Modell-Aufschlüsselung
      const mod = log.model || "unknown";
      if (!modelMap[mod]) {
        modelMap[mod] = {
          provider: prov,
          callCount: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          totalCostEur: 0,
          latencySum: 0,
        };
      }
      modelMap[mod].callCount += 1;
      modelMap[mod].promptTokens += pTokens;
      modelMap[mod].completionTokens += cTokens;
      modelMap[mod].totalTokens += tTokens;
      modelMap[mod].totalCostEur = Number((modelMap[mod].totalCostEur + cost).toFixed(6));
      modelMap[mod].latencySum += lat;
    }

    // Durchschnitte berechnen
    for (const [key, tGroup] of Object.entries(taskTypeMap)) {
      if (tGroup.callCount > 0) {
        tGroup.averageLatencyMs = Math.round(taskTypeLatencySum[key] / tGroup.callCount);
      }
    }

    const byProvider: Record<string, ProviderUsageSummary> = {};
    for (const [prov, data] of Object.entries(providerMap)) {
      byProvider[prov] = {
        provider: prov,
        callCount: data.callCount,
        totalTokens: data.totalTokens,
        totalCostEur: Number(data.totalCostEur.toFixed(6)),
        averageLatencyMs: data.callCount > 0 ? Math.round(data.latencySum / data.callCount) : 0,
      };
    }

    const byModel: Record<string, ModelUsageSummary> = {};
    for (const [mod, data] of Object.entries(modelMap)) {
      byModel[mod] = {
        model: mod,
        provider: data.provider,
        callCount: data.callCount,
        promptTokens: data.promptTokens,
        completionTokens: data.completionTokens,
        totalTokens: data.totalTokens,
        totalCostEur: Number(data.totalCostEur.toFixed(6)),
        averageLatencyMs: data.callCount > 0 ? Math.round(data.latencySum / data.callCount) : 0,
      };
    }

    const totalCalls = logs.length;
    const averageLatencyMs = totalCalls > 0 ? Math.round(totalLatencyMs / totalCalls) : 0;
    const finalTotalCostEur = Number(totalCostEur.toFixed(6));

    const summary: AiUsageSummary = {
      tenantId,
      period: {
        year,
        month: monthIndex + 1,
        monthName,
        startDate: startOfMonth.toISOString(),
        endDate: endOfMonth.toISOString(),
      },
      totalCalls,
      promptTokens: totalPromptTokens,
      completionTokens: totalCompletionTokens,
      totalTokens,
      totalCostEur: finalTotalCostEur,
      averageLatencyMs,
      byTaskType: {
        ROUTING: taskTypeMap.ROUTING,
        ANALYTICS: taskTypeMap.ANALYTICS,
        RAG_SYNTHESIS: taskTypeMap.RAG_SYNTHESIS,
        ...taskTypeMap,
      },
      taskTypeBreakdown: Object.values(taskTypeMap),
      byProvider,
      byModel,
    };

    return actionSuccess(summary, { summary });
  } catch (err: any) {
    return actionError(err?.message || "Fehler beim Berechnen der KI-Nutzungsübersicht.");
  }
}

/**
 * Server Action: Protokolliert einen KI-Aufruf in ai_usage_logs
 */
export async function logAiUsageAction(input: LogAiUsageInput) {
  try {
    const validation = validateWithZod(logAiUsageInputSchema, input);
    if (!validation.success) {
      return actionError(validation.error);
    }
    const data = validation.data;

    let tenantId = data.tenantId;
    if (!tenantId) {
      const firstTenant = await db.query.tenants.findFirst();
      tenantId = firstTenant?.id;
    }
    if (!tenantId) {
      return actionError("Kein Mandant gefunden.");
    }

    const promptTokens = data.promptTokens;
    const completionTokens = data.completionTokens;
    const totalTokens = data.totalTokens ?? (promptTokens + completionTokens);
    const latencyMs = data.latencyMs ?? 0;

    let cost = data.estimatedCostEur;
    if (cost === undefined || cost === null) {
      cost = calculateModelCostEur(data.model, promptTokens, completionTokens, data.provider);
    }

    const inserted = await db
      .insert(aiUsageLogs)
      .values({
        tenantId,
        provider: data.provider,
        model: data.model,
        taskType: data.taskType,
        promptTokens,
        completionTokens,
        totalTokens,
        latencyMs,
        estimatedCostEur: cost.toFixed(6),
      })
      .returning();

    return actionSuccess(inserted[0], { entry: inserted[0] });
  } catch (err: any) {
    return actionError(err?.message || "Fehler beim Protokollieren des KI-Aufrufs.");
  }
}
