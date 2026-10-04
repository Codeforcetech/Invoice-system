// 撮影の指定。marks は、押す場所・入力する場所（番号つきの赤い枠）。
// find の書き方: {text:"ボタンの文字"} {label:"入力欄の見出し"} {sel:"CSSセレクタ"}（nth で何番目か）
const T = (text, extra = {}) => ({ text, ...extra });
const L = (label, extra = {}) => ({ label, ...extra });

export const shots = [
  // ---- 共通 ----
  { id: "login", persona: "none", path: "/login", marks: [{ sel: "input[type=email]" }, { sel: "input[type=password]" }, T("ログイン", { tag: "button" })] },
  { id: "admin-dashboard", persona: "admin", path: "/dashboard", height: 950, marks: [{ sel: "aside nav" }, { sel: "aside a[href='/invoices/new']" }, T("お知らせ", { tag: "a", within: "header" })] },
  { id: "staff-dashboard", persona: "approver", path: "/dashboard", height: 950, marks: [{ sel: "aside nav" }] },
  { id: "applicant-home", persona: "applicant", path: "/claims?owner=guide-admin", marks: [{ sel: "aside a[href='/claims']" }, T("＋ 経費を申請")] },
  { id: "contractor-home", persona: "contractor", path: "/submit", marks: [T("＋ 請求書をつくって提出する"), { sel: "aside a[href='/submit/profile']" }] },

  // ---- 管理者 ----
  { id: "admin-settings-company", persona: "admin", path: "/settings", marks: [L("自社名"), L("適格請求書番号"), L("住所")] },
  { id: "admin-settings-bank", persona: "admin", path: "/settings", scrollTo: L("銀行名"), marks: [L("銀行名"), L("口座番号"), T("設定を更新", { tag: "button" })], height: 900 },
  { id: "admin-users", persona: "admin", path: "/admin/users", marks: [L("氏名"), L("メールアドレス"), L("初期パスワード"), L("権限"), T("作成する", { tag: "button" })] },
  { id: "admin-members", persona: "admin", path: "/settings/members", scrollTo: T("メンバーを追加", { tag: "h2" }), marks: [L("ユーザーのメールアドレス"), L("権限", { nth: 0 }), T("メンバーを追加", { tag: "button" })], height: 900 },
  { id: "admin-claim-team", persona: "admin", path: "/claims/team", marks: [L("精算先の名前"), L("ユーザーのメールアドレス"), L("権限"), T("メンバーを保存", { tag: "button" })], height: 900 },
  { id: "admin-accounting-start", persona: "admin2", path: "/accounting", marks: [L("どんな仕事ですか？"), L("いつから記録をはじめますか？"), T("次へ（いまの状況を入力）", { tag: "button" })], height: 800 },
  { id: "admin-opening", persona: "admin2", path: "/accounting", steps: [{ click: T("次へ（いまの状況を入力）", { tag: "button" }), wait: 4000 }, { eval: "window.__marksNeedHelpers = true" }], reinject: true, marks: [{ sel: "input[name=cash]" }, { sel: "input[name=bank]" }, { sel: "input[name=receivable]" }, { sel: "input[name=payable]" }, { sel: "input[name=loan]" }, T("この内容で登録する", { tag: "button" })], height: 1200 },
  { id: "admin-links-new", persona: "admin", path: "/accounting/links", marks: [L("宛名（相手の名前・メモ）"), L("有効期限"), T("発行する", { tag: "button" })], height: 800 },
  { id: "admin-links-issued", persona: "admin", path: "/accounting/links", steps: [{ fill: L("宛名（相手の名前・メモ）"), value: "山本 一郎さん" }, { click: T("発行する", { tag: "button" }), wait: 2500 }, { eval: "(() => { const o = location.origin, ex = 'https://seiq.example.com'; const i = document.querySelector('input[readonly]'); if (i) i.value = i.value.replace(o, ex); const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (n.nodeValue.includes(o)) n.nodeValue = n.nodeValue.replaceAll(o, ex); })()" }], marks: [{ sel: "input[readonly]" }, T("送付用の文面ごとコピー", { tag: "button" })], height: 900 },
  { id: "admin-review", persona: "admin", path: "/accounting/submissions/{submissionPending}", marks: [T("承認して、支払管理に反映する", { tag: "button" }), L("差し戻す（理由は、提出した人に伝わります）"), T("差し戻す", { tag: "button", nth: 0 })], height: 900 },
  { id: "admin-received", persona: "admin", path: "/accounting/received?month=2026-10", marks: [T("山田 太郎さん", { tag: "a", within: "[role=status]" }), T("領収書と請求書をZIPで出力", { tag: "a" })], height: 900 },
  { id: "admin-monthly", persona: "admin", path: "/accounting/monthly?month=2026-10", marks: [L("何月"), L("費用を数える月"), L("金額"), T("この月をCSVで出力", { tag: "a" })], height: 1500 },

  // ---- 承認・経理担当 ----
  { id: "staff-company-new", persona: "admin", path: "/companies/new", marks: [L("会社名"), L("会社コード（採番用）"), L("デフォルト支払期限")], height: 900 },
  { id: "staff-invoice-top", persona: "admin", path: "/invoices/new", marks: [L("取引先", { nth: 0 }), L("件名", { nth: 0 }), L("請求日", { nth: 0 }), L("支払期限", { nth: 0 })], height: 900 },
  { id: "staff-invoice-items", persona: "admin", path: "/invoices/new", scrollTo: L("品目"), marks: [L("品目"), L("数量"), L("単価（円・税抜）"), T("＋ 明細を追加", { tag: "button" })], height: 900 },
  { id: "staff-invoice-save", persona: "admin", path: "/invoices/new", scrollTo: T("下書きを保存", { tag: "button" }), scrollMargin: 500, marks: [T("下書きを保存", { tag: "button" }), T("発行する", { tag: "button" })], height: 900 },
  { id: "staff-invoice-detail", persona: "admin", path: "/invoices/{invoiceIssued}", marks: [T("入金を記録", { tag: "button" }), T("編集", { tag: "a", within: "main" }), T("プレビュー/印刷", { tag: "button" }), T("Gmail下書き", { tag: "button" })], height: 800 },
  { id: "staff-expense-new", persona: "admin", path: "/expenses/new", marks: [L("支払先"), L("費目"), L("支払金額（円）"), L("状況"), T("支払いを登録", { tag: "button" })], height: 1500 },
  { id: "staff-easy-kind", persona: "admin", path: "/accounting/transactions/new", marks: [L("出ていったお金", { block: true }), L("入ってきたお金", { block: true }), L("口座・現金の移動", { block: true }), L("いつですか？"), L("いくらですか？")], height: 800 },
  { id: "staff-easy-form", persona: "admin", path: "/accounting/transactions/new", scrollTo: L("何のための支払いですか？"), marks: [L("何のための支払いですか？"), L("どこから払いましたか？"), L("支払った相手・内容"), T("記録する", { tag: "button" })], height: 900 },
  { id: "staff-money-list", persona: "admin", path: "/accounting?view=money", marks: [T("＋ お金の出入りを記録", { tag: "a", within: "main" }), T("経理の方向けの帳簿", { tag: "summary" }), T("取消仕訳を登録", { tag: "button" })], height: 900 },
  { id: "staff-statements", persona: "admin", path: "/accounting/statements", steps: [{ click: T("CSVを取り込む", { tag: "button" }) }], marks: [L("取込口座"), L("文字コード"), L("CSVファイル")], height: 900 },
  { id: "staff-claim-approve", persona: "approver", path: "/claims/{claimPending}", scrollTo: T("申請内容", { tag: "h2" }), scrollMargin: 90, marks: [L("費用の勘定科目"), T("承認して仕訳を登録", { tag: "button" }), L("コメント（差戻し時は必須）"), T("理由を添えて差し戻す", { tag: "button" })], height: 900 },

  { id: "admin-audit", persona: "admin", path: "/settings/audit", marks: [], height: 800 },

  // ---- 申請者（経費精算） ----
  { id: "applicant-claim-new", persona: "applicant", path: "/claims/new?owner=guide-admin", marks: [T("フォルダから選ぶ", { tag: "button" }), L("件名（必須）"), L("支払先（必須）"), L("経費の日付（必須）"), L("税込金額（円・必須）"), T("保存して申請内容を確認", { tag: "button" })], height: 1100 },
  { id: "applicant-claim-confirm", persona: "applicant", path: "/claims/{claimDraft}", marks: [T("確認して申請する", { tag: "button" }), T("内容を編集", { tag: "a" })], height: 800 },
  { id: "applicant-claim-status", persona: "applicant", path: "/claims?owner=guide-admin", marks: [T("承認待ち", { tag: "a", within: "main" }), T("内容を確認", { tag: "a", nth: 0 })], height: 800 },
  { id: "applicant-claim-pending", persona: "applicant", path: "/claims/{claimPending}", marks: [T("申請を取り下げる", { tag: "button" })], height: 800 },

  { id: "applicant-claim-rejected", persona: "applicant", path: "/claims/{claimRejected}", marks: [T("内容を編集", { tag: "a" })], height: 900 },

  // ---- 業務委託の方（ログインあり） ----
  { id: "contractor-profile", persona: "contractor", path: "/submit/profile", marks: [L("お名前（または会社名）"), L("インボイスの登録番号"), L("振込先の銀行名"), T("保存する", { tag: "button" })], height: 1100 },
  { id: "contractor-submit-top", persona: "contractor", path: "/submit/new", marks: [T("請求書のPDF・写真から入力する（AI）", { tag: "h2" }), L("何月分ですか？"), L("件名")], height: 900 },
  { id: "contractor-submit-items", persona: "contractor", path: "/submit/new", scrollTo: T("請求の内容", { tag: "h2" }), scrollMargin: 60, marks: [L("種類", { nth: 0 }), L("項目名", { nth: 0 }), L("単価（円・税抜）", { nth: 0 }), L("税", { nth: 0 }), T("＋ 交通費を追加", { tag: "button" })], height: 900 },
  { id: "contractor-submit-files", persona: "contractor", path: "/submit/new", scrollTo: T("領収書・資料の添付", { tag: "h2" }), scrollMargin: 100, marks: [T("フォルダから選ぶ", { tag: "button" }), T("保存して提出する", { tag: "button" }), T("下書きとして保存", { tag: "button" })], height: 900 },
  { id: "contractor-status", persona: "contractor", path: "/submit", marks: [T("10月分の業務委託料", { tag: "a" })], height: 700 },
  { id: "contractor-detail", persona: "contractor", path: "/submit/{submissionPending}", marks: [T("取り下げて直す", { tag: "button" })], height: 800 },

  { id: "contractor-rejected", persona: "contractor", path: "/submit/{submissionRejected}", marks: [T("差し戻しの理由", { tag: "p" }), T("内容を直す", { tag: "a" }), T("提出する", { tag: "button" })], height: 900 },
  { id: "common-notifications", persona: "contractor", path: "/notifications", marks: [T("内容を確認", { tag: "a", nth: 0 })], height: 700 },

  // ---- リンクから提出する方（ログインなし） ----
  { id: "external-top", persona: "none", path: "/s/{linkTokenFresh}", marks: [T("様", { tag: "h1" }), T("請求書のPDF・写真から入力する（AI）", { tag: "h2" }), T("あなたの情報", { tag: "h2" })], height: 900 },
  { id: "external-submit", persona: "none", path: "/s/{linkTokenFresh}", scrollTo: T("提出する", { tag: "button" }), scrollMargin: 600, marks: [T("提出する", { tag: "button" })], height: 900 },
  { id: "external-done", persona: "none", path: "/s/{linkToken}/{externalSubmission}?done=1", marks: [T("提出を受け付けました。", { tag: "p" }), T("取り下げて直す", { tag: "button" })], height: 800 },
];
