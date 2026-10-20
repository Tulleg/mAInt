import { eq } from "drizzle-orm";
import { db } from "../db";
import { tenants } from "../db/schema";

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

/**
 * Universeller OpenAI-kompatibler Provider
 * Funktioniert sowohl mit OpenAI Cloud (api.openai.com) als auch mit
 * lokalen/self-hosted Endpunkten wie Ollama (/v1), vLLM, LMStudio oder LocalAI.
 */
export class OpenAiCompatibleProvider implements ILlmProvider {
  private baseUrl: string;
  private apiKey: string;
  private chatModel: string;
  private embeddingModel: string;
  private expectedEmbeddingDim: number;

  constructor(config: {
    baseUrl?: string;
    apiKey?: string;
    chatModel?: string;
    embeddingModel?: string;
    embeddingDimensions?: number;
  }) {
    // Falls AI_PROVIDER_BASE_URL gesetzt ist (z.B. http://localhost:11434/v1 für Ollama),
    // wird diese priorisiert, ansonsten Fallback auf https://api.openai.com/v1
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
      "ollama"; // Ollama benötigt oft nur einen Dummy-Key

    this.chatModel =
      config.chatModel ||
      process.env.AI_MODEL_NAME ||
      process.env.OPENAI_MODEL ||
      "gpt-4o";

    this.embeddingModel =
      config.embeddingModel ||
      process.env.AI_EMBEDDING_MODEL ||
      "text-embedding-3-small";

    this.expectedEmbeddingDim = config.embeddingDimensions || 1536;
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
      throw new Error(`LLM API Fehler (${response.status} ${response.statusText}): ${errText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  }

  async createEmbedding(text: string): Promise<number[]> {
    const url = `${this.baseUrl}/embeddings`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.embeddingModel,
        input: text.replace(/\n/g, " ").slice(0, 8000), // Max Chars Guard
      }),
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

    // Falls lokales Modell z.B. 768 Dimensionen (nomic-embed-text / bge-base) liefert,
    // normalisiere bzw. passe auf 1536 Dimensionen für pgvector an
    if (rawVector.length !== this.expectedEmbeddingDim) {
      return normalizeToTargetDimensions(rawVector, this.expectedEmbeddingDim);
    }

    return rawVector;
  }
}

/**
 * Passt Vektordimensionen präzise an (Zero-Padding oder Truncation),
 * sodass lokale Modelle mit 384/768 Dims nahtlos in der gleichen pgvector(1536) Spalte laufen.
 */
function normalizeToTargetDimensions(vec: number[], targetDim: number): number[] {
  if (vec.length === targetDim) return vec;
  if (vec.length > targetDim) {
    const truncated = vec.slice(0, targetDim);
    const mag = Math.sqrt(truncated.reduce((acc, v) => acc + v * v, 0)) || 1;
    return truncated.map((v) => v / mag);
  }
  // Zero-Padding
  const padded = new Array(targetDim).fill(0);
  for (let i = 0; i < vec.length; i++) {
    padded[i] = vec[i];
  }
  return padded;
}

/**
 * Factory zur Auflösung des konfigurierten AI-Providers pro Tenant
 */
export async function getAiProvider(tenantId?: string): Promise<ILlmProvider> {
  if (tenantId) {
    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, tenantId),
    });

    if (tenant?.aiConfig) {
      return new OpenAiCompatibleProvider({
        baseUrl: tenant.aiConfig.endpointUrl,
        chatModel: tenant.aiConfig.chatModel,
        embeddingModel: tenant.aiConfig.embeddingModel,
        embeddingDimensions: tenant.aiConfig.embeddingDimensions,
      });
    }
  }

  // Globaler Fallback via Umgebungsvariablen
  return new OpenAiCompatibleProvider({});
}
