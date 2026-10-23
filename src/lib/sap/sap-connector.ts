import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import {
  ISapConnector,
  SapEquipmentDto,
  SapBookingResult,
  SapOrderMigrationResult,
  SapAdapterConfig,
  NoOpSapConnector,
  ODataSapConnector,
  BapiSapConnector,
  createSapAdapter,
} from "./adapters";

export * from "./adapters";
export * from "./queue-worker";

/**
 * Ermittelt den aktiven SAP-Synchronisationsmodus für den Mandanten oder die Umgebung.
 * Prüft primär process.env.SAP_MODE und sekundär tenant.sapSyncMode.
 * Standardwert ist 'STANDALONE'.
 */
export async function getSapSyncMode(tenantId?: string): Promise<string> {
  if (process.env.SAP_MODE) {
    return process.env.SAP_MODE.toUpperCase();
  }
  if (tenantId) {
    try {
      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
      });
      if (tenant?.sapSyncMode) {
        return tenant.sapSyncMode.toUpperCase();
      }
    } catch (_) {}
  } else {
    try {
      const tenant = await db.query.tenants.findFirst();
      if (tenant?.sapSyncMode) {
        return tenant.sapSyncMode.toUpperCase();
      }
    } catch (_) {}
  }
  return "STANDALONE";
}

/**
 * Factory-Funktion zur Ermittlung des passenden SAP-Konnektors für den Mandanten.
 * Unterstützt Standalone (NoOp), OData v4, RFC/BAPI und REST-Middleware.
 */
export async function getSapConnector(tenantId: string): Promise<ISapConnector> {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });

  const mode = process.env.SAP_MODE || tenant?.sapSyncMode || "STANDALONE";
  const config = (tenant?.sapConfig || {}) as SapAdapterConfig;

  return createSapAdapter(mode, tenantId, config);
}
