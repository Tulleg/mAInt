import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  jsonb,
  vector,
  index,
  uniqueIndex,
  primaryKey,
  AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { z } from "zod";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ============================================================================
// 1. ENUMS & CUSTOM TYPES
// ============================================================================

export const sapSyncQueueOperationEnum = pgEnum("sap_sync_queue_operation", [
  "EQUIPMENT_PULL",
  "SPARE_PART_BOOKING",
  "ORDER_MIGRATE",
  "ORDER_STATUS_UPDATE",
]);

export const sapSyncQueueStatusEnum = pgEnum("sap_sync_queue_status", [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "PROCESSED",
  "FAILED",
]);

export const sapSyncStatusEnum = pgEnum("sap_sync_status", [
  "NOT_APPLICABLE", // Standalone-Modus
  "PENDING",        // Wartet auf SAP-Outbox-Übertragung
  "SYNCED",         // Erfolgreich mit SAP PM / MM synchronisiert
  "PROCESSED",      // Erfolgreich übertragen / verarbeitet
  "FAILED",         // SAP BAPI / OData Fehler (Retry erforderlich)
  "CONFLICT",       // Datenkonflikt zwischen lokalem Stand und SAP
]);

export const assetCriticalityEnum = pgEnum("asset_criticality", [
  "A", // Hochkritisch (Engpassmaschine / Sicherheitsrelevant)
  "B", // Wichtig (Redundanz vorhanden oder Puffer möglich)
  "C", // Unkritisch (Ausfallstrategie / Run-to-Failure)
]);

export const assetStatusEnum = pgEnum("asset_status", [
  "ACTIVE",
  "IN_MAINTENANCE",
  "BREAKDOWN",
  "DECOMMISSIONED",
]);

export const assetSourceEnum = pgEnum("asset_source", [
  "SAP",
  "MANUAL",
]);

export const hierarchySourceEnum = assetSourceEnum;

export const orderPriorityEnum = pgEnum("order_priority", [
  "1_EMERGENCY", // Sofort / Stillstand
  "2_HIGH",      // Innerhalb 24h
  "3_MEDIUM",    // Innerhalb 1 Woche
  "4_LOW",       // Nächster geplanter Stillstand
]);

export const workflowStatusCategoryEnum = pgEnum("workflow_status_category", [
  "DRAFT",       // Entwurf / Meldung (SAP: EROF)
  "OPEN",        // Freigegeben (SAP: FREI)
  "IN_PROGRESS", // In Arbeit (SAP: INAR)
  "ON_HOLD",     // Wartend auf Material / Fremdfirma
  "COMPLETED",   // Technisch abgeschlossen (SAP: TABG)
  "CLOSED",      // Kaufmännisch abgeschlossen (SAP: ABGS)
  "CANCELLED",   // Storniert / Löschvormerkung (SAP: LÖVM)
]);

export const maintenanceCycleUnitEnum = pgEnum("maintenance_cycle_unit", [
  "DAYS",
  "WEEKS",
  "MONTHS",
  "OPERATING_HOURS",
  "CYCLES",
]);

export const sapSyncModeEnum = pgEnum("sap_sync_mode", [
  "STANDALONE",
  "ODATA_V4",
  "RFC_BAPI",
  "REST_MIDDLEWARE",
]);

export const authProviderEnum = pgEnum("auth_provider", [
  "LOCAL",
  "SSO",
  "AZURE_AD",
]);

export const orderEscalationLevelEnum = pgEnum("order_escalation_level", [
  "LEVEL_1",
  "LEVEL_2",
  "LEVEL_3",
]);

// ============================================================================
// 2. TYPESCRIPT INTERFACES FÜR STRUKTURIERTE JSONB-FELDER
// ============================================================================

export interface InspectionFieldDefinition {
  id: string;
  label: string;
  description?: string;
  type: "BOOLEAN" | "NUMERIC" | "TEXT" | "SELECT" | "PHOTO" | "SIGNATURE";
  required: boolean;
  unit?: string;
  minLimit?: number;
  maxLimit?: number;
  targetValue?: number;
  options?: string[];
  triggerDefectOnFail?: boolean;
}

export interface InspectionSectionDefinition {
  id: string;
  title: string;
  orderIndex: number;
  fields: InspectionFieldDefinition[];
}

export interface InspectionTemplateSchema {
  version: number;
  requiresSafetyClearance: boolean;
  sections: InspectionSectionDefinition[];
}

export interface InspectionExecutionChecklistResult {
  templateVersion: number;
  completedAt?: string;
  completedByUserId?: string;
  signature?: string;
  signatureName?: string;
  signedAt?: string;
  values: Record<
    string,
    {
      value: string | number | boolean | null;
      isOutOfBounds?: boolean;
      comment?: string;
      attachmentUrls?: string[];
      measuredAt: string;
    }
  >;
}

export interface WorkflowGuardCondition {
  requireChecklistCompleted?: boolean;
  requireRootCauseFilled?: boolean;
  requireActualDurationFilled?: boolean;
  requireDigitalSignature?: boolean;
  requireAllSparePartsSynced?: boolean;
  requireDamageCode?: boolean;
  customRuleExpression?: string;
}

export interface SavedViewFilterPayload {
  areaId?: string;
  functionalLocationId?: string;
  equipmentId?: string;
  assemblyId?: string;
  status?: string[];
  priority?: string[];
  search?: string;
  orderType?: string;
  assignedToMe?: boolean;
  reportedByMe?: boolean;
  sapSyncStatus?: string[];
  [key: string]: unknown;
}

// ============================================================================
// 3. MANDANTEN (TENANTS) & SYSTEMKONFIGURATION (SAP / AI)
// ============================================================================

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 32 }).notNull(), // z.B. Werkscode "1000"
    name: varchar("name", { length: 255 }).notNull(),
    sapPlantCode: varchar("sap_plant_code", { length: 10 }), // SAP Werk (WERKS)
    sapSyncMode: sapSyncModeEnum("sap_sync_mode").default("STANDALONE").notNull(),
    sapConfig: jsonb("sap_config").$type<{
      baseUrl?: string;
      sapClient?: string;
      systemId?: string;
      syncIntervalMinutes?: number;
      autoTriggerTabg?: boolean;
    }>().default({}),
    aiConfig: jsonb("ai_config").$type<{
      provider: "OPENAI" | "GEMINI" | "OLLAMA" | "VLLM";
      endpointUrl?: string;
      chatModel: string;
      embeddingModel: string;
      embeddingDimensions: 768 | 1536;
      apiKey?: string;
      routingModel?: string;
      analyticsModel?: string;
    }>().default({
      provider: "OPENAI",
      chatModel: "gpt-4o",
      embeddingModel: "text-embedding-3-small",
      embeddingDimensions: 1536,
      routingModel: "gemini-3.8-flash",
      analyticsModel: "gemini-2.5-pro",
    }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("idx_tenants_code").on(table.code)]
);

// ============================================================================
// 3b. BEREICHE (AREAS / PLANTS) - 1. STUFE DER ANLAGENSTRUKTUR
// ============================================================================

export const areas = pgTable(
  "areas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 50 }).notNull(), // z.B. "AREA-01", "FERTIGUNG-1"
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    isActive: boolean("is_active").default(true).notNull(),
    source: assetSourceEnum("source").default("MANUAL").notNull(),
    sapId: varchar("sap_id", { length: 100 }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_areas_tenant_code").on(table.tenantId, table.code),
    index("idx_areas_sap_id").on(table.tenantId, table.sapId),
  ]
);

