import crypto from "node:crypto";
import type { PoolClient } from "pg";

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function passwordError(password: string): string | null {
  if (password.length < 4) return "Password must be at least 4 characters";
  if (Buffer.byteLength(password, "utf8") > 72) {
    return "Password must be at most 72 bytes (some characters use more than one byte)";
  }
  return null;
}

export function validEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email);
}

// Call while holding the user's row lock, in the credential-change transaction.
export async function revokeUserCredentials(client: PoolClient, userId: number) {
  await client.query("DELETE FROM user_sessions WHERE user_id = $1", [userId]);
  await client.query("DELETE FROM password_reset_tokens WHERE user_id = $1", [userId]);
  await client.query("DELETE FROM email_change_tokens WHERE user_id = $1", [userId]);
}

// Bound the stream before formData buffers/parses it; Content-Length can lie.
export async function readFormData(request: Request): Promise<FormData> {
  const maxBytes = 16 * 1024;
  const reader = request.body?.getReader();
  if (!reader) return new FormData();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Response("Form is too large", { status: 413, statusText: "Form is too large" });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new Request(request.url, {
    method: "POST",
    headers: { "Content-Type": request.headers.get("Content-Type") ?? "" },
    body: Buffer.concat(chunks),
  }).formData();
}
