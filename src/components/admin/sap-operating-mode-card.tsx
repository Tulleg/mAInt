"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Database,
  Server,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Save,
  Lock,
  Unlock,
  Layers,
  ArrowRight,
  Globe,
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateGlobalSapModeAction, SapSyncMode } from "@/actions/admin-sap-actions";
import { syncAssetsFromSapAction } from "@/actions/asset-actions";

interface SapOperatingModeCardProps {
  tenant: {
    id: string;
    code: string;
    name: string;
    sapPlantCode: string | null;
    sapSyncMode: string;
  };
}

const MODES: Array<{
  id: SapSyncMode;
  title: string;
  badge: string;
  description: string;
  lockStatus: string;
  badgeColor: string;
}> = [
  {
    id: "STANDALONE",
    title: "Lokal / Standalone (MaintAI Lead)",
    badge: "Freie Pflege",
    description:
      "Stammdaten (Bereiche, Technische Plätze, Equipments, Baugruppen) werden direkt in MaintAI angelegt und gepflegt. Keine externe SAP-Synchronisation.",
    lockStatus: "Stammdaten manuell bearbeitbar",
    badgeColor: "bg-emerald-950 text-emerald-300 border-emerald-800",
  },
  {
    id: "ODATA_V4",
    title: "SAP S/4HANA (Enterprise OData v4)",
    badge: "SAP PM Lead",
    description:
      "Stammdaten werden zentral über SAP PM geführt. Anlagenstruktur in MaintAI ist schreibgeschützt. Synchronisation über OData REST-APIs.",
    lockStatus: "Stammdaten schreibgeschützt (ERP Lead)",
    badgeColor: "bg-cyan-950 text-cyan-300 border-cyan-800",
  },
  {
    id: "RFC_BAPI",
    title: "SAP ECC / RFC-Gateway (BAPI)",
    badge: "BAPI Lead",
    description:
      "Zentrale Führung über SAP RFC/BAPI Bausteine (BAPI_EQUI_GETLIST, BAPI_GOODSMVT_CREATE). Anlagenstruktur schreibgeschützt.",
    lockStatus: "Stammdaten schreibgeschützt (ERP Lead)",
    badgeColor: "bg-indigo-950 text-indigo-300 border-indigo-800",
  },
];

