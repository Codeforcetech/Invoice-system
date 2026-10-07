# SEIQ 引き継ぎ資料（エンジニア向け）

作成日 2026-10-04。対象ブランチ `codex/invoice-system-edits`（`origin/main` = `65e7b0a` からの変更）。

**最初に読んでください。この資料は「何が出来ていて、何が確認されていないか」を正直に書いたものです。**

## 0. 現状の要約

- 既存の請求書システムに、会計（仕訳・帳簿・消費税区分・固定資産）、経費精算、明細取込、経営レポート、事業所メンバーの権限管理と操作ログ、適格請求書の税率別表示、証憑ファイルボックス、使い方ガイドを追加した。`origin/main` からの差分は **241ファイル、約3.5万行の追加**。
- 開発は AI アシスタント（Codex と Claude Code）が行い、フェーズごとにテストと画面確認をした。**人間によるコードレビューはまだ受けていない。** 次の節（§7）の重点箇所を、人の目で確認してほしい。
- 動作確認はすべて**ローカルの開発用DB**で行った。**本番へはデプロイしていない。** マイグレーションも本番DBには適用していない。コミットはローカルのみで、リモートへは push していない。
- テスト: 43ファイル・**297件がすべて成功**（§3 の手順で用意した、新しい空のテスト用DBで確認。DBを使うテストは、2つの環境変数を有効にして実行する）。TypeScript・ESLint・`npm audit`（0件）・本番ビルド（`npm run build -- --webpack`）も成功。§3 の手順（Docker のDB、マイグレーション、シード、テスト）は、書いたとおりに実行して動くことを確認済み。
- 「完成」ではない。法対応（インボイス・電子帳簿保存法・消費税）は要件の一部への対応で、**適合を宣言するものではない。** 税理士の確認が必要。

## 1. 作ったもの

| 領域 | 内容 | 主な場所 |
|---|---|---|
| 会計の土台 | 勘定科目、振替伝票・帳簿形式入力、仕訳帳・総勘定元帳・取引データ、取消仕訳、CSV/PDF出力 | `lib/accounting/`、`actions/accounting-actions.ts`、`src/app/(app)/accounting/` |
| かんたん入力（簿記なしで使える入口） | 「出ていったお金／入ってきたお金／口座の移動」の3択で記録。借方・貸方は自動生成。開始残高は5つの質問に答えるだけ（差額は元入金で自動調整、1回のみ）。会計トップは「お金の出入り」。経理向けの帳簿・仕訳入力は「経理の方向け」に残している | `lib/accounting/easy.ts`、`lib/accounting/opening.ts`、`actions/easy-accounting-actions.ts`、`src/components/accounting/{easy-entry-form,opening-form}.tsx`、`/accounting/opening`、`/accounting/transactions/{new,advanced}` |
| 領収書の自動読み取り（経費精算） | 領収書の写真・PDFをドラッグ＆ドロップかフォルダ選択で添付すると、Claude Haiku 4.5で日付・金額・支払先・分類を読み取り、入力欄に入れる（確認して申請）。キー未設定なら手入力のまま。1人あたり1時間30回の簡易上限 | `lib/ocr/receipt.ts`、`actions/claim-actions.ts`（`readClaimReceiptAi`）、`src/components/claims/form.tsx` |
| 書類の受け取り状況 | 誰が・いつ・何月分の請求書・領収書を送ってきたかを、月ごとに一覧（支払管理・経費精算・証憑を集約）。送ってきた人ごとの集計、添付の有無、先月届いて今月まだの人。新しいテーブルはなし | `lib/accounting/received.ts`、`src/app/(app)/accounting/received/page.tsx` |
| 月ごとの領収書まとめ出力（ZIP） | 受け取り状況の月を選び、領収書（と請求書）のファイルをZIPで出力。フォルダ分け、ファイル名は「送ってきた人_月_金額」、一覧.csv付き。合計60MBまで、同時に1件。操作ログに記録 | `lib/zip.ts`（外部ライブラリなしのZIP作成）、`lib/accounting/received.ts`（`buildReceiptPackage`）、`src/app/api/accounting/receipts-zip/route.ts` |
| 月ごとの売上と費用（取引先つき） | 売上は入金月（入金日のある発行済み請求書＋手入力・明細取込の売上）、費用は支払月／発生月を切替（支払管理＋承認済み経費精算＋手入力・明細取込の費用）。税込／税抜（参考値）切替、年間の月別一覧、取引先ごとの小計、CSV出力 | `lib/accounting/monthly.ts`、`src/app/(app)/accounting/monthly/page.tsx`、`src/app/api/accounting/monthly-csv/route.ts` |
| 業務委託メンバーの提出（提出者の役割・請求書づくり・承認） | 役割「提出者」（SUBMITTER）を新設。提出者は専用メニュー（書類を提出する／自分の情報）だけで、会社のデータは見えない。提出者が差出人の情報を設定し、報酬・交通費・経費の明細（税区分つき）で請求書をつくり、領収書を添えて提出。承認前は取り下げ・修正・削除できる。承認者以上が承認（→支払管理に「種類×税区分」ごとに支払い予定を作成、領収書を証憑に保存）または差戻し（理由つき）。お知らせ通知あり | `lib/workspace/access.ts`、`lib/submissions/`、`actions/submission-actions.ts`、`src/app/(app)/submit/`、`src/app/(app)/accounting/submissions/[id]/`、`src/app/api/submissions/`、移行 `20261005100000_submitter_role` `20261005110000_submissions` |
| 外部の提出リンク（ログインなし） | 相手ごとの専用リンクを発行（有効期限7/30/90日、承認待ち同時3件・合計20件、AI読み取り回数）。相手はリンクから、差出人の情報・請求内容・領収書を入力して提出（承認待ちで登録）。承認前は、同じリンクで取り下げ・修正・出し直し。承認・差戻しはメールで通知（メールアドレスと送信設定がある場合）。リンクは保存せずハッシュのみ、発行時に1回だけ表示 | `lib/submissions/link.ts`、`actions/submission-link-actions.ts`、`actions/public-submission-actions.ts`、`lib/notifications/external.ts`、`src/app/(public)/s/`、`src/app/(app)/accounting/links/`、移行 `20261005120000_submission_links` |
| 請求・入金連携 | 請求書発行の自動仕訳、入金消込、支払の自動仕訳、定期請求、合算請求 | `lib/accounting/sync.ts`、`actions/accounting-link-actions.ts` |
| 明細取込 | 銀行・カードCSV、重複判定、仕訳の提案と学習、自動登録ルール | `lib/accounting/statement-csv.ts`、`statements.ts`、`actions/statement-actions.ts` |
| 経費精算 | 申請→承認→仕訳、レシート添付、通知（アプリ内・メール） | `actions/claim-actions.ts`、`lib/claims/`、`lib/notifications/` |
| 固定資産 | 台帳、定額法・200%定率法の償却、月次・年次の仕訳 | `lib/assets/`、`actions/asset-actions.ts` |
| 経営レポート | 入金予定・支払予定・収益・費用・損益・資金繰り、部門・事業所、振込準備CSV | `lib/management/`、`src/app/(app)/reports/` |
| 権限・操作ログ | 事業所メンバー（閲覧のみ/入力可/承認可/管理者）、追記専用の操作ログ | `lib/workspace/`、`lib/auth/require-workspace.ts`、`actions/workspace-actions.ts` |
| 税対応 | 登録番号の検証、明細の消費税区分、税率ごとの端数処理、仕訳の税区分、区分別集計 | `lib/tax/`、`lib/invoice/calculateInvoice.ts`、`taxBreakdown.ts`、`lib/accounting/tax-report.ts` |
| 証憑 | 原本のまま保存、検索、訂正・無効化の履歴、DBでの変更・削除の禁止 | `lib/evidence/`、`actions/evidence-actions.ts` |
| 認証の強化 | ログインの試行回数制限、パスワード規則 | `lib/auth/throttle.ts`、`src/app/api/auth/login/route.ts` |
| ガイド | 初めての人向けの使い方 | `src/app/(app)/guide/`（文面は `content.ts`） |

