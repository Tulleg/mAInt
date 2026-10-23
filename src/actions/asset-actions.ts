"use server";

import { revalidatePath } from "next/cache";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  areas,
  functionalLocations,
  equipments,
  tenants,
} from "@/db/schema";
import {
  assertUserHasRole,
  hasRole,
  hasPermission,
  RbacPermissionError,
} from "@/lib/rbac";
import {
  getSapConnector,
  getSapSyncMode,
  SapEquipmentDto,
  SapFunctionalLocationDto,
} from "@/lib/sap/sap-connector";

export { getSapSyncMode };

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch (_) {
    // Graceful no-op in testing environments
  }
}

// ============================================================================
// 1. TYPEN & SCHNITTSTELLEN
// ============================================================================

export interface CreateAreaInput {
  tenantId?: string;
  code: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
  userId?: string;
}

export interface UpdateAreaInput {
  id: string;
  tenantId?: string;
  code?: string;
  name?: string;
  description?: string | null;
  isActive?: boolean;
  userId?: string;
}

export interface CreateFunctionalLocationInput {
  tenantId?: string;
  areaId?: string | null;
  parentFunctionalLocationId?: string | null;
  parentLocationId?: string | null;
  code: string;
  name: string;
  description?: string | null;
  costCenter?: string | null;
  plantSection?: string | null;
  sapTplnr?: string | null;
  isActive?: boolean;
  userId?: string;
}

export interface UpdateFunctionalLocationInput {
  id: string;
  tenantId?: string;
  areaId?: string | null;
  parentFunctionalLocationId?: string | null;
  parentLocationId?: string | null;
  code?: string;
  name?: string;
  description?: string | null;
  costCenter?: string | null;
  plantSection?: string | null;
  sapTplnr?: string | null;
  isActive?: boolean;
  userId?: string;
}

export interface CreateEquipmentInput {
  tenantId?: string;
  functionalLocationId?: string | null;
  parentEquipmentId?: string | null;
  isAssembly?: boolean;
  equipmentNumber: string;
  name: string;
  description?: string | null;
  manufacturer?: string | null;
  modelType?: string | null;
  serialNumber?: string | null;
  yearOfManufacture?: number | null;
  criticality?: "A" | "B" | "C";
  status?: "ACTIVE" | "IN_MAINTENANCE" | "BREAKDOWN" | "DECOMMISSIONED";
  operatingHoursCounter?: string | number;
  technicalSpecs?: Record<string, string | number>;
  sapEquipmentNr?: string | null;
  userId?: string;
}

export interface UpdateEquipmentInput {
  id: string;
  tenantId?: string;
  functionalLocationId?: string | null;
  parentEquipmentId?: string | null;
  isAssembly?: boolean;
  equipmentNumber?: string;
  name?: string;
  description?: string | null;
  manufacturer?: string | null;
  modelType?: string | null;
  serialNumber?: string | null;
  yearOfManufacture?: number | null;
  criticality?: "A" | "B" | "C";
  status?: "ACTIVE" | "IN_MAINTENANCE" | "BREAKDOWN" | "DECOMMISSIONED";
  operatingHoursCounter?: string | number;
  technicalSpecs?: Record<string, string | number>;
  sapEquipmentNr?: string | null;
  userId?: string;
}

export interface CreateAssemblyInput {
  tenantId?: string;
  parentEquipmentId: string;
  functionalLocationId?: string | null;
  equipmentNumber: string;
  name: string;
  description?: string | null;
  manufacturer?: string | null;
  modelType?: string | null;
  serialNumber?: string | null;
  yearOfManufacture?: number | null;
  criticality?: "A" | "B" | "C";
  status?: "ACTIVE" | "IN_MAINTENANCE" | "BREAKDOWN" | "DECOMMISSIONED";
  operatingHoursCounter?: string | number;
  technicalSpecs?: Record<string, string | number>;
  sapEquipmentNr?: string | null;
  userId?: string;
}

export interface UpdateAssemblyInput {
  id: string;
  tenantId?: string;
  parentEquipmentId?: string | null;
  functionalLocationId?: string | null;
  equipmentNumber?: string;
  name?: string;
  description?: string | null;
  manufacturer?: string | null;
  modelType?: string | null;
  serialNumber?: string | null;
  yearOfManufacture?: number | null;
  criticality?: "A" | "B" | "C";
  status?: "ACTIVE" | "IN_MAINTENANCE" | "BREAKDOWN" | "DECOMMISSIONED";
  operatingHoursCounter?: string | number;
  technicalSpecs?: Record<string, string | number>;
  sapEquipmentNr?: string | null;
  userId?: string;
}

export interface AssemblyNode {
  id: string;
  equipmentNumber: string;
  name: string;
  description: string | null;
  manufacturer: string | null;
  modelType: string | null;
  serialNumber: string | null;
  criticality: string;
  status: string;
  isAssembly: boolean;
  parentEquipmentId: string | null;
  functionalLocationId: string | null;
  sapEquipmentNr: string | null;
  source: string;
  lastSyncedAt: Date | null;
}

export interface EquipmentNode {
  id: string;
  equipmentNumber: string;
  name: string;
  description: string | null;
  manufacturer: string | null;
  modelType: string | null;
  serialNumber: string | null;
  criticality: string;
  status: string;
  isAssembly: boolean;
  functionalLocationId: string | null;
  parentEquipmentId: string | null;
  sapEquipmentNr: string | null;
  source: string;
  lastSyncedAt: Date | null;
  assemblies: AssemblyNode[];
  subEquipments: AssemblyNode[];
}

