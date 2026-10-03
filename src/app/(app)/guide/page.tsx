import Link from "next/link";
import type { ReactNode } from "react";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { AppIcon, type IconName } from "@/components/ui/app-icon";
import {
  WORKSPACE_ROLES,
  roleLabel,
  roleSummary,
} from "@/lib/workspace/access";
import { GuideBehavior, GuideToggleAll } from "./guide-behavior";
import {
  chapters,
  checklist,
  finder,
  glossary,
  menuGuide,
  overview,
  questions,
} from "./content";

const pillStyle =
  "items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600";
const pill = `inline-flex ${pillStyle}`;

/** 大項目（押すと中身が開く）。ページ内リンクの移動先にもなる。 */
function Section({
  id,
  title,
  lead,
  icon,
  badge,
  children,
}: {
  id: string;
  title: string;
  lead: string;
  icon: IconName;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <details
      id={id}
      data-guide
      className="group scroll-mt-6 rounded-2xl border border-slate-200 bg-white open:shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-center gap-4 rounded-2xl p-5 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-blue sm:p-6 [&::-webkit-details-marker]:hidden">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
          <AppIcon name={icon} />
        </span>
        <span className="min-w-0 flex-1">
          <h2 className="text-base font-semibold sm:text-lg">{title}</h2>
          <span className="mt-1 block text-xs leading-5 text-slate-500 sm:text-sm">
            {lead}
          </span>
        </span>
        {badge ? (
          <span className={`hidden sm:inline-flex ${pillStyle}`}>{badge}</span>
        ) : null}
        <span
          className="shrink-0 text-slate-400 transition-transform group-open:rotate-90"
          aria-hidden="true"
        >
          <AppIcon name="arrow" />
        </span>
      </summary>
      <div className="border-t border-slate-100 p-5 sm:p-6">{children}</div>
    </details>
  );
}

const contents: [string, string][] = [
  ["overview", "このシステムでできること"],
  ["first-steps", "最初の設定"],
  ["menu", "メニューの見方"],
  ["finder", "やりたいこと別"],
  ["chapters", "機能ごとの使い方"],
  ["roles", "権限"],
  ["glossary", "用語集"],
  ["faq", "よくある質問"],
];