// ============================================================================
// 4. RBAC: USERS, ROLES & PERMISSIONS
// ============================================================================

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: text("password_hash"),
    firstName: varchar("first_name", { length: 100 }).notNull(),
    lastName: varchar("last_name", { length: 100 }).notNull(),
    authProvider: authProviderEnum("auth_provider").default("LOCAL").notNull(),
    externalAdId: varchar("external_ad_id", { length: 255 }),
    department: varchar("department", { length: 120 }),
    assignedAreaId: uuid("assigned_area_id").references((): AnyPgColumn => areas.id, {
      onDelete: "set null",
    }),
    personnelNr: varchar("personnel_nr", { length: 50 }), // SAP PERNR
    workCenterCode: varchar("work_center_code", { length: 50 }), // SAP ARBPL (z.B. ELEK-01)
    qualificationMatrix: jsonb("qualification_matrix").$type<string[]>().default([]), // z.B. ["Ex-Schutz", "Hochspannung", "Schweißen"]
    isActive: boolean("is_active").default(true).notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_users_tenant_email").on(table.tenantId, table.email),
    index("idx_users_personnel_nr").on(table.tenantId, table.personnelNr),
    index("idx_users_assigned_area").on(table.assignedAreaId),
  ]
);

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 64 }).notNull(), // z.B. "MAINT_PLANNER", "TECHNICIAN", "SHIFT_LEAD"
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    isSystemRole: boolean("is_system_role").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("idx_roles_tenant_code").on(table.tenantId, table.code)]
);

export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 100 }).notNull(), // z.B. "orders:create", "orders:transition", "sap:sync"
    resource: varchar("resource", { length: 64 }).notNull(), // "orders", "equipments", "spare_parts", "workflows"
    action: varchar("action", { length: 64 }).notNull(), // "read", "create", "update", "delete", "approve"
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("idx_permissions_code").on(table.code)]
);

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),
    assignedByUserId: uuid("assigned_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.roleId] }),
    index("idx_user_roles_role").on(table.roleId),
  ]
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.roleId, table.permissionId] }),
    index("idx_role_permissions_perm").on(table.permissionId),
  ]
);

// ============================================================================
// 5. ANLAGENSTRUKTUR & MATERIALSTAMM: FUNCTIONAL LOCATIONS, EQUIPMENTS, SPARE PARTS
// ============================================================================

export const functionalLocations = pgTable(
  "functional_locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    areaId: uuid("area_id").references(() => areas.id, { onDelete: "set null" }),
    parentFunctionalLocationId: uuid("parent_functional_location_id").references(
      (): AnyPgColumn => functionalLocations.id,
      { onDelete: "restrict" }
    ),
    code: varchar("code", { length: 100 }).notNull(), // Technischer Platz Schlüssel (z.B. "W1-HALLE2-LINIE4")
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    costCenter: varchar("cost_center", { length: 50 }), // SAP KOSTL
    plantSection: varchar("plant_section", { length: 50 }), // Betriebsbereich
    source: assetSourceEnum("source").default("MANUAL").notNull(),
    sapId: varchar("sap_id", { length: 100 }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    // SAP-Integrationsfelder (optional für Standalone-Modus)
    sapTplnr: varchar("sap_tplnr", { length: 40 }), // SAP Technischer Platz (TPLNR)
    sapSyncStatus: sapSyncStatusEnum("sap_sync_status")
      .default("NOT_APPLICABLE")
      .notNull(),
    sapLastSyncedAt: timestamp("sap_last_synced_at", { withTimezone: true }),
    sapSyncError: text("sap_sync_error"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_floc_tenant_code").on(table.tenantId, table.code),
    index("idx_floc_area").on(table.areaId),
    index("idx_floc_parent").on(table.parentFunctionalLocationId),
    index("idx_floc_sap_id").on(table.tenantId, table.sapId),
    index("idx_floc_sap_tplnr").on(table.tenantId, table.sapTplnr),
  ]
);

export const equipments = pgTable(
  "equipments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    functionalLocationId: uuid("functional_location_id").references(
      () => functionalLocations.id,
      {
        onDelete: "set null",
      }
    ),
    parentEquipmentId: uuid("parent_equipment_id").references(
      (): AnyPgColumn => equipments.id,
      { onDelete: "restrict" }
    ),
    isAssembly: boolean("is_assembly").default(false).notNull(), // Kennzeichnung als Baugruppe / Funktionseinheit
    equipmentNumber: varchar("equipment_number", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    manufacturer: varchar("manufacturer", { length: 120 }),
    modelType: varchar("model_type", { length: 120 }),
    serialNumber: varchar("serial_number", { length: 120 }),
    yearOfManufacture: integer("year_of_manufacture"),
    criticality: assetCriticalityEnum("criticality").default("B").notNull(),
    status: assetStatusEnum("status").default("ACTIVE").notNull(),
    operatingHoursCounter: numeric("operating_hours_counter", {
      precision: 12,
      scale: 2,
    })
      .default("0.00")
      .notNull(),
    technicalSpecs: jsonb("technical_specs").$type<Record<string, string | number>>().default({}),
    source: assetSourceEnum("source").default("MANUAL").notNull(),
    sapId: varchar("sap_id", { length: 100 }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    // SAP PM Felder (optional)
    sapEquipmentNr: varchar("sap_equipment_nr", { length: 36 }), // SAP EQUNR (18-stellig alphanumerisch)
    sapSyncStatus: sapSyncStatusEnum("sap_sync_status")
      .default("NOT_APPLICABLE")
      .notNull(),
    sapLastSyncedAt: timestamp("sap_last_synced_at", { withTimezone: true }),
    sapSyncError: text("sap_sync_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_equipments_tenant_number").on(
      table.tenantId,
      table.equipmentNumber
    ),
    index("idx_equipments_floc").on(table.functionalLocationId),
    index("idx_equipments_sap_id").on(table.tenantId, table.sapId),
    index("idx_equipments_sap_nr").on(table.tenantId, table.sapEquipmentNr),
  ]
);

// ============================================================================
// 5b. BAUGRUPPEN / FUNKTIONSEINHEITEN (ASSEMBLIES) - 4. STUFE DER ANLAGENSTRUKTUR
// ============================================================================

export const assemblies = pgTable(
  "assemblies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    equipmentId: uuid("equipment_id")
      .notNull()
      .references(() => equipments.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 64 }).notNull(), // z.B. "BG-KU-AXIS4"
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    source: assetSourceEnum("source").default("MANUAL").notNull(),
    sapId: varchar("sap_id", { length: 100 }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_assemblies_tenant_code").on(table.tenantId, table.code),
    index("idx_assemblies_equipment").on(table.equipmentId),
    index("idx_assemblies_sap_id").on(table.tenantId, table.sapId),
  ]
);

export const spareParts = pgTable(
  "spare_parts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    internalPartNumber: varchar("internal_part_number", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    manufacturerPartNumber: varchar("manufacturer_part_number", { length: 100 }),
    unitOfMeasure: varchar("unit_of_measure", { length: 16 }).default("ST").notNull(), // ST, M, L, KG
    storageLocation: varchar("storage_location", { length: 64 }), // SAP LGORT
    storageBin: varchar("storage_bin", { length: 64 }), // Lagerplatz (LGPBE)
    stockQuantity: numeric("stock_quantity", { precision: 12, scale: 3 })
      .default("0.000")
      .notNull(),
    minStockLevel: numeric("min_stock_level", { precision: 12, scale: 3 })
      .default("0.000")
      .notNull(),
    movingAveragePrice: numeric("moving_average_price", {
      precision: 12,
      scale: 2,
    })
      .default("0.00")
      .notNull(),
    currency: varchar("currency", { length: 3 }).default("EUR").notNull(),
    isBatchManaged: boolean("is_batch_managed").default(false).notNull(),
    // SAP MM Felder (optional)
    sapMaterialNr: varchar("sap_material_nr", { length: 40 }), // SAP MATNR
    sapSyncStatus: sapSyncStatusEnum("sap_sync_status")
      .default("NOT_APPLICABLE")
      .notNull(),
    sapLastSyncedAt: timestamp("sap_last_synced_at", { withTimezone: true }),
    sapSyncError: text("sap_sync_error"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_spare_parts_tenant_part_nr").on(
      table.tenantId,
      table.internalPartNumber
    ),
    index("idx_spare_parts_sap_matnr").on(table.tenantId, table.sapMaterialNr),
  ]
);

// ============================================================================
// 6. DYNAMISCHE WORKFLOW ENGINE: ORDER TYPES, STATUSES & TRANSITIONS
// ============================================================================

