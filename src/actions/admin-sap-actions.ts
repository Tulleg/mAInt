"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { getCurrentUserRbac, assertUserHasRole, RbacPermissionError } from "@/lib/rbac";
import { ActionResult, actionSuccess, actionError, validateWithZod } from "./action-utils";

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch (_) {
    // Graceful no-op in testing environments
  }
}

export type SapSyncMode = "STANDALONE" | "ODATA_V4" | "RFC_BAPI" | "REST_MIDDLEWARE";

export interface UpdateGlobalSapModeInput {
  tenantId?: string;
  mode: SapSyncMode;
  sapPlantCode?: string;
  userId?: string;
}

const updateGlobalSapModeSchema = z.object({
  tenantId: z.string().optional(),
  mode: z.enum(["STANDALONE", "ODATA_V4", "RFC_BAPI", "REST_MIDDLEWARE"], {
    errorMap: () => ({ message: "Ungültiger SAP-Synchronisationsmodus." }),
  }),
  sapPlantCode: z.string().optional(),
  userId: z.string().optional(),
});

/**
 * Globale Umschaltung des Betriebsmodus zwischen SAP PM und lokaler Pflege.
 * Wird zentral über "Administration & SAP" gesteuert.
 */
export async function updateGlobalSapModeAction(
  input: UpdateGlobalSapModeInput
): Promise<{
  success: boolean;
  data?: { mode: SapSyncMode; message: string };
  mode?: SapSyncMode;
  message?: string;
  error?: string;
}> {
  try {
    const validation = validateWithZod(updateGlobalSapModeSchema, input);
    if (!validation.success) {
      return { success: false, error: validation.error };
    }
    const validatedInput = validation.data;

    let tenantId = validatedInput.tenantId;
    if (!tenantId) {
      const firstTenant = await db.query.tenants.findFirst();
      tenantId = firstTenant?.id;
    }

    if (!tenantId) {
      return { success: false, error: "Kein gültiger Mandant im System gefunden." };
    }

    // RBAC: Nur Administratoren dürfen den globalen Betriebsmodus ändern
    const rbac = await getCurrentUserRbac(tenantId);
    if (rbac.roleCode !== "ADMIN") {
      if (validatedInput.userId) {
        await assertUserHasRole(validatedInput.userId, "ADMIN", tenantId);
      } else {
        throw new RbacPermissionError(
          "Nur Administratoren dürfen den globalen SAP-Betriebsmodus ändern.",
          "INSUFFICIENT_PERMISSIONS",
          "ADMIN"
        );
      }
    }

    await db
      .update(tenants)
      .set({
        sapSyncMode: validatedInput.mode,
        ...(validatedInput.sapPlantCode ? { sapPlantCode: validatedInput.sapPlantCode.trim() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId));

    safeRevalidatePath("/admin");
    safeRevalidatePath("/admin/settings");
    safeRevalidatePath("/equipments");
    safeRevalidatePath("/functional-locations");
    safeRevalidatePath("/assets");
    safeRevalidatePath("/planning");

    const message =
      validatedInput.mode === "STANDALONE"
        ? "Globaler Betriebsmodus auf 'Lokal (Standalone)' umgestellt. Lokale Stammdatenpflege ist freigeschaltet."
        : `Globaler Betriebsmodus auf '${validatedInput.mode}' umgestellt. Stammdaten werden zentral über SAP PM geführt.`;

    return {
      success: true,
      data: { mode: validatedInput.mode, message },
      mode: validatedInput.mode,
      message,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Fehler beim Umschalten des globalen SAP-Betriebsmodus.",
    };
  }
}
