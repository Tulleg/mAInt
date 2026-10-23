"use client";

import React, { useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import {
  Play,
  CheckCheck,
  Pause,
  CheckCircle2,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Clock,
  FileCheck,
  Lock,
  MessageSquare,
  Sparkles,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getAvailableTransitionsAction,
  executeWorkflowTransitionAction,
} from "@/actions/workflow-actions";
import { AvailableTransition } from "@/lib/workflow-engine";

export interface OrderWorkflowActionsProps {
  orderId: string;
  userRole?: string;
  userId?: string;
  initialTransitions?: AvailableTransition[];
  onTransitionSuccess?: (targetStatusName: string) => void;
  className?: string;
  compact?: boolean;
}

export function OrderWorkflowActions({
  orderId,
  userRole = "TECHNICIAN",
  userId = "user-current",
  initialTransitions,
  onTransitionSuccess,
  className = "",
  compact = false,
}: OrderWorkflowActionsProps) {
  const [transitions, setTransitions] = useState<AvailableTransition[]>(initialTransitions || []);
  const [isLoading, setIsLoading] = useState(!initialTransitions);
  const [isPending, startActionTransition] = useTransition();

  // Active prompt state for transitions requiring a comment
  const [promptTransition, setPromptTransition] = useState<AvailableTransition | null>(null);
  const [commentText, setCommentText] = useState("");

  // Load available transitions from Server Action
  const loadTransitions = async () => {
    if (!orderId) return;
    try {
      const res = await getAvailableTransitionsAction(orderId, userRole);
      if (res.success && res.transitions) {
        setTransitions(res.transitions);
      }
    } catch (err) {
      console.warn("Fehler beim Abrufen der verfügbaren Transitionen:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTransitions();
  }, [orderId, userRole]);

  // Execute transition
  const handleExecute = (t: AvailableTransition) => {
    // If guards missing, block execution
    if (!t.guards?.allGuardsSatisfied) {
      const missing = getMissingGuardDescriptions(t.guards);
      toast.warning(`Statuswechsel blockiert: ${missing.join(", ")}`);
      return;
    }

    // If requires comment or is a completion/pause action, prompt for comment
    const isSpecialAction =
      t.requiresComment ||
      t.toStatus.code === "TECH_COMPLETED" ||
      t.toStatus.code === "ON_HOLD" ||
      t.actionName.toLowerCase().includes("paus") ||
      t.actionName.toLowerCase().includes("abschluss");

    if (isSpecialAction && !promptTransition) {
      setPromptTransition(t);
      setCommentText("");
      return;
    }

    startActionTransition(async () => {
      try {
        const res = await executeWorkflowTransitionAction({
          orderId,
          targetStatusId: t.toStatusId,
          userId,
          comment: commentText.trim() || `Workflow-Aktion ausgeführt: ${t.actionName}`,
        });

        if (res.success) {
          toast.success(
            res.result?.message || `Auftrag erfolgreich zu '${t.toStatus.name}' gewechselt!`
          );
          setPromptTransition(null);
          setCommentText("");
          await loadTransitions();
          if (onTransitionSuccess) {
            onTransitionSuccess(t.toStatus.name);
          }
        } else {
          toast.error(res.error || "Statuswechsel fehlgeschlagen.");
        }
      } catch (err: any) {
        toast.error(err?.message || "Fehler beim Ausführen des Statuswechsels.");
      }
    });
  };

  // Helper: Extract human-readable missing guard reasons
  const getMissingGuardDescriptions = (guards: AvailableTransition["guards"]) => {
    const list: string[] = [];
    if (!guards) return list;

    if (guards.requireTimeEntry && !guards.timeEntrySatisfied) {
      list.push("Zeiterfassung vor TABG erforderlich");
    }
    if (guards.requireChecklist && !guards.checklistSatisfied) {
      list.push("Prüfprotokoll / Checkliste erforderlich");
    }
    if (guards.requireDamageCode && !guards.damageCodeSatisfied) {
      list.push("Schadenscode erforderlich");
    }
    if (guards.requireRootCause && !guards.rootCauseSatisfied) {
      list.push("Ursachen- & Schadenscode Pflicht");
    }
    if (guards.requireSignature && !guards.signatureSatisfied) {
      list.push("Digitale Unterschrift Pflicht");
    }

    return list;
  };

  // Icon chooser based on transition target or action
  const getActionIcon = (t: AvailableTransition) => {
    const code = t.toStatus.code?.toUpperCase();
    const name = t.actionName?.toLowerCase();

    if (code === "TECH_COMPLETED" || name.includes("abgeschlossen") || name.includes("tabg")) {
      return <CheckCheck className="w-4 h-4 shrink-0" />;
    }
    if (code === "IN_WORK" || name.includes("start") || name.includes("arbeit")) {
      return <Play className="w-4 h-4 shrink-0" />;
    }
    if (code === "ON_HOLD" || name.includes("paus") || name.includes("wartend")) {
      return <Pause className="w-4 h-4 shrink-0" />;
    }
    if (code === "RELEASED" || name.includes("freig")) {
      return <CheckCircle2 className="w-4 h-4 shrink-0" />;
    }
    if (code === "CLOSED") {
      return <ShieldCheck className="w-4 h-4 shrink-0" />;
    }
    return <ArrowRight className="w-4 h-4 shrink-0" />;
  };

  // Button Color Scheme
  const getButtonStyles = (t: AvailableTransition, isSatisfied: boolean) => {
    if (!isSatisfied) {
      return "bg-slate-100 hover:bg-slate-100 text-slate-400 border border-slate-300 opacity-70 cursor-not-allowed";
    }

    const code = t.toStatus.code?.toUpperCase();
    const name = t.actionName?.toLowerCase();

    if (code === "TECH_COMPLETED" || name.includes("tabg")) {
      return "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs";
    }
    if (code === "IN_WORK" || name.includes("arbeit")) {
      return "bg-amber-600 hover:bg-amber-700 text-white shadow-xs";
    }
    if (code === "ON_HOLD" || name.includes("paus")) {
      return "bg-slate-200 hover:bg-slate-300 text-slate-800 shadow-xs";
    }
    if (code === "RELEASED") {
      return "bg-blue-600 hover:bg-blue-700 text-white shadow-xs";
    }
    if (code === "CLOSED") {
      return "bg-slate-800 hover:bg-slate-900 text-white shadow-xs";
    }

    return "bg-blue-600 hover:bg-blue-700 text-white shadow-xs";
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span>Verfügbare Workflow-Aktionen werden geladen...</span>
      </div>
    );
  }

  if (transitions.length === 0) {
    return (
      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 flex items-center gap-2">
        <Info className="w-4 h-4 text-slate-400 shrink-0" />
        <span>Keine weiteren Workflow-Übergänge für diese Rolle konfiguriert.</span>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Dynamic Action Buttons Grid */}
      <div className="flex flex-wrap items-start gap-2.5">
        {transitions.map((t) => {
          const isSatisfied = t.guards?.allGuardsSatisfied ?? true;
          const missingReasons = getMissingGuardDescriptions(t.guards);
          const tooltipText = isSatisfied
            ? `Status wechseln zu '${t.toStatus.name}'`
            : `Gesperrt: ${missingReasons.join(" • ")}`;

          return (
            <div key={t.id} className="flex flex-col space-y-1">
              <button
                type="button"
                disabled={isPending || !isSatisfied}
                title={tooltipText}
                onClick={() => handleExecute(t)}
                className={`inline-flex items-center justify-between gap-2.5 px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-semibold transition-all select-none ${getButtonStyles(
                  t,
                  isSatisfied
                )}`}
              >
                <div className="flex items-center gap-2">
                  {getActionIcon(t)}
                  <span>{t.actionName}</span>
                </div>

                <span
                  className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    isSatisfied ? "bg-black/15 text-white/90" : "bg-slate-200 text-slate-500"
                  }`}
                >
                  ➔ {t.toStatus.name}
                </span>
              </button>

              {/* Explanatory Warning if Guards are missing */}
              {!isSatisfied && missingReasons.length > 0 && (
                <div
                  className="flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200/80 rounded-lg px-2 py-1 max-w-xs"
                  title={tooltipText}
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                  <span className="truncate">{missingReasons[0]}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Comment / Confirmation Dialog when special action is triggered */}
      {promptTransition && (
        <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/70 space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
              <MessageSquare className="w-4 h-4 text-blue-600" />
              Rückmeldung für &quot;{promptTransition.actionName}&quot; (➔ {promptTransition.toStatus.name})
            </h4>
            <button
              type="button"
              onClick={() => setPromptTransition(null)}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Abbrechen
            </button>
          </div>

          <div>
            <textarea
              rows={2}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="z.B. Reparatur erfolgreich abgeschlossen, Schmierstoffe erneuert, Probelauf 15 Min i.O..."
              className="w-full bg-white border border-blue-200 rounded-lg p-2.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPromptTransition(null)}
              className="text-xs border-slate-300"
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              disabled={isPending}
              size="sm"
              onClick={() => handleExecute(promptTransition)}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              {isPending ? "Speichern..." : `Statuswechsel bestätigen ➔ ${promptTransition.toStatus.name}`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
