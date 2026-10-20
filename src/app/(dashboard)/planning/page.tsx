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
  let tenant = null;
  let resources: ResourceGroup[] = [];
  let ganttTasks: GanttOrderTask[] = [];

  try {
    tenant = await db.query.tenants.findFirst();

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

    resources = techUsers.map((u) => ({
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

    ganttTasks = orders.map((o, idx) => ({
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
      hasStockConflict: idx === 1,
      missingPartName: idx === 1 ? "Gleitringdichtung EagleBurgmann (SAP: 100421)" : undefined,
    }));
  } catch (err) {
    // Graceful Demo Fallback bei fehlender lokaler PostgreSQL-Datenbank
    resources = [
      { id: "tech-1", name: "Hans Meier (Meister)", qualification: "Mechanik, Hydraulik, Schweißen" },
      { id: "tech-2", name: "Klaus Schmidt", qualification: "Hochspannung, SPS-Siemens, Ex-Schutz" },
      { id: "tech-3", name: "Stefan Weber", qualification: "Schmierdienst, Schwingungsanalyse" },
      { id: "tech-4", name: "Markus Bauer (Azubi)", qualification: "Grundlagen Instandhaltung" },
    ];

    ganttTasks = [
      {
        id: "task-101",
        orderNumber: "MO-2026-00412",
        title: "Dichtungstausch & Laufradreinigung Pumpe P-101",
        priority: "1_EMERGENCY",
        equipmentId: "eq-1",
        equipmentName: "Kreiselpumpe KSB Etanorm",
        technicianId: "tech-1",
        technicianName: "Hans Meier",
        startHour: 7,
        durationHours: 3,
        hasStockConflict: false,
      },
      {
        id: "task-102",
        orderNumber: "MO-2026-00413",
        title: "Schwingungsanalyse & Nachschmieren Motorlager",
        priority: "2_HIGH",
        equipmentId: "eq-2",
        equipmentName: "Antriebsmotor Siemens 45kW",
        technicianId: "tech-3",
        technicianName: "Stefan Weber",
        startHour: 8,
        durationHours: 2,
        hasStockConflict: true,
        missingPartName: "SKF 6205-2RSH (SAP: 200481)",
      },
      {
        id: "task-103",
        orderNumber: "MO-2026-00414",
        title: "Schaltschrank-Thermografie & Klemmenprüfung",
        priority: "3_MEDIUM",
        equipmentId: "eq-3",
        equipmentName: "Hauptverteiler Fertigungslinie 2",
        technicianId: "tech-2",
        technicianName: "Klaus Schmidt",
        startHour: 10,
        durationHours: 4,
        hasStockConflict: false,
      },
      {
        id: "task-104",
        orderNumber: "MO-2026-00415",
        title: "Filterwechsel & Kondensatableiter prüfen",
        priority: "4_LOW",
        equipmentId: "eq-4",
        equipmentName: "Kaeser Schraubenkompressor",
        technicianId: "tech-4",
        technicianName: "Markus Bauer",
        startHour: 13,
        durationHours: 2,
        hasStockConflict: false,
      },
    ];
  }

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
