/**
 * IndexedDB cache for offline support.
 * Caches feed posts and messages so the app is usable without network.
 */

const DB_NAME = "pals-cache";
const DB_VERSION = 1;
const STORE_POSTS = "posts";
const STORE_MESSAGES = "messages";
const STORE_CONVERSATIONS = "conversations";

let db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
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
    };
    req.onsuccess = (e) => {
      db = (e.target as IDBOpenDBRequest).result;
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDB().then(
    (d) =>
      new Promise((resolve, reject) => {
        const transaction = d.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
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
      // Sort descending by created_at
      const sorted = (req.result as any[]).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      resolve(sorted.slice(0, 20)); // return last 20
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
      const sorted = (req.result as any[]).sort(
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