export const orderTypes = pgTable(
  "order_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 32 }).notNull(), // z.B. "IH01" (Instandsetzung), "IH02" (Wartung), "IH03" (Kalibrierung)
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    sapOrderTypeCode: varchar("sap_order_type_code", { length: 10 }), // SAP AUART (z.B. PM01, PM02, PM03)
    colorHex: varchar("color_hex", { length: 7 }).default("#3B82F6").notNull(),
    iconName: varchar("icon_name", { length: 50 }).default("Wrench").notNull(),
    requiresApproval: boolean("requires_approval").default(false).notNull(),
    requiresSafetyPermit: boolean("requires_safety_permit").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("idx_order_types_tenant_code").on(table.tenantId, table.code)]
);

export const orderStatuses = pgTable(
  "order_statuses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: text("code").notNull(), // z. B. 'ERFASST', 'FREIGEGEBEN', 'IN_ARBEIT', 'PAUSIERT', 'TABG', 'ABGS'
    name: text("name").notNull(), // z. B. 'Technisch abgeschlossen'
    description: text("description"),
    category: text("category").notNull(), // 'INITIAL' | 'IN_PROGRESS' | 'TECHNICAL_COMPLETE' | 'CLOSED'
    sapSystemStatusCode: varchar("sap_system_status_code", { length: 10 }), // z.B. I0001 (EROF), I0002 (FREI), I0045 (TABG)
    sapUserStatusCode: varchar("sap_user_status_code", { length: 10 }), // SAP Anwenderstatus (E0001 etc.)
    color: text("color").default("sky").notNull(), // z. B. 'emerald', 'sky', 'amber'
    colorHex: varchar("color_hex", { length: 20 }).default("#64748B").notNull(),
    isInitialStatus: boolean("is_initial_status").default(false).notNull(),
    isTerminalStatus: boolean("is_terminal_status").default(false).notNull(),
    locksOrderEditing: boolean("locks_order_editing").default(false).notNull(),
    triggersSapCompletion: boolean("triggers_sap_completion").default(false).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_order_statuses_tenant_code").on(table.tenantId, table.code),
  ]
);

export const workflowStatuses = orderStatuses;

export const workflowTransitions = pgTable(
  "workflow_transitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    orderTypeId: uuid("order_type_id")
      .notNull()
      .references(() => orderTypes.id, { onDelete: "cascade" }),
    fromStatusId: uuid("from_status_id")
      .notNull()
      .references(() => orderStatuses.id, { onDelete: "cascade" }),
    toStatusId: uuid("to_status_id")
      .notNull()
      .references(() => orderStatuses.id, { onDelete: "cascade" }),
    /**
     * Erforderliche Rolle für diesen Statusübergang: z. B. 'COORDINATOR', 'TECHNICIAN', 'ADMIN' oder 'ALL'
     * Falls NULL oder 'ALL', darf jeder authentifizierte Benutzer den Übergang ausführen.
     */
    requiredRoleId: text("required_role_id"),
    actionName: varchar("action_name", { length: 120 }).default("Status wechseln").notNull(), // Button-Beschriftung im UI
    description: text("description"),
    requireChecklist: boolean("require_checklist").default(false).notNull(),
    requireTimeEntry: boolean("require_time_entry").default(false).notNull(),
    requireRootCause: boolean("require_root_cause").default(false).notNull(),
    requireSignature: boolean("require_signature").default(false).notNull(),
    triggerSapSync: boolean("trigger_sap_sync").default(false).notNull(),
    guardConditions: jsonb("guard_conditions")
      .$type<WorkflowGuardCondition>()
      .default({})
      .notNull(),
    requiresComment: boolean("requires_comment").default(false).notNull(),
    triggersSapSync: boolean("triggers_sap_sync").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_workflow_transitions_unique_route").on(
      table.tenantId,
      table.orderTypeId,
      table.fromStatusId,
      table.toStatusId
    ),
    index("idx_workflow_transitions_lookup").on(
      table.tenantId,
      table.orderTypeId,
      table.fromStatusId
    ),
    index("idx_workflow_transitions_role").on(table.requiredRoleId),
  ]
);

// ============================================================================
// 7. INSPEKTIONSVORLAGEN, WARTUNGSPLÄNE (ZYKLISCH) & WARTUNGSPLAN-POSITIONEN
// ============================================================================

export const inspectionTemplates = pgTable(
  "inspection_templates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 64 }).notNull(), // z.B. "INSP-PUMP-Q1"
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    version: integer("version").default(1).notNull(),
    /**
     * Dynamisches JSONB-Prüfschema für Messwerte, Checklisten, Grenzwerte und Pflichtfotos.
     */
    schemaJson: jsonb("schema_json").$type<InspectionTemplateSchema>().notNull(),
    estimatedDurationMinutes: integer("estimated_duration_minutes")
      .default(30)
      .notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_inspection_templates_tenant_code_ver").on(
      table.tenantId,
      table.code,
      table.version
    ),
  ]
);

export const maintenancePlans = pgTable(
  "maintenance_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    planNumber: varchar("plan_number", { length: 64 }).notNull(), // z.B. "WP-2026-001"
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    orderTypeId: uuid("order_type_id")
      .notNull()
      .references(() => orderTypes.id, { onDelete: "restrict" }),
    defaultPriority: orderPriorityEnum("default_priority")
      .default("3_MEDIUM")
      .notNull(),
    // Zyklische Steuerung (Zeit- oder Leistungsbasiert)
    cycleValue: integer("cycle_value").notNull(), // z.B. 30 (Tage) oder 500 (Betriebsstunden)
    cycleUnit: maintenanceCycleUnitEnum("cycle_unit").default("DAYS").notNull(),
    callHorizonPercent: integer("call_horizon_percent").default(80).notNull(), // SAP Abrufhorizont (z.B. Auftrag bei 80% erzeugen)
    leadTimeDays: integer("lead_time_days").default(7).notNull(), // Vorlaufzeit in Tagen
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    lastCalledAt: timestamp("last_called_at", { withTimezone: true }),
    nextDueDate: timestamp("next_due_date", { withTimezone: true }).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    // SAP PM Wartungsplan-Kopplung (WARPL)
    sapMaintenancePlanNr: varchar("sap_maintenance_plan_nr", { length: 30 }),
    sapSyncStatus: sapSyncStatusEnum("sap_sync_status")
      .default("NOT_APPLICABLE")
      .notNull(),
    sapLastSyncedAt: timestamp("sap_last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_maintenance_plans_tenant_nr").on(
      table.tenantId,
      table.planNumber
    ),
    index("idx_maintenance_plans_next_due").on(
      table.tenantId,
      table.isActive,
      table.nextDueDate
    ),
  ]
);

export const maintenancePlanItems = pgTable(
  "maintenance_plan_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    maintenancePlanId: uuid("maintenance_plan_id")
      .notNull()
      .references(() => maintenancePlans.id, { onDelete: "cascade" }),
    positionNumber: integer("position_number").notNull(), // 10, 20, 30... (SAP WAPOS)
    title: varchar("title", { length: 255 }).notNull(),
    taskDescription: text("task_description"),
    equipmentId: uuid("equipment_id").references(() => equipments.id, {
      onDelete: "restrict",
    }),
    functionalLocationId: uuid("functional_location_id").references(
      () => functionalLocations.id,
      { onDelete: "restrict" }
    ),
    assemblyId: uuid("assembly_id").references((): AnyPgColumn => assemblies.id, {
      onDelete: "set null",
    }),
    inspectionTemplateId: uuid("inspection_template_id").references(
      () => inspectionTemplates.id,
      { onDelete: "set null" }
    ),
    assignedRoleId: uuid("assigned_role_id").references(() => roles.id, {
      onDelete: "set null",
    }),
    estimatedDurationMinutes: integer("estimated_duration_minutes")
      .default(60)
      .notNull(),
    plannedSparePartsJson: jsonb("planned_spare_parts_json")
      .$type<Array<{ sparePartId: string; quantity: number }>>()
      .default([]),
    sapMaintenanceItemNr: varchar("sap_maintenance_item_nr", { length: 30 }), // SAP WAPOS
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_maint_plan_items_plan_pos").on(
      table.maintenancePlanId,
      table.positionNumber
    ),
    index("idx_maint_plan_items_equipment").on(table.equipmentId),
    index("idx_maint_plan_items_floc").on(table.functionalLocationId),
  ]
);

