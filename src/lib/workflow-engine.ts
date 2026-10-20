import { eq, and, inArray } from "drizzle-orm";
import { db } from "./db";
import {
  maintenanceOrders,
  workflowTransitions,
  workflowStatuses,
  userRoles,
  orderStatusAuditLogs,
  inspectionTemplates,
  WorkflowGuardCondition,
} from "./db/schema";
import { getSapConnector } from "./sap/sap-connector";
import { indexOrderKnowledgeOnCompletion } from "./ai/fault-copilot";

export interface WorkflowTransitionResult {
  success: boolean;
  orderId: string;
  fromStatusId: string;
  toStatusId: string;
  message: string;
  sapSyncQueued?: boolean;
}

export class WorkflowViolationError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "WorkflowViolationError";
  }
}

/**
 * Validiert und führt den dynamischen Statusübergang eines Instandhaltungsauftrags aus.
 * 
 * 1. Lädt den aktuellen Auftrag und seine Auftragsart.
 * 2. Prüft über `workflow_transitions`, ob eine Transition vom aktuellen zum Zielstatus existiert.
 * 3. Prüft RBAC: Hat der User mindestens eine Rolle, die der `required_role_id` entspricht?
 * 4. Valdiert Guard Conditions (z. B. ausgefüllte Checkliste/Prüfprotokoll, Schadensursache).
 * 5. Führt Status-Update atomar in einer DB-Transaktion aus inkl. Audit-Log.
 * 6. Triggert optional SAP-Sync (oder reiht bei Fehlern/Offline in die Queue ein).
 */