フェーズごとの経緯、仕様の判断理由、検証結果は [accounting-phases.md](accounting-phases.md) に時系列で残している（長いので、必要な箇所だけ読めばよい）。

## 2. 技術構成と、先に知っておくべき設計

**構成**: Next.js 16（App Router、Server Actions）/ React 19 / TypeScript / Prisma 6 / PostgreSQL 16 / zod 4 / Tailwind 4 / `@react-pdf/renderer`（PDF）/ `sharp`（画像）/ `bcryptjs` + `jose`（認証）/ Vitest。

**ディレクトリ**: `actions/`（Server Actions）、`lib/`（業務ロジック。画面に依存しない）、`src/app/(app)/`（ログイン後の画面）、`src/app/api/`（ダウンロード・出力・ログイン等のルート）、`src/components/`、`prisma/`（スキーマとマイグレーション）、`tests/`、`docs/`。

設計の要点（コードを読む前に押さえると速い）:

1. **「事業所」は所有者ユーザーのID。** 既存の所有列（`userId` / `createdById` / `ownerId`）はすべて所有者のIDを指す。メンバーは `WorkspaceMember` で所有者の事業所に参加する。サーバー側の入口は `requireWorkspace(最低権限)`（`lib/auth/require-workspace.ts`）で、戻り値の `ownerId` を所有列に使う（`user.id` ではない）。権限は 閲覧のみ < 入力可 < 承認可 < 管理者（`lib/workspace/access.ts`）。
2. **会計は税込経理。** 仕訳は借方合計＝貸方合計をアプリとDBトリガーの両方で検証。訂正は消さずに取消仕訳を足す。所有者単位のアドバイザリロック（`accountingLock`）で並行操作を直列化し、更新日時（楽観ロック）で古い画面の上書きを拒否する。
3. **自動仕訳は「指紋」で冪等。** `lib/accounting/sync.ts` は、請求書・支払ごとに仕訳内容のハッシュを保存し、同じ内容なら何もしない。**指紋の作り方を変えると、既存の連携仕訳が取消・再記帳される**ので、触るときは `tests/tax-journal-db.test.ts` の「旧版と同一の指紋」のテストを必ず通すこと。
4. **消費税区分は任意（NULL可）。** 区分のない請求書は従来どおりの計算（旧実装との一致をランダム入力でテスト）。区分を使った請求書だけ、税率ごとに1回端数処理する。既存の仕訳の区分は未設定のままで、推測で付けない。
5. **証憑は変更・削除できない。** ファイルの中身・ハッシュ等はDBトリガーで変更不可、DELETE も拒否。訂正と無効化は履歴（追記専用）に残る。操作ログ（`AuditLog`）も追記専用。**テストの後始末だけが** `session_replication_role = replica` でトリガーを回避する（`tests/audit-cleanup.ts`）。
6. **ブラウザ側に出る部品は、サーバー専用のライブラリを読み込んではいけない。** 例: `lib/evidence/model.ts`（クライアントからも使う）と `lib/evidence/file.ts`（`sharp`・`node:crypto` を使うサーバー専用）を分けている。型チェックとテストでは検出されず、ブラウザで初めて壊れる種類の不具合なので、画面を足したら実際に開いて確認すること。
7. **時刻は日本時間前提。** 日付の判定は `Asia/Tokyo`（`japanToday`、`invoiceDateText` など）。ただし `duplicateInvoice` の日付計算は既存コードでサーバーのローカル時刻を使うため、**サーバーのタイムゾーンを `Asia/Tokyo` にしておくと安全**。