// ============================================================================
// 7b. SCHADENSCODE-KATALOGE (CATALOGS & DAMAGE CODES)
// ============================================================================

export const damageCatalogs = pgTable(
  "damage_catalogs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 32 }).notNull(), // z.B. "MECH", "HYDR", "ELEK", "PNEU"
    name: varchar("name", { length: 120 }).notNull(), // z.B. "Mechanische Schäden"
    description: text("description"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_damage_catalogs_tenant_code").on(table.tenantId, table.code),
  ]
);

export const damageCodes = pgTable(
  "damage_codes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    catalogId: uuid("catalog_id")
      .notNull()
      .references(() => damageCatalogs.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 64 }).notNull(), // z.B. "LAGER_DEFEKT", "LECKAGE", "SENSOR_AUSFALL"
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_damage_codes_tenant_code").on(table.tenantId, table.code),
    index("idx_damage_codes_catalog").on(table.catalogId),
  ]
);

// ============================================================================
// 8. INSTANDHALTUNGSAUFTRÄGE, ERSATZTEILBUCHUNGEN & PGVECTOR EMBEDDINGS
// ============================================================================

export const maintenanceOrders = pgTable(
  "maintenance_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    orderNumber: varchar("order_number", { length: 64 }).notNull(), // Interne Auftragsnummer (z.B. "MO-2026-000421")
    orderTypeId: uuid("order_type_id")
      .notNull()
      .references(() => orderTypes.id, { onDelete: "restrict" }),
    currentStatusId: uuid("current_status_id")
      .notNull()
      .references(() => workflowStatuses.id, { onDelete: "restrict" }),
    priority: orderPriorityEnum("priority").default("3_MEDIUM").notNull(),
    escalationLevel: orderEscalationLevelEnum("escalation_level")
      .default("LEVEL_1")
      .notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    // Störungsanalyse & Rückmeldung (relevant für KI-Wissensbasis & SAP-Kataloge)
    symptomDescription: text("symptom_description"),
    damageCode: varchar("damage_code", { length: 32 }), // SAP Schadensbild (FEGRP/FECOD)
    damageCodeId: uuid("damage_code_id").references((): AnyPgColumn => damageCodes.id, {
      onDelete: "set null",
    }),
    rootCauseDescription: text("root_cause_description"),
    causeCode: varchar("cause_code", { length: 32 }), // SAP Schadensursache (URGRP/URCOD)
    resolutionSummary: text("resolution_summary"),
    // Bezugsobjekte
    equipmentId: uuid("equipment_id").references(() => equipments.id, {
      onDelete: "restrict",
    }),
    functionalLocationId: uuid("functional_location_id").references(
      () => functionalLocations.id,
      { onDelete: "restrict" }
    ),
    assemblyId: uuid("assembly_id").references((): AnyPgColumn => assemblies.id, {
      onDelete: "set null",
    }),
    maintenancePlanId: uuid("maintenance_plan_id").references(
      () => maintenancePlans.id,
      { onDelete: "set null" }
    ),
    maintenancePlanItemId: uuid("maintenance_plan_item_id").references(
      () => maintenancePlanItems.id,
      { onDelete: "set null" }
    ),
    // Prüfliste / Digitale Checkliste (Snapshot + Ergebnisse)
    inspectionTemplateId: uuid("inspection_template_id").references(
      () => inspectionTemplates.id,
      { onDelete: "set null" }
    ),
    checklistResultsJson: jsonb("checklist_results_json")
      .$type<InspectionExecutionChecklistResult>(),
    // Personalzuordnung
    reportedByUserId: uuid("reported_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    assignedToUserId: uuid("assigned_to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Termine & Aufwände
    scheduledStartAt: timestamp("scheduled_start_at", { withTimezone: true }),
    scheduledEndAt: timestamp("scheduled_end_at", { withTimezone: true }),
    actualStartAt: timestamp("actual_start_at", { withTimezone: true }),
    actualEndAt: timestamp("actual_end_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    plannedDurationMinutes: integer("planned_duration_minutes")
      .default(60)
      .notNull(),
    actualDurationMinutes: integer("actual_duration_minutes"),
    downtimeMinutes: integer("downtime_minutes").default(0).notNull(), // Maschinenstillstandszeit (MTTR/MTBF Berechnung)
    // Offline-First Synchronisation & Optimistic Concurrency Control
    clientCreatedOfflineId: uuid("client_created_offline_id"), // Idempotency-Key aus Dexie/RxDB Outbox
    syncVersion: integer("sync_version").default(1).notNull(),
    lastModifiedDeviceId: varchar("last_modified_device_id", { length: 100 }),
    // SAP PM Auftrags- und Meldungskopplung
    sapOrderNr: varchar("sap_order_nr", { length: 24 }), // SAP AUFNR (12-stellig)
    sapNotificationNr: varchar("sap_notification_nr", { length: 24 }), // SAP QMNUM (12-stellig)
    sapSyncStatus: sapSyncStatusEnum("sap_sync_status")
      .default("NOT_APPLICABLE")
      .notNull(),
    sapLastSyncedAt: timestamp("sap_last_synced_at", { withTimezone: true }),
    sapSyncError: text("sap_sync_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_maint_orders_tenant_order_nr").on(
      table.tenantId,
      table.orderNumber
    ),
    uniqueIndex("idx_maint_orders_offline_idempotency").on(
      table.tenantId,
      table.clientCreatedOfflineId
    ),
    index("idx_maint_orders_status").on(table.tenantId, table.currentStatusId),
    index("idx_maint_orders_equipment").on(table.tenantId, table.equipmentId),
    index("idx_maint_orders_assigned_user").on(
      table.tenantId,
      table.assignedToUserId
    ),
    index("idx_maint_orders_sap_aufnr").on(table.tenantId, table.sapOrderNr),
    index("idx_maint_orders_damage_code_id").on(table.tenantId, table.damageCodeId),
    index("idx_maint_orders_assembly_id").on(table.tenantId, table.assemblyId),
    index("idx_maint_orders_escalation").on(table.tenantId, table.escalationLevel),
  ]
);

export const orderStatusAuditLogs = pgTable(
  "order_status_audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    maintenanceOrderId: uuid("maintenance_order_id").references(
      () => maintenanceOrders.id,
      { onDelete: "cascade" }
    ),
    orderId: uuid("order_id").references(() => maintenanceOrders.id, {
      onDelete: "cascade",
    }),
    transitionId: uuid("transition_id").references(
      () => workflowTransitions.id,
      { onDelete: "set null" }
    ),
    fromStatusId: uuid("from_status_id").references(() => orderStatuses.id, {
      onDelete: "restrict",
    }),
    toStatusId: uuid("to_status_id")
      .notNull()
      .references(() => orderStatuses.id, { onDelete: "restrict" }),
    changedByUserId: uuid("changed_by_user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "restrict",
    }),
    comment: text("comment"),
    notes: text("notes"),
    recordedOfflineAt: timestamp("recorded_offline_at", { withTimezone: true }),
    changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_order_status_audit_order").on(table.maintenanceOrderId),
    index("idx_order_status_audit_order_id").on(table.orderId),
  ]
);

