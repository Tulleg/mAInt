import { Suspense } from "react";
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
  InspectionTemplateSchema,
} from "@/db/schema";
import { BatchPlanItemRow } from "@/components/maintenance-plans/batch-grid";
import { MaintenanceHub } from "@/components/maintenance/maintenance-hub";
import { eq } from "drizzle-orm";

export const metadata = {
  title: "Wartungsmanagement & Digitale Protokolle | MaintAI",
  description: "Massenpflege zyklischer Wartungspläne und visueller Protokoll-Vorlagen-Editor",
};

export default async function MaintenancePage() {
  let tenantId = "demo-tenant-1000";
  let allRoles: any[] = [];
  let allTemplates: any[] = [];
  let allEquipments: any[] = [];
  let formattedItems: BatchPlanItemRow[] = [];
  let existingTemplateSchema: InspectionTemplateSchema | undefined = undefined;

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

    tenantId = tenant.id;

    allRoles = await db.query.roles.findMany({
      where: eq(roles.tenantId, tenant.id),
    });

    allTemplates = await db.query.inspectionTemplates.findMany({
      where: eq(inspectionTemplates.tenantId, tenant.id),
    });

    if (allTemplates.length > 0 && allTemplates[0].schemaJson) {
      existingTemplateSchema = allTemplates[0].schemaJson as InspectionTemplateSchema;
    }

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
        title: "Sichtprüfung Gleitringdichtung & Leckagekontrolle",
        planNumber: "WP-2026-001",
        planName: "Zentrale Antriebs- & Pumpen-Inspektion",
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
        title: "Schwingungsmessung & Schmierstoffkontrolle Motorlager",
        planNumber: "WP-2026-001",
        planName: "Zentrale Antriebs- & Pumpen-Inspektion",
        cycleValue: 90,
        cycleUnit: "DAYS",
        equipmentId: "eq-2",
        equipmentNumber: "EQ-10043",
        equipmentName: "Drehstrom-Asynchronmotor Siemens 45kW",
        assignedRoleId: "role-2",
        roleCode: "ELEK",
        roleName: "Betriebselektriker",
        inspectionTemplateId: "tpl-2",
        templateCode: "INSP-MOTOR-M1",
        templateName: "Monatsprüfung Antriebsmotoren",
        estimatedDurationMinutes: 45,
      },
      {
        id: "item-3",
        positionNumber: 30,
        title: "Druckluft-Filterwechsel & Kondensatabscheider-Prüfung",
        planNumber: "WP-2026-001",
        planName: "Zentrale Antriebs- & Pumpen-Inspektion",
        cycleValue: 180,
        cycleUnit: "DAYS",
        equipmentId: "eq-3",
        equipmentNumber: "EQ-10044",
        equipmentName: "Schraubenkompressor Kaeser CSDX 165",
        assignedRoleId: "role-3",
        roleCode: "SERV",
        roleName: "Schmierdienst & Schmierung",
        inspectionTemplateId: "tpl-3",
        templateCode: "INSP-COMP-Y1",
        templateName: "Jahresrevision Druckluftkompressor",
        estimatedDurationMinutes: 60,
      },
    ];
  }

  return (
    <Suspense
      fallback={
        <div className="p-8 flex items-center justify-center text-slate-400 text-sm">
          Lade Wartungspläne & Protokoll-Editor...
        </div>
      }
    >
      <MaintenanceHub
        tenantId={tenantId}
        roles={allRoles}
        templates={allTemplates}
        equipments={allEquipments}
        items={formattedItems}
        initialTemplateSchema={existingTemplateSchema}
      />
    </Suspense>
  );
}
