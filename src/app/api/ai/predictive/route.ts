import { NextRequest, NextResponse } from "next/server";
import {
  analyzeEquipmentPredictiveHealth,
  getTenantPredictiveOverview,
} from "@/lib/ai/predictive";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId") || "demo-tenant-1000";
    const equipmentId = searchParams.get("equipmentId");

    if (equipmentId) {
      const single = await analyzeEquipmentPredictiveHealth(equipmentId);
      return NextResponse.json({ success: true, data: single });
    }

    const overview = await getTenantPredictiveOverview(tenantId);
    return NextResponse.json({ success: true, data: overview });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Fehler bei der Predictive Health Analyse" },
      { status: 500 }
    );
  }
}