export const orderSparePartBookings = pgTable(
  "order_spare_part_bookings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    maintenanceOrderId: uuid("maintenance_order_id")
      .notNull()
      .references(() => maintenanceOrders.id, { onDelete: "cascade" }),
    sparePartId: uuid("spare_part_id")
      .notNull()
      .references(() => spareParts.id, { onDelete: "restrict" }),
    bookedByUserId: uuid("booked_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    quantityPlanned: numeric("quantity_planned", { precision: 12, scale: 3 })
      .default("0.000")
      .notNull(),
    quantityConsumed: numeric("quantity_consumed", {
      precision: 12,
      scale: 3,
    }).notNull(),
    unitPriceSnapshot: numeric("unit_price_snapshot", {
      precision: 12,
      scale: 2,
    })
      .default("0.00")
      .notNull(),
    batchNumber: varchar("batch_number", { length: 50 }), // SAP CHARG
    storageLocation: varchar("storage_location", { length: 64 }),
    clientBookingOfflineId: uuid("client_booking_offline_id"), // Verhindert doppelte Materialentnahme bei Re-Sync
    // SAP MM Warenbewegungs-Felder (BAPI_GOODSMVT_CREATE / Bewegungsart 261)
    sapReservationNr: varchar("sap_reservation_nr", { length: 20 }), // SAP RSNUM
    sapMaterialDocNr: varchar("sap_material_doc_nr", { length: 20 }), // SAP MBLNR (Materialbeleg nach Warenausgang 261)
    sapMaterialDocYear: integer("sap_material_doc_year"), // SAP MJAHR
    sapSyncStatus: sapSyncStatusEnum("sap_sync_status")
      .default("NOT_APPLICABLE")
      .notNull(),
    sapLastSyncedAt: timestamp("sap_last_synced_at", { withTimezone: true }),
    sapSyncError: text("sap_sync_error"),
    bookedAt: timestamp("booked_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_order_spare_bookings_order").on(table.maintenanceOrderId),
    index("idx_order_spare_bookings_part").on(table.sparePartId),
    uniqueIndex("idx_order_spare_bookings_offline_id").on(
      table.tenantId,
      table.clientBookingOfflineId
    ),
  ]
);

export const orderTimeEntries = pgTable(
  "order_time_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => maintenanceOrders.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationMinutes: integer("duration_minutes").default(0).notNull(),
    workDescription: text("work_description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_order_time_entries_order").on(table.orderId),
    index("idx_order_time_entries_user").on(table.userId),
    index("idx_order_time_entries_tenant").on(table.tenantId),
  ]
);

export const orderTimeTrackings = orderTimeEntries;

/**
 * Semantisches Gedächtnis (RAG / Ähnlichkeitssuche über abgeschlossene Instandhaltungsaufträge).
 * Verwendet pgvector `vector(1536)` mit HNSW-Index (Cosine Distance).
 * Hinweis: Sowohl OpenAI (text-embedding-3-small / 1536-dim) als auch Gemini (gemini-embedding-001)
 * und lokale vLLM/Ollama-Endpunkte (über Zero-Padding oder Matryoshka-Projektion) werden auf 1536 Dimensionen normiert.
 */
export const orderHistoryEmbeddings = pgTable(
  "order_history_embeddings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    maintenanceOrderId: uuid("maintenance_order_id")
      .notNull()
      .references(() => maintenanceOrders.id, { onDelete: "cascade" }),
    equipmentId: uuid("equipment_id").references(() => equipments.id, {
      onDelete: "set null",
    }),
    chunkIndex: integer("chunk_index").default(0).notNull(),
    /**
     * Synthetisierter Volltext aus: Anlagenklasse + Störungsmeldung + Schadenscode + Ursache + Lösung + verbaute Ersatzteile
     */
    synthesizedDocumentText: text("synthesized_document_text").notNull(),
    embeddingModel: varchar("embedding_model", { length: 120 }).notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    metadataJson: jsonb("metadata_json")
      .$type<{
        equipmentType?: string;
        manufacturer?: string;
        damageCode?: string;
        causeCode?: string;
        downtimeMinutes?: number;
        sparePartNumbers?: string[];
      }>()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_order_embeddings_order_chunk").on(
      table.maintenanceOrderId,
      table.chunkIndex
    ),
    index("idx_order_embeddings_tenant_equipment").on(
      table.tenantId,
      table.equipmentId
    ),
    index("idx_order_history_embeddings_hnsw").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops")
    ),
  ]
);

// ============================================================================
// 8b. SAP SYNC QUEUE (RELIABLE OUTBOX FÜR ASYNCHRONEN BATCH- & OFFLINE-SYNC)
// ============================================================================

export const sapSyncQueue = pgTable(
  "sap_sync_queue",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    operation: sapSyncQueueOperationEnum("operation").notNull(),
    entityType: varchar("entity_type", { length: 64 }).notNull(), // "ORDER", "SPARE_PART_BOOKING", "EQUIPMENT"
    entityId: varchar("entity_id", { length: 64 }), // UUID oder externe ID
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: sapSyncQueueStatusEnum("status").default("PENDING").notNull(),
    retryCount: integer("retry_count").default(0).notNull(),
    maxRetries: integer("max_retries").default(5).notNull(),
    errorMessage: text("error_message"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_sap_sync_queue_status").on(table.tenantId, table.status, table.scheduledAt),
    index("idx_sap_sync_queue_entity").on(table.entityType, table.entityId),
  ]
);

// ============================================================================
// 8c. USER SAVED VIEWS (FAVORITEN & DYNAMISCHE ANSICHTEN)
// ============================================================================

export const userSavedViews = pgTable(
  "user_saved_views",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    icon: text("icon").default("star"),
    intent: text("intent").default("ORDERS_QUERY").notNull(),
    filterPayload: jsonb("filter_payload").$type<SavedViewFilterPayload>().default({}),
    refreshInterval: integer("refresh_interval").default(0),
    displayDensity: text("display_density").$type<"compact" | "standard" | "detailed">().default("standard"),
    position: integer("position").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_user_saved_views_user").on(table.userId),
    index("idx_user_saved_views_tenant").on(table.tenantId),
    uniqueIndex("idx_user_saved_views_user_name").on(table.userId, table.name),
  ]
);

export const savedViews = userSavedViews;

// ============================================================================
// 8d. AI USAGE LOGS (TOKEN-LOGGING & MODELL-METRIKEN)
// ============================================================================

export const aiUsageLogs = pgTable(
  "ai_usage_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    provider: text("provider").$type<"gemini" | "openai" | "ollama" | string>().notNull(),
    model: text("model").notNull(),
    taskType: text("task_type").$type<"ROUTING" | "ANALYTICS" | "RAG_SYNTHESIS" | string>().notNull(),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    estimatedCostEur: numeric("estimated_cost_eur", { precision: 10, scale: 6 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_ai_usage_logs_tenant_created").on(table.tenantId, table.createdAt),
    index("idx_ai_usage_logs_task_type").on(table.taskType),
  ]
);

// ============================================================================
// 9. DRIZZLE ORM RELATIONS (FÜR RELATIONAL QUERIES `db.query.*`)
// ============================================================================

export const tenantsRelations = relations(tenants, ({ many }) => ({
  users: many(users),
  roles: many(roles),
  areas: many(areas),
  functionalLocations: many(functionalLocations),
  equipments: many(equipments),
  assemblies: many(assemblies),
  spareParts: many(spareParts),
  damageCatalogs: many(damageCatalogs),
  damageCodes: many(damageCodes),
  orderTypes: many(orderTypes),
  orderStatuses: many(orderStatuses),
  workflowStatuses: many(workflowStatuses),
  workflowTransitions: many(workflowTransitions),
  maintenanceOrders: many(maintenanceOrders),
  maintenancePlans: many(maintenancePlans),
  inspectionTemplates: many(inspectionTemplates),
  orderTimeEntries: many(orderTimeEntries),
  orderStatusAuditLogs: many(orderStatusAuditLogs),
  sapSyncQueue: many(sapSyncQueue),
  savedViews: many(userSavedViews),
  aiUsageLogs: many(aiUsageLogs),
}));

export const areasRelations = relations(areas, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [areas.tenantId],
    references: [tenants.id],
  }),
  functionalLocations: many(functionalLocations),
  users: many(users),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [users.tenantId],
    references: [tenants.id],
  }),
  assignedArea: one(areas, {
    fields: [users.assignedAreaId],
    references: [areas.id],
  }),
  userRoles: many(userRoles),
  reportedOrders: many(maintenanceOrders, { relationName: "reportedByUser" }),
  assignedOrders: many(maintenanceOrders, { relationName: "assignedToUser" }),
  sparePartBookings: many(orderSparePartBookings),
  timeEntries: many(orderTimeEntries),
  statusAuditLogs: many(orderStatusAuditLogs),
  savedViews: many(userSavedViews),
}));

export const rolesRelations = relations(roles, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [roles.tenantId],
    references: [tenants.id],
  }),
  userRoles: many(userRoles),
  rolePermissions: many(rolePermissions),
  guardedTransitions: many(workflowTransitions),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
}));

