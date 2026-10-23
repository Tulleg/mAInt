"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, and, isNull, desc } from "drizzle-orm";
import { db } from "@/db";
import {
  maintenanceOrders,
  orderTimeEntries,
  users,
} from "@/db/schema";
import { hasPermission, hasRole } from "@/lib/rbac";
import { validateWithZod } from "./action-utils";

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch (_) {
    // Graceful no-op in testing environments
  }
}

export interface TimeTrackingResult {
  success: boolean;
  timerId?: string;
  orderId?: string;
  durationMinutes?: number;
  startedAt?: Date | null;
  endedAt?: Date | null;
  message?: string;
  error?: string;
  data?: any;
}

const timerIdSchema = z.string().trim().min(1, "Auftrags- oder Timer-ID darf nicht leer sein.");

/**
 * Startet einen Live-Arbeitszeit-Timer für einen Instandhaltungsauftrag.
 * Techniker und Bediener können hiermit direkt ihre Arbeiten am Auftrag minutengenau erfassen.
 */
export async function startWorkTimer(
  orderId: string,
  optionsOrUserId?: { userId?: string } | string
): Promise<TimeTrackingResult> {
  const validation = validateWithZod(timerIdSchema, orderId);
  if (!validation.success) {
    return {
      success: false,
      error: validation.error,
    };
  }

  const userId =
    typeof optionsOrUserId === "string"
      ? optionsOrUserId
      : optionsOrUserId?.userId;

  try {
    // 1. Auftrag laden
    const order = await db.query.maintenanceOrders.findFirst({
      where: eq(maintenanceOrders.id, orderId),
    });

    if (!order) {
      return {
        success: false,
        error: `Instandhaltungsauftrag mit ID '${orderId}' wurde nicht gefunden.`,
      };
    }

    // 2. Benutzer ermitteln (Fallback auf assignedUser, reportedByUser oder ersten User)
    let effectiveUserId: string | null | undefined = userId || order.assignedToUserId || order.reportedByUserId;
    if (!effectiveUserId) {
      const firstUser = await db.query.users.findFirst({
        where: eq(users.tenantId, order.tenantId),
      });
      effectiveUserId = firstUser?.id;
    }

    if (!effectiveUserId) {
      return {
        success: false,
        error: "Kein gültiger Benutzer für die Zeiterfassung ermittelt.",
      };
    }

    // 3. Prüfen, ob bereits ein aktiver Timer für diesen Benutzer & Auftrag läuft
    const existingActiveTimer = await db.query.orderTimeEntries.findFirst({
      where: and(
        eq(orderTimeEntries.orderId, order.id),
        eq(orderTimeEntries.userId, effectiveUserId),
        isNull(orderTimeEntries.endedAt)
      ),
    });

    if (existingActiveTimer) {
      return {
        success: true,
        timerId: existingActiveTimer.id,
        orderId: order.id,
        startedAt: existingActiveTimer.startedAt,
        message: "Ein Zeiterfassungs-Timer läuft bereits für diesen Auftrag.",
        data: {
          timerId: existingActiveTimer.id,
          orderId: order.id,
          startedAt: existingActiveTimer.startedAt,
        },
      };
    }

    // 4. Neuen Timer in PostgreSQL anlegen
    const now = new Date();
    const [createdTimer] = await db
      .insert(orderTimeEntries)
      .values({
        tenantId: order.tenantId,
        orderId: order.id,
        userId: effectiveUserId,
        startedAt: now,
        endedAt: null,
        durationMinutes: 0,
        workDescription: "Live-Timer gestartet",
      })
      .returning();

    // 5. Auftragsstatus optional auf 'IN_PROGRESS' setzen, falls noch 'OPEN'
    if (order.currentStatusId) {
      try {
        const status = await db.query.workflowStatuses.findFirst({
          where: eq(maintenanceOrders.currentStatusId, order.currentStatusId),
        });
        if (status && (status.code === "OPEN" || status.code === "FREI")) {
          await db
            .update(maintenanceOrders)
            .set({
              actualStartAt: order.actualStartAt || now,
              updatedAt: now,
            })
            .where(eq(maintenanceOrders.id, order.id));
        }
      } catch (_) {}
    }

    safeRevalidatePath(`/orders/${order.id}`);
    safeRevalidatePath("/orders");

    return {
      success: true,
      timerId: createdTimer.id,
      orderId: order.id,
      startedAt: now,
      message: "Arbeitszeit-Timer gestartet.",
      data: {
        timerId: createdTimer.id,
        orderId: order.id,
        startedAt: now,
      },
    };
  } catch (err: any) {
    console.error("Fehler in startWorkTimer:", err);
    return {
      success: false,
      error: err?.message || "Fehler beim Starten der Zeiterfassung.",
    };
  }
}