## 3. ローカルでの動かし方

前提: Node.js 20.9 以上（Next.js 16 の要件。開発は 26.7 で実施）、Docker。

```bash
npm ci
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml exec db psql -U postgres -c 'create database seiq_dev;'
docker compose -f docker-compose.dev.yml exec db psql -U postgres -c 'create database seiq_test;'
cp .env.example .env     # DATABASE_URL と AUTH_SECRET を設定
npx prisma migrate deploy
npm run seed             # 開発用の見本アカウントを作る（本番では実行が拒否される）
npm run dev
```

- `npm run seed` が作るアカウントは、`prisma/seed.ts` に書かれた**公開の弱いパスワード**（本番では絶対に使わない）。ログイン後の最初の確認用。
- 会計機能は、「会計・帳簿」で業種と会計開始日を設定すると使えるようになる。既存の請求書は、「請求・支払連携」の「既存データ連携」で取り込むか、その請求書を保存し直すまで、仕訳にならない。
- 本番ビルドの確認: `npm run build -- --webpack`。**Turbopack（既定の `npm run build`）は、この開発環境では環境の制約で失敗したため、未確認。** CI 等で確認してほしい。

### テスト

```bash
DATABASE_URL=postgresql://postgres:dev-only-password@127.0.0.1:5433/seiq_test \
AUTH_SECRET=any-test-secret-at-least-32-chars-long \
RUN_ACCOUNTING_DB_TESTS=1 RUN_EXPENSE_DB_TESTS=1 \
npx vitest run --maxWorkers=3
```

- `RUN_ACCOUNTING_DB_TESTS=1` がないと、DBを使うテスト（43ファイル中15ファイル）はスキップされる。支払・入金の2ファイル（`tests/expense-db.test.ts`、`tests/invoice-receipt-db.test.ts`）だけは別の `RUN_EXPENSE_DB_TESTS=1` で有効になる。両方を有効にして実行すること。
- **テストは実DBに書き込み、自分が作ったテスト用ユーザーを後始末する。開発用DBとは分けた `seiq_test` を使うこと。**（開発中は同じDBを使ったが、分けた方が安全。）
- 全マイグレーションを空のDBに適用した状態でも全件成功することを確認済み。
- マシンの負荷が非常に高いと、時間制限で不定期に失敗することがある（`--maxWorkers=3` で緩和）。ログインの試行制限のテストは、同じアドレスの失敗回数が実行をまたいで残るため、テスト内で記録を消している。

## 4. 環境変数

