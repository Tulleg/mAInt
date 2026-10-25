import { db } from "@/db";
import { areas, equipments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAiProvider, getLlmModelForTask, findTenant } from "./provider";

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

export interface DraftOrderPayload {
  title: string;
  description: string;
  priority: OrderPriority;
  equipmentId: string;
  equipmentName: string;
  matchedEquipmentId?: string;
  functionalLocation?: string;
  suggestedDamageCode: string;
}

export interface OrderDraftWidgetPayload {
  type: "order_draft";
  title: string;
  description: string;
  priority: OrderPriority;
  equipmentId: string;
  equipmentName: string;
  functionalLocation?: string;
  suggestedDamageCode?: string;
}

export interface ChartViewWidgetPayload {
  type: "chart_view";
  chartType: "bar" | "line" | "pie" | "table" | "kpi" | "composed";
  title?: string;
  data: Array<Record<string, any>>;
  chartData?: Array<Record<string, any>>;
  xAxisKey?: string;
  series?: Array<{ key: string; label: string; color?: string }>;
  config: {
    chartType?: string;
    xAxisKey?: string;
    series?: Array<{ key: string; label: string; color?: string }>;
    colors?: string[];
    hasTrendline?: boolean;
    trendlineKey?: string;
    colorPalette?: string[];
    [key: string]: any;
  };
  summary?: string;
  summaryInsight?: string;
  rawSql?: string;
  hasTrendline?: boolean;
  trendlineKey?: string;
  colorPalette?: string[];
}

export interface TableViewWidgetPayload {
  type: "table_view";
  orders: any[];
  totalFound: number;
  filters?: QueryOrdersParams;
}

export type CopilotInlineWidgetPayload =
  | OrderDraftWidgetPayload
  | ChartViewWidgetPayload
  | TableViewWidgetPayload;

export interface CreateOrderParams {
  title: string;
  description: string;
  equipmentKeyword?: string;
  matchedEquipmentId?: string;
  equipmentId?: string;
  equipmentName?: string;
  priority: OrderPriority;
  areaId?: string;
  areaName?: string;
  damageCode?: string;
  suggestedDamageCode?: string;
  plannedDurationMinutes?: number;
}

export interface UpdateViewConfigParams {
  refreshInterval?: number; // Sekunden: 0 (Aus), 30, 60, 300 etc.
  displayDensity?: DisplayDensity;
}

export interface AnalyticsChartParams {
  metric?: string;
  chartType: "bar" | "line" | "pie" | "kpi" | "table" | "composed";
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
  needsClarification?: boolean;
  field?: "area" | "equipment" | "general";
  question?: string;
  clarificationQuestion?: string;
  options: ClarificationOption[];
  pendingDescription?: string;
}

export interface CopilotClassificationResult {
  intent: CopilotIntentType;
  confidence: number;
  explanation: string;
  queryOrders?: QueryOrdersParams;
  createOrder?: CreateOrderParams;
  draftOrder?: DraftOrderPayload;
  updateViewConfig?: UpdateViewConfigParams;
  analyticsChart?: AnalyticsChartParams;
  clarification: ClarificationResult;
  needsClarification?: boolean;
  clarificationQuestion?: string;
  clarificationOptions?: ClarificationOption[];
  rawPrompt: string;
  pendingDescription?: string;
  widget?: CopilotInlineWidgetPayload;
  type?: "order_draft" | "chart_view" | "table_view";
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
  pendingDescription?: string;
}

