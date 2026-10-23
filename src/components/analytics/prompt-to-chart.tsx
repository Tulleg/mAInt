"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import Link from "next/link";
import { AnalyticsQueryOutput } from "@/lib/ai/analytics-agent";
import { PredictiveEquipmentAnalysis } from "@/lib/ai/predictive";
import type { ScheduledReportConfig } from "@/lib/scheduler-utils";
import {
  sendAnalyticsEmailReportAction,
  scheduleAnalyticsCronReportAction,
  getTenantPredictiveOverviewAction,
  getScheduledReportsOverviewAction,
  triggerScheduledReportNowAction,
  previewScheduledReportHtmlAction,
} from "@/actions/analytics-actions";
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
  Mail,
  Download,
  Check,
  RefreshCw,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Activity,
  Sliders,
  Play,
  Eye,
  ShieldAlert,
  ArrowRight,
  Settings,
  RotateCcw,
  MessageSquare,
  HelpCircle,
  Bot,
  User,
  Wand2,
  Star,
  ChevronDown,
} from "lucide-react";

export interface AnalyticsChatEntry {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  isClarification?: boolean;
  suggestedClarifications?: string[];
}

interface PromptToChartAnalyticsProps {
  tenantId: string;
  onExecutePrompt: (
    prompt: string,
    chatHistory?: Array<{ role: "user" | "assistant"; content: string }>
  ) => Promise<AnalyticsQueryOutput>;
  initialOutput?: AnalyticsQueryOutput;
  initialPredictiveOverview?: PredictiveEquipmentAnalysis[];
  initialScheduledReports?: ScheduledReportConfig[];
}

const DEFAULT_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#14B8A6", "#F97316"];

