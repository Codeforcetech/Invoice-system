import "server-only";

import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE_NAME = "invoice_session";

type SessionPayload = {
  sub: string; // userId
  role: "USER" | "ADMIN";
};

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required");
  return new TextEncoder().encode(secret);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}

export async function buildSessionToken(params: { userId: string; role: "USER" | "ADMIN" }) {
  return new SignJWT({ role: params.role } satisfies Omit<SessionPayload, "sub">)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(params.userId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecretKey());
}

export async function createSession(params: { userId: string; role: "USER" | "ADMIN" }) {
  const token = await buildSessionToken(params);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const sub = payload.sub;
    const role = payload.role;
    if (typeof sub !== "string") return null;
    if (role !== "USER" && role !== "ADMIN") return null;
    return { sub, role };
  } catch {
    return null;
  }
}

