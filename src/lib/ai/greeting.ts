import { ILlmProvider, getAiProvider } from "./provider";
import {
  determineShiftContext,
  getDeterministicFallbackGreeting,
  cleanGreetingText,
  ShiftContext,
  FALLBACK_GREETING_POOL,
  getDeterministicIndex,
} from "@/lib/greeting-utils";

export {
  determineShiftContext,
  getDeterministicFallbackGreeting,
  cleanGreetingText,
  FALLBACK_GREETING_POOL,
  getDeterministicIndex,
};
export type { ShiftContext };

export interface GenerateDynamicGreetingParams {
  firstName: string;
  role?: string;
  shiftContext?: ShiftContext;
  plantName?: string;
  tenantId?: string;
}

export interface DynamicGreetingResult {
  greeting: string;
  shiftContext: ShiftContext;
  isFallback: boolean;
  provider?: string;
}

/**
 * Ruft den konfigurierten LLM-Provider mit Low-Temperature (0.7) und striktem Prompt auf,
 * oder greift bei Timeout/Offline-Status auf den deterministischen Pool zurück.
 */
export async function generateDynamicGreeting(
  params: GenerateDynamicGreetingParams,
  customProvider?: ILlmProvider
): Promise<DynamicGreetingResult> {
  const firstName = (params.firstName || "Kollege").trim();
  const role = params.role?.trim() || "Mitarbeiter";
  const shiftContext = params.shiftContext || determineShiftContext();
  const plantName = params.plantName?.trim();

  const systemPrompt = `Du bist der humorvolle, aber professionelle KI-Assistent einer industriellen Fertigung (MaintAI). Generiere eine einzige kurze Begrüßungszeile (maximal 6 bis 8 Wörter) für ${firstName} (${role}), passend zur Tageszeit ${shiftContext}. Antworte NUR mit dem Begrüßungssatz, keine Anführungszeichen, keine Erklärungen.`;

  const userPrompt = plantName
    ? `Begrüße ${firstName} (${role}) am Standort ${plantName} zur Schicht ${shiftContext}.`
    : `Begrüße ${firstName} (${role}) zur Schicht ${shiftContext}.`;

  try {
    const aiProvider = customProvider || (await getAiProvider(params.tenantId, { task: "greeting" }));
    const TIMEOUT_MS = 3500;

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timeout (${TIMEOUT_MS}ms) bei KI-Begrüßung`)),
        TIMEOUT_MS
      )
    );

    const completionPromise = aiProvider.createChatCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        temperature: 0.7,
        maxTokens: 50,
        task: "greeting",
      }
    );

    const rawReply = await Promise.race([completionPromise, timeoutPromise]);
    const cleaned = cleanGreetingText(rawReply);

    if (cleaned.length > 0) {
      return {
        greeting: cleaned,
        shiftContext,
        isFallback: false,
        provider: aiProvider.getChatModel ? aiProvider.getChatModel() : undefined,
      };
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("[generateDynamicGreeting] LLM nicht erreichbar oder Timeout, aktiviere Fallback:", err);
    }
  }

  // Deterministischer Fallback
  return {
    greeting: getDeterministicFallbackGreeting(shiftContext, firstName),
    shiftContext,
    isFallback: true,
  };
}
