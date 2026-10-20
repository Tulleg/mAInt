"use server";

import { revalidatePath } from "next/cache";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  maintenancePlanItems,
  maintenancePlans,
  inspectionTemplates,
  InspectionTemplateSchema,
} from "@/lib/db/schema";

export async function saveInspectionTemplateAction(payload: {
  tenantId: string;
  code: string;
  name: string;
  description?: string;
  schemaJson: InspectionTemplateSchema;
  estimatedDurationMinutes?: number;
}) {
  const { tenantId, code, name, description, schemaJson, estimatedDurationMinutes = 30 } = payload;

  const existing = await db.query.inspectionTemplates.findFirst({
    where: eq(inspectionTemplates.code, code),
  });

  if (existing) {
    await db
      .update(inspectionTemplates)
      .set({
        name,
        description: description || null,
        schemaJson,
        version: existing.version + 1,
        estimatedDurationMinutes,
        updatedAt: new Date(),
      })
      .where(eq(inspectionTemplates.id, existing.id));

    revalidatePath("/inspections");
    return { success: true, id: existing.id, version: existing.version + 1 };
  } else {
    const [created] = await db
      .insert(inspectionTemplates)
      .values({
        tenantId,
        code,
        name,
        description: description || null,
        schemaJson,
        version: 1,
        estimatedDurationMinutes,
      })
      .returning();

    revalidatePath("/inspections");
    return { success: true, id: created.id, version: 1 };
  }
}

export async function updatePlanItemInlineAction(
  itemId: string,
  field: "title" | "estimatedDurationMinutes" | "assignedRoleId" | "inspectionTemplateId" | "equipmentId",
  value: any
) {
  await db
    .update(maintenancePlanItems)
    .set({
      [field]: value,
      updatedAt: new Date(),
    })
    .where(eq(maintenancePlanItems.id, itemId));

  revalidatePath("/maintenance-plans");
  return { success: true };
}

export async function bulkUpdatePlanItemsAction(payload: {
  itemIds: string[];
  updates: {
    assignedRoleId?: string | null;
    inspectionTemplateId?: string | null;
    equipmentId?: string | null;
    estimatedDurationMinutes?: number;
  };
  cycleUpdate?: {
    cycleValue: number;
    cycleUnit: "DAYS" | "WEEKS" | "MONTHS" | "OPERATING_HOURS" | "CYCLES";
  };
}) {
  const { itemIds, updates, cycleUpdate } = payload;

  if (!itemIds || itemIds.length === 0) {
    return { success: false, message: "Keine Positionen ausgewählt." };
  }

  // 1. Bulk-Update auf den Positionen ausführen
  const itemUpdateFields: Record<string, any> = {
    updatedAt: new Date(),
  };

  if (updates.assignedRoleId !== undefined) {
    itemUpdateFields.assignedRoleId = updates.assignedRoleId || null;
  }
  if (updates.inspectionTemplateId !== undefined) {
    itemUpdateFields.inspectionTemplateId = updates.inspectionTemplateId || null;
  }
  if (updates.equipmentId !== undefined) {
    itemUpdateFields.equipmentId = updates.equipmentId || null;
  }
  if (updates.estimatedDurationMinutes !== undefined) {
    itemUpdateFields.estimatedDurationMinutes = updates.estimatedDurationMinutes;
  }

  await db
    .update(maintenancePlanItems)
    .set(itemUpdateFields)
    .where(inArray(maintenancePlanItems.id, itemIds));

  // 2. Falls ein Prüfintervall geändert wurde (z.B. 30d -> 90d), übergeordnete Pläne updaten
  if (cycleUpdate) {
    const items = await db.query.maintenancePlanItems.findMany({
      where: inArray(maintenancePlanItems.id, itemIds),
    });

    const planIds = Array.from(new Set(items.map((i) => i.maintenancePlanId)));

    if (planIds.length > 0) {
      await db
        .update(maintenancePlans)
        .set({
          cycleValue: cycleUpdate.cycleValue,
          cycleUnit: cycleUpdate.cycleUnit,
          updatedAt: new Date(),
        })
        .where(inArray(maintenancePlans.id, planIds));
    }
  }

  revalidatePath("/maintenance-plans");
  return { success: true, updatedCount: itemIds.length };
}
