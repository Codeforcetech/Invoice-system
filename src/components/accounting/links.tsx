"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  importAccountingSource,
  matchReceipt,
  cancelReceiptMatch,
  combineInvoices,
  createRecurringInvoice,
  setRecurringActive,
  generateRecurringInvoice,
} from "@/actions/accounting-link-actions";
import { yen } from "@/lib/accounting/model";
import { japanToday } from "@/lib/expenses/model";
import { Card, CardSection } from "@/components/ui/card";
import { AppButton, AppButtonLink } from "@/components/ui/app-button";
import { inputClass, selectClass } from "@/lib/ui/form-classes";
type Invoice = {
  id: string;
  number: string;
  companyId: string;
  company: string;
  subject: string;
  status: string;
  issueDate: string;
  dueDate: string;
  amount: number;
  total: number;
  receivedDate: string | null;
  version: string;
  taxRate: number;
  withholding: boolean;
};
type Expense = {
  id: string;
  supplier: string;
  description: string;
  amount: number;
  costMonth: string;
  dueDate: string;
  paidDate: string | null;
  category: string;
  version: string;
};
type Props = {
  canEdit?: boolean;
  startDate: string;
  invoices: Invoice[];
  expenses: Expense[];
  linkedKeys: string[];
  matches: {
    id: string;
    date: string;
    payer: string;
    amount: number;
    cancelled: boolean;
  }[];
  rules: {
    id: string;
    name: string;
    nextMonth: string;
    issueDay: number;
    dueDays: number;
    active: boolean;
  }[];
};
export function AccountingLinks(p: Props) {
  const router = useRouter();
  const [tab, setTab] = useState("receipts");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [matchId, setMatchId] = useState(() => crypto.randomUUID());
  const [combineId, setCombineId] = useState(() => crypto.randomUUID());
  const [recurringId, setRecurringId] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState("");
  const [sourceId, setSourceId] = useState(p.invoices[0]?.id ?? "");
  const candidates = p.invoices.filter((i) =>
    tab === "combine"
      ? i.status === "DRAFT"
      : i.status === "ISSUED" && !i.receivedDate && i.issueDate >= p.startDate,
  );
  const chosen = candidates.filter((i) => selected.includes(i.id));
  const total = chosen.reduce((s, i) => s + i.amount, 0);
  const linked = new Set(p.linkedKeys);
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      setMessage(success);
      router.refresh();
      return true;
    } catch (e) {
      setMessage(
        e instanceof Error && !e.message.includes("\n")
          ? e.message
          : "保存できませんでした。画面を再読み込みして確認してください。",
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  const selection = chosen.map((i) => ({ id: i.id, version: i.version }));
  const picker = (
    <div className="max-h-96 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-3">
      {candidates.map((i) => (
        <label
          key={i.id}
          className="flex items-start gap-3 rounded-lg p-2 hover:bg-slate-50"
        >
          <input
            type="checkbox"
            disabled={busy}
            checked={selected.includes(i.id)}
            onChange={(e) =>
              setSelected(
                e.target.checked
                  ? [...selected, i.id]
                  : selected.filter((x) => x !== i.id),
              )
            }
            className="mt-1"
          />
          <span className="min-w-0 flex-1 text-sm">
            <strong>{i.company}</strong>
            <span className="block text-xs text-slate-500">
              {i.number} ／ {i.subject} ／ 期限 {i.dueDate}
            </span>
          </span>
          <strong className="text-sm tabular-nums">¥{yen(i.amount)}</strong>
        </label>
      ))}
      {!candidates.length && (
        <p className="p-4 text-sm text-slate-500">対象の請求書がありません。</p>
      )}
    </div>
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {[
          ["receipts", "入金消込"],
          ["payables", "支払予定"],
          ["import", "既存データ連携"],
          ["recurring", "定期請求"],
          ["combine", "合算請求"],
        ].map(([k, label]) => (
          <AppButton
            key={k}
            variant={tab === k ? "primary" : "secondary"}
            disabled={busy}
            onClick={() => {
              setTab(k);
              setSelected([]);
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
      {tab === "receipts" && (
        <>
          <Card>
            <CardSection>
              <h2 className="text-lg font-semibold">入金明細と請求書を照合</h2>
              <p className="mt-2 text-sm text-slate-600">
                銀行明細を見ながら入金日・振込名義・金額を入力し、同じ取引先の請求書を選びます。振込請求額の合計が一致したら全額消込できます。
              </p>
              <form
                className="mt-5 space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  if (
                    await run(
                      () =>
                        matchReceipt({
                          id: matchId,
                          date: f.get("date"),
                          payer: f.get("payer"),
                          amount,
                          invoices: selection,
                        }),
                      "入金を消し込み、入金仕訳を登録しました。",
                    )
                  ) {
                    setSelected([]);
                    setAmount("");
                    setMatchId(crypto.randomUUID());
                  }
                }}
              >
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="text-sm">
                    入金日
                    <input
                      required
                      name="date"
                      type="date"
                      min={p.startDate}
                      max={japanToday()}
                      defaultValue={japanToday()}
                      className={`mt-1 ${inputClass}`}
                    />
                  </label>
                  <label className="text-sm">
                    振込名義
                    <input
                      required
                      name="payer"
                      maxLength={150}
                      placeholder="銀行明細の名義"
                      className={`mt-1 ${inputClass}`}
                    />
                  </label>
                  <label className="text-sm">
                    入金額（円）
                    <input
                      required
                      type="number"
                      min="1"
                      max="2147483647"
                      step="1"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className={`mt-1 ${inputClass}`}
                    />
                  </label>
                </div>
                {picker}
                <div className="flex flex-wrap justify-between gap-3 rounded-xl bg-slate-50 p-4 text-sm">
                  <span>
                    選択 {chosen.length}件 ／ 請求合計 ¥{yen(total)}
                  </span>
                  <strong
                    className={
                      Number(amount) === total
                        ? "text-emerald-700"
                        : "text-rose-700"
                    }
                  >
                    差額 ¥{yen(Number(amount) - total)}
                  </strong>
                </div>
                <AppButton
                  type="submit"
                  disabled={busy || !chosen.length || Number(amount) !== total}
                >
                  照合して入金を記録
                </AppButton>
                <p className="text-xs text-slate-500">
                  銀行CSVは「明細取込・自動仕訳」で取り込めます。ここで入金消込した取引は、CSV側で「既存仕訳と照合」を選んでください。一部入金・手数料差引はここで消込せず、差額を確認してください。源泉徴収分は仮払税金、振込額は普通預金として記録します。
                </p>
              </form>
            </CardSection>
          </Card>
          <Card>
            <CardSection>
              <h2 className="font-semibold">最近の消込履歴（30件まで）</h2>
              <div className="mt-4 space-y-3">
                {p.matches.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm"
                  >
                    <span>
                      {m.date} ／ {m.payer} ／ ¥{yen(m.amount)}{" "}
                      {m.cancelled ? "（取消済み）" : ""}
                    </span>
                    {!m.cancelled && (
                      <details>
                        <summary className="cursor-pointer text-sky-700">
                          消込を取り消す
                        </summary>
                        <p className="my-2 text-xs">
                          関連するすべての請求書を未入金に戻し、取消仕訳を残します。
                        </p>
                        <AppButton
                          disabled={busy}
                          variant="secondary"
                          onClick={() =>
                            void run(
                              () => cancelReceiptMatch(m.id),
                              "消込を取り消しました。",
                            )
                          }
                        >
                          取消を確定
                        </AppButton>
                      </details>
                    )}
                  </div>
                ))}
                {!p.matches.length && (
                  <p className="text-sm text-slate-500">
                    消込履歴はまだありません。
                  </p>
                )}
              </div>
            </CardSection>
          </Card>
        </>
      )}
      {tab === "payables" && (
        <Card>
          <CardSection>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">未払いの支払予定</h2>
              {p.canEdit !== false && (
                <AppButtonLink href="/expenses/new">
                  ＋ 支払いを登録
                </AppButtonLink>
              )}
            </div>
            <p className="my-4 text-sm text-slate-600">
              仕入は買掛金、それ以外は未払金で計上します。費用は対象月の1日、出金は実際の支払日で記録します。
            </p>
            <div className="space-y-3">
              {p.expenses
                .filter((e) => !e.paidDate)
                .map((e) => (
                  <Link
                    key={e.id}
                    href={`/expenses/${e.id}/edit`}
                    className="flex flex-wrap justify-between gap-3 rounded-xl border border-slate-200 p-4 text-sm hover:bg-slate-50"
                  >
                    <div>
                      <strong>{e.supplier}</strong>
                      <p className="mt-1 text-xs text-slate-500">
                        {e.description} ／{" "}
                        {e.category === "仕入" ? "買掛金" : "未払金"} ／ 期限{" "}
                        {e.dueDate}
                      </p>
                    </div>
                    <div className="text-right">
                      <strong>¥{yen(e.amount)}</strong>
                      <p className="mt-1 text-xs text-sky-700">
                        支払を記録・編集 →
                      </p>
                    </div>
                  </Link>
                ))}
              {!p.expenses.some((e) => !e.paidDate) && (
                <p className="text-sm text-slate-500">
                  未払いの支払いはありません。
                </p>
              )}
            </div>
          </CardSection>
        </Card>
      )}
      {tab === "import" && (
        <Card>
          <CardSection>
            <h2 className="text-lg font-semibold">
              既存の請求・支払いを帳簿に連携
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              会計開始日 {p.startDate}{" "}
              以降のデータが対象です。手動仕訳で計上済みの取引は重ねて取り込まないでください。会計開始後に新規保存・更新したデータは自動連携します。
            </p>
            <h3 className="mb-3 mt-6 font-semibold">発行済み請求書</h3>
            <div className="space-y-3">
              {p.invoices
                .filter((i) => i.status === "ISSUED")
                .map((i) => {
                  const eligible = i.issueDate >= p.startDate && i.total > 0;
                  return (
                    <div
                      key={i.id}
                      className="flex flex-wrap justify-between gap-3 rounded-xl border border-slate-200 p-4 text-sm"
                    >
                      <div>
                        <Link
                          href={`/invoices/${i.id}`}
                          className="font-medium text-sky-700"
                        >
                          {i.number} ／ {i.company}
                        </Link>
                        <p className="mt-1 text-xs text-slate-500">
                          {i.issueDate} ／ 税込 ¥{yen(i.total)}
                        </p>
                      </div>
                      <AppButton
                        disabled={
                          busy ||
                          !eligible ||
                          linked.has(`invoice:${i.id}:issue`)
                        }
                        variant="secondary"
                        onClick={() =>
                          void run(
                            () =>
                              importAccountingSource({
                                type: "invoice",
                                id: i.id,
                                version: i.version,
                              }),
                            "請求書を仕訳に連携しました。",
                          )
                        }
                      >
                        {!eligible
                          ? "対象外"
                          : linked.has(`invoice:${i.id}:issue`)
                            ? "連携済み"
                            : "確認して連携"}
                      </AppButton>
                    </div>
                  );
                })}
            </div>
            <h3 className="mb-3 mt-6 font-semibold">支払管理の登録データ</h3>
            <div className="space-y-3">
              {p.expenses.map((e) => {
                const eligible = e.costMonth + "-01" >= p.startDate;
                return (
                  <div
                    key={e.id}
                    className="flex flex-wrap justify-between gap-3 rounded-xl border border-slate-200 p-4 text-sm"
                  >
                    <div>
                      <Link
                        href={`/expenses/${e.id}/edit`}
                        className="font-medium text-sky-700"
                      >
                        {e.supplier} ／ {e.description}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">
                        {e.costMonth} ／ ¥{yen(e.amount)}
                      </p>
                    </div>
                    <AppButton
                      disabled={
                        busy || !eligible || linked.has(`expense:${e.id}:cost`)
                      }
                      variant="secondary"
                      onClick={() =>
                        void run(
                          () =>
                            importAccountingSource({
                              type: "expense",
                              id: e.id,
                              version: e.version,
                            }),
                          "支払いを仕訳に連携しました。",
                        )
                      }
                    >
                      {!eligible
                        ? "開始日前"
                        : linked.has(`expense:${e.id}:cost`)
                          ? "連携済み"
                          : "確認して連携"}
                    </AppButton>
                  </div>
                );
              })}
            </div>
          </CardSection>
        </Card>
      )}
      {tab === "combine" && (
        <Card>
          <CardSection>
            <h2 className="text-lg font-semibold">
              複数の下書きを1枚の請求書へ
            </h2>
            <p className="my-3 text-sm text-slate-600">
              取引先・税率・源泉徴収の設定が同じ未発行の下書きを選びます。元の下書きは合算済みとして保存し、重複して発行できないようにします。
            </p>
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                await run(async () => {
                  const r = await combineInvoices({
                    requestKey: combineId,
                    invoices: selection,
                    subject: f.get("subject"),
                    date: f.get("date"),
                    dueDate: f.get("dueDate"),
                  });
                  setCombineId(crypto.randomUUID());
                  router.push(`/invoices/${r.id}/edit`);
                }, "合算した下書きを作成しました。");
              }}
            >
              {picker}
              <label className="block text-sm">
                合算後の件名
                <input
                  required
                  name="subject"
                  maxLength={200}
                  placeholder="9月分 ご請求"
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm">
                  請求日
                  <input
                    required
                    name="date"
                    type="date"
                    defaultValue={japanToday()}
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
                <label className="text-sm">
                  支払期限
                  <input
                    required
                    name="dueDate"
                    type="date"
                    defaultValue={japanToday()}
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
              </div>
              <p className="text-xs text-slate-500">
                選択 {chosen.length}
                件。合算後は明細全体で税額・源泉徴収額を再計算するため、端数が変わる場合があります。発行前にプレビューで確認してください。
              </p>
              <AppButton type="submit" disabled={busy || chosen.length < 2}>
                合算した下書きを作成
              </AppButton>
            </form>
          </CardSection>
        </Card>
      )}
      {tab === "recurring" && (
        <>
          <Card>
            <CardSection>
              <h2 className="text-lg font-semibold">
                毎月の請求をテンプレート化
              </h2>
              <p className="my-3 text-sm text-slate-600">
                登録時点の請求内容を保存し、対象月の下書きを1回だけ生成します。自動発行・メール送信は行いません。
              </p>
              <form
                className="grid gap-4 sm:grid-cols-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const source = p.invoices.find((i) => i.id === sourceId);
                  if (!source) return;
                  if (
                    await run(
                      () =>
                        createRecurringInvoice({
                          id: recurringId,
                          sourceId,
                          version: source.version,
                          name: f.get("name"),
                          nextMonth: f.get("nextMonth"),
                          issueDay: f.get("issueDay"),
                          dueDays: f.get("dueDays"),
                        }),
                      "定期請求を登録しました。",
                    )
                  )
                    setRecurringId(crypto.randomUUID());
                }}
              >
                <label className="text-sm sm:col-span-2">
                  元の請求書
                  <select
                    required
                    value={sourceId}
                    onChange={(e) => setSourceId(e.target.value)}
                    className={`mt-1 ${selectClass}`}
                  >
                    {p.invoices.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.number} ／ {i.company} ／ {i.subject}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  定期請求の名前
                  <input
                    required
                    name="name"
                    maxLength={100}
                    placeholder="月額サポート"
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
                <label className="text-sm">
                  開始月
                  <input
                    required
                    name="nextMonth"
                    type="month"
                    defaultValue={japanToday().slice(0, 7)}
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
                <label className="text-sm">
                  毎月の請求日（日）
                  <input
                    required
                    name="issueDay"
                    type="number"
                    min="1"
                    max="31"
                    defaultValue="1"
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
                <label className="text-sm">
                  支払期限（請求日からの日数）
                  <input
                    required
                    name="dueDays"
                    type="number"
                    min="0"
                    max="365"
                    defaultValue="30"
                    className={`mt-1 ${inputClass}`}
                  />
                </label>
                <AppButton type="submit" disabled={busy || !p.invoices.length}>
                  定期請求を登録
                </AppButton>
                <p className="text-xs text-slate-500">
                  31日がない月は月末を請求日にします。予定月に「下書きを生成」を押して内容を確認・発行してください。
                </p>
              </form>
            </CardSection>
          </Card>
          <div className="space-y-3">
            {p.rules.map((r) => (
              <Card key={r.id}>
                <CardSection>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h3 className="font-semibold">
                        {r.name} {!r.active && "（停止中）"}
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        次回 {r.nextMonth} ／ 毎月{r.issueDay}日 ／ 支払期限{" "}
                        {r.dueDays}日後
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <AppButton
                        disabled={
                          busy ||
                          !r.active ||
                          r.nextMonth > japanToday().slice(0, 7)
                        }
                        onClick={() =>
                          void run(async () => {
                            const out = await generateRecurringInvoice({
                              id: r.id,
                              month: r.nextMonth,
                            });
                            router.push(`/invoices/${out.id}/edit`);
                          }, "定期請求の下書きを作成しました。")
                        }
                      >
                        下書きを生成
                      </AppButton>
                      <AppButton
                        disabled={busy}
                        variant="secondary"
                        onClick={() =>
                          void run(
                            () => setRecurringActive(r.id, !r.active),
                            r.active
                              ? "定期請求を停止しました。"
                              : "定期請求を再開しました。",
                          )
                        }
                      >
                        {r.active ? "停止" : "再開"}
                      </AppButton>
                    </div>
                  </div>
                </CardSection>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
