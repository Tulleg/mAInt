import { eq, and, sql, cosineDistance, desc } from "drizzle-orm";
import { db } from "../db";
import {
  maintenanceOrders,
  orderHistoryEmbeddings,
  equipments,
  orderSparePartBookings,
  spareParts,
  workflowStatuses,
} from "../db/schema";
import { getAiProvider } from "./providers/ai-provider";

export interface FaultCopilotAnalysisResult {
  duplicateWarning?: {
    isDuplicateDetected: boolean;
    existingOrderId?: string;
    existingOrderNumber?: string;
    title?: string;
    statusName?: string;
    similarityScore: number;
    explanation: string;
  };
  suggestedSolutions: Array<{
    title: string;
    cause: string;
    solution: string;
    recommendedSpareParts: Array<{
      partNumber: string;
      name: string;
      quantity: number;
    }>;
    confidencePercent: number;
    sourceOrderNumber: string;
  }>;
  documentationDraft: {
    refinedTitle: string;
    technicalDescription: string;
    likelyDamageGroup: string;
    recommendedPriority: "1_EMERGENCY" | "2_HIGH" | "3_MEDIUM" | "4_LOW";
    initialChecklistHint: string;
  };
}

/**
 * 1. Echtzeit Störungs-Copilot & RAG-Analyse (Debounced Input)
 */
