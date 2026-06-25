export default function LoginPage() {
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-xl border bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">ログイン</h1>
        <p className="mt-1 text-sm text-zinc-600">メールアドレスとパスワードでログインします。</p>

        <form
          className="mt-6 space-y-4"
          action="/api/auth/login"
          method="post"
        >
          <div>
            <label className="text-sm font-medium">メールアドレス</label>
            <input
              name="email"
              type="email"
              required
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="test@example.com"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="text-sm font-medium">パスワード</label>
            <input
              name="password"
              type="password"
              required
              className="mt-1 w-full rounded-md border px-3 py-2"
              placeholder="password123"
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            ログイン
          </button>
        </form>
      </div>
    </div>
  );
}

