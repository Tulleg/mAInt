import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  roles,
  userRoles,
  permissions,
  rolePermissions,
} from "@/db/schema";
import {
  SystemRoleCode,
  PermissionCode,
  UserRoleRecord,
  TransitionPermissionCheckResult,
} from "./types";

export * from "./types";

export const ROLES: Record<SystemRoleCode, SystemRoleCode> = {
  ADMIN: "ADMIN",
  OPERATOR: "OPERATOR",
  COORDINATOR: "COORDINATOR",
  TECHNICIAN: "TECHNICIAN",
  MAINT_PLANNER: "MAINT_PLANNER",
  SHIFT_LEAD: "SHIFT_LEAD",
  EXTERNAL_CONTRACTOR: "EXTERNAL_CONTRACTOR",
};

export const PERMISSIONS: Record<string, PermissionCode> = {
  ORDERS_CREATE: "orders:create",
  ORDERS_READ: "orders:read",
  ORDERS_UPDATE: "orders:update",
  ORDERS_DELETE: "orders:delete",
  ORDERS_TRANSITION: "orders:transition",
  ORDERS_COMPLETE: "orders:complete",
  TIME_TRACK: "time:track",
  USERS_MANAGE: "users:manage",
  WORKFLOWS_MANAGE: "workflows:manage",
  WORKFLOWS_READ: "workflows:read",
  SAP_SYNC: "sap:sync",
  SAP_CONFIGURE: "sap:configure",
  SPARE_PARTS_BOOK: "spare_parts:book",
  SPARE_PARTS_READ: "spare_parts:read",
  ANALYTICS_READ: "analytics:read",
  ANALYTICS_SCHEDULE: "analytics:schedule",
  CAN_VIEW_AI_ANALYTICS: "can_view_ai_analytics",
  ASSETS_MANAGE: "assets:manage",
};

export class RbacPermissionError extends Error {
  constructor(
    message: string,
    public code: string = "INSUFFICIENT_PERMISSIONS",
    public requiredRole?: string
  ) {
    super(message);
    this.name = "RbacPermissionError";
  }
}

/**
 * Ermittelt alle Rollen eines Benutzers (optional gefiltert nach Mandant).
 */
export async function getUserRoles(
  userId: string,
  tenantId?: string
): Promise<UserRoleRecord[]> {
  try {
    const userRoleRecords = await db.query.userRoles.findMany({
      where: eq(userRoles.userId, userId),
      with: {
        role: true,
      },
    });

    const activeRoles = userRoleRecords
      .map((ur) => ur.role)
      .filter((r): r is NonNullable<typeof r> => Boolean(r));

    if (tenantId) {
      return activeRoles
        .filter((r) => r.tenantId === tenantId)
        .map((r) => ({ id: r.id, code: r.code, name: r.name, tenantId: r.tenantId }));
    }

    return activeRoles.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      tenantId: r.tenantId,
    }));
  } catch (err) {
    console.warn("Fehler beim Laden der Benutzerrollen:", err);
    return [];
  }
}

/**
 * Prüft, ob ein Benutzer über eine bestimmte Rolle verfügt (nach ID oder Code z.B. 'MAINT_PLANNER').
 */
export async function hasRole(
  userId: string,
  roleCodeOrId: string,
  tenantId?: string
): Promise<boolean> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    roleCodeOrId
  );

  try {
    if (isUuid) {
      const condition = tenantId
        ? and(
            eq(userRoles.userId, userId),
            eq(userRoles.roleId, roleCodeOrId)
          )
        : and(
            eq(userRoles.userId, userId),
            eq(userRoles.roleId, roleCodeOrId)
          );

      const direct = await db.query.userRoles.findFirst({
        where: condition,
        with: { role: true },
      });

      if (direct && (!tenantId || direct.role?.tenantId === tenantId)) {
        return true;
      }
    }

    // Prüfung nach Rollen-Code (z.B. 'ADMIN', 'COORDINATOR', 'MAINT_PLANNER', 'TECHNICIAN', 'OPERATOR')
    const userRolesList = await getUserRoles(userId, tenantId);
    return userRolesList.some((r) => {
      const u = r.code.toUpperCase();
      const target = roleCodeOrId.toUpperCase();
      if (r.id === roleCodeOrId) return true;
      if (u === "ADMIN") return true;
      if (u === target) return true;
      if ((target === "COORDINATOR" || target === "KOORDINATOR") && (u === "MAINT_PLANNER" || u === "SHIFT_LEAD")) return true;
      if (target === "MAINT_PLANNER" && (u === "COORDINATOR" || u === "KOORDINATOR")) return true;
      if ((target === "OPERATOR" || target === "BEDIENER" || target === "MASCHINENBEDIENER") && (u === "OPERATOR" || u === "BEDIENER")) return true;
      if ((target === "TECHNICIAN" || target === "INSTANDHALTER") && (u === "TECHNICIAN" || u === "INSTANDHALTER")) return true;
      return false;
    });
  } catch (err) {
    console.warn("hasRole Check fehlgeschlagen:", err);
    return false;
  }
}

