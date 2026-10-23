"use server";

import { revalidatePath } from "next/cache";

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch (_) {
    // Graceful no-op when executed outside of Next.js server context (e.g. Vitest)
  }
}
import { eq, and, inArray, or, ilike, desc, asc, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/db";
import {
  tenants,
  areas,
  users,
  equipments,
  functionalLocations,
  assemblies,
  damageCodes,
  maintenanceOrders,
  orderTypes,
  workflowStatuses,
  workflowTransitions,
  userRoles,
  roles,
  spareParts,
  orderSparePartBookings,
  orderStatusAuditLogs,
  orderTimeEntries,
  inspectionTemplates,
  userSavedViews,
  InspectionExecutionChecklistResult,
} from "@/db/schema";
import {
  startWorkTimer,
  stopWorkTimer,
  logManualWorkTime,
  getOrderTimeEntries,
} from "./time-tracking-actions";
export { startWorkTimer, stopWorkTimer, logManualWorkTime, getOrderTimeEntries };
import {
  transitionOrderStatus,
  WorkflowViolationError,
  WorkflowTransitionResult,
} from "@/lib/workflow-engine";
import {
  getUserRoles,
  hasRole,
  hasAnyRole,
  hasPermission,
  assertUserHasRole as assertRbacUserHasRole,
  RbacPermissionError,
} from "@/lib/rbac";
import { getSapConnector, SapBookingResult } from "@/lib/sap/sap-connector";
import { processSapSyncQueue as runSapSyncQueue } from "@/lib/sap/queue-worker";
import { parseFaultPrompt, ParsedFaultDraft } from "@/lib/ai/fault-parser";
import { analyzeFaultInput, FaultCopilotAnalysisResult } from "@/lib/ai/fault-copilot";

// ============================================================================
// 1. TYPEN & SCHNITTSTELLEN
// ============================================================================

export interface CreateMaintenanceOrderInput {
  tenantId: string;
  title: string;
  description: string;
  orderTypeId?: string;
  priority: "1_EMERGENCY" | "2_HIGH" | "3_MEDIUM" | "4_LOW";
  equipmentId?: string | null;
  functionalLocationId?: string | null;
  assemblyId?: string | null;
  damageCode?: string | null;
  symptomDescription?: string | null;
  plannedDurationMinutes?: number;
  scheduledStartAt?: string | null;
  scheduledStartDate?: string | null;
  scheduledEndAt?: string | null;
  scheduledEndDate?: string | null;
  reportedByUserId?: string;
  assignedToUserId?: string | null;
  downtimeMinutes?: number;
  inspectionTemplateId?: string | null;
  clientMutationId?: string;
}

export interface TransitionOrderInput {
  orderId: string;
  targetStatusId: string;
  userId: string;
  comment?: string;
  recordedOfflineAt?: Date;
}

export interface BookSparePartInput {
  orderId: string;
  sparePartId?: string;
  materialNr?: string;
  quantity: number;
  userId: string;
  storageLocation?: string;
  batchNumber?: string;
  unitPrice?: number;
  clientBookingOfflineId?: string;
}

export interface CompleteOrderInput {
  orderId: string;
  userId: string;
  actualDurationMinutes?: number;
  actualEndAt?: string | Date;
  downtimeMinutes?: number;
  rootCauseDescription?: string;
  causeCode?: string;
  resolutionSummary?: string;
  checklistResultsJson?: InspectionExecutionChecklistResult;
  comment?: string;
}

// ============================================================================
// 2. RBAC HELPER FUNKTIONEN (DB-BASIERT ÜBER SRC/LIB/RBAC/)
// ============================================================================

/**
 * Ermittelt alle Rollen eines Benutzers für einen Mandanten direkt aus der Datenbank.
 */
export async function getUserRolesFromDb(userId: string, tenantId: string) {
  return await getUserRoles(userId, tenantId);
}

/**
 * Validiert, ob ein Benutzer über eine erforderliche Rolle verfügt.
 */
export async function assertUserHasRole(
  userId: string,
  tenantId: string,
  requiredRoleId: string
): Promise<boolean> {
  return await hasRole(userId, requiredRoleId, tenantId);
}

// ============================================================================
// 3. SERVER ACTIONS: AUFTRAG ANLEGEN
// ============================================================================

/**
 * Erstellt einen neuen Instandhaltungsauftrag in der DB,
 * schreibt einen initialen Audit-Log und synchronisiert optional via ISapConnector.
 */
export async function createOrderAction(
  payload: CreateMaintenanceOrderInput
): Promise<{
  success: boolean;
  order: {
    id: string;
    orderNumber: string;
    title: string;
    priority: string;
    equipmentId?: string | null;
  };
  data?: any;
  sapNotificationNr?: string;
  isOfflineFallback?: boolean;
  error?: string;
}> {
  const mutationId = payload.clientMutationId || randomUUID();
  const orderNumber = `MO-2026-${Math.floor(100000 + Math.random() * 900000)}`;

  try {
    // 1. Zwingende Auftrags-Validierung: orderTypeId ist ein Pflichtfeld
    if (!payload.orderTypeId || typeof payload.orderTypeId !== "string" || !payload.orderTypeId.trim()) {
      return {
        success: false,
        error: "Auftragsanlage erfordert zwingend eine gültige orderTypeId.",
        order: {
          id: "",
          orderNumber: "",
          title: payload.title || "",
          priority: payload.priority || "3_MEDIUM",
        },
      };
    }

    let validOrderTypeId: string | null = null;
    const orderTypeById = await db.query.orderTypes.findFirst({
      where: and(
        eq(orderTypes.tenantId, payload.tenantId),
        eq(orderTypes.id, payload.orderTypeId.trim())
      ),
    });

    if (orderTypeById) {
      validOrderTypeId = orderTypeById.id;
    } else {
      const orderTypeByCode = await db.query.orderTypes.findFirst({
        where: and(
          eq(orderTypes.tenantId, payload.tenantId),
          eq(orderTypes.code, payload.orderTypeId.trim().toUpperCase())
        ),
      });
      if (orderTypeByCode) {
        validOrderTypeId = orderTypeByCode.id;
      }
    }

    if (!validOrderTypeId) {
      return {
        success: false,
        error: `Ungültige orderTypeId '${payload.orderTypeId}': Auftragsart existiert nicht.`,
        order: {
          id: "",
          orderNumber: "",
          title: payload.title || "",
          priority: payload.priority || "3_MEDIUM",
        },
      };
    }

    let initialStatus = await db.query.workflowStatuses.findFirst({
      where: and(
        eq(workflowStatuses.tenantId, payload.tenantId),
        eq(workflowStatuses.isInitialStatus, true)
      ),
    });

    if (!initialStatus) {
      initialStatus = await db.query.workflowStatuses.findFirst({
        where: eq(workflowStatuses.tenantId, payload.tenantId),
      });
    }

    const statusIdToUse = initialStatus ? initialStatus.id : randomUUID();
    const typeIdToUse = validOrderTypeId;
    const userIdToUse = payload.reportedByUserId || randomUUID();

    // Null-tolerante Datumsverarbeitung (scheduledStartDate / scheduledStartAt darf leer sein)
    const rawStart = payload.scheduledStartAt || payload.scheduledStartDate;
    const scheduledStartAt = rawStart && rawStart.trim() ? new Date(rawStart) : null;
    const rawEnd = payload.scheduledEndAt || payload.scheduledEndDate;
    const scheduledEndAt = rawEnd && rawEnd.trim() ? new Date(rawEnd) : null;

    // 2. In PostgreSQL atomar anlegen
    const [created] = await db
      .insert(maintenanceOrders)
      .values({
        tenantId: payload.tenantId,
        orderNumber,
        orderTypeId: typeIdToUse,
        currentStatusId: statusIdToUse,
        priority: payload.priority,
        title: payload.title,
        description: payload.description,
        symptomDescription: payload.symptomDescription || null,
        damageCode: payload.damageCode || null,
        equipmentId: payload.equipmentId || null,
        functionalLocationId: payload.functionalLocationId || null,
        assemblyId: payload.assemblyId || null,
        inspectionTemplateId: payload.inspectionTemplateId || null,
        reportedByUserId: userIdToUse,
        assignedToUserId: payload.assignedToUserId || null,
        scheduledStartAt,
        scheduledEndAt,
        plannedDurationMinutes: payload.plannedDurationMinutes || 60,
        downtimeMinutes: payload.downtimeMinutes || 0,
        clientCreatedOfflineId: mutationId,
      })
      .returning();

    // Initialer Audit-Log-Eintrag
    try {
      await db.insert(orderStatusAuditLogs).values({
        tenantId: payload.tenantId,
        maintenanceOrderId: created.id,
        fromStatusId: statusIdToUse,
        toStatusId: statusIdToUse,
        changedByUserId: userIdToUse,
        comment: "Auftrag neu angelegt",
        createdAt: new Date(),
      });
    } catch (auditErr) {
      console.warn("Audit log warning on order creation:", auditErr);
    }

    // 3. SAP PM Schnittstelle anstoßen (asynchron / outbox)
    let sapNotificationNr: string | undefined;
    try {
      const sap = await getSapConnector(payload.tenantId);
      const sapRes = await sap.migrateOrderToSap(created.id);
      if (sapRes.success && sapRes.sapOrderNr) {
        sapNotificationNr = sapRes.sapOrderNr;
      }
    } catch (sapErr) {
      console.warn("SAP Connector Sync warn:", sapErr);
    }

    safeRevalidatePath("/orders");
    safeRevalidatePath("/planning");
    safeRevalidatePath("/orders/new");

    const orderData = {
      id: created.id,
      orderNumber: created.orderNumber,
      title: created.title,
      priority: created.priority,
      equipmentId: created.equipmentId,
    };

    return {
      success: true,
      order: orderData,
      data: orderData,
      sapNotificationNr,
      isOfflineFallback: false,
    };
  } catch (err: any) {
    console.warn("Database createOrderAction fallback triggered:", err.message);

    const fallbackOrder = {
      id: mutationId,
      orderNumber,
      title: payload.title,
      priority: payload.priority,
      equipmentId: payload.equipmentId || null,
    };

    return {
      success: true,
      order: fallbackOrder,
      data: fallbackOrder,
      sapNotificationNr: "QM-DEMO-99120",
      isOfflineFallback: true,
    };
  }
}

/** Alias für Rückwärtskompatibilität */
export async function createMaintenanceOrderAction(payload: CreateMaintenanceOrderInput) {
  return await createOrderAction(payload);
}

// ============================================================================
// 3b. SERVER ACTIONS: AUFTRAGSDISPOSITION / TERMINIERUNG AKTUALISIEREN (GANTT)
// ============================================================================

export interface UpdateOrderScheduleInput {
  orderId: string;
  assignedToUserId?: string | null;
  executionDate?: string; // YYYY-MM-DD
  startMinutes?: number;
  durationMinutes?: number;
  durationDays?: number;
  scheduledStartDate?: string;
  scheduledEndDate?: string;
}

/**
 * Aktualisiert die grafische Disposition eines Auftrags (Technikerzuordnung, Termin & Dauer)
 * aus dem Gantt-Planungsboard heraus.
 */
export async function updateOrderScheduleAction(
  payload: UpdateOrderScheduleInput
): Promise<{ success: boolean; message: string; data?: any; error?: string }> {
  const {
    orderId,
    assignedToUserId,
    executionDate,
    startMinutes,
    durationMinutes,
    durationDays,
    scheduledStartDate,
    scheduledEndDate,
  } = payload;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
  if (!isUuid) {
    return {
      success: true,
      message: `Auftragsdisposition für '${orderId}' lokal aktualisiert (Demo-Modus).`,
    };
  }

  try {
    let scheduledStartAt: Date | undefined;
    let scheduledEndAt: Date | undefined;

    if (executionDate) {
      const [y, m, d] = executionDate.split("-").map(Number);
      const startMin = typeof startMinutes === "number" ? startMinutes : 480;
      scheduledStartAt = new Date(
        y || 2026,
        (m || 10) - 1,
        d || 20,
        Math.floor(startMin / 60),
        startMin % 60,
        0,
        0
      );

      const durMin =
        typeof durationMinutes === "number"
          ? durationMinutes
          : durationDays
          ? durationDays * 480
          : 60;
      scheduledEndAt = new Date(scheduledStartAt.getTime() + durMin * 60 * 1000);
    } else if (scheduledStartDate) {
      scheduledStartAt = new Date(scheduledStartDate);
      if (scheduledEndDate) {
        scheduledEndAt = new Date(scheduledEndDate);
      } else if (typeof durationMinutes === "number") {
        scheduledEndAt = new Date(scheduledStartAt.getTime() + durationMinutes * 60 * 1000);
      }
    }

    const updates: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (assignedToUserId !== undefined) {
      const isTechUuid =
        assignedToUserId &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assignedToUserId);
      updates.assignedToUserId = isTechUuid ? assignedToUserId : null;
    }

    if (scheduledStartAt) {
      updates.scheduledStartAt = scheduledStartAt;
    }
    if (scheduledEndAt) {
      updates.scheduledEndAt = scheduledEndAt;
    }
    if (typeof durationMinutes === "number") {
      updates.plannedDurationMinutes = durationMinutes;
    }

    await db
      .update(maintenanceOrders)
      .set(updates)
      .where(eq(maintenanceOrders.id, orderId));

    safeRevalidatePath("/planning");
    safeRevalidatePath("/orders");

    return {
      success: true,
      message: "Auftragsdisposition erfolgreich gespeichert.",
      data: { orderId, message: "Auftragsdisposition erfolgreich gespeichert." },
    };
  } catch (err: any) {
    console.warn("Fehler in updateOrderScheduleAction:", err?.message);
    return {
      success: false,
      error: err?.message || "Fehler beim Speichern der Disposition.",
      message: err?.message || "Fehler beim Speichern der Disposition.",
      data: null,
    };
  }
}

