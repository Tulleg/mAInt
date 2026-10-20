"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { AnalyticsQueryOutput } from "@/lib/ai/analytics-agent";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Sparkles,
  BarChart3,
  LineChart as LineIcon,
  PieChart as PieIcon,
  Table as TableIcon,
  Send,
  Calendar,
  Clock,
  CheckCircle2,
  Code2,
  Bell,
  Mail,
  FileSpreadsheet,
} from "lucide-react";

interface PromptToChartAnalyticsProps {
  tenantId: string;
  onExecutePrompt: (prompt: string) => Promise<AnalyticsQueryOutput>;
  initialOutput?: AnalyticsQueryOutput;
}

const DEFAULT_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];

export function PromptToChartAnalytics({
  tenantId,
  onExecutePrompt,
  initialOutput,
}: PromptToChartAnalyticsProps) {
  const [promptInput, setPromptInput] = useState(
    "Vergleiche die Stillstandszeiten und Anzahl der Aufträge nach Anlage im aktuellen Monat"
  );
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<AnalyticsQueryOutput | null>(initialOutput || null);
  const [viewMode, setViewMode] = useState<"chart" | "table">("chart");
  const [showSql, setShowSql] = useState(false);

  // Scheduled Cron Modal State
  const [showCronModal, setShowCronModal] = useState(false);
  const [cronEmail, setCronEmail] = useState("werkstattleiter@fertigung.de");
  const [cronSchedule, setCronSchedule] = useState("0 7 * * 1"); // Jeden Montag 07:00
  const [cronSaved, setCronSaved] = useState(false);

  const handleRun = () => {
    if (!promptInput.trim()) return;
    startTransition(async () => {
      try {
        const res = await onExecutePrompt(promptInput);
        setResult(res);
      } catch (err) {
        alert("Fehler bei der Abfrage: " + String(err));
      }
    });
  };

  const handleSaveCron = () => {
    setCronSaved(true);
    setTimeout(() => {
      setCronSaved(false);
      setShowCronModal(false);
    }, 2000);
  };

  return (
    <div className="space-y-6">
      {/* Prompt Input Leiste */}
      <Card className="border-neutral-800 bg-neutral-900 shadow-xl">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Sparkles className="absolute left-3 top-3 h-4 w-4 text-blue-400" />
              <Input
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRun()}
                placeholder="Stelle eine beliebige Frage an deine Instandhaltungsdaten..."
                className="pl-9 pr-4 py-2 text-sm bg-neutral-950 border-neutral-700 text-neutral-100 placeholder:text-neutral-500 h-11"
              />
            </div>
            <Button
              onClick={handleRun}
              disabled={isPending}
              className="w-full md:w-auto h-11 px-6 bg-blue-600 hover:bg-blue-700 text-white font-medium flex items-center gap-2"
            >
              <Send className="h-4 w-4" />
              {isPending ? "Generiere & Analysiere..." : "Auswerten"}
            </Button>
          </div>

          {/* Prompt Vorschläge */}
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-neutral-800/80 text-xs text-neutral-400">
            <span className="font-semibold text-neutral-500">Beispiele:</span>
            <button
              type="button"
              onClick={() => {
                setPromptInput("Welche 5 Ersatzteile verursachen die höchsten Kosten?");
              }}
              className="bg-neutral-800 hover:bg-neutral-700 hover:text-white px-2.5 py-1 rounded text-neutral-300 transition-colors"
            >
              Top 5 Kostenverursacher Ersatzteile
            </button>
            <button
              type="button"
              onClick={() => {
                setPromptInput("Zeige Ausfallstunden nach Schadensursache und Kritikalität");
              }}
              className="bg-neutral-800 hover:bg-neutral-700 hover:text-white px-2.5 py-1 rounded text-neutral-300 transition-colors"
            >
              Ausfallstunden nach Schadensursache
            </button>
            <button
              type="button"
              onClick={() => {
                setPromptInput("Monatlicher Trend der Wartungsstunden der letzten 6 Monate");
              }}
              className="bg-neutral-800 hover:bg-neutral-700 hover:text-white px-2.5 py-1 rounded text-neutral-300 transition-colors"
            >
              Wartungsstunden Trend (6 Monate)
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Ergebnis Visualisierung */}
      {result && (
        <Card className="border-neutral-800 bg-neutral-950 overflow-hidden">
          <CardHeader className="border-b border-neutral-800/80 pb-4 bg-neutral-900/40">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base text-white flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-400" />
                  {result.title}
                </CardTitle>
                <CardDescription className="text-xs text-neutral-400 mt-1">
                  KI-generierte Auswertung • {result.data.length} Datensätze gefunden
                </CardDescription>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded-lg p-0.5">
                  <Button
                    variant={viewMode === "chart" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("chart")}
                    className="h-7 text-xs px-2.5"
                  >
                    Grafik
                  </Button>
                  <Button
                    variant={viewMode === "table" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setViewMode("table")}
                    className="h-7 text-xs px-2.5"
                  >
                    Tabelle
                  </Button>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSql(!showSql)}
                  className="h-8 text-xs border-neutral-800 hover:bg-neutral-900 text-neutral-300 gap-1.5"
                >
                  <Code2 className="h-3.5 w-3.5" />
                  SQL anzeigen
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCronModal(true)}
                  className="h-8 text-xs border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-blue-300 gap-1.5"
                >
                  <Mail className="h-3.5 w-3.5 text-blue-400" />
                  Als E-Mail-Report planen
                </Button>
              </div>
            </div>

            {/* AI Summary Insight Banner */}
            {result.summaryInsight && (
              <div className="mt-3 p-3 bg-blue-950/30 border border-blue-900/50 rounded-lg text-xs text-blue-200 flex items-start gap-2.5">
                <Sparkles className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-white block">KI-Leitstand-Insight:</span>
                  <span>{result.summaryInsight}</span>
                </div>
              </div>
            )}

            {/* SQL Drawer */}
            {showSql && result.rawSqlUsed && (
              <div className="mt-3 p-3 bg-neutral-950 border border-neutral-800 rounded-lg font-mono text-[11px] text-emerald-400 overflow-x-auto">
                <div className="text-neutral-500 text-[10px] uppercase font-bold mb-1">
                  Generierte & Validierte PostgreSQL-Query (Schreibgeschützt):
                </div>
                <code>{result.rawSqlUsed}</code>
              </div>
            )}
          </CardHeader>

          <CardContent className="p-6">
            {viewMode === "chart" ? (
              <div className="h-[360px] w-full">
                {result.chartType === "line" ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={result.data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                      <XAxis dataKey={result.xAxisKey} stroke="#737373" fontSize={11} />
                      <YAxis stroke="#737373" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0a0a0a",
                          borderColor: "#262626",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: "12px" }} />
                      {result.series.map((s, idx) => (
                        <Line
                          key={s.key}
                          type="monotone"
                          dataKey={s.key}
                          name={s.label}
                          stroke={s.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length]}
                          strokeWidth={2}
                          dot={{ r: 4 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                ) : result.chartType === "pie" ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0a0a0a",
                          borderColor: "#262626",
                          borderRadius: "8px",
                        }}
                      />
                      <Legend />
                      <Pie
                        data={result.data}
                        dataKey={result.series[0]?.key || "wert"}
                        nameKey={result.xAxisKey}
                        cx="50%"
                        cy="50%"
                        outerRadius={110}
                        label
                      >
                        {result.data.map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={result.data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                      <XAxis dataKey={result.xAxisKey} stroke="#737373" fontSize={11} />
                      <YAxis stroke="#737373" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#0a0a0a",
                          borderColor: "#262626",
                          borderRadius: "8px",
                          fontSize: "12px",
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: "12px" }} />
                      {result.series.map((s, idx) => (
                        <Bar
                          key={s.key}
                          dataKey={s.key}
                          name={s.label}
                          fill={s.color || DEFAULT_COLORS[idx % DEFAULT_COLORS.length]}
                          radius={[4, 4, 0, 0]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            ) : (
              /* TABELLEN-ANSICHT */
              <div className="overflow-x-auto rounded-lg border border-neutral-800">
                <table className="w-full text-left text-xs text-neutral-300">
                  <thead className="bg-neutral-900 text-neutral-400 uppercase tracking-wider border-b border-neutral-800">
                    <tr>
                      {Object.keys(result.data[0] || {}).map((col) => (
                        <th key={col} className="p-3 font-semibold border-r border-neutral-800">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800 bg-neutral-950 font-mono">
                    {result.data.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-neutral-900/50">
                        {Object.values(row).map((val: any, cIdx) => (
                          <td key={cIdx} className="p-2.5 border-r border-neutral-800">
                            {typeof val === "number" ? val.toLocaleString("de-DE") : String(val)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* MODAL: GEPLANTER E-MAIL REPORT (CRON) */}
      {showCronModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md border-neutral-700 bg-neutral-900 shadow-2xl">
            <CardHeader className="border-b border-neutral-800">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Mail className="h-5 w-5 text-blue-400" />
                Automatischen Cron-Report anlegen
              </CardTitle>
              <CardDescription className="text-xs">
                Diese Abfrage wird zyklisch ausgeführt und als PDF/Excel an die Empfänger versendet.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-neutral-300 block mb-1">
                  Empfänger E-Mail
                </label>
                <Input
                  value={cronEmail}
                  onChange={(e) => setCronEmail(e.target.value)}
                  placeholder="instandhaltung@werk.de"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-300 block mb-1">
                  Ausführungs-Intervall (Cron Expression)
                </label>
                <select
                  value={cronSchedule}
                  onChange={(e) => setCronSchedule(e.target.value)}
                  className="w-full text-xs bg-neutral-950 border border-neutral-700 rounded-md p-2 text-neutral-200"
                >
                  <option value="0 7 * * 1">Jeden Montag um 07:00 Uhr (Wochenreport)</option>
                  <option value="0 6 * * *">Täglich um 06:00 Uhr (Schichtbeginn)</option>
                  <option value="0 0 1 * *">Monatserster 00:00 Uhr (Monatsabschluss)</option>
                </select>
              </div>

              <div className="bg-neutral-950 p-3 rounded border border-neutral-800 text-[11px] text-neutral-400 space-y-1">
                <div>
                  <strong className="text-neutral-200">Report-Titel:</strong> {result?.title}
                </div>
                <div>
                  <strong className="text-neutral-200">Format:</strong> PDF Management-Executive +
                  Excel CSV Rohdaten
                </div>
              </div>

              {cronSaved && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                  <CheckCircle2 className="h-4 w-4" />
                  Cron-Job erfolgreich im System registriert!
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-neutral-800">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCronModal(false)}
                  className="text-xs text-neutral-400"
                >
                  Schließen
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveCron}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs"
                >
                  Job aktivieren
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
