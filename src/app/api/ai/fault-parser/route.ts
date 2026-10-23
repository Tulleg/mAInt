import { NextRequest, NextResponse } from "next/server";
import { parseFaultPrompt } from "@/lib/ai/fault-parser";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, prompt, availableEquipments } = body;

    if (!tenantId || !prompt) {
      return NextResponse.json(
        { success: false, error: "tenantId und prompt sind erforderlich." },
        { status: 400 }
      );
    }

    const result = await parseFaultPrompt({
      tenantId,
      prompt,
      availableEquipments: availableEquipments || [],
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Fehler beim Parsen der Störungsmeldung" },
      { status: 500 }
    );
  }
}
