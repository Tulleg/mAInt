import { db } from "@/db";
import { areas, equipments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAiProvider } from "./provider";

export type CopilotIntentType =
  | "QUERY_ORDERS"
  | "CREATE_ORDER"
  | "UPDATE_VIEW_CONFIG"
  | "ANALYTICS_CHART";

export type OrderPriority = "1_EMERGENCY" | "2_HIGH" | "3_MEDIUM" | "4_LOW";
export type DisplayDensity = "compact" | "standard" | "detailed";

export interface QueryOrdersParams {
  areaId?: string;
  areaName?: string;
  statusList: string[]; // z.B. ['ERFASST', 'IN_ARBEIT']
  priorityList: OrderPriority[];
  equipmentId?: string;
  equipmentName?: string;
  searchQuery?: string;
}

export interface CreateOrderParams {
  title: string;
  description: string;
  equipmentKeyword?: string;
  matchedEquipmentId?: string;
  equipmentName?: string;
  priority: OrderPriority;
  areaId?: string;
  areaName?: string;
  damageCode?: string;
  plannedDurationMinutes?: number;
}

export interface UpdateViewConfigParams {
  refreshInterval?: number; // Sekunden: 0 (Aus), 30, 60, 300 etc.
  displayDensity?: DisplayDensity;
}

export interface AnalyticsChartParams {
  metric?: string;
  chartType: "bar" | "line" | "pie" | "kpi" | "table";
  analyticsPrompt: string;
  targetEquipmentId?: string;
  timeRange?: string;
}

export interface ClarificationOption {
  id: string;
  label: string;
  value: string;
  field: "area" | "equipment" | "general";
  description?: string;
}

export interface ClarificationResult {
  needed: boolean;
  field?: "area" | "equipment" | "general";
  question?: string;
  options: ClarificationOption[];
}

export interface CopilotClassificationResult {
  intent: CopilotIntentType;
  confidence: number;
  explanation: string;
  queryOrders?: QueryOrdersParams;
  createOrder?: CreateOrderParams;
  updateViewConfig?: UpdateViewConfigParams;
  analyticsChart?: AnalyticsChartParams;
  clarification: ClarificationResult;
  rawPrompt: string;
}

export interface CopilotChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  intent?: CopilotIntentType;
  clarificationSelection?: {
    field: "area" | "equipment" | "general";
    id: string;
    value: string;
  };
}

export interface ClassifyCopilotInputPayload {
  tenantId?: string;
  prompt: string;
  chatHistory?: CopilotChatMessage[];
  availableAreas?: Array<{ id: string; name: string; code: string; description?: string | null }>;
  availableEquipments?: Array<{ id: string; name: string; equipmentNumber: string; description?: string | null }>;
  selectedOptionId?: string;
  clarificationSelection?: {
    field: "area" | "equipment" | "general";
    id: string;
    value: string;
  };
}

// Fallback-Stammdaten für isolierte Umgebungen / Offline / Demos
export const FALLBACK_AREAS = [
  { id: "area-h01", code: "AREA-H01", name: "Halle 1 - Karosseriebau", description: "Rohbau, Punktschweiß-Robotik, Karosserie-Strukturfertigung" },
  { id: "area-h02", code: "AREA-H02", name: "Halle 2 - Lackiererei", description: "Kathodische Tauchlackierung (KTL), Decklackierung, Öfen" },
  { id: "area-prod-3", code: "AREA-PROD-3", name: "Halle 3 - Endmontage", description: "Montagelinie, Endabnahme, Finish" },
  { id: "area-infra", code: "AREA-INFRA", name: "Bereich Infrastruktur & Zentrale Medien", description: "Kühlschmierstoff-Aufbereitung, Druckluftkompressoren, Hydraulik" },
  { id: "area-log", code: "AREA-LOG", name: "Bereich Logistik & Hochregallager", description: "FTS, Fördertechnik, Wareneingang" },
];

export const FALLBACK_EQUIPMENTS = [
  { id: "eq-10001001", equipmentNumber: "EQ-10001001", name: "KUKA KR 210 R2700 - Roboter 01", description: "Rohbau Zelle 3" },
  { id: "eq-10001002", equipmentNumber: "EQ-10001002", name: "Siemens Simotics S-1FK7 Servomotor", description: "Antrieb Achse 2" },
  { id: "eq-10001003", equipmentNumber: "EQ-10001003", name: "Grundfos CR 45-3 - Hochdruck-Kreiselpumpe", description: "Kühlwasserkreislauf Pumpe P-102" },
  { id: "eq-10001004", equipmentNumber: "EQ-10001004", name: "Atlas Copco GA 37 VSD+ - Schraubenkompressor", description: "Zentrale Druckluftstation" },
  { id: "eq-10001005", equipmentNumber: "EQ-10001005", name: "Kreiselpumpe KSB Etanorm (P-101)", description: "Kühlschmierstoff-Kreislauf Pumpe P-101" },
  { id: "eq-10001006", equipmentNumber: "EQ-10001006", name: "KUKA Palettierer - Linie 2", description: "Verpackungsbereich End-of-Line" },
];

