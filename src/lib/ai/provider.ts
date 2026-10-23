import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { aiUsageLogs, tenants } from "@/db/schema";
import { encryptApiKey, decryptApiKey, maskApiKey } from "./encryption";

export { encryptApiKey, decryptApiKey, maskApiKey } from "./encryption";

export type AiProviderType = "OPENAI" | "GEMINI" | "OLLAMA" | "VLLM";

export const PGVECTOR_DIMENSIONS = 1536;
export const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434/api";
export const OLLAMA_DEFAULT_CHAT_MODEL = "llama3";
export const OLLAMA_DEFAULT_EMBEDDING_MODEL = "nomic-embed-text";
export const OLLAMA_DEFAULT_TIMEOUT_MS = 6000;

export const DEFAULT_ROUTING_MODEL = "gemini-3.8-flash";
export const DEFAULT_ANALYTICS_MODEL = "gemini-3.8-flash";

/**
 * Normalisiert Gemini-Modellnamen, sodass veraltete/nicht mehr verfügbare Modelle
 * (z. B. gemini-2.5-pro, gemini-1.5-flash, gemini-2.5-flash) automatisch auf gemini-3.8-flash gemappt werden.
 */
export function normalizeGeminiModel(model?: string): string {
  const m = (model || "").trim();
  if (
    !m ||
    m === "gemini-2.5-pro" ||
    m === "gemini-1.5-flash" ||
    m === "gemini-2.5-flash" ||
    m === "gemini-1.5-pro"
  ) {
    return "gemini-3.8-flash";
  }
  return m;
}

/**
 * Robuste Mandanten-Auflösung:
 * Erkennt UUIDs, Namens-/Werkskürzel (z.B. "WERK-01", "1000", "demo-tenant-1000")
 * oder fällt auf den primären aktiven Mandanten zurück.
 */
export async function findTenant(tenantId?: string) {
  try {
    if (tenantId && typeof tenantId === "string") {
      const cleanId = tenantId.trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
      if (isUuid) {
        const byId = await db.query.tenants.findFirst({
          where: eq(tenants.id, cleanId),
        });
        if (byId) return byId;
      }

      const byCodeOrSap = await db.query.tenants.findFirst({
        where: or(
          eq(tenants.code, cleanId),
          eq(tenants.sapPlantCode, cleanId)
        ),
      });
      if (byCodeOrSap) return byCodeOrSap;
    }

    // Fallback: Aktiver Mandant oder erster gefundener Mandant
    const active = await db.query.tenants.findFirst({
      where: eq(tenants.isActive, true),
    });
    if (active) return active;

    return await db.query.tenants.findFirst();
  } catch (err) {
    console.warn("[findTenant] Fehler beim Laden des Mandanten:", err);
    return null;
  }
}

export type AiTaskStage = "routing" | "analytics";
export type AiTaskType =
  | "routing"
  | "analytics"
  | "routingModel"
  | "analyticsModel"
  | "intent"
  | "classification"
  | "fault-recording"
  | "fault-copilot"
  | "fault-parser"
  | "text-to-sql"
  | "sql"
  | "chart"
  | "diagram"
  | string;

export interface LlmChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  model?: string;
  task?: AiTaskType;
  tenantId?: string;
  userId?: string;
}

export interface ILlmProvider {
  createChatCompletion(
    messages: LlmChatMessage[],
    options?: LlmCompletionOptions
  ): Promise<string>;
  createEmbedding(
    text: string,
    options?: { model?: string; dimensions?: number }
  ): Promise<number[]>;
  getChatModel?(): string;
  getEmbeddingModel?(): string;
}

export interface AiProviderConfig {
  provider?: AiProviderType | string;
  baseUrl?: string;
  apiKey?: string;
  chatModel?: string;
  embeddingModel?: string;
  embeddingDimensions?: number;
  tenantId?: string;
  userId?: string;
  model?: string;
  task?: AiTaskType;
  routingModel?: string;
  analyticsModel?: string;
}

export interface AiTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Normalisiert rohe Usage-Metadaten (Vercel AI SDK, OpenAI REST, Gemini REST oder Ollama)
 */
export function extractTokenUsage(raw: any): AiTokenUsage {
  if (!raw) {
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  }

  // Vercel AI SDK oder standardisiert
  if (typeof raw.promptTokens === "number" || typeof raw.completionTokens === "number") {
    const prompt = Number(raw.promptTokens) || 0;
    const completion = Number(raw.completionTokens) || 0;
    return {
      promptTokens: prompt,
      completionTokens: completion,
      totalTokens: Number(raw.totalTokens) || prompt + completion,
    };
  }

  // OpenAI REST, Gemini OpenAI-Format oder natives Gemini usageMetadata
  const usageObj = raw.usage || raw.usageMetadata || raw;
  const prompt =
    usageObj.prompt_tokens ??
    usageObj.promptTokenCount ??
    usageObj.prompt_eval_count ??
    usageObj.promptTokens ??
    0;
  const completion =
    usageObj.completion_tokens ??
    usageObj.candidatesTokenCount ??
    usageObj.eval_count ??
    usageObj.completionTokens ??
    0;
  const total =
    usageObj.total_tokens ??
    usageObj.totalTokenCount ??
    usageObj.totalTokens ??
    (Number(prompt) || 0) + (Number(completion) || 0);

  return {
    promptTokens: Number(prompt) || 0,
    completionTokens: Number(completion) || 0,
    totalTokens: Number(total) || 0,
  };
}

/**
 * Schätzt die ungefähren Kosten pro Prompt/Completion in USD
 */
export function estimateLlmCost(
  model: string,
  promptTokens: number,
  completionTokens: number
): string {
  const m = (model || "").toLowerCase();
  let promptRatePer1k = 0.0001;
  let completionRatePer1k = 0.0004;

  if (m.includes("gemini-3.8-flash") || m.includes("gemini-2.5-flash") || m.includes("gemini-1.5-flash")) {
    // ~$0.075 / 1M prompt (~0.000075 / 1k), ~$0.30 / 1M completion (~0.0003 / 1k)
    promptRatePer1k = 0.000075;
    completionRatePer1k = 0.0003;
  } else if (m.includes("gemini-2.5-pro") || m.includes("gemini-1.5-pro")) {
    // ~$1.25 / 1M prompt (~0.00125 / 1k), ~$5.00 / 1M completion (~0.005 / 1k)
    promptRatePer1k = 0.00125;
    completionRatePer1k = 0.005;
  } else if (m.includes("gpt-4o-mini")) {
    promptRatePer1k = 0.00015;
    completionRatePer1k = 0.0006;
  } else if (m.includes("gpt-4o")) {
    promptRatePer1k = 0.0025;
    completionRatePer1k = 0.01;
  } else if (m.includes("ollama") || m.includes("llama") || m.includes("local") || m.includes("vllm")) {
    return "0.000000";
  }

  const cost = (promptTokens / 1000) * promptRatePer1k + (completionTokens / 1000) * completionRatePer1k;
  return cost.toFixed(6);
}

