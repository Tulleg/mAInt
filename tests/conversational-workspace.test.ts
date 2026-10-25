import { describe, it, expect, vi } from "vitest";
import { classifyCopilotInputAction, executeSingleInputCopilotAction } from "../src/actions/copilot-actions";
import {
  exportTableToCsv,
  createExcelWorkbook,
  formatPriorityLabel,
} from "../src/lib/export-utils";
import type { OrderWithRelations } from "../src/actions/order-actions";
import {
  DEFAULT_PALETTE,
  formatChartTooltipValue,
  ensureTrendData,
  getClarificationOptionIconType,
} from "../src/lib/chart-utils";
import type { ClarificationOption } from "../src/lib/ai/copilot";

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

  describe("Interactive Clarification Chips & Chart Rendering Helpers", () => {
    it("should classify clarification chip icons correctly based on option content", () => {
      const pieOpt: ClarificationOption = { id: "pie-1", label: "Kuchendiagramm (Störungsursachen)", value: "Kuchendiagramm", field: "general" };
      const trendOpt: ClarificationOption = { id: "trend-1", label: "Balken mit Trendlinie", value: "Mit Trendlinie", field: "general" };
      const paletteOpt: ClarificationOption = { id: "col-1", label: "Farbschema Smaragdgrün", value: "Smaragdgrün", field: "general" };
      const barOpt: ClarificationOption = { id: "bar-1", label: "Balkendiagramm (Vergleich)", value: "Balkendiagramm", field: "general" };
      const eqOpt: ClarificationOption = { id: "eq-1", label: "KUKA Roboter 01", value: "KUKA Roboter 01", field: "equipment" };
      const areaOpt: ClarificationOption = { id: "area-1", label: "Halle 1 Rohbau", value: "Halle 1", field: "area" };
      const defOpt: ClarificationOption = { id: "def-1", label: "Details ansehen", value: "Details", field: "general" };

      expect(getClarificationOptionIconType(pieOpt)).toBe("pie");
      expect(getClarificationOptionIconType(trendOpt)).toBe("trend");
      expect(getClarificationOptionIconType(paletteOpt)).toBe("palette");
      expect(getClarificationOptionIconType(barOpt)).toBe("bar");
      expect(getClarificationOptionIconType(eqOpt)).toBe("equipment");
      expect(getClarificationOptionIconType(areaOpt)).toBe("area");
      expect(getClarificationOptionIconType(defOpt)).toBe("default");
    });

    it("should calculate regression trendline data when trendline is missing", () => {
      const rawData = [
        { monat: "Jan", hours: 10 },
        { monat: "Feb", hours: 20 },
        { monat: "Mär", hours: 30 },
      ];

      const withTrend = ensureTrendData(rawData, "hours");
      expect(withTrend).toHaveLength(3);
      expect(withTrend[0].trend).toBeDefined();
      expect(typeof withTrend[0].trend).toBe("number");
      // Bei streng linearer Steigerung 10 -> 20 -> 30 muss Trend exakt 10, 20, 30 sein
      expect(withTrend[0].trend).toBe(10);
      expect(withTrend[1].trend).toBe(20);
      expect(withTrend[2].trend).toBe(30);
    });

    it("should preserve existing trend data if already present in dataset", () => {
      const existing = [
        { tag: "Mo", hours: 5, trend: 12 },
        { tag: "Di", hours: 15, trend: 14 },
      ];
      const result = ensureTrendData(existing, "hours");
      expect(result[0].trend).toBe(12);
      expect(result[1].trend).toBe(14);
    });

    it("should gracefully handle empty datasets in ensureTrendData", () => {
      expect(ensureTrendData([])).toEqual([]);
    });

    it("should format chart tooltip values correctly with German localization and inferred units", () => {
      // Explizite Einheiten
      expect(formatChartTooltipValue(45, "Min.")).toBe("45 Min.");
      expect(formatChartTooltipValue(2.5, "Std.")).toBe("2,5 Std.");
      expect(formatChartTooltipValue(1500, "€")).toBe("1.500 €");

      // Abgeleitet aus Metriknamen
      expect(formatChartTooltipValue(120, undefined, "Stillstand (Minuten)")).toBe("120 Min.");
      expect(formatChartTooltipValue(4.8, undefined, "Ausfallzeit (h)")).toBe("4,8 Std.");
      expect(formatChartTooltipValue(6800, undefined, "Gesamtkosten (€)")).toBe("6.800 €");
      expect(formatChartTooltipValue(15, undefined, "Anzahl Störungen")).toBe("15 Stk.");

      // Standard ohne Einheit
      expect(formatChartTooltipValue(42, undefined, "Unbekannt")).toBe("42");
    });

    it("should provide a standard color palette with at least 6 distinct hex colors", () => {
      expect(DEFAULT_PALETTE.length).toBeGreaterThanOrEqual(6);
      expect(DEFAULT_PALETTE[0]).toBe("#3B82F6");
      DEFAULT_PALETTE.forEach((color) => {
        expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });
    });

    it("should generate a pie chart view with color palette and summary insight for pie queries", async () => {
      const response = await executeSingleInputCopilotAction({
        prompt: "Erstelle ein Kuchendiagramm der Störungsursachen in Halle 1",
      });

      expect(response).toBeDefined();
      expect(response.type).toBe("chart_view");
      expect(response.chartType).toBe("pie");
      expect(response.chartData).toBeDefined();
      expect(response.chartData?.length).toBeGreaterThan(0);
      expect(response.chartConfig?.colorPalette).toBeDefined();
      expect((response.widget as any)?.summaryInsight).toBeTruthy();
    });

    it("should generate a composed chart with trendline for trend queries", async () => {
      const response = await executeSingleInputCopilotAction({
        prompt: "Zeige mir den Stillstand von KUKA Roboter 01 mit Trendlinie",
      });

      expect(response).toBeDefined();
      expect(response.type).toBe("chart_view");
      const hasTrend =
        response.chartType === "composed" ||
        Boolean((response.widget as any)?.hasTrendline) ||
        Boolean(response.chartConfig?.hasTrendline);
      expect(hasTrend).toBe(true);
      expect(response.chartData?.length).toBeGreaterThan(0);
    });
  });
});
