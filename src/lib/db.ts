// Minimal, dependency-free file-backed store.
// Persists to ./data/*.json so a single VPS process restart keeps state.
// Uses atomic writes (write temp + rename) so concurrent web/bot processes
// don't corrupt the file. Fine for a small shop; swap for SQLite/Postgres later.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const DATA_DIR = path.join(process.cwd(), "data");

export function ensureDir(dir: string = DATA_DIR): void {
  fs.mkdirSync(dir, { recursive: true });
}

let mutex: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => T | Promise<T>): Promise<T> {
  const run = mutex.then(fn, fn);
  mutex = run.catch(() => {});
  return run;
}

async function readJSON<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.promises.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJSON(file: string, data: unknown): Promise<void> {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.promises.rename(tmp, file);
}

export interface StoreDoc {
  orders: Record<string, unknown>;
  counters: { order: number };
  supportThreads: Record<string, unknown>;
  supportMessages: unknown[];
  meta: Record<string, unknown>;
}

const DEFAULT: StoreDoc = {
  orders: {},
  counters: { order: 0 },
  supportThreads: {},
  supportMessages: [],
  meta: {},
};

export function dbFile(name: string): string {
  return path.join(DATA_DIR, name);
}

/** Read the whole store snapshot. */
export async function readStore(): Promise<StoreDoc> {
  const doc = await readJSON<StoreDoc>(dbFile("store.json"), DEFAULT);
  return {
    orders: doc.orders ?? {},
    counters: { order: doc.counters?.order ?? 0 },
    supportThreads: doc.supportThreads ?? {},
    supportMessages: doc.supportMessages ?? [],
    meta: doc.meta ?? {},
  };
}

/** Apply a mutator to the store and persist atomically. */
export async function updateStore<T>(
  fn: (doc: StoreDoc) => T | Promise<T>,
): Promise<T> {
  return withLock(async () => {
    const doc = await readStore();
    const result = await fn(doc);
    await writeJSON(dbFile("store.json"), doc);
    return result;
  });
}

export function genId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export { withLock };
export const hostnameNote = os.hostname();
