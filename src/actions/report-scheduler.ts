"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import {
  scheduledReportsStore,
  generateCsvFromRows,
  collectMaintenanceReportData,
  buildReportEmailHtml,
  buildSavedEvaluationEmailHtml,
  sendEmail,
} from "@/lib/scheduler-utils";
import type {
  ReportType,
  ScheduleFrequency,
  ScheduledReportConfig,
  ReportScheduleInput,
  SendReportInput,
} from "@/lib/scheduler-utils";
import { validateWithZod } from "./action-utils";

export type {
  ReportType,
  ScheduleFrequency,
  ScheduledReportConfig,
  ReportScheduleInput,
  SendReportInput,
};

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch (_) {
    // Graceful no-op when executed outside of Next.js server context (e.g. Vitest)
  }
}

const reportScheduleSchema = z.object({
  tenantId: z.string().min(1, "Tenant-ID ist erforderlich."),
  title: z.string().optional(),
  recipients: z.array(z.string().min(1)).min(1, "Mindestens eine Empfänger-E-Mail ist erforderlich."),
  cronExpression: z.string().optional(),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "ON_DEMAND"]).optional(),
  reportType: z.enum(["EXECUTIVE_SUMMARY", "DOWNTIME_ANALYSIS", "SPARE_PARTS_SHORTAGE", "SAP_SYNC_HEALTH", "CUSTOM_ANALYTICS"]).optional(),
  customPrompt: z.string().optional(),
  includeCsv: z.boolean().optional(),
});

// ============================================================================
// SERVER ACTIONS FÜR NEXT.JS
// ============================================================================

/**
 * Registriert einen neuen automatischen Auswertungsbericht (Cron-Report).
 */
