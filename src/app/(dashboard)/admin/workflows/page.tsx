import { db } from "@/db";
import {
  tenants,
  orderTypes,
  workflowStatuses,
  roles,
  workflowTransitions,
} from "@/db/schema";
import { WorkflowMatrixEditor } from "@/components/workflows/workflow-matrix-editor";
import { eq } from "drizzle-orm";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { GitBranch, Shield, Zap, Server } from "lucide-react";
import { BackButton } from "@/components/ui/back-button";

export const metadata = {
  title: "Workflow & Berechtigungs-Matrix | MaintAI Admin",
  description: "Konfiguration dynamischer Auftragsarten, Statusübergänge und RBAC-Rollen",
};

export default async function WorkflowsAdminPage() {
  let tenant: any = null;
  let existingRoles: any[] = [];
  let existingStatuses: any[] = [];
  let existingOrderTypes: any[] = [];
  let transitions: any[] = [];

  try {
    tenant = await db.query.tenants.findFirst();

    if (!tenant) {
      const [newTenant] = await db
        .insert(tenants)
        .values({
          code: "WERK-1000",
          name: "Produktionswerk München (Leitwerk)",
          sapPlantCode: "1000",
          sapSyncMode: "STANDALONE",
        })
        .returning();
      tenant = newTenant;
    }

    // 2. Standard-Rollen sicherstellen, falls noch leer
    existingRoles = await db.query.roles.findMany({
      where: eq(roles.tenantId, tenant.id),
    });

    if (existingRoles.length === 0) {
      await db.insert(roles).values([
        {
          tenantId: tenant.id,
          code: "MAINT_PLANNER",
          name: "Instandhaltungsplaner / Meister",
          description: "Darf Aufträge freigeben, terminieren und kaufmännisch abschließen",
          isSystemRole: true,
        },
        {
          tenantId: tenant.id,
          code: "TECHNICIAN",
          name: "Servicetechniker / Schlosser",
          description: "Führt Reparaturen durch, bucht Ersatzteile und schließt technisch ab",
          isSystemRole: true,
        },
        {
          tenantId: tenant.id,
          code: "EXTERNAL_CONTRACTOR",
          name: "Fremdfirmen-Monteur",
          description: "Eingeschränkte Sicht für Dienstleister",
          isSystemRole: false,
        },
      ]);
      existingRoles = await db.query.roles.findMany({
        where: eq(roles.tenantId, tenant.id),
      });
    }

    // 3. Standard-Status sicherstellen
    existingStatuses = await db.query.workflowStatuses.findMany({
      where: eq(workflowStatuses.tenantId, tenant.id),
      orderBy: (statuses, { asc }) => [asc(statuses.sortOrder)],
    });

    if (existingStatuses.length === 0) {
      await db.insert(workflowStatuses).values([
        {
          tenantId: tenant.id,
          code: "CREATED",
          name: "Erfasst (Meldung)",
          category: "DRAFT",
          sapSystemStatusCode: "EROF",
          colorHex: "#64748B",
          isInitialStatus: true,
          sortOrder: 10,
        },
        {
          tenantId: tenant.id,
          code: "RELEASED",
          name: "Freigegeben",
          category: "OPEN",
          sapSystemStatusCode: "FREI",
          colorHex: "#3B82F6",
          sortOrder: 20,
        },
        {
          tenantId: tenant.id,
          code: "IN_WORK",
          name: "In Arbeit",
          category: "IN_PROGRESS",
          sapSystemStatusCode: "INAR",
          colorHex: "#F59E0B",
          sortOrder: 30,
        },
        {
          tenantId: tenant.id,
          code: "TECH_COMPLETED",
          name: "Technisch Abgeschlossen (TABG)",
          category: "COMPLETED",
          sapSystemStatusCode: "TABG",
          colorHex: "#10B981",
          triggersSapCompletion: true,
          locksOrderEditing: true,
          sortOrder: 40,
        },
        {
          tenantId: tenant.id,
          code: "CLOSED",
          name: "Kaufmännisch Abgeschlossen",
          category: "CLOSED",
          sapSystemStatusCode: "ABGS",
          colorHex: "#8B5CF6",
          isTerminalStatus: true,
          locksOrderEditing: true,
          sortOrder: 50,
        },
      ]);
      existingStatuses = await db.query.workflowStatuses.findMany({
        where: eq(workflowStatuses.tenantId, tenant.id),
        orderBy: (statuses, { asc }) => [asc(statuses.sortOrder)],
      });
    }

    // 4. Standard-Auftragsarten sicherstellen
    existingOrderTypes = await db.query.orderTypes.findMany({
      where: eq(orderTypes.tenantId, tenant.id),
    });

    if (existingOrderTypes.length === 0) {
      await db.insert(orderTypes).values([
        {
          tenantId: tenant.id,
          code: "IH01",
          name: "Störungsinstandsetzung (Korrektiv)",
          sapOrderTypeCode: "PM01",
          colorHex: "#EF4444",
          requiresApproval: false,
        },
        {
          tenantId: tenant.id,
          code: "IH02",
          name: "Geplante Wartung & Inspektion",
          sapOrderTypeCode: "PM02",
          colorHex: "#3B82F6",
          requiresApproval: true,
        },
      ]);
      existingOrderTypes = await db.query.orderTypes.findMany({
        where: eq(orderTypes.tenantId, tenant.id),
      });
    }

    // 5. Vorhandene Transitionen laden
    transitions = await db.query.workflowTransitions.findMany({
      where: eq(workflowTransitions.tenantId, tenant.id),
    });
  } catch (err) {
    // Graceful Demo-Fallback
    tenant = {
      id: "demo-tenant-1000",
      code: "WERK-1000",
      name: "Produktionswerk München (Demo-Modus)",
      sapPlantCode: "1000",
      sapSyncMode: "STANDALONE" as const,
    };

    existingRoles = [
      { id: "role-1", code: "MAINT_PLANNER", name: "Instandhaltungsplaner / Meister" },
      { id: "role-2", code: "TECHNICIAN", name: "Servicetechniker / Schlosser" },
      { id: "role-3", code: "EXTERNAL_CONTRACTOR", name: "Fremdfirmen-Monteur" },
    ];

    existingStatuses = [
      { id: "st-1", code: "CREATED", name: "Erfasst (Meldung)", category: "DRAFT", colorHex: "#64748B" },
      { id: "st-2", code: "RELEASED", name: "Freigegeben", category: "OPEN", colorHex: "#3B82F6" },
      { id: "st-3", code: "IN_WORK", name: "In Arbeit", category: "IN_PROGRESS", colorHex: "#F59E0B" },
      { id: "st-4", code: "TECH_COMPLETED", name: "Technisch Abgeschlossen (TABG)", category: "COMPLETED", colorHex: "#10B981" },
      { id: "st-5", code: "CLOSED", name: "Kaufmännisch Abgeschlossen", category: "CLOSED", colorHex: "#8B5CF6" },
    ];

    existingOrderTypes = [
      { id: "ot-1", code: "IH01", name: "Störungsinstandsetzung (Korrektiv)", sapOrderTypeCode: "PM01", colorHex: "#EF4444" },
      { id: "ot-2", code: "IH02", name: "Geplante Wartung & Inspektion", sapOrderTypeCode: "PM02", colorHex: "#3B82F6" },
    ];

    transitions = [
      {
        id: "tr-1",
        orderTypeId: "ot-1",
        fromStatusId: "st-1",
        toStatusId: "st-2",
        requiredRoleId: "role-1",
        actionName: "Auftrag freigeben",
        isActive: true,
        triggersSapSync: true,
        guardConditions: {},
      },
      {
        id: "tr-2",
        orderTypeId: "ot-1",
        fromStatusId: "st-2",
        toStatusId: "st-3",
        requiredRoleId: "role-2",
        actionName: "In Arbeit nehmen",
        isActive: true,
        triggersSapSync: false,
        guardConditions: {},
      },
      {
        id: "tr-3",
        orderTypeId: "ot-1",
        fromStatusId: "st-3",
        toStatusId: "st-4",
        requiredRoleId: "role-2",
        actionName: "Technisch abschließen (TABG)",
        isActive: true,
        triggersSapSync: true,
        guardConditions: { requireChecklistCompleted: true },
      },
    ];
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header mit Zurück-Button */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6 bg-white p-6 rounded-2xl shadow-sm">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <BackButton fallbackUrl="/admin/settings" label="Zurück zur Administration" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <GitBranch className="h-7 w-7 text-blue-600" />
            Auftragsarten & Workflow-Engine Konfigurator
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Industrielle Prozesssteuerung: Konfiguriere Zustandsautomaten, rollenbasierte
            Berechtigungen (RBAC) und SAP-Synchronisationspunkte ohne Re-Deployment.
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl p-3">
          <div>
            <span className="text-slate-400 block text-[10px]">MANDANT / WERK:</span>
            <span className="text-blue-700 font-semibold">{tenant.name}</span>
          </div>
          <div className="border-l border-slate-200 pl-4">
            <span className="text-slate-400 block text-[10px]">SAP MODUS:</span>
            <span className="text-emerald-700 font-semibold">{tenant.sapSyncMode}</span>
          </div>
        </div>
      </div>

      {/* Interaktiver Matrix-Editor */}
      <WorkflowMatrixEditor
        tenantId={tenant.id}
        orderTypes={existingOrderTypes}
        statuses={existingStatuses}
        roles={existingRoles}
        transitions={transitions}
      />
    </div>
  );
}
