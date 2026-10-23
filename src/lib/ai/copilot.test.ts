import { describe, it, expect } from "vitest";
import { classifyCopilotIntent } from "./copilot";
import {
  classifyCopilotInputAction,
  executeSingleInputCopilotAction,
} from "@/actions/copilot-actions";

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

  describe("Symptom Intent Routing & Equipment Clarification Loop", () => {
    it("should classify 'Mein Roboter ist überhitzt' strictly as CREATE_ORDER and ask clarification", async () => {
      const result = await classifyCopilotIntent({
        prompt: "Mein Roboter ist überhitzt",
      });

      expect(result.intent).toBe("CREATE_ORDER");
      expect(result.clarification.needed).toBe(true);
      expect(result.clarification.needsClarification).toBe(true);
      expect(result.clarification.clarificationQuestion).toBe(
        "Welcher Roboter ist betroffen? Bitte wähle das Equipment aus:"
      );
      expect(result.clarification.options.length).toBeGreaterThanOrEqual(1);
      // Primitives check on options formatting: e.g. "KUKA KR 210 R2700 - Roboter 01 (Rohbau Zelle 3)"
      expect(result.clarification.options[0].label).toContain("KUKA");
      expect(result.clarification.pendingDescription).toBe("Mein Roboter ist überhitzt");
      expect(result.pendingDescription).toBe("Mein Roboter ist überhitzt");
    });

    it("should strictly route symptoms ('steht still', 'qualmt', 'verliert Druck', 'klappert', 'Fehlercode') to CREATE_ORDER", async () => {
      const symptoms = [
        "Roboter steht still",
        "Motor qualmt",
        "Pumpe verliert Druck",
        "Lager klappert laut",
        "Fehlercode 402 am Roboter",
      ];

      for (const prompt of symptoms) {
        const res = await classifyCopilotIntent({ prompt });
        expect(res.intent, `Failed for prompt: ${prompt}`).toBe("CREATE_ORDER");
      }
    });

    it("should create structured draftOrder payload after equipment is selected in clarification", async () => {
      const result = await classifyCopilotIntent({
        prompt: "KUKA KR 210 R2700 - Roboter 01",
        selectedOptionId: "eq-10001001",
        pendingDescription: "Mein Roboter ist überhitzt",
        chatHistory: [
          { role: "user", content: "Mein Roboter ist überhitzt" },
          {
            role: "assistant",
            content: "Welcher Roboter ist betroffen? Bitte wähle das Equipment aus:",
            intent: "CREATE_ORDER",
          },
        ],
      });

      expect(result.intent).toBe("CREATE_ORDER");
      expect(result.clarification.needed).toBe(false);
      expect(result.clarification.needsClarification).toBe(false);

      expect(result.draftOrder).toBeDefined();
      expect(result.draftOrder?.title).toContain("Überhitzung Roboter");
      expect(result.draftOrder?.title).toContain("KUKA KR 210 R2700 - Roboter 01");
      expect(result.draftOrder?.description).toBe("Mein Roboter ist überhitzt");
      expect(result.draftOrder?.priority).toBe("2_HIGH");
      expect(result.draftOrder?.equipmentId).toBe("eq-10001001");
      expect(result.draftOrder?.equipmentName).toContain("KUKA KR 210 R2700 - Roboter 01");
      expect(result.draftOrder?.equipmentName).toContain("Rohbau Zelle 3");
      expect(result.draftOrder?.suggestedDamageCode).toBe("MECH_TEMP");
    });

    it("should suggest MOTOR_UEBERLAST when motor is mentioned and 1_EMERGENCY when fire/smoke hazard is detected", async () => {
      const motorRes = await classifyCopilotIntent({
        prompt: "Siemens Simotics S-1FK7 Servomotor",
        selectedOptionId: "eq-10001002",
        pendingDescription: "Motor ist überhitzt und blockiert",
      });

      expect(motorRes.draftOrder?.suggestedDamageCode).toBe("MOTOR_UEBERLAST");

      const emergencyRes = await classifyCopilotIntent({
        prompt: "KUKA KR 210 R2700 - Roboter 01",
        selectedOptionId: "eq-10001001",
        pendingDescription: "Roboter ist überhitzt, qualmt stark und Brandgefahr!",
      });

      expect(emergencyRes.draftOrder?.priority).toBe("1_EMERGENCY");
    });
  });

  describe("Multi-Turn Conversation & Inline-Widget Payload Structure", () => {
    it("should accept conversationHistory and merge original problem description ('ist überhitzt') with selected chip 'KUKA KR-210'", async () => {
      const result = await classifyCopilotInputAction({
        prompt: "KUKA KR-210",
        conversationHistory: [
          { role: "user", content: "ist überhitzt" },
          {
            role: "assistant",
            content: "Welcher Roboter ist betroffen? Bitte wähle das Equipment aus:",
          },
        ],
      });

      expect(result.intent).toBe("CREATE_ORDER");
      expect(result.needsClarification).toBe(false);

      // Widget-Payload Prüfungen
      expect(result.widget).toBeDefined();
      expect(result.widget?.type).toBe("order_draft");
      expect(result.type).toBe("order_draft");

      if (result.widget?.type === "order_draft") {
        expect(result.widget.title).toContain("Überhitzung");
        expect(result.widget.title).toContain("KUKA");
        // Problembeschreibung ("ist überhitzt") mit Equipment zusammengeführt
        expect(result.widget.description).toContain("ist überhitzt");
        expect(result.widget.description).toContain("KUKA");
        expect(result.widget.priority).toBe("2_HIGH");
        expect(result.widget.equipmentId).toBe("eq-10001001");
        expect(result.widget.equipmentName).toContain("KUKA KR 210 R2700 - Roboter 01");
        expect(result.widget.functionalLocation).toBe("Rohbau Zelle 3");
        expect(result.widget.suggestedDamageCode).toBe("MECH_TEMP");
      }
    });

    it("should merge original problem description ('ist überhitzt') when user types follow-up 'der in Zelle 1'", async () => {
      const result = await classifyCopilotInputAction({
        prompt: "der in Zelle 1",
        conversationHistory: [
          { role: "user", content: "ist überhitzt" },
          {
            role: "assistant",
            content: "Welcher Roboter ist betroffen? Bitte wähle das Equipment aus:",
          },
        ],
      });

      expect(result.intent).toBe("CREATE_ORDER");
      expect(result.needsClarification).toBe(false);

      expect(result.widget).toBeDefined();
      expect(result.widget?.type).toBe("order_draft");
      expect(result.type).toBe("order_draft");

      if (result.widget?.type === "order_draft") {
        expect(result.widget.title).toContain("Überhitzung");
        expect(result.widget.description).toContain("ist überhitzt");
        expect(result.widget.equipmentId).toBeDefined();
        expect(result.widget.priority).toBe("2_HIGH");
        expect(result.widget.suggestedDamageCode).toBe("MECH_TEMP");
      }
    });

    it("should return type: 'order_draft' in executeSingleInputCopilotAction when CREATE_ORDER has complete info", async () => {
      const result = await executeSingleInputCopilotAction({
        prompt: "KUKA KR-210",
        conversationHistory: [
          { role: "user", content: "ist überhitzt" },
          {
            role: "assistant",
            content: "Welcher Roboter ist betroffen? Bitte wähle das Equipment aus:",
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.type).toBe("order_draft");
      expect(result.widget).toBeDefined();
      expect(result.widget?.type).toBe("order_draft");

      if (result.widget?.type === "order_draft") {
        expect(result.widget.title).toBeDefined();
        expect(result.widget.description).toContain("ist überhitzt");
        expect(result.widget.priority).toBe("2_HIGH");
        expect(result.widget.equipmentId).toBe("eq-10001001");
        expect(result.widget.equipmentName).toBeDefined();
        expect(result.widget.functionalLocation).toBeDefined();
        expect(result.widget.suggestedDamageCode).toBe("MECH_TEMP");
      }
    });

    it("should return type: 'chart_view' with Recharts configuration data when intent is ANALYTICS_CHART", async () => {
      const result = await executeSingleInputCopilotAction({
        prompt: "Zeige mir ein Balkendiagramm der Ausfallzeiten der letzten 4 Wochen",
      });

      expect(result.success).toBe(true);
      expect(result.type).toBe("chart_view");
      expect(result.widget).toBeDefined();
      expect(result.widget?.type).toBe("chart_view");

      if (result.widget?.type === "chart_view") {
        expect(["bar", "line", "pie", "table"]).toContain(result.widget.chartType);
        expect(result.widget.title).toBeDefined();
        expect(typeof result.widget.title).toBe("string");
        expect(result.widget.chartData).toBeInstanceOf(Array);
        expect(result.widget.data).toBeInstanceOf(Array);
        expect(result.widget.xAxisKey).toBeDefined();
        expect(typeof result.widget.xAxisKey).toBe("string");
        expect(result.widget.series).toBeInstanceOf(Array);
        expect(result.widget.series!.length).toBeGreaterThanOrEqual(1);
        expect(result.widget.series![0]).toHaveProperty("key");
        expect(result.widget.series![0]).toHaveProperty("label");
        expect(result.widget.series![0]).toHaveProperty("color");
        expect(result.widget.summary).toBeDefined();
        expect(typeof result.widget.summary).toBe("string");
        expect(result.widget.config).toBeDefined();
        expect(result.widget.config.chartType).toBe(result.widget.chartType);
        expect(result.widget.config.colors).toBeInstanceOf(Array);
      }
    });

    it("should trigger clarification loop with options having field 'general' when diagram prompt needs clarification", async () => {
      const result = await executeSingleInputCopilotAction({
        prompt: "Zeige mir ein Diagramm wie der KUKA Roboter letzte Woche stand",
      });

      expect(result.needsClarification).toBe(true);
      expect(result.clarificationQuestion).toBeDefined();
      expect(typeof result.clarificationQuestion).toBe("string");
      expect(result.clarificationOptions).toBeInstanceOf(Array);
      expect(result.clarificationOptions!.length).toBeGreaterThan(0);

      result.clarificationOptions!.forEach((option) => {
        expect(option).toHaveProperty("id");
        expect(option).toHaveProperty("label");
        expect(option).toHaveProperty("value");
        expect(option.field).toBe("general");
      });
    });

    it("should return chart_view when following up with a selected clarification option for diagram query", async () => {
      const result = await executeSingleInputCopilotAction({
        prompt: "KUKA Roboter 01 - Rohbau Zelle 3 (Ganze letzte Woche Mo-So)",
        conversationHistory: [
          {
            role: "user",
            content: "Zeige mir ein Diagramm wie der KUKA Roboter letzte Woche stand",
          },
          {
            role: "assistant",
            content:
              "Welchen KUKA-Roboter meinst du genau? (Verfügbar: KUKA Roboter 01 - Rohbau Zelle 3, KUKA Palettierer - Linie 2). Und welcher Zeitraum der letzten Woche soll ausgewertet werden?",
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(result.type).toBe("chart_view");
      expect(result.widget).toBeDefined();
      expect(result.widget?.type).toBe("chart_view");

      if (result.widget?.type === "chart_view") {
        expect(result.widget.title).toContain("KUKA Roboter 01");
        expect(result.widget.chartData).toBeInstanceOf(Array);
        expect(result.widget.chartData!.length).toBeGreaterThan(0);
        expect(result.widget.xAxisKey).toBe("tag");
        expect(result.widget.series).toBeInstanceOf(Array);
        expect(result.widget.series!.length).toBeGreaterThanOrEqual(1);
        expect(result.widget.series![0].color).toBeDefined();
        expect(result.widget.summary).toBeDefined();
        expect(result.widget.rawSql).toBeDefined();
      }
    });

    it("should return safe and valid structures without runtime exceptions on fallback/offline state", async () => {
      const result = await executeSingleInputCopilotAction({
        prompt: "",
      });

      expect(result).toBeDefined();
      expect(typeof result.success).toBe("boolean");
      expect(result.data).toBeDefined();
      expect(result.classification).toBeDefined();
      expect(result.clarificationOptions).toBeInstanceOf(Array);
    });

    it("should return type: 'table_view' with filtered orders when intent is QUERY_ORDERS", async () => {
      const result = await executeSingleInputCopilotAction({
        prompt: "Welche offenen Störungen in Bereich Rohbau stehen an?",
      });

      expect(result.success).toBe(true);
      expect(result.type).toBe("table_view");
      expect(result.widget).toBeDefined();
      expect(result.widget?.type).toBe("table_view");

      if (result.widget?.type === "table_view") {
        expect(result.widget.orders).toBeInstanceOf(Array);
        expect(typeof result.widget.totalFound).toBe("number");
        expect(result.widget.filters).toBeDefined();
      }
    });
  });
});
