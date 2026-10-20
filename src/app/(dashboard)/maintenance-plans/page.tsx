import { db } from "@/lib/db";
import {
  tenants,
  maintenancePlans,
  maintenancePlanItems,
  equipments,
  roles,
  inspectionTemplates,
  orderTypes,
} from "@/lib/db/schema";
import {
  MaintenancePlanBatchGrid,
  BatchPlanItemRow,
} from "@/components/maintenance-plans/batch-grid";
import { eq } from "drizzle-orm";
import { Calendar, Layers, Sliders, CheckSquare, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Zyklische Wartungspläne & Batch-Grid | MaintAI",
  description: "Hochperformante Batch-Pflege und Massenänderung für Instandhaltungs-Wartungspläne",
};

export default async function MaintenancePlansPage() {
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

  // 1. Stammdaten laden
  const allRoles = await db.query.roles.findMany({
    where: eq(roles.tenantId, tenant.id),
  });

  const allTemplates = await db.query.inspectionTemplates.findMany({
    where: eq(inspectionTemplates.tenantId, tenant.id),
  });

  let allEquipments = await db.query.equipments.findMany({
    where: eq(equipments.tenantId, tenant.id),
  });

  // Seeds anlegen, falls noch keine Equipments vorhanden
  if (allEquipments.length === 0) {
    await db.insert(equipments).values([
      {
        tenantId: tenant.id,
        equipmentNumber: "EQ-10042",
        name: "Kreiselpumpe KSB Etanorm 050-200",
        manufacturer: "KSB",
        criticality: "A",
      },
      {
        tenantId: tenant.id,
        equipmentNumber: "EQ-10043",
        name: "Drehstrom-Asynchronmotor Siemens 45kW",
        manufacturer: "Siemens",
        criticality: "B",
      },
      {
        tenantId: tenant.id,
        equipmentNumber: "EQ-10044",
        name: "Schraubenkompressor Kaeser CSDX 165",
        manufacturer: "Kaeser",
        criticality: "A",
      },
    ]);
    allEquipments = await db.query.equipments.findMany({
      where: eq(equipments.tenantId, tenant.id),
    });
  }

  // 2. Auftragsart für Wartung sicherstellen
  let maintOrderType = await db.query.orderTypes.findFirst({
    where: (ot, { eq }) => eq(ot.tenantId, tenant.id),
  });

  if (!maintOrderType) {
    const [created] = await db
      .insert(orderTypes)
      .values({
        tenantId: tenant.id,
        code: "IH02",
        name: "Präventive Wartung",
        sapOrderTypeCode: "PM02",
        colorHex: "#3B82F6",
      })
      .returning();
    maintOrderType = created;
  }

  // 3. Wartungsplan sicherstellen
  let plan = await db.query.maintenancePlans.findFirst({
    where: eq(maintenancePlans.tenantId, tenant.id),
  });

  if (!plan) {
    const now = new Date();
    const nextDue = new Date();
    nextDue.setDate(now.getDate() + 30);

    const [createdPlan] = await db
      .insert(maintenancePlans)
      .values({
        tenantId: tenant.id,
        planNumber: "WP-2026-001",
        name: "Zentrale Antriebs- & Pumpen-Inspektion",
        orderTypeId: maintOrderType.id,
        cycleValue: 30,
        cycleUnit: "DAYS",
        startDate: now,
        nextDueDate: nextDue,
      })
      .returning();
    plan = createdPlan;

    // Standard-Positionen erzeugen
    await db.insert(maintenancePlanItems).values([
      {
        tenantId: tenant.id,
        maintenancePlanId: plan.id,
        positionNumber: 10,
        title: "Sichtprüfung Gleitringdichtung & Leckagekontrolle",
        equipmentId: allEquipments[0]?.id || null,
        assignedRoleId: allRoles[0]?.id || null,
        inspectionTemplateId: allTemplates[0]?.id || null,
        estimatedDurationMinutes: 30,
      },
      {
        tenantId: tenant.id,
        maintenancePlanId: plan.id,
        positionNumber: 20,
        title: "Schwingungsmessung & Schmierstoffkontrolle Motorlager",
        equipmentId: allEquipments[1]?.id || null,
        assignedRoleId: allRoles[0]?.id || null,
        inspectionTemplateId: allTemplates[0]?.id || null,
        estimatedDurationMinutes: 45,
      },
      {
        tenantId: tenant.id,
        maintenancePlanId: plan.id,
        positionNumber: 30,
        title: "Druckluft-Filterwechsel & Kondensatabscheider-Prüfung",
        equipmentId: allEquipments[2]?.id || null,
        assignedRoleId: allRoles[0]?.id || null,
        inspectionTemplateId: allTemplates[0]?.id || null,
        estimatedDurationMinutes: 60,
      },
    ]);
  }

  // 4. Alle Wartungspositionen für das Batch-Grid laden
  const rawItems = await db.query.maintenancePlanItems.findMany({
    where: eq(maintenancePlanItems.tenantId, tenant.id),
    with: {
      maintenancePlan: true,
      equipment: true,
      assignedRole: true,
      inspectionTemplate: true,
    },
    orderBy: (items, { asc }) => [asc(items.positionNumber)],
  });

  const formattedItems: BatchPlanItemRow[] = rawItems.map((item) => ({
    id: item.id,
    positionNumber: item.positionNumber,
    title: item.title,
    planNumber: item.maintenancePlan.planNumber,
    planName: item.maintenancePlan.name,
    cycleValue: item.maintenancePlan.cycleValue,
    cycleUnit: item.maintenancePlan.cycleUnit,
    equipmentId: item.equipmentId,
    equipmentNumber: item.equipment?.equipmentNumber || null,
    equipmentName: item.equipment?.name || null,
    assignedRoleId: item.assignedRoleId,
    roleCode: item.assignedRole?.code || null,
    roleName: item.assignedRole?.name || null,
    inspectionTemplateId: item.inspectionTemplateId,
    templateCode: item.inspectionTemplate?.code || null,
    templateName: item.inspectionTemplate?.name || null,
    estimatedDurationMinutes: item.estimatedDurationMinutes,
  }));

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Calendar className="h-7 w-7 text-blue-500" />
            Zyklische Wartungspläne & Checkpositionen Batch-Pflege
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Verwalte hunderte Prüfpositionen effizient: Multi-Row Selektion, Direktbearbeitung
            in der Zelle per Tastatur und Massenänderung für Intervalle, Rollen und Vorlagen.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-neutral-700 bg-neutral-900 text-neutral-300">
            <Layers className="h-3.5 w-3.5 text-blue-400 mr-1" />
            TanStack Virtual Grid
          </Badge>
          <Badge variant="outline" className="border-neutral-700 bg-neutral-900 text-neutral-300">
            <Sliders className="h-3.5 w-3.5 text-emerald-400 mr-1" />
            50+ Batch Modifikationen
          </Badge>
        </div>
      </div>

      {/* Batch-Tabelle */}
      <MaintenancePlanBatchGrid
        initialItems={formattedItems}
        roles={allRoles}
        templates={allTemplates}
        equipments={allEquipments}
      />
    </div>
  );
}
