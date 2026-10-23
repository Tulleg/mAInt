"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  tenants,
  areas,
  functionalLocations,
  equipments,
} from "@/db/schema";
import { getCurrentUserRbac, RbacPermissionError } from "@/lib/rbac";
import { getSapConnector } from "@/lib/sap/sap-connector";
import { updateGlobalSapModeAction, SapSyncMode } from "./admin-sap-actions";
import { actionSuccess, actionError, validateWithZod, ActionResult } from "./action-utils";

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch (_) {
    // Outside request context
  }
}

/**
 * Überprüft, ob der angemeldete Benutzer Administrator-Rechte besitzt
 * und ob SAP-Modus Änderungen blockiert.
 */
async function assertCanManageEquipments(tenantId: string) {
  const rbac = await getCurrentUserRbac(tenantId);
  if (rbac.roleCode !== "ADMIN") {
    throw new RbacPermissionError(
      "Nur Administratoren dürfen die Anlagenstruktur verändern.",
      "INSUFFICIENT_PERMISSIONS",
      "ADMIN"
    );
  }

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });

  const isSapMode =
    (process.env.SAP_MODE && process.env.SAP_MODE !== "STANDALONE") ||
    (tenant && tenant.sapSyncMode !== "STANDALONE");

  if (isSapMode) {
    throw new Error(
      "SAP PM Synchronisation aktiv: Die Anlagenstruktur ist schreibgeschützt und kann nur über das ERP gepflegt werden."
    );
  }

  return { rbac, tenant };
}

// ============================================================================
// 1. DETAIL-ABFRAGEN (SAFE JOINS & 404-ABSICHERUNG)
// ============================================================================

export interface EquipmentDetails {
  id: string;
  tenantId: string;
  functionalLocationId: string | null;
  parentEquipmentId: string | null;
  isAssembly: boolean;
  equipmentNumber: string;
  name: string;
  description: string | null;
  manufacturer: string | null;
  modelType: string | null;
  serialNumber: string | null;
  yearOfManufacture: number | null;
  criticality: string | null;
  status: string;
  operatingHoursCounter: string | null;
  functionalLocation: any | null;
  area: any | null;
  parentEquipment: any | null;
  assemblies: any[];
}

/**
 * Server Action: Holt ein einzelnes Equipment inklusive verknüpfter
 * Funktionaler Plätze, Bereich und Baugruppen ab.
 * - Fängt ungültige oder leere IDs ab
 * - Liefert saubere Not-Found / 404-Antwort
 * - Safe Joins und strukturierte Fallbacks
 */
export async function getEquipmentAction(
  equipmentId: string,
  tenantId?: string
): Promise<ActionResult<EquipmentDetails, { equipment: EquipmentDetails | null }>> {
  try {
    const idSchema = z.string().trim().min(1, "Ungültige oder leere Equipment-ID übergeben.");
    const validation = validateWithZod(idSchema, equipmentId);
    if (!validation.success) {
      return actionError(validation.error, { equipment: null });
    }

    const cleanId = validation.data;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);

    const condition = isUuid
      ? eq(equipments.id, cleanId)
      : eq(equipments.equipmentNumber, cleanId);

    const eqRecord = await db.query.equipments.findFirst({
      where: tenantId
        ? and(condition, eq(equipments.tenantId, tenantId))
        : condition,
      with: {
        functionalLocation: {
          with: {
            area: true,
          },
        },
        parentEquipment: true,
        assemblies: true,
      },
    });

    if (!eqRecord) {
      return actionError(`Equipment mit ID '${cleanId}' wurde nicht gefunden (404).`, {
        equipment: null,
      });
    }

    // Safe Joins & strukturierte Fallbacks
    const resolvedFloc = eqRecord.functionalLocation ?? null;
    const resolvedArea = resolvedFloc?.area ?? null;
    const resolvedParent = eqRecord.parentEquipment ?? null;
    const resolvedAssemblies = Array.isArray(eqRecord.assemblies) ? eqRecord.assemblies : [];

    const resultData: EquipmentDetails = {
      ...eqRecord,
      functionalLocation: resolvedFloc,
      area: resolvedArea,
      parentEquipment: resolvedParent,
      assemblies: resolvedAssemblies,
    };

    return actionSuccess(resultData, { equipment: resultData });
  } catch (err: any) {
    console.error("Fehler in getEquipmentAction:", err);
    return actionError(err?.message || "Fehler beim Laden des Equipments.", { equipment: null });
  }
}