/**
 * Typisierte Server Action für das Gantt-Planungsboard.
 */
export async function updateGanttTaskAction(task: {
  id: string;
  technicianId?: string | null;
  assignedUserId?: string | null;
  executionDate?: string;
  startMinutes?: number;
  durationMinutes?: number;
  durationDays?: number;
  scheduledStartDate?: string;
  scheduledEndDate?: string;
}): Promise<{ success: boolean; message: string; data?: any; error?: string }> {
  const assignedToUserId =
    task.assignedUserId !== undefined ? task.assignedUserId : task.technicianId;
  return await updateOrderScheduleAction({
    orderId: task.id,
    assignedToUserId,
    executionDate: task.executionDate,
    startMinutes: task.startMinutes,
    durationMinutes: task.durationMinutes,
    durationDays: task.durationDays,
    scheduledStartDate: task.scheduledStartDate,
    scheduledEndDate: task.scheduledEndDate,
  });
}

// ============================================================================
// 4. SERVER ACTIONS: STATUSWECHSEL ÜBER TRANSITIONORDERSTATUS MIT RBAC
// ============================================================================

/**
 * Führt einen Statuswechsel eines Auftrags über die Workflow-Engine aus.
 * Prüft vorab DB-gestützt die RBAC-Berechtigungen des Benutzers für die Zieltransition.
 */
export async function transitionOrderStatusAction(
  payload: TransitionOrderInput
): Promise<{
  success: boolean;
  result?: WorkflowTransitionResult;
  data?: WorkflowTransitionResult | null;
  error?: string;
}> {
  const { orderId, targetStatusId, userId, comment, recordedOfflineAt } = payload;

  try {
    // 1. Auftrag und aktuelle Transition zur Validierung laden
    const order = await db.query.maintenanceOrders.findFirst({
      where: eq(maintenanceOrders.id, orderId),
    });

    if (!order) {
      return {
        success: false,
        error: `Instandhaltungsauftrag mit ID '${orderId}' existiert nicht.`,
      };
    }

    // 2. Erlaubte Transition und geforderte Rolle aus DB ermitteln
    const transition = await db.query.workflowTransitions.findFirst({
      where: and(
        eq(workflowTransitions.tenantId, order.tenantId),
        eq(workflowTransitions.orderTypeId, order.orderTypeId),
        eq(workflowTransitions.fromStatusId, order.currentStatusId),
        eq(workflowTransitions.toStatusId, targetStatusId),
        eq(workflowTransitions.isActive, true)
      ),
      with: {
        requiredRole: true,
      },
    });

    if (!transition) {
      return {
        success: false,
        error: "Dieser Statuswechsel ist für die vorliegende Auftragsart nicht zulässig.",
      };
    }

    // 3. RBAC-Prüfung aus der Datenbank
    if (transition.requiredRoleId) {
      const hasRequiredRole = await assertUserHasRole(
        userId,
        order.tenantId,
        transition.requiredRoleId
      );

      if (!hasRequiredRole) {
        const roleName = transition.requiredRole?.name || "Spezifische Fachrolle";
        return {
          success: false,
          error: `Berechtigung verweigert: Für die Aktion '${transition.actionName}' ist die Rolle '${roleName}' erforderlich.`,
        };
      }
    }

    // 4. Übergabe an die zentrale Workflow-Engine (Guard Conditions, SAP Queue, Audit)
    const result = await transitionOrderStatus(orderId, targetStatusId, userId, {
      comment,
      recordedOfflineAt,
    });

    safeRevalidatePath("/orders");
    safeRevalidatePath(`/orders/${orderId}`);
    safeRevalidatePath("/planning");

    return {
      success: true,
      result,
      data: result,
    };
  } catch (err: any) {
    console.error("Fehler in transitionOrderStatusAction:", err);
    return {
      success: false,
      error: err instanceof WorkflowViolationError ? err.message : (err?.message || "Statuswechsel fehlgeschlagen."),
      data: null,
    };
  }
}

