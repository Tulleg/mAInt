"use server";

import { revalidatePath } from "next/cache";
import { eq, asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { userSavedViews, users, tenants, UserSavedView } from "@/db/schema";
import { getCurrentUserRbac } from "@/lib/rbac";

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch (_) {
    // Graceful no-op when executed outside of Next.js server context
  }
}

/**
 * Löst die Tenant- und User-ID auf, falls nicht explizit übergeben.
 */
async function resolveUserContext(userId?: string): Promise<{ userId: string; tenantId: string }> {
  let tenantId = "demo-tenant-1000";
  try {
    const tenant = await db.query.tenants.findFirst();
    if (tenant) {
      tenantId = tenant.id;
    }
  } catch (_) {}

  if (userId) {
    // 1. Prüfen, ob userId direkt ein User-Datensatz ist
    try {
      const directUser = await db.query.users.findFirst({
        where: eq(users.id, userId),
      });
      if (directUser) {
        return { userId: directUser.id, tenantId: directUser.tenantId };
      }
    } catch (_) {}

    // 2. Prüfen, ob userId als E-Mail übergeben wurde
    try {
      const userByEmail = await db.query.users.findFirst({
        where: eq(users.email, userId),
      });
      if (userByEmail) {
        return { userId: userByEmail.id, tenantId: userByEmail.tenantId };
      }
    } catch (_) {}

    // 3. Wenn gültiges UUID-Format, direkt verwenden
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return { userId, tenantId };
    }
  }

  // Fallback via RBAC Session / Cookie
  try {
    const rbac = await getCurrentUserRbac(tenantId);
    if (rbac?.userEmail) {
      const u = await db.query.users.findFirst({
        where: eq(users.email, rbac.userEmail),
      });
      if (u) return { userId: u.id, tenantId: u.tenantId };
    }
    if (rbac?.userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rbac.userId)) {
      const u = await db.query.users.findFirst({
        where: eq(users.id, rbac.userId),
      });
      if (u) return { userId: u.id, tenantId: u.tenantId };
    }
  } catch (_) {}

  // Letzter Fallback: Erster Benutzer des Mandanten
  try {
    const firstUser = await db.query.users.findFirst({
      where: eq(users.tenantId, tenantId),
    });
    if (firstUser) {
      return { userId: firstUser.id, tenantId: firstUser.tenantId };
    }
  } catch (_) {}

  return { userId: "00000000-0000-0000-0000-000000000001", tenantId };
}

export type SavedViewWithMeta = UserSavedView & {
  success: boolean;
  views: UserSavedView[];
  data: UserSavedView[];
};

export type SingleSavedViewResult = UserSavedView & {
  success: boolean;
  view: UserSavedView;
  data: UserSavedView;
};

/**
 * Holt alle Favoriten des angemeldeten Benutzers sortiert nach position.
 */
export async function getUserSavedViews(userId?: string): Promise<UserSavedView[] & { success: boolean; views: UserSavedView[]; data: UserSavedView[] }> {
  try {
    const ctx = await resolveUserContext(userId);

    const views = await db.query.userSavedViews.findMany({
      where: eq(userSavedViews.userId, ctx.userId),
      orderBy: (table, { asc }) => [asc(table.position), asc(table.createdAt)],
    });

    return Object.assign(views, {
      success: true,
      views,
      data: views,
    });
  } catch (err: any) {
    console.error("Fehler beim Abrufen der Favoriten:", err);
    const empty: UserSavedView[] = [];
    return Object.assign(empty, {
      success: false,
      views: empty,
      data: empty,
    });
  }
}

export interface CreateSavedViewPayload {
  name: string;
  filterPayload: any;
  refreshInterval?: number;
  displayDensity?: string;
  userId?: string;
  icon?: string;
  intent?: string;
  position?: number;
}

/**
 * Speichert einen neuen Favoriten.
 */
export async function createSavedView(
  payload: CreateSavedViewPayload
): Promise<UserSavedView & { success: boolean; view: UserSavedView; data: UserSavedView }> {
  if (!payload.name || !payload.name.trim()) {
    throw new Error("Ein Name für den Favoriten ist erforderlich.");
  }

  const ctx = await resolveUserContext(payload.userId);

  // Position bestimmen, falls nicht explizit angegeben
  let position = payload.position;
  if (position === undefined) {
    const existingViews = await db.query.userSavedViews.findMany({
      where: eq(userSavedViews.userId, ctx.userId),
      columns: { position: true },
    });
    const maxPos = existingViews.reduce((max, v) => Math.max(max, v.position ?? 0), 0);
    position = existingViews.length > 0 ? maxPos + 1 : 1;
  }

  // Density normalisieren
  let density: "compact" | "standard" | "detailed" = "standard";
  if (payload.displayDensity === "compact" || payload.displayDensity === "detailed") {
    density = payload.displayDensity;
  }

  const [created] = await db
    .insert(userSavedViews)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      name: payload.name.trim(),
      icon: payload.icon || "star",
      intent: payload.intent || "ORDERS_QUERY",
      filterPayload: payload.filterPayload ?? {},
      refreshInterval: payload.refreshInterval ?? 0,
      displayDensity: density,
      position,
    })
    .returning();

  safeRevalidatePath("/orders");
  safeRevalidatePath("/planning");

  return Object.assign(created, {
    success: true,
    view: created,
    data: created,
  });
}

