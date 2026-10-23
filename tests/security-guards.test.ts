import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  checkTransitionPermission,
  assertTransitionPermission,
  assertUserHasRole,
  assertUserHasPermission,
  RbacPermissionError,
  ROLES,
  PERMISSIONS,
} from "../src/lib/rbac";
import { db } from "../src/db";

// Validierungs-Funktion für schreibgeschützte SQL-Queries
export function validateAnalyticsSqlQuery(sqlQuery: string, tenantId: string): void {
  const cleanSql = sqlQuery.trim().replace(/;+$/, "");
  const lowerSql = cleanSql.toLowerCase();

  const forbiddenKeywords = [
    "insert",
    "update",
    "delete",
    "drop",
    "truncate",
    "alter",
    "grant",
    "create",
    "exec",
    "execute",
    "copy",
    "call",
    "set",
    "vacuum",
    "pg_sleep",
    "pg_read_file",
    "pg_write_file",
    "information_schema",
    "pg_catalog",
    "pg_tables",
  ];

  for (const kw of forbiddenKeywords) {
    if (new RegExp(`\\b${kw}\\b`, "i").test(lowerSql)) {
      throw new Error(`Sicherheitsverletzung: Nicht-lesende oder privilegierte Operation '${kw}' ist im Analytics-Agenten untersagt.`);
    }
  }

  if (!lowerSql.startsWith("select") && !lowerSql.startsWith("with")) {
    throw new Error("Sicherheitsverletzung: Es sind ausschließlich SELECT-Statements erlaubt.");
  }

  if (!cleanSql.includes(tenantId)) {
    throw new Error("Sicherheitsverletzung: Die generierte SQL-Abfrage enthält keinen Filter auf den aktuellen Mandanten.");
  }

  const sensitiveTokens = ["password_hash", "users", "api_key", "secret"];
  for (const tok of sensitiveTokens) {
    if (new RegExp(`\\b${tok}\\b`, "i").test(lowerSql)) {
      throw new Error(`Sicherheitsverletzung: Zugriff auf sensitive Spalte oder Tabelle '${tok}' ist untersagt.`);
    }
  }
}

describe("Security & Analytics SQL Guard Tests", () => {
  const tenantId = "demo-tenant-1000";

  it("should pass valid SELECT queries filtered by tenantId", () => {
    expect(() => {
      validateAnalyticsSqlQuery(
        `SELECT name, downtime_minutes FROM maintenance_orders WHERE tenant_id = '${tenantId}' LIMIT 10`,
        tenantId
      );
    }).not.toThrow();
  });

  it("should block non-SELECT queries (e.g. DROP, UPDATE)", () => {
    expect(() => {
      validateAnalyticsSqlQuery(`DROP TABLE maintenance_orders WHERE tenant_id = '${tenantId}';`, tenantId);
    }).toThrow(/Sicherheitsverletzung/);

    expect(() => {
      validateAnalyticsSqlQuery(`UPDATE maintenance_orders SET downtime_minutes = 0 WHERE tenant_id = '${tenantId}';`, tenantId);
    }).toThrow(/Sicherheitsverletzung/);
  });

  it("should block queries trying to access sensitive users table or password hashes", () => {
    expect(() => {
      validateAnalyticsSqlQuery(`SELECT password_hash FROM users WHERE tenant_id = '${tenantId}'`, tenantId);
    }).toThrow(/Sicherheitsverletzung/);
  });

  it("should block cross-tenant queries missing tenantId", () => {
    expect(() => {
      validateAnalyticsSqlQuery("SELECT * FROM maintenance_orders", tenantId);
    }).toThrow(/Sicherheitsverletzung/);
  });
});

describe("RBAC & Security Guard Assertion Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should allow transition when no requiredRoleId is defined", async () => {
    const res = await checkTransitionPermission("user-1", "tenant-1", null);
    expect(res.allowed).toBe(true);

    await expect(
      assertTransitionPermission("user-1", "tenant-1", null, "Freie Aktion")
    ).resolves.not.toThrow();
  });

  it("should reject assertion when user lacks required role", async () => {
    vi.spyOn(db.query.userRoles, "findMany").mockResolvedValue([]);
    vi.spyOn(db.query.userRoles, "findFirst").mockResolvedValue(undefined as any);

    await expect(
      assertUserHasRole("user-without-role", ROLES.MAINT_PLANNER, "tenant-1")
    ).rejects.toThrow(RbacPermissionError);

    await expect(
      assertTransitionPermission(
        "user-without-role",
        "tenant-1",
        "role-planner-id",
        "Freigeben",
        "Instandhaltungsplaner"
      )
    ).rejects.toThrow(/Fehlende Berechtigung.*Instandhaltungsplaner/);
  });

  it("should pass assertion when user has required role", async () => {
    vi.spyOn(db.query.userRoles, "findFirst").mockResolvedValue({
      userId: "user-with-role",
      roleId: "role-planner-id",
      role: { id: "role-planner-id", code: "MAINT_PLANNER", tenantId: "tenant-1" },
    } as any);

    vi.spyOn(db.query.userRoles, "findMany").mockResolvedValue([
      {
        userId: "user-with-role",
        roleId: "role-planner-id",
        role: { id: "role-planner-id", code: "MAINT_PLANNER", name: "Instandhaltungsplaner", tenantId: "tenant-1" },
      } as any,
    ]);

    await expect(
      assertUserHasRole("user-with-role", "role-planner-id", "tenant-1")
    ).resolves.not.toThrow();

    await expect(
      assertTransitionPermission(
        "user-with-role",
        "tenant-1",
        "role-planner-id",
        "Freigeben",
        "Instandhaltungsplaner"
      )
    ).resolves.not.toThrow();
  });
});