/**
 * Lädt verfügbare Bereiche (Areas) und Anlagen (Equipments) aus der DB oder Fallbacks
 */
async function loadContextData(tenantId?: string, overrideAreas?: any[], overrideEquipments?: any[]) {
  let areaList = overrideAreas && overrideAreas.length > 0 ? overrideAreas : null;
  let equipmentList = overrideEquipments && overrideEquipments.length > 0 ? overrideEquipments : null;

  if (!areaList || !equipmentList) {
    try {
      if (tenantId) {
        if (!areaList) {
          const dbAreas = await db.query.areas.findMany({
            where: eq(areas.tenantId, tenantId),
          });
          if (dbAreas && dbAreas.length > 0) {
            areaList = dbAreas;
          }
        }
        if (!equipmentList) {
          const dbEq = await db.query.equipments.findMany({
            where: eq(equipments.tenantId, tenantId),
          });
          if (dbEq && dbEq.length > 0) {
            equipmentList = dbEq;
          }
        }
      }
    } catch (e) {
      // DB nicht verfügbar - Graceful Fallback
    }
  }

  return {
    areas: areaList && areaList.length > 0 ? areaList : FALLBACK_AREAS,
    equipments: equipmentList && equipmentList.length > 0 ? equipmentList : FALLBACK_EQUIPMENTS,
  };
}

/**
 * Filtert und prüft Bereiche auf Eindeutigkeit oder Mehrdeutigkeit (Clarification Loop)
 */
export function evaluateAreaAmbiguity(
  areaKeyword: string | undefined,
  allAreas: Array<{ id: string; name: string; code: string; description?: string | null }>
): {
  matchedAreaId?: string;
  matchedAreaName?: string;
  isAmbiguous: boolean;
  question?: string;
  options: ClarificationOption[];
} {
  if (!areaKeyword || areaKeyword.trim() === "") {
    return { isAmbiguous: false, options: [] };
  }

  const needle = areaKeyword.toLowerCase().trim();

  // 1. Exakter Match auf ID, Code oder Name
  const exactMatch = allAreas.find(
    (a) =>
      a.id.toLowerCase() === needle ||
      a.code.toLowerCase() === needle ||
      a.name.toLowerCase() === needle
  );
  if (exactMatch) {
    return {
      matchedAreaId: exactMatch.id,
      matchedAreaName: exactMatch.name,
      isAmbiguous: false,
      options: [],
    };
  }

  // 2. Substring Match auf Name, Code oder Beschreibung
  const matched = allAreas.filter((a) => {
    const nameMatch = a.name.toLowerCase().includes(needle);
    const codeMatch = a.code.toLowerCase().includes(needle);
    const descMatch = a.description ? a.description.toLowerCase().includes(needle) : false;
    return nameMatch || codeMatch || descMatch;
  });

  if (matched.length === 1) {
    return {
      matchedAreaId: matched[0].id,
      matchedAreaName: matched[0].name,
      isAmbiguous: false,
      options: [],
    };
  }

  if (matched.length > 1) {
    return {
      isAmbiguous: true,
      question: `Mehrere Bereiche für "${areaKeyword}" gefunden. Welchen Bereich meinst du genau?`,
      options: matched.map((a) => ({
        id: a.id,
        label: a.name,
        value: a.name,
        field: "area",
        description: a.description || undefined,
      })),
    };
  }

  // 3. Keyword angegeben, aber keine Übereinstimmung gefunden
  if (allAreas.length > 0) {
    return {
      isAmbiguous: true,
      question: `Bereich "${areaKeyword}" wurde nicht gefunden. Welchen Bereich meinst du?`,
      options: allAreas.map((a) => ({
        id: a.id,
        label: a.name,
        value: a.name,
        field: "area",
        description: a.description || undefined,
      })),
    };
  }

  return { isAmbiguous: false, options: [] };
}

/**
 * Filtert und prüft Equipments / Aggregate auf Mehrdeutigkeit (Clarification Loop)
 */
