"use server";

import { revalidatePath } from "next/cache";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users, userRoles } from "@/db/schema";
import { validateWithZod, actionSuccess, actionError, ActionResult } from "./action-utils";

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch (_) {}
}

export interface UpdateUserRoleInput {
  userId: string;
  roleIds: string[];
}

export interface UpdateUserStatusInput {
  userId: string;
  isActive: boolean;
}

const updateUserRoleSchema = z.object({
  userId: z.string().trim().min(1, "Benutzer-ID ist erforderlich."),
  roleIds: z.array(z.string().min(1)),
});

const updateUserStatusSchema = z.object({
  userId: z.string().trim().min(1, "Benutzer-ID ist erforderlich."),
  isActive: z.boolean(),
});

/**
 * Weist einem Benutzer eine oder mehrere Rollen zu.
 */
export async function updateUserRolesAction(
  input: UpdateUserRoleInput
): Promise<ActionResult<{ userId: string; roleIds: string[] }, { message?: string }>> {
  try {
    const validation = validateWithZod(updateUserRoleSchema, input);
    if (!validation.success) {
      return actionError(validation.error);
    }
    const validated = validation.data;

    // Vorhandene Zuweisungen löschen
    await db.delete(userRoles).where(eq(userRoles.userId, validated.userId));

    // Neue Rollen zuweisen
    if (validated.roleIds.length > 0) {
      await db.insert(userRoles).values(
        validated.roleIds.map((roleId) => ({
          userId: validated.userId,
          roleId,
        }))
      );
    }

    safeRevalidatePath("/admin/users");
    safeRevalidatePath("/admin");
    return actionSuccess(validated, { message: "Rollen erfolgreich aktualisiert." });
  } catch (err: any) {
    console.error("Fehler in updateUserRolesAction:", err);
    return actionError(err.message || "Rollenaktualisierung fehlgeschlagen.");
  }
}

/**
 * Aktiviert oder deaktiviert einen Benutzer.
 */
export async function toggleUserStatusAction(
  input: UpdateUserStatusInput
): Promise<ActionResult<{ userId: string; isActive: boolean }>> {
  try {
    const validation = validateWithZod(updateUserStatusSchema, input);
    if (!validation.success) {
      return actionError(validation.error);
    }
    const validated = validation.data;

    await db
      .update(users)
      .set({ isActive: validated.isActive, updatedAt: new Date() })
      .where(eq(users.id, validated.userId));

    safeRevalidatePath("/admin/users");
    return actionSuccess(validated);
  } catch (err: any) {
    return actionError(err.message || "Statusänderung fehlgeschlagen.");
  }
}
