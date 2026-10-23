import { Suspense } from "react";
import { db } from "@/db";
import { tenants, maintenanceOrders, equipments, users } from "@/db/schema";
import { OrdersDashboard, OrderItemView } from "@/components/orders/orders-dashboard";
import { EquipmentOption } from "@/components/orders/create-order-form";

export const metadata = {
  title: "Instandhaltungsaufträge & Störungen | MaintAI",
  description: "Auftragsliste, Störungserfassung und mobile Rückmeldungen mit Offline-Sync",
};

export default async function OrdersPage() {
  let tenantId = "demo-tenant-1000";
  let serverOrders: OrderItemView[] = [];
  let equipmentList: EquipmentOption[] = [];
  let defaultUserId = "demo-user-meister";

  try {
    const tenant = await db.query.tenants.findFirst();
    if (tenant) {
      tenantId = tenant.id;

      // 1. Equipments laden
      const loadedEquipments = await db.query.equipments.findMany({
        where: (eq, { eq: eqOp }) => eqOp(eq.tenantId, tenant.id),
        limit: 100,
      });

      if (loadedEquipments && loadedEquipments.length > 0) {
        equipmentList = loadedEquipments.map((e) => ({
          id: e.id,
          name: e.name,
          equipmentNumber: e.equipmentNumber,
          criticality: e.criticality,
        }));
      }

      // 2. Aufträge laden
      const loadedOrders = await db.query.maintenanceOrders.findMany({
        where: (o, { eq: eqOp }) => eqOp(o.tenantId, tenant.id),
        with: {
          currentStatus: true,
          equipment: true,
          assignedToUser: true,
        },
        orderBy: (orders, { desc }) => [desc(orders.createdAt)],
        limit: 50,
      });

      if (loadedOrders && loadedOrders.length > 0) {
        serverOrders = loadedOrders.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          title: o.title,
          description: o.description,
          priority: o.priority,
          currentStatusId: o.currentStatusId,
          statusCode: o.currentStatus?.code,
          statusName: o.currentStatus?.name,
          equipmentId: o.equipmentId,
          equipmentName: o.equipment?.name,
          equipmentNumber: o.equipment?.equipmentNumber,
          assignedToUserId: o.assignedToUserId,
          assignedToName: o.assignedToUser ? `${o.assignedToUser.firstName} ${o.assignedToUser.lastName}` : null,
          scheduledStartAt: o.scheduledStartAt ? o.scheduledStartAt.toISOString() : null,
          actualDurationMinutes: o.actualDurationMinutes,
          resolutionSummary: o.resolutionSummary,
          causeCode: o.causeCode,
          syncStatus: "SYNCED",
          updatedAt: o.updatedAt.toISOString(),
        }));
      }

      const firstUser = await db.query.users.findFirst({
        where: (u, { eq: eqOp }) => eqOp(u.tenantId, tenant.id),
      });
      if (firstUser) {
        defaultUserId = firstUser.id;
      }
    }
  } catch (err) {
    console.warn("Database unavailable on OrdersPage, falling back to demo data.");
  }

  // Graceful Fallback-Daten falls DB leer oder offline
  if (equipmentList.length === 0) {
    equipmentList = [
      { id: "eq-1", name: "Kreiselpumpe KSB Etanorm", equipmentNumber: "EQ-P101", criticality: "A" },
      { id: "eq-2", name: "Antriebsmotor Siemens 45kW", equipmentNumber: "EQ-M102", criticality: "A" },
      { id: "eq-3", name: "Hauptverteiler Fertigungslinie 2", equipmentNumber: "EQ-HV02", criticality: "B" },
      { id: "eq-4", name: "Kaeser Schraubenkompressor", equipmentNumber: "EQ-C401", criticality: "B" },
      { id: "eq-5", name: "Hydraulikpresse Schuler 500t", equipmentNumber: "EQ-HP50", criticality: "A" },
    ];
  }

  if (serverOrders.length === 0) {
    serverOrders = [
      {
        id: "order-demo-101",
        orderNumber: "MO-2026-00412",
        title: "Dichtungstausch & Laufradreinigung Pumpe P-101",
        description: "Kreiselpumpe KSB verliert Druck, mechanische Dichtung muss inspiziert und ggf. ersetzt werden.",
        priority: "1_EMERGENCY",
        currentStatusId: "stat-open",
        statusCode: "OPEN",
        statusName: "Freigegeben",
        equipmentId: "eq-1",
        equipmentName: "Kreiselpumpe KSB Etanorm",
        equipmentNumber: "EQ-P101",
        assignedToUserId: "tech-1",
        assignedToName: "Hans Meier",
        scheduledStartAt: new Date().toISOString(),
        actualDurationMinutes: null,
        syncStatus: "SYNCED",
        updatedAt: new Date().toISOString(),
      },
      {
        id: "order-demo-102",
        orderNumber: "MO-2026-00413",
        title: "Schwingungsanalyse & Nachschmieren Motorlager",
        description: "Antriebsmotor Siemens 45kW weist erhöhte Vibrationswerte im B-Lager auf.",
        priority: "2_HIGH",
        currentStatusId: "stat-in-work",
        statusCode: "IN_WORK",
        statusName: "In Arbeit",
        equipmentId: "eq-2",
        equipmentName: "Antriebsmotor Siemens 45kW",
        equipmentNumber: "EQ-M102",
        assignedToUserId: "tech-3",
        assignedToName: "Stefan Weber",
        scheduledStartAt: new Date().toISOString(),
        actualDurationMinutes: 30,
        syncStatus: "SYNCED",
        updatedAt: new Date().toISOString(),
      },
      {
        id: "order-demo-103",
        orderNumber: "MO-2026-00414",
        title: "Schaltschrank-Thermografie & Klemmenprüfung",
        description: "Zyklische thermografische Inspektion der Hauptabgänge auf Hotspots nach DGUV V3.",
        priority: "3_MEDIUM",
        currentStatusId: "stat-open",
        statusCode: "OPEN",
        statusName: "Freigegeben",
        equipmentId: "eq-3",
        equipmentName: "Hauptverteiler Fertigungslinie 2",
        equipmentNumber: "EQ-HV02",
        assignedToUserId: "tech-2",
        assignedToName: "Klaus Schmidt",
        scheduledStartAt: new Date().toISOString(),
        actualDurationMinutes: null,
        syncStatus: "SYNCED",
        updatedAt: new Date().toISOString(),
      },
      {
        id: "order-demo-104",
        orderNumber: "MO-2026-00415",
        title: "Filterwechsel & Kondensatableiter prüfen",
        description: "Wartung des Kaeser Druckluftkompressors, Ansaugfilter und Ölfilter tauschen.",
        priority: "4_LOW",
        currentStatusId: "stat-tech-completed",
        statusCode: "TECH_COMPLETED",
        statusName: "Technisch abgeschlossen (TABG)",
        equipmentId: "eq-4",
        equipmentName: "Kaeser Schraubenkompressor",
        equipmentNumber: "EQ-C401",
        assignedToUserId: "tech-4",
        assignedToName: "Markus Bauer",
        scheduledStartAt: new Date().toISOString(),
        actualDurationMinutes: 75,
        resolutionSummary: "Filterpatronen getauscht, Kondensatablass gereinigt und Dichtigkeit geprüft.",
        causeCode: "MECH_VERSCHLEISS",
        syncStatus: "SYNCED",
        updatedAt: new Date().toISOString(),
      },
    ];
  }

  return (
    <Suspense
      fallback={
        <div className="p-8 flex items-center justify-center text-slate-400 text-sm">
          Lade Instandhaltungsaufträge...
        </div>
      }
    >
      <OrdersDashboard
        tenantId={tenantId}
        serverOrders={serverOrders}
        equipments={equipmentList}
        defaultUserId={defaultUserId}
      />
    </Suspense>
  );
}
