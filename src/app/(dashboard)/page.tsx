import { Suspense } from "react";
import { SingleInputWorkspace } from "@/components/dashboard/single-input-workspace";
import { db } from "@/db";
import { equipments, tenants, maintenanceOrders } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export const metadata = {
  title: "MaintAI | Conversational Workspace",
  description: "Zentraler industrieller Conversational Assistant für Instandhaltung & SAP PM",
};

export default async function DashboardHomePage() {
  let tenantId = "demo-tenant-1000";
  let availableEquipments: Array<{ id: string; name: string; equipmentNumber: string; description?: string }> = [];
  let initialOrders: any[] = [];

  try {
    const tenant = await db.query.tenants.findFirst();
    if (tenant) {
      tenantId = tenant.id;
      const loadedEquipments = await db.query.equipments.findMany({
        where: eq(equipments.tenantId, tenant.id),
        limit: 50,
      });
      if (loadedEquipments && loadedEquipments.length > 0) {
        availableEquipments = loadedEquipments.map((e) => ({
          id: e.id,
          name: e.name,
          equipmentNumber: e.equipmentNumber,
          description: e.description || undefined,
        }));
      }

      const loadedOrders = await db.query.maintenanceOrders.findMany({
        where: eq(maintenanceOrders.tenantId, tenant.id),
        with: {
          currentStatus: true,
          equipment: true,
          functionalLocation: {
            with: {
              area: true,
            },
          },
          assignedToUser: true,
        },
        orderBy: [desc(maintenanceOrders.createdAt)],
        limit: 25,
      });
      if (loadedOrders && loadedOrders.length > 0) {
        initialOrders = loadedOrders;
      }
    }
  } catch (err) {
    console.warn("DB not ready on dashboard page, fallback to default data:", err);
  }

  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center p-8 text-slate-500 text-sm">
          Lade Conversational Assistant...
        </div>
      }
    >
      <SingleInputWorkspace
        tenantId={tenantId}
        initialEquipments={availableEquipments}
        initialOrders={initialOrders}
      />
    </Suspense>
  );
}