export function evaluateEquipmentAmbiguity(
  equipmentKeyword: string | undefined,
  allEquipments: Array<{ id: string; name: string; equipmentNumber: string; description?: string | null }>
): {
  matchedEquipmentId?: string;
  matchedEquipmentName?: string;
  isAmbiguous: boolean;
  question?: string;
  options: ClarificationOption[];
} {
  if (!equipmentKeyword || equipmentKeyword.trim() === "") {
    return { isAmbiguous: false, options: [] };
  }

  const needle = equipmentKeyword.toLowerCase().trim();

  // 1. Exakter Match auf ID, Equipment-Nummer oder Name
  const exactMatch = allEquipments.find(
    (e) =>
      e.id.toLowerCase() === needle ||
      e.equipmentNumber.toLowerCase() === needle ||
      e.name.toLowerCase() === needle
  );
  if (exactMatch) {
    return {
      matchedEquipmentId: exactMatch.id,
      matchedEquipmentName: exactMatch.name,
      isAmbiguous: false,
      options: [],
    };
  }

  // 2. Substring Match auf Name, Equipment-Nummer oder Beschreibung
  const matched = allEquipments.filter((e) => {
    const nameMatch = e.name.toLowerCase().includes(needle);
    const numMatch = e.equipmentNumber.toLowerCase().includes(needle);
    const descMatch = e.description ? e.description.toLowerCase().includes(needle) : false;
    return nameMatch || numMatch || descMatch;
  });

  if (matched.length === 1) {
    return {
      matchedEquipmentId: matched[0].id,
      matchedEquipmentName: matched[0].name,
      isAmbiguous: false,
      options: [],
    };
  }

  if (matched.length > 1) {
    return {
      isAmbiguous: true,
      question: `Mehrere Aggregate/Anlagen für "${equipmentKeyword}" gefunden. Welches Gerät ist betroffen?`,
      options: matched.map((e) => ({
        id: e.id,
        label: `${e.name} (${e.equipmentNumber})`,
        value: e.name,
        field: "equipment",
        description: e.description || undefined,
      })),
    };
  }

  // 3. Keyword angegeben, aber keine direkte Übereinstimmung
  if (allEquipments.length > 0) {
    return {
      isAmbiguous: true,
      question: `Aggregat "${equipmentKeyword}" wurde nicht gefunden. Welches Gerät ist betroffen?`,
      options: allEquipments.slice(0, 8).map((e) => ({
        id: e.id,
        label: `${e.name} (${e.equipmentNumber})`,
        value: e.name,
        field: "equipment",
        description: e.description || undefined,
      })),
    };
  }

  return { isAmbiguous: false, options: [] };
}

/**
 * Heuristik zur Extraktion von View-Config Parametern
 */
export function extractViewConfigParams(lower: string): UpdateViewConfigParams | null {
  const isViewConfigQuery =
    lower.includes("aktualisier") ||
    lower.includes("refresh") ||
    lower.includes("sekunde") ||
    lower.includes("minute") ||
    lower.includes("intervall") ||
    lower.includes("ansicht") ||
    lower.includes("dichte") ||
    lower.includes("kompakt") ||
    lower.includes("detailliert") ||
    lower.includes("standardansicht");

  if (!isViewConfigQuery) return null;

  let refreshInterval: number | undefined;
  let displayDensity: DisplayDensity | undefined;

  // Intervall-Erkennung: Deaktivierung (wortgenau prüfen, um z. B. '30 sek' nicht fälschlich als '0 sek' zu matchen)
  const isDeactivation =
    /\b(?:aus|ausschalten|abschalten|deaktivieren|deaktiviere|deaktiviert|stopp|stoppen|nie|kein\s+auto-refresh|keine\s+aktualisierung|kein|keine)\b/i.test(lower) ||
    /\b0\s*(?:s|sek|sekunde|sekunden)\b/i.test(lower);

  if (isDeactivation) {
    refreshInterval = 0;
  } else {
    // Regex für Sekunden (z. B. "30 Sekunden", "30s", "alle 30s", "45 sekunden")
    const secMatch = lower.match(/(?:alle|jede|intervall\s*(?:von)?\s*)?(\d+)\s*(?:s|sek|sekunde|sekunden)\b/i);
    // Regex für Minuten (z. B. "1 Minute", "1m", "alle 5m", "2 min")
    const minMatch = lower.match(/(?:alle|jede|intervall\s*(?:von)?\s*)?(\d+)\s*(?:m|min|minute|minuten)\b/i);

    if (secMatch) {
      refreshInterval = parseInt(secMatch[1], 10);
    } else if (minMatch) {
      refreshInterval = parseInt(minMatch[1], 10) * 60;
    } else if (lower.includes("30")) {
      refreshInterval = 30;
    } else if (lower.includes("60")) {
      refreshInterval = 60;
    }
  }

  // Dichte-Erkennung
  if (lower.includes("kompakt")) {
    displayDensity = "compact";
  } else if (lower.includes("detail") || lower.includes("detailliert") || lower.includes("ausführlich")) {
    displayDensity = "detailed";
  } else if (lower.includes("standard") || lower.includes("normal")) {
    displayDensity = "standard";
  }

  if (refreshInterval !== undefined || displayDensity !== undefined) {
    return { refreshInterval, displayDensity };
  }

  return null;
}

/**
 * Extrahiert den Bereichs-Suchbegriff aus einem Freitext
 */
