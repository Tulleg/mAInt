import { describe, it, expect } from "vitest";
import { classifyCopilotIntent } from "./copilot";

describe("Conversational Single-Input Copilot Intent Recognition & Clarification Loop", () => {
  it("should recognize QUERY_ORDERS with areaId, status and priority parameters", async () => {
    const result = await classifyCopilotIntent({
      prompt: "Welche offenen Störungen in Bereich Rohbau stehen an?",
    });

    expect(result.intent).toBe("QUERY_ORDERS");
    expect(result.queryOrders).toBeDefined();
    expect(result.queryOrders?.areaId).toBe("area-h01");
    expect(result.queryOrders?.areaName).toContain("Karosseriebau");
    expect(result.queryOrders?.statusList).toContain("ERFASST");
    expect(result.queryOrders?.statusList).toContain("IN_ARBEIT");
  });

  it("should extract priorityList in QUERY_ORDERS when emergencies are asked", async () => {
    const result = await classifyCopilotIntent({
      prompt: "Welche Notfälle und Stillstände in Bereich Halle 1 stehen an?",
    });

    expect(result.intent).toBe("QUERY_ORDERS");
    expect(result.queryOrders).toBeDefined();
    expect(result.queryOrders?.priorityList).toContain("1_EMERGENCY");
    expect(result.queryOrders?.areaId).toBe("area-h01");
  });

  it("should recognize CREATE_ORDER for reported breakdown", async () => {
    const result = await classifyCopilotIntent({
      prompt: "Pumpe P-102 leckt",
    });

    expect(result.intent).toBe("CREATE_ORDER");
    expect(result.createOrder).toBeDefined();
    expect(result.createOrder?.title).toBeDefined();
    expect(result.createOrder?.equipmentKeyword?.toLowerCase()).toContain("p-102");
    expect(result.createOrder?.matchedEquipmentId).toBe("eq-10001003");
  });

  it("should recognize UPDATE_VIEW_CONFIG with refresh interval and display density", async () => {
    const res1 = await classifyCopilotIntent({
      prompt: "Aktualisiere alle 30 Sekunden",
    });
    expect(res1.intent).toBe("UPDATE_VIEW_CONFIG");
    expect(res1.updateViewConfig?.refreshInterval).toBe(30);

    const res2 = await classifyCopilotIntent({
      prompt: "Zeige kompakte Ansicht",
    });
    expect(res2.intent).toBe("UPDATE_VIEW_CONFIG");
    expect(res2.updateViewConfig?.displayDensity).toBe("compact");

    const res3 = await classifyCopilotIntent({
      prompt: "Ansicht auf detailliert und alle 60 Sekunden aktualisieren",
    });
    expect(res3.intent).toBe("UPDATE_VIEW_CONFIG");
    expect(res3.updateViewConfig?.refreshInterval).toBe(60);
    expect(res3.updateViewConfig?.displayDensity).toBe("detailed");

    const res4 = await classifyCopilotIntent({
      prompt: "Auto-Refresh ausschalten",
    });
    expect(res4.intent).toBe("UPDATE_VIEW_CONFIG");
    expect(res4.updateViewConfig?.refreshInterval).toBe(0);
  });

  it("should recognize ANALYTICS_CHART for metrics and diagrams", async () => {
    const result = await classifyCopilotIntent({
      prompt: "Zeige mir ein Balkendiagramm der Ausfallzeiten der letzten 4 Wochen",
    });

    expect(result.intent).toBe("ANALYTICS_CHART");
    expect(result.analyticsChart).toBeDefined();
    expect(result.analyticsChart?.chartType).toBe("bar");
    expect(result.analyticsChart?.analyticsPrompt).toContain("Balkendiagramm");
  });

  it("should trigger clarification loop if area is ambiguous", async () => {
    // Both 'Halle 1' and 'Halle 2' match 'halle'
    const result = await classifyCopilotIntent({
      prompt: "Zeige offene Störungen in Halle",
      availableAreas: [
        { id: "area-1", code: "AREA-H01", name: "Halle 1 - Karosseriebau", description: "Rohbau" },
        { id: "area-2", code: "AREA-H02", name: "Halle 2 - Lackiererei", description: "Lackierung" },
      ],
    });

    expect(result.intent).toBe("QUERY_ORDERS");
    expect(result.clarification.needed).toBe(true);
    expect(result.clarification.field).toBe("area");
    expect(result.clarification.options.length).toBeGreaterThan(1);
    expect(result.clarification.question).toContain("Mehrere Bereiche");
  });

  it("should trigger clarification loop if area is unknown or ambiguous (e.g. area xy)", async () => {
    const result = await classifyCopilotIntent({
      prompt: "Welche offenen Störungen in Bereich xy stehen an?",
      availableAreas: [
        { id: "area-1", code: "AREA-H01", name: "Halle 1 - Karosseriebau", description: "Rohbau" },
        { id: "area-2", code: "AREA-H02", name: "Halle 2 - Lackiererei", description: "Lackierung" },
      ],
    });

    expect(result.intent).toBe("QUERY_ORDERS");
    expect(result.clarification.needed).toBe(true);
    expect(result.clarification.field).toBe("area");
    expect(result.clarification.options.length).toBe(2);
    expect(result.clarification.question).toContain("nicht gefunden");
  });

  it("should trigger clarification loop if equipment is ambiguous", async () => {
    // Both Grundfos and KSB pumps match 'pumpe'
    const result = await classifyCopilotIntent({
      prompt: "Pumpe leckt stark",
      availableEquipments: [
        { id: "eq-1", equipmentNumber: "EQ-10001003", name: "Grundfos CR 45-3 - Hochdruck-Kreiselpumpe" },
        { id: "eq-2", equipmentNumber: "EQ-10001005", name: "Kreiselpumpe KSB Etanorm (P-101)" },
      ],
    });

    expect(result.intent).toBe("CREATE_ORDER");
    expect(result.clarification.needed).toBe(true);
    expect(result.clarification.field).toBe("equipment");
    expect(result.clarification.options.length).toBe(2);
    expect(result.clarification.question).toContain("Welches Gerät");
  });

  it("should resolve clarification in subsequent turn when user selects option", async () => {
    const result = await classifyCopilotIntent({
      prompt: "Halle 1 - Karosseriebau",
      chatHistory: [
        { role: "user", content: "Zeige offene Störungen in Halle" },
        {
          role: "assistant",
          content: "Mehrere Bereiche für 'Halle' gefunden. Welchen Bereich meinst du genau?",
        },
      ],
      availableAreas: [
        { id: "area-1", code: "AREA-H01", name: "Halle 1 - Karosseriebau", description: "Rohbau" },
        { id: "area-2", code: "AREA-H02", name: "Halle 2 - Lackiererei", description: "Lackierung" },
      ],
    });

    expect(result.clarification.needed).toBe(false);
    expect(result.queryOrders?.areaId).toBe("area-1");
    expect(result.queryOrders?.areaName).toBe("Halle 1 - Karosseriebau");
  });

  it("should resolve clarification when selectedOptionId is passed directly", async () => {
    const result = await classifyCopilotIntent({
      prompt: "Halle 2 - Lackiererei",
      selectedOptionId: "area-2",
      chatHistory: [
        { role: "user", content: "Zeige Notfälle in Halle" },
        {
          role: "assistant",
          content: "Mehrere Bereiche für 'Halle' gefunden. Welchen Bereich meinst du genau?",
        },
      ],
      availableAreas: [
        { id: "area-1", code: "AREA-H01", name: "Halle 1 - Karosseriebau", description: "Rohbau" },
        { id: "area-2", code: "AREA-H02", name: "Halle 2 - Lackiererei", description: "Lackierung" },
      ],
    });

    expect(result.clarification.needed).toBe(false);
    expect(result.queryOrders?.areaId).toBe("area-2");
    expect(result.queryOrders?.areaName).toBe("Halle 2 - Lackiererei");
    expect(result.queryOrders?.priorityList).toContain("1_EMERGENCY");
  });
});