export const rolePermissionsRelations = relations(
  rolePermissions,
  ({ one }) => ({
    role: one(roles, {
      fields: [rolePermissions.roleId],
      references: [roles.id],
    }),
    permission: one(permissions, {
      fields: [rolePermissions.permissionId],
      references: [permissions.id],
    }),
  })
);

export const functionalLocationsRelations = relations(
  functionalLocations,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [functionalLocations.tenantId],
      references: [tenants.id],
    }),
    area: one(areas, {
      fields: [functionalLocations.areaId],
      references: [areas.id],
    }),
    parentLocation: one(functionalLocations, {
      fields: [functionalLocations.parentFunctionalLocationId],
      references: [functionalLocations.id],
      relationName: "flocHierarchy",
    }),
    childLocations: many(functionalLocations, {
      relationName: "flocHierarchy",
    }),
    equipments: many(equipments),
    maintenanceOrders: many(maintenanceOrders),
    maintenancePlanItems: many(maintenancePlanItems),
  })
);

export const equipmentsRelations = relations(equipments, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [equipments.tenantId],
    references: [tenants.id],
  }),
  functionalLocation: one(functionalLocations, {
    fields: [equipments.functionalLocationId],
    references: [functionalLocations.id],
  }),
  parentEquipment: one(equipments, {
    fields: [equipments.parentEquipmentId],
    references: [equipments.id],
    relationName: "equipmentHierarchy",
  }),
  subEquipments: many(equipments, {
    relationName: "equipmentHierarchy",
  }),
  assemblies: many(assemblies),
  maintenanceOrders: many(maintenanceOrders),
  maintenancePlanItems: many(maintenancePlanItems),
  historyEmbeddings: many(orderHistoryEmbeddings),
}));

export const assembliesRelations = relations(assemblies, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [assemblies.tenantId],
    references: [tenants.id],
  }),
  equipment: one(equipments, {
    fields: [assemblies.equipmentId],
    references: [equipments.id],
  }),
  maintenanceOrders: many(maintenanceOrders),
}));

export const sparePartsRelations = relations(spareParts, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [spareParts.tenantId],
    references: [tenants.id],
  }),
  bookings: many(orderSparePartBookings),
}));

export const orderTypesRelations = relations(orderTypes, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [orderTypes.tenantId],
    references: [tenants.id],
  }),
  transitions: many(workflowTransitions),
  maintenanceOrders: many(maintenanceOrders),
  maintenancePlans: many(maintenancePlans),
}));

export const orderStatusesRelations = relations(
  orderStatuses,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [orderStatuses.tenantId],
      references: [tenants.id],
    }),
    outgoingTransitions: many(workflowTransitions, {
      relationName: "transitionFromStatus",
    }),
    incomingTransitions: many(workflowTransitions, {
      relationName: "transitionToStatus",
    }),
    maintenanceOrders: many(maintenanceOrders),
    auditLogsFrom: many(orderStatusAuditLogs, {
      relationName: "fromStatusAuditLogs",
    }),
    auditLogsTo: many(orderStatusAuditLogs, {
      relationName: "toStatusAuditLogs",
    }),
  })
);

export const workflowStatusesRelations = orderStatusesRelations;

export const workflowTransitionsRelations = relations(
  workflowTransitions,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [workflowTransitions.tenantId],
      references: [tenants.id],
    }),
    orderType: one(orderTypes, {
      fields: [workflowTransitions.orderTypeId],
      references: [orderTypes.id],
    }),
    fromStatus: one(workflowStatuses, {
      fields: [workflowTransitions.fromStatusId],
      references: [workflowStatuses.id],
      relationName: "transitionFromStatus",
    }),
    toStatus: one(workflowStatuses, {
      fields: [workflowTransitions.toStatusId],
      references: [workflowStatuses.id],
      relationName: "transitionToStatus",
    }),
    requiredRole: one(roles, {
      fields: [workflowTransitions.requiredRoleId],
      references: [roles.id],
    }),
  })
);

export const inspectionTemplatesRelations = relations(
  inspectionTemplates,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [inspectionTemplates.tenantId],
      references: [tenants.id],
    }),
    createdByUser: one(users, {
      fields: [inspectionTemplates.createdByUserId],
      references: [users.id],
    }),
    maintenancePlanItems: many(maintenancePlanItems),
    maintenanceOrders: many(maintenanceOrders),
  })
);

export const maintenancePlansRelations = relations(
  maintenancePlans,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [maintenancePlans.tenantId],
      references: [tenants.id],
    }),
    orderType: one(orderTypes, {
      fields: [maintenancePlans.orderTypeId],
      references: [orderTypes.id],
    }),
    items: many(maintenancePlanItems),
    generatedOrders: many(maintenanceOrders),
  })
);

export const maintenancePlanItemsRelations = relations(
  maintenancePlanItems,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [maintenancePlanItems.tenantId],
      references: [tenants.id],
    }),
    maintenancePlan: one(maintenancePlans, {
      fields: [maintenancePlanItems.maintenancePlanId],
      references: [maintenancePlans.id],
    }),
    equipment: one(equipments, {
      fields: [maintenancePlanItems.equipmentId],
      references: [equipments.id],
    }),
    functionalLocation: one(functionalLocations, {
      fields: [maintenancePlanItems.functionalLocationId],
      references: [functionalLocations.id],
    }),
    inspectionTemplate: one(inspectionTemplates, {
      fields: [maintenancePlanItems.inspectionTemplateId],
      references: [inspectionTemplates.id],
    }),
    assignedRole: one(roles, {
      fields: [maintenancePlanItems.assignedRoleId],
      references: [roles.id],
    }),
    generatedOrders: many(maintenanceOrders),
  })
);

export const damageCatalogsRelations = relations(damageCatalogs, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [damageCatalogs.tenantId],
    references: [tenants.id],
  }),
  codes: many(damageCodes),
}));

export const damageCodesRelations = relations(damageCodes, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [damageCodes.tenantId],
    references: [tenants.id],
  }),
  catalog: one(damageCatalogs, {
    fields: [damageCodes.catalogId],
    references: [damageCatalogs.id],
  }),
  maintenanceOrders: many(maintenanceOrders),
}));

export const maintenanceOrdersRelations = relations(
  maintenanceOrders,
  ({ one, many }) => ({
    tenant: one(tenants, {
      fields: [maintenanceOrders.tenantId],
      references: [tenants.id],
    }),
    orderType: one(orderTypes, {
      fields: [maintenanceOrders.orderTypeId],
      references: [orderTypes.id],
    }),
    currentStatus: one(workflowStatuses, {
      fields: [maintenanceOrders.currentStatusId],
      references: [workflowStatuses.id],
    }),
    damageCodeCatalog: one(damageCodes, {
      fields: [maintenanceOrders.damageCodeId],
      references: [damageCodes.id],
    }),
    equipment: one(equipments, {
      fields: [maintenanceOrders.equipmentId],
      references: [equipments.id],
    }),
    functionalLocation: one(functionalLocations, {
      fields: [maintenanceOrders.functionalLocationId],
      references: [functionalLocations.id],
    }),
    assembly: one(assemblies, {
      fields: [maintenanceOrders.assemblyId],
      references: [assemblies.id],
    }),
    maintenancePlan: one(maintenancePlans, {
      fields: [maintenanceOrders.maintenancePlanId],
      references: [maintenancePlans.id],
    }),
    maintenancePlanItem: one(maintenancePlanItems, {
      fields: [maintenanceOrders.maintenancePlanItemId],
      references: [maintenancePlanItems.id],
    }),
    inspectionTemplate: one(inspectionTemplates, {
      fields: [maintenanceOrders.inspectionTemplateId],
      references: [inspectionTemplates.id],
    }),
    reportedByUser: one(users, {
      fields: [maintenanceOrders.reportedByUserId],
      references: [users.id],
      relationName: "reportedByUser",
    }),
    assignedToUser: one(users, {
      fields: [maintenanceOrders.assignedToUserId],
      references: [users.id],
      relationName: "assignedToUser",
    }),
    sparePartBookings: many(orderSparePartBookings),
    timeEntries: many(orderTimeEntries),
    statusAuditLogs: many(orderStatusAuditLogs),
    historyEmbeddings: many(orderHistoryEmbeddings),
  })
);

