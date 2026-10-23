"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, inArray, and } from "drizzle-orm";
import { db } from "@/db";
import {
  maintenancePlanItems,
  maintenancePlans,
  inspectionTemplates,
  InspectionTemplateSchema,
} from "@/db/schema";
import { actionSuccess, actionError, validateWithZod, ActionResult } from "./action-utils";

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch (_) {
    // Graceful no-op when executed outside of Next.js server context (e.g. Vitest)
  }
}

// ============================================================================
// 1. TYPEN & SCHNITTSTELLEN
// ============================================================================

export type MaintenanceCycleUnit = "DAYS" | "WEEKS" | "MONTHS" | "OPERATING_HOURS" | "CYCLES";

export interface PlanItemBulkChanges {
  title?: string;
  taskDescription?: string | null;
  assignedRoleId?: string | null;
  inspectionTemplateId?: string | null;
  equipmentId?: string | null;
  functionalLocationId?: string | null;
  estimatedDurationMinutes?: number;
  isActive?: boolean;
  plannedSparePartsJson?: Array<{ sparePartId: string; quantity: number }>;
  cycleUpdate?: {
    cycleValue: number;
    cycleUnit: MaintenanceCycleUnit;
  };
}

export interface BulkUpdatePlanItemsPayload {
  itemIds: string[];
  updates?: {
    assignedRoleId?: string | null;
    inspectionTemplateId?: string | null;
    equipmentId?: string | null;
    functionalLocationId?: string | null;
    estimatedDurationMinutes?: number;
    title?: string;
    taskDescription?: string | null;
    isActive?: boolean;
  };
  changes?: PlanItemBulkChanges;
  cycleUpdate?: {
    cycleValue: number;
    cycleUnit: MaintenanceCycleUnit;
  };
}

const bulkChangesSchema = z.object({
  title: z.string().optional(),
  taskDescription: z.string().nullable().optional(),
  assignedRoleId: z.string().nullable().optional(),
  inspectionTemplateId: z.string().nullable().optional(),
  equipmentId: z.string().nullable().optional(),
  functionalLocationId: z.string().nullable().optional(),
  estimatedDurationMinutes: z.number().optional(),
  isActive: z.boolean().optional(),
  plannedSparePartsJson: z.array(z.object({ sparePartId: z.string(), quantity: z.number() })).optional(),
  cycleUpdate: z
    .object({
      cycleValue: z.number().min(1, "Intervall muss mindestens 1 sein."),
      cycleUnit: z.enum(["DAYS", "WEEKS", "MONTHS", "OPERATING_HOURS", "CYCLES"]),
    })
    .optional(),
});

// ============================================================================
// 2. BATCH-ACTION: BULK UPDATE PLAN ITEMS (IN EINER TRANSAKTION)
// ============================================================================

/**
 * Führt ein atomares Massen-Update auf Wartungsplan-Positionen durch.
 * Aktualisiert selektierte Checkpositionen und optional verknüpfte Wartungsplan-Intervalle
 * vollständig in einer einzigen PostgreSQL-Transaktion (ACID).
 */
