import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { SectionHeader } from "@/components/ui/section-header";
import { AppIcon, type IconName } from "@/components/ui/app-icon";

const chapters: {
  id: string;
  title: string;
  subtitle: string;
  icon: IconName;
  steps: string[];
  note: string;
  href: string;
  action: string;
}[] = [
  {
    id: "management-reports",
    title: "経営レポートで入出金と損益を確認する",
    subtitle: "予定と実績を分けて、数字を確認",
    icon: "book",
    steps: [
      "ダッシュボードの「経営レポート」から、入金予定・支払予定・収益・費用・損益・資金繰りを選びます。",
      "期間・部門・事業所を選択し「表示する」を押します。グラフと一覧を確認し、CSVまたはPDFで保存できます。",
      "「分類・振込先」で取引を開き、部門・事業所を登録します。経費精算には精算予定日も設定できます。",
      "支払先口座と予定日を全件登録すると、支払予定から「一括振込準備CSV」を出力できます。銀行に合わせて変換・内容確認後、手動で振込を行います。",
    ],
    note: "損益・費用は税込の仕訳、収益ランキングは税抜の発行済み請求書を集計します。資金繰りは今日から6か月で、期限超過と日付未設定の支払いを除外します。開始残高と未記帳の取引を確認してください。共通CSVは銀行ごとの取込互換を保証せず、送金・支払済みへの変更は行いません。",
    href: "/reports",
    action: "経営レポートを開く",
  },
  {
    id: "fixed-assets",
    title: "固定資産と減価償却を管理する",
    subtitle: "登録・予定の確認・仕訳まで、順番に",
    icon: "book",
    steps: [
      "「会計・帳簿」→「固定資産」で、資産名・取得日・使用開始日・取得価額を登録します。最初に減価償却費の科目を準備します。",
      "償却方法・耐用年数・事業年度の開始月を確認します。入力中に初年度の償却見込みが表示されます。",
      "保存後、年度を選んで月別の予定を確認します。過去の未登録期間から順に、1か月分または年度の未登録分をまとめて記帳します。",
      "仕訳は「減価償却費／資産科目」の直接法で登録され、帳簿に反映されます。訂正時は最後の仕訳から理由を付けて取り消します。",
    ],
    note: "事業専用の有形資産・定額法と200％定率法（2〜50年）・12か月の事業年度に対応。過年度償却済み資産の移行、家事按分、無形資産、少額資産特例は未対応です。取得時の仕訳は別途必要です。月末・年度末以降に登録でき、記帳済みの月は重複登録しません。保管操作は除却仕訳を作成しません。",
    href: "/accounting/assets",
    action: "固定資産を開く",
  },
  {
    id: "setup",
    title: "自社情報を登録する",
    subtitle: "最初に一度、請求書の差出人を準備",
    icon: "settings",
    steps: [
      "「自社情報・設定」で、自社名・住所・担当者などを入力します。",
      "振込先の銀行・支店・口座情報と、必要に応じて適格請求書番号・印影を登録します。",
      "消費税率を確認し、「設定を更新」を押します。10%の場合は「10」と入力します。",
    ],
    note: "Gmailを使う場合は、送信に使うGoogleアカウントのメールアドレスも登録してください。",
    href: "/settings",
    action: "自社情報・設定を開く",
  },
  {
    id: "company",
    title: "取引先を登録する",
    subtitle: "請求先の情報を、次回から再利用",
    icon: "company",
    steps: [
      "「取引先」から新しい取引先を追加します。",
      "会社名・請求書コードを入力し、必要に応じてメールアドレスや支払条件を設定します。",
      "登録すると、請求書の作成画面で取引先を選べるようになります。",
    ],
    note: "会社名や宛先は、請求書を送る前にもう一度確認しましょう。",
    href: "/companies/new",
    action: "取引先を登録する",
  },
  {
    id: "create",
    title: "請求書を作成する",
    subtitle: "入力と完成イメージを、同じ画面で確認",
    icon: "invoice",
    steps: [
      "「請求書を作成」を押し、取引先・件名・請求日・支払期限を入力します。",
      "品目・数量・単価などの明細を入力します。右側のプレビューと金額に、その場で反映されます。",
      "作成途中は「下書きを保存」。内容を確認できたら「発行する」を押します。",
    ],
    note: "下書きは必須項目の入力後に自動保存されます。画面下の保存状態を確認してから離れてください。スマートフォンでは入力とプレビューを切り替えられます。",
    href: "/invoices/new",
    action: "請求書を作成する",
  },
  {
    id: "send",
    title: "PDFを確認して、Gmailで送る",
    subtitle: "宛先・文面・添付を確認してから手動送信",
    icon: "mail",
    steps: [
      "作成画面の「拡大・PDF・印刷」で帳票を確認します。ブラウザの印刷画面からPDFとして保存することもできます。",
      "「Gmail下書き」を開き、宛先・件名・本文と添付PDFを確認して、確認チェックを入れます。",
      "「Googleと連携して下書きを作成」を押し、登録した送信元と同じGoogleアカウントで連携します。",
      "「Gmailの下書きを開く」からGmailに移動し、添付と文面を最終確認して送信します。",
    ],
    note: "メールは自動送信されません。Gmail連携が未設定の環境では、管理者に設定を依頼してください。PDFを保存して手動でメールに添付する方法も使えます。",
    href: "/invoices",
    action: "送付する請求書を選ぶ",
  },
  {
    id: "sales",
    title: "売上の推移を確認する",
    subtitle: "月別・取引先別に、請求内容を振り返る",
    icon: "home",
    steps: [
      "「ダッシュボード」で「今月」「今年」「過去12か月」を選びます。",
      "「期間・取引先・金額を指定する」を開くと、最大24か月の期間や特定の取引先に絞れます。「集計する」で反映します。",
      "月別グラフの棒を押すと、その月の請求書一覧が開きます。取引先別の内訳を押すと、その会社の推移に絞れます。",
      "正確な金額を一覧で読みたいときは、「月別の金額を一覧で見る」を開きます。",
    ],
    note: "発行済みの請求書を、請求日で集計します。下書き・確定のみの請求書は含みません。入金記録や入金済み金額を示すものではありません。",
    href: "/dashboard",
    action: "ダッシュボードを開く",
  },
  {
    id: "receipts",
    title: "相手からの入金と過去の請求書を確認する",
    subtitle: "発行状況と入金状況を分けて管理",
    icon: "wallet",
    steps: [
      "請求書一覧の「入金状況」で、入金済み・未入金・期限超過を絞り込みます。",
      "銀行明細などで全額の入金を確認したら、「詳細」の「入金を記録」で実際の入金日を保存します。",
      "誤って記録した場合は「入金記録を変更」から訂正や取り消しができます。入金済みの請求内容は編集が保護されます。",
      "過去の請求書は、請求日の期間や会社名で検索し、一覧の「プレビュー」で開けます。閉じると同じ一覧に戻ります。",
    ],
    note: "入金は手動記録です。銀行との自動照合や一部入金には対応していません。未入金・未確認には過去の未記録分も含まれます。支払管理は、自分から相手への支払いを扱います。",
    href: "/invoices",
    action: "請求書と入金を確認する",
  },
  {
    id: "expenses",
    title: "支払いとコストを管理する",
    subtitle: "対象月・支払期限・実際の支払日を分けて記録",
    icon: "wallet",
    steps: [
      "「支払管理」の「支払いを登録」から、支払先・内容・費目・税込の支払金額を入力します。",
      "費用の対象月と支払期限を設定します。受け取った請求書PDFも1ファイル・3MBまで添付できます。",
      "銀行などで全額を支払ったら、一覧の「支払を記録・編集」から「支払済み」と実際の支払日を保存します。",
      "月別コスト・費目別の内訳で振り返り、「期限超過」「7日以内」で対応が必要な支払いを確認します。",
    ],
    note: "この画面から振込は行われません。一部払い・定期支払いの自動登録には対応していません。未払い・期限超過の一覧は対象月にかかわらず全期間を表示します。",
    href: "/expenses",
    action: "支払管理を開く",
  },
  {
    id: "claims",
    title: "レシートから経費を申請・承認する",
    subtitle: "申請者と承認者で確認し、精算まで記録する",
    icon: "wallet",
    steps: [
      "管理者は「経費精算」→「メンバー設定」で精算先を作り、登録済みユーザーのメールアドレスで申請者・承認者を指定します。先に管理者の会計初期設定が必要です。",
      "申請者は精算先を選び、件名・支払先・日付・税込金額・分類を入力し、レシートを添付します。画像・PDFは3MB以内。保存後に内容を確認して申請します。",
      "承認者はお知らせから申請を開き、レシートと金額を確認して費用科目を選びます。承認で費用／未払金を仕訳登録。差戻し時は理由を入力します。自分の申請は承認できません。",
      "差戻された申請は内容を修正し、再申請できます。承認前なら申請を取り下げて編集できます。申請と承認の履歴は詳細画面に残ります。",
      "実際に振り込んだ後、管理者が精算日と支払口座科目を選んで精算を記録します。未払金／支払口座を仕訳登録します。この操作では銀行送金は行いません。",
      "お知らせで結果を確認します。メール通知は本人が有効化し、管理者が送信サービスを設定した場合に使えます。申請画像や金額はメールに含めません。",
    ],
    note: "この権限は経費精算専用で、請求書や帳簿全体の共有権限ではありません。精算の支払は経費精算内で管理し、同じ支払いを支払管理に重ねて登録しないでください。銀行CSVは既存仕訳と照合できます。OCR・電子帳簿保存法対応の原本保管は今後のフェーズです。",
    href: "/claims",
    action: "経費精算を開く",
  },
  {
    id: "accounting",
    title: "仕訳・帳簿と請求連携を使う",
    subtitle: "会計開始日を決め、取引を帳簿につなぐ",
    icon: "book",
    steps: [
      "「会計・帳簿」で業種と会計開始日を設定します。開始残高は「取引を入力」の振替伝票で登録します。",
      "借方・貸方を直接入力する振替伝票か、科目を固定する帳簿形式を選びます。借貸合計が一致すると登録できます。",
      "仕訳帳・総勘定元帳・取引データで内容を確認し、期間を絞ってCSV・PDFを出力できます。誤りは取消仕訳を登録して訂正します。",
      "会計開始後の請求書発行・入金・支払の保存は自動仕訳されます。既存データは「請求・支払連携」の「既存データ連携」で確認して取り込みます。",
      "「入金消込」で銀行明細の入金額と同じ取引先の請求書を照合します。定期請求は対象月の下書きを生成し、合算請求は未発行の下書きをまとめます。",
    ],
    note: "円・税込経理です。支払管理の費用は対象月の1日で計上します。手入力で計上済みの請求・支払いを重複して取り込まないでください。一部入金、税務申告、帳簿全体の共有権限はこの段階の対象外です。",
    href: "/accounting",
    action: "会計・帳簿を開く",
  },
  {
    id: "statements",
    title: "銀行・カード明細を取り込む",
    subtitle: "CSVから仕訳の入力を減らす",
    icon: "book",
    steps: [
      "「会計・帳簿」→「明細取込・自動仕訳」で銀行またはカードを登録し、対応する勘定科目を選びます。口座ごとに同じ登録先を使ってください。",
      "CSVを選び、文字コードと日付・摘要・金額の列を設定します。「取込内容を確認」で金額・入出金・重複を確認してから取り込みます。",
      "未処理の明細で相手科目を選び、確認して仕訳を登録します。「このパターンを学習」で、次回から同じ摘要と入出金の科目を提案します。",
      "繰り返す取引は「自動登録ルール」で自動登録を有効にできます。次回の取込確認時に自動登録を選ぶと、該当する明細の仕訳も登録します。",
      "請求・支払管理で記帳済みなら「既存仕訳と照合」を使います。誤った登録は明細から取り消すと逆仕訳が残り、未処理に戻ります。",
    ],
    note: "カード利用で費用を計上したら、銀行のカード代金引落は未払金の精算にします。金融機関の明細IDがないCSVは、同日同額・同じ摘要の取引を別ファイルに分けると区別できません。同日の明細をまとめて取り込んでください。銀行API・OCRは未対応です。",
    href: "/accounting/statements",
    action: "明細取込を開く",
  },
  {
    id: "templates",
    title: "次回の作成をもっと簡単に",
    subtitle: "繰り返す入力を減らす",
    icon: "items",
    steps: [
      "よく使う品目・単価は「明細テンプレート」に登録しておきます。",
      "定型の件名・本文は「メールテンプレート」に登録すると、Gmail下書きの準備が簡単になります。",
      "同じ取引先への請求は、請求書一覧の「複製」から下書きを作れます。請求日・支払期限・明細を見直して保存します。",
    ],
    note: "複製後も日付・宛先・金額を確認してから発行してください。",
    href: "/item-templates",
    action: "明細テンプレートを登録する",
  },
];
const questions = [
  {
    q: "「発行する」を押すとメールが送られますか？",
    a: "送られません。「発行する」は請求書を発行済みとして保存する操作です。メール送信はGmailで手動で行います。発行済みでも、送信済み・入金済みとは限りません。",
  },
  {
    q: "作成途中の請求書はどこから再開できますか？",
    a: "ダッシュボードの「下書きを再開」、または請求書一覧で下書きに絞り、対象の請求書の編集画面を開いてください。",
  },
  {
    q: "売上グラフに請求書が表示されません。",
    a: "請求書の保存ステータスが「発行済み」か、請求日が選択期間内かを確認してください。取引先で絞っている場合は、その条件も確認します。集計は支払期限や作成日ではなく、請求日が基準です。",
  },
  {
    q: "税抜請求額と振込請求額は何が違いますか？",
    a: "税抜請求額は消費税を加える前の金額です。振込請求額は消費税を含み、源泉徴収額を差し引いた金額です。請求書一覧に表示される金額は振込請求額です。",
  },
  {
    q: "Gmailの下書きを作成できません。",
    a: "自社情報・設定の送信元メールと、連携するGoogleアカウントが一致しているか確認してください。「初期設定がまだ完了していません」と表示される場合は、管理者によるGmail連携の設定が必要です。",
  },
  {
    q: "自動保存に失敗した場合はどうすればいいですか？",
    a: "入力画面を閉じずに、必須項目や通信状況を確認して保存ボタンで再試行してください。「保存済み」と表示されたことを確認してから移動しましょう。",
  },
];
export default function GuidePage() {
  return (
    <PageShell maxWidth="7xl">
      <SectionHeader
        variant="page"
        title="SEIQ 使い方ガイド"
        description="はじめての請求書も、毎月の管理も。やりたいことから探せます。"
      />
      <section
        className="rounded-2xl bg-[#183d44] p-6 text-white sm:p-8"
        aria-labelledby="guide-start"
      >
        <p className="text-xs font-medium tracking-widest text-emerald-200">
          はじめての方へ
        </p>
        <h2 id="guide-start" className="mt-3 text-xl font-semibold sm:text-2xl">
          最初の請求書は、この順番で。
        </h2>
        <p className="mt-3 text-sm leading-7 text-slate-200">
          自社情報を設定 → 取引先を登録 → 請求書を作成 → 内容を確認して送付
        </p>
        <Link
          href="#setup"
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-300 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-200"
        >
          最初の手順を見る
          <AppIcon name="arrow" />
        </Link>
      </section>
      <nav
        aria-label="ガイドの目次"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        {chapters.map((c, i) => (
          <Link
            key={c.id}
            href={`#${c.id}`}
            className="group flex min-h-20 items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 hover:border-emerald-400 hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-emerald-700"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#edf6f2] text-emerald-800">
              <AppIcon name={c.icon} />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] text-slate-500">
                STEP {i + 1}
              </span>
              <span className="mt-1 block text-sm font-semibold">
                {c.title}
              </span>
            </span>
            <span className="ml-auto text-slate-400" aria-hidden="true">
              ↓
            </span>
          </Link>
        ))}
      </nav>
      <div className="grid items-start gap-5 xl:grid-cols-2">
        {chapters.map((c, i) => (
          <section
            key={c.id}
            id={c.id}
            aria-labelledby={`${c.id}-heading`}
            className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#183d44] text-sm font-semibold text-white">
                {i + 1}
              </span>
              <h2 id={`${c.id}-heading`} className="text-lg font-semibold">
                {c.title}
              </h2>
            </div>
            <p className="mt-3 text-sm text-slate-500">{c.subtitle}</p>
            <ol className="mt-5 list-decimal space-y-3 pl-5 text-sm leading-7 marker:font-semibold marker:text-emerald-800">
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
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-100"
              >
                {c.action}
                <AppIcon name="arrow" className="h-4 w-4" />
              </Link>
              {c.id === "templates" && (
                <Link
                  href="/mail-templates"
                  className="py-3 text-sm text-emerald-800 underline underline-offset-4"
                >
                  メールテンプレートを開く
                </Link>
              )}
            </div>
          </section>
        ))}
      </div>
      <section
        aria-labelledby="faq-heading"
        className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"
      >
        <h2 id="faq-heading" className="text-lg font-semibold">
          よくある質問
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          気になる項目を押すと、回答が開きます。
        </p>
        <div className="mt-5 divide-y divide-slate-100">
          {questions.map(({ q, a }) => (
            <details key={q} className="group py-1">
              <summary className="cursor-pointer rounded-lg py-4 text-sm font-medium text-slate-800 focus-visible:outline-2 focus-visible:outline-emerald-700">
                {q}
              </summary>
              <p className="pb-5 pl-4 text-sm leading-7 text-slate-600">{a}</p>
            </details>
          ))}
        </div>
      </section>
      <Link
        href="#main-content"
        className="self-center px-4 py-3 text-sm text-emerald-800"
      >
        ページの先頭へ ↑
      </Link>
    </PageShell>
  );
}
