import { describe, expect, it } from "vitest";
import {
  PermissionError,
  assertRole,
  hasRole,
  isWorkspaceRole,
  resolveWorkspace,
  type WorkspaceContext,
} from "@/lib/workspace/access";

const ctx = (role: WorkspaceContext["role"]): WorkspaceContext => ({
  ownerId: "o",
  userId: "u",
  role,
  isOwner: false,
});

describe("workspace roles", () => {
  it("orders VIEWER < EDITOR < APPROVER < ADMIN", () => {
    expect(hasRole("VIEWER", "VIEWER")).toBe(true);
    expect(hasRole("VIEWER", "EDITOR")).toBe(false);
    expect(hasRole("EDITOR", "VIEWER")).toBe(true);
    expect(hasRole("EDITOR", "APPROVER")).toBe(false);
    expect(hasRole("APPROVER", "EDITOR")).toBe(true);
    expect(hasRole("APPROVER", "ADMIN")).toBe(false);
    expect(hasRole("ADMIN", "APPROVER")).toBe(true);
  });

  it("rejects unknown role values", () => {
    expect(isWorkspaceRole("ADMIN")).toBe(true);
    expect(isWorkspaceRole("OWNER")).toBe(false);
    expect(isWorkspaceRole("admin")).toBe(false);
    expect(isWorkspaceRole(undefined)).toBe(false);
  });

  it("throws a PermissionError that names both roles", () => {
    expect(() => assertRole(ctx("VIEWER"), "EDITOR")).toThrow(PermissionError);
    expect(() => assertRole(ctx("VIEWER"), "EDITOR")).toThrow(/入力可.*閲覧のみ/);
    expect(assertRole(ctx("ADMIN"), "ADMIN").role).toBe("ADMIN");
  });
});

describe("resolveWorkspace", () => {
  const db = (member: unknown) =>
    ({ workspaceMember: { findUnique: async () => member } }) as never;

  it("works in the user's own workspace as ADMIN without a membership", async () => {
    expect(await resolveWorkspace(db(null), "u1")).toEqual({
      ownerId: "u1",
      userId: "u1",
      role: "ADMIN",
      isOwner: true,
    });
  });

  it("uses the owner's workspace and the member's role", async () => {
    expect(
      await resolveWorkspace(db({ ownerId: "boss", role: "EDITOR", active: true }), "u1"),
    ).toEqual({ ownerId: "boss", userId: "u1", role: "EDITOR", isOwner: false });
  });

  it("does not fall back to the old workspace after suspension", async () => {
    const r = await resolveWorkspace(db({ ownerId: "boss", role: "ADMIN", active: false }), "u1");
    expect(r.ownerId).toBe("u1");
    expect(r.isOwner).toBe(true);
  });

  it("ignores a membership row with an unknown role", async () => {
    const r = await resolveWorkspace(db({ ownerId: "boss", role: "SUPER", active: true }), "u1");
    expect(r.ownerId).toBe("u1");
  });
});