export interface LogAiUsageParams {
  tenantId?: string | null;
  userId?: string | null;
  provider: string;
  model: string;
  task?: string | null;
  usage?: any;
  durationMs?: number | null;
  costEstimate?: number | string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Validiert, ob ein String eine wohlgeformte UUID v4 darstellt
 */
function isValidUuid(id?: string | null): boolean {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Usage Logging Interceptor:
 * Fängt usage-Metadaten ab und schreibt non-blocking einen Eintrag in `ai_usage_logs` via Drizzle.
 */
export function logAiUsageAsync(params: LogAiUsageParams): Promise<void> {
  const promise = (async () => {
    try {
      const extracted = extractTokenUsage(params.usage);

      let cost: string | undefined = undefined;
      if (typeof params.costEstimate === "number") {
        cost = params.costEstimate.toFixed(6);
      } else if (typeof params.costEstimate === "string") {
        cost = params.costEstimate;
      } else {
        cost = estimateLlmCost(params.model, extracted.promptTokens, extracted.completionTokens);
      }

      let safeTenantId = isValidUuid(params.tenantId) ? params.tenantId! : null;
      if (!safeTenantId) {
        const firstTenant = await db.query.tenants.findFirst();
        safeTenantId = firstTenant?.id || null;
      }
      if (!safeTenantId) return;

      const rawTask = (params.task || "ROUTING").toUpperCase();
      const validTaskType =
        rawTask.includes("ANALYTIC") || rawTask.includes("SQL") || rawTask.includes("CHART")
          ? "ANALYTICS"
          : rawTask.includes("RAG") || rawTask.includes("SYNTHESIS") || rawTask.includes("FAULT")
          ? "RAG_SYNTHESIS"
          : "ROUTING";

      await db.insert(aiUsageLogs).values({
        tenantId: safeTenantId,
        provider: params.provider || "gemini",
        model: params.model || "gemini-3.8-flash",
        taskType: validTaskType,
        promptTokens: extracted.promptTokens,
        completionTokens: extracted.completionTokens,
        totalTokens: extracted.totalTokens,
        latencyMs: params.durationMs ?? 0,
        estimatedCostEur: cost || "0.000000",
      });
    } catch (err: any) {
      // Non-blocking interceptor: Fehler abfangen, um Hauptablauf niemals zu stören
      if (process.env.NODE_ENV !== "test" && err?.code !== "ECONNREFUSED") {
        console.warn("[AI Usage Logging Interceptor] Failed to insert usage log entry:", err?.message || err);
      }
    }
  })();

  promise.catch(() => {});
  return promise;
}

export const logAiUsage = logAiUsageAsync;
export const recordAiUsage = logAiUsageAsync;

/**
 * Interceptor für Vercel AI SDK (`ai` Paket)
 * Kann direkt in `onFinish` von `generateText` oder `streamText` eingehängt werden.
 */
export function createVercelAiUsageInterceptor(params: {
  tenantId?: string;
  userId?: string;
  provider?: string;
  model: string;
  task?: string;
}) {
  const startTime = Date.now();
  return (event: { usage?: any; text?: string; response?: any }) => {
    const durationMs = Date.now() - startTime;
    return logAiUsageAsync({
      tenantId: params.tenantId,
      userId: params.userId,
      provider: params.provider || "GEMINI",
      model: params.model,
      task: params.task,
      usage: event.usage,
      durationMs,
      metadata: {
        textSnippet: event.text?.slice(0, 100),
      },
    });
  };
}

/**
 * Universal Usage Logging Wrapper
 */
export async function withAiUsageLogging<T>(
  params: {
    tenantId?: string;
    userId?: string;
    provider: string;
    model: string;
    task?: string;
    extractUsage?: (result: T) => any;
  },
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    const durationMs = Date.now() - start;
    const usage = params.extractUsage
      ? params.extractUsage(result)
      : (result as any)?.usage || (result as any)?.usageMetadata;

    logAiUsageAsync({
      tenantId: params.tenantId,
      userId: params.userId,
      provider: params.provider,
      model: params.model,
      task: params.task,
      usage,
      durationMs,
    });
    return result;
  } catch (error) {
    const durationMs = Date.now() - start;
    logAiUsageAsync({
      tenantId: params.tenantId,
      userId: params.userId,
      provider: params.provider,
      model: params.model,
      task: params.task,
      durationMs,
      metadata: { error: (error as Error).message },
    });
    throw error;
  }
}

/**
 * Bestimmt die Stufe ("routing" vs. "analytics") anhand des Aufgabennamens
 */
export function determineTaskStage(task?: string): AiTaskStage {
  if (!task) return "routing";
  const normalized = task.toLowerCase();
  if (
    normalized.includes("analytic") ||
    normalized.includes("sql") ||
    normalized.includes("chart") ||
    normalized.includes("diagram") ||
    normalized.includes("report")
  ) {
    return "analytics";
  }
  return "routing";
}

/**
 * Synchroner Modellname-Resolver basierend auf Task und übergebener Konfiguration / Umgebung
 */
export function resolveLlmModelForTask(
  stageOrTask: string,
  config?: Partial<AiProviderConfig> | { routingModel?: string; analyticsModel?: string; chatModel?: string; provider?: string } | null
): string {
  const stage = determineTaskStage(stageOrTask);
  const isGemini = !config?.provider || config.provider === "GEMINI";

  if (stage === "routing") {
    if (config?.routingModel?.trim()) {
      const m = config.routingModel.trim();
      return isGemini ? normalizeGeminiModel(m) : m;
    }
    if (process.env.AI_ROUTING_MODEL?.trim()) return process.env.AI_ROUTING_MODEL.trim();
    if (process.env.GEMINI_ROUTING_MODEL?.trim()) return process.env.GEMINI_ROUTING_MODEL.trim();
    if (process.env.ROUTING_MODEL?.trim()) return process.env.ROUTING_MODEL.trim();
    if (config?.provider && config.provider !== "GEMINI" && config.chatModel) {
      return config.chatModel;
    }
    return DEFAULT_ROUTING_MODEL;
  } else {
    if (config?.analyticsModel?.trim()) {
      const m = config.analyticsModel.trim();
      return isGemini ? normalizeGeminiModel(m) : m;
    }
    if (process.env.AI_ANALYTICS_MODEL?.trim()) return process.env.AI_ANALYTICS_MODEL.trim();
    if (process.env.GEMINI_ANALYTICS_MODEL?.trim()) return process.env.GEMINI_ANALYTICS_MODEL.trim();
    if (process.env.ANALYTICS_MODEL?.trim()) return process.env.ANALYTICS_MODEL.trim();
    if (config?.provider && config.provider !== "GEMINI" && config.chatModel) {
      return config.chatModel;
    }
    return DEFAULT_ANALYTICS_MODEL;
  }
}

/**
 * Aufgabenbezogene Modellwahl (`getLlmModelForTask`):
 * Lädt konfigurierte Modellnamen für zwei Stufen:
 * 1. `routingModel`: Standard `gemini-3.8-flash` für Absichtserkennung und Störungserfassung.
 * 2. `analyticsModel`: Standard `gemini-3.8-flash` für Text-to-SQL und Diagramme.
 */
export async function getLlmModelForTask(
  task: AiTaskType,
  tenantIdOrConfig?: string | AiProviderConfig | { routingModel?: string; analyticsModel?: string; chatModel?: string; provider?: string } | null
): Promise<string> {
  const stage = determineTaskStage(task);

  if (typeof tenantIdOrConfig === "object" && tenantIdOrConfig !== null) {
    return resolveLlmModelForTask(stage, tenantIdOrConfig);
  }

  const tenantId = typeof tenantIdOrConfig === "string" ? tenantIdOrConfig : undefined;
  try {
    const config = await getTenantAiConfig(tenantId);
    if (config) {
      const isGemini = config.provider === "GEMINI";
      if (stage === "routing" && config.routingModel?.trim()) {
        const m = config.routingModel.trim();
        return isGemini ? normalizeGeminiModel(m) : m;
      }
      if (stage === "analytics" && config.analyticsModel?.trim()) {
        const m = config.analyticsModel.trim();
        return isGemini ? normalizeGeminiModel(m) : m;
      }
      if (config.provider !== "GEMINI" && config.chatModel) {
        return config.chatModel;
      }
    }
  } catch {
    // Fallback auf Env / Defaults
  }

  return resolveLlmModelForTask(stage);
}

/**
 * Spezifischer Fehler für Verbindungsprobleme mit Ollama (Offline, Timeout, Modell nicht gefunden)
 */
export class OllamaConnectionError extends Error {
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly isTimeout: boolean;
  public readonly baseUrl: string;

