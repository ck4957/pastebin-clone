/**
 * Storage layer for pastes.
 *
 * Uses Upstash Redis when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 * env vars are set (production on Vercel).
 *
 * Falls back to an in-memory Map for local development.
 * Note: the in-memory store is not shared across serverless invocations,
 * so it's only suitable for local dev / demos.
 */

export interface Paste {
  id: string;
  title: string;
  content: string;
  language: string;
  createdAt: number;
  expiresAt: number | null; // unix ms, null = never
}

// ─── In-memory fallback ───────────────────────────────────────────────────────
// Attach to `global` so Next.js HMR doesn't reset the Map between hot reloads.

declare global {
  // eslint-disable-next-line no-var
  var __pasteStore: Map<string, Paste> | undefined;
}

const memStore: Map<string, Paste> = global.__pasteStore ?? new Map();
global.__pasteStore = memStore;

async function memGet(id: string): Promise<Paste | null> {
  const paste = memStore.get(id) ?? null;
  if (paste && paste.expiresAt && paste.expiresAt < Date.now()) {
    memStore.delete(id);
    return null;
  }
  return paste;
}

async function memSet(paste: Paste): Promise<void> {
  memStore.set(paste.id, paste);
}

// ─── Upstash Redis ────────────────────────────────────────────────────────────

function hasRedis() {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function redisGet(id: string): Promise<Paste | null> {
  const { Redis } = await import("@upstash/redis");
  const redis = Redis.fromEnv();
  return await redis.get<Paste>(`paste:${id}`);
}

async function redisSet(paste: Paste): Promise<void> {
  const { Redis } = await import("@upstash/redis");
  const redis = Redis.fromEnv();
  const key = `paste:${paste.id}`;
  if (paste.expiresAt) {
    const ttlSeconds = Math.ceil((paste.expiresAt - Date.now()) / 1000);
    if (ttlSeconds > 0) {
      await redis.set(key, paste, { ex: ttlSeconds });
      return;
    }
  }
  await redis.set(key, paste);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getPaste(id: string): Promise<Paste | null> {
  if (hasRedis()) return redisGet(id);
  return memGet(id);
}

export async function savePaste(paste: Paste): Promise<void> {
  if (hasRedis()) return redisSet(paste);
  return memSet(paste);
}
