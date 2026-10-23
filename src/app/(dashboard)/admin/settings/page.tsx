import { db } from "@/db";
import { tenants, roles, users, orderTypes, orderStatuses, workflowTransitions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { AdminSettingsView } from "@/components/admin/admin-settings-view";
import { UserViewItem, RoleOption } from "@/components/admin/user-management-table";

export const metadata = {
  title: "System-Administration & Grundkonfiguration | MaintAI Admin",
  description: "Mandantenweite Einstellungen, SAP-Kopplung, Provider-Auswahl, Schadenskataloge, Workflows und Rollen",
};

export default async function AdminSettingsPage() {
  let tenant: any = null;
  let userList: UserViewItem[] = [];
  let roleList: RoleOption[] = [];
  let orderTypesList: any[] = [];
  let statusesList: any[] = [];
  let transitionsList: any[] = [];

  try {
    tenant = await db.query.tenants.findFirst();

    if (tenant) {
      const dbRoles = await db.query.roles.findMany({
        where: eq(roles.tenantId, tenant.id),
      });

      roleList = dbRoles.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
      }));

      // Load Order Types, Statuses, and Transitions
      const dbOrderTypes = await db.query.orderTypes.findMany({
        where: eq(orderTypes.tenantId, tenant.id),
      });
      orderTypesList = dbOrderTypes || [];

      const dbStatuses = await db.query.orderStatuses.findMany({
        where: eq(orderStatuses.tenantId, tenant.id),
        orderBy: (s, { asc }) => [asc(s.sortOrder)],
      });
      statusesList = dbStatuses || [];

      const dbTransitions = await db.query.workflowTransitions.findMany({
        where: eq(workflowTransitions.tenantId, tenant.id),
      });
      transitionsList = dbTransitions || [];

      const dbUsers = await db.query.users.findMany({
        where: eq(users.tenantId, tenant.id),
        with: {
          userRoles: {
            with: {
              role: true,
            },
          },
        },
        orderBy: [desc(users.createdAt)],
      });

      userList = dbUsers.map((u) => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`,
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        personnelNr: u.personnelNr,
        workCenterCode: u.workCenterCode,
        qualifications: u.qualificationMatrix || [],
        isActive: u.isActive,
        roles: u.userRoles.map((ur) => ({
          id: ur.role.id,
          code: ur.role.code,
          name: ur.role.name,
        })),
        ssoStatus: {
          provider: "Azure AD / SAML 2.0",
          isSynced: true,
          lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
          upn: u.email,
        },
      }));
    }
  } catch (err) {
    console.warn("Konnte Admin-Daten nicht laden:", err);
  }

  if (!tenant) {
    tenant = {
      id: "demo-tenant-1000",
      code: "WERK-01",
      name: "Werk 01 - Rohbau",
      sapPlantCode: "01",
      sapSyncMode: "ODATA_V4",
      aiConfig: {
        provider: "OLLAMA",
        endpointUrl: "http://ollama-service.internal:11434/v1",
        chatModel: "llama3.3:70b-instruct",
        embeddingModel: "nomic-embed-text",
        embeddingDimensions: 768,
      },
    };
  }

  if (roleList.length === 0) {
    roleList = [
      { id: "role-1", code: "ADMIN", name: "Administrator", description: "Vollzugriff auf alle Module & Konfiguration" },
      { id: "role-2", code: "SHIFT_LEAD", name: "Schichtleiter / Meister", description: "Freigaben, Disposition & Analytics" },
      { id: "role-3", code: "MAINT_PLANNER", name: "Instandhaltungsplaner", description: "Wartungspläne & Arbeitsvorbereitung" },
      { id: "role-4", code: "TECHNICIAN", name: "Instandhaltungstechniker", description: "Rückmeldungen, Checklisten & Zeiterfassung" },
      { id: "role-5", code: "REPORTER", name: "Bediener / Werker", description: "Störungserfassung am Hallen-Terminal" },
    ];
  }

  if (userList.length === 0) {
    userList = [
      {
        id: "u-1",
        name: "Max Mustermann",
        firstName: "Max",
        lastName: "Mustermann",
        email: "max.mustermann@fertigung.de",
        personnelNr: "MA-1001",
        workCenterCode: "WC-ROHBAU-1",
        qualifications: ["DGUV V3", "KUKA KR210 Expert", "Schaltberechtigung"],
        isActive: true,
        roles: [{ id: "role-1", code: "ADMIN", name: "Administrator" }],
        ssoStatus: { provider: "Azure AD", isSynced: true, lastLoginAt: new Date().toISOString(), upn: "max.mustermann@fertigung.de" },
      },
      {
        id: "u-2",
        name: "Thomas Urban",
        firstName: "Thomas",
        lastName: "Urban",
        email: "thomas.urban@fertigung.de",
        personnelNr: "MA-1002",
        workCenterCode: "WC-ROHBAU-1",
        qualifications: ["Schichtleiter", "SPS Siemens TIA", "Pneumatik"],
        isActive: true,
        roles: [{ id: "role-2", code: "SHIFT_LEAD", name: "Schichtleiter / Meister" }],
        ssoStatus: { provider: "Azure AD", isSynced: true, lastLoginAt: new Date().toISOString(), upn: "thomas.urban@fertigung.de" },
      },
      {
        id: "u-3",
        name: "Stefan Weber",
        firstName: "Stefan",
        lastName: "Weber",
        email: "stefan.weber@fertigung.de",
        personnelNr: "MA-1003",
        workCenterCode: "WC-INSP-2",
        qualifications: ["Mechanik", "Kranführer", "Laserausrichtung"],
        isActive: true,
        roles: [{ id: "role-4", code: "TECHNICIAN", name: "Instandhaltungstechniker" }],
        ssoStatus: { provider: "Azure AD", isSynced: true, lastLoginAt: new Date().toISOString(), upn: "stefan.weber@fertigung.de" },
      },
      {
        id: "u-4",
        name: "Laura Schmidt",
        firstName: "Laura",
        lastName: "Schmidt",
        email: "laura.schmidt@fertigung.de",
        personnelNr: "MA-1004",
        workCenterCode: "WC-AV-1",
        qualifications: ["SAP PM Key-User", "REFA", "Materialdisposition"],
        isActive: true,
        roles: [{ id: "role-3", code: "MAINT_PLANNER", name: "Instandhaltungsplaner" }],
        ssoStatus: { provider: "Azure AD", isSynced: true, lastLoginAt: new Date().toISOString(), upn: "laura.schmidt@fertigung.de" },
      },
    ];
  }

  if (orderTypesList.length === 0) {
    orderTypesList = [
      { id: "ot-1", code: "IH01", name: "Störungsinstandsetzung (Korrektiv)", sapOrderTypeCode: "PM01", colorHex: "#EF4444", description: "Notfallinstandsetzung" },
      { id: "ot-2", code: "IH02", name: "Geplante Wartung & Inspektion", sapOrderTypeCode: "PM02", colorHex: "#3B82F6", description: "Regelmäßige Inspektion" },
      { id: "ot-3", code: "IH03", name: "Gesetzliche Prüfung (DGUV V3, UVV)", sapOrderTypeCode: "PM03", colorHex: "#10B981", description: "Sicherheitsprüfung" },
    ];
  }

  if (statusesList.length === 0) {
    statusesList = [
      { id: "st-1", code: "CREATED", name: "Erfasst (Meldung)", category: "DRAFT", colorHex: "#64748B", isInitialStatus: true, sapSystemStatusCode: "EROF" },
      { id: "st-2", code: "RELEASED", name: "Freigegeben", category: "OPEN", colorHex: "#3B82F6", sapSystemStatusCode: "FREI" },
      { id: "st-3", code: "IN_WORK", name: "In Arbeit", category: "IN_PROGRESS", colorHex: "#F59E0B", sapSystemStatusCode: "INAR" },
      { id: "st-4", code: "TECH_COMPLETED", name: "Technisch abgeschlossen (TABG)", category: "COMPLETED", colorHex: "#10B981", triggersSapCompletion: true, locksOrderEditing: true, sapSystemStatusCode: "TABG" },
      { id: "st-5", code: "CLOSED", name: "Kaufmännisch abgeschlossen", category: "CLOSED", colorHex: "#8B5CF6", isTerminalStatus: true, locksOrderEditing: true, sapSystemStatusCode: "ABGS" },
    ];
  }

  if (transitionsList.length === 0) {
    transitionsList = [
      { id: "tr-1", orderTypeId: "ot-1", fromStatusId: "st-1", toStatusId: "st-2", actionName: "Auftrag freigeben", requiredRoleId: "role-2", isActive: true, triggersSapSync: true, guardConditions: {} },
      { id: "tr-2", orderTypeId: "ot-1", fromStatusId: "st-2", toStatusId: "st-3", actionName: "In Arbeit nehmen", requiredRoleId: "role-4", isActive: true, triggersSapSync: false, guardConditions: {} },
      { id: "tr-3", orderTypeId: "ot-1", fromStatusId: "st-3", toStatusId: "st-4", actionName: "Technisch abschließen (TABG)", requiredRoleId: "role-4", isActive: true, triggersSapSync: true, guardConditions: { requireChecklistCompleted: true, requireActualDurationFilled: true } },
      { id: "tr-4", orderTypeId: "ot-1", fromStatusId: "st-4", toStatusId: "st-5", actionName: "Kaufmännisch abschließen", requiredRoleId: "role-1", isActive: true, triggersSapSync: true, guardConditions: {} },
    ];
  }

  return (
    <AdminSettingsView
      initialTenant={tenant}
      initialUsers={userList}
      initialRoles={roleList}
      initialOrderTypes={orderTypesList}
      initialStatuses={statusesList}
      initialTransitions={transitionsList}
    />
  );
}