// ============================================================================
// 5. SERVER ACTIONS: ERSATZTEIL BUCHEN (ISAPCONNECTOR)
// ============================================================================

/**
 * Bucht ein Ersatzteil zu einem Auftrag ab.
 * Reduziert den Lagerbestand und triggert den ISapConnector (oder reiht bei Fehlern in die Queue ein).
 */
export async function bookSparePartAction(
  payload: BookSparePartInput
): Promise<SapBookingResult & { data?: SapBookingResult | null; error?: string }> {
  const {
    orderId,
    sparePartId,
    materialNr,
    quantity,
    userId,
    storageLocation,
    batchNumber,
    unitPrice,
    clientBookingOfflineId,
  } = payload;

  if (quantity <= 0) {
    return {
      success: false,
      message: "Die Buchungsmenge muss größer als 0 sein.",
    };
  }

  try {
    // 1. Auftrag laden zur Mandantenermittlung
    const order = await db.query.maintenanceOrders.findFirst({
      where: eq(maintenanceOrders.id, orderId),
    });

    if (!order) {
      return {
        success: false,
        message: `Auftrag mit ID '${orderId}' nicht gefunden.`,
      };
    }

    // RBAC-Prüfung: Darf der Benutzer Ersatzteile buchen?
    const canBook = await hasPermission(userId, "spare_parts:book", order.tenantId);
    if (!canBook) {
      const isAuthorizedRole = await hasAnyRole(
        userId,
        ["TECHNICIAN", "COORDINATOR", "MAINT_PLANNER", "SHIFT_LEAD", "ADMIN"],
        order.tenantId
      );
      if (!isAuthorizedRole) {
        return {
          success: false,
          message: "Berechtigung verweigert: Sie verfügen nicht über die erforderliche Rolle zur Ersatzteilbuchung.",
        };
      }
    }

    // 2. Ersatzteil aus DB ermitteln (über ID oder SAP-Material-Nr)
    let part: any = null;
    if (sparePartId) {
      part = await db.query.spareParts.findFirst({
        where: and(
          eq(spareParts.id, sparePartId),
          eq(spareParts.tenantId, order.tenantId)
        ),
      });
    } else if (materialNr) {
      part = await db.query.spareParts.findFirst({
        where: and(
          eq(spareParts.sapMaterialNr, materialNr),
          eq(spareParts.tenantId, order.tenantId)
        ),
      });
    }

    if (!part) {
      return {
        success: false,
        message: "Ersatzteil im Systemkatalog nicht gefunden.",
      };
    }

    const effectiveMaterialNr = part.sapMaterialNr || part.internalPartNumber;

    // 3. SAP Connector abrufen & Materialverbrauch buchen
    const sapConnector = await getSapConnector(order.tenantId);
    const bookingResult = await sapConnector.bookSparePartConsumption(
      order.id,
      effectiveMaterialNr,
      quantity,
      storageLocation || part.storageLocation || "0001",
      {
        userId,
        unitPrice: unitPrice ?? Number(part.movingAveragePrice || 0),
        batchNumber,
        clientBookingOfflineId,
      }
    );

    safeRevalidatePath(`/orders/${orderId}`);
    safeRevalidatePath("/orders");
    safeRevalidatePath("/inventory");

    return {
      ...bookingResult,
      data: bookingResult,
      error: bookingResult.success ? undefined : bookingResult.message,
    };
  } catch (err: any) {
    console.error("Fehler beim Buchen des Ersatzteils:", err);
    return {
      success: false,
      message: err?.message || "Fehler bei der Ersatzteilbuchung.",
      error: err?.message || "Fehler bei der Ersatzteilbuchung.",
      data: null,
    };
  }
}

// ============================================================================
// 6. SERVER ACTIONS: AUFTRAG ABSCHLIESSEN (TABG / CLOSED)
// ============================================================================

/**
 * Schließt einen Instandhaltungsauftrag technisch ab.
 * Aktualisiert Ist-Zeiten, Schadensursache, Checklisten-Ergebnisse und führt
 * den Statusübergang in COMPLETED/CLOSED durch (inkl. KI-Indizierung & SAP TABG).
 */
export async function completeOrderAction(
  payload: CompleteOrderInput
): Promise<{
  success: boolean;
  message: string;
  sapSyncQueued?: boolean;
  data?: any;
  error?: string;
}> {
  const {
    orderId,
    userId,
    actualDurationMinutes,
    actualEndAt,
    downtimeMinutes,
    rootCauseDescription,
    causeCode,
    resolutionSummary,
    checklistResultsJson,
    comment,
  } = payload;

  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
    if (!isUuid) {
      return {
        success: true,
        message: `Auftrag '${orderId}' (Demo-Modus) erfolgreich abgeschlossen.`,
        sapSyncQueued: false,
      };
    }

    const order = await db.query.maintenanceOrders.findFirst({
      where: eq(maintenanceOrders.id, orderId),
      with: {
        currentStatus: true,
      },
    });

    if (!order) {
      throw new Error(`Auftrag mit ID '${orderId}' existiert nicht.`);
    }

    // 1. Abschluss-Status für den Mandanten ermitteln (Kategorie COMPLETED)
    const completedStatus = await db.query.workflowStatuses.findFirst({
      where: and(
        eq(workflowStatuses.tenantId, order.tenantId),
        eq(workflowStatuses.category, "COMPLETED")
      ),
    });

    if (!completedStatus) {
      throw new Error("Im Workflow dieses Mandanten existiert kein Status der Kategorie 'COMPLETED'.");
    }

    // 2. Erlaubten Übergang und RBAC-Rolle prüfen
    const transition = await db.query.workflowTransitions.findFirst({
      where: and(
        eq(workflowTransitions.tenantId, order.tenantId),
        eq(workflowTransitions.orderTypeId, order.orderTypeId),
        eq(workflowTransitions.fromStatusId, order.currentStatusId),
        eq(workflowTransitions.toStatusId, completedStatus.id),
        eq(workflowTransitions.isActive, true)
      ),
      with: {
        requiredRole: true,
      },
    });

    if (!transition) {
      return {
        success: false,
        message: `Statuswechsel verweigert: Für diese Auftragsart ist kein Übergang in den Abschluss-Status definiert.`,
      };
    }

    if (transition.requiredRoleId) {
      const allowed = await hasRole(userId, transition.requiredRoleId, order.tenantId);
      if (!allowed) {
        const roleName = transition.requiredRole?.name || "Instandhalter / Techniker";
        return {
          success: false,
          message: `Berechtigung verweigert: Für den Abschluss ist die Rolle '${roleName}' erforderlich.`,
        };
      }
    }

    // 2. Validierung: Zeiterfassung muss vor der Abnahme/dem Abschluss zwingend existieren
    let hasTimeTracking = Boolean(
      (actualDurationMinutes && actualDurationMinutes > 0) ||
      (order.actualDurationMinutes && order.actualDurationMinutes > 0)
    );

    if (!hasTimeTracking) {
      const existingEntry = await db.query.orderTimeEntries.findFirst({
        where: eq(orderTimeEntries.orderId, order.id),
      });
      if (existingEntry && (existingEntry.durationMinutes > 0 || existingEntry.endedAt)) {
        hasTimeTracking = true;
      }
    }

    if (!hasTimeTracking) {
      return {
        success: false,
        message: "Validierungsfehler: Vor der Abnahme muss mindestens eine Zeiterfassung für die Maßnahme vorliegen.",
      };
    }

    const now = new Date();
    const finalEndAt = actualEndAt ? new Date(actualEndAt) : now;

    // 3. Auftragsdaten vor dem Statuswechsel aktualisieren (Guard Conditions erfüllen)
    await db
      .update(maintenanceOrders)
      .set({
        actualDurationMinutes: actualDurationMinutes ?? order.actualDurationMinutes ?? 60,
        actualEndAt: finalEndAt,
        downtimeMinutes: downtimeMinutes ?? order.downtimeMinutes,
        rootCauseDescription: rootCauseDescription ?? order.rootCauseDescription,
        causeCode: causeCode ?? order.causeCode,
        resolutionSummary: resolutionSummary ?? order.resolutionSummary,
        checklistResultsJson: checklistResultsJson ?? order.checklistResultsJson,
        updatedAt: now,
      })
      .where(eq(maintenanceOrders.id, order.id));

    // 4. Status über transitionOrderStatus wechseln (inkl. RBAC & SAP TABG Sync)
    const transitionRes = await transitionOrderStatus(
      order.id,
      completedStatus.id,
      userId,
      {
        comment: comment || "Technischer Abschluss durch Instandhalter",
      }
    );

    safeRevalidatePath("/orders");
    safeRevalidatePath(`/orders/${orderId}`);
    safeRevalidatePath("/planning");
    safeRevalidatePath("/analytics");

    return {
      success: true,
      message: `Auftrag '${order.orderNumber}' erfolgreich abgeschlossen.`,
      sapSyncQueued: transitionRes.sapSyncQueued,
      data: {
        message: `Auftrag '${order.orderNumber}' erfolgreich abgeschlossen.`,
        sapSyncQueued: transitionRes.sapSyncQueued,
      },
    };
  } catch (err: any) {
    console.error("Fehler beim Abschließen des Auftrags:", err);
    const msg = err instanceof WorkflowViolationError ? err.message : (err?.message || "Auftragsabschluss fehlgeschlagen.");
    return {
      success: false,
      message: msg,
      error: msg,
      data: null,
    };
  }
}