export const orderTimeEntriesRelations = relations(
  orderTimeEntries,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [orderTimeEntries.tenantId],
      references: [tenants.id],
    }),
    order: one(maintenanceOrders, {
      fields: [orderTimeEntries.orderId],
      references: [maintenanceOrders.id],
    }),
    user: one(users, {
      fields: [orderTimeEntries.userId],
      references: [users.id],
    }),
  })
);

export const orderSparePartBookingsRelations = relations(
  orderSparePartBookings,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [orderSparePartBookings.tenantId],
      references: [tenants.id],
    }),
    maintenanceOrder: one(maintenanceOrders, {
      fields: [orderSparePartBookings.maintenanceOrderId],
      references: [maintenanceOrders.id],
    }),
    sparePart: one(spareParts, {
      fields: [orderSparePartBookings.sparePartId],
      references: [spareParts.id],
    }),
    bookedByUser: one(users, {
      fields: [orderSparePartBookings.bookedByUserId],
      references: [users.id],
    }),
  })
);

export const orderHistoryEmbeddingsRelations = relations(
  orderHistoryEmbeddings,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [orderHistoryEmbeddings.tenantId],
      references: [tenants.id],
    }),
    maintenanceOrder: one(maintenanceOrders, {
      fields: [orderHistoryEmbeddings.maintenanceOrderId],
      references: [maintenanceOrders.id],
    }),
    equipment: one(equipments, {
      fields: [orderHistoryEmbeddings.equipmentId],
      references: [equipments.id],
    }),
  })
);

export const userSavedViewsRelations = relations(
  userSavedViews,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [userSavedViews.tenantId],
      references: [tenants.id],
    }),
    user: one(users, {
      fields: [userSavedViews.userId],
      references: [users.id],
    }),
  })
);

export const savedViewsRelations = userSavedViewsRelations;

export const orderStatusAuditLogsRelations = relations(
  orderStatusAuditLogs,
  ({ one }) => ({
    tenant: one(tenants, {
      fields: [orderStatusAuditLogs.tenantId],
      references: [tenants.id],
    }),
    maintenanceOrder: one(maintenanceOrders, {
      fields: [orderStatusAuditLogs.maintenanceOrderId],
      references: [maintenanceOrders.id],
    }),
    order: one(maintenanceOrders, {
      fields: [orderStatusAuditLogs.orderId],
      references: [maintenanceOrders.id],
    }),
    transition: one(workflowTransitions, {
      fields: [orderStatusAuditLogs.transitionId],
      references: [workflowTransitions.id],
    }),
    fromStatus: one(orderStatuses, {
      fields: [orderStatusAuditLogs.fromStatusId],
      references: [orderStatuses.id],
      relationName: "fromStatusAuditLogs",
    }),
    toStatus: one(orderStatuses, {
      fields: [orderStatusAuditLogs.toStatusId],
      references: [orderStatuses.id],
      relationName: "toStatusAuditLogs",
    }),
    changedByUser: one(users, {
      fields: [orderStatusAuditLogs.changedByUserId],
      references: [users.id],
    }),
    user: one(users, {
      fields: [orderStatusAuditLogs.userId],
      references: [users.id],
    }),
  })
);

export const sapSyncQueueRelations = relations(sapSyncQueue, ({ one }) => ({
  tenant: one(tenants, {
    fields: [sapSyncQueue.tenantId],
    references: [tenants.id],
  }),
}));

export const aiUsageLogsRelations = relations(aiUsageLogs, ({ one }) => ({
  tenant: one(tenants, {
    fields: [aiUsageLogs.tenantId],
    references: [tenants.id],
  }),
}));

export const assets = equipments;
export const assetsRelations = equipmentsRelations;

export type Area = typeof areas.$inferSelect;
export type NewArea = typeof areas.$inferInsert;
export type FunctionalLocation = typeof functionalLocations.$inferSelect;
export type NewFunctionalLocation = typeof functionalLocations.$inferInsert;
export type Equipment = typeof equipments.$inferSelect;
export type NewEquipment = typeof equipments.$inferInsert;
export type Asset = Equipment;
export type NewAsset = NewEquipment;
export type Assembly = typeof assemblies.$inferSelect;
export type NewAssembly = typeof assemblies.$inferInsert;
export type UserSavedView = typeof userSavedViews.$inferSelect;
export type NewUserSavedView = typeof userSavedViews.$inferInsert;
export type SavedView = UserSavedView;
export type NewSavedView = NewUserSavedView;
export type MaintenanceOrder = typeof maintenanceOrders.$inferSelect;
export type NewMaintenanceOrder = typeof maintenanceOrders.$inferInsert;
export type OrderStatus = typeof orderStatuses.$inferSelect;
export type NewOrderStatus = typeof orderStatuses.$inferInsert;
export type WorkflowStatus = OrderStatus;
export type NewWorkflowStatus = NewOrderStatus;
export type WorkflowTransition = typeof workflowTransitions.$inferSelect;
export type NewWorkflowTransition = typeof workflowTransitions.$inferInsert;
export type OrderStatusAuditLog = typeof orderStatusAuditLogs.$inferSelect;
export type NewOrderStatusAuditLog = typeof orderStatusAuditLogs.$inferInsert;
export type SapSyncQueueItem = typeof sapSyncQueue.$inferSelect;
export type NewSapSyncQueueItem = typeof sapSyncQueue.$inferInsert;
export type AiUsageLog = typeof aiUsageLogs.$inferSelect;
export type NewAiUsageLog = typeof aiUsageLogs.$inferInsert;

// ============================================================================
// 10. DRIZZLE-ZOD SCHEMAS FÜR KERNTABELLEN & OPTIONALE/NULLABLE FELDER
// ============================================================================

export const selectEquipmentSchema = createSelectSchema(equipments, {
  sapEquipmentNr: (schema) => schema.nullable().optional(),
  sapId: (schema) => schema.nullable().optional(),
  lastSyncedAt: (schema) => schema.nullable().optional(),
  sapLastSyncedAt: (schema) => schema.nullable().optional(),
  sapSyncError: (schema) => schema.nullable().optional(),
  description: (schema) => schema.nullable().optional(),
  manufacturer: (schema) => schema.nullable().optional(),
  modelType: (schema) => schema.nullable().optional(),
  serialNumber: (schema) => schema.nullable().optional(),
  yearOfManufacture: (schema) => schema.nullable().optional(),
  functionalLocationId: (schema) => schema.nullable().optional(),
  parentEquipmentId: (schema) => schema.nullable().optional(),
});

export const insertEquipmentSchema = createInsertSchema(equipments, {
  sapEquipmentNr: (schema) => schema.nullable().optional(),
  sapId: (schema) => schema.nullable().optional(),
  lastSyncedAt: (schema) => schema.nullable().optional(),
  sapLastSyncedAt: (schema) => schema.nullable().optional(),
  sapSyncError: (schema) => schema.nullable().optional(),
  description: (schema) => schema.nullable().optional(),
  manufacturer: (schema) => schema.nullable().optional(),
  modelType: (schema) => schema.nullable().optional(),
  serialNumber: (schema) => schema.nullable().optional(),
  yearOfManufacture: (schema) => schema.nullable().optional(),
  functionalLocationId: (schema) => schema.nullable().optional(),
  parentEquipmentId: (schema) => schema.nullable().optional(),
});

export const selectAssetSchema = selectEquipmentSchema;
export const insertAssetSchema = insertEquipmentSchema;