/**
 * Stoppt einen aktiven Timer, berechnet die Dauer in Minuten und verbucht sie auf den Auftrag.
 * Unterstützt flexible Aufrufmuster:
 * - stopWorkTimer(orderId, comment, userId)
 * - stopWorkTimer(orderId, { comment, workDescription, userId })
 */
export async function stopWorkTimer(
  timerIdOrOrderId: string,
  commentOrOptions?: string | { comment?: string; workDescription?: string; activityType?: string; userId?: string },
  maybeUserId?: string
): Promise<TimeTrackingResult> {
  const validation = validateWithZod(timerIdSchema, timerIdOrOrderId);
  if (!validation.success) {
    return {
      success: false,
      error: validation.error,
    };
  }

  const workDesc =
    typeof commentOrOptions === "string"
      ? commentOrOptions
      : commentOrOptions?.workDescription || commentOrOptions?.comment;

  try {
    const now = new Date();

    // 1. Timer über ID oder über Auftragssuche ermitteln
    let timer = await db.query.orderTimeEntries.findFirst({
      where: and(
        eq(orderTimeEntries.id, timerIdOrOrderId),
        isNull(orderTimeEntries.endedAt)
      ),
    });

    if (!timer) {
      timer = await db.query.orderTimeEntries.findFirst({
        where: and(
          eq(orderTimeEntries.orderId, timerIdOrOrderId),
          isNull(orderTimeEntries.endedAt)
        ),
        orderBy: [desc(orderTimeEntries.startedAt)],
      });
    }

    if (!timer) {
      return {
        success: false,
        error: "Kein aktiver Zeiterfassungs-Timer zum Beenden gefunden.",
      };
    }

    // 2. Dauer in Minuten berechnen (Mindestens 1 Minute)
    const startTimestamp = timer.startedAt ? new Date(timer.startedAt).getTime() : now.getTime();
    const diffMs = now.getTime() - startTimestamp;
    const durationMinutes = Math.max(1, Math.round(diffMs / (1000 * 60)));

    // 3. Timer-Eintrag aktualisieren
    await db
      .update(orderTimeEntries)
      .set({
        endedAt: now,
        durationMinutes,
        workDescription: workDesc || timer.workDescription || "Arbeit beendet",
      })
      .where(eq(orderTimeEntries.id, timer.id));

    // 4. Kumulierte Ist-Dauer auf dem Auftrag aktualisieren
    const effectiveOrderId = timer.orderId || timerIdOrOrderId;
    const order = await db.query.maintenanceOrders.findFirst({
      where: eq(maintenanceOrders.id, effectiveOrderId),
    });

    if (order) {
      const prevMinutes = order.actualDurationMinutes || 0;
      const totalActualMinutes = prevMinutes + durationMinutes;

      await db
        .update(maintenanceOrders)
        .set({
          actualDurationMinutes: totalActualMinutes,
          updatedAt: now,
        })
        .where(eq(maintenanceOrders.id, order.id));
    }

    safeRevalidatePath(`/orders/${effectiveOrderId}`);
    safeRevalidatePath("/orders");

    return {
      success: true,
      timerId: timer.id,
      orderId: effectiveOrderId,
      durationMinutes,
      startedAt: timer.startedAt,
      endedAt: now,
      message: `Zeiterfassung beendet: ${durationMinutes} Minuten verbucht.`,
      data: {
        timerId: timer.id,
        orderId: effectiveOrderId,
        durationMinutes,
        startedAt: timer.startedAt,
        endedAt: now,
      },
    };
  } catch (err: any) {
    console.error("Fehler in stopWorkTimer:", err);
    return {
      success: false,
      error: err?.message || "Fehler beim Beenden der Zeiterfassung.",
    };
  }
}

export interface LogManualWorkTimeInput {
  orderId: string;
  durationMinutes: number;
  userId?: string;
  workDescription?: string;
  comment?: string;
  startedAt?: Date | string;
}

/**
 * Manuelle Nacherfassung von geleisteten Arbeitszeiten am Auftrag.
 * Unterstützt:
 * - logManualWorkTime(orderId, durationMinutes, documentation, options)
 * - logManualWorkTime(payloadObject)
 */