export function extractAreaKeyword(prompt: string, lower: string): string | undefined {
  // 1. Muster mit Präfixen wie "in Bereich <X>", "im Bereich <X>", "für Bereich <X>", "in Halle <X>", "Halle <X>"
  const areaRegex = /(?:in\s+(?:den\s+|der\s+|dem\s+)?bereich|im\s+bereich|für\s+bereich|bereich|in\s+halle|halle)\s+([a-zA-Z0-9\-_]+(?:\s+[a-zA-Z0-9\-_]+)?)/i;
  const match = prompt.match(areaRegex);

  if (match) {
    const rawCandidate = match[1].trim();
    // Stopwords, die oft direkt nach dem Bereichsnamen im Satz folgen
    const stopWords = new Set([
      "stehen",
      "anstehen",
      "an",
      "gibt",
      "es",
      "sind",
      "haben",
      "offen",
      "offene",
      "offener",
      "zeigen",
      "neu",
      "neue",
      "anstehend",
      "aufgelistet",
      "bitte",
    ]);
    const words = rawCandidate.split(/\s+/);
    const cleanedWords = words.filter((w) => !stopWords.has(w.toLowerCase()));
    if (cleanedWords.length > 0) {
      return cleanedWords.join(" ");
    }
    return rawCandidate;
  }

  // 2. Bekannte Bereichs-Schlagworte
  if (lower.includes("rohbau")) return "rohbau";
  if (lower.includes("lackiererei") || lower.includes("lackierung")) return "lackiererei";
  if (lower.includes("montage") || lower.includes("endmontage")) return "montage";
  if (lower.includes("infrastruktur")) return "infrastruktur";
  if (lower.includes("logistik")) return "logistik";
  if (lower.includes("halle")) return "halle";

  return undefined;
}

/**
 * Regelbasierter Heuristik-Fallback für schnelle Intent-Klassifikation und Resilienz
 */