export const selectMaintenanceOrderSchema = createSelectSchema(maintenanceOrders, {
  actualStartAt: (schema) => schema.nullable().optional(),
  actualEndAt: (schema) => schema.nullable().optional(),
  startedAt: (schema) => schema.nullable().optional(),
  completedAt: (schema) => schema.nullable().optional(),
  scheduledStartAt: (schema) => schema.nullable().optional(),
  scheduledEndAt: (schema) => schema.nullable().optional(),
  actualDurationMinutes: (schema) => schema.nullable().optional(),
  sapOrderNr: (schema) => schema.nullable().optional(),
  sapNotificationNr: (schema) => schema.nullable().optional(),
  sapLastSyncedAt: (schema) => schema.nullable().optional(),
  sapSyncError: (schema) => schema.nullable().optional(),
  symptomDescription: (schema) => schema.nullable().optional(),
  damageCode: (schema) => schema.nullable().optional(),
  damageCodeId: (schema) => schema.nullable().optional(),
  rootCauseDescription: (schema) => schema.nullable().optional(),
  causeCode: (schema) => schema.nullable().optional(),
  resolutionSummary: (schema) => schema.nullable().optional(),
  equipmentId: (schema) => schema.nullable().optional(),
  functionalLocationId: (schema) => schema.nullable().optional(),
  assemblyId: (schema) => schema.nullable().optional(),
  maintenancePlanId: (schema) => schema.nullable().optional(),
  maintenancePlanItemId: (schema) => schema.nullable().optional(),
  inspectionTemplateId: (schema) => schema.nullable().optional(),
  checklistResultsJson: (schema) => schema.nullable().optional(),
  assignedToUserId: (schema) => schema.nullable().optional(),
  clientCreatedOfflineId: (schema) => schema.nullable().optional(),
  lastModifiedDeviceId: (schema) => schema.nullable().optional(),
});

export const insertMaintenanceOrderSchema = createInsertSchema(maintenanceOrders, {
  actualStartAt: (schema) => schema.nullable().optional(),
  actualEndAt: (schema) => schema.nullable().optional(),
  startedAt: (schema) => schema.nullable().optional(),
  completedAt: (schema) => schema.nullable().optional(),
  scheduledStartAt: (schema) => schema.nullable().optional(),
  scheduledEndAt: (schema) => schema.nullable().optional(),
  actualDurationMinutes: (schema) => schema.nullable().optional(),
  sapOrderNr: (schema) => schema.nullable().optional(),
  sapNotificationNr: (schema) => schema.nullable().optional(),
  sapLastSyncedAt: (schema) => schema.nullable().optional(),
  sapSyncError: (schema) => schema.nullable().optional(),
  symptomDescription: (schema) => schema.nullable().optional(),
  damageCode: (schema) => schema.nullable().optional(),
  damageCodeId: (schema) => schema.nullable().optional(),
  rootCauseDescription: (schema) => schema.nullable().optional(),
  causeCode: (schema) => schema.nullable().optional(),
  resolutionSummary: (schema) => schema.nullable().optional(),
  equipmentId: (schema) => schema.nullable().optional(),
  functionalLocationId: (schema) => schema.nullable().optional(),
  assemblyId: (schema) => schema.nullable().optional(),
  maintenancePlanId: (schema) => schema.nullable().optional(),
  maintenancePlanItemId: (schema) => schema.nullable().optional(),
  inspectionTemplateId: (schema) => schema.nullable().optional(),
  checklistResultsJson: (schema) => schema.nullable().optional(),
  assignedToUserId: (schema) => schema.nullable().optional(),
  clientCreatedOfflineId: (schema) => schema.nullable().optional(),
  lastModifiedDeviceId: (schema) => schema.nullable().optional(),
});

export const selectOrderSchema = selectMaintenanceOrderSchema;
export const insertOrderSchema = insertMaintenanceOrderSchema;

export const selectUserSavedViewSchema = createSelectSchema(userSavedViews, {
  icon: (schema) => schema.nullable().optional(),
  filterPayload: (schema) => schema.nullable().optional(),
  refreshInterval: (schema) => schema.nullable().optional(),
  displayDensity: (schema) => schema.nullable().optional(),
  position: (schema) => schema.nullable().optional(),
});

export const insertUserSavedViewSchema = createInsertSchema(userSavedViews, {
  icon: (schema) => schema.nullable().optional(),
  filterPayload: (schema) => schema.nullable().optional(),
  refreshInterval: (schema) => schema.nullable().optional(),
  displayDensity: (schema) => schema.nullable().optional(),
  position: (schema) => schema.nullable().optional(),
});

export const selectSavedViewSchema = selectUserSavedViewSchema;
export const insertSavedViewSchema = insertUserSavedViewSchema;

export const selectFunctionalLocationSchema = createSelectSchema(functionalLocations, {
  description: (schema) => schema.nullable().optional(),
  sapTplnr: (schema) => schema.nullable().optional(),
  parentFunctionalLocationId: (schema) => schema.nullable().optional(),
});
export const insertFunctionalLocationSchema = createInsertSchema(functionalLocations, {
  description: (schema) => schema.nullable().optional(),
  sapTplnr: (schema) => schema.nullable().optional(),
  parentFunctionalLocationId: (schema) => schema.nullable().optional(),
});

export const selectAreaSchema = createSelectSchema(areas);
export const insertAreaSchema = createInsertSchema(areas);

export const selectAssemblySchema = createSelectSchema(assemblies);
export const insertAssemblySchema = createInsertSchema(assemblies);

export const selectSparePartSchema = createSelectSchema(spareParts);
export const insertSparePartSchema = createInsertSchema(spareParts);

export const selectOrderTimeEntrySchema = createSelectSchema(orderTimeEntries, {
  startedAt: (schema) => schema.nullable().optional(),
  endedAt: (schema) => schema.nullable().optional(),
  workDescription: (schema) => schema.nullable().optional(),
});
export const insertOrderTimeEntrySchema = createInsertSchema(orderTimeEntries, {
  startedAt: (schema) => schema.nullable().optional(),
  endedAt: (schema) => schema.nullable().optional(),
  workDescription: (schema) => schema.nullable().optional(),
});

export const selectOrderStatusSchema = createSelectSchema(orderStatuses);
export const insertOrderStatusSchema = createInsertSchema(orderStatuses);
export const selectWorkflowStatusSchema = selectOrderStatusSchema;
export const insertWorkflowStatusSchema = insertOrderStatusSchema;

export const selectWorkflowTransitionSchema = createSelectSchema(workflowTransitions);
export const insertWorkflowTransitionSchema = createInsertSchema(workflowTransitions);

export const selectOrderStatusAuditLogSchema = createSelectSchema(orderStatusAuditLogs, {
  maintenanceOrderId: (schema) => schema.nullable().optional(),
  orderId: (schema) => schema.nullable().optional(),
  transitionId: (schema) => schema.nullable().optional(),
  fromStatusId: (schema) => schema.nullable().optional(),
  changedByUserId: (schema) => schema.nullable().optional(),
  userId: (schema) => schema.nullable().optional(),
  comment: (schema) => schema.nullable().optional(),
  notes: (schema) => schema.nullable().optional(),
  recordedOfflineAt: (schema) => schema.nullable().optional(),
  changedAt: (schema) => schema.nullable().optional(),
});
export const insertOrderStatusAuditLogSchema = createInsertSchema(orderStatusAuditLogs, {
  maintenanceOrderId: (schema) => schema.nullable().optional(),
  orderId: (schema) => schema.nullable().optional(),
  transitionId: (schema) => schema.nullable().optional(),
  fromStatusId: (schema) => schema.nullable().optional(),
  changedByUserId: (schema) => schema.nullable().optional(),
  userId: (schema) => schema.nullable().optional(),
  comment: (schema) => schema.nullable().optional(),
  notes: (schema) => schema.nullable().optional(),
  recordedOfflineAt: (schema) => schema.nullable().optional(),
  changedAt: (schema) => schema.nullable().optional(),
});

export const selectSapSyncQueueSchema = createSelectSchema(sapSyncQueue, {
  entityId: (schema) => schema.nullable().optional(),
  errorMessage: (schema) => schema.nullable().optional(),
  processedAt: (schema) => schema.nullable().optional(),
});
export const insertSapSyncQueueSchema = createInsertSchema(sapSyncQueue, {
  entityId: (schema) => schema.nullable().optional(),
  errorMessage: (schema) => schema.nullable().optional(),
  processedAt: (schema) => schema.nullable().optional(),
});

export const selectAiUsageLogSchema = createSelectSchema(aiUsageLogs);
export const insertAiUsageLogSchema = createInsertSchema(aiUsageLogs);
