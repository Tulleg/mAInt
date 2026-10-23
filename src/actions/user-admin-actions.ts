"use server";

import { revalidatePath } from "next/cache";

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch (_) {
    // Graceful no-op in testing environments
  }
}

import { createHash } from "crypto";
import { eq, and, inArray, desc } from "drizzle-orm";
import { db } from "@/db";
import {
  users,
  roles,
  userRoles,
  permissions,
  rolePermissions,
  tenants,
} from "@/db/schema";
import { hasRole, RbacPermissionError } from "@/lib/rbac";

export interface CreateUserInput {
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  password?: string;
  roleCodeOrId?: string;
  personnelNr?: string;
  workCenterCode?: string;
  qualificationMatrix?: string[];
  adminUserId?: string;
}

export interface UpdateUserRoleInput {
  userId: string;
  roleCodeOrId: string;
  tenantId?: string;
  adminUserId?: string;
}

export interface AdUserImportItem {
  email: string;
  firstName: string;
  lastName: string;
  roleCode?: string;
  personnelNr?: string;
  workCenterCode?: string;
  qualificationMatrix?: string[];
}

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

/**
 * Erstellt einen neuen Benutzer und weist ihm optional direkt eine Systemrolle zu.
 * Nur Administratoren dürfen neue Benutzer anlegen.
 */
export async function createUser(payload: CreateUserInput) {
  const {
    tenantId,
    email,
    firstName,
    lastName,
    password = "DefaultPassword123!",
    roleCodeOrId,
    personnelNr,
    workCenterCode,
    qualificationMatrix = [],
    adminUserId,
  } = payload;

  if (adminUserId) {
    const isAdmin = await hasRole(adminUserId, "ADMIN", tenantId);
    if (!isAdmin) {
      throw new RbacPermissionError(
        "Berechtigung verweigert: Nur Administratoren dürfen Benutzer anlegen."
      );
    }
  }

  if (!email || !email.includes("@")) {
    return { success: false, error: "Eine gültige E-Mail-Adresse ist erforderlich." };
  }
  if (!firstName?.trim() || !lastName?.trim()) {
    return { success: false, error: "Vor- und Nachname sind Pflichtfelder." };
  }

  try {
    // Prüfen, ob Benutzer mit dieser E-Mail im Mandanten bereits existiert
    const existing = await db.query.users.findFirst({
      where: and(eq(users.tenantId, tenantId), eq(users.email, email.toLowerCase().trim())),
    });

    if (existing) {
      return {
        success: false,
        error: `Ein Benutzer mit der E-Mail '${email}' existiert bereits.`,
      };
    }

    const passwordHash = hashPassword(password);

    const [newUser] = await db
      .insert(users)
      .values({
        tenantId,
        email: email.toLowerCase().trim(),
        passwordHash,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        personnelNr: personnelNr?.trim() || null,
        workCenterCode: workCenterCode?.trim() || null,
        qualificationMatrix,
        isActive: true,
      })
      .returning();

    // Rolle zuweisen, falls angegeben
    if (roleCodeOrId) {
      let resolvedRole = await db.query.roles.findFirst({
        where: and(
          eq(roles.tenantId, tenantId),
          eq(roles.id, roleCodeOrId)
        ),
      });

      if (!resolvedRole) {
        resolvedRole = await db.query.roles.findFirst({
          where: and(
            eq(roles.tenantId, tenantId),
            eq(roles.code, roleCodeOrId.toUpperCase())
          ),
        });
      }

      // Falls Rolle noch nicht im Mandanten existiert, anlegen
      if (!resolvedRole) {
        const [createdRole] = await db
          .insert(roles)
          .values({
            tenantId,
            code: roleCodeOrId.toUpperCase(),
            name: roleCodeOrId,
            isSystemRole: true,
          })
          .returning();
        resolvedRole = createdRole;
      }

      if (resolvedRole) {
        await db.insert(userRoles).values({
          userId: newUser.id,
          roleId: resolvedRole.id,
          assignedByUserId: adminUserId || null,
        });
      }
    }

    safeRevalidatePath("/admin/users");
    safeRevalidatePath("/admin");

    return {
      success: true,
      user: newUser,
      data: newUser,
      message: `Benutzer '${newUser.firstName} ${newUser.lastName}' erfolgreich angelegt.`,
    };
  } catch (err: any) {
    console.error("Fehler in createUser:", err);
    return {
      success: false,
      error: err?.message || "Fehler beim Anlegen des Benutzers.",
      data: null,
    };
  }
}

