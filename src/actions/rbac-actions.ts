"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUserRbac, CurrentUserRbacInfo } from "@/lib/rbac";
import { validateWithZod } from "./action-utils";

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path, "layout");
  } catch (_) {
    // Outside request context
  }
}

/**
 * Server Action: Wechselt die aktive Benutzerrolle (z. B. für RBAC-Simulation und Tests)
 */
export async function switchUserRoleAction(
  roleCode: string
): Promise<CurrentUserRbacInfo & { success: boolean; data: CurrentUserRbacInfo; error?: string }> {
  try {
    const validation = validateWithZod(z.string().trim().min(1, "Rollen-Code darf nicht leer sein."), roleCode);
    const validCode = validation.success ? validation.data : "TECHNICIAN";

    const cookieStore = await cookies();
    cookieStore.set("maintai_user_role", validCode.toUpperCase(), {
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 Tage
      sameSite: "lax",
    });

    safeRevalidatePath("/");
    safeRevalidatePath("/analytics");
    safeRevalidatePath("/admin");

    const info = await getCurrentUserRbac();
    return Object.assign(info, {
      success: true,
      data: info,
    });
  } catch (err: any) {
    console.error("Fehler in switchUserRoleAction:", err);
    const fallback = await getCurrentUserRbac();
    return Object.assign(fallback, {
      success: false,
      error: err?.message || "Fehler beim Wechseln der Rolle.",
      data: fallback,
    });
  }
}

/**
 * Server Action: Ruft die aktuellen RBAC-Informationen des angemeldeten Benutzers ab
 */
export async function getCurrentUserRbacAction(): Promise<
  CurrentUserRbacInfo & { success: boolean; data: CurrentUserRbacInfo; error?: string }
> {
  try {
    const info = await getCurrentUserRbac();
    return Object.assign(info, {
      success: true,
      data: info,
    });
  } catch (err: any) {
    console.error("Fehler in getCurrentUserRbacAction:", err);
    const fallback = await getCurrentUserRbac();
    return Object.assign(fallback, {
      success: false,
      error: err?.message || "Fehler beim Laden der RBAC-Informationen.",
      data: fallback,
    });
  }
}
