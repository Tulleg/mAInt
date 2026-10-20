import Dexie, { Table } from "dexie";
import { InspectionTemplateSchema } from "../db/schema";

export interface LocalMaintenanceOrder {
  id: string; // Lokale UUID oder Server-UUID
  tenantId: string;
  orderNumber: string;
  orderTypeId: string;
  orderTypeCode?: string;
  currentStatusId: string;
  statusCode?: string;
  statusName?: string;
  priority: "1_EMERGENCY" | "2_HIGH" | "3_MEDIUM" | "4_LOW";
  title: string;
  description: string;
  equipmentId?: string | null;
  equipmentNumber?: string | null;
  equipmentName?: string | null;
  functionalLocationId?: string | null;
  functionalLocationCode?: string | null;
  inspectionTemplateId?: string | null;
  assignedToUserId?: string | null;
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
  actualDurationMinutes?: number | null;
  checklistResultsJson?: any;
  syncStatus: "SYNCED" | "CREATED_OFFLINE" | "UPDATED_OFFLINE";
  updatedAt: string;
}

export interface LocalEquipment {
  id: string;
  tenantId: string;
  equipmentNumber: string;
  name: string;
  criticality: "A" | "B" | "C";
  status: string;
  functionalLocationId?: string | null;
  parentEquipmentId?: string | null;
  manufacturer?: string | null;
  modelType?: string | null;
  serialNumber?: string | null;
  sapEquipmentNr?: string | null;
}

export interface LocalInspectionTemplate {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  version: number;
  schemaJson: InspectionTemplateSchema;
  estimatedDurationMinutes: number;
}

export interface LocalSparePart {
  id: string;
  tenantId: string;
  internalPartNumber: string;
  name: string;
  stockQuantity: number;
  storageLocation?: string | null;
  sapMaterialNr?: string | null;
}

export interface LocalMutationOutboxItem {
  id?: number; // Auto-increment ID in Dexie
  clientMutationId: string; // UUID für idempotente Server-Verarbeitung
  tenantId: string;
  userId: string;
  entityType: "ORDER" | "ORDER_STATUS" | "CHECKLIST" | "SPARE_PART_BOOKING" | "TIME_CONFIRMATION";
  action: "CREATE" | "UPDATE" | "TRANSITION" | "BOOK_PARTS";
  targetEntityId: string; // z.B. orderId
  payload: Record<string, any>;
  createdAt: string; // ISO Timestamp
  retryCount: number;
  lastErrorMessage?: string | null;
  status: "PENDING" | "PROCESSING" | "FAILED";
}

/**
 * MaintAI Offline-First IndexedDB Schema
 */
export class MaintAiDexieDatabase extends Dexie {
  orders!: Table<LocalMaintenanceOrder, string>;
  equipments!: Table<LocalEquipment, string>;
  templates!: Table<LocalInspectionTemplate, string>;
  spareParts!: Table<LocalSparePart, string>;
  mutationOutbox!: Table<LocalMutationOutboxItem, number>;

  constructor() {
    super("MaintAiOfflineDB");

    this.version(1).stores({
      orders: "id, tenantId, orderNumber, currentStatusId, equipmentId, assignedToUserId, syncStatus, updatedAt",
      equipments: "id, tenantId, equipmentNumber, functionalLocationId, parentEquipmentId",
      templates: "id, tenantId, code, version",
      spareParts: "id, tenantId, internalPartNumber, sapMaterialNr",
      mutationOutbox: "++id, clientMutationId, tenantId, entityType, action, status, createdAt",
    });
  }
}

// Singleton-Instanz für den Browser-Kontext
export const localDb = typeof window !== "undefined" ? new MaintAiDexieDatabase() : (null as any);