/**
 * Aktualisiert die zugewiesene Rolle eines Benutzers dynamisch.
 */
export async function updateUserRole(payload: UpdateUserRoleInput) {
  const { userId, roleCodeOrId, tenantId, adminUserId } = payload;

  if (adminUserId && tenantId) {
    const isAdmin = await hasRole(adminUserId, "ADMIN", tenantId);
    if (!isAdmin) {
      throw new RbacPermissionError(
        "Berechtigung verweigert: Nur Administratoren dürfen Benutzerrollen ändern."
      );
    }
  }

  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return { success: false, error: "Benutzer nicht gefunden." };
    }

    const effectiveTenantId = tenantId || user.tenantId;

    let targetRole = await db.query.roles.findFirst({
      where: and(
        eq(roles.tenantId, effectiveTenantId),
        eq(roles.id, roleCodeOrId)
      ),
    });

    if (!targetRole) {
      targetRole = await db.query.roles.findFirst({
        where: and(
          eq(roles.tenantId, effectiveTenantId),
          eq(roles.code, roleCodeOrId.toUpperCase())
        ),
      });
    }

    if (!targetRole) {
      const [newRole] = await db
        .insert(roles)
        .values({
          tenantId: effectiveTenantId,
          code: roleCodeOrId.toUpperCase(),
          name: roleCodeOrId,
          isSystemRole: true,
        })
        .returning();
      targetRole = newRole;
    }

    // Bisherige Rollenzuweisungen entfernen und neue setzen
    await db.delete(userRoles).where(eq(userRoles.userId, userId));

    await db.insert(userRoles).values({
      userId,
      roleId: targetRole.id,
      assignedByUserId: adminUserId || null,
    });

    safeRevalidatePath("/admin/users");
    safeRevalidatePath("/admin");

    return {
      success: true,
      roleId: targetRole.id,
      roleName: targetRole.name,
      data: {
        roleId: targetRole.id,
        roleName: targetRole.name,
      },
      message: `Rolle von '${user.firstName} ${user.lastName}' erfolgreich auf '${targetRole.name}' aktualisiert.`,
    };
  } catch (err: any) {
    console.error("Fehler in updateUserRole:", err);
    return {
      success: false,
      error: err?.message || "Fehler beim Ändern der Rolle.",
      data: null,
    };
  }
}

/**
 * Aktiviert oder deaktiviert einen Benutzeraccount.
 */
export async function toggleUserStatus(
  userId: string,
  isActive?: boolean,
  options?: { adminUserId?: string; tenantId?: string }
) {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return { success: false, error: "Benutzer nicht gefunden." };
    }

    if (options?.adminUserId) {
      const isAdmin = await hasRole(options.adminUserId, "ADMIN", user.tenantId);
      if (!isAdmin) {
        throw new RbacPermissionError(
          "Berechtigung verweigert: Nur Administratoren dürfen den Benutzerstatus ändern."
        );
      }
    }

    const newStatus = isActive !== undefined ? isActive : !user.isActive;

    await db
      .update(users)
      .set({
        isActive: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    safeRevalidatePath("/admin/users");
    safeRevalidatePath("/admin");

    return {
      success: true,
      userId,
      isActive: newStatus,
      data: {
        userId,
        isActive: newStatus,
      },
      message: `Benutzer '${user.firstName} ${user.lastName}' ist nun ${newStatus ? "aktiv" : "deaktiviert"}.`,
    };
  } catch (err: any) {
    console.error("Fehler in toggleUserStatus:", err);
    return {
      success: false,
      error: err?.message || "Fehler beim Ändern des Benutzerstatus.",
      data: null,
    };
  }
}