export interface FunctionalLocationNode {
  id: string;
  code: string;
  name: string;
  description: string | null;
  costCenter: string | null;
  plantSection: string | null;
  sapTplnr: string | null;
  areaId: string | null;
  parentFunctionalLocationId: string | null;
  parentLocationId?: string | null;
  source: string;
  lastSyncedAt: Date | null;
  equipments: EquipmentNode[];
}

export interface AreaNode {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  source: string;
  lastSyncedAt: Date | null;
  functionalLocations: FunctionalLocationNode[];
}

// ============================================================================
// 2. SICHERHEITS- & SAP-MODUS-GUARDS
// ============================================================================

/**
 * Prüft, ob der ausführende Benutzer über die erforderlichen Rechte (ADMIN oder 'assets:manage') verfügt.
 */
export async function assertAssetWritePermission(userId?: string, tenantId?: string): Promise<void> {
  if (!userId) {
    // Wenn keine userId übergeben wurde, wird assertUserHasRole aufgerufen,
    // um die standardisierte RbacPermissionError-Exception auszulösen.
    await assertUserHasRole("", "ADMIN", tenantId);
    return;
  }

  const isAdmin = await hasRole(userId, "ADMIN", tenantId);
  if (isAdmin) {
    return;
  }

  const canManage = await hasPermission(userId, "assets:manage", tenantId);
  if (canManage) {
    return;
  }

  await assertUserHasRole(userId, "ADMIN", tenantId);
}

/**
 * Prüft den aktiven SAP-Synchronisationsmodus.
 * Wenn SAP_MODE !== 'STANDALONE', werden manuelle Stammdatenänderungen strikt blockiert.
 */
export async function assertManualAssetModificationAllowed(tenantId?: string): Promise<void> {
  const mode = await getSapSyncMode(tenantId);
  if (mode && mode !== "STANDALONE") {
    throw new Error(
      "Stammdaten werden zentral über SAP PM geführt und können im aktiven SAP-Modus nicht manuell bearbeitet werden."
    );
  }
}

/**
 * Stellt sicher, dass Datensätze mit source === 'SAP' nicht manuell überschrieben oder gelöscht werden dürfen.
 */
export async function assertNotSapSource(source?: string | null, entityLabel: string = "Datensatz"): Promise<void> {
  if (source === "SAP") {
    throw new Error("Datensätze mit source === 'SAP' dürfen grundsätzlich nicht manuell überschrieben werden.");
  }
}

async function resolveTenantId(providedTenantId?: string): Promise<string> {
  if (providedTenantId) return providedTenantId;
  const firstTenant = await db.query.tenants.findFirst();
  return firstTenant?.id || "00000000-0000-0000-0000-000000000000";
}

// ============================================================================
// 3. SERVER ACTIONS: BEREICHE (AREAS)
// ============================================================================

export async function createArea(input: CreateAreaInput, maybeUserId?: string) {
  const userId = maybeUserId || input.userId;
  const tenantId = await resolveTenantId(input.tenantId);

  await assertAssetWritePermission(userId, tenantId);
  await assertManualAssetModificationAllowed(tenantId);

  const [newArea] = await db
    .insert(areas)
    .values({
      tenantId,
      code: input.code.trim(),
      name: input.name.trim(),
      description: input.description ?? null,
      isActive: input.isActive ?? true,
      source: "MANUAL",
    })
    .returning();

  safeRevalidatePath("/assets");
  return { success: true, area: newArea, data: newArea };
}

export async function updateArea(
  idOrInput: string | UpdateAreaInput,
  updatesOrUserId?: Partial<UpdateAreaInput> | string,
  maybeUserId?: string
) {
  const id = typeof idOrInput === "string" ? idOrInput : idOrInput.id;
  const updates: Partial<UpdateAreaInput> =
    typeof idOrInput === "object"
      ? idOrInput
      : typeof updatesOrUserId === "object"
      ? updatesOrUserId
      : {};
  const userId =
    maybeUserId ||
    (typeof updatesOrUserId === "string" ? updatesOrUserId : undefined) ||
    (typeof idOrInput === "object" ? idOrInput.userId : undefined);

  const existing = await db.query.areas.findFirst({
    where: eq(areas.id, id),
  });

  if (!existing) {
    throw new Error(`Bereich mit ID '${id}' wurde nicht gefunden.`);
  }

  const tenantId = updates.tenantId || existing.tenantId;
  await assertAssetWritePermission(userId, tenantId);
  await assertManualAssetModificationAllowed(tenantId);
  await assertNotSapSource(existing.source, "Bereich");

  const [updated] = await db
    .update(areas)
    .set({
      ...(updates.code ? { code: updates.code.trim() } : {}),
      ...(updates.name ? { name: updates.name.trim() } : {}),
      ...(updates.description !== undefined ? { description: updates.description } : {}),
      ...(updates.isActive !== undefined ? { isActive: updates.isActive } : {}),
      updatedAt: new Date(),
    })
    .where(eq(areas.id, id))
    .returning();

  safeRevalidatePath("/assets");
  return { success: true, area: updated, data: updated };
}