| 名前 | 必須 | 内容 |
|---|---|---|
| `DATABASE_URL` | 必須 | PostgreSQL 16 の接続文字列 |
| `AUTH_SECRET` | 必須 | セッションCookieの署名鍵。**本番は32文字以上**（短いと起動時にエラー） |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Gmail下書きを使う場合 | Google OAuth のクライアントID（公開してよい値）。Google Cloud で Gmail API を有効にし、本番ドメインを JavaScript の承認済みオリジンに登録する。手順は [GMAIL_SETUP.md](GMAIL_SETUP.md) |
| `RESEND_API_KEY` / `NOTIFICATION_FROM_EMAIL` / `NOTIFICATION_APP_URL` | メール通知を使う場合 | Resend の送信設定。未設定なら通知はアプリ内のみで、メールは送らない。**実送信は未検証（モックでのみ確認）** |
| `NOTIFICATION_JOB_SECRET` | メール通知を使う場合 | 32文字以上。`POST /api/internal/notifications/send` を `Authorization: Bearer <値>` で定期実行する（未送信・再試行分の処理）。**定期実行の設定は未実施** |
| `ANTHROPIC_API_KEY` / `RECEIPT_OCR_MODEL` / `INVOICE_OCR_DAILY_LIMIT` | AI読み取りを使う場合 | 領収書・請求書の読み取り。未設定なら手入力のみ。**サーバー側のみ**。詳細は [engineer-review-checklist.md](engineer-review-checklist.md) |
| `NEXT_PUBLIC_APP_URL` | 不要 | 現在コードでは読んでいない |
| `SEIQ_DEV_DIST` | 不要 | 開発用の出力先の切り替え（`next.config.ts`）。本番では設定しない |

## 5. データベース

35モデル。マイグレーションは **18件。このうち `origin/main` に既にあるのは4件、新規は14件**（下表）。

**新規の14件は、いずれも追加のみ（テーブル・列・インデックス・制約・トリガーの追加）。** 既存データを更新・削除する文はない。既存テーブルに対する変更は、`Invoice` への nullable 列の追加（入金日・合算先など）と、`InvoiceItem` への nullable 列 `taxCategory` の追加だけ。`origin/main` 側の4件に含まれる `DELETE FROM "SystemSetting" WHERE "userId" IS NULL`（`20260609000000_system_setting_per_user`）は、本番で適用済みのはずなので再実行されない。

| マイグレーション | 内容 |
|---|---|
| `20260917090000_expense_management` | 支払管理（`Expense`、添付PDF） |
| `20260917100000_invoice_receipts` | 請求書の入金日 |
| `20260927090000_accounting_foundation` | 勘定科目・仕訳。**仕訳の貸借一致とライン移動禁止のトリガー**（`seiq_check_journal_balance` ほか） |
| `20260927100000_accounting_links` | 連携元、消込、定期請求、請求書の合算先 |
| `20260927110000_statement_import` | 明細取込、重複判定、自動登録ルール |
| `20260927120000_expense_claims` | 経費精算（精算先、メンバー、申請、履歴、通知） |
| `20260928090000_fixed_assets` | 固定資産と償却の記帳 |
| `20261003090000_management_reports` | レポートの注釈（部門・事業所・振込先） |
| `20261003100000_workspace_permissions` | メンバー、**追記専用の操作ログ（トリガー）** |
| `20261003110000_invoice_item_tax_category` | 明細の税区分 |
| `20261003120000_tax_category_journal_expense` | 仕訳明細・支払の税区分 |
| `20261003130000_evidence_files` | 証憑（**変更・削除禁止のトリガー、有効なファイルの重複禁止の部分一意インデックス**） |
| `20261004100000_login_throttle` | ログイン失敗の回数（メールアドレスのハッシュのみ保存） |
| `20261004110000_report_annotation_fk_align` | 外部キーの記述を揃える（`ReportAnnotation` の制約を作り直す。データ変更なし） |

検証済み: (1) 空のDBに全件適用して成功し、スキーマとのずれなし。(2) 2026-09-28 時点のバックアップ（10件適用済み）に残り8件を適用して、各テーブルの件数・請求書の合計・仕訳の借方貸方の合計が適用前後で完全に一致。**本番の実データでの検証は未実施**（実データを使っていない）。

## 6. 本番反映の手順（案）

**最終的な反映は、エンジニアの方が確認しながら行う前提。** 以下はそのチェックリスト。

### 事前

1. コードレビュー（§7）と、CI（型・lint・テスト・ビルド）の実行。
2. **ステージングで予行演習**: 本番DBのコピーを復元 → `npx prisma migrate deploy` → 件数・合計の比較 → 主要画面（請求書の一覧・詳細・PDF、取引先、設定）の確認。
3. 本番DBのバックアップを取り、**復元できることを確認**する（`pg_dump -Fc` など）。
4. 環境変数を設定（§4）。`AUTH_SECRET` は32文字以上。サーバーのタイムゾーンは `Asia/Tokyo`。
5. 管理者アカウントの運用を決める（初期パスワードの配布方法、12文字以上）。**パスワード変更の機能がない**ため（§8）、先に決めておく。

### 反映

1. `npm ci` → `npx prisma generate` → `npx prisma migrate deploy` → ビルド → 起動。
2. **`npm run seed` は本番で実行しない**（実行しても拒否される）。
3. マイグレーションは追加のみで短時間。`20261004110000` だけは、小さなテーブルの外部キーを一瞬作り直す。

### 反映後の確認

