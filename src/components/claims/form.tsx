"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { readClaimReceiptAi, saveClaim } from "@/actions/claim-actions";
import { RECEIPT_CATEGORIES, japanToday } from "@/lib/expenses/model";
import { Card, CardSection } from "@/components/ui/card";
import { AppButton } from "@/components/ui/app-button";
import { inputClass, selectClass, textareaClass } from "@/lib/ui/form-classes";
type Data = {
  id: string;
  title: string;
  merchant: string;
  date: string;
  amount: number;
  category: string;
  note: string;
  version: string;
  filename: string | null;
};
export function ClaimForm({
  ownerId,
  workspaceName,
  data,
}: {
  ownerId: string;
  workspaceName: string;
  data?: Data;
}) {
  const router = useRouter(),
    [id] = useState(() => data?.id ?? crypto.randomUUID()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const formRef = useRef<HTMLFormElement>(null),
    fileRef = useRef<HTMLInputElement>(null),
    [dragging, setDragging] = useState(false),
    [fileName, setFileName] = useState(""),
    [reading, setReading] = useState(false),
    [readNote, setReadNote] = useState<{
      tone: "ok" | "warn";
      text: string;
      retry: boolean;
    } | null>(null);

  const setField = (name: string, value: string) => {
    const el = formRef.current?.elements.namedItem(name);
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
    ) {
      // 入力欄に値を入れ、画面の状態にも反映させる。
      const proto =
        el instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  };
  const isEmpty = (name: string) => {
    const el = formRef.current?.elements.namedItem(name);
    return !(el as HTMLInputElement | null)?.value;
  };

  const lastFile = useRef<File | null>(null);
  /** 自動読み取りが使えなかった・足りなかったとき、手で入れてほしい最初の欄に移る。 */
  const focusFirstEmpty = () => {
    for (const name of ["merchant", "date", "amount", "title"]) {
      if (isEmpty(name)) {
        (
          formRef.current?.elements.namedItem(name) as HTMLElement | null
        )?.focus();
        return;
      }
    }
  };
  const missing = () =>
    [
      ["merchant", "支払先"],
      ["date", "日付"],
      ["amount", "金額"],
    ]
      .filter(([n]) => isEmpty(n))
      .map(([, label]) => label);

  /** 選ばれた領収書を入力欄にセットし、読み取れた内容を各項目に入れる。 */
  async function takeFile(file: File | undefined) {
    if (!file || !fileRef.current) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileRef.current.files = transfer.files;
    lastFile.current = file;
    setFileName(file.name);
    await readFrom(file);
  }

  /** 領収書を読み取る。使えない・読み取れないときも、申請は止めず、手入力へ案内する。 */
  async function readFrom(file: File) {
    setReadNote(null);
    setReading(true);
    try {
      const f = new FormData();
      f.set("ownerId", ownerId);
      f.set("receipt", file);
      const r = await readClaimReceiptAi(f);
      if (!r.ok) {
        const need = missing();
        setReadNote({
          tone: "warn",
          retry: r.retryable,
          text: `領収書は添付しました。${r.error}${
            need.length ? `（入力が必要：${need.join("・")}）` : ""
          }`,
        });
        focusFirstEmpty();
        return;
      }
      const d = r.data,
        filled: string[] = [];
      if (d.merchant) {
        setField("merchant", d.merchant);
        filled.push("支払先");
      }
      if (d.date) {
        setField("date", d.date);
        filled.push("日付");
      }
      if (d.amount) {
        setField("amount", String(d.amount));
        filled.push("金額");
      }
      if (d.category) {
        setField("category", d.category);
        filled.push("分類");
      }
      if (isEmpty("title") && (d.note || d.merchant)) {
        setField("title", (d.note || `${d.merchant}での支払い`).slice(0, 150));
        filled.push("件名");
      }
      const need = missing();
      setReadNote({
        tone: need.length ? "warn" : "ok",
        retry: false,
        text: need.length
          ? `読み取って入力しました（${filled.join("・")}）。読み取れなかった項目（${need.join("・")}）は、手で入力してください。入力した内容は、必ず確認してください。`
          : `読み取って入力しました（${filled.join("・")}）。間違いがないか、必ず確認してください。`,
      });
      if (need.length) focusFirstEmpty();
    } catch {
      setReadNote({
        tone: "warn",
        retry: true,
        text: "領収書は添付しました。自動読み取りに失敗したので、項目は手で入力するか、もう一度読み取ってください。",
      });
      focusFirstEmpty();
    } finally {
      setReading(false);
    }
  }
  return (
    <Card>
      <CardSection>
        <p className="mb-5 text-sm text-slate-500">
          精算先：{workspaceName} ／ 金額は税込・整数円で入力してください。
        </p>
        <form
          ref={formRef}
          className="space-y-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            f.set("id", id);
            f.set("ownerId", ownerId);
            // ファイルを選んでいないときは、空のファイルを送らない。
            const picked = f.get("receipt");
            if (picked instanceof File && picked.size === 0)
              f.delete("receipt");
            if (data) f.set("version", data.version);
            setBusy(true);
            setError("");
            try {
              const result = await saveClaim(f);
              if (result.ok) {
                router.push(`/claims/${result.id}`);
                router.refresh();
              } else setError(result.error);
            } catch {
              setError(
                "通信できませんでした。入力を残して再試行してください。",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              件名（必須）
              <input
                name="title"
                defaultValue={data?.title}
                required
                maxLength={150}
                placeholder="例）営業訪問の交通費"
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-sm">
              支払先（必須）
              <input
                name="merchant"
                defaultValue={data?.merchant}
                required
                maxLength={150}
                placeholder="例）〇〇交通"
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-sm">
              経費の日付（必須）
              <input
                type="date"
                name="date"
                defaultValue={data?.date ?? japanToday()}
                required
                max={japanToday()}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-sm">
              税込金額（円・必須）
              <input
                type="number"
                inputMode="numeric"
                name="amount"
                defaultValue={data?.amount}
                required
                min={1}
                max={2147483647}
                step={1}
                className={`mt-1 ${inputClass}`}
              />
            </label>
            <label className="text-sm">
              分類
              <select
                name="category"
                defaultValue={data?.category ?? "交通費"}
                className={`mt-1 ${selectClass}`}
              >
                {RECEIPT_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            目的・補足
            <textarea
              name="note"
              defaultValue={data?.note}
              maxLength={2000}
              placeholder="訪問先や利用目的など、承認者に伝えたい内容"
              className={`mt-1 ${textareaClass}`}
            />
          </label>
          <div>
            <p className="text-sm">レシート・領収書（申請時に必須）</p>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void takeFile(e.dataTransfer.files[0]);
              }}
              className={`mt-1 rounded-xl border-2 border-dashed p-6 text-center text-sm ${
                dragging
                  ? "border-sky-500 bg-sky-50"
                  : "border-slate-300 bg-slate-50"
              }`}
            >
              <p className="text-slate-700">
                ここに領収書の写真・PDFをドラッグ＆ドロップ
              </p>
              <p className="my-1 text-xs text-slate-500">または</p>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                フォルダから選ぶ
              </button>
              <input
                ref={fileRef}
                type="file"
                name="receipt"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => void takeFile(e.target.files?.[0])}
              />
              {fileName && (
                <p className="mt-3 break-all text-xs text-slate-600">
                  選択中：{fileName}
                </p>
              )}
            </div>
            {reading && (
              <p role="status" className="mt-2 text-sm text-sky-700">
                領収書を読み取っています…（数秒かかります）
              </p>
            )}
            {readNote && (
              <p
                role="status"
                className={`mt-2 rounded-lg p-3 text-sm ${
                  readNote.tone === "ok"
                    ? "bg-emerald-50 text-emerald-900"
                    : "bg-amber-50 text-amber-900"
                }`}
              >
                {readNote.text}
                {readNote.retry && lastFile.current && (
                  <button
                    type="button"
                    disabled={reading}
                    onClick={() => void readFrom(lastFile.current!)}
                    className="ml-3 rounded-lg border border-amber-400 bg-white px-3 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
                  >
                    もう一度読み取る
                  </button>
                )}
              </p>
            )}
            <p className="mt-2 text-xs text-slate-500">
              3MB以内のJPEG・PNG・WebP・PDF。画像は表示用に向きとサイズを整えて保存します。写真を選ぶと、AIが内容を読み取って入力欄に入れます（画像は読み取りのために外部のAIサービスへ送られます）。
            </p>
            {data?.filename && (
              <label className="mt-2 flex gap-2 text-sm">
                <input type="checkbox" name="removeReceipt" value="true" />
                保存済みの添付「{data.filename}」を外す
              </label>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <AppButton type="submit" disabled={busy}>
              {busy ? "保存中…" : "保存して申請内容を確認"}
            </AppButton>
            <span className="text-xs text-slate-500">
              次の画面で確認してから申請します。
            </span>
          </div>
        </form>
      </CardSection>
    </Card>
  );
}
