export type ShiftContext = "MORNING" | "NOON" | "AFTERNOON" | "EVENING" | "NIGHT";

export type GreetingTimeSlot = "morgen" | "mahlzeit" | "tag" | "abend" | "nacht";

/**
 * Ermittelt das passende Schicht- bzw. Tageszeit-Fenster (ShiftContext):
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

/**
 * Deterministischer Fallback-Pool für ShiftContext:
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
  text = text.split("\n")[0].trim();
  text = text.replace(/^["'„“»«`]+|["'„“»«`]+$/g, "").trim();
  text = text.replace(/^(\*\*|\*|__|_)|(\*\*|\*|__|_)$/g, "").trim();
  return text;
}
