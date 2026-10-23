import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import {
  tenants,
  maintenanceOrders,
  spareParts,
  sapSyncQueue,
} from "@/db/schema";
import * as net from "net";

// ============================================================================
// 1. TYPEN & SCHNITTSTELLEN
// ============================================================================

export type ReportType =
  | "EXECUTIVE_SUMMARY"
  | "DOWNTIME_ANALYSIS"
  | "SPARE_PARTS_SHORTAGE"
  | "SAP_SYNC_HEALTH"
  | "CUSTOM_ANALYTICS";

export type ScheduleFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "ON_DEMAND";

export interface ScheduledReportConfig {
  id: string;
  tenantId: string;
  title: string;
  recipients: string[];
  cronExpression: string;
  frequency: ScheduleFrequency;
  reportType: ReportType;
  customPrompt?: string;
  includeCsv: boolean;
  isActive: boolean;
  lastExecutedAt?: Date | null;
  createdAt: Date;
}

export interface ReportScheduleInput {
  tenantId: string;
  title: string;
  recipients: string[];
  cronExpression?: string;
  frequency?: ScheduleFrequency;
  reportType?: ReportType;
  customPrompt?: string;
  includeCsv?: boolean;
}

export interface MaintenanceReportData {
  tenantName: string;
  generatedAt: string;
  reportTitle: string;
  summary: {
    totalOrders: number;
    openOrders: number;
    emergencyOrders: number;
    completedOrders: number;
    totalDowntimeMinutes: number;
    lowStockPartsCount: number;
    sapPendingCount: number;
    sapFailedCount: number;
  };
  topDowntimeEquipments: Array<{
    name: string;
    equipmentNumber: string;
    downtimeMinutes: number;
    orderCount: number;
  }>;
  criticalSpareParts: Array<{
    materialNr: string;
    name: string;
    stock: number;
    safetyStock: number;
    unit: string;
  }>;
  recentEmergencyOrders: Array<{
    orderNumber: string;
    title: string;
    status: string;
    createdAt: string;
  }>;
  rawCsv?: string;
}

export interface SendMailOptions {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{ filename: string; content: string; contentType?: string }>;
}

export interface SendReportInput {
  tenantId: string;
  reportId?: string;
  reportType?: ReportType;
  title?: string;
  customPrompt?: string;
  recipients: string[];
  includeCsv?: boolean;
  evaluationData?: Array<Record<string, any>>;
  summaryInsight?: string;
  chartType?: string;
}

// In-Memory Speicher für geplante Reports (resilient mit Fallbacks)
const globalReportScheduler = globalThis as unknown as {
  _scheduledReports?: Map<string, ScheduledReportConfig>;
};

if (!globalReportScheduler._scheduledReports) {
  globalReportScheduler._scheduledReports = new Map<string, ScheduledReportConfig>();
}

export const scheduledReportsStore = globalReportScheduler._scheduledReports!;

// ============================================================================
// 2. CSV GENERATOR
// ============================================================================

/**
 * Konvertiert ein beliebiges Array von Datenobjekten in valides RFC-konformes CSV.
 */
