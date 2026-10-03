import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
const cookie = vi.hoisted(() => ({ value: "" }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (cookie.value ? { value: cookie.value } : undefined),
  }),
}));
import { getSession, buildSessionToken } from "@/lib/auth/session";
const secret = "test-only-auth-secret-with-at-least-32-characters";
beforeEach(() => {
  vi.stubEnv("AUTH_SECRET", secret);
  cookie.value = "";
});
afterEach(() => vi.unstubAllEnvs());
it("accepts a signed unexpired session", async () => {
  cookie.value = await buildSessionToken({ userId: "owner", role: "USER" });
  expect(await getSession()).toEqual({ sub: "owner", role: "USER" });
});
it("rejects missing and tampered cookies", async () => {
  expect(await getSession()).toBeNull();
  cookie.value = "forged.cookie.value";
  expect(await getSession()).toBeNull();
});
it.each(["expired", "wrong-secret", "wrong-algorithm", "invalid-role"])(
  "rejects %s session",
  async (kind) => {
    cookie.value = await new SignJWT({
      role: kind === "invalid-role" ? "SUPERADMIN" : "USER",
    })
      .setProtectedHeader({
        alg: kind === "wrong-algorithm" ? "HS512" : "HS256",
      })
      .setSubject("owner")
      .setExpirationTime(kind === "expired" ? 1 : "1h")
      .sign(
        new TextEncoder().encode(
          kind === "wrong-secret" ? "wrong-secret" : secret,
        ),
      );
    expect(await getSession()).toBeNull();
  },
);
