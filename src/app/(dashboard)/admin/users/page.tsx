import Link from "next/link";
import { db } from "@/db";
import { tenants, users, roles, userRoles } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { UserManagementTable, UserViewItem, RoleOption } from "@/components/admin/user-management-table";
import { Users, ChevronRight, Shield, KeyRound, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/ui/back-button";

export const metadata = {
  title: "Benutzer- & Rollenverwaltung (RBAC) | MaintAI Admin",
  description: "Zentrale Benutzeradministration, Rollenzuweisung und Active Directory SSO Synchronisation",
};

export default async function AdminUsersPage() {
  let userList: UserViewItem[] = [];
  let roleList: RoleOption[] = [];

  try {
    const tenant = await db.query.tenants.findFirst();

    if (tenant) {
      // 1. Alle Rollen laden
      const dbRoles = await db.query.roles.findMany({
        where: eq(roles.tenantId, tenant.id),
      });

      roleList = dbRoles.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
      }));

      // 2. Alle Benutzer mit verknüpften Rollen laden
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
    console.warn("DB user query fallback:", err);
  }

  // Resilienter Demo-Fallback
  if (roleList.length === 0) {
    roleList = [
      { id: "role-1", code: "ADMIN", name: "Administrator", description: "Gesamtsystem-Vollzugriff" },
      { id: "role-2", code: "PLANNER", name: "Instandhaltungs-Koordinator", description: "Planung & Disposition" },
      { id: "role-3", code: "TECHNICIAN", name: "Techniker", description: "Instandhalter vor Ort" },
      { id: "role-4", code: "REPORTER", name: "Maschinenbediener", description: "Störungserfassung" },
    ];
  }

  if (userList.length === 0) {
    userList = [
      {
        id: "u-1",
        name: "Alexander Admin",
        firstName: "Alexander",
        lastName: "Admin",
        email: "admin@maintai.local",
        personnelNr: "00000001",
        workCenterCode: "IT-SEC",
        qualifications: ["Systemarchitektur", "Datenschutz & IT-Security"],
        isActive: true,
        roles: [{ id: "role-1", code: "ADMIN", name: "Administrator" }],
        ssoStatus: { provider: "Azure AD", isSynced: true, upn: "admin@maintai.local" },
      },
      {
        id: "u-2",
        name: "Petra Planer",
        firstName: "Petra",
        lastName: "Planer",
        email: "planer@maintai.local",
        personnelNr: "00030588",
        workCenterCode: "IH-PLAN",
        qualifications: ["REFA-Grundausbildung", "SAP PM Power User"],
        isActive: true,
        roles: [{ id: "role-2", code: "PLANNER", name: "Instandhaltungs-Koordinator" }],
        ssoStatus: { provider: "Azure AD", isSynced: true, upn: "planer@maintai.local" },
      },
      {
        id: "u-3",
        name: "Thomas Techniker",
        firstName: "Thomas",
        lastName: "Techniker",
        email: "techniker@maintai.local",
        personnelNr: "00020115",
        workCenterCode: "MECH-01",
        qualifications: ["Hydraulik-Fachkraft", "Elektrofachkraft", "Schweißpass"],
        isActive: true,
        roles: [{ id: "role-3", code: "TECHNICIAN", name: "Techniker" }],
        ssoStatus: { provider: "Azure AD", isSynced: true, upn: "techniker@maintai.local" },
      },
      {
        id: "u-4",
        name: "Michael Melder",
        firstName: "Michael",
        lastName: "Melder",
        email: "melder@maintai.local",
        personnelNr: "00010410",
        workCenterCode: "PROD-L1",
        qualifications: ["Basis-Bedienung", "5S"],
        isActive: true,
        roles: [{ id: "role-4", code: "REPORTER", name: "Maschinenbediener" }],
        ssoStatus: { provider: "Azure AD", isSynced: true, upn: "melder@maintai.local" },
      },
    ];
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-150">
      {/* Header mit Breadcrumb */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <BackButton fallbackUrl="/admin" label="Zurück" />
            <div className="h-4 w-px bg-slate-800" />
            <nav className="flex items-center gap-1.5 text-xs text-slate-400" aria-label="Breadcrumb">
              <Link href="/" className="hover:text-slate-200 transition-colors">Workspace</Link>
              <ChevronRight className="h-3 w-3 text-slate-600" />
              <Link href="/admin" className="hover:text-slate-200 transition-colors">System-Administration</Link>
              <ChevronRight className="h-3 w-3 text-slate-600" />
              <span className="text-cyan-400 font-medium">Benutzer & Rollen (RBAC)</span>
            </nav>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-3 pt-1">
            <Users className="h-7 w-7 text-cyan-500" />
            Benutzerverwaltung & Berechtigungen
          </h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">
            Übersicht aller Benutzer, Zuweisung von Industrie-Rollen (Admin, Planer, Techniker, Melder)
            sowie SSO / Active Directory Status.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/admin/workflows"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 text-xs font-semibold transition-all"
          >
            <Shield className="h-3.5 w-3.5 text-purple-400" />
            <span>Workflow- & Statusmatrix</span>
          </Link>
        </div>
      </div>

      {/* Interaktive Tabelle */}
      <UserManagementTable users={userList} allRoles={roleList} />
    </div>
  );
}
