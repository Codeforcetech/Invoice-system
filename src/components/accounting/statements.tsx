"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardSection } from "@/components/ui/card";
import { AppButton, AppButtonLink } from "@/components/ui/app-button";
import { inputClass, selectClass } from "@/lib/ui/form-classes";
import { yen } from "@/lib/accounting/model";
import { csvCells, type CsvMapping } from "@/lib/accounting/statement-csv";
import {
  createStatementFeed,
  previewStatements,
  importStatements,
  decideStatement,
  findLinkCandidates,
  updateStatementRule,
} from "@/actions/statement-actions";
type Suggestion = {
  accountId: string;
  name: string;
  reason: string;
  automatic: boolean;
} | null;
type Feed = { id: string; name: string; kind: string; accountId: string };
type Account = { id: string; code: string; name: string; kind: string };
type Row = {
  id: string;
  date: string;
  description: string;
  amount: number;
  status: string;
  entryId: string | null;
  decision: string | null;
  fileName: string;
  version: string;
  suggestion: Suggestion;
  invalidLink: boolean;
};
type Rule = {
  id: string;
  description: string;
  direction: string;
  account: string;
  active: boolean;
  automatic: boolean;
  version: string;
};
type Props = {
  feeds: Feed[];
  accounts: Account[];
  feedId: string;
  status: string;
  counts: Record<string, number>;
  rows: Row[];
  rules: Rule[];
  limited: boolean;
  page: number;
  initialTab: "rows" | "import";
};
type Preview = Extract<
  Awaited<ReturnType<typeof previewStatements>>,
  { ok: true }
