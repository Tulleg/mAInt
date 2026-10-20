import { eq, and, sql } from "drizzle-orm";
import { db } from "../db";
import {
  tenants,
  equipments,
  maintenanceOrders,
  spareParts,
  orderSparePartBookings,
  sapSyncQueue,
  assetStatusEnum,
  assetCriticalityEnum,
} from "../db/schema";

export interface SapEquipmentDto {
  sapEquipmentNr: string;
  name: string;
  description?: string;
  manufacturer?: string;
  modelType?: string;
  serialNumber?: string;
  costCenter?: string;
  plantCode?: string;
  sapTplnr?: string;
}

export interface SapBookingResult {
  success: boolean;
  sapMaterialDocNr?: string;
  sapReservationNr?: string;
  queuedForSync?: boolean;
  message: string;
}

export interface SapOrderMigrationResult {
  success: boolean;
  sapOrderNr?: string;
  queuedForSync?: boolean;
  message: string;
}

/**
 * Entkoppeltes SAP Adapter-Pattern:
 * Erlaubt den nahtlosen Betrieb im Standalone-Modus (ohne SAP-Anbindung)
 * oder im Enterprise-Modus über OData v4 / BAPI / SAP PM Middleware.
 */
export interface ISapConnector {
  pullEquipments(): Promise<{ importedCount: number; updatedCount: number }>;
  bookSparePartConsumption(
    orderId: string,
    materialNr: string,
    quantity: number,
    storageLocation?: string,
    options?: { userId?: string; unitPrice?: number; batchNumber?: string }
  ): Promise<SapBookingResult>;
  migrateOrderToSap(orderId: string): Promise<SapOrderMigrationResult>;
}

/**
 * 1. NoOpSapConnector:
 * Wird verwendet, wenn SAP für den Mandanten deaktiviert ist (Standalone-Modus).
 * Führt Materialbuchungen rein im lokalen Datenstamm durch und mockt SAP-Nummern.
 */
export class NoOpSapConnector implements ISapConnector {
  constructor(private tenantId: string) {}

  async pullEquipments(): Promise<{ importedCount: number; updatedCount: number }> {
    // Standalone: Keine externe SAP-Schnittstelle konfiguriert
    return { importedCount: 0, updatedCount: 0 };
  }

  async bookSparePartConsumption(
    orderId: string,
    materialNr: string,
    quantity: number,
    storageLocation?: string,
    options?: { userId?: string; unitPrice?: number; batchNumber?: string }
  ): Promise<SapBookingResult> {
    const part = await db.query.spareParts.findFirst({
      where: and(
        eq(spareParts.tenantId, this.tenantId),
        eq(spareParts.sapMaterialNr, materialNr)
      ),
    });

    if (!part) {
      return {
        success: false,
        message: `Ersatzteil mit SAP-Material-Nr '${materialNr}' nicht im lokalen Stamm gefunden.`,
      };
    }

    // Lokalen Lagerbestand reduzieren
    await db
      .update(spareParts)
      .set({
        stockQuantity: sql`${spareParts.stockQuantity} - ${quantity}`,
        updatedAt: new Date(),
      })
      .where(eq(spareParts.id, part.id));

    // Buchungssatz anlegen
    if (options?.userId) {
      await db.insert(orderSparePartBookings).values({
        tenantId: this.tenantId,
        maintenanceOrderId: orderId,
        sparePartId: part.id,
        bookedByUserId: options.userId,
        quantityConsumed: quantity.toString(),
        unitPriceSnapshot: (options.unitPrice ?? 0).toFixed(2),
        batchNumber: options.batchNumber || null,
        storageLocation: storageLocation || part.storageLocation || null,
        sapSyncStatus: "NOT_APPLICABLE",
      });
    }

    return {
      success: true,
      message: "Ersatzteil im Standalone-Modus lokal gebucht (kein SAP-Sync nötig).",
    };
  }

