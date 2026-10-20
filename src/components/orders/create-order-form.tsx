"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Wrench,
  HelpCircle,
  ArrowRight,
  Send,
  RefreshCw,
  FileText,
  Flame,
  Volume2,
  Calendar,
  Layers,
  ChevronRight,
  ShieldCheck,
  Check,
  Mic,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  parseFaultPromptAction,
  analyzeFaultCopilotAction,
  createMaintenanceOrderAction,
  CreateMaintenanceOrderInput,
} from "@/actions/order-actions";
import { ParsedFaultDraft } from "@/lib/ai/fault-parser";
import { FaultCopilotAnalysisResult } from "@/lib/ai/fault-copilot";
import { localDb } from "@/lib/offline/indexed-db";

export interface EquipmentOption {
  id: string;
  name: string;
  equipmentNumber: string;
  criticality?: string;
}

interface CreateOrderFormProps {
  tenantId: string;
  equipments: EquipmentOption[];
  defaultUserId?: string;
}

export function CreateOrderForm({
  tenantId,
  equipments,
  defaultUserId = "user-demo-meister",
}: CreateOrderFormProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"ai_prompt" | "manual">("ai_prompt");
  const [isPending, startTransition] = useTransition();

  // --- State KI Prompt Mode ---
  const [promptText, setPromptText] = useState("");
  const [parsedDraft, setParsedDraft] = useState<ParsedFaultDraft | null>(null);
  const [answeredQuestions, setAnsweredQuestions] = useState<Record<string, string>>({});

  // --- State Manuelles Formular ---
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string>("");
  const [priority, setPriority] = useState<"1_EMERGENCY" | "2_HIGH" | "3_MEDIUM" | "4_LOW">("3_MEDIUM");
  const [damageCode, setDamageCode] = useState<string>("MECH_LAGER");
  const [plannedDurationMinutes, setPlannedDurationMinutes] = useState<number>(60);
  const [scheduledStartAt, setScheduledStartAt] = useState<string>("");
  const [downtimeMinutes, setDowntimeMinutes] = useState<number>(0);
  const [isDowntime, setIsDowntime] = useState<boolean>(false);

  // --- State Copilot RAG ---
  const [copilotResult, setCopilotResult] = useState<FaultCopilotAnalysisResult | null>(null);
  const [copilotLoading, setCopilotLoading] = useState(false);

  // --- Success Modal/Notification ---
  const [createdOrderResult, setCreatedOrderResult] = useState<{
    id: string;
    orderNumber: string;
    title: string;
    sapNotificationNr?: string;
    isOfflineFallback?: boolean;
  } | null>(null);

  // Beispiel-Prompts zum Schnellstarten
  const samplePrompts = [
    {
      label: "🚨 Havarie & Stillstand",
      text: "Kreiselpumpe KSB in Halle 2 verliert massiv Druck, Motorblock ist glühend heiß und raucht. Fertigungslinie 2 steht seit 10 Minuten still!",
    },
    {
      label: "⚙️ Getriebe- & Lagerschaden",
      text: "Antriebsmotor Siemens 45kW macht mahlende Scharrgeräusche bei Teillast. Schwingungen spürbar erhöht, bitte zeitnah prüfen.",
    },
    {
      label: "🔌 Schaltschrank-Überhitzung",
      text: "Hauptverteiler Lüfterausfall, Schaltschrank-Thermowarnung 65 Grad erreicht. Klemmenleiste überprüfen.",
    },
  ];

  // 1. KI-Prompt parsen
  const handleAnalyzePrompt = () => {
    if (!promptText.trim()) return;

    startTransition(async () => {
      try {
        const result = await parseFaultPromptAction({
          tenantId,
          prompt: promptText,
          availableEquipments: equipments.map((e) => ({
            id: e.id,
            name: e.name,
            equipmentNumber: e.equipmentNumber,
          })),
        });

        setParsedDraft(result);
        setAnsweredQuestions({});

        // Synchronisiere auch Felder mit dem manuellen Formular
        setTitle(result.title);
        setDescription(result.description);
        if (result.matchedEquipmentId) {
          setSelectedEquipmentId(result.matchedEquipmentId);
        }
        setPriority(result.priority);
        setPlannedDurationMinutes(result.plannedDurationMinutes || 60);
        if (result.damageCode) {
          setDamageCode(result.damageCode);
        }
      } catch (err) {
        console.error("Fehler bei Prompt-Analyse:", err);
      }
    });
  };

  // Beantwortung einer Rückfrage durch die KI
  const handleAnswerQuestion = (fieldKey: string, answerText: string, updates: Partial<ParsedFaultDraft>) => {
    setAnsweredQuestions((prev) => ({ ...prev, [fieldKey]: answerText }));
    if (!parsedDraft) return;

    const updated = { ...parsedDraft, ...updates };
    setParsedDraft(updated);

    if (updates.title) setTitle(updates.title);
    if (updates.description) setDescription(updates.description);
    if (updates.matchedEquipmentId) setSelectedEquipmentId(updates.matchedEquipmentId);
    if (updates.priority) setPriority(updates.priority);
    if (updates.plannedDurationMinutes) setPlannedDurationMinutes(updates.plannedDurationMinutes);
  };

  // 2. Copilot Duplikat- und Lösungssuche
  const handleRunCopilot = async () => {
    const textToAnalyze = description || title || promptText;
    if (!textToAnalyze.trim()) return;

    setCopilotLoading(true);
    try {
      const res = await analyzeFaultCopilotAction({
        tenantId,
        userInputText: textToAnalyze,
        equipmentId: selectedEquipmentId || undefined,
      });
      setCopilotResult(res);
    } catch (err) {
      console.warn("Copilot Analyse fehlgeschlagen:", err);
    } finally {
      setCopilotLoading(false);
    }
  };

  // In manuelles Formular übernehmen
  const handleTransferToManual = () => {
    if (parsedDraft) {
      setTitle(parsedDraft.title);
      setDescription(parsedDraft.description);
      if (parsedDraft.matchedEquipmentId) {
        setSelectedEquipmentId(parsedDraft.matchedEquipmentId);
      }
      setPriority(parsedDraft.priority);
      setPlannedDurationMinutes(parsedDraft.plannedDurationMinutes || 60);
      if (parsedDraft.damageCode) {
        setDamageCode(parsedDraft.damageCode);
      }
    }
    setActiveTab("manual");
  };

  // 3. Auftrag anlegen
  const handleSubmitOrder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const orderTitle = activeTab === "ai_prompt" && parsedDraft ? parsedDraft.title : title;
    const orderDesc = activeTab === "ai_prompt" && parsedDraft ? parsedDraft.description : description;
    const orderEquip = activeTab === "ai_prompt" && parsedDraft ? (parsedDraft.matchedEquipmentId || selectedEquipmentId) : selectedEquipmentId;
    const orderPrio = activeTab === "ai_prompt" && parsedDraft ? parsedDraft.priority : priority;
    const orderDuration = activeTab === "ai_prompt" && parsedDraft ? (parsedDraft.plannedDurationMinutes || 60) : plannedDurationMinutes;

    if (!orderTitle.trim()) {
      alert("Bitte geben Sie einen Störungstitel ein.");
      return;
    }

    const payload: CreateMaintenanceOrderInput = {
      tenantId,
      title: orderTitle,
      description: orderDesc || orderTitle,
      priority: orderPrio,
      equipmentId: orderEquip || null,
      damageCode: damageCode || null,
      plannedDurationMinutes: orderDuration,
      scheduledStartAt: scheduledStartAt ? new Date(scheduledStartAt).toISOString() : new Date().toISOString(),
      downtimeMinutes: isDowntime ? (downtimeMinutes || 30) : 0,
      reportedByUserId: defaultUserId,
    };

    startTransition(async () => {
      try {
        const res = await createMaintenanceOrderAction(payload);
        if (res.success) {
          // Auch in lokale Dexie IndexedDB spiegeln für Offline-Verfügbarkeit
          if (typeof window !== "undefined" && localDb) {
            try {
              const matchedEq = equipments.find((e) => e.id === orderEquip);
              await localDb.orders.put({
                id: res.order.id,
                tenantId,
                orderNumber: res.order.orderNumber,
                orderTypeId: "type-pm01",
                currentStatusId: "stat-open",
                priority: orderPrio,
                title: orderTitle,
                description: orderDesc,
                equipmentId: orderEquip || null,
                equipmentName: matchedEq ? matchedEq.name : null,
                equipmentNumber: matchedEq ? matchedEq.equipmentNumber : null,
                scheduledStartAt: payload.scheduledStartAt,
                plannedDurationMinutes: orderDuration,
                syncStatus: res.isOfflineFallback ? "CREATED_OFFLINE" : "SYNCED",
                updatedAt: new Date().toISOString(),
              });
            } catch (dbErr) {
              console.warn("Dexie local cache warn:", dbErr);
            }
          }

          setCreatedOrderResult({
            id: res.order.id,
            orderNumber: res.order.orderNumber,
            title: res.order.title,
            sapNotificationNr: res.sapNotificationNr,
            isOfflineFallback: res.isOfflineFallback,
          });
        }
      } catch (err: any) {
        alert("Fehler beim Anlegen des Auftrags: " + (err.message || "Unbekannter Fehler"));
      }
    });
  };

  // Erfolgs-Ansicht
  if (createdOrderResult) {
    return (
      <Card className="max-w-3xl mx-auto p-8 bg-neutral-900 border-neutral-800 text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="w-16 h-16 rounded-full bg-emerald-950/80 border border-emerald-500/50 text-emerald-400 mx-auto flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        <div className="space-y-2">
          <Badge variant="success" className="px-3 py-1 text-sm font-semibold">
            {createdOrderResult.isOfflineFallback ? "Offline im Puffer angelegt" : "Erfolgreich im Leitstand erfasst"}
          </Badge>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            Störungsauftrag {createdOrderResult.orderNumber} angelegt
          </h2>
          <p className="text-neutral-400 max-w-lg mx-auto text-sm">
            „{createdOrderResult.title}“ wurde angelegt und für die Disposition im Planungsboard bereitgestellt.
          </p>
        </div>

        <div className="bg-neutral-950/70 border border-neutral-800 rounded-lg p-4 max-w-md mx-auto text-left text-xs space-y-2">
          <div className="flex justify-between items-center text-neutral-400">
            <span>Auftragsnummer:</span>
            <span className="font-mono text-white font-medium">{createdOrderResult.orderNumber}</span>
          </div>
          {createdOrderResult.sapNotificationNr && (
            <div className="flex justify-between items-center text-neutral-400">
              <span>SAP PM Meldungs-Nr.:</span>
              <span className="font-mono text-blue-400 font-medium">{createdOrderResult.sapNotificationNr}</span>
            </div>
          )}
          <div className="flex justify-between items-center text-neutral-400">
            <span>Status:</span>
            <Badge variant="secondary">OFFEN (Neu gemeldet)</Badge>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
          <Button
            variant="default"
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 flex items-center gap-2"
            onClick={() => router.push("/planning")}
          >
            <Calendar className="w-4 h-4" />
            Zum Gantt-Planungsboard
          </Button>

          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => {
              setCreatedOrderResult(null);
              setParsedDraft(null);
              setPromptText("");
              setTitle("");
              setDescription("");
            }}
          >
            Weitere Störung erfassen
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Modus-Umschalter Tabs */}
      <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
        <div className="flex items-center gap-2 bg-neutral-900 p-1 rounded-lg border border-neutral-800">
          <button
            type="button"
            onClick={() => setActiveTab("ai_prompt")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === "ai_prompt"
                ? "bg-blue-600 text-white shadow"
                : "text-neutral-400 hover:text-white hover:bg-neutral-800/60"
            }`}
          >
            <Sparkles className="w-4 h-4 text-blue-300" />
            🤖 KI-Prompt-Modus
            <Badge variant="secondary" className="ml-1 text-[10px] bg-blue-950/80 text-blue-300 border-none">
              Empfohlen
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("manual")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === "manual"
                ? "bg-neutral-800 text-white shadow"
                : "text-neutral-400 hover:text-white hover:bg-neutral-800/60"
            }`}
          >
            <FileText className="w-4 h-4 text-neutral-300" />
            📝 Manuelles Formular
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2 text-xs text-neutral-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Offline-First & SAP PM Sync aktiv</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. KI-PROMPT MODUS                                                        */}
      {/* ========================================================================= */}
      {activeTab === "ai_prompt" && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Eingabebereich für Prompt */}
          <Card className="p-6 bg-neutral-900 border-neutral-800 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-400" />
                  Störungsmeldung in natürlicher Sprache eingeben
                </h2>
                <p className="text-xs text-neutral-400 mt-1">
                  Beschreibe das Problem wie im Funkspruch oder Diktiermikrofon. Die KI strukturiert den Auftrag und fragt bei fehlenden Angaben nach.
                </p>
              </div>
              <Badge variant="outline" className="border-blue-800 text-blue-400 text-xs">
                Sprach- & Freitext-Assistent
              </Badge>
            </div>

            {/* Prompt Textarea */}
            <div className="relative">
              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="z.B. Kreiselpumpe KSB in Halle 2 verliert massiv Druck, Motorblock ist heiß und vibriert. Linie steht still!"
                className="w-full h-32 px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-lg text-white placeholder-neutral-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-sans"
              />
              <div className="absolute right-3 bottom-3 flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-neutral-400 hover:text-neutral-200 h-8 px-2 text-xs flex items-center gap-1.5"
                  title="Spracheingabe / Diktierfunktion (simuliert)"
                  onClick={() => {
                    setPromptText("Hydraulikaggregat der Presse P-04 verliert Öl am Hochdruckschlauch, Druckanzeige pulsiert stark.");
                  }}
                >
                  <Mic className="w-3.5 h-3.5 text-blue-400" />
                  Diktieren
                </Button>
              </div>
            </div>

            {/* Vorlagen / Quick-Pills */}
            <div className="space-y-2">
              <span className="text-[11px] font-medium text-neutral-400 uppercase tracking-wider">
                Beispiel-Störungen zum Testen:
              </span>
              <div className="flex flex-wrap gap-2">
                {samplePrompts.map((s, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPromptText(s.text)}
                    className="text-xs bg-neutral-950 border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/80 text-neutral-300 px-3 py-1.5 rounded-md transition-all text-left flex items-center gap-1.5"
                  >
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Aktions-Button */}
            <div className="pt-2 flex justify-end">
              <Button
                type="button"
                onClick={handleAnalyzePrompt}
                disabled={!promptText.trim() || isPending}
                className="bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center gap-2 px-5 py-2.5"
              >
                {isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Analysiere Störung mit KI...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Prompt analysieren & Störung aufbereiten
                  </>
                )}
              </Button>
            </div>
          </Card>

          {/* ========================================================================= */}
          {/* ERGEBNIS DER KI-ANALYSE & INTERAKTIVE RÜCKFRAGEN                          */}
          {/* ========================================================================= */}
          {parsedDraft && (
            <div className="space-y-6 animate-in slide-in-from-bottom-3 duration-200">
              {/* KI-Kommentar */}
              <div className="p-4 bg-blue-950/40 border border-blue-800/60 rounded-lg flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-blue-200">KI-Ergebnis & Analyse</p>
                  <p className="text-neutral-300">{parsedDraft.aiCommentary}</p>
                </div>
              </div>

              {/* INTERAKTIVE RÜCKFRAGEN FÜR FEHLENDE FELDER */}
              {parsedDraft.missingFields && parsedDraft.missingFields.length > 0 && (
                <Card className="p-5 bg-amber-950/30 border border-amber-800/60 space-y-4">
                  <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
                    <HelpCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                    <span>Rückfragen der KI für vollständige Erfassung:</span>
                  </div>

                  <div className="space-y-3">
                    {parsedDraft.missingFields.map((mf, idx) => {
                      const isAnswered = Boolean(answeredQuestions[mf.fieldName]);

                      return (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg border text-xs space-y-2 transition-all ${
                            isAnswered
                              ? "bg-neutral-900/60 border-neutral-800 opacity-80"
                              : "bg-neutral-950/80 border-amber-900/50"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-amber-200 flex items-center gap-1.5">
                              {isAnswered && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                              {mf.question}
                            </span>
                            {isAnswered && (
                              <Badge variant="success" className="text-[10px]">
                                Beantwortet: {answeredQuestions[mf.fieldName]}
                              </Badge>
                            )}
                          </div>

                          {!isAnswered && (
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              {/* Spezifische Schnellantwort-Buttons je nach Feld */}
                              {mf.fieldName === "equipment" && (
                                <>
                                  {equipments.slice(0, 4).map((eq) => (
                                    <button
                                      key={eq.id}
                                      type="button"
                                      onClick={() =>
                                        handleAnswerQuestion("equipment", eq.name, {
                                          matchedEquipmentId: eq.id,
                                        })
                                      }
                                      className="px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 rounded text-neutral-200 transition-colors"
                                    >
                                      {eq.name} ({eq.equipmentNumber})
                                    </button>
                                  ))}
                                </>
                              )}

                              {mf.fieldName === "priority" && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleAnswerQuestion("priority", "1_EMERGENCY (Havarie)", {
                                        priority: "1_EMERGENCY",
                                      })
                                    }
                                    className="px-2.5 py-1 bg-red-950/70 hover:bg-red-900/80 border border-red-800 text-red-200 rounded"
                                  >
                                    🚨 Sofort / Havarie (Stillstand)
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleAnswerQuestion("priority", "2_HIGH (Dringend)", {
                                        priority: "2_HIGH",
                                      })
                                    }
                                    className="px-2.5 py-1 bg-amber-950/70 hover:bg-amber-900/80 border border-amber-800 text-amber-200 rounded"
                                  >
                                    ⚠️ Innerhalb 4 Stunden
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleAnswerQuestion("priority", "3_MEDIUM (Normal)", {
                                        priority: "3_MEDIUM",
                                      })
                                    }
                                    className="px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 rounded"
                                  >
                                    🕒 Normal (nächste Schicht)
                                  </button>
                                </>
                              )}

                              {mf.fieldName === "downtime" && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsDowntime(true);
                                      setDowntimeMinutes(60);
                                      handleAnswerQuestion("downtime", "Ja, Linie steht still", {});
                                    }}
                                    className="px-2.5 py-1 bg-red-950/70 hover:bg-red-900/80 border border-red-800 text-red-200 rounded"
                                  >
                                    Ja, Linie steht still
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsDowntime(false);
                                      setDowntimeMinutes(0);
                                      handleAnswerQuestion("downtime", "Nein, gedrosselter Betrieb", {});
                                    }}
                                    className="px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-neutral-300 rounded"
                                  >
                                    Nein, gedrosselter Weiterbetrieb
                                  </button>
                                </>
                              )}

                              {mf.fieldName === "symptoms" && (
                                <div className="flex items-center gap-2 w-full">
                                  <Input
                                    placeholder="Zusätzliche Symptome ergänzen..."
                                    className="h-7 text-xs bg-neutral-900 border-neutral-700 text-white"
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        const val = (e.target as HTMLInputElement).value;
                                        if (val) {
                                          handleAnswerQuestion("symptoms", val, {
                                            description: `${parsedDraft.description}\n\nZusätzliche Beobachtungen: ${val}`,
                                          });
                                        }
                                      }
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {/* STRUKTURIERTER ENTWURF */}
              <Card className="p-6 bg-neutral-900 border-neutral-800 space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <FileText className="w-4 h-4 text-neutral-400" />
                    Generierter Störungsauftrag
                  </h3>

                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        parsedDraft.priority === "1_EMERGENCY"
                          ? "destructive"
                          : parsedDraft.priority === "2_HIGH"
                          ? "warning"
                          : "secondary"
                      }
                    >
                      Prio: {parsedDraft.priority}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="text-neutral-400 block mb-1">Auftragstitel:</label>
                    <input
                      type="text"
                      value={parsedDraft.title}
                      onChange={(e) => {
                        const val = e.target.value;
                        setParsedDraft({ ...parsedDraft, title: val });
                        setTitle(val);
                      }}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-1.5 text-white font-medium focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-neutral-400 block mb-1">Zugeordnetes Equipment:</label>
                    <select
                      value={parsedDraft.matchedEquipmentId || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setParsedDraft({ ...parsedDraft, matchedEquipmentId: val });
                        setSelectedEquipmentId(val);
                      }}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-1.5 text-white focus:ring-1 focus:ring-blue-500 outline-none"
                    >
                      <option value="">-- Kein Equipment zugeordnet --</option>
                      {equipments.map((eq) => (
                        <option key={eq.id} value={eq.id}>
                          {eq.name} ({eq.equipmentNumber})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-neutral-400 block mb-1">Technische Beschreibung & Symptome:</label>
                    <textarea
                      value={parsedDraft.description}
                      onChange={(e) => {
                        const val = e.target.value;
                        setParsedDraft({ ...parsedDraft, description: val });
                        setDescription(val);
                      }}
                      className="w-full h-24 bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-white focus:ring-1 focus:ring-blue-500 outline-none resize-none font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-neutral-400 block mb-1">Geschätzte Arbeitsdauer (Minuten):</label>
                    <input
                      type="number"
                      value={parsedDraft.plannedDurationMinutes || 60}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 60;
                        setParsedDraft({ ...parsedDraft, plannedDurationMinutes: val });
                        setPlannedDurationMinutes(val);
                      }}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-1.5 text-white focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-neutral-400 block mb-1">Schadenscode (SAP FEGRP/FECOD):</label>
                    <input
                      type="text"
                      value={parsedDraft.damageCode || "MECH_LAGER"}
                      onChange={(e) => {
                        const val = e.target.value;
                        setParsedDraft({ ...parsedDraft, damageCode: val });
                        setDamageCode(val);
                      }}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-1.5 text-white focus:ring-1 focus:ring-blue-500 outline-none uppercase font-mono"
                    />
                  </div>
                </div>

                {/* Footer Aktions-Buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-neutral-800">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleTransferToManual}
                    className="text-neutral-400 hover:text-white flex items-center gap-1.5 text-xs"
                  >
                    Im manuellen Formular anpassen
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>

                  <Button
                    type="button"
                    onClick={() => handleSubmitOrder()}
                    disabled={isPending}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-2 px-6"
                  >
                    {isPending ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Erstelle Störungsauftrag...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Störungsauftrag jetzt anlegen
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. MANUELLES FORMULAR MIT ECHTZEIT-COPILOT                                */}
      {/* ========================================================================= */}
      {activeTab === "manual" && (
        <form onSubmit={handleSubmitOrder} className="space-y-6 animate-in fade-in duration-150">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Linke Spalte: Haupt-Formularfelder (2 Cols) */}
            <div className="lg:col-span-2 space-y-5">
              <Card className="p-6 bg-neutral-900 border-neutral-800 space-y-4">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-blue-400" />
                  Stammdaten der Störung
                </h3>

                {/* Titel */}
                <div className="space-y-1.5">
                  <Label htmlFor="order-title" className="text-xs text-neutral-300">
                    Störungstitel / Kurztext *
                  </Label>
                  <Input
                    id="order-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="z.B. Lagerschaden Antriebsmotor M-102"
                    required
                    className="bg-neutral-950 border-neutral-800 text-white text-sm"
                  />
                </div>

                {/* Equipment & Priorität */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-neutral-300">Betroffene Anlage / Equipment</Label>
                    <select
                      value={selectedEquipmentId}
                      onChange={(e) => setSelectedEquipmentId(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">-- Keine spezifische Anlage --</option>
                      {equipments.map((eq) => (
                        <option key={eq.id} value={eq.id}>
                          {eq.name} ({eq.equipmentNumber})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-neutral-300">Priorität</Label>
                    <select
                      value={priority}
                      onChange={(e) =>
                        setPriority(e.target.value as "1_EMERGENCY" | "2_HIGH" | "3_MEDIUM" | "4_LOW")
                      }
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                    >
                      <option value="1_EMERGENCY">🚨 1_EMERGENCY (Stillstand / Havarie)</option>
                      <option value="2_HIGH">⚠️ 2_HIGH (Dringend)</option>
                      <option value="3_MEDIUM">🕒 3_MEDIUM (Normal)</option>
                      <option value="4_LOW">☕ 4_LOW (Gering / Geplant)</option>
                    </select>
                  </div>
                </div>

                {/* Beschreibung */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-neutral-300">Ausführliche Störungsbeschreibung & Symptome</Label>
                    <button
                      type="button"
                      onClick={handleRunCopilot}
                      className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      KI-Duplikat- & Lösungscheck
                    </button>
                  </div>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Was genau ist passiert? Welche Geräusche, Leckagen oder Fehlermeldungen auf der HMI liegen vor?"
                    rows={4}
                    className="w-full px-3 py-2 bg-neutral-950 border border-neutral-800 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-sans"
                  />
                </div>

                {/* Schadenscode, Dauer & Termin */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-neutral-300">Schadenscode</Label>
                    <select
                      value={damageCode}
                      onChange={(e) => setDamageCode(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-md px-3 py-2 text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="MECH_LAGER">MECH_LAGER (Wälzlager/Gleitlager)</option>
                      <option value="HYDR_LECK">HYDR_LECK (Leckage / Druckverlust)</option>
                      <option value="ELEK_SENSOR">ELEK_SENSOR (Geber / Sensor defekt)</option>
                      <option value="PNEUM_VENTIL">PNEUM_VENTIL (Ventilinsel / Druck)</option>
                      <option value="ELEK_MOTOR">ELEK_MOTOR (Wicklung / Frequenzumrichter)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-neutral-300">Geplante Dauer (Min)</Label>
                    <Input
                      type="number"
                      value={plannedDurationMinutes}
                      onChange={(e) => setPlannedDurationMinutes(parseInt(e.target.value) || 60)}
                      className="bg-neutral-950 border-neutral-800 text-white text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-neutral-300">Geplanter Start</Label>
                    <Input
                      type="datetime-local"
                      value={scheduledStartAt}
                      onChange={(e) => setScheduledStartAt(e.target.value)}
                      className="bg-neutral-950 border-neutral-800 text-white text-xs"
                    />
                  </div>
                </div>

                {/* Produktionsstillstand Toggle */}
                <div className="p-3 bg-neutral-950/60 border border-neutral-800 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flame className={`w-4 h-4 ${isDowntime ? "text-red-400" : "text-neutral-500"}`} />
                    <span className="text-xs text-neutral-200 font-medium">Verursacht die Störung einen Produktionsstillstand?</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-neutral-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isDowntime}
                        onChange={(e) => setIsDowntime(e.target.checked)}
                        className="rounded border-neutral-700 text-blue-600 focus:ring-blue-500"
                      />
                      <span>Ja, Stillstand</span>
                    </label>
                    {isDowntime && (
                      <Input
                        type="number"
                        placeholder="Minuten"
                        value={downtimeMinutes}
                        onChange={(e) => setDowntimeMinutes(parseInt(e.target.value) || 0)}
                        className="w-20 h-7 text-xs bg-neutral-900 border-neutral-700 text-white"
                      />
                    )}
                  </div>
                </div>
              </Card>

              {/* Absende-Button */}
              <div className="flex justify-end gap-3">
                <Button
                  type="submit"
                  disabled={isPending || !title.trim()}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center gap-2 px-6 py-2.5"
                >
                  {isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Speichere Störungsauftrag...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Störungsauftrag verbindlich anlegen
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Rechte Spalte: KI-Copilot Sidebar (RAG, Duplikate & Ersatzteile) */}
            <div className="space-y-4">
              <Card className="p-5 bg-neutral-900 border-neutral-800 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                    MaintAI Copilot
                  </h4>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleRunCopilot}
                    disabled={copilotLoading || (!title && !description)}
                    className="text-xs h-7 border-neutral-700"
                  >
                    {copilotLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : "Analysieren"}
                  </Button>
                </div>

                {!copilotResult && !copilotLoading && (
                  <p className="text-xs text-neutral-400">
                    Fülle Titel oder Beschreibung aus und klicke auf „Analysieren“, um Duplikate und historische Reparatur-Lösungen aus der Wissensbasis abzurufen.
                  </p>
                )}

                {copilotLoading && (
                  <div className="p-4 text-center text-xs text-neutral-400 space-y-2">
                    <RefreshCw className="w-5 h-5 animate-spin text-blue-400 mx-auto" />
                    <p>Prüfe historische Störungsdatenbank & Vektor-Embeddings...</p>
                  </div>
                )}

                {copilotResult && (
                  <div className="space-y-4 text-xs animate-in fade-in">
                    {/* Duplikat-Warnung */}
                    {copilotResult.duplicateWarning?.isDuplicateDetected && (
                      <div className="p-3 bg-amber-950/40 border border-amber-800/80 rounded-lg space-y-1.5 text-amber-200">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                          <span>Mögliches Störungsduplikat!</span>
                        </div>
                        <p className="text-[11px] text-neutral-300">
                          {copilotResult.duplicateWarning.explanation}
                        </p>
                        {copilotResult.duplicateWarning.existingOrderNumber && (
                          <Badge variant="warning" className="text-[10px]">
                            Offener Auftrag: {copilotResult.duplicateWarning.existingOrderNumber}
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* Lösungsvorschläge & Ersatzteile */}
                    {copilotResult.suggestedSolutions && copilotResult.suggestedSolutions.length > 0 && (
                      <div className="space-y-2">
                        <span className="font-semibold text-neutral-200 block">
                          Ähnliche behobene Fälle & Ersatzteile:
                        </span>
                        {copilotResult.suggestedSolutions.map((sol, sIdx) => (
                          <div
                            key={sIdx}
                            className="p-3 bg-neutral-950 border border-neutral-800 rounded-md space-y-1.5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-blue-300">{sol.title}</span>
                              <span className="text-[10px] text-emerald-400 font-mono">
                                {sol.confidencePercent}% Match
                              </span>
                            </div>
                            <p className="text-[11px] text-neutral-400">
                              <strong className="text-neutral-300">Ursache:</strong> {sol.cause}
                            </p>
                            <p className="text-[11px] text-neutral-400">
                              <strong className="text-neutral-300">Lösung:</strong> {sol.solution}
                            </p>

                            {sol.recommendedSpareParts && sol.recommendedSpareParts.length > 0 && (
                              <div className="pt-1 border-t border-neutral-800">
                                <span className="text-[10px] text-neutral-400 block mb-1">
                                  Benötigte Ersatzteile:
                                </span>
                                <div className="space-y-1">
                                  {sol.recommendedSpareParts.map((sp, spIdx) => (
                                    <div
                                      key={spIdx}
                                      className="flex items-center justify-between text-[11px] bg-neutral-900 px-2 py-0.5 rounded text-neutral-300"
                                    >
                                      <span>{sp.name}</span>
                                      <span className="text-neutral-500 font-mono">
                                        {sp.quantity}x ({sp.partNumber})
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
