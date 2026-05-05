// src/lib/encryption.ts

export const AES_PREFIX = "[AES-GCM-256]";
export const AES_PREFIX_BYTES = new TextEncoder().encode(AES_PREFIX);

/**
 * Derives an AES-GCM 256-bit key from a wallet signature using SHA-256
 */
export async function deriveMasterKey(signatureHex: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest("SHA-256", enc.encode(signatureHex));
  
  return crypto.subtle.importKey(
    "raw",
    keyMaterial,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts an ArrayBuffer (text or binary).
 * Prepends a 12-byte IV to the resulting ciphertext.
 */
export async function encryptData(data: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );
  
  const encryptedBytes = new Uint8Array(iv.length + ciphertext.byteLength);
  encryptedBytes.set(iv, 0);
  encryptedBytes.set(new Uint8Array(ciphertext), iv.length);
  return encryptedBytes;
}

/**
 * Decrypts an ArrayBuffer that has the 12-byte IV prepended.
 */
export async function decryptData(encryptedBytes: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
  if (encryptedBytes.length < 12) throw new Error("Invalid ciphertext (too short for IV)");
  
  const iv = encryptedBytes.slice(0, 12);
  const data = encryptedBytes.slice(12);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    data
  );
  
  return new Uint8Array(decrypted);
}
