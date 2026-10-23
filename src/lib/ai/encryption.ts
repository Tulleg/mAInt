import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const PREFIX = "enc:v1:";

/**
 * Ermittelt den 256-Bit-Schlüssel für die AES-256-GCM Verschlüsselung
 */
function getEncryptionKey(): Buffer {
  const secret =
    process.env.AI_ENCRYPTION_KEY ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SECRET_KEY ||
    "maint-ai-default-secure-key-32b-length!";
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Verschlüsselt einen sensiblen String (z. B. Gemini API Key) sicher mit AES-256-GCM
 */
export function encryptApiKey(plainText?: string): string {
  if (!plainText || plainText.trim() === "") return "";
  if (plainText.startsWith(PREFIX)) return plainText; // bereits verschlüsselt

  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText.trim(), "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${PREFIX}${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Entschlüsselt einen AES-256-GCM verschlüsselten String
 */
export function decryptApiKey(cipherText?: string): string {
  if (!cipherText || cipherText.trim() === "") return "";
  if (!cipherText.startsWith(PREFIX)) {
    // Falls unverschlüsselt (z. B. lokaler Test-Key oder Legacy-Eintrag)
    return cipherText.trim();
  }

  try {
    const parts = cipherText.slice(PREFIX.length).split(":");
    if (parts.length !== 3) {
      return "";
    }
    const [ivHex, authTagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const key = getEncryptionKey();

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted.trim();
  } catch (err) {
    console.warn("[Encryption] Fehler beim Entschlüsseln des API-Schlüssels:", err);
    return "";
  }
}

/**
 * Maskiert einen API-Key für eine sichere Anzeige in der Benutzeroberfläche
 */
export function maskApiKey(apiKey?: string): string {
  if (!apiKey || apiKey.trim() === "") return "";
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) return "••••••••";
  return `${trimmed.slice(0, 4)}••••••••${trimmed.slice(-4)}`;
}