export async function deleteArea(
  idOrInput: string | { id: string; userId?: string; tenantId?: string },
  userIdOrOptions?: string | { userId?: string; tenantId?: string }
) {
  const id = typeof idOrInput === "string" ? idOrInput : idOrInput.id;
  const userId =
    (typeof idOrInput === "object" ? idOrInput.userId : undefined) ||
    (typeof userIdOrOptions === "string" ? userIdOrOptions : userIdOrOptions?.userId);

  const existing = await db.query.areas.findFirst({
    where: eq(areas.id, id),
  });

  if (!existing) {
    throw new Error(`Bereich mit ID '${id}' wurde nicht gefunden.`);
  }

  const tenantId = existing.tenantId;
  await assertAssetWritePermission(userId, tenantId);
  await assertManualAssetModificationAllowed(tenantId);
  await assertNotSapSource(existing.source, "Bereich");

  await db.delete(areas).where(eq(areas.id, id));

  safeRevalidatePath("/assets");
  return {
    success: true,
    message: `Bereich '${existing.name}' gelöscht.`,
    data: { id, name: existing.name },
  };
}

// ============================================================================
// 4. SERVER ACTIONS: TECHNISCHE PLÄTZE (FUNCTIONAL LOCATIONS)
// ============================================================================

export async function createFunctionalLocation(
  input: CreateFunctionalLocationInput,
  maybeUserId?: string
) {
  const userId = maybeUserId || input.userId;
  const tenantId = await resolveTenantId(input.tenantId);

  await assertAssetWritePermission(userId, tenantId);
  await assertManualAssetModificationAllowed(tenantId);

  const parentId = input.parentFunctionalLocationId || input.parentLocationId || null;

  const [newLocation] = await db
    .insert(functionalLocations)
    .values({
      tenantId,
      areaId: input.areaId ?? null,
      parentFunctionalLocationId: parentId,
      code: input.code.trim(),
      name: input.name.trim(),
      description: input.description ?? null,
      costCenter: input.costCenter ?? null,
      plantSection: input.plantSection ?? null,
      sapTplnr: input.sapTplnr ?? null,
      isActive: input.isActive ?? true,
      source: "MANUAL",
    })
    .returning();

  safeRevalidatePath("/assets");
  return { success: true, functionalLocation: newLocation, data: newLocation };
}

export async function updateFunctionalLocation(
  idOrInput: string | UpdateFunctionalLocationInput,
  updatesOrUserId?: Partial<UpdateFunctionalLocationInput> | string,
  maybeUserId?: string
) {
  const id = typeof idOrInput === "string" ? idOrInput : idOrInput.id;
  const updates: Partial<UpdateFunctionalLocationInput> =
    typeof idOrInput === "object"
      ? idOrInput
      : typeof updatesOrUserId === "object"
      ? updatesOrUserId
      : {};
  const userId =
    maybeUserId ||
    (typeof updatesOrUserId === "string" ? updatesOrUserId : undefined) ||
    (typeof idOrInput === "object" ? idOrInput.userId : undefined);

  const existing = await db.query.functionalLocations.findFirst({
    where: eq(functionalLocations.id, id),
  });

  if (!existing) {
    throw new Error(`Technischer Platz mit ID '${id}' wurde nicht gefunden.`);
  }

  const tenantId = updates.tenantId || existing.tenantId;
  await assertAssetWritePermission(userId, tenantId);
  await assertManualAssetModificationAllowed(tenantId);
  await assertNotSapSource(existing.source, "Technischer Platz");

  const parentId =
    updates.parentFunctionalLocationId !== undefined
      ? updates.parentFunctionalLocationId
      : updates.parentLocationId !== undefined
      ? updates.parentLocationId
      : undefined;

  const [updated] = await db
    .update(functionalLocations)
    .set({
      ...(updates.code ? { code: updates.code.trim() } : {}),
      ...(updates.name ? { name: updates.name.trim() } : {}),
      ...(updates.description !== undefined ? { description: updates.description } : {}),
      ...(updates.costCenter !== undefined ? { costCenter: updates.costCenter } : {}),
      ...(updates.plantSection !== undefined ? { plantSection: updates.plantSection } : {}),
      ...(updates.areaId !== undefined ? { areaId: updates.areaId } : {}),
      ...(parentId !== undefined ? { parentFunctionalLocationId: parentId } : {}),
      ...(updates.sapTplnr !== undefined ? { sapTplnr: updates.sapTplnr } : {}),
      ...(updates.isActive !== undefined ? { isActive: updates.isActive } : {}),
      updatedAt: new Date(),
    })
    .where(eq(functionalLocations.id, id))
    .returning();

  safeRevalidatePath("/assets");
  return { success: true, functionalLocation: updated, data: updated };
}

