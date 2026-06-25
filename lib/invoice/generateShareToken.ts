import { randomBytes } from "crypto";

/** 推測困難な共有トークン（URL-safe） */
export function generateShareToken(): string {
  return randomBytes(32).toString("base64url");
}
