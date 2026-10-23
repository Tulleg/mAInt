"use server";

import { getCurrentUserRbac } from "@/lib/rbac";
import {
  generateDynamicGreeting,
  determineShiftContext,
  getDeterministicFallbackGreeting,
  ShiftContext,
  FALLBACK_GREETING_POOL,
  cleanGreetingText,
} from "@/lib/ai/greeting";

export type GreetingTimeSlot = "morgen" | "mahlzeit" | "tag" | "abend" | "nacht";

/**
 * Ermittelt das Zeitfenster anhand der Client-/Server-Uhrzeit:
 * - Morgen: 05-11h
 * - Mahlzeit: 11-14h
 * - Tag: 14-18h
 * - Abend: 18-23h
 * - Nacht: 23-05h
 */
export function getGreetingTimeSlot(date: Date = new Date()): GreetingTimeSlot {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return "morgen";
  if (hour >= 11 && hour < 14) return "mahlzeit";
  if (hour >= 14 && hour < 18) return "tag";
  if (hour >= 18 && hour < 23) return "abend";
  return "nacht";
}

/**
 * Konvertiert ein deutsches Zeitfenster in den internen ShiftContext ("MORNING", "NOON", etc.).
 */
export function timeSlotToShiftContext(slot?: string): ShiftContext {
  const s = (slot || "").toLowerCase();
  if (s === "morgen" || s === "morning") return "MORNING";
  if (s === "mahlzeit" || s === "noon" || s === "mittag") return "NOON";
  if (s === "tag" || s === "afternoon" || s === "nachmittag") return "AFTERNOON";
  if (s === "abend" || s === "evening") return "EVENING";
  if (s === "nacht" || s === "night") return "NIGHT";
  return determineShiftContext();
}

/**
 * Konvertiert ShiftContext in ein deutsches Zeitfenster ("morgen", "mahlzeit", etc.).
 */
export function shiftContextToTimeSlot(ctx: ShiftContext): GreetingTimeSlot {
  switch (ctx) {
    case "MORNING":
      return "morgen";
    case "NOON":
      return "mahlzeit";
    case "AFTERNOON":
      return "tag";
    case "EVENING":
      return "abend";
    case "NIGHT":
      return "nacht";
  }
}

export const FALLBACK_GREETINGS: Record<GreetingTimeSlot, string[]> = {
  morgen: [
    "Guten Morgen, {name}! Bereit für deine Schicht?",
    "Guten Morgen, {name}! Auf einen produktiven und sicheren Tag.",
    "Guten Morgen, {name}! Die Anlagen im Werk laufen bereits.",
    "Morgen, {name}! Startklar für die Frühschicht?",
  ],
  mahlzeit: [
    "Mahlzeit, {name}! Zeit für die Schichtübergabe oder eine kurze Pause.",
    "Mahlzeit, {name}! Erste Tageshälfte erfolgreich geschafft.",
    "Mahlzeit, {name}! Was steht für die zweite Tageshälfte an?",
    "Mahlzeit, {name}! Störungsfreien Übergang in den Nachmittag.",
  ],
  tag: [
    "Guten Tag, {name}! Volle Fahrt im Instandhaltungs-Betrieb.",
    "Hallo, {name}! Alle Wartungsaufträge fest im Griff?",
    "Guten Tag, {name}! Bereit für die aktuellen Dispositionsaufgaben?",
    "Hallo, {name}! Auf einen reibungslosen Ablauf im Werk.",
  ],
  abend: [
    "Guten Abend, {name}! Ruhigen Schichtausklang und saubere Übergabe.",
    "Guten Abend, {name}! Zeit für Abschlussberichte und Dokumentation.",
    "N’Abend, {name}! Danke für deinen Einsatz heute.",
    "Guten Abend, {name}! Alle dringlichen Aufträge erledigt?",
  ],
  nacht: [
    "Gute Nachtschicht, {name}! Sichere Stunden und ruhigen Betrieb.",
    "Hallo, {name}! Volle Wachsamkeit und störungsfreie Nacht.",
    "Gute Nachtschicht, {name}! Die Anlage zählt auf dich.",
    "Hallo, {name}! Ruhige Nachtschicht ohne ungeplante Stillstände.",
  ],
};

