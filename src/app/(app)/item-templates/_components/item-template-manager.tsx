"use client";

import { useMemo, useRef, useState } from "react";
import type { Resolver } from "react-hook-form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";

import {
  itemTemplateUpsertSchema,
  type ItemTemplateUpsertInput,
} from "@/lib/validators/item-template";
import {
  createItemTemplate,
  deleteItemTemplate,
  updateItemTemplate,
} from "@/actions/item-template-actions";

export type ItemTemplateRow = {
  id: string;
  name: string;
  productName: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  note: string | null;
};

function yen(n: number) {
  return new Intl.NumberFormat("ja-JP").format(n);
}

export function ItemTemplateManager(props: { initialRows: ItemTemplateRow[] }) {
  const router = useRouter();
  const formPanel = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState(props.initialRows);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const defaultEmpty = useMemo(
    (): ItemTemplateUpsertInput => ({
      name: "",
      productName: "",
      unit: "",
      quantity: 1,
      unitPrice: 0,
      note: "",
    }),
    [],
  );

  const form = useForm<ItemTemplateUpsertInput>({
    resolver: zodResolver(
      itemTemplateUpsertSchema,
    ) as Resolver<ItemTemplateUpsertInput>,
    defaultValues: defaultEmpty,
    mode: "onChange",
  });

  function startCreate() {
    setEditingId(null);
    setMessage(null);
    setError(null);
    form.reset(defaultEmpty);
  }

  function startEdit(row: ItemTemplateRow) {
    setEditingId(row.id);
    formPanel.current?.scrollIntoView({ block: "start" });
    formPanel.current?.querySelector("input")?.focus({ preventScroll: true });
    setMessage(null);
    setError(null);
    form.reset({
      name: row.name,
      productName: row.productName,
      unit: row.unit ?? "",
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      note: row.note ?? "",
    });
  }

  async function onSubmit(values: ItemTemplateUpsertInput) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (editingId) {
        await updateItemTemplate({ id: editingId, data: values });
        setMessage("更新しました。");
        setRows((prev) =>
          prev.map((r) =>
            r.id === editingId
              ? {
                  ...r,
                  name: values.name,
                  productName: values.productName,
                  unit: values.unit?.trim() || null,
                  quantity: values.quantity,
                  unitPrice: values.unitPrice,
                  note: values.note?.trim() || null,
                }
              : r,
          ),
        );
      } else {
        const { id } = await createItemTemplate(values);
        setMessage("登録しました。");
        setRows((prev) => [
          {
            id,
            name: values.name,
            productName: values.productName,
            unit: values.unit?.trim() || null,
            quantity: values.quantity,
            unitPrice: values.unitPrice,
            note: values.note?.trim() || null,
          },
          ...prev,
        ]);
        form.reset(defaultEmpty);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("このテンプレートを削除しますか？")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteItemTemplate({ id });
      setRows((prev) => prev.filter((r) => r.id !== id));
      if (editingId === id) startCreate();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "削除に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-6 xl:grid-cols-2">
      <div
        ref={formPanel}
        className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
      >
        <h2 className="text-sm font-semibold text-slate-900">
          {editingId ? "テンプレートを編集" : "テンプレートを新規登録"}
        </h2>
        <form className="mt-4 space-y-3" onSubmit={form.handleSubmit(onSubmit)}>
          <div>
            <label
              htmlFor="field-name"
              className="text-xs font-medium text-slate-600"
            >
              テンプレート名（一覧用）
            </label>
            <input
              id="field-name"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              {...form.register("name")}
            />
            {form.formState.errors.name && (
              <p className="mt-1 text-xs text-red-600">
                {form.formState.errors.name.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="field-productName"
              className="text-xs font-medium text-slate-600"
            >
              商品名
            </label>
            <input
              id="field-productName"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              {...form.register("productName")}
            />
            {form.formState.errors.productName && (
              <p className="mt-1 text-xs text-red-600">
                {form.formState.errors.productName.message}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="field-unit"
                className="text-xs font-medium text-slate-600"
              >
                単位
              </label>
              <input
                id="field-unit"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                {...form.register("unit")}
              />
            </div>
            <div>
              <label
                htmlFor="field-quantity"
                className="text-xs font-medium text-slate-600"
              >
                数量
              </label>
              <input
                id="field-quantity"
                type="number"
                step="0.01"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums"
                {...form.register("quantity", { valueAsNumber: true })}
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="field-unitPrice"
              className="text-xs font-medium text-slate-600"
            >
              単価（円）
            </label>
            <input
              id="field-unitPrice"
              type="number"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm tabular-nums"
              {...form.register("unitPrice", { valueAsNumber: true })}
            />
          </div>
          <div>
            <label
              htmlFor="field-note"
              className="text-xs font-medium text-slate-600"
            >
              備考
            </label>
            <input
              id="field-note"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              {...form.register("note")}
            />
          </div>
          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {error}
            </div>
          ) : null}
          {message ? (
            <div
              role="status"
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
            >
              {message}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-medium text-brand-navy hover:bg-brand-gold-hover disabled:opacity-50"
            >
              {busy ? "保存中…" : editingId ? "更新する" : "登録する"}
            </button>
            {editingId ? (
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm"
                onClick={startCreate}
              >
                新規に切り替え
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-slate-900">
          登録済み（{rows.length}件）
        </h2>
        <ul className="mt-4 space-y-3">
          {rows.length === 0 ? (
            <li className="rounded-xl border border-dashed border-slate-200 p-6 text-sm leading-6 text-slate-500">
              登録済みのテンプレートはありません。登録フォームから追加してください。
            </li>
          ) : (
            rows.map((r) => (
              <li
                key={r.id}
                className={`rounded-xl border p-4 ${editingId === r.id ? "border-sky-400 bg-sky-50" : "border-slate-200"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-slate-900">
                      {r.name}
                    </p>
                    <p className="mt-1 break-words text-xs text-slate-500">
                      {r.productName}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">
                    ¥{yen(r.unitPrice)}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                  <span className="text-xs text-slate-500">
                    数量 {r.quantity} {r.unit}
                  </span>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      disabled={busy}
                      className="min-h-8 text-xs font-medium text-sky-700 disabled:opacity-50"
                      onClick={() => startEdit(r)}
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      className="min-h-8 text-xs text-red-700 disabled:opacity-50"
                      onClick={() => void onDelete(r.id)}
                    >
                      削除
                    </button>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