/**
 * Importiert Benutzer aus einem Active Directory / Azure AD Export (CSV oder JSON-Payload).
 */
export async function importUsersFromAd(
  csvOrPayload: string | Array<AdUserImportItem>,
  options?: { tenantId?: string; adminUserId?: string }
) {
  let targetTenantId = options?.tenantId;
  if (!targetTenantId) {
    const defaultTenant = await db.query.tenants.findFirst();
    targetTenantId = defaultTenant?.id;
  }

  if (!targetTenantId) {
    return { success: false, error: "Kein gültiger Mandant für den Import gefunden." };
  }

  if (options?.adminUserId) {
    const isAdmin = await hasRole(options.adminUserId, "ADMIN", targetTenantId);
    if (!isAdmin) {
      throw new RbacPermissionError(
        "Berechtigung verweigert: Nur Administratoren dürfen Benutzer importieren."
      );
    }
  }

  let items: AdUserImportItem[] = [];

  if (typeof csvOrPayload === "string") {
    // CSV parsen (unterstützt Komma und Semikolon)
    const lines = csvOrPayload
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length <= 1) {
      return { success: false, error: "CSV enthält keine Datensätze." };
    }

    const delimiter = lines[0].includes(";") ? ";" : ",";
    const header = lines[0].split(delimiter).map((h) => h.trim().toLowerCase());

    const emailIdx = header.findIndex((h) => h.includes("email") || h.includes("mail"));
    const firstIdx = header.findIndex((h) => h.includes("first") || h.includes("vorname"));
    const lastIdx = header.findIndex((h) => h.includes("last") || h.includes("nachname"));
    const roleIdx = header.findIndex((h) => h.includes("role") || h.includes("rolle"));
    const pernrIdx = header.findIndex((h) => h.includes("pernr") || h.includes("personal"));
    const arbplIdx = header.findIndex((h) => h.includes("workcenter") || h.includes("arbpl") || h.includes("platz"));

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(delimiter).map((p) => p.trim());
      const email = emailIdx >= 0 ? parts[emailIdx] : "";
      if (!email || !email.includes("@")) continue;

      items.push({
        email,
        firstName: firstIdx >= 0 ? parts[firstIdx] : "Mitarbeiter",
        lastName: lastIdx >= 0 ? parts[lastIdx] : `AD-${i}`,
        roleCode: roleIdx >= 0 ? parts[roleIdx] : "TECHNICIAN",
        personnelNr: pernrIdx >= 0 ? parts[pernrIdx] : undefined,
        workCenterCode: arbplIdx >= 0 ? parts[arbplIdx] : undefined,
      });
    }
  } else if (Array.isArray(csvOrPayload)) {
    items = csvOrPayload;
  }

  let importedCount = 0;
  let updatedCount = 0;
  const errors: string[] = [];

  for (const item of items) {
    try {
      const cleanEmail = item.email.toLowerCase().trim();
      const existing = await db.query.users.findFirst({
        where: and(eq(users.tenantId, targetTenantId), eq(users.email, cleanEmail)),
      });

      if (existing) {
        await db
          .update(users)
          .set({
            firstName: item.firstName || existing.firstName,
            lastName: item.lastName || existing.lastName,
            personnelNr: item.personnelNr || existing.personnelNr,
            workCenterCode: item.workCenterCode || existing.workCenterCode,
            updatedAt: new Date(),
          })
          .where(eq(users.id, existing.id));

        if (item.roleCode) {
          await updateUserRole({
            userId: existing.id,
            roleCodeOrId: item.roleCode,
            tenantId: targetTenantId,
          });
        }
        updatedCount++;
      } else {
        await createUser({
          tenantId: targetTenantId,
          email: cleanEmail,
          firstName: item.firstName || "Mitarbeiter",
          lastName: item.lastName || "AD-Import",
          roleCodeOrId: item.roleCode || "TECHNICIAN",
          personnelNr: item.personnelNr,
          workCenterCode: item.workCenterCode,
          qualificationMatrix: item.qualificationMatrix || [],
        });
        importedCount++;
      }
    } catch (err: any) {
      errors.push(`Fehler bei Benutzer '${item.email}': ${err?.message}`);
    }
  }

  safeRevalidatePath("/admin/users");
  safeRevalidatePath("/admin");

  return {
    success: true,
    importedCount,
    updatedCount,
    totalProcessed: items.length,
    errors,
    data: {
      importedCount,
      updatedCount,
      totalProcessed: items.length,
      errors,
    },
    message: `AD-Import abgeschlossen: ${importedCount} neu angelegt, ${updatedCount} aktualisiert.`,
  };
}

