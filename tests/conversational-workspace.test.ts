import { describe, it, expect, vi } from "vitest";
import { classifyCopilotInputAction } from "../src/actions/copilot-actions";

describe("Conversational Single-Input Workspace Integration Tests", () => {
  it("should classify orders query intent correctly with fallback logic", async () => {
    const classification = await classifyCopilotInputAction({
      prompt: "Zeige alle offenen Störungen in Halle 1",
    });

    expect(classification).toBeDefined();
    expect(classification.intent).toBe("QUERY_ORDERS");
    expect(classification.queryOrders).toBeDefined();
    expect(classification.queryOrders?.statusList).toBeDefined();
  });

  it("should classify priority 1 emergency requests", async () => {
    const classification = await classifyCopilotInputAction({
      prompt: "Akute Prio 1 Notfälle anzeigen",
    });

    expect(classification).toBeDefined();
    expect(classification.intent).toBe("QUERY_ORDERS");
    expect(classification.queryOrders?.priorityList).toContain("1_EMERGENCY");
  });
});
