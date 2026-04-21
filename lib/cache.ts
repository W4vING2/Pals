/**
 * IndexedDB cache for offline support and instant tab restoration.
 * Keeps legacy stores for posts/messages/conversations and adds a generic
 * query cache for stale-while-revalidate screen data.
 */

const DB_NAME = "pals-cache";
const DB_VERSION = 2;
const STORE_POSTS = "posts";
const STORE_MESSAGES = "messages";
const STORE_CONVERSATIONS = "conversations";
const STORE_QUERY_CACHE = "query_cache";

export type QueryCacheEntry<T> = {
  cache_key: string;
  user_id: string;
  key: string;
  value: T;
  updated_at: number;
  expires_at: number;
};

const inFlight = new Map<string, Promise<unknown>>();
let db: IDBDatabase | null = null;

function hasIndexedDB() {
  return typeof indexedDB !== "undefined";
}

function makeCacheKey(userId: string, key: string) {
  return `${userId}:${key}`;
}

function openDB(): Promise<IDBDatabase> {
  if (!hasIndexedDB()) {
    return Promise.reject(new Error("IndexedDB is unavailable"));
  }
  if (db) return Promise.resolve(db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = (e.target as IDBOpenDBRequest).result;
      if (!d.objectStoreNames.contains(STORE_POSTS)) {
        const postsStore = d.createObjectStore(STORE_POSTS, { keyPath: "id" });
        postsStore.createIndex("created_at", "created_at", { unique: false });
      }
      if (!d.objectStoreNames.contains(STORE_MESSAGES)) {
        const msgsStore = d.createObjectStore(STORE_MESSAGES, { keyPath: "id" });
        msgsStore.createIndex("conversation_id", "conversation_id", { unique: false });
        msgsStore.createIndex("created_at", "created_at", { unique: false });
      }
      if (!d.objectStoreNames.contains(STORE_CONVERSATIONS)) {
        d.createObjectStore(STORE_CONVERSATIONS, { keyPath: "id" });
      }
      if (!d.objectStoreNames.contains(STORE_QUERY_CACHE)) {
        const queryStore = d.createObjectStore(STORE_QUERY_CACHE, { keyPath: "cache_key" });
        queryStore.createIndex("user_id", "user_id", { unique: false });
        queryStore.createIndex("expires_at", "expires_at", { unique: false });
      }
    };
    req.onsuccess = (e) => {
      db = (e.target as IDBOpenDBRequest).result;
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB upgrade is blocked"));
  });
}

export function isCacheFresh(entry: Pick<QueryCacheEntry<unknown>, "expires_at"> | null | undefined) {
  return !!entry && entry.expires_at > Date.now();
}

export async function getCachedQuery<T>(
  userId: string,
  key: string
): Promise<QueryCacheEntry<T> | null> {
  try {
    const d = await openDB();
    return await new Promise((resolve, reject) => {
      const transaction = d.transaction(STORE_QUERY_CACHE, "readonly");
      const store = transaction.objectStore(STORE_QUERY_CACHE);
      const req = store.get(makeCacheKey(userId, key));
      req.onsuccess = () => resolve((req.result as QueryCacheEntry<T> | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function setCachedQuery<T>(
  userId: string,
  key: string,
  value: T,
  ttlMs: number
): Promise<void> {
  try {
    const d = await openDB();
    const now = Date.now();
    const entry: QueryCacheEntry<T> = {
      cache_key: makeCacheKey(userId, key),
      user_id: userId,
      key,
      value,
      updated_at: now,
      expires_at: now + ttlMs,
    };
    await new Promise<void>((resolve, reject) => {
      const transaction = d.transaction(STORE_QUERY_CACHE, "readwrite");
      const store = transaction.objectStore(STORE_QUERY_CACHE);
      store.put(entry);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    // Cache writes are best-effort.
  }
}

export async function clearUserCache(userId: string): Promise<void> {
  try {
    const d = await openDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = d.transaction(STORE_QUERY_CACHE, "readwrite");
      const store = transaction.objectStore(STORE_QUERY_CACHE);
      const index = store.index("user_id");
      const req = index.openCursor(IDBKeyRange.only(userId));
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        cursor.delete();
        cursor.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch {
    // Best-effort cleanup.
  }
}

export function dedupeRequest<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = fn().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

// ── Posts ─────────────────────────────────────────────────────

export async function cachePosts(posts: object[]): Promise<void> {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = d.transaction(STORE_POSTS, "readwrite");
    const store = transaction.objectStore(STORE_POSTS);
    posts.forEach((post) => store.put(post));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getCachedPosts(): Promise<object[]> {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = d.transaction(STORE_POSTS, "readonly");
    const store = transaction.objectStore(STORE_POSTS);
    const idx = store.index("created_at");
    const req = idx.getAll();
    req.onsuccess = () => {
      const sorted = (req.result as Array<{ created_at: string }>).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      resolve(sorted.slice(0, 20));
    };
    req.onerror = () => reject(req.error);
  });
}

// ── Messages ──────────────────────────────────────────────────

export async function cacheMessages(conversationId: string, messages: object[]): Promise<void> {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = d.transaction(STORE_MESSAGES, "readwrite");
    const store = transaction.objectStore(STORE_MESSAGES);
    messages.forEach((msg) => store.put(msg));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getCachedMessages(conversationId: string): Promise<object[]> {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = d.transaction(STORE_MESSAGES, "readonly");
    const store = transaction.objectStore(STORE_MESSAGES);
    const idx = store.index("conversation_id");
    const req = idx.getAll(IDBKeyRange.only(conversationId));
    req.onsuccess = () => {
      const sorted = (req.result as Array<{ created_at: string }>).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      resolve(sorted);
    };
    req.onerror = () => reject(req.error);
  });
}

// ── Conversations ─────────────────────────────────────────────

export async function cacheConversations(conversations: object[]): Promise<void> {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = d.transaction(STORE_CONVERSATIONS, "readwrite");
    const store = transaction.objectStore(STORE_CONVERSATIONS);
    conversations.forEach((conv) => store.put(conv));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getCachedConversations(): Promise<object[]> {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = d.transaction(STORE_CONVERSATIONS, "readonly");
    const store = transaction.objectStore(STORE_CONVERSATIONS);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Utility: safe wrapper for use in components ───────────────

export async function safeCache<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}
