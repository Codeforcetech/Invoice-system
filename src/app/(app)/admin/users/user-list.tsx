"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  changeUserRole,
  setUserActive,
  type WorkspaceUserRow,
} from "@/actions/admin-user-actions";
import {
  ACCESS_ROLES,
  accessRoleLabel,
  roleLabel,
  type AccessRole,
} from "@/lib/workspace/access";
import {
  DataTableShell,
  dataTableCell,
  dataTableHeadCell,
  dataTableRow,
} from "@/components/ui/data-table";
import { selectClass } from "@/lib/ui/form-classes";

/** ユーザー一覧。この事業所のユーザーは、権限をその場で変更できる（自分自身と、所有者を除く）。ほかの事業所の人は、見るだけ。 */
export function UserList({ rows }: { rows: WorkspaceUserRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const run = (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    done: string,
  ) =>
    start(async () => {
      setMessage(null);
      try {
        const r = await fn();
        setMessage({
          ok: r.ok,
          text: r.ok ? done : (r.error ?? "保存できませんでした。"),
        });
        if (r.ok) router.refresh();
      } catch {
        setMessage({
          ok: false,
          text: "通信できませんでした。もう一度お試しください。",
        });
      }
    });
  return (
    <div className="space-y-3">
      {message && (
        <div
          role={message.ok ? "status" : "alert"}
          className={`rounded-lg border px-4 py-3 text-sm ${message.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}
        >
          {message.text}
        </div>
      )}
      <DataTableShell>
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col className="w-[24%]" />
            <col className="w-[30%]" />
            <col className="w-[30%]" />
            <col className="w-[16%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/90">
              <th className={dataTableHeadCell}>氏名</th>
              <th className={dataTableHeadCell}>メール</th>
              <th className={dataTableHeadCell}>権限</th>
              <th className={dataTableHeadCell}>状態</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              if (u.scope === "other")
                return (
                  <tr
                    key={u.userId}
                    className={`${dataTableRow} bg-slate-50/60`}
                  >
                    <td
                      className={`${dataTableCell} truncate text-slate-600`}
                      title={u.name}
                    >
                      {u.name}
                    </td>
                    <td
                      className={`${dataTableCell} truncate font-mono text-xs text-slate-500`}
                      title={u.email}
                    >
                      {u.email}
                    </td>
                    <td
                      className={`${dataTableCell} whitespace-nowrap text-sm text-slate-600`}
                      colSpan={2}
                      title="ほかの事業所のユーザーは、この画面では変更できません"
                    >
                      {u.otherRole}
                    </td>
                  </tr>
                );
              const fixed = u.role === "OWNER" || u.isSelf;
              const legacy =
                u.role !== "OWNER" &&
                !(ACCESS_ROLES as readonly string[]).includes(u.role);
              return (
                <tr key={u.userId} className={dataTableRow}>
                  <td
                    className={`${dataTableCell} max-w-[10rem] truncate`}
                    title={u.name}
                  >
                    {u.name}
                    {u.isSelf && (
                      <span className="ml-1 text-xs text-slate-400">
                        （自分）
                      </span>
                    )}
                  </td>
                  <td
                    className={`${dataTableCell} truncate font-mono text-xs text-slate-600`}
                    title={u.email}
                  >
                    {u.email}
                  </td>
                  <td className={dataTableCell}>
                    {fixed ? (
                      <span className="whitespace-nowrap text-sm">
                        {u.role === "OWNER"
                          ? "管理者（所有者）"
                          : roleLabel[u.role as keyof typeof roleLabel]}
                      </span>
                    ) : (
                      <select
                        aria-label={`${u.name} の権限`}
                        className={`${selectClass} w-full`}
                        value={u.role}
                        disabled={pending}
                        onChange={(e) => {
                          const next = e.target.value as AccessRole;
                          if (
                            !confirm(
                              `${u.name} の権限を「${accessRoleLabel[next]}」に変更します。よろしいですか？`,
                            )
                          ) {
                            e.target.value = u.role;
                            return;
                          }
                          run(
                            () =>
                              changeUserRole({
                                userId: u.userId,
                                accessRole: next,
                              }),
                            `${u.name} の権限を「${accessRoleLabel[next]}」にしました。`,
                          );
                        }}
                      >
                        {legacy && (
                          <option value={u.role}>
                            {roleLabel[u.role as keyof typeof roleLabel]}
                            （従来）
                          </option>
                        )}
                        {ACCESS_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {accessRoleLabel[r]}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className={dataTableCell}>
                    {u.role === "OWNER" || u.isSelf ? (
                      <span className="whitespace-nowrap text-sm text-slate-500">
                        利用中
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={pending}
                        className={`whitespace-nowrap text-sm ${u.active ? "text-slate-600 hover:underline" : "font-medium text-sky-700 hover:underline"}`}
                        onClick={() => {
                          if (
                            u.active &&
                            !confirm(
                              `${u.name} を停止します。ログインしても、この事業所のデータは見られなくなります。よろしいですか？`,
                            )
                          )
                            return;
                          run(
                            () =>
                              setUserActive({
                                userId: u.userId,
                                active: !u.active,
                              }),
                            `${u.name} を${u.active ? "停止" : "再開"}しました。`,
                          );
                        }}
                      >
                        {u.active ? "停止" : "再開"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  className="px-4 py-12 text-center text-sm text-slate-500"
                  colSpan={4}
                >
                  ユーザーがいません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </DataTableShell>
    </div>
  );
}
