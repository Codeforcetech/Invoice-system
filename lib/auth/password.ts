import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(params: {
  password: string;
  passwordHash: string;
}): Promise<boolean> {
  return bcrypt.compare(params.password, params.passwordHash);
}


let dummyHash: Promise<string> | undefined;
/**
 * A real bcrypt hash of a random value nobody knows, made once per process. Comparing against it makes
 * a sign-in with an unknown address cost the same as one with a wrong password.
 */
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(24).toString("hex"));
  return dummyHash;
}
