/**
 * Storage layer for pastes.
 *
 * Storage priority (highest to lowest):
 * 1. Upstash Redis - when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set
 * 2. JSON flat files - stores pastes in ./data directory (persistent, good for local dev)
 * 3. In-memory Map - ephemeral fallback (resets on server restart)
 *
 * Set STORAGE_MODE env var to force a specific mode: "redis" | "file" | "memory"
 */

import * as fs from "fs/promises";
import * as path from "path";

export interface Paste {
  id: string;
  title: string;
  content: string;
  language: string;
  createdAt: number;
  expiresAt: number | null; // unix ms, null = never
}

// ─── Storage Mode Detection ───────────────────────────────────────────────────

type StorageMode = "redis" | "file" | "memory";

function getStorageMode(): StorageMode {
  const forced = process.env.STORAGE_MODE as StorageMode | undefined;
  if (forced && ["redis", "file", "memory"].includes(forced)) {
    return forced;
  }
  if (
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return "redis";
  }
  // Default to file storage for local persistence
  return "file";
}

// ─── In-memory storage ────────────────────────────────────────────────────────
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

// ─── JSON File storage ────────────────────────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), "data", "pastes");

async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // Directory already exists
  }
}

function getPasteFilePath(id: string): string {
  // Sanitize id to prevent path traversal
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(DATA_DIR, `${safeId}.json`);
}

async function fileGet(id: string): Promise<Paste | null> {
  try {
    const filePath = getPasteFilePath(id);
    const content = await fs.readFile(filePath, "utf-8");
    const paste: Paste = JSON.parse(content);

    // Check if expired
    if (paste.expiresAt && paste.expiresAt < Date.now()) {
      // Delete expired paste
      await fs.unlink(filePath).catch(() => {});
      return null;
    }

    return paste;
  } catch {
    return null;
  }
}

async function fileSet(paste: Paste): Promise<void> {
  await ensureDataDir();
  const filePath = getPasteFilePath(paste.id);
  await fs.writeFile(filePath, JSON.stringify(paste, null, 2), "utf-8");
}

// ─── Upstash Redis ────────────────────────────────────────────────────────────

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
  const mode = getStorageMode();
  switch (mode) {
    case "redis":
      return redisGet(id);
    case "file":
      return fileGet(id);
    case "memory":
    default:
      return memGet(id);
  }
}

export async function savePaste(paste: Paste): Promise<void> {
  const mode = getStorageMode();
  switch (mode) {
    case "redis":
      return redisSet(paste);
    case "file":
      return fileSet(paste);
    case "memory":
    default:
      return memSet(paste);
  }
}

/**
 * Get all pastes (only supported for file and memory storage)
 */
export async function getAllPastes(): Promise<Paste[]> {
  const mode = getStorageMode();

  if (mode === "memory") {
    const pastes: Paste[] = [];
    const now = Date.now();
    for (const paste of memStore.values()) {
      if (!paste.expiresAt || paste.expiresAt > now) {
        pastes.push(paste);
      }
    }
    return pastes.sort((a, b) => b.createdAt - a.createdAt);
  }

  if (mode === "file") {
    try {
      await ensureDataDir();
      const files = await fs.readdir(DATA_DIR);
      const pastes: Paste[] = [];
      const now = Date.now();

      for (const file of files) {
        if (file.endsWith(".json")) {
          try {
            const content = await fs.readFile(
              path.join(DATA_DIR, file),
              "utf-8",
            );
            const paste: Paste = JSON.parse(content);
            if (!paste.expiresAt || paste.expiresAt > now) {
              pastes.push(paste);
            } else {
              // Clean up expired paste
              await fs.unlink(path.join(DATA_DIR, file)).catch(() => {});
            }
          } catch {
            // Skip invalid files
          }
        }
      }

      return pastes.sort((a, b) => b.createdAt - a.createdAt);
    } catch {
      return [];
    }
  }

  // Redis doesn't support listing all keys efficiently
  return [];
}

/**
 * Delete a paste by ID
 */
export async function deletePaste(id: string): Promise<boolean> {
  const mode = getStorageMode();

  if (mode === "memory") {
    return memStore.delete(id);
  }

  if (mode === "file") {
    try {
      const filePath = getPasteFilePath(id);
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  if (mode === "redis") {
    const { Redis } = await import("@upstash/redis");
    const redis = Redis.fromEnv();
    const result = await redis.del(`paste:${id}`);
    return result > 0;
  }

  return false;
}

/**
 * Get current storage mode (useful for debugging)
 */
export function getCurrentStorageMode(): StorageMode {
  return getStorageMode();
}