export async function deleteFunctionalLocation(
  idOrInput: string | { id: string; userId?: string; tenantId?: string },
  userIdOrOptions?: string | { userId?: string; tenantId?: string }
) {
  const id = typeof idOrInput === "string" ? idOrInput : idOrInput.id;
  const userId =
    (typeof idOrInput === "object" ? idOrInput.userId : undefined) ||
    (typeof userIdOrOptions === "string" ? userIdOrOptions : userIdOrOptions?.userId);

  const existing = await db.query.functionalLocations.findFirst({
    where: eq(functionalLocations.id, id),
  });

  if (!existing) {
    throw new Error(`Technischer Platz mit ID '${id}' wurde nicht gefunden.`);
  }

  const tenantId = existing.tenantId;
  await assertAssetWritePermission(userId, tenantId);
  await assertManualAssetModificationAllowed(tenantId);
  await assertNotSapSource(existing.source, "Technischer Platz");

  await db.delete(functionalLocations).where(eq(functionalLocations.id, id));

  safeRevalidatePath("/assets");
  return {
    success: true,
    message: `Technischer Platz '${existing.name}' gelöscht.`,
    data: { id, name: existing.name },
  };
}

// ============================================================================
// 5. SERVER ACTIONS: EQUIPMENTS
// ============================================================================

export async function createEquipment(input: CreateEquipmentInput, maybeUserId?: string) {
  const userId = maybeUserId || input.userId;
  const tenantId = await resolveTenantId(input.tenantId);

  await assertAssetWritePermission(userId, tenantId);
  await assertManualAssetModificationAllowed(tenantId);

  let flocId = input.functionalLocationId;
  if (!flocId) {
    // Falls keine FL übergeben wurde, versuchen wir die erste aktive FL des Mandanten zu verwenden
    const defaultFloc = await db.query.functionalLocations.findFirst({
      where: eq(functionalLocations.tenantId, tenantId),
    });
    if (defaultFloc) {
      flocId = defaultFloc.id;
    }
  }

  if (!flocId) {
    throw new Error("Ein Equipment muss einem gültigen Technischen Platz zugewiesen werden.");
  }

  const [newEquipment] = await db
    .insert(equipments)
    .values({
      tenantId,
      functionalLocationId: flocId,
      parentEquipmentId: input.parentEquipmentId ?? null,
      isAssembly: input.isAssembly ?? false,
      equipmentNumber: input.equipmentNumber.trim(),
      name: input.name.trim(),
      description: input.description ?? null,
      manufacturer: input.manufacturer ?? null,
      modelType: input.modelType ?? null,
      serialNumber: input.serialNumber ?? null,
      yearOfManufacture: input.yearOfManufacture ?? null,
      criticality: input.criticality ?? "B",
      status: input.status ?? "ACTIVE",
      operatingHoursCounter: input.operatingHoursCounter ? String(input.operatingHoursCounter) : "0.00",
      technicalSpecs: input.technicalSpecs ?? {},
      sapEquipmentNr: input.sapEquipmentNr ?? null,
      source: "MANUAL",
    })
    .returning();

  safeRevalidatePath("/assets");
  return { success: true, equipment: newEquipment, data: newEquipment };
}

export async function updateEquipment(
  idOrInput: string | UpdateEquipmentInput,
  updatesOrUserId?: Partial<UpdateEquipmentInput> | string,
  maybeUserId?: string
) {
  const id = typeof idOrInput === "string" ? idOrInput : idOrInput.id;
  const updates: Partial<UpdateEquipmentInput> =
    typeof idOrInput === "object"
      ? idOrInput
      : typeof updatesOrUserId === "object"
      ? updatesOrUserId
      : {};
  const userId =
    maybeUserId ||
    (typeof updatesOrUserId === "string" ? updatesOrUserId : undefined) ||
    (typeof idOrInput === "object" ? idOrInput.userId : undefined);

  const existing = await db.query.equipments.findFirst({
    where: eq(equipments.id, id),
  });

  if (!existing) {
    throw new Error(`Equipment mit ID '${id}' wurde nicht gefunden.`);
  }

  const tenantId = updates.tenantId || existing.tenantId;
  await assertAssetWritePermission(userId, tenantId);
  await assertManualAssetModificationAllowed(tenantId);
  await assertNotSapSource(existing.source, "Equipment");

  const [updated] = await db
    .update(equipments)
    .set({
      ...(updates.functionalLocationId !== undefined ? { functionalLocationId: updates.functionalLocationId } : {}),
      ...(updates.parentEquipmentId !== undefined ? { parentEquipmentId: updates.parentEquipmentId } : {}),
      ...(updates.isAssembly !== undefined ? { isAssembly: updates.isAssembly } : {}),
      ...(updates.equipmentNumber ? { equipmentNumber: updates.equipmentNumber.trim() } : {}),
      ...(updates.name ? { name: updates.name.trim() } : {}),
      ...(updates.description !== undefined ? { description: updates.description } : {}),
      ...(updates.manufacturer !== undefined ? { manufacturer: updates.manufacturer } : {}),
      ...(updates.modelType !== undefined ? { modelType: updates.modelType } : {}),
      ...(updates.serialNumber !== undefined ? { serialNumber: updates.serialNumber } : {}),
      ...(updates.yearOfManufacture !== undefined ? { yearOfManufacture: updates.yearOfManufacture } : {}),
      ...(updates.criticality ? { criticality: updates.criticality } : {}),
      ...(updates.status ? { status: updates.status } : {}),
      ...(updates.operatingHoursCounter !== undefined ? { operatingHoursCounter: String(updates.operatingHoursCounter) } : {}),
      ...(updates.technicalSpecs !== undefined ? { technicalSpecs: updates.technicalSpecs } : {}),
      ...(updates.sapEquipmentNr !== undefined ? { sapEquipmentNr: updates.sapEquipmentNr } : {}),
      updatedAt: new Date(),
    })
    .where(eq(equipments.id, id))
    .returning();

  safeRevalidatePath("/assets");
  return { success: true, equipment: updated, data: updated };
}

