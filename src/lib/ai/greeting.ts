import { ILlmProvider, getAiProvider } from "./provider";

export type ShiftContext = "MORNING" | "NOON" | "AFTERNOON" | "EVENING" | "NIGHT";

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
 * Ermittelt das passende industrielle Schicht- bzw. Tageszeit-Fenster basierend auf der aktuellen Uhrzeit:
 * - MORNING: 05:00 - 10:59 (Frühschicht)
 * - NOON: 11:00 - 13:59 (Mittagsschicht / Pause)
 * - AFTERNOON: 14:00 - 17:59 (Nachmittagsschicht)
 * - EVENING: 18:00 - 21:59 (Spätschicht)
 * - NIGHT: 22:00 - 04:59 (Nachtschicht)
 */
export function determineShiftContext(date: Date = new Date()): ShiftContext {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) {
    return "MORNING";
  }
  if (hour >= 11 && hour < 14) {
    return "NOON";
  }
  if (hour >= 14 && hour < 18) {
    return "AFTERNOON";
  }
  if (hour >= 18 && hour < 22) {
    return "EVENING";
  }
  return "NIGHT";
}

/**
 * Deterministischer Fallback-Pool:
 * Exakt 4 Varianten pro Zeitfenster (humorvoll, industriell, prägnant, max 6 bis 8 Wörter).
 */
export const FALLBACK_GREETING_POOL: Record<ShiftContext, [string, string, string, string]> = {
  MORNING: [
    "Guten Morgen {name}! Die Anlagen laufen bereits.",
    "Moin {name}! Bereit für die Frühschicht?",
    "Guten Morgen {name}! Kaffee steht bereit.",
    "Frühschicht aktiv, {name}! Packen wir es an.",
  ],
  NOON: [
    "Mahlzeit {name}! Erste Tageshälfte erfolgreich geschafft.",
    "Guten Mittag {name}! Alles im grünen Bereich.",
    "Mahlzeit {name}! Die Produktion läuft stabil weiter.",
    "Guten Appetit und frohes Schaffen, {name}!",
  ],
  AFTERNOON: [
    "Schönen Nachmittag {name}! Weiterhin volle Produktivität.",
    "Hallo {name}! Der Endspurt des Tages läuft.",
    "Guten Nachmittag {name}! Alle Takte im Soll.",
    "Auf geht's {name}, der Nachmittag ruft!",
  ],
  EVENING: [
    "Guten Abend {name}! Schichtübergabe sauber vorbereiten.",
    "N'Abend {name}! Die Spätschicht meistert das.",
    "Guten Abend {name}! Qualitätsprüfung läuft reibungslos.",
    "Schönen Feierabend-Vorausblick, {name}! Saubere Leistung heute.",
  ],
  NIGHT: [
    "Ruhige Nachtschicht gewünscht, {name}! Wachsam bleiben.",
    "Gute Nachtschicht {name}! Die Hallen laufen stabil.",
    "Nachtschicht aktiv, {name}! Wir halten die Stellung.",
    "Guten Abend zur Nacht, {name}! Störungsfreie Stunden.",
  ],
};

/**
 * Erzeugt einen stabilen, deterministischen Index basierend auf dem Namen.
 */
export function getDeterministicIndex(seed: string, poolSize: number = 4): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % poolSize;
}

/**
 * Liefert eine deterministische Fallback-Begrüßung aus dem Pool.
 */
export function getDeterministicFallbackGreeting(
  shiftContext: ShiftContext,
  firstName: string,
  variantIndex?: number
): string {
  const pool = FALLBACK_GREETING_POOL[shiftContext] || FALLBACK_GREETING_POOL.MORNING;
  const cleanName = (firstName || "Kollege").trim();
  const index =
    typeof variantIndex === "number" && variantIndex >= 0 && variantIndex < pool.length
      ? variantIndex
      : getDeterministicIndex(cleanName, pool.length);

  const template = pool[index];
  return template.replace(/\{name\}/g, cleanName);
}

/**
 * Bereinigt die KI-Antwort von Anführungszeichen, Markdown-Markern und mehrzeiligen Ausgaben.
 */
export function cleanGreetingText(raw: string): string {
  if (!raw) return "";
  let text = raw.trim();
  // Erste Zeile extrahieren
  text = text.split("\n")[0].trim();
  // Führende und nachgestellte Anführungszeichen / Zitatzeichen entfernen
  text = text.replace(/^["'„“»«`]+|["'„“»«`]+$/g, "").trim();
  // Markdown Fett/Kursiv entfernen
  text = text.replace(/^(\*\*|\*|__|_)|(\*\*|\*|__|_)$/g, "").trim();
  return text;
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
