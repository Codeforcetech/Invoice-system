"use client";

import { printWithBlankTitle } from "@/components/invoices/suppress-browser-print-headers";

export function PrintButton() {
  return (
    <button
      type="button"
      className="rounded-md border px-3 py-2 text-sm hover:bg-zinc-50 print:hidden"
      onClick={() => printWithBlankTitle(window)}
      title="「ヘッダーとフッター」のチェックを外すと日時・URLも非表示になります"
    >
      印刷 / PDF保存
    </button>
  );
}

