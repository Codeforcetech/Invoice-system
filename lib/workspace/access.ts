import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

// Ordered from least to most privileged. SUBMITTER (contractor) can reach nothing but their own submissions.
export const WORKSPACE_ROLES = [
  "SUBMITTER",
  "VIEWER",
  "EDITOR",
  "APPROVER",
  "ADMIN",
] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const roleLabel: Record<WorkspaceRole, string> = {
  SUBMITTER: "申請者",
  VIEWER: "閲覧のみ",
  EDITOR: "入力可",
  APPROVER: "承認可",
  ADMIN: "管理者",
};

/** ユーザー管理で選べる、3つの権限。 */
export const ACCESS_ROLES = ["ADMIN", "APPROVER", "SUBMITTER"] as const;
export type AccessRole = (typeof ACCESS_ROLES)[number];
export const accessRoleLabel: Record<AccessRole, string> = {
  ADMIN: "管理者",
  APPROVER: "承認者",
  SUBMITTER: "申請者",
};
export const accessRoleSummary: Record<AccessRole, string> = {
  ADMIN:
    "すべての操作ができます。ユーザーの作成・権限の変更、経営レポート・売上管理表、自社情報の設定も、管理者だけです。",
  APPROVER:
    "申請された請求書・領収書・経費の確認と、承認・差し戻しができます。請求書や取引先などの会社のデータも扱えますが、経営レポート・売上は見られません。",
  SUBMITTER:
    "請求書・領収書・経費を、管理者に申請するだけです。自分の申請と、その結果（承認・差し戻し）だけを見られます。",
};

export const roleSummary: Record<WorkspaceRole, string> = {
  SUBMITTER:
    "自分の請求書と領収書を提出し、提出状況と自分の情報だけを見られます。会社の請求書・帳簿・他の人の提出は見えません。",
  VIEWER:
    "請求書・取引先・帳簿を見ることだけができます。経営レポート・売上管理表は見られません。",
  EDITOR: "請求書・仕訳・経費・明細取込を入力できます。",
  APPROVER: "入力に加えて、経費精算などの承認と、仕訳・入金の取消ができます。",
  ADMIN:
    "すべての操作に加えて、経営レポート・売上管理表、勘定科目・固定資産・自社情報・メンバー・操作ログを管理できます。",
};

export class PermissionError extends Error {
  constructor(message = "この操作を行う権限がありません。") {
    super(message);
    this.name = "PermissionError";
  }
}

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return (
    typeof value === "string" &&
    (WORKSPACE_ROLES as readonly string[]).includes(value)
  );
}

export function hasRole(role: WorkspaceRole, minimum: WorkspaceRole) {
  return WORKSPACE_ROLES.indexOf(role) >= WORKSPACE_ROLES.indexOf(minimum);
}

export type WorkspaceContext = {
  /** Owner's user id. Every ownership column in the accounting data points here. */
  ownerId: string;
  /** The acting user. */
  userId: string;
  role: WorkspaceRole;
  isOwner: boolean;
};

/**
 * Resolve which workspace a user acts in. An active membership wins; otherwise
 * the user works in their own workspace as its administrator. Deactivated members
 * never fall back to the workspace they were removed from.
 */
export async function resolveWorkspace(
  db: Db,
  userId: string,
): Promise<WorkspaceContext> {
  const member = await db.workspaceMember.findUnique({ where: { userId } });
  if (member?.active && isWorkspaceRole(member.role)) {
    return {
      ownerId: member.ownerId,
      userId,
      role: member.role,
      isOwner: false,
    };
  }
  return { ownerId: userId, userId, role: "ADMIN", isOwner: true };
}

export function assertRole(ctx: WorkspaceContext, minimum: WorkspaceRole) {
  if (!hasRole(ctx.role, minimum)) {
    throw new PermissionError(
      `この操作には「${roleLabel[minimum]}」以上の権限が必要です。現在の権限は「${roleLabel[ctx.role]}」です。`,
    );
  }
  return ctx;
}
