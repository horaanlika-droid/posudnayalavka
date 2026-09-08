import { NextResponse } from "next/server";
import { getThreadMessages } from "@/lib/support";

// GET /api/support/messages?threadId=...
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const threadId = searchParams.get("threadId");
  if (!threadId) return NextResponse.json({ error: "threadId required" }, { status: 400 });
  const messages = await getThreadMessages(threadId);
  return NextResponse.json({ messages });
}
