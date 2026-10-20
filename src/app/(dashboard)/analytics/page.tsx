import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { executeAnalyticsPrompt } from "@/lib/ai/analytics-agent";
import { PromptToChartAnalytics } from "@/components/analytics/prompt-to-chart";
import { BarChart3, Sparkles, Database, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "KI-Leitstand & Prompt-to-Chart Analytics | MaintAI",
  description: "Natürlichsprachliche Datenanalyse, Predictive Maintenance und automatische Berichte",
};

export default async function AnalyticsPage() {
  let tenant = await db.query.tenants.findFirst();

  if (!tenant) {
    const [newTenant] = await db
      .insert(tenants)
      .values({
        code: "WERK-1000",
        name: "Produktionswerk München",
        sapPlantCode: "1000",
      })
      .returning();
    tenant = newTenant;
  }

  // Initiale Auswertung für einen sofort sichtbaren Chart
  const initialOutput = await executeAnalyticsPrompt({
    tenantId: tenant.id,
    userPrompt: "Zeige mir eine Übersicht der Instandhaltungsaufträge und Stillstandszeiten nach Anlage",
  });

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 md:p-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <BarChart3 className="h-7 w-7 text-blue-500" />
            Prompt-to-Chart & Predictive Leitstand-Analytics
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Frage das System in natürlicher Sprache nach Stillständen, MTBF, Ersatzteilkosten
            oder Störungsursachen. Der Agent generiert automatisch schreibgeschützte SQL-Queries
            und interaktive Visualisierungen.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-neutral-700 bg-neutral-900 text-neutral-300">
            <Sparkles className="h-3.5 w-3.5 text-blue-400 mr-1" />
            NL-to-SQL Engine
          </Badge>
          <Badge variant="outline" className="border-neutral-700 bg-neutral-900 text-neutral-300">
            <Database className="h-3.5 w-3.5 text-emerald-400 mr-1" />
            Read-Only Guards aktiv
          </Badge>
        </div>
      </div>

      {/* Interaktive Recharts Komponente mit Server Action Binding */}
      <PromptToChartAnalytics
        tenantId={tenant.id}
        initialOutput={initialOutput}
        onExecutePrompt={async (prompt: string) => {
          "use server";
          return await executeAnalyticsPrompt({
            tenantId: tenant.id,
            userPrompt: prompt,
          });
        }}
      />
    </div>
  );
}
