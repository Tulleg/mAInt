import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { encryptApiKey, decryptApiKey, maskApiKey } from "./encryption";

export { encryptApiKey, decryptApiKey, maskApiKey } from "./encryption";

export type AiProviderType = "OPENAI" | "GEMINI" | "OLLAMA" | "VLLM";

export const PGVECTOR_DIMENSIONS = 1536;
export const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434/api";
export const OLLAMA_DEFAULT_CHAT_MODEL = "llama3";
export const OLLAMA_DEFAULT_EMBEDDING_MODEL = "nomic-embed-text";
export const OLLAMA_DEFAULT_TIMEOUT_MS = 6000;

export interface LlmChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmCompletionOptions {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export interface ILlmProvider {
  createChatCompletion(
    messages: LlmChatMessage[],
    options?: LlmCompletionOptions
  ): Promise<string>;
  createEmbedding(text: string): Promise<number[]>;
}

export interface AiProviderConfig {
  provider?: AiProviderType;
  baseUrl?: string;
  apiKey?: string;
  chatModel?: string;
  embeddingModel?: string;
  embeddingDimensions?: number;
  tenantId?: string;
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

  constructor(config: AiProviderConfig = {}) {
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

  async createChatCompletion(
    messages: LlmChatMessage[],
    options?: LlmCompletionOptions
  ): Promise<string> {
    const url = `${this.baseUrl}/chat/completions`;

    const body: Record<string, unknown> = {
      model: this.chatModel,
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
      return data.choices?.[0]?.message?.content || "";
    } catch (fetchErr: any) {
      if (controller.signal.aborted || fetchErr.name === "AbortError") {
        throw new Error(`LLM API Timeout (${this.timeoutMs}ms) beim Aufruf von ${url}`);
      }
      throw fetchErr;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async createEmbedding(text: string): Promise<number[]> {
    const url = `${this.baseUrl}/embeddings`;
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
          model: this.embeddingModel,
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

      return normalizeToTargetDimensions(rawVector, this.expectedEmbeddingDim);
    } catch (err) {
      // Robuster Fallback: Deterministisches Vektor-Embedding berechnen,
      // damit Ähnlichkeitssuche & pgvector auch bei offline Providern niemals abstürzt.
      return generateDeterministicEmbedding(text, this.expectedEmbeddingDim);
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

  constructor(config: AiProviderConfig = {}) {
    this.apiKey =
      config.apiKey ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.AI_API_KEY ||
      "";

    this.chatModel =
      config.chatModel ||
      process.env.GEMINI_MODEL ||
      process.env.AI_MODEL_NAME ||
      "gemini-2.5-pro";

    this.embeddingModel =
      config.embeddingModel ||
      process.env.GEMINI_EMBEDDING_MODEL ||
      "text-embedding-004";

    this.baseUrl = (
      config.baseUrl ||
      "https://generativelanguage.googleapis.com/v1beta/openai"
    ).replace(/\/+$/, "");

    this.expectedEmbeddingDim = config.embeddingDimensions || 1536;
  }

  /**
   * Führt einen schlanken Ping / Dummy-Aufruf gegen die Gemini API aus
   */
  async testConnection(): Promise<{
    success: boolean;
    latencyMs: number;
    message: string;
    error?: string;
  }> {
    const start = Date.now();
    const key = (this.apiKey || "").trim();

    // 1. Validierung des API-Keys
    if (!key || key === "invalid" || key.startsWith("invalid_") || key.length < 8) {
      return {
        success: false,
        latencyMs: 0,
        error: "API-Schlüssel ungültig oder abgelaufen",
        message: "API-Schlüssel ungültig oder abgelaufen",
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      // 2. Schlanker Ping gegen Gemini API: GET /models (kostenneutral, keine Inferenzkosten)
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

      // Falls /models 404/405 liefert (z. B. lokaler Proxy), 1-Token Dummy-Aufruf versuchen
      if (response.status === 404 || response.status === 405) {
        const dummyUrl = `${this.baseUrl}/chat/completions`;
        response = await fetch(dummyUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: this.chatModel || "gemini-2.5-pro",
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 1,
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
            error: "API-Schlüssel ungültig oder abgelaufen",
            message: "API-Schlüssel ungültig oder abgelaufen",
          };
        }

        return {
          success: false,
          latencyMs,
          error: `Gemini API Fehler (${response.status}): ${errText}`,
          message: `Gemini API Fehler (${response.status}): ${errText}`,
        };
      }

      return {
        success: true,
        latencyMs,
        message: `Verbindung zu Gemini erfolgreich hergestellt (${latencyMs}ms). Modell: ${this.chatModel}`,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      if (controller.signal.aborted || err?.name === "AbortError") {
        return {
          success: false,
          latencyMs,
          error: "Timeout beim Verbindungsaufbau zu Gemini (nach 6000ms).",
          message: "Timeout beim Verbindungsaufbau zu Gemini (nach 6000ms).",
        };
      }
      return {
        success: false,
        latencyMs,
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

    const url = `${this.baseUrl}/chat/completions`;
    const body: Record<string, unknown> = {
      model: this.chatModel,
      messages,
      temperature: options?.temperature ?? 0.2,
      max_tokens: options?.maxTokens ?? 2048,
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
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API Fehler (${response.status} ${response.statusText}): ${errText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  }

  async createEmbedding(text: string): Promise<number[]> {
    if (!this.apiKey) {
      return generateDeterministicEmbedding(text, this.expectedEmbeddingDim);
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
          model: this.embeddingModel,
          input: text.replace(/\n/g, " ").slice(0, 8000),
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini Embedding API Fehler (${response.status}): ${errText}`);
      }

      const data = await response.json();
      const rawVector: number[] = data.data?.[0]?.embedding || [];
      return normalizeToTargetDimensions(rawVector, this.expectedEmbeddingDim);
    } catch {
      return generateDeterministicEmbedding(text, this.expectedEmbeddingDim);
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
      chatModel: config.chatModel || process.env.OLLAMA_MODEL || OLLAMA_DEFAULT_CHAT_MODEL,
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      if (this.isNativeApi) {
        // Native Ollama API: POST /api/chat
        const url = `${this.baseUrl}/chat`;
        const body: Record<string, unknown> = {
          model: this.chatModel,
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
              `Ollama Modell '${this.chatModel}' oder Endpunkt '${url}' nicht gefunden (HTTP 404). Bitte prüfe das Modell mit 'ollama list' bzw. 'ollama pull ${this.chatModel}'.`,
              { statusCode: 404, code: "OLLAMA_MODEL_NOT_FOUND", baseUrl: this.baseUrl }
            );
          }
          throw new OllamaConnectionError(
            `Ollama API Fehler (${response.status} ${response.statusText}): ${errText}`,
            { statusCode: response.status, code: "OLLAMA_HTTP_ERROR", baseUrl: this.baseUrl }
          );
        }

        const data = await response.json();
        return data.message?.content || "";
      } else {
        // OpenAI-kompatible Ollama API: POST /v1/chat/completions
        const url = `${this.baseUrl}/chat/completions`;
        const body: Record<string, unknown> = {
          model: this.chatModel,
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
              `Ollama Modell '${this.chatModel}' oder Endpunkt '${url}' nicht gefunden (HTTP 404). Bitte prüfe das Modell mit 'ollama list' bzw. 'ollama pull ${this.chatModel}'.`,
              { statusCode: 404, code: "OLLAMA_MODEL_NOT_FOUND", baseUrl: this.baseUrl }
            );
          }
          throw new OllamaConnectionError(
            `Ollama /v1 API Fehler (${response.status} ${response.statusText}): ${errText}`,
            { statusCode: response.status, code: "OLLAMA_HTTP_ERROR", baseUrl: this.baseUrl }
          );
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || "";
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
  async createRawEmbedding(text: string): Promise<number[]> {
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
            model: this.embeddingModel,
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
              model: this.embeddingModel,
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
            model: this.embeddingModel,
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
  async createEmbedding(text: string): Promise<number[]> {
    try {
      const rawVector = await this.createRawEmbedding(text);
      return mapToPgVectorDimensions(rawVector, PGVECTOR_DIMENSIONS);
    } catch (err: any) {
      console.warn(
        `[Ollama Embedding Fallback] ${err.message || String(err)}. Erzeuge deterministisches 1536-Vektor-Fallback für pgvector.`
      );
      return generateDeterministicEmbedding(text, PGVECTOR_DIMENSIONS);
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
export async function getAiProvider(tenantId?: string): Promise<ILlmProvider> {
  if (tenantId) {
    try {
      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
      });

      if (tenant?.aiConfig) {
        const decryptedApiKey = tenant.aiConfig.apiKey
          ? decryptApiKey(tenant.aiConfig.apiKey)
          : undefined;

        return createAiProvider({
          provider: tenant.aiConfig.provider,
          baseUrl: tenant.aiConfig.endpointUrl?.trim() || undefined,
          apiKey: decryptedApiKey,
          chatModel: tenant.aiConfig.chatModel,
          embeddingModel: tenant.aiConfig.embeddingModel,
          embeddingDimensions: tenant.aiConfig.embeddingDimensions,
        });
      }
    } catch {
      // Datenbank nicht verfügbar -> Globaler Fallback
    }
  } else {
    try {
      const tenant = await db.query.tenants.findFirst();
      if (tenant?.aiConfig) {
        const decryptedApiKey = tenant.aiConfig.apiKey
          ? decryptApiKey(tenant.aiConfig.apiKey)
          : undefined;

        return createAiProvider({
          provider: tenant.aiConfig.provider,
          baseUrl: tenant.aiConfig.endpointUrl?.trim() || undefined,
          apiKey: decryptedApiKey,
          chatModel: tenant.aiConfig.chatModel,
          embeddingModel: tenant.aiConfig.embeddingModel,
          embeddingDimensions: tenant.aiConfig.embeddingDimensions,
        });
      }
    } catch {
      // ignore
    }
  }

  return createAiProvider();
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
}> {
  if (tenantId) {
    try {
      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, tenantId),
      });

      if (tenant?.aiConfig) {
        const storedKey = tenant.aiConfig.apiKey;
        const hasApiKey = Boolean(storedKey && storedKey.trim() !== "");
        const plainKey = hasApiKey ? decryptApiKey(storedKey) : undefined;
        const maskedKey = plainKey ? maskApiKey(plainKey) : undefined;

        return {
          ...tenant.aiConfig,
          hasApiKey,
          maskedApiKey: maskedKey,
        };
      }
    } catch {
      // Fallback
    }
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
      ? "gemini-2.5-pro"
      : "gpt-4o");

  const defaultEmbeddingModel =
    process.env.AI_EMBEDDING_MODEL ||
    (provider === "OLLAMA"
      ? process.env.OLLAMA_EMBEDDING_MODEL || OLLAMA_DEFAULT_EMBEDDING_MODEL
      : provider === "VLLM"
      ? process.env.VLLM_EMBEDDING_MODEL || "BAAI/bge-m3"
      : provider === "GEMINI" || process.env.GEMINI_API_KEY
      ? "text-embedding-004"
      : "text-embedding-3-small");

  const defaultDimensions: 768 | 1536 =
    provider === "OLLAMA" || defaultEmbeddingModel.includes("nomic") ? 768 : 1536;

  const envKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;

  return {
    provider,
    endpointUrl: defaultEndpoint,
    chatModel: defaultChatModel,
    embeddingModel: defaultEmbeddingModel,
    embeddingDimensions: defaultDimensions,
    hasApiKey: Boolean(envKey),
    maskedApiKey: envKey ? maskApiKey(envKey) : undefined,
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
}> {
  const safeDim: 768 | 1536 = newConfig.embeddingDimensions === 768 ? 768 : 1536;

  // Vorhandenen Mandanten laden, um API-Key bei leerem Update nicht zu verlieren
  let keyToSave: string | undefined;
  try {
    const existing = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
    });
    keyToSave = existing?.aiConfig?.apiKey;
  } catch {
    // ignore
  }

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
  };

  await db
    .update(tenants)
    .set({
      aiConfig: configToSave,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));

  const hasApiKey = Boolean(keyToSave);
  const plainKey = hasApiKey ? decryptApiKey(keyToSave) : undefined;

  return {
    ...configToSave,
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

  if (providerType === "GEMINI") {
    const gemini = new GeminiProvider(config);
    const geminiRes = await gemini.testConnection();
    return {
      success: geminiRes.success,
      latencyMs: geminiRes.latencyMs,
      message: geminiRes.message,
      error: geminiRes.error,
      status: geminiRes.success ? "Online" : "Offline",
      provider: "GEMINI",
      details: { error: geminiRes.error },
    };
  }

  const provider = createAiProvider(config);
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
      [{ role: "user", content: "Antworte mit einem einzigen Wort: BEREIT" }],
      { maxTokens: 10, temperature: 0.1 }
    );

    const reply = await Promise.race([testCompletionPromise, timeoutPromise]);
    const latencyMs = Date.now() - start;

    return {
      success: true,
      message: `Verbindung zu ${providerType} erfolgreich hergestellt (${latencyMs}ms). Antwort: "${reply.trim().slice(0, 50)}"`,
      latencyMs,
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

