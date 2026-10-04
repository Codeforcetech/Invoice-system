"use client";
import { useState } from "react";
import { selectClass } from "@/lib/ui/form-classes";
import type { CompanyWithStores } from "@/lib/stores";

/** 支払いに「どの取引先（と店舗）の費用か」を結びつける。売上管理表で、取引先ごとに数えるために使う。 */
export function CompanyStoreSelect({
  companies,
  companyId,
  storeId,
}: {
  companies: CompanyWithStores[];
  companyId?: string | null;
  storeId?: string | null;
}) {
  const [company, setCompany] = useState(companyId ?? "");
  const [store, setStore] = useState(storeId ?? "");
  const stores = (companies.find((c) => c.id === company)?.stores ?? []).filter(
    (s) => s.active || s.id === store,
  );
  return (
    <>
      <label className="text-sm font-medium">
        売上管理表の取引先{" "}
        <span className="text-xs font-normal text-slate-500">（任意）</span>
        <select
          name="companyId"
          value={company}
          onChange={(e) => {
            setCompany(e.target.value);
            setStore("");
          }}
          className={`mt-2 ${selectClass}`}
        >
          <option value="">指定しない</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium">
        店舗（部門）{" "}
        <span className="text-xs font-normal text-slate-500">（任意）</span>
        <select
          name="storeId"
          value={store}
          onChange={(e) => setStore(e.target.value)}
          disabled={!company || stores.length === 0}
          className={`mt-2 ${selectClass}`}
        >
          <option value="">
            {!company
              ? "先に取引先を選んでください"
              : stores.length === 0
                ? "この取引先には、店舗がありません"
                : "店舗を指定しない"}
          </option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.active ? "" : "（使わない）"}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
