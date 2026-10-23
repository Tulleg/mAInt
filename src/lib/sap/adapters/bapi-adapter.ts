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
 * BapiSapConnector (RFC / BAPI Modus):
 * Ermöglicht die Anbindung über SAP RFC-Gateways oder Middleware
 * (Aufruf von BAPI_ALM_ORDER_MAINTAIN, BAPI_GOODSMVT_CREATE, BAPI_EQUI_GETLIST).
 */
export class BapiSapConnector implements ISapConnector {
  private rfcDestination: string;
  private middlewareUrl: string;

  constructor(
    private tenantId: string,
    private config: SapAdapterConfig
  ) {
    this.rfcDestination = config.rfcDestination || process.env.SAP_RFC_DEST || "NONE";
    this.middlewareUrl = config.middlewareUrl || config.baseUrl || process.env.SAP_MIDDLEWARE_URL || "";
  }

  private async callBapi(bapiName: string, parameters: Record<string, any>): Promise<any> {
    if (!this.middlewareUrl) {
      throw new Error(`RFC/BAPI Middleware URL ist nicht konfiguriert (BAPI: ${bapiName}).`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(`${this.middlewareUrl}/bapi/${bapiName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RFC-Destination": this.rfcDestination,
        },
        body: JSON.stringify(parameters),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        throw new Error(
          `BAPI Call '${bapiName}' fehlgeschlagen: HTTP ${response.status} ${
            response.statusText || ""
          } ${errorBody}`.trim()
        );
      }

      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async pullEquipments(): Promise<{ importedCount: number; updatedCount: number }> {
    try {
      const res = await this.callBapi("BAPI_EQUI_GETLIST", {
        MAX_ROWS: 100,
      });

      const list: Array<Record<string, string>> = res?.EQUIPMENT_LIST || [];
      let importedCount = 0;
      let updatedCount = 0;

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

      for (const item of list) {
        const sapNr = item.EQUIPMENT;
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
              name: item.DESCRIPT || existing.name,
              source: "SAP",
              sapId: sapNr,
              sapSyncStatus: "SYNCED",
              sapLastSyncedAt: new Date(),
              lastSyncedAt: new Date(),
            })
            .where(eq(equipments.id, existing.id));
          updatedCount++;
        } else {
          await db.insert(equipments).values({
            tenantId: this.tenantId,
            functionalLocationId: defaultFloc.id,
            equipmentNumber: item.EQUIPMENT || `EQ-${Date.now().toString().slice(-6)}`,
            name: item.DESCRIPT || `SAP Equipment ${sapNr}`,
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
    } catch (err: any) {
      console.warn("BAPI_EQUI_GETLIST Fehler:", err?.message);
      await db.insert(sapSyncQueue).values({
        tenantId: this.tenantId,
        operation: "EQUIPMENT_PULL",
        entityType: "EQUIPMENT",
        payload: { bapi: "BAPI_EQUI_GETLIST" },
        status: "PENDING",
        errorMessage: err?.message || String(err),
        retryCount: 0,
        scheduledAt: new Date(),
      });
      return { importedCount: 0, updatedCount: 0 };
    }
  }

  async pullFunctionalLocations(options?: { areaId?: string }): Promise<{ importedCount: number; updatedCount: number }> {
    try {
      const res = await this.callBapi("BAPI_FUNCLOC_GETLIST", {
        MAX_ROWS: 100,
      });

      const list: Array<Record<string, string>> = res?.FUNCLOC_LIST || [];
      let importedCount = 0;
      let updatedCount = 0;

      for (const item of list) {
        const sapTplnr = item.FUNCLOC || item.TPLNR;
        if (!sapTplnr) continue;

        const existing = await db.query.functionalLocations.findFirst({
          where: and(
            eq(functionalLocations.tenantId, this.tenantId),
            eq(functionalLocations.code, sapTplnr)
          ),
        });

        if (existing) {
          await db
            .update(functionalLocations)
            .set({
              name: item.DESCRIPT || existing.name,
              sapTplnr,
              source: "SAP",
              sapSyncStatus: "SYNCED",
              sapLastSyncedAt: new Date(),
              lastSyncedAt: new Date(),
              areaId: options?.areaId || existing.areaId,
              updatedAt: new Date(),
            })
            .where(eq(functionalLocations.id, existing.id));
          updatedCount++;
        } else {
          await db.insert(functionalLocations).values({
            tenantId: this.tenantId,
            areaId: options?.areaId || null,
            code: sapTplnr,
            name: item.DESCRIPT || `Technischer Platz ${sapTplnr}`,
            sapTplnr,
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
    } catch (err: any) {
      console.warn("BAPI_FUNCLOC_GETLIST Fehler:", err?.message);
      return { importedCount: 0, updatedCount: 0 };
    }
  }

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
      const bapiResult = await this.callBapi("BAPI_GOODSMVT_CREATE", {
        GOODSMVT_CODE: "03",
        GOODSMVT_HEADER: {
          PSTNG_DATE: new Date().toISOString().slice(0, 10),
          REF_DOC_NO: orderId,
        },
        GOODSMVT_ITEM: [
          {
            MATERIAL: materialNr,
            PLANT: "1000",
            STGE_LOC: storageLocation || "0001",
            MOVE_TYPE: "261",
            ENTRY_QNT: quantity,
            BATCH: options?.batchNumber || "",
          },
        ],
      });

      const docNr = bapiResult?.MATERIALDOCUMENT || "BAPI-MBLNR-OK";

      if (!options?.isRetry) {
        if (part) {
          await db
            .update(spareParts)
            .set({
              stockQuantity: sql`${spareParts.stockQuantity} - ${quantity}`,
              updatedAt: new Date(),
            })
            .where(eq(spareParts.id, part.id));
        }

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
            sapMaterialDocNr: docNr,
            sapSyncStatus: "SYNCED",
            sapLastSyncedAt: new Date(),
          });
        }
      } else {
        // Retry-Modus: Bestehenden Datensatz auf SYNCED setzen
        if (options?.bookingId) {
          await db
            .update(orderSparePartBookings)
            .set({
              sapMaterialDocNr: docNr,
              sapSyncStatus: "SYNCED",
              sapLastSyncedAt: new Date(),
            })
            .where(eq(orderSparePartBookings.id, options.bookingId));
        } else if (part) {
          await db
            .update(orderSparePartBookings)
            .set({
              sapMaterialDocNr: docNr,
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
        sapMaterialDocNr: docNr,
        message: `BAPI Warenausgang ${docNr} erfolgreich gebucht.`,
      };
    } catch (err: any) {
      const errorMsg = err?.message || String(err);

      // Im Retry-Modus werfen wir den Fehler weiter an den Queue-Worker
      if (options?.isRetry) {
        throw new Error(errorMsg);
      }

      // Bei Erstbuchungs-Fehlschlag (Offline / Timeout / 500):
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

      await db.insert(sapSyncQueue).values({
        tenantId: this.tenantId,
        operation: "SPARE_PART_BOOKING",
        entityType: "SPARE_PART_BOOKING",
        entityId: orderId,
        payload: {
          orderId,
          materialNr,
          quantity,
          storageLocation: storageLocation || "0001",
          goodsMovementType: "261",
          bapi: "BAPI_GOODSMVT_CREATE",
          batchNumber: options?.batchNumber,
          userId: options?.userId,
          unitPrice: options?.unitPrice,
          clientBookingOfflineId: options?.clientBookingOfflineId,
          bookingId: createdBookingId || options?.bookingId,
        },
        status: "PENDING",
        errorMessage: errorMsg,
        retryCount: 0,
        scheduledAt: new Date(),
      });

      return {
        success: false,
        queuedForSync: true,
        message: `BAPI nicht erreichbar. In 'sap_sync_queue' eingereiht (${errorMsg}).`,
      };
    }
  }

  async migrateOrderToSap(orderId: string): Promise<SapOrderMigrationResult> {
    const order = await db.query.maintenanceOrders.findFirst({
      where: eq(maintenanceOrders.id, orderId),
      with: {
        orderType: true,
        equipment: true,
      },
    });

    if (!order) {
      return { success: false, message: `Auftrag ${orderId} nicht gefunden.` };
    }

    try {
      const res = await this.callBapi("BAPI_ALM_ORDER_MAINTAIN", {
        ORDER_HEADER: {
          ORDERID: order.sapOrderNr || "",
          SHORT_TEXT: order.title,
          ORDER_TYPE: order.orderType.sapOrderTypeCode || "PM01",
          EQUIPMENT: order.equipment?.sapEquipmentNr || "",
        },
      });

      const sapOrderNr = res?.ORDER_NUMBER || order.sapOrderNr || `RFC-${Date.now().toString().slice(-8)}`;

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
        message: `Auftrag via BAPI_ALM_ORDER_MAINTAIN synchronisiert (${sapOrderNr}).`,
      };
    } catch (err: any) {
      const errorMsg = err?.message || String(err);

      await db
        .update(maintenanceOrders)
        .set({
          sapSyncStatus: "FAILED",
          sapSyncError: errorMsg,
          updatedAt: new Date(),
        })
        .where(eq(maintenanceOrders.id, order.id));

      await db.insert(sapSyncQueue).values({
        tenantId: this.tenantId,
        operation: "ORDER_MIGRATE",
        entityType: "ORDER",
        entityId: order.id,
        payload: { bapi: "BAPI_ALM_ORDER_MAINTAIN" },
        status: "PENDING",
        errorMessage: errorMsg,
        retryCount: 0,
        scheduledAt: new Date(),
      });

      return {
        success: false,
        queuedForSync: true,
        message: `BAPI-Sync fehlgeschlagen. In Sync-Queue eingereiht (${errorMsg}).`,
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

    try {
      await this.callBapi("BAPI_ALM_ORDER_MAINTAIN", {
        ORDER_HEADER: {
          ORDERID: order.sapOrderNr || "",
          SYSTEM_STATUS: order.currentStatus?.sapSystemStatusCode || "",
          USER_STATUS: order.currentStatus?.sapUserStatusCode || "",
        },
      });

      return {
        success: true,
        sapOrderNr: order.sapOrderNr || undefined,
        message: `Auftragsstatus via BAPI synchronisiert.`,
      };
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      return {
        success: false,
        queuedForSync: true,
        message: `BAPI Status-Update fehlgeschlagen (${errorMsg}).`,
      };
    }
  }
}
