"use client";

import { useMemo, useState } from "react";
import type { Resolver } from "react-hook-form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";

import { itemTemplateUpsertSchema, type ItemTemplateUpsertInput } from "@/lib/validators/item-template";
import { createItemTemplate, deleteItemTemplate, updateItemTemplate } from "@/actions/item-template-actions";

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
    resolver: zodResolver(itemTemplateUpsertSchema) as Resolver<ItemTemplateUpsertInput>,
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
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1fr]">
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">{editingId ? "テンプレートを編集" : "テンプレートを新規登録"}</h2>
        <form className="mt-4 space-y-3" onSubmit={form.handleSubmit(onSubmit)}>
          <div>
            <label className="text-xs font-medium text-zinc-600">テンプレート名（一覧用）</label>
            <input className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" {...form.register("name")} />
            {form.formState.errors.name && (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.name.message}</p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-600">商品名</label>
            <input className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" {...form.register("productName")} />
            {form.formState.errors.productName && (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.productName.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-zinc-600">単位</label>
              <input className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" {...form.register("unit")} />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-600">数量</label>
              <input
                type="number"
                step="0.01"
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm tabular-nums"
                {...form.register("quantity", { valueAsNumber: true })}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-600">単価（円）</label>
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm tabular-nums"
              {...form.register("unitPrice", { valueAsNumber: true })}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-600">備考</label>
            <input className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm" {...form.register("note")} />
          </div>
          {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div> : null}
          {message ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</div>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {busy ? "保存中…" : editingId ? "更新する" : "登録する"}
            </button>
            {editingId ? (
              <button type="button" className="rounded-lg border border-zinc-200 px-4 py-2 text-sm" onClick={startCreate}>
                新規に切り替え
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">登録済み（{rows.length}件）</h2>
        <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium text-zinc-600">
                <th className="px-3 py-2">テンプレ名</th>
                <th className="px-3 py-2">商品名</th>
                <th className="px-3 py-2 text-right">単価</th>
                <th className="px-3 py-2 w-32"></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-sm text-zinc-500">
                    まだありません。左のフォームから登録してください。
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-b border-zinc-100">
                    <td className="px-3 py-2 font-medium text-zinc-900">{r.name}</td>
                    <td className="px-3 py-2 text-zinc-700">{r.productName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{yen(r.unitPrice)}円</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" className="mr-2 text-xs font-medium text-blue-700 hover:underline" onClick={() => startEdit(r)}>
                        編集
                      </button>
                      <button
                        type="button"
                        className="text-xs font-medium text-red-700 hover:underline disabled:opacity-40"
                        disabled={busy}
                        onClick={() => void onDelete(r.id)}
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