  async migrateOrderToSap(orderId: string): Promise<SapOrderMigrationResult> {
    // Im Standalone-Modus wird der Auftrag als nicht SAP-relevant markiert
    await db
      .update(maintenanceOrders)
      .set({
        sapSyncStatus: "NOT_APPLICABLE",
        updatedAt: new Date(),
      })
      .where(eq(maintenanceOrders.id, orderId));

    return {
      success: true,
      message: "Auftrag im Standalone-Modus gepflegt.",
    };
  }
}

/**
 * 2. ODataSapConnector:
 * Vollständige Anbindung an SAP S/4HANA oder ECC über OData Services
 * (z. B. API_MAINTENANCEORDER, API_EQUIPMENT, API_MATERIAL_DOCUMENT).
 * 
 * Beinhaltet automatisches Failover in die `sap_sync_queue`, wenn die Netzwerkverbindung
 * fehlschlägt oder der Client offline ist.
 */
export class ODataSapConnector implements ISapConnector {
  private baseUrl: string;
  private clientCode: string;

  constructor(
    private tenantId: string,
    private config: {
      baseUrl?: string;
      sapClient?: string;
      systemId?: string;
    }
  ) {
    this.baseUrl = config.baseUrl || process.env.SAP_ODATA_BASE_URL || "";
    this.clientCode = config.sapClient || process.env.SAP_CLIENT || "100";
  }

