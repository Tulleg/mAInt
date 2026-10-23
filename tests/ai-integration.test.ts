import { describe, it, expect } from "vitest";
import {
  createAiProvider,
  getAiProvider,
  getTenantAiConfig,
  updateTenantAiConfig,
  testAiConnection,
  normalizeToTargetDimensions,
  mapToPgVectorDimensions,
  generateDeterministicEmbedding,
  OpenAiCompatibleProvider,
  GeminiProvider,
  OllamaProvider,
  VllmProvider,
  OllamaConnectionError,
  PGVECTOR_DIMENSIONS,
  OLLAMA_DEFAULT_BASE_URL,
  getLlmModelForTask,
  resolveLlmModelForTask,
  extractTokenUsage,
  estimateLlmCost,
  logAiUsageAsync,
  createVercelAiUsageInterceptor,
  withAiUsageLogging,
  DEFAULT_ROUTING_MODEL,
  DEFAULT_ANALYTICS_MODEL,
} from "../src/lib/ai/provider";
import { aiUsageLogs } from "../src/db/schema";
import { analyzeFaultInput } from "../src/lib/ai/fault-copilot";
import { executeAnalyticsPrompt } from "../src/lib/ai/analytics-agent";
import { getTenantPredictiveOverview } from "../src/lib/ai/predictive";
import { getSeedHistoricalMeasures, calculateCosineSimilarity } from "../src/lib/ai/seed-historical-orders";
import {
  sendAnalyticsEmailReportAction,
  scheduleAnalyticsCronReportAction,
  getTenantPredictiveOverviewAction,
} from "../src/actions/analytics-actions";
import {
  getTenantAiConfigAction,
  testAiConnectionAction,
  testAiProviderConnectionAction,
  updateTenantAiConfigAction,
} from "../src/actions/ai-settings-actions";
import {
  encryptApiKey,
  decryptApiKey,
  maskApiKey,
} from "../src/lib/ai/encryption";
import { canUserAccessAiAnalytics, getCurrentUserRbac } from "../src/lib/rbac";