export function SapOperatingModeCard({ tenant }: SapOperatingModeCardProps) {
  const router = useRouter();
  const [selectedMode, setSelectedMode] = useState<SapSyncMode>(
    (tenant?.sapSyncMode as SapSyncMode) || "STANDALONE"
  );
  const [plantCode, setPlantCode] = useState(tenant?.sapPlantCode || "1000");
  const [isPending, startTransition] = useTransition();
  const [isSyncing, setIsSyncing] = useState(false);

  const isSapMode = selectedMode !== "STANDALONE";
  const activeModeConfig = MODES.find((m) => m.id === selectedMode) || MODES[0];

  const handleSaveMode = () => {
    startTransition(async () => {
      const res = await updateGlobalSapModeAction({
        tenantId: tenant.id,
        mode: selectedMode,
        sapPlantCode: plantCode,
      });

      if (res.success) {
        toast.success(res.message || "Globaler Betriebsmodus erfolgreich aktualisiert.");
        router.refresh();
      } else {
        toast.error(res.error || "Fehler beim Aktualisieren des Betriebsmodus.");
      }
    });
  };

  const handleTriggerSync = () => {
    setIsSyncing(true);
    startTransition(async () => {
      try {
        const res = await syncAssetsFromSapAction(undefined, { tenantId: tenant.id });
        if (res.success) {
          toast.success(
            `SAP-Synchronisation erfolgreich: ${res.functionalLocations?.importedCount || 0} Plätze, ${
              res.equipments?.importedCount || 0
            } Equipments synchronisiert.`
          );
          router.refresh();
        } else {
          toast.error("SAP-Synchronisation fehlgeschlagen.");
        }
      } catch (err: any) {
        toast.error(err?.message || "Fehler bei der SAP-Synchronisation.");
      } finally {
        setIsSyncing(false);
      }
    });
  };

  return (
    <Card className="border-slate-800 bg-slate-900/60 shadow-lg">
      <CardHeader className="border-b border-slate-800/80 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-cyan-400" />
              <CardTitle className="text-lg text-white font-bold">
                Zentraler Betriebsmodus (Globale Einstellung)
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-400">
              Steuert mandantenweit, ob Stammdaten lokal in MaintAI gepflegt werden oder zentral über SAP PM geführt sind.
            </CardDescription>
          </div>

          <Badge className={`px-2.5 py-1 text-xs font-mono border ${activeModeConfig.badgeColor}`}>
            {isSapMode ? <Lock className="h-3 w-3 mr-1 inline" /> : <Unlock className="h-3 w-3 mr-1 inline" />}
            {selectedMode}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-6">
        {/* Modus-Auswahl Radio-Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {MODES.map((mode) => {
            const isSelected = selectedMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => setSelectedMode(mode.id)}
                className={`p-4 rounded-lg border text-left transition-all relative flex flex-col justify-between gap-3 ${
                  isSelected
                    ? "bg-cyan-950/40 border-blue-500 shadow-md ring-1 ring-blue-500/50"
                    : "bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/50"
                }`}
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white text-xs md:text-sm">{mode.title}</span>
                    <Badge variant="outline" className={`text-[10px] font-mono ${mode.badgeColor}`}>
                      {mode.badge}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{mode.description}</p>
                </div>

                <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 flex items-center gap-1">
                    {mode.id === "STANDALONE" ? (
                      <Unlock className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <Lock className="h-3 w-3 text-amber-400" />
                    )}
                    {mode.lockStatus}
                  </span>
                  {isSelected && <CheckCircle2 className="h-4 w-4 text-cyan-400 shrink-0" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Konfiguration SAP Werk & Erklärungs-Banner */}
        <div className="p-4 rounded-lg bg-slate-950/80 border border-slate-800 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1 flex-1">
              <Label htmlFor="sap-plant-code" className="text-xs text-slate-300 font-semibold">
                SAP Werkscode (WERKS)
              </Label>
              <p className="text-[11px] text-slate-500">
                Wird bei Buchungen (BAPI 261) und Auftragsrückmeldungen als Referenzwerk übergeben.
              </p>
            </div>
            <div className="w-full md:w-48">
              <Input
                id="sap-plant-code"
                value={plantCode}
                onChange={(e) => setPlantCode(e.target.value)}
                placeholder="z.B. 1000"
                className="h-8 text-xs font-mono bg-slate-900 border-slate-700 text-white"
              />
            </div>
          </div>

          <div
            className={`p-3 rounded text-xs flex items-start gap-2.5 ${
              isSapMode
                ? "bg-amber-950/30 border border-amber-800/50 text-amber-300"
                : "bg-emerald-950/30 border border-emerald-800/50 text-emerald-300"
            }`}
          >
            {isSapMode ? (
              <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
            )}
            <div className="space-y-0.5">
              <span className="font-semibold">
                {isSapMode
                  ? "Sicherheits-Guard aktiv (SAP PM Lead):"
                  : "Lokaler Modus aktiv (MaintAI Lead):"}
              </span>
              <p className="text-[11px] opacity-90 leading-relaxed">
                {isSapMode
                  ? "Alle manuellen Schreibaktionen auf Bereiche, Plätze, Equipments und Baugruppen werden strikt blockiert ('Stammdaten werden zentral über SAP PM geführt...'). Änderungen fließen über SAP-Synchronisation ein."
                  : "Administratoren dürfen Bereiche, Technische Plätze, Maschinen und Baugruppen frei anlegen, modifizieren und löschen. Datensätze mit source === 'SAP' bleiben weiterhin geschützt."}
              </p>
            </div>
          </div>
        </div>

        {/* Buttons: Speichern & Sync */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="text-xs text-slate-500">
            Mandant: <span className="text-white font-mono">{tenant?.name} ({tenant?.code})</span>
          </div>

          <div className="flex items-center gap-2">
            {isSapMode && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleTriggerSync}
                disabled={isSyncing}
                className="h-8 text-xs border-cyan-800/80 bg-cyan-950/40 hover:bg-cyan-900/60 text-blue-200 gap-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin text-cyan-400" : "text-cyan-400"}`} />
                <span>{isSyncing ? "Synchronisiere..." : "SAP-Sync ausführen"}</span>
              </Button>
            )}

            <Button
              type="button"
              size="sm"
              onClick={handleSaveMode}
              disabled={isPending}
              className="h-8 text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-semibold gap-1.5 shadow"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{isPending ? "Speichern..." : "Betriebsmodus global anwenden"}</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
