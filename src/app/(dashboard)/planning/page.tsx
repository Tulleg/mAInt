import { db } from "@/lib/db";
import {
  tenants,
  maintenanceOrders,
  users,
  roles,
  equipments,
  orderSparePartBookings,
  spareParts,
} from "@/lib/db/schema";
import {
  InteractiveGanttPlanningBoard,
  ResourceGroup,
  GanttOrderTask,
} from "@/components/gantt/gantt-planning-board";
import { OfflineSyncStatusIndicator } from "@/components/layout/offline-sync-indicator";
import { CalendarRange, Wrench, Shield, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Gantt Planungsboard | MaintAI Leitstand",
  description: "Interaktive grafische Ressourcen- & Auftragsdisposition",
};

export default async function PlanningPage() {
  let tenant = await db.query.tenants.findFirst();

  if (!tenant) {
    const [newTenant] = await db
      .insert(tenants)
      .values({
        code: "WERK-1000",
        name: "Produktionswerk München",
        sapPlantCode: "1000",
      })
      .returning();
    tenant = newTenant;
  }

  // 1. Ressourcen laden (Techniker)
  let techUsers = await db.query.users.findMany({
    where: (u, { eq }) => eq(u.tenantId, tenant.id),
    limit: 10,
  });

  if (techUsers.length === 0) {
    // Seed Demo-Techniker
    await db.insert(users).values([
      {
        tenantId: tenant.id,
        email: "schlosser.meier@werk.de",
        passwordHash: "hash-demo",
        firstName: "Hans",
        lastName: "Meier",
        workCenterCode: "MECH-01",
        qualificationMatrix: ["Mechanik", "Hydraulik", "Schweißen"],
      },
      {
        tenantId: tenant.id,
        email: "elektro.schmidt@werk.de",
        passwordHash: "hash-demo",
        firstName: "Klaus",
        lastName: "Schmidt",
        workCenterCode: "ELEK-01",
        qualificationMatrix: ["Hochspannung", "SPS-Siemens", "Ex-Schutz"],
      },
      {
        tenantId: tenant.id,
        email: "service.weber@werk.de",
        passwordHash: "hash-demo",
        firstName: "Stefan",
        lastName: "Weber",
        workCenterCode: "SERV-02",
        qualificationMatrix: ["Schmierdienst", "Vibrationsanalyse"],
      },
    ]);
    techUsers = await db.query.users.findMany({
      where: (u, { eq }) => eq(u.tenantId, tenant.id),
    });
  }

  const resources: ResourceGroup[] = techUsers.map((u) => ({
    id: u.id,
    name: `${u.firstName} ${u.lastName}`,
    qualification: Array.isArray(u.qualificationMatrix)
      ? u.qualificationMatrix.join(", ")
      : u.workCenterCode || "Servicetechniker",
  }));

  // 2. Aufträge für das Gantt laden
  const orders = await db.query.maintenanceOrders.findMany({
    where: (o, { eq }) => eq(o.tenantId, tenant.id),
    with: { equipment: true },
    limit: 20,
  });

  const ganttTasks: GanttOrderTask[] = orders.map((o, idx) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    title: o.title,
    priority: o.priority,
    equipmentId: o.equipmentId || "no-eq",
    equipmentName: o.equipment?.name || "Allgemeines Aggregat",
    technicianId: o.assignedToUserId || resources[idx % resources.length]?.id || "tech-1",
    technicianName:
      resources.find((r) => r.id === o.assignedToUserId)?.name ||
      resources[idx % resources.length]?.name ||
      "Nicht zugeordnet",
    startHour: 7 + ((idx * 2) % 10),
    durationHours: Math.max(1, Math.min(5, Math.round(o.plannedDurationMinutes / 60) || 2)),
    hasStockConflict: idx === 1, // Demonstration eines Materialkonflikts
    missingPartName: idx === 1 ? "Gleitringdichtung EagleBurgmann (SAP: 100421)" : undefined,
  }));

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 md:p-8 space-y-6">
      {/* Header mit Offline-Sync Indikator */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <CalendarRange className="h-7 w-7 text-blue-500" />
            Grafisches Gantt-Planungsboard & Leitstand
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Disposition per Drag-&-Drop, Arbeitszeit-Resize, Qualifikationsprüfung und
            Echtzeit-Erkennung von Materialkonflikten.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <OfflineSyncStatusIndicator />
        </div>
      </div>

      {/* Interaktives Gantt Board */}
      <InteractiveGanttPlanningBoard
        resources={resources}
        initialTasks={ganttTasks}
      />
    </div>
  );
}
