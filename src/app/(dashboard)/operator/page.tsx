import Link from "next/link";
import { db } from "@/db";
import { tenants, maintenanceOrders, equipments, functionalLocations, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { OperatorDashboardView, OperatorOrder } from "@/components/operator/operator-dashboard-view";
import { Wrench, Sparkles, PlusCircle } from "lucide-react";

export const metadata = {
  title: "Maschinenbediener-Terminal | MaintAI",
  description: "Bereichsbezogene Störungserfassung und Statusüberwachung für Werker & Maschinenbediener",
};

export default async function OperatorDashboardPage() {
  let orders: OperatorOrder[] = [];
  let equipmentList: Array<{ id: string; name: string; equipmentNumber: string; plantSection?: string }> = [];

  try {
    const tenant = await db.query.tenants.findFirst();

    if (tenant) {
      // Equipments laden
      const dbEquipments = await db.query.equipments.findMany({
        where: eq(equipments.tenantId, tenant.id),
        with: {
          functionalLocation: true,
        },
        limit: 100,
      });

      equipmentList = dbEquipments.map((e) => ({
        id: e.id,
        name: e.name,
        equipmentNumber: e.equipmentNumber,
        plantSection: e.functionalLocation?.plantSection || undefined,
      }));

      // Aufträge laden
      const dbOrders = await db.query.maintenanceOrders.findMany({
        where: eq(maintenanceOrders.tenantId, tenant.id),
        with: {
          currentStatus: true,
          equipment: {
            with: {
              functionalLocation: true,
            },
          },
          reportedByUser: true,
          assignedToUser: true,
        },
        orderBy: [desc(maintenanceOrders.createdAt)],
        limit: 50,
      });

      orders = dbOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        title: o.title,
        description: o.description,
        priority: o.priority,
        statusCode: o.currentStatus?.code || "OPEN",
        statusName: o.currentStatus?.name || "Gemeldet",
        equipmentId: o.equipmentId,
        equipmentName: o.equipment?.name,
        equipmentNumber: o.equipment?.equipmentNumber,
        plantSection: o.equipment?.functionalLocation?.plantSection || "Fertigung",
        reportedByName: o.reportedByUser ? `${o.reportedByUser.firstName} ${o.reportedByUser.lastName}` : "Werker",
        assignedTechnicianName: o.assignedToUser ? `${o.assignedToUser.firstName} ${o.assignedToUser.lastName}` : null,
        createdAt: o.createdAt.toISOString(),
        downtimeMinutes: o.downtimeMinutes,
      }));
    }
  } catch (err) {
    console.warn("OperatorPage fallback:", err);
  }

  if (equipmentList.length === 0) {
    equipmentList = [
      { id: "eq-1", name: "Kreiselpumpe KSB Etanorm", equipmentNumber: "EQ-P101", plantSection: "Fertigung 1" },
      { id: "eq-2", name: "Antriebsmotor Siemens 45kW", equipmentNumber: "EQ-M102", plantSection: "Fertigung 1" },
      { id: "eq-3", name: "Kaeser Schraubenkompressor", equipmentNumber: "EQ-C401", plantSection: "Infrastruktur" },
      { id: "eq-4", name: "Hydraulikpresse Schuler 500t", equipmentNumber: "EQ-HP50", plantSection: "Fertigung 2" },
    ];
  }

  if (orders.length === 0) {
    orders = [
      {
        id: "order-op-1",
        orderNumber: "MO-2026-00412",
        title: "Kreiselpumpe KSB Etanorm: Druckabfall & Vibration",
        description: "Plötzlicher Druckverlust im Sekundärkreislauf. Hohe Geräuschentwicklung an Lager A.",
        priority: "1_EMERGENCY",
        statusCode: "IN_WORK",
        statusName: "In Arbeit",
        equipmentId: "eq-1",
        equipmentName: "Kreiselpumpe KSB Etanorm",
        equipmentNumber: "EQ-P101",
        plantSection: "Fertigung 1",
        reportedByName: "Michael Melder",
        assignedTechnicianName: "Thomas Techniker",
        createdAt: new Date().toISOString(),
        downtimeMinutes: 25,
      },
      {
        id: "order-op-2",
        orderNumber: "MO-2026-00415",
        title: "Förderband Linie 2 Schlupf bei Vollbeladung",
        description: "Antriebsrolle dreht zeitweise durch, Taktzeitverzögerung ca. 15 Sekunden.",
        priority: "2_HIGH",
        statusCode: "OPEN",
        statusName: "Freigegeben",
        equipmentId: "eq-2",
        equipmentName: "Antriebsmotor Siemens 45kW",
        equipmentNumber: "EQ-M102",
        plantSection: "Fertigung 1",
        reportedByName: "Michael Melder",
        assignedTechnicianName: null,
        createdAt: new Date(Date.now() - 86400000).toISOString(),
        downtimeMinutes: 0,
      },
    ];
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-150">
      {/* Header mit Sofort-Meldung Button */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-2">
            <span className="text-cyan-400 font-medium">Bediener-Terminal</span>
            <span>/</span>
            <span>Bereichsübersicht & Störungsmeldung</span>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Wrench className="h-7 w-7 text-cyan-500" />
            Maschinenbediener-Dashboard
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Übersicht aller gemeldeten Maßnahmen Ihrer Linie, direkter Reparaturstatus und 1-Click Störungsmeldung.
          </p>
        </div>

        <Link
          href="/orders/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white text-xs font-semibold shadow-lg shadow-blue-600/30 transition-all active:scale-95"
        >
          <Sparkles className="h-4 w-4 text-blue-200" />
          <span>+ Neue Störung melden</span>
        </Link>
      </div>

      <OperatorDashboardView orders={orders} equipments={equipmentList} />
    </div>
  );
}
