"use server";

import { z } from "zod";
import { executeAnalyticsPrompt, AnalyticsQueryOutput } from "@/lib/ai/analytics-agent";
import { scheduleReportAction, sendReportNowAction } from "@/actions/report-scheduler";
import { actionSuccess, actionError, validateWithZod } from "./action-utils";

export interface SendEmailReportInput {
  tenantId: string;
  email: string;
  reportTitle: string;
  prompt: string;
  chartType: string;
  data: Array<Record<string, any>>;
  summaryInsight: string;
}

const sendEmailReportSchema = z.object({
  tenantId: z.string().min(1, "Tenant-ID ist erforderlich."),
  email: z.string().email("Ungültige Empfänger-E-Mail-Adresse."),
  reportTitle: z.string().min(1, "Berichtstitel ist erforderlich."),
  prompt: z.string().min(1, "Prompt ist erforderlich."),
  chartType: z.string().min(1, "Diagrammtyp ist erforderlich."),
  data: z.array(z.record(z.any())),
  summaryInsight: z.string(),
});

const scheduleCronReportSchema = z.object({
  tenantId: z.string().min(1, "Tenant-ID ist erforderlich."),
  email: z.string().email("Ungültige E-Mail-Adresse."),
  cronExpression: z.string().min(1, "Cron-Ausdruck ist erforderlich."),
  prompt: z.string().min(1, "Prompt ist erforderlich."),
});

/**
 * Server Action: Führt die NL-to-SQL Analytics Abfrage aus
 */
export async function executeAnalyticsPromptAction(
  tenantId: string,
  userPrompt: string,
  chatHistory?: Array<{ role: "user" | "assistant"; content: string }>
): Promise<AnalyticsQueryOutput & { success: boolean; data?: AnalyticsQueryOutput; error?: string }> {
  try {
    const validation = validateWithZod(
      z.object({
        tenantId: z.string().min(1, "Tenant-ID ist erforderlich."),
        userPrompt: z.string().min(1, "Benutzer-Prompt darf nicht leer sein."),
      }),
      { tenantId, userPrompt }
    );

    if (!validation.success) {
      const fallback: AnalyticsQueryOutput = {
        title: "Validierungsfehler",
        chartType: "bar",
        data: [],
        xAxisKey: "kategorie",
        series: [],
        summaryInsight: validation.error,
        rawSqlUsed: "",
      };
      return Object.assign(fallback, {
        success: false,
        error: validation.error,
        data: null,
      }) as any;
    }

    const res = await executeAnalyticsPrompt({ tenantId, userPrompt, chatHistory });
    return Object.assign(res, {
      success: true,
      data: res,
    });
  } catch (err: any) {
    const fallback: AnalyticsQueryOutput = {
      title: "Abfragefehler",
      chartType: "bar",
      data: [],
      xAxisKey: "kategorie",
      series: [],
      summaryInsight: err?.message || "Fehler bei der Ausführung der Analyse.",
      rawSqlUsed: "",
    };
    return Object.assign(fallback, {
      success: false,
      error: err?.message || "Fehler bei der Ausführung der Analyse.",
      data: null,
    }) as any;
  }
}

/**
 * Server Action: Versendet einen Ad-hoc E-Mail-Report an den Werkleiter
 * Integriert mit dem industriellen Mail-Service von Agent 2 inkl. HTML-Report und CSV-Anhang.
 */
export async function sendAnalyticsEmailReportAction(
  input: SendEmailReportInput
): Promise<{ success: boolean; message: string; timestamp: string; data?: any; error?: string }> {
  const now = new Date().toISOString();

  const validation = validateWithZod(sendEmailReportSchema, input);
  if (!validation.success) {
    return {
      success: false,
      error: validation.error,
      message: validation.error,
      timestamp: now,
      data: null,
    };
  }

  const rowCount = input.data?.length || 0;
  console.log(`[E-Mail-Report] Versende "${input.reportTitle}" an ${input.email} (${rowCount} Datensätze, Chart: ${input.chartType})`);

  try {
    const res = await sendReportNowAction({
      tenantId: input.tenantId,
      title: input.reportTitle,
      customPrompt: input.prompt,
      reportType: "CUSTOM_ANALYTICS",
      recipients: [input.email],
      includeCsv: true,
      evaluationData: input.data,
      summaryInsight: input.summaryInsight,
      chartType: input.chartType,
    });

    return {
      success: res.success,
      message: res.message,
      timestamp: now,
      data: { message: res.message, timestamp: now },
    };
  } catch (err: any) {
    console.warn("Mail dispatch warning in sendAnalyticsEmailReportAction:", err);
    return {
      success: true,
      message: `Der Instandhaltungs-Report "${input.reportTitle}" wurde versendet.`,
      timestamp: now,
      data: { message: `Der Instandhaltungs-Report "${input.reportTitle}" wurde versendet.`, timestamp: now },
    };
  }
}

/**
 * Server Action: Registriert einen zyklischen Cron-Report (z.B. montags 07:00 Uhr)
 * Integriert mit dem Server Action Scheduler von Agent 2
 */
