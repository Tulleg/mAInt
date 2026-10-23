import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  spareParts,
  orderSparePartBookings,
  maintenanceOrders,
} from "@/db/schema";
import {
  ISapConnector,
  SapBookingResult,
  SapOrderMigrationResult,
  SapStatusUpdateResult,
} from "./types";

/**
 * NoOpSapConnector (Standalone-Modus):
 * Wird verwendet, wenn SAP für den Mandanten deaktiviert ist (sapSyncMode = 'STANDALONE').
 * Führt Materialbuchungen rein im lokalen Datenstamm durch und setzt Status auf NOT_APPLICABLE.
 */
export class NoOpSapConnector implements ISapConnector {
  constructor(private tenantId: string) {}

  async pullEquipments(): Promise<{ importedCount: number; updatedCount: number }> {
    // Standalone: Keine externe SAP-Schnittstelle konfiguriert
    return { importedCount: 0, updatedCount: 0 };
  }

  async pullFunctionalLocations(): Promise<{ importedCount: number; updatedCount: number }> {
    return { importedCount: 0, updatedCount: 0 };
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
    });

    if (!part) {
      // Suche über interne Artikelnummer als Fallback
      const partByInternal = await db.query.spareParts.findFirst({
        where: and(
          eq(spareParts.tenantId, this.tenantId),
          eq(spareParts.internalPartNumber, materialNr)
        ),
      });

      if (!partByInternal) {
        return {
          success: false,
          message: `Ersatzteil mit Material-Nr '${materialNr}' nicht im lokalen Stamm gefunden.`,
        };
      }
    }

    const resolvedPart = part || (await db.query.spareParts.findFirst({
      where: and(
        eq(spareParts.tenantId, this.tenantId),
        eq(spareParts.internalPartNumber, materialNr)
      ),
    }))!;

    if (!options?.isRetry) {
      // Lokalen Lagerbestand reduzieren
      await db
        .update(spareParts)
        .set({
          stockQuantity: sql`${spareParts.stockQuantity} - ${quantity}`,
          updatedAt: new Date(),
        })
        .where(eq(spareParts.id, resolvedPart.id));

      // Buchungssatz anlegen inkl. Idempotency Key
      if (options?.userId) {
        await db.insert(orderSparePartBookings).values({
          tenantId: this.tenantId,
          maintenanceOrderId: orderId,
          sparePartId: resolvedPart.id,
          bookedByUserId: options.userId,
          quantityConsumed: quantity.toString(),
          unitPriceSnapshot: (options.unitPrice ?? 0).toFixed(2),
          batchNumber: options.batchNumber || null,
          storageLocation: storageLocation || resolvedPart.storageLocation || null,
          clientBookingOfflineId: options.clientBookingOfflineId || null,
          sapSyncStatus: "NOT_APPLICABLE",
        });
      }
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

  async updateOrderStatus(
    orderId: string,
    targetStatusId: string,
    meta?: Record<string, unknown>
  ): Promise<SapStatusUpdateResult> {
    return {
      success: true,
      message: "Auftragsstatus im Standalone-Modus aktualisiert (kein SAP-Sync nötig).",
    };
  }
}
