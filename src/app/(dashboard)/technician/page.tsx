import Link from "next/link";
import { db } from "@/db";
import { tenants, maintenanceOrders, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { TechnicianDashboardView, TechnicianOrder } from "@/components/technician/technician-dashboard-view";
import { Wrench, Clock, ShieldCheck, Flame } from "lucide-react";

export const metadata = {
  title: "Instandhalter-Dashboard | MaintAI",
  description: "Persönlicher Arbeitsvorrat, Live-Einsatztimer und mobile Arbeitsrückmeldung",
};

export default async function TechnicianPage() {
  let orders: TechnicianOrder[] = [];
  let currentUserId = "demo-user-techniker";
  let currentUserName = "Thomas Techniker";

  try {
    const tenant = await db.query.tenants.findFirst();

    if (tenant) {
      const dbTech = await db.query.users.findFirst({
        where: (u, { and: andOp, eq: eqOp }) =>
          andOp(eqOp(u.tenantId, tenant.id), eqOp(u.lastName, "Techniker")),
      });

      if (dbTech) {
        currentUserId = dbTech.id;
        currentUserName = `${dbTech.firstName} ${dbTech.lastName}`;
      }

      const dbOrders = await db.query.maintenanceOrders.findMany({
        where: eq(maintenanceOrders.tenantId, tenant.id),
        with: {
          currentStatus: true,
          equipment: true,
          assignedToUser: true,
        },
        orderBy: [desc(maintenanceOrders.createdAt)],
        limit: 40,
      });

      orders = dbOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        title: o.title,
        description: o.description,
        priority: o.priority,
        statusCode: o.currentStatus?.code || "OPEN",
        statusName: o.currentStatus?.name || "Freigegeben",
        currentStatusId: o.currentStatusId,
        equipmentName: o.equipment?.name,
        equipmentNumber: o.equipment?.equipmentNumber,
        plannedDurationMinutes: o.plannedDurationMinutes || 60,
        actualDurationMinutes: o.actualDurationMinutes,
        assignedToUserId: o.assignedToUserId,
        assignedToName: o.assignedToUser ? `${o.assignedToUser.firstName} ${o.assignedToUser.lastName}` : null,
        downtimeMinutes: o.downtimeMinutes,
        scheduledStartAt: o.scheduledStartAt ? o.scheduledStartAt.toISOString() : null,
      }));
    }
  } catch (err) {
    console.warn("TechnicianPage fallback:", err);
  }

  if (orders.length === 0) {
    orders = [
      {
        id: "order-t-1",
        orderNumber: "MO-2026-00412",
        title: "Kreiselpumpe KSB: Wellenabdichtung & Lagertausch",
        description: "Lager heult auf Laststufe 3. Temperaturwächter warnt vor Heißläufer.",
        priority: "1_EMERGENCY",
        statusCode: "IN_WORK",
        statusName: "In Arbeit",
        currentStatusId: "stat-in-work",
        equipmentName: "Kreiselpumpe KSB Etanorm",
        equipmentNumber: "EQ-10042",
        plannedDurationMinutes: 90,
        actualDurationMinutes: null,
        assignedToUserId: currentUserId,
        assignedToName: currentUserName,
        downtimeMinutes: 30,
      },
      {
        id: "order-t-2",
        orderNumber: "MO-2026-00416",
        title: "Kaeser Schraubenkompressor: Druckfilterwechsel",
        description: "Zyklischer Filterwechsel nach 2000 Betriebsstunden.",
        priority: "3_MEDIUM",
        statusCode: "OPEN",
        statusName: "Freigegeben",
        currentStatusId: "stat-open",
        equipmentName: "Kaeser Schraubenkompressor",
        equipmentNumber: "EQ-10044",
        plannedDurationMinutes: 45,
        actualDurationMinutes: null,
        assignedToUserId: currentUserId,
        assignedToName: currentUserName,
        downtimeMinutes: 0,
      },
      {
        id: "order-t-3",
        orderNumber: "MO-2026-00418",
        title: "Schaltschrank Thermostreuung & Schützrelais",
        description: "Hauptverteiler Fertigungslinie 2 Lüfterausfall gemeldet.",
        priority: "2_HIGH",
        statusCode: "OPEN",
        statusName: "Im Team-Pool",
        currentStatusId: "stat-open",
        equipmentName: "Hauptverteiler Fertigungslinie 2",
        equipmentNumber: "EQ-10043",
        plannedDurationMinutes: 60,
        actualDurationMinutes: null,
        assignedToUserId: null,
        assignedToName: null,
        downtimeMinutes: 0,
      },
    ];
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-150">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
            <span className="text-emerald-400 font-medium">Techniker-Terminal</span>
            <span>/</span>
            <span>Mobile Arbeitsdisposition & Zeiterfassung</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Wrench className="h-7 w-7 text-emerald-500" />
            Instandhalter-Dashboard
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Persönlicher Arbeitsvorrat, Live-Einsatztimer, Störungsbehebung vor Ort und
            technische Rückmeldung nach SAP PM (TABG).
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/planning"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-semibold transition-all"
          >
            <span>Zum Gantt-Planungsboard</span>
          </Link>
        </div>
      </div>

      <TechnicianDashboardView
        orders={orders}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
      />
    </div>
  );
}