- ログイン、既存の請求書の一覧・詳細・PDF・印刷が従来どおりか（金額・表示が変わっていないこと）。
- 既存の請求書を**編集して保存した場合は、請求書の税率が「現在の自社情報の税率」で再計算される**（既存の仕様）。明細に税区分を付けない限り、計算方法は従来どおり。
- 会計機能は**使い始めるまで何も起きない**（「会計・帳簿」の初期設定をするまで仕訳は作られない）。初期設定後、既存の請求書は「既存データ連携」で取り込むか、その請求書を保存し直すまで、仕訳にならない（会計開始日より前の請求書は対象外）。
- 既存ユーザーは、そのまま自分の事業所の管理者として使える（データの移行は不要）。
- ヘッダー（`X-Frame-Options`、`Strict-Transport-Security`）、`/share/...` の `noindex`。メール通知を使う場合は、定期ジョブの設定。

### ロールバック

- マイグレーションは追加のみなので、**アプリのコードだけを前の版に戻しても動く**（旧コードは新しい列・テーブルを使わない）。
- DBを元に戻すには、バックアップからの復元しかない（テーブルを手で削除しない）。**反映後に作られた会計データ・証憑・操作ログは、復元すると失われる。**

## 7. 人の目で確認してほしい重点箇所

AI が書いたコードなので、特に次を見てほしい（金額・権限・データ保全に直結するもの）。

| 観点 | ファイル |
|---|---|
| 税額の計算（税率ごとの端数処理、区分なしの旧計算との同一性） | `lib/invoice/calculateInvoice.ts`、`lib/invoice/taxBreakdown.ts` |
| 自動仕訳と指紋（再記帳の防止）、取消 | `lib/accounting/sync.ts`、`lib/accounting/service.ts` |
| 権限チェックの網羅（全アクション・ルート） | `lib/workspace/access.ts`、`lib/auth/require-workspace.ts`、`actions/*.ts`、`src/app/api/**/route.ts` |
| 認証・ログイン制限 | `lib/auth/`、`src/app/api/auth/login/route.ts`、`middleware.ts` |
| DBトリガーと制約 | `prisma/migrations/`（トリガー: 仕訳の貸借一致、操作ログ、証憑） |
| 証憑の保存・ダウンロード | `lib/evidence/file.ts`、`actions/evidence-actions.ts`、`src/app/api/evidence/` |
| 明細取込の照合・学習 | `lib/accounting/statements.ts`、`actions/statement-actions.ts` |
| 減価償却の計算 | `lib/assets/` |
| レポートの集計 | `lib/management/report.ts`、`lib/accounting/reports.ts`、`lib/accounting/tax-report.ts` |
| 通知の送信キューと再試行 | `lib/notifications/service.ts` |

セキュリティの点検結果と、残っているリスクは [security-review.md](security-review.md)。**特に、IPアドレス単位のレート制限（プロキシ側）、パスワード変更とセッション無効化の機能の追加、メールアドレスの大文字小文字の扱い**は、本番前に決めてほしい。

そのほか、本番の環境で確認してほしいこと:

- **ビルド**: 既定の Turbopack ビルドが通るか。デプロイ先で `sharp` のネイティブバイナリと、PDF用フォント `assets/fonts/NotoSansJP-Regular.ttf`（約5.8MB、OFL）が、バンドルに含まれて PDF 生成が動くか（`next.config.ts` の `outputFileTracingIncludes` に `/api/invoices/*/pdf`、`/api/accounting/export`、`/api/reports/export`）。
- **リバースプロキシ**: Server Actions の送信元の検証で、ホスト名が合わないことがある（`serverActions.allowedOrigins`）。`Secure` Cookie と `X-Forwarded-*` の扱い。
- **DBの権限**: アプリ用ロールと、マイグレーション用ロールを分けるか。DBトリガーはアプリのバグには効くが、DBの所有者権限には効かない。
- **バックアップと暗号化**: 証憑のファイルは DB の `BYTEA` に入る（件数が増えると大きくなる）。
- **ログ・監視**: 今は標準出力のログのみ。操作ログの書き込み失敗は `console.error` に出る。
- **公開の共有リンク**（`/share/invoices/<token>`）: 画面からは発行・表示していないが、ルートは残っている（発行済みの請求書のみ返す）。使わないなら削除を推奨。

## 8. 既知の制限・未実装

**機能**

- 確定申告・消費税の申告書の作成、納付税額の計算、簡易課税・2割特例、課税売上割合、仕入税額控除。
- 電子帳簿保存法: 認定タイムスタンプ、事務処理規程、システム概要書。経費精算の領収書は証憑ファイルボックスに取り込めない（支払いの添付PDFのみ）。ウイルススキャン、OCR、自動取り込み、保存期間の管理、外部ストレージ（3MBまで・DB内保存）。
- 税区分: 経費精算・CSV明細取込・固定資産の仕訳には付かない（未設定として集計）。明細テンプレートに区分を保存できない。
- 請求・入金: 一部入金、振込手数料の差引、銀行別の振込ファイル形式（全銀）、銀行APIとの連携は未対応。
- 固定資産: 過年度償却済み資産の移行、家事按分、無形資産、少額資産の特例、売却・除却の仕訳。
- 権限: 1ユーザーが所属できる事業所は1つ。複数事業所の切り替え、既存データを持つアカウントのメンバー化（データ移行）は未対応。経費精算の申請者・承認者は、事業所の権限とは別の仕組みのまま。
- 通知: 申請・承認のアラートは経費精算のみ。メールの実送信は未検証。

