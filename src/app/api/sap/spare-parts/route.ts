import { NextRequest, NextResponse } from "next/server";
import { POST as goodsMovementPost } from "../goods-movement/route";

export async function POST(req: NextRequest) {
  return await goodsMovementPost(req);
}
