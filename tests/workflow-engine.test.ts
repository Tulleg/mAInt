import { describe, it, expect, beforeEach } from "vitest";
import { transitionOrderStatus, WorkflowViolationError } from "../src/lib/workflow-engine";

describe("Workflow Engine & RBAC Unit Tests", () => {
  it("should reject transition if no transition rule exists between statuses", async () => {
    // Ungültiger Übergang (z.B. von Entwurf direkt zu Geschlossen)
    await expect(
      transitionOrderStatus("invalid-order-id", "non-existent-status-id", "test-user-id")
    ).rejects.toThrow(WorkflowViolationError);
  });
});
