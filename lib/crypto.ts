/**
 * E2E Encryption module for Pals messenger.
 *
 * Scheme:
 *  - Each user has an ECDH P-256 key pair.
 *  - Private key is stored in IndexedDB (never leaves the device).
 *  - Public key is stored in the `profiles.public_key` column (JWK JSON).
 *  - For DMs: shared AES key derived via ECDH(myPrivate, theirPublic).
 *  - For groups: a random AES key is generated per conversation and
 *    encrypted with each member's ECDH-derived key (stored in conversation_participants).
 *  - Messages are encrypted with AES-256-GCM (12-byte IV prepended to ciphertext).
 *  - Encrypted content is stored as base64 string prefixed with "enc:" marker.
 */

// ── IndexedDB helpers ───────────────────────────────────────

const DB_NAME = "pals-keystore";
const DB_VERSION = 1;
const STORE_NAME = "keys";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Key generation ──────────────────────────────────────────

const ECDH_PARAMS: EcKeyGenParams = { name: "ECDH", namedCurve: "P-256" };

export async function generateKeyPair(): Promise<{ publicKeyJwk: JsonWebKey; privateKeyJwk: JsonWebKey }> {
  const kp = await crypto.subtle.generateKey(ECDH_PARAMS, true, ["deriveKey"]);
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", kp.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  return { publicKeyJwk, privateKeyJwk };
}

/**
 * Get or create the current user's ECDH key pair.
 * Private key is stored in IndexedDB, public key is returned as JWK JSON string.
 */
export async function getOrCreateKeyPair(userId: string): Promise<{ publicKeyJwk: string; isNew: boolean }> {
  const stored = await idbGet<JsonWebKey>(`ecdh-private-${userId}`);
  if (stored) {
    // Derive public key from stored private key
    const storedPub = await idbGet<JsonWebKey>(`ecdh-public-${userId}`);
    if (storedPub) {
      return { publicKeyJwk: JSON.stringify(storedPub), isNew: false };
    }
  }

  // Generate new key pair
  const { publicKeyJwk, privateKeyJwk } = await generateKeyPair();
  await idbSet(`ecdh-private-${userId}`, privateKeyJwk);
  await idbSet(`ecdh-public-${userId}`, publicKeyJwk);
  return { publicKeyJwk: JSON.stringify(publicKeyJwk), isNew: true };
}

export async function getPrivateKey(userId: string): Promise<CryptoKey | null> {
  const jwk = await idbGet<JsonWebKey>(`ecdh-private-${userId}`);
  if (!jwk) return null;
  return crypto.subtle.importKey("jwk", jwk, ECDH_PARAMS, false, ["deriveKey"]);
}

// ── ECDH shared key derivation ──────────────────────────────

async function importPublicKey(jwkString: string): Promise<CryptoKey> {
  const jwk: JsonWebKey = JSON.parse(jwkString);
  return crypto.subtle.importKey("jwk", jwk, ECDH_PARAMS, false, []);
}

/**
 * Derive a shared AES-GCM-256 key from my private key + their public key.
 * This produces the same key on both sides (ECDH).
 */
export async function deriveSharedKey(myPrivateKey: CryptoKey, theirPublicKeyJwk: string): Promise<CryptoKey> {
  const theirPublicKey = await importPublicKey(theirPublicKeyJwk);
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: theirPublicKey },
    myPrivateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// ── AES-GCM encrypt / decrypt ───────────────────────────────

const ENC_PREFIX = "enc:";

/**
 * Encrypt plaintext with AES-GCM. Returns base64 string prefixed with "enc:".
 * Format: enc:<base64(iv + ciphertext)>
 */
export async function encryptMessage(plaintext: string, aesKey: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encoded
  );

  // Prepend IV to ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  let binary = "";
  for (let i = 0; i < combined.length; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return ENC_PREFIX + btoa(binary);
}

/**
 * Decrypt an encrypted message. Returns null if decryption fails.
 */
export async function decryptMessage(encryptedStr: string, aesKey: CryptoKey): Promise<string | null> {
  if (!encryptedStr.startsWith(ENC_PREFIX)) {
    // Not encrypted — return as-is (backward compatibility)
    return encryptedStr;
  }

  try {
    const base64 = encryptedStr.slice(ENC_PREFIX.length);
    const combined = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      aesKey,
      ciphertext
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    return null; // Decryption failed — wrong key or corrupted
  }
}

/**
 * Check if a message string is encrypted.
 */
export function isEncrypted(content: string | null): boolean {
  return !!content?.startsWith(ENC_PREFIX);
}

// ── Conversation key cache ──────────────────────────────────

const keyCache = new Map<string, CryptoKey>();

/**
 * Get or derive the AES key for a DM conversation.
 * Uses ECDH(myPrivate, otherPublic) — deterministic, same on both sides.
 */
export async function getConversationKey(
  myUserId: string,
  otherPublicKeyJwk: string,
  conversationId: string
): Promise<CryptoKey | null> {
  const cacheKey = `${myUserId}:${conversationId}`;
  const cached = keyCache.get(cacheKey);
  if (cached) return cached;

  const myPrivate = await getPrivateKey(myUserId);
  if (!myPrivate) return null;

  try {
    const sharedKey = await deriveSharedKey(myPrivate, otherPublicKeyJwk);
    keyCache.set(cacheKey, sharedKey);
    return sharedKey;
  } catch {
    return null;
  }
}

/**
 * Clear the key cache (e.g., on logout).
 */
export function clearKeyCache() {
  keyCache.clear();
}
