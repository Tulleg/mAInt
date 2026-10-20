import { describe, it, expect, vi } from "vitest";
import { transitionOrderStatus, WorkflowViolationError } from "../src/lib/workflow-engine";
import { db } from "../src/lib/db";

describe("Workflow Engine & RBAC Unit Tests", () => {
  it("should reject transition if no transition rule exists between statuses or order not found", async () => {
    // Falls PostgreSQL in der Testumgebung offline ist, mocken wir die DB-Abfrage
    const txMock = {
      query: {
        maintenanceOrders: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    };

    vi.spyOn(db, "transaction").mockImplementation(async (cb: any) => {
      return cb(txMock);
    });

    await expect(
      transitionOrderStatus("invalid-order-id", "non-existent-status-id", "test-user-id")
    ).rejects.toThrow(WorkflowViolationError);
  });
});

