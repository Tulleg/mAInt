import { NextRequest, NextResponse } from "next/server";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { sapSyncQueue } from "@/db/schema";
import { processSapSyncQueue } from "@/lib/sap/queue-worker";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId");

  try {
    const condition = tenantId ? eq(sapSyncQueue.tenantId, tenantId) : undefined;
    const queueItems = await db.query.sapSyncQueue.findMany({
      where: condition,
      orderBy: [desc(sapSyncQueue.createdAt)],
      limit: 50,
    });

    return NextResponse.json({ items: queueItems });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Fehler beim Abrufen der SAP Sync Queue." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // Empty body
    }

    const { tenantId, queueId, limit } = body || {};

    const result = await processSapSyncQueue({
      tenantId,
      queueId,
      limit: limit ? Number(limit) : undefined,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Fehler bei der Queue-Abarbeitung." },
      { status: 500 }
    );
  }
}
