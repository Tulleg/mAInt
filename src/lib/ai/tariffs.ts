import { z } from "zod";

/**
 * Hinterlegte Modell-Tarife für die exakte Kostenberechnung (Preise in EUR pro 1 Million Tokens).
 * On-Premise-Modelle (Ollama, vLLM) laufen lokal auf Werksinfrastruktur und sind daher mit 0 € hinterlegt.
 */
export interface ModelTariff {
  promptCostPer1M: number;
  completionCostPer1M: number;
}

export const MODEL_TARIFFS_EUR: Record<string, ModelTariff> = {
  // Google Gemini Cloud Modelle
  "gemini-3.8-flash": { promptCostPer1M: 0.10, completionCostPer1M: 0.40 },
  "gemini-2.5-flash": { promptCostPer1M: 0.075, completionCostPer1M: 0.30 },
  "gemini-2.5-pro": { promptCostPer1M: 1.25, completionCostPer1M: 5.00 },
  "gemini-2.0-flash": { promptCostPer1M: 0.10, completionCostPer1M: 0.40 },
  "gemini-1.5-flash": { promptCostPer1M: 0.075, completionCostPer1M: 0.30 },
  "gemini-1.5-pro": { promptCostPer1M: 1.25, completionCostPer1M: 5.00 },

  // OpenAI Cloud Modelle
  "gpt-4o": { promptCostPer1M: 2.30, completionCostPer1M: 9.20 },
  "gpt-4o-mini": { promptCostPer1M: 0.14, completionCostPer1M: 0.55 },
  "o3-mini": { promptCostPer1M: 1.00, completionCostPer1M: 4.00 },
  "gpt-4-turbo": { promptCostPer1M: 9.20, completionCostPer1M: 27.60 },

  // On-Premise / Lokale Open-Weights Modelle (Ollama / vLLM) -> 0.00 €
  "llama3.3:70b": { promptCostPer1M: 0.0, completionCostPer1M: 0.0 },
  "llama3.1": { promptCostPer1M: 0.0, completionCostPer1M: 0.0 },
  "llama3": { promptCostPer1M: 0.0, completionCostPer1M: 0.0 },
  "mistral": { promptCostPer1M: 0.0, completionCostPer1M: 0.0 },
  "deepseek-r1": { promptCostPer1M: 0.0, completionCostPer1M: 0.0 },
  "nomic-embed-text": { promptCostPer1M: 0.0, completionCostPer1M: 0.0 },
};

export const DEFAULT_FALLBACK_CLOUD_TARIFF: ModelTariff = {
  promptCostPer1M: 0.50,
  completionCostPer1M: 1.50,
};

export const DEFAULT_FALLBACK_LOCAL_TARIFF: ModelTariff = {
  promptCostPer1M: 0.0,
  completionCostPer1M: 0.0,
};

/**
 * Ermittelt den hinterlegten Tarif für ein spezifisches Modell
 */
export function getModelTariffEur(model: string, provider?: string): ModelTariff {
  const normProvider = (provider || "").toLowerCase().trim();
  if (normProvider === "ollama" || normProvider === "vllm") {
    return DEFAULT_FALLBACK_LOCAL_TARIFF;
  }

  const normModel = (model || "").toLowerCase().trim();
  if (MODEL_TARIFFS_EUR[normModel]) {
    return MODEL_TARIFFS_EUR[normModel];
  }

  for (const [key, tariff] of Object.entries(MODEL_TARIFFS_EUR)) {
    if (normModel.includes(key) || key.includes(normModel)) {
      return tariff;
    }
  }

  if (normModel.startsWith("gemini") && normModel.includes("pro")) {
    return MODEL_TARIFFS_EUR["gemini-2.5-pro"];
  }
  if (normModel.startsWith("gemini")) {
    return MODEL_TARIFFS_EUR["gemini-1.5-flash"];
  }
  if (normModel.startsWith("gpt-4o-mini")) {
    return MODEL_TARIFFS_EUR["gpt-4o-mini"];
  }
  if (normModel.startsWith("gpt-4")) {
    return MODEL_TARIFFS_EUR["gpt-4o"];
  }

  return DEFAULT_FALLBACK_CLOUD_TARIFF;
}

/**
 * Berechnet geschätzte Kosten in Euro anhand hinterlegter Modell-Tarife
 */
export function calculateModelCostEur(
  model: string,
  promptTokens: number,
  completionTokens: number,
  provider?: string
): number {
  const tariff = getModelTariffEur(model, provider);
  const promptCost = (promptTokens * tariff.promptCostPer1M) / 1_000_000;
  const completionCost = (completionTokens * tariff.completionCostPer1M) / 1_000_000;
  return Number((promptCost + completionCost).toFixed(6));
}

export interface TaskTypeSummary {
  taskType: "ROUTING" | "ANALYTICS" | "RAG_SYNTHESIS" | string;
  callCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  totalCostEur: number;
  averageLatencyMs: number;
}

export interface ProviderUsageSummary {
  provider: string;
  callCount: number;
  totalTokens: number;
  totalCostEur: number;
  averageLatencyMs: number;
}

export interface ModelUsageSummary {
  model: string;
  provider: string;
  callCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  totalCostEur: number;
  averageLatencyMs: number;
}

export interface AiUsageSummary {
  tenantId: string;
  period: {
    year: number;
    month: number;
    monthName: string;
    startDate: string;
    endDate: string;
  };
  totalCalls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  totalCostEur: number;
  averageLatencyMs: number;
  byTaskType: {
    ROUTING: TaskTypeSummary;
    ANALYTICS: TaskTypeSummary;
    RAG_SYNTHESIS: TaskTypeSummary;
    [key: string]: TaskTypeSummary;
  };
  taskTypeBreakdown: TaskTypeSummary[];
  byProvider: Record<string, ProviderUsageSummary>;
  byModel: Record<string, ModelUsageSummary>;
}

export interface GetAiUsageSummaryOptions {
  tenantId?: string;
  year?: number;
  month?: number;
}

export const logAiUsageInputSchema = z.object({
  tenantId: z.string().optional(),
  provider: z.string().min(1),
  model: z.string().min(1),
  taskType: z.enum(["ROUTING", "ANALYTICS", "RAG_SYNTHESIS"]).or(z.string()),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  estimatedCostEur: z.number().nonnegative().optional(),
});

export type LogAiUsageInput = z.infer<typeof logAiUsageInputSchema>;
