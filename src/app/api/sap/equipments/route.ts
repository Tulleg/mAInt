import { NextRequest, NextResponse } from "next/server";
import { getSapConnector } from "@/lib/sap/sap-connector";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId");

  if (!tenantId) {
    return NextResponse.json({ error: "tenantId ist erforderlich." }, { status: 400 });
  }

  try {
    const connector = await getSapConnector(tenantId);
    const result = await connector.pullEquipments();
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Fehler beim Abgleich der SAP Equipments." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId } = body;

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId ist erforderlich." }, { status: 400 });
    }

    const connector = await getSapConnector(tenantId);
    const result = await connector.pullEquipments();
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Fehler beim Anstoßen des SAP Equipment-Pulls." },
      { status: 500 }
    );
  }
}