export async function analyzeFaultInput(payload: {
  tenantId: string;
  equipmentId?: string;
  userInputText: string;
}): Promise<FaultCopilotAnalysisResult> {
  const { tenantId, equipmentId, userInputText } = payload;
  const aiProvider = await getAiProvider(tenantId);

  // 1. Text-Embedding für den aktuellen Input berechnen
  const inputVector = await aiProvider.createEmbedding(userInputText);

  // 2. Equipment-Details laden (inkl. Modell und Hersteller für Klassen-Filter)
  let targetEquipment: { id: string; name: string; modelType: string | null; manufacturer: string | null } | null = null;
  if (equipmentId) {
    const eqItem = await db.query.equipments.findFirst({
      where: and(eq(equipments.tenantId, tenantId), eq(equipments.id, equipmentId)),
    });
    if (eqItem) {
      targetEquipment = {
        id: eqItem.id,
        name: eqItem.name,
        modelType: eqItem.modelType,
        manufacturer: eqItem.manufacturer,
      };
    }
  }

  // 3. Duplikaterkennung: Suche nach OFFENEN Aufträgen am selben Equipment
  let duplicateWarning: FaultCopilotAnalysisResult["duplicateWarning"] | undefined;
  if (equipmentId) {
    const openOrders = await db.query.maintenanceOrders.findMany({
      where: and(
        eq(maintenanceOrders.tenantId, tenantId),
        eq(maintenanceOrders.equipmentId, equipmentId)
      ),
      with: {
        currentStatus: true,
      },
      limit: 5,
    });

    const activeOpenOrders = openOrders.filter(
      (o) => o.currentStatus.category !== "COMPLETED" && o.currentStatus.category !== "CLOSED"
    );

    if (activeOpenOrders.length > 0) {
      // Prompt zur schnellen Duplikatsprüfung
      const duplicatePrompt = `
Vergleiche die folgende neue Störungsmeldung mit bestehenden offenen Aufträgen an derselben Maschine.
Neue Meldung: "${userInputText}"

Bestehende offene Aufträge:
${activeOpenOrders.map((o) => `[ID: ${o.id}, Nr: ${o.orderNumber}, Status: ${o.currentStatus.name}] Titel: ${o.title}. Details: ${o.description}`).join("\n")}

Antworte im JSON-Format:
{
  "isDuplicate": boolean,
  "matchedOrderId": string or null,
  "explanation": string,
  "confidenceScore": number (0 bis 1)
}`;

      try {
        const rawDup = await aiProvider.createChatCompletion(
          [
            { role: "system", content: "Du bist ein präziser Instandhaltungs-Deduplizierer." },
            { role: "user", content: duplicatePrompt },
          ],
          { jsonMode: true, temperature: 0.0 }
        );
        const dupRes = JSON.parse(rawDup);
        if (dupRes.isDuplicate && dupRes.matchedOrderId) {
          const matched = activeOpenOrders.find((o) => o.id === dupRes.matchedOrderId);
          if (matched) {
            duplicateWarning = {
              isDuplicateDetected: true,
              existingOrderId: matched.id,
              existingOrderNumber: matched.orderNumber,
              title: matched.title,
              statusName: matched.currentStatus.name,
              similarityScore: Math.round((dupRes.confidenceScore || 0.85) * 100),
              explanation: dupRes.explanation,
            };
          }
        }
      } catch (e) {
        // Fallback: Silent continue
      }
    }
  }

  // 4. Kosinus-Ähnlichkeitssuche über pgvector
  // Sucht im semantischen Gedächtnis nach gelösten Aufträgen
  const similarity = sql<number>`1 - (${orderHistoryEmbeddings.embedding} <=> ${JSON.stringify(inputVector)}::vector)`;

  const similarChunks = await db
    .select({
      id: orderHistoryEmbeddings.id,
      maintenanceOrderId: orderHistoryEmbeddings.maintenanceOrderId,
      synthesizedDocumentText: orderHistoryEmbeddings.synthesizedDocumentText,
      similarity,
    })
    .from(orderHistoryEmbeddings)
    .where(eq(orderHistoryEmbeddings.tenantId, tenantId))
    .orderBy(desc(similarity))
    .limit(4);

  // 5. Verknüpfte Aufträge & verbrauchte Ersatzteile laden
  const resolvedOrdersContext: string[] = [];
  for (const chunk of similarChunks) {
    const order = await db.query.maintenanceOrders.findFirst({
      where: eq(maintenanceOrders.id, chunk.maintenanceOrderId),
      with: {
        sparePartBookings: {
          with: { sparePart: true },
        },
      },
    });

    if (order) {
      const parts = order.sparePartBookings.map(
        (b) => `${b.quantityConsumed}x ${b.sparePart.internalPartNumber} (${b.sparePart.name})`
      );
      resolvedOrdersContext.push(`
[Auftrag ${order.orderNumber}]
- Symptom / Titel: ${order.title}
- Fehlerbild / Schadenscode: ${order.damageCode || "N/A"}
- Tatsächliche Ursache: ${order.rootCauseDescription || "N/A"}
- Durchgeführte Maßnahme / Lösung: ${order.resolutionSummary || order.description}
- Verbrauchte Ersatzteile: ${parts.length > 0 ? parts.join(", ") : "Keine"}
- Ähnlichkeits-Index: ${(chunk.similarity * 100).toFixed(1)}%
`);
    }
  }

  // 6. LLM Structured Output Synthese
  const synthesisPrompt = `
Du bist "MaintAI Copilot", ein erfahrener Leitstand- und Instandhaltungs-Ingenieur für industrielle Anlagen.
Der Techniker tippt gerade folgendes Problem ein:
"${userInputText}"

Maschinenkontext:
${targetEquipment ? `Name: ${targetEquipment.name}, Modell: ${targetEquipment.modelType || "Standard"}, Hersteller: ${targetEquipment.manufacturer || "Unbekannt"}` : "Allgemeine Anlage"}

Historische Wissensbasis (pgvector Treffer zu ähnlichen Störungen):
${resolvedOrdersContext.length > 0 ? resolvedOrdersContext.join("\n---\n") : "Keine exakten historischen Treffer vorhanden. Verwende industrielles Best-Practice Ingenieurwissen."}

Erstelle nun ein strukturiertes JSON-Objekt mit genau folgendem Schema:
{
  "suggestedSolutions": [
    {
      "title": "Prägnante Überschrift der Maßnahme",
      "cause": "Wahrscheinliche Ursache (z.B. Lagerschaden, Kavitation, Wicklungsschluss)",
      "solution": "Konkrete Schritt-für-Schritt Reparaturanweisung",
      "recommendedSpareParts": [
        { "partNumber": "z.B. 6205-2RSH", "name": "Rillenkugellager SKF", "quantity": 1 }
      ],
      "confidencePercent": number (zwischen 50 und 98),
      "sourceOrderNumber": "Auftragsnummer aus Historie oder 'KI-Standard'"
    }
  ],
  "documentationDraft": {
    "refinedTitle": "Technisch präziser Auftragstitel nach DIN/SAP-Standard",
    "technicalDescription": "Strukturierter Meldetext: Was ist passiert? Welche Symptome liegen vor? Welche Sicherheitsmaßnahmen sind nötig?",
    "likelyDamageGroup": "z.B. MECHANISCH / ELEKTRISCH / HYDRAULISCH",
    "recommendedPriority": "1_EMERGENCY" oder "2_HIGH" oder "3_MEDIUM" oder "4_LOW",
    "initialChecklistHint": "Wichtigster Erstprüfschritt für den Techniker vor Ort"
  }
}
`;

  const llmResponse = await aiProvider.createChatCompletion(
    [
      { role: "system", content: "Du erzeugst ausschließlich valides JSON ohne Markdown-Ticks." },
      { role: "user", content: synthesisPrompt },
    ],
    { jsonMode: true, temperature: 0.1 }
  );

  let parsed: any;
  try {
    parsed = JSON.parse(llmResponse);
  } catch (err) {
    parsed = {
      suggestedSolutions: [],
      documentationDraft: {
        refinedTitle: userInputText.slice(0, 80),
        technicalDescription: userInputText,
        likelyDamageGroup: "MECHANISCH",
        recommendedPriority: "3_MEDIUM",
        initialChecklistHint: "Sichtprüfung durchführen",
      },
    };
  }

  return {
    duplicateWarning,
    suggestedSolutions: parsed.suggestedSolutions || [],
    documentationDraft: parsed.documentationDraft,
  };
}

