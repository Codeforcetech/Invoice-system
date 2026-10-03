import { afterEach, describe, expect, it, vi } from "vitest";
import { adminCreateUserSchema } from "@/lib/validators/user";
import { buildSessionToken } from "@/lib/auth/session";
import { MAX_FAILURES, throttleKey } from "@/lib/auth/throttle";
import nextConfig from "../next.config";

afterEach(() => vi.unstubAllEnvs());

describe("password rules for new accounts", () => {
  const parse = (password: string) =>
    adminCreateUserSchema.safeParse({
      name: "a",
      email: "a@example.test",
      password,
    });
  it("needs 12 characters", () => {
    expect(parse("a".repeat(11)).success).toBe(false);
    expect(parse("a".repeat(12)).success).toBe(true);
  });
  it("refuses what bcrypt would silently cut off (more than 72 bytes)", () => {
    expect(parse("a".repeat(72)).success).toBe(true);
    expect(parse("a".repeat(73)).success).toBe(false);
    expect(parse("あ".repeat(25)).success).toBe(false); // 75 bytes
    expect(parse("あ".repeat(24)).success).toBe(true); // 72 bytes
  });
});

describe("session secret", () => {
  it("must be long enough in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "too-short");
    await expect(
      buildSessionToken({ userId: "u", role: "USER" }),
    ).rejects.toThrow(/32/);
    vi.stubEnv("AUTH_SECRET", "x".repeat(32));
    await expect(
      buildSessionToken({ userId: "u", role: "USER" }),
    ).resolves.toBeTruthy();
  });
  it("is still required outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("AUTH_SECRET", "");
    await expect(
      buildSessionToken({ userId: "u", role: "USER" }),
    ).rejects.toThrow(/AUTH_SECRET/);
  });
});

describe("throttle key", () => {
  it("is the same for any case, width and surrounding spaces", () => {
    expect(throttleKey(" Sec@Example.test ")).toBe(
      throttleKey("sec@example.test"),
    );
    expect(throttleKey("ＳＥＣ@example.test")).toBe(
      throttleKey("sec@example.test"),
    );
    expect(throttleKey("a@example.test")).not.toBe(
      throttleKey("b@example.test"),
    );
    expect(MAX_FAILURES).toBe(5);
  });
});

describe("security headers", () => {
  it("stops other sites from framing the app, on every page", async () => {
    const rules = (await nextConfig.headers!()) as {
      source: string;
      headers: { key: string; value: string }[];
    }[];
    const all = rules.find((r) => r.source === "/:path*")!.headers;
    const get = (k: string) => all.find((h) => h.key === k)?.value;
    expect(get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(get("Content-Security-Policy")).toBe("frame-ancestors 'self'");
    expect(get("X-Content-Type-Options")).toBe("nosniff");
  });
  it("keeps public invoice links out of search engines and caches", async () => {
    const rules = (await nextConfig.headers!()) as {
      source: string;
      headers: { key: string; value: string }[];
    }[];
    const share = rules.find((r) => r.source === "/share/:path*")!.headers;
    expect(share.find((h) => h.key === "X-Robots-Tag")?.value).toContain(
      "noindex",
    );
    expect(share.find((h) => h.key === "Cache-Control")?.value).toContain(
      "no-store",
    );
  });
});