/**
 * Prüft, ob ein Benutzer mindestens eine der angegebenen Rollen besitzt.
 */
export async function hasAnyRole(
  userId: string,
  roleCodesOrIds: string[],
  tenantId?: string
): Promise<boolean> {
  for (const roleCodeOrId of roleCodesOrIds) {
    if (await hasRole(userId, roleCodeOrId, tenantId)) {
      return true;
    }
  }
  return false;
}

/**
 * Strikte Assertion für Rollenprüfung. Wirft `RbacPermissionError` bei fehlender Berechtigung.
 */
export async function assertUserHasRole(
  userId: string,
  roleCodeOrId: string,
  tenantId?: string
): Promise<void> {
  const allowed = await hasRole(userId, roleCodeOrId, tenantId);
  if (!allowed) {
    throw new RbacPermissionError(
      `Zugriff verweigert: Der Benutzer verfügt nicht über die erforderliche Rolle '${roleCodeOrId}'.`,
      "INSUFFICIENT_PERMISSIONS",
      roleCodeOrId
    );
  }
}

/**
 * Prüft, ob ein Benutzer über eine spezifische Berechtigung verfügt.
 */
export async function hasPermission(
  userId: string,
  permissionCode: PermissionCode | string,
  tenantId?: string
): Promise<boolean> {
  try {
    const userRolesList = await getUserRoles(userId, tenantId);

    // ADMIN besitzt pauschal alle Berechtigungen
    if (userRolesList.some((r) => r.code.toUpperCase() === "ADMIN")) {
      return true;
    }

    // Standard-Rollen-Fallback
    if (
      (permissionCode === "orders:create" ||
        permissionCode === "orders:read" ||
        permissionCode === "time:track") &&
      userRolesList.some((r) =>
        ["OPERATOR", "COORDINATOR", "TECHNICIAN", "MAINT_PLANNER", "SHIFT_LEAD"].includes(r.code.toUpperCase())
      )
    ) {
      return true;
    }

    if (
      permissionCode === "users:manage" &&
      userRolesList.some((r) => ["ADMIN"].includes(r.code.toUpperCase()))
    ) {
      return true;
    }

    if (
      (permissionCode === "orders:transition" ||
        permissionCode === "spare_parts:book" ||
        permissionCode === "orders:update" ||
        permissionCode === "orders:complete") &&
      userRolesList.some((r) =>
        ["COORDINATOR", "TECHNICIAN", "MAINT_PLANNER", "SHIFT_LEAD"].includes(r.code.toUpperCase())
      )
    ) {
      return true;
    }

    if (
      (permissionCode === "workflows:manage" ||
        permissionCode === "sap:configure" ||
        permissionCode === "analytics:schedule") &&
      userRolesList.some((r) => ["COORDINATOR", "MAINT_PLANNER"].includes(r.code.toUpperCase()))
    ) {
      return true;
    }

    if (
      (permissionCode === "analytics:read" ||
        permissionCode === "can_view_ai_analytics") &&
      userRolesList.some((r) =>
        ["ADMIN", "MAINT_PLANNER", "PLANNER", "SHIFT_LEAD", "COORDINATOR"].includes(
          r.code.toUpperCase()
        )
      )
    ) {
      return true;
    }

    // Explizite DB-Berechtigungen abfragen
    const roleIds = userRolesList.map((r) => r.id);
    if (roleIds.length === 0) return false;

    const granted = await db.query.rolePermissions.findFirst({
      where: inArray(rolePermissions.roleId, roleIds),
      with: {
        permission: true,
      },
    });

    if (granted && granted.permission?.code === permissionCode) {
      return true;
    }

    return false;
  } catch (err) {
    console.warn("hasPermission Check fehlgeschlagen:", err);
    return false;
  }
}

/**
 * Strikte Assertion für Berechtigungsprüfung. Wirft `RbacPermissionError` bei fehlender Berechtigung.
 */
export async function assertUserHasPermission(
  userId: string,
  permissionCode: PermissionCode | string,
  tenantId?: string
): Promise<void> {
  const allowed = await hasPermission(userId, permissionCode, tenantId);
  if (!allowed) {
    throw new RbacPermissionError(
      `Zugriff verweigert: Fehlende Berechtigung '${permissionCode}'.`,
      "INSUFFICIENT_PERMISSIONS"
    );
  }
}

/**
 * Validiert die Berechtigung für einen dynamischen Statusübergang.
 * Wenn keine Rolle gefordert ist (`requiredRoleId == null`), ist der Übergang für jeden berechtigten Mitarbeiter erlaubt.
 */
