"use client";

import React, { useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Layers,
  FileCheck,
  Calendar,
  CheckSquare,
  Sparkles,
  Sliders,
  ShieldCheck,
  PlusCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  MaintenancePlanBatchGrid,
  BatchPlanItemRow,
} from "@/components/maintenance-plans/batch-grid";
import { ProtocolBuilder } from "@/components/protocol-builder/protocol-builder";
import { InspectionTemplateSchema } from "@/db/schema";
import { saveInspectionTemplateAction } from "@/actions/maintenance-plan-actions";

interface MaintenanceHubProps {
  tenantId: string;
  roles: any[];
  templates: any[];
  equipments: any[];
  items: BatchPlanItemRow[];
  initialTemplateSchema?: InspectionTemplateSchema;
}

export function MaintenanceHub({
  tenantId,
  roles,
  templates,
  equipments,
  items,
  initialTemplateSchema,
}: MaintenanceHubProps) {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "protocols" ? "protocols" : "batch";

  const [activeTab, setActiveTab] = useState<"batch" | "protocols">(initialTab);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header Bereich */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Layers className="h-7 w-7 text-cyan-500" />
            Wartungsmanagement & Digitale Protokolle
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Massenpflege zyklischer Wartungspläne über die TanStack-Batch-Tabelle sowie
            visueller Formular-Designer für Grenzwerte und Checklisten.
          </p>
        </div>

        {/* Tab-Umschalter */}
        <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab("batch")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "batch"
                ? "bg-cyan-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>Batch-Pflege ({items.length} Positionen)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("protocols")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === "protocols"
                ? "bg-cyan-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <FileCheck className="h-3.5 w-3.5" />
            <span>Protokoll-Vorlagen-Editor</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: BATCH-PFLEGE-TABELLE                                               */}
      {/* ========================================================================= */}
      {activeTab === "batch" && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2 text-slate-300">
              <CheckSquare className="h-4 w-4 text-emerald-400" />
              <span>
                <strong>Multi-Select & Bulk-Aktionen:</strong> Wähle Zeilen per Checkbox aus, um Zyklusintervalle oder Rollen für alle markierten Positionen gleichzeitig zu ändern.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-slate-700 text-slate-300">
                Auto-Save aktiv
              </Badge>
            </div>
          </div>

          <MaintenancePlanBatchGrid
            initialItems={items}
            roles={roles}
            templates={templates}
            equipments={equipments}
          />
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: PROTOKOLL-VORLAGEN-EDITOR                                          */}
      {/* ========================================================================= */}
      {activeTab === "protocols" && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <div className="flex items-center gap-2 text-slate-300">
              <ShieldCheck className="h-4 w-4 text-cyan-400" />
              <span>
                <strong>JSON-Schema Form Designer:</strong> Definiere Prüfabschnitte, Toleranzbereiche (Min/Max), Pflichtfotos und automatische Folgestörungen bei Messwert-Verletzung.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-slate-700 bg-slate-900 text-slate-300">
                <Sparkles className="h-3.5 w-3.5 text-amber-400 mr-1" />
                Live Touch-Signatur Preview
              </Badge>
            </div>
          </div>

          <ProtocolBuilder
            initialSchema={initialTemplateSchema}
            onSave={async (schema) => {
              await saveInspectionTemplateAction({
                tenantId,
                code: "INSP-DEFAULT-01",
                name: "Standard Pumpen- & Antriebs-Inspektion",
                schemaJson: schema,
                estimatedDurationMinutes: 45,
              });
            }}
          />
        </div>
      )}
    </div>
  );
}
