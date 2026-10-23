import { getAiProvider, getLlmModelForTask } from "./providers/ai-provider";

export interface ParsedFaultDraft {
  title: string;
  description: string;
  equipmentKeyword?: string;
  matchedEquipmentId?: string;
  priority: "1_EMERGENCY" | "2_HIGH" | "3_MEDIUM" | "4_LOW";
  plannedDurationMinutes: number;
  damageCode?: string;
  missingFields: Array<{
    fieldName: "equipment" | "priority" | "symptoms" | "downtime";
    question: string;
  }>;
  aiCommentary: string;
}

/**
 * Wandelt einen natürlichsprachlichen Sprach- oder Text-Prompt des Werkstatt-Mitarbeiters
 * in ein strukturiertes Störungs-Formular um und ermittelt fehlende Pflichtangaben.
 */
export async function parseFaultPrompt(payload: {
  tenantId: string;
  prompt: string;
  availableEquipments: Array<{ id: string; name: string; equipmentNumber: string }>;
}): Promise<ParsedFaultDraft> {
  const { tenantId, prompt, availableEquipments } = payload;
  const routingModel = await getLlmModelForTask("routing", tenantId);
  const ai = await getAiProvider(tenantId, { task: "routing", model: routingModel });

  const systemInstructions = `
Du bist ein erfahrener Meister und Instandhaltungs-Leitstand-Disponent.
Deine Aufgabe ist es, aus einer unstrukturierten Störungsmeldung eines Werkers oder Schichtleiters ein strukturiertes Industrie-Störungsformular (CMMS / SAP PM) abzuleiten.

VERFÜGBARE ANLAGEN IM WERK:
${availableEquipments.map((e) => `- ID: "${e.id}", Name: "${e.name}", Nr: "${e.equipmentNumber}"`).join("\n")}

PRIORITÄTEN:
- "1_EMERGENCY": Produktionsstillstand, Personen- oder Sicherheitsgefahr, Havarie.
- "2_HIGH": Dringend (Störung droht die Linie innerhalb weniger Stunden lahmzulegen, kein Puffer).
- "3_MEDIUM": Normal (Maschine läuft noch oder Puffer vorhanden, Reparatur innerhalb 24-48h nötig).
- "4_LOW": Gering (Schönheitsfehler, Geräusch ohne Ausfallgefahr, geplante Inspektion).

AUFGABE:
1. Extrahiere einen präzisen, normgerechten Auftragstitel ("title").
2. Formuliere eine saubere, strukturierte Problembeschreibung ("description") mit Symptomen.
3. Finde das am besten passende Equipment aus der Liste ("matchedEquipmentId").
4. Schätze die Priorität ("priority") und die ungefähre Arbeitsdauer in Minuten ("plannedDurationMinutes", Standard 60m).
5. FEHLENDE ANGABEN ("missingFields"): Prüfe, ob wesentliche Angaben fehlen (z.B. welche Maschine genau betroffen ist, oder ob die Anlage steht). Formuliere konkrete Rückfragen.

Antworte IMMER als valides JSON:
{
  "title": "Prägnanter Störungstitel",
  "description": "Ausführliche technische Beschreibung",
  "matchedEquipmentId": "uuid-aus-der-liste oder null falls unklar",
  "priority": "1_EMERGENCY" | "2_HIGH" | "3_MEDIUM" | "4_LOW",
  "plannedDurationMinutes": 60,
  "damageCode": "z.B. MECH_LAGER, ELEK_SENSOR, HYDR_LECK oder null",
  "missingFields": [
    {
      "fieldName": "equipment" | "priority" | "symptoms" | "downtime",
      "question": "Rückfrage an den Benutzer..."
    }
  ],
  "aiCommentary": "Erklärung des Assistenten, was erkannt wurde."
}
`;

  try {
    const raw = await ai.createChatCompletion(
      [
        { role: "system", content: systemInstructions },
        { role: "user", content: `Werker-Meldung: "${prompt}"` },
      ],
      { jsonMode: true, temperature: 0.1, model: routingModel, task: "routing", tenantId }
    );
    const parsed = JSON.parse(raw);
    return {
      title: parsed.title || prompt.slice(0, 80),
      description: parsed.description || prompt,
      matchedEquipmentId: parsed.matchedEquipmentId || undefined,
      priority: parsed.priority || "3_MEDIUM",
      plannedDurationMinutes: parsed.plannedDurationMinutes || 60,
      damageCode: parsed.damageCode || undefined,
      missingFields: Array.isArray(parsed.missingFields) ? parsed.missingFields : [],
      aiCommentary: parsed.aiCommentary || "Störungsmeldung analysiert.",
    };
  } catch (err) {
    // Intelligenter Heuristik-Fallback
    const isEmerg = /stillstand|rauch|brand|gefahr|sofort|ausfall/i.test(prompt);
    return {
      title: prompt.slice(0, 80),
      description: prompt,
      priority: isEmerg ? "1_EMERGENCY" : "3_MEDIUM",
      plannedDurationMinutes: 60,
      missingFields: [
        {
          fieldName: "equipment",
          question: "An welchem Aggregat ist die Störung aufgetreten?",
        },
      ],
      aiCommentary: "Text übernommen. Bitte prüfe die markierten Pflichtfelder.",
    };
  }
}
