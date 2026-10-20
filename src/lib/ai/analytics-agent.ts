import { sql } from "drizzle-orm";
import { db } from "../db";
import { getAiProvider } from "./providers/ai-provider";

export interface AnalyticsQueryOutput {
  chartType: "bar" | "line" | "pie" | "kpi" | "table";
  title: string;
  data: Array<Record<string, any>>;
  xAxisKey: string;
  series: Array<{
    key: string;
    label: string;
    color?: string;
  }>;
  summaryInsight: string;
  rawSqlUsed?: string;
}

/**
 * Prompt-to-Chart & SQL Analytics Agent
 * Übersetzt natürlichsprachliche Fragen in strikt schreibgeschützte SQL-Queries
 * und liefert ein für Recharts/Tabellen optimiertes Datenformat.
 */
export async function executeAnalyticsPrompt(payload: {
  tenantId: string;
  userPrompt: string;
}): Promise<AnalyticsQueryOutput> {
  const { tenantId, userPrompt } = payload;
  const ai = await getAiProvider(tenantId);

  const schemaDescription = `
Du hast Zugriff auf eine PostgreSQL-Datenbank mit folgenden relevanten Tabellen und Spalten:
- maintenance_orders: id (uuid), tenant_id (uuid), order_number (varchar), priority (varchar), title (varchar), downtime_minutes (int), actual_duration_minutes (int), sap_sync_status (varchar), created_at (timestamptz), actual_end_at (timestamptz), equipment_id (uuid), functional_location_id (uuid)
- equipments: id (uuid), tenant_id (uuid), equipment_number (varchar), name (varchar), criticality (varchar: 'A', 'B', 'C'), status (varchar)
- functional_locations: id (uuid), tenant_id (uuid), code (varchar), name (varchar), plant_section (varchar)
- order_spare_part_bookings: id (uuid), tenant_id (uuid), maintenance_order_id (uuid), spare_part_id (uuid), quantity_consumed (numeric), unit_price_snapshot (numeric), booked_at (timestamptz)
- spare_parts: id (uuid), tenant_id (uuid), internal_part_number (varchar), name (varchar), moving_average_price (numeric), storage_location (varchar)
- workflow_statuses: id (uuid), code (varchar), name (varchar), category (varchar: 'DRAFT', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CLOSED')

SICHERHEITSREGELN:
1. Generiere NUR SELECT-Abfragen. NIEMALS INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE.
2. Filtere IMMER zwingend nach tenant_id = '${tenantId}' in allen gejointen Tabellen!
3. Verwende COALESCE für numerische Summen, um NULL-Werte abzufangen.
4. Begrenze Ergebnisse auf maximal 50 Zeilen (LIMIT 50).
`;

  const agentPrompt = `
User-Anfrage: "${userPrompt}"

Übersetze die Anfrage in eine präzise PostgreSQL SELECT-Abfrage und wähle die am besten passende Visualisierungsform ('bar', 'line', 'pie', 'kpi', oder 'table').

Antworte ausschließlich im JSON-Format:
{
  "sqlQuery": "SELECT ...",
  "chartType": "bar" | "line" | "pie" | "kpi" | "table",
  "title": "Titel für das Diagramm",
  "xAxisKey": "Name der Spalte für die X-Achse (z.B. monat, anlage, kategorie)",
  "series": [
    { "key": "spaltenname_in_sql", "label": "Lesbare Legende", "color": "#3B82F6" }
  ],
  "reasoning": "Kurze Erklärung"
}
`;

  let parsedPlan: any;
  try {
    const rawPlan = await ai.createChatCompletion(
      [
        { role: "system", content: schemaDescription },
        { role: "user", content: agentPrompt },
      ],
      { jsonMode: true, temperature: 0.0 }
    );
    parsedPlan = JSON.parse(rawPlan);
  } catch (err) {
    // Fallback Query bei AI-Ausfall
    parsedPlan = {
      sqlQuery: `
        SELECT 
          COALESCE(e.name, 'Allgemein') AS anlage,
          COUNT(mo.id) AS anzahl_auftraege,
          COALESCE(SUM(mo.downtime_minutes), 0) AS stillstand_minuten
        FROM maintenance_orders mo
        LEFT JOIN equipments e ON e.id = mo.equipment_id
        WHERE mo.tenant_id = '${tenantId}'
        GROUP BY e.name
        LIMIT 10
      `.trim(),
      chartType: "bar",
      title: "Ausfallzeiten nach Anlage",
      xAxisKey: "anlage",
      series: [
        { key: "stillstand_minuten", label: "Stillstand (Minuten)", color: "#EF4444" },
        { key: "anzahl_auftraege", label: "Anzahl Störungen", color: "#3B82F6" },
      ],
    };
  }

  // Strikte Validierung der generierten SQL-Abfrage (Schreibschutz-Guard)
  const cleanSql = parsedPlan.sqlQuery.trim();
  const lowerSql = cleanSql.toLowerCase();

  const forbiddenKeywords = [
    "insert",
    "update",
    "delete",
    "drop",
    "truncate",
    "alter",
    "grant",
    "create",
    "exec",
    "execute",
  ];
  for (const kw of forbiddenKeywords) {
    // Regex für ganzes Wort
    if (new RegExp(`\\b${kw}\\b`, "i").test(lowerSql)) {
      throw new Error(`Sicherheitsverletzung: Nicht-lesende Operation '${kw}' ist im Analytics-Agenten untersagt.`);
    }
  }

  if (!lowerSql.startsWith("select") && !lowerSql.startsWith("with")) {
    throw new Error("Ungültige SQL-Abfrage: Es sind ausschließlich SELECT-Statements erlaubt.");
  }

  // Query sicher gegen PostgreSQL ausführen
  let queryRows: any[] = [];
  try {
    const result = await db.execute(sql.raw(cleanSql));
    queryRows = result.rows || [];
  } catch (dbErr: any) {
    // Fallback Daten liefern, falls die dynamische SQL Syntax fehlschlug
    return {
      chartType: "table",
      title: "Abfrageergebnis (Hinweis)",
      data: [{ fehler: "Abfrage konnte nicht ausgeführt werden: " + dbErr.message }],
      xAxisKey: "fehler",
      series: [],
      summaryInsight: "Die generierte SQL-Abfrage war fehlerhaft.",
      rawSqlUsed: cleanSql,
    };
  }

  // LLM Zusammenfassung / Insight generieren
  let summaryInsight = "Erfolgreich ausgewertet.";
  try {
    const insightPrompt = `
Formuliere eine kurze, prägnante Zusammenfassung (1-2 Sätze) für den Werkleiter auf Basis dieser Daten:
Userfrage: "${userPrompt}"
Daten: ${JSON.stringify(queryRows.slice(0, 10))}
`;
    summaryInsight = await ai.createChatCompletion(
      [
        { role: "system", content: "Du bist Instandhaltungs-Controller. Antworte in 1-2 präzisen Sätzen auf Deutsch." },
        { role: "user", content: insightPrompt },
      ],
      { temperature: 0.2, maxTokens: 150 }
    );
  } catch (e) {
    summaryInsight = `Es wurden ${queryRows.length} Datensätze analysiert.`;
  }

  return {
    chartType: parsedPlan.chartType || "bar",
    title: parsedPlan.title || "Instandhaltungs-Auswertung",
    data: queryRows,
    xAxisKey: parsedPlan.xAxisKey || Object.keys(queryRows[0] || {})[0] || "kategorie",
    series: parsedPlan.series || [
      { key: Object.keys(queryRows[0] || {})[1] || "wert", label: "Wert", color: "#3B82F6" },
    ],
    summaryInsight: summaryInsight.replace(/^"|"$/g, ""),
    rawSqlUsed: cleanSql,
  };
}