export function heuristicIntentClassification(
  prompt: string,
  allAreas: Array<{ id: string; name: string; code: string; description?: string | null }>,
  allEquipments: Array<{ id: string; name: string; equipmentNumber: string; description?: string | null }>
): CopilotClassificationResult {
  const lower = prompt.toLowerCase().trim();

  // 1. UPDATE_VIEW_CONFIG
  const viewConfig = extractViewConfigParams(lower);
  if (viewConfig && (viewConfig.refreshInterval !== undefined || viewConfig.displayDensity !== undefined)) {
    return {
      intent: "UPDATE_VIEW_CONFIG",
      confidence: 0.95,
      explanation: "Ansichtseinstellungen erkannt (Auto-Refresh / Informationsdichte).",
      updateViewConfig: viewConfig,
      clarification: { needed: false, options: [] },
      rawPrompt: prompt,
    };
  }

  // 2. ANALYTICS_CHART
  const isAnalytics =
    lower.includes("diagramm") ||
    lower.includes("grafik") ||
    lower.includes("chart") ||
    lower.includes("statistik") ||
    lower.includes("auswertung") ||
    lower.includes("kennzahl") ||
    lower.includes("mttr") ||
    lower.includes("mtbf") ||
    lower.includes("ausfallzeit") ||
    lower.includes("trend") ||
    lower.includes("wie viele störungen") ||
    lower.includes("häufigste fehler");

  if (isAnalytics) {
    let chartType: AnalyticsChartParams["chartType"] = "bar";
    if (lower.includes("kuchen") || lower.includes("pie") || lower.includes("verteilung") || lower.includes("anteil")) {
      chartType = "pie";
    } else if (lower.includes("verlauf") || lower.includes("linie") || lower.includes("trend") || lower.includes("line")) {
      chartType = "line";
    } else if (lower.includes("kpi") || lower.includes("kennzahl") || lower.includes("wert")) {
      chartType = "kpi";
    } else if (lower.includes("tabelle") || lower.includes("table")) {
      chartType = "table";
    }

    return {
      intent: "ANALYTICS_CHART",
      confidence: 0.9,
      explanation: "Analytische Abfrage für Kennzahlen und Visualisierung erkannt.",
      analyticsChart: {
        analyticsPrompt: prompt,
        chartType,
        metric: lower.includes("mttr") ? "MTTR" : lower.includes("mtbf") ? "MTBF" : "Störungen",
        timeRange: lower.includes("woche") ? "Letzte Woche" : lower.includes("monat") ? "Letzter Monat" : undefined,
      },
      clarification: { needed: false, options: [] },
      rawPrompt: prompt,
    };
  }

  // 3. CREATE_ORDER vs QUERY_ORDERS
  const isCreateAction =
    !lower.startsWith("welche") &&
    !lower.startsWith("zeige") &&
    !lower.startsWith("liste") &&
    !lower.startsWith("gibt es") &&
    (
      lower.includes("leckt") ||
      lower.includes("qualmt") ||
      lower.includes("raucht") ||
      lower.includes("blockiert") ||
      lower.includes("steht still") ||
      lower.includes("stillstand") ||
      lower.includes("störung melden") ||
      lower.includes("neue störung") ||
      lower.includes("neuen auftrag") ||
      lower.includes("störung erfassen") ||
      lower.includes("schaden melden") ||
      lower.includes("kaputt") ||
      lower.includes("defekt") ||
      lower.includes("ausfall an") ||
      lower.includes("überhitzung") ||
      lower.includes("ungewöhnliches geräusch") ||
      lower.includes("quietscht") ||
      lower.includes("verliert öl") ||
      lower.includes("tropft") ||
      lower.includes("undicht")
    );

  if (isCreateAction) {
    // Equipment-Keyword extrahieren
    let equipmentKeyword: string | undefined;
    if (lower.includes("pumpe")) equipmentKeyword = "pumpe";
    else if (lower.includes("kuka") || lower.includes("roboter")) equipmentKeyword = "kuka";
    else if (lower.includes("motor") || lower.includes("servomotor")) equipmentKeyword = "motor";
    else if (lower.includes("kompressor")) equipmentKeyword = "kompressor";

    // Spezifische Codes prüfen wie P-102 oder KR210 oder EQ-10001001
    const codeMatch = prompt.match(/\b([A-Z]+-[0-9]+|KR\s?[0-9]+|EQ-[0-9]+)\b/i);
    if (codeMatch) {
      equipmentKeyword = codeMatch[1];
    }

    const eqEval = evaluateEquipmentAmbiguity(equipmentKeyword, allEquipments);

    let priority: OrderPriority = "3_MEDIUM";
    if (lower.includes("stillstand") || lower.includes("havarie") || lower.includes("notfall") || lower.includes("sofort") || lower.includes("prio 1")) {
      priority = "1_EMERGENCY";
    } else if (lower.includes("dringend") || lower.includes("wichtig") || lower.includes("schnell") || lower.includes("prio 2")) {
      priority = "2_HIGH";
    } else if (lower.includes("niedrig") || lower.includes("gering") || lower.includes("prio 4")) {
      priority = "4_LOW";
    }

    const createParams: CreateOrderParams = {
      title: prompt.slice(0, 80),
      description: prompt,
      equipmentKeyword,
      matchedEquipmentId: eqEval.matchedEquipmentId,
      equipmentName: eqEval.matchedEquipmentName,
      priority,
      plannedDurationMinutes: 60,
    };

    return {
      intent: "CREATE_ORDER",
      confidence: 0.88,
      explanation: "Nutzer meldet eine neue Störung / Schadensfall.",
      createOrder: createParams,
      clarification: {
        needed: eqEval.isAmbiguous,
        field: "equipment",
        question: eqEval.question,
        options: eqEval.options,
      },
      rawPrompt: prompt,
    };
  }

  // 4. Default: QUERY_ORDERS (Nutzer sucht Störungen/Aufträge)
  // Bereichsextraktion
  let matchedAreaId: string | undefined;
  let matchedAreaName: string | undefined;
  let areaKeyword = extractAreaKeyword(prompt, lower);

  // Zuerst prüfen, ob ein Bereich direkt im Volltext vorkommt
  const directAreaMatch = allAreas.find(
    (a) =>
      lower.includes(a.code.toLowerCase()) ||
      lower.includes(a.name.toLowerCase())
  );
  if (directAreaMatch) {
    matchedAreaId = directAreaMatch.id;
    matchedAreaName = directAreaMatch.name;
    areaKeyword = directAreaMatch.name;
  }

  const areaEval = matchedAreaId
    ? { matchedAreaId, matchedAreaName, isAmbiguous: false, options: [], question: undefined }
    : evaluateAreaAmbiguity(areaKeyword, allAreas);

  // Status-Erkennung
  const statusList: string[] = [];
  if (lower.includes("offen") || lower.includes("offene") || lower.includes("anstehen") || lower.includes("anstehend") || lower.includes("aktuell")) {
    statusList.push("ERFASST", "IN_ARBEIT");
  }
  if (lower.includes("erfasst") || lower.includes("neu") || lower.includes("gemeldet")) {
    if (!statusList.includes("ERFASST")) statusList.push("ERFASST");
  }
  if (lower.includes("in arbeit") || lower.includes("in bearbeitung")) {
    if (!statusList.includes("IN_ARBEIT")) statusList.push("IN_ARBEIT");
  }
  if (lower.includes("abgeschlossen") || lower.includes("erledigt") || lower.includes("fertig") || lower.includes("historisch")) {
    statusList.push("ABGESCHLOSSEN");
  }
  if (statusList.length === 0) {
    statusList.push("ERFASST", "IN_ARBEIT");
  }

  // Prio-Erkennung
  const priorityList: OrderPriority[] = [];
  if (lower.includes("notfall") || lower.includes("notfälle") || lower.includes("stillstand") || lower.includes("prio 1") || lower.includes("p1") || lower.includes("havarie")) {
    priorityList.push("1_EMERGENCY");
  }
  if (lower.includes("dringend") || lower.includes("hohe prio") || lower.includes("prio 2") || lower.includes("p2") || lower.includes("hoch")) {
    priorityList.push("2_HIGH");
  }
  if (lower.includes("normal") || lower.includes("mittel") || lower.includes("prio 3") || lower.includes("p3")) {
    priorityList.push("3_MEDIUM");
  }
  if (lower.includes("niedrig") || lower.includes("gering") || lower.includes("prio 4") || lower.includes("p4") || lower.includes("unkritisch")) {
    priorityList.push("4_LOW");
  }

  const queryParams: QueryOrdersParams = {
    areaId: areaEval.matchedAreaId,
    areaName: areaEval.matchedAreaName || areaKeyword,
    statusList,
    priorityList,
    searchQuery: prompt,
  };

  return {
    intent: "QUERY_ORDERS",
    confidence: 0.85,
    explanation: "Auftragsabfrage / Filterung nach Störungen erkannt.",
    queryOrders: queryParams,
    clarification: {
      needed: areaEval.isAmbiguous,
      field: "area",
      question: areaEval.question,
      options: areaEval.options,
    },
    rawPrompt: prompt,
  };
}