/**
 * Server Action: Holt einen Technischen Platz inklusive übergeordnetem Bereich und Equipments.
 */
export async function getFunctionalLocationAction(
  flocId: string,
  tenantId?: string
): Promise<ActionResult<any, { functionalLocation: any | null }>> {
  try {
    const idSchema = z.string().trim().min(1, "Ungültige oder leere Floc-ID übergeben.");
    const validation = validateWithZod(idSchema, flocId);
    if (!validation.success) {
      return actionError(validation.error, { functionalLocation: null });
    }

    const cleanId = validation.data;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);

    const condition = isUuid
      ? eq(functionalLocations.id, cleanId)
      : eq(functionalLocations.code, cleanId);

    const flocRecord = await db.query.functionalLocations.findFirst({
      where: tenantId
        ? and(condition, eq(functionalLocations.tenantId, tenantId))
        : condition,
      with: {
        area: true,
        equipments: true,
      },
    });

    if (!flocRecord) {
      return actionError(`Technischer Platz mit ID '${cleanId}' wurde nicht gefunden (404).`, {
        functionalLocation: null,
      });
    }

    const resultData = {
      ...flocRecord,
      area: flocRecord.area ?? null,
      equipments: Array.isArray(flocRecord.equipments) ? flocRecord.equipments : [],
    };

    return actionSuccess(resultData, { functionalLocation: resultData });
  } catch (err: any) {
    console.error("Fehler in getFunctionalLocationAction:", err);
    return actionError(err?.message || "Fehler beim Laden des Technischen Platzes.", { functionalLocation: null });
  }
}

// ============================================================================
// 2. BEREICHE (AREAS) CRUD
// ============================================================================

export interface CreateAreaInput {
  tenantId: string;
  code: string;
  name: string;
  description?: string;
}

const createAreaSchema = z.object({
  tenantId: z.string().min(1, "Mandanten-ID ist erforderlich."),
  code: z.string().trim().min(1, "Code ist ein Pflichtfeld."),
  name: z.string().trim().min(1, "Name ist ein Pflichtfeld."),
  description: z.string().optional(),
});

export async function createAreaAction(input: CreateAreaInput) {
  try {
    const validation = validateWithZod(createAreaSchema, input);
    if (!validation.success) {
      return actionError(validation.error);
    }
    const validated = validation.data;

    await assertCanManageEquipments(validated.tenantId);

    const [created] = await db
      .insert(areas)
      .values({
        tenantId: validated.tenantId,
        code: validated.code.trim().toUpperCase(),
        name: validated.name.trim(),
        description: validated.description?.trim() || null,
        isActive: true,
      })
      .returning();

    safeRevalidatePath("/equipments");
    return actionSuccess(created, { area: created });
  } catch (err: any) {
    return actionError(err?.message || "Fehler beim Anlegen des Bereichs.");
  }
}

export interface UpdateAreaInput {
  id: string;
  tenantId: string;
  name?: string;
  description?: string;
  code?: string;
}

const updateAreaSchema = z.object({
  id: z.string().min(1, "Bereichs-ID ist erforderlich."),
  tenantId: z.string().min(1, "Mandanten-ID ist erforderlich."),
  name: z.string().optional(),
  description: z.string().optional(),
  code: z.string().optional(),
});