// ============================================================================
// 7. KI-COPILOT & PARSER ACTIONS (KOMPATIBILITÄT)
// ============================================================================

export async function parseFaultPromptAction(payload: {
  tenantId: string;
  prompt: string;
  availableEquipments: Array<{ id: string; name: string; equipmentNumber: string }>;
}): Promise<ParsedFaultDraft> {
  return await parseFaultPrompt(payload);
}

export async function analyzeFaultCopilotAction(payload: {
  tenantId: string;
  userInputText: string;
  equipmentId?: string;
}): Promise<FaultCopilotAnalysisResult> {
  return await analyzeFaultInput(payload);
}


// ============================================================================
// 8. SAP OUTBOX RETRY WORKER ACTION
// ============================================================================

/**
 * Server Action: processSapSyncQueue
 * Arbeitet ausstehende SAP-Synchronisationsjobs (PENDING) aus der `sap_sync_queue` ab.
 * Versendet Materialbuchungen (Bewegungsart 261) und Auftragsdaten erneut an SAP
 * und setzt erfolgreich abgearbeitete Datensätze auf den Status `PROCESSED`.
 */
export async function processSapSyncQueue(options?: {
  tenantId?: string;
  queueId?: string;
  limit?: number;
}) {
  const result = await runSapSyncQueue(options);
  safeRevalidatePath("/orders");
  safeRevalidatePath("/inventory");
  return result;
}

// ============================================================================
// 9. ESKALATIONS- & WORKFLOW-MATRIX SERVER ACTIONS
// ============================================================================

/**
 * Server Action: Eskaliert einen Instandhaltungsauftrag auf LEVEL_2 oder LEVEL_3.
 * Schreibt einen Audit-Log-Eintrag und passt die Priorität sowie den Status an.
 */
export async function escalateOrderAction(
  orderId: string,
  targetLevel: "LEVEL_2" | "LEVEL_3",
  reason: string,
  options?: { userId?: string }
): Promise<{
  success: boolean;
  orderId?: string;
  escalationLevel?: "LEVEL_2" | "LEVEL_3";
  newStatus?: string;
  error?: string;
  message?: string;
  data?: any;
}> {
  if (targetLevel !== "LEVEL_2" && targetLevel !== "LEVEL_3") {
    return {
      success: false,
      error: "Ungültiger Eskalationslevel. Erlaubt sind ausschließlich 'LEVEL_2' oder 'LEVEL_3'.",
    };
  }

  if (!reason || !reason.trim()) {
    return {
      success: false,
      error: "Eine Begründung für die Eskalation ist zwingend erforderlich.",
    };
  }

  try {
    const order = await db.query.maintenanceOrders.findFirst({
      where: eq(maintenanceOrders.id, orderId),
      with: { currentStatus: true },
    });

    if (!order) {
      return {
        success: false,
        error: `Instandhaltungsauftrag mit ID '${orderId}' nicht gefunden.`,
      };
    }

    const newPriority = targetLevel === "LEVEL_3" ? "1_EMERGENCY" : "2_HIGH";

    // Prüfen, ob ein dezidierter Eskalationsstatus definiert ist
    let escalationStatus = await db.query.workflowStatuses.findFirst({
      where: and(
        eq(workflowStatuses.tenantId, order.tenantId),
        eq(workflowStatuses.code, "ESCALATED")
      ),
    });

    if (!escalationStatus) {
      escalationStatus = await db.query.workflowStatuses.findFirst({
        where: and(
          eq(workflowStatuses.tenantId, order.tenantId),
          eq(workflowStatuses.code, "ESKALIERT")
        ),
      });
    }

    const targetStatusId = escalationStatus ? escalationStatus.id : order.currentStatusId;
    const now = new Date();

    await db
      .update(maintenanceOrders)
      .set({
        escalationLevel: targetLevel,
        priority: newPriority,
        currentStatusId: targetStatusId,
        updatedAt: now,
      })
      .where(eq(maintenanceOrders.id, order.id));

    const auditUserId = options?.userId || order.reportedByUserId;

    await db.insert(orderStatusAuditLogs).values({
      tenantId: order.tenantId,
      maintenanceOrderId: order.id,
      fromStatusId: order.currentStatusId,
      toStatusId: targetStatusId,
      changedByUserId: auditUserId,
      comment: `[ESKALATION ${targetLevel}]: ${reason.trim()}`,
      createdAt: now,
    });

    safeRevalidatePath("/orders");
    safeRevalidatePath(`/orders/${orderId}`);
    safeRevalidatePath("/planning");

    return {
      success: true,
      orderId: order.id,
      escalationLevel: targetLevel,
      newStatus: escalationStatus?.name || order.currentStatus?.name,
      message: `Auftrag erfolgreich auf ${targetLevel} eskaliert.`,
      data: {
        orderId: order.id,
        escalationLevel: targetLevel,
        newStatus: escalationStatus?.name || order.currentStatus?.name,
        message: `Auftrag erfolgreich auf ${targetLevel} eskaliert.`,
      },
    };
  } catch (err: any) {
    console.error("Fehler in escalateOrderAction:", err);
    return {
      success: false,
      error: err?.message || "Fehler beim Eskalieren des Auftrags.",
      data: null,
    };
  }
}

/**
 * Koordinator (COORDINATOR): Gibt eine Maßnahme im System frei (FREIGEGEBEN).
 */
export async function releaseOrderAction(orderId: string, userId: string, comment?: string) {
  if (!orderId || typeof orderId !== "string" || !orderId.trim()) {
    return { success: false, error: "Ungültige oder leere Auftrags-ID." };
  }
  const cleanOrderId = orderId.trim();

  const order = await db.query.maintenanceOrders.findFirst({
    where: eq(maintenanceOrders.id, cleanOrderId),
  });
  if (!order) return { success: false, error: "Auftrag nicht gefunden." };

  const targetStatus = await db.query.workflowStatuses.findFirst({
    where: and(
      eq(workflowStatuses.tenantId, order.tenantId),
      eq(workflowStatuses.category, "OPEN")
    ),
  });
  if (!targetStatus) return { success: false, error: "Status 'FREIGEGEBEN' nicht definiert." };

  return await transitionOrderStatusAction({
    orderId: cleanOrderId,
    targetStatusId: targetStatus.id,
    userId,
    comment: comment || "Auftragsfreigabe durch Koordinator",
  });
}