**認証・運用**（詳細は security-review.md）

- パスワードの変更・再設定の機能がない。セッションは7日間のJWTで、サーバー側から無効にできない。
- メールアドレスの大文字小文字を、保存時にもログイン時にも正規化していない。
- ログインの試行制限はメールアドレス単位のみ。IP単位は未対応。パスワード照合（`bcryptjs`、コスト12）は1回約1秒のCPUを使う。
- `Content-Security-Policy` は `frame-ancestors` のみ。

**開発環境**

- プロジェクトのフォルダが iCloud の同期対象（`~/Documents`）にあると、ビルド出力に「`… 2`」という競合コピーができて型チェックが失敗することがある。同期の対象外へ移すこと。
- Codex と Claude Code が同じフォルダを同時に編集すると、片方の変更が上書きされるおそれがある。

## 9. 関連ドキュメント

- **追加機能（提出・外部リンク・AI読み取り・月次表）の確認項目：[engineer-review-checklist.md](engineer-review-checklist.md)**

| ファイル | 内容 |
|---|---|
| [accounting-phases.md](accounting-phases.md) | フェーズ1〜8の仕様・判断・検証の時系列の記録（詳細な経緯） |
| [phase8-plan.md](phase8-plan.md) | フェーズ8（税・証憑）の計画と決定事項 |
| [security-review.md](security-review.md) | セキュリティの点検結果、修正済みの問題、残るリスク |
| [expense-management.md](expense-management.md)、[invoice-receipts.md](invoice-receipts.md) | 支払管理・入金記録の仕様（以前のフェーズ） |
| [GMAIL_SETUP.md](GMAIL_SETUP.md) | Gmail下書きの設定 |
| [UX_NEXT_STEPS.md](UX_NEXT_STEPS.md) | 以前に書かれた改善案（一部は実装済み） |
| `AGENTS.md` / `CLAUDE.md` | AI アシスタント向けの注意（この版の Next.js は従来と違うため、`node_modules/next/dist/docs/` を読むこと） |
| アプリ内「使い方ガイド」（`/guide`） | 利用者向けの説明 |

## 10. 補足

- リポジトリの外にある `work/accounting-dev/` の起動スクリプトやDBのダンプは、開発者個人のローカル環境用で、**引き継ぎには含まれない**（上の §3 の手順で同じ環境を作れる）。そこに書かれている開発用アカウントのパスワードも、リポジトリには含めていない。
- ローカルの開発用DBには、画面確認で作った架空のデータ（請求書・証憑・メンバーなど）が入っている。証憑は削除できない設計のため残っている。
- 未コミットのファイルは `.claude/launch.json`（AI アシスタントの画面確認用の設定）のみ。必要なければ不要。


## 領収書の自動読み取り（本番に出す前の確認事項）

- `ANTHROPIC_API_KEY`（サーバー側のみ）を設定したときだけ有効。未設定でも経費申請は手入力で使える。キーはリポジトリ・資料に書かない。
- 領収書の画像・PDFは、読み取りのために Anthropic のAPIへ送信される。利用規約・個人情報の扱い（取引先名・金額が画像に含まれる）を会社として確認すること。
- 料金は従量課金。Anthropic のコンソールで月の上限を設定すること。概算は1枚あたり1円未満（Haiku 4.5・画像1枚）。
- 読み取り結果は下書き。必ず利用者が確認してから申請する（自動で申請・承認はしない）。
- 回数制限（1人あたり1時間30回）はアプリ内の簡易制限で、サーバーを複数立てるとその台数分になる。厳密に制限するなら共有ストアが必要（`docs/security-review.md` の残るリスクにも追記）。

### AI読み取りが使えないとき（フォールバック）

- 画面: 領収書は必ず添付され、申請は手入力で続けられる。読み取れなかった項目（支払先・日付・金額）を画面に案内し、最初の空欄にカーソルを移す。混雑・読み取れなかったときは「もう一度読み取る」ボタンが出る。
- 理由の区別（`lib/ocr/receipt.ts`）: 未設定（手入力）／混雑・通信失敗（1回だけ待って再試行。失敗したら「少し待ってもう一度」）／認証・利用上限など（再試行せず「いまは使えません」。管理者が設定と利用状況を確認）／読み取れない（撮り直しか手入力）。画面には、外部サービスのエラー内容は出さない。
- 連続して失敗したとき（60秒以内に3回）は、1分間は外部を呼ばず、すぐ「混み合っています」と返す（利用者を待たせないため）。成功すると数え直す。タイムアウトは20秒。
- 管理者が確認すること: サーバーのログに `receipt-ocr: upstream status <番号>` が続く場合、401/403 はキー、402 や 400 は利用残高・設定、429/5xx は混雑。Anthropicのコンソールで利用状況と上限を確認する。
- 手入力の代わりになる別の読み取り方法（自社サーバー内のOCRなど）は未実装。必要なら `readReceiptWithAi` と同じ形の窓口として差し替えられる。