export default function GuidePage() {
  return (
    <PageShell maxWidth="7xl">
      <GuideBehavior />
      <SectionHeader
        variant="page"
        title="SEIQ 使い方ガイド"
        description="はじめて使う方も、毎月の管理も。何ができるか、どこから始めるかが分かります。"
      />
      <section
        className="rounded-2xl bg-brand-navy p-6 text-white sm:p-8"
        aria-labelledby="guide-start"
      >
        <p className="text-xs font-medium tracking-widest text-brand-gold">
          はじめての方へ
        </p>
        <h2 id="guide-start" className="mt-3 text-xl font-semibold sm:text-2xl">
          SEIQは、請求書の作成から、帳簿づけ・経費・証憑の保管までを1か所で行うシステムです。
        </h2>
        <p className="mt-3 text-sm leading-7 text-slate-200">
          まず「請求書を出す」ところから始めて、必要になったら会計・経費・メンバー共有へ広げられます。すべてを一度に使う必要はありません。
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-white/10 p-4">
            <p className="text-sm font-semibold text-brand-gold">
              請求書だけ使う（約15分）
            </p>
            <p className="mt-2 text-xs leading-6 text-slate-200">
              自社情報を登録 → 取引先を登録 → 請求書を作成 → 確認して送付
            </p>
          </div>
          <div className="rounded-xl bg-white/10 p-4">
            <p className="text-sm font-semibold text-brand-gold">
              会計まで使う
            </p>
            <p className="mt-2 text-xs leading-6 text-slate-200">
              上の流れ → 会計の初期設定（業種・会計開始日）→ 開始残高 →
              日々の入力と確認
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="#first-steps"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-gold px-5 py-3 text-sm font-semibold text-brand-navy shadow-sm hover:bg-brand-gold-hover"
          >
            最初の設定を見る
            <AppIcon name="arrow" />
          </Link>
          <Link
            href="#finder"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/30 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
          >
            やりたいことから探す
          </Link>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="このページの内容" className="flex flex-wrap gap-2">
          {contents.map(([id, label]) => (
            <Link
              key={id}
              href={`#${id}`}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:border-sky-400 hover:bg-sky-50"
            >
              {label}
            </Link>
          ))}
        </nav>
        <GuideToggleAll />
      </div>
      <p className="-mt-2 text-xs text-slate-500">
        項目を押すと、中身が開きます。
      </p>

      <div className="space-y-3">
        <Section
          id="overview"
          icon="home"
          title="このシステムでできること"
          lead="使う場面ごとに、機能をまとめています。カードを押すと、その画面が開きます。"
          badge="6つの場面"
        >
          <div className="grid gap-5 xl:grid-cols-2">
            {overview.map((group) => (
              <div
                key={group.title}
                className="rounded-2xl border border-slate-200 p-5"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                    <AppIcon name={group.icon} />
                  </span>
                  <div>
                    <h3 className="font-semibold">{group.title}</h3>
                    <p className="text-xs text-slate-500">{group.lead}</p>
                  </div>
                </div>
                <ul className="mt-4 space-y-3">
                  {group.features.map((f) => (
                    <li key={f.title}>
                      <Link
                        href={f.href}
                        className="block rounded-xl border border-slate-100 p-3 hover:border-sky-300 hover:bg-sky-50/50"
                      >
                        <span className="text-sm font-semibold text-slate-800">
                          {f.title}
                        </span>
                        <span className="mt-1 block text-xs leading-6 text-slate-600">
                          {f.text}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-5 rounded-xl bg-slate-50 p-4 text-xs leading-6 text-slate-600">
            このシステムは、帳簿づけ・集計・書類の作成を助けるものです。税務上の判断や、確定申告・消費税の申告書の作成は行いません。経理・税務の最終確認は、税理士などの専門家にご相談ください。
          </p>
        </Section>

        <Section
          id="first-steps"
          icon="check"
          title="はじめに：最初の設定"
          lead="上から順に進めます。「必須」だけで、請求書を発行できます。"
          badge={`${checklist.length}ステップ`}
        >
          <p className="text-sm text-slate-500">
            それ以外は、使う機能に合わせて、必要になったときに設定してください。
          </p>
          <ol className="mt-4 space-y-3">
            {checklist.map((c, i) => (
              <li
                key={c.title}
                className="flex gap-4 rounded-xl border border-slate-200 p-4"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-navy text-sm font-semibold text-white">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{c.title}</h3>
                    <span
                      className={`${pill} ${c.need === "必須" ? "bg-brand-gold/25 text-brand-navy" : ""}`}
                    >
                      {c.need}
                    </span>
                    <span className={pill}>権限：{c.role}</span>
                  </div>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    {c.text}
                  </p>
                  <Link
                    href={c.href}
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-sky-700 underline underline-offset-4"
                  >
                    開く
                    <AppIcon name="arrow" className="h-4 w-4" />
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        </Section>

        <Section
          id="menu"
          icon="menu"
          title="メニューの見方"
          lead="画面の左側（スマートフォンでは左上のボタン）にあるメニューの意味です。"
          badge={`${menuGuide.length}項目`}
        >
          <p className="text-sm text-slate-500">
            権限によっては、表示されないボタンがあります。
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="p-3">メニュー</th>
                  <th className="p-3">できること</th>
                  <th className="p-3">使える人</th>
                </tr>
              </thead>
              <tbody>
                {menuGuide.map((m) => (
                  <tr
                    key={m.name}
                    className="border-t border-slate-100 align-top"
                  >
                    <td className="whitespace-nowrap p-3 font-medium">
                      <Link
                        href={m.href}
                        className="text-sky-700 underline underline-offset-4"
                      >
                        {m.name}
                      </Link>
                    </td>
                    <td className="p-3 leading-7 text-slate-600">{m.text}</td>
                    <td className="p-3 text-xs text-slate-500">{m.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          id="finder"
          icon="arrow"
          title="やりたいこと別の道案内"
          lead="「こんなときは、どこを開くのか」の早見表です。"
          badge={`${finder.length}項目`}
        >
          <div className="divide-y divide-slate-100">
            {finder.map((f) => (
              <div
                key={f.want}
                className="grid gap-2 py-4 first:pt-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:gap-6"
              >
                <p className="text-sm font-semibold text-slate-800">{f.want}</p>
                <div className="text-sm">
                  <Link
                    href={f.href}
                    className="font-medium text-sky-700 underline underline-offset-4"
                  >
                    {f.where}
                  </Link>
                  <p className="mt-1 text-xs leading-6 text-slate-600">
                    {f.hint}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section
          id="chapters"
          icon="book"
          title="機能ごとの使い方"
          lead="手順を、順番に説明します。章を押すと、手順が開きます。"
          badge={`${chapters.length}章`}
        >
          <div className="space-y-3">
            {chapters.map((c, i) => (
              <details
                key={c.id}
                id={c.id}
                data-guide
                className="group scroll-mt-6 rounded-xl border border-slate-200 bg-white open:border-sky-200 open:bg-sky-50/20"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl p-4 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-brand-blue [&::-webkit-details-marker]:hidden">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-navy text-sm font-semibold text-white">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold sm:text-base">
                      {c.title}
                    </h3>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {c.subtitle}
                    </span>
                  </span>
                  <span
                    className={`hidden max-w-[16rem] truncate lg:inline-flex ${pillStyle}`}
                  >
                    権限：{c.role}
                  </span>
                  <span
                    className="shrink-0 text-slate-400 transition-transform group-open:rotate-90"
                    aria-hidden="true"
                  >
                    <AppIcon name="arrow" className="h-4 w-4" />
                  </span>
                </summary>
                <div className="border-t border-slate-100 p-4 sm:p-5">
                  <p className={`inline-flex lg:hidden ${pillStyle}`}>
                    権限：{c.role}
                  </p>
                  <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-7 marker:font-semibold marker:text-sky-700 lg:mt-0">
                    {c.steps.map((step) => (
                      <li key={step} className="pl-1">
                        {step}
                      </li>
                    ))}
                  </ol>
                  <p className="mt-5 rounded-xl bg-slate-50 p-4 text-xs leading-6 text-slate-600">
                    {c.note}
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-4">
                    <Link
                      href={c.href}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand-blue/30 bg-brand-blue/10 px-4 py-2.5 text-sm font-semibold text-brand-navy shadow-sm hover:bg-brand-blue/20"
                    >
                      {c.action}
                      <AppIcon name="arrow" className="h-4 w-4" />
                    </Link>
                    {c.id === "templates" && (
                      <Link
                        href="/mail-templates"
                        className="py-3 text-sm text-sky-700 underline underline-offset-4"
                      >
                        メールテンプレートを開く
                      </Link>
                    )}
                  </div>
                </div>
              </details>
            ))}
          </div>
        </Section>

        <Section
          id="roles"
          icon="users"
          title="権限でできること"
          lead="事業所のメンバーには、4つの権限のどれかを設定します。"
          badge="4段階"
        >
          <p className="text-sm text-slate-500">
            段階が上がるほど、できることが増えます（下の段階でできることは、すべてできます）。
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {WORKSPACE_ROLES.map((r, i) => (
              <div key={r} className="rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-400">{i + 1}段階目</p>
                <h3 className="mt-1 font-semibold">{roleLabel[r]}</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">
                  {roleSummary[r]}
                </p>
              </div>
            ))}
          </div>
          <ul className="mt-5 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-600">
            <li>
              最初にアカウントを使い始めた人（事業所の所有者）は、常に「管理者」です。
            </li>
            <li>
              新しいアカウントの発行は、「全体管理者」だけが、「ユーザー管理」で行えます。
            </li>
            <li>
              経費精算の「申請者・承認者」は、この権限とは別に、経費精算の画面で設定します。
            </li>
            <li>
              操作できない画面を開こうとすると、ダッシュボードに戻ります。ボタンが見当たらないときは、権限を確認してください。
            </li>
          </ul>
        </Section>

        <Section
          id="glossary"
          icon="items"
          title="用語集"
          lead="画面に出てくる、会計・税の言葉の意味です。"
          badge={`${glossary.length}語`}
        >
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {glossary.map((g) => (
              <div key={g.term} className="rounded-xl bg-slate-50 p-4">
                <dt className="text-sm font-semibold">{g.term}</dt>
                <dd className="mt-1 text-sm leading-7 text-slate-600">
                  {g.text}
                </dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section
          id="faq"
          icon="clock"
          title="よくある質問"
          lead="困ったときは、ここから探してください。質問を押すと、回答が開きます。"
          badge={`${questions.length}件`}
        >
          <div className="divide-y divide-slate-100">
            {questions.map(({ q, a }) => (
              <details key={q} data-guide className="group py-1">
                <summary className="cursor-pointer rounded-lg py-4 text-sm font-medium text-slate-800 focus-visible:outline-2 focus-visible:outline-brand-blue">
                  {q}
                </summary>
                <p className="pb-5 pl-4 text-sm leading-7 text-slate-600">
                  {a}
                </p>
              </details>
            ))}
          </div>
        </Section>
      </div>

      <Link
        href="#main-content"
        className="self-center px-4 py-3 text-sm text-sky-700"
      >
        ページの先頭へ ↑
      </Link>
    </PageShell>
  );
}