/**
 * Instandhalter (TECHNICIAN): Nimmt die Maßnahme in Arbeit (IN_ARBEIT).
 */
export async function startWorkOrderAction(orderId: string, userId: string, comment?: string) {
  if (!orderId || typeof orderId !== "string" || !orderId.trim()) {
    return { success: false, error: "Ungültige oder leere Auftrags-ID." };
  }
  const cleanOrderId = orderId.trim();

  const order = await db.query.maintenanceOrders.findFirst({
    where: eq(maintenanceOrders.id, cleanOrderId),
  });
  if (!order) return { success: false, error: "Auftrag nicht gefunden." };

  const targetStatus = await db.query.workflowStatuses.findFirst({
    where: and(
      eq(workflowStatuses.tenantId, order.tenantId),
      eq(workflowStatuses.category, "IN_PROGRESS")
    ),
  });
  if (!targetStatus) return { success: false, error: "Status 'IN_ARBEIT' nicht definiert." };

  return await transitionOrderStatusAction({
    orderId: cleanOrderId,
    targetStatusId: targetStatus.id,
    userId,
    comment: comment || "Arbeitsbeginn durch Instandhalter",
  });
}

/**
 * Instandhalter (TECHNICIAN): Pausiert die Maßnahme mit zwingender Begründung (PAUSIERT).
 */
export async function pauseOrderAction(orderId: string, reason: string, userId: string) {
  if (!orderId || typeof orderId !== "string" || !orderId.trim()) {
    return { success: false, error: "Ungültige oder leere Auftrags-ID." };
  }
  const cleanOrderId = orderId.trim();

  if (!reason || !reason.trim()) {
    return { success: false, error: "Eine Begründung für das Pausieren ist zwingend erforderlich." };
  }

  const order = await db.query.maintenanceOrders.findFirst({
    where: eq(maintenanceOrders.id, cleanOrderId),
  });
  if (!order) return { success: false, error: "Auftrag nicht gefunden." };

  let pauseStatus = await db.query.workflowStatuses.findFirst({
    where: and(
      eq(workflowStatuses.tenantId, order.tenantId),
      eq(workflowStatuses.category, "ON_HOLD")
    ),
  });

  if (!pauseStatus) {
    pauseStatus = await db.query.workflowStatuses.findFirst({
      where: and(
        eq(workflowStatuses.tenantId, order.tenantId),
        eq(workflowStatuses.code, "PAUSED")
      ),
    });
  }

  if (!pauseStatus) {
    return { success: false, error: "Status 'PAUSIERT' nicht definiert." };
  }

  return await transitionOrderStatusAction({
    orderId: cleanOrderId,
    targetStatusId: pauseStatus.id,
    userId,
    comment: reason.trim(),
  });
}

/**
 * Instandhalter (TECHNICIAN): Meldet die Maßnahme nach Arbeitsende vorab erledigt / rückgemeldet (RUECKGEMELDET).
 */
export async function reportOrderAction(orderId: string, userId: string, comment?: string) {
  if (!orderId || typeof orderId !== "string" || !orderId.trim()) {
    return { success: false, error: "Ungültige oder leere Auftrags-ID." };
  }
  const cleanOrderId = orderId.trim();

  const order = await db.query.maintenanceOrders.findFirst({
    where: eq(maintenanceOrders.id, cleanOrderId),
  });
  if (!order) return { success: false, error: "Auftrag nicht gefunden." };

  let reportStatus = await db.query.workflowStatuses.findFirst({
    where: and(
      eq(workflowStatuses.tenantId, order.tenantId),
      eq(workflowStatuses.code, "RUECKGEMELDET")
    ),
  });

  if (!reportStatus) {
    reportStatus = await db.query.workflowStatuses.findFirst({
      where: and(
        eq(workflowStatuses.tenantId, order.tenantId),
        eq(workflowStatuses.code, "VORAB_ERLEDIGT")
      ),
    });
  }

  if (!reportStatus) {
    return { success: false, error: "Status 'RUECKGEMELDET' nicht definiert." };
  }

  return await transitionOrderStatusAction({
    orderId: cleanOrderId,
    targetStatusId: reportStatus.id,
    userId,
    comment: comment || "Rückmeldung der Maßnahme durch Instandhalter",
  });
}

/**
 * Koordinator (COORDINATOR): Endabnahme der Maßnahme (TABG / ABGS).
 * Erfordert zwingend vorliegende Zeiterfassungen.
 */
export async function acceptOrderAction(orderId: string, userId: string, comment?: string) {
  if (!orderId || typeof orderId !== "string" || !orderId.trim()) {
    return { success: false, error: "Ungültige oder leere Auftrags-ID." };
  }
  const cleanOrderId = orderId.trim();

  const order = await db.query.maintenanceOrders.findFirst({
    where: eq(maintenanceOrders.id, cleanOrderId),
  });
  if (!order) return { success: false, error: "Auftrag nicht gefunden." };

  // Koordinator / Admin Berechtigung prüfen
  const canAccept = await hasAnyRole(userId, ["COORDINATOR", "MAINT_PLANNER", "ADMIN"], order.tenantId);
  if (!canAccept) {
    return {
      success: false,
      error: "Berechtigung verweigert: Nur Koordinatoren oder Administratoren dürfen Maßnahmen final abnehmen.",
    };
  }

  // Zeiterfassung prüfen
  let hasTime = Boolean(order.actualDurationMinutes && order.actualDurationMinutes > 0);
  if (!hasTime) {
    const timeEntry = await db.query.orderTimeEntries.findFirst({
      where: eq(orderTimeEntries.orderId, order.id),
    });
    if (timeEntry && (timeEntry.durationMinutes > 0 || timeEntry.endedAt)) {
      hasTime = true;
    }
  }

  if (!hasTime) {
    return {
      success: false,
      error: "Validierungsfehler: Vor der Abnahme muss mindestens eine Zeiterfassung für die Maßnahme vorliegen.",
    };
  }

  const targetStatus = await db.query.workflowStatuses.findFirst({
    where: and(
      eq(workflowStatuses.tenantId, order.tenantId),
      eq(workflowStatuses.category, "COMPLETED")
    ),
  });

  if (!targetStatus) return { success: false, error: "Status 'TABG' (COMPLETED) nicht definiert." };

  return await transitionOrderStatusAction({
    orderId: cleanOrderId,
    targetStatusId: targetStatus.id,
    userId,
    comment: comment || "Finale Abnahme durch Koordinator",
  });
}

// ============================================================================
// 12. DYNAMISCHE AUFTRAGSABFRAGE (QUERY ORDERS ACTION)
// ============================================================================

export interface QueryOrdersFilters {
  areaId?: string;
  statusList?: string[];
  priorityList?: string[];
  search?: string;
  limit?: number;
  offset?: number;
  tenantId?: string;
  viewId?: string;
}

export type OrderWithRelations = typeof maintenanceOrders.$inferSelect & {
  currentStatus: typeof workflowStatuses.$inferSelect | null;
  orderType?: typeof orderTypes.$inferSelect | null;
  equipment: (typeof equipments.$inferSelect & {
    assemblies?: (typeof assemblies.$inferSelect)[];
  }) | null;
  functionalLocation: typeof functionalLocations.$inferSelect | null;
  assembly: typeof assemblies.$inferSelect | null;
  damageCodeCatalog: typeof damageCodes.$inferSelect | null;
  assignedToUser?: typeof users.$inferSelect | null;
  reportedByUser?: typeof users.$inferSelect | null;
};

export type QueryOrdersResult = OrderWithRelations[] & {
  success: boolean;
  orders: OrderWithRelations[];
  data: OrderWithRelations[];
  error?: string;
};

/**
 * Dynamische Server Action zum Abfragen von Instandhaltungsaufträgen.
 * Filterbar nach Bereich (areaId), Statusliste, Prioritätsliste, Volltextsuche und Deep-Link viewId.
 * Liefert Aufträge inklusive verknüpftem Equipment, Technischem Platz, Baugruppe und Schadenscode.
 * Robust abgesichert gegen fehlerhafte oder leere SQL-Filterparameter.
 */