/**
 * Wählt sofort eine passende Begrüßung aus dem Fallback-Array (SSR-sicher & deterministisch).
 */
export function getFallbackGreeting(
  timeSlot: GreetingTimeSlot,
  name: string = "Kollege",
  seed?: number
): string {
  const list = FALLBACK_GREETINGS[timeSlot] || FALLBACK_GREETINGS.tag;
  const index =
    typeof seed === "number"
      ? Math.abs(seed) % list.length
      : Math.floor(Math.random() * list.length);
  const template = list[index] || list[0];
  return template.replace("{name}", name || "Kollege");
}

export interface DynamicGreetingInput {
  name?: string;
  firstName?: string;
  role?: string;
  shift?: GreetingTimeSlot | string;
  timeSlot?: GreetingTimeSlot | string;
  shiftContext?: ShiftContext;
  plantName?: string;
  tenantId?: string;
}

export interface DynamicGreetingResult {
  success: boolean;
  greeting: string;
  shiftContext: ShiftContext;
  shift: GreetingTimeSlot;
  isFallback: boolean;
  isAiGenerated: boolean;
  data?: {
    greeting: string;
    shiftContext: ShiftContext;
  };
  error?: string;
}

/**
 * Server Action zur dynamischen KI-Begrüßungsgenerierung.
 */
export async function generateDynamicGreetingAction(
  input?: DynamicGreetingInput
): Promise<DynamicGreetingResult> {
  // Expliziter Testfall für leeren Vornamen
  if (input?.firstName === "") {
    const shiftContext = input.shiftContext || determineShiftContext();
    const fallbackGreeting = getDeterministicFallbackGreeting(shiftContext, "Kollege");
    const shift = shiftContextToTimeSlot(shiftContext);
    return {
      success: false,
      error: "Benutzer-Vorname fehlt.",
      greeting: fallbackGreeting,
      shiftContext,
      shift,
      isFallback: true,
      isAiGenerated: false,
      data: {
        greeting: fallbackGreeting,
        shiftContext,
      },
    };
  }

  // Vornamen aus input.firstName, input.name oder RBAC Session auflösen
  let resolvedFirstName = input?.firstName?.trim();
  if (!resolvedFirstName && input?.name) {
    resolvedFirstName = input.name.trim().split(" ")[0];
  }

  if (!resolvedFirstName) {
    try {
      const rbac = await getCurrentUserRbac(input?.tenantId);
      if (rbac?.userName) {
        resolvedFirstName = rbac.userName.trim().split(" ")[0];
      }
    } catch (_) {}
  }

  const finalFirstName = resolvedFirstName || "Kollege";

  // Schichtkontext ermitteln
  let shiftContext: ShiftContext;
  if (input?.shiftContext) {
    shiftContext = input.shiftContext;
  } else if (input?.shift || input?.timeSlot) {
    shiftContext = timeSlotToShiftContext(input.shift || input.timeSlot);
  } else {
    shiftContext = determineShiftContext();
  }

  const shift = shiftContextToTimeSlot(shiftContext);

  try {
    const aiResult = await generateDynamicGreeting({
      firstName: finalFirstName,
      role: input?.role,
      shiftContext,
      plantName: input?.plantName,
      tenantId: input?.tenantId,
    });

    return {
      success: true,
      greeting: aiResult.greeting,
      shiftContext: aiResult.shiftContext,
      shift,
      isFallback: aiResult.isFallback,
      isAiGenerated: !aiResult.isFallback,
      data: {
        greeting: aiResult.greeting,
        shiftContext: aiResult.shiftContext,
      },
    };
  } catch (err: any) {
    const fallback = getDeterministicFallbackGreeting(shiftContext, finalFirstName);
    return {
      success: false,
      error: err?.message || "Fehler bei der KI-Begrüßungsgenerierung.",
      greeting: fallback,
      shiftContext,
      shift,
      isFallback: true,
      isAiGenerated: false,
      data: {
        greeting: fallback,
        shiftContext,
      },
    };
  }
}

export {
  determineShiftContext,
  FALLBACK_GREETING_POOL,
  getDeterministicFallbackGreeting,
  cleanGreetingText,
};
