import { hasRole, type WorkspaceRole } from "@/lib/workspace/access";

/**
 * 出力用の窓口（API）で、事業所のデータを返してよい役割かを確認する。
 * 提出者（業務委託）は、自分の提出以外のデータを一切取得できない。
 */
export function roleDenied(
  role: WorkspaceRole,
  minimum: WorkspaceRole = "VIEWER",
): Response | null {
  return hasRole(role, minimum)
    ? null
    : new Response("この操作を行う権限がありません。", {
        status: 403,
        headers: { "Cache-Control": "private, no-store" },
      });
}