/**
 * 2. Mitlernendes RAG: Aktualisiert automatisch den Vektor-Index, sobald ein Auftrag abgeschlossen wird.
 */
export async function indexOrderKnowledgeOnCompletion(orderId: string): Promise<void> {
  const order = await db.query.maintenanceOrders.findFirst({
    where: eq(maintenanceOrders.id, orderId),
    with: {
      equipment: true,
      sparePartBookings: {
        with: { sparePart: true },
      },
    },
  });

  if (!order) return;

  // Synthetisiertes Wissensdokument zusammenstellen
  const partsSummary = order.sparePartBookings
    .map((b) => `${b.quantityConsumed}x ${b.sparePart.name} (${b.sparePart.internalPartNumber})`)
    .join(", ");

  const synthesizedText = `
Anlage: ${order.equipment?.name || "Unbekannt"} | Modell: ${order.equipment?.modelType || "N/A"} | Hersteller: ${order.equipment?.manufacturer || "N/A"}
Auftragsart: ${order.orderNumber}
Problem / Symptom: ${order.title}
Detailbeschreibung: ${order.description}
Fehlerbild / Schadenscode: ${order.damageCode || "Kein Code"}
Tatsächliche Ursache: ${order.rootCauseDescription || "Nicht spezifiziert"}
Durchgeführte Lösung / Maßnahmen: ${order.resolutionSummary || order.description}
Verbaute Ersatzteile: ${partsSummary || "Keine Ersatzteile verbucht"}
Stillstandszeit: ${order.downtimeMinutes} Minuten
`.trim();

  const aiProvider = await getAiProvider(order.tenantId);
  const embedding = await aiProvider.createEmbedding(synthesizedText);

  // Bestehenden Chunk überschreiben oder neuen anlegen
  const existing = await db.query.orderHistoryEmbeddings.findFirst({
    where: and(
      eq(orderHistoryEmbeddings.tenantId, order.tenantId),
      eq(orderHistoryEmbeddings.maintenanceOrderId, order.id)
    ),
  });

  if (existing) {
    await db
      .update(orderHistoryEmbeddings)
      .set({
        synthesizedDocumentText: synthesizedText,
        embedding,
        embeddingModel: process.env.AI_EMBEDDING_MODEL || "text-embedding-3-small",
        metadataJson: {
          equipmentType: order.equipment?.modelType || undefined,
          manufacturer: order.equipment?.manufacturer || undefined,
          damageCode: order.damageCode || undefined,
          causeCode: order.causeCode || undefined,
          downtimeMinutes: order.downtimeMinutes,
          sparePartNumbers: order.sparePartBookings.map((b) => b.sparePart.internalPartNumber),
        },
        updatedAt: new Date(),
      })
      .where(eq(orderHistoryEmbeddings.id, existing.id));
  } else {
    await db.insert(orderHistoryEmbeddings).values({
      tenantId: order.tenantId,
      maintenanceOrderId: order.id,
      equipmentId: order.equipmentId,
      chunkIndex: 0,
      synthesizedDocumentText: synthesizedText,
      embedding,
      embeddingModel: process.env.AI_EMBEDDING_MODEL || "text-embedding-3-small",
      metadataJson: {
        equipmentType: order.equipment?.modelType || undefined,
        manufacturer: order.equipment?.manufacturer || undefined,
        damageCode: order.damageCode || undefined,
        causeCode: order.causeCode || undefined,
        downtimeMinutes: order.downtimeMinutes,
        sparePartNumbers: order.sparePartBookings.map((b) => b.sparePart.internalPartNumber),
      },
    });
  }
}