export async function deleteEquipment(
  idOrInput: string | { id: string; userId?: string; tenantId?: string },
  userIdOrOptions?: string | { userId?: string; tenantId?: string }
) {
  const id = typeof idOrInput === "string" ? idOrInput : idOrInput.id;
  const userId =
    (typeof idOrInput === "object" ? idOrInput.userId : undefined) ||
    (typeof userIdOrOptions === "string" ? userIdOrOptions : userIdOrOptions?.userId);

  const existing = await db.query.equipments.findFirst({
    where: eq(equipments.id, id),
  });

  if (!existing) {
    throw new Error(`Equipment mit ID '${id}' wurde nicht gefunden.`);
  }

  const tenantId = existing.tenantId;
  await assertAssetWritePermission(userId, tenantId);
  await assertManualAssetModificationAllowed(tenantId);
  await assertNotSapSource(existing.source, "Equipment");

  await db.delete(equipments).where(eq(equipments.id, id));

  safeRevalidatePath("/assets");
  return {
    success: true,
    message: `Equipment '${existing.name}' gelöscht.`,
    data: { id, name: existing.name },
  };
}

// ============================================================================
// 6. SERVER ACTIONS: BAUGRUPPEN (ASSEMBLIES)
// ============================================================================

export async function createAssembly(input: CreateAssemblyInput, maybeUserId?: string) {
  const userId = maybeUserId || input.userId;
  const tenantId = await resolveTenantId(input.tenantId);

  await assertAssetWritePermission(userId, tenantId);
  await assertManualAssetModificationAllowed(tenantId);

  if (!input.parentEquipmentId) {
    throw new Error("Eine Baugruppe muss zwingend einem übergeordneten Equipment zugewiesen sein (parentEquipmentId).");
  }

  const parent = await db.query.equipments.findFirst({
    where: eq(equipments.id, input.parentEquipmentId),
  });

  if (!parent) {
    throw new Error(`Übergeordnetes Equipment mit ID '${input.parentEquipmentId}' wurde nicht gefunden.`);
  }

  const flocId = input.functionalLocationId || parent.functionalLocationId;

  const [newAssembly] = await db
    .insert(equipments)
    .values({
      tenantId,
      functionalLocationId: flocId,
      parentEquipmentId: input.parentEquipmentId,
      isAssembly: true,
      equipmentNumber: input.equipmentNumber.trim(),
      name: input.name.trim(),
      description: input.description ?? null,
      manufacturer: input.manufacturer ?? null,
      modelType: input.modelType ?? null,
      serialNumber: input.serialNumber ?? null,
      yearOfManufacture: input.yearOfManufacture ?? null,
      criticality: input.criticality ?? "B",
      status: input.status ?? "ACTIVE",
      operatingHoursCounter: input.operatingHoursCounter ? String(input.operatingHoursCounter) : "0.00",
      technicalSpecs: input.technicalSpecs ?? {},
      sapEquipmentNr: input.sapEquipmentNr ?? null,
      source: "MANUAL",
    })
    .returning();

  safeRevalidatePath("/assets");
  return { success: true, assembly: newAssembly, data: newAssembly };
}

export async function updateAssembly(
  idOrInput: string | UpdateAssemblyInput,
  updatesOrUserId?: Partial<UpdateAssemblyInput> | string,
  maybeUserId?: string
) {
  const id = typeof idOrInput === "string" ? idOrInput : idOrInput.id;
  const updates: Partial<UpdateAssemblyInput> =
    typeof idOrInput === "object"
      ? idOrInput
      : typeof updatesOrUserId === "object"
      ? updatesOrUserId
      : {};
  const userId =
    maybeUserId ||
    (typeof updatesOrUserId === "string" ? updatesOrUserId : undefined) ||
    (typeof idOrInput === "object" ? idOrInput.userId : undefined);

  const existing = await db.query.equipments.findFirst({
    where: eq(equipments.id, id),
  });

  if (!existing) {
    throw new Error(`Baugruppe mit ID '${id}' wurde nicht gefunden.`);
  }

  const tenantId = updates.tenantId || existing.tenantId;
  await assertAssetWritePermission(userId, tenantId);
  await assertManualAssetModificationAllowed(tenantId);
  await assertNotSapSource(existing.source, "Baugruppe");

  const [updated] = await db
    .update(equipments)
    .set({
      isAssembly: true,
      ...(updates.parentEquipmentId !== undefined ? { parentEquipmentId: updates.parentEquipmentId } : {}),
      ...(updates.functionalLocationId !== undefined ? { functionalLocationId: updates.functionalLocationId } : {}),
      ...(updates.equipmentNumber ? { equipmentNumber: updates.equipmentNumber.trim() } : {}),
      ...(updates.name ? { name: updates.name.trim() } : {}),
      ...(updates.description !== undefined ? { description: updates.description } : {}),
      ...(updates.manufacturer !== undefined ? { manufacturer: updates.manufacturer } : {}),
      ...(updates.modelType !== undefined ? { modelType: updates.modelType } : {}),
      ...(updates.serialNumber !== undefined ? { serialNumber: updates.serialNumber } : {}),
      ...(updates.yearOfManufacture !== undefined ? { yearOfManufacture: updates.yearOfManufacture } : {}),
      ...(updates.criticality ? { criticality: updates.criticality } : {}),
      ...(updates.status ? { status: updates.status } : {}),
      ...(updates.operatingHoursCounter !== undefined ? { operatingHoursCounter: String(updates.operatingHoursCounter) } : {}),
      ...(updates.technicalSpecs !== undefined ? { technicalSpecs: updates.technicalSpecs } : {}),
      ...(updates.sapEquipmentNr !== undefined ? { sapEquipmentNr: updates.sapEquipmentNr } : {}),
      updatedAt: new Date(),
    })
    .where(eq(equipments.id, id))
    .returning();

  safeRevalidatePath("/assets");
  return { success: true, assembly: updated, data: updated };
}

