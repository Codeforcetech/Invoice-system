"use client";

/** クライアントへ渡す明細テンプレ（Prisma の Decimal は number に正規化） */
export type ItemTemplateOption = {
  id: string;
  name: string;
  productName: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  note: string | null;
};

type Props = {
  templates: ItemTemplateOption[];
  onApply: (row: {
    productName: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    amountManuallyEdited: boolean;
    note: string;
  }) => void;
  disabled?: boolean;
};

export function ItemTemplateSelector(props: Props) {
  if (props.templates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-600">
        明細テンプレートがありません。{" "}
        <a className="font-medium text-sky-600 underline hover:text-sky-700" href="/item-templates">
          テンプレート管理
        </a>
        から登録できます。
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <label className="text-sm font-medium text-slate-700">明細テンプレート</label>
      <select
        className="w-full max-w-md rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/15 sm:flex-1"
        defaultValue=""
        disabled={props.disabled}
        onChange={(e) => {
          const id = e.target.value;
          e.target.value = "";
          if (!id) return;
          const t = props.templates.find((x) => x.id === id);
          if (!t) return;
          const qty = Number(t.quantity);
          const price = t.unitPrice;
          const amount = Math.floor(qty * price);
          props.onApply({
            productName: t.productName,
            unit: t.unit ?? "",
            quantity: qty,
            unitPrice: price,
            amount,
            amountManuallyEdited: false,
            note: t.note ?? "",
          });
        }}
      >
        <option value="">テンプレートを選択して明細に追加…</option>
        {props.templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    </div>
  );
}
