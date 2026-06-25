"use client";

import { useState } from "react";
import type { Resolver } from "react-hook-form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { adminCreateUserSchema, type AdminCreateUserInput } from "@/lib/validators/user";
import { adminCreateUser } from "@/actions/admin-user-actions";
import { inputClass, labelClass, selectClass } from "@/lib/ui/form-classes";

export function UserCreateForm() {
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const form = useForm<AdminCreateUserInput>({
    resolver: zodResolver(adminCreateUserSchema) as Resolver<AdminCreateUserInput>,
    defaultValues: { name: "", email: "", password: "", role: "USER" },
    mode: "onChange",
  });

  async function onSubmit(values: AdminCreateUserInput) {
    setSaving(true);
    setOk(null);
    setErr(null);
    try {
      await adminCreateUser(values);
      setOk("ユーザーを作成しました。");
      form.reset({ name: "", email: "", password: "", role: "USER" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "作成に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label className={labelClass}>氏名</label>
        <input className={`mt-1.5 ${inputClass}`} {...form.register("name")} />
        {form.formState.errors.name && (
          <p className="mt-1 text-sm text-red-600">{form.formState.errors.name.message}</p>
        )}
      </div>
      <div>
        <label className={labelClass}>メールアドレス</label>
        <input type="email" className={`mt-1.5 ${inputClass}`} {...form.register("email")} />
        {form.formState.errors.email && (
          <p className="mt-1 text-sm text-red-600">{form.formState.errors.email.message}</p>
        )}
      </div>
      <div>
        <label className={labelClass}>初期パスワード</label>
        <input type="password" className={`mt-1.5 ${inputClass}`} {...form.register("password")} />
        {form.formState.errors.password && (
          <p className="mt-1 text-sm text-red-600">{form.formState.errors.password.message}</p>
        )}
      </div>
      <div>
        <label className={labelClass}>権限</label>
        <select className={`mt-1.5 ${selectClass}`} {...form.register("role")}>
          <option value="USER">一般</option>
          <option value="ADMIN">管理者</option>
        </select>
      </div>

      {err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
      ) : null}
      {ok ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{ok}</div>
      ) : null}

      <div className="flex justify-end pt-1">
        <button
          type="submit"
          className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
          disabled={saving}
        >
          {saving ? "作成中..." : "作成する"}
        </button>
      </div>
    </form>
  );
}