export async function updateAreaAction(input: UpdateAreaInput) {
  try {
    const validation = validateWithZod(updateAreaSchema, input);
    if (!validation.success) {
      return actionError(validation.error);
    }
    const validated = validation.data;

    await assertCanManageEquipments(validated.tenantId);

    const [updated] = await db
      .update(areas)
      .set({
        ...(validated.name ? { name: validated.name.trim() } : {}),
        ...(validated.description !== undefined ? { description: validated.description.trim() } : {}),
        ...(validated.code ? { code: validated.code.trim().toUpperCase() } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(areas.id, validated.id), eq(areas.tenantId, validated.tenantId)))
      .returning();

    safeRevalidatePath("/equipments");
    return actionSuccess(updated, { area: updated });
  } catch (err: any) {
    return actionError(err?.message || "Fehler beim Aktualisieren des Bereichs.");
  }
}

export async function deleteAreaAction(areaId: string, tenantId: string) {
  try {
    const validation = validateWithZod(
      z.object({
        areaId: z.string().min(1, "Bereichs-ID ist erforderlich."),
        tenantId: z.string().min(1, "Mandanten-ID ist erforderlich."),
      }),
      { areaId, tenantId }
    );
    if (!validation.success) {
      return actionError(validation.error);
    }

    await assertCanManageEquipments(tenantId);

    // Prüfe abhängige funktionale Plätze
    const dependentFlocs = await db.query.functionalLocations.findMany({
      where: and(
        eq(functionalLocations.areaId, areaId),
        eq(functionalLocations.tenantId, tenantId)
      ),
    });

    if (dependentFlocs.length > 0) {
      return actionError(
        `Bereich kann nicht gelöscht werden, da ihm noch ${dependentFlocs.length} Technische Plätze zugeordnet sind.`
      );
    }

    await db
      .delete(areas)
      .where(and(eq(areas.id, areaId), eq(areas.tenantId, tenantId)));

    safeRevalidatePath("/equipments");
    return actionSuccess({ id: areaId });
  } catch (err: any) {
    return actionError(err?.message || "Fehler beim Löschen des Bereichs.");
  }
}

// ============================================================================
// 3. TECHNISCHE PLÄTZE (FUNCTIONAL LOCATIONS) CRUD
// ============================================================================

export interface CreateFunctionalLocationInput {
  tenantId: string;
  areaId?: string | null;
  code: string;
  name: string;
  plantSection?: string;
  costCenter?: string;
  description?: string;
}

const createFunctionalLocationSchema = z.object({
  tenantId: z.string().min(1, "Mandanten-ID ist erforderlich."),
  areaId: z.string().nullable().optional(),
  code: z.string().trim().min(1, "Code ist ein Pflichtfeld."),
  name: z.string().trim().min(1, "Name ist ein Pflichtfeld."),
  plantSection: z.string().optional(),
  costCenter: z.string().optional(),
  description: z.string().optional(),
});

export async function createFunctionalLocationAction(
  input: CreateFunctionalLocationInput
) {
  try {
    const validation = validateWithZod(createFunctionalLocationSchema, input);
    if (!validation.success) {
      return actionError(validation.error);
    }
    const validated = validation.data;

    await assertCanManageEquipments(validated.tenantId);

    const [created] = await db
      .insert(functionalLocations)
      .values({
        tenantId: validated.tenantId,
        areaId: validated.areaId || null,
        code: validated.code.trim().toUpperCase(),
        name: validated.name.trim(),
        plantSection: validated.plantSection?.trim() || null,
        costCenter: validated.costCenter?.trim() || null,
        description: validated.description?.trim() || null,
        isActive: true,
      })
      .returning();

    safeRevalidatePath("/equipments");
    return actionSuccess(created, { functionalLocation: created });
  } catch (err: any) {
    return actionError(err?.message || "Fehler beim Anlegen des Technischen Platzes.");
  }
}

export interface UpdateFunctionalLocationInput {
  id: string;
  tenantId: string;
  name?: string;
  code?: string;
  plantSection?: string;
  costCenter?: string;
  description?: string;
  areaId?: string | null;
}

const updateFunctionalLocationSchema = z.object({
  id: z.string().min(1, "ID ist erforderlich."),
  tenantId: z.string().min(1, "Mandanten-ID ist erforderlich."),
  name: z.string().optional(),
  code: z.string().optional(),
  plantSection: z.string().optional(),
  costCenter: z.string().optional(),
  description: z.string().optional(),
  areaId: z.string().nullable().optional(),
});

export async function updateFunctionalLocationAction(
  input: UpdateFunctionalLocationInput
) {
  try {
    const validation = validateWithZod(updateFunctionalLocationSchema, input);
    if (!validation.success) {
      return actionError(validation.error);
    }
    const validated = validation.data;

    await assertCanManageEquipments(validated.tenantId);

    const [updated] = await db
      .update(functionalLocations)
      .set({
        ...(validated.name ? { name: validated.name.trim() } : {}),
        ...(validated.code ? { code: validated.code.trim().toUpperCase() } : {}),
        ...(validated.plantSection !== undefined ? { plantSection: validated.plantSection } : {}),
        ...(validated.costCenter !== undefined ? { costCenter: validated.costCenter } : {}),
        ...(validated.description !== undefined ? { description: validated.description } : {}),
        ...(validated.areaId !== undefined ? { areaId: validated.areaId } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(functionalLocations.id, validated.id),
          eq(functionalLocations.tenantId, validated.tenantId)
        )
      )
      .returning();

    safeRevalidatePath("/equipments");
    return actionSuccess(updated, { functionalLocation: updated });
  } catch (err: any) {
    return actionError(err?.message || "Fehler beim Bearbeiten des Technischen Platzes.");
  }
}

export async function deleteFunctionalLocationAction(
  flocId: string,
  tenantId: string
) {
  try {
    const validation = validateWithZod(
      z.object({
        flocId: z.string().min(1, "Floc-ID ist erforderlich."),
        tenantId: z.string().min(1, "Mandanten-ID ist erforderlich."),
      }),
      { flocId, tenantId }
    );
    if (!validation.success) {
      return actionError(validation.error);
    }

    await assertCanManageEquipments(tenantId);

    const dependentEquips = await db.query.equipments.findMany({
      where: and(
        eq(equipments.functionalLocationId, flocId),
        eq(equipments.tenantId, tenantId)
      ),
    });

    if (dependentEquips.length > 0) {
      return actionError(
        `Technischer Platz kann nicht gelöscht werden, da ihm noch ${dependentEquips.length} Equipments zugeordnet sind.`
      );
    }

    await db
      .delete(functionalLocations)
      .where(
        and(
          eq(functionalLocations.id, flocId),
          eq(functionalLocations.tenantId, tenantId)
        )
      );

    safeRevalidatePath("/equipments");
    return actionSuccess({ id: flocId });
  } catch (err: any) {
    return actionError(err?.message || "Fehler beim Löschen des Technischen Platzes.");
  }
}

// ============================================================================
// 4. EQUIPMENTS & BAUGRUPPEN CRUD
// ============================================================================

export interface CreateEquipmentInput {
  tenantId: string;
  functionalLocationId: string;
  parentEquipmentId?: string | null;
  isAssembly?: boolean;
  equipmentNumber: string;
  name: string;
  description?: string;
  manufacturer?: string;
  modelType?: string;
  serialNumber?: string;
  yearOfManufacture?: number;
  criticality?: "A" | "B" | "C";
  status?: "ACTIVE" | "IN_MAINTENANCE" | "BREAKDOWN" | "DECOMMISSIONED";
  operatingHoursCounter?: string;
}

const createEquipmentSchema = z.object({
  tenantId: z.string().min(1, "Mandanten-ID ist erforderlich."),
  functionalLocationId: z.string().optional(),
  parentEquipmentId: z.string().nullable().optional(),
  isAssembly: z.boolean().optional(),
  equipmentNumber: z.string().trim().min(1, "Equipment-Nummer ist ein Pflichtfeld."),
  name: z.string().trim().min(1, "Equipment-Name ist ein Pflichtfeld."),
  description: z.string().optional(),
  manufacturer: z.string().optional(),
  modelType: z.string().optional(),
  serialNumber: z.string().optional(),
  yearOfManufacture: z.number().optional(),
  criticality: z.enum(["A", "B", "C"]).optional(),
  status: z.enum(["ACTIVE", "IN_MAINTENANCE", "BREAKDOWN", "DECOMMISSIONED"]).optional(),
  operatingHoursCounter: z.string().optional(),
});

export async function createEquipmentAction(input: CreateEquipmentInput) {
  try {
    const validation = validateWithZod(createEquipmentSchema, input);
    if (!validation.success) {
      return actionError(validation.error);
    }
    const validated = validation.data;

    await assertCanManageEquipments(validated.tenantId);

    let flocId: string | null | undefined = validated.functionalLocationId;
    if (!flocId && validated.parentEquipmentId) {
      const parent = await db.query.equipments.findFirst({
        where: eq(equipments.id, validated.parentEquipmentId),
      });
      if (parent && parent.functionalLocationId) {
        flocId = parent.functionalLocationId;
      }
    }

    if (!flocId) {
      return actionError("Technischer Platz (functionalLocationId) ist ein Pflichtfeld für Equipments.");
    }

    const [created] = await db
      .insert(equipments)
      .values({
        tenantId: validated.tenantId,
        functionalLocationId: flocId,
        parentEquipmentId: validated.parentEquipmentId || null,
        isAssembly: Boolean(validated.isAssembly || validated.parentEquipmentId),
        equipmentNumber: validated.equipmentNumber.trim().toUpperCase(),
        name: validated.name.trim(),
        description: validated.description?.trim() || null,
        manufacturer: validated.manufacturer?.trim() || null,
        modelType: validated.modelType?.trim() || null,
        serialNumber: validated.serialNumber?.trim() || null,
        yearOfManufacture: validated.yearOfManufacture || null,
        criticality: validated.criticality || "B",
        status: validated.status || "ACTIVE",
        operatingHoursCounter: validated.operatingHoursCounter || "0.00",
      })
      .returning();

    safeRevalidatePath("/equipments");
    return actionSuccess(created, { equipment: created });
  } catch (err: any) {
    return actionError(err?.message || "Fehler beim Anlegen des Equipments.");
  }
}

export interface UpdateEquipmentInput {
  id: string;
  tenantId: string;
  name?: string;
  description?: string;
  manufacturer?: string;
  modelType?: string;
  serialNumber?: string;
  yearOfManufacture?: number;
  criticality?: "A" | "B" | "C";
  status?: "ACTIVE" | "IN_MAINTENANCE" | "BREAKDOWN" | "DECOMMISSIONED";
  operatingHoursCounter?: string;
}

const updateEquipmentSchema = z.object({
  id: z.string().min(1, "Equipment-ID ist erforderlich."),
  tenantId: z.string().min(1, "Mandanten-ID ist erforderlich."),
  name: z.string().optional(),
  description: z.string().optional(),
  manufacturer: z.string().optional(),
  modelType: z.string().optional(),
  serialNumber: z.string().optional(),
  yearOfManufacture: z.number().optional(),
  criticality: z.enum(["A", "B", "C"]).optional(),
  status: z.enum(["ACTIVE", "IN_MAINTENANCE", "BREAKDOWN", "DECOMMISSIONED"]).optional(),
  operatingHoursCounter: z.string().optional(),
});

export async function updateEquipmentAction(input: UpdateEquipmentInput) {
  try {
    const validation = validateWithZod(updateEquipmentSchema, input);
    if (!validation.success) {
      return actionError(validation.error);
    }
    const validated = validation.data;

    await assertCanManageEquipments(validated.tenantId);

    const [updated] = await db
      .update(equipments)
      .set({
        ...(validated.name ? { name: validated.name.trim() } : {}),
        ...(validated.description !== undefined ? { description: validated.description } : {}),
        ...(validated.manufacturer !== undefined ? { manufacturer: validated.manufacturer } : {}),
        ...(validated.modelType !== undefined ? { modelType: validated.modelType } : {}),
        ...(validated.serialNumber !== undefined ? { serialNumber: validated.serialNumber } : {}),
        ...(validated.yearOfManufacture !== undefined ? { yearOfManufacture: validated.yearOfManufacture } : {}),
        ...(validated.criticality ? { criticality: validated.criticality } : {}),
        ...(validated.status ? { status: validated.status } : {}),
        ...(validated.operatingHoursCounter !== undefined ? { operatingHoursCounter: validated.operatingHoursCounter } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(equipments.id, validated.id), eq(equipments.tenantId, validated.tenantId)))
      .returning();

    safeRevalidatePath("/equipments");
    return actionSuccess(updated, { equipment: updated });
  } catch (err: any) {
    return actionError(err?.message || "Fehler beim Bearbeiten des Equipments.");
  }
}

export async function deleteEquipmentAction(
  equipmentId: string,
  tenantId: string
) {
  try {
    const validation = validateWithZod(
      z.object({
        equipmentId: z.string().min(1, "Equipment-ID ist erforderlich."),
        tenantId: z.string().min(1, "Mandanten-ID ist erforderlich."),
      }),
      { equipmentId, tenantId }
    );
    if (!validation.success) {
      return actionError(validation.error);
    }

    await assertCanManageEquipments(tenantId);

    // Prüfe untergeordnete Baugruppen
    const childAssemblies = await db.query.equipments.findMany({
      where: and(
        eq(equipments.parentEquipmentId, equipmentId),
        eq(equipments.tenantId, tenantId)
      ),
    });

    if (childAssemblies.length > 0) {
      return actionError(
        `Equipment kann nicht gelöscht werden, da ihm noch ${childAssemblies.length} Baugruppen untergeordnet sind.`
      );
    }

    await db
      .delete(equipments)
      .where(and(eq(equipments.id, equipmentId), eq(equipments.tenantId, tenantId)));

    safeRevalidatePath("/equipments");
    return actionSuccess({ id: equipmentId });
  } catch (err: any) {
    return actionError(err?.message || "Fehler beim Löschen des Equipments.");
  }
}

// ============================================================================
// 5. SAP PM SYNCHRONISATION & MODUS-STEUERUNG
// ============================================================================

export async function syncSapEquipmentsAction(tenantId: string) {
  try {
    const idSchema = z.string().min(1, "Mandanten-ID ist erforderlich.");
    const validation = validateWithZod(idSchema, tenantId);
    if (!validation.success) {
      return actionError(validation.error);
    }

    const rbac = await getCurrentUserRbac(tenantId);
    if (rbac.roleCode !== "ADMIN") {
      throw new RbacPermissionError(
        "Nur Administratoren dürfen den SAP-Abgleich anstoßen.",
        "INSUFFICIENT_PERMISSIONS",
        "ADMIN"
      );
    }

    const connector = await getSapConnector(tenantId);
    const result = await connector.pullEquipments();

    safeRevalidatePath("/equipments");
    return actionSuccess(result, {
      message: `SAP Synchronisation erfolgreich: ${result.importedCount} neu importiert, ${result.updatedCount} aktualisiert.`,
      result,
    });
  } catch (err: any) {
    return actionError(err?.message || "Fehler bei der Synchronisation mit SAP PM.");
  }
}

export async function toggleSapModeAction(
  tenantId: string,
  mode: SapSyncMode
) {
  return await updateGlobalSapModeAction({ tenantId, mode });
}
