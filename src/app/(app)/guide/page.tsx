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
  chapters as otherChapters,
  finder,
  glossary,
  menuGuide,
  questions,
} from "./content";
import { audienceOf, audiences, type AudienceId } from "./guides";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { workspaceOf } from "@/lib/auth/require-workspace";

const pillStyle =
  "items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600";

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

const jump =
  "rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:border-sky-400 hover:bg-sky-50";

/** 画面を開いた人に合う対象者を、初めに選んでおく。 */
async function defaultAudience(): Promise<AudienceId> {
  const user = await requireUser();
  const [ws, claims] = await Promise.all([
    workspaceOf(user.id),
    prisma.claimMember.count({ where: { userId: user.id, active: true } }),
  ]);
  if (ws.role === "SUBMITTER") return claims > 0 ? "applicant" : "contractor";
  if (user.role === "ADMIN" && ws.role === "ADMIN") return "admin";
  return "staff";
}

export default async function GuidePage({
  searchParams,
}: {
  searchParams: Promise<{ for?: string }>;
}) {
  const { for: forParam } = await searchParams;
  const audience =
    audienceOf(forParam) ?? audienceOf(await defaultAudience()) ?? audiences[0];
  const showReference = audience.id === "admin" || audience.id === "staff";

  return (
    <PageShell maxWidth="7xl">
      <GuideBehavior />
      <SectionHeader
        variant="page"
        title="SEIQ 使い方ガイド"
        description="あなたの立場を選ぶと、画面の写真つきで、手順を順番に説明します。"
      />

      <nav aria-label="対象者を選ぶ" id="audiences">
        <p className="text-sm font-semibold text-slate-700">
          あなたは、どの立場ですか？
        </p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {audiences.map((a) => {
            const current = a.id === audience.id;
            return (
              <li key={a.id}>
                <Link
                  href={`/guide?for=${a.id}`}
                  aria-current={current ? "page" : undefined}
                  className={`flex h-full gap-3 rounded-2xl border p-4 hover:border-sky-400 ${
                    current
                      ? "border-brand-navy bg-brand-navy text-white"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                      current
                        ? "bg-white/15 text-brand-gold"
                        : "bg-sky-50 text-sky-700"
                    }`}
                  >
                    <AppIcon name={a.icon} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                      {a.label}
                    </span>
                    <span
                      className={`mt-1 block text-xs leading-5 ${
                        current ? "text-slate-200" : "text-slate-500"
                      }`}
                    >
                      {a.who}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <section
        className="rounded-2xl bg-brand-navy p-6 text-white sm:p-8"
        aria-labelledby="guide-start"
      >
        <p className="text-xs font-medium tracking-widest text-brand-gold">
          {audience.label}向け
        </p>
        <h2 id="guide-start" className="mt-3 text-xl font-semibold sm:text-2xl">
          {audience.lead}
        </h2>
        <p className="mt-4 text-sm font-semibold text-brand-gold">
          最初にやること（上から順に）
        </p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-7 text-slate-100">
          {audience.start.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
        <p className="mt-4 text-xs leading-6 text-slate-300">
          下の項目を押すと、手順が開きます。写真の赤い番号は、手順の①②…と対応しています。
        </p>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="このページの内容" className="flex flex-wrap gap-2">
          <Link href="#steps" className={jump}>
            手順
          </Link>
          {showReference && (
            <Link href="#finder" className={jump}>
              やりたいこと別
            </Link>
          )}
          {showReference && (
            <Link href="#menu" className={jump}>
              メニューの見方
            </Link>
          )}
          {showReference && (
            <Link href="#roles" className={jump}>
              権限
            </Link>
          )}
          {showReference && (
            <Link href="#glossary" className={jump}>
              用語集
            </Link>
          )}
          <Link href="#faq" className={jump}>
            よくある質問
          </Link>
        </nav>
        <GuideToggleAll />
      </div>

      <div className="space-y-3">
        <Section
          id="steps"
          icon="book"
          title="手順（順番に進めてください）"
          lead="やりたいことの項目を押すと、手順が開きます。"
          badge={`${audience.chapters.length}項目`}
        >
          <div className="space-y-3">
            {audience.chapters.map((c, i) => (
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
                    className="shrink-0 text-slate-400 transition-transform group-open:rotate-90"
                    aria-hidden="true"
                  >
                    <AppIcon name="arrow" className="h-4 w-4" />
                  </span>
                </summary>
                <div className="border-t border-slate-100 p-4 sm:p-5">
                  <ol className="space-y-6">
                    {c.steps.map((step, n) => (
                      <li key={step.text} className="flex gap-3">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-800">
                          {n + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-7">{step.text}</p>
                          {step.shot && (
                            <figure className="mt-3">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`/guide/${step.shot.id}.webp`}
                                alt={step.shot.alt}
                                width={1100}
                                loading="lazy"
                                decoding="async"
                                className="h-auto w-full max-w-[880px] rounded-xl border border-slate-200 shadow-sm"
                              />
                              {step.shot.caption && (
                                <figcaption className="mt-2 text-xs leading-6 text-slate-600">
                                  {step.shot.caption}
                                </figcaption>
                              )}
                            </figure>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                  {c.note && (
                    <p className="mt-5 rounded-xl bg-slate-50 p-4 text-xs leading-6 text-slate-600">
                      {c.note}
                    </p>
                  )}
                  <div className="mt-5">
                    <Link
                      href={c.href}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand-blue/30 bg-brand-blue/10 px-4 py-2.5 text-sm font-semibold text-brand-navy shadow-sm hover:bg-brand-blue/20"
                    >
                      {c.action}
                      <AppIcon name="arrow" className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </Section>

        {showReference && (
          <>
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
                    <p className="text-sm font-semibold text-slate-800">
                      {f.want}
                    </p>
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
                        <td className="p-3 leading-7 text-slate-600">
                          {m.text}
                        </td>
                        <td className="p-3 text-xs text-slate-500">{m.role}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>

            <Section
              id="other-chapters"
              icon="book"
              title="そのほかの機能の使い方"
              lead="手順を、順番に説明します。章を押すと、手順が開きます。"
              badge={`${otherChapters.length}章`}
            >
              <div className="space-y-3">
                {otherChapters.map((c, i) => (
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
                  <div
                    key={r}
                    className="rounded-xl border border-slate-200 p-4"
                  >
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
          </>
        )}

        <Section
          id="faq"
          icon="clock"
          title="よくある質問"
          lead="困ったときは、ここから探してください。質問を押すと、回答が開きます。"
          badge={`${audience.faq.length + (showReference ? questions.length : 0)}件`}
        >
          <div className="divide-y divide-slate-100">
            {[...audience.faq, ...(showReference ? questions : [])].map(
              ({ q, a }) => (
                <details key={q} data-guide className="group py-1">
                  <summary className="cursor-pointer rounded-lg py-4 text-sm font-medium text-slate-800 focus-visible:outline-2 focus-visible:outline-brand-blue">
                    {q}
                  </summary>
                  <p className="pb-5 pl-4 text-sm leading-7 text-slate-600">
                    {a}
                  </p>
                </details>
              ),
            )}
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
