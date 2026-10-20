import { db } from "@/lib/db";
import {
  tenants,
  orderTypes,
  workflowStatuses,
  roles,
  workflowTransitions,
} from "@/lib/db/schema";
import { WorkflowMatrixEditor } from "@/components/workflows/workflow-matrix-editor";
import { eq } from "drizzle-orm";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { GitBranch, Shield, Zap, Server } from "lucide-react";

export const metadata = {
  title: "Workflow & Berechtigungs-Matrix | MaintAI Admin",
  description: "Konfiguration dynamischer Auftragsarten, Statusübergänge und RBAC-Rollen",
};

export default async function WorkflowsAdminPage() {
  // 1. Mandanten laden (Standard-Mandant für die Demo)
  let tenant = await db.query.tenants.findFirst();

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
  let existingRoles = await db.query.roles.findMany({
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
  let existingStatuses = await db.query.workflowStatuses.findMany({
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
  let existingOrderTypes = await db.query.orderTypes.findMany({
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
  const transitions = await db.query.workflowTransitions.findMany({
    where: eq(workflowTransitions.tenantId, tenant.id),
  });

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 md:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-800 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <GitBranch className="h-7 w-7 text-blue-500" />
            Auftragsarten & Workflow-Engine Konfigurator
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Industrielle Prozesssteuerung: Konfiguriere Zustandsautomaten, rollenbasierte
            Berechtigungen (RBAC) und SAP-Synchronisationspunkte ohne Re-Deployment.
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono bg-neutral-900 border border-neutral-800 rounded-lg p-3">
          <div>
            <span className="text-neutral-500 block">MANDANT / WERK:</span>
            <span className="text-blue-400 font-semibold">{tenant.name}</span>
          </div>
          <div className="border-l border-neutral-800 pl-4">
            <span className="text-neutral-500 block">SAP MODUS:</span>
            <span className="text-emerald-400 font-semibold">{tenant.sapSyncMode}</span>
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