export async function scheduleReportAction(payload: ReportScheduleInput): Promise<{
  success: boolean;
  reportId: string;
  message: string;
  error?: string;
  data?: { reportId: string; message: string };
}> {
  try {
    const validation = validateWithZod(reportScheduleSchema, payload);
    if (!validation.success) {
      return {
        success: false,
        reportId: "",
        message: validation.error,
        error: validation.error,
      };
    }
    const validated = validation.data;

    const {
      tenantId,
      title,
      recipients,
      cronExpression = "0 7 * * 1",
      frequency = "WEEKLY",
      reportType = "EXECUTIVE_SUMMARY",
      customPrompt,
      includeCsv = true,
    } = validated;

    const reportId = `rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const config: ScheduledReportConfig = {
      id: reportId,
      tenantId,
      title: title || "MaintAI Instandhaltungsbericht",
      recipients,
      cronExpression,
      frequency,
      reportType,
      customPrompt,
      includeCsv,
      isActive: true,
      createdAt: new Date(),
    };

    scheduledReportsStore.set(reportId, config);

    safeRevalidatePath("/analytics");

    const message = `Zeitgesteuerter Report '${config.title}' erfolgreich eingerichtet (${frequency}).`;
    return {
      success: true,
      reportId,
      message,
      data: { reportId, message },
    };
  } catch (err: any) {
    console.error("Fehler in scheduleReportAction:", err);
    return {
      success: false,
      reportId: "",
      message: err?.message || "Fehler beim Einrichten des zeitgesteuerten Berichts.",
      error: err?.message || "Fehler beim Einrichten des zeitgesteuerten Berichts.",
    };
  }
}

const sendReportNowSchema = z.object({
  tenantId: z.string().min(1, "Tenant-ID ist erforderlich."),
  reportId: z.string().optional(),
  reportType: z.enum(["EXECUTIVE_SUMMARY", "DOWNTIME_ANALYSIS", "SPARE_PARTS_SHORTAGE", "SAP_SYNC_HEALTH", "CUSTOM_ANALYTICS"]).optional(),
  title: z.string().optional(),
  customPrompt: z.string().optional(),
  recipients: z.array(z.string().min(1)).min(1, "Mindestens ein Empfänger ist erforderlich."),
  includeCsv: z.boolean().optional(),
  evaluationData: z.array(z.record(z.any())).optional(),
  summaryInsight: z.string().optional(),
  chartType: z.string().optional(),
});

/**
 * Führt einen Report sofort aus und sendet die E-Mail (inkl. HTML-Template und CSV-Anhang)
 * an die angegebenen Empfänger.
 * Unterstützt sowohl den Management-Standardbericht als auch KI-basierte benutzerdefinierte
 * oder gespeicherte Auswertungen.
 */
export async function sendReportNowAction(payload: SendReportInput): Promise<{
  success: boolean;
  message: string;
  messageId?: string;
  simulated?: boolean;
  error?: string;
  data?: any;
}> {
  try {
    const validation = validateWithZod(sendReportNowSchema, payload);
    if (!validation.success) {
      return {
        success: false,
        message: validation.error,
        error: validation.error,
      };
    }
    const validated = validation.data;

    let {
      tenantId,
      reportId,
      reportType = "EXECUTIVE_SUMMARY",
      title,
      customPrompt,
      recipients,
      includeCsv = true,
      evaluationData,
      summaryInsight,
      chartType,
    } = validated;

    if (reportId && scheduledReportsStore.has(reportId)) {
      const stored = scheduledReportsStore.get(reportId)!;
      title = title || stored.title;
      reportType = stored.reportType;
      customPrompt = customPrompt || stored.customPrompt;
      includeCsv = stored.includeCsv ?? includeCsv;
      if (!recipients || recipients.length === 0) {
        recipients = stored.recipients;
      }
    }

    let tenantName = "Leitwerk Produktion";
    try {
      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
      });
      if (tenant?.name) {
        tenantName = tenant.name;
      }
    } catch (_) {}

    const nowStr = new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" });
    const attachments: Array<{ filename: string; content: string; contentType?: string }> = [];
    let htmlContent = "";
    let emailSubject = "";

    if (reportType === "CUSTOM_ANALYTICS" || evaluationData || customPrompt) {
      let rows: Array<Record<string, any>> = evaluationData || [];
      let insight: string | undefined = summaryInsight;
      let finalChartType: string | undefined = chartType;

      if ((!rows || rows.length === 0) && customPrompt) {
        try {
          const { executeAnalyticsPrompt } = await import("@/lib/ai/analytics-agent");
          const queryResult = await executeAnalyticsPrompt({
            tenantId,
            userPrompt: customPrompt,
          });
          rows = queryResult.data;
          insight = queryResult.summaryInsight;
          finalChartType = queryResult.chartType;
        } catch (err: any) {
          console.warn("Analytics Execution in Scheduler warning:", err?.message);
        }
      }

      const effectiveTitle = title || (customPrompt ? `Auswertung: ${customPrompt}` : "MaintAI Auswertungsbericht");
      emailSubject = `[MaintAI] ${effectiveTitle}`;

      htmlContent = buildSavedEvaluationEmailHtml({
        tenantName,
        reportTitle: effectiveTitle,
        prompt: customPrompt,
        summaryInsight: insight,
        chartType: finalChartType,
        generatedAt: nowStr,
        data: rows,
      });

      if (includeCsv && rows && rows.length > 0) {
        const csvContent = generateCsvFromRows(rows);
        const filename = `auswertung_${new Date().toISOString().slice(0, 10)}.csv`;
        attachments.push({
          filename,
          content: csvContent,
          contentType: "text/csv; charset=utf-8",
        });
      }
    } else {
      const reportTitle = title || "Wöchentlicher Instandhaltungs-Managementbericht";
      emailSubject = `[MaintAI] ${reportTitle} - KW ${getCalendarWeek(new Date())}`;

      const reportData = await collectMaintenanceReportData(tenantId, reportTitle);
      htmlContent = await buildReportEmailHtml(reportData);

      if (includeCsv) {
        if (reportData.rawCsv) {
          attachments.push({
            filename: `instandhaltungsbericht_${new Date().toISOString().slice(0, 10)}.csv`,
            content: reportData.rawCsv,
            contentType: "text/csv; charset=utf-8",
          });
        } else {
          const csvRows = [
            ...reportData.topDowntimeEquipments.map((e) => ({
              Kategorie: "Top-Ausfall-Equipment",
              Name: e.name,
              Nummer: e.equipmentNumber,
              Anzahl_Stoerungen: e.orderCount,
              Stillstand_Minuten: e.downtimeMinutes,
            })),
            ...reportData.recentEmergencyOrders.map((o) => ({
              Kategorie: "Notfall_Auftrag",
              Auftragsnummer: o.orderNumber,
              Titel: o.title,
              Status: o.status,
              Erstellt_Am: o.createdAt,
            })),
          ];

          if (csvRows.length > 0) {
            const csvContent = generateCsvFromRows(csvRows);
            attachments.push({
              filename: `instandhaltungsbericht_${new Date().toISOString().slice(0, 10)}.csv`,
              content: csvContent,
              contentType: "text/csv; charset=utf-8",
            });
          }
        }
      }
    }

    const mailResult = await sendEmail({
      to: recipients,
      subject: emailSubject,
      html: htmlContent,
      attachments,
    });

    if (reportId && scheduledReportsStore.has(reportId)) {
      const stored = scheduledReportsStore.get(reportId)!;
      stored.lastExecutedAt = new Date();
    }

    return {
      success: mailResult.success,
      messageId: mailResult.messageId,
      simulated: mailResult.simulated,
      message: `Bericht erfolgreich an ${recipients.join(", ")} versendet.`,
      data: {
        messageId: mailResult.messageId,
        simulated: mailResult.simulated,
        message: `Bericht erfolgreich an ${recipients.join(", ")} versendet.`,
      },
    };
  } catch (err: any) {
    console.error("Fehler beim Versenden des Berichts:", err);
    return {
      success: false,
      message: err?.message || "Fehler beim Versenden des Berichts.",
      error: err?.message || "Fehler beim Versenden des Berichts.",
    };
  }
}

function getCalendarWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Dedizierte Action zum Versenden einer gespeicherten Auswertung.
 */
export async function sendSavedEvaluationReportAction(payload: {
  tenantId: string;
  reportId?: string;
  title?: string;
  prompt?: string;
  recipients: string[];
  data?: Array<Record<string, any>>;
  summaryInsight?: string;
  chartType?: string;
  includeCsv?: boolean;
}) {
  return await sendReportNowAction({
    tenantId: payload.tenantId,
    reportId: payload.reportId,
    title: payload.title,
    customPrompt: payload.prompt,
    reportType: "CUSTOM_ANALYTICS",
    recipients: payload.recipients,
    evaluationData: payload.data,
    summaryInsight: payload.summaryInsight,
    chartType: payload.chartType,
    includeCsv: payload.includeCsv ?? true,
  });
}

/**
 * Liefert eine Liste aller registrierten geplanten Reports für einen Mandanten.
 */
export async function getScheduledReportsAction(tenantId: string): Promise<ScheduledReportConfig[]> {
  try {
    const all = Array.from(scheduledReportsStore.values());
    const filtered = all.filter((r) => r.tenantId === tenantId);
    return Object.assign(filtered, {
      success: true as const,
      data: filtered,
    });
  } catch (err: any) {
    const fallback: ScheduledReportConfig[] = [];
    return Object.assign(fallback, {
      success: false as const,
      error: err?.message || "Fehler beim Abrufen der geplanten Reports.",
      data: fallback,
    });
  }
}

/**
 * Liefert den HTML-Code eines Reports zur direkten Vorschau im Browser / Dashboard.
 */
export async function previewReportHtmlAction(
  tenantId: string,
  reportType: ReportType = "EXECUTIVE_SUMMARY",
  customPrompt?: string
): Promise<string> {
  try {
    if (reportType === "CUSTOM_ANALYTICS" || customPrompt) {
      let rows: Array<Record<string, any>> = [];
      let insight: string | undefined;
      let chartType: string | undefined;

      if (customPrompt) {
        try {
          const { executeAnalyticsPrompt } = await import("@/lib/ai/analytics-agent");
          const queryResult = await executeAnalyticsPrompt({ tenantId, userPrompt: customPrompt });
          rows = queryResult.data;
          insight = queryResult.summaryInsight;
          chartType = queryResult.chartType;
        } catch (_) {}
      }

      const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, tenantId) });
      return buildSavedEvaluationEmailHtml({
        tenantName: tenant?.name || "Leitwerk Produktion",
        reportTitle: customPrompt ? `Vorschau: ${customPrompt}` : "Vorschau gespeicherte Auswertung",
        prompt: customPrompt,
        summaryInsight: insight,
        chartType,
        generatedAt: new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" }),
        data: rows,
      });
    }

    const data = await collectMaintenanceReportData(tenantId, "Vorschau Instandhaltungsbericht");
    return await buildReportEmailHtml(data);
  } catch (err: any) {
    console.error("Fehler bei Report-Vorschau:", err);
    return `<div style="padding: 20px; color: red;">Fehler beim Erzeugen der Vorschau: ${err?.message}</div>`;
  }
}

/**
 * Cron-Runner: Wird durch zyklische Scheduler (z.B. Vercel Cron / GitHub Actions / Node cron) getriggert.
 * Führt alle fälligen Reports aus und versendet sie.
 */
export async function triggerCronReportsAction(frequency?: ScheduleFrequency): Promise<{
  success: boolean;
  executedCount: number;
  data?: { executedCount: number };
  error?: string;
}> {
  let executedCount = 0;
  try {
    const reports = Array.from(scheduledReportsStore.values());

    for (const rep of reports) {
      if (!rep.isActive) continue;
      if (frequency && rep.frequency !== frequency) continue;

      try {
        await sendReportNowAction({
          tenantId: rep.tenantId,
          reportId: rep.id,
          reportType: rep.reportType,
          title: rep.title,
          customPrompt: rep.customPrompt,
          recipients: rep.recipients,
          includeCsv: rep.includeCsv,
        });
        rep.lastExecutedAt = new Date();
        executedCount++;
      } catch (err) {
        console.error(`Fehler beim Ausführen von Report ${rep.id}:`, err);
      }
    }

    return {
      success: true,
      executedCount,
      data: { executedCount },
    };
  } catch (err: any) {
    return {
      success: false,
      executedCount,
      error: err?.message || "Fehler beim Ausführen der zyklischen Reports.",
    };
  }
}
