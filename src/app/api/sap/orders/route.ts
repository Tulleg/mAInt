import { NextRequest, NextResponse } from "next/server";
import { getSapConnector } from "@/lib/sap/sap-connector";
import { db } from "@/db";
import { maintenanceOrders } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, tenantId: bodyTenantId } = body;

    if (!orderId) {
      return NextResponse.json({ error: "orderId ist erforderlich." }, { status: 400 });
    }

    let tenantId = bodyTenantId;
    if (!tenantId) {
      const order = await db.query.maintenanceOrders.findFirst({
        where: eq(maintenanceOrders.id, orderId),
      });
      if (!order) {
        return NextResponse.json({ error: `Auftrag '${orderId}' nicht gefunden.` }, { status: 404 });
      }
      tenantId = order.tenantId;
    }

    const connector = await getSapConnector(tenantId);
    const result = await connector.migrateOrderToSap(orderId);

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || "Fehler bei der SAP-Auftragssynchronisation." },
      { status: 500 }
    );
  }
}