export async function bulkUpdatePlanItems(
  itemIds: string[],
  changes: PlanItemBulkChanges
): Promise<{
  success: boolean;
  updatedCount: number;
  affectedPlanIds: string[];
  message?: string;
  error?: string;
  data?: { updatedCount: number; affectedPlanIds: string[]; message?: string };
}> {
  try {
    const idsValidation = validateWithZod(
      z.array(z.string().min(1)).min(1, "Mindestens eine Position muss ausgewählt sein."),
      itemIds
    );
    if (!idsValidation.success) {
      return {
        success: false,
        updatedCount: 0,
        affectedPlanIds: [],
        error: idsValidation.error,
        message: idsValidation.error,
      };
    }

    const changesValidation = validateWithZod(bulkChangesSchema, changes);
    if (!changesValidation.success) {
      return {
        success: false,
        updatedCount: 0,
        affectedPlanIds: [],
        error: changesValidation.error,
        message: changesValidation.error,
      };
    }
    const validChanges = changesValidation.data;

    return await db.transaction(async (tx) => {
      const now = new Date();

      // 1. Positionen in DB validieren und übergeordnete Pläne ermitteln
      const existingItems = await tx.query.maintenancePlanItems.findMany({
        where: inArray(maintenancePlanItems.id, itemIds),
      });

      if (existingItems.length === 0) {
        return {
          success: false,
          updatedCount: 0,
          affectedPlanIds: [],
          error: "Keine der angegebenen Wartungspositionen wurde in der Datenbank gefunden.",
          message: "Keine der angegebenen Wartungspositionen wurde in der Datenbank gefunden.",
        };
      }

      // 2. Update-Payload für die Positionen zusammenstellen
      const itemUpdates: Record<string, any> = {
        updatedAt: now,
      };

      if (validChanges.title !== undefined) itemUpdates.title = validChanges.title;
      if (validChanges.taskDescription !== undefined) itemUpdates.taskDescription = validChanges.taskDescription;
      if (validChanges.assignedRoleId !== undefined) itemUpdates.assignedRoleId = validChanges.assignedRoleId || null;
      if (validChanges.inspectionTemplateId !== undefined) itemUpdates.inspectionTemplateId = validChanges.inspectionTemplateId || null;
      if (validChanges.equipmentId !== undefined) itemUpdates.equipmentId = validChanges.equipmentId || null;
      if (validChanges.functionalLocationId !== undefined) itemUpdates.functionalLocationId = validChanges.functionalLocationId || null;
      if (validChanges.estimatedDurationMinutes !== undefined) itemUpdates.estimatedDurationMinutes = validChanges.estimatedDurationMinutes;
      if (validChanges.isActive !== undefined) itemUpdates.isActive = validChanges.isActive;
      if (validChanges.plannedSparePartsJson !== undefined) itemUpdates.plannedSparePartsJson = validChanges.plannedSparePartsJson;

      // 3. Positionen in der Transaktion aktualisieren
      await tx
        .update(maintenancePlanItems)
        .set(itemUpdates)
        .where(inArray(maintenancePlanItems.id, itemIds));

      // 4. Falls ein Zyklus-Update vorliegt, übergeordnete Wartungspläne aktualisieren
      const affectedPlanIds = Array.from(
        new Set(existingItems.map((item) => item.maintenancePlanId))
      );

      if (validChanges.cycleUpdate && affectedPlanIds.length > 0) {
        await tx
          .update(maintenancePlans)
          .set({
            cycleValue: validChanges.cycleUpdate.cycleValue,
            cycleUnit: validChanges.cycleUpdate.cycleUnit,
            updatedAt: now,
          })
          .where(inArray(maintenancePlans.id, affectedPlanIds));
      }

      safeRevalidatePath("/maintenance-plans");
      safeRevalidatePath("/planning");

      const message = `${existingItems.length} Positionen erfolgreich in einer Transaktion aktualisiert.`;
      return {
        success: true,
        updatedCount: existingItems.length,
        affectedPlanIds,
        message,
        data: {
          updatedCount: existingItems.length,
          affectedPlanIds,
          message,
        },
      };
    });
  } catch (err: any) {
    console.error("Fehler in bulkUpdatePlanItems:", err);
    return {
      success: false,
      updatedCount: 0,
      affectedPlanIds: [],
      error: err?.message || "Fehler beim Massen-Update der Wartungsplanpositionen.",
      message: err?.message || "Fehler beim Massen-Update der Wartungsplanpositionen.",
    };
  }
}

/**
 * Adapter-Funktion für Komponenten, die ein Payload-Objekt anstelle getrennter Argumente übergeben.
 */
export async function bulkUpdatePlanItemsAction(
  payload: BulkUpdatePlanItemsPayload
): Promise<{
  success: boolean;
  updatedCount: number;
  affectedPlanIds?: string[];
  message?: string;
  error?: string;
  data?: any;
}> {
  const itemIds = payload.itemIds;
  const mergedChanges: PlanItemBulkChanges = {
    ...(payload.updates || {}),
    ...(payload.changes || {}),
    cycleUpdate: payload.cycleUpdate || payload.changes?.cycleUpdate,
  };

  return await bulkUpdatePlanItems(itemIds, mergedChanges);
}

// ============================================================================
// 3. EINZELPOSITION & INSPEKTIONSVORLAGEN ACTIONS
// ============================================================================

