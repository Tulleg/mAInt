import { localDb, LocalMutationOutboxItem, LocalMaintenanceOrder } from "./indexed-db";

export interface SyncState {
  isOnline: boolean;
  isSimulatedOffline: boolean;
  isSyncing: boolean;
  pendingMutationsCount: number;
  lastSyncAt: Date | null;
  lastSyncError: string | null;
}

type SyncStateListener = (state: SyncState) => void;

/**
 * Offline-First Sync Engine & Outbox Manager
 * 
 * Verwaltet den Offline-Zustand, sammelt Mutationen in der Dexie Outbox
 * und führt bei Wiederherstellung der Netzwerkverbindung eine chronologische,
 * idempotente Synchronisation mit dem Server und dem SAP-Modul durch.
 */
class SyncManager {
  private listeners: Set<SyncStateListener> = new Set();
  private state: SyncState = {
    isOnline: true,
    isSimulatedOffline: false,
    isSyncing: false,
    pendingMutationsCount: 0,
    lastSyncAt: null,
    lastSyncError: null,
  };

  private syncIntervalId: any = null;

  constructor() {
    if (typeof window !== "undefined") {
      const storedSimulated = window.sessionStorage?.getItem("maintai_simulated_offline") === "true";
      const actualOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

      this.state.isSimulatedOffline = storedSimulated;
      this.state.isOnline = storedSimulated ? false : actualOnline;

      this.initNetworkListeners();
      this.refreshPendingCount();

      // Periodischer Sync-Check alle 15 Sekunden
      this.syncIntervalId = setInterval(() => {
        if (this.state.isOnline && !this.state.isSyncing) {
          this.flushOutbox();
        }
      }, 15000);
    }
  }

  private initNetworkListeners() {
    window.addEventListener("online", () => {
      if (!this.state.isSimulatedOffline) {
        this.updateState({ isOnline: true });
        this.flushOutbox();
      }
    });

    window.addEventListener("offline", () => {
      if (!this.state.isSimulatedOffline) {
        this.updateState({ isOnline: false });
      }
    });
  }

  /**
   * Aktiviert oder deaktiviert den simulierten Offline-Modus zum Testen
   * der Dexie Outbox und des Offline-Verhaltens.
   */
  public setSimulatedOffline(simulated: boolean): void {
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage?.setItem("maintai_simulated_offline", String(simulated));
      } catch {}
    }

    const actualOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
    const nextOnline = simulated ? false : actualOnline;

    this.updateState({
      isSimulatedOffline: simulated,
      isOnline: nextOnline,
      lastSyncError: null,
    });

    if (nextOnline) {
      this.flushOutbox();
    }
  }

  public toggleSimulatedOffline(): boolean {
    const next = !this.state.isSimulatedOffline;
    this.setSimulatedOffline(next);
    return next;
  }

  public get isOnline(): boolean {
    return this.state.isOnline;
  }

  public get isSimulated(): boolean {
    return this.state.isSimulatedOffline;
  }

  public subscribe(listener: SyncStateListener): () => void {
    this.listeners.add(listener);
    listener({ ...this.state });
    return () => this.listeners.delete(listener);
  }

  private updateState(partial: Partial<SyncState>) {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((listener) => listener({ ...this.state }));
  }

  public async refreshPendingCount(): Promise<number> {
    if (!localDb) return 0;
    try {
      const count = await localDb.mutationOutbox
        .where("status")
        .equals("PENDING")
        .count();
      this.updateState({ pendingMutationsCount: count });
      return count;
    } catch {
      return 0;
    }
  }

  /**
   * Reiht eine neue Benutzeraktion lokal in die IndexedDB Outbox ein
   * und aktualisiert optimistisch den lokalen IndexedDB-Cache.
   */
  public async enqueueMutation(mutation: {
    tenantId: string;
    userId: string;
    entityType: LocalMutationOutboxItem["entityType"];
    action: LocalMutationOutboxItem["action"];
    targetEntityId: string;
    payload: Record<string, any>;
  }): Promise<string> {
    if (!localDb) throw new Error("IndexedDB ist in dieser Umgebung nicht verfügbar.");

    const clientMutationId = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `mut-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const outboxItem: LocalMutationOutboxItem = {
      clientMutationId,
      tenantId: mutation.tenantId,
      userId: mutation.userId,
      entityType: mutation.entityType,
      action: mutation.action,
      targetEntityId: mutation.targetEntityId,
      payload: mutation.payload,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      status: "PENDING",
    };

    await localDb.mutationOutbox.add(outboxItem);
    await this.refreshPendingCount();

    // Falls online, sofortigen Sync versuchen
    if (this.state.isOnline) {
      this.flushOutbox();
    }

    return clientMutationId;
  }

  /**
   * Verarbeitet alle ausstehenden Outbox-Items chronologisch über den Server-Sync-Endpunkt
   */
  public async flushOutbox(): Promise<void> {
    if (!localDb || this.state.isSyncing || !this.state.isOnline) return;

    const pendingItems = await localDb.mutationOutbox
      .where("status")
      .equals("PENDING")
      .sortBy("id");

    if (pendingItems.length === 0) return;

    this.updateState({ isSyncing: true, lastSyncError: null });

    try {
      for (const item of pendingItems) {
        // Status auf PROCESSING setzen
        if (item.id) {
          await localDb.mutationOutbox.update(item.id, { status: "PROCESSING" });
        }

        try {
          const response = await fetch("/api/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item),
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || `Serverfehler ${response.status}`);
          }

          // Erfolgreich: Item aus Outbox entfernen
          if (item.id) {
            await localDb.mutationOutbox.delete(item.id);
          }
        } catch (itemErr: any) {
          // Retry Count hochzählen oder als FAILED markieren
          if (item.id) {
            await localDb.mutationOutbox.update(item.id, {
              status: item.retryCount >= 5 ? "FAILED" : "PENDING",
              retryCount: item.retryCount + 1,
              lastErrorMessage: String(itemErr.message || itemErr),
            });
          }
          throw itemErr; // Bricht die Schleife ab, damit Reihenfolge erhalten bleibt
        }
      }

      this.updateState({
        isSyncing: false,
        lastSyncAt: new Date(),
        lastSyncError: null,
      });
    } catch (err: any) {
      this.updateState({
        isSyncing: false,
        lastSyncError: err.message || "Netzwerkunterbrechung während des Syncs.",
      });
    } finally {
      await this.refreshPendingCount();
    }
  }

  /**
   * Lädt initiale Stammdaten vom Server in den lokalen Dexie-Speicher
   */
  public async pullServerData(tenantId: string): Promise<void> {
    if (!localDb || !this.state.isOnline) return;

    try {
      const res = await fetch(`/api/sync?tenantId=${tenantId}`);
      if (!res.ok) return;

      const data = await res.json();
      if (data.orders) await localDb.orders.bulkPut(data.orders);
      if (data.equipments) await localDb.equipments.bulkPut(data.equipments);
      if (data.templates) await localDb.templates.bulkPut(data.templates);
      if (data.spareParts) await localDb.spareParts.bulkPut(data.spareParts);

      this.updateState({ lastSyncAt: new Date() });
    } catch (e) {
      console.warn("Pulling server data failed:", e);
    }
  }
}

export const syncManager = typeof window !== "undefined" ? new SyncManager() : (null as any);
