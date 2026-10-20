"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  orderTypes,
  workflowTransitions,
  workflowStatuses,
  roles,
  WorkflowGuardCondition,
} from "@/lib/db/schema";

export async function createOrderTypeAction(formData: FormData) {
  const tenantId = formData.get("tenantId") as string;
  const code = (formData.get("code") as string)?.trim().toUpperCase();
  const name = (formData.get("name") as string)?.trim();
  const description = (formData.get("description") as string)?.trim();
  const sapOrderTypeCode = (formData.get("sapOrderTypeCode") as string)?.trim().toUpperCase();
  const colorHex = (formData.get("colorHex") as string) || "#3B82F6";
  const iconName = (formData.get("iconName") as string) || "Wrench";

  if (!tenantId || !code || !name) {
    throw new Error("Mandant, Kürzel und Name der Auftragsart sind Pflichtfelder.");
  }

  // 1. Auftragsart anlegen
  const [createdOrderType] = await db
    .insert(orderTypes)
    .values({
      tenantId,
      code,
      name,
      description: description || null,
      sapOrderTypeCode: sapOrderTypeCode || null,
      colorHex,
      iconName,
      isActive: true,
    })
    .returning();

  // 2. Standard-Workflow initialisieren (CREATED -> RELEASED -> IN_WORK -> COMPLETED -> CLOSED)
  const allStatuses = await db.query.workflowStatuses.findMany({
    where: eq(workflowStatuses.tenantId, tenantId),
    orderBy: (statuses, { asc }) => [asc(statuses.sortOrder)],
  });

  const createdStatus = allStatuses.find((s) => s.category === "DRAFT" || s.code === "CREATED");
  const releasedStatus = allStatuses.find((s) => s.category === "OPEN" || s.code === "RELEASED");
  const inWorkStatus = allStatuses.find((s) => s.category === "IN_PROGRESS" || s.code === "IN_WORK");
  const completedStatus = allStatuses.find((s) => s.category === "COMPLETED" || s.code === "TECH_COMPLETED");
  const closedStatus = allStatuses.find((s) => s.category === "CLOSED" || s.code === "CLOSED");

  // Rollen laden für Standard-Zuordnung
  const technicianRole = await db.query.roles.findFirst({
    where: and(eq(roles.tenantId, tenantId), eq(roles.code, "TECHNICIAN")),
  });
  const plannerRole = await db.query.roles.findFirst({
    where: and(eq(roles.tenantId, tenantId), eq(roles.code, "MAINT_PLANNER")),
  });

  // Standard-Transitionen erzeugen
  const defaultTransitions = [];

  if (createdStatus && releasedStatus) {
    defaultTransitions.push({
      tenantId,
      orderTypeId: createdOrderType.id,
      fromStatusId: createdStatus.id,
      toStatusId: releasedStatus.id,
      actionName: "Auftrag freigeben",
      requiredRoleId: plannerRole?.id || null,
      triggersSapSync: true,
      guardConditions: {},
    });
  }

  if (releasedStatus && inWorkStatus) {
    defaultTransitions.push({
      tenantId,
      orderTypeId: createdOrderType.id,
      fromStatusId: releasedStatus.id,
      toStatusId: inWorkStatus.id,
      actionName: "In Arbeit nehmen",
      requiredRoleId: technicianRole?.id || null,
      guardConditions: {},
    });
  }

  if (inWorkStatus && completedStatus) {
    defaultTransitions.push({
      tenantId,
      orderTypeId: createdOrderType.id,
      fromStatusId: inWorkStatus.id,
      toStatusId: completedStatus.id,
      actionName: "Technisch abschließen (TABG)",
      requiredRoleId: technicianRole?.id || null,
      triggersSapSync: true,
      guardConditions: {
        requireChecklistCompleted: true,
        requireActualDurationFilled: true,
      } as WorkflowGuardCondition,
    });
  }

  if (completedStatus && closedStatus) {
    defaultTransitions.push({
      tenantId,
      orderTypeId: createdOrderType.id,
      fromStatusId: completedStatus.id,
      toStatusId: closedStatus.id,
      actionName: "Kaufmännisch abschließen",
      requiredRoleId: plannerRole?.id || null,
      triggersSapSync: true,
      guardConditions: {},
    });
  }

  if (defaultTransitions.length > 0) {
    await db.insert(workflowTransitions).values(defaultTransitions);
  }

  revalidatePath("/admin/workflows");
  return { success: true, orderTypeId: createdOrderType.id };
}

export async function upsertWorkflowTransitionAction(payload: {
  tenantId: string;
  orderTypeId: string;
  fromStatusId: string;
  toStatusId: string;
  requiredRoleId: string | null;
  actionName: string;
  isEnabled: boolean;
  guardConditions?: WorkflowGuardCondition;
  triggersSapSync?: boolean;
}) {
  const {
    tenantId,
    orderTypeId,
    fromStatusId,
    toStatusId,
    requiredRoleId,
    actionName,
    isEnabled,
    guardConditions = {},
    triggersSapSync = false,
  } = payload;

  const existing = await db.query.workflowTransitions.findFirst({
    where: and(
      eq(workflowTransitions.tenantId, tenantId),
      eq(workflowTransitions.orderTypeId, orderTypeId),
      eq(workflowTransitions.fromStatusId, fromStatusId),
      eq(workflowTransitions.toStatusId, toStatusId)
    ),
  });

  if (!isEnabled) {
    if (existing) {
      await db
        .update(workflowTransitions)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(workflowTransitions.id, existing.id));
    }
  } else {
    if (existing) {
      await db
        .update(workflowTransitions)
        .set({
          requiredRoleId: requiredRoleId || null,
          actionName: actionName || existing.actionName,
          guardConditions,
          triggersSapSync,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(workflowTransitions.id, existing.id));
    } else {
      await db.insert(workflowTransitions).values({
        tenantId,
        orderTypeId,
        fromStatusId,
        toStatusId,
        requiredRoleId: requiredRoleId || null,
        actionName: actionName || "Status ändern",
        guardConditions,
        triggersSapSync,
        isActive: true,
      });
    }
  }

  revalidatePath("/admin/workflows");
  return { success: true };
}