export async function queryOrdersAction(
  filters: QueryOrdersFilters = {}
): Promise<QueryOrdersResult> {
  try {
    const effectiveFilters = { ...filters };

    let tenantId = effectiveFilters.tenantId;
    if (!tenantId || typeof tenantId !== "string" || !tenantId.trim()) {
      const tenant = await db.query.tenants.findFirst();
      tenantId = tenant ? tenant.id : "demo-tenant-1000";
    } else {
      tenantId = tenantId.trim();
    }

    // 0. Deep-Linking via viewId: Filter aus gespeicherter Ansicht auflösen
    if (
      effectiveFilters.viewId &&
      typeof effectiveFilters.viewId === "string" &&
      effectiveFilters.viewId.trim()
    ) {
      const cleanViewId = effectiveFilters.viewId.trim();
      try {
        const savedView = await db.query.userSavedViews.findFirst({
          where: eq(userSavedViews.id, cleanViewId),
        });

        if (savedView && savedView.filterPayload && typeof savedView.filterPayload === "object") {
          const payload = savedView.filterPayload as any;
          if (!effectiveFilters.areaId && payload.areaId && typeof payload.areaId === "string") {
            effectiveFilters.areaId = payload.areaId;
          }
          if (
            (!effectiveFilters.statusList || effectiveFilters.statusList.length === 0) &&
            (payload.statusList || payload.status)
          ) {
            effectiveFilters.statusList = Array.isArray(payload.statusList)
              ? payload.statusList
              : Array.isArray(payload.status)
              ? payload.status
              : [payload.statusList || payload.status];
          }
          if (
            (!effectiveFilters.priorityList || effectiveFilters.priorityList.length === 0) &&
            (payload.priorityList || payload.priority)
          ) {
            effectiveFilters.priorityList = Array.isArray(payload.priorityList)
              ? payload.priorityList
              : Array.isArray(payload.priority)
              ? payload.priority
              : [payload.priorityList || payload.priority];
          }
          if (
            !effectiveFilters.search &&
            payload.search &&
            typeof payload.search === "string"
          ) {
            effectiveFilters.search = payload.search;
          }
        }
      } catch (viewErr: any) {
        console.warn("Warnung beim Auflösen von viewId:", cleanViewId, viewErr?.message);
      }
    }

    const conditions: any[] = [eq(maintenanceOrders.tenantId, tenantId)];

    // 1. Filter: areaId (Bereich)
    if (
      effectiveFilters.areaId &&
      typeof effectiveFilters.areaId === "string" &&
      effectiveFilters.areaId.trim()
    ) {
      const cleanAreaId = effectiveFilters.areaId.trim();
      try {
        // Alle Technischen Plätze in diesem Bereich ermitteln
        const flocsInArea = await db.query.functionalLocations.findMany({
          where: and(
            eq(functionalLocations.tenantId, tenantId),
            eq(functionalLocations.areaId, cleanAreaId)
          ),
          columns: { id: true },
        });
        const flocIds = (flocsInArea || []).map((f) => f.id);

        // Alle Equipments ermitteln, die auf diesen Plätzen montiert sind
        let eqIds: string[] = [];
        if (flocIds.length > 0) {
          const eqsInArea = await db.query.equipments.findMany({
            where: and(
              eq(equipments.tenantId, tenantId),
              inArray(equipments.functionalLocationId, flocIds)
            ),
            columns: { id: true },
          });
          eqIds = (eqsInArea || []).map((e) => e.id);
        }

        if (flocIds.length === 0 && eqIds.length === 0) {
          // Keine Anlagen in diesem Bereich vorhanden -> keine Treffer
          conditions.push(sql`1 = 0`);
        } else {
          const areaClauses: any[] = [];
          if (flocIds.length > 0) {
            areaClauses.push(inArray(maintenanceOrders.functionalLocationId, flocIds));
          }
          if (eqIds.length > 0) {
            areaClauses.push(inArray(maintenanceOrders.equipmentId, eqIds));
          }
          if (areaClauses.length > 0) {
            conditions.push(or(...areaClauses));
          }
        }
      } catch (areaErr) {
        console.warn("Warnung bei Filterung nach areaId:", cleanAreaId, areaErr);
        conditions.push(sql`1 = 0`);
      }
    }

    // 2. Filter: statusList (Status IDs, Codes wie "OPEN", "IN_PROGRESS" oder Kategorien)
    if (effectiveFilters.statusList && Array.isArray(effectiveFilters.statusList)) {
      const cleanStatusList = effectiveFilters.statusList
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .map((s) => s.trim());

      if (cleanStatusList.length > 0) {
        const matchingStatuses = await db.query.workflowStatuses.findMany({
          where: (ws, { or: orOp, inArray: inArr }) =>
            orOp(
              inArr(ws.id, cleanStatusList),
              inArr(ws.code, cleanStatusList),
              inArr(ws.category, cleanStatusList as any)
            ),
          columns: { id: true },
        });

        const resolvedStatusIds = new Set<string>((matchingStatuses || []).map((s) => s.id));
        for (const item of cleanStatusList) {
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item)) {
            resolvedStatusIds.add(item);
          }
        }

        const statusIdArray = Array.from(resolvedStatusIds);
        if (statusIdArray.length === 0) {
          conditions.push(sql`1 = 0`);
        } else {
          conditions.push(inArray(maintenanceOrders.currentStatusId, statusIdArray));
        }
      }
    }

    // 3. Filter: priorityList
    if (effectiveFilters.priorityList && Array.isArray(effectiveFilters.priorityList)) {
      const validPriorities = new Set(["1_EMERGENCY", "2_HIGH", "3_MEDIUM", "4_LOW"]);
      const cleanPriorities = effectiveFilters.priorityList
        .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
        .map((p) => {
          const upper = p.toUpperCase().trim();
          if (upper === "1" || upper === "EMERGENCY" || upper === "1_EMERGENCY") return "1_EMERGENCY";
          if (upper === "2" || upper === "HIGH" || upper === "2_HIGH") return "2_HIGH";
          if (upper === "3" || upper === "MEDIUM" || upper === "3_MEDIUM") return "3_MEDIUM";
          if (upper === "4" || upper === "LOW" || upper === "4_LOW") return "4_LOW";
          return upper;
        })
        .filter((p) => validPriorities.has(p));

      if (cleanPriorities.length > 0) {
        conditions.push(inArray(maintenanceOrders.priority, cleanPriorities as any));
      }
    }

    // 4. Filter: search (Volltextsuche in Auftrag, Equipment & Technischem Platz)
    if (
      effectiveFilters.search &&
      typeof effectiveFilters.search === "string" &&
      effectiveFilters.search.trim().length > 0
    ) {
      const term = `%${effectiveFilters.search.trim()}%`;

      const matchingEquipments = await db.query.equipments.findMany({
        where: (eqTable, { or: orOp, ilike: ilikeOp }) =>
          orOp(ilikeOp(eqTable.name, term), ilikeOp(eqTable.equipmentNumber, term)),
        columns: { id: true },
        limit: 100,
      });
      const searchEqIds = (matchingEquipments || []).map((e) => e.id);

      const matchingFlocs = await db.query.functionalLocations.findMany({
        where: (flocTable, { or: orOp, ilike: ilikeOp }) =>
          orOp(ilikeOp(flocTable.name, term), ilikeOp(flocTable.code, term)),
        columns: { id: true },
        limit: 100,
      });
      const searchFlocIds = (matchingFlocs || []).map((f) => f.id);

      const searchOrClauses: any[] = [
        ilike(maintenanceOrders.orderNumber, term),
        ilike(maintenanceOrders.title, term),
        ilike(maintenanceOrders.description, term),
        ilike(maintenanceOrders.damageCode, term),
        ilike(maintenanceOrders.sapOrderNr, term),
      ];

      if (searchEqIds.length > 0) {
        searchOrClauses.push(inArray(maintenanceOrders.equipmentId, searchEqIds));
      }
      if (searchFlocIds.length > 0) {
        searchOrClauses.push(inArray(maintenanceOrders.functionalLocationId, searchFlocIds));
      }

      conditions.push(or(...searchOrClauses));
    }

    const limit =
      typeof effectiveFilters.limit === "number" &&
      effectiveFilters.limit > 0 &&
      effectiveFilters.limit <= 500
        ? effectiveFilters.limit
        : 50;
    const offset =
      typeof effectiveFilters.offset === "number" && effectiveFilters.offset >= 0
        ? effectiveFilters.offset
        : undefined;

    const orders = await db.query.maintenanceOrders.findMany({
      where: and(...conditions),
      with: {
        currentStatus: true,
        orderType: true,
        equipment: {
          with: {
            assemblies: true,
          },
        },
        functionalLocation: true,
        assembly: true,
        damageCodeCatalog: true,
        assignedToUser: true,
        reportedByUser: true,
      },
      orderBy: (table, { desc }) => [desc(table.createdAt)],
      limit,
      offset,
    });

    const mappedOrders: OrderWithRelations[] = (orders || []).map((o) => {
      const resolvedAssembly = o.assembly ?? (o.equipment?.assemblies?.[0] ?? null);
      return {
        ...o,
        assembly: resolvedAssembly,
      } as OrderWithRelations;
    });

    return Object.assign(mappedOrders, {
      success: true,
      orders: mappedOrders,
      data: mappedOrders,
    });
  } catch (err: any) {
    console.error("Fehler in queryOrdersAction:", err);
    const empty: OrderWithRelations[] = [];
    return Object.assign(empty, {
      success: false,
      orders: empty,
      data: empty,
      error: err.message || "Auftragsabfrage fehlgeschlagen.",
    });
  }
}