/**
 * Zentraler KI-Copilot für Conversational Single-Input:
 * Analysiert den Benutzerprompt, klassifiziert den Intent in Structured JSON
 * und handhabt interaktive Klärungsfragen (Clarification Loop).
 */
export async function classifyCopilotIntent(
  payload: ClassifyCopilotInputPayload
): Promise<CopilotClassificationResult> {
  const {
    tenantId = "demo-tenant-1000",
    prompt,
    chatHistory = [],
    availableAreas,
    availableEquipments,
    selectedOptionId,
    clarificationSelection,
  } = payload;
  const lowerPrompt = prompt.toLowerCase().trim();

  // 1. Stammdaten laden (DB oder Fallback)
  const contextData = await loadContextData(tenantId, availableAreas, availableEquipments);
  const areasList = contextData.areas;
  const equipmentsList = contextData.equipments;

  // 2. Clarification Loop: Prüfen, ob eine vorherige Klärungsfrage beantwortet wird
  const lastAssistantMsg = chatHistory.length > 0 ? chatHistory[chatHistory.length - 1] : null;
  const lastUserMsg = chatHistory.length > 1
    ? [...chatHistory].reverse().find((m) => m.role === "user")
    : null;

  const isClarificationAnswer = Boolean(
    selectedOptionId ||
    clarificationSelection ||
    (lastAssistantMsg &&
      lastAssistantMsg.role === "assistant" &&
      (lastAssistantMsg.content.includes("Welchen Bereich") ||
        lastAssistantMsg.content.includes("Mehrere Bereiche") ||
        lastAssistantMsg.content.includes("Welches Gerät") ||
        lastAssistantMsg.content.includes("Welche Pumpe") ||
        lastAssistantMsg.content.includes("nicht gefunden") ||
        lastAssistantMsg.content.includes("betroffen")))
  );

  if (isClarificationAnswer) {
    // 2a. Area-Klärung
    let resolvedArea: (typeof areasList)[0] | undefined;
    if (selectedOptionId) {
      resolvedArea = areasList.find((a) => a.id === selectedOptionId);
    }
    if (!resolvedArea && clarificationSelection && clarificationSelection.field === "area") {
      resolvedArea = areasList.find((a) => a.id === clarificationSelection.id);
    }
    if (!resolvedArea) {
      const areaEval = evaluateAreaAmbiguity(lowerPrompt, areasList);
      if (areaEval.matchedAreaId) {
        resolvedArea = areasList.find((a) => a.id === areaEval.matchedAreaId);
      }
    }

    if (resolvedArea) {
      // Wenn der vorherige Prompt ein QUERY_ORDERS war, übernehme Status & Prio Filter
      const prevPrompt = lastUserMsg?.content || "";
      const baseResult = heuristicIntentClassification(prevPrompt || prompt, areasList, equipmentsList);

      return {
        intent: "QUERY_ORDERS",
        confidence: 0.98,
        explanation: `Bereich "${resolvedArea.name}" erfolgreich geklärt.`,
        queryOrders: {
          areaId: resolvedArea.id,
          areaName: resolvedArea.name,
          statusList: baseResult.queryOrders?.statusList || ["ERFASST", "IN_ARBEIT"],
          priorityList: baseResult.queryOrders?.priorityList || [],
          searchQuery: resolvedArea.name,
        },
        clarification: { needed: false, options: [] },
        rawPrompt: prompt,
      };
    }

    // 2b. Equipment-Klärung
    let resolvedEq: (typeof equipmentsList)[0] | undefined;
    if (selectedOptionId) {
      resolvedEq = equipmentsList.find((e) => e.id === selectedOptionId);
    }
    if (!resolvedEq && clarificationSelection && clarificationSelection.field === "equipment") {
      resolvedEq = equipmentsList.find((e) => e.id === clarificationSelection.id);
    }
    if (!resolvedEq) {
      const eqEval = evaluateEquipmentAmbiguity(lowerPrompt, equipmentsList);
      if (eqEval.matchedEquipmentId) {
        resolvedEq = equipmentsList.find((e) => e.id === eqEval.matchedEquipmentId);
      }
    }

    if (resolvedEq) {
      const prevPrompt = lastUserMsg?.content || prompt;
      const isPrevQuery = prevPrompt.toLowerCase().startsWith("welche") || prevPrompt.toLowerCase().startsWith("zeige");

      if (isPrevQuery) {
        return {
          intent: "QUERY_ORDERS",
          confidence: 0.98,
          explanation: `Aggregat "${resolvedEq.name}" für Abfrage geklärt.`,
          queryOrders: {
            equipmentId: resolvedEq.id,
            equipmentName: resolvedEq.name,
            statusList: ["ERFASST", "IN_ARBEIT"],
            priorityList: [],
            searchQuery: resolvedEq.name,
          },
          clarification: { needed: false, options: [] },
          rawPrompt: prompt,
        };
      }

      return {
        intent: "CREATE_ORDER",
        confidence: 0.98,
        explanation: `Anlage "${resolvedEq.name}" erfolgreich geklärt.`,
        createOrder: {
          title: `Störung an ${resolvedEq.name}`,
          description: prevPrompt || `Vom Werker gemeldete Störung an Aggregat ${resolvedEq.name}.`,
          matchedEquipmentId: resolvedEq.id,
          equipmentName: resolvedEq.name,
          priority: "3_MEDIUM",
          plannedDurationMinutes: 60,
        },
        clarification: { needed: false, options: [] },
        rawPrompt: prompt,
      };
    }
  }

  // 3. LLM-basierte Intent-Erkennung via Provider
  try {
    const aiProvider = await getAiProvider(tenantId);

    const systemPrompt = `
Du bist der zentrale KI-Copilot eines industriellen CMMS- und Instandhaltungs-Leitstands (MaintAI).
Deine Aufgabe ist es, Freitexteingaben von Meistern, Werkern und Koordinatoren zu analysieren und präzise in Structured JSON zu klassifizieren.

MÖGLICHE INTENTS:
1. "QUERY_ORDERS": Nutzer will eine Liste/Tabelle bestehender Störungen sehen (z. B. "Welche offenen Störungen in Bereich xy stehen an?", "Notfälle in Halle 1 anzeigen").
   - Filterparameter:
     - areaId: Eindeutige ID falls aus der Liste bekannter Bereiche eindeutig zuordenbar
     - areaName: Extrahierter Bereichsname / Begriff (z. B. "Rohbau", "Halle 1", "xy")
     - statusList: Array von Statuswerten z. B. ["ERFASST", "IN_ARBEIT"], ["ABGESCHLOSSEN"]
     - priorityList: Array von Prioritäten ["1_EMERGENCY", "2_HIGH", "3_MEDIUM", "4_LOW"]
     - equipmentKeyword: Name oder Nummer des Equipments falls genannt

2. "CREATE_ORDER": Nutzer will eine NEUE Störung melden oder erfassen (z. B. "Pumpe P-102 leckt", "KUKA Roboter steht still mit Überhitzung").
   - Parameter:
     - title: Prägnanter technischer Störungstitel
     - description: Ausführliche Beschreibung
     - equipmentKeyword: Betroffene Maschine / Aggregat (z. B. "Pumpe P-102", "KUKA Roboter 01")
     - priority: "1_EMERGENCY" (Stillstand/Havarie), "2_HIGH" (Dringend), "3_MEDIUM" (Standard), "4_LOW" (Gering)

3. "UPDATE_VIEW_CONFIG": Nutzer will die Ansichtseinstellungen anpassen (z. B. "Aktualisiere alle 30 Sekunden", "Zeige kompakte Ansicht", "Auto-Refresh ausschalten").
   - Parameter:
     - refreshInterval: Zahl in Sekunden (0 = aus, 30, 60, 300)
     - displayDensity: "compact" | "standard" | "detailed"

4. "ANALYTICS_CHART": Nutzer will Kennzahlen, Statistiken oder grafische Diagramme sehen (z. B. "Zeige mir Ausfallzeiten als Balkendiagramm", "MTTR der Roboter", "Top 5 Ursachen").
   - Parameter:
     - chartType: "bar" | "line" | "pie" | "kpi" | "table"
     - metric: Name der Kennzahl (z. B. MTTR, MTBF, Ausfallminuten)
     - analyticsPrompt: Optimierter Analyse-Prompt
     - timeRange: Betrachtungszeitraum

BEKANNTE BEREICHE IM WERK:
${areasList.map((a) => `- ID: "${a.id}", Code: "${a.code}", Name: "${a.name}"`).join("\n")}

BEKANNTE AGGREGATE / EQUIPMENTS:
${equipmentsList.slice(0, 15).map((e) => `- ID: "${e.id}", Nr: "${e.equipmentNumber}", Name: "${e.name}"`).join("\n")}

Antworte STRIKT als valides JSON nach dieser Struktur:
{
  "intent": "QUERY_ORDERS" | "CREATE_ORDER" | "UPDATE_VIEW_CONFIG" | "ANALYTICS_CHART",
  "confidence": 0.95,
  "explanation": "Kurze deutsche Erklärung",
  "queryOrders": {
    "areaId": "Area-ID oder null",
    "areaName": "Name oder Keyword oder null",
    "statusList": ["ERFASST", "IN_ARBEIT"],
    "priorityList": ["1_EMERGENCY"]
  },
  "createOrder": {
    "title": "Titel",
    "description": "Details",
    "equipmentKeyword": "Keyword oder null",
    "priority": "1_EMERGENCY" | "2_HIGH" | "3_MEDIUM" | "4_LOW"
  },
  "updateViewConfig": {
    "refreshInterval": 30,
    "displayDensity": "compact" | "standard" | "detailed"
  },
  "analyticsChart": {
    "chartType": "bar" | "line" | "pie" | "kpi" | "table",
    "metric": "Ausfallzeit",
    "analyticsPrompt": "...",
    "timeRange": "Letzter Monat"
  }
}
`;

    const chatResponse = await aiProvider.createChatCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      { jsonMode: true, temperature: 0.1 }
    );

    const parsed = JSON.parse(chatResponse);
    const intent: CopilotIntentType = parsed.intent || "QUERY_ORDERS";

    // 4. Clarification Loop nach LLM-Erkennung anwenden
    if (intent === "QUERY_ORDERS") {
      const extractedAreaName = parsed.queryOrders?.areaName || undefined;
      const areaEval = evaluateAreaAmbiguity(extractedAreaName, areasList);
      const resolvedAreaId = areaEval.matchedAreaId || parsed.queryOrders?.areaId || undefined;

      return {
        intent: "QUERY_ORDERS",
        confidence: parsed.confidence || 0.9,
        explanation: parsed.explanation || "Störungsabfrage analysiert.",
        queryOrders: {
          areaId: resolvedAreaId,
          areaName: areaEval.matchedAreaName || extractedAreaName,
          statusList: parsed.queryOrders?.statusList && parsed.queryOrders.statusList.length > 0
            ? parsed.queryOrders.statusList
            : ["ERFASST", "IN_ARBEIT"],
          priorityList: parsed.queryOrders?.priorityList || [],
          searchQuery: prompt,
        },
        clarification: {
          needed: areaEval.isAmbiguous,
          field: "area",
          question: areaEval.question,
          options: areaEval.options,
        },
        rawPrompt: prompt,
      };
    }

    if (intent === "CREATE_ORDER") {
      const eqKeyword = parsed.createOrder?.equipmentKeyword || undefined;
      const eqEval = evaluateEquipmentAmbiguity(eqKeyword, equipmentsList);

      return {
        intent: "CREATE_ORDER",
        confidence: parsed.confidence || 0.9,
        explanation: parsed.explanation || "Neue Störungsmeldung erkannt.",
        createOrder: {
          title: parsed.createOrder?.title || prompt.slice(0, 80),
          description: parsed.createOrder?.description || prompt,
          equipmentKeyword: eqKeyword,
          matchedEquipmentId: eqEval.matchedEquipmentId,
          equipmentName: eqEval.matchedEquipmentName,
          priority: parsed.createOrder?.priority || "3_MEDIUM",
          plannedDurationMinutes: 60,
        },
        clarification: {
          needed: eqEval.isAmbiguous,
          field: "equipment",
          question: eqEval.question,
          options: eqEval.options,
        },
        rawPrompt: prompt,
      };
    }

    if (intent === "UPDATE_VIEW_CONFIG") {
      return {
        intent: "UPDATE_VIEW_CONFIG",
        confidence: parsed.confidence || 0.95,
        explanation: parsed.explanation || "Ansichtseinstellungen erkannt.",
        updateViewConfig: {
          refreshInterval: parsed.updateViewConfig?.refreshInterval,
          displayDensity: parsed.updateViewConfig?.displayDensity,
        },
        clarification: { needed: false, options: [] },
        rawPrompt: prompt,
      };
    }

    if (intent === "ANALYTICS_CHART") {
      return {
        intent: "ANALYTICS_CHART",
        confidence: parsed.confidence || 0.9,
        explanation: parsed.explanation || "Analytics-Visualisierung erkannt.",
        analyticsChart: {
          chartType: parsed.analyticsChart?.chartType || "bar",
          metric: parsed.analyticsChart?.metric,
          analyticsPrompt: parsed.analyticsChart?.analyticsPrompt || prompt,
          timeRange: parsed.analyticsChart?.timeRange,
        },
        clarification: { needed: false, options: [] },
        rawPrompt: prompt,
      };
    }
  } catch (err) {
    console.warn("[Copilot] LLM Klassifikation nicht erreichbar oder Parsing-Fehler, nutze Heuristik:", err);
  }

  // Resilienter Heuristik-Fallback
  return heuristicIntentClassification(prompt, areasList, equipmentsList);
}