export async function deleteAssembly(
  idOrInput: string | { id: string; userId?: string; tenantId?: string },
  userIdOrOptions?: string | { userId?: string; tenantId?: string }
) {
  const id = typeof idOrInput === "string" ? idOrInput : idOrInput.id;
  const userId =
    (typeof idOrInput === "object" ? idOrInput.userId : undefined) ||
    (typeof userIdOrOptions === "string" ? userIdOrOptions : userIdOrOptions?.userId);

  const existing = await db.query.equipments.findFirst({
    where: eq(equipments.id, id),
  });

  if (!existing) {
    throw new Error(`Baugruppe mit ID '${id}' wurde nicht gefunden.`);
  }

  const tenantId = existing.tenantId;
  await assertAssetWritePermission(userId, tenantId);
  await assertManualAssetModificationAllowed(tenantId);
  await assertNotSapSource(existing.source, "Baugruppe");

  await db.delete(equipments).where(eq(equipments.id, id));

  safeRevalidatePath("/assets");
  return {
    success: true,
    message: `Baugruppe '${existing.name}' gelöscht.`,
    data: { id, name: existing.name },
  };
}

// ============================================================================
// 7. SAP-SYNCHRONISATIONS-ACTION
// ============================================================================

export interface SyncAssetsOptions {
  areaId?: string;
  tenantId?: string;
  userId?: string;
}