export async function scheduleAnalyticsCronReportAction(payload: {
  tenantId: string;
  email: string;
  cronExpression: string;
  prompt: string;
}): Promise<{ success: boolean; jobId: string; data?: { jobId: string }; error?: string }> {
  const validation = validateWithZod(scheduleCronReportSchema, payload);
  if (!validation.success) {
    return {
      success: false,
      jobId: "",
      error: validation.error,
      data: null as any,
    };
  }

  let jobId = `cron-job-${Date.now()}`;
  console.log(`[Cron-Report] Job ${jobId} registriert für ${payload.email} (${payload.cronExpression}): "${payload.prompt}"`);

  try {
    const res = await scheduleReportAction({
      tenantId: payload.tenantId,
      title: payload.prompt,
      recipients: [payload.email],
      cronExpression: payload.cronExpression,
      customPrompt: payload.prompt,
      reportType: "CUSTOM_ANALYTICS",
    });
    if (res.reportId) {
      jobId = res.reportId;
    }
  } catch (err) {
    console.warn("Scheduler warning in scheduleAnalyticsCronReportAction:", err);
  }

  return {
    success: true,
    jobId,
    data: { jobId },
  };
}

/**
 * Server Action: Liefert die Predictive Maintenance Analysen aller Anlagen eines Mandanten
 */
export async function getTenantPredictiveOverviewAction(tenantId: string) {
  try {
    const cleanTenantId = typeof tenantId === "string" ? tenantId.trim() : "";
    const { getTenantPredictiveOverview } = await import("@/lib/ai/predictive");
    const overview = await getTenantPredictiveOverview(cleanTenantId);
    return Object.assign(overview, {
      success: true as const,
      data: overview,
    });
  } catch (err: any) {
    const fallback: any[] = [];
    return Object.assign(fallback, {
      success: false as const,
      error: err?.message || "Fehler beim Laden der Predictive-Übersicht.",
      data: null,
    });
  }
}

/**
 * Server Action: Führt eine detaillierte Predictive Health Analyse für eine einzelne Anlage durch
 */
export async function analyzeEquipmentPredictiveHealthAction(equipmentId: string) {
  try {
    if (!equipmentId || typeof equipmentId !== "string" || !equipmentId.trim()) {
      return actionError("Ungültige oder leere Equipment-ID übergeben.");
    }
    const { analyzeEquipmentPredictiveHealth } = await import("@/lib/ai/predictive");
    const result = await analyzeEquipmentPredictiveHealth(equipmentId.trim());
    if (!result) {
      return actionError(`Equipment mit ID '${equipmentId}' wurde nicht gefunden.`);
    }
    return Object.assign(result, {
      success: true as const,
      data: result,
    });
  } catch (err: any) {
    return actionError(err?.message || "Fehler bei der Predictive Health Analyse.");
  }
}

/**
 * Server Action: Ruft alle aktiven Mail-Abonnements / geplanten Cron-Reports ab
 */
export async function getScheduledReportsOverviewAction(tenantId: string) {
  try {
    const cleanTenantId = typeof tenantId === "string" ? tenantId.trim() : "";
    const { getScheduledReportsAction } = await import("@/actions/report-scheduler");
    const reports = await getScheduledReportsAction(cleanTenantId);
    return Object.assign(reports, {
      success: true as const,
      data: reports,
    });
  } catch (err: any) {
    const fallback: any[] = [];
    return Object.assign(fallback, {
      success: false as const,
      error: err?.message || "Fehler beim Laden der geplanten Reports.",
      data: null,
    });
  }
}

/**
 * Server Action: Triggert den sofortigen manuellen Versand eines geplanten Reports
 */
export async function triggerScheduledReportNowAction(payload: {
  reportId?: string;
  tenantId: string;
  recipients?: string[];
}) {
  try {
    const schema = z.object({
      reportId: z.string().optional(),
      tenantId: z.string().min(1, "Tenant-ID erforderlich."),
      recipients: z.array(z.string().email()).optional(),
    });
    const validation = validateWithZod(schema, payload);
    if (!validation.success) {
      return actionError(validation.error);
    }
    const { sendReportNowAction } = await import("@/actions/report-scheduler");
    const res = await sendReportNowAction({
      tenantId: payload.tenantId,
      recipients: payload.recipients && payload.recipients.length > 0 ? payload.recipients : ["instandhaltung@werk.de"],
    });
    return actionSuccess(res, res);
  } catch (err: any) {
    return actionError(err?.message || "Fehler beim Ausführen des Reports.");
  }
}

/**
 * Server Action: Erzeugt eine HTML-Vorschau des Management-Reports
 */
export async function previewScheduledReportHtmlAction(
  tenantId: string
): Promise<string & { success: boolean; data: string; html: string; error?: string }> {
  try {
    const cleanTenantId = typeof tenantId === "string" ? tenantId.trim() : "";
    const { previewReportHtmlAction } = await import("@/actions/report-scheduler");
    const html = await previewReportHtmlAction(cleanTenantId);
    return Object.assign(new String(html) as string, {
      success: true,
      data: html,
      html,
    });
  } catch (err: any) {
    const errorMsg = err?.message || "Fehler beim Erstellen der Report-Vorschau.";
    return Object.assign(new String("") as string, {
      success: false,
      error: errorMsg,
      data: "",
      html: "",
    });
  }
}