export interface UpdateSavedViewPayload {
  name?: string;
  refreshInterval?: number;
  displayDensity?: string;
  filterPayload?: any;
  position?: number;
  icon?: string;
  intent?: string;
}

export type GetSavedViewResult = {
  success: boolean;
  view: UserSavedView | null;
  data: UserSavedView | null;
  error?: string;
};

/**
 * Lädt eine einzelne gespeicherte Ansicht anhand ihrer ID ab.
 * Fängt ungültige oder leere IDs sowie nicht gefundene Datensätze ab,
 * ohne unbehandelte Exceptions zu werfen.
 */
export async function getSavedViewById(
  viewId: string,
  userId?: string
): Promise<GetSavedViewResult> {
  if (!viewId || typeof viewId !== "string" || !viewId.trim()) {
    return {
      success: false,
      view: null,
      data: null,
      error: "Ungültige oder leere viewId übergeben.",
    };
  }

  const cleanViewId = viewId.trim();

  try {
    const view = await db.query.userSavedViews.findFirst({
      where: eq(userSavedViews.id, cleanViewId),
    });

    if (!view) {
      return {
        success: false,
        view: null,
        data: null,
        error: `Favoritenansicht mit ID '${cleanViewId}' nicht gefunden.`,
      };
    }

    return {
      success: true,
      view,
      data: view,
    };
  } catch (err: any) {
    console.warn("Fehler beim Laden der Favoritenansicht:", cleanViewId, err?.message);
    return {
      success: false,
      view: null,
      data: null,
      error: err?.message || "Fehler beim Laden der Favoritenansicht.",
    };
  }
}

/** Alias für Server Action Namenskonvention */
export async function getSavedViewAction(viewId: string, userId?: string) {
  return await getSavedViewById(viewId, userId);
}

/**
 * Aktualisiert Konfiguration eines Favoriten.
 */
export async function updateSavedView(
  viewId: string,
  updates: Partial<UpdateSavedViewPayload>
): Promise<UserSavedView & { success: boolean; view: UserSavedView; data: UserSavedView }> {
  if (!viewId || typeof viewId !== "string" || !viewId.trim()) {
    throw new Error("Ungültige viewId übergeben.");
  }
  const cleanViewId = viewId.trim();

  const existing = await db.query.userSavedViews.findFirst({
    where: eq(userSavedViews.id, cleanViewId),
  });

  if (!existing) {
    throw new Error(`Favoritenansicht mit ID ${cleanViewId} nicht gefunden.`);
  }

  const updateData: Record<string, any> = {
    updatedAt: new Date(),
  };

  if (updates.name !== undefined) {
    updateData.name = updates.name.trim();
  }
  if (updates.refreshInterval !== undefined) {
    updateData.refreshInterval = updates.refreshInterval;
  }
  if (updates.displayDensity !== undefined) {
    if (updates.displayDensity === "compact" || updates.displayDensity === "detailed") {
      updateData.displayDensity = updates.displayDensity;
    } else {
      updateData.displayDensity = "standard";
    }
  }
  if (updates.filterPayload !== undefined) {
    updateData.filterPayload = updates.filterPayload;
  }
  if (updates.position !== undefined) {
    updateData.position = updates.position;
  }
  if (updates.icon !== undefined) {
    updateData.icon = updates.icon;
  }
  if (updates.intent !== undefined) {
    updateData.intent = updates.intent;
  }

  const [updated] = await db
    .update(userSavedViews)
    .set(updateData)
    .where(eq(userSavedViews.id, cleanViewId))
    .returning();

  safeRevalidatePath("/orders");
  safeRevalidatePath("/planning");

  return Object.assign(updated, {
    success: true,
    view: updated,
    data: updated,
  });
}

/**
 * Löscht einen Favoriten.
 */
export async function deleteSavedView(viewId: string): Promise<{ success: boolean; id: string; error?: string }> {
  if (!viewId || typeof viewId !== "string" || !viewId.trim()) {
    return { success: false, id: "", error: "Ungültige oder leere viewId übergeben." };
  }
  const cleanViewId = viewId.trim();

  try {
    await db.delete(userSavedViews).where(eq(userSavedViews.id, cleanViewId));

    safeRevalidatePath("/orders");
    safeRevalidatePath("/planning");

    return { success: true, id: cleanViewId };
  } catch (err: any) {
    console.warn("Fehler beim Löschen des Favoriten:", cleanViewId, err?.message);
    return {
      success: false,
      id: cleanViewId,
      error: err?.message || "Fehler beim Löschen des Favoriten.",
    };
  }
}
