"use client";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveSubmission, submitSubmission } from "@/actions/submission-actions";
import {
  MAX_SUBMISSION_FILES,
  SUBMISSION_KINDS,
  defaultTaxFor,
  needsReceipt,
  submissionKindLabel,
  submissionTotals,
  type SubmissionKind,
} from "@/lib/submissions/model";
import {
  TAX_CATEGORIES,
  taxCategoryInfo,
  type TaxCategory,
} from "@/lib/tax/categories";
import { Card, CardSection } from "@/components/ui/card";
import { AppButton } from "@/components/ui/app-button";
import { inputClass, selectClass, textareaClass } from "@/lib/ui/form-classes";

type Row = {
  key: string;
  kind: SubmissionKind;
  name: string;
  quantity: string;
  unitPrice: string;
  taxCategory: TaxCategory;
  note: string;
};
export type SubmissionFormData = {
  id: string;
  version: string;
  month: string;
  title: string;
  note: string;
  items: {
    kind: string;
    name: string;
    quantity: number;
    unitPrice: number;
    taxCategory: string;
    note: string;
  }[];
  files: { id: string; filename: string }[];
  rejectReason: string | null;
};

const yen = (n: number) => n.toLocaleString("ja-JP");
const blank = (kind: SubmissionKind = "REWARD"): Row => ({
  key: crypto.randomUUID(),
  kind,
  name: "",
  quantity: "1",
  unitPrice: "",
  taxCategory: defaultTaxFor[kind],
  note: "",
});