  private async fetchOData(endpoint: string, options: RequestInit = {}): Promise<Response> {
    if (!this.baseUrl) {
      throw new Error("SAP OData Base-URL ist für diesen Mandanten nicht konfiguriert.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8s Timeout

    try {
      const url = `${this.baseUrl}${endpoint}${endpoint.includes("?") ? "&" : "?"}sap-client=${this.clientCode}`;
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(
            `${process.env.SAP_USERNAME || ""}:${process.env.SAP_PASSWORD || ""}`
          ).toString("base64")}`,
          ...(options.headers || {}),
        },
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Stellt eine fehlgeschlagene Operation in die zuverlässige DB Outbox-Queue
   */
  private async enqueueSyncJob(
    operation: "EQUIPMENT_PULL" | "SPARE_PART_BOOKING" | "ORDER_MIGRATE" | "ORDER_STATUS_UPDATE",
    entityType: "ORDER" | "SPARE_PART_BOOKING" | "EQUIPMENT",
    entityId: string | undefined,
    payload: Record<string, unknown>,
    errorMessage: string
  ): Promise<void> {
    await db.insert(sapSyncQueue).values({
      tenantId: this.tenantId,
      operation,
      entityType,
      entityId: entityId || null,
      payload,
      status: "PENDING",
      errorMessage,
      retryCount: 0,
      scheduledAt: new Date(),
    });
  }

  /**
   * Synchronisiert Equipments aus SAP PM nach MaintAI
   */
  async pullEquipments(): Promise<{ importedCount: number; updatedCount: number }> {
    let importedCount = 0;
    let updatedCount = 0;

    try {
      const res = await this.fetchOData("/sap/opu/odata/sap/API_EQUIPMENT/Equipment?$top=100");
      if (!res.ok) {
        throw new Error(`SAP OData Fehler: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      const results: Array<Record<string, string>> = data?.d?.results || data?.value || [];

      for (const item of results) {
        const sapNr = item.Equipment || item.EquipmentNumber;
        if (!sapNr) continue;

        const existing = await db.query.equipments.findFirst({
          where: and(
            eq(equipments.tenantId, this.tenantId),
            eq(equipments.sapEquipmentNr, sapNr)
          ),
        });

        if (existing) {
          await db
            .update(equipments)
            .set({
              name: item.EquipmentName || existing.name,
              manufacturer: item.Manufacturer || existing.manufacturer,
              modelType: item.ModelNumber || existing.modelType,
              serialNumber: item.SerialNumber || existing.serialNumber,
              sapSyncStatus: "SYNCED",
              sapLastSyncedAt: new Date(),
              sapSyncError: null,
            })
            .where(eq(equipments.id, existing.id));
          updatedCount++;
        } else {
          await db.insert(equipments).values({
            tenantId: this.tenantId,
            equipmentNumber: item.Equipment || `EQ-${Date.now().toString().slice(-6)}`,
            name: item.EquipmentName || `SAP Equipment ${sapNr}`,
            description: item.GrossWeight ? `Gewicht: ${item.GrossWeight}` : null,
            manufacturer: item.Manufacturer || null,
            modelType: item.ModelNumber || null,
            serialNumber: item.SerialNumber || null,
            sapEquipmentNr: sapNr,
            sapSyncStatus: "SYNCED",
            sapLastSyncedAt: new Date(),
            criticality: "B",
            status: "ACTIVE",
          });
          importedCount++;
        }
      }

      return { importedCount, updatedCount };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await this.enqueueSyncJob(
        "EQUIPMENT_PULL",
        "EQUIPMENT",
        undefined,
        {},
        errorMsg
      );
      return { importedCount: 0, updatedCount: 0 };
    }
  }

  /**
   * Bucht Warenausgang zu Instandhaltungsauftrag (Bewegungsart 261)
   */
  async bookSparePartConsumption(
    orderId: string,
    materialNr: string,
    quantity: number,
    storageLocation?: string,
    options?: { userId?: string; unitPrice?: number; batchNumber?: string }
  ): Promise<SapBookingResult> {
    const payload = {
      orderId,
      materialNr,
      quantity,
      storageLocation: storageLocation || "0001",
      batchNumber: options?.batchNumber,
      userId: options?.userId,
      unitPrice: options?.unitPrice,
    };

    try {
      const res = await this.fetchOData(
        "/sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV/A_MaterialDocumentHeader",
        {
          method: "POST",
          body: JSON.stringify({
            GoodsMovementCode: "03", // Warenausgang zum Auftrag
            PostingDate: new Date().toISOString().slice(0, 10),
            to_MaterialDocumentItem: {
              results: [
                {
                  Material: materialNr,
                  Plant: "1000",
                  StorageLocation: storageLocation || "0001",
                  GoodsMovementType: "261",
                  EntryUnit: "ST",
                  QuantityInEntryUnit: quantity.toString(),
                  Batch: options?.batchNumber || "",
                },
              ],
            },
          }),
        }
      );

      if (!res.ok) {
        throw new Error(`SAP OData Fehler beim Buchen: ${res.statusText}`);
      }

      const resData = await res.json();
      const sapDocNr = resData?.d?.MaterialDocument || resData?.MaterialDocument || "MBLNR-OK";

      // Lokale Buchung aktualisieren
      if (options?.userId) {
        const part = await db.query.spareParts.findFirst({
          where: and(
            eq(spareParts.tenantId, this.tenantId),
            eq(spareParts.sapMaterialNr, materialNr)
          ),
        });

        if (part) {
          await db.insert(orderSparePartBookings).values({
            tenantId: this.tenantId,
            maintenanceOrderId: orderId,
            sparePartId: part.id,
            bookedByUserId: options.userId,
            quantityConsumed: quantity.toString(),
            unitPriceSnapshot: (options.unitPrice ?? 0).toFixed(2),
            storageLocation: storageLocation || part.storageLocation,
            sapMaterialDocNr: sapDocNr,
            sapSyncStatus: "SYNCED",
            sapLastSyncedAt: new Date(),
          });
        }
      }

      return {
        success: true,
        sapMaterialDocNr: sapDocNr,
        message: `SAP Warenausgangsbeleg ${sapDocNr} erfolgreich erzeugt.`,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      // In Queue einreihen bei Verbindungsabbruch oder Ausfall
      await this.enqueueSyncJob(
        "SPARE_PART_BOOKING",
        "SPARE_PART_BOOKING",
        orderId,
        payload,
        errorMsg
      );

      return {
        success: false,
        queuedForSync: true,
        message: `SAP nicht erreichbar. Buchung in die 'sap_sync_queue' eingereiht (${errorMsg}).`,
      };
    }
  }

  /**
   * Überträgt oder aktualisiert einen Instandhaltungsauftrag in SAP PM (BAPI_ALM_ORDER_MAINTAIN)
   */
  async migrateOrderToSap(orderId: string): Promise<SapOrderMigrationResult> {
    const order = await db.query.maintenanceOrders.findFirst({
      where: eq(maintenanceOrders.id, orderId),
      with: {
        orderType: true,
        currentStatus: true,
        equipment: true,
      },
    });

    if (!order) {
      return { success: false, message: `Auftrag ${orderId} nicht gefunden.` };
    }

    const payload = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderType: order.orderType.sapOrderTypeCode || "PM01",
      equipmentSapNr: order.equipment?.sapEquipmentNr,
      title: order.title,
      description: order.description,
      statusCategory: order.currentStatus.category,
    };

    try {
      // Wenn bereits eine SAP-Auftragsnummer existiert, aktualisiere den Status (z.B. TABG / Freigabe)
      const endpoint = order.sapOrderNr
        ? `/sap/opu/odata/sap/API_MAINTENANCEORDER/MaintenanceOrder('${order.sapOrderNr}')`
        : `/sap/opu/odata/sap/API_MAINTENANCEORDER/MaintenanceOrder`;

      const method = order.sapOrderNr ? "PATCH" : "POST";

      const res = await this.fetchOData(endpoint, {
        method,
        body: JSON.stringify({
          OrderDescription: order.title,
          MaintenanceOrderType: order.orderType.sapOrderTypeCode || "PM01",
          Equipment: order.equipment?.sapEquipmentNr || "",
          LongText: `${order.description}\n\nUrsache: ${order.rootCauseDescription || "N/A"}`,
        }),
      });

      if (!res.ok) {
        throw new Error(`SAP OData Fehler: ${res.statusText}`);
      }

      const resData = await res.json();
      const sapOrderNr =
        order.sapOrderNr ||
        resData?.d?.MaintenanceOrder ||
        resData?.MaintenanceOrder ||
        `SAP-${Date.now().toString().slice(-8)}`;

      await db
        .update(maintenanceOrders)
        .set({
          sapOrderNr,
          sapSyncStatus: "SYNCED",
          sapLastSyncedAt: new Date(),
          sapSyncError: null,
          updatedAt: new Date(),
        })
        .where(eq(maintenanceOrders.id, order.id));

      return {
        success: true,
        sapOrderNr,
        message: `Auftrag erfolgreich mit SAP PM synchronisiert (AUFNR: ${sapOrderNr}).`,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      
      // Fehlerstatus am Auftrag setzen
      await db
        .update(maintenanceOrders)
        .set({
          sapSyncStatus: "FAILED",
          sapSyncError: errorMsg,
          updatedAt: new Date(),
        })
        .where(eq(maintenanceOrders.id, order.id));

      // Zuverlässig in Sync-Queue einreihen
      await this.enqueueSyncJob(
        "ORDER_MIGRATE",
        "ORDER",
        order.id,
        payload,
        errorMsg
      );

      return {
        success: false,
        queuedForSync: true,
        message: `SAP-Sync fehlgeschlagen. In Sync-Queue eingereiht (${errorMsg}).`,
      };
    }
  }
}

/**
 * Factory-Funktion zur Ermittlung des passenden SAP-Konnektors für den Mandanten.
 */
export async function getSapConnector(tenantId: string): Promise<ISapConnector> {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });

  if (!tenant || tenant.sapSyncMode === "STANDALONE") {
    return new NoOpSapConnector(tenantId);
  }

  return new ODataSapConnector(tenantId, tenant.sapConfig || {});
}
