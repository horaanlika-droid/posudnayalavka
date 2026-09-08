import { NextResponse } from "next/server";
import { addSupportMessage } from "@/lib/support";
import { notifySupportUserMessage } from "@/lib/notify";

// POST /api/support/send {threadId, text}
// User sends a message from the web chat -> stored + relayed to admin Telegram.
export async function POST(req: Request) {
  const body = (await req.json()) as { threadId?: string; text?: string };
  if (!body.threadId || !body.text?.trim()) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const message = await addSupportMessage({
    threadId: body.threadId,
    actor: "user",
    text: body.text.trim().slice(0, 2000),
  });

  try {
    await notifySupportUserMessage(body.threadId, body.text.trim());
  } catch {}

  return NextResponse.json({ message });
}
