import { NextRequest, NextResponse } from "next/server";
import {
  getTenantAiConfig,
  updateTenantAiConfig,
  testAiConnection,
  AiProviderType,
} from "@/lib/ai/provider";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId") || undefined;
    const config = await getTenantAiConfig(tenantId);
    return NextResponse.json({ success: true, config });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Fehler beim Laden der AI-Konfiguration" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action || "update";

    if (action === "test") {
      const testResult = await testAiConnection({
        provider: body.provider,
        baseUrl: body.endpointUrl,
        apiKey: body.apiKey,
        chatModel: body.chatModel,
        embeddingModel: body.embeddingModel,
        embeddingDimensions: body.embeddingDimensions,
      });
      return NextResponse.json(testResult);
    }

    if (!body.tenantId) {
      return NextResponse.json(
        { success: false, error: "tenantId ist erforderlich." },
        { status: 400 }
      );
    }

    const updated = await updateTenantAiConfig(body.tenantId, {
      provider: body.provider as AiProviderType,
      endpointUrl: body.endpointUrl,
      apiKey: body.apiKey,
      chatModel: body.chatModel,
      embeddingModel: body.embeddingModel,
      embeddingDimensions: body.embeddingDimensions,
    });

    return NextResponse.json({ success: true, config: updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Fehler beim Speichern der AI-Konfiguration" },
      { status: 500 }
    );
  }
}
