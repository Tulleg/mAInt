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
  equipmentNumber?: string;
}

export interface SapFunctionalLocationDto {
  sapTplnr: string;
  code?: string;
  name: string;
  description?: string;
  costCenter?: string;
  plantSection?: string;
  areaCode?: string;
  areaId?: string;
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

export interface SapStatusUpdateResult {
  success: boolean;
  sapOrderNr?: string;
  queuedForSync?: boolean;
  message: string;
}

export interface SapAdapterConfig {
  baseUrl?: string;
  sapClient?: string;
  systemId?: string;
  rfcDestination?: string;
  middlewareUrl?: string;
  username?: string;
  password?: string;
  [key: string]: any;
}

export interface SapBookingOptions {
  userId?: string;
  unitPrice?: number;
  batchNumber?: string;
  clientBookingOfflineId?: string;
  isRetry?: boolean;
  bookingId?: string;
}

/**
 * Entkoppeltes SAP Adapter-Pattern:
 * Erlaubt den nahtlosen Betrieb im Standalone-Modus (ohne SAP-Anbindung)
 * oder im Enterprise-Modus über OData v4 / BAPI / SAP PM Middleware.
 */
export interface ISapConnector {
  pullEquipments(options?: { areaId?: string }): Promise<{ importedCount: number; updatedCount: number }>;
  pullFunctionalLocations?(options?: { areaId?: string }): Promise<{ importedCount: number; updatedCount: number }>;
  fetchEquipments?(options?: { areaId?: string }): Promise<SapEquipmentDto[]>;
  fetchFunctionalLocations?(options?: { areaId?: string }): Promise<SapFunctionalLocationDto[]>;
  bookSparePartConsumption(
    orderId: string,
    materialNr: string,
    quantity: number,
    storageLocation?: string,
    options?: SapBookingOptions
  ): Promise<SapBookingResult>;
  migrateOrderToSap(orderId: string): Promise<SapOrderMigrationResult>;
  updateOrderStatus?(
    orderId: string,
    targetStatusId: string,
    meta?: Record<string, unknown>
  ): Promise<SapStatusUpdateResult>;
}