>["data"];
const statusLabels: Record<string, string> = {
  PENDING: "未処理",
  POSTED: "登録済み",
  LINKED: "既存仕訳と照合済み",
  IGNORED: "対象外",
  ALL: "すべて",
};
export function StatementWorkspace(p: Props) {
  const router = useRouter(),
    feed = p.feeds.find((f) => f.id === p.feedId);
  const [tab, setTab] = useState<"rows" | "import" | "rules" | "feeds">(
    feed ? p.initialTab : "feeds",
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState("BANK");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [encoding, setEncoding] = useState("utf-8");
  const [mapping, setMapping] = useState<CsvMapping>({
    date: 0,
    description: 1,
    mode: feed?.kind === "CARD" ? "card" : "split",
    incoming: 2,
    outgoing: 3,
    amount: 2,
    reference: -1,
  });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [automatic, setAutomatic] = useState(false);
  async function run<T>(
    action: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>,
    success: (data: T) => void,
  ) {
    setBusy(true);
    setMessage("");
    try {
      const result = await action();
      if (result.ok) {
        success(result.data);
        router.refresh();
      } else setMessage(result.error);
    } catch {
      setMessage("通信できませんでした。入力を確認して再試行してください。");
    } finally {
      setBusy(false);
    }
  }
  function field(
    key: Exclude<keyof CsvMapping, "mode">,
    label: string,
    optional = false,
  ) {
    return (
      <label className="text-sm">
        {label}
        <select
          className={`mt-1 ${selectClass}`}
          value={mapping[key]}
          onChange={(e) => {
            setMapping({ ...mapping, [key]: Number(e.target.value) });
            setPreview(null);
          }}
        >
          {optional && <option value={-1}>指定しない</option>}
          {headers.map((h, i) => (
            <option key={i} value={i}>
              {i + 1}列目：{h || "（見出しなし）"}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-56 text-sm">
          取込口座
          <select
            className={`mt-1 ${selectClass}`}
            value={p.feedId}
            disabled={!p.feeds.length || busy}
            onChange={(e) =>
              router.push(`/accounting/statements?feed=${e.target.value}`)
            }
          >
            {!p.feeds.length && (
              <option value="">口座を登録してください</option>
            )}
            {p.feeds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}（{f.kind === "BANK" ? "銀行" : "カード"}）
              </option>
            ))}
          </select>
        </label>
        {[
          ["rows", "明細を確認"],
          ["import", "CSVを取り込む"],
          ["rules", "自動登録ルール"],
          ["feeds", "口座を追加"],
        ].map(([value, label]) => (
          <AppButton
            key={value}
            disabled={busy || (!feed && value !== "feeds")}
            variant={tab === value ? "selected" : "secondary"}
            onClick={() => {
              setTab(value as typeof tab);
              setMessage("");
            }}
          >
            {label}
          </AppButton>
        ))}
      </div>
      {message && (
        <p
          role="status"
          className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900"
        >
          {message}
        </p>
      )}
      {tab === "feeds" && (
        <Card>
          <CardSection>
            <h2 className="text-lg font-semibold">銀行・カードを登録</h2>
            <p className="mt-2 text-sm text-slate-600">
              ログイン情報や口座番号は不要です。口座ごとに同じ登録先を使うと、再取込の重複を防げます。残高を分けたい場合は先に勘定科目を追加してください。
            </p>
            <form
              className="mt-5 grid gap-4 sm:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                void run(
                  () =>
                    createStatementFeed({
                      name: data.get("name"),
                      kind,
                      accountId: data.get("accountId"),
                    }),
                  (id) => {
                    router.push(`/accounting/statements?feed=${id}&tab=import`);
                    setTab("import");
                    setMessage("口座を登録しました。CSVを取り込めます。");
                  },
                );
              }}
            >
              <label className="text-sm">
                口座名
                <input
                  name="name"
                  required
                  maxLength={80}
                  placeholder="例）メイン銀行・法人カード"
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <label className="text-sm">
                種類
                <select
                  className={`mt-1 ${selectClass}`}
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="BANK">銀行口座</option>
                  <option value="CARD">クレジットカード</option>
                </select>
              </label>
              <label className="text-sm">
                対応する勘定科目
                <select
                  key={kind}
                  name="accountId"
                  required
                  className={`mt-1 ${selectClass}`}
                >
                  <option value="">選択してください</option>
                  {p.accounts
                    .filter(
                      (a) =>
                        a.kind === (kind === "BANK" ? "ASSET" : "LIABILITY"),
                    )
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} {a.name}
                      </option>
                    ))}
                </select>
              </label>
              <div className="sm:col-span-3">
                <AppButton type="submit" disabled={busy}>
                  口座を登録
                </AppButton>
              </div>
            </form>
          </CardSection>
        </Card>
      )}
      {tab === "import" && feed && (
        <Card>
          <CardSection>
            <h2 className="text-lg font-semibold">
              CSVを選択 → 列を設定 → 内容を確認
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              先頭行が見出しのCSV（1MB・500明細まで）。金額は整数円です。説明行や合計行を除いてください。文字化けする場合は文字コードを変更し、ファイルを選び直してください。
            </p>
            <div className="my-4 flex flex-wrap items-end gap-4">
              <label className="text-sm">
                文字コード
                <select
                  className={`mt-1 ${selectClass}`}
                  value={encoding}
                  onChange={(e) => {
                    setEncoding(e.target.value);
                    setText("");
                    setHeaders([]);
                    setPreview(null);
                  }}
                >
                  <option value="utf-8">UTF-8</option>
                  <option value="shift_jis">Shift_JIS（銀行CSVなど）</option>
                </select>
              </label>
              <label className="text-sm">
                CSVファイル
                <input
                  key={encoding}
                  type="file"
                  accept=".csv,text/csv"
                  disabled={busy}
                  className={`mt-1 ${inputClass}`}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    setPreview(null);
                    setMessage("");
                    setText("");
                    setHeaders([]);
                    if (!file) return;
                    try {
                      if (file.size > 1_000_000)
                        throw new Error("CSVは1MB以内にしてください。");
                      const t = new TextDecoder(encoding, {
                        fatal: true,
                      }).decode(await file.arrayBuffer());
                      const cells = csvCells(t);
                      setText(t);
                      setFileName(file.name.slice(0, 150));
                      setHeaders(cells[0]);
                    } catch (err) {
                      setMessage(
                        err instanceof Error
                          ? err.message
                          : "読み込めませんでした。",
                      );
                    }
                  }}
                />
              </label>
              <a
                download
                href={
                  feed.kind === "BANK"
                    ? "/samples/bank-statements.csv"
                    : "/samples/card-statements.csv"
                }
                className="text-sm text-sky-700 underline"
              >
                サンプルCSV
              </a>
            </div>
            {headers.length > 0 && (
              <>
                <label className="block max-w-md text-sm">
                  金額の形式
                  <select
                    className={`mt-1 ${selectClass}`}
                    value={mapping.mode}
                    onChange={(e) => {
                      setMapping({
                        ...mapping,
                        mode: e.target.value as CsvMapping["mode"],
                      });
                      setPreview(null);
                    }}
                  >
                    {feed.kind === "BANK" ? (
                      <>
                        <option value="split">入金・出金が別の列</option>
                        <option value="signed">
                          1列の金額（入金＋ / 出金−）
                        </option>
                      </>
                    ) : (
                      <option value="card">利用額（支出＋ / 返金−）</option>
                    )}
                  </select>
                </label>
                <div className="my-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {field("date", "取引日")}
                  {field("description", "摘要・取引内容")}
                  {mapping.mode === "split" ? (
                    <>
                      {field("incoming", "入金額")}
                      {field("outgoing", "出金額")}
                    </>
                  ) : (
                    field("amount", "金額")
                  )}
                  {field("reference", "金融機関の明細ID（任意）", true)}
                </div>
                <p className="mb-4 text-xs text-slate-500">
                  明細IDがない場合は、日付・摘要・金額・同一明細の出現順で重複を判定します。同日同額の取引を別々のCSVで取り込むと区別できないため、同日の明細はまとめて取り込んでください。
                </p>
                <AppButton
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        previewStatements({
                          feedId: feed.id,
                          text,
                          mapping,
                          fileName,
                          allowAutomatic: false,
                        }),
                      (rows) => {
                        setPreview(rows);
                        setMessage(
                          "取込前に日付・入出金・重複を確認してください。まだ保存していません。",
                        );
                      },
                    )
                  }
                >
                  取込内容を確認
                </AppButton>
              </>
            )}
            {preview && (
              <div className="mt-6 space-y-4">
                <p className="font-semibold">
                  {preview.length}件中、新規{" "}
                  {preview.filter((r) => !r.duplicate).length}件・取込済み{" "}
                  {preview.filter((r) => r.duplicate).length}件
                </p>
                <div className="max-h-96 overflow-auto">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr>
                        {[
                          "日付",
                          "摘要",
                          "入金 / 返金",
                          "出金 / 利用",
                          "判定・提案",
                        ].map((h) => (
                          <th key={h} className="p-3">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((r) => (
                        <tr key={r.line} className="border-b border-slate-100">
                          <td className="p-3 whitespace-nowrap">{r.date}</td>
                          <td className="max-w-xs break-words p-3">
                            {r.description}
                          </td>
                          <td className="p-3 tabular-nums">
                            {r.amount > 0 ? yen(r.amount) : "—"}
                          </td>
                          <td className="p-3 tabular-nums">
                            {r.amount < 0 ? yen(-r.amount) : "—"}
                          </td>
                          <td className="p-3">
                            {r.duplicate
                              ? "取込済み（スキップ）"
                              : r.suggestion
                                ? `${r.suggestion.name} / ${r.suggestion.automatic ? "自動ルール" : "提案"}`
                                : "科目を確認"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={automatic}
                    onChange={(e) => setAutomatic(e.target.checked)}
                  />
                  有効な自動登録ルールがある明細は、取込と同時に仕訳登録する（
                  {
                    preview.filter(
                      (r) => !r.duplicate && r.suggestion?.automatic,
                    ).length
                  }
                  件）
                </label>
                <p className="text-xs text-slate-500">
                  請求書の入金・支払管理ですでに記帳した取引は、自動登録せず「既存仕訳と照合」を使って二重計上を防いでください。
                </p>
                <AppButton
                  disabled={busy || preview.every((r) => r.duplicate)}
                  onClick={() =>
                    void run(
                      () =>
                        importStatements({
                          feedId: feed.id,
                          text,
                          mapping,
                          fileName,
                          allowAutomatic: automatic,
                        }),
                      (r) => {
                        setPreview(null);
                        setText("");
                        setHeaders([]);
                        setMessage(
                          `${r.imported}件を取込、自動仕訳 ${r.posted}件、重複 ${r.duplicates}件をスキップしました。`,
                        );
                        setTab("rows");
                      },
                    )
                  }
                >
                  {busy ? "処理中…" : "確認して取り込む"}
                </AppButton>
              </div>
            )}
          </CardSection>
        </Card>
      )}
      {tab === "rows" && feed && (
        <>
          <div className="flex flex-wrap gap-2">
            {Object.entries(statusLabels).map(([s, label]) => (
              <AppButtonLink
                key={s}
                href={`/accounting/statements?feed=${feed.id}&status=${s}`}
                variant={p.status === s ? "selected" : "secondary"}
              >
                {label}{" "}
                {s === "ALL"
                  ? Object.values(p.counts).reduce((a, b) => a + b, 0)
                  : (p.counts[s] ?? 0)}
              </AppButtonLink>
            ))}
          </div>
          <p className="text-sm text-slate-600">
            請求・支払管理ですでに仕訳がある明細は「既存仕訳と照合」を選択してください。カード利用は費用／未払金、銀行からのカード代金引落は未払金／普通預金とし、費用の二重計上を避けます。
          </p>
          <div className="flex items-center gap-3 text-sm">
            <span>{p.page}ページ目</span>
            {p.page > 1 && (
              <AppButtonLink
                href={`/accounting/statements?feed=${feed.id}&status=${p.status}&page=${p.page - 1}`}
                variant="secondary"
              >
                前へ
              </AppButtonLink>
            )}
            {p.limited && (
              <AppButtonLink
                href={`/accounting/statements?feed=${feed.id}&status=${p.status}&page=${p.page + 1}`}
                variant="secondary"
              >
                次へ
              </AppButtonLink>
            )}
          </div>
          {p.limited && (
            <p role="status" className="text-sm text-amber-800">
              1ページ200件ずつ、新しい順に表示しています。
            </p>
          )}
          {!p.rows.length ? (
            <Card>
              <CardSection>
                <p className="text-sm text-slate-600">
                  この条件の明細はありません。「CSVを取り込む」から始めてください。
                </p>
              </CardSection>
            </Card>
          ) : (
            p.rows.map((r) => (
              <StatementItem
                key={`${r.id}:${r.version}`}
                row={r}
                accounts={p.accounts.filter((a) => a.id !== feed.accountId)}
                busy={busy}
                run={run}
                setMessage={setMessage}
              />
            ))
          )}
        </>
      )}
      {tab === "rules" && (
        <Card>
          <CardSection>
            <h2 className="text-lg font-semibold">承認した仕訳パターン</h2>
            <p className="mt-2 mb-5 text-sm text-slate-600">
              口座・摘要（空白や全角を整えた完全一致）・入出金が一致した明細へ適用します。承認時に学習したルールは提案のみです。「自動登録を有効にする」を選ぶと、次回の取込確認画面で自動登録を選べます。金額はCSVの金額を使います。
            </p>
            {!p.rules.length && (
              <p className="text-sm text-slate-500">
                まだルールがありません。明細の登録時に「このパターンを学習」を選択してください。
              </p>
            )}
            <div className="space-y-3">
              {p.rules.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 p-4"
                >
                  <div className="min-w-0">
                    <p className="break-words font-medium">{r.description}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {r.direction === "IN" ? "入金・返金" : "出金・利用"} →{" "}
                      {r.account} ／{" "}
                      {!r.active
                        ? "停止中"
                        : r.automatic
                          ? "自動登録有効"
                          : "提案のみ"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.active && (
                      <AppButton
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              updateStatementRule({
                                id: r.id,
                                version: r.version,
                                active: true,
                                automatic: !r.automatic,
                              }),
                            () =>
                              setMessage(
                                "ルールを更新しました。次回の取込から適用されます。",
                              ),
                          )
                        }
                      >
                        {r.automatic
                          ? "提案のみに戻す"
                          : "自動登録を有効にする"}
                      </AppButton>
                    )}
                    <AppButton
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            updateStatementRule({
                              id: r.id,
                              version: r.version,
                              active: !r.active,
                              automatic: false,
                            }),
                          () =>
                            setMessage(
                              r.active
                                ? "ルールを停止しました。"
                                : "提案ルールとして再開しました。",
                            ),
                        )
                      }
                    >
                      {r.active ? "停止" : "再開"}
                    </AppButton>
                  </div>
                </div>
              ))}
            </div>
          </CardSection>
        </Card>
      )}
    </div>
  );
}
function StatementItem({
  row: r,
  accounts,
  busy,
  run,
  setMessage,
}: {
  row: Row;
  accounts: Account[];
  busy: boolean;
  run: <T>(
    action: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>,
    success: (data: T) => void,
  ) => Promise<void>;
  setMessage: (v: string) => void;
}) {
  const [account, setAccount] = useState(r.suggestion?.accountId ?? "");
  const [mode, setMode] = useState("approve");
  const [entry, setEntry] = useState("");
  const [candidates, setCandidates] = useState<
    { id: string; memo: string; date: string }[] | null
  >(null);
  const [learn, setLearn] = useState(true);
  return (
    <Card>
      <CardSection>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500">
              {r.date} ／ {statusLabels[r.status]} ／ {r.fileName}
            </p>
            <h3 className="mt-2 break-words font-semibold">{r.description}</h3>
          </div>
          <p className="font-semibold tabular-nums">
            {r.amount > 0 ? "入金・返金" : "出金・利用"} ¥
            {yen(Math.abs(r.amount))}
          </p>
        </div>
        {r.status === "PENDING" ? (
          <div className="mt-4 space-y-3">
            <label className="block max-w-sm text-sm">
              この明細をどうしますか？
              <select
                className={`mt-1 ${selectClass}`}
                value={mode}
                onChange={(e) => {
                  const next = e.target.value;
                  setMode(next);
                  setEntry("");
                  if (next === "link" && candidates === null)
                    void findLinkCandidates({ id: r.id }).then((res) =>
                      setCandidates(res.ok ? res.candidates : []),
                    );
                }}
              >
                <option value="approve">新しく記録する</option>
                <option value="link">
                  もう記録してある分と同じ（二重にならないよう結びつける）
                </option>
                <option value="ignore">記録しない（会社のお金ではない）</option>
              </select>
            </label>
            {mode === "approve" && (
              <>
                <label className="block max-w-sm text-sm">
                  何のお金ですか？
                  <select
                    className={`mt-1 ${selectClass}`}
                    value={account}
                    onChange={(e) => setAccount(e.target.value)}
                  >
                    <option value="">選んでください</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                {r.suggestion && (
                  <p className="text-xs text-sky-700">
                    おすすめ：{r.suggestion.name}（{r.suggestion.reason}）
                  </p>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={learn}
                    onChange={(e) => setLearn(e.target.checked)}
                  />
                  次から、同じような明細は自動でおすすめする
                </label>
              </>
            )}
            {mode === "link" && (
              <fieldset className="text-sm">
                <legend className="font-medium">同じ日・同じ金額の記録</legend>
                {candidates === null ? (
                  <p className="mt-1 text-xs text-slate-500">探しています…</p>
                ) : candidates.length ? (
                  <div className="mt-2 space-y-2">
                    {candidates.map((c) => (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-2"
                      >
                        <input
                          type="radio"
                          name={`link-${r.id}`}
                          checked={entry === c.id}
                          onChange={() => setEntry(c.id)}
                        />
                        <span>
                          {c.date}　{c.memo}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">
                    同じ日・同じ金額の記録は見つかりませんでした。「新しく記録する」を選んでください。
                  </p>
                )}
              </fieldset>
            )}
            <AppButton
              disabled={
                busy ||
                (mode === "approve" && !account) ||
                (mode === "link" && !entry.trim())
              }
              onClick={() =>
                void run(
                  () =>
                    decideStatement({
                      id: r.id,
                      version: r.version,
                      action: mode,
                      counterAccountId: account,
                      learn,
                      entryId: entry.trim(),
                    }),
                  () =>
                    setMessage(
                      mode === "approve"
                        ? "記録しました。"
                        : mode === "link"
                          ? "もう記録してある分と結びつけました。"
                          : "明細を対象外にしました。",
                    ),
                )
              }
            >
              {mode === "approve"
                ? "この内容で記録する"
                : mode === "link"
                  ? "結びつける"
                  : "記録しない"}
            </AppButton>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-slate-500">
              {r.entryId && (
                <AppButtonLink
                  href={`/accounting?view=money&from=${r.date}&to=${r.date}`}
                  variant="ghost"
                >
                  当日の記録を見る
                </AppButtonLink>
              )}
              {r.decision}
            </p>
            {r.invalidLink && (
              <p role="alert" className="text-sm text-amber-800">
                照合先の仕訳が取り消されています。未処理に戻して再確認してください。
              </p>
            )}
            <details>
              <summary className="cursor-pointer text-sm text-sky-700">
                処理を取り消す
              </summary>
              <p className="my-2 text-xs text-slate-500">
                {r.status === "POSTED"
                  ? "取消仕訳を残して未処理に戻します。該当する自動登録ルールは提案のみに戻ります。"
                  : "未処理に戻します。照合した既存仕訳は変更しません。"}
              </p>
              <AppButton
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      decideStatement({
                        id: r.id,
                        version: r.version,
                        action: "undo",
                      }),
                    () => setMessage("未処理に戻しました。"),
                  )
                }
              >
                未処理に戻す
              </AppButton>
            </details>
          </div>
        )}
      </CardSection>
    </Card>
  );
}