export async function checkTransitionPermission(
  userId: string,
  tenantId: string,
  requiredRoleId?: string | null
): Promise<TransitionPermissionCheckResult> {
  if (!requiredRoleId) {
    return { allowed: true };
  }

  const allowed = await hasRole(userId, requiredRoleId, tenantId);
  if (!allowed) {
    return {
      allowed: false,
      reason: `Fehlende Rolle für diesen Statusübergang.`,
    };
  }

  return { allowed: true };
}

/**
 * Strikte Assertion für Workflow-Transitionen.
 */
export async function assertTransitionPermission(
  userId: string,
  tenantId: string,
  requiredRoleId?: string | null,
  actionName?: string,
  requiredRoleName?: string
): Promise<void> {
  const result = await checkTransitionPermission(userId, tenantId, requiredRoleId);
  if (!result.allowed) {
    const roleLabel = requiredRoleName || requiredRoleId || "Spezifische Fachrolle";
    const actionLabel = actionName ? `'${actionName}'` : "diesen Statuswechsel";
    throw new RbacPermissionError(
      `Fehlende Berechtigung: Für die Aktion ${actionLabel} ist die Rolle '${roleLabel}' erforderlich.`,
      "INSUFFICIENT_PERMISSIONS",
      roleLabel
    );
  }
}

export interface CurrentUserRbacInfo {
  userId: string;
  roleCode: string;
  roleName: string;
  userName: string;
  userEmail: string;
  canViewAiAnalytics: boolean;
}

/**
 * Ermittelt die aktuelle Rolle und Berechtigungen des Benutzers aus Request/Cookies/DB.
 */
export async function getCurrentUserRbac(tenantId?: string): Promise<CurrentUserRbacInfo> {
  let roleCode = "SHIFT_LEAD"; // Standard: Meister / Leitstand
  let userId = "user-default-lead";
  let userName = "Hans Meier";
  let userEmail = "leiter@fertigung.de";

  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const cookieRole = cookieStore.get("maintai_user_role")?.value;
    if (cookieRole) {
      roleCode = cookieRole.toUpperCase();
    }
  } catch {
    // Graceful Fallback wenn außerhalb des Request-Lifecycles (z. B. Unit-Tests)
  }

  // Rollenbezeichnung und simulierte Benutzerdaten mappen
  let roleName = "Meister / Leitstand";
  if (roleCode === "ADMIN") {
    roleName = "System-Administrator";
    userName = "Alexander Admin";
    userEmail = "admin@maintai.local";
  } else if (roleCode === "MAINT_PLANNER" || roleCode === "PLANNER") {
    roleName = "Instandhaltungsplaner";
    userName = "Petra Planer";
    userEmail = "planer@maintai.local";
  } else if (roleCode === "TECHNICIAN") {
    roleName = "Instandhaltungs-Techniker";
    userName = "Thomas Techniker";
    userEmail = "techniker@maintai.local";
  } else if (roleCode === "REPORTER" || roleCode === "OPERATOR") {
    roleName = "Maschinenbediener / Produktion";
    userName = "Michael Melder";
    userEmail = "melder@maintai.local";
  } else if (roleCode === "EXTERNAL_CONTRACTOR") {
    roleName = "Externer Dienstleister";
    userName = "Fremdfirma Müller";
    userEmail = "extern@service.de";
  }

  // Planer, Admin, Leitstand (Shift Lead), Koordinator dürfen auf den KI-Leitstand zugreifen
  const allowedRoles = ["ADMIN", "MAINT_PLANNER", "PLANNER", "SHIFT_LEAD", "COORDINATOR"];
  const canViewAiAnalytics = allowedRoles.includes(roleCode);

  return {
    userId,
    roleCode,
    roleName,
    userName,
    userEmail,
    canViewAiAnalytics,
  };
}

/**
 * Validiert, ob ein gegebener Benutzer oder Rollen-Code berechtigt ist, den KI-Leitstand zu nutzen.
 */
export async function canUserAccessAiAnalytics(
  roleCodeOrUserId?: string,
  tenantId?: string
): Promise<boolean> {
  if (!roleCodeOrUserId) {
    const current = await getCurrentUserRbac(tenantId);
    return current.canViewAiAnalytics;
  }

  const knownRoleCodes = [
    "ADMIN",
    "MAINT_PLANNER",
    "PLANNER",
    "SHIFT_LEAD",
    "COORDINATOR",
    "TECHNICIAN",
    "REPORTER",
    "OPERATOR",
    "EXTERNAL_CONTRACTOR",
  ];

  if (knownRoleCodes.includes(roleCodeOrUserId.toUpperCase())) {
    return ["ADMIN", "MAINT_PLANNER", "PLANNER", "SHIFT_LEAD", "COORDINATOR"].includes(
      roleCodeOrUserId.toUpperCase()
    );
  }

  return await hasPermission(roleCodeOrUserId, "can_view_ai_analytics", tenantId);
}
