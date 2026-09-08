import { genId, readStore, updateStore } from "@/lib/db";
import type { SupportMessage, SupportThread } from "@/lib/types";

export interface NewMessage {
  threadId: string;
  actor: "user" | "admin" | "system";
  senderName?: string;
  text: string;
}

export function newThreadId(): string {
  return genId();
}

export async function ensureThread(threadId: string, meta?: Partial<SupportThread>): Promise<void> {
  await updateStore((doc) => {
    if (!doc.supportThreads[threadId]) {
      doc.supportThreads[threadId] = {
        id: threadId,
        lastActivity: new Date().toISOString(),
        ...meta,
      } as SupportThread;
    }
  });
}

export async function addSupportMessage(msg: NewMessage): Promise<SupportMessage> {
  return updateStore<SupportMessage>((doc) => {
    const thread = doc.supportThreads[msg.threadId] as SupportThread | undefined;
    if (!thread) {
      doc.supportThreads[msg.threadId] = {
        id: msg.threadId,
        lastActivity: new Date().toISOString(),
      } as SupportThread;
    }
    const record: SupportMessage = {
      id: genId(),
      threadId: msg.threadId,
      actor: msg.actor,
      senderName: msg.senderName,
      text: msg.text,
      createdAt: new Date().toISOString(),
    };
    if (thread) thread.lastActivity = record.createdAt;
    doc.supportMessages.push(record);
    return record;
  });
}

export async function getThreadMessages(threadId: string): Promise<SupportMessage[]> {
  const doc = await readStore();
  return (doc.supportMessages as SupportMessage[])
    .filter((m) => m.threadId === threadId)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

export async function listThreads(): Promise<SupportThread[]> {
  const doc = await readStore();
  return Object.values(doc.supportThreads as Record<string, SupportThread>).sort(
    (a, b) => (b.lastActivity < a.lastActivity ? -1 : 1),
  );
}

export async function updateThreadMeta(threadId: string, meta: Partial<SupportThread>): Promise<void> {
  await updateStore((doc) => {
    const t = doc.supportThreads[threadId] as SupportThread | undefined;
    if (t) Object.assign(t, meta);
  });
}
