import { describe, it, expect } from "vitest";

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