  constructor(
    message: string,
    options: {
      code?: string;
      statusCode?: number;
      isTimeout?: boolean;
      baseUrl?: string;
    } = {}
  ) {
    super(message);
    this.name = "OllamaConnectionError";
    this.code = options.code || "OLLAMA_ERROR";
    this.statusCode = options.statusCode;
    this.isTimeout = options.isTimeout ?? false;
    this.baseUrl = options.baseUrl || "";
  }
}

/**
 * Universeller OpenAI-kompatibler Provider
 * Unterstützt OpenAI Cloud, Ollama (/v1), vLLM, LMStudio oder LocalAI.
 */
export class OpenAiCompatibleProvider implements ILlmProvider {
  protected baseUrl: string;
  protected apiKey: string;
  protected chatModel: string;
  protected embeddingModel: string;
  protected expectedEmbeddingDim: number;
  protected timeoutMs: number;
  public tenantId?: string;
  public userId?: string;
  public task?: AiTaskType;
  protected config: AiProviderConfig;

  constructor(config: AiProviderConfig = {}) {
    this.config = config;
    this.tenantId = config.tenantId;
    this.userId = config.userId;
    this.task = config.task;

    this.baseUrl = (
      config.baseUrl ||
      process.env.AI_PROVIDER_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      "https://api.openai.com/v1"
    ).replace(/\/+$/, "");

    this.apiKey =
      config.apiKey ||
      process.env.AI_API_KEY ||
      process.env.OPENAI_API_KEY ||
      "ollama"; // Lokale Provider benötigen oft nur einen Dummy-Key

    this.chatModel =
      config.chatModel ||
      config.model ||
      (config.task ? resolveLlmModelForTask(config.task, config) : undefined) ||
      process.env.AI_MODEL_NAME ||
      process.env.OPENAI_MODEL ||
      "gpt-4o";

    this.embeddingModel =
      config.embeddingModel ||
      process.env.AI_EMBEDDING_MODEL ||
      "text-embedding-3-small";

    this.expectedEmbeddingDim = config.embeddingDimensions || PGVECTOR_DIMENSIONS;
    this.timeoutMs = 12000;
  }

  protected getProviderName(): string {
    if (this instanceof OllamaProvider) return "OLLAMA";
    if (this instanceof VllmProvider) return "VLLM";
    return "OPENAI";
  }

  getChatModel(): string {
    return this.chatModel;
  }

  getEmbeddingModel(): string {
    return this.embeddingModel;
  }

  async createChatCompletion(
    messages: LlmChatMessage[],
    options?: LlmCompletionOptions
  ): Promise<string> {
    const start = Date.now();
    const url = `${this.baseUrl}/chat/completions`;
    const model =
      options?.model ||
      (options?.task ? resolveLlmModelForTask(options.task, this.config) : this.chatModel);

    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.maxTokens ?? 2000,
    };

    if (options?.jsonMode) {
      body.response_format = { type: "json_object" };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`LLM API Fehler (${response.status} ${response.statusText}): ${errText}`);
      }

      const data = await response.json();
      const durationMs = Date.now() - start;
      const content = data.choices?.[0]?.message?.content || "";

      logAiUsageAsync({
        tenantId: options?.tenantId || this.tenantId,
        userId: options?.userId || this.userId,
        provider: this.getProviderName(),
        model,
        task: options?.task || this.task,
        usage: data.usage || {
          prompt_tokens: data.prompt_eval_count,
          completion_tokens: data.eval_count,
          total_tokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        },
        durationMs,
        metadata: {
          totalCharacters: content.length,
        },
      });