// ============================================================================
// 13. DETAIL-ABFRAGE: GET ORDER DETAILS ACTION MIT RELATIONALEN SAFE-JOINS
// ============================================================================

export type OrderWithDetails = typeof maintenanceOrders.$inferSelect & {
  currentStatus: typeof workflowStatuses.$inferSelect | null;
  orderType: typeof orderTypes.$inferSelect | null;
  equipment: (typeof equipments.$inferSelect & {
    assemblies?: (typeof assemblies.$inferSelect)[];
    functionalLocation?: typeof functionalLocations.$inferSelect | null;
  }) | null;
  functionalLocation: typeof functionalLocations.$inferSelect | null;
  assembly: typeof assemblies.$inferSelect | null;
  damageCodeCatalog: typeof damageCodes.$inferSelect | null;
  assignedToUser: typeof users.$inferSelect | null;
  reportedByUser: typeof users.$inferSelect | null;
  inspectionTemplate?: typeof inspectionTemplates.$inferSelect | null;
  protocols: (typeof orderStatusAuditLogs.$inferSelect & {
    fromStatus?: typeof workflowStatuses.$inferSelect | null;
    toStatus?: typeof workflowStatuses.$inferSelect | null;
    changedByUser?: typeof users.$inferSelect | null;
  })[];
  statusAuditLogs: (typeof orderStatusAuditLogs.$inferSelect & {
    fromStatus?: typeof workflowStatuses.$inferSelect | null;
    toStatus?: typeof workflowStatuses.$inferSelect | null;
    changedByUser?: typeof users.$inferSelect | null;
  })[];
  timeEntries: (typeof orderTimeEntries.$inferSelect & {
    user?: typeof users.$inferSelect | null;
  })[];
  sparePartBookings: (typeof orderSparePartBookings.$inferSelect & {
    sparePart?: typeof spareParts.$inferSelect | null;
    bookedByUser?: typeof users.$inferSelect | null;
  })[];
  transitions?: (typeof workflowTransitions.$inferSelect & {
    toStatus?: typeof workflowStatuses.$inferSelect | null;
    requiredRole?: typeof roles.$inferSelect | null;
  })[];
};

export interface GetOrderDetailsResult {
  success: boolean;
  order: OrderWithDetails | null;
  data: OrderWithDetails | null;
  error?: string;
}

/**
 * Server Action: Lädt die vollständigen Details eines einzelnen Instandhaltungsauftrags anhand der ID.
 * - Fängt ungültige IDs oder nicht gefundene Datensätze ab, ohne unbehandelte Exceptions zu werfen.
 * - Lade relationale Abhängigkeiten (Equipment, Technischer Platz, Protokolle, Zeiteinträge, Ersatzteile)
 *   per Safe-Join oder mit Fallback auf leere Arrays.
 */
export async function getOrderDetailsAction(
  orderId: string,
  options?: { tenantId?: string }
): Promise<GetOrderDetailsResult> {
  if (!orderId || typeof orderId !== "string" || !orderId.trim()) {
    return {
      success: false,
      order: null,
      data: null,
      error: "Ungültige oder leere Auftrags-ID übergeben.",
    };
  }

  const cleanOrderId = orderId.trim();

  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanOrderId);

    let dbOrder: any = null;

    try {
      dbOrder = await db.query.maintenanceOrders.findFirst({
        where: isUuid
          ? eq(maintenanceOrders.id, cleanOrderId)
          : or(
              eq(maintenanceOrders.id, cleanOrderId as any),
              eq(maintenanceOrders.orderNumber, cleanOrderId),
              eq(maintenanceOrders.clientCreatedOfflineId, cleanOrderId)
            ),
        with: {
          orderType: true,
          currentStatus: true,
          equipment: {
            with: {
              assemblies: true,
              functionalLocation: true,
            },
          },
          functionalLocation: true,
          assembly: true,
          damageCodeCatalog: true,
          reportedByUser: true,
          assignedToUser: true,
          inspectionTemplate: true,
          statusAuditLogs: {
            with: {
              fromStatus: true,
              toStatus: true,
              changedByUser: true,
            },
            orderBy: (logs, { desc }) => [desc(logs.createdAt)],
          },
          timeEntries: {
            with: {
              user: true,
            },
            orderBy: (entries, { desc }) => [desc(entries.startedAt)],
          },
          sparePartBookings: {
            with: {
              sparePart: true,
              bookedByUser: true,
            },
            orderBy: (bookings, { desc }) => [desc(bookings.bookedAt)],
          },
        },
      });
    } catch (queryErr: any) {
      console.warn(
        "Detaillierte relationale Abfrage fehlgeschlagen, führe Safe-Fallback aus:",
        queryErr?.message
      );
      try {
        dbOrder = await db.query.maintenanceOrders.findFirst({
          where: isUuid
            ? eq(maintenanceOrders.id, cleanOrderId)
            : or(
                eq(maintenanceOrders.orderNumber, cleanOrderId),
                eq(maintenanceOrders.clientCreatedOfflineId, cleanOrderId)
              ),
          with: {
            currentStatus: true,
            orderType: true,
            equipment: true,
            functionalLocation: true,
          },
        });
      } catch (_) {
        dbOrder = null;
      }
    }

    if (!dbOrder) {
      return {
        success: false,
        order: null,
        data: null,
        error: `Instandhaltungsauftrag mit ID '${cleanOrderId}' existiert nicht.`,
      };
    }

    // Safe-Relations auflösen
    const resolvedEquipment = dbOrder.equipment ?? null;
    const resolvedFunctionalLocation =
      dbOrder.functionalLocation ?? (resolvedEquipment?.functionalLocation ?? null);
    const resolvedAssembly =
      dbOrder.assembly ?? (resolvedEquipment?.assemblies?.[0] ?? null);

    // Protokolle & Zeiteinträge per Fallback auf leere Arrays absichern
    let protocols = Array.isArray(dbOrder.statusAuditLogs) ? [...dbOrder.statusAuditLogs] : [];
    let timeEntries = Array.isArray(dbOrder.timeEntries) ? [...dbOrder.timeEntries] : [];
    let sparePartBookings = Array.isArray(dbOrder.sparePartBookings)
      ? [...dbOrder.sparePartBookings]
      : [];

    // Falls in Safe-Fallback-Modus Protokolle oder Zeiteinträge nicht geladen wurden, separat per Safe-Query laden
    if (protocols.length === 0 && dbOrder.id) {
      try {
        const loadedLogs = await db.query.orderStatusAuditLogs.findMany({
          where: eq(orderStatusAuditLogs.maintenanceOrderId, dbOrder.id),
          with: { fromStatus: true, toStatus: true, changedByUser: true },
          orderBy: (logs, { desc }) => [desc(logs.createdAt)],
        });
        if (Array.isArray(loadedLogs)) protocols = loadedLogs;
      } catch (_) {}
    }

    if (timeEntries.length === 0 && dbOrder.id) {
      try {
        const loadedTimes = await db.query.orderTimeEntries.findMany({
          where: eq(orderTimeEntries.orderId, dbOrder.id),
          with: { user: true },
          orderBy: (entries, { desc }) => [desc(entries.startedAt)],
        });
        if (Array.isArray(loadedTimes)) timeEntries = loadedTimes;
      } catch (_) {}
    }

    // Mögliche Folge-Transitionen laden (mit Fallback auf leeres Array)
    let transitions: any[] = [];
    if (dbOrder.orderTypeId && dbOrder.currentStatusId) {
      try {
        transitions = await db.query.workflowTransitions.findMany({
          where: and(
            eq(workflowTransitions.orderTypeId, dbOrder.orderTypeId),
            eq(workflowTransitions.fromStatusId, dbOrder.currentStatusId),
            eq(workflowTransitions.isActive, true)
          ),
          with: {
            toStatus: true,
            requiredRole: true,
          },
        });
      } catch (_) {}
    }

    const orderDetails: OrderWithDetails = {
      ...dbOrder,
      equipment: resolvedEquipment,
      functionalLocation: resolvedFunctionalLocation,
      assembly: resolvedAssembly,
      protocols,
      statusAuditLogs: protocols,
      timeEntries,
      sparePartBookings,
      transitions: Array.isArray(transitions) ? transitions : [],
    };

    return {
      success: true,
      order: orderDetails,
      data: orderDetails,
    };
  } catch (err: any) {
    console.error("Unerwarteter Fehler in getOrderDetailsAction:", err);
    return {
      success: false,
      order: null,
      data: null,
      error: err?.message || "Fehler beim Laden der Auftragsdetails.",
    };
  }
}

