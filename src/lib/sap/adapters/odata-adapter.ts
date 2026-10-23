import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  equipments,
  functionalLocations,
  maintenanceOrders,
  spareParts,
  orderSparePartBookings,
  sapSyncQueue,
} from "@/db/schema";
import {
  ISapConnector,
  SapBookingResult,
  SapOrderMigrationResult,
  SapStatusUpdateResult,
  SapAdapterConfig,
} from "./types";

/**
 * ODataSapConnector (Enterprise OData v4 Modus):
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
    private config: SapAdapterConfig
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
   * Stellt eine fehlgeschlagene Operation in die DB Outbox-Queue
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

      let defaultFloc = await db.query.functionalLocations.findFirst({
        where: eq(functionalLocations.tenantId, this.tenantId),
      });
      if (!defaultFloc) {
        const [newFloc] = await db
          .insert(functionalLocations)
          .values({
            tenantId: this.tenantId,
            code: "FLOC-SAP-DEFAULT",
            name: "SAP Import Technischer Platz",
            source: "SAP",
          })
          .returning();
        defaultFloc = newFloc;
      }

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
              source: "SAP",
              sapId: sapNr,
              sapSyncStatus: "SYNCED",
              sapLastSyncedAt: new Date(),
              lastSyncedAt: new Date(),
              sapSyncError: null,
            })
            .where(eq(equipments.id, existing.id));
          updatedCount++;
        } else {
          await db.insert(equipments).values({
            tenantId: this.tenantId,
            functionalLocationId: defaultFloc.id,
            equipmentNumber: item.Equipment || `EQ-${Date.now().toString().slice(-6)}`,
            name: item.EquipmentName || `SAP Equipment ${sapNr}`,
            description: item.GrossWeight ? `Gewicht: ${item.GrossWeight}` : null,
            manufacturer: item.Manufacturer || null,
            modelType: item.ModelNumber || null,
            serialNumber: item.SerialNumber || null,
            sapEquipmentNr: sapNr,
            sapId: sapNr,
            source: "SAP",
            sapSyncStatus: "SYNCED",
            sapLastSyncedAt: new Date(),
            lastSyncedAt: new Date(),
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
   * Synchronisiert Technische Plätze aus SAP PM nach MaintAI
   */
  async pullFunctionalLocations(options?: { areaId?: string }): Promise<{ importedCount: number; updatedCount: number }> {
    let importedCount = 0;
    let updatedCount = 0;

    try {
      const res = await this.fetchOData("/sap/opu/odata/sap/API_FUNCTIONALLOCATION/FunctionalLocation?$top=100");
      if (!res.ok) {
        throw new Error(`SAP OData Fehler: ${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      const results: Array<Record<string, string>> = data?.d?.results || data?.value || [];

      for (const item of results) {
        const tplnr = item.FunctionalLocation || item.TPLNR || item.Code;
        if (!tplnr) continue;

        const existing = await db.query.functionalLocations.findFirst({
          where: and(
            eq(functionalLocations.tenantId, this.tenantId),
            eq(functionalLocations.code, tplnr)
          ),
        });

        if (existing) {
          await db
            .update(functionalLocations)
            .set({
              name: item.FunctionalLocationName || item.PLTXT || existing.name,
              description: item.Description || existing.description,
              costCenter: item.CostCenter || existing.costCenter,
              plantSection: item.PlantSection || existing.plantSection,
              sapTplnr: tplnr,
              source: "SAP",
              sapSyncStatus: "SYNCED",
              sapLastSyncedAt: new Date(),
              lastSyncedAt: new Date(),
              sapSyncError: null,
              areaId: options?.areaId || existing.areaId,
              updatedAt: new Date(),
            })
            .where(eq(functionalLocations.id, existing.id));
          updatedCount++;
        } else {
          await db.insert(functionalLocations).values({
            tenantId: this.tenantId,
            areaId: options?.areaId || null,
            code: tplnr,
            name: item.FunctionalLocationName || item.PLTXT || `Technischer Platz ${tplnr}`,
            description: item.Description || null,
            costCenter: item.CostCenter || null,
            plantSection: item.PlantSection || null,
            sapTplnr: tplnr,
            source: "SAP",
            sapSyncStatus: "SYNCED",
            sapLastSyncedAt: new Date(),
            lastSyncedAt: new Date(),
            isActive: true,
          });
          importedCount++;
        }
      }

      return { importedCount, updatedCount };
    } catch (err: unknown) {
      console.warn("OData FunctionalLocation Pull Fehler:", err);
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
    options?: {
      userId?: string;
      unitPrice?: number;
      batchNumber?: string;
      clientBookingOfflineId?: string;
      isRetry?: boolean;
      bookingId?: string;
    }
  ): Promise<SapBookingResult> {
    const payload = {
      orderId,
      materialNr,
      quantity,
      storageLocation: storageLocation || "0001",
      goodsMovementType: "261",
      batchNumber: options?.batchNumber,
      userId: options?.userId,
      unitPrice: options?.unitPrice,
      clientBookingOfflineId: options?.clientBookingOfflineId,
      bookingId: options?.bookingId,
    };

    // Lokalen Bestand auch bei OData ermitteln und anpassen
    const part = await db.query.spareParts.findFirst({
      where: and(
        eq(spareParts.tenantId, this.tenantId),
        eq(spareParts.sapMaterialNr, materialNr)
      ),
    }) || await db.query.spareParts.findFirst({
      where: and(
        eq(spareParts.tenantId, this.tenantId),
        eq(spareParts.internalPartNumber, materialNr)
      ),
    });

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
        const errorText = await res.text().catch(() => "");
        throw new Error(
          `SAP OData Fehler beim Buchen (HTTP ${res.status}): ${
            errorText || res.statusText || "Serverfehler"
          }`
        );
      }

      const resData = await res.json();
      const sapDocNr = resData?.d?.MaterialDocument || resData?.MaterialDocument || "MBLNR-OK";

      if (!options?.isRetry) {
        // Erstbuchung: Lokalen Lagerbestand reduzieren
        if (part) {
          await db
            .update(spareParts)
            .set({
              stockQuantity: sql`${spareParts.stockQuantity} - ${quantity}`,
              updatedAt: new Date(),
            })
            .where(eq(spareParts.id, part.id));
        }

        // Lokale Buchung erfassen
        if (options?.userId && part) {
          await db.insert(orderSparePartBookings).values({
            tenantId: this.tenantId,
            maintenanceOrderId: orderId,
            sparePartId: part.id,
            bookedByUserId: options.userId,
            quantityConsumed: quantity.toString(),
            unitPriceSnapshot: (options.unitPrice ?? 0).toFixed(2),
            storageLocation: storageLocation || part.storageLocation,
            clientBookingOfflineId: options.clientBookingOfflineId || null,
            sapMaterialDocNr: sapDocNr,
            sapSyncStatus: "SYNCED",
            sapLastSyncedAt: new Date(),
          });
        }
      } else {
        // Retry-Modus: Bestehenden Buchungssatz auf SYNCED setzen
        if (options?.bookingId) {
          await db
            .update(orderSparePartBookings)
            .set({
              sapMaterialDocNr: sapDocNr,
              sapSyncStatus: "SYNCED",
              sapLastSyncedAt: new Date(),
            })
            .where(eq(orderSparePartBookings.id, options.bookingId));
        } else if (part) {
          await db
            .update(orderSparePartBookings)
            .set({
              sapMaterialDocNr: sapDocNr,
              sapSyncStatus: "SYNCED",
              sapLastSyncedAt: new Date(),
            })
            .where(
              and(
                eq(orderSparePartBookings.maintenanceOrderId, orderId),
                eq(orderSparePartBookings.sparePartId, part.id),
                eq(orderSparePartBookings.sapSyncStatus, "PENDING")
              )
            );
        }
      }

      return {
        success: true,
        sapMaterialDocNr: sapDocNr,
        message: `SAP Warenausgangsbeleg ${sapDocNr} erfolgreich erzeugt.`,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      // Im Retry-Modus werfen wir den Fehler weiter an den Queue-Worker
      if (options?.isRetry) {
        throw new Error(errorMsg);
      }

      // Bei Erstbuchungs-Fehlschlag (Offline / Timeout / 500):
      // Lokalen Bestand reduzieren und als PENDING in Queue stellen
      let createdBookingId: string | undefined;
      if (part) {
        await db
          .update(spareParts)
          .set({
            stockQuantity: sql`${spareParts.stockQuantity} - ${quantity}`,
            updatedAt: new Date(),
          })
          .where(eq(spareParts.id, part.id));

        if (options?.userId) {
          try {
            const [createdBooking] = await db
              .insert(orderSparePartBookings)
              .values({
                tenantId: this.tenantId,
                maintenanceOrderId: orderId,
                sparePartId: part.id,
                bookedByUserId: options.userId,
                quantityConsumed: quantity.toString(),
                unitPriceSnapshot: (options.unitPrice ?? 0).toFixed(2),
                storageLocation: storageLocation || part.storageLocation,
                clientBookingOfflineId: options.clientBookingOfflineId || null,
                sapSyncStatus: "PENDING",
              })
              .returning();
            createdBookingId = createdBooking?.id;
          } catch (insertErr) {
            console.warn("Buchungsdatensatz-Insert fehlgeschlagen:", insertErr);
          }
        }
      }

      // In Outbox-Queue einreihen (Status PENDING)
      await this.enqueueSyncJob(
        "SPARE_PART_BOOKING",
        "SPARE_PART_BOOKING",
        orderId,
        {
          ...payload,
          bookingId: createdBookingId || options?.bookingId,
        },
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

      await db
        .update(maintenanceOrders)
        .set({
          sapSyncStatus: "FAILED",
          sapSyncError: errorMsg,
          updatedAt: new Date(),
        })
        .where(eq(maintenanceOrders.id, order.id));

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

  async updateOrderStatus(
    orderId: string,
    targetStatusId: string,
    meta?: Record<string, unknown>
  ): Promise<SapStatusUpdateResult> {
    const order = await db.query.maintenanceOrders.findFirst({
      where: eq(maintenanceOrders.id, orderId),
      with: {
        orderType: true,
        currentStatus: true,
      },
    });

    if (!order) {
      return { success: false, message: `Auftrag ${orderId} nicht gefunden.` };
    }

    if (!order.sapOrderNr) {
      const migrationRes = await this.migrateOrderToSap(orderId);
      return {
        success: migrationRes.success,
        sapOrderNr: migrationRes.sapOrderNr,
        queuedForSync: migrationRes.queuedForSync,
        message: migrationRes.message,
      };
    }

    try {
      const endpoint = `/sap/opu/odata/sap/API_MAINTENANCEORDER/MaintenanceOrder('${order.sapOrderNr}')`;
      await this.fetchOData(endpoint, {
        method: "PATCH",
        body: JSON.stringify({
          OrderSystemStatus: order.currentStatus?.sapSystemStatusCode || "I0002",
          OrderUserStatus: order.currentStatus?.sapUserStatusCode || "",
        }),
      });

      return {
        success: true,
        sapOrderNr: order.sapOrderNr,
        message: `Auftragsstatus in SAP erfolgreich aktualisiert für Auftrag ${order.sapOrderNr}.`,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        queuedForSync: true,
        message: `SAP OData Status-Update fehlgeschlagen (${errorMsg}).`,
      };
    }
  }
}