/** 業務委託メンバーが、報酬の請求書をつくって提出する画面。 */
export function SubmissionForm({
  initialMonth,
  data,
}: {
  initialMonth: string;
  data?: SubmissionFormData;
}) {
  const router = useRouter();
  const [id] = useState(() => data?.id ?? crypto.randomUUID());
  const [month, setMonth] = useState(data?.month ?? initialMonth);
  const [title, setTitle] = useState(data?.title ?? "");
  const [note, setNote] = useState(data?.note ?? "");
  const [rows, setRows] = useState<Row[]>(
    data?.items.length
      ? data.items.map((i) => ({
          key: crypto.randomUUID(),
          kind: i.kind as SubmissionKind,
          name: i.name,
          quantity: String(i.quantity),
          unitPrice: String(i.unitPrice),
          taxCategory: i.taxCategory as TaxCategory,
          note: i.note,
        }))
      : [blank()],
  );
  const [existing, setExisting] = useState(data?.files ?? []);
  const [removed, setRemoved] = useState<string[]>([]);
  const [fresh, setFresh] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const picker = useRef<HTMLInputElement>(null);

  const parsed = rows.map((r) => ({
    ...r,
    q: Number(r.quantity),
    p: Number(r.unitPrice),
  }));
  const totals = useMemo(
    () =>
      submissionTotals(
        parsed.map((r) => ({
          quantity: Number.isFinite(r.q) && r.q > 0 ? r.q : 0,
          unitPrice: Number.isFinite(r.p) && r.p >= 0 ? Math.round(r.p) : 0,
          taxCategory: r.taxCategory,
        })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows],
  );
  const receiptNeeded = needsReceipt(rows);
  const fileCount = existing.length + fresh.length;

  const set = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    setFresh((f) => [...f, ...Array.from(list)].slice(0, MAX_SUBMISSION_FILES));
  };

  async function save(thenSubmit: boolean) {
    setBusy(true);
    setError("");
    try {
      const f = new FormData();
      f.set(
        "payload",
        JSON.stringify({
          id,
          version: data?.version,
          month,
          title: title.trim() || `${month.replace("-", "年")}月分の請求書`,
          note,
          items: rows.map((r) => ({
            kind: r.kind,
            name: r.name,
            quantity: r.quantity,
            unitPrice: r.unitPrice,
            taxCategory: r.taxCategory,
            note: r.note,
          })),
        }),
      );
      f.set("removeFiles", JSON.stringify(removed));
      for (const file of fresh) f.append("files", file);
      const saved = await saveSubmission(f);
      if (!saved.ok) return setError(saved.error);
      if (thenSubmit) {
        const r = await submitSubmission({ id, version: saved.version });
        if (!r.ok) {
          // 下書きは保存できているので、詳細の画面で理由を伝える。
          router.push(
            `/submit/${id}?notice=${encodeURIComponent(r.error.slice(0, 200))}`,
          );
          router.refresh();
          return;
        }
      }
      router.push(`/submit/${id}`);
      router.refresh();
    } catch {
      setError(
        "通信できませんでした。入力は残っています。もう一度お試しください。",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {data?.rejectReason && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
        >
          <p className="font-semibold">
            差し戻されました。内容を直して、もう一度提出してください。
          </p>
          <p className="mt-1 whitespace-pre-wrap">理由：{data.rejectReason}</p>
        </div>
      )}
      <Card>
        <CardSection>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="font-semibold">何月分ですか？</span>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                required
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-semibold">件名</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
                placeholder={`例：${month.replace("-", "年")}月分の業務委託料`}
                className={`mt-1 ${inputClass}`}
              />
              <span className="mt-1 block text-xs text-slate-500">
                空のままなら「○年○月分の請求書」になります。
              </span>
            </label>
          </div>
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h2 className="font-semibold">請求の内容</h2>
          <p className="mt-1 text-xs text-slate-500">
            金額は<strong>税抜</strong>
            で入力します。消費税は、右の「税」の区分に合わせて自動で足されます。交通費は、初期値が「非課税」です（変えられます）。
          </p>
          <div className="mt-4 space-y-4">
            {rows.map((r, idx) => (
              <div
                key={r.key}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="grid gap-3 sm:grid-cols-6">
                  <label className="text-sm sm:col-span-2">
                    種類
                    <select
                      value={r.kind}
                      onChange={(e) => {
                        const kind = e.target.value as SubmissionKind;
                        set(r.key, { kind, taxCategory: defaultTaxFor[kind] });
                      }}
                      className={`mt-1 ${selectClass}`}
                    >
                      {SUBMISSION_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {submissionKindLabel[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm sm:col-span-4">
                    項目名
                    <input
                      value={r.name}
                      onChange={(e) => set(r.key, { name: e.target.value })}
                      maxLength={100}
                      placeholder={
                        r.kind === "REWARD"
                          ? "例：Webサイト制作（9月分）"
                          : r.kind === "TRANSPORT"
                            ? "例：客先訪問の電車代"
                            : "例：資料の印刷代"
                      }
                      className={`mt-1 ${inputClass}`}
                    />
                  </label>
                  <label className="text-sm sm:col-span-1">
                    数量
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={r.quantity}
                      onChange={(e) => set(r.key, { quantity: e.target.value })}
                      className={`mt-1 ${inputClass}`}
                    />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    単価（円・税抜）
                    <input
                      type="number"
                      inputMode="numeric"
                      step="1"
                      min="0"
                      value={r.unitPrice}
                      onChange={(e) =>
                        set(r.key, { unitPrice: e.target.value })
                      }
                      placeholder="例：150000"
                      className={`mt-1 ${inputClass}`}
                    />
                  </label>
                  <label className="text-sm sm:col-span-2">
                    税
                    <select
                      value={r.taxCategory}
                      onChange={(e) =>
                        set(r.key, {
                          taxCategory: e.target.value as TaxCategory,
                        })
                      }
                      className={`mt-1 ${selectClass}`}
                    >
                      {TAX_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {taxCategoryInfo[c].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="self-end pb-2 text-right text-sm tabular-nums sm:col-span-1">
                    ¥{yen(totals.items[idx]?.amount ?? 0)}
                  </p>
                  <label className="text-sm sm:col-span-6">
                    備考（なくてもかまいません）
                    <input
                      value={r.note}
                      onChange={(e) => set(r.key, { note: e.target.value })}
                      maxLength={200}
                      className={`mt-1 ${inputClass}`}
                    />
                  </label>
                </div>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setRows((rs) => rs.filter((x) => x.key !== r.key))
                    }
                    className="mt-2 text-xs text-rose-700"
                  >
                    この行を削除
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={() => setRows((rs) => [...rs, blank()])}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
            >
              ＋ 行を追加
            </button>
            <button
              type="button"
              onClick={() => setRows((rs) => [...rs, blank("TRANSPORT")])}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
            >
              ＋ 交通費を追加
            </button>
          </div>
          <dl className="mt-5 ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>小計（税抜）</dt>
              <dd className="tabular-nums">¥{yen(totals.subtotal)}</dd>
            </div>
            {totals.groups
              .filter((g) => g.tax > 0)
              .map((g) => (
                <div
                  key={g.taxCategory}
                  className="flex justify-between text-slate-600"
                >
                  <dt>消費税（{taxCategoryInfo[g.taxCategory].short}）</dt>
                  <dd className="tabular-nums">¥{yen(g.tax)}</dd>
                </div>
              ))}
            <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-semibold">
              <dt>合計（税込）</dt>
              <dd className="tabular-nums">¥{yen(totals.total)}</dd>
            </div>
          </dl>
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <h2 className="font-semibold">領収書・資料の添付</h2>
          <p className="mt-1 text-xs text-slate-500">
            {receiptNeeded
              ? "交通費・経費の行があるので、領収書の添付が必要です。"
              : "報酬だけの請求書なら、添付はなくてもかまいません。"}
            写真（JPEG・PNG・WebP）かPDFで、1つ3MBまで、{MAX_SUBMISSION_FILES}
            件までです。
          </p>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            className={`mt-3 rounded-xl border-2 border-dashed p-6 text-center text-sm ${dragging ? "border-sky-500 bg-sky-50" : "border-slate-300 bg-slate-50"}`}
          >
            <p className="text-slate-700">
              ここに領収書の写真・PDFをドラッグ＆ドロップ
            </p>
            <p className="my-1 text-xs text-slate-500">または</p>
            <button
              type="button"
              onClick={() => picker.current?.click()}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              フォルダから選ぶ
            </button>
            <input
              ref={picker}
              type="file"
              multiple
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
          {(existing.length > 0 || fresh.length > 0) && (
            <ul className="mt-3 space-y-1 text-sm">
              {existing.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="break-all">{f.filename}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setExisting((x) => x.filter((y) => y.id !== f.id));
                      setRemoved((r) => [...r, f.id]);
                    }}
                    className="shrink-0 text-xs text-rose-700"
                  >
                    外す
                  </button>
                </li>
              ))}
              {fresh.map((f, i) => (
                <li
                  key={f.name + i}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="break-all">{f.name}（新しく追加）</span>
                  <button
                    type="button"
                    onClick={() => setFresh((x) => x.filter((_, j) => j !== i))}
                    className="shrink-0 text-xs text-rose-700"
                  >
                    外す
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardSection>
      </Card>

      <Card>
        <CardSection>
          <label className="block text-sm">
            <span className="font-semibold">
              管理者へのメッセージ（なくてもかまいません）
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              className={`mt-1 ${textareaClass}`}
            />
          </label>
        </CardSection>
      </Card>

      {error && (
        <p
          role="alert"
          className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <AppButton
          type="button"
          disabled={busy}
          onClick={() => void save(true)}
        >
          {busy ? "処理中…" : "保存して提出する"}
        </AppButton>
        <AppButton
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => void save(false)}
        >
          下書きとして保存
        </AppButton>
        <span className="text-xs text-slate-500">
          提出したあとも、承認される前なら、取り下げて直せます。
          {fileCount ? `（添付 ${fileCount}件）` : ""}
        </span>
      </div>
    </div>
  );
}