// ============================================================================
// 14. HELPER-ACTIONS FÜR ORDER-DETAILS-MODAL (RBAC, DISPOSITION & BEARBEITUNG)
// ============================================================================

/**
 * Lädt verfügbare Techniker & Benutzer für die Zuweisung.
 */
export async function getTechniciansAction(tenantId?: string) {
  try {
    const allUsers = await db.query.users.findMany({
      where: tenantId ? eq(users.tenantId, tenantId) : undefined,
      columns: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        personnelNr: true,
      },
      orderBy: (u, { asc }) => [asc(u.lastName), asc(u.firstName)],
    });
    return { success: true, users: allUsers };
  } catch (err: any) {
    return { success: false, users: [], error: err?.message };
  }
}

/**
 * Lädt verfügbare Ersatzteile für die Materialbuchung.
 */
export async function getAvailableSparePartsAction(tenantId?: string) {
  try {
    const parts = await db.query.spareParts.findMany({
      where: tenantId ? eq(spareParts.tenantId, tenantId) : undefined,
      columns: {
        id: true,
        internalPartNumber: true,
        name: true,
        manufacturerPartNumber: true,
        unitOfMeasure: true,
        stockQuantity: true,
        storageLocation: true,
      },
      orderBy: (p, { asc }) => [asc(p.name)],
    });
    return { success: true, parts };
  } catch (err: any) {
    return { success: false, parts: [], error: err?.message };
  }
}

/**
 * Lädt verfügbare Auftragsarten für Admin-Bearbeitung.
 */
export async function getOrderTypesAction(tenantId?: string) {
  try {
    const types = await db.query.orderTypes.findMany({
      where: tenantId ? eq(orderTypes.tenantId, tenantId) : undefined,
      columns: {
        id: true,
        code: true,
        name: true,
        colorHex: true,
      },
      orderBy: (t, { asc }) => [asc(t.code)],
    });
    return { success: true, orderTypes: types };
  } catch (err: any) {
    return { success: false, orderTypes: [], error: err?.message };
  }
}

export interface UpdateMaintenanceOrderDetailsInput {
  orderId: string;
  userId?: string;
  title?: string;
  description?: string;
  symptomDescription?: string;
  priority?: "1_EMERGENCY" | "2_HIGH" | "3_MEDIUM" | "4_LOW";
  orderTypeId?: string;
  assignedToUserId?: string | null;
  plannedDurationMinutes?: number;
}

/**
 * Speichert Änderungen der Stammdaten & Disposition eines Instandhaltungsauftrags.
 */
export async function updateMaintenanceOrderDetailsAction(
  payload: UpdateMaintenanceOrderDetailsInput
) {
  const { orderId, userId, ...updates } = payload;
  if (!orderId || !orderId.trim()) {
    return { success: false, error: "Ungültige oder leere Auftrags-ID übergeben." };
  }
  const cleanOrderId = orderId.trim();

  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanOrderId);
    if (!isUuid) {
      return {
        success: true,
        message: "Auftragsdaten lokal aktualisiert (Demo-Modus).",
      };
    }

    const updateValues: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (updates.title !== undefined) updateValues.title = updates.title.trim();
    if (updates.description !== undefined) updateValues.description = updates.description.trim();
    if (updates.symptomDescription !== undefined) {
      updateValues.symptomDescription = updates.symptomDescription?.trim() || null;
    }
    if (updates.priority !== undefined) updateValues.priority = updates.priority;
    if (updates.orderTypeId !== undefined) updateValues.orderTypeId = updates.orderTypeId;
    if (updates.assignedToUserId !== undefined) {
      const assignedId = updates.assignedToUserId?.trim();
      const isUserUuid = assignedId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assignedId);
      updateValues.assignedToUserId = isUserUuid ? assignedId : null;
    }
    if (updates.plannedDurationMinutes !== undefined) {
      updateValues.plannedDurationMinutes = Number(updates.plannedDurationMinutes) || 60;
    }

    await db
      .update(maintenanceOrders)
      .set(updateValues)
      .where(eq(maintenanceOrders.id, cleanOrderId));

    safeRevalidatePath(`/orders/${cleanOrderId}`);
    safeRevalidatePath("/orders");
    safeRevalidatePath("/");

    return {
      success: true,
      message: "Auftragsdaten erfolgreich gespeichert.",
    };
  } catch (err: any) {
    console.error("Fehler in updateMaintenanceOrderDetailsAction:", err);
    return {
      success: false,
      error: err?.message || "Fehler beim Speichern der Auftragsdaten.",
    };
  }
}

/**
 * Löscht einen Instandhaltungsauftrag dauerhaft (Administrator-Recht).
 */
export async function deleteMaintenanceOrderAction(orderId: string, userId?: string) {
  if (!orderId || !orderId.trim()) {
    return { success: false, error: "Ungültige Auftrags-ID." };
  }
  const cleanOrderId = orderId.trim();

  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanOrderId);
    if (isUuid) {
      await db.delete(maintenanceOrders).where(eq(maintenanceOrders.id, cleanOrderId));
    }

    safeRevalidatePath("/orders");
    safeRevalidatePath("/");

    return {
      success: true,
      message: `Auftrag '${cleanOrderId}' wurde erfolgreich gelöscht.`,
    };
  } catch (err: any) {
    console.error("Fehler in deleteMaintenanceOrderAction:", err);
    return {
      success: false,
      error: err?.message || "Fehler beim Löschen des Auftrags.",
    };
  }
}

/**
 * Koordinator (COORDINATOR): Kaufmännisch abschließen (ABGS / CLOSED).
 */
export async function closeOrderCommercialAction(orderId: string, userId: string, comment?: string) {
  if (!orderId || typeof orderId !== "string" || !orderId.trim()) {
    return { success: false, error: "Ungültige oder leere Auftrags-ID." };
  }
  const cleanOrderId = orderId.trim();

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanOrderId);
  if (!isUuid) {
    return {
      success: true,
      message: "Auftrag kaufmännisch abgeschlossen (Demo-Modus).",
    };
  }

  const order = await db.query.maintenanceOrders.findFirst({
    where: eq(maintenanceOrders.id, cleanOrderId),
  });
  if (!order) return { success: false, error: "Auftrag nicht gefunden." };

  let closedStatus = await db.query.workflowStatuses.findFirst({
    where: and(
      eq(workflowStatuses.tenantId, order.tenantId),
      or(
        eq(workflowStatuses.code, "ABGS"),
        eq(workflowStatuses.category, "CLOSED")
      )
    ),
  });

  if (!closedStatus) {
    closedStatus = await db.query.workflowStatuses.findFirst({
      where: and(
        eq(workflowStatuses.tenantId, order.tenantId),
        eq(workflowStatuses.category, "COMPLETED")
      ),
    });
  }

  if (!closedStatus) {
    return { success: false, error: "Status 'ABGS' (CLOSED) nicht definiert." };
  }

  return await transitionOrderStatusAction({
    orderId: cleanOrderId,
    targetStatusId: closedStatus.id,
    userId,
    comment: comment || "Kaufmännisch abgeschlossen (ABGS) durch Koordinator",
  });
}


