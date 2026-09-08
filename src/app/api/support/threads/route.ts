import { NextResponse } from "next/server";
import { ensureThread, getThreadMessages, newThreadId, addSupportMessage } from "@/lib/support";
import { notifyAdminNewThread } from "@/lib/notify";

// POST /api/support/threads {customerName?, phone?, orderId?}
// Creates/returns a chat thread id for a web user.
export async function POST(req: Request) {
  const body = (await req.json()) as {
    customerName?: string;
    phone?: string;
    orderId?: string;
  };

  const threadId = newThreadId();
  await ensureThread(threadId, {
    customerName: body.customerName,
    phone: body.phone,
    orderId: body.orderId,
  });

  // Greeting message (system) so the chat opens with a friendly reply bubble.
  await addSupportMessage({
    threadId,
    actor: "system",
    text: "Здравствуйте! 👋 Вы пишете в поддержку «Посудной лавки». Опишите ваш вопрос — оператор ответит в ближайшее время.",
  });

  const messages = await getThreadMessages(threadId);

  // Tell the admin about the new conversation (best effort).
  try {
    await notifyAdminNewThread(threadId, body.customerName, body.orderId);
  } catch {}

  return NextResponse.json({ threadId, messages });
}
