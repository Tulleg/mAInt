import Link from "next/link";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { executeAnalyticsPrompt, AnalyticsChatMessage } from "@/lib/ai/analytics-agent";
import { getTenantPredictiveOverview } from "@/lib/ai/predictive";
import { getScheduledReportsAction } from "@/actions/report-scheduler";
import { PromptToChartAnalytics } from "@/components/analytics/prompt-to-chart";
import { BarChart3, Sparkles, Database, ShieldAlert, Cpu, ArrowLeft, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentUserRbac } from "@/lib/rbac";

export const metadata = {
  title: "KI-Leitstand & Prompt-to-Chart Analytics | MaintAI",
  description: "Natürlichsprachliche Datenanalyse, Predictive Maintenance und automatische Berichte",
};

export default async function AnalyticsPage() {
  // 1. RBAC Prüfung: Nur Benutzer mit 'can_view_ai_analytics' (Planer, Admin, Leitstand) dürfen zugreifen
  const userRbac = await getCurrentUserRbac();

  if (!userRbac.canViewAiAnalytics) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4 md:p-8">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 md:p-8 text-center space-y-5 shadow-md">
          <div className="h-16 w-16 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 mx-auto flex items-center justify-center shadow-inner">
            <ShieldAlert className="h-8 w-8 text-rose-600" />
          </div>

          <div className="space-y-2">
            <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700 text-xs px-2.5 py-0.5">
              403 • Zugriff verweigert (RBAC)
            </Badge>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-slate-900">
              KI-Leitstand geschützt
            </h2>
            <p className="text-xs md:text-sm text-slate-500 leading-relaxed">
              Für diesen Bereich ist die Berechtigung <code className="text-amber-800 font-mono text-[11px] bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">can_view_ai_analytics</code> erforderlich.
              Der KI-Leitstand, NL-to-SQL Analytics und vorausschauende Instandhaltungsdaten sind Planern, Leitstand-Mitarbeitern und Administratoren vorbehalten.
            </p>
          </div>

          {/* Benutzer & Rollen-Kontextanzeige */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-left text-xs space-y-2">
            <div className="flex items-center justify-between text-slate-500 text-[10px] uppercase font-bold tracking-wider">
              <span>Aktive Sitzung</span>
              <span className="flex items-center gap-1 text-rose-600 font-normal">
                <Lock className="w-3 h-3" /> Unzureichende Rechte
              </span>
            </div>
            <div className="flex justify-between items-center text-slate-700 pt-1 border-t border-slate-200">
              <span className="text-slate-500">Benutzer:</span>
              <span className="font-semibold text-slate-900">{userRbac.userName}</span>
            </div>
            <div className="flex justify-between items-center text-slate-700">
              <span className="text-slate-500">Aktuelle Rolle:</span>
              <Badge variant="outline" className="font-mono text-[11px] border-amber-200 bg-amber-50 text-amber-800">
                {userRbac.roleName} ({userRbac.roleCode})
              </Badge>
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-2.5">
            <Link
              href="/orders"
              className="flex-1 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all flex items-center justify-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Zu Aufträge & Störungen</span>
            </Link>
            <Link
              href="/planning"
              className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors flex items-center justify-center border border-slate-200"
            >
              Gantt-Board
            </Link>
          </div>

          <p className="text-[11px] text-slate-400">
            Tipp: Nutzen Sie den Rollen-Umschalter oben rechts in der Kopfzeile, um die Ansicht als Planer oder Administrator zu testen.
          </p>
        </div>
      </div>
    );
  }

  let tenant = {
    id: "demo-tenant-1000",
    code: "WERK-1000",
    name: "Produktionswerk München",
  };

  let initialOutput: any = undefined;
  let initialPredictiveOverview: any[] = [];
  let initialScheduledReports: any[] = [];

  try {
    const existingTenant = await db.query.tenants.findFirst();
    if (existingTenant) {
      tenant = {
        id: existingTenant.id,
        code: existingTenant.code,
        name: existingTenant.name,
      };
    }

    // Paralleles Laden für optimale Performance
    const [promptRes, predictiveRes, scheduledRes] = await Promise.allSettled([
      executeAnalyticsPrompt({
        tenantId: tenant.id,
        userPrompt: "Zeige mir eine Übersicht der Instandhaltungsaufträge und Stillstandszeiten nach Anlage",
      }),
      getTenantPredictiveOverview(tenant.id),
      getScheduledReportsAction(tenant.id),
    ]);

    if (promptRes.status === "fulfilled") {
      initialOutput = promptRes.value;
    }

    if (predictiveRes.status === "fulfilled") {
      initialPredictiveOverview = predictiveRes.value;
    }

    if (scheduledRes.status === "fulfilled") {
      initialScheduledReports = scheduledRes.value;
    }
  } catch {
    // Graceful Fallback
  }

  if (!initialOutput) {
    initialOutput = {
      status: "SUCCESS" as const,
      chartType: "bar" as const,
      title: "Offene Störungen nach Gewerk & Priorität (Halle 1)",
      data: [
        {
          name: "KUKA Roboter KR210",
          component: "Achse 2 • Schleppfehler",
          priorityLabel: "Prio 1 / Hoch",
          priorityLevel: 1,
          gewerk: "Mechanik",
          downtime: "1h 45m Stillstand",
          stillstand_minuten: 105,
        },
        {
          name: "Förderband B3",
          component: "Antriebsmotor • Riemenriss",
          priorityLabel: "Prio 1 / Hoch",
          priorityLevel: 1,
          gewerk: "Mechanik",
          downtime: "2h 10m Stillstand",
          stillstand_minuten: 130,
        },
        {
          name: "Pneumatik Zelle 3",
          component: "Hauptventil • Druckverlust",
          priorityLabel: "Prio 2 / Mittel",
          priorityLevel: 2,
          gewerk: "Pneumatik",
          downtime: "45m Druckabfall",
          stillstand_minuten: 45,
        },
        {
          name: "Schutzgitter Roboter 4",
          component: "Endlagenschalter dejustiert",
          priorityLabel: "Prio 3 / Niedrig",
          priorityLevel: 3,
          gewerk: "Elektrik",
          downtime: "20m Störung",
          stillstand_minuten: 20,
        },
      ],
      xAxisKey: "name",
      series: [
        { key: "stillstand_minuten", label: "Stillstand (Minuten)", color: "#EF4444" },
      ],
      summaryInsight:
        "50% der Störungen betreffen Antriebsüberlastungen in Zelle 1. Dichtsatz KUKA im Lager verfügbar.",
      rawSqlUsed:
        "SELECT e.name, o.title, o.priority, o.downtime_minutes FROM maintenance_orders o JOIN equipments e ON o.equipment_id = e.id WHERE e.location LIKE '%Halle 1%';",
    };
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6 md:p-8 space-y-6">
      {/* 0. STANDARD ZURÜCK-BUTTON GEMÄSS DESIGN-RULES */}
      <div>
        <Link
          href="/orders"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-600 bg-white border border-slate-200 hover:border-blue-300 px-3 py-1.5 rounded-lg shadow-2xs transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Zu Aufträge & Störungen</span>
        </Link>
      </div>

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <BarChart3 className="h-7 w-7 text-blue-600" />
            Analytics & KI-Diagrammansicht
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Dynamische Generierung von Aggregationen und Säulenvisualisierungen. Frage das System in natürlicher Sprache nach Stillständen, MTBF oder Störungsursachen.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
            <Sparkles className="h-3.5 w-3.5 text-blue-600 mr-1" />
            Clarification Loop
          </Badge>
          <Badge variant="outline" className="border-purple-200 bg-purple-50 text-purple-700">
            <Cpu className="h-3.5 w-3.5 text-purple-600 mr-1" />
            Dual-Provider AI
          </Badge>
          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
            <Database className="h-3.5 w-3.5 text-emerald-600 mr-1" />
            Read-Only Guards aktiv
          </Badge>
        </div>
      </div>

      {/* Interaktive Recharts Komponente mit Server Action Binding und Chat-History */}
      <PromptToChartAnalytics
        tenantId={tenant.id}
        initialOutput={initialOutput}
        initialPredictiveOverview={initialPredictiveOverview}
        initialScheduledReports={initialScheduledReports}
        onExecutePrompt={async (prompt: string, chatHistory?: AnalyticsChatMessage[]) => {
          "use server";
          return await executeAnalyticsPrompt({
            tenantId: tenant.id,
            userPrompt: prompt,
            chatHistory,
          });
        }}
      />
    </div>
  );
}
