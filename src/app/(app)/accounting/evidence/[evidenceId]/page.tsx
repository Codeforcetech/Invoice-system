import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspacePage } from "@/lib/auth/require-workspace";
import { hasRole } from "@/lib/workspace/access";
import { dateText, yen } from "@/lib/accounting/model";
import {
  evidenceKindLabel,
  evidenceStatusLabel,
  type EvidenceKind,
} from "@/lib/evidence/model";
import { sha256Hex } from "@/lib/evidence/file";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { AppButtonLink } from "@/components/ui/app-button";
import { Card, CardSection } from "@/components/ui/card";
import {
  DataTableShell,
  dataTableCell,
  dataTableHeadCell,
  dataTableRow,
} from "@/components/ui/data-table";
import {
  EvidenceCorrectForm,
  EvidenceVoidForm,
} from "@/components/evidence/detail-forms";

const stamp = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  dateStyle: "short",
  timeStyle: "medium",
});
const actionLabel: Record<string, string> = {
  UPLOAD: "登録",
  CORRECT: "訂正",
  VOID: "無効化",
};
const fieldLabel: Record<string, string> = {
  kind: "種類",
  transactionDate: "取引年月日",
  amount: "金額",
  counterparty: "取引先",
  memo: "メモ",
};

function changes(before: unknown, after: unknown) {
  if (
    !before ||
    !after ||
    typeof before !== "object" ||
    typeof after !== "object"
  )
    return "";
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  return Object.keys(fieldLabel)
    .filter((k) => String(b[k] ?? "") !== String(a[k] ?? ""))
    .map((k) => {
      const show = (v: unknown) =>
        k === "kind"
          ? (evidenceKindLabel[String(v) as EvidenceKind] ?? String(v))
          : String(v ?? "");
      return `${fieldLabel[k]}：${show(b[k]) || "（空）"} → ${show(a[k]) || "（空）"}`;
    })
    .join(" ／ ");
}

export default async function EvidenceDetailPage({
  params,
}: {
  params: Promise<{ evidenceId: string }>;
}) {
  const ws = await requireWorkspacePage("VIEWER");
  const { evidenceId } = await params;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(evidenceId)) notFound();
  const e = await prisma.evidenceFile.findFirst({
    where: { id: evidenceId, ownerId: ws.ownerId },
  });
  if (!e) notFound();
  const history = await prisma.evidenceHistory.findMany({
    where: { evidenceId: e.id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const people = await prisma.user.findMany({
    where: {
      id: {
        in: [...new Set([e.uploadedById, ...history.map((h) => h.actorId)])],
      },
    },
    select: { id: true, name: true },
  });
  const name = (id: string) =>
    people.find((p) => p.id === id)?.name ?? "（不明）";
  // 保存時に記録したハッシュと、いま保存されているファイルのハッシュを比べる。
  const intact = sha256Hex(new Uint8Array(e.data)) === e.sha256;
  const active = e.status === "ACTIVE";
  const version = e.updatedAt.toISOString();
  const rows: [string, string][] = [
    ["状態", evidenceStatusLabel[e.status] ?? e.status],
    ["証憑の種類", evidenceKindLabel[e.kind as EvidenceKind] ?? e.kind],
    ["取引年月日", dateText(e.transactionDate)],
    ["取引先", e.counterparty],
    ["金額（税込）", `¥${yen(e.amount)}`],
    ["メモ", e.memo || "—"],
    ["ファイル名", e.filename],
    [
      "形式・サイズ",
      `${e.mimeType} ／ ${e.size.toLocaleString("ja-JP")} バイト`,
    ],
    [
      "登録者・登録日時",
      `${name(e.uploadedById)} ／ ${stamp.format(e.createdAt)}`,
    ],
    ["SHA-256", e.sha256],
  ];
  if (e.status === "VOID")
    rows.splice(1, 0, [
      "無効にした理由",
      `${e.voidReason ?? ""}（${e.voidedById ? name(e.voidedById) : ""} ／ ${e.voidedAt ? stamp.format(e.voidedAt) : ""}）`,
    ]);

  return (
    <PageShell>
      <SectionHeader
        variant="page"
        title="証憑の詳細"
        description={`${e.counterparty} ／ ${dateText(e.transactionDate)} ／ ¥${yen(e.amount)}`}
        action={
          <div className="flex flex-wrap gap-2">
            <AppButtonLink href={`/api/evidence/${e.id}`}>
              ダウンロード
            </AppButtonLink>
          </div>
        }
      />
      <Card>
        <CardSection>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[11rem_1fr]">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-slate-500">{k}</dt>
                <dd className="break-all">{v}</dd>
              </div>
            ))}
          </dl>
          <p
            className={`mt-5 rounded-xl p-3 text-sm ${intact ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"}`}
          >
            {intact
              ? "保存時に記録したハッシュ値と、現在保存されているファイルが一致しています。"
              : "保存時のハッシュ値と一致しません。ファイルが変わっていないか、管理者に確認してください。"}
          </p>
        </CardSection>
      </Card>
      {active && hasRole(ws.role, "EDITOR") && (
        <EvidenceCorrectForm
          id={e.id}
          version={version}
          meta={{
            kind: e.kind,
            transactionDate: dateText(e.transactionDate),
            amount: e.amount,
            counterparty: e.counterparty,
            memo: e.memo,
          }}
        />
      )}
      {active && hasRole(ws.role, "APPROVER") && (
        <EvidenceVoidForm id={e.id} version={version} />
      )}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">履歴</h2>
        <DataTableShell>
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70">
                <th className={dataTableHeadCell}>日時</th>
                <th className={dataTableHeadCell}>操作者</th>
                <th className={dataTableHeadCell}>操作</th>
                <th className={dataTableHeadCell}>内容</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className={dataTableRow}>
                  <td className={`${dataTableCell} whitespace-nowrap text-xs`}>
                    {stamp.format(h.createdAt)}
                  </td>
                  <td className={dataTableCell}>{name(h.actorId)}</td>
                  <td className={dataTableCell}>
                    {actionLabel[h.action] ?? h.action}
                  </td>
                  <td className={`${dataTableCell} text-xs`}>
                    {[
                      changes(h.before, h.after),
                      h.reason && `理由：${h.reason}`,
                    ]
                      .filter(Boolean)
                      .join(" ／ ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </DataTableShell>
      </section>
    </PageShell>
  );
}
