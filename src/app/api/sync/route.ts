import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  maintenanceOrders,
  orderStatusAuditLogs,
  orderSparePartBookings,
  equipments,
  spareParts,
  inspectionTemplates,
  workflowStatuses,
} from "@/lib/db/schema";
import { transitionOrderStatus } from "@/lib/workflow-engine";
import { getSapConnector } from "@/lib/sap/sap-connector";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId");

  if (!tenantId) {
    return NextResponse.json({ error: "tenantId erforderlich" }, { status: 400 });
  }

  const [ordersData, eqData, tplData, partsData] = await Promise.all([
    db.query.maintenanceOrders.findMany({
      where: eq(maintenanceOrders.tenantId, tenantId),
      with: { currentStatus: true, equipment: true },
      limit: 100,
    }),
    db.query.equipments.findMany({
      where: eq(equipments.tenantId, tenantId),
      limit: 200,
    }),
    db.query.inspectionTemplates.findMany({
      where: eq(inspectionTemplates.tenantId, tenantId),
      limit: 50,
    }),
    db.query.spareParts.findMany({
      where: eq(spareParts.tenantId, tenantId),
      limit: 200,
    }),
  ]);

  return NextResponse.json({
    orders: ordersData.map((o) => ({
      id: o.id,
      tenantId: o.tenantId,
      orderNumber: o.orderNumber,
      orderTypeId: o.orderTypeId,
      currentStatusId: o.currentStatusId,
      statusCode: o.currentStatus.code,
      statusName: o.currentStatus.name,
      priority: o.priority,
      title: o.title,
      description: o.description,
      equipmentId: o.equipmentId,
      equipmentNumber: o.equipment?.equipmentNumber,
      equipmentName: o.equipment?.name,
      assignedToUserId: o.assignedToUserId,
      scheduledStartAt: o.scheduledStartAt?.toISOString(),
      scheduledEndAt: o.scheduledEndAt?.toISOString(),
      actualDurationMinutes: o.actualDurationMinutes,
      checklistResultsJson: o.checklistResultsJson,
      syncStatus: "SYNCED",
      updatedAt: o.updatedAt.toISOString(),
    })),
    equipments: eqData.map((e) => ({
      id: e.id,
      tenantId: e.tenantId,
      equipmentNumber: e.equipmentNumber,
      name: e.name,
      criticality: e.criticality,
      status: e.status,
      functionalLocationId: e.functionalLocationId,
      parentEquipmentId: e.parentEquipmentId,
      manufacturer: e.manufacturer,
      modelType: e.modelType,
      serialNumber: e.serialNumber,
      sapEquipmentNr: e.sapEquipmentNr,
    })),
    templates: tplData.map((t) => ({
      id: t.id,
      tenantId: t.tenantId,
      code: t.code,
      name: t.name,
      version: t.version,
      schemaJson: t.schemaJson,
      estimatedDurationMinutes: t.estimatedDurationMinutes,
    })),
    spareParts: partsData.map((p) => ({
      id: p.id,
      tenantId: p.tenantId,
      internalPartNumber: p.internalPartNumber,
      name: p.name,
      stockQuantity: parseFloat(p.stockQuantity),
      storageLocation: p.storageLocation,
      sapMaterialNr: p.sapMaterialNr,
    })),
  });
}

export async function POST(req: NextRequest) {
  try {
    const item = await req.json();
    const {
      clientMutationId,
      tenantId,
      userId,
      entityType,
      action,
      targetEntityId,
      payload,
      createdAt,
    } = item;

    // 1. NEUER AUFTRAG OFFLINE ERSTELLT
    if (entityType === "ORDER" && action === "CREATE") {
      // Idempotency Check: Wurde der Auftrag bereits synchronisiert?
      const existing = await db.query.maintenanceOrders.findFirst({
        where: and(
          eq(maintenanceOrders.tenantId, tenantId),
          eq(maintenanceOrders.clientCreatedOfflineId, clientMutationId)
        ),
      });

      if (!existing) {
        // Initiale Auftragsstatus ID laden
        const initialStatus = await db.query.workflowStatuses.findFirst({
          where: and(
            eq(workflowStatuses.tenantId, tenantId),
            eq(workflowStatuses.isInitialStatus, true)
          ),
        });

        const [createdOrder] = await db
          .insert(maintenanceOrders)
          .values({
            tenantId,
            orderNumber: payload.orderNumber || `MO-OFF-${Date.now().toString().slice(-6)}`,
            orderTypeId: payload.orderTypeId,
            currentStatusId: initialStatus ? initialStatus.id : payload.currentStatusId,
            priority: payload.priority || "3_MEDIUM",
            title: payload.title,
            description: payload.description,
            equipmentId: payload.equipmentId || null,
            functionalLocationId: payload.functionalLocationId || null,
            inspectionTemplateId: payload.inspectionTemplateId || null,
            reportedByUserId: userId,
            assignedToUserId: payload.assignedToUserId || null,
            clientCreatedOfflineId: clientMutationId,
            scheduledStartAt: payload.scheduledStartAt ? new Date(payload.scheduledStartAt) : null,
            scheduledEndAt: payload.scheduledEndAt ? new Date(payload.scheduledEndAt) : null,
          })
          .returning();

        // Optional SAP Sync
        const connector = await getSapConnector(tenantId);
        await connector.migrateOrderToSap(createdOrder.id).catch(() => {});
      }

      return NextResponse.json({ success: true, processedMutationId: clientMutationId });
    }

    // 2. STATUSWECHSEL DURCHGEFÜHRT
    if (entityType === "ORDER_STATUS" && action === "TRANSITION") {
      await transitionOrderStatus(targetEntityId, payload.targetStatusId, userId, {
        comment: payload.comment,
        recordedOfflineAt: createdAt ? new Date(createdAt) : undefined,
      });

      return NextResponse.json({ success: true, processedMutationId: clientMutationId });
    }

    // 3. ERSATZTEILBUCHUNG
    if (entityType === "SPARE_PART_BOOKING" && action === "BOOK_PARTS") {
      // Idempotency Check
      const existing = await db.query.orderSparePartBookings.findFirst({
        where: and(
          eq(orderSparePartBookings.tenantId, tenantId),
          eq(orderSparePartBookings.clientBookingOfflineId, clientMutationId)
        ),
      });

      if (!existing) {
        const connector = await getSapConnector(tenantId);
        await connector.bookSparePartConsumption(
          targetEntityId,
          payload.sapMaterialNr || payload.internalPartNumber,
          payload.quantity,
          payload.storageLocation,
          {
            userId,
            unitPrice: payload.unitPrice,
            batchNumber: payload.batchNumber,
            clientBookingOfflineId: clientMutationId, // Verhindert zuverlässig doppelte Buchungen!
          }
        );
      }

      return NextResponse.json({ success: true, processedMutationId: clientMutationId });
    }

    // 4. PRÜFPROTOKOLL ERGEBNISSE
    if (entityType === "CHECKLIST" && action === "UPDATE") {
      await db
        .update(maintenanceOrders)
        .set({
          checklistResultsJson: payload.checklistResultsJson,
          actualDurationMinutes: payload.actualDurationMinutes || undefined,
          updatedAt: new Date(),
        })
        .where(eq(maintenanceOrders.id, targetEntityId));

      return NextResponse.json({ success: true, processedMutationId: clientMutationId });
    }

    return NextResponse.json({ success: true, message: "Unbekannte Mutation ignoriert" });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Fehler beim Verarbeiten der Mutation" },
      { status: 500 }
    );
  }
}
