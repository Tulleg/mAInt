import { describe, it, expect } from "vitest";
import { parseFaultPrompt } from "../src/lib/ai/fault-parser";

describe("AI Fault Parser & Clarification Unit Tests", () => {
  const dummyEquipments = [
    { id: "eq-1", name: "Kreiselpumpe KSB Etanorm", equipmentNumber: "EQ-P101" },
    { id: "eq-2", name: "Antriebsmotor Siemens 45kW", equipmentNumber: "EQ-M102" },
    { id: "eq-3", name: "Kaeser Schraubenkompressor", equipmentNumber: "EQ-C401" },
  ];

  it("should extract emergency priority and prompt text under fallback heuristics", async () => {
    const prompt = "Linie 2 steht still! Starker Rauch am Antrieb und Havarie!";
    const result = await parseFaultPrompt({
      tenantId: "demo-tenant-1000",
      prompt,
      availableEquipments: dummyEquipments,
    });

    expect(result).toBeDefined();
    expect(result.title).toBeDefined();
    expect(result.description).toContain(prompt);
    // Sollte wegen "stillstand / rauch / havarie" als Notfall erkannt werden
    expect(result.priority).toBe("1_EMERGENCY");
    expect(result.missingFields).toBeDefined();
    expect(result.missingFields.length).toBeGreaterThan(0);
    // Mindestens das fehlende Aggregat sollte rückgefragt werden
    expect(result.missingFields.some((f) => f.fieldName === "equipment")).toBe(true);
  });

  it("should default to medium priority for non-critical maintenance requests", async () => {
    const prompt = "Vibrationsprüfung an Zuleitung durchführen, keine Eile.";
    const result = await parseFaultPrompt({
      tenantId: "demo-tenant-1000",
      prompt,
      availableEquipments: dummyEquipments,
    });

    expect(result.priority).toBe("3_MEDIUM");
    expect(result.plannedDurationMinutes).toBe(60);
    expect(result.aiCommentary).toBeDefined();
  });

  it("should return valid structured ParsedFaultDraft schema contract", async () => {
    const prompt = "Druckabfall im Hydraulikkreislauf";
    const result = await parseFaultPrompt({
      tenantId: "demo-tenant-1000",
      prompt,
      availableEquipments: dummyEquipments,
    });

    expect(typeof result.title).toBe("string");
    expect(typeof result.description).toBe("string");
    expect(["1_EMERGENCY", "2_HIGH", "3_MEDIUM", "4_LOW"]).toContain(result.priority);
    expect(typeof result.plannedDurationMinutes).toBe("number");
    expect(Array.isArray(result.missingFields)).toBe(true);
  });
});
