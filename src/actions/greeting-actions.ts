"use server";

import { getCurrentUserRbac } from "@/lib/rbac";
import {
  generateDynamicGreeting,
  determineShiftContext,
  getDeterministicFallbackGreeting,
  ShiftContext,
} from "@/lib/ai/greeting";
import {
  getGreetingTimeSlot,
  timeSlotToShiftContext,
  shiftContextToTimeSlot,
  GreetingTimeSlot,
} from "@/lib/greeting-utils";

export type { GreetingTimeSlot, ShiftContext };

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