      return content;
    } catch (fetchErr: any) {
      if (controller.signal.aborted || fetchErr.name === "AbortError") {
        throw new Error(`LLM API Timeout (${this.timeoutMs}ms) beim Aufruf von ${url}`);
      }
      throw fetchErr;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async createEmbedding(
    text: string,
    options?: { model?: string; dimensions?: number }
  ): Promise<number[]> {
    const url = `${this.baseUrl}/embeddings`;
    const model = options?.model || this.embeddingModel;
    const targetDim = options?.dimensions || this.expectedEmbeddingDim;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: text.replace(/\n/g, " ").slice(0, 8000),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Embedding API Fehler (${response.status}): ${errText}`);
      }

      const data = await response.json();
      const rawVector: number[] = data.data?.[0]?.embedding || [];

      if (rawVector.length === 0) {
        throw new Error("Leeres Embedding vom LLM-Provider erhalten.");
      }

      return normalizeToTargetDimensions(rawVector, targetDim);
    } catch (err) {
      // Robuster Fallback: Deterministisches Vektor-Embedding berechnen,
      // damit Ähnlichkeitssuche & pgvector auch bei offline Providern niemals abstürzt.
      return generateDeterministicEmbedding(text, targetDim);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Google Gemini Provider
 * Nutzt die offizielle Gemini OpenAI-kompatible Schnittstelle (/v1beta/openai)
 * oder die Google Generative Language REST API mit API-Key-Authentifizierung.
 */
export class GeminiProvider implements ILlmProvider {
  private apiKey: string;
  private chatModel: string;
  private embeddingModel: string;
  private baseUrl: string;
  private expectedEmbeddingDim: number;
  public tenantId?: string;
  public userId?: string;
  public task?: AiTaskType;
  protected config: AiProviderConfig;
  public readonly targetDimensions: number = PGVECTOR_DIMENSIONS;

  constructor(config: AiProviderConfig = {}) {
    this.config = config;
    this.tenantId = config.tenantId;
    this.userId = config.userId;
    this.task = config.task;

    this.apiKey =
      config.apiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.AI_API_KEY ||
      "";

    this.chatModel = normalizeGeminiModel(
      config.chatModel ||
      config.model ||
      (config.task ? resolveLlmModelForTask(config.task, config) : undefined) ||
      process.env.GEMINI_MODEL ||
      process.env.AI_MODEL_NAME ||
      "gemini-3.8-flash"
    );

    this.embeddingModel =
      config.embeddingModel ||
      process.env.GEMINI_EMBEDDING_MODEL ||
      "text-embedding-004";

    this.baseUrl = (
      config.baseUrl ||
      "https://generativelanguage.googleapis.com/v1beta/openai"
    ).replace(/\/+$/, "");

    this.expectedEmbeddingDim =
      config.embeddingDimensions ||
      (this.embeddingModel.includes("text-embedding-004") ? 768 : PGVECTOR_DIMENSIONS);
  }

  getChatModel(): string {
    return this.chatModel;
  }

  getEmbeddingModel(): string {
    return this.embeddingModel;
  }

  setChatModel(model: string): void {
    this.chatModel = model;
  }

  setEmbeddingModel(model: string): void {
    this.embeddingModel = model;
  }

  /**
   * Führt einen schlanken Ping / Dummy-Aufruf gegen die Gemini API aus
   */
  async testConnection(options?: { model?: string }): Promise<{
    success: boolean;
    latencyMs: number;
    model: string;
    message: string;
    error?: string;
  }> {
    const start = Date.now();
    const key = (this.apiKey || "").trim();
    const selectedModel = normalizeGeminiModel(options?.model || this.chatModel || "gemini-3.8-flash");

    // 1. Validierung des API-Keys
    if (!key || key === "invalid" || key.startsWith("invalid_") || key.length < 8) {
      return {
        success: false,
        latencyMs: 0,
        model: selectedModel,
        error: "API-Schlüssel ungültig oder abgelaufen",
        message: "API-Schlüssel ungültig oder abgelaufen",
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      // 2. Schnelle Validierung über den Google Models Endpunkt (<200ms)
      let pingUrl = this.baseUrl.includes("generativelanguage.googleapis.com")
        ? `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`
        : `${this.baseUrl}/models`;

      let response = await fetch(pingUrl, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(pingUrl.includes("key=") ? {} : { Authorization: `Bearer ${key}` }),
        },
        signal: controller.signal,
      });

      // Falls GET /models auf einem Proxy 404/405 liefert, Fallback auf Minimal-Chatanfrage
      if (response.status === 404 || response.status === 405) {
        const chatUrl = `${this.baseUrl}/chat/completions`;
        response = await fetch(chatUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 5,
          }),
          signal: controller.signal,
        });
      }

      const latencyMs = Date.now() - start;

      if (!response.ok) {
        const errText = await response.text();
        const isAuthError =
          response.status === 400 ||
          response.status === 401 ||
          response.status === 403 ||
          errText.includes("API_KEY_INVALID") ||
          errText.includes("API key not valid") ||
          errText.includes("UNAUTHENTICATED") ||
          errText.includes("PERMISSION_DENIED");

        if (isAuthError) {
          return {
            success: false,
            latencyMs,
            model: selectedModel,
            error: "API-Schlüssel ungültig oder abgelaufen",
            message: "API-Schlüssel ungültig oder abgelaufen",
          };
        }

        return {
          success: false,
          latencyMs,
          model: selectedModel,
          error: `Gemini API Fehler (${response.status}): ${errText}`,
          message: `Gemini API Fehler (${response.status}): ${errText}`,
        };
      }

      return {
        success: true,
        latencyMs,
        model: selectedModel,
        message: `Verbindung zu Gemini erfolgreich hergestellt (${latencyMs}ms). Modell: ${selectedModel}`,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      if (controller.signal.aborted || err?.name === "AbortError") {
        return {
          success: false,
          latencyMs,
          model: selectedModel,
          error: "Timeout beim Verbindungsaufbau zu Gemini (nach 6000ms).",
          message: "Timeout beim Verbindungsaufbau zu Gemini (nach 6000ms).",
        };
      }
      return {
        success: false,
        latencyMs,
        model: selectedModel,
        error: err?.message || "Fehler beim Verbindungstest zu Gemini.",
        message: err?.message || "Fehler beim Verbindungstest zu Gemini.",
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async createChatCompletion(
    messages: LlmChatMessage[],
    options?: LlmCompletionOptions
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error("Gemini API Key fehlt. Bitte GEMINI_API_KEY in der Umgebung konfigurieren.");
    }

    const start = Date.now();
    const requestedModel =
      options?.model ||
      (options?.task ? resolveLlmModelForTask(options.task, this.config) : this.chatModel);
    const model = normalizeGeminiModel(requestedModel);
    const url = `${this.baseUrl}/chat/completions`;
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.maxTokens ?? 2048,
    };

    if (options?.jsonMode) {
      body.response_format = { type: "json_object" };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      let response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      // Bei temporären Spikes (503 Service Unavailable) einmalig nach kurzer Pause erneut versuchen
      if (response.status === 503) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API Fehler (${response.status} ${response.statusText}): ${errText}`);
      }

      const data = await response.json();
      const durationMs = Date.now() - start;
      const content = data.choices?.[0]?.message?.content || "";

      // Asynchrones non-blocking Logging in ai_usage_logs
      logAiUsageAsync({
        tenantId: options?.tenantId || this.tenantId,
        userId: options?.userId || this.userId,
        provider: "GEMINI",
        model,
        task: options?.task || this.task,
        usage: data.usage || data.usageMetadata,
        durationMs,
        metadata: {
          totalCharacters: content.length,
        },
      });

      return content;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Generiert das Roh-Embedding direkt von Gemini (z. B. 768 Dimensionen bei text-embedding-004)
   */
  async createRawEmbedding(
    text: string,
    options?: { model?: string }
  ): Promise<number[]> {
    const model = options?.model || this.embeddingModel;
    const nativeDim = model.includes("text-embedding-004") ? 768 : this.expectedEmbeddingDim;

    if (!this.apiKey) {
      return generateDeterministicEmbedding(text, nativeDim);
    }

    try {
      const url = `${this.baseUrl}/embeddings`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: text.replace(/\n/g, " ").slice(0, 8000),
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini Embedding API Fehler (${response.status}): ${errText}`);
      }

      const data = await response.json();
      const rawVector: number[] = data.data?.[0]?.embedding || [];
      if (!Array.isArray(rawVector) || rawVector.length === 0) {
        throw new Error("Leeres Embedding von Gemini erhalten.");
      }
      return rawVector;
    } catch {
      return generateDeterministicEmbedding(text, nativeDim);
    }
  }

  /**
   * Generiert ein Vektor-Embedding für Postgres pgvector(1536).
   * Mappt Modelle wie 'text-embedding-004' (768 Dims) automatisch sauber auf das pgvector-Schema (1536 Dimensionen).
   */
  async createEmbedding(
    text: string,
    options?: { model?: string; dimensions?: number }
  ): Promise<number[]> {
    const targetDim = options?.dimensions || PGVECTOR_DIMENSIONS;
    try {
      const rawVector = await this.createRawEmbedding(text, options);
      return mapToPgVectorDimensions(rawVector, targetDim);
    } catch {
      return generateDeterministicEmbedding(text, targetDim);
    }
  }
}

/**
 * Lokales Ollama (Unterstützt native /api sowie OpenAI-kompatible /v1 Endpunkte)
 * - Standard-Endpunkt: http://localhost:11434/api (oder http://localhost:11434/v1)
 * - Behandelt Offline-Dienste und Timeouts kontrolliert mit verständlicher Fehlermeldung
 * - Mappt lokale Embeddings (z. B. nomic-embed-text mit 768 Dimensionen) nahtlos auf pgvector (1536)
 */
export class OllamaProvider extends OpenAiCompatibleProvider {
  protected isNativeApi: boolean;
  public readonly targetDimensions: number = PGVECTOR_DIMENSIONS;

  constructor(config: AiProviderConfig = {}) {
    let rawUrl = (
      config.baseUrl ||
      process.env.OLLAMA_BASE_URL ||
      process.env.AI_PROVIDER_BASE_URL ||
      OLLAMA_DEFAULT_BASE_URL
    ).replace(/\/+$/, "");

    // Falls Host ohne Pfad angegeben wurde (z.B. http://localhost:11434), standardmäßig auf /api zugreifen
    if (!rawUrl.endsWith("/api") && !rawUrl.endsWith("/v1")) {
      rawUrl = `${rawUrl}/api`;
    }

    super({
      baseUrl: rawUrl,
      apiKey: config.apiKey || "ollama",
      chatModel: config.chatModel || config.model || process.env.OLLAMA_MODEL || OLLAMA_DEFAULT_CHAT_MODEL,
      embeddingModel:
        config.embeddingModel ||
        process.env.OLLAMA_EMBEDDING_MODEL ||
        OLLAMA_DEFAULT_EMBEDDING_MODEL,
      embeddingDimensions: PGVECTOR_DIMENSIONS,
    });

    this.timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS) || OLLAMA_DEFAULT_TIMEOUT_MS;
    this.isNativeApi = this.baseUrl.endsWith("/api");
  }

  private handleFetchError(err: any, endpointUrl: string, isTimeout: boolean): never {
    if (err instanceof OllamaConnectionError) {
      throw err;
    }

    if (isTimeout || err?.name === "AbortError" || err?.name === "TimeoutError") {
      throw new OllamaConnectionError(
        `Ollama-Dienst antwortet nicht rechtzeitig (Timeout nach ${this.timeoutMs}ms unter ${this.baseUrl}). Bitte prüfen Sie, ob der Ollama-Container läuft und nicht überlastet ist.`,
        { code: "OLLAMA_TIMEOUT", isTimeout: true, baseUrl: this.baseUrl }
      );
    }

    const msg = err?.message || String(err);
    const code = err?.code || err?.cause?.code;

    if (
      code === "ECONNREFUSED" ||
      msg.includes("ECONNREFUSED") ||
      msg.toLowerCase().includes("fetch failed")
    ) {
      throw new OllamaConnectionError(
        `Ollama-Dienst ist nicht erreichbar unter ${this.baseUrl} (Verbindung abgelehnt). Bitte stellen Sie sicher, dass Ollama lokal läuft (z. B. 'ollama serve' oder Docker-Container auf Port 11434).`,
        { code: "OLLAMA_OFFLINE", baseUrl: this.baseUrl }
      );
    }

    throw new OllamaConnectionError(
      `Fehler bei der Kommunikation mit dem Ollama-Dienst (${endpointUrl}): ${msg}`,
      { code: "OLLAMA_COMMUNICATION_ERROR", baseUrl: this.baseUrl }
    );
  }

  async createChatCompletion(
    messages: LlmChatMessage[],
    options?: LlmCompletionOptions
  ): Promise<string> {
    const start = Date.now();
    const model =
      options?.model ||
      (options?.task ? resolveLlmModelForTask(options.task, this.config) : this.chatModel);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      if (this.isNativeApi) {
        // Native Ollama API: POST /api/chat
        const url = `${this.baseUrl}/chat`;
        const body: Record<string, unknown> = {
          model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          stream: false,
          options: {
            temperature: options?.temperature ?? 0.2,
            num_predict: options?.maxTokens ?? 2000,
          },
        };

        if (options?.jsonMode) {
          body.format = "json";
        }

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errText = await response.text();
          if (response.status === 404) {
            throw new OllamaConnectionError(
              `Ollama Modell '${model}' oder Endpunkt '${url}' nicht gefunden (HTTP 404). Bitte prüfe das Modell mit 'ollama list' bzw. 'ollama pull ${model}'.`,
              { statusCode: 404, code: "OLLAMA_MODEL_NOT_FOUND", baseUrl: this.baseUrl }
            );
          }
          throw new OllamaConnectionError(
            `Ollama API Fehler (${response.status} ${response.statusText}): ${errText}`,
            { statusCode: response.status, code: "OLLAMA_HTTP_ERROR", baseUrl: this.baseUrl }
          );
        }

        const data = await response.json();
        const durationMs = Date.now() - start;
        const content = data.message?.content || "";

        logAiUsageAsync({
          tenantId: options?.tenantId || this.tenantId,
          userId: options?.userId || this.userId,
          provider: "OLLAMA",
          model,
          task: options?.task || this.task,
          usage: {
            promptTokens: data.prompt_eval_count || 0,
            completionTokens: data.eval_count || 0,
            totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
          },
          durationMs,
          metadata: {
            totalCharacters: content.length,
          },
        });

        return content;
      } else {
        // OpenAI-kompatible Ollama API: POST /v1/chat/completions
        const url = `${this.baseUrl}/chat/completions`;
        const body: Record<string, unknown> = {
          model,
          messages,
          temperature: options?.temperature ?? 0.2,
          max_tokens: options?.maxTokens ?? 2000,
        };

        if (options?.jsonMode) {
          body.response_format = { type: "json_object" };
        }

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errText = await response.text();
          if (response.status === 404) {
            throw new OllamaConnectionError(
              `Ollama Modell '${model}' oder Endpunkt '${url}' nicht gefunden (HTTP 404). Bitte prüfe das Modell mit 'ollama list' bzw. 'ollama pull ${model}'.`,
              { statusCode: 404, code: "OLLAMA_MODEL_NOT_FOUND", baseUrl: this.baseUrl }
            );
          }
          throw new OllamaConnectionError(
            `Ollama /v1 API Fehler (${response.status} ${response.statusText}): ${errText}`,
            { statusCode: response.status, code: "OLLAMA_HTTP_ERROR", baseUrl: this.baseUrl }
          );
        }

        const data = await response.json();
        const durationMs = Date.now() - start;
        const content = data.choices?.[0]?.message?.content || "";

        logAiUsageAsync({
          tenantId: options?.tenantId || this.tenantId,
          userId: options?.userId || this.userId,
          provider: "OLLAMA",
          model,
          task: options?.task || this.task,
          usage: data.usage || {
            prompt_tokens: data.prompt_eval_count,
            completion_tokens: data.eval_count,
          },
          durationMs,
          metadata: {
            totalCharacters: content.length,
          },
        });

        return content;
      }
    } catch (fetchErr: any) {
      this.handleFetchError(
        fetchErr,
        this.isNativeApi ? `${this.baseUrl}/chat` : `${this.baseUrl}/chat/completions`,
        controller.signal.aborted
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Generiert das Roh-Embedding direkt von Ollama (z. B. 768 Dimensionen bei nomic-embed-text)
   */
  async createRawEmbedding(
    text: string,
    options?: { model?: string }
  ): Promise<number[]> {
    const model = options?.model || this.embeddingModel;
    const cleanText = text.replace(/\n/g, " ").slice(0, 8000);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      if (this.isNativeApi) {
        // Native Ollama API: POST /api/embeddings (Fallback auf /api/embed)
        const primaryUrl = `${this.baseUrl}/embeddings`;
        let response = await fetch(primaryUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            prompt: cleanText,
          }),
          signal: controller.signal,
        });

        if (response.status === 404) {
          const embedUrl = `${this.baseUrl}/embed`;
          response = await fetch(embedUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model,
              input: cleanText,
            }),
            signal: controller.signal,
          });
        }

        if (!response.ok) {
          const errText = await response.text();
          throw new OllamaConnectionError(
            `Ollama Embedding API Fehler (${response.status}): ${errText}`,
            { statusCode: response.status, code: "OLLAMA_EMBEDDING_ERROR", baseUrl: this.baseUrl }
          );
        }

        const data = await response.json();
        const rawVector: number[] = data.embedding || data.embeddings?.[0] || [];

        if (!Array.isArray(rawVector) || rawVector.length === 0) {
          throw new OllamaConnectionError("Leeres Embedding von Ollama erhalten.", {
            code: "OLLAMA_EMPTY_EMBEDDING",
            baseUrl: this.baseUrl,
          });
        }

        return rawVector;
      } else {
        // OpenAI-kompatible Ollama API: POST /v1/embeddings
        const url = `${this.baseUrl}/embeddings`;
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model,
            input: cleanText,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new OllamaConnectionError(
            `Ollama /v1/embeddings Fehler (${response.status}): ${errText}`,
            { statusCode: response.status, code: "OLLAMA_EMBEDDING_ERROR", baseUrl: this.baseUrl }
          );
        }

        const data = await response.json();
        const rawVector: number[] = data.data?.[0]?.embedding || [];

        if (!Array.isArray(rawVector) || rawVector.length === 0) {
          throw new OllamaConnectionError("Leeres Embedding von Ollama erhalten.", {
            code: "OLLAMA_EMPTY_EMBEDDING",
            baseUrl: this.baseUrl,
          });
        }

        return rawVector;
      }
    } catch (err: any) {
      this.handleFetchError(err, `${this.baseUrl}/embeddings`, controller.signal.aborted);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Generiert ein Vektor-Embedding für Postgres pgvector(1536).
   * Mappt lokale Modelle wie 'nomic-embed-text' (768 Dims) automatisch auf 1536 Dimensionen.
   * Wenn Ollama offline ist oder ein Timeout auftritt, greift ein deterministisches Fallback-Embedding.
   */
  async createEmbedding(
    text: string,
    options?: { model?: string; dimensions?: number }
  ): Promise<number[]> {
    const targetDim = options?.dimensions || PGVECTOR_DIMENSIONS;
    try {
      const rawVector = await this.createRawEmbedding(text, options);
      return mapToPgVectorDimensions(rawVector, targetDim);
    } catch (err: any) {
      console.warn(
        `[Ollama Embedding Fallback] ${err.message || String(err)}. Erzeuge deterministisches ${targetDim}-Vektor-Fallback für pgvector.`
      );
      return generateDeterministicEmbedding(text, targetDim);
    }
  }
}

/**
 * Lokales vLLM (OpenAI-kompatibel über http://localhost:8000/v1)
 */
export class VllmProvider extends OpenAiCompatibleProvider {
  constructor(config: AiProviderConfig = {}) {
    super({
      baseUrl:
        config.baseUrl ||
        process.env.VLLM_BASE_URL ||
        process.env.AI_PROVIDER_BASE_URL ||
        "http://localhost:8000/v1",
      apiKey: config.apiKey || "token-vllm",
      chatModel:
        config.chatModel ||
        process.env.VLLM_MODEL ||
        "meta-llama/Meta-Llama-3-8B-Instruct",
      embeddingModel:
        config.embeddingModel ||
        process.env.VLLM_EMBEDDING_MODEL ||
        "BAAI/bge-m3",
      embeddingDimensions: config.embeddingDimensions || PGVECTOR_DIMENSIONS,
    });
  }
}

/**
 * Mappt beliebige Vektordimensionen (z. B. 768 von nomic-embed-text) präzise auf die
 * Vektordimension in Postgres pgvector(1536) via Zero-Padding und L2-Normalisierung.
 */
export function mapToPgVectorDimensions(
  vec: number[],
  targetDim: number = PGVECTOR_DIMENSIONS
): number[] {
  return normalizeToTargetDimensions(vec, targetDim);
}

/**
 * Passt Vektordimensionen präzise an (Zero-Padding oder Truncation),
 * sodass lokale Modelle mit 384/768 Dims nahtlos in der gleichen pgvector(1536) Spalte laufen.
 */
export function normalizeToTargetDimensions(
  vec: number[],
  targetDim: number = PGVECTOR_DIMENSIONS
): number[] {
  if (vec.length === targetDim) return vec;
  if (vec.length > targetDim) {
    const truncated = vec.slice(0, targetDim);
    const mag = Math.sqrt(truncated.reduce((acc, v) => acc + v * v, 0)) || 1;
    return truncated.map((v) => v / mag);
  }
  // Zero-Padding & Re-Normalisierung
  const padded = new Array(targetDim).fill(0);
  for (let i = 0; i < vec.length; i++) {
    padded[i] = vec[i];
  }
  const mag = Math.sqrt(padded.reduce((acc, v) => acc + v * v, 0)) || 1;
  return padded.map((v) => v / mag);
}

/**
 * Deterministische Vektor-Generierung für Offline/Fallback
 */
export function generateDeterministicEmbedding(
  text: string,
  targetDim: number = PGVECTOR_DIMENSIONS
): number[] {
  const vec = new Array(targetDim).fill(0);
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
    const index = Math.abs(hash) % targetDim;
    vec[index] += 1;
  }
  const mag = Math.sqrt(vec.reduce((acc, v) => acc + v * v, 0)) || 1;
  return vec.map((v) => v / mag);
}

/**
 * Factory zur Instanziierung des passenden AI-Providers
 */
export function createAiProvider(config: AiProviderConfig = {}): ILlmProvider {
  const providerType = (
    config.provider ||
    process.env.AI_PROVIDER ||
    (process.env.GEMINI_API_KEY ? "GEMINI" : "OPENAI")
  ).toUpperCase() as AiProviderType;

  switch (providerType) {
    case "GEMINI":
      return new GeminiProvider(config);
    case "OLLAMA":
      return new OllamaProvider(config);
    case "VLLM":
      return new VllmProvider(config);
    case "OPENAI":
    default:
      return new OpenAiCompatibleProvider(config);
  }
}

/**
 * Dynamischer Umschalter:
 * 1. Prüft den Mandanten (Tenant `aiConfig` aus der Datenbank)
 * 2. Nutzt Umgebungsvariablen (AI_PROVIDER, GEMINI_API_KEY, OLLAMA_BASE_URL, etc.) als Fallback
 */
export async function getAiProvider(
  tenantIdOrConfig?: string | AiProviderConfig,
  overrides?: Partial<AiProviderConfig>
): Promise<ILlmProvider> {
  if (typeof tenantIdOrConfig === "object" && tenantIdOrConfig !== null) {
    const merged = { ...tenantIdOrConfig, ...overrides };
    if (merged.task && !merged.chatModel && !merged.model) {
      merged.chatModel = await getLlmModelForTask(merged.task, merged);
    }
    return createAiProvider(merged);
  }

  const tenantId = typeof tenantIdOrConfig === "string" ? tenantIdOrConfig : undefined;
  const tenant = await findTenant(tenantId);

  if (tenant?.aiConfig) {
    const decryptedApiKey = tenant.aiConfig.apiKey
      ? decryptApiKey(tenant.aiConfig.apiKey)
      : undefined;

    const effectiveTask = overrides?.task;
    const taskModel = effectiveTask
      ? await getLlmModelForTask(effectiveTask, tenant.aiConfig)
      : undefined;

    return createAiProvider({
      provider: tenant.aiConfig.provider,
      baseUrl: tenant.aiConfig.endpointUrl?.trim() || undefined,
      apiKey: decryptedApiKey,
      chatModel: overrides?.chatModel || overrides?.model || taskModel || tenant.aiConfig.chatModel,
      embeddingModel: tenant.aiConfig.embeddingModel,
      embeddingDimensions: tenant.aiConfig.embeddingDimensions,
      routingModel: (tenant.aiConfig as any)?.routingModel,
      analyticsModel: (tenant.aiConfig as any)?.analyticsModel,
      tenantId: tenant.id,
      ...overrides,
    });
  }

  const merged = { ...overrides, tenantId };
  if (merged.task && !merged.chatModel && !merged.model) {
    merged.chatModel = await getLlmModelForTask(merged.task, merged);
  }
  return createAiProvider(merged);
}

/**
 * Ruft die gespeicherte KI-Konfiguration eines Mandanten ab oder liefert Defaults
 */
export async function getTenantAiConfig(tenantId?: string): Promise<{
  provider: AiProviderType;
  endpointUrl?: string;
  chatModel: string;
  embeddingModel: string;
  embeddingDimensions: 768 | 1536;
  hasApiKey?: boolean;
  maskedApiKey?: string;
  apiKey?: string;
  routingModel?: string;
  analyticsModel?: string;
}> {
  const tenant = await findTenant(tenantId);

  if (tenant?.aiConfig) {
    const storedKey = tenant.aiConfig.apiKey;
    const hasApiKey = Boolean(storedKey && storedKey.trim() !== "");
    const plainKey = hasApiKey ? decryptApiKey(storedKey) : undefined;
    const maskedKey = plainKey ? maskApiKey(plainKey) : undefined;

    return {
      ...tenant.aiConfig,
      hasApiKey,
      maskedApiKey: maskedKey,
      routingModel:
        (tenant.aiConfig as any)?.routingModel ||
        process.env.AI_ROUTING_MODEL ||
        process.env.GEMINI_ROUTING_MODEL ||
        DEFAULT_ROUTING_MODEL,
      analyticsModel:
        (tenant.aiConfig as any)?.analyticsModel ||
        process.env.AI_ANALYTICS_MODEL ||
        process.env.GEMINI_ANALYTICS_MODEL ||
        DEFAULT_ANALYTICS_MODEL,
    };
  }

  const rawProvider = (
    process.env.AI_PROVIDER ||
    (process.env.GEMINI_API_KEY ? "GEMINI" : "OPENAI")
  ).toUpperCase() as AiProviderType;

  const provider: AiProviderType =
    rawProvider === "OLLAMA"
      ? "OLLAMA"
      : rawProvider === "VLLM"
      ? "VLLM"
      : rawProvider === "GEMINI"
      ? "GEMINI"
      : "OPENAI";

  const defaultEndpoint =
    process.env.AI_PROVIDER_BASE_URL ||
    (provider === "OLLAMA"
      ? process.env.OLLAMA_BASE_URL || OLLAMA_DEFAULT_BASE_URL
      : provider === "VLLM"
      ? process.env.VLLM_BASE_URL || "http://localhost:8000/v1"
      : "");

  const defaultChatModel =
    process.env.AI_MODEL_NAME ||
    (provider === "OLLAMA"
      ? process.env.OLLAMA_MODEL || OLLAMA_DEFAULT_CHAT_MODEL
      : provider === "VLLM"
      ? process.env.VLLM_MODEL || "meta-llama/Meta-Llama-3-8B-Instruct"
      : provider === "GEMINI" || process.env.GEMINI_API_KEY
      ? process.env.GEMINI_MODEL || "gemini-1.5-flash"
      : process.env.OPENAI_MODEL || "gpt-4o");

  const defaultEmbeddingModel =
    process.env.AI_EMBEDDING_MODEL ||
    (provider === "OLLAMA"
      ? process.env.OLLAMA_EMBEDDING_MODEL || OLLAMA_DEFAULT_EMBEDDING_MODEL
      : provider === "VLLM"
      ? process.env.VLLM_EMBEDDING_MODEL || "BAAI/bge-m3"
      : provider === "GEMINI" || process.env.GEMINI_API_KEY
      ? process.env.GEMINI_EMBEDDING_MODEL || "text-embedding-004"
      : "text-embedding-3-small");

  const defaultDimensions: 768 | 1536 =
    provider === "OLLAMA" ||
    defaultEmbeddingModel.includes("nomic") ||
    defaultEmbeddingModel === "text-embedding-004" ||
    (provider === "GEMINI" && defaultEmbeddingModel.includes("text-embedding-004"))
      ? 768
      : 1536;

  const envKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;

  const routingModel =
    process.env.AI_ROUTING_MODEL ||
    process.env.GEMINI_ROUTING_MODEL ||
    DEFAULT_ROUTING_MODEL;

  const analyticsModel =
    process.env.AI_ANALYTICS_MODEL ||
    process.env.GEMINI_ANALYTICS_MODEL ||
    DEFAULT_ANALYTICS_MODEL;

  return {
    provider,
    endpointUrl: defaultEndpoint,
    chatModel: defaultChatModel,
    embeddingModel: defaultEmbeddingModel,
    embeddingDimensions: defaultDimensions,
    hasApiKey: Boolean(envKey),
    maskedApiKey: envKey ? maskApiKey(envKey) : undefined,
    routingModel,
    analyticsModel,
  };
}

/**
 * Aktualisiert die KI-Konfiguration des Mandanten in der Datenbank
 */
export async function updateTenantAiConfig(
  tenantId: string,
  newConfig: {
    provider: AiProviderType;
    endpointUrl?: string;
    chatModel: string;
    embeddingModel: string;
    embeddingDimensions?: 768 | 1536;
    apiKey?: string;
    routingModel?: string;
    analyticsModel?: string;
  }
): Promise<{
  provider: AiProviderType;
  endpointUrl?: string;
  chatModel: string;
  embeddingModel: string;
  embeddingDimensions: 768 | 1536;
  hasApiKey?: boolean;
  maskedApiKey?: string;
  apiKey?: string;
  routingModel?: string;
  analyticsModel?: string;
}> {
  const safeDim: 768 | 1536 =
    newConfig.embeddingDimensions === 768 ||
    newConfig.embeddingModel === "text-embedding-004" ||
    (newConfig.provider === "GEMINI" && newConfig.embeddingModel.includes("text-embedding-004"))
      ? 768
      : 1536;

  // Vorhandenen Mandanten laden, um API-Key bei leerem Update nicht zu verlieren
  const tenant = await findTenant(tenantId);
  const realTenantId = tenant ? tenant.id : tenantId;
  let keyToSave: string | undefined = tenant?.aiConfig?.apiKey;

  if (newConfig.apiKey !== undefined) {
    const trimmed = newConfig.apiKey.trim();
    if (trimmed && !trimmed.includes("••••") && !trimmed.includes("****")) {
      keyToSave = encryptApiKey(trimmed);
    } else if (trimmed === "") {
      keyToSave = undefined;
    }
  }

  const configToSave = {
    provider: newConfig.provider,
    endpointUrl: newConfig.endpointUrl?.trim() || undefined,
    chatModel: newConfig.chatModel.trim(),
    embeddingModel: newConfig.embeddingModel.trim(),
    embeddingDimensions: safeDim,
    apiKey: keyToSave,
    routingModel: newConfig.routingModel?.trim() || undefined,
    analyticsModel: newConfig.analyticsModel?.trim() || undefined,
  };

  await db
    .update(tenants)
    .set({
      aiConfig: configToSave,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, realTenantId));

  const hasApiKey = Boolean(keyToSave);
  const plainKey = hasApiKey ? decryptApiKey(keyToSave) : undefined;

  return {
    ...configToSave,
    routingModel: configToSave.routingModel || DEFAULT_ROUTING_MODEL,
    analyticsModel: configToSave.analyticsModel || DEFAULT_ANALYTICS_MODEL,
    hasApiKey,
    maskedApiKey: plainKey ? maskApiKey(plainKey) : undefined,
  };
}

/**
 * Prüft aktiv die Verbindung zu einem LLM-Endpunkt (Cloud oder lokal)
 */
export async function testAiConnection(config: AiProviderConfig): Promise<{
  success: boolean;
  message: string;
  latencyMs: number;
  model: string;
  provider: AiProviderType;
  error?: string;
  status?: "Online" | "Offline";
  details?: Record<string, unknown>;
}> {
  const providerType = (
    config.provider ||
    process.env.AI_PROVIDER ||
    (config.apiKey?.startsWith("AIza") ? "GEMINI" : "OPENAI")
  ).toUpperCase() as AiProviderType;

  const rawModel =
    config.chatModel ||
    config.model ||
    (providerType === "GEMINI"
      ? process.env.GEMINI_MODEL || process.env.AI_MODEL_NAME || "gemini-3.8-flash"
      : providerType === "OLLAMA"
      ? process.env.OLLAMA_MODEL || OLLAMA_DEFAULT_CHAT_MODEL
      : providerType === "VLLM"
      ? process.env.VLLM_MODEL || "meta-llama/Meta-Llama-3-8B-Instruct"
      : process.env.AI_MODEL_NAME || process.env.OPENAI_MODEL || "gpt-4o");

  const selectedModel = providerType === "GEMINI" ? normalizeGeminiModel(rawModel) : rawModel;

  if (providerType === "GEMINI") {
    const gemini = new GeminiProvider({ ...config, chatModel: selectedModel });
    const geminiRes = await gemini.testConnection({ model: selectedModel });
    return {
      success: geminiRes.success,
      latencyMs: geminiRes.latencyMs,
      model: geminiRes.model || selectedModel,
      message: geminiRes.message,
      error: geminiRes.error,
      status: geminiRes.success ? "Online" : "Offline",
      provider: "GEMINI",
      details: { error: geminiRes.error },
    };
  }

  const provider = createAiProvider({ ...config, chatModel: selectedModel });
  const start = Date.now();

  try {
    const timeoutMs = providerType === "OLLAMA" ? 5000 : 3500;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `Timeout (${timeoutMs}ms) beim Erreichen des LLM-Endpunkts (${config.baseUrl || "Standard"})`
            )
          ),
        timeoutMs
      )
    );

    const testCompletionPromise = provider.createChatCompletion(
      [{ role: "user", content: "ping" }],
      { maxTokens: 10, temperature: 0.1, model: selectedModel }
    );

    const reply = await Promise.race([testCompletionPromise, timeoutPromise]);
    const latencyMs = Date.now() - start;

    return {
      success: true,
      message: `Verbindung zu ${providerType} erfolgreich hergestellt (${latencyMs}ms). Antwort: "${reply.trim().slice(0, 50)}"`,
      latencyMs,
      model: selectedModel,
      status: "Online",
      provider: providerType,
      details: { reply: reply.trim() },
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    const errorMsg = err?.message || String(err);

    let hint = "";
    let isInvalidKey = false;
    if (providerType === "OLLAMA") {
      hint = " Prüfe, ob Ollama lokal läuft (z. B. `ollama serve` oder `ollama run llama3`) und Port 11434 erreichbar ist.";
    } else if (providerType === "VLLM") {
      hint = " Prüfe, ob die vLLM-Instanz auf Port 8000 gestartet ist und das Modell übereinstimmt.";
    } else if (providerType === "OPENAI" || providerType === "GEMINI") {
      if (
        errorMsg.includes("401") ||
        errorMsg.includes("invalid_api_key") ||
        errorMsg.includes("Incorrect API key") ||
        errorMsg.includes("UNAUTHENTICATED")
      ) {
        isInvalidKey = true;
      }
      hint = " Prüfe, ob ein gültiger API-Key in der Konfiguration oder den Umgebungsvariablen hinterlegt ist.";
    }

    const finalError = isInvalidKey ? "API-Schlüssel ungültig oder abgelaufen" : errorMsg;

    return {
      success: false,
      message: isInvalidKey
        ? "API-Schlüssel ungültig oder abgelaufen"
        : `Verbindung zu ${providerType} nicht möglich: ${errorMsg}.${hint}`,
      error: finalError,
      latencyMs,
      model: selectedModel,
      status: "Offline",
      provider: providerType,
      details: {
        error: errorMsg,
        code: err?.code,
        isTimeout: err?.isTimeout ?? false,
      },
    };
  }
}

