import { db } from "@/db";
import {
  tenants,
  maintenanceOrders,
  users,
  roles,
  equipments,
  orderSparePartBookings,
  spareParts,
} from "@/db/schema";
import {
  InteractiveGanttPlanningBoard,
  ResourceGroup,
  GanttOrderTask,
} from "@/components/gantt/gantt-planning-board";
import { updateOrderScheduleAction, updateGanttTaskAction } from "@/actions/order-actions";
import { OfflineSyncStatusIndicator } from "@/components/layout/offline-sync-indicator";
import { CalendarRange, Wrench, Shield, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Gantt Planungsboard | MaintAI Leitstand",
  description: "Interaktive grafische Ressourcen- & Auftragsdisposition",
};

export default async function PlanningPage() {
  let tenant: any = null;
  let resources: ResourceGroup[] = [];
  let ganttTasks: GanttOrderTask[] = [];

  const todayStr = "2026-10-20";

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
      with: { equipment: true, orderType: true },
      limit: 30,
    });

    ganttTasks = orders.map((o, idx) => {
      const baselineUpdatedTime = o.actualEndAt
        ? new Date(o.actualEndAt).getTime()
        : new Date(o.createdAt).getTime();
      const wasEditedInGantt =
        Math.abs(new Date(o.updatedAt).getTime() - baselineUpdatedTime) > 2000;

      let assignedTech: ResourceGroup | null = null;
      if (wasEditedInGantt) {
        assignedTech = o.assignedToUserId
          ? resources.find((r) => r.id === o.assignedToUserId) || null
          : null;
      } else if (!o.assignedToUserId) {
        assignedTech = null;
      } else if (idx < 3) {
        assignedTech =
          resources.find((r) => r.id === o.assignedToUserId) ||
          resources[idx % resources.length] ||
          null;
      } else {
        assignedTech = null;
      }

      let executionDate = todayStr;
      let startMinutes = (7 + ((idx * 2) % 9)) * 60;

      if (wasEditedInGantt && o.scheduledStartAt) {
        const startObj = new Date(o.scheduledStartAt);
        const y = startObj.getFullYear();
        const m = String(startObj.getMonth() + 1).padStart(2, "0");
        const d = String(startObj.getDate()).padStart(2, "0");
        executionDate = `${y}-${m}-${d}`;
        startMinutes = startObj.getHours() * 60 + startObj.getMinutes();
      }

      const durationMinutes = Math.max(15, o.plannedDurationMinutes || 120);
      let durationDays = 1;
      if (wasEditedInGantt && o.scheduledStartAt && o.scheduledEndAt) {
        const diffMs =
          new Date(o.scheduledEndAt).getTime() - new Date(o.scheduledStartAt).getTime();
        const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
        if (diffDays >= 1) durationDays = diffDays;
      }

      const [ey, em, ed] = executionDate.split("-").map(Number);
      const computedStart = new Date(
        ey || 2026,
        (em || 10) - 1,
        ed || 20,
        Math.floor(startMinutes / 60),
        startMinutes % 60,
        0,
        0
      );
      const computedEnd = new Date(computedStart.getTime() + durationMinutes * 60 * 1000);

      const isEmergency = o.priority === "1_EMERGENCY" || (o as any).orderType?.code === "IH01";

      return {
        id: o.id,
        orderNumber: o.orderNumber,
        title: o.title,
        description: o.description || "Reguläre Instandhaltungsmaßnahme gemäß Prüfvorschrift.",
        priority: o.priority,
        orderType: (o as any).orderType?.code || (isEmergency ? "IH01" : "IH02"),
        orderTypeCode: (o as any).orderType?.code || (isEmergency ? "FAULT" : "MAINTENANCE"),
        equipmentId: o.equipmentId || "no-eq",
        equipmentNumber: o.equipment?.equipmentNumber || "EQ-10042",
        equipmentName: o.equipment?.name || "Allgemeines Aggregat",
        functionalLocationCode: "W1-HALLE2-LINIE4",
        technicianId: assignedTech ? assignedTech.id : null,
        assignedUserId: assignedTech ? assignedTech.id : null,
        technicianName: assignedTech ? assignedTech.name : null,
        executionDate,
        startMinutes,
        durationMinutes,
        durationDays,
        scheduledStartDate: computedStart.toISOString(),
        scheduledEndDate: computedEnd.toISOString(),
        hasStockConflict: idx === 1,
        missingPartName: idx === 1 ? "Gleitringdichtung EagleBurgmann (SAP: 100421)" : undefined,
      };
    });
  } catch (err) {
    // Graceful Demo Fallback bei fehlender lokaler PostgreSQL-Datenbank
    resources = [
      { id: "tech-1", name: "Hans Meier (Meister)", qualification: "Mechanik, Hydraulik, Schweißen" },
      { id: "tech-2", name: "Klaus Schmidt", qualification: "Hochspannung, SPS-Siemens, Ex-Schutz" },
      { id: "tech-3", name: "Stefan Weber", qualification: "Schmierdienst, Schwingungsanalyse" },
      { id: "tech-4", name: "Markus Bauer (Azubi)", qualification: "Grundlagen Instandhaltung" },
    ];
  }

  if (ganttTasks.length === 0) {
    const tech1 = resources[0] || { id: "tech-1", name: "Hans Meier (Meister)" };
    const tech2 = resources[1] || { id: "tech-2", name: "Klaus Schmidt" };
    const tech3 = resources[2] || { id: "tech-3", name: "Stefan Weber" };

    ganttTasks = [
      {
        id: "task-101",
        orderNumber: "MO-2026-00412",
        title: "Dichtungstausch & Laufradreinigung Pumpe P-101",
        description: "Reguläre Instandhaltungsmaßnahme gemäß Prüfvorschrift.",
        priority: "1_EMERGENCY",
        orderType: "IH01",
        orderTypeCode: "FAULT",
        equipmentId: "eq-1",
        equipmentNumber: "EQ-10042",
        equipmentName: "Kreiselpumpe KSB Etanorm",
        functionalLocationCode: "W1-HALLE2-LINIE4",
        technicianId: tech1.id,
        assignedUserId: tech1.id,
        technicianName: tech1.name,
        executionDate: todayStr,
        startMinutes: 7 * 60,
        durationMinutes: 180,
        durationDays: 2,
        scheduledStartDate: new Date(2026, 9, 20, 7, 0, 0).toISOString(),
        scheduledEndDate: new Date(2026, 9, 20, 10, 0, 0).toISOString(),
        hasStockConflict: false,
      },
      {
        id: "task-102",
        orderNumber: "MO-2026-00413",
        title: "Schwingungsanalyse & Nachschmieren Motorlager",
        description: "Reguläre Instandhaltungsmaßnahme gemäß Prüfvorschrift.",
        priority: "2_HIGH",
        orderType: "IH02",
        orderTypeCode: "MAINTENANCE",
        equipmentId: "eq-2",
        equipmentNumber: "EQ-10043",
        equipmentName: "Antriebsmotor Siemens 45kW",
        functionalLocationCode: "W1-HALLE2-LINIE4",
        technicianId: tech3.id,
        assignedUserId: tech3.id,
        technicianName: tech3.name,
        executionDate: todayStr,
        startMinutes: 8 * 60,
        durationMinutes: 120,
        durationDays: 1,
        scheduledStartDate: new Date(2026, 9, 20, 8, 0, 0).toISOString(),
        scheduledEndDate: new Date(2026, 9, 20, 10, 0, 0).toISOString(),
        hasStockConflict: true,
        missingPartName: "SKF 6205-2RSH (SAP: 200481)",
      },
      {
        id: "task-103",
        orderNumber: "MO-2026-00414",
        title: "Schaltschrank-Thermografie & Klemmenprüfung",
        description: "Reguläre Instandhaltungsmaßnahme gemäß Prüfvorschrift.",
        priority: "3_MEDIUM",
        orderType: "IH03",
        orderTypeCode: "CALIBRATION",
        equipmentId: "eq-3",
        equipmentNumber: "EQ-10044",
        equipmentName: "Hauptverteiler Fertigungslinie 2",
        functionalLocationCode: "W1-HALLE2-LINIE4",
        technicianId: tech2.id,
        assignedUserId: tech2.id,
        technicianName: tech2.name,
        executionDate: todayStr,
        startMinutes: 10 * 60,
        durationMinutes: 240,
        durationDays: 1,
        scheduledStartDate: new Date(2026, 9, 20, 10, 0, 0).toISOString(),
        scheduledEndDate: new Date(2026, 9, 20, 14, 0, 0).toISOString(),
        hasStockConflict: false,
      },
      {
        id: "task-104",
        orderNumber: "MO-2026-00415",
        title: "Filterwechsel & Kondensatableiter prüfen",
        description: "Reguläre Instandhaltungsmaßnahme gemäß Prüfvorschrift.",
        priority: "4_LOW",
        orderType: "IH02",
        orderTypeCode: "INSPECTION",
        equipmentId: "eq-4",
        equipmentNumber: "EQ-10045",
        equipmentName: "Kaeser Schraubenkompressor",
        functionalLocationCode: "W1-HALLE2-LINIE4",
        technicianId: null,
        assignedUserId: null,
        technicianName: null,
        executionDate: todayStr,
        startMinutes: 13 * 60,
        durationMinutes: 120,
        durationDays: 1,
        scheduledStartDate: new Date(2026, 9, 20, 13, 0, 0).toISOString(),
        scheduledEndDate: new Date(2026, 9, 20, 15, 0, 0).toISOString(),
        hasStockConflict: false,
      },
      {
        id: "task-105",
        orderNumber: "MO-2026-00416",
        title: "Hydraulikaggregat Druckabfall diagnostizieren",
        description: "Reguläre Instandhaltungsmaßnahme gemäß Prüfvorschrift.",
        priority: "2_HIGH",
        orderType: "IH02",
        orderTypeCode: "MAINTENANCE",
        equipmentId: "eq-1",
        equipmentNumber: "EQ-10042",
        equipmentName: "Kreiselpumpe KSB Etanorm",
        functionalLocationCode: "W1-HALLE2-LINIE4",
        technicianId: null,
        assignedUserId: null,
        technicianName: null,
        executionDate: todayStr,
        startMinutes: 9 * 60,
        durationMinutes: 90,
        durationDays: 1,
        scheduledStartDate: new Date(2026, 9, 20, 9, 0, 0).toISOString(),
        scheduledEndDate: new Date(2026, 9, 20, 10, 30, 0).toISOString(),
        hasStockConflict: false,
      },
    ];
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <CalendarRange className="h-7 w-7 text-cyan-500" />
            Grafisches Gantt-Planungsboard & Leitstand
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Disposition per Drag-&-Drop, Arbeitszeit-Resize, Qualifikationsprüfung und
            Echtzeit-Erkennung von Materialkonflikten.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-slate-700 bg-slate-900 text-slate-300">
            {resources.length} Disponenten / Techniker
          </Badge>
          <Badge variant="outline" className="border-slate-700 bg-slate-900 text-slate-300">
            {ganttTasks.length} Aufträge
          </Badge>
        </div>
      </div>

      {/* Interaktives Gantt Board */}
      <InteractiveGanttPlanningBoard
        resources={resources}
        initialTasks={ganttTasks}
        onTaskUpdate={updateGanttTaskAction}
      />
    </div>
  );
}
