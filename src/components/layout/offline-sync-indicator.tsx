"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import { syncManager, SyncState } from "@/lib/offline/sync-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Database,
  ArrowUpRight,
  Radio,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

/**
 * Schneller Toggle-Schalter für die Topbar zum Umschalten zwischen
 * Online und simuliertem Offline-Modus.
 */
export function SimulateOfflineToggle() {
  const [syncState, setSyncState] = useState<SyncState>({
    isOnline: true,
    isSimulatedOffline: false,
    isSyncing: false,
    pendingMutationsCount: 0,
    lastSyncAt: null,
    lastSyncError: null,
  });

  useEffect(() => {
    if (!syncManager) return;
    return syncManager.subscribe((state) => {
      setSyncState(state);
    });
  }, []);

  const handleToggle = () => {
    if (syncManager) {
      syncManager.toggleSimulatedOffline();
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      title={
        syncState.isSimulatedOffline
          ? "Simulierter Offline-Modus ist AKTIV. Klicken zum Wiederverbinden (Sync)."
          : "Offline-Betrieb simulieren (Puffert Störungen & Rückmeldungen in Dexie.js)"
      }
      className={`flex items-center gap-2 rounded-lg px-3 py-2 min-h-[44px] text-xs font-medium border transition-all ${
        syncState.isSimulatedOffline
          ? "border-amber-500/80 bg-amber-950/70 text-amber-200 ring-1 ring-amber-500/50"
          : "border-slate-800 bg-slate-900/80 text-slate-400 hover:text-white hover:border-slate-700"
      }`}
    >
      {syncState.isSimulatedOffline ? (
        <>
          <Radio className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
          <span className="font-semibold text-amber-300">Offline simuliert</span>
          <ToggleRight className="h-4 w-4 text-amber-400 ml-0.5" />
        </>
      ) : (
        <>
          <Wifi className="h-3.5 w-3.5 text-slate-400" />
          <span className="hidden sm:inline">Offline simulieren</span>
          <ToggleLeft className="h-4 w-4 text-slate-500 ml-0.5" />
        </>
      )}
    </button>
  );
}

export function OfflineSyncStatusIndicator() {
  const [syncState, setSyncState] = useState<SyncState>({
    isOnline: true,
    isSimulatedOffline: false,
    isSyncing: false,
    pendingMutationsCount: 0,
    lastSyncAt: null,
    lastSyncError: null,
  });

  const [showDrawer, setShowDrawer] = useState(false);

  useEffect(() => {
    if (!syncManager) return;
    const unsubscribe = syncManager.subscribe((state) => {
      setSyncState(state);
    });
    return () => unsubscribe();
  }, []);

  const handleManualSync = () => {
    if (syncManager) {
      syncManager.flushOutbox();
    }
  };

  const handleToggleSimulated = () => {
    if (syncManager) {
      syncManager.toggleSimulatedOffline();
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowDrawer(!showDrawer)}
        className={`flex items-center gap-2 rounded-full px-3 py-2 min-h-[44px] text-xs font-medium border transition-all ${
          !syncState.isOnline
            ? "border-amber-700/80 bg-amber-950/80 text-amber-200 animate-pulse"
            : syncState.isSyncing
            ? "border-cyan-700/80 bg-cyan-950/80 text-cyan-200"
            : syncState.pendingMutationsCount > 0
            ? "border-amber-600 bg-slate-900 text-amber-300"
            : "border-slate-800 bg-slate-900 text-slate-300 hover:text-white"
        }`}
      >
        {!syncState.isOnline ? (
          <>
            <WifiOff className="h-3.5 w-3.5 text-amber-400" />
            <span>
              {syncState.isSimulatedOffline ? "Offline (Simuliert)" : "Kein Netz"}
            </span>
          </>
        ) : syncState.isSyncing ? (
          <>
            <RefreshCw className="h-3.5 w-3.5 text-cyan-400 animate-spin" />
            <span>Synchronisiere...</span>
          </>
        ) : (
          <>
            <Wifi className="h-3.5 w-3.5 text-emerald-400" />
            <span>Online</span>
          </>
        )}

        {syncState.pendingMutationsCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-black">
            {syncState.pendingMutationsCount}
          </span>
        )}
      </button>

      {/* Detail-Popdown Drawer */}
      {showDrawer && (
        <div className="absolute right-0 top-9 z-50 w-80 rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-semibold text-white flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-cyan-400" />
              Dexie.js Offline Sync Engine
            </span>
            <Badge
              variant={syncState.isOnline ? "success" : "warning"}
              className="text-[10px]"
            >
              {syncState.isSimulatedOffline
                ? "Simuliert Offline"
                : syncState.isOnline
                ? "Netzwerk aktiv"
                : "Kein Netz"}
            </Badge>
          </div>

          <div className="space-y-2.5 py-3 text-xs">
            <div className="flex justify-between items-center text-slate-400">
              <span>Ausstehende Mutationen (Outbox):</span>
              <span className="font-mono font-bold text-white">
                {syncState.pendingMutationsCount}
              </span>
            </div>

            <div className="flex justify-between items-center text-slate-400">
              <span>Letzter erfolgreicher Sync:</span>
              <span className="font-mono text-slate-300">
                {syncState.lastSyncAt
                  ? syncState.lastSyncAt.toLocaleTimeString("de-DE", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })
                  : "Noch nicht"}
              </span>
            </div>

            {/* Offline Simulator Switch Row */}
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-slate-300">
              <div className="flex flex-col">
                <span className="font-medium text-white text-[11px]">Offline-Simulation:</span>
                <span className="text-[10px] text-slate-400">Puffert Aktionen lokal</span>
              </div>
              <Button
                variant={syncState.isSimulatedOffline ? "default" : "outline"}
                size="sm"
                onClick={handleToggleSimulated}
                className={`text-xs h-7 px-2.5 gap-1 ${
                  syncState.isSimulatedOffline
                    ? "bg-amber-600 hover:bg-amber-500 text-white"
                    : "border-slate-700 text-slate-300"
                }`}
              >
                {syncState.isSimulatedOffline ? (
                  <>
                    <ToggleRight className="h-3.5 w-3.5" />
                    <span>Aktiviert</span>
                  </>
                ) : (
                  <>
                    <ToggleLeft className="h-3.5 w-3.5" />
                    <span>Deaktiviert</span>
                  </>
                )}
              </Button>
            </div>

            {syncState.lastSyncError && (
              <div className="rounded bg-red-950/50 border border-red-900 p-2 text-[11px] text-red-300 flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-400" />
                <span>{syncState.lastSyncError}</span>
              </div>
            )}
          </div>

          <div className="border-t border-slate-800 pt-3 flex gap-2">
            <Button
              size="sm"
              disabled={syncState.isSyncing || !syncState.isOnline}
              onClick={handleManualSync}
              className="w-full text-xs h-7 bg-cyan-600 hover:bg-blue-700 text-white gap-1"
            >
              <RefreshCw className={`h-3 w-3 ${syncState.isSyncing ? "animate-spin" : ""}`} />
              Jetzt abgleichen
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDrawer(false)}
              className="text-xs h-7 border-slate-700"
            >
              Schließen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
