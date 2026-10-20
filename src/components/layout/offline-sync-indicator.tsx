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
} from "lucide-react";

export function OfflineSyncStatusIndicator() {
  const [syncState, setSyncState] = useState<SyncState>({
    isOnline: true,
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

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowDrawer(!showDrawer)}
        className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium border transition-all ${
          !syncState.isOnline
            ? "border-amber-700/80 bg-amber-950/80 text-amber-200 animate-pulse"
            : syncState.isSyncing
            ? "border-blue-700/80 bg-blue-950/80 text-blue-200"
            : syncState.pendingMutationsCount > 0
            ? "border-amber-600 bg-neutral-900 text-amber-300"
            : "border-neutral-800 bg-neutral-900 text-neutral-300 hover:text-white"
        }`}
      >
        {!syncState.isOnline ? (
          <>
            <WifiOff className="h-3.5 w-3.5 text-amber-400" />
            <span>Offline-Modus</span>
          </>
        ) : syncState.isSyncing ? (
          <>
            <RefreshCw className="h-3.5 w-3.5 text-blue-400 animate-spin" />
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
        <div className="absolute right-0 top-9 z-50 w-72 rounded-xl border border-neutral-700 bg-neutral-900 p-4 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
            <span className="text-xs font-semibold text-white flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-blue-400" />
              Lokaler Dexie.js Cache
            </span>
            <Badge
              variant={syncState.isOnline ? "success" : "warning"}
              className="text-[10px]"
            >
              {syncState.isOnline ? "Netzwerk aktiv" : "Kein Netz"}
            </Badge>
          </div>

          <div className="space-y-2.5 py-3 text-xs">
            <div className="flex justify-between items-center text-neutral-400">
              <span>Ausstehende Mutationen (Outbox):</span>
              <span className="font-mono font-bold text-white">
                {syncState.pendingMutationsCount}
              </span>
            </div>

            <div className="flex justify-between items-center text-neutral-400">
              <span>Letzter Sync:</span>
              <span className="font-mono text-neutral-300">
                {syncState.lastSyncAt
                  ? syncState.lastSyncAt.toLocaleTimeString("de-DE", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })
                  : "Noch nicht"}
              </span>
            </div>

            {syncState.lastSyncError && (
              <div className="rounded bg-red-950/50 border border-red-900 p-2 text-[11px] text-red-300 flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-red-400" />
                <span>{syncState.lastSyncError}</span>
              </div>
            )}
          </div>

          <div className="border-t border-neutral-800 pt-3 flex gap-2">
            <Button
              size="sm"
              disabled={syncState.isSyncing || !syncState.isOnline}
              onClick={handleManualSync}
              className="w-full text-xs h-7 bg-blue-600 hover:bg-blue-700 text-white gap-1"
            >
              <RefreshCw className={`h-3 w-3 ${syncState.isSyncing ? "animate-spin" : ""}`} />
              Jetzt abgleichen
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDrawer(false)}
              className="text-xs h-7 border-neutral-700"
            >
              Schließen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