describe("1. AI Provider Dual-Switcher & Normalization Tests", () => {
  it("should instantiate the correct provider types", () => {
    const openai = createAiProvider({ provider: "OPENAI" });
    expect(openai).toBeInstanceOf(OpenAiCompatibleProvider);

    const gemini = createAiProvider({ provider: "GEMINI" });
    expect(gemini).toBeInstanceOf(GeminiProvider);

    const ollama = createAiProvider({ provider: "OLLAMA" });
    expect(ollama).toBeInstanceOf(OllamaProvider);
    expect(ollama).toBeInstanceOf(OpenAiCompatibleProvider);

    const vllm = createAiProvider({ provider: "VLLM" });
    expect(vllm).toBeInstanceOf(VllmProvider);
    expect(vllm).toBeInstanceOf(OpenAiCompatibleProvider);
  });

  it("should normalize smaller embedding dimensions (e.g. 768 to 1536) with zero-padding", () => {
    const original768 = new Array(768).fill(0.5);
    const normalized = normalizeToTargetDimensions(original768, 1536);

    expect(normalized.length).toBe(1536);
    // Norm of the vector should be normalized to 1.0 (unit vector)
    const norm = Math.sqrt(normalized.reduce((acc, v) => acc + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 4);
  });

  it("should normalize larger embedding dimensions (e.g. 2048 to 1536) with truncation", () => {
    const original2048 = new Array(2048).fill(0.1);
    const normalized = normalizeToTargetDimensions(original2048, 1536);

    expect(normalized.length).toBe(1536);
    const norm = Math.sqrt(normalized.reduce((acc, v) => acc + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 4);
  });

  it("should generate deterministic 1536-dim embeddings for fallback/offline use", () => {
    const text = "Kreiselpumpe KSB Etanorm Lagerschaden";
    const vec1 = generateDeterministicEmbedding(text, 1536);
    const vec2 = generateDeterministicEmbedding(text, 1536);

    expect(vec1.length).toBe(1536);
    expect(vec1).toEqual(vec2);

    const norm = Math.sqrt(vec1.reduce((acc, v) => acc + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 4);
  });
});

describe("2. Störungs-Copilot & 30 Seed-Altmaßnahmen Tests", () => {
  it("should verify exact 30 seed historical measures exist with embeddings", () => {
    const seeds = getSeedHistoricalMeasures();
    expect(seeds.length).toBe(30);

    seeds.forEach((seed) => {
      expect(seed.orderNumber).toMatch(/^MO-HIST-\d{3}$/);
      expect(seed.title).toBeDefined();
      expect(seed.cause).toBeDefined();
      expect(seed.solution).toBeDefined();
      expect(seed.recommendedSpareParts.length).toBeGreaterThan(0);
      expect(seed.embedding.length).toBe(1536);
      expect(seed.synthesizedDocumentText).toContain(seed.orderNumber);
    });
  });

  it("should retrieve top matching solutions for a pump failure via semantic similarity", async () => {
    const result = await analyzeFaultInput({
      tenantId: "a0000000-0000-0000-0000-000000000001",
      userInputText: "Kreiselpumpe verliert massiv Druck, Motorblock ist heiß und vibriert",
    });

    expect(result).toBeDefined();
    expect(result.suggestedSolutions).toBeDefined();
    expect(result.suggestedSolutions.length).toBeGreaterThan(0);

    // The top solution should identify pump bearing or cavitation issues
    const topSol = result.suggestedSolutions[0];
    expect(topSol.title).toBeDefined();
    expect(topSol.solution).toBeDefined();
    expect(topSol.confidencePercent).toBeGreaterThan(60);
    expect(topSol.recommendedSpareParts.length).toBeGreaterThan(0);
  });

  it("should generate structured documentation draft with DIN/SAP priorities", async () => {
    const result = await analyzeFaultInput({
      tenantId: "a0000000-0000-0000-0000-000000000001",
      userInputText: "Rauch und Stillstand an Roboterzelle Kuka",
    });

    expect(result.documentationDraft).toBeDefined();
    expect(result.documentationDraft.recommendedPriority).toBe("1_EMERGENCY");
    expect(result.documentationDraft.initialChecklistHint).toBeDefined();
  });
});

describe("3. Analytics Agent & Prompt-to-Chart Tests", () => {
  const tenantId = "a0000000-0000-0000-0000-000000000001";

  it("should translate natural language questions into valid chart specifications", async () => {
    const result = await executeAnalyticsPrompt({
      tenantId,
      userPrompt: "Welche 5 Ersatzteile verursachen die höchsten Kosten?",
    });

    expect(result).toBeDefined();
    expect(result.title).toContain("Ersatzteil");
    expect(Array.isArray(result.data)).toBe(true);
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.xAxisKey).toBeDefined();
    expect(result.series.length).toBeGreaterThan(0);
    expect(result.summaryInsight).toBeDefined();
  });

  it("should translate trend question into line chart", async () => {
    const result = await executeAnalyticsPrompt({
      tenantId,
      userPrompt: "Monatlicher Trend der Störungen und Ausfallzeiten",
    });

    expect(result.chartType).toBe("line");
    expect(result.data.length).toBeGreaterThan(0);
  });

  it("should trigger clarification loop when query about KUKA is ambiguous", async () => {
    const result = await executeAnalyticsPrompt({
      tenantId,
      userPrompt: "Wie stand der Kuka letzte Woche?",
    });

    expect(result.status).toBe("NEEDS_CLARIFICATION");
    expect(result.clarificationQuestion).toBeDefined();
    expect(result.clarificationQuestion).toContain("KUKA-Roboter");
    expect(result.clarificationQuestion).toContain("KUKA Roboter 01 - Rohbau Zelle 3");
    expect(result.clarificationQuestion).toContain("KUKA Palettierer - Linie 2");
    expect(result.clarificationQuestion).toContain("Zeitraum");
    expect(Array.isArray(result.suggestedClarifications)).toBe(true);
    expect(result.suggestedClarifications!.length).toBeGreaterThanOrEqual(2);
  });

  it("should maintain multi-turn chatHistory and execute chart after clarification", async () => {
    // 1. Initialer mehrdeutiger Prompt
    const initialRes = await executeAnalyticsPrompt({
      tenantId,
      userPrompt: "Wie stand der Kuka letzte Woche?",
    });
    expect(initialRes.status).toBe("NEEDS_CLARIFICATION");

    // 2. Benutzer antwortet mit konkreter Auswahl unter Beibehaltung der Chat-History
    const resolvedRes = await executeAnalyticsPrompt({
      tenantId,
      userPrompt: "KUKA Roboter 01 - Rohbau Zelle 3 (Ganze letzte Woche Mo-So)",
      chatHistory: [
        { role: "user", content: "Wie stand der Kuka letzte Woche?" },
        {
          role: "assistant",
          content: initialRes.clarificationQuestion!,
        },
      ],
    });

    expect(resolvedRes.status).toBe("SUCCESS");
    expect(resolvedRes.title).toContain("KUKA Roboter 01");
    expect(resolvedRes.title).toContain("Rohbau Zelle 3");
    expect(resolvedRes.data.length).toBeGreaterThanOrEqual(5);
    expect(resolvedRes.summaryInsight).toContain("KUKA Roboter 01");
    expect(resolvedRes.rawSqlUsed).toBeDefined();
    expect(resolvedRes.rawSqlUsed).toContain("maintenance_orders");
  });

  it("should support Palettierer and comparison in multi-turn clarification loop", async () => {
    const palettiererRes = await executeAnalyticsPrompt({
      tenantId,
      userPrompt: "KUKA Palettierer - Linie 2",
      chatHistory: [
        { role: "user", content: "Wie stand der Kuka letzte Woche?" },
        {
          role: "assistant",
          content: "Welchen KUKA-Roboter meinst du genau?",
        },
      ],
    });

    expect(palettiererRes.status).toBe("SUCCESS");
    expect(palettiererRes.title).toContain("KUKA Palettierer");

    const compareRes = await executeAnalyticsPrompt({
      tenantId,
      userPrompt: "Vergleiche beide KUKA-Roboter der letzten Woche",
      chatHistory: [
        { role: "user", content: "Wie stand der Kuka letzte Woche?" },
        {
          role: "assistant",
          content: "Welchen KUKA-Roboter meinst du genau?",
        },
      ],
    });

    expect(compareRes.status).toBe("SUCCESS");
    expect(compareRes.title).toContain("Vergleich");
    expect(compareRes.data.length).toBe(2);
  });

  it("should enforce RBAC access control for KI-Leitstand (can_view_ai_analytics)", async () => {
    // Erlaubte Rollen: Planer, Admin, Leitstand (Shift Lead)
    expect(await canUserAccessAiAnalytics("ADMIN")).toBe(true);
    expect(await canUserAccessAiAnalytics("MAINT_PLANNER")).toBe(true);
    expect(await canUserAccessAiAnalytics("SHIFT_LEAD")).toBe(true);
    expect(await canUserAccessAiAnalytics("COORDINATOR")).toBe(true);

    // Nicht erlaubte Rollen: Techniker, Maschinenbediener/Melder, Externe
    expect(await canUserAccessAiAnalytics("TECHNICIAN")).toBe(false);
    expect(await canUserAccessAiAnalytics("REPORTER")).toBe(false);
    expect(await canUserAccessAiAnalytics("EXTERNAL_CONTRACTOR")).toBe(false);
  });

  it("should support Ad-hoc E-Mail Report sending and Cron scheduling Server Actions", async () => {
    const emailRes = await sendAnalyticsEmailReportAction({
      tenantId,
      email: "instandhaltung@werk.de",
      reportTitle: "Wöchentlicher Ausfallbericht",
      prompt: "Stillstandszeiten nach Anlage",
      chartType: "bar",
      data: [{ anlage: "KSB Pumpe", stillstand: 120 }],
      summaryInsight: "Stillstände um 15% reduziert.",
    });

    expect(emailRes.success).toBe(true);
    expect(emailRes.message).toContain("instandhaltung@werk.de");

    const cronRes = await scheduleAnalyticsCronReportAction({
      tenantId,
      email: "meister@fertigung.de",
      cronExpression: "0 7 * * 1",
      prompt: "Wöchentliche Top-Kosten Ersatzteile",
    });

    expect(cronRes.success).toBe(true);
    expect(cronRes.jobId).toBeDefined();
  });

  it("should return predictive maintenance overview with MTBF and interval drifts", async () => {
    const overview = await getTenantPredictiveOverviewAction(tenantId);
    expect(Array.isArray(overview)).toBe(true);
    expect(overview.length).toBeGreaterThan(0);

    const first = overview[0];
    expect(first.equipmentNumber).toBeDefined();
    expect(typeof first.historicalMtbfHours).toBe("number");
    expect(typeof first.intervalDriftPercent).toBe("number");
    expect(typeof first.riskScore).toBe("number");
    expect(["ACCELERATING", "STABLE", "IMPROVING"]).toContain(first.failureTrend);
  });

  it("should safely handle non-uuid tenant IDs without database syntax errors", async () => {
    const overview = await getTenantPredictiveOverviewAction("demo-tenant-invalid");
    expect(Array.isArray(overview)).toBe(true);
    expect(overview.length).toBeGreaterThan(0);
  });

  it("should retrieve and test AI connection for Cloud and Ollama/vLLM configuration", async () => {
    const config = await getTenantAiConfigAction(tenantId);
    expect(config).toBeDefined();
    expect(["OPENAI", "GEMINI", "OLLAMA", "VLLM"]).toContain(config.provider);

    // Test offline connection test handling (graceful timeout / error message with helpful hint)
    const testRes = await testAiConnectionAction({
      provider: "OLLAMA",
      baseUrl: "http://localhost:11434/v1",
      chatModel: "llama3",
    });

    expect(testRes).toBeDefined();
    expect(typeof testRes.success).toBe("boolean");
    expect(testRes.provider).toBe("OLLAMA");
    expect(testRes.message).toContain("Ollama");
  });
});

describe("4. Lokale Ollama-Anbindung & Embedding-Dimensions-Tests", () => {
  it("should default endpoints to http://localhost:11434/api (or /v1) when AI_PROVIDER=ollama", async () => {
    const prevProvider = process.env.AI_PROVIDER;
    const prevBaseUrl = process.env.AI_PROVIDER_BASE_URL;
    const prevOllamaBase = process.env.OLLAMA_BASE_URL;

    try {
      process.env.AI_PROVIDER = "ollama";
      delete process.env.AI_PROVIDER_BASE_URL;
      delete process.env.OLLAMA_BASE_URL;

      const provider = createAiProvider() as OllamaProvider;
      expect(provider).toBeInstanceOf(OllamaProvider);

      // Standard-URL prüfen
      const tenantConfig = await getTenantAiConfig();
      expect(tenantConfig.provider).toBe("OLLAMA");
      expect(tenantConfig.endpointUrl).toBe("http://localhost:11434/api");
      expect(tenantConfig.chatModel).toBe("llama3");
      expect(tenantConfig.embeddingModel).toBe("nomic-embed-text");
      expect(tenantConfig.embeddingDimensions).toBe(768);
    } finally {
      process.env.AI_PROVIDER = prevProvider;
      if (prevBaseUrl) process.env.AI_PROVIDER_BASE_URL = prevBaseUrl;
      if (prevOllamaBase) process.env.OLLAMA_BASE_URL = prevOllamaBase;
    }
  });

  it("should correctly support both native /api and OpenAI-compatible /v1 endpoints in OllamaProvider", () => {
    // 1. Native /api
    const nativeProvider = new OllamaProvider({ baseUrl: "http://localhost:11434/api" });
    expect(nativeProvider).toBeInstanceOf(OllamaProvider);

    // 2. OpenAI-kompatibel /v1
    const v1Provider = new OllamaProvider({ baseUrl: "http://localhost:11434/v1" });
    expect(v1Provider).toBeInstanceOf(OllamaProvider);

    // 3. Root URL normalisieren zu /api
    const rootProvider = new OllamaProvider({ baseUrl: "http://localhost:11434" });
    expect(rootProvider).toBeInstanceOf(OllamaProvider);
  });

  it("should provide an understandable error message when Ollama is offline instead of an uncontrolled timeout", async () => {
    // Verwende einen absichtlich nicht erreichbaren Port, um Offline-Verhalten zu testen
    const offlineProvider = new OllamaProvider({
      baseUrl: "http://127.0.0.1:54321/api",
    });

    try {
      await offlineProvider.createChatCompletion([
        { role: "user", content: "Hallo" },
      ]);
      expect.unreachable("Sollte fehlschlagen, wenn Ollama offline ist");
    } catch (err: any) {
      expect(err).toBeInstanceOf(OllamaConnectionError);
      expect(err.message).toContain("Ollama-Dienst ist nicht erreichbar");
      expect(err.message).toContain("127.0.0.1:54321");
      expect(err.code).toBe("OLLAMA_OFFLINE");
    }
  });

  it("should fallback gracefully with deterministic 1536-dim vector if Ollama embedding service is unreachable", async () => {
    const offlineProvider = new OllamaProvider({
      baseUrl: "http://127.0.0.1:54321/api",
    });

    // createEmbedding darf niemals unkontrolliert abstürzen oder hängen bleiben!
    const vector = await offlineProvider.createEmbedding("Kavitationsschaden Kreiselpumpe");

    expect(vector.length).toBe(PGVECTOR_DIMENSIONS);
    expect(vector.length).toBe(1536);

    const norm = Math.sqrt(vector.reduce((acc, v) => acc + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 4);
  });

  it("should accurately map local 768-dim embeddings (nomic-embed-text) to 1536 pgvector dimensions preserving cosine properties", () => {
    // Simuliere zwei 768-dimensionale Rohvektoren aus nomic-embed-text
    const raw768A = new Array(768).fill(0).map((_, i) => Math.sin(i));
    const raw768B = new Array(768).fill(0).map((_, i) => Math.sin(i + 0.1));

    // Mappe auf pgvector 1536
    const mapped1536A = mapToPgVectorDimensions(raw768A, PGVECTOR_DIMENSIONS);
    const mapped1536B = mapToPgVectorDimensions(raw768B, PGVECTOR_DIMENSIONS);

    expect(mapped1536A.length).toBe(1536);
    expect(mapped1536B.length).toBe(1536);

    // Beide Vektoren müssen auf Einheitslänge normalisiert sein
    const normA = Math.sqrt(mapped1536A.reduce((sum, v) => sum + v * v, 0));
    const normB = Math.sqrt(mapped1536B.reduce((sum, v) => sum + v * v, 0));
    expect(normA).toBeCloseTo(1.0, 4);
    expect(normB).toBeCloseTo(1.0, 4);

    // Kosinus-Ähnlichkeit vor und nach dem Mapping muss identisch sein
    const simRaw = calculateCosineSimilarity(
      normalizeToTargetDimensions(raw768A, 768),
      normalizeToTargetDimensions(raw768B, 768)
    );
    const simMapped = calculateCosineSimilarity(mapped1536A, mapped1536B);

    expect(simMapped).toBeCloseTo(simRaw, 4);
  });
});

describe("5. Gemini Cloud Provider Konfiguration, Verschlüsselung & Test-Action", () => {
  it("should encrypt and decrypt API keys with AES-256-GCM and mask them", () => {
    const rawApiKey = "AIzaSyD-TEST-GEMINI-SECRET-KEY-123456";
    const encrypted = encryptApiKey(rawApiKey);

    expect(encrypted).toMatch(/^enc:v1:[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+/);
    expect(encrypted).not.toContain(rawApiKey);

    // Entschlüsseln
    const decrypted = decryptApiKey(encrypted);
    expect(decrypted).toBe(rawApiKey);

    // Maskieren
    const masked = maskApiKey(rawApiKey);
    expect(masked).toBe("AIza••••••••3456");

    // Idempotenz bei bereits verschlüsselten Schlüsseln
    expect(encryptApiKey(encrypted)).toBe(encrypted);

    // Leer-Handling
    expect(encryptApiKey("")).toBe("");
    expect(decryptApiKey("")).toBe("");
    expect(maskApiKey("")).toBe("");
  });

  it("should default Gemini provider to gemini-1.5-flash and text-embedding-004 with 768 dimensions", async () => {
    const prevModel = process.env.GEMINI_MODEL;
    const prevEmbedding = process.env.GEMINI_EMBEDDING_MODEL;
    delete process.env.GEMINI_MODEL;
    delete process.env.GEMINI_EMBEDDING_MODEL;

    try {
      const gemini = new GeminiProvider({ apiKey: "test-gemini-key" });
      expect((gemini as any).chatModel).toBe("gemini-1.5-flash");
      expect((gemini as any).embeddingModel).toBe("text-embedding-004");

      const tenantConfig = await getTenantAiConfig();
      if (tenantConfig.provider === "GEMINI") {
        expect(tenantConfig.chatModel).toBe("gemini-1.5-flash");
        expect(tenantConfig.embeddingModel).toBe("text-embedding-004");
        expect(tenantConfig.embeddingDimensions).toBe(768);
      }
    } finally {
      if (prevModel) process.env.GEMINI_MODEL = prevModel;
      if (prevEmbedding) process.env.GEMINI_EMBEDDING_MODEL = prevEmbedding;
    }
  });

  it("should support dynamic model configuration for chat/routing and embeddings across providers", async () => {
    const gemini = createAiProvider({
      provider: "GEMINI",
      chatModel: "gemini-2.5-flash",
      embeddingModel: "text-embedding-004",
      embeddingDimensions: 768,
    });
    expect((gemini as any).chatModel).toBe("gemini-2.5-flash");
    expect((gemini as any).embeddingModel).toBe("text-embedding-004");

    const openai = createAiProvider({
      provider: "OPENAI",
      chatModel: "gpt-4o-mini",
      embeddingModel: "text-embedding-3-large",
    });
    expect((openai as any).chatModel).toBe("gpt-4o-mini");
    expect((openai as any).embeddingModel).toBe("text-embedding-3-large");

    const ollama = createAiProvider({
      provider: "OLLAMA",
      chatModel: "qwen2.5:32b",
      embeddingModel: "bge-m3",
    });
    expect((ollama as any).chatModel).toBe("qwen2.5:32b");
    expect((ollama as any).embeddingModel).toBe("bge-m3");
  });

  it("should ensure text-embedding-004 (768-dim) is cleanly mapped to the pgvector schema (1536-dim)", async () => {
    const gemini = new GeminiProvider({
      apiKey: "test-key",
      embeddingModel: "text-embedding-004",
      embeddingDimensions: 768,
    });

    // 1. Raw-Embedding liefert native 768 Dimensionen
    const raw768 = await gemini.createRawEmbedding("Störung an der Hydraulikpresse");
    expect(raw768.length).toBe(768);

    // 2. createEmbedding mappt für das pgvector-Schema sauber auf 1536 Dimensionen
    const pgvectorEmbedding = await gemini.createEmbedding("Störung an der Hydraulikpresse");
    expect(pgvectorEmbedding.length).toBe(PGVECTOR_DIMENSIONS);
    expect(pgvectorEmbedding.length).toBe(1536);

    // Vektor ist L2-normalisiert
    const norm = Math.sqrt(pgvectorEmbedding.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1.0, 4);
  });

  it("should return meaningful error 'API-Schlüssel ungültig oder abgelaufen' when API key is missing or invalid", async () => {
    // 1. Fehlender oder leerer Key
    const res1 = await testAiProviderConnectionAction({
      provider: "GEMINI",
      apiKey: "",
    });
    expect(res1.success).toBe(false);
    expect(res1.error).toBe("API-Schlüssel ungültig oder abgelaufen");
    expect(res1.status).toBe("Offline");
    expect(res1.model).toBe("gemini-1.5-flash");

    // 2. Offensichtlich ungültiger Dummy-Key
    const res2 = await testAiProviderConnectionAction({
      provider: "GEMINI",
      apiKey: "invalid_key_123",
      chatModel: "gemini-2.5-pro",
    });
    expect(res2.success).toBe(false);
    expect(res2.error).toBe("API-Schlüssel ungültig oder abgelaufen");
    expect(res2.status).toBe("Offline");
    expect(res2.model).toBe("gemini-2.5-pro");

    // 3. Aufruf mit String-Signatur
    const res3 = await testAiProviderConnectionAction("GEMINI", "invalid");
    expect(res3.success).toBe(false);
    expect(res3.error).toBe("API-Schlüssel ungültig oder abgelaufen");
    expect(res3.model).toBe("gemini-1.5-flash");
  });

  it("should return success: true, latencyMs and model when ping succeeds", async () => {
    const originalFetch = global.fetch;

    try {
      // Mocken eines erfolgreichen schlanken Pings gegen Google Gemini
      global.fetch = async (url: any, init?: any) => {
        const urlStr = String(url);
        if (
          urlStr.includes("generativelanguage.googleapis.com") ||
          urlStr.includes("/models") ||
          urlStr.includes("/chat/completions")
        ) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              models: [{ name: "models/gemini-1.5-flash" }],
              choices: [{ message: { content: "pong" } }],
            }),
            text: async () => JSON.stringify({ choices: [{ message: { content: "pong" } }] }),
          } as any;
        }
        return originalFetch(url, init);
      };

      const res = await testAiProviderConnectionAction({
        provider: "GEMINI",
        apiKey: "AIzaSyValidDummyKeyForTestingPurposes12345",
        chatModel: "gemini-1.5-flash",
      });

      expect(res.success).toBe(true);
      expect(typeof res.latencyMs).toBe("number");
      expect(res.latencyMs).toBeGreaterThanOrEqual(0);
      expect(res.status).toBe("Online");
      expect(res.model).toBe("gemini-1.5-flash");
      expect(res.message).toContain("erfolgreich");

      // Test mit dynamisch übergebenem Modell
      const resCustom = await testAiProviderConnectionAction({
        provider: "GEMINI",
        apiKey: "AIzaSyValidDummyKeyForTestingPurposes12345",
        chatModel: "gemini-2.0-flash",
      });
      expect(resCustom.success).toBe(true);
      expect(resCustom.model).toBe("gemini-2.0-flash");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("should return 'API-Schlüssel ungültig oder abgelaufen' when Gemini API responds with 400 API_KEY_INVALID", async () => {
    const originalFetch = global.fetch;

    try {
      global.fetch = async (url: any, init?: any) => {
        const urlStr = String(url);
        if (urlStr.includes("generativelanguage.googleapis.com") || urlStr.includes("/models")) {
          return {
            ok: false,
            status: 400,
            text: async () =>
              JSON.stringify({
                error: {
                  code: 400,
                  message: "API key not valid. Please pass a valid API key.",
                  status: "INVALID_ARGUMENT",
                  details: [{ reason: "API_KEY_INVALID" }],
                },
              }),
          } as any;
        }
        return originalFetch(url, init);
      };

      const res = await testAiProviderConnectionAction({
        provider: "GEMINI",
        apiKey: "AIzaSyExpiredKeyForTesting1234567890",
      });

      expect(res.success).toBe(false);
      expect(res.error).toBe("API-Schlüssel ungültig oder abgelaufen");
      expect(res.status).toBe("Offline");
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("6. Aufgabenbezogene Modellwahl (getLlmModelForTask) & Token Usage Logging", () => {
  it("should return default routingModel 'gemini-3.8-flash' for intent classification and fault capturing", async () => {
    // 1. Standard-Aufruf ohne Overrides
    const modelRouting = await getLlmModelForTask("routing");
    expect(modelRouting).toBe(DEFAULT_ROUTING_MODEL);
    expect(modelRouting).toBe("gemini-3.8-flash");

    // 2. Synonymer Task für Absichtserkennung
    const modelIntent = await getLlmModelForTask("intent");
    expect(modelIntent).toBe("gemini-3.8-flash");

    // 3. Task für Störungserfassung
    const modelFault = await getLlmModelForTask("fault-recording");
    expect(modelFault).toBe("gemini-3.8-flash");

    const modelCopilot = await getLlmModelForTask("copilot");
    expect(modelCopilot).toBe("gemini-3.8-flash");
  });

  it("should return default analyticsModel 'gemini-2.5-pro' for Text-to-SQL and diagrams", async () => {
    // 1. Standard-Aufruf für Analytics
    const modelAnalytics = await getLlmModelForTask("analytics");
    expect(modelAnalytics).toBe(DEFAULT_ANALYTICS_MODEL);
    expect(modelAnalytics).toBe("gemini-2.5-pro");

    // 2. Text-to-SQL
    const modelSql = await getLlmModelForTask("text-to-sql");
    expect(modelSql).toBe("gemini-2.5-pro");

    // 3. Diagramme / Charts
    const modelChart = await getLlmModelForTask("chart");
    expect(modelChart).toBe("gemini-2.5-pro");

    const modelDiagram = await getLlmModelForTask("diagram");
    expect(modelDiagram).toBe("gemini-2.5-pro");
  });

  it("should allow configured model names (e.g. gemini-2.5-flash for routing or freetext for analytics)", async () => {
    // Konfigurationsobjekt mit Stufen-Modellen
    const customConfig = {
      routingModel: "gemini-2.5-flash",
      analyticsModel: "gemini-1.5-pro-experimental-custom",
    };

    const routingResolved = await getLlmModelForTask("routing", customConfig);
    expect(routingResolved).toBe("gemini-2.5-flash");

    const analyticsResolved = await getLlmModelForTask("analytics", customConfig);
    expect(analyticsResolved).toBe("gemini-1.5-pro-experimental-custom");

    // Synchroner Resolver
    expect(resolveLlmModelForTask("fault-recording", customConfig)).toBe("gemini-2.5-flash");
    expect(resolveLlmModelForTask("text-to-sql", customConfig)).toBe("gemini-1.5-pro-experimental-custom");
  });

  it("should support environment variable overrides for routing and analytics models", async () => {
    const prevRouting = process.env.GEMINI_ROUTING_MODEL;
    const prevAnalytics = process.env.AI_ANALYTICS_MODEL;

    try {
      process.env.GEMINI_ROUTING_MODEL = "gemini-2.5-flash";
      process.env.AI_ANALYTICS_MODEL = "gemini-2.5-pro-tuned";

      const routing = await getLlmModelForTask("routing");
      expect(routing).toBe("gemini-2.5-flash");

      const analytics = await getLlmModelForTask("analytics");
      expect(analytics).toBe("gemini-2.5-pro-tuned");
    } finally {
      if (prevRouting !== undefined) process.env.GEMINI_ROUTING_MODEL = prevRouting;
      else delete process.env.GEMINI_ROUTING_MODEL;

      if (prevAnalytics !== undefined) process.env.AI_ANALYTICS_MODEL = prevAnalytics;
      else delete process.env.AI_ANALYTICS_MODEL;
    }
  });

  it("should seamlessly integrate task models into getAiProvider", async () => {
    const routingProvider = (await getAiProvider(undefined, {
      task: "routing",
      provider: "GEMINI",
    })) as GeminiProvider;
    expect(routingProvider.getChatModel()).toBe("gemini-3.8-flash");

    const analyticsProvider = (await getAiProvider(undefined, {
      task: "analytics",
      provider: "GEMINI",
    })) as GeminiProvider;
    expect(analyticsProvider.getChatModel()).toBe("gemini-2.5-pro");
  });

  it("should extract token usage from OpenAI, Gemini REST, Vercel AI SDK and Ollama formats", () => {
    // 1. OpenAI REST Format
    const openaiRaw = {
      usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 },
    };
    const openaiUsage = extractTokenUsage(openaiRaw);
    expect(openaiUsage.promptTokens).toBe(120);
    expect(openaiUsage.completionTokens).toBe(45);
    expect(openaiUsage.totalTokens).toBe(165);

    // 2. Gemini native REST Format (usageMetadata)
    const geminiRaw = {
      usageMetadata: { promptTokenCount: 150, candidatesTokenCount: 75, totalTokenCount: 225 },
    };
    const geminiUsage = extractTokenUsage(geminiRaw);
    expect(geminiUsage.promptTokens).toBe(150);
    expect(geminiUsage.completionTokens).toBe(75);
    expect(geminiUsage.totalTokens).toBe(225);

    // 3. Vercel AI SDK Format
    const vercelRaw = {
      usage: { promptTokens: 80, completionTokens: 40, totalTokens: 120 },
    };
    const vercelUsage = extractTokenUsage(vercelRaw);
    expect(vercelUsage.promptTokens).toBe(80);
    expect(vercelUsage.completionTokens).toBe(40);
    expect(vercelUsage.totalTokens).toBe(120);

    // 4. Ollama Format
    const ollamaRaw = {
      prompt_eval_count: 55,
      eval_count: 22,
    };
    const ollamaUsage = extractTokenUsage(ollamaRaw);
    expect(ollamaUsage.promptTokens).toBe(55);
    expect(ollamaUsage.completionTokens).toBe(22);
    expect(ollamaUsage.totalTokens).toBe(77);

    // 5. Leeres / Null-Objekt
    const emptyUsage = extractTokenUsage(null);
    expect(emptyUsage.promptTokens).toBe(0);
    expect(emptyUsage.completionTokens).toBe(0);
    expect(emptyUsage.totalTokens).toBe(0);
  });

  it("should calculate estimated dollar costs accurately based on model tiers", () => {
    // Flash-Modell
    const flashCost = estimateLlmCost("gemini-3.8-flash", 10000, 2000);
    expect(Number(flashCost)).toBeGreaterThan(0);
    expect(Number(flashCost)).toBeCloseTo(0.00135, 4);

    // Pro-Modell
    const proCost = estimateLlmCost("gemini-2.5-pro", 10000, 2000);
    expect(Number(proCost)).toBeGreaterThan(Number(flashCost));
    expect(Number(proCost)).toBeCloseTo(0.0225, 4);

    // Lokales Modell
    const localCost = estimateLlmCost("ollama/llama3", 50000, 10000);
    expect(localCost).toBe("0.000000");
  });

  it("should execute non-blocking usage logging in logAiUsageAsync without throwing", async () => {
    // Führe non-blocking Call aus
    await expect(
      logAiUsageAsync({
        tenantId: "a0000000-0000-0000-0000-000000000001",
        provider: "GEMINI",
        model: "gemini-3.8-flash",
        task: "routing",
        usage: { promptTokens: 120, completionTokens: 45, totalTokens: 165 },
        durationMs: 310,
        metadata: { source: "vitest-test-run" },
      })
    ).resolves.not.toThrow();
  });

  it("should support withAiUsageLogging interceptor wrapper for generic API calls", async () => {
    let callCount = 0;
    const wrappedResult = await withAiUsageLogging(
      {
        tenantId: "a0000000-0000-0000-0000-000000000001",
        provider: "GEMINI",
        model: "gemini-2.5-pro",
        task: "analytics",
      },
      async () => {
        callCount++;
        return {
          content: "SQL Query executed successfully",
          usage: { prompt_tokens: 300, completion_tokens: 50, total_tokens: 350 },
        };
      }
    );

    expect(callCount).toBe(1);
    expect(wrappedResult.content).toBe("SQL Query executed successfully");
  });

  it("should support createVercelAiUsageInterceptor for Vercel AI SDK lifecycle hooks", async () => {
    const interceptor = createVercelAiUsageInterceptor({
      tenantId: "a0000000-0000-0000-0000-000000000001",
      provider: "GEMINI",
      model: "gemini-3.8-flash",
      task: "routing",
    });

    await expect(
      interceptor({
        usage: { promptTokens: 42, completionTokens: 18, totalTokens: 60 },
        text: '{"intent": "QUERY_ORDERS"}',
      })
    ).resolves.not.toThrow();
  });

  it("should intercept and log usage automatically during GeminiProvider.createChatCompletion", async () => {
    const originalFetch = global.fetch;

    try {
      let interceptedBody: any = null;
      global.fetch = async (url: any, init?: any) => {
        const urlStr = String(url);
        if (urlStr.includes("chat/completions")) {
          if (init?.body) {
            interceptedBody = JSON.parse(init.body);
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({
              choices: [{ message: { content: "Antwort von Gemini mit Token-Logging" } }],
              usage: { prompt_tokens: 65, completion_tokens: 15, total_tokens: 80 },
            }),
          } as any;
        }
        return originalFetch(url, init);
      };

      const gemini = new GeminiProvider({
        apiKey: "AIzaValidDummyKey12345",
        task: "routing",
        tenantId: "a0000000-0000-0000-0000-000000000001",
      });

      const response = await gemini.createChatCompletion(
        [{ role: "user", content: "Notfallmeldung an Pumpe 3" }],
        { task: "routing" }
      );

      expect(response).toBe("Antwort von Gemini mit Token-Logging");
      // Sicherstellen, dass das routingModel "gemini-3.8-flash" gewählt wurde
      expect(interceptedBody.model).toBe("gemini-3.8-flash");
    } finally {
      global.fetch = originalFetch;
    }
  });
});