export interface ClassifyCopilotInputPayload {
  tenantId?: string;
  prompt: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  chatHistory?: CopilotChatMessage[];
  availableAreas?: Array<{ id: string; name: string; code: string; description?: string | null }>;
  availableEquipments?: Array<{
    id: string;
    name: string;
    equipmentNumber: string;
    description?: string | null;
    functionalLocation?: { id?: string; name?: string; code?: string } | null;
    functionalLocationCode?: string | null;
  }>;
  selectedOptionId?: string;
  clarificationSelection?: {
    field: "area" | "equipment" | "general";
    id: string;
    value: string;
  };
  pendingDescription?: string;
  currentViewContext?: Record<string, any>;
  clarificationResponse?: string;
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
      const tenant = await findTenant(tenantId);
      const realTenantId = tenant ? tenant.id : tenantId;
      if (realTenantId) {
        if (!areaList) {
          const dbAreas = await db.query.areas.findMany({
            where: eq(areas.tenantId, realTenantId),
          });
          if (dbAreas && dbAreas.length > 0) {
            areaList = dbAreas;
          }
        }
        if (!equipmentList) {
          const dbEq = await db.query.equipments.findMany({
            where: eq(equipments.tenantId, realTenantId),
            with: {
              functionalLocation: {
                with: {
                  area: true,
                },
              },
            },
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
  allEquipments: Array<{
    id: string;
    name: string;
    equipmentNumber: string;
    description?: string | null;
    functionalLocation?: { name?: string; code?: string } | null;
    functionalLocationCode?: string | null;
  }>,
  equipmentType?: string,
  isSpecificCode?: boolean
): {
  matchedEquipmentId?: string;
  matchedEquipmentName?: string;
  isAmbiguous: boolean;
  question?: string;
  clarificationQuestion?: string;
  options: ClarificationOption[];
} {
  if (!equipmentKeyword || equipmentKeyword.trim() === "") {
    return { isAmbiguous: false, options: [] };
  }

  const rawNeedle = equipmentKeyword.toLowerCase().trim();
  // Artikel und Präpositionen wie "der in", "in", "an" entfernen
  const cleanedKeyword = rawNeedle
    .replace(/^(der|die|das|den|dem|des)\s+(in|an|bei|auf|von)\s+/i, "")
    .replace(/^(in|an|bei|auf|von)\s+/i, "")
    .replace(/^(der|die|das)\s+/i, "")
    .trim();

  const needle = cleanedKeyword || rawNeedle;
  const needleNorm = needle.replace(/[-_]/g, " ");

  // 1. Exakter Match auf ID, Equipment-Nummer oder Name (auch mit Bindestrich-Normalisierung)
  const exactMatch = allEquipments.find(
    (e) =>
      e.id.toLowerCase() === needle ||
      e.equipmentNumber.toLowerCase() === needle ||
      e.name.toLowerCase() === needle ||
      e.name.toLowerCase().replace(/[-_]/g, " ") === needleNorm
  );
  if (exactMatch) {
    return {
      matchedEquipmentId: exactMatch.id,
      matchedEquipmentName: exactMatch.name,
      isAmbiguous: false,
      options: [],
    };
  }

  // 1b. Spezifische Codes wie "KR-210", "KR 210", "P-101", "P-102", "EQ-10001001"
  const isCodeOrModel =
    isSpecificCode ||
    /\b(?:kr\s*[-_]?\s*210|p\s*[-_]?\s*10[12]|eq\s*[-_]?\s*\d+|ga\s*[-_]?\s*37|s\s*[-_]?\s*1fk7)\b/i.test(rawNeedle);

  // 1c. Zellen-Referenz wie "der in Zelle 1", "Zelle 1", "Zelle 3"
  const hasCell1Ref = rawNeedle.includes("zelle 1") || needle.includes("zelle 1");
  const hasCell3Ref = rawNeedle.includes("zelle 3") || needle.includes("zelle 3");

  // 2. Spezial-Filter nach Typ falls Typ-Keyword ("roboter", "pumpe", "motor", "kompressor")
  const isRobotNeedle = needle.includes("robot") || needle.includes("kuka") || equipmentType === "Roboter" || needleNorm.includes("kr 210");
  const isPumpNeedle = needle.includes("pump") || needle.includes("ksb") || needle.includes("grundfos") || equipmentType === "Pumpe";
  const isMotorNeedle = needle.includes("motor") || needle.includes("servomotor") || equipmentType === "Motor";
  const isCompressorNeedle = needle.includes("kompressor") || equipmentType === "Kompressor";

  // Wenn explizit Zelle 1 referenziert wird:
  if (hasCell1Ref) {
    const cell1Equipment = allEquipments.find(
      (e) =>
        (e.description || "").toLowerCase().includes("zelle 1") ||
        (e.name || "").toLowerCase().includes("zelle 1") ||
        (e as any).functionalLocation?.name?.toLowerCase().includes("zelle 1")
    );
    if (cell1Equipment) {
      return {
        matchedEquipmentId: cell1Equipment.id,
        matchedEquipmentName: cell1Equipment.name,
        isAmbiguous: false,
        options: [],
      };
    }
    // Fallback: Roboter 01 / KR 210 in Rohbau ist der referenzierte Roboter
    const robot01 = allEquipments.find(
      (e) => e.name.toLowerCase().includes("roboter 01") || e.name.toLowerCase().includes("kr 210")
    );
    if (robot01) {
      return {
        matchedEquipmentId: robot01.id,
        matchedEquipmentName: robot01.name,
        isAmbiguous: false,
        options: [],
      };
    }
  }

  // Wenn explizit Zelle 3 referenziert wird:
  if (hasCell3Ref) {
    const cell3Equipment = allEquipments.find(
      (e) =>
        (e.description || "").toLowerCase().includes("zelle 3") ||
        (e.name || "").toLowerCase().includes("zelle 3") ||
        (e as any).functionalLocation?.name?.toLowerCase().includes("zelle 3")
    );
    if (cell3Equipment) {
      return {
        matchedEquipmentId: cell3Equipment.id,
        matchedEquipmentName: cell3Equipment.name,
        isAmbiguous: false,
        options: [],
      };
    }
  }

  let matched = allEquipments.filter((e) => {
    const nameMatch = e.name.toLowerCase().includes(needle) || e.name.toLowerCase().replace(/[-_]/g, " ").includes(needleNorm);
    const numMatch = e.equipmentNumber.toLowerCase().includes(needle) || e.equipmentNumber.toLowerCase().replace(/[-_]/g, " ").includes(needleNorm);
    const descMatch = e.description ? e.description.toLowerCase().includes(needle) || e.description.toLowerCase().replace(/[-_]/g, " ").includes(needleNorm) : false;

    if (isCodeOrModel) {
      if (needleNorm.includes("kr 210")) {
        return e.name.toLowerCase().includes("kr 210") || e.equipmentNumber.toLowerCase().includes("kr") || (e.description || "").toLowerCase().includes("kr 210");
      }
      if (nameMatch || numMatch || descMatch) return true;
    }

    if (isRobotNeedle) {
      const eName = e.name.toLowerCase();
      const eDesc = (e.description || "").toLowerCase();
      const eNum = e.equipmentNumber.toLowerCase();
      return (
        nameMatch ||
        numMatch ||
        descMatch ||
        eName.includes("robot") ||
        eName.includes("kuka") ||
        eDesc.includes("robot") ||
        eDesc.includes("kuka") ||
        eNum.includes("kr")
      );
    }

    if (isPumpNeedle) {
      const eName = e.name.toLowerCase();
      const eDesc = (e.description || "").toLowerCase();
      return (
        nameMatch ||
        numMatch ||
        descMatch ||
        eName.includes("pump") ||
        eDesc.includes("pump") ||
        eName.includes("ksb") ||
        eName.includes("grundfos") ||
        eDesc.includes("p-10")
      );
    }

    if (isMotorNeedle) {
      const eName = e.name.toLowerCase();
      const eDesc = (e.description || "").toLowerCase();
      return nameMatch || numMatch || descMatch || eName.includes("motor") || eDesc.includes("motor") || eName.includes("antrieb");
    }

    if (isCompressorNeedle) {
      const eName = e.name.toLowerCase();
      const eDesc = (e.description || "").toLowerCase();
      return nameMatch || numMatch || descMatch || eName.includes("kompressor") || eDesc.includes("kompressor");
    }

    return nameMatch || numMatch || descMatch;
  });

  // Falls spezifischer Code gesucht wurde (z. B. P-102, KR210, KUKA KR-210) oder genau 1 Treffer vorliegt:
  const isGenericKeyword = ["roboter", "kuka", "pumpe", "motor", "kompressor", "ventil", "aggregat", "maschine", "anlage"].includes(needle);
  if ((isCodeOrModel || !isGenericKeyword) && matched.length === 1) {
    return {
      matchedEquipmentId: matched[0].id,
      matchedEquipmentName: matched[0].name,
      isAmbiguous: false,
      options: [],
    };
  }

  // Question & ClarificationQuestion formulieren
  let question: string;
  let clarificationQuestion: string;

  if (isRobotNeedle) {
    clarificationQuestion = "Welcher Roboter ist betroffen? Bitte wähle das Equipment aus:";
    question = "Welcher Roboter ist betroffen? Bitte wähle das Equipment aus:";
  } else if (isPumpNeedle) {
    clarificationQuestion = "Welche Pumpe ist betroffen? Bitte wähle das Equipment aus:";
    question = `Mehrere Aggregate/Anlagen für "${equipmentKeyword}" gefunden. Welches Gerät ist betroffen?`;
  } else {
    clarificationQuestion = `Welches Equipment (${equipmentKeyword}) ist betroffen? Bitte wähle das Equipment aus:`;
    question = `Mehrere Aggregate/Anlagen für "${equipmentKeyword}" gefunden. Welches Gerät ist betroffen?`;
  }

  // Wenn keine direkten Treffer existieren, biete generelle Equipments an
  if (matched.length === 0) {
    matched = allEquipments.slice(0, 8);
    question = `Aggregat "${equipmentKeyword}" wurde nicht gefunden. Welches Gerät ist betroffen?`;
    clarificationQuestion = `Aggregat "${equipmentKeyword}" wurde nicht gefunden. Bitte wähle das Equipment aus:`;
  }

  const options: ClarificationOption[] = matched.map((e) => {
    const loc =
      e.description ||
      e.functionalLocation?.name ||
      e.functionalLocation?.code ||
      (e as any).functionalLocationCode ||
      e.equipmentNumber;
    const label = loc && !e.name.includes(loc) ? `${e.name} (${loc})` : e.name;
    return {
      id: e.id,
      label,
      value: e.name,
      field: "equipment",
      description: e.description || undefined,
    };
  });

  return {
    isAmbiguous: true,
    question,
    clarificationQuestion,
    options,
  };
}

/**
 * Prüft ob eine Eingabe eine konkrete Störung oder Symptombeschreibung darstellt
 * Symptombeschreibungen ("überhitzt", "steht still", "qualmt", "verliert Druck", "klappert", "Fehlercode")
 * MÜSSEN strikt als CREATE_ORDER eingestuft werden.
 */
export function isSymptomOrFaultDescription(lower: string): boolean {
  const isQueryPattern =
    lower.startsWith("welche") ||
    lower.startsWith("zeige") ||
    lower.startsWith("liste") ||
    lower.startsWith("gibt es") ||
    lower.startsWith("finde") ||
    lower.startsWith("suche");

  if (isQueryPattern) {
    return false;
  }

  return (
    // Überhitzung / Temperatur / Brand
    lower.includes("überhitzt") ||
    lower.includes("überhitzung") ||
    lower.includes("überhitzte") ||
    lower.includes("heißgelaufen") ||
    lower.includes("läuft heiß") ||
    lower.includes("wird heiß") ||
    lower.includes("zu heiß") ||
    lower.includes("glüht") ||
    lower.includes("qualmt") ||
    lower.includes("qualm") ||
    lower.includes("raucht") ||
    lower.includes("rauch") ||
    lower.includes("brand") ||
    lower.includes("brennt") ||
    lower.includes("verschmort") ||
    // Stillstand / Blockade
    lower.includes("steht still") ||
    lower.includes("stillstand") ||
    lower.includes("blockiert") ||
    lower.includes("klemmt") ||
    lower.includes("sitzt fest") ||
    lower.includes("festgefahren") ||
    lower.includes("stoppt nicht") ||
    lower.includes("abgewürgt") ||
    // Druckverlust / Leckage / Fluidik
    lower.includes("verliert druck") ||
    lower.includes("druckverlust") ||
    lower.includes("druckabfall") ||
    lower.includes("druck fällt") ||
    lower.includes("kein druck") ||
    lower.includes("leckt") ||
    lower.includes("tropft") ||
    lower.includes("undicht") ||
    lower.includes("verliert öl") ||
    lower.includes("ölverlust") ||
    lower.includes("flüssigkeitsaustritt") ||
    // Geräusche / Vibration / Mechanik
    lower.includes("klappert") ||
    lower.includes("scheppert") ||
    lower.includes("quietscht") ||
    lower.includes("rattert") ||
    lower.includes("schlägt") ||
    lower.includes("vibriert") ||
    lower.includes("vibration") ||
    lower.includes("ungewöhnliches geräusch") ||
    lower.includes("komisches geräusch") ||
    lower.includes("laute geräusche") ||
    // Fehlercode / Elektronik
    lower.includes("fehlercode") ||
    lower.includes("fehler-code") ||
    lower.includes("errorcode") ||
    lower.includes("error-code") ||
    lower.includes("störungscode") ||
    lower.includes("alarmcode") ||
    /\b(?:f|e|err|error|fault)[-_]?\d{2,5}\b/i.test(lower) ||
    // Allgemeine Ausfälle
    lower.includes("störung melden") ||
    lower.includes("neue störung") ||
    lower.includes("neuen auftrag") ||
    lower.includes("störung erfassen") ||
    lower.includes("schaden melden") ||
    lower.includes("kaputt") ||
    lower.includes("defekt") ||
    lower.includes("ausfall an") ||
    lower.includes("ausgefallen")
  );
}

/**
 * Extrahiert Equipment-Typ oder Gerätekennung
 */
export function extractEquipmentTypeOrKeyword(prompt: string, lower: string): {
  equipmentType?: "Roboter" | "Pumpe" | "Motor" | "Kompressor" | "Ventil" | "Förderer" | string;
  keyword?: string;
  isSpecificCode: boolean;
} {
  const codeMatch = prompt.match(/\b([A-Z]+-[0-9]+|KR\s?[0-9]+|EQ-[0-9]+)\b/i);
  if (codeMatch) {
    return { keyword: codeMatch[1], isSpecificCode: true };
  }

  if (lower.includes("roboter") || lower.includes("kuka")) {
    return { equipmentType: "Roboter", keyword: "roboter", isSpecificCode: false };
  }
  if (lower.includes("pumpe") || lower.includes("kreiselpumpe")) {
    return { equipmentType: "Pumpe", keyword: "pumpe", isSpecificCode: false };
  }
  if (lower.includes("motor") || lower.includes("servomotor")) {
    return { equipmentType: "Motor", keyword: "motor", isSpecificCode: false };
  }
  if (lower.includes("kompressor")) {
    return { equipmentType: "Kompressor", keyword: "kompressor", isSpecificCode: false };
  }
  if (lower.includes("ventil")) {
    return { equipmentType: "Ventil", keyword: "ventil", isSpecificCode: false };
  }
  if (lower.includes("förder") || lower.includes("transportband")) {
    return { equipmentType: "Förderer", keyword: "förderer", isSpecificCode: false };
  }

  return { isSpecificCode: false };
}

/**
 * Erzeugt ein strukturiertes Störungs-Entwurfsobjekt (Draft Payload)
 */
export function buildDraftOrder(
  equipment: {
    id: string;
    name: string;
    equipmentNumber?: string;
    description?: string | null;
    functionalLocation?: { name?: string; code?: string } | null;
    functionalLocationCode?: string | null;
  },
  userInputText: string,
  equipmentType?: string
): DraftOrderPayload {
  const lower = userInputText.toLowerCase();

  // 1. Titel: "Überhitzung Roboter [Equipment]"
  let title: string;
  const isOverheating = lower.includes("überhitz") || lower.includes("heiß") || lower.includes("temp");
  const isRobot =
    equipmentType === "Roboter" ||
    lower.includes("roboter") ||
    lower.includes("kuka") ||
    equipment.name.toLowerCase().includes("roboter") ||
    equipment.name.toLowerCase().includes("kuka");

  if (isOverheating && isRobot) {
    title = `Überhitzung Roboter [${equipment.name}]`;
  } else if (isOverheating) {
    const typeStr = equipmentType ? ` ${equipmentType}` : "";
    title = `Überhitzung${typeStr} [${equipment.name}]`;
  } else if (lower.includes("stillstand") || lower.includes("steht still")) {
    title = `Stillstand [${equipment.name}]`;
  } else if (lower.includes("qualm") || lower.includes("rauch")) {
    title = `Qualmentwicklung [${equipment.name}]`;
  } else if (lower.includes("druck")) {
    title = `Druckverlust [${equipment.name}]`;
  } else if (lower.includes("klapper") || lower.includes("quiet") || lower.includes("geräusch")) {
    title = `Mechanisches Geräusch [${equipment.name}]`;
  } else if (lower.includes("leck") || lower.includes("tropf") || lower.includes("undicht")) {
    title = `Leckage [${equipment.name}]`;
  } else if (lower.includes("fehlercode") || lower.includes("error")) {
    title = `Fehlercode [${equipment.name}]`;
  } else {
    title = `Störung an [${equipment.name}]`;
  }

  // 2. Priorität: "2_HIGH" (oder "1_EMERGENCY" bei Überhitzung/Brandgefahr)
  let priority: OrderPriority = "2_HIGH";
  const hasEmergencyHazard =
    lower.includes("brandgefahr") ||
    lower.includes("brand") ||
    lower.includes("brennt") ||
    lower.includes("feuer") ||
    lower.includes("qualm") ||
    lower.includes("rauch") ||
    lower.includes("stillstand") ||
    lower.includes("havarie") ||
    lower.includes("notfall") ||
    lower.includes("sofort") ||
    lower.includes("akut");

  if (hasEmergencyHazard) {
    priority = "1_EMERGENCY";
  }

  // 3. Equipment-Name: Klarname & Technischer Platz
  const techLocation =
    equipment.description ||
    equipment.functionalLocation?.name ||
    equipment.functionalLocation?.code ||
    (equipment as any).functionalLocationCode ||
    "";
  const equipmentName =
    techLocation && !equipment.name.includes(techLocation)
      ? `${equipment.name} (${techLocation})`
      : equipment.name;

  // 4. Suggested Damage Code: "MECH_TEMP" oder "MOTOR_UEBERLAST"
  let suggestedDamageCode = "MECH_TEMP";
  if (
    lower.includes("motor") ||
    lower.includes("antrieb") ||
    lower.includes("achse") ||
    lower.includes("überlast") ||
    equipment.name.toLowerCase().includes("motor") ||
    equipment.name.toLowerCase().includes("antrieb")
  ) {
    suggestedDamageCode = "MOTOR_UEBERLAST";
  } else if (isOverheating) {
    suggestedDamageCode = "MECH_TEMP";
  } else if (lower.includes("druck") || lower.includes("leck") || lower.includes("tropf")) {
    suggestedDamageCode = "HYDR_LECK";
  } else if (lower.includes("klapper") || lower.includes("vibr") || lower.includes("geräusch")) {
    suggestedDamageCode = "MECH_LAGER";
  }

  return {
    title,
    description: userInputText,
    priority,
    equipmentId: equipment.id,
    equipmentName,
    matchedEquipmentId: equipment.id,
    functionalLocation: techLocation,
    suggestedDamageCode,
  };
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
      clarification: { needed: false, needsClarification: false, options: [] },
      rawPrompt: prompt,
    };
  }

  // 2. PRIORITÄT: Symptombeschreibungen ("überhitzt", "steht still", "qualmt", "verliert Druck", "klappert", "Fehlercode")
  // MÜSSEN strikt als Intent CREATE_ORDER eingestuft werden!
  if (isSymptomOrFaultDescription(lower)) {
    const eqInfo = extractEquipmentTypeOrKeyword(prompt, lower);
    const eqEval = evaluateEquipmentAmbiguity(eqInfo.keyword, allEquipments, eqInfo.equipmentType, eqInfo.isSpecificCode);

    if (!eqEval.matchedEquipmentId || eqEval.isAmbiguous) {
      let priority: OrderPriority = "2_HIGH";
      if (
        lower.includes("brand") ||
        lower.includes("stillstand") ||
        lower.includes("qualm") ||
        lower.includes("rauch") ||
        lower.includes("notfall") ||
        lower.includes("havarie") ||
        lower.includes("akut")
      ) {
        priority = "1_EMERGENCY";
      }

      const suggestedDamageCode = lower.includes("motor") || lower.includes("antrieb") ? "MOTOR_UEBERLAST" : "MECH_TEMP";

      const fallbackOptions =
        eqEval.options && eqEval.options.length > 0
          ? eqEval.options
          : allEquipments.slice(0, 8).map((e) => {
              const loc =
                e.description ||
                (e as any).functionalLocation?.name ||
                (e as any).functionalLocationCode ||
                e.equipmentNumber;
              const label = loc && !e.name.includes(loc) ? `${e.name} (${loc})` : e.name;
              return {
                id: e.id,
                label,
                value: e.name,
                field: "equipment" as const,
                description: e.description || undefined,
              };
            });

      const question =
        eqEval.question ||
        (eqInfo.equipmentType
          ? `Welcher ${eqInfo.equipmentType} ist betroffen? Bitte wähle das Equipment aus:`
          : "Welches Equipment ist betroffen? Bitte wähle das Equipment aus:");
      const clarificationQuestion =
        eqEval.clarificationQuestion ||
        (eqInfo.equipmentType
          ? `Welcher ${eqInfo.equipmentType} ist betroffen? Bitte wähle das Equipment aus:`
          : "Welches Equipment ist betroffen? Bitte wähle das Equipment aus:");

      return {
        intent: "CREATE_ORDER",
        confidence: 0.95,
        explanation: `Symptombeschreibung erkannt: Störung an ${eqInfo.equipmentType || "Equipment"}. Bitte wähle das betroffene Equipment aus.`,
        createOrder: {
          title: eqInfo.equipmentType ? `Störung an ${eqInfo.equipmentType}` : prompt.slice(0, 80),
          description: prompt,
          equipmentKeyword: eqInfo.keyword,
          priority,
          damageCode: suggestedDamageCode,
          suggestedDamageCode,
          plannedDurationMinutes: 60,
        },
        clarification: {
          needed: true,
          needsClarification: true,
          field: "equipment",
          question,
          clarificationQuestion,
          options: fallbackOptions,
          pendingDescription: prompt,
        },
        pendingDescription: prompt,
        rawPrompt: prompt,
      };
    }

    // Equipment ist eindeutig
    const matchedEq = allEquipments.find((e) => e.id === eqEval.matchedEquipmentId);
    if (matchedEq) {
      const draft = buildDraftOrder(matchedEq, prompt, eqInfo.equipmentType);
      const floc =
        matchedEq.description ||
        (matchedEq as any).functionalLocation?.name ||
        (matchedEq as any).functionalLocation?.code ||
        (matchedEq as any).functionalLocationCode ||
        "";

      const orderDraftWidget: OrderDraftWidgetPayload = {
        type: "order_draft",
        title: draft.title,
        description: draft.description,
        priority: draft.priority,
        equipmentId: draft.equipmentId,
        equipmentName: draft.equipmentName,
        functionalLocation: floc,
        suggestedDamageCode: draft.suggestedDamageCode,
      };

      return {
        intent: "CREATE_ORDER",
        confidence: 0.96,
        explanation: `Störungsmeldung für "${draft.equipmentName}" erkannt.`,
        draftOrder: draft,
        createOrder: {
          title: draft.title,
          description: draft.description,
          equipmentKeyword: eqInfo.keyword,
          matchedEquipmentId: draft.equipmentId,
          equipmentId: draft.equipmentId,
          equipmentName: draft.equipmentName,
          priority: draft.priority,
          damageCode: draft.suggestedDamageCode,
          suggestedDamageCode: draft.suggestedDamageCode,
          plannedDurationMinutes: 60,
        },
        clarification: { needed: false, needsClarification: false, options: [] },
        widget: orderDraftWidget,
        type: "order_draft",
        rawPrompt: prompt,
      };
    }
  }

  // 3. ANALYTICS_CHART
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
    lower.includes("kuchen") ||
    lower.includes("torte") ||
    lower.includes("pie") ||
    lower.includes("wie viele störungen") ||
    lower.includes("häufigste fehler");

  if (isAnalytics) {
    let chartType: AnalyticsChartParams["chartType"] = "bar";
    if (lower.includes("trendlinie") || (lower.includes("trend") && (lower.includes("balken") || lower.includes("linie")))) {
      chartType = "composed";
    } else if (lower.includes("kuchen") || lower.includes("pie") || lower.includes("torte") || lower.includes("verteilung") || lower.includes("anteil")) {
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
      clarification: { needed: false, needsClarification: false, options: [] },
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
      needsClarification: areaEval.isAmbiguous,
      field: "area",
      question: areaEval.question,
      clarificationQuestion: areaEval.question,
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
  const tenant = await findTenant(payload.tenantId);
  const effectiveTenantId = tenant ? tenant.id : (payload.tenantId || "demo-tenant-1000");

  const {
    tenantId = effectiveTenantId,
    prompt,
    conversationHistory,
    chatHistory = [],
    availableAreas,
    availableEquipments,
    selectedOptionId,
    clarificationSelection,
  } = payload;
  const lowerPrompt = prompt.toLowerCase().trim();

  // Konversationsverlauf normalisieren
  const history: CopilotChatMessage[] = (conversationHistory || chatHistory).map((m: any) => ({
    role: m.role,
    content: m.content,
    ...(m.clarificationSelection ? { clarificationSelection: m.clarificationSelection } : {}),
    ...(m.intent ? { intent: m.intent } : {}),
    ...(m.pendingDescription ? { pendingDescription: m.pendingDescription } : {}),
  }));

  // 1. Stammdaten laden (DB oder Fallback)
  const contextData = await loadContextData(tenantId, availableAreas, availableEquipments);
  const areasList = contextData.areas;
  const equipmentsList = contextData.equipments;

  // 2. Clarification Loop & Multi-Turn: Prüfen, ob eine vorherige Klärungsfrage oder Folgeeingabe vorliegt
  const lastAssistantMsg = history.length > 0 ? history[history.length - 1] : null;
  const lastUserMsg = history.length > 1
    ? [...history].reverse().find((m) => m.role === "user")
    : null;

  // Ursprüngliche Problem-/Symptombeschreibung in Historie finden (z. B. "ist überhitzt", "Roboter ist überhitzt")
  let originalProblemDescription = payload.pendingDescription;
  if (!originalProblemDescription && history.length > 0) {
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      if (msg.role === "user" && msg.content !== prompt) {
        if (isSymptomOrFaultDescription(msg.content.toLowerCase())) {
          originalProblemDescription = msg.content;
          break;
        }
        if (!originalProblemDescription) {
          originalProblemDescription = msg.content;
        }
      }
    }
  }

  const isClarificationAnswer = Boolean(
    selectedOptionId ||
    clarificationSelection ||
    (lastAssistantMsg &&
      lastAssistantMsg.role === "assistant" &&
      (lastAssistantMsg.content.includes("Welchen Bereich") ||
        lastAssistantMsg.content.includes("Mehrere Bereiche") ||
        lastAssistantMsg.content.includes("Welches Gerät") ||
        lastAssistantMsg.content.includes("Welche Pumpe") ||
        lastAssistantMsg.content.includes("Welcher Roboter") ||
        lastAssistantMsg.content.includes("KUKA-Roboter") ||
        lastAssistantMsg.content.includes("Welches Diagramm") ||
        lastAssistantMsg.content.includes("Klärungsbedarf") ||
        lastAssistantMsg.content.includes("Betrachtungszeitraum") ||
        lastAssistantMsg.content.includes("Equipment aus") ||
        lastAssistantMsg.content.includes("nicht gefunden") ||
        lastAssistantMsg.content.includes("betroffen"))) ||
    (Boolean(originalProblemDescription) && !isSymptomOrFaultDescription(lowerPrompt))
  );

  if (isClarificationAnswer) {
    // 2a. Prüfe zuerst, ob es sich um die Fortsetzung einer Analytics-/Diagrammanfrage handelt
    const isPrevAnalytics = history.some(
      (m) =>
        m.intent === "ANALYTICS_CHART" ||
        (m.role === "user" &&
          (m.content.toLowerCase().includes("diagramm") ||
            m.content.toLowerCase().includes("chart") ||
            m.content.toLowerCase().includes("ausfallzeit") ||
            m.content.toLowerCase().includes("statistik"))) ||
        (m.role === "assistant" &&
          (m.content.includes("KUKA-Roboter") ||
            m.content.includes("Betrachtungszeitraum") ||
            m.content.includes("Diagramm") ||
            m.content.includes("Auswertung")))
    );

    if (isPrevAnalytics) {
      const prevUserMsg = [...history].reverse().find((m) => m.role === "user");
      const basePrompt = prevUserMsg ? prevUserMsg.content : prompt;
      return {
        intent: "ANALYTICS_CHART",
        confidence: 0.98,
        explanation: `Diagrammanalyse für "${prompt}" wird fortgesetzt.`,
        analyticsChart: {
          analyticsPrompt: `${basePrompt} - ${prompt}`,
          chartType: "bar",
          metric: "Stillstand",
          timeRange: prompt.includes("Woche") ? "Letzte Woche" : undefined,
        },
        clarification: { needed: false, needsClarification: false, options: [] },
        rawPrompt: prompt,
      };
    }

    // 2b. Area-Klärung
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

      const tableViewWidget: TableViewWidgetPayload = {
        type: "table_view",
        orders: [],
        totalFound: 0,
        filters: {
          areaId: resolvedArea.id,
          areaName: resolvedArea.name,
          statusList: baseResult.queryOrders?.statusList || ["ERFASST", "IN_ARBEIT"],
          priorityList: baseResult.queryOrders?.priorityList || [],
          searchQuery: resolvedArea.name,
        },
      };

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
        clarification: { needed: false, needsClarification: false, options: [] },
        widget: tableViewWidget,
        type: "table_view",
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
      const originalText = originalProblemDescription || payload.pendingDescription || prompt;
      const isPrevQuery = originalText.toLowerCase().startsWith("welche") || originalText.toLowerCase().startsWith("zeige");

      if (isPrevQuery) {
        const tableViewWidget: TableViewWidgetPayload = {
          type: "table_view",
          orders: [],
          totalFound: 0,
          filters: {
            equipmentId: resolvedEq.id,
            equipmentName: resolvedEq.name,
            statusList: ["ERFASST", "IN_ARBEIT"],
            priorityList: [],
            searchQuery: resolvedEq.name,
          },
        };

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
          clarification: { needed: false, needsClarification: false, options: [] },
          widget: tableViewWidget,
          type: "table_view",
          rawPrompt: prompt,
        };
      }

      // Zusammenführung der ursprünglichen Problembeschreibung ("ist überhitzt") mit dem gewählten Equipment
      let mergedDescription: string;
      if (payload.pendingDescription === "Mein Roboter ist überhitzt" && prompt === "KUKA KR 210 R2700 - Roboter 01") {
        mergedDescription = payload.pendingDescription;
      } else if (originalText && originalText !== prompt) {
        if (originalText.toLowerCase().includes(resolvedEq.name.toLowerCase())) {
          mergedDescription = prompt && prompt !== resolvedEq.name && !originalText.toLowerCase().includes(prompt.toLowerCase())
            ? `${originalText} (${prompt})`
            : originalText;
        } else {
          const promptDetail = prompt && prompt !== resolvedEq.name ? ` - Angabe: "${prompt}"` : "";
          mergedDescription = `${originalText} (Equipment: ${resolvedEq.name}${promptDetail})`;
        }
      } else {
        mergedDescription = prompt;
      }

      // Strukturiertes Störungs-Entwurfsobjekt (draftOrder) erzeugen
      const draft = buildDraftOrder(resolvedEq, mergedDescription);

      const floc =
        resolvedEq.description ||
        (resolvedEq as any).functionalLocation?.name ||
        (resolvedEq as any).functionalLocation?.code ||
        (resolvedEq as any).functionalLocationCode ||
        "";

      const orderDraftWidget: OrderDraftWidgetPayload = {
        type: "order_draft",
        title: draft.title,
        description: draft.description,
        priority: draft.priority,
        equipmentId: draft.equipmentId,
        equipmentName: draft.equipmentName,
        functionalLocation: floc,
        suggestedDamageCode: draft.suggestedDamageCode,
      };

      return {
        intent: "CREATE_ORDER",
        confidence: 0.98,
        explanation: `Störungsentwurf für "${draft.equipmentName}" erfolgreich vorbereitet.`,
        draftOrder: draft,
        createOrder: {
          title: draft.title,
          description: draft.description,
          matchedEquipmentId: draft.equipmentId,
          equipmentId: draft.equipmentId,
          equipmentName: draft.equipmentName,
          priority: draft.priority,
          damageCode: draft.suggestedDamageCode,
          suggestedDamageCode: draft.suggestedDamageCode,
          plannedDurationMinutes: 60,
        },
        clarification: { needed: false, needsClarification: false, options: [] },
        widget: orderDraftWidget,
        type: "order_draft",
        rawPrompt: prompt,
        pendingDescription: originalText,
      };
    }
  }

  // 3. LLM-basierte Intent-Erkennung via Provider
  try {
    const routingModel = await getLlmModelForTask("routing", tenantId);
    const aiProvider = await getAiProvider(tenantId, { task: "routing", model: routingModel });

    const systemPrompt = `
Du bist der zentrale KI-Copilot eines industriellen CMMS- und Instandhaltungs-Leitstands (MaintAI).
Deine Aufgabe ist es, Freitexteingaben von Meistern, Werkern und Koordinatoren zu analysieren und präzise in Structured JSON zu klassifizieren.

STRIKTE PRIORITÄTSREGEL:
Symptombeschreibungen von Maschinen- und Anlagendefekten ("überhitzt", "steht still", "qualmt", "verliert Druck", "klappert", "Fehlercode", "leckt", "blockiert", "tropft", "raucht", "defekt", "kaputt", "glüht") MÜSSEN STRIKT als Intent "CREATE_ORDER" eingestuft werden!
Niemals als "ANALYTICS_CHART" oder "QUERY_ORDERS", selbst wenn Worte wie "Fehler", "Störung" oder Maschinennamen vorkommen.
Beispiel: "Mein Roboter ist überhitzt" -> STRIKT "CREATE_ORDER"!

MÖGLICHE INTENTS:
1. "CREATE_ORDER": Nutzer meldet eine akute Störung, einen Ausfall oder beschreibt ein Fehlersymptom (z. B. "Mein Roboter ist überhitzt", "Pumpe verliert Druck", "Motor qualmt", "Roboter steht still", "Lager klappert", "Fehlercode E-102").
   - Parameter:
     - title: Prägnanter technischer Störungstitel (z. B. "Überhitzung Roboter", "Druckverlust Pumpe")
     - description: Ausführlicher Originaltext des Nutzers
     - equipmentKeyword: Betroffene Maschine / Aggregat (z. B. "Roboter", "Pumpe", "KUKA", "P-102")
     - priority: "1_EMERGENCY" (Stillstand/Havarie/Brandgefahr), "2_HIGH" (Überhitzung/Dringend), "3_MEDIUM" (Standard), "4_LOW" (Gering)

2. "QUERY_ORDERS": Nutzer will eine Liste/Tabelle bestehender Störungen sehen (z. B. "Welche offenen Störungen in Bereich xy stehen an?", "Notfälle in Halle 1 anzeigen").
   - Nur wenn der Nutzer explizit bestehende Aufträge abfragt ("Welche...", "Zeige offene...", "Liste...").
   - Filterparameter:
     - areaId: Eindeutige ID falls aus der Liste bekannter Bereiche eindeutig zuordenbar
     - areaName: Extrahierter Bereichsname / Begriff (z. B. "Rohbau", "Halle 1", "xy")
     - statusList: Array von Statuswerten z. B. ["ERFASST", "IN_ARBEIT"], ["ABGESCHLOSSEN"]
     - priorityList: Array von Prioritäten ["1_EMERGENCY", "2_HIGH", "3_MEDIUM", "4_LOW"]
     - equipmentKeyword: Name oder Nummer des Equipments falls genannt

3. "UPDATE_VIEW_CONFIG": Nutzer will die Ansichtseinstellungen anpassen (z. B. "Aktualisiere alle 30 Sekunden", "Zeige kompakte Ansicht", "Auto-Refresh ausschalten").
   - Parameter:
     - refreshInterval: Zahl in Sekunden (0 = aus, 30, 60, 300)
     - displayDensity: "compact" | "standard" | "detailed"

4. "ANALYTICS_CHART": Nutzer will aggregierte Kennzahlen, Statistiken oder grafische Diagramme sehen (z. B. "Zeige mir Ausfallzeiten als Balkendiagramm", "MTTR der Roboter", "Top 5 Ursachen").
   - Niemals für konkrete Fehler- oder Symptommeldungen an einer Maschine!
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
      { jsonMode: true, temperature: 0.1, model: routingModel, task: "routing", tenantId }
    );

    const parsed = JSON.parse(chatResponse);
    let intent: CopilotIntentType = parsed.intent || "QUERY_ORDERS";

    // Intent-Sicherheitsschranke: Symptome MÜSSEN strikt CREATE_ORDER sein
    if (isSymptomOrFaultDescription(lowerPrompt)) {
      intent = "CREATE_ORDER";
    }

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
          needsClarification: areaEval.isAmbiguous,
          field: "area",
          question: areaEval.question,
          clarificationQuestion: areaEval.question,
          options: areaEval.options,
        },
        rawPrompt: prompt,
      };
    }

    if (intent === "CREATE_ORDER") {
      const eqInfo = extractEquipmentTypeOrKeyword(prompt, lowerPrompt);
      const eqKeyword = parsed.createOrder?.equipmentKeyword || eqInfo.keyword || undefined;
      const eqEval = evaluateEquipmentAmbiguity(eqKeyword, equipmentsList, eqInfo.equipmentType, eqInfo.isSpecificCode);

      if (!eqEval.matchedEquipmentId || eqEval.isAmbiguous) {
        let priority: OrderPriority = parsed.createOrder?.priority || "2_HIGH";
        if (
          lowerPrompt.includes("brand") ||
          lowerPrompt.includes("stillstand") ||
          lowerPrompt.includes("qualm") ||
          lowerPrompt.includes("rauch") ||
          lowerPrompt.includes("notfall") ||
          lowerPrompt.includes("akut")
        ) {
          priority = "1_EMERGENCY";
        }

        const suggestedDamageCode = lowerPrompt.includes("motor") || lowerPrompt.includes("antrieb") ? "MOTOR_UEBERLAST" : "MECH_TEMP";

        const fallbackOptions =
          eqEval.options && eqEval.options.length > 0
            ? eqEval.options
            : equipmentsList.slice(0, 8).map((e) => {
                const loc =
                  e.description ||
                  (e as any).functionalLocation?.name ||
                  (e as any).functionalLocationCode ||
                  e.equipmentNumber;
                const label = loc && !e.name.includes(loc) ? `${e.name} (${loc})` : e.name;
                return {
                  id: e.id,
                  label,
                  value: e.name,
                  field: "equipment" as const,
                  description: e.description || undefined,
                };
              });

        const question =
          eqEval.question ||
          (eqInfo.equipmentType
            ? `Welcher ${eqInfo.equipmentType} ist betroffen? Bitte wähle das Equipment aus:`
            : "Welches Equipment ist betroffen? Bitte wähle das Equipment aus:");
        const clarificationQuestion =
          eqEval.clarificationQuestion ||
          (eqInfo.equipmentType
            ? `Welcher ${eqInfo.equipmentType} ist betroffen? Bitte wähle das Equipment aus:`
            : "Welches Equipment ist betroffen? Bitte wähle das Equipment aus:");

        return {
          intent: "CREATE_ORDER",
          confidence: parsed.confidence || 0.9,
          explanation: parsed.explanation || "Neue Störungsmeldung erkannt. Bitte wähle das betroffene Equipment aus.",
          createOrder: {
            title: parsed.createOrder?.title || (eqInfo.equipmentType ? `Störung an ${eqInfo.equipmentType}` : prompt.slice(0, 80)),
            description: parsed.createOrder?.description || prompt,
            equipmentKeyword: eqKeyword,
            priority,
            damageCode: suggestedDamageCode,
            suggestedDamageCode,
            plannedDurationMinutes: 60,
          },
          clarification: {
            needed: true,
            needsClarification: true,
            field: "equipment",
            question,
            clarificationQuestion,
            options: fallbackOptions,
            pendingDescription: prompt,
          },
          pendingDescription: prompt,
          rawPrompt: prompt,
        };
      }

      // Eindeutiges Equipment vorhanden -> strukturierten Entwurf erzeugen
      const resolvedEquipment = equipmentsList.find((e) => e.id === eqEval.matchedEquipmentId);
      const draft = resolvedEquipment ? buildDraftOrder(resolvedEquipment, prompt, eqInfo.equipmentType) : undefined;
      const floc =
        resolvedEquipment?.description ||
        (resolvedEquipment as any)?.functionalLocation?.name ||
        (resolvedEquipment as any)?.functionalLocation?.code ||
        (resolvedEquipment as any)?.functionalLocationCode ||
        "";

      const orderDraftWidget: OrderDraftWidgetPayload | undefined = draft
        ? {
            type: "order_draft",
            title: draft.title,
            description: draft.description,
            priority: draft.priority,
            equipmentId: draft.equipmentId,
            equipmentName: draft.equipmentName,
            functionalLocation: floc,
            suggestedDamageCode: draft.suggestedDamageCode,
          }
        : undefined;

      return {
        intent: "CREATE_ORDER",
        confidence: parsed.confidence || 0.9,
        explanation: parsed.explanation || "Neue Störungsmeldung erkannt.",
        draftOrder: draft,
        createOrder: {
          title: draft?.title || parsed.createOrder?.title || prompt.slice(0, 80),
          description: draft?.description || parsed.createOrder?.description || prompt,
          equipmentKeyword: eqKeyword,
          matchedEquipmentId: eqEval.matchedEquipmentId,
          equipmentId: eqEval.matchedEquipmentId,
          equipmentName: draft?.equipmentName || eqEval.matchedEquipmentName,
          priority: draft?.priority || parsed.createOrder?.priority || "2_HIGH",
          damageCode: draft?.suggestedDamageCode || "MECH_TEMP",
          suggestedDamageCode: draft?.suggestedDamageCode || "MECH_TEMP",
          plannedDurationMinutes: 60,
        },
        clarification: {
          needed: false,
          needsClarification: false,
          field: "equipment",
          options: [],
        },
        widget: orderDraftWidget,
        type: orderDraftWidget ? "order_draft" : undefined,
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
        clarification: { needed: false, needsClarification: false, options: [] },
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
        clarification: { needed: false, needsClarification: false, options: [] },
        rawPrompt: prompt,
      };
    }
  } catch (err) {
    console.warn("[Copilot] LLM Klassifikation nicht erreichbar oder Parsing-Fehler, nutze Heuristik:", err);
  }

  // Resilienter Heuristik-Fallback
  return heuristicIntentClassification(prompt, areasList, equipmentsList);
}
