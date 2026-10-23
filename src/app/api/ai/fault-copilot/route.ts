import { NextRequest, NextResponse } from "next/server";
import { analyzeFaultInput } from "@/lib/ai/fault-copilot";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, userInputText, equipmentId } = body;

    if (!tenantId || !userInputText) {
      return NextResponse.json(
        { success: false, error: "tenantId und userInputText sind erforderlich." },
        { status: 400 }
      );
    }

    const result = await analyzeFaultInput({
      tenantId,
      userInputText,
      equipmentId: equipmentId || undefined,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Fehler bei der Copilot-Analyse" },
      { status: 500 }
    );
  }
}