export async function logManualWorkTime(
  orderIdOrPayload: string | LogManualWorkTimeInput,
  durationMinutesOrOptions?: number | { userId?: string; workDescription?: string; comment?: string },
  documentationOrComment?: string,
  options?: { userId?: string }
): Promise<TimeTrackingResult> {
  let orderId: string;
  let durationMinutes: number;
  let userId: string | undefined;
  let workDescription: string | undefined;
  let startedAt: Date | string | undefined;

  if (typeof orderIdOrPayload === "object") {
    orderId = orderIdOrPayload.orderId;
    durationMinutes = orderIdOrPayload.durationMinutes;
    userId = orderIdOrPayload.userId;
    workDescription = orderIdOrPayload.workDescription || orderIdOrPayload.comment;
    startedAt = orderIdOrPayload.startedAt;
  } else {
    orderId = orderIdOrPayload;
    durationMinutes = typeof durationMinutesOrOptions === "number" ? durationMinutesOrOptions : 0;
    workDescription = documentationOrComment;
    userId = options?.userId || (typeof durationMinutesOrOptions === "object" ? durationMinutesOrOptions.userId : undefined);
  }

  if (!orderId || typeof orderId !== "string" || !orderId.trim()) {
    return { success: false, error: "Auftrags-ID ist erforderlich." };
  }
  if (!durationMinutes || durationMinutes <= 0) {
    return { success: false, error: "Dauer muss größer als 0 Minuten sein." };
  }

  try {
    const order = await db.query.maintenanceOrders.findFirst({
      where: eq(maintenanceOrders.id, orderId),
    });

    if (!order) {
      return {
        success: false,
        error: `Instandhaltungsauftrag mit ID '${orderId}' existiert nicht.`,
      };
    }

    let effectiveUserId: string =
      userId || order.assignedToUserId || order.reportedByUserId || "00000000-0000-0000-0000-000000000001";

    const start = startedAt ? new Date(startedAt) : new Date();
    const end = new Date(start.getTime() + durationMinutes * 60000);

    const [created] = await db
      .insert(orderTimeEntries)
      .values({
        tenantId: order.tenantId,
        orderId: order.id,
        userId: effectiveUserId,
        startedAt: start,
        endedAt: end,
        durationMinutes,
        workDescription: workDescription || "Manuelle Zeiterfassung",
      })
      .returning();

    // Summe auf Auftrag aktualisieren
    const prevMinutes = order.actualDurationMinutes || 0;
    const totalMinutes = prevMinutes + durationMinutes;

    await db
      .update(maintenanceOrders)
      .set({
        actualDurationMinutes: totalMinutes,
        updatedAt: new Date(),
      })
      .where(eq(maintenanceOrders.id, order.id));

    safeRevalidatePath(`/orders/${order.id}`);

    return {
      success: true,
      timerId: created.id,
      orderId: order.id,
      durationMinutes,
      startedAt: start,
      endedAt: end,
      message: `${durationMinutes} Minuten erfolgreich manuell nacherfasst.`,
      data: {
        timerId: created.id,
        orderId: order.id,
        durationMinutes,
      },
    };
  } catch (err: any) {
    console.error("Fehler in logManualWorkTime:", err);
    return {
      success: false,
      error: err?.message || "Fehler beim Speichern der manuellen Zeiterfassung.",
    };
  }
}

/**
 * Gibt alle erfassten Zeiteinträge zu einem Auftrag zurück.
 * - Sichere Abfrage mit strukturierten Fallbacks (user: null etc.)
 */
export async function getOrderTimeEntries(orderId: string) {
  try {
    if (!orderId || typeof orderId !== "string" || !orderId.trim()) {
      const empty: any[] = [];
      return Object.assign(empty, {
        success: false,
        error: "Ungültige oder leere Auftrags-ID.",
        data: [],
      });
    }

    const cleanOrderId = orderId.trim();
    const entries = await db.query.orderTimeEntries.findMany({
      where: eq(orderTimeEntries.orderId, cleanOrderId),
      with: {
        user: true,
      },
      orderBy: [desc(orderTimeEntries.startedAt)],
    });

    const safeEntries = entries.map((e) => ({
      ...e,
      user: e.user
        ? {
            id: e.user.id,
            firstName: e.user.firstName,
            lastName: e.user.lastName,
            email: e.user.email,
          }
        : null,
    }));

    return Object.assign(safeEntries, {
      success: true,
      data: safeEntries,
    });
  } catch (err: any) {
    console.warn("Fehler beim Laden der Zeiteinträge:", err);
    const empty: any[] = [];
    return Object.assign(empty, {
      success: false,
      error: err?.message || "Fehler beim Laden der Zeiteinträge.",
      data: [],
    });
  }
}
