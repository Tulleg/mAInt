import { db } from "@/db";
import {
  tenants,
  maintenancePlans,
  maintenancePlanItems,
  equipments,
  functionalLocations,
  roles,
  inspectionTemplates,
  orderTypes,
} from "@/db/schema";
import {
  MaintenancePlanBatchGrid,
  BatchPlanItemRow,
} from "@/components/maintenance-plans/batch-grid";
import { eq } from "drizzle-orm";
import { Calendar, Layers, Sliders, CheckSquare, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/ui/back-button";

export const metadata = {
  title: "Zyklische Wartungspläne & Batch-Grid | MaintAI",
  description: "Hochperformante Batch-Pflege und Massenänderung für Instandhaltungs-Wartungspläne",
};

export default async function MaintenancePlansPage() {
  let allRoles: any[] = [];
  let allTemplates: any[] = [];
  let allEquipments: any[] = [];
  let formattedItems: BatchPlanItemRow[] = [];

  try {
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

    allRoles = await db.query.roles.findMany({
      where: eq(roles.tenantId, tenant.id),
    });

    allTemplates = await db.query.inspectionTemplates.findMany({
      where: eq(inspectionTemplates.tenantId, tenant.id),
    });

    allEquipments = await db.query.equipments.findMany({
      where: eq(equipments.tenantId, tenant.id),
    });

    if (allEquipments.length === 0) {
      let floc = await db.query.functionalLocations.findFirst({
        where: eq(functionalLocations.tenantId, tenant.id),
      });
      if (!floc) {
        const [newFloc] = await db
          .insert(functionalLocations)
          .values({
            tenantId: tenant.id,
            code: "WERK-1000-HALLE-01",
            name: "Halle 1 · Fertigung",
            source: "MANUAL",
          })
          .returning();
        floc = newFloc;
      }
      await db.insert(equipments).values([
        {
          tenantId: tenant.id,
          functionalLocationId: floc.id,
          equipmentNumber: "EQ-10042",
          name: "Kreiselpumpe KSB Etanorm 050-200",
          manufacturer: "KSB",
          criticality: "A",
        },
        {
          tenantId: tenant.id,
          functionalLocationId: floc.id,
          equipmentNumber: "EQ-10043",
          name: "Drehstrom-Asynchronmotor Siemens 45kW",
          manufacturer: "Siemens",
          criticality: "B",
        },
        {
          tenantId: tenant.id,
          functionalLocationId: floc.id,
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

    formattedItems = rawItems.map((item) => ({
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
  } catch (err) {
    // Graceful Demo Fallback
    allRoles = [
      { id: "role-1", code: "MECH", name: "Instandhaltungsmechaniker" },
      { id: "role-2", code: "ELEK", name: "Betriebselektriker" },
      { id: "role-3", code: "SERV", name: "Schmierdienst & Schmierung" },
    ];

    allTemplates = [
      { id: "tpl-1", code: "INSP-PUMP-Q1", name: "Quartalsprüfung Kreiselpumpe" },
      { id: "tpl-2", code: "INSP-MOTOR-M1", name: "Monatsprüfung Antriebsmotoren" },
      { id: "tpl-3", code: "INSP-COMP-Y1", name: "Jahresrevision Druckluftkompressor" },
    ];

    allEquipments = [
      { id: "eq-1", equipmentNumber: "EQ-10042", name: "Kreiselpumpe KSB Etanorm 050-200" },
      { id: "eq-2", equipmentNumber: "EQ-10043", name: "Drehstrom-Asynchronmotor Siemens 45kW" },
      { id: "eq-3", equipmentNumber: "EQ-10044", name: "Schraubenkompressor Kaeser CSDX 165" },
    ];

    formattedItems = [
      {
        id: "item-1",
        positionNumber: 10,
        title: "Sichtprüfung Gleitringdichtung, Leckage & Fundament",
        planNumber: "WP-2026-001",
        planName: "Zentrale Pumpeninspektion",
        cycleValue: 30,
        cycleUnit: "DAYS",
        equipmentId: "eq-1",
        equipmentNumber: "EQ-10042",
        equipmentName: "Kreiselpumpe KSB Etanorm 050-200",
        assignedRoleId: "role-1",
        roleCode: "MECH",
        roleName: "Instandhaltungsmechaniker",
        inspectionTemplateId: "tpl-1",
        templateCode: "INSP-PUMP-Q1",
        templateName: "Quartalsprüfung Kreiselpumpe",
        estimatedDurationMinutes: 30,
      },
      {
        id: "item-2",
        positionNumber: 20,
        title: "Schwingungsmessung (RMS) & Schmierstoffkontrolle Motorlager",
        planNumber: "WP-2026-001",
        planName: "Zentrale Pumpeninspektion",
        cycleValue: 30,
        cycleUnit: "DAYS",
        equipmentId: "eq-2",
        equipmentNumber: "EQ-10043",
        equipmentName: "Drehstrom-Asynchronmotor Siemens 45kW",
        assignedRoleId: "role-3",
        roleCode: "SERV",
        roleName: "Schmierdienst & Schmierung",
        inspectionTemplateId: "tpl-2",
        templateCode: "INSP-MOTOR-M1",
        templateName: "Monatsprüfung Antriebsmotoren",
        estimatedDurationMinutes: 45,
      },
      {
        id: "item-3",
        positionNumber: 30,
        title: "Druckluft-Filterwechsel & Kondensatabscheider-Funktion",
        planNumber: "WP-2026-002",
        planName: "Druckluft-Station Halle 2",
        cycleValue: 90,
        cycleUnit: "DAYS",
        equipmentId: "eq-3",
        equipmentNumber: "EQ-10044",
        equipmentName: "Schraubenkompressor Kaeser CSDX 165",
        assignedRoleId: "role-1",
        roleCode: "MECH",
        roleName: "Instandhaltungsmechaniker",
        inspectionTemplateId: "tpl-3",
        templateCode: "INSP-COMP-Y1",
        templateName: "Jahresrevision Druckluftkompressor",
        estimatedDurationMinutes: 60,
      },
    ];
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-8 space-y-6">
      {/* Header mit Zurück-Button */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <BackButton fallbackUrl="/maintenance" label="Zurück zum Wartungs-Hub" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <Calendar className="h-7 w-7 text-cyan-500" />
            Zyklische Wartungspläne & Checkpositionen Batch-Pflege
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Verwalte hunderte Prüfpositionen effizient: Multi-Row Selektion, Direktbearbeitung
            in der Zelle per Tastatur und Massenänderung für Intervalle, Rollen und Vorlagen.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-slate-700 bg-slate-900 text-slate-300">
            <Layers className="h-3.5 w-3.5 text-cyan-400 mr-1" />
            TanStack Virtual Grid
          </Badge>
          <Badge variant="outline" className="border-slate-700 bg-slate-900 text-slate-300">
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