### 外部の提出リンク（本番に出す前の確認事項）

- ログインなしで誰でも到達できる入口（`/s/{token}`）。公開前に、エンジニアによる確認（攻撃の観点）が必要。
- 保護: トークンは32バイトの乱数でハッシュのみ保存、無効・期限切れ・取り消しは同じ404/同じ文面、IPとリンクごとのレート制限（`PublicThrottle` テーブル）、提出回数・承認待ち件数の上限、見えない入力欄の罠、ファイルは証憑と同じ検査、`Referrer-Policy: no-referrer`・`noindex`・`no-store`（`next.config.ts`）。
- 送り元IPは `x-forwarded-for` の先頭を使う。ホスティングのプロキシが付ける値を前提にしている（プロキシがない環境では偽装できる）。本番の構成で確認すること。
- リンクのパスにトークンが入るため、ホスティング側のアクセスログに残る可能性がある。
- メール通知は、`RESEND_API_KEY`・`NOTIFICATION_FROM_EMAIL`・`NOTIFICATION_APP_URL` の設定と、相手が入力したメールアドレスがある場合のみ。再送の仕組み（アウトボックス）はなく、1回だけやり直し、結果は提出の経過に記録する。
- 古い `PublicThrottle` の行は、`purgeThrottle`（`lib/submissions/link.ts`）で消せる。定期実行は未設定。


### 請求書のAI取り込み（業務委託の提出）

- 画面: 提出者（メンバー）・外部リンクの提出フォームに、「請求書のPDF・写真から入力する（AI）」。同意のチェックが必要（請求書の内容が外部のAIサービスへ送られる旨）。読み取ると、差出人（外部リンクのときは空欄のみ）・何月分・件名・明細（種類・数量・単価・税区分）を下書きとして入れる。原本は、読み取れても読み取れなくても添付として残る。
- 税: 請求書が税込表記なら、課税（10%・8%）の明細だけを税抜に換算し、注意を出す。税込・税抜が書かれていない場合は、請求合計との比較で推定する。交通費など非課税の明細は換算しない。合計が合わなければ注意を出す。
- 失敗時: 領収書の読み取りと同じ仕組み（`lib/ocr/anthropic.ts`：理由の区別・1回の再試行・連続失敗時の一時停止）。使えなくても、手入力で提出できる。
- 費用の上限: 外部リンクはリンクごとの回数（既定5回。利用者の責任でない失敗のときは回数を戻す）、事業所全体で1日の上限（環境変数 `INVOICE_OCR_DAILY_LIMIT`、既定100回）、送り元ごとの回数制限。提出者（メンバー）は1人あたり1時間20回。
- 承認する人への表示: 提出に「AI読み取りを使用」の印と、AIの注意（画面の申告）。承認画面に「確認してほしい点」（同じファイルが他の提出・証憑にもある、同じ差出人・月・金額の提出が他にもある）。
- 確認が必要なこと: 本物のAPIでの読み取り精度は未確認（キー未設定のローカルでは、模擬のAPIで画面の動作のみ確認）。請求書には氏名・住所・振込先などの個人情報が含まれるため、外部のAIサービスへ送ることの扱いを、会社として確認すること（同意の文言は画面に出す）。


### 画面の切り替えの軽さ（実施した対策と、注意点）

- **重複していた問い合わせを1回に**：ユーザーと事業所（役割）の確認を、同じ画面の表示の中では1回だけにした（`lib/auth/require-user.ts`、`workspaceOf`）。レイアウトとページの両方が呼んでいたため。リクエストをまたいでは覚えない（権限の変更がすぐ反映される）。
- **待ち合わせの解消**：レイアウトの未読件数と事業所の確認、会計トップ・受け取り状況・月ごとの売上と費用の問い合わせを、同時に行う。
- **進行バー**（`src/components/app-shell/navigation-progress.tsx`）：リンクを押した瞬間に画面上部にバーが出て、次の画面が出たら消える。いまの画面を少し薄くして、押したことが伝わるようにする。
- **「読み込み中」の枠（`loading.tsx`）は使わない**：入れて測ったところ、速い画面でも本文が約0.3秒遅れた（Reactが、枠を出したあとの本文の表示を最低約0.3秒遅らせるため）。進行バーなら、本文の表示を遅らせない（切り替え 36〜109ミリ秒）。
- 本番ビルドでのサーバーの応答は、各画面 15〜50ミリ秒（開発サーバーは60〜200ミリ秒で、初めて開く画面は、コード変換のため2秒近くかかる）。**開発サーバーの遅さは、本番では起きない。**
- 本番では、データベースが遠い（別のサーバー）と、1回の問い合わせごとに待ちが入る。今後、画面を作るときは、互いに関係のない問い合わせは `Promise.all` で同時に行うこと。
- ローカルで本番と同じ速さで動かす：`../work/accounting-dev/start-prod.cjs`（ビルドしてから起動。http://127.0.0.1:8771）。