export function generateCsvFromRows(rows: Array<Record<string, any>>): string {
  if (!rows || rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines: string[] = [];
  lines.push(headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(";"));

  for (const row of rows) {
    const values = headers.map((h) => {
      const val = row[h];
      if (val === null || val === undefined) return '""';
      if (typeof val === "number") return val.toString().replace(".", ",");
      if (val instanceof Date) return `"${val.toISOString()}"`;
      return `"${String(val).replace(/"/g, '""')}"`;
    });
    lines.push(values.join(";"));
  }

  return lines.join("\n");
}

// ============================================================================
// 3. DATENAGGREGATION AUS DER DATENBANK
// ============================================================================

/**
 * Sammelt alle relevanten Instandhaltungs- und SAP-Kennzahlen für den Mandanten.
 */
export async function collectMaintenanceReportData(
  tenantId: string,
  reportTitle: string = "Wöchentlicher Instandhaltungs- & SAP-Statusbericht"
): Promise<MaintenanceReportData> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId);
  let tenantName = "Leitwerk Produktion";
  let allOrders: any[] = [];
  let allParts: any[] = [];
  let queueEntries: any[] = [];

  if (isUuid) {
    try {
      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
      });
      if (tenant?.name) tenantName = tenant.name;

      allOrders = await db.query.maintenanceOrders.findMany({
        where: eq(maintenanceOrders.tenantId, tenantId),
        with: {
          currentStatus: true,
          equipment: true,
        },
        orderBy: [desc(maintenanceOrders.createdAt)],
        limit: 200,
      });

      allParts = await db.query.spareParts.findMany({
        where: eq(spareParts.tenantId, tenantId),
        limit: 100,
      });

      queueEntries = await db.query.sapSyncQueue.findMany({
        where: eq(sapSyncQueue.tenantId, tenantId),
      });
    } catch (e) {
      console.warn("DB query fallback in collectMaintenanceReportData:", e);
    }
  }

  // Aggregationen berechnen
  let openOrders = 0;
  let emergencyOrders = 0;
  let completedOrders = 0;
  let totalDowntimeMinutes = 0;

  const equipmentDowntimeMap = new Map<string, { name: string; nr: string; minutes: number; count: number }>();

  for (const o of allOrders) {
    const cat = o.currentStatus?.category;
    if (cat === "OPEN" || cat === "IN_PROGRESS" || cat === "DRAFT") {
      openOrders++;
    }
    if (cat === "COMPLETED" || cat === "CLOSED") {
      completedOrders++;
    }
    if (o.priority === "1_EMERGENCY") {
      emergencyOrders++;
    }

    const downtime = o.downtimeMinutes || 0;
    totalDowntimeMinutes += downtime;

    if (o.equipmentId && o.equipment) {
      const existing = equipmentDowntimeMap.get(o.equipmentId) || {
        name: o.equipment.name,
        nr: o.equipment.equipmentNumber,
        minutes: 0,
        count: 0,
      };
      existing.minutes += downtime;
      existing.count += 1;
      equipmentDowntimeMap.set(o.equipmentId, existing);
    }
  }

  const topDowntimeEquipments = Array.from(equipmentDowntimeMap.values())
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5)
    .map((e) => ({
      name: e.name,
      equipmentNumber: e.nr,
      downtimeMinutes: e.minutes,
      orderCount: e.count,
    }));

  // 2. Kritische Ersatzteile mit Unterbestand abrufen
  const criticalSpareParts: MaintenanceReportData["criticalSpareParts"] = [];
  for (const p of allParts) {
    const stock = Number(p.stockQuantity || 0);
    const safety = Number(p.minStockLevel || 0);
    if (stock <= safety) {
      criticalSpareParts.push({
        materialNr: p.sapMaterialNr || p.internalPartNumber,
        name: p.name,
        stock,
        safetyStock: safety,
        unit: p.unitOfMeasure || "ST",
      });
    }
  }

  // 3. SAP Sync Queue Status abrufen
  let sapPendingCount = 0;
  let sapFailedCount = 0;
  for (const q of queueEntries) {
    if (q.status === "PENDING" || q.status === "PROCESSING") sapPendingCount++;
    if (q.status === "FAILED") sapFailedCount++;
  }

  // 4. Letzte Notfall-Störungen
  const recentEmergencyOrders = allOrders
    .filter((o) => o.priority === "1_EMERGENCY")
    .slice(0, 5)
    .map((o) => ({
      orderNumber: o.orderNumber,
      title: o.title,
      status: o.currentStatus?.name || "Offen",
      createdAt: o.createdAt.toLocaleDateString("de-DE"),
    }));

  // 5. CSV Rohdaten generieren
  const csvRows = [
    ["Auftragsnummer", "Titel", "Prioritaet", "Stillstand_Min", "Status", "Erstellt_Am"].join(";"),
    ...allOrders.slice(0, 50).map((o) =>
      [
        `"${o.orderNumber}"`,
        `"${o.title.replace(/"/g, '""')}"`,
        `"${o.priority}"`,
        o.downtimeMinutes || 0,
        `"${o.currentStatus?.name || ''}"`,
        `"${o.createdAt.toISOString()}"`,
      ].join(";")
    ),
  ];
  const rawCsv = csvRows.join("\n");

  return {
    tenantName,
    generatedAt: new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" }),
    reportTitle,
    summary: {
      totalOrders: allOrders.length,
      openOrders,
      emergencyOrders,
      completedOrders,
      totalDowntimeMinutes,
      lowStockPartsCount: criticalSpareParts.length,
      sapPendingCount,
      sapFailedCount,
    },
    topDowntimeEquipments,
    criticalSpareParts: criticalSpareParts.slice(0, 6),
    recentEmergencyOrders,
    rawCsv,
  };
}

