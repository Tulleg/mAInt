import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tenants, sapSyncQueue } from "@/db/schema";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId");

  if (!tenantId) {
    return NextResponse.json({
      status: "UP",
      service: "MaintAI SAP PM Connector Gateway",
      timestamp: new Date().toISOString(),
    });
  }

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
  });

  if (!tenant) {
    return NextResponse.json({ error: "Mandant nicht gefunden." }, { status: 404 });
  }

  const queueStats = await db.query.sapSyncQueue.findMany({
    where: eq(sapSyncQueue.tenantId, tenantId),
  });

  const pending = queueStats.filter((q) => q.status === "PENDING").length;
  const failed = queueStats.filter((q) => q.status === "FAILED").length;
  const completed = queueStats.filter((q) => q.status === "COMPLETED").length;

  return NextResponse.json({
    tenantId: tenant.id,
    tenantName: tenant.name,
    sapSyncMode: tenant.sapSyncMode,
    configured: Boolean(tenant.sapConfig),
    queue: {
      pending,
      failed,
      completed,
      total: queueStats.length,
    },
    timestamp: new Date().toISOString(),
  });
}
