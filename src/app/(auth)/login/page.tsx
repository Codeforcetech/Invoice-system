import { BrandLogo, BrandMark } from "@/components/brand/brand-logo";
import { inputClass, labelClass } from "@/lib/ui/form-classes";
export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const reason = (await searchParams)?.error;
  const error = reason === "invalid" || reason === "locked";
  return (
    <div className="app-workspace grid min-h-screen bg-background lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-brand-navy p-14 lg:flex">
        <BrandLogo light />
        <div className="relative z-10">
          <p className="mb-6 text-xs tracking-[0.25em] text-brand-gold">
            CLEAR NUMBERS. CLEAR BUSINESS.
          </p>
          <h1 className="text-4xl font-semibold leading-relaxed tracking-tight text-white">
            お金の管理に、
            <br />
            気持ちのいい流れを。
          </h1>
          <p className="mt-6 max-w-md text-sm leading-8 text-slate-300">
            請求の作成から、売上・支払いの確認まで。
            <br />
            SEIQは、日々の請求と支払管理をひとつの場所にまとめます。
          </p>
        </div>
        <p className="text-xs text-slate-400">SEIQ / セイク · 請求・売上・支払管理</p>
        <div className="pointer-events-none absolute -bottom-24 -right-24 rotate-[-12deg] opacity-10">
          <BrandMark className="h-[440px] w-[440px]" />
        </div>
      </section>
      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-12 lg:hidden">
            <BrandLogo />
          </div>
          <p className="mb-3 text-xs font-semibold tracking-widest text-sky-700">
            WELCOME BACK
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            ログイン
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">
            登録済みのアカウントで、ワークスペースへ。
          </p>
          {error && (
            <p
              role="alert"
              className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              {reason === "locked"
                ? "ログインに続けて失敗したため、しばらくログインできません。15分ほど待ってから、もう一度お試しください。"
                : "メールアドレスまたはパスワードを確認してください。"}
            </p>
          )}
          <form
            className="mt-8 space-y-5"
            action="/api/auth/login"
            method="post"
          >
            <div>
              <label htmlFor="email" className={labelClass}>
                メールアドレス
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className={`mt-2 ${inputClass}`}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <div>
              <label htmlFor="password" className={labelClass}>
                パスワード
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className={`mt-2 ${inputClass}`}
                placeholder="パスワードを入力"
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              className="min-h-12 w-full rounded-xl bg-brand-gold px-4 py-3 text-sm font-semibold text-brand-navy hover:bg-brand-gold-hover"
            >
              ログイン →
            </button>
          </form>
          <p className="mt-6 text-xs leading-6 text-slate-500">
            アカウントの発行・ログインに関するお問い合わせは、管理者までご連絡ください。
          </p>
        </div>
      </main>
    </div>
  );
}
