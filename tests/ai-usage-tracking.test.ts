import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../src/db";
import { aiUsageLogs, tenants } from "../src/db/schema";
import { eq } from "drizzle-orm";
import {
  getAiUsageSummaryAction,
  logAiUsageAction,
} from "../src/actions/ai-usage-actions";
import {
  calculateModelCostEur,
  getModelTariffEur,
  MODEL_TARIFFS_EUR,
} from "../src/lib/ai/tariffs";

describe("AI Token- & Kosten-Tracking Persistenz und Summary Action", () => {
  let testTenantId: string;

  beforeEach(async () => {
    // Vorhandenen Mandanten ermitteln oder anlegen
    const existing = await db.query.tenants.findFirst();
    if (existing) {
      testTenantId = existing.id;
    } else {
      const [inserted] = await db
        .insert(tenants)
        .values({
          code: "TEST-TENANT-AI",
          name: "Test Tenant für KI-Tracking",
          sapSyncMode: "STANDALONE",
        })
        .returning();
      testTenantId = inserted.id;
    }

    // Für saubere Testdaten alle bisherigen Usage Logs des Test-Mandanten bereinigen
    await db.delete(aiUsageLogs).where(eq(aiUsageLogs.tenantId, testTenantId));
  });

  describe("1. Modell-Tarife & Kostenberechnung", () => {
    it("sollte korrekte Tarife für bekannte Modelle (Gemini, OpenAI, Ollama) zurückgeben", () => {
      const geminiFlash = getModelTariffEur("gemini-3.8-flash", "gemini");
      expect(geminiFlash.promptCostPer1M).toBe(0.10);
      expect(geminiFlash.completionCostPer1M).toBe(0.40);

      const geminiPro = getModelTariffEur("gemini-2.5-pro", "gemini");
      expect(geminiPro.promptCostPer1M).toBe(1.25);
      expect(geminiPro.completionCostPer1M).toBe(5.00);

      const gpt4o = getModelTariffEur("gpt-4o", "openai");
      expect(gpt4o.promptCostPer1M).toBe(2.30);
      expect(gpt4o.completionCostPer1M).toBe(9.20);

      const ollama = getModelTariffEur("llama3.3:70b", "ollama");
      expect(ollama.promptCostPer1M).toBe(0.0);
      expect(ollama.completionCostPer1M).toBe(0.0);
    });

    it("sollte On-Premise / Lokale Provider pauschal mit 0,00 € bewerten", () => {
      const cost = calculateModelCostEur("any-custom-model", 50000, 10000, "ollama");
      expect(cost).toBe(0);
    });

    it("sollte Cloud-Tokens präzise in EUR berechnen", () => {
      // gemini-3.8-flash: 1.000.000 Prompt = 0.10 €, 500.000 Completion = 0.20 € => Gesamt 0.30 €
      const cost = calculateModelCostEur("gemini-3.8-flash", 1_000_000, 500_000, "gemini");
      expect(cost).toBeCloseTo(0.30, 4);
    });
  });

  describe("2. Server Action logAiUsageAction()", () => {
    it("sollte einen KI-Aufruf erfolgreich in die Tabelle ai_usage_logs persistieren", async () => {
      const result = await logAiUsageAction({
        tenantId: testTenantId,
        provider: "gemini",
        model: "gemini-3.8-flash",
        taskType: "ROUTING",
        promptTokens: 250,
        completionTokens: 80,
        latencyMs: 145,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (!result.data) return;

      expect(result.data.tenantId).toBe(testTenantId);
      expect(result.data.provider).toBe("gemini");
      expect(result.data.model).toBe("gemini-3.8-flash");
      expect(result.data.taskType).toBe("ROUTING");
      expect(result.data.promptTokens).toBe(250);
      expect(result.data.completionTokens).toBe(80);
      expect(result.data.totalTokens).toBe(330);
      expect(result.data.latencyMs).toBe(145);
      expect(Number(result.data.estimatedCostEur)).toBeGreaterThanOrEqual(0);
    });
  });

  describe("3. Server Action getAiUsageSummaryAction()", () => {
    it("sollte eine leere Zusammenfassung mit Null-Werten liefern, wenn keine Logs vorliegen", async () => {
      const res = await getAiUsageSummaryAction(testTenantId);
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      if (!res.data) return;

      expect(res.data.totalCalls).toBe(0);
      expect(res.data.promptTokens).toBe(0);
      expect(res.data.completionTokens).toBe(0);
      expect(res.data.totalTokens).toBe(0);
      expect(res.data.totalCostEur).toBe(0);
      expect(res.data.averageLatencyMs).toBe(0);
      expect(res.data.byTaskType.ROUTING.callCount).toBe(0);
      expect(res.data.byTaskType.ANALYTICS.callCount).toBe(0);
      expect(res.data.byTaskType.RAG_SYNTHESIS.callCount).toBe(0);
    });

    it("sollte Monatsdaten korrekt aggregieren (Tokens, Kosten, Latenz, Task-Typen)", async () => {
      // 1. ROUTING Aufruf mit gemini-3.8-flash
      await logAiUsageAction({
        tenantId: testTenantId,
        provider: "gemini",
        model: "gemini-3.8-flash",
        taskType: "ROUTING",
        promptTokens: 1000,
        completionTokens: 200,
        latencyMs: 100,
      });

      // 2. ANALYTICS Aufruf mit gemini-2.5-pro
      await logAiUsageAction({
        tenantId: testTenantId,
        provider: "gemini",
        model: "gemini-2.5-pro",
        taskType: "ANALYTICS",
        promptTokens: 4000,
        completionTokens: 1000,
        latencyMs: 500,
      });

      // 3. RAG_SYNTHESIS Aufruf mit openai gpt-4o
      await logAiUsageAction({
        tenantId: testTenantId,
        provider: "openai",
        model: "gpt-4o",
        taskType: "RAG_SYNTHESIS",
        promptTokens: 2000,
        completionTokens: 500,
        latencyMs: 300,
      });

      const res = await getAiUsageSummaryAction(testTenantId);
      expect(res.success).toBe(true);
      expect(res.data).toBeDefined();
      if (!res.data) return;

      const summary = res.data;

      // Gesamtzahlen
      expect(summary.totalCalls).toBe(3);
      expect(summary.promptTokens).toBe(1000 + 4000 + 2000); // 7000
      expect(summary.completionTokens).toBe(200 + 1000 + 500); // 1700
      expect(summary.totalTokens).toBe(7000 + 1700); // 8700
      expect(summary.averageLatencyMs).toBe(Math.round((100 + 500 + 300) / 3)); // 300ms
      expect(summary.totalCostEur).toBeGreaterThan(0);

      // Task-Typ Aufteilung (Routing vs. Analytics vs. RAG)
      expect(summary.byTaskType.ROUTING.callCount).toBe(1);
      expect(summary.byTaskType.ROUTING.promptTokens).toBe(1000);
      expect(summary.byTaskType.ROUTING.completionTokens).toBe(200);
      expect(summary.byTaskType.ROUTING.totalTokens).toBe(1200);
      expect(summary.byTaskType.ROUTING.averageLatencyMs).toBe(100);

      expect(summary.byTaskType.ANALYTICS.callCount).toBe(1);
      expect(summary.byTaskType.ANALYTICS.promptTokens).toBe(4000);
      expect(summary.byTaskType.ANALYTICS.completionTokens).toBe(1000);
      expect(summary.byTaskType.ANALYTICS.totalTokens).toBe(5000);
      expect(summary.byTaskType.ANALYTICS.averageLatencyMs).toBe(500);

      expect(summary.byTaskType.RAG_SYNTHESIS.callCount).toBe(1);
      expect(summary.byTaskType.RAG_SYNTHESIS.promptTokens).toBe(2000);
      expect(summary.byTaskType.RAG_SYNTHESIS.completionTokens).toBe(500);
      expect(summary.byTaskType.RAG_SYNTHESIS.totalTokens).toBe(2500);
      expect(summary.byTaskType.RAG_SYNTHESIS.averageLatencyMs).toBe(300);

      // Provider-Aufteilung
      expect(summary.byProvider.gemini.callCount).toBe(2);
      expect(summary.byProvider.openai.callCount).toBe(1);

      // Modell-Aufteilung
      expect(summary.byModel["gemini-3.8-flash"].callCount).toBe(1);
      expect(summary.byModel["gemini-2.5-pro"].callCount).toBe(1);
      expect(summary.byModel["gpt-4o"].callCount).toBe(1);
    });
  });
});
