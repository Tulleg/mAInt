import { NextRequest, NextResponse } from "next/server";
import { executeAnalyticsPrompt } from "@/lib/ai/analytics-agent";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, userPrompt } = body;

    if (!tenantId || !userPrompt) {
      return NextResponse.json(
        { success: false, error: "tenantId und userPrompt sind erforderlich." },
        { status: 400 }
      );
    }

    const result = await executeAnalyticsPrompt({
      tenantId,
      userPrompt,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Fehler bei der Analytics-Abfrage" },
      { status: 500 }
    );
  }
}