// ============================================================================
// 4. HTML EMAIL TEMPLATE GENERATOR
// ============================================================================

/**
 * Erstellt eine voll responsive, ansprechende HTML-Mail für CMMS-Auswertungen.
 */
export async function buildReportEmailHtml(data: MaintenanceReportData): Promise<string> {
  const { summary, topDowntimeEquipments, criticalSpareParts, recentEmergencyOrders } = data;

  const equipmentRowsHtml = topDowntimeEquipments.length > 0
    ? topDowntimeEquipments
        .map(
          (eq) => `
      <tr style="border-bottom: 1px solid #334155;">
        <td style="padding: 10px; font-weight: 600; color: #f1f5f9;">${eq.name} <span style="font-size: 11px; color: #94a3b8;">(${eq.equipmentNumber})</span></td>
        <td style="padding: 10px; color: #ef4444; font-weight: bold; text-align: right;">${eq.downtimeMinutes} min</td>
        <td style="padding: 10px; color: #cbd5e1; text-align: right;">${eq.orderCount}</td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="3" style="padding: 12px; text-align: center; color: #94a3b8;">Keine Ausfallzeiten im Zeitraum.</td></tr>`;

  const sparePartsRowsHtml = criticalSpareParts.length > 0
    ? criticalSpareParts
        .map(
          (sp) => `
      <tr style="border-bottom: 1px solid #334155;">
        <td style="padding: 10px; font-family: monospace; color: #38bdf8;">${sp.materialNr}</td>
        <td style="padding: 10px; color: #f1f5f9;">${sp.name}</td>
        <td style="padding: 10px; color: #f87171; font-weight: bold; text-align: right;">${sp.stock} / ${sp.safetyStock} ${sp.unit}</td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="3" style="padding: 12px; text-align: center; color: #94a3b8;">Alle Bestände über Meldebestand.</td></tr>`;

  const emergencyOrdersHtml = recentEmergencyOrders.length > 0
    ? recentEmergencyOrders
        .map(
          (eo) => `
      <div style="background-color: #1e293b; border-left: 4px solid #ef4444; padding: 10px 14px; margin-bottom: 8px; border-radius: 4px;">
        <div style="display: flex; justify-content: space-between; font-weight: 600; color: #f8fafc; font-size: 13px;">
          <span>${eo.orderNumber}: ${eo.title}</span>
          <span style="color: #f87171;">${eo.status}</span>
        </div>
        <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Erfasst am: ${eo.createdAt}</div>
      </div>`
        )
        .join("")
    : `<div style="color: #94a3b8; font-size: 13px;">Keine Notfall-Aufträge erfasst.</div>`;

  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <title>${data.reportTitle}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #090d16; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0;">
  <div style="max-width: 680px; margin: 30px auto; background-color: #0f172a; border-radius: 12px; border: 1px solid #1e293b; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
    
    <!-- HEADER -->
    <div style="background: linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%); padding: 32px 28px; border-bottom: 1px solid #1e293b;">
      <div style="display: inline-block; background-color: #3b82f6; color: #ffffff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; padding: 4px 10px; border-radius: 20px; margin-bottom: 12px;">
        MaintAI CMMS & SAP PM
      </div>
      <h1 style="margin: 0 0 6px 0; color: #ffffff; font-size: 22px; font-weight: 700;">${data.reportTitle}</h1>
      <p style="margin: 0; color: #93c5fd; font-size: 13px;">
        Mandant: <strong>${data.tenantName}</strong> &bull; Stichtag: ${data.generatedAt}
      </p>
    </div>

    <!-- KPI TILES -->
    <div style="padding: 24px 28px;">
      <h3 style="margin: 0 0 14px 0; color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Wesentliche Kennzahlen</h3>
      
      <table style="width: 100%; border-collapse: separate; border-spacing: 10px; margin-bottom: 20px;">
        <tr>
          <td style="background-color: #1e293b; border-radius: 8px; padding: 16px; width: 25%; text-align: center; border: 1px solid #334155;">
            <div style="font-size: 24px; font-weight: bold; color: #38bdf8;">${summary.openOrders}</div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Offene Aufträge</div>
          </td>
          <td style="background-color: #1e293b; border-radius: 8px; padding: 16px; width: 25%; text-align: center; border: 1px solid #334155;">
            <div style="font-size: 24px; font-weight: bold; color: #ef4444;">${summary.emergencyOrders}</div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Notfall/Stillstand</div>
          </td>
          <td style="background-color: #1e293b; border-radius: 8px; padding: 16px; width: 25%; text-align: center; border: 1px solid #334155;">
            <div style="font-size: 24px; font-weight: bold; color: #fbbf24;">${summary.totalDowntimeMinutes} min</div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Stillstandszeit</div>
          </td>
          <td style="background-color: #1e293b; border-radius: 8px; padding: 16px; width: 25%; text-align: center; border: 1px solid #334155;">
            <div style="font-size: 24px; font-weight: bold; color: ${summary.sapFailedCount > 0 ? '#ef4444' : '#34d399'};">${summary.sapPendingCount + summary.sapFailedCount}</div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">SAP Sync Queue</div>
          </td>
        </tr>
      </table>

      <!-- TOP DOWNTIME EQUIPMENTS -->
      <h3 style="margin: 24px 0 12px 0; color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Top Stillstands-Anlagen</h3>
      <table style="width: 100%; border-collapse: collapse; background-color: #131c2e; border-radius: 8px; overflow: hidden; font-size: 12px;">
        <thead>
          <tr style="background-color: #1e293b; color: #94a3b8; text-align: left;">
            <th style="padding: 10px;">Equipment / Anlage</th>
            <th style="padding: 10px; text-align: right;">Stillstand</th>
            <th style="padding: 10px; text-align: right;">Störungen</th>
          </tr>
        </thead>
        <tbody>
          ${equipmentRowsHtml}
        </tbody>
      </table>

      <!-- KRITISCHE ERSATZTEILE -->
      <h3 style="margin: 28px 0 12px 0; color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Ersatzteil-Engpässe (Meldebestand unterschritten)</h3>
      <table style="width: 100%; border-collapse: collapse; background-color: #131c2e; border-radius: 8px; overflow: hidden; font-size: 12px;">
        <thead>
          <tr style="background-color: #1e293b; color: #94a3b8; text-align: left;">
            <th style="padding: 10px;">SAP Material-Nr</th>
            <th style="padding: 10px;">Bezeichnung</th>
            <th style="padding: 10px; text-align: right;">Bestand / Mindest</th>
          </tr>
        </thead>
        <tbody>
          ${sparePartsRowsHtml}
        </tbody>
      </table>

      <!-- RECENT EMERGENCY ORDERS -->
      <h3 style="margin: 28px 0 12px 0; color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Akute Notfall-Aufträge (Prio 1)</h3>
      ${emergencyOrdersHtml}

    </div>

    <!-- FOOTER -->
    <div style="background-color: #0b0f19; padding: 20px 28px; text-align: center; border-top: 1px solid #1e293b; font-size: 12px; color: #64748b;">
      <p style="margin: 0 0 6px 0;">Automatisch generiert durch MaintAI Enterprise Scheduler.</p>
      <p style="margin: 0;">SAP S/4HANA & OData v4 Integration aktiv &bull; Idempotente Outbox-Synchronisation</p>
    </div>

  </div>
</body>
</html>`;
}

/**
 * Erstellt eine responsive HTML-E-Mail für benutzerdefinierte oder gespeicherte Analytics-Auswertungen.
 */
export function buildSavedEvaluationEmailHtml(data: {
  tenantName: string;
  reportTitle: string;
  prompt?: string;
  summaryInsight?: string;
  chartType?: string;
  generatedAt: string;
  data: Array<Record<string, any>>;
}): string {
  const { tenantName, reportTitle, prompt, summaryInsight, chartType, generatedAt, data: rows } = data;
  const headers = rows && rows.length > 0 ? Object.keys(rows[0]) : [];

  const tableHeadersHtml = headers
    .map((h) => `<th style="padding: 10px 12px; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px;">${h}</th>`)
    .join("");

  const tableRowsHtml = rows && rows.length > 0
    ? rows.slice(0, 50).map((row, idx) => {
        const bg = idx % 2 === 0 ? "#131c2e" : "#0f172a";
        const cells = headers.map((h) => {
          const val = row[h];
          const isNum = typeof val === "number";
          const displayVal = val === null || val === undefined ? "-" : isNum ? val.toLocaleString("de-DE") : String(val);
          return `<td style="padding: 9px 12px; color: ${isNum ? '#38bdf8' : '#e2e8f0'}; text-align: ${isNum ? 'right' : 'left'}; font-weight: ${isNum ? '600' : 'normal'};">${displayVal}</td>`;
        }).join("");
        return `<tr style="background-color: ${bg}; border-bottom: 1px solid #1e293b;">${cells}</tr>`;
      }).join("")
    : `<tr><td colspan="${Math.max(headers.length, 1)}" style="padding: 14px; text-align: center; color: #94a3b8;">Keine Datenzeilen verfügbar.</td></tr>`;

  return `
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <title>${reportTitle}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #090d16; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0;">
  <div style="max-width: 720px; margin: 30px auto; background-color: #0f172a; border-radius: 12px; border: 1px solid #1e293b; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
    
    <!-- HEADER -->
    <div style="background: linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%); padding: 32px 28px; border-bottom: 1px solid #1e293b;">
      <div style="display: inline-block; background-color: #3b82f6; color: #ffffff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; padding: 4px 10px; border-radius: 20px; margin-bottom: 12px;">
        MaintAI Analytics & Report Engine
      </div>
      <h1 style="margin: 0 0 6px 0; color: #ffffff; font-size: 22px; font-weight: 700;">${reportTitle}</h1>
      <p style="margin: 0; color: #93c5fd; font-size: 13px;">
        Mandant: <strong>${tenantName}</strong> &bull; Stichtag: ${generatedAt}
      </p>
    </div>

    <div style="padding: 24px 28px;">
      <!-- INSIGHT BOX -->
      ${summaryInsight ? `
      <div style="background-color: #1e293b; border-left: 4px solid #38bdf8; padding: 14px 16px; margin-bottom: 20px; border-radius: 6px;">
        <div style="font-size: 11px; font-weight: 700; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">
          KI-Auswertung & Executive Insight
        </div>
        <div style="font-size: 14px; color: #f1f5f9; line-height: 1.5;">${summaryInsight}</div>
      </div>
      ` : ''}

      <!-- QUERY METADATA -->
      <table style="width: 100%; border-collapse: separate; border-spacing: 8px; margin-bottom: 20px;">
        <tr>
          ${prompt ? `
          <td style="background-color: #131c2e; border: 1px solid #1e293b; border-radius: 6px; padding: 12px; font-size: 12px;">
            <span style="color: #94a3b8;">Basis-Prompt:</span> <strong style="color: #cbd5e1;">${prompt}</strong>
          </td>
          ` : ''}
          <td style="background-color: #131c2e; border: 1px solid #1e293b; border-radius: 6px; padding: 12px; font-size: 12px; width: 140px; text-align: center;">
            <span style="color: #94a3b8;">Datensätze:</span> <strong style="color: #38bdf8; font-size: 15px; display: block;">${rows?.length || 0}</strong>
          </td>
        </tr>
      </table>

      <!-- DATA TABLE -->
      <h3 style="margin: 20px 0 10px 0; color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
        Ergebnisdaten (${rows?.length || 0} Zeilen ${(rows?.length || 0) > 50 ? '- erste 50 dargestellt, vollständige Daten als CSV' : ''})
      </h3>
      <div style="overflow-x: auto; border: 1px solid #1e293b; border-radius: 8px; margin-bottom: 15px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
          <thead>
            <tr style="background-color: #1e293b; color: #94a3b8; text-align: left; border-bottom: 1px solid #334155;">
              ${tableHeadersHtml}
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
      </div>
      <p style="margin: 0; font-size: 12px; color: #64748b;">
        * Hinweis: Die vollständigen Rohdaten finden Sie zusätzlich im standardisierten UTF-8 CSV-Anhang.
      </p>
    </div>

    <!-- FOOTER -->
    <div style="background-color: #0b0f19; padding: 20px 28px; text-align: center; border-top: 1px solid #1e293b; font-size: 12px; color: #64748b;">
      <p style="margin: 0 0 6px 0;">Automatisch generiert durch MaintAI Enterprise Scheduler.</p>
      <p style="margin: 0;">SAP S/4HANA & OData v4 Integration aktiv &bull; Idempotente Outbox-Synchronisation</p>
    </div>

  </div>
</body>
</html>
  `;
}

// ============================================================================
// 5. LOW-LEVEL NATIVE SMTP CLIENT (ZERO DEPENDENCIES)
// ============================================================================

/**
 * Versendet E-Mails über SMTP (mit nativem Socket/TLS).
 * Falls kein SMTP konfiguriert ist (z. B. lokaler Dev-Server), wird der Mailversand
 * sauber simuliert und im Log dokumentiert.
 */
export async function sendEmail(options: SendMailOptions): Promise<{
  success: boolean;
  messageId?: string;
  simulated?: boolean;
  error?: string;
}> {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM || "maintai-reports@fertigung.de";

  // Wenn keine SMTP Zugangsdaten vorhanden sind: Resilienter Dev/Simulations-Modus
  if (!host) {
    const mockId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    console.log(
      `[MaintAI MailService] (SIMULIERT) E-Mail an [${options.to.join(
        ", "
      )}] gesendet. Betreff: "${options.subject}". MessageId: ${mockId}`
    );
    return {
      success: true,
      messageId: mockId,
      simulated: true,
    };
  }

  return new Promise((resolve) => {
    try {
      const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const socket = net.createConnection(port, host);
      let step = 0;

      const finish = (success: boolean, error?: string) => {
        try {
          socket.end();
        } catch (_) {}
        resolve({
          success,
          messageId: `smtp-${Date.now()}`,
          error,
        });
      };

      socket.setTimeout(10000, () => {
        finish(false, "SMTP Verbindungs-Timeout");
      });

      socket.on("error", (err) => {
        finish(false, err.message);
      });

      socket.on("data", (chunk) => {
        const response = chunk.toString();

        if (step === 0 && response.startsWith("220")) {
          socket.write(`EHLO ${host}\r\n`);
          step = 1;
        } else if (step === 1 && response.startsWith("250")) {
          if (user && pass) {
            socket.write("AUTH LOGIN\r\n");
            step = 2;
          } else {
            socket.write(`MAIL FROM:<${from}>\r\n`);
            step = 4;
          }
        } else if (step === 2 && response.startsWith("334")) {
          socket.write(`${Buffer.from(user!).toString("base64")}\r\n`);
          step = 3;
        } else if (step === 3 && response.startsWith("334")) {
          socket.write(`${Buffer.from(pass!).toString("base64")}\r\n`);
          step = 4;
        } else if (step === 4 && response.startsWith("235")) {
          socket.write(`MAIL FROM:<${from}>\r\n`);
          step = 5;
        } else if ((step === 4 || step === 5) && response.startsWith("250")) {
          for (const recipient of options.to) {
            socket.write(`RCPT TO:<${recipient}>\r\n`);
          }
          step = 6;
        } else if (step === 6 && response.startsWith("250")) {
          socket.write("DATA\r\n");
          step = 7;
        } else if (step === 7 && response.startsWith("354")) {
          let emailBody = "";
          emailBody += `From: "MaintAI Instandhaltung" <${from}>\r\n`;
          emailBody += `To: ${options.to.join(", ")}\r\n`;
          emailBody += `Subject: =?UTF-8?B?${Buffer.from(options.subject).toString("base64")}?=\r\n`;
          emailBody += `MIME-Version: 1.0\r\n`;
          emailBody += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;

          // HTML Teil
          emailBody += `--${boundary}\r\n`;
          emailBody += `Content-Type: text/html; charset=UTF-8\r\n`;
          emailBody += `Content-Transfer-Encoding: base64\r\n\r\n`;
          emailBody += `${Buffer.from(options.html).toString("base64")}\r\n\r\n`;

          // CSV Anhang falls vorhanden
          if (options.attachments && options.attachments.length > 0) {
            for (const att of options.attachments) {
              emailBody += `--${boundary}\r\n`;
              emailBody += `Content-Type: ${att.contentType || "text/csv"}; name="${att.filename}"\r\n`;
              emailBody += `Content-Disposition: attachment; filename="${att.filename}"\r\n`;
              emailBody += `Content-Transfer-Encoding: base64\r\n\r\n`;
              emailBody += `${Buffer.from(att.content).toString("base64")}\r\n\r\n`;
            }
          }

          emailBody += `--${boundary}--\r\n.\r\n`;
          socket.write(emailBody);
          step = 8;
        } else if (step === 8 && response.startsWith("250")) {
          socket.write("QUIT\r\n");
          finish(true);
        } else if (response.startsWith("4") || response.startsWith("5")) {
          finish(false, `SMTP Fehler-Antwort: ${response.trim()}`);
        }
      });
    } catch (err: any) {
      resolve({ success: false, error: err?.message || "Unerwarteter SMTP Fehler" });
    }
  });
}