export async function updatePlanItemInlineAction(
  itemId: string,
  field: "title" | "estimatedDurationMinutes" | "assignedRoleId" | "inspectionTemplateId" | "equipmentId" | "functionalLocationId",
  value: any
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const validation = validateWithZod(
      z.object({
        itemId: z.string().min(1, "Positions-ID ist erforderlich."),
        field: z.enum([
          "title",
          "estimatedDurationMinutes",
          "assignedRoleId",
          "inspectionTemplateId",
          "equipmentId",
          "functionalLocationId",
        ]),
      }),
      { itemId, field }
    );
    if (!validation.success) {
      return { success: false, error: validation.error };
    }

    await db
      .update(maintenancePlanItems)
      .set({
        [field]: value,
        updatedAt: new Date(),
      })
      .where(eq(maintenancePlanItems.id, itemId));

    safeRevalidatePath("/maintenance-plans");
    return { success: true, data: { itemId, field, value } };
  } catch (err: any) {
    return { success: false, error: err?.message || "Fehler beim Aktualisieren der Wartungsposition." };
  }
}

const saveInspectionTemplateSchema = z.object({
  tenantId: z.string().min(1, "Tenant-ID ist erforderlich."),
  code: z.string().trim().min(1, "Template-Code ist erforderlich."),
  name: z.string().trim().min(1, "Name ist erforderlich."),
  description: z.string().optional(),
  schemaJson: z.any(),
  estimatedDurationMinutes: z.number().optional(),
});

export async function saveInspectionTemplateAction(payload: {
  tenantId: string;
  code: string;
  name: string;
  description?: string;
  schemaJson: InspectionTemplateSchema;
  estimatedDurationMinutes?: number;
}): Promise<{ success: boolean; id?: string; version?: number; data?: any; error?: string }> {
  try {
    const validation = validateWithZod(saveInspectionTemplateSchema, payload);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const validated = validation.data;

    const existing = await db.query.inspectionTemplates.findFirst({
      where: eq(inspectionTemplates.code, validated.code),
    });

    if (existing) {
      const nextVersion = existing.version + 1;
      await db
        .update(inspectionTemplates)
        .set({
          name: validated.name,
          description: validated.description || null,
          schemaJson: validated.schemaJson,
          version: nextVersion,
          estimatedDurationMinutes: validated.estimatedDurationMinutes || 30,
          updatedAt: new Date(),
        })
        .where(eq(inspectionTemplates.id, existing.id));

      safeRevalidatePath("/inspections");
      return {
        success: true,
        id: existing.id,
        version: nextVersion,
        data: { id: existing.id, version: nextVersion },
      };
    } else {
      const [created] = await db
        .insert(inspectionTemplates)
        .values({
          tenantId: validated.tenantId,
          code: validated.code,
          name: validated.name,
          description: validated.description || null,
          schemaJson: validated.schemaJson,
          version: 1,
          estimatedDurationMinutes: validated.estimatedDurationMinutes || 30,
        })
        .returning();

      safeRevalidatePath("/inspections");
      return {
        success: true,
        id: created.id,
        version: 1,
        data: { id: created.id, version: 1 },
      };
    }
  } catch (err: any) {
    console.error("Fehler in saveInspectionTemplateAction:", err);
    return { success: false, error: err?.message || "Fehler beim Speichern der Inspektionsvorlage." };
  }
}

/**
 * Server Action: Lädt ein Prüfprotokoll / Inspektionsvorlage anhand der ID
 * - Sichere 404/Not-Found-Rückgabe
 */
export async function getInspectionTemplateAction(
  templateId: string,
  tenantId?: string
): Promise<ActionResult<any, { template: any | null }>> {
  try {
    const validation = validateWithZod(z.string().trim().min(1, "Ungültige Template-ID."), templateId);
    if (!validation.success) {
      return actionError(validation.error, { template: null });
    }

    const cleanId = validation.data;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);

    const condition = isUuid
      ? eq(inspectionTemplates.id, cleanId)
      : eq(inspectionTemplates.code, cleanId);

    const template = await db.query.inspectionTemplates.findFirst({
      where: tenantId ? and(condition, eq(inspectionTemplates.tenantId, tenantId)) : condition,
    });

    if (!template) {
      return actionError(`Prüfprotokoll mit ID '${cleanId}' nicht gefunden (404).`, { template: null });
    }

    return actionSuccess(template, { template });
  } catch (err: any) {
    return actionError(err?.message || "Fehler beim Laden des Prüfprotokolls.", { template: null });
  }
}
