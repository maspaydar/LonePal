import crypto from "crypto";

// Authenticated encryption for subscriber-owned ("bring your own key") provider
// API keys so they are never stored in plaintext (and never leak into DB logs).
//
// Key material: a dedicated AI_KEY_ENCRYPTION_SECRET when configured, otherwise
// the existing DEVICE_HMAC_SECRET. Either way we derive a distinct 32-byte AES
// key via scrypt with a fixed, purpose-specific salt (domain separation), so the
// encryption key is cryptographically independent of any other use of the same
// master secret.

const ALGORITHM = "aes-256-gcm";
const KEY_DERIVATION_SALT = "heygrand-ai-provider-key-v1";
const IV_LENGTH = 12;
const PAYLOAD_VERSION = "v1";

function getMasterSecret(): string {
  const secret = process.env.AI_KEY_ENCRYPTION_SECRET || process.env.DEVICE_HMAC_SECRET;
  if (!secret) {
    throw new Error(
      "No encryption secret configured. Set AI_KEY_ENCRYPTION_SECRET (or DEVICE_HMAC_SECRET) to enable encrypted storage of provider API keys.",
    );
  }
  return secret;
}

let _derivedKey: Buffer | null = null;
function getKey(): Buffer {
  if (!_derivedKey) {
    _derivedKey = crypto.scryptSync(getMasterSecret(), KEY_DERIVATION_SALT, 32);
  }
  return _derivedKey;
}

// Returns a self-describing string: "v1:<iv>:<authTag>:<ciphertext>" (base64 parts).
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    PAYLOAD_VERSION,
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== PAYLOAD_VERSION) {
    throw new Error("Malformed encrypted payload");
  }
  const iv = Buffer.from(parts[1], "base64");
  const authTag = Buffer.from(parts[2], "base64");
  const ciphertext = Buffer.from(parts[3], "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