export async function syncAssetsFromSapAction(
  areaIdOrOptions?: string | SyncAssetsOptions,
  maybeOptions?: SyncAssetsOptions
) {
  const areaId =
    typeof areaIdOrOptions === "string"
      ? areaIdOrOptions
      : areaIdOrOptions?.areaId;
  const options =
    typeof areaIdOrOptions === "object" ? areaIdOrOptions : maybeOptions || {};

  let tenantId = options.tenantId;
  if (!tenantId && areaId) {
    const area = await db.query.areas.findFirst({
      where: eq(areas.id, areaId),
    });
    if (area) {
      tenantId = area.tenantId;
    }
  }
  tenantId = await resolveTenantId(tenantId);

  const connector = await getSapConnector(tenantId);

  let flocImported = 0;
  let flocUpdated = 0;
  let equiImported = 0;
  let equiUpdated = 0;

  // 1. Technische Plätze synchronisieren
  if (typeof connector.fetchFunctionalLocations === "function") {
    const items = await connector.fetchFunctionalLocations({ areaId });
    for (const item of items) {
      const existing = await db.query.functionalLocations.findFirst({
        where: and(
          eq(functionalLocations.tenantId, tenantId),
          eq(functionalLocations.code, item.code || item.sapTplnr)
        ),
      });

      if (existing) {
        await db
          .update(functionalLocations)
          .set({
            name: item.name || existing.name,
            description: item.description ?? existing.description,
            costCenter: item.costCenter ?? existing.costCenter,
            plantSection: item.plantSection ?? existing.plantSection,
            sapTplnr: item.sapTplnr || existing.sapTplnr,
            areaId: areaId || existing.areaId,
            source: "SAP",
            sapSyncStatus: "SYNCED",
            sapLastSyncedAt: new Date(),
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(functionalLocations.id, existing.id));
        flocUpdated++;
      } else {
        await db.insert(functionalLocations).values({
          tenantId,
          areaId: areaId || null,
          code: item.code || item.sapTplnr,
          name: item.name,
          description: item.description ?? null,
          costCenter: item.costCenter ?? null,
          plantSection: item.plantSection ?? null,
          sapTplnr: item.sapTplnr,
          source: "SAP",
          sapSyncStatus: "SYNCED",
          sapLastSyncedAt: new Date(),
          lastSyncedAt: new Date(),
          isActive: true,
        });
        flocImported++;
      }
    }
  } else if (typeof connector.pullFunctionalLocations === "function") {
    const res = await connector.pullFunctionalLocations({ areaId });
    flocImported = res.importedCount;
    flocUpdated = res.updatedCount;
  }

  // 2. Equipments synchronisieren
  if (typeof connector.fetchEquipments === "function") {
    const items = await connector.fetchEquipments({ areaId });
    for (const item of items) {
      const sapNr = item.sapEquipmentNr;
      const eqNr = item.equipmentNumber || sapNr;

      const existing = await db.query.equipments.findFirst({
        where: and(
          eq(equipments.tenantId, tenantId),
          eq(equipments.equipmentNumber, eqNr)
        ),
      });

      let targetFlocId: string | undefined;
      if (item.sapTplnr) {
        const floc = await db.query.functionalLocations.findFirst({
          where: and(
            eq(functionalLocations.tenantId, tenantId),
            eq(functionalLocations.code, item.sapTplnr)
          ),
        });
        if (floc) {
          targetFlocId = floc.id;
        }
      }

      if (existing) {
        await db
          .update(equipments)
          .set({
            name: item.name || existing.name,
            description: item.description ?? existing.description,
            manufacturer: item.manufacturer ?? existing.manufacturer,
            modelType: item.modelType ?? existing.modelType,
            serialNumber: item.serialNumber ?? existing.serialNumber,
            sapEquipmentNr: sapNr || existing.sapEquipmentNr,
            ...(targetFlocId ? { functionalLocationId: targetFlocId } : {}),
            source: "SAP",
            sapSyncStatus: "SYNCED",
            sapLastSyncedAt: new Date(),
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(equipments.id, existing.id));
        equiUpdated++;
      } else {
        // Fallback Floc falls keine spezifische gefunden
        if (!targetFlocId) {
          const fallbackFloc = await db.query.functionalLocations.findFirst({
            where: eq(functionalLocations.tenantId, tenantId),
          });
          targetFlocId = fallbackFloc?.id;
        }

        if (targetFlocId) {
          await db.insert(equipments).values({
            tenantId,
            functionalLocationId: targetFlocId,
            equipmentNumber: eqNr,
            name: item.name || `SAP Equipment ${sapNr}`,
            description: item.description ?? null,
            manufacturer: item.manufacturer ?? null,
            modelType: item.modelType ?? null,
            serialNumber: item.serialNumber ?? null,
            sapEquipmentNr: sapNr,
            source: "SAP",
            sapSyncStatus: "SYNCED",
            sapLastSyncedAt: new Date(),
            lastSyncedAt: new Date(),
            criticality: "B",
            status: "ACTIVE",
          });
          equiImported++;
        }
      }
    }
  } else {
    const res = await connector.pullEquipments({ areaId });
    equiImported = res.importedCount;
    equiUpdated = res.updatedCount;
  }

  safeRevalidatePath("/assets");
  safeRevalidatePath("/planning");

  return {
    success: true,
    message: "Stammdaten erfolgreich mit SAP synchronisiert.",
    functionalLocations: { importedCount: flocImported, updatedCount: flocUpdated },
    equipments: { importedCount: equiImported, updatedCount: equiUpdated },
  };
}

// ============================================================================
// 8. FILTERBARE LESE-ACTIONS (HIERARCHIE-BAUM)
// ============================================================================

export interface AssetHierarchyFilter {
  areaId?: string;
  search?: string;
  tenantId?: string;
}

/**
 * Gibt den vollständigen 4-stufigen Anlagenbaum zurück:
 * Bereiche (Areas) -> Technische Plätze (Functional Locations) -> Equipments -> Baugruppen (Assemblies)
 * Optional filterbar nach areaId und Volltextsuchbegriff.
 */
export async function getAssetHierarchy(filter?: AssetHierarchyFilter): Promise<AreaNode[]> {
  const tenantId = await resolveTenantId(filter?.tenantId);

  // 1. Bereiche laden
  const areaRecords = await db.query.areas.findMany({
    where: filter?.areaId
      ? and(eq(areas.tenantId, tenantId), eq(areas.id, filter.areaId))
      : eq(areas.tenantId, tenantId),
  });

  // 2. Technische Plätze laden
  const flocRecords = await db.query.functionalLocations.findMany({
    where: eq(functionalLocations.tenantId, tenantId),
  });

  // 3. Equipments & Baugruppen laden
  const equiRecords = await db.query.equipments.findMany({
    where: eq(equipments.tenantId, tenantId),
  });

  // 4. Struktur zuordnen:
  // a) Equipments & Baugruppen aufteilen
  const assembliesByParent = new Map<string, AssemblyNode[]>();
  const topEquipmentsByFloc = new Map<string, EquipmentNode[]>();

  for (const eqItem of equiRecords) {
    if (eqItem.isAssembly || eqItem.parentEquipmentId) {
      const pId = eqItem.parentEquipmentId || "";
      const node: AssemblyNode = {
        id: eqItem.id,
        equipmentNumber: eqItem.equipmentNumber,
        name: eqItem.name,
        description: eqItem.description,
        manufacturer: eqItem.manufacturer,
        modelType: eqItem.modelType,
        serialNumber: eqItem.serialNumber,
        criticality: eqItem.criticality,
        status: eqItem.status,
        isAssembly: true,
        parentEquipmentId: eqItem.parentEquipmentId,
        functionalLocationId: eqItem.functionalLocationId,
        sapEquipmentNr: eqItem.sapEquipmentNr,
        source: eqItem.source,
        lastSyncedAt: eqItem.lastSyncedAt,
      };
      const list = assembliesByParent.get(pId) || [];
      list.push(node);
      assembliesByParent.set(pId, list);
    }
  }

  for (const eqItem of equiRecords) {
    if (!eqItem.isAssembly && !eqItem.parentEquipmentId) {
      const flocId = eqItem.functionalLocationId || "unassigned";
      const assemblies = assembliesByParent.get(eqItem.id) || [];
      const node: EquipmentNode = {
        id: eqItem.id,
        equipmentNumber: eqItem.equipmentNumber,
        name: eqItem.name,
        description: eqItem.description,
        manufacturer: eqItem.manufacturer,
        modelType: eqItem.modelType,
        serialNumber: eqItem.serialNumber,
        criticality: eqItem.criticality,
        status: eqItem.status,
        isAssembly: false,
        functionalLocationId: eqItem.functionalLocationId,
        parentEquipmentId: null,
        sapEquipmentNr: eqItem.sapEquipmentNr,
        source: eqItem.source,
        lastSyncedAt: eqItem.lastSyncedAt,
        assemblies,
        subEquipments: assemblies,
      };
      const list = topEquipmentsByFloc.get(flocId) || [];
      list.push(node);
      topEquipmentsByFloc.set(flocId, list);
    }
  }

  // b) Technische Plätze nach Bereich gruppieren
  const flocsByArea = new Map<string, FunctionalLocationNode[]>();

  for (const floc of flocRecords) {
    const areaKey = floc.areaId || "unassigned";
    const flocEquipments = topEquipmentsByFloc.get(floc.id) || [];
    const node: FunctionalLocationNode = {
      id: floc.id,
      code: floc.code,
      name: floc.name,
      description: floc.description,
      costCenter: floc.costCenter,
      plantSection: floc.plantSection,
      sapTplnr: floc.sapTplnr,
      areaId: floc.areaId,
      parentFunctionalLocationId: floc.parentFunctionalLocationId,
      parentLocationId: floc.parentFunctionalLocationId,
      source: floc.source,
      lastSyncedAt: floc.lastSyncedAt,
      equipments: flocEquipments,
    };
    const list = flocsByArea.get(areaKey) || [];
    list.push(node);
    flocsByArea.set(areaKey, list);
  }

  // c) Bereiche erstellen
  let resultTree: AreaNode[] = areaRecords.map((a) => ({
    id: a.id,
    code: a.code,
    name: a.name,
    description: a.description,
    isActive: a.isActive,
    source: a.source,
    lastSyncedAt: a.lastSyncedAt,
    functionalLocations: flocsByArea.get(a.id) || [],
  }));

  // Falls es nicht zugewiesene Plätze gibt und kein spezieller areaId-Filter aktiv ist
  if (!filter?.areaId) {
    const unassignedFlocs = flocsByArea.get("unassigned");
    if (unassignedFlocs && unassignedFlocs.length > 0) {
      resultTree.push({
        id: "unassigned",
        code: "UNASSIGNED",
        name: "Ohne Bereichszuordnung",
        description: "Automatisch aggregierte Plätze ohne zugewiesenen Bereich",
        isActive: true,
        source: "MANUAL",
        lastSyncedAt: null,
        functionalLocations: unassignedFlocs,
      });
    }
  }

  // 5. Optionaler Volltext-Suchfilter
  const searchTerm = filter?.search?.trim().toLowerCase();
  if (searchTerm) {
    const matchesSearch = (str?: string | null) => Boolean(str && str.toLowerCase().includes(searchTerm));

    resultTree = resultTree
      .map((area) => {
        const areaMatches =
          matchesSearch(area.name) ||
          matchesSearch(area.code) ||
          matchesSearch(area.description);

        const filteredFlocs = area.functionalLocations
          .map((floc) => {
            const flocMatches =
              matchesSearch(floc.name) ||
              matchesSearch(floc.code) ||
              matchesSearch(floc.description) ||
              matchesSearch(floc.sapTplnr) ||
              matchesSearch(floc.costCenter);

            const filteredEquipments = floc.equipments
              .map((eq) => {
                const eqMatches =
                  matchesSearch(eq.name) ||
                  matchesSearch(eq.equipmentNumber) ||
                  matchesSearch(eq.description) ||
                  matchesSearch(eq.manufacturer) ||
                  matchesSearch(eq.modelType) ||
                  matchesSearch(eq.serialNumber) ||
                  matchesSearch(eq.sapEquipmentNr);

                const filteredAssemblies = eq.assemblies.filter(
                  (asm) =>
                    matchesSearch(asm.name) ||
                    matchesSearch(asm.equipmentNumber) ||
                    matchesSearch(asm.description) ||
                    matchesSearch(asm.manufacturer) ||
                    matchesSearch(asm.serialNumber) ||
                    matchesSearch(asm.sapEquipmentNr)
                );

                if (eqMatches || filteredAssemblies.length > 0) {
                  const node: EquipmentNode = {
                    ...eq,
                    assemblies: filteredAssemblies.length > 0 ? filteredAssemblies : eq.assemblies,
                    subEquipments: filteredAssemblies.length > 0 ? filteredAssemblies : eq.assemblies,
                  };
                  return node;
                }
                return null;
              })
              .filter((e): e is EquipmentNode => e !== null);

            if (flocMatches || filteredEquipments.length > 0) {
              return {
                ...floc,
                equipments: filteredEquipments.length > 0 ? filteredEquipments : floc.equipments,
              };
            }
            return null;
          })
          .filter((f): f is FunctionalLocationNode => f !== null);

        if (areaMatches || filteredFlocs.length > 0) {
          return {
            ...area,
            functionalLocations: filteredFlocs.length > 0 ? filteredFlocs : area.functionalLocations,
          };
        }
        return null;
      })
      .filter((a): a is AreaNode => a !== null);
  }

  return Object.assign(resultTree, {
    success: true,
    data: resultTree,
  });
}