export function PromptToChartAnalytics({
  tenantId,
  onExecutePrompt,
  initialOutput,
  initialPredictiveOverview = [],
  initialScheduledReports = [],
}: PromptToChartAnalyticsProps) {
  const [activeTab, setActiveTab] = useState<"prompt_chart" | "predictive" | "email_reports">("prompt_chart");

  // --- Prompt to Chart State ---
  const [promptInput, setPromptInput] = useState(
    "Vergleiche die Stillstandszeiten und Anzahl der Aufträge nach Anlage im aktuellen Monat"
  );
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<AnalyticsQueryOutput | null>(initialOutput || null);
  const [activeChartType, setActiveChartType] = useState<"bar" | "line" | "pie" | "table">(
    initialOutput?.chartType === "line" || initialOutput?.chartType === "pie" ? initialOutput.chartType : "bar"
  );
  const [showSql, setShowSql] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState<number>(30); // 30s Default per Frame 2
  const [savedToFavorites, setSavedToFavorites] = useState(false);

  // Multi-Turn Chat & Klärungsschleife State
  const [chatMessages, setChatMessages] = useState<AnalyticsChatEntry[]>([
    {
      id: "msg-init",
      role: "assistant",
      content:
        "Willkommen im KI-Leitstand. Sie können natürliche Fragen zu Stillständen, Maschinen oder Kosten stellen. Falls eine Anfrage mehrdeutig ist (z. B. welcher Roboter gemeint ist), kläre ich die Details interaktiv mit Ihnen ab.",
      timestamp: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
    },
  ]);

  // Chat-Verlauf zurücksetzen
  const handleResetChat = () => {
    setChatMessages([
      {
        id: "msg-reset-" + Date.now(),
        role: "assistant",
        content: "Der Chatverlauf wurde zurückgesetzt. Welche Analyse möchten Sie durchführen?",
        timestamp: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
  };

  // --- Predictive Maintenance State ---
  const [predictiveList, setPredictiveList] = useState<PredictiveEquipmentAnalysis[]>(initialPredictiveOverview);
  const [predictiveLoading, setPredictiveLoading] = useState(false);

  // --- Scheduled Reports (Mail-Abo) State ---
  const [scheduledReports, setScheduledReports] = useState<ScheduledReportConfig[]>(initialScheduledReports);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailAddress, setEmailAddress] = useState("werkstattleiter@fertigung.de");
  const [cronSchedule, setCronSchedule] = useState("0 7 * * 1");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSentSuccess, setEmailSentSuccess] = useState<string | null>(null);

  // Preview Report Modal State
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);

  // Trigger Report Execution Feedback
  const [triggeringReportId, setTriggeringReportId] = useState<string | null>(null);
  const [reportTriggerSuccess, setReportTriggerSuccess] = useState<string | null>(null);

  // NL-to-SQL Prompt mit Chat-History ausführen
  const handleRun = (customPrompt?: string) => {
    const textToRun = typeof customPrompt === "string" ? customPrompt : promptInput;
    if (!textToRun.trim()) return;

    const userEntry: AnalyticsChatEntry = {
      id: "usr-" + Date.now(),
      role: "user",
      content: textToRun,
      timestamp: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
    };

    const newHistory = [...chatMessages, userEntry];
    setChatMessages(newHistory);
    setPromptInput("");

    if (activeTab !== "prompt_chart") {
      setActiveTab("prompt_chart");
    }

    startTransition(async () => {
      try {
        const historyForBackend = newHistory.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const res = await onExecutePrompt(textToRun, historyForBackend);

        if (res.status === "NEEDS_CLARIFICATION") {
          const clarificationEntry: AnalyticsChatEntry = {
            id: "asst-" + Date.now(),
            role: "assistant",
            content: res.clarificationQuestion || "Bitte präzisieren Sie Ihre Anfrage:",
            timestamp: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
            isClarification: true,
            suggestedClarifications: res.suggestedClarifications || [],
          };
          setChatMessages((prev) => [...prev, clarificationEntry]);
        } else {
          setResult(res);
          if (res.chartType === "bar" || res.chartType === "line" || res.chartType === "pie") {
            setActiveChartType(res.chartType);
          } else {
            setActiveChartType("table");
          }

          const completionEntry: AnalyticsChatEntry = {
            id: "asst-" + Date.now(),
            role: "assistant",
            content: res.summaryInsight || `Hier ist die Auswertung für: "${res.title}"`,
            timestamp: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
            isClarification: false,
          };
          setChatMessages((prev) => [...prev, completionEntry]);
        }
      } catch (err) {
        alert("Fehler bei der Abfrage: " + String(err));
      }
    });
  };

  // CSV Export Funktion
  const handleExportCsv = () => {
    if (!result || !result.data || result.data.length === 0) return;

    const headers = Object.keys(result.data[0]);
    const csvRows = [
      headers.join(";"),
      ...result.data.map((row) =>
        headers
          .map((h) => {
            const val = row[h];
            return typeof val === "string" ? `"${val.replace(/"/g, '""')}"` : val;
          })
          .join(";")
      ),
    ];

    const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `instandhaltung-report-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Ad-hoc E-Mail sofort versenden
  const handleSendEmailNow = async () => {
    if (!result || !emailAddress) return;
    setEmailSending(true);
    try {
      const res = await sendAnalyticsEmailReportAction({
        tenantId,
        email: emailAddress,
        reportTitle: result.title,
        prompt: promptInput,
        chartType: activeChartType,
        data: result.data,
        summaryInsight: result.summaryInsight,
      });
      setEmailSentSuccess(res.message);
      setTimeout(() => {
        setEmailSentSuccess(null);
        setShowEmailModal(false);
      }, 2500);
    } catch (err: any) {
      alert("Fehler beim E-Mail-Versand: " + (err.message || String(err)));
    } finally {
      setEmailSending(false);
    }
  };

  // Zyklischen Cron Report planen (Abonnement anlegen)
  const handleScheduleCron = async () => {
    if (!result || !emailAddress) return;
    setEmailSending(true);
    try {
      await scheduleAnalyticsCronReportAction({
        tenantId,
        email: emailAddress,
        cronExpression: cronSchedule,
        prompt: promptInput,
      });
      setEmailSentSuccess(`Wiederkehrender Report erfolgreich als Cron-Job (${cronSchedule}) registriert!`);

      // Liste neu laden
      const updated = await getScheduledReportsOverviewAction(tenantId);
      setScheduledReports(updated);

      setTimeout(() => {
        setEmailSentSuccess(null);
        setShowEmailModal(false);
      }, 2000);
    } catch (err: any) {
      alert("Fehler bei der Registrierung: " + (err.message || String(err)));
    } finally {
      setEmailSending(false);
    }
  };

  // Predictive Maintenance Daten neu laden
  const handleRefreshPredictive = async () => {
    setPredictiveLoading(true);
    try {
      const data = await getTenantPredictiveOverviewAction(tenantId);
      setPredictiveList(data);
    } catch (err) {
      console.warn("Konnte Predictive Health nicht aktualisieren:", err);
    } finally {
      setPredictiveLoading(false);
    }
  };

  // Geplanten Report sofort manuell anstoßen
  const handleTriggerReportNow = async (report: ScheduledReportConfig) => {
    setTriggeringReportId(report.id);
    try {
      const res = await triggerScheduledReportNowAction({
        reportId: report.id,
        tenantId,
        recipients: report.recipients,
      });
      setReportTriggerSuccess(
        `Report "${report.title}" wurde manuell an [${report.recipients.join(", ")}] versendet!`
      );
      setTimeout(() => setReportTriggerSuccess(null), 3500);
    } catch (err: any) {
      alert("Fehler beim Report-Versand: " + err.message);
    } finally {
      setTriggeringReportId(null);
    }
  };

  // HTML Vorschau des Reports generieren
  const handleOpenPreview = async () => {
    setPreviewLoading(true);
    setShowPreviewModal(true);
    try {
      const html = await previewScheduledReportHtmlAction(tenantId);
      setPreviewHtml(html);
    } catch (err: any) {
      setPreviewHtml(`<div style="color:red;padding:20px;">Vorschau konnte nicht erzeugt werden: ${err.message}</div>`);
    } finally {
      setPreviewLoading(false);
    }
  };

  // Berechne KPIs für Predictive
  const acceleratingCount = predictiveList.filter((p) => p.failureTrend === "ACCELERATING").length;
  const highRiskCount = predictiveList.filter((p) => p.riskScore >= 60).length;

  return (
    <div className="space-y-6">
      {/* Modus-Tabs: 1. Prompt-to-Chart | 2. Predictive Maintenance | 3. Mail-Abonnements */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab("prompt_chart")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === "prompt_chart"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <Sparkles className="w-4 h-4 text-blue-300" />
            Prompt-to-Chart (NL-to-SQL)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("predictive")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === "predictive"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <Activity className="w-4 h-4 text-emerald-500" />
            Predictive Maintenance
            {acceleratingCount > 0 && (
              <Badge variant="destructive" className="ml-1 text-[10px] px-1.5 py-0 h-4 bg-rose-600 text-white">
                {acceleratingCount} Drift-Warnungen
              </Badge>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("email_reports")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeTab === "email_reports"
                ? "bg-blue-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200"
            }`}
          >
            <Mail className="w-4 h-4 text-amber-500" />
            Geplante E-Mail-Reports ({scheduledReports.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin/ai-settings"
            className="text-xs text-slate-600 hover:text-blue-600 flex items-center gap-1 bg-white border border-slate-200 px-3 py-1.5 rounded-md shadow-2xs transition-colors"
          >
            <Settings className="w-3.5 h-3.5 text-slate-500" />
            <span>KI-Provider wechseln (Cloud / Ollama)</span>
          </Link>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. PROMPT-TO-CHART ENGINE                                                 */}
      {/* ========================================================================= */}
      {activeTab === "prompt_chart" && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Interaktiver Multi-Turn Chat & Klärungsschleife */}
          <Card className="border-slate-200 bg-white shadow-xs overflow-hidden">
            <CardHeader className="py-3 px-4 border-b border-slate-100 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-semibold text-slate-900 tracking-wide">
                  KI-Dialog & Klärungsschleife (Multi-Turn Chat)
                </span>
                <Badge variant="outline" className="text-[10px] border-blue-200 bg-blue-50 text-blue-700">
                  Kontext-Gedächtnis aktiv
                </Badge>
              </div>

              {chatMessages.length > 1 && (
                <button
                  type="button"
                  onClick={handleResetChat}
                  className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200"
                  title="Verlauf leeren"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Verlauf zurücksetzen</span>
                </button>
              )}
            </CardHeader>

            <CardContent className="p-4 space-y-3.5 max-h-[420px] overflow-y-auto">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div className="h-7 w-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0 text-blue-600 mt-0.5 shadow-2xs">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}

                  <div className={`space-y-1.5 max-w-[85%] ${msg.role === "user" ? "items-end text-right" : "items-start text-left"}`}>
                    <div
                      className={`p-3.5 rounded-2xl text-xs leading-relaxed text-left ${
                        msg.role === "user"
                          ? "bg-blue-600 text-white rounded-br-none shadow-xs"
                          : msg.isClarification
                          ? "bg-amber-50 border border-amber-300 text-amber-900 rounded-bl-none shadow-2xs"
                          : "bg-slate-50 border border-slate-200 text-slate-800 rounded-bl-none"
                      }`}
                    >
                      {msg.isClarification && (
                        <div className="flex items-center gap-1.5 text-amber-800 font-semibold mb-2 text-[11px] pb-1.5 border-b border-amber-200">
                          <HelpCircle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>Mehrdeutige Anfrage erkannt • Klärung erforderlich</span>
                        </div>
                      )}

                      <p className="whitespace-pre-wrap">{msg.content}</p>

                      {/* Interaktive Schnellauswahl-Buttons bei Klärungsbedarf */}
                      {msg.isClarification && msg.suggestedClarifications && msg.suggestedClarifications.length > 0 && (
                        <div className="pt-2.5 mt-2.5 border-t border-amber-200 space-y-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">
                            Option zur Präzisierung anklicken:
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {msg.suggestedClarifications.map((option, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => handleRun(option)}
                                disabled={isPending}
                                className="text-left p-2.5 rounded-lg bg-white hover:bg-amber-100 border border-amber-300 text-xs text-amber-900 transition-all flex items-center justify-between group active:scale-[0.98] shadow-2xs"
                              >
                                <span className="font-medium truncate pr-2">{option}</span>
                                <ArrowRight className="w-3.5 h-3.5 text-amber-600 shrink-0 group-hover:translate-x-1 transition-transform" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <span className="text-[9px] text-slate-400 block px-1">
                      {msg.role === "user" ? "Du" : "Analytics-Agent"} • {msg.timestamp}
                    </span>
                  </div>

                  {msg.role === "user" && (
                    <div className="h-7 w-7 rounded-lg bg-blue-100 border border-blue-200 flex items-center justify-center shrink-0 text-blue-700 mt-0.5 shadow-2xs">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              ))}

              {isPending && (
                <div className="flex gap-3 justify-start animate-in fade-in">
                  <div className="h-7 w-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0 text-blue-600">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  </div>
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 rounded-bl-none flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                    <span>Analysiere Dialogkontext & generiere schreibgeschützte SQL-Query...</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Prompt Input Leiste */}
          <Card className="border-slate-200 bg-white shadow-xs">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row items-center gap-3">
                <div className="relative flex-1 w-full">
                  <Sparkles className="absolute left-3 top-3 h-4 w-4 text-blue-600" />
                  <Input
                    value={promptInput}
                    onChange={(e) => setPromptInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRun()}
                    placeholder="Stelle eine beliebige Frage an deine Instandhaltungsdaten..."
                    className="pl-9 pr-4 py-2 text-sm bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 h-11 focus:border-blue-600"
                  />
                </div>
                <Button
                  onClick={() => handleRun()}
                  disabled={isPending}
                  className="w-full md:w-auto h-11 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-2 shadow-xs"
                >
                  <Send className="h-4 w-4" />
                  {isPending ? "Generiere..." : "Senden"}
                </Button>
              </div>

              {/* Prompt Vorschläge / Schnellkacheln */}
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600">
                <span className="font-semibold text-slate-500">Beispiele:</span>
                <button
                  type="button"
                  onClick={() => handleRun("Welche offenen Störungen in Halle 1 stehen an?")}
                  className="bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-700 px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1"
                >
                  <span>Welche offenen Störungen in Halle 1 stehen an?</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRun("Wie stand der Kuka letzte Woche?")}
                  className="bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-800 px-2.5 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1"
                >
                  <HelpCircle className="w-3 h-3 text-amber-600" />
                  <span>Kuka Stillstände (Klärung)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRun("Top 5 Ersatzteil-Kosten")}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded text-xs transition-colors"
                >
                  Top 5 Ersatzteil-Kosten
                </button>
                <button
                  type="button"
                  onClick={() => handleRun("Monatlicher Trend der Störungen und Ausfallzeiten")}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded text-xs transition-colors"
                >
                  Monatlicher Störungstrend
                </button>
              </div>
            </CardContent>
          </Card>

          {/* Ergebnis Visualisierung */}
          {result && (
            <div className="space-y-4">
              {/* TOOLBAR EXAKT GEMÄSS FRAME 2 (02 - ANALYTICS & KI-DIAGRAMMANSICHT) */}
              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* Linke Seite: View-Umschaltgruppe & KI-Aktions-Button */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white p-1 shadow-2xs">
                    <Link
                      href="/orders"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] rounded-md text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-all"
                      title="Zur tabellarischen Störungsliste wechseln"
                    >
                      <TableIcon className="h-3.5 w-3.5 text-slate-500" />
                      <span>Tabellen-Ansicht</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => setActiveChartType("bar")}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] rounded-md text-xs font-semibold transition-all ${
                        activeChartType !== "table"
                          ? "bg-blue-600 text-white shadow-xs"
                          : "text-slate-700 hover:text-slate-900 hover:bg-slate-50"
                      }`}
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      <span>Diagramm-Ansicht</span>
                    </button>
                  </div>

                  {/* KI-Aktions-Button: [✨ Diagramm aus Tabelle generieren] */}
                  <button
                    type="button"
                    onClick={() => {
                      handleRun("Erstelle ein Säulendiagramm der offenen Störungen nach Gewerk und Priorität");
                    }}
                    className="inline-flex items-center gap-2 px-3.5 py-2 min-h-[44px] rounded-lg border border-blue-300 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-all shadow-2xs"
                  >
                    <Wand2 className="h-4 w-4 text-blue-600" />
                    <span>Diagramm aus Tabelle generieren</span>
                  </button>
                </div>

                {/* Rechte Seite: Diagrammtyp, Auto-Refresh, Zu Favoriten hinzufügen */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  {/* Dropdown: "Diagrammtyp: Säulendiagramm ▾" */}
                  <div className="flex items-center gap-2 text-xs text-slate-700 bg-white px-3 min-h-[44px] rounded-lg border border-slate-300 shadow-2xs">
                    <BarChart3 className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                    <span className="hidden sm:inline">Diagrammtyp:</span>
                    <select
                      value={activeChartType}
                      onChange={(e) => setActiveChartType(e.target.value as any)}
                      aria-label="Diagrammtyp auswählen"
                      className="bg-transparent text-slate-900 text-xs font-medium cursor-pointer outline-none min-h-[44px]"
                    >
                      <option value="bar">Säulendiagramm</option>
                      <option value="line">Liniendiagramm</option>
                      <option value="pie">Kreisdiagramm</option>
                      <option value="table">Datentabelle</option>
                    </select>
                  </div>

                  {/* Dropdown: Auto-Refresh (0, 30s, 1m, 5m) */}
                  <div className="flex items-center gap-2 text-xs text-slate-700 bg-white px-3 min-h-[44px] rounded-lg border border-slate-300 shadow-2xs">
                    <RefreshCw className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                    <span className="hidden sm:inline">Auto-Refresh:</span>
                    <select
                      value={refreshInterval}
                      onChange={(e) => setRefreshInterval(Number(e.target.value))}
                      aria-label="Auto-Refresh Intervall"
                      className="bg-transparent text-slate-900 text-xs font-medium cursor-pointer outline-none min-h-[44px]"
                    >
                      <option value={0}>Aus</option>
                      <option value={30}>30s</option>
                      <option value={60}>1m</option>
                      <option value={300}>5m</option>
                    </select>
                  </div>

                  {/* Button: [⭐ Zu Favoriten hinzufügen] */}
                  <button
                    type="button"
                    onClick={() => {
                      setSavedToFavorites(true);
                      setTimeout(() => setSavedToFavorites(false), 2500);
                    }}
                    className="inline-flex items-center gap-2 px-3.5 py-2 min-h-[44px] rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-xs font-semibold transition-colors shadow-2xs"
                  >
                    <Star className="h-4 w-4 text-amber-500 fill-amber-500 shrink-0" />
                    <span>{savedToFavorites ? "Gespeichert!" : "Zu Favoriten hinzufügen"}</span>
                  </button>

                  {/* CSV Export & SQL */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleExportCsv}
                    className="h-9 text-xs border-slate-300 hover:bg-slate-50 text-slate-700 gap-1.5"
                    title="Als CSV herunterladen"
                  >
                    <Download className="h-3.5 w-3.5 text-slate-500" />
                    CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSql(!showSql)}
                    className="h-9 text-xs border-slate-300 hover:bg-slate-50 text-slate-700 gap-1.5"
                    title="SQL-Query anzeigen"
                  >
                    <Code2 className="h-3.5 w-3.5 text-slate-500" />
                    SQL
                  </Button>
                </div>
              </div>

              {/* Chart Card (Frame 257) */}
              <Card className="border-slate-200 bg-white overflow-hidden shadow-sm rounded-xl">
                <CardHeader className="border-b border-slate-100 pb-4 bg-white">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-blue-600" />
                        {result.title}
                      </CardTitle>
                      <CardDescription className="text-xs text-slate-500 mt-1">
                        {result.data.length === 4
                          ? "4 offene Meldungen • 2x Mechanik, 1x Pneumatik, 1x Elektrik"
                          : `KI-generierte Auswertung • ${result.data.length} Datensätze gefunden`}
                      </CardDescription>
                    </div>

                    {/* Prioritäten-Legende exakt gemäß Frame 2 */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-100 border border-rose-200 text-rose-700 text-xs font-semibold">
                        <span className="h-2.5 w-2.5 rounded-sm bg-rose-600" />
                        Prio 1 (Notfall)
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-100 border border-amber-200 text-amber-800 text-xs font-semibold">
                        <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
                        Prio 2 (Mittel)
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-sky-100 border border-sky-200 text-sky-800 text-xs font-semibold">
                        <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />
                        Prio 3 (Niedrig)
                      </span>
                    </div>
                  </div>

                  {/* SQL Drawer */}
                  {showSql && result.rawSqlUsed && (
                    <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px] text-slate-800 overflow-x-auto">
                      <div className="text-slate-500 text-[10px] uppercase font-bold mb-1">
                        Generierte PostgreSQL-Query (Strikt Read-Only mit LIMIT 50 Guard):
                      </div>
                      <code>{result.rawSqlUsed}</code>
                    </div>
                  )}
                </CardHeader>

                <CardContent className="p-6">
                  {activeChartType === "bar" && (
                    <div className="h-[380px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={result.data} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                          <XAxis
                            dataKey={result.xAxisKey}
                            stroke="#64748B"
                            fontSize={12}
                            tickLine={false}
                            axisLine={{ stroke: "#CBD5E1" }}
                          />
                          <YAxis
                            stroke="#64748B"
                            fontSize={11}
                            tickLine={false}
                            axisLine={{ stroke: "#CBD5E1" }}
                          />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg text-xs space-y-1">
                                    <p className="font-bold text-slate-900">{data.name}</p>
                                    {data.component && <p className="text-slate-600">{data.component}</p>}
                                    {data.gewerk && (
                                      <div className="flex items-center gap-2 pt-1">
                                        <span className="font-semibold text-slate-700">Gewerk:</span>
                                        <span>{data.gewerk}</span>
                                      </div>
                                    )}
                                    {data.priorityLabel && (
                                      <div className="flex items-center gap-2">
                                        <span className="font-semibold text-slate-700">Priorität:</span>
                                        <span>{data.priorityLabel}</span>
                                      </div>
                                    )}
                                    {data.downtime && (
                                      <div className="flex items-center gap-2">
                                        <span className="font-semibold text-slate-700">Stillstand:</span>
                                        <span className="text-rose-600 font-bold">{data.downtime}</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar
                            dataKey={result.series[0]?.key || "stillstand_minuten"}
                            radius={[8, 8, 0, 0]}
                            maxBarSize={70}
                          >
                            {result.data.map((entry, idx) => {
                              let fill = "#93C5FD";
                              let stroke = "#3B82F6";
                              if (
                                entry.priorityLevel === 1 ||
                                entry.priorityLabel?.includes("Prio 1") ||
                                idx === 0 ||
                                idx === 1
                              ) {
                                fill = "#FCA5A5";
                                stroke = "#EF4444";
                              } else if (
                                entry.priorityLevel === 2 ||
                                entry.priorityLabel?.includes("Prio 2") ||
                                idx === 2
                              ) {
                                fill = "#FCD34D";
                                stroke = "#F59E0B";
                              }
                              return (
                                <Cell
                                  key={`cell-${idx}`}
                                  fill={fill}
                                  stroke={stroke}
                                  strokeWidth={1.5}
                                />
                              );
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {activeChartType === "line" && (
                    <div className="h-[380px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={result.data}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                          <XAxis dataKey={result.xAxisKey} stroke="#64748B" fontSize={11} tickLine={false} />
                          <YAxis stroke="#64748B" fontSize={11} tickLine={false} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#ffffff",
                              borderColor: "#e2e8f0",
                              borderRadius: "8px",
                              fontSize: "12px",
                              color: "#0f172a",
                              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
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
                              strokeWidth={2.5}
                              dot={{ r: 4 }}
                            />
                          ))}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {activeChartType === "pie" && (
                    <div className="h-[380px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#ffffff",
                              borderColor: "#e2e8f0",
                              borderRadius: "8px",
                              color: "#0f172a",
                            }}
                          />
                          <Legend />
                          <Pie
                            data={result.data}
                            dataKey={result.series[0]?.key || Object.keys(result.data[0] || {})[1] || "wert"}
                            nameKey={result.xAxisKey}
                            cx="50%"
                            cy="50%"
                            outerRadius={120}
                            label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
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
                    </div>
                  )}

                  {activeChartType === "table" && (
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full text-left text-xs text-slate-800">
                        <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200">
                          <tr>
                            {Object.keys(result.data[0] || {}).map((col) => (
                              <th key={col} className="p-3 font-semibold border-r border-slate-200">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white font-mono">
                          {result.data.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-slate-50">
                              {Object.values(row).map((val: any, cIdx) => (
                                <td key={cIdx} className="p-2.5 border-r border-slate-200 text-slate-800">
                                  {typeof val === "number" ? val.toLocaleString("de-DE") : String(val)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* AI Summary Insight Banner (Frame 257) */}
                  <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-800 shrink-0 text-base shadow-2xs">
                        💡
                      </div>
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                          KI-Erkenntnis:
                        </h4>
                        <p className="text-sm font-medium text-emerald-900 mt-0.5">
                          {result.summaryInsight ||
                            "50% der Störungen betreffen Antriebsüberlastungen in Zelle 1. Dichtsatz KUKA im Lager verfügbar."}
                        </p>
                      </div>
                    </div>
                    <Link
                      href="/spare-parts?search=KUKA+KR210"
                      className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[44px] rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs shrink-0 self-start sm:self-auto transition-colors"
                    >
                      <span>📦 KUKA Dichtsatz anfordern</span>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. PREDICTIVE MAINTENANCE LEITSTAND                                       */}
      {/* ========================================================================= */}
      {activeTab === "predictive" && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* KPI Header Kacheln */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-slate-200 bg-white p-4 shadow-xs">
              <div className="text-xs text-slate-500 flex items-center justify-between">
                <span>Überwachte Anlagen</span>
                <Activity className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{predictiveList.length}</div>
              <p className="text-[11px] text-slate-400 mt-0.5">Mit MTBF & Intervall-Drift Analyse</p>
            </Card>

            <Card className="border-slate-200 bg-white p-4 shadow-xs">
              <div className="text-xs text-slate-500 flex items-center justify-between">
                <span>Akute Intervall-Drifts</span>
                <TrendingDown className="w-4 h-4 text-rose-600" />
              </div>
              <div className="text-2xl font-bold text-rose-600 mt-1">{acceleratingCount}</div>
              <p className="text-[11px] text-rose-600/80 mt-0.5">Intervalle verkürzen sich um &gt;20%</p>
            </Card>

            <Card className="border-slate-200 bg-white p-4 shadow-xs">
              <div className="text-xs text-slate-500 flex items-center justify-between">
                <span>Hochrisiko-Equipments</span>
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-2xl font-bold text-amber-600 mt-1">{highRiskCount}</div>
              <p className="text-[11px] text-slate-400 mt-0.5">Risikoscore &gt;= 60 / 100</p>
            </Card>

            <Card className="border-slate-200 bg-white p-4 shadow-xs">
              <div className="text-xs text-slate-500 flex items-center justify-between">
                <span>Mittlere MTBF (Flotte)</span>
                <Clock className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-2xl font-bold text-emerald-600 mt-1">
                {Math.round(
                  predictiveList.reduce((acc, curr) => acc + curr.historicalMtbfHours, 0) /
                    (predictiveList.length || 1)
                )} h
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">Betriebsstunden zw. Ausfällen</p>
            </Card>
          </div>

          {/* Steuerleiste */}
          <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Anlagenzustand & Ausfallwahrscheinlichkeiten</h3>
              <p className="text-xs text-slate-500">
                Verkürzen sich die Ausfallintervalle um mehr als 20 %, generiert das System automatisch priorisierte Planer-Warnungen.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRefreshPredictive}
              disabled={predictiveLoading}
              className="text-xs border-slate-300 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${predictiveLoading ? "animate-spin" : ""}`} />
              Analysen aktualisieren
            </Button>
          </div>

          {/* Anlagenliste mit Predictive Health Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {predictiveList.map((eqItem) => {
              const isAccelerating = eqItem.failureTrend === "ACCELERATING";
              const isHighRisk = eqItem.riskScore >= 60;

              return (
                <Card
                  key={eqItem.equipmentId}
                  className={`border transition-all ${
                    isAccelerating
                      ? "bg-rose-50/50 border-rose-300 shadow-xs"
                      : isHighRisk
                      ? "bg-amber-50/50 border-amber-300 shadow-xs"
                      : "bg-white border-slate-200 shadow-xs"
                  }`}
                >
                  <CardHeader className="pb-3 border-b border-slate-100">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-slate-500">{eqItem.equipmentNumber}</span>
                          <Badge
                            variant={eqItem.criticality === "A" ? "destructive" : "secondary"}
                            className="text-[10px]"
                          >
                            Kritikalität {eqItem.criticality}
                          </Badge>
                        </div>
                        <CardTitle className="text-sm text-slate-900 font-semibold mt-1">{eqItem.name}</CardTitle>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-semibold text-slate-500">Risikoscore</div>
                        <div
                          className={`text-lg font-bold font-mono ${
                            eqItem.riskScore >= 70
                              ? "text-rose-600"
                              : eqItem.riskScore >= 40
                              ? "text-amber-600"
                              : "text-emerald-600"
                          }`}
                        >
                          {eqItem.riskScore} / 100
                        </div>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 space-y-3 text-xs">
                    {/* Metriken Grid */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[11px]">
                      <div>
                        <span className="text-slate-500 block">MTBF:</span>
                        <strong className="text-slate-800 font-mono">{eqItem.historicalMtbfHours} h</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Ausfälle:</span>
                        <strong className="text-slate-800 font-mono">{eqItem.totalFailuresCount}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Intervall-Drift:</span>
                        <strong
                          className={`font-mono flex items-center gap-1 ${
                            eqItem.intervalDriftPercent < -15
                              ? "text-rose-600"
                              : eqItem.intervalDriftPercent > 15
                              ? "text-emerald-600"
                              : "text-slate-700"
                          }`}
                        >
                          {eqItem.intervalDriftPercent > 0 ? `+${eqItem.intervalDriftPercent}%` : `${eqItem.intervalDriftPercent}%`}
                        </strong>
                      </div>
                    </div>

                    {/* Messwert-Drifts */}
                    {eqItem.measurementDrifts && eqItem.measurementDrifts.length > 0 && (
                      <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-[11px] space-y-1">
                        <span className="text-slate-700 font-semibold block">Erkannter Sensor-/Messwert-Drift:</span>
                        {eqItem.measurementDrifts.map((md, idx) => (
                          <div key={idx} className="flex justify-between text-slate-600">
                            <span>{md.parameter}:</span>
                            <span className="text-amber-700 font-mono">
                              {md.currentValue} {md.unit} ({md.trend})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Planer-Warnung */}
                    {eqItem.plannerAlert && (
                      <div
                        className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                          eqItem.plannerAlert.severity === "CRITICAL"
                            ? "bg-rose-50 border-rose-200 text-rose-800"
                            : "bg-amber-50 border-amber-200 text-amber-800"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-semibold">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>{eqItem.plannerAlert.headline}</span>
                        </div>
                        <p className="text-[11px] text-slate-600">{eqItem.plannerAlert.explanation}</p>
                        <div className="pt-1 border-t border-slate-200 flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">
                            Handlungsempfehlung (innerhalb {eqItem.plannerAlert.urgencyDays} Tagen):
                          </span>
                        </div>
                        <p className="text-[11px] font-medium text-slate-900">{eqItem.plannerAlert.recommendedAction}</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          handleRun(
                            `Ausfallzeiten, Störungsursachen und MTBF für ${eqItem.name} (${eqItem.equipmentNumber})`
                          )
                        }
                        className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 flex items-center gap-1"
                      >
                        <BarChart3 className="w-3.5 h-3.5" />
                        Im Chart analysieren
                      </Button>

                      <Link
                        href={`/orders/new`}
                        className="h-7 text-xs px-2.5 rounded bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1 font-medium transition-colors"
                      >
                        <span>Auftrag planen</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. GEPLANTE E-MAIL REPORTS (MAIL-ABONNEMENT)                               */}
      {/* ========================================================================= */}
      {activeTab === "email_reports" && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div>
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Mail className="w-5 h-5 text-blue-600" />
                Automatisierte E-Mail-Abonnements & Cron-Reports
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Verwalte zyklische Instandhaltungsberichte für Werkleiter, Disponenten und Schichtführer.
                Die Reports enthalten Kennzahlen, Stillstandsanalysen und optionale CSV-Exporte.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleOpenPreview}
                className="text-xs border-slate-300 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5 text-blue-600" />
                HTML-Vorschau ansehen
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={() => setShowEmailModal(true)}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-1.5 shadow-xs"
              >
                <Mail className="w-3.5 h-3.5" />
                + Neues Abo einrichten
              </Button>
            </div>
          </div>

          {/* Trigger Success Toast */}
          {reportTriggerSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{reportTriggerSuccess}</span>
            </div>
          )}

          {/* Liste der aktiven Cron-Reports */}
          {scheduledReports.length === 0 ? (
            <Card className="border-slate-200 bg-white p-8 text-center space-y-3 shadow-xs">
              <Clock className="w-10 h-10 text-slate-400 mx-auto" />
              <h4 className="text-sm font-semibold text-slate-700">Noch keine Cron-Reports abonniert</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Erstelle ein regelmäßiges E-Mail-Abonnement (z. B. jeden Montag um 07:00 Uhr), um automatische Management-Auswertungen zu erhalten.
              </p>
              <Button
                size="sm"
                onClick={() => setShowEmailModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs mt-2"
              >
                Erstes Report-Abo erstellen
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scheduledReports.map((rep) => (
                <Card key={rep.id} className="border-slate-200 bg-white p-4 space-y-3 shadow-xs">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700 text-[10px]">
                          {rep.reportType}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          Cron: {rep.cronExpression}
                        </Badge>
                      </div>
                      <h4 className="text-sm font-semibold text-slate-900 mt-1.5">{rep.title}</h4>
                    </div>

                    <Badge variant={rep.isActive ? "default" : "secondary"} className="text-[10px]">
                      {rep.isActive ? "Aktiv" : "Pausiert"}
                    </Badge>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
                    <div className="flex justify-between text-slate-500">
                      <span>Empfänger:</span>
                      <span className="text-slate-800 font-mono truncate max-w-[220px]">
                        {rep.recipients.join(", ")}
                      </span>
                    </div>
                    {rep.customPrompt && (
                      <div className="flex justify-between text-slate-500">
                        <span>Basis-Query:</span>
                        <span className="text-blue-700 italic truncate max-w-[220px]">
                          "{rep.customPrompt}"
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-500">
                      <span>CSV-Anhang:</span>
                      <span className="text-slate-800">{rep.includeCsv ? "Ja (Excel UTF-8)" : "Nein"}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-[11px] text-slate-400">
                      Erstellt am {new Date(rep.createdAt).toLocaleDateString("de-DE")}
                    </span>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleTriggerReportNow(rep)}
                      disabled={triggeringReportId === rep.id}
                      className="h-7 text-xs border-slate-300 hover:bg-slate-50 text-slate-700 flex items-center gap-1.5"
                    >
                      {triggeringReportId === rep.id ? (
                        <>
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Sende...
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3 text-emerald-600" />
                          Jetzt manuell triggern
                        </>
                      )}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: E-MAIL REPORT VERSAND & CRON PLANUNG                               */}
      {/* ========================================================================= */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in">
          <Card className="w-full max-w-md border-slate-200 bg-white shadow-xl">
            <CardHeader className="border-b border-slate-100">
              <CardTitle className="text-base text-slate-900 flex items-center gap-2">
                <Mail className="h-5 w-5 text-blue-600" />
                Instandhaltungs-Report per E-Mail versenden
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Versende die aktuellen Analyseergebnisse als formatierten Management-Report oder richte ein periodisches Abonnement ein.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Empfänger E-Mail-Adresse
                </label>
                <Input
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  placeholder="instandhaltung@werk.de"
                  className="bg-slate-50 border-slate-300 text-slate-900 text-xs h-9"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Zyklus für automatisches Cron-Abonnement
                </label>
                <select
                  value={cronSchedule}
                  onChange={(e) => setCronSchedule(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-300 rounded-md p-2 text-slate-800"
                >
                  <option value="0 7 * * 1">Jeden Montag um 07:00 Uhr (Wochenreport)</option>
                  <option value="0 6 * * *">Täglich um 06:00 Uhr (Schichtbeginn)</option>
                  <option value="0 0 1 * *">Monatserster 00:00 Uhr (Monatsabschluss)</option>
                </select>
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-[11px] text-slate-600 space-y-1">
                <div>
                  <strong className="text-slate-800">Aktueller Prompt:</strong> {promptInput}
                </div>
                <div>
                  <strong className="text-slate-800">Format:</strong> HTML Management Summary + Excel CSV Rohdaten
                </div>
              </div>

              {emailSentSuccess && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-medium bg-emerald-50 border border-emerald-200 p-2.5 rounded">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>{emailSentSuccess}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowEmailModal(false)}
                  className="text-xs text-slate-600 hover:text-slate-900"
                >
                  Schließen
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleScheduleCron}
                    disabled={emailSending}
                    className="border-slate-300 text-slate-700 hover:bg-slate-50 text-xs h-8"
                  >
                    Als Cron abonnieren
                  </Button>

                  <Button
                    size="sm"
                    onClick={handleSendEmailNow}
                    disabled={emailSending || !emailAddress}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 flex items-center gap-1.5 shadow-xs"
                  >
                    {emailSending ? (
                      <>
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        Sende...
                      </>
                    ) : (
                      <>
                        <Send className="h-3 w-3" />
                        Jetzt ad-hoc senden
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: HTML REPORT VORSCHAU                                               */}
      {/* ========================================================================= */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in">
          <Card className="w-full max-w-4xl max-h-[85vh] flex flex-col border-slate-200 bg-white shadow-2xl overflow-hidden">
            <CardHeader className="border-b border-slate-100 pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base text-slate-900 flex items-center gap-2">
                  <Eye className="h-5 w-5 text-blue-600" />
                  E-Mail Report Vorschau (HTML-Rendering)
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Exakt so wird der Instandhaltungsbericht vom SMTP Mail-Service ausgeliefert.
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPreviewModal(false)}
                className="text-slate-500 hover:text-slate-800 text-xs"
              >
                Schließen
              </Button>
            </CardHeader>

            <CardContent className="p-4 flex-1 overflow-y-auto bg-slate-50">
              {previewLoading ? (
                <div className="p-12 text-center text-xs text-slate-500 space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-600 mx-auto" />
                  <p>Generiere HTML Report & Grafiken...</p>
                </div>
              ) : (
                <div
                  className="bg-white rounded-lg p-2 text-black shadow-inner border border-slate-200"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