/**
 * Gibt alle Benutzer eines Mandanten inklusive ihrer Rollen zurück.
 */
export async function listUsers(tenantId: string) {
  try {
    const userList = await db.query.users.findMany({
      where: eq(users.tenantId, tenantId),
      with: {
        userRoles: {
          with: {
            role: true,
          },
        },
      },
      orderBy: [desc(users.createdAt)],
    });

    return Object.assign(userList, {
      success: true as const,
      data: userList,
    });
  } catch (err: any) {
    console.warn("Fehler beim Laden der Benutzerliste:", err);
    const empty: any[] = [];
    return Object.assign(empty, {
      success: false as const,
      error: err?.message || "Fehler beim Laden der Benutzerliste.",
      data: [],
    });
  }
}

/**
 * Gibt alle Rollen und Berechtigungen eines Mandanten für die dynamische Admin-Konfiguration zurück.
 */
export async function listRolesWithPermissions(tenantId: string) {
  try {
    const rolesList = await db.query.roles.findMany({
      where: eq(roles.tenantId, tenantId),
      with: {
        rolePermissions: {
          with: {
            permission: true,
          },
        },
      },
    });

    const allPermissions = await db.query.permissions.findMany();

    const result = {
      roles: rolesList,
      permissions: allPermissions,
    };

    return Object.assign(result, {
      success: true as const,
      data: result,
    });
  } catch (err: any) {
    console.warn("Fehler beim Laden der Rollen & Berechtigungen:", err);
    const fallback = { roles: [], permissions: [] };
    return Object.assign(fallback, {
      success: false as const,
      error: err?.message || "Fehler beim Laden der Rollen & Berechtigungen.",
      data: fallback,
    });
  }
}

/**
 * Aktualisiert dynamisch die Berechtigungen einer Rolle über die Admin-Oberfläche.
 */
export async function updateRolePermissions(payload: {
  roleId: string;
  permissionCodes: string[];
  tenantId?: string;
  adminUserId?: string;
}) {
  const { roleId, permissionCodes, tenantId, adminUserId } = payload;

  if (adminUserId && tenantId) {
    const isAdmin = await hasRole(adminUserId, "ADMIN", tenantId);
    if (!isAdmin) {
      throw new RbacPermissionError(
        "Berechtigung verweigert: Nur Administratoren dürfen Rollenberechtigungen anpassen."
      );
    }
  }

  try {
    // 1. Bestehende Berechtigungen der Rolle entfernen
    await db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));

    if (permissionCodes.length > 0) {
      // 2. Erlaubte Berechtigungs-IDs laden
      const matchingPermissions = await db.query.permissions.findMany({
        where: inArray(permissions.code, permissionCodes),
      });

      if (matchingPermissions.length > 0) {
        await db.insert(rolePermissions).values(
          matchingPermissions.map((p) => ({
            roleId,
            permissionId: p.id,
          }))
        );
      }
    }

    safeRevalidatePath("/admin/roles");
    safeRevalidatePath("/admin");

    return {
      success: true,
      data: { roleId, permissionCodes },
      message: `Berechtigungen für Rolle '${roleId}' erfolgreich aktualisiert.`,
    };
  } catch (err: any) {
    console.error("Fehler in updateRolePermissions:", err);
    return {
      success: false,
      error: err?.message || "Fehler beim Aktualisieren der Berechtigungen.",
      data: null,
    };
  }
}