### 使い方ガイド（対象者別・画面写真つき）

- `/guide?for=admin|staff|applicant|contractor`（管理者／承認・経理／経費の申請者／業務委託の方）。開いた人の権限から、初めの対象者を自動で選ぶ。手順は `src/app/(app)/guide/guides.ts`、画面は `page.tsx`。項目は押すと開く形式（`<details data-guide>`）のまま。
- 各手順の写真は `public/guide/<ID>.webp`。写真の赤い番号が、手順の①②…に対応する。写真はすべて架空の見本データの画面（実在の個人・会社の情報は含まない）。
- 画面を変えたら、写真を撮り直す（`scripts/guide/`）:
  1. 見本DB（本番と別の空のDB）を用意し、`GUIDE_SEED=1 DATABASE_URL=<見本DB> AUTH_SECRET=<開発用> npx vitest run tests/guide-seed.test.ts`（見本DBの中身を消して、見本データを作る。**本番・開発のDBでは実行しない**）。
  2. 見本DBに接続した本番ビルドのサーバーを起動する（既定 http://127.0.0.1:8774。`ANTHROPIC_API_KEY` に適当な値を入れると、AI入力の欄も写る）。
  3. `node scripts/guide/capture.mjs [撮影ID ...]`（省略で全部）。撮影の指定は `scripts/guide/shots.mjs`。環境変数 `GUIDE_BASE`・`AUTH_SECRET`。
- 手順を変えたら、`tests/guide.test.ts`（リンク先の存在・写真の存在・代替テキスト）が通ること。
- 外部リンクの提出ページ（`/s/{token}`）の下にも、短い手順の案内を出している。


### 売上管理表（取引先・店舗 × 12か月）

- 画面: `/accounting/sales-table`（承認者以上）。年・費用を数える月・税込／税抜を切り替え、数字を押すと明細（`/accounting/sales-table/detail`）、CSV出力（`/api/accounting/sales-table-csv`、出力は操作ログに記録）。
- 数え方は「月ごとの売上と費用」と同じ（売上は入金月、費用は支払月または発生月）。経費精算・手入力・明細取込の記録は、「取引先の指定なし」に入り、合計は月ごとの画面と一致する。
- 店舗（部門）: 取引先ごとに登録（`Store`。取引先の詳細画面で追加・名前の変更・使う／使わない）。店舗を使わない取引先は、売上・費用の2行だけ。
- 売上の店舗は、請求書の明細ごとに選ぶ（`InvoiceItem.storeId`）。1枚の請求書を店舗ごとに分けても、税抜・税額の合計は請求書とぴったり合わせる（端数は税額の大きい店舗に寄せる。`allocateInvoice`）。
- 費用は、支払いの登録で取引先・店舗を選ぶ（`Expense.companyId/storeId`、任意）。保存時に、自分の事業所のものか確認する（`resolveExpenseLink`）。請求書の明細も、その取引先の店舗以外は「店舗なし」に直す。
- マイグレーション: `20261006100000_sales_table_stores`（列と表の追加のみ。既存データは変わらない）。
- 未対応: 提出の承認で自動作成される支払いには、取引先・店舗は付かない（「取引先の指定なし」に入る）。必要なら、承認画面で選べるようにする。

### 売上管理表：取引先が多い事業所向けの表示

- 取引先ごとに、売上・費用の2行（取引先の合計）を常に表示し、店舗の行は、取引先の名前を押すと開く（初めは閉じている）。店舗を使わない取引先は、2行だけ。
- 取引先の検索（名前の一部、全角半角・大文字小文字は区別しない）、並び順（売上の多い順／名前順）、データのない取引先の表示切り替え、30社ずつのページ分け、見出しと取引先名の固定表示。全体の合計は、検索に関係なく、常に表の先頭に出る。
- 集計に使う明細は、請求書・支払いなど、それぞれ年間10,000件まで（`SALES_TABLE_LIMIT`）。超えたら、画面に警告を出す。
- CSV は、検索やページに関係なく、全取引先を出力する。

### 管理者以外に見せないもの（経営レポート・売上）

- 管理者（事業所の管理者）だけ：経営レポート（画面・CSV/PDF出力）、月ごとの売上と費用、売上管理表（画面・明細・CSV）、ダッシュボードの売上・支払いの確認・経営レポート。サイドバーの「売上管理表」と、会計・帳簿の画面の入口も、管理者だけに出る。
- 承認者・入力担当・閲覧者は、請求書・取引先・帳簿など、権限に応じた画面は従来どおり見られる（上の経営の画面だけ見えない）。提出者は、自分の提出・申請とお知らせだけ。
- 経営レポートの出力（`/api/reports/export`）には、これまで、提出者を断る確認がなかった（振込データだけ確認していた）。管理者だけに直した。`tests/admin-only-finance.test.ts` で、画面・出力の入口の確認が外れていないことを確かめる。
