"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import {
  AiProviderConfig,
  AiProviderType,
  getTenantAiConfig,
  updateTenantAiConfig,
  testAiConnection,
  decryptApiKey,
} from "@/lib/ai/provider";
import { actionSuccess, actionError, validateWithZod } from "./action-utils";

function safeRevalidatePath(path: string) {
  try {
    revalidatePath(path);
  } catch (_) {
    // Graceful no-op when outside Next.js request lifecycle
  }
}

const updateConfigSchema = z.object({
  tenantId: z.string().min(1, "Tenant-ID darf nicht leer sein."),
  newConfig: z.object({
    provider: z.enum(["OPENAI", "GEMINI", "OLLAMA", "VLLM"]),
    endpointUrl: z.string().optional(),
    apiKey: z.string().optional(),
    chatModel: z.string().min(1, "Chat-Modell ist erforderlich."),
    embeddingModel: z.string().min(1, "Embedding-Modell ist erforderlich."),
    embeddingDimensions: z.union([z.literal(768), z.literal(1536)]).optional(),
  }),
});

const testConfigSchema = z.object({
  provider: z.enum(["OPENAI", "GEMINI", "OLLAMA", "VLLM"]).or(z.string()),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  chatModel: z.string().optional(),
  embeddingModel: z.string().optional(),
  tenantId: z.string().optional(),
});

export type TenantAiConfigResponse = {
  provider: AiProviderType;
  endpointUrl?: string;
  chatModel: string;
  embeddingModel: string;
  embeddingDimensions: 768 | 1536;
  hasApiKey?: boolean;
  maskedApiKey?: string;
  apiKey?: string;
};

export type TestAiProviderResult = {
  success: boolean;
  latencyMs: number;
  message: string;
  error?: string;
  status?: "Online" | "Offline";
  provider?: AiProviderType;
  data?: any;
};

/**
 * Server Action: Ruft die aktuelle KI-Provider-Konfiguration ab
 */
export async function getTenantAiConfigAction(
  tenantId?: string
): Promise<TenantAiConfigResponse & { success: boolean; data: TenantAiConfigResponse; error?: string }> {
  try {
    if (tenantId && typeof tenantId === "string") {
      const parsed = z.string().safeParse(tenantId);
      if (!parsed.success) {
        const fallback = await getTenantAiConfig();
        return Object.assign(fallback, {
          success: false,
          error: "Ungültige Tenant-ID übergeben.",
          data: fallback,
        });
      }
    }
    const config = await getTenantAiConfig(tenantId);
    return Object.assign(config, {
      success: true as const,
      data: config,
    });
  } catch (err: any) {
    const fallback = await getTenantAiConfig();
    return Object.assign(fallback, {
      success: false,
      error: err?.message || "Fehler beim Abrufen der KI-Konfiguration.",
      data: fallback,
    });
  }
}

/**
 * Server Action: Aktualisiert die KI-Provider-Konfiguration für einen Mandanten
 */
export async function updateTenantAiConfigAction(
  tenantId: string,
  newConfig: {
    provider: AiProviderType;
    endpointUrl?: string;
    apiKey?: string;
    chatModel: string;
    embeddingModel: string;
    embeddingDimensions?: 768 | 1536;
  }
) {
  try {
    const validation = validateWithZod(updateConfigSchema, { tenantId, newConfig });
    if (!validation.success) {
      return actionError(validation.error);
    }

    const updated = await updateTenantAiConfig(tenantId, newConfig);
    safeRevalidatePath("/admin/ai-settings");
    safeRevalidatePath("/admin/ai");
    safeRevalidatePath("/admin/settings");
    safeRevalidatePath("/analytics");
    safeRevalidatePath("/orders/new");

    return actionSuccess(updated, { config: updated });
  } catch (err: any) {
    return actionError(err?.message || "Fehler beim Aktualisieren der KI-Konfiguration.");
  }
}

/**
 * Server Action: Testet live die Erreichbarkeit eines KI-Providers (speziell schlanker Ping für Gemini)
 * Gibt bei Erfolg { success: true, latencyMs: number } zurück (für grünes Status-Badge "Online")
 * und bei ungültigem API-Key die aussagekräftige Fehlermeldung "API-Schlüssel ungültig oder abgelaufen".
 */
export async function testAiProviderConnectionAction(
  configOrProvider: AiProviderConfig | string = "GEMINI",
  apiKeyOptional?: string
): Promise<TestAiProviderResult> {
  let config: AiProviderConfig & { tenantId?: string };

  if (typeof configOrProvider === "string") {
    config = {
      provider: configOrProvider.toUpperCase() as AiProviderType,
      apiKey: apiKeyOptional,
    };
  } else {
    config = { ...configOrProvider };
    if (!config.provider) {
      config.provider = "GEMINI";
    } else {
      config.provider = config.provider.toUpperCase() as AiProviderType;
    }
    if (apiKeyOptional && !config.apiKey) {
      config.apiKey = apiKeyOptional;
    }
  }

  // Falls kein API-Key im Request übergeben wurde, aber eine tenantId hinterlegt ist:
  // Verschlüsselten Key aus der Mandanten-Konfiguration in der Datenbank laden und entschlüsseln
  if (!config.apiKey && config.tenantId) {
    try {
      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, config.tenantId),
      });
      if (tenant?.aiConfig?.apiKey) {
        config.apiKey = decryptApiKey(tenant.aiConfig.apiKey);
      }
    } catch {
      // ignore
    }
  }

  try {
    const validation = validateWithZod(testConfigSchema, config);
    if (!validation.success) {
      return {
        success: false,
        latencyMs: 0,
        error: validation.error,
        message: validation.error,
        status: "Offline",
        provider: config.provider,
        data: null,
      };
    }

    const testRes = await testAiConnection(config);

    if (!testRes.success) {
      const isAuthError =
        testRes.error === "API-Schlüssel ungültig oder abgelaufen" ||
        testRes.message === "API-Schlüssel ungültig oder abgelaufen" ||
        (testRes.error &&
          (testRes.error.includes("API_KEY_INVALID") ||
            testRes.error.includes("API key not valid") ||
            testRes.error.includes("UNAUTHENTICATED") ||
            testRes.error.includes("401")));

      const finalError = isAuthError
        ? "API-Schlüssel ungültig oder abgelaufen"
        : testRes.error || testRes.message;

      return {
        success: false,
        latencyMs: testRes.latencyMs || 0,
        error: finalError,
        message: finalError,
        status: "Offline",
        provider: testRes.provider,
        data: testRes,
      };
    }

    return {
      success: true,
      latencyMs: testRes.latencyMs,
      message: testRes.message,
      status: "Online",
      provider: testRes.provider,
      data: testRes,
    };
  } catch (err: any) {
    const msg = err?.message || "Verbindungstest fehlgeschlagen.";
    const isAuth =
      msg.includes("API_KEY_INVALID") ||
      msg.includes("API key not valid") ||
      msg.includes("UNAUTHENTICATED") ||
      msg.includes("401");

    const finalError = isAuth ? "API-Schlüssel ungültig oder abgelaufen" : msg;

    return {
      success: false,
      latencyMs: 0,
      error: finalError,
      message: finalError,
      status: "Offline",
      provider: config?.provider,
      data: null,
    };
  }
}

/**
 * Server Action: Testet live die Erreichbarkeit eines LLM-Endpunkts (Alias)
 */
export async function testAiConnectionAction(config: AiProviderConfig) {
  return testAiProviderConnectionAction(config);
}
