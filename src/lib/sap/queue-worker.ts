import { eq, and, asc, SQL } from "drizzle-orm";
import { db } from "@/db";
import { sapSyncQueue } from "@/db/schema";
import { getSapConnector } from "./sap-connector";

export interface ProcessSapSyncQueueOptions {
  tenantId?: string;
  queueId?: string;
  limit?: number;
}

export interface ProcessSapSyncQueueItemResult {
  id: string;
  operation: string;
  status: "PROCESSED" | "FAILED" | "PENDING";
  error?: string;
}

export interface ProcessSapSyncQueueResult {
  success: boolean;
  processedCount: number;
  failedCount: number;
  totalChecked: number;
  details: ProcessSapSyncQueueItemResult[];
}

/**
 * Verarbeitet anstehende SAP-Synchronisationsjobs aus der Tabelle `sap_sync_queue`.
 * Ausstehende Buchungen (Bewegungsart 261 / Warenausgang) und Auftragsmigrationen
 * werden erneut an SAP übertragen und nach erfolgreicher Übertragung auf `PROCESSED` gesetzt.
 */
export async function processSapSyncQueue(
  options: ProcessSapSyncQueueOptions = {}
): Promise<ProcessSapSyncQueueResult> {
  const { tenantId, queueId, limit = 50 } = options;

  const conditions: SQL[] = [];

  if (queueId) {
    conditions.push(eq(sapSyncQueue.id, queueId));
  } else {
    conditions.push(eq(sapSyncQueue.status, "PENDING"));
  }

  if (tenantId) {
    conditions.push(eq(sapSyncQueue.tenantId, tenantId));
  }

  const jobs = await db.query.sapSyncQueue.findMany({
    where: conditions.length === 1 ? conditions[0] : and(...conditions),
    orderBy: [asc(sapSyncQueue.scheduledAt), asc(sapSyncQueue.createdAt)],
    limit,
  });

  let processedCount = 0;
  let failedCount = 0;
  const details: ProcessSapSyncQueueItemResult[] = [];

  for (const job of jobs) {
    try {
      // Status während Verarbeitung auf PROCESSING setzen
      await db
        .update(sapSyncQueue)
        .set({ status: "PROCESSING", updatedAt: new Date() })
        .where(eq(sapSyncQueue.id, job.id));

      const connector = await getSapConnector(job.tenantId);
      let operationSuccess = false;
      let resultMessage = "";

      if (job.operation === "SPARE_PART_BOOKING" && job.entityId) {
        const p = (job.payload || {}) as Record<string, any>;
        const res = await connector.bookSparePartConsumption(
          job.entityId,
          p.materialNr,
          Number(p.quantity),
          p.storageLocation,
          {
            userId: p.userId,
            unitPrice: p.unitPrice,
            batchNumber: p.batchNumber,
            clientBookingOfflineId: p.clientBookingOfflineId,
            bookingId: p.bookingId,
            isRetry: true,
          }
        );
        operationSuccess = res.success;
        resultMessage = res.message;
      } else if (job.operation === "ORDER_MIGRATE" && job.entityId) {
        const res = await connector.migrateOrderToSap(job.entityId);
        operationSuccess = res.success;
        resultMessage = res.message;
      } else if (job.operation === "ORDER_STATUS_UPDATE" && job.entityId) {
        const p = (job.payload || {}) as Record<string, any>;
        if (typeof connector.updateOrderStatus === "function") {
          const res = await connector.updateOrderStatus(job.entityId, p.targetStatusId, p);
          operationSuccess = res.success;
          resultMessage = res.message;
        } else {
          const res = await connector.migrateOrderToSap(job.entityId);
          operationSuccess = res.success;
          resultMessage = res.message;
        }
      } else if (job.operation === "EQUIPMENT_PULL") {
        await connector.pullEquipments();
        operationSuccess = true;
        resultMessage = "Equipments erfolgreich abgeglichen.";
      } else {
        throw new Error(`Unbekannte oder unvollständige SAP-Queue-Operation: ${job.operation}`);
      }

      if (operationSuccess) {
        // Nach erfolgreichem Versand: Status zuverlässig auf PROCESSED setzen
        await db
          .update(sapSyncQueue)
          .set({
            status: "PROCESSED",
            processedAt: new Date(),
            updatedAt: new Date(),
            errorMessage: null,
          })
          .where(eq(sapSyncQueue.id, job.id));

        processedCount++;
        details.push({
          id: job.id,
          operation: job.operation,
          status: "PROCESSED",
        });
      } else {
        const newRetryCount = (job.retryCount || 0) + 1;
        const maxRetries = job.maxRetries || 5;
        const finalStatus = newRetryCount >= maxRetries ? "FAILED" : "PENDING";

        await db
          .update(sapSyncQueue)
          .set({
            status: finalStatus,
            errorMessage: resultMessage || "Buchung / Synchronisation nicht erfolgreich",
            retryCount: newRetryCount,
            updatedAt: new Date(),
          })
          .where(eq(sapSyncQueue.id, job.id));

        failedCount++;
        details.push({
          id: job.id,
          operation: job.operation,
          status: finalStatus,
          error: resultMessage,
        });
      }
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      const newRetryCount = (job.retryCount || 0) + 1;
      const maxRetries = job.maxRetries || 5;
      const finalStatus = newRetryCount >= maxRetries ? "FAILED" : "PENDING";

      await db
        .update(sapSyncQueue)
        .set({
          status: finalStatus,
          errorMessage: errorMsg,
          retryCount: newRetryCount,
          updatedAt: new Date(),
        })
        .where(eq(sapSyncQueue.id, job.id));

      failedCount++;
      details.push({
        id: job.id,
        operation: job.operation,
        status: finalStatus,
        error: errorMsg,
      });
    }
  }

  return {
    success: failedCount === 0,
    processedCount,
    failedCount,
    totalChecked: jobs.length,
    details,
  };
}