export async function transitionOrderStatus(
  orderId: string,
  targetStatusId: string,
  userId: string,
  options?: {
    comment?: string;
    recordedOfflineAt?: Date;
  }
): Promise<WorkflowTransitionResult> {
  return await db.transaction(async (tx) => {
    // 1. Auftrag laden
    const order = await tx.query.maintenanceOrders.findFirst({
      where: eq(maintenanceOrders.id, orderId),
      with: {
        inspectionTemplate: true,
      },
    });

    if (!order) {
      throw new WorkflowViolationError(
        `Instandhaltungsauftrag mit ID '${orderId}' nicht gefunden.`,
        "ORDER_NOT_FOUND"
      );
    }

    if (order.currentStatusId === targetStatusId) {
      return {
        success: true,
        orderId: order.id,
        fromStatusId: order.currentStatusId,
        toStatusId: targetStatusId,
        message: "Auftrag befindet sich bereits im gewünschten Status.",
      };
    }

    // 2. Erlaubte Transition prüfen
    const transition = await tx.query.workflowTransitions.findFirst({
      where: and(
        eq(workflowTransitions.tenantId, order.tenantId),
        eq(workflowTransitions.orderTypeId, order.orderTypeId),
        eq(workflowTransitions.fromStatusId, order.currentStatusId),
        eq(workflowTransitions.toStatusId, targetStatusId),
        eq(workflowTransitions.isActive, true)
      ),
      with: {
        fromStatus: true,
        toStatus: true,
        requiredRole: true,
      },
    });

    if (!transition) {
      // Prüfe Zielstatus Name für lesbare Fehlermeldung
      const targetStatus = await tx.query.workflowStatuses.findFirst({
        where: eq(workflowStatuses.id, targetStatusId),
      });

      throw new WorkflowViolationError(
        `Ungültiger Statusübergang: Für die Auftragsart ist kein Wechsel in den Status '${
          targetStatus?.name || targetStatusId
        }' definiert.`,
        "TRANSITION_NOT_ALLOWED"
      );
    }

    // 3. Rollenprüfung (RBAC)
    if (transition.requiredRoleId) {
      const userHasRole = await tx.query.userRoles.findFirst({
        where: and(
          eq(userRoles.userId, userId),
          eq(userRoles.roleId, transition.requiredRoleId)
        ),
      });

      if (!userHasRole) {
        throw new WorkflowViolationError(
          `Fehlende Berechtigung: Der Statusübergang '${transition.actionName}' erfordert die Rolle '${
            transition.requiredRole?.name || transition.requiredRoleId
          }'.`,
          "INSUFFICIENT_PERMISSIONS"
        );
      }
    }

    // 4. Guard Conditions & Pflichtprüfungen validieren
    const guards = (transition.guardConditions || {}) as WorkflowGuardCondition;

    // A) Prüfprotokoll / Checkliste erforderlich
    if (guards.requireChecklistCompleted) {
      if (!order.inspectionTemplateId) {
        throw new WorkflowViolationError(
          "Guard Condition verletzt: Dem Auftrag ist kein Prüfprotokoll zugeordnet.",
          "CHECKLIST_MISSING"
        );
      }

      const results = order.checklistResultsJson;
      if (!results || !results.completedAt || !results.values || Object.keys(results.values).length === 0) {
        throw new WorkflowViolationError(
          "Guard Condition verletzt: Der Wechsel in diesen Status erfordert ein vollständig ausgefülltes und signiertes Prüfprotokoll.",
          "CHECKLIST_NOT_COMPLETED"
        );
      }
    }

    // B) Schadensursache erforderlich (Root Cause)
    if (guards.requireRootCauseFilled) {
      if (!order.rootCauseDescription || order.rootCauseDescription.trim().length === 0) {
        throw new WorkflowViolationError(
          "Guard Condition verletzt: Eine Schadensursache (Root Cause) muss vor diesem Statuswechsel dokumentiert werden.",
          "ROOT_CAUSE_REQUIRED"
        );
      }
    }

    // C) Tatsächliche Dauer (Ist-Zeit / Rückmeldung)
    if (guards.requireActualDurationFilled) {
      if (!order.actualDurationMinutes || order.actualDurationMinutes <= 0) {
        throw new WorkflowViolationError(
          "Guard Condition verletzt: Die tatsächliche Arbeitszeit (Ist-Minuten) muss vor Abschluss erfasst sein.",
          "ACTUAL_DURATION_REQUIRED"
        );
      }
    }

    // D) Kommentar-Pflicht
    if (transition.requiresComment && (!options?.comment || options.comment.trim().length === 0)) {
      throw new WorkflowViolationError(
        `Für diesen Statuswechsel ('${transition.actionName}') ist eine Begründung/ein Kommentar zwingend erforderlich.`,
        "COMMENT_REQUIRED"
      );
    }

    // 5. Status aktualisieren und Audit-Log schreiben
    const now = new Date();
    await tx
      .update(maintenanceOrders)
      .set({
        currentStatusId: targetStatusId,
        updatedAt: now,
        actualEndAt:
          transition.toStatus.category === "COMPLETED" || transition.toStatus.category === "CLOSED"
            ? order.actualEndAt || now
            : order.actualEndAt,
        actualStartAt:
          transition.toStatus.category === "IN_PROGRESS" && !order.actualStartAt
            ? now
            : order.actualStartAt,
      })
      .where(eq(maintenanceOrders.id, order.id));

    await tx.insert(orderStatusAuditLogs).values({
      tenantId: order.tenantId,
      maintenanceOrderId: order.id,
      transitionId: transition.id,
      fromStatusId: order.currentStatusId,
      toStatusId: targetStatusId,
      changedByUserId: userId,
      comment: options?.comment || null,
      recordedOfflineAt: options?.recordedOfflineAt || null,
      createdAt: now,
    });

    // 6. SAP-Sync triggern (falls konfiguriert)
    let sapSyncQueued = false;
    if (transition.triggersSapSync || transition.toStatus.triggersSapCompletion) {
      try {
        const connector = await getSapConnector(order.tenantId);
        await connector.migrateOrderToSap(order.id);
      } catch (err) {
        // connector.migrateOrderToSap fängt Fehler ab oder reiht in sap_sync_queue ein
        sapSyncQueued = true;
      }
    }

    // 7. Mitlernendes KI-Gedächtnis: Automatische RAG-Vektorisierung bei Abschluss
    if (
      transition.toStatus.category === "COMPLETED" ||
      transition.toStatus.category === "CLOSED"
    ) {
      // Asynchron im Hintergrund ausführen, blockiert den Transaktionsfluss nicht
      indexOrderKnowledgeOnCompletion(order.id).catch((err) => {
        console.error("Fehler beim Indizieren des RAG-Wissens:", err);
      });
    }

    return {
      success: true,
      orderId: order.id,
      fromStatusId: order.currentStatusId,
      toStatusId: targetStatusId,
      message: `Status erfolgreich zu '${transition.toStatus.name}' gewechselt.`,
      sapSyncQueued,
    };
  });
}
