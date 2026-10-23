import { eq, and, sql, desc } from "drizzle-orm";
import { db } from "@/db";
import {
  maintenanceOrders,
  orderHistoryEmbeddings,
  equipments,
} from "@/db/schema";
import {
  getAiProvider,
  getLlmModelForTask,
  mapToPgVectorDimensions,
  PGVECTOR_DIMENSIONS,
} from "./provider";
import {
  getSeedHistoricalMeasures,
  calculateCosineSimilarity,
  SeedHistoricalMeasure,
} from "./seed-historical-orders";
export * from "./copilot";

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
 * 1. Echtzeit Störungs-Copilot & RAG-Analyse (Live / Debounced Input)
 * Durchsucht bestehende Aufträge (pgvector) und die 30 Seed-Altmaßnahmen nach ähnlichen Lösungen
 * und prüft auf offene Dubletten.
 */
export async function analyzeFaultInput(payload: {
  tenantId: string;
  equipmentId?: string;
  userInputText: string;
}): Promise<FaultCopilotAnalysisResult> {
  const { tenantId, equipmentId, userInputText } = payload;
  const routingModel = await getLlmModelForTask("routing", tenantId);
  const aiProvider = await getAiProvider(tenantId, { task: "routing", model: routingModel });

  // 1. Text-Embedding für den aktuellen Input berechnen (Garantierte 1536 Dimensionen für pgvector)
  const rawInputVector = await aiProvider.createEmbedding(userInputText);
  const inputVector =
    rawInputVector.length === PGVECTOR_DIMENSIONS
      ? rawInputVector
      : mapToPgVectorDimensions(rawInputVector, PGVECTOR_DIMENSIONS);

  // 2. Equipment-Details laden (inkl. Modell und Hersteller für Klassen-Filter)
  let targetEquipment: { id: string; name: string; modelType: string | null; manufacturer: string | null } | null = null;
  if (equipmentId) {
    try {
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
    } catch {
      // DB nicht verfügbar
    }
  }

  // 3. Duplikaterkennung: Suche nach OFFENEN Aufträgen am selben Equipment
  let duplicateWarning: FaultCopilotAnalysisResult["duplicateWarning"] | undefined;
  if (equipmentId) {
    try {
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
        (o) => o.currentStatus?.category !== "COMPLETED" && o.currentStatus?.category !== "CLOSED"
      );

      if (activeOpenOrders.length > 0) {
        // Zunächst schnelle Textähnlichkeitsprüfung
        const lowerInput = userInputText.toLowerCase();
        for (const openOrder of activeOpenOrders) {
          const lowerTitle = (openOrder.title || "").toLowerCase();
          const lowerDesc = (openOrder.description || "").toLowerCase();
          const hasCommonKeywords = lowerInput.split(/\s+/).filter((w) => w.length > 4 && (lowerTitle.includes(w) || lowerDesc.includes(w)));

          if (hasCommonKeywords.length >= 2 || lowerTitle.includes(lowerInput.slice(0, 20))) {
            duplicateWarning = {
              isDuplicateDetected: true,
              existingOrderId: openOrder.id,
              existingOrderNumber: openOrder.orderNumber,
              title: openOrder.title,
              statusName: openOrder.currentStatus?.name || "OFFEN",
              similarityScore: 88,
              explanation: `Mögliches Duplikat zu offenem Auftrag ${openOrder.orderNumber}: "${openOrder.title}" an der gleichen Maschine gemeldet.`,
            };
            break;
          }
        }

        // Falls noch nicht per Keyword gefunden, LLM-Prüfung
        if (!duplicateWarning) {
          const duplicatePrompt = `
Vergleiche die folgende neue Störungsmeldung mit bestehenden offenen Aufträgen an derselben Maschine.
Neue Meldung: "${userInputText}"

Bestehende offene Aufträge:
${activeOpenOrders.map((o) => `[ID: ${o.id}, Nr: ${o.orderNumber}, Status: ${o.currentStatus?.name}] Titel: ${o.title}. Details: ${o.description}`).join("\n")}

Antworte im JSON-Format:
{
  "isDuplicate": boolean,
  "matchedOrderId": string or null,
  "explanation": string,
  "confidenceScore": number
}`;
          try {
            const rawDup = await aiProvider.createChatCompletion(
              [
                { role: "system", content: "Du bist ein präziser Instandhaltungs-Deduplizierer. Antworte in JSON." },
                { role: "user", content: duplicatePrompt },
              ],
              { jsonMode: true, temperature: 0.0, model: routingModel, task: "routing", tenantId }
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
                  statusName: matched.currentStatus?.name || "OFFEN",
                  similarityScore: Math.round((dupRes.confidenceScore || 0.85) * 100),
                  explanation: dupRes.explanation,
                };
              }
            }
          } catch {
            // Weiter ohne Duplikatblocker
          }
        }
      }
    } catch {
      // Weiter
    }
  }

  // 4. pgvector Ähnlichkeitssuche über orderHistoryEmbeddings
  let pgvectorMatches: Array<{
    title: string;
    cause: string;
    solution: string;
    parts: Array<{ partNumber: string; name: string; quantity: number }>;
    similarity: number;
    orderNumber: string;
  }> = [];

  try {
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
        pgvectorMatches.push({
          title: order.title,
          cause: order.rootCauseDescription || order.damageCode || "Verschleiß",
          solution: order.resolutionSummary || order.description,
          parts: order.sparePartBookings.map((b) => ({
            partNumber: b.sparePart.internalPartNumber,
            name: b.sparePart.name,
            quantity: Number(b.quantityConsumed) || 1,
          })),
          similarity: Number(chunk.similarity) || 0.75,
          orderNumber: order.orderNumber,
        });
      }
    }
  } catch {
    // pgvector DB Query nicht verfügbar
  }

  // 5. Fallback & Ergänzung aus den 30 Seed-Altmaßnahmen via semantischer Ähnlichkeit
  const seedMeasures = getSeedHistoricalMeasures();
  const scoredSeeds = seedMeasures.map((seed) => {
    const sim = calculateCosineSimilarity(inputVector, seed.embedding);
    return { seed, sim };
  });

  scoredSeeds.sort((a, b) => b.sim - a.sim);
  const topSeeds = scoredSeeds.slice(0, 3);

  // Wenn keine Treffer in der DB waren, nutze die Seed-Altmaßnahmen
  if (pgvectorMatches.length === 0) {
    pgvectorMatches = topSeeds.map(({ seed, sim }) => ({
      title: seed.title,
      cause: seed.cause,
      solution: seed.solution,
      parts: seed.recommendedSpareParts,
      similarity: sim,
      orderNumber: seed.orderNumber,
    }));
  }

  // 6. Kontext für LLM-Synthese formatieren
  const resolvedOrdersContext = pgvectorMatches.map((m) => `
[Altmaßnahme / Auftrag ${m.orderNumber}]
- Symptom: ${m.title}
- Ursache: ${m.cause}
- Maßnahme / Lösung: ${m.solution}
- Verbrauchte Ersatzteile: ${m.parts.map((p) => `${p.quantity}x ${p.name} (${p.partNumber})`).join(", ") || "Keine"}
- Ähnlichkeit (pgvector): ${(m.similarity * 100).toFixed(1)}%
`).join("\n---\n");

  // 7. LLM Structured Output Synthese
  const synthesisPrompt = `
Du bist "MaintAI Copilot", ein erfahrener Leitstand- und Instandhaltungs-Ingenieur für Industrieanlagen.
Der Techniker tippt folgendes Problem ein:
"${userInputText}"

Maschinenkontext:
${targetEquipment ? `Name: ${targetEquipment.name}, Modell: ${targetEquipment.modelType || "Standard"}, Hersteller: ${targetEquipment.manufacturer || "Unbekannt"}` : "Industrielle Produktionsanlage"}

Historische Wissensbasis (pgvector Treffer aus 30 Seed-Altmaßnahmen):
${resolvedOrdersContext}

Erstelle nun ein valides JSON-Objekt mit genau dieser Struktur:
{
  "suggestedSolutions": [
    {
      "title": "Prägnante Überschrift der Maßnahme",
      "cause": "Wahrscheinliche Ursache",
      "solution": "Konkrete Schritt-für-Schritt Reparaturanweisung",
      "recommendedSpareParts": [
        { "partNumber": "Teilenummer", "name": "Ersatzteilbezeichnung", "quantity": 1 }
      ],
      "confidencePercent": number (70-98),
      "sourceOrderNumber": "Auftragsnummer aus Historie"
    }
  ],
  "documentationDraft": {
    "refinedTitle": "Technisch präziser Auftragstitel nach DIN/SAP-Standard",
    "technicalDescription": "Strukturierter Meldetext: Was ist passiert? Welche Symptome liegen vor? Welche Sicherheitsmaßnahmen sind nötig?",
    "likelyDamageGroup": "MECHANISCH" oder "ELEKTRISCH" oder "HYDRAULISCH" oder "PNEUMATISCH",
    "recommendedPriority": "1_EMERGENCY" oder "2_HIGH" oder "3_MEDIUM" oder "4_LOW",
    "initialChecklistHint": "Wichtigster Erstprüfschritt für den Techniker vor Ort"
  }
}
`;

  let suggestedSolutions: FaultCopilotAnalysisResult["suggestedSolutions"] = [];
  let documentationDraft: FaultCopilotAnalysisResult["documentationDraft"] | undefined = undefined;

  try {
    const llmResponse = await aiProvider.createChatCompletion(
      [
        { role: "system", content: "Du erzeugst ausschließlich valides JSON ohne Markdown-Ticks." },
        { role: "user", content: synthesisPrompt },
      ],
      { jsonMode: true, temperature: 0.1, model: routingModel, task: "routing", tenantId }
    );

    const parsed = JSON.parse(llmResponse);
    if (Array.isArray(parsed.suggestedSolutions) && parsed.suggestedSolutions.length > 0) {
      suggestedSolutions = parsed.suggestedSolutions;
    }
    if (parsed.documentationDraft) {
      documentationDraft = parsed.documentationDraft;
    }
  } catch {
    // Fallback auf deterministische Synthese aus den top Seed-Matches
  }

  // Falls LLM offline oder ungültig, bilde Vorschläge direkt aus den pgvector/Seed-Treffern
  if (!suggestedSolutions || suggestedSolutions.length === 0) {
    suggestedSolutions = pgvectorMatches.slice(0, 2).map((m) => ({
      title: m.title,
      cause: m.cause,
      solution: m.solution,
      recommendedSpareParts: m.parts,
      confidencePercent: Math.min(96, Math.max(72, Math.round(m.similarity * 100))),
      sourceOrderNumber: m.orderNumber,
    }));
  }

  if (!documentationDraft) {
    const topMatch = pgvectorMatches[0];
    const isEmergency = /stillstand|rauch|explosion|havarie|feuer|überhitz/i.test(userInputText);

    documentationDraft = {
      refinedTitle: topMatch ? topMatch.title : userInputText.slice(0, 80),
      technicalDescription: `Gemeldete Störung: ${userInputText}\n\nErstprüfung und Schadensbegrenzung nach Leitstandvorgabe durchführen.`,
      likelyDamageGroup: topMatch?.cause.includes("Lager") || topMatch?.cause.includes("Kette") ? "MECHANISCH" : "ELEKTRISCH",
      recommendedPriority: isEmergency ? "1_EMERGENCY" : "3_MEDIUM",
      initialChecklistHint: "Anlage spannungs- und drucklos schalten, Sichtprüfung und Schwingungsmessung vornehmen.",
    };
  }

  return {
    duplicateWarning,
    suggestedSolutions,
    documentationDraft,
  };
}

/**
 * 2. Mitlernendes RAG: Aktualisiert automatisch den Vektor-Index, sobald ein Auftrag abgeschlossen wird.
 */
export async function indexOrderKnowledgeOnCompletion(orderId: string): Promise<void> {
  try {
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
    const rawEmbedding = await aiProvider.createEmbedding(synthesizedText);
    const embedding =
      rawEmbedding.length === PGVECTOR_DIMENSIONS
        ? rawEmbedding
        : mapToPgVectorDimensions(rawEmbedding, PGVECTOR_DIMENSIONS);

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
  } catch (err) {
    console.warn("indexOrderKnowledgeOnCompletion Fehler:", err);
  }
}
