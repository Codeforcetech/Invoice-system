import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "書類の提出",
  robots: { index: false, follow: false },
};

/** ログインなしの提出フォーム。会社のデータは一切表示しない。 */
export default function SubmitLinkLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b border-slate-200 bg-white px-4 py-4 text-center text-sm font-semibold text-slate-700">
        書類の提出フォーム
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        {children}
      </main>
    </div>
  );
}
