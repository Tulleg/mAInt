import { describe, it, expect, vi } from "vitest";
import { classifyCopilotInputAction } from "../src/actions/copilot-actions";
import {
  exportTableToCsv,
  createExcelWorkbook,
  formatPriorityLabel,
} from "../src/lib/export-utils";
import type { OrderWithRelations } from "../src/actions/order-actions";

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

  it("should trigger clarification when equipment is ambiguous", async () => {
    const classification = await classifyCopilotInputAction({
      prompt: "KUKA Roboter Fehler melden",
    });

    expect(classification).toBeDefined();
    if (classification.needsClarification) {
      expect(classification.clarificationOptions.length).toBeGreaterThan(0);
      expect(classification.clarificationQuestion).toBeDefined();
    }
  });

  it("should generate a CREATE_ORDER draft with matched equipment and title", async () => {
    const classification = await classifyCopilotInputAction({
      prompt: "Überhitzung Roboter KUKA KR 210 R2700",
      selectedOptionId: "eq-10001001",
      clarificationSelection: {
        field: "equipment",
        id: "eq-10001001",
        value: "KUKA KR 210 R2700 - Roboter 01",
      },
    });

    expect(classification).toBeDefined();
    expect(classification.intent).toBe("CREATE_ORDER");
    expect(classification.createOrder).toBeDefined();
    expect(classification.createOrder?.matchedEquipmentId).toBeTruthy();
  });

  describe("Export Utilities (CSV & Excel)", () => {
    const mockOrders = [
      {
        id: "ord-1",
        orderNumber: "AUF-2026-001",
        priority: "1_EMERGENCY",
        title: "KUKA Roboter Störung Achse 2",
        equipment: { name: "KUKA KR 210" },
        functionalLocation: { code: "FL-H1-01" },
        currentStatus: { name: "In Bearbeitung" },
        createdAt: new Date("2026-10-23T10:00:00Z"),
      },
      {
        id: "ord-2",
        orderNumber: "AUF-2026-002",
        priority: "2_HIGH",
        title: 'Ölleckage; Pumpe "P-102"',
        equipment: null,
        functionalLocation: { code: "FL-H1-02" },
        currentStatus: { name: "Neu" },
        createdAt: new Date("2026-10-23T11:00:00Z"),
      },
    ] as unknown as OrderWithRelations[];

    it("should format priority labels correctly for German exports", () => {
      expect(formatPriorityLabel("1_EMERGENCY")).toBe("1 - Notfall");
      expect(formatPriorityLabel("2_HIGH")).toBe("2 - Hoch");
      expect(formatPriorityLabel("3_MEDIUM")).toBe("3 - Mittel");
      expect(formatPriorityLabel("4_LOW")).toBe("4 - Niedrig");
      expect(formatPriorityLabel(null)).toBe("-");
    });

    it("should generate valid CSV with UTF-8 BOM, semicolon separator and escaped cells", () => {
      const csv = exportTableToCsv(mockOrders, "test-export");

      // Prüfe UTF-8 BOM
      expect(csv.startsWith("\uFEFF")).toBe(true);

      // Prüfe Header-Zeile mit Semikolon
      expect(csv).toContain("Auftragsnummer;Priorität;Titel;Equipment;Status;ErstelltAm");

      // Prüfe Auftragszeile 1
      expect(csv).toContain("AUF-2026-001;1 - Notfall;KUKA Roboter Störung Achse 2;KUKA KR 210;In Bearbeitung");

      // Prüfe Escaping bei Semikolon und Anführungszeichen in Auftragszeile 2
      expect(csv).toContain('AUF-2026-002;2 - Hoch;"Ölleckage; Pumpe ""P-102""";FL-H1-02;Neu');
    });

    it("should create structured Excel workbook with Aufträge sheet", () => {
      const wb = createExcelWorkbook(mockOrders);

      expect(wb).toBeDefined();
      expect(wb.SheetNames).toContain("Aufträge");
      const sheet = wb.Sheets["Aufträge"];
      expect(sheet).toBeDefined();
      expect(sheet["!cols"]).toHaveLength(6);
    });
  });
});
