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
import { GitBranch, Shield, Zap, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/ui/back-button";

export const metadata = {
  title: "Workflow & Berechtigungs-Matrix | MaintAI",
  description: "Konfiguration dynamischer Auftragsarten, Statusübergänge und RBAC-Rollen",
};

export default async function WorkflowsPage() {
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

    // 1. Rollen laden
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

    // 2. Status laden
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
          name: "Technisch abgeschlossen (TABG)",
          category: "COMPLETED",
          sapSystemStatusCode: "TABG",
          colorHex: "#10B981",
          triggersSapCompletion: true,
          sortOrder: 40,
        },
        {
          tenantId: tenant.id,
          code: "CLOSED",
          name: "Kaufmännisch abgeschlossen",
          category: "CLOSED",
          sapSystemStatusCode: "ABGS",
          colorHex: "#6B7280",
          sortOrder: 50,
        },
      ]);
      existingStatuses = await db.query.workflowStatuses.findMany({
        where: eq(workflowStatuses.tenantId, tenant.id),
        orderBy: (statuses, { asc }) => [asc(statuses.sortOrder)],
      });
    }

    // 3. Auftragsarten laden
    existingOrderTypes = await db.query.orderTypes.findMany({
      where: eq(orderTypes.tenantId, tenant.id),
    });

    if (existingOrderTypes.length === 0) {
      await db.insert(orderTypes).values([
        {
          tenantId: tenant.id,
          code: "IH01",
          name: "Störungsinstandsetzung (Ungeplant)",
          sapOrderTypeCode: "PM01",
          colorHex: "#EF4444",
          iconName: "AlertTriangle",
        },
        {
          tenantId: tenant.id,
          code: "IH02",
          name: "Präventive Wartung (Geplant)",
          sapOrderTypeCode: "PM02",
          colorHex: "#3B82F6",
          iconName: "Wrench",
        },
      ]);
      existingOrderTypes = await db.query.orderTypes.findMany({
        where: eq(orderTypes.tenantId, tenant.id),
      });
    }

    // 4. Transitionen laden
    transitions = await db.query.workflowTransitions.findMany({
      where: eq(workflowTransitions.tenantId, tenant.id),
      with: {
        fromStatus: true,
        toStatus: true,
        requiredRole: true,
      },
    });
  } catch (err) {
    console.warn("WorkflowsPage database error fallback:", err);
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header mit Zurück-Button */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <BackButton fallbackUrl="/admin" label="Zurück zur Administration" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <GitBranch className="h-7 w-7 text-cyan-500" />
            Workflow-Engine & Statusübergangs-Matrix
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Konfiguration dynamischer Auftragsarten, Statusübergänge, Guard Conditions und
            RBAC-Berechtigungsprüfungen nach DIN EN 13306 & SAP PM.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-slate-700 bg-slate-900 text-slate-300">
            <Shield className="h-3.5 w-3.5 text-emerald-400 mr-1.5" />
            RBAC aktiv
          </Badge>
          <Badge variant="outline" className="border-slate-700 bg-slate-900 text-slate-300">
            <Zap className="h-3.5 w-3.5 text-cyan-400 mr-1.5" />
            SAP Auto-TABG
          </Badge>
        </div>
      </div>

      <WorkflowMatrixEditor
        tenantId={tenant ? tenant.id : "demo-tenant"}
        orderTypes={existingOrderTypes}
        statuses={existingStatuses}
        roles={existingRoles}
        transitions={transitions}
      />
    </div>
  );
}
