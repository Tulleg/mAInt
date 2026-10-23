import { z } from "zod";

/**
 * Standardisiertes Rückgabe-Muster für alle Server Actions im System:
 * { success: true, data: T } | { success: false, error: string }
 * Unterstützt optionale Abwärtskompatibilitäts-Felder über Generics.
 */
export type ActionResult<T = unknown, Extra extends Record<string, unknown> = Record<string, unknown>> =
  | ({ success: true; data: T; error?: undefined } & Extra)
  | ({ success: false; data?: null; error: string } & Partial<Extra>);

/**
 * Erzeugt eine erfolgreiche Server Action Rückgabe.
 */
export function actionSuccess<T, Extra extends Record<string, unknown> = Record<string, unknown>>(
  data: T,
  extra?: Extra
): { success: true; data: T } & Extra {
  return {
    success: true,
    data,
    ...(extra || ({} as Extra)),
  };
}

/**
 * Erzeugt eine fehlgeschlagene Server Action Rückgabe mit defensiver Fehlerbehandlung.
 */
export function actionError<Extra extends Record<string, unknown> = Record<string, unknown>>(
  error: string,
  extra?: Extra
): { success: false; error: string; data: null } & Partial<Extra> {
  return {
    success: false,
    error,
    data: null,
    ...(extra || ({} as Extra)),
  };
}

/**
 * Validiert Eingabeparameter strikt mit Zod vor Datenbankabfragen.
 */
export function validateWithZod<T>(
  schema: z.ZodType<T>,
  input: unknown
): { success: true; data: T } | { success: false; error: string } {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issueMessages = parsed.error.issues.map((i) => {
      const path = i.path.length > 0 ? `${i.path.join(".")}: ` : "";
      return `${path}${i.message}`;
    });
    return {
      success: false,
      error: `Validierungsfehler: ${issueMessages.join("; ")}`,
    };
  }
  return { success: true, data: parsed.data };
}
