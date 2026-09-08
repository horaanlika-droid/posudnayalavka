/**
 * Чат поддержки: сообщения пользователя из Mini App и ответы администратора из бота.
 */
import crypto from 'node:crypto';
import { db, save, upsertUser, userTitle } from './store.js';
import { events } from './events.js';

export function getThread(userId, create = true) {
  const id = String(userId);
  if (!db.threads[id] && create) {
    db.threads[id] = {
      userId: Number(userId),
      messages: [],
      unreadAdmin: 0,
      unreadUser: 0,
      status: 'open',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    save();
  }
  return db.threads[id] || null;
}

function push(thread, message) {
  thread.messages.push(message);
  if (thread.messages.length > 500) thread.messages = thread.messages.slice(-500);
  thread.updatedAt = Date.now();
  save();
}

export function addUserMessage(user, text, meta = {}) {
  upsertUser(user);
  const thread = getThread(user.id);
  const message = {
    id: crypto.randomUUID(),
    from: 'user',
    text: String(text).slice(0, 4000),
    at: Date.now(),
    ...meta,
  };
  push(thread, message);
  thread.unreadAdmin += 1;
  thread.status = 'open';
  save();
  events.emit('support:user-message', { userId: Number(user.id), message, thread });
  return message;
}

export function addAdminMessage(userId, text, admin = {}) {
  const thread = getThread(userId);
  const message = {
    id: crypto.randomUUID(),
    from: 'admin',
    text: String(text).slice(0, 4000),
    at: Date.now(),
    adminName: admin.name || 'Поддержка',
  };
  push(thread, message);
  thread.unreadUser += 1;
  thread.unreadAdmin = 0;
  save();
  events.emit('support:admin-message', { userId: Number(userId), message, thread });
  return message;
}

/** Системное сообщение в чат (уведомления о заказе). */
export function addSystemMessage(userId, text) {
  const thread = getThread(userId);
  const message = { id: crypto.randomUUID(), from: 'system', text: String(text).slice(0, 2000), at: Date.now() };
  push(thread, message);
  thread.unreadUser += 1;
  save();
  return message;
}

export function markUserRead(userId) {
  const thread = getThread(userId, false);
  if (!thread) return;
  thread.unreadUser = 0;
  save();
}

export function markAdminRead(userId) {
  const thread = getThread(userId, false);
  if (!thread) return;
  thread.unreadAdmin = 0;
  save();
}

export function listThreads({ onlyUnread = false } = {}) {
  return Object.values(db.threads)
    .filter((t) => (onlyUnread ? t.unreadAdmin > 0 : true))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((t) => ({
      ...t,
      title: userTitle(t.userId),
      lastMessage: t.messages[t.messages.length - 1] || null,
    }));
}

export function supportStats() {
  const threads = Object.values(db.threads);
  return {
    threads: threads.length,
    unread: threads.filter((t) => t.unreadAdmin > 0).length,
    messages: threads.reduce((s, t) => s + t.messages.length, 0),
  };
}
